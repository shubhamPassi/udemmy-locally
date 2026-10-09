import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react'
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    SkipBack, SkipForward, Settings, PictureInPicture, FolderOpen, X, Repeat, Captions, CaptionsOff, Globe, Headphones,
    Sparkles, FileText, Languages, Upload, Gauge, ChevronRight, ChevronLeft, Check
} from 'lucide-react'
// YouTube videos use native iframe embed
import { getVideoUrl, releaseVideoUrl } from '../../utils/fileSystem'
import { updateVideoProgress, markVideoComplete, formatDuration, getCourse, updateVideo, updateCourse, getVideosByCourse } from '../../utils/db'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'
import CaptionOverlay from './CaptionOverlay'
import TranslateModal from './TranslateModal'
// [DUB FEATURE HIDDEN] import DubModal from './DubModal'
import mpegts from 'mpegts.js'
import ResumableEmbedPlayer from './ResumableEmbedPlayer'
import { resumeTime, writePlaybackBookmark } from '../../utils/playbackBookmarks'
import useStudyTime from '../../hooks/useStudyTime'
import StreamPlayerControls from './StreamPlayerControls'


const VideoPlayer = forwardRef(function VideoPlayer({ video, onComplete, onNext, onPrevious, courseId, onTimeUpdate, autoPlay, onAspectRatioChange, onLocalAccessError }, ref) {
    const { settings, updateSettings } = useSettings()
    const videoRef = useRef(null)
    useStudyTime(()=>{
        const media=videoRef.current
        return media?.nodeName==='VIDEO'?{element:media,time:media.currentTime,duration:media.duration,rate:media.playbackRate,seeking:media.seeking,playing:!media.paused&&!media.seeking&&media.readyState>=3}:null
    },video?.id,courseId)
    const embeddedPlayerRef = useRef(null)
    const localBookmarkRef = useRef(null)
    const bookmarkSecondRef = useRef(null)
    const containerRef = useRef(null)
    const progressRef = useRef(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    
    // Refs for accessing latest state in closures (e.g. interval timers and YouTube message handlers)
    const currentTimeRef = useRef(currentTime)
    const durationRef = useRef(duration)
    useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
    useEffect(() => { durationRef.current = duration }, [duration])
    const [volume, setVolume] = useState(() => settings.volume)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [playbackSpeed, setPlaybackSpeed] = useState(() => settings.playbackSpeed)
    const [showSpeedMenu, setShowSpeedMenu] = useState(false)
    const [isPiP, setIsPiP] = useState(false)
    const [showAutoPlayCountdown, setShowAutoPlayCountdown] = useState(false)
    const [autoPlayCountdown, setAutoPlayCountdown] = useState(3)
    const [localAutoPlay, setLocalAutoPlay] = useState(() => settings.autoPlayNext)
    const [resumePosition, setResumePosition] = useState(0)
    const [captionsEnabled, setCaptionsEnabled] = useState(() => settings.captionsEnabled)
    const [captionPosition, setCaptionPosition] = useState(() => settings.captionPosition)
    const [captionLanguages, setCaptionLanguages] = useState({ sourceExists: false, translatedLangs: [], existingLangs: [] })
    const [selectedCaptionLang, setSelectedCaptionLang] = useState(() => settings.captionLanguage || 'source')
    const [captionChunks, setCaptionChunks] = useState([])
    const [showCCMenu, setShowCCMenu] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const pendingAutoPlayRef = useRef(false) // Track autoplay intent during video transitions
    const [showTranslateModal, setShowTranslateModal] = useState(false)
    // [DUB FEATURE HIDDEN] — state kept but hardcoded to disabled
    const dubAudioRef = useRef(null)
    const dubLanguages = [] // was: useState([])
    const setDubLanguages = () => {} // no-op
    const selectedDubLang = 'none' // was: useState('none')
    const setSelectedDubLang = () => {} // no-op
    const showAudioMenu = false // was: useState(false)
    const setShowAudioMenu = () => {} // no-op
    const showDubModal = false // was: useState(false)
    const setShowDubModal = () => {} // no-op
    const [showSettingsMenu, setShowSettingsMenu] = useState(false)
    const [settingsSubMenu, setSettingsSubMenu] = useState('main')

    const progressIntervalRef = useRef(null)
    const controlsTimeoutRef = useRef(null)
    const mpegtsPlayerRef = useRef(null)
    const fallbackAttemptRef = useRef(0)

    const isTs = useMemo(() => {
        if (!videoUrl) return false
        const path = video?.filePath || videoUrl
        return path.toLowerCase().endsWith('.ts') ||
            path.toLowerCase().includes('.ts?') ||
            videoUrl.includes('/video-mpegts/')
    }, [videoUrl, video])

    const getFallbackUrl = useCallback((attempt) => {
        if (!video?.filePath) return null

        const fallbackPath = attempt === 1
            ? 'video-mpegts'
            : attempt === 2
                ? 'video-webm'
                : attempt === 3
                    ? 'video-transcoded'
                    : 'video-compatible'

        return {
            fallbackPath,
            fallbackUrl: `${SERVER_URL}/${fallbackPath}/${encodeURIComponent(video.filePath)}`,
        }
    }, [video?.filePath])

    const tryNextPlaybackFallback = useCallback((reason, mediaEl = null) => {
        if (!video?.filePath || fallbackAttemptRef.current >= 4) return false

        fallbackAttemptRef.current += 1
        const next = getFallbackUrl(fallbackAttemptRef.current)
        if (!next) return false

        console.warn(`Video playback failed; retrying via FFmpeg ${next.fallbackPath} fallback:`, reason)
        setError(null)
        setIsLoading(true)
        setVideoUrl(next.fallbackUrl)

        if (mediaEl) {
            mediaEl.src = next.fallbackUrl
            mediaEl.load()
        }

        return true
    }, [getFallbackUrl, video?.filePath])

    // Handle mpegts.js for .ts files
    useEffect(() => {
        // Clean up existing player
        if (mpegtsPlayerRef.current) {
            try {
                mpegtsPlayerRef.current.unload()
                mpegtsPlayerRef.current.detachMediaElement()
                mpegtsPlayerRef.current.destroy()
            } catch (e) {
                console.error('Error destroying mpegts player:', e)
            }
            mpegtsPlayerRef.current = null
        }

        if (isTs && videoRef.current && videoUrl) {
            // Silence verbose console logs (pts overlaps, frame drops)
            if (mpegts.LoggingControl) {
                mpegts.LoggingControl.enableLog = false
                mpegts.LoggingControl.enableWarn = false
                mpegts.LoggingControl.enableDebug = false
            }

            if (mpegts.isSupported()) {
                const player = mpegts.createPlayer({
                    type: 'mpegts',
                    url: videoUrl,
                    isLive: false,
                }, {
                    enableWorker: true,
                    lazyLoadMaxDuration: 3 * 60, // seconds
                    seekType: 'range',
                })
                player.attachMediaElement(videoRef.current)
                player.load()
                mpegtsPlayerRef.current = player

                player.on(mpegts.Events.ERROR, (type, detail, info) => {
                    // Only treat truly fatal errors as blocking.
                    // Many MediaMSE errors (buffer full, segment overlap) are
                    // transient and playback continues after mpegts.js self-heals.
                    const isFatal = info?.fatal === true
                    if (isFatal) {
                        console.error('mpegts fatal error:', type, detail, info)
                        if (videoUrl.includes('/video-mpegts/') && tryNextPlaybackFallback(`MPEG-TS error: ${type} (${detail})`)) {
                            return
                        }
                        setError(`Playback error: ${type} (${detail})`)
                        setIsLoading(false)
                    } else {
                        // Non-fatal — log once quietly but keep playing
                        console.warn('mpegts recoverable error:', type, detail)
                    }
                })

                if (isPlaying) {
                    player.play().catch(err => console.log('mpegts play error:', err))
                }
            } else {
                if (!tryNextPlaybackFallback('mpegts.js is not supported in this browser.')) {
                    setError('mpegts.js is not supported in this browser.')
                    setIsLoading(false)
                }
            }
        }

        return () => {
            if (mpegtsPlayerRef.current) {
                try {
                    mpegtsPlayerRef.current.unload()
                    mpegtsPlayerRef.current.detachMediaElement()
                    mpegtsPlayerRef.current.destroy()
                } catch (e) {
                    console.error('Error destroying mpegts player:', e)
                }
                mpegtsPlayerRef.current = null
            }
        }
    }, [videoUrl, isTs, tryNextPlaybackFallback])

    /* [DUB FEATURE HIDDEN] — dub audio loading effect disabled
    // Load dub audio when selectedDubLang changes
    useEffect(() => {
        if (selectedDubLang === 'none' || !video?.id) {
            if (dubAudioRef.current) {
                dubAudioRef.current.pause()
                dubAudioRef.current.src = ''
            }
            if (videoRef.current) videoRef.current.muted = false
            return
        }
        if (dubAudioRef.current) {
            dubAudioRef.current.src = `${SERVER_URL}/api/dub/audio/${video.id}?lang=${selectedDubLang}`
            dubAudioRef.current.currentTime = videoRef.current?.currentTime || 0
            dubAudioRef.current.playbackRate = videoRef.current?.playbackRate || 1
            if (videoRef.current) videoRef.current.muted = true
            if (isPlaying) {
                dubAudioRef.current.play().catch(e => console.error('Dub play err:', e))
            }
        }
    }, [selectedDubLang, video?.id])
    */

    // Load video when video prop changes
    useEffect(() => {
        // Reset to 16:9 when switching videos — YouTube/Drive iframes can't report
        // their actual dimensions cross-origin, so 16:9 is the correct safe default.
        // Local file videos will update this via handleLoadedMetadata below.
        onAspectRatioChange?.(16, 9)

        // Reset auto-play countdown if active
        setShowAutoPlayCountdown(false)
        setAutoPlayCountdown(3)
        if (countdownRef.current) {
            clearTimeout(countdownRef.current)
            countdownRef.current = null
        }

        // Clear old video URL immediately to prevent play/pause sync from acting on stale source
        if (videoUrl) {
            releaseVideoUrl(videoUrl)
            setVideoUrl(null)
        }
        setIsPlaying(false)
        setIsLoading(true)
        fallbackAttemptRef.current = 0

        // Store autoplay intent — actual play() deferred to handleLoadedMetadata
        pendingAutoPlayRef.current = !!(video?.id && autoPlay)

        loadVideo()

        if (video?.id && autoPlay) {
            // Keep transition overlay for a bit to cover the load
            const timer = setTimeout(() => setIsTransitioning(false), 600)
            return () => clearTimeout(timer)
        } else {
            setIsTransitioning(false)
        }
        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
            }
        }
    }, [video?.id, autoPlay])

    async function loadVideo() {
        if (!video) {
            setError('No video selected')
            return
        }

        // Check if it's a YouTube video (has youtubeId or URL points to youtube.com/youtu.be)
        const isYouTube = video.youtubeId ||
            (video.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))

        // Handle YouTube videos
        if (isYouTube) {
            const url = video.url || `https://www.youtube.com/watch?v=${video.youtubeId}`
            setVideoUrl(url)
            setIsLoading(true) // Wait for onReady
            setDuration(video.duration || 0) // Try to trust duration if saved

            // Auto-restore last watched position (will be applied when player loads)
            if (video.lastWatchedAt && video.watchProgress > 0 && video.watchProgress < 0.95) {
                setResumePosition(video.watchProgress) // Store percentage for YouTube
            } else {
                setResumePosition(0)
            }
            return
        }

        // Handle Google Drive videos  
        if (video.driveFileId || video.url?.includes('drive.google.com')) {
            const url = video.url || `https://drive.google.com/uc?export=download&id=${video.driveFileId}`
            setVideoUrl(url)
            setIsLoading(true)
            setDuration(video.duration || 0)

            // Auto-restore last watched position
            setResumePosition(resumeTime(video, settings.resumePlayback))
            return
        }

        try {
            setIsLoading(true)
            setError(null)

            // Server mode: use filePath for streaming
            if (video.filePath || video.fileHandle) {
                const url = await getVideoUrl(video.fileHandle || video.filePath)
                fallbackAttemptRef.current = url.includes('/video-compatible/')
                    ? 4
                    : url.includes('/video-transcoded/')
                        ? 3
                        : url.includes('/video-webm/')
                            ? 2
                            : url.includes('/video-mpegts/')
                                ? 1
                                : 0
                setVideoUrl(url)
            } else {
                // No file path available — video needs path repair
                setError('Video file path not found. Please re-import this course or restart the server.')
                setIsLoading(false)
                return
            }

            // Auto-restore last watched position
            setResumePosition(resumeTime(video, settings.resumePlayback))
        } catch (err) {
            console.error('Failed to load video:', err)
            if(err.code==='LOCAL_FILE_ACCESS')onLocalAccessError?.()
            setError('Failed to load video: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }


    // Handle video events
    function handleLoadedMetadata() {
        if (videoRef.current) {
            const detectedDuration = videoRef.current.duration
            setDuration(detectedDuration)
            setIsLoading(false)

            // Report actual video dimensions so the parent can size the container
            // correctly for any aspect ratio (4:3, 21:9, portrait, etc.)
            const vw = videoRef.current.videoWidth
            const vh = videoRef.current.videoHeight
            if (vw > 0 && vh > 0) {
                onAspectRatioChange?.(vw, vh)
            }

            // Persist detected duration if the stored value is 0/missing
            if (video?.id && detectedDuration > 0 && (!video.duration || video.duration < 1)) {
                const roundedDuration = Math.floor(detectedDuration)
                updateVideo(video.id, { duration: roundedDuration }).then(() => {
                    // Recalculate the parent course's total duration
                    if (courseId) {
                        Promise.all([getVideosByCourse(courseId), getCourse(courseId)]).then(([videos, currentCourse]) => {
                            const totalDuration = videos.reduce((sum, v) => {
                                return sum + (v.id === video.id ? roundedDuration : (v.duration || 0))
                            }, 0)
                            const currentCourseTotal = Number(currentCourse?.totalDuration || 0)
                            if (totalDuration > currentCourseTotal) {
                                updateCourse(courseId, { totalDuration })
                            }
                        }).catch(err => console.warn('Failed to update course duration:', err))
                    }
                }).catch(err => console.warn('Failed to persist video duration:', err))
            }

            // Ensure playback speed is applied to new source
            const isYt = video?.youtubeId || video?.url?.startsWith('http')
            if (!isYt) {
                videoRef.current.playbackRate = playbackSpeed
            }

            // Auto-resume from last watched position
            if (resumePosition > 0) {
                videoRef.current.currentTime = resumePosition
            }

            // Fulfill pending autoplay intent now that video is ready
            if (pendingAutoPlayRef.current) {
                pendingAutoPlayRef.current = false
                setIsPlaying(true)
            }
        }
    }

    function handleTimeUpdate() {
        if (videoRef.current) {
            const element = videoRef.current
            if (element.readyState < 1 || element.seeking) return
            localBookmarkRef.current = { id: video.id, time: element.currentTime, duration: element.duration }
            const second=Math.floor(element.currentTime)
            if(bookmarkSecondRef.current!==`${video.id}:${second}`){
                bookmarkSecondRef.current=`${video.id}:${second}`
                writePlaybackBookmark(video.id,element.currentTime,element.duration)
            }
            currentTimeRef.current=element.currentTime
            setCurrentTime(previous=>captionsEnabled || Math.floor(previous)!==second ? element.currentTime : previous)
            onTimeUpdate?.(videoRef.current.currentTime)
            
            /* [DUB FEATURE HIDDEN] — dub audio sync disabled
            // Sync dub audio
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                const diff = Math.abs(videoRef.current.currentTime - dubAudioRef.current.currentTime)
                // If out of sync by more than 300ms, snap dub to video
                if (diff > 0.3) {
                    dubAudioRef.current.currentTime = videoRef.current.currentTime
                }
            }
            */
        }
    }

    // Expose seekTo method via ref
    useImperativeHandle(ref, () => ({
        seekTo: (time) => {
            if (embeddedPlayerRef.current) return embeddedPlayerRef.current.seekTo(time)
            if (videoRef.current) {
                const isYt = video?.youtubeId || video?.url?.includes('youtube.com') || video?.url?.includes('youtu.be')
                if (isYt && videoRef.current.contentWindow) {
                    videoRef.current.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'seekTo',
                        args: [time, true]
                    }), '*')
                } else if (videoRef.current.seekTo) {
                    videoRef.current.seekTo(time)
                } else {
                    videoRef.current.currentTime = time
                }
            }
        },
        getCurrentTime: () => {
            if (embeddedPlayerRef.current) return embeddedPlayerRef.current.getCurrentTime()
            if (videoRef.current?.getCurrentTime) {
                return videoRef.current.getCurrentTime()
            }
            return videoRef.current?.currentTime || 0
        },
        getInternalVideo: () => {
            return embeddedPlayerRef.current?.getInternalVideo() || videoRef.current
        }
    }), [])

    function handlePlay() {
        if (videoRef.current && videoRef.current.paused) return // Ignore if not actually playing
        setIsPlaying(true)
        startProgressTracking()
    }

    function handlePause() {
        if (videoRef.current && !videoRef.current.paused) return // Ignore if not actually paused
        setIsPlaying(false)
        stopProgressTracking()
        saveProgress()
    }

    function handleEnded() {
        setIsPlaying(false)
        stopProgressTracking()

        const currentT = currentTimeRef.current
        const currentD = durationRef.current

        // Mark as complete if threshold reached
        if (currentD > 0) {
            const watchPercentage = (currentT / currentD) * 100
            if (watchPercentage >= settings.autoMarkCompleteAt) {
                markVideoComplete(video.id, true)
                onComplete?.(video.id)
            }
        }

        // Auto-play next if enabled - show countdown
        if (localAutoPlay) {
            setShowAutoPlayCountdown(true)
            setAutoPlayCountdown(3)
        }
    }

    // Auto-play countdown effect
    const countdownRef = useRef(null)
    useEffect(() => {
        if (showAutoPlayCountdown && autoPlayCountdown > 0) {
            countdownRef.current = setTimeout(() => {
                setAutoPlayCountdown(autoPlayCountdown - 1)
            }, 1000)
        } else if (showAutoPlayCountdown && autoPlayCountdown === 0) {
            // Start fade out before switching
            setIsTransitioning(true)
            setTimeout(() => {
                setShowAutoPlayCountdown(false)
                onNext?.()
            }, 300) // Match fade duration
        }

        return () => {
            if (countdownRef.current) {
                clearTimeout(countdownRef.current)
            }
        }
    }, [showAutoPlayCountdown, autoPlayCountdown, onNext])

    function cancelAutoPlay() {
        setShowAutoPlayCountdown(false)
        setAutoPlayCountdown(3)
        if (countdownRef.current) {
            clearTimeout(countdownRef.current)
        }
    }

    function startProgressTracking() {
        if (progressIntervalRef.current) return

        progressIntervalRef.current = setInterval(() => {
            saveProgress()
        }, 5000) // Save every 5 seconds
    }

    function stopProgressTracking() {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
        }
    }

    async function saveProgress() {
        if (!videoRef.current || !video) return
        if (videoRef.current.readyState < 1 || videoRef.current.seeking) return

        try {
            const isEmbedded = video?.youtubeId || video?.driveFileId || 
                (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('drive.google.com')))
            const currentT = isEmbedded ? currentTimeRef.current : videoRef.current.currentTime
            const currentD = isEmbedded ? durationRef.current : videoRef.current.duration

            if (currentT === undefined || currentD === undefined) return
            writePlaybackBookmark(video.id, currentT, currentD)

            await updateVideoProgress(
                video.id,
                currentT,
                currentD
            )

            // Check if should auto-complete
            if (currentD > 0) {
                const watchPercentage = (currentT / currentD) * 100
                if (watchPercentage >= settings.autoMarkCompleteAt && !video.isCompleted) {
                    await markVideoComplete(video.id, true)
                    onComplete?.(video.id)
                }
            }
        } catch (err) {
            console.error('Failed to save progress:', err)
        }
    }

    // Controls
    function togglePlay() {
        const isYt = video?.youtubeId || video?.url?.startsWith('http')

        if (isYt) {
            setIsPlaying(prev => !prev)
            return
        }

        if (videoRef.current) {
            setIsPlaying(prev => !prev)
        }
    }

    function handleSeek(e) {
        if (!progressRef.current || !videoRef.current) return

        const rect = progressRef.current.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        const newTime = percent * duration

        const isYt = video?.youtubeId || video?.url?.startsWith('http')

        if (isYt) {
            videoRef.current.seekTo(newTime)
        } else {
            videoRef.current.currentTime = newTime
        }
        setCurrentTime(newTime)
    }

    function handleVolumeChange(e) {
        const newVolume = parseFloat(e.target.value)
        setVolume(newVolume)
        setIsMuted(newVolume === 0)

        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (videoRef.current && !isYt) {
            videoRef.current.volume = newVolume
        }
        updateSettings({ volume: newVolume })
    }

    function toggleMute() {
        if (!videoRef.current) return
        videoRef.current.muted = !videoRef.current.muted
        setIsMuted(videoRef.current.muted)
    }

    function toggleFullscreen() {
        if (!containerRef.current) return

        if (document.fullscreenElement) {
            document.exitFullscreen()
            setIsFullscreen(false)
        } else {
            containerRef.current.requestFullscreen()
            setIsFullscreen(true)
        }
    }

    function changeSpeed(speed) {
        setPlaybackSpeed(speed)
        updateSettings({ playbackSpeed: speed })
        
        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (videoRef.current && !isYt) {
            videoRef.current.playbackRate = speed
        }
        setShowSpeedMenu(false)
    }

    async function togglePiP() {
        if (!videoRef.current) return

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture()
                setIsPiP(false)
            } else {
                await videoRef.current.requestPictureInPicture()
                setIsPiP(true)
            }
        } catch (err) {
            console.error('PiP error:', err)
        }
    }

    // PiP event listeners to track state
    useEffect(() => {
        const videoEl = videoRef.current
        if (!videoEl) return

        function handleEnterPiP() { setIsPiP(true) }
        function handleLeavePiP() { setIsPiP(false) }

        videoEl.addEventListener('enterpictureinpicture', handleEnterPiP)
        videoEl.addEventListener('leavepictureinpicture', handleLeavePiP)

        return () => {
            videoEl.removeEventListener('enterpictureinpicture', handleEnterPiP)
            videoEl.removeEventListener('leavepictureinpicture', handleLeavePiP)
        }
    }, [videoUrl])

    // Keyboard shortcuts
    useEffect(() => {
        // Embedded players and the native Drive player provide their own controls.
        if (video?.youtubeId || video?.driveFileId || /youtu(?:be\.com|\.be)|drive\.google\.com/.test(video?.url || '')) return
        function handleKeyDown(e) {
            if (e.target.closest?.('[role="dialog"], [role="alertdialog"]')) return
            if (e.target.closest?.('select, [role="textbox"]')) return
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
            if (!settings.keyboardShortcuts) return
            // Don't intercept browser shortcuts (Ctrl+F, Ctrl+C, Cmd+A, Alt+…, etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) return

            const currentTime=videoRef.current?.currentTime || 0
            const duration=videoRef.current?.duration || durationRef.current
            const key = e.key.toLowerCase()
            const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

            // Handle number keys 0-9 for percentage jump
            if (!e.shiftKey && !e.ctrlKey && key >= '0' && key <= '9') {
                e.preventDefault()
                const percent = parseInt(key) * 10
                if (videoRef.current && duration) {
                    videoRef.current.currentTime = (percent / 100) * duration
                }
                return
            }

            switch (key) {
                case ' ':
                case 'k':
                    e.preventDefault()
                    togglePlay()
                    break
                case 'arrowleft':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, currentTime - 5)
                    }
                    break
                case 'arrowright':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(duration, currentTime + 5)
                    }
                    break
                case 'j':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, currentTime - 10)
                    }
                    break
                case 'l':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(duration, currentTime + 10)
                    }
                    break
                case 'arrowup':
                    e.preventDefault()
                    setVolume(v => Math.min(1, (videoRef.current?.volume ?? v) + 0.05))
                    break
                case 'arrowdown':
                    e.preventDefault()
                    setVolume(v => Math.max(0, (videoRef.current?.volume ?? v) - 0.05))
                    break
                case 'm':
                    e.preventDefault()
                    toggleMute()
                    break
                case 'f':
                    e.preventDefault()
                    toggleFullscreen()
                    break
                case 'p':
                    e.preventDefault()
                    if (e.shiftKey) onPrevious?.()
                    else togglePiP()
                    break
                case ',':
                    if (!videoRef.current?.paused) break
                    e.preventDefault()
                    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1 / 30)
                    break
                case '<':
                    e.preventDefault()
                    // Decrease speed
                    const currentIdx = speedOptions.indexOf(videoRef.current?.playbackRate ?? playbackSpeed)
                    if (currentIdx > 0) {
                        changeSpeed(speedOptions[currentIdx - 1])
                    }
                    break
                case '.':
                    if (!videoRef.current?.paused) break
                    e.preventDefault()
                    videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 1 / 30)
                    break
                case '>':
                    e.preventDefault()
                    // Increase speed
                    const currentSpeedIdx = speedOptions.indexOf(videoRef.current?.playbackRate ?? playbackSpeed)
                    if (currentSpeedIdx < speedOptions.length - 1) {
                        changeSpeed(speedOptions[currentSpeedIdx + 1])
                    }
                    break
                case 'n':
                    if (e.shiftKey) {
                        e.preventDefault()
                        onNext?.()
                    }
                    break
                case 'a':
                    e.preventDefault()
                    setLocalAutoPlay(prev => !prev)
                    break
                case 'c':
                    e.preventDefault()
                    setCaptionsEnabled(prev => !prev)
                    break
                case 'escape':
                    e.preventDefault()
                    setShowSpeedMenu(false)
                    setShowCCMenu(false)
                    setShowSettingsMenu(false)
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [settings.keyboardShortcuts, video?.id])

    // Auto-hide controls
    const hasOpenMenu = showSettingsMenu || showCCMenu || showSpeedMenu || showAudioMenu

    useEffect(() => {
        function handleMouseMove() {
            setShowControls(true)

            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }

            if (!hasOpenMenu) {
                controlsTimeoutRef.current = setTimeout(() => {
                    setShowControls(false)
                }, 2000)
            }
        }

        function handleMouseLeave() {
            // If a menu is open, KEEP controls and menu visible
            if (hasOpenMenu) return
            
            // Otherwise hide instantly like before
            setShowControls(false)
        }

        const container = containerRef.current
        if (container) {
            container.addEventListener('mousemove', handleMouseMove)
            container.addEventListener('mouseleave', handleMouseLeave)
            container.addEventListener('touchstart', handleMouseMove)
            handleMouseMove()
        }

        return () => {
            if (container) {
                container.removeEventListener('mousemove', handleMouseMove)
                container.removeEventListener('mouseleave', handleMouseLeave)
                container.removeEventListener('touchstart', handleMouseMove)
            }
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }
        }
    }, [isPlaying, hasOpenMenu])

    // Close menu on outside click
    useEffect(() => {
        function handleOutsideClick(e) {
            if (!hasOpenMenu) return

            // Check if click was inside any menu or menu trigger
            if (e.target.closest('.tut-in-menu-container') || e.target.closest('.tut-in-menu-trigger')) {
                return
            }

            // Close all menus
            setShowSettingsMenu(false)
            setShowCCMenu(false)
            setShowSpeedMenu(false)
            setShowAudioMenu(false)

            // If cursor is NOT on the player viewport (e.g. they clicked outside the player),
            // hide the controls too.
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowControls(false)
            }
        }

        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [hasOpenMenu])

    // Update volume when it changes
    useEffect(() => {
        if (videoRef.current) {
            /* [DUB FEATURE HIDDEN] — simplified volume logic (no dub branch)
            if (selectedDubLang !== 'none') {
                videoRef.current.muted = true
                if (dubAudioRef.current) {
                    dubAudioRef.current.volume = isMuted ? 0 : volume
                }
            } else { */
                videoRef.current.muted = isMuted
                videoRef.current.volume = volume
            /* } */
        }
    }, [volume, isMuted])

    useEffect(() => {
        const media = videoRef.current
        if (!media) return
        const syncVolume = () => { setVolume(media.volume); setIsMuted(media.muted) }
        const syncRate = () => setPlaybackSpeed(media.playbackRate)
        media.addEventListener('volumechange', syncVolume)
        media.addEventListener('ratechange', syncRate)
        return () => { media.removeEventListener('volumechange', syncVolume); media.removeEventListener('ratechange', syncRate) }
    }, [videoUrl])

    // Sync internal video state with props/state
    useEffect(() => {
        if (!videoRef.current || !videoUrl) return
        
        // Skip for YouTube/Drive (they handle autoplay via URL params)
        const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
        const isDrive = video?.driveFileId || video?.url?.includes('drive.google.com')
        if (isYt || isDrive) return

        if (isPlaying) {
            const playPromise = videoRef.current.play()
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.log('Auto-play was prevented:', error)
                        setIsPlaying(false)
                    }
                })
            }
            /* [DUB FEATURE HIDDEN]
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                dubAudioRef.current.play().catch(e => console.error("Dub play err:", e))
            }
            */
        } else {
            videoRef.current.pause()
            // [DUB FEATURE HIDDEN] if (dubAudioRef.current) dubAudioRef.current.pause()
        }
    }, [isPlaying, videoUrl])

    // Sync playback speed with video element
    useEffect(() => {
        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (!isYt) {
            const rate = playbackSpeed
            if (videoRef.current) videoRef.current.playbackRate = rate
            // [DUB FEATURE HIDDEN] if (dubAudioRef.current) dubAudioRef.current.playbackRate = rate
        }
    }, [playbackSpeed, videoUrl])

    // Fetch caption languages
    useEffect(() => {
        if (!video?.id) return
        
        // Skip for external links for now
        if (video.youtubeId || video.url?.startsWith('http')) return
        if (!showCCMenu && !captionsEnabled) return

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`)
            .then(res => res.json())
            .then(data => setCaptionLanguages(data))
            .catch(err => console.error('Failed to fetch caption languages:', err))
            
        /* [DUB FEATURE HIDDEN] — dub language fetch disabled
        // Fetch dub languages
        fetch(`${SERVER_URL}/api/dub/video/${video.id}/languages`)
            .then(res => res.json())
            .then(data => setDubLanguages(data || []))
            .catch(err => console.error('Failed to fetch dub languages:', err))
        */
            
    }, [video?.id, showCCMenu, captionsEnabled]) // Re-fetch when captions become relevant

    // Sync selected language with settings
    useEffect(() => {
        if (settings.captionLanguage && settings.captionLanguage !== selectedCaptionLang) {
            setSelectedCaptionLang(settings.captionLanguage)
            setCaptionsEnabled(true)
        }
    }, [settings.captionLanguage])

    // Fetch caption chunks
    useEffect(() => {
        if (!video?.id) return
        
        // Skip for external links
        if (video.youtubeId || video.url?.startsWith('http')) return

        if (!captionsEnabled) return

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/chunks?lang=${selectedCaptionLang}`)
            .then(res => {
                if (!res.ok) {
                    console.warn(`Caption chunks fetch failed: ${res.status} ${res.statusText}`)
                    return []
                }
                return res.json()
            })
            .then(data => setCaptionChunks(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to fetch caption chunks:', err))
            
        updateSettings({ captionLanguage: selectedCaptionLang })
    }, [video?.id, selectedCaptionLang, captionsEnabled])

    // Handle caption upload
    const fileInputRef = useRef(null)
    function handleUploadCaptions(e) {
        const file = e.target.files?.[0]
        if (!file || !video?.id) return

        const formData = new FormData()
        formData.append('file', file)

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/upload`, {
            method: 'POST',
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setSelectedCaptionLang(data.language)
                    setCaptionsEnabled(true)
                    setShowCCMenu(false)
                }
            })
            .catch(err => console.error('Failed to upload captions:', err))
    }

    function toggleCaptions() {
        setCaptionsEnabled(prev => !prev)
    }

    // Whether the control bar is currently visible
    const controlsVisible = showControls

    function handleVideoClick() { togglePlay() }

    // YouTube and Google Drive videos are embedded in cross-origin iframes
    // whose play/pause/seek/volume can't be controlled from outside.
    // We still show TutIn's prev/next, fullscreen, settings, and captions controls.
    const isEmbeddedPlayer = !!(video?.youtubeId || video?.driveFileId ||
        (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('drive.google.com'))))

    useEffect(() => {
        const flush = () => {
            const saved = localBookmarkRef.current
            if (saved?.id !== video?.id) return
            writePlaybackBookmark(saved.id, saved.time, saved.duration)
            updateVideoProgress(saved.id, saved.time, saved.duration).catch(console.error)
        }
        const hidden = () => { if (document.visibilityState === 'hidden') flush() }
        window.addEventListener('pagehide', flush)
        document.addEventListener('visibilitychange', hidden)
        return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden) }
    }, [video?.id])

    if (isEmbeddedPlayer) return <ResumableEmbedPlayer key={video.id} ref={embeddedPlayerRef} video={video} settings={settings} autoPlay={autoPlay} onTimeUpdate={onTimeUpdate} onComplete={onComplete} onNext={onNext} onAspectRatioChange={onAspectRatioChange} />

    return (
        <div
            ref={containerRef}
            className="video-container relative group w-full h-full bg-transparent"
            style={{ backgroundColor: 'transparent' }}
        >
            {/* YouTube iframe */}
            {(video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))) ? (
                <div className="w-full h-full relative z-10">
                    {/* YouTube Embed using native iframe with YouTube's built-in controls */}
                    <iframe
                        ref={videoRef}
                        src={`https://www.youtube.com/embed/${video.youtubeId || videoUrl?.match(/[?&]v=([^&]+)/)?.[1] || videoUrl?.match(/youtu\.be\/([^?]+)/)?.[1]}?enablejsapi=1&controls=1&modestbranding=1&rel=0&origin=${window.location.origin}&autoplay=${autoPlay ? 1 : 0}&mute=0`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        onLoad={() => {
                            console.log('YouTube iframe loaded')
                            setIsLoading(false)
                            setError(null)
                            // Record in watch history — YouTube iframes can't fire
                            // native play/pause events so saveProgress() never runs.
                            // We record a minimal progress entry so last_watched_at is set.
                            if (video?.id) {
                                updateVideoProgress(video.id, 0, video.duration || 0)
                            }
                        }}
                        onError={(e) => {
                            console.error('YouTube iframe error:', e)
                            setError("Failed to load YouTube video.")
                            setIsLoading(false)
                        }}
                    />
                </div>
            ) : (video?.driveFileId || video?.url?.includes('drive.google.com')) ? (
                <div className="w-full h-full relative z-10">
                    {/* Google Drive Embed using native iframe with Drive's built-in player */}
                    <iframe
                        ref={videoRef}
                        src={`https://drive.google.com/file/d/${video.driveFileId || video.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]}/preview${autoPlay ? '?autoplay=1' : ''}`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        onLoad={() => {
                            console.log('Google Drive iframe loaded')
                            setIsLoading(false)
                            setError(null)
                            // Record in watch history — Drive iframes can't fire
                            // native play/pause events so saveProgress() never runs.
                            if (video?.id) {
                                updateVideoProgress(video.id, 0, video.duration || 0)
                            }
                        }}
                        onError={(e) => {
                            console.error('Google Drive iframe error:', e)
                            setError("Failed to load Google Drive video. Make sure the file is shared publicly.")
                            setIsLoading(false)
                        }}
                    />
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={isTs ? undefined : videoUrl}
                    className="w-full h-full bg-transparent"
                    style={{ backgroundColor: 'transparent' }}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnded={handleEnded}
                    onClick={handleVideoClick}
                    onError={(e) => {
                        // For .ts files, mpegts.js manages playback via MSE —
                        // the native <video> error is expected and should be ignored.
                        if (isTs) return

                        const videoError = e.target.error
                        let errorMessage = 'Failed to load video.'
                        if (videoError) {
                            switch (videoError.code) {
                                case 1: // MEDIA_ERR_ABORTED
                                    errorMessage = 'Video loading was aborted.'
                                    break
                                case 2: // MEDIA_ERR_NETWORK
                                    errorMessage = 'Network error while loading video. Please check your connection.'
                                    break
                                case 3: // MEDIA_ERR_DECODE
                                    errorMessage = 'Video codec not supported. Try converting to MP4 (H.264) format using HandBrake or FFmpeg.'
                                    break
                                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                                    errorMessage = 'Video format not supported. Try converting to MP4 (H.264) or WebM format.'
                                    break
                                default:
                                    errorMessage = 'Unknown video error occurred.'
                            }
                        }

                        if (tryNextPlaybackFallback(errorMessage, e.currentTarget)) {
                            return
                        }

                        setError(`${errorMessage} TutIn tried MPEG-TS, WebM, and MP4 fallbacks; this file may need a cached compatible copy to finish generating.`)
                        setIsLoading(false)
                    }}
                >
                </video>
            )}

            {/* Error Overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-center p-4">
                    <div>
                        <p className="mb-4">{error}</p>
                        <button
                            onClick={loadVideo}
                            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors border border-white/10"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Caption Overlay — hidden for YouTube/Drive embeds (they handle captions internally) */}
            {!isEmbeddedPlayer && (
            <CaptionOverlay
                chunks={captionChunks}
                currentTime={currentTime}
                enabled={captionsEnabled}
                position={captionPosition}
                onPositionChange={(pos) => {
                    setCaptionPosition(pos)
                    updateSettings({ captionPosition: pos })
                }}
                fontSize={settings.captionFontSize}
                showBackground={settings.captionBackground}
                controlsVisible={controlsVisible}
            />
            )}

            {!isEmbeddedPlayer && !error && <StreamPlayerControls mediaRef={videoRef} containerRef={containerRef} />}
            {/* Auto-play Countdown Overlay */}
            {showAutoPlayCountdown && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-40">
                    <div className="text-center text-white">
                        <p className="text-lg mb-2">Next video in</p>
                        {/* Circular Countdown with "Trim Path" animation */}
                        <div className="relative w-24 h-24 mb-6 mx-auto flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                                <circle
                                    cx="48"
                                    cy="48"
                                    r="42"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                    className="text-white/10"
                                />
                                <circle
                                    cx="48"
                                    cy="48"
                                    r="42"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeDasharray="263.89"
                                    strokeDashoffset="0"
                                    strokeLinecap="round"
                                    className="text-[var(--primary-fg)] animate-countdown-fill"
                                />
                            </svg>
                            <div className="absolute text-4xl font-bold tabular-nums animate-pulse">
                                {autoPlayCountdown}
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-4 mx-auto">
                            <button
                                onClick={cancelAutoPlay}
                                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <X className="w-4 h-4" />
                                Stop
                            </button>
                            <button
                                onClick={() => {
                                    setShowAutoPlayCountdown(false)
                                    onNext?.()
                                }}
                                className="px-4 py-2 bg-[var(--primary-fg)] text-black font-semibold hover:brightness-110 rounded-lg transition-colors flex items-center gap-2 shadow-md"
                            >
                                <SkipForward className="w-4 h-4" />
                                Play Next
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
            {/* Video Switch Transition Overlay */}
            <div
                className={`absolute inset-0 bg-black z-[60] transition-opacity duration-500 pointer-events-none ${isTransitioning ? 'opacity-100' : 'opacity-0'}`}
            />

             {/* PiP Active Indicator */}
            {isPiP && (
                <div className="absolute top-4 left-4 px-3 py-1.5 bg-primary text-white text-sm rounded-lg z-30 flex items-center gap-2">
                    <PictureInPicture className="w-4 h-4" />
                    Picture-in-Picture Active
                </div>
            )}

            <TranslateModal
                isOpen={showTranslateModal}
                onClose={() => setShowTranslateModal(false)}
                video={video}
                chunkCount={captionChunks.length}
                onSuccess={(lang) => {
                    // Update state to select new language and force refresh
                    setSelectedCaptionLang(lang)
                    setCaptionsEnabled(true)
                    // The effect will trigger a fetch for the new chunks
                }}
            />

            {/* [DUB FEATURE HIDDEN] — DubModal and dub audio element hidden
            <DubModal
                isOpen={showDubModal}
                onClose={() => setShowDubModal(false)}
                video={video}
                onSuccess={(lang) => {
                    setDubLanguages(prev => [...new Set([...prev, lang])])
                    setSelectedDubLang(lang)
                }}
            />

            // Hidden audio element for dubbed audio playback
            <audio ref={dubAudioRef} preload="auto" />
            */}
        </div>
    )
})

export default VideoPlayer
