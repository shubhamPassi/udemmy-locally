import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { updateVideoProgress, updateVideo, markVideoComplete, formatDuration } from '../../utils/db'
import { resumeTime, writePlaybackBookmark } from '../../utils/playbackBookmarks'

let youtubeApi
function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT)
    if (!youtubeApi) youtubeApi = new Promise((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT) }
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        script.onerror = () => { youtubeApi = null; reject(new Error('Could not load YouTube player')) }
        document.head.appendChild(script)
    })
    return youtubeApi
}

const ResumableEmbedPlayer = forwardRef(function ResumableEmbedPlayer({ video, settings, autoPlay, onTimeUpdate, onComplete, onNext, onAspectRatioChange }, ref) {
    const host = useRef(null), native = useRef(null), player = useRef(null)
    const position = useRef(resumeTime(video, settings.resumePlayback)), duration = useRef(video.duration || 0)
    const observed = useRef(false), lastPersist = useRef(0), completed = useRef(video.isCompleted)
    const persistedDuration = useRef(video.duration || 0)
    const nativeReady = useRef(false)
    const [fallback, setFallback] = useState(false), [error, setError] = useState('')
    const [savedTime, setSavedTime] = useState(position.current)
    const callbacks = useRef({ onTimeUpdate, onComplete, onNext, onAspectRatioChange })
    callbacks.current = { onTimeUpdate, onComplete, onNext, onAspectRatioChange }
    const isYouTube = !!(video.youtubeId || /youtu(?:be\.com|\.be)/.test(video.url || ''))
    const youtubeId = video.youtubeId || video.url?.match(/(?:[?&]v=|youtu\.be\/)([^?&/]+)/)?.[1]
    const driveId = video.driveFileId || video.url?.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/)?.[1]

    function remember(force = false) {
        if (!observed.current) return
        writePlaybackBookmark(video.id, position.current, duration.current)
        setSavedTime(position.current)
        if (force || Date.now() - lastPersist.current > 4000) {
            lastPersist.current = Date.now()
            const time = position.current, length = duration.current
            const metadata = length > 0 && Math.abs(length - persistedDuration.current) > 1
                ? updateVideo(video.id, { duration: length }) : Promise.resolve()
            persistedDuration.current = length
            metadata.then(() => updateVideoProgress(video.id, time, length)).catch(console.error)
        }
        if (!completed.current && duration.current > 0 && position.current / duration.current * 100 >= settings.autoMarkCompleteAt) {
            completed.current = true
            markVideoComplete(video.id, true).then(() => callbacks.current.onComplete?.(video.id)).catch(console.error)
        }
    }
    function sample(time, length, force = false) {
        if (!Number.isFinite(time) || time < 0) return
        observed.current = true
        position.current = time
        if (Number.isFinite(length) && length > 0) duration.current = length
        callbacks.current.onTimeUpdate?.(time)
        remember(force)
    }
    function sampleNative(event, force = false) {
        if (!nativeReady.current || event.currentTarget.seeking) return
        sample(event.currentTarget.currentTime, event.currentTarget.duration, force)
    }
    useImperativeHandle(ref, () => ({
        seekTo: time => { if (isYouTube) player.current?.seekTo(time, true); else if (native.current) native.current.currentTime = time },
        getCurrentTime: () => position.current,
        getInternalVideo: () => native.current || player.current,
    }), [isYouTube])
    useEffect(() => {
        const flush = () => remember(true)
        const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
        window.addEventListener('pagehide', flush)
        document.addEventListener('visibilitychange', onHidden)
        return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHidden) }
    }, [video.id])
    useEffect(() => {
        if (!isYouTube) return
        let cancelled = false, timer
        loadYouTubeApi().then(YT => {
            if (cancelled || !host.current) return
            const mount = document.createElement('div')
            host.current.appendChild(mount)
            player.current = new YT.Player(mount, {
                width: '100%', height: '100%', videoId: youtubeId,
                playerVars: { enablejsapi: 1, origin: window.location.origin, start: Math.floor(position.current), autoplay: autoPlay ? 1 : 0, rel: 0 },
                events: {
                    onReady: event => {
                        const length = event.target.getDuration()
                        if (length > 0) { duration.current = length; updateVideo(video.id, { duration: length }).catch(console.error) }
                        if (position.current > 0) event.target.seekTo(position.current, true)
                        if (!autoPlay) event.target.pauseVideo()
                    },
                    onStateChange: event => {
                        if (event.data === 1) sample(event.target.getCurrentTime(), event.target.getDuration())
                        if ((event.data === 2 || event.data === 0) && observed.current) sample(event.target.getCurrentTime(), event.target.getDuration(), true)
                        if (event.data === 0 && settings.autoPlayNext) callbacks.current.onNext?.()
                    },
                    onError: () => setError('YouTube could not play this video. It may be unavailable or embedding may be disabled.'),
                },
            })
            timer = setInterval(() => {
                const yt = player.current
                if (yt?.getPlayerState?.() === 1) sample(yt.getCurrentTime(), yt.getDuration())
            }, 1000)
        }).catch(err => setError(err.message))
        return () => { cancelled = true; clearInterval(timer); remember(true); player.current?.destroy?.(); player.current = null }
    }, [video.id])
    return <div className="w-full h-full relative bg-black">
        {isYouTube ? <div ref={host} className="w-full h-full" /> : fallback ? <>
            <iframe className="w-full h-full" src={`https://drive.google.com/file/d/${driveId}/preview`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={video.title} />
            <p className="absolute bottom-0 inset-x-0 p-2 text-xs bg-black/90 text-white">Drive preview does not expose playback time. Enable downloads for this file or import its local copy to use automatic resume.</p>
        </> : <video ref={native} className="w-full h-full" controls playsInline crossOrigin="anonymous" autoPlay={autoPlay}
            src={`https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`}
            onLoadedMetadata={event => {
                const element = event.currentTarget
                duration.current = element.duration
                if (position.current > 0) element.currentTime = Math.min(position.current, Math.max(0, element.duration - 1))
                nativeReady.current = true
                updateVideo(video.id, { duration: element.duration }).catch(console.error)
                if (element.videoWidth && element.videoHeight) callbacks.current.onAspectRatioChange?.(element.videoWidth, element.videoHeight)
            }}
            onTimeUpdate={event => sampleNative(event)}
            onPause={event => sampleNative(event, true)}
            onSeeked={event => sampleNative(event, true)}
            onEnded={event => { sample(event.currentTarget.currentTime, event.currentTarget.duration, true); if (settings.autoPlayNext) callbacks.current.onNext?.() }}
            onError={event => { console.warn('Drive direct playback failed:', event.currentTarget.error?.code, event.currentTarget.error?.message); setFallback(true) }} />}
        {error && <p className="absolute top-0 inset-x-0 p-3 bg-black/90 text-white text-sm">{error}</p>}
        {!fallback && savedTime > 0 && <span className="absolute top-2 left-2 pointer-events-none text-xs text-white bg-black/70 rounded px-2 py-1">Saved at {formatDuration(savedTime)}</span>}
    </div>
})
export default ResumableEmbedPlayer
