import { useEffect, useMemo, useRef } from 'react'
import { warmTimelinePreviews, previewBucket, formatPreviewTime } from '../../utils/timelinePreview'

function previewVideo(source, crossOrigin) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.crossOrigin = crossOrigin || null
    video.src = source
    return video
}

function frameCapture() {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 135
    return media => {
        const context = canvas.getContext('2d')
        context.fillStyle = '#000'
        context.fillRect(0, 0, 240, 135)
        const scale = Math.min(240 / media.videoWidth, 135 / media.videoHeight)
        const width = media.videoWidth * scale, height = media.videoHeight * scale
        context.drawImage(media, (240 - width) / 2, (135 - height) / 2, width, height)
        return canvas.toDataURL('image/jpeg', 0.7)
    }
}

export default function TimelinePreview({ mediaRef, position, duration }) {
    const background = useRef(null)
    const source = mediaRef.current?.currentSrc || mediaRef.current?.src || ''
    const sampleTime = position ? previewBucket(position.time, duration) : null
    useEffect(() => {
        if (!source || !duration) return
        const media = mediaRef.current
        let pool, disposed = false
        const start = () => {
            if (disposed || pool || media.readyState < 3) return
            pool = warmTimelinePreviews({
                duration,
                createVideo: () => previewVideo(source, media.crossOrigin),
                capture: frameCapture(),
                // Yield when playback buffers or the page is in the background.
                canRun: () => !document.hidden && media.readyState >= 3,
                concurrency: navigator.connection?.saveData ? 1 : 2,
            })
            background.current = { source, duration, cache: pool }
        }
        media.addEventListener('canplay', start)
        start()
        return () => { disposed = true; media.removeEventListener('canplay', start); pool?.dispose(); background.current = null }
    }, [source, duration])
    // Hover only reads the cache. Keep the same snapshot within each interval,
    // even if background preparation finishes while the pointer stays there.
    const frame = useMemo(() => {
        const prepared = background.current
        return sampleTime === null || prepared?.source !== source || prepared?.duration !== duration ? null : prepared.cache.get(sampleTime)
    }, [source, sampleTime, duration])
    if (!position) return null
    // Every position in the same five-second interval reuses one cached frame.
    const image = frame?.image
    return <div className="absolute bottom-full mb-3 pointer-events-none z-30 flex flex-col items-center" style={{ left: Math.max(0, Math.min(position.width - Math.min(192, position.width), position.x - 96)), width: Math.min(192, position.width) }}>
        {image && <img src={image} alt="Frame at preview position" className="w-full aspect-video object-contain bg-black rounded-lg border border-white/70 shadow-xl" />}
        <span className="mt-1 rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white tabular-nums">{formatPreviewTime(position.time)}</span>
    </div>
}
