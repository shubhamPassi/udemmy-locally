/**
 * TutIn Server — Video Streaming Service
 * 
 * Serves local video files over HTTP with range request support.
 * This replaces the File System Access API — no browser permission needed.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn, spawnSync } from 'child_process'
import { getDataDir } from '../database.js'

/**
 * MIME types for supported video formats
 */
const VIDEO_MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.ogg': 'video/ogg',
    '.m4v': 'video/mp4',
    '.ts': 'video/mp2t',
}

/**
 * List of allowed root directories for video serving.
 * Updated at runtime from settings.
 */
let allowedRoots = []

/**
 * Set the allowed root directories for security
 */
export function setAllowedRoots(roots) {
    allowedRoots = roots.map(r => path.resolve(r))
    console.log(`[VideoStreamer] Allowed roots: ${allowedRoots.join(', ')}`)
}

/**
 * Add an allowed root directory
 */
export function addAllowedRoot(root) {
    const resolved = path.resolve(root)
    if (!allowedRoots.includes(resolved)) {
        allowedRoots.push(resolved)
        console.log(`[VideoStreamer] Added allowed root: ${resolved}`)
    }
}

/**
 * Check if a file path is within allowed directories
 */
function isPathAllowed(filePath) {
    // If no roots configured, allow nothing (secure by default)
    if (allowedRoots.length === 0) return false

    const resolved = path.resolve(filePath)
    return allowedRoots.some(root => {
        const relative = path.relative(root, resolved)
        return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    })
}

function resolveRequestFilePath(req) {
    let rawPath = req.params.filePath
    if (!rawPath) return null

    if (Array.isArray(rawPath)) rawPath = rawPath.join('/')
    rawPath = String(rawPath)

    let filePath = rawPath
    if (!fs.existsSync(filePath)) {
        try { filePath = decodeURIComponent(rawPath) } catch { /* already decoded */ }
    }

    return filePath
}

function streamFile(filePath, req, res, contentTypeOverride = null) {
    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const ext = path.extname(filePath).toLowerCase()
    const contentType = contentTypeOverride || VIDEO_MIME_TYPES[ext] || 'application/octet-stream'
    const range = req.headers.range

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

        if (start >= fileSize || end >= fileSize || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
            return res.end()
        }

        const chunkSize = end - start + 1
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        })

        const stream = fs.createReadStream(filePath, { start, end })
        stream.on('error', err => {
            console.error(`[VideoStreamer] Stream error: ${err.message}`)
            if (!res.headersSent) res.status(500).json({ error: 'Stream error' })
        })
        return stream.pipe(res)
    }

    res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
    })

    const stream = fs.createReadStream(filePath)
    stream.on('error', err => {
        console.error(`[VideoStreamer] Stream error: ${err.message}`)
        if (!res.headersSent) res.status(500).json({ error: 'Stream error' })
    })
    stream.pipe(res)
}

/**
 * Express route handler for video streaming
 * 
 * Supports HTTP range requests for seeking.
 * Usage: app.get('/video/*', streamVideo)
 */
export function streamVideo(req, res) {
    // Express 5 named wildcard param
    const filePath = resolveRequestFilePath(req)
    if (!filePath) {
        return res.status(400).json({ error: 'No file path provided' })
    }

    console.log(`[VideoStreamer] Streaming: ${path.basename(filePath)}`)

    // Security check: path must be within allowed directories
    if (!isPathAllowed(filePath)) {
        console.warn(`[VideoStreamer] Blocked — not in allowed roots`)
        return res.status(403).json({ error: 'Access denied — path not in allowed directories' })
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
        console.warn(`[VideoStreamer] File not found: ${filePath}`)
        return res.status(404).json({ error: 'Video file not found' })
    }

    streamFile(filePath, req, res)
}

/**
 * FFmpeg fallback stream for files the browser cannot decode natively.
 * It produces fragmented MP4 over stdout so playback can begin before the
 * whole video is converted.
 */
export function streamTranscodedVideo(req, res) {
    streamWithFfmpeg(req, res, {
        label: 'Transcoding',
        contentType: 'video/mp4',
        args: [
            '-map', '0:v:0',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-profile:v', 'main',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            'pipe:1',
        ],
    })
}

/**
 * WebM fallback for browsers that reject the fragmented MP4 pipe.
 */
export function streamWebmVideo(req, res) {
    streamWithFfmpeg(req, res, {
        label: 'Transcoding WebM',
        contentType: 'video/webm',
        args: [
            '-map', '0:v:0',
            '-map', '0:a?',
            '-c:v', 'libvpx-vp9',
            '-deadline', 'realtime',
            '-cpu-used', '5',
            '-b:v', '1600k',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'libopus',
            '-b:a', '128k',
            '-f', 'webm',
            'pipe:1',
        ],
    })
}

/**
 * MPEG-TS fallback for mpegts.js. This starts quickly and avoids browser
 * native demuxer issues with damaged MP4 headers.
 */
export function streamMpegtsVideo(req, res) {
    streamWithFfmpeg(req, res, {
        label: 'Transcoding MPEG-TS',
        contentType: 'video/mp2t',
        args: [
            '-map', '0:v:0',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            '-f', 'mpegts',
            'pipe:1',
        ],
    })
}

