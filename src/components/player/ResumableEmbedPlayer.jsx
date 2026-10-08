import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { updateVideoProgress, updateVideo, markVideoComplete } from '../../utils/db'
import { resumeTime, writePlaybackBookmark } from '../../utils/playbackBookmarks'
import { IS_BROWSER_MODE } from '../../utils/api'
import { playerShortcut } from '../../utils/playerShortcuts'
import StreamPlayerControls from './StreamPlayerControls'
import useStudyTime from '../../hooks/useStudyTime'

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

const ResumableEmbedPlayer = forwardRef(function ResumableEmbedPlayer({ video, courseId, settings, autoPlay, onTimeUpdate, onComplete, onNext, onPrevious, onAspectRatioChange }, ref) {
    const container = useRef(null)
    const host = useRef(null), native = useRef(null), player = useRef(null)
    const position = useRef(resumeTime(video, settings.resumePlayback)), duration = useRef(video.duration || 0)
    const observed = useRef(false), lastPersist = useRef(0), completed = useRef(video.isCompleted)
    const persistedDuration = useRef(video.duration || 0)
    const nativeReady = useRef(false)
    const lastCachedSecond = useRef(null)
    const [fallback, setFallback] = useState(false), [error, setError] = useState('')
    const callbacks = useRef({ onTimeUpdate, onComplete, onNext, onPrevious, onAspectRatioChange })
    callbacks.current = { onTimeUpdate, onComplete, onNext, onPrevious, onAspectRatioChange }
    const isYouTube = !!(video.youtubeId || /youtu(?:be\.com|\.be)/.test(video.url || ''))
    const youtubeId = video.youtubeId || video.url?.match(/(?:[?&]v=|youtu\.be\/)([^?&/]+)/)?.[1]
    const driveId = video.driveFileId || video.url?.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/)?.[1]
    const flushStudyTime=useStudyTime(()=>{
        if(isYouTube) {
            const yt=player.current
            return yt?.getCurrentTime?{time:yt.getCurrentTime(),rate:yt.getPlaybackRate(),playing:yt.getPlayerState()===1}:null
        }
        const media=native.current
        return media?{element:media,time:media.currentTime,rate:media.playbackRate,seeking:media.seeking,playing:!media.paused&&!media.seeking&&media.readyState>=3}:null
    },video.id,courseId)

    function remember(force = false) {
        if (!observed.current) return
        const second = Math.floor(position.current)
        if (force || lastCachedSecond.current !== second) {
            lastCachedSecond.current = second
            writePlaybackBookmark(video.id, position.current, duration.current)
        }
        if (force || Date.now() - lastPersist.current > 10000) {
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
        function keydown(event) {
            if (!settings.keyboardShortcuts || fallback) return
            const action = playerShortcut(event)
            const media = native.current, yt = player.current
            if (!action || (isYouTube ? !yt?.getPlayerState : !media || media.readyState < 1)) return
            const paused = isYouTube ? yt.getPlayerState() !== 1 : media.paused
            const time = isYouTube ? yt.getCurrentTime() : media.currentTime
            const length = isYouTube ? yt.getDuration() : media.duration
            const seek = value => {
                if (!Number.isFinite(length) || length <= 0) return
                const bounded = Math.max(0, Math.min(length, value))
                if (isYouTube) yt.seekTo(bounded, true)
                else media.currentTime = bounded
            }
            if (action.type === 'frame' && !paused) return
            if (event.repeat && ['toggle', 'mute', 'fullscreen', 'next', 'previous'].includes(action.type)) return
            event.preventDefault()
            switch (action.type) {
                case 'toggle':
                    if (isYouTube) paused ? yt.playVideo() : yt.pauseVideo()
                    else paused ? media.play().catch(() => {}) : media.pause()
                    break
                case 'seek': case 'frame': seek(time + action.value); break
                case 'percent': seek(length * action.value); break
                case 'volume':
                    if (isYouTube) yt.setVolume(Math.max(0, Math.min(100, yt.getVolume() + action.value * 100)))
                    else media.volume = Math.max(0, Math.min(1, media.volume + action.value))
                    break
                case 'mute':
                    if (isYouTube) yt.isMuted() ? yt.unMute() : yt.mute()
                    else media.muted = !media.muted
                    break
                case 'speed': {
                    const rates = isYouTube ? yt.getAvailablePlaybackRates() : [0.25,0.5,0.75,1,1.25,1.5,1.75,2]
                    const rate = isYouTube ? yt.getPlaybackRate() : media.playbackRate
                    const next = action.value > 0 ? rates.find(value => value > rate) : [...rates].reverse().find(value => value < rate)
                    if (next) isYouTube ? yt.setPlaybackRate(next) : media.playbackRate = next
                    break
                }
                case 'fullscreen':
                    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
                    else if (container.current?.requestFullscreen) container.current.requestFullscreen().catch(() => {})
                    else media?.webkitEnterFullscreen?.()
                    break
                case 'next': callbacks.current.onNext?.(); break
                case 'previous': callbacks.current.onPrevious?.(); break
            }
        }
        window.addEventListener('keydown', keydown, true)
        return () => window.removeEventListener('keydown', keydown, true)
    }, [video.id, settings.keyboardShortcuts, fallback, isYouTube])
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
                        flushStudyTime()
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
    return <div ref={container} className="w-full h-full relative bg-black">
        {isYouTube ? <div ref={host} className="w-full h-full" /> : fallback ? <>
            <iframe className="w-full h-full" src={`https://drive.google.com/file/d/${driveId}/preview`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={video.title} />
            <p className="absolute bottom-0 inset-x-0 p-2 text-xs bg-black/90 text-white">Drive preview does not expose playback time. Enable downloads for this file or import its local copy to use automatic resume.</p>
        </> : <video ref={native} className="w-full h-full object-contain" playsInline crossOrigin="anonymous" autoPlay={autoPlay}
            src={IS_BROWSER_MODE ? `/api/drive-video?id=${encodeURIComponent(driveId)}` : `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`}
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
        {!isYouTube && !fallback && <StreamPlayerControls mediaRef={native} containerRef={container} />}
        {error && <p className="absolute top-0 inset-x-0 p-3 bg-black/90 text-white text-sm">{error}</p>}
    </div>
})
export default ResumableEmbedPlayer
