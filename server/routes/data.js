/**
 * Data Routes — /api/data/*
 *
 * Handles database lifecycle operations:
 * - Export all data as JSON
 * - Import / restore from JSON
 * - Reset (clear) all data
 * - Detect and fix missing video durations
 */

import express from 'express'
import fs from 'fs'
import { getAll, run, transaction, saveDatabase, getDb } from '../database.js'
import { parseMp4Duration } from '../utils/mp4Parser.js'

const router = express.Router()
const MAX_THUMBNAIL_BYTES = 6 * 1024 * 1024
const UDEMY_ORIGIN = 'https://www.udemy.com'

function sanitizeCourseThumbnailQuery(title) {
    return String(title || '')
        .replace(/[^\p{L}\p{N}\s._+\-:&()]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

async function fetchImageAsDataUrl(url, timeoutMs = 6000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 TutIn/4.0',
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        })
        if (!response.ok) throw new Error(`Image request failed: ${response.status}`)

        const contentType = response.headers.get('content-type') || 'image/jpeg'
        if (!contentType.startsWith('image/')) {
            throw new Error(`Unexpected thumbnail content type: ${contentType}`)
        }

        const length = Number(response.headers.get('content-length') || 0)
        if (length > MAX_THUMBNAIL_BYTES) {
            throw new Error('Thumbnail is too large')
        }

        const arrayBuffer = await response.arrayBuffer()
        if (arrayBuffer.byteLength > MAX_THUMBNAIL_BYTES) {
            throw new Error('Thumbnail is too large')
        }

        const buffer = Buffer.from(arrayBuffer)
        return `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`
    } finally {
        clearTimeout(timer)
    }
}

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\\u002F/g, '/')
}

function normalizeUdemyImageUrl(value) {
    const decoded = decodeHtmlEntities(value)
        .replace(/\\\//g, '/')
        .trim()

    if (!decoded) return null
    if (decoded.startsWith('//')) return `https:${decoded}`
    if (decoded.startsWith('/')) return `${UDEMY_ORIGIN}${decoded}`
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded
    return null
}

async function fetchText(url, timeoutMs = 8000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 TutIn/4.0',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        })
        if (!response.ok) throw new Error(`Udemy request failed: ${response.status}`)
        return await response.text()
    } finally {
        clearTimeout(timer)
    }
}

function extractUdemyImageFromHtml(html) {
    const patterns = [
        /!\[[^\]]*]\((https?:\/\/[^)]+(?:udemycdn|udemy)[^)]+\.(?:jpg|jpeg|png|webp)[^)]*)\)/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /"image_750x422"\s*:\s*"([^"]+)"/i,
        /"image_480x270"\s*:\s*"([^"]+)"/i,
        /"image_240x135"\s*:\s*"([^"]+)"/i,
        /"image"\s*:\s*"([^"]+course[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    ]

    for (const pattern of patterns) {
        const match = html.match(pattern)
        const imageUrl = normalizeUdemyImageUrl(match?.[1])
        if (imageUrl) return imageUrl
    }

    return null
}

