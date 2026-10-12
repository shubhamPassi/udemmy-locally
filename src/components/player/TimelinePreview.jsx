import { useEffect, useMemo, useRef, useState } from 'react'
import { warmTimelinePreviews, previewBucket, formatPreviewTime, canPrepareTimeline } from '../../utils/timelinePreview'

function previewVideo(source, crossOrigin) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = crossOrigin || null
    video.src = source
    // Keep the decoder mounted outside the player so browsers decode paused
    // frames reliably, without registering it as the lesson's playback element.
    video.setAttribute('aria-hidden', 'true')
    video.tabIndex = -1
    video.style.cssText = 'position:fixed;left:-10000px;top:0;width:240px;height:135px;pointer-events:none;opacity:0'
    document.body.appendChild(video)
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
    const [cacheVersion, setCacheVersion] = useState(0)
    const source = mediaRef.current?.currentSrc || mediaRef.current?.src || ''
    const sampleTime = position ? previewBucket(position.time, duration) : null
    const hoveredBucket = useRef(sampleTime)
    hoveredBucket.current = sampleTime
    useEffect(() => {
        if (!source || !duration) return
        const media = mediaRef.current
        let pool, disposed = false
        const start = () => {
            if (disposed || pool || !canPrepareTimeline(media, document.hidden)) return
            pool = warmTimelinePreviews({
                duration,
                createVideo: () => previewVideo(source, media.crossOrigin),
                capture: frameCapture(),
                // Yield when playback buffers or the page is in the background.
                canRun: () => canPrepareTimeline(media, document.hidden),
                concurrency: navigator.connection?.saveData ? 1 : 2,
                onUpdate: time => {
                    if (!disposed && hoveredBucket.current === time) setCacheVersion(version => version + 1)
                },
            })
            background.current = { source, duration, cache: pool }
            setCacheVersion(version => version + 1)
        }
        const events = ['loadedmetadata', 'loadeddata', 'canplay', 'pause', 'seeked']
        events.forEach(event => media.addEventListener(event, start))
        document.addEventListener('visibilitychange', start)
        start()
        return () => { disposed = true; events.forEach(event => media.removeEventListener(event, start)); document.removeEventListener('visibilitychange', start); pool?.dispose(); background.current = null }
    }, [source, duration])
    // Hover only reads the cache. A missing frame becomes visible once prepared,
    // and stays unchanged for that entire five-second interval.
    const frame = useMemo(() => {
        const prepared = background.current
        return sampleTime === null || prepared?.source !== source || prepared?.duration !== duration ? null : prepared.cache.get(sampleTime)
    }, [source, sampleTime, duration, cacheVersion])
    if (!position) return null
    // Every position in the same five-second interval reuses one cached frame.
    const image = frame?.image
    return <div className="absolute bottom-full mb-3 pointer-events-none z-30 flex flex-col items-center" style={{ left: Math.max(0, Math.min(position.width - Math.min(192, position.width), position.x - 96)), width: Math.min(192, position.width) }}>
        {image && <img src={image} alt="Frame at preview position" className="w-full aspect-video object-contain bg-black rounded-lg border border-white/70 shadow-xl" />}
        <span className="mt-1 rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white tabular-nums">{formatPreviewTime(position.time)}</span>
    </div>
}