/**
 * Last-resort compatibility fallback. Converts the source into a real cached
 * H.264/AAC MP4 file first, then serves it with byte ranges.
 */
export function streamCompatibleVideo(req, res) {
    const filePath = resolveRequestFilePath(req)
    if (!filePath) {
        return res.status(400).json({ error: 'No file path provided' })
    }

    console.log(`[VideoStreamer] Compatible cache: ${path.basename(filePath)}`)

    if (!isPathAllowed(filePath)) {
        console.warn('[VideoStreamer] Blocked compatible cache — not in allowed roots')
        return res.status(403).json({ error: 'Access denied — path not in allowed directories' })
    }

    if (!fs.existsSync(filePath)) {
        console.warn(`[VideoStreamer] File not found for compatible cache: ${filePath}`)
        return res.status(404).json({ error: 'Video file not found' })
    }

    const stat = fs.statSync(filePath)
    const key = crypto
        .createHash('sha256')
        .update(`${filePath}:${stat.size}:${stat.mtimeMs}`)
        .digest('hex')

    const cacheDir = path.join(getDataDir(), 'transcoded')
    const cachePath = path.join(cacheDir, `${key}.mp4`)
    const tempPath = path.join(cacheDir, `${key}.partial.mp4`)

    try {
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

        if (fs.existsSync(cachePath) && fs.statSync(cachePath).size === 0) {
            fs.unlinkSync(cachePath)
        }

        if (!fs.existsSync(cachePath)) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
            console.log(`[VideoStreamer] Creating compatible MP4 cache: ${path.basename(cachePath)}`)

            const repairArgs = [
                '-hide_banner',
                '-loglevel', 'error',
                '-y',
                '-fflags', '+genpts',
                '-err_detect', 'ignore_err',
                '-i', filePath,
                '-map', '0:v:0',
                '-map', '0:a?',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-profile:v', 'main',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                tempPath,
            ]

            let result = spawnSync('ffmpeg', repairArgs, { timeout: 30 * 60 * 1000, windowsHide: true, encoding: 'utf8' })

            if (result.status !== 0) {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
                console.warn(`[VideoStreamer] Compatible cache with audio failed; retrying video-only: ${result.stderr || result.error?.message || 'unknown error'}`)

                result = spawnSync('ffmpeg', [
                    '-hide_banner',
                    '-loglevel', 'error',
                    '-y',
                    '-fflags', '+genpts',
                    '-err_detect', 'ignore_err',
                    '-i', filePath,
                    '-map', '0:v:0',
                    '-an',
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-profile:v', 'main',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    tempPath,
                ], { timeout: 30 * 60 * 1000, windowsHide: true, encoding: 'utf8' })
            }

            if (result.status !== 0) {
                console.error(`[VideoStreamer] Compatible cache failed: ${result.stderr || result.error?.message || 'unknown error'}`)
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
                return res.status(422).json({ error: 'Source video is corrupted and could not be repaired' })
            }

            if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
                console.error('[VideoStreamer] Compatible cache failed: FFmpeg produced an empty output file')
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
                return res.status(422).json({ error: 'Source video is corrupted and produced an empty repaired file' })
            }

            fs.renameSync(tempPath, cachePath)
            console.log(`[VideoStreamer] Compatible MP4 cache ready: ${cachePath}`)
        }

        streamFile(cachePath, req, res, 'video/mp4')
    } catch (err) {
        console.error(`[VideoStreamer] Compatible cache error: ${err.message}`)
        if (!res.headersSent) res.status(500).json({ error: 'Compatible cache error' })
    }
}

function streamWithFfmpeg(req, res, config) {
    const filePath = resolveRequestFilePath(req)
    if (!filePath) {
        return res.status(400).json({ error: 'No file path provided' })
    }

    console.log(`[VideoStreamer] ${config.label}: ${path.basename(filePath)}`)

    if (!isPathAllowed(filePath)) {
        console.warn('[VideoStreamer] Blocked transcode — not in allowed roots')
        return res.status(403).json({ error: 'Access denied — path not in allowed directories' })
    }

    if (!fs.existsSync(filePath)) {
        console.warn(`[VideoStreamer] File not found for transcode: ${filePath}`)
        return res.status(404).json({ error: 'Video file not found' })
    }

    res.writeHead(200, {
        'Content-Type': config.contentType,
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'none',
    })

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-err_detect', 'ignore_err',
        '-i', filePath,
        ...config.args,
    ], { windowsHide: true })

    ffmpeg.stdout.pipe(res)

    ffmpeg.stderr.on('data', data => {
        const message = data.toString().trim()
        if (message) console.warn(`[VideoStreamer][ffmpeg] ${message}`)
    })

    ffmpeg.on('error', err => {
        console.error(`[VideoStreamer] FFmpeg failed: ${err.message}`)
        if (!res.headersSent) res.status(500).json({ error: 'FFmpeg failed' })
        else res.end()
    })

    req.on('close', () => {
        if (!ffmpeg.killed) ffmpeg.kill('SIGKILL')
    })
}
