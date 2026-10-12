import { useEffect, useRef, useState } from 'react'
import { createTimelinePreview, warmTimelinePreviews } from '../../utils/timelinePreview'
import { formatDuration } from '../../utils/db'

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
    const decoder = useRef(null)
    const background = useRef(null)
    const hovered = useRef(position)
    hovered.current = position
    const [frame, setFrame] = useState(null)
    const [, refresh] = useState(0)
    const source = mediaRef.current?.currentSrc || mediaRef.current?.src || ''
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
                onUpdate: () => { if (hovered.current) refresh(value => value + 1) },
            })
            background.current = pool
        }
        media.addEventListener('canplay', start)
        start()
        return () => { disposed = true; media.removeEventListener('canplay', start); pool?.dispose(); background.current = null }
    }, [source, duration])
    useEffect(() => {
        setFrame(null)
        if (!source || !position) return
        const prepared = background.current?.nearest(position.time)
        if (prepared && Math.abs(prepared.time - position.time) < 0.001) {
            setFrame({ time: position.time, image: prepared.image })
            return
        }
        if (!decoder.current) {
            const video = previewVideo(source, mediaRef.current?.crossOrigin)
            const controller = createTimelinePreview(video, frameCapture(), (time, image) => setFrame({ time, image }))
            decoder.current = controller
        }
        // Wait briefly for the pointer to settle rather than decoding every move.
        const timer = setTimeout(() => decoder.current?.request(position.time), 120)
        return () => clearTimeout(timer)
    }, [source, position?.time])
    useEffect(() => () => { decoder.current?.dispose(); decoder.current = null }, [source])
    if (!position) return null
    // A prepared frame appears immediately; an exact hover seek refines it.
    const image = (frame?.time === position.time ? frame.image : null) || background.current?.nearest(position.time)?.image
    return <div className="absolute bottom-full mb-3 pointer-events-none z-30 flex flex-col items-center" style={{ left: Math.max(0, Math.min(position.width - Math.min(192, position.width), position.x - 96)), width: Math.min(192, position.width) }}>
        {image && <img src={image} alt="Frame at preview position" className="w-full aspect-video object-contain bg-black rounded-lg border border-white/70 shadow-xl" />}
        <span className="mt-1 rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white tabular-nums">{formatDuration(position.time)}{position.time % 1 >= 0.05 ? `.${Math.floor((position.time % 1) * 10)}` : ''}</span>
    </div>
}