function extractUdemyCourseUrlFromSearch(html) {
    const hrefMatches = [...html.matchAll(/href=["']([^"']*\/course\/[^"']+)["']/gi)]
    for (const match of hrefMatches) {
        const rawUrl = decodeHtmlEntities(match[1])
        if (rawUrl.includes('/course/')) {
            return rawUrl.startsWith('http') ? rawUrl : `${UDEMY_ORIGIN}${rawUrl}`
        }
    }

    const urlMatches = [...html.matchAll(/"url"\s*:\s*"([^"]*\/course\/[^"]+)"/gi)]
    for (const match of urlMatches) {
        const rawUrl = decodeHtmlEntities(match[1]).replace(/\\\//g, '/')
        if (rawUrl.includes('/course/')) {
            return rawUrl.startsWith('http') ? rawUrl : `${UDEMY_ORIGIN}${rawUrl}`
        }
    }

    return null
}

function extractDuckDuckGoUdemyCourseUrl(html) {
    const matches = [...html.matchAll(/[?&]uddg=([^"&]+udemy\.com%2Fcourse%2F[^"&]+)/gi)]
    for (const match of matches) {
        try {
            const decoded = decodeURIComponent(decodeHtmlEntities(match[1]))
            if (decoded.startsWith('https://www.udemy.com/course/')) return decoded
        } catch {}
    }

    const visibleMatches = [...html.matchAll(/www\.udemy\.com\/course\/[a-z0-9\-_/]+/gi)]
    for (const match of visibleMatches) {
        return `https://${match[0].replace(/\/$/, '')}/`
    }

    return null
}

function isAllowedUdemyImageUrl(url) {
    try {
        const parsed = new URL(url)
        return parsed.hostname === 'www.udemy.com' ||
            parsed.hostname === 'udemy.com' ||
            parsed.hostname.endsWith('.udemy.com') ||
            parsed.hostname === 'udemycdn.com' ||
            parsed.hostname.endsWith('.udemycdn.com')
    } catch {
        return false
    }
}

function buildUdemySlugCandidates(title) {
    const rawNormalized = String(title || '')
        .toLowerCase()
        .replace(/\b20\d{2}\b/g, ' ')
        .replace(/\bzero\s*to\s*mastery\b/g, 'zero to mastery')
        .replace(/\bzerotomastery\b/g, 'zero to mastery')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    const normalized = rawNormalized
        .replace(/\b(?:in|edition|completed|incompleted)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const words = normalized.split(/\s+/).filter(Boolean)
    const candidates = new Set()
    const rawWords = rawNormalized.split(/\s+/).filter(Boolean)
    if (rawWords.length) candidates.add(rawWords.join('-'))
    if (words.length) {
        candidates.add(words.join('-'))
        candidates.add(words.filter(word => word !== 'udemy').join('-'))

        const ztmIndex = words.findIndex((word, index) =>
            word === 'zero' && words[index + 1] === 'to' && words[index + 2] === 'mastery'
        )
        if (ztmIndex > 0) {
            const beforeZtm = words.slice(0, ztmIndex)
            candidates.add([...beforeZtm, 'zero', 'to', 'mastery'].join('-'))
            candidates.add(beforeZtm.join('-'))
        }
    }

    return [...candidates]
        .filter(Boolean)
        .map(slug => `${UDEMY_ORIGIN}/course/${slug}/`)
}

async function discoverUdemyCourseUrl(query) {
    const searchUrls = [
        `${UDEMY_ORIGIN}/courses/search/?q=${encodeURIComponent(query)}&src=sac`,
        `https://duckduckgo.com/html/?q=${encodeURIComponent(`site:udemy.com/course ${query} udemy`)}`,
    ]

    for (const candidateUrl of buildUdemySlugCandidates(query)) {
        try {
            await fetchText(candidateUrl, 5000)
            return candidateUrl
        } catch {}
    }

    for (const searchUrl of searchUrls) {
        try {
            const html = await fetchText(searchUrl)
            const courseUrl = searchUrl.includes('duckduckgo.com')
                ? extractDuckDuckGoUdemyCourseUrl(html)
                : extractUdemyCourseUrlFromSearch(html)
            if (courseUrl) return courseUrl
        } catch {}
    }

    return null
}

async function fetchUdemyReaderText(courseUrl) {
    return fetchText(`https://r.jina.ai/http://${courseUrl}`)
}

async function findUdemyThumbnail(title) {
    const query = sanitizeCourseThumbnailQuery(title)
    if (!query) throw new Error('Missing title')

    const directCourseUrls = buildUdemySlugCandidates(query)
    const discoveredCourseUrl = await discoverUdemyCourseUrl(query)
    const courseUrls = [...new Set([
        ...directCourseUrls,
        discoveredCourseUrl,
    ].filter(Boolean))]

    const courseUrl = courseUrls[0]
    if (!courseUrl) {
        throw new Error('No Udemy course page found')
    }

    let imageUrl = null
    let matchedCourseUrl = null

    for (const candidateUrl of courseUrls) {
        try {
            const courseText = await fetchText(candidateUrl)
            imageUrl = extractUdemyImageFromHtml(courseText)
        } catch {}

        if (!imageUrl) {
            try {
                const readerText = await fetchUdemyReaderText(candidateUrl)
                imageUrl = extractUdemyImageFromHtml(readerText)
            } catch {}
        }

        if (imageUrl) {
            matchedCourseUrl = candidateUrl
            break
        }
    }

    if (!imageUrl) {
        throw new Error('No Udemy thumbnail found')
    }
    if (!isAllowedUdemyImageUrl(imageUrl)) {
        throw new Error('Discovered thumbnail is not hosted by Udemy')
    }

    return {
        base64: await fetchImageAsDataUrl(imageUrl),
        sourceUrl: imageUrl,
        courseUrl: matchedCourseUrl || courseUrl,
    }
}

// DELETE /api/data/reset
// Wipes all user data from the database
router.delete('/reset', (req, res) => {
    try {
        const db = getDb()
        const tables = [
            'dub_jobs',
            'watch_sessions',
            'analytics',
            'notes',
            'videos',
            'modules',
            'courses',
            'instructors',
            'roadmaps',
            'settings',
        ]
        db.run('PRAGMA foreign_keys = OFF')
        try {
            transaction(() => {
                for (const table of tables) {
                    db.run(`DELETE FROM ${table}`)
                }
            })
        } finally {
            db.run('PRAGMA foreign_keys = ON')
        }
        saveDatabase()
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/download-image
// Downloads an image from a URL and returns it as a Base64 string for offline storage
router.post('/download-image', async (req, res) => {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: 'Missing URL' })

    try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
        
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const contentType = response.headers.get('content-type') || 'image/jpeg'
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`
        
        res.json({ base64 })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/course-thumbnail
// Best-effort Udemy-only thumbnail lookup for imported courses without local cover art.
router.post('/course-thumbnail', async (req, res) => {
    const query = sanitizeCourseThumbnailQuery(req.body?.title)
    if (!query) return res.status(400).json({ error: 'Missing title' })

    try {
        const result = await findUdemyThumbnail(query)
        res.json({ ...result, provider: 'udemy' })
    } catch (err) {
        res.status(502).json({ error: err.message })
    }
})

// GET /api/data/export
// Returns the full database contents as a JSON snapshot
router.get('/export', (req, res) => {
    try {
        const courses     = getAll('SELECT * FROM courses')
        const modules     = getAll('SELECT * FROM modules')
        const videos      = getAll('SELECT * FROM videos')
        const notes       = getAll('SELECT * FROM notes')
        const analytics   = getAll('SELECT * FROM analytics')
        const sessions    = getAll('SELECT * FROM watch_sessions')
        const instructors = getAll('SELECT * FROM instructors')
        const roadmaps    = getAll('SELECT * FROM roadmaps')
        const settings    = getAll('SELECT * FROM settings')
        const dub_jobs    = getAll('SELECT * FROM dub_jobs')

        res.json({
            version: 4,
            exportedAt: new Date().toISOString(),
            courses,
            modules,
            videos,
            notes,
            analytics,
            watch_sessions: sessions,
            instructors,
            roadmaps,
            settings,
            dub_jobs,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/import
// Restores data from a JSON snapshot (merges or replaces)
router.post('/import', (req, res) => {
    const data = req.body
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid import data' })
    }

    try {
        const db = getDb()
        db.run('PRAGMA foreign_keys = OFF')
        try {
            transaction(() => {

            // Helper: upsert rows into a table
            const upsert = (table, rows, columns) => {
                if (!Array.isArray(rows) || rows.length === 0) return
                const placeholders = columns.map(() => '?').join(', ')
                const colList = columns.join(', ')
                const updateSet = columns
                    .filter(c => c !== 'id')
                    .map(c => `${c} = excluded.${c}`)
                    .join(', ')

                for (const row of rows) {
                    const values = columns.map(c => {
                        // Strip surrounding double-quotes for key lookup (e.g. '"order"' → 'order')
                        const key = c.replace(/^"|"$/g, '')
                        const v = row[key]
                        return v === undefined ? null : v
                    })
                    db.run(
                        `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
                         ON CONFLICT(id) DO UPDATE SET ${updateSet}`,
                        values
                    )
                }
            }

            if (data.courses) {
                upsert('courses', data.courses, [
                    'id','title','original_title','description','instructor','tags',
                    'thumbnail_data','folder_path','source_type','course_url',
                    'date_added','date_modified','last_accessed','last_accessed_click_time',
                    'total_duration','total_videos','completed_videos','completion_percentage',
                    'custom_metadata','"order"'
                ])
            }
            if (data.modules) {
                upsert('modules', data.modules, [
                    'id','course_id','parent_module_id','title','original_title',
                    'description','thumbnail_data','folder_path','"order"',
                    'total_duration','total_videos','completed_videos','date_added'
                ])
            }
            if (data.videos) {
                upsert('videos', data.videos, [
                    'id','course_id','module_id','title','original_title','description',
                    'file_name','file_path','file_size','duration','thumbnail_data','"order"',
                    'is_required','is_completed','is_favorite','watch_progress',
                    'last_watched_position','last_watched_at','completed_at','watch_count',
                    'tags','bookmarks','youtube_id','url','has_transcript','has_summary',
                    'transcript_generated_at','summary_generated_at','subtitle_sources'
                ])
            }
            if (data.notes) {
                upsert('notes', data.notes, [
                    'id','video_id','course_id','timestamp','content','images','tags',
                    'created_at','updated_at'
                ])
            }
            if (data.analytics) {
                upsert('analytics', data.analytics, [
                    'id','date','watch_time_seconds','videos_watched','videos_completed',
                    'courses_accessed','sessions_count'
                ])
            }
            if (data.watch_sessions) {
                upsert('watch_sessions', data.watch_sessions, [
                    'id','video_id','course_id','started_at','ended_at',
                    'duration_seconds','start_position','end_position'
                ])
            }
            if (data.instructors) {
                upsert('instructors', data.instructors, [
                    'id','name','display_name','avatar_data','updated_at'
                ])
            }
            if (data.roadmaps) {
                upsert('roadmaps', data.roadmaps, [
                    'id','name','nodes','connections','viewport','is_active',
                    'created_at','updated_at'
                ])
            }
            if (data.dub_jobs) {
                upsert('dub_jobs', data.dub_jobs, [
                    'id','video_id','language','status','step','progress',
                    'audio_path','file_size','error_message','created_at','completed_at'
                ])
            }
            if (data.settings) {
                for (const row of data.settings) {
                    db.run(
                        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                        [row.key, row.value, row.updated_at || new Date().toISOString()]
                    )
                }
            }

        })
        } finally {
            db.run('PRAGMA foreign_keys = ON')
        }

        saveDatabase()
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/detect-durations
// Scans all videos with missing/zero durations and attempts to repair them
router.post('/detect-durations', async (req, res) => {
    try {
        const videos = getAll(
            `SELECT id, file_path, duration, course_id
             FROM videos
             WHERE (duration < 1 OR duration > 36000) AND file_path IS NOT NULL`
        )

        let fixed = 0
        let failed = 0
        const coursesToRecalc = new Set()

        for (const video of videos) {
            if (!video.file_path || !fs.existsSync(video.file_path)) {
                failed++
                continue
            }
            try {
                const duration = await parseMp4Duration(video.file_path)
                const floored = Math.floor(duration || 0)
                if (floored >= 1 && floored <= 36000) {
                    run('UPDATE videos SET duration = ? WHERE id = ?', [floored, video.id])
                    coursesToRecalc.add(video.course_id)
                    fixed++
                } else {
                    failed++
                }
            } catch {
                failed++
            }
        }

        // Recalculate total_duration for affected courses
        for (const courseId of coursesToRecalc) {
            const courseVideos = getAll(
                'SELECT duration FROM videos WHERE course_id = ?', [courseId]
            )
            const totalDuration = courseVideos.reduce((sum, v) => sum + (v.duration || 0), 0)
            run('UPDATE courses SET total_duration = ? WHERE id = ?', [totalDuration, courseId])
        }

        if (fixed > 0) saveDatabase()

        res.json({
            success: true,
            total: videos.length,
            fixed,
            failed,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
