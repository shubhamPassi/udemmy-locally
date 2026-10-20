import useEventCallback from '../../hooks/useEventCallback.js'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { updateVideoProgress, updateVideo, markVideoComplete } from '../../utils/db'
import { resumeTime, writePlaybackBookmark } from '../../utils/playbackBookmarks'
import { IS_BROWSER_MODE } from '../../utils/api'
import { playerShortcut } from '../../utils/playerShortcuts'
import StreamPlayerControls from './StreamPlayerControls'
import PlayerLearningTools from './PlayerLearningTools.jsx'
import useStudyTime from '../../hooks/useStudyTime'
import { disableHostedDriveBackground } from '../../utils/hostedVideoPolicy'

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
const rememberEvent=useEventCallback(remember)
const sampleEvent=useEventCallback(sample)
const autoplayRef=useRef(autoPlay),nextEnabled=useRef(settings.autoPlayNext)
autoplayRef.current=autoPlay;nextEnabled.current=settings.autoPlayNext

    const container = useRef(null)
    const host = useRef(null), native = useRef(null), player = useRef(null)
    const repeatSection=useRef(false)
    const repeatChanged=useEventCallback(enabled=>{repeatSection.current=enabled})
    const position = useRef(resumeTime(video, settings.resumePlayback)), duration = useRef(video.duration || 0)
    const observed = useRef(false), lastPersist = useRef(0), completed = useRef(video.isCompleted)
    const persistedDuration = useRef(video.duration || 0)
    const nativeReady = useRef(false)
    const lastCachedSecond = useRef(null)
    const disableBackground = disableHostedDriveBackground(video, IS_BROWSER_MODE)
    const [fallback, setFallback] = useState(false), [error, setError] = useState('')
    const [retrying, setRetrying] = useState(false), [attempt, setAttempt] = useState(0)
    const [mediaLoading,setMediaLoading]=useState(true)
    const [slowBuffer,setSlowBuffer]=useState(false)
    const bufferTimer=useRef(null),bufferRetryTimer=useRef(null)
    const retryTimer = useRef(null), retryCount = useRef(0), continuePlaying = useRef(autoPlay)
    const callbacks = useRef({ onTimeUpdate, onComplete, onNext, onPrevious, onAspectRatioChange })
    callbacks.current = { onTimeUpdate, onComplete, onNext, onPrevious, onAspectRatioChange }
    const isYouTube = !!(video.youtubeId || /youtu(?:be\.com|\.be)/.test(video.url || ''))
    const youtubeId = video.youtubeId || video.url?.match(/(?:[?&]v=|youtu\.be\/)([^?&/]+)/)?.[1]
    const driveId = video.driveFileId || video.url?.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/)?.[1]
    useEffect(() => () => {clearTimeout(retryTimer.current);clearTimeout(bufferTimer.current);clearTimeout(bufferRetryTimer.current)}, [])
    function clearBufferNotice(){clearTimeout(bufferTimer.current);clearTimeout(bufferRetryTimer.current);setSlowBuffer(false)}
    function retryDrive(manual = false) {
        clearTimeout(retryTimer.current)
        clearBufferNotice()
        if (manual) retryCount.current = 0
        nativeReady.current = false
        setError('')
        setFallback(false)
        setRetrying(true)
        setMediaLoading(true)
        setAttempt(value => value + 1)
    }
    function showDrivePreview() {
        clearTimeout(retryTimer.current)
        clearBufferNotice()
        flushStudyTime()
        remember(true)
        nativeReady.current = false
        setError('')
        setRetrying(false)
        setMediaLoading(false)
        setFallback(true)
    }
    function handleDriveError(event) {
        const media = event.currentTarget
        console.warn('Drive direct playback failed:', media.error?.code, media.error?.message)
        if (nativeReady.current && media.currentTime > 0) sample(media.currentTime, media.duration, true)
        continuePlaying.current = continuePlaying.current || !media.paused
        nativeReady.current = false
        if (retryCount.current < 2) {
            retryCount.current++
            setRetrying(true)
            retryTimer.current = setTimeout(() => retryDrive(), retryCount.current * 1500)
        } else {
            showDrivePreview()
        }
    }
    const flushStudyTime=useStudyTime(()=>{
        if(isYouTube) {
            const yt=player.current
            return yt?.getCurrentTime?{time:yt.getCurrentTime(),duration:yt.getDuration(),rate:yt.getPlaybackRate(),playing:yt.getPlayerState()===1}:null
        }
        const media=native.current
        return media?{element:media,time:media.currentTime,duration:media.duration,rate:media.playbackRate,seeking:media.seeking,playing:!media.paused&&!media.seeking&&media.readyState>=3}:null
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
        const flush = () => rememberEvent(true)
        const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
        window.addEventListener('pagehide', flush)
        document.addEventListener('visibilitychange', onHidden)
        return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHidden) }
    }, [video.id, rememberEvent])
    useEffect(() => {
        if (!isYouTube) return
        let cancelled = false, timer
        loadYouTubeApi().then(YT => {
            if (cancelled || !host.current) return
            const mount = document.createElement('div')
            host.current.appendChild(mount)
            player.current = new YT.Player(mount, {
                width: '100%', height: '100%', videoId: youtubeId,
                playerVars: { enablejsapi: 1, origin: window.location.origin, start: Math.floor(position.current), autoplay: autoplayRef.current ? 1 : 0, rel: 0 },
                events: {
                    onReady: event => {
                        setMediaLoading(false)
                        const length = event.target.getDuration()
                        if (length > 0) { duration.current = length; updateVideo(video.id, { duration: length }).catch(console.error) }
                        if (position.current > 0) event.target.seekTo(position.current, true)
                        if (!autoplayRef.current) event.target.pauseVideo()
                    },
                    onStateChange: event => {
                        flushStudyTime()
                        if (event.data === 1) sampleEvent(event.target.getCurrentTime(), event.target.getDuration())
                        if ((event.data === 2 || event.data === 0) && observed.current) sampleEvent(event.target.getCurrentTime(), event.target.getDuration(), true)
                        if (event.data === 0 && nextEnabled.current&&!repeatSection.current) callbacks.current.onNext?.()
                    },
                    onError: () => setError('YouTube could not play this video. It may be unavailable or embedding may be disabled.'),
                },
            })
            timer = setInterval(() => {
                const yt = player.current
                if (yt?.getPlayerState?.() === 1) sampleEvent(yt.getCurrentTime(), yt.getDuration())
            }, 1000)
        }).catch(err => setError(err.message))
        return () => { cancelled = true; clearInterval(timer); rememberEvent(true); player.current?.destroy?.(); player.current = null }
    }, [video.id,isYouTube,youtubeId,flushStudyTime,sampleEvent, rememberEvent])
    return <div ref={container} className={`w-full h-full relative bg-black${fallback && !isYouTube ? ' flex flex-col' : ''}`}>
        {isYouTube ? <div ref={host} className="w-full h-full" /> : fallback ? <>
            <iframe key={attempt} className="w-full min-h-0 flex-1 border-0" src={`https://drive.google.com/file/d/${driveId}/preview`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={video.title} />
            <div className="shrink-0 border-t border-white/10 bg-neutral-900 px-3 py-2 text-xs text-white flex flex-wrap items-center justify-between gap-2"><details className="min-w-0 flex-1"><summary className="cursor-pointer text-neutral-300 hover:text-white">Drive preview · Resume and statistics unavailable</summary><p role="status" className="mt-2 max-w-xl leading-5 text-neutral-400">Switched to Drive preview because the direct stream failed. Preview cannot save playback time or record study statistics. Your previous position is still saved. Retry the resumable player to restore tracking.</p></details><div className="flex shrink-0 flex-wrap gap-2"><button onClick={() => retryDrive(true)} className="rounded px-3 py-2 text-neutral-300 hover:bg-white/10 hover:text-white">Retry resumable player</button><a href={`https://drive.google.com/file/d/${driveId}/view`} target="_blank" rel="noopener noreferrer" className="rounded px-3 py-2 text-neutral-300 hover:bg-white/10 hover:text-white">Open in Drive</a></div></div>
        </> : <video key={`media-${attempt}`} ref={native} className="w-full h-full object-contain" playsInline crossOrigin="anonymous" autoPlay={continuePlaying.current}
            src={IS_BROWSER_MODE ? `/api/drive-video?id=${encodeURIComponent(driveId)}${attempt ? `&retry=${attempt}` : ''}` : `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`}
            onLoadedMetadata={event => {
                const element = event.currentTarget
                duration.current = element.duration
                if (position.current > 0) element.currentTime = Math.min(position.current, Math.max(0, element.duration - 1))
                nativeReady.current = true
                setMediaLoading(false)
                setRetrying(false)
                setError('')
                updateVideo(video.id, { duration: element.duration }).catch(console.error)
                if (element.videoWidth && element.videoHeight) callbacks.current.onAspectRatioChange?.(element.videoWidth, element.videoHeight)
            }}
            onTimeUpdate={event => sampleNative(event)}
            onPlay={() => { continuePlaying.current = true }}
            onPlaying={() => { retryCount.current = 0; setRetrying(false);clearBufferNotice() }}
            onCanPlay={clearBufferNotice}
            onWaiting={event=>{
                const media=event.currentTarget
                clearTimeout(bufferTimer.current);clearTimeout(bufferRetryTimer.current)
                bufferTimer.current=setTimeout(()=>{if(native.current===media&&!media.paused&&media.readyState<3)setSlowBuffer(true)},20000)
                bufferRetryTimer.current=setTimeout(()=>{if(native.current===media&&!media.paused&&media.readyState<3)handleDriveError({currentTarget:media})},40000)
            }}
            onPause={event => { clearBufferNotice(); if (!event.currentTarget.error && !retrying) continuePlaying.current = false; sampleNative(event, true) }}
            onSeeked={event => sampleNative(event, true)}
            onEnded={event => { sample(event.currentTarget.currentTime, event.currentTarget.duration, true); if (settings.autoPlayNext&&event.currentTarget.dataset.repeatSection!=='true') callbacks.current.onNext?.() }}
            onError={handleDriveError} />}
        {isYouTube&&!error&&<div className="absolute right-3 top-3 z-20 rounded-full bg-black/70"><PlayerLearningTools youtubeRef={player} hostRef={container} video={video} onRepeatChange={repeatChanged}/></div>}
        {!isYouTube && !fallback && !error && !retrying && <StreamPlayerControls key={`controls-${attempt}`} mediaRef={native} containerRef={container} video={video} allowFramePreviews={!disableBackground} showLoadingIndicator={!mediaLoading} />}
        {(retrying || mediaLoading) && !error && !fallback && <div role="status" aria-label="Loading video" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40"><span className="h-11 w-11 rounded-full border-4 border-white/20 border-t-white animate-spin" /></div>}
        {slowBuffer&&!error&&!fallback&&<div className="absolute bottom-24 inset-x-4 z-30 rounded-lg bg-black/85 p-3 text-center text-xs text-white">Drive is taking longer to respond. Your progress is saved.<button onClick={()=>{remember(true);retryDrive(true)}} className="ml-3 rounded bg-blue-600 px-3 py-2">Reconnect</button></div>}
        {error && (isYouTube ? <p className="absolute top-0 inset-x-0 p-3 bg-black/90 text-white text-sm">{error}</p> : <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-5"><div className="max-w-md text-center text-white"><p role="alert" className="text-sm leading-6">{error}</p><div className="mt-4 flex flex-wrap justify-center gap-3"><button onClick={() => retryDrive(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium">Retry video</button><button onClick={showDrivePreview} className="rounded-lg border border-white/20 px-4 py-2 text-sm">Use Drive preview</button></div></div></div>)}
    </div>
})
export default ResumableEmbedPlayer
