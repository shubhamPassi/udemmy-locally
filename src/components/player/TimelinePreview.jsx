import { useEffect, useRef, useState } from 'react'
import { createTimelinePreview } from '../../utils/timelinePreview'
import { formatDuration } from '../../utils/db'

export default function TimelinePreview({ mediaRef, position }) {
    const decoder = useRef(null)
    const [frame, setFrame] = useState(null)
    const source = mediaRef.current?.currentSrc || mediaRef.current?.src || ''
    useEffect(() => {
        setFrame(null)
        if (!source || !position) return
        if (!decoder.current) {
            const video = document.createElement('video')
            video.muted = true
            video.playsInline = true
            video.preload = 'metadata'
            video.crossOrigin = mediaRef.current?.crossOrigin || null
            video.src = source
            const canvas = document.createElement('canvas')
            canvas.width = 240
            canvas.height = 135
            const controller = createTimelinePreview(video, media => {
                const context = canvas.getContext('2d')
                context.fillStyle = '#000'
                context.fillRect(0, 0, 240, 135)
                const scale = Math.min(240 / media.videoWidth, 135 / media.videoHeight)
                const width = media.videoWidth * scale, height = media.videoHeight * scale
                context.drawImage(media, (240 - width) / 2, (135 - height) / 2, width, height)
                return canvas.toDataURL('image/jpeg', 0.75)
            }, (time, image) => setFrame({ time, image }))
            decoder.current = controller
        }
        // Wait briefly for the pointer to settle rather than decoding every move.
        const timer = setTimeout(() => decoder.current?.request(position.time), 120)
        return () => clearTimeout(timer)
    }, [source, position?.time])
    useEffect(() => () => { decoder.current?.dispose(); decoder.current = null }, [source])
    if (!position) return null
    const image = frame?.time === position.time ? frame.image : null
    return <div className="absolute bottom-full mb-3 pointer-events-none z-30 flex flex-col items-center" style={{ left: Math.max(0, Math.min(position.width - Math.min(192, position.width), position.x - 96)), width: Math.min(192, position.width) }}>
        {image && <img src={image} alt="Frame at preview position" className="w-full aspect-video object-contain bg-black rounded-lg border border-white/70 shadow-xl" />}
        <span className="mt-1 rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white tabular-nums">{formatDuration(position.time)}{position.time % 1 >= 0.05 ? `.${Math.floor((position.time % 1) * 10)}` : ''}</span>
    </div>
}
