import { useEffect, useRef, useState } from 'react'
import { warmTimelinePreviews, previewBucket, formatPreviewTime, canPrepareTimeline, previewWorkload } from '../../utils/timelinePreview'
import { previewCacheKey, loadPreviewFrames, storePreviewFrames } from '../../utils/previewCache.js'
import { isDriveVideo } from '../../utils/hostedVideoPolicy.js'

function previewVideo(source, crossOrigin) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
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
    return async media => {
        const context = canvas.getContext('2d')
        context.fillStyle = '#000'
        context.fillRect(0, 0, 240, 135)
        const scale = Math.min(240 / media.videoWidth, 135 / media.videoHeight)
        const width = media.videoWidth * scale, height = media.videoHeight * scale
        context.drawImage(media, (240 - width) / 2, (135 - height) / 2, width, height)
        const url = canvas.toDataURL('image/jpeg', 0.7)
        // Decode the thumbnail during preparation, not on its first hover.
        const image = new Image()
        image.src = url
        await image.decode()
        return url
    }
}

export default function TimelinePreview({ mediaRef, position, duration, video, prepareFrames = true }) {
    const background = useRef(null)
    const [, setCacheVersion] = useState(0)
    const [loadedMedia, setLoadedMedia] = useState(null)
    // A ref changing after mount does not trigger a React render. Observe the
    // media events directly instead of discovering its source on first hover.
    useEffect(() => {
        const media = mediaRef.current
        if (!media) return
        const sync = () => {
            const source = media.currentSrc || media.src || ''
            const length = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : duration
            setLoadedMedia(previous => previous?.source === source && previous?.duration === length ? previous : { source, duration: length })
        }
        const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'durationchange', 'canplay', 'emptied']
        events.forEach(event => media.addEventListener(event, sync))
        sync()
        return () => events.forEach(event => media.removeEventListener(event, sync))
    }, [mediaRef, duration])
    const source = loadedMedia?.source || ''
    const previewDuration = loadedMedia?.duration || duration
    const cacheIdentity = previewCacheKey(video, previewDuration)
    const drive = isDriveVideo(video)
    const { concurrency, delay, minBufferSeconds, maxFailures } = previewWorkload(video, !!navigator.connection?.saveData)
    const sampleTime = position ? previewBucket(position.time, previewDuration) : null
    const hoveredBucket = useRef(sampleTime)
    hoveredBucket.current = sampleTime
    useEffect(() => {
        if (!prepareFrames || drive || !source || !previewDuration) return
        const media = mediaRef.current
        let pool, disposed = false, starting=false, saveTimer
        const canRun = () => canPrepareTimeline(media, document.hidden, minBufferSeconds)
        const pending=new Map(),key=cacheIdentity
        const flush=()=>{clearTimeout(saveTimer);if(!pending.size)return;const frames=[...pending];pending.clear();storePreviewFrames(key,frames).catch(()=>{})}
        const start = async () => {
            if (disposed || pool || starting || !canRun()) return
            starting=true
            const initialFrames=await loadPreviewFrames(key).catch(()=>[])
            if(disposed)return
            pool = warmTimelinePreviews({
                duration: previewDuration,
                createVideo: () => previewVideo(source, media.crossOrigin),
                capture: frameCapture(),
                // Yield when playback buffers or the page is in the background.
                canRun,
                concurrency,
                delay,
                maxFailures,
                initialFrames,
                onUpdate: time => {
                    if(pool){pending.set(time,pool.get(time)?.image);if(!saveTimer)saveTimer=setTimeout(()=>{saveTimer=null;flush()},1000)}
                    if (!disposed && hoveredBucket.current === time) setCacheVersion(version => version + 1)
                },
            })
            background.current = { source, duration: previewDuration, cache: pool }
            setCacheVersion(version => version + 1)
            pool.done.then(flush)
        }
        const prioritizePlayback = () => { if (!canRun()) pool?.suspend() }
        const interrupts = ['waiting', 'stalled', 'seeking', 'play', 'error']
        interrupts.forEach(event => media.addEventListener(event, prioritizePlayback))
        const events = ['loadedmetadata', 'loadeddata', 'canplay', 'pause', 'seeked', 'progress', 'timeupdate']
        events.forEach(event => media.addEventListener(event, start))
        const visibility = () => { prioritizePlayback(); start() }
        document.addEventListener('visibilitychange', visibility)
        start()
        return () => { disposed = true; flush();events.forEach(event => media.removeEventListener(event, start)); interrupts.forEach(event => media.removeEventListener(event, prioritizePlayback)); document.removeEventListener('visibilitychange', visibility); pool?.dispose(); background.current = null }
    }, [source, previewDuration, mediaRef, cacheIdentity, prepareFrames, concurrency, delay, minBufferSeconds, maxFailures, drive])
    // Hover only reads the cache. A missing frame becomes visible once prepared,
    // and stays unchanged for that entire ten-second interval.
    const prepared = background.current
    const frame = sampleTime === null || prepared?.source !== source || prepared?.duration !== previewDuration ? null : prepared.cache.get(sampleTime)
    if (!position) return null
    // Every position in the same ten-second interval reuses one cached frame.
    const image = frame?.image
    return <div className="absolute bottom-full mb-3 pointer-events-none z-30 flex flex-col items-center" style={{ left: Math.max(0, Math.min(position.width - Math.min(192, position.width), position.x - 96)), width: Math.min(192, position.width) }}>
        {image && <img src={image} alt="Frame at preview position" className="w-full aspect-video object-contain bg-black rounded-lg border border-white/70 shadow-xl" />}
        <span className="mt-1 rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white tabular-nums">{formatPreviewTime(position.time)}</span>
    </div>
}
