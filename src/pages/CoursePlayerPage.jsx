import usePlaybackMeasurement from '../hooks/usePlaybackMeasurement'
import { subscribeLibraryChanges } from '../utils/libraryChanges'
import { applyVideoDurations } from '../utils/moduleMetadata'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Menu } from 'lucide-react'
import { getCourse, getCourseContent, getVideosByCourse, getInstructorAvatarAsync, buildModuleTree } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import VideoPlayer from '../components/player/CourseVideoPlayer'
import { createPlaybackClock } from '../utils/playbackClock'
import { IS_BROWSER_MODE } from '../utils/api'
import { resumeTime } from '../utils/playbackBookmarks'
import PlaylistSidebar from '../components/player/PlaylistSidebar'
import { playlistDisplay } from '../utils/playlistDisplay'
import { scanVideoMetadata } from '../utils/videoMetadata'
function findModulePath(modules, targetModuleId) {
    if (!modules || !targetModuleId) return []

    for (const mod of modules) {
        if (mod.id === targetModuleId || mod.videos?.some(video => video.moduleId === targetModuleId)) {
            return [mod]
        }
        if (mod.subModules && mod.subModules.length > 0) {
            const path = findModulePath(mod.subModules, targetModuleId)
            if (path.length > 0) {
                return [mod, ...path]
            }
        }
    }
    return []
}

/**
 * Flatten all videos from a nested module tree into a single ordered list.
 */
function getAllVideosFlat(mods) {
    const list = []
    for (const mod of mods) {
        list.push(...(mod.videos || []))
        if (mod.subModules?.length > 0) {
            list.push(...getAllVideosFlat(mod.subModules))
        }
    }
    return list
}

function buildModulesWithVideos(modulesData, videosData) {
    const videosByModule = new Map()

    for (const video of videosData) {
        if (!videosByModule.has(video.moduleId)) {
            videosByModule.set(video.moduleId, [])
        }
        videosByModule.get(video.moduleId).push(video)
    }

    return modulesData.map(module => ({
        ...module,
        videos: videosByModule.get(module.id) || [],
    }))
}

async function fetchCourseContent(courseId) {
    const content = await getCourseContent(courseId)
    const modulesWithVideos = buildModulesWithVideos(content.modules || [], content.videos || [])
    return {
        course: content.course,
        flat: modulesWithVideos,
        tree: buildModuleTree(modulesWithVideos),
    }
}

function CoursePlayerPage() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const { settings } = useSettings()
    const [course, setCourse] = useState(null)
    const [modules, setModules] = useState([])
    const [currentVideo, setCurrentVideo] = useState(null)
    const [autoPlay, setAutoPlay] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [contentLoading,setContentLoading]=useState(true),[contentError,setContentError]=useState('')
    const [metadataVideos,setMetadataVideos]=useState([]),[metadataStatus,setMetadataStatus]=useState({total:0,done:0,failed:0})
    const loadEpoch=useRef(0),metadataDurations=useRef(new Map())
    const activeVideoRef=useRef(null)
    activeVideoRef.current=currentVideo
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1024)
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarPanelWidth')
        return saved ? Math.max(280, Math.min(600, parseInt(saved, 10))) : 360
    })
    const playbackClock = useMemo(() => createPlaybackClock(), [courseId])
    const handlePlaybackTime = playbackClock.update
    useEffect(() => {
        if (currentVideo) playbackClock.update(resumeTime(currentVideo, settings.resumePlayback))
    }, [playbackClock, currentVideo?.id, settings.resumePlayback])
    const playlistRefreshRef = useRef(null)
    playlistRefreshRef.current = refreshModulesOnly
    const handlePlaylistRefresh = useCallback(() => playlistRefreshRef.current?.(), [])
    const [instructorAvatar, setInstructorAvatar] = useState(null)
    const videoRef = useRef(null)
    usePlaybackMeasurement(videoRef,currentVideo?.id)

    // ── Adaptive player sizing (YouTube-style JS-driven height) ──────────────
    // videoAspect: actual pixel dimensions reported by VideoPlayer after load.
    // Falls back to 16:9 (correct for YouTube/Drive iframes, which can't be
    // read cross-origin; local file videos report their real ratio).
    const [videoAspect, setVideoAspect] = useState({ w: 16, h: 9 })
    // playerWrapperEl: callback ref — needed because the wrapper is conditionally
    // rendered (only when currentVideo exists), so a regular useRef would miss mount.
    const [playerWrapperEl, setPlayerWrapperEl] = useState(null)
    const [playerWrapperWidth, setPlayerWrapperWidth] = useState(0)
    const [windowHeight, setWindowHeight] = useState(window.innerHeight)

    // Keep sidebar width in sync so primary column can compute padding-right
    const handleSidebarWidthChange = useCallback((w) => setSidebarWidth(w), [])

    // ResizeObserver on the player wrapper — fires automatically when:
    //  • sidebar opens / closes  (paddingRight on primary column changes)
    //  • user drags sidebar resize handle
    //  • browser window is resized
    useEffect(() => {
        if (!playerWrapperEl) return
        const ro = new ResizeObserver(entries => {
            if (entries[0]) setPlayerWrapperWidth(entries[0].contentRect.width)
        })
        ro.observe(playerWrapperEl)
        return () => ro.disconnect()
    }, [playerWrapperEl])

    // Track window height for the viewport-height cap on the player
    useEffect(() => {
        const handler = () => setWindowHeight(window.innerHeight)
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [])

    // Compute player height exactly like YouTube:
    //   height = wrapperWidth × (videoHeight / videoWidth),  capped at (100vh − 136px)
    // Falls back to a 16:9 estimate based on the current viewport if not yet measured.
    const playerHeight = useMemo(() => {
        const w = playerWrapperWidth > 0
            ? playerWrapperWidth
            : Math.max(0, window.innerWidth - (sidebarCollapsed ? 32 : sidebarWidth + 32))
        const natural = Math.round(w * videoAspect.h / videoAspect.w)
        return Math.min(natural, windowHeight - 136)
    }, [playerWrapperWidth, windowHeight, videoAspect, sidebarCollapsed, sidebarWidth])


    useEffect(()=>subscribeLibraryChanges(detail=>{if(!detail?.courseId||detail.courseId===courseId)playlistRefreshRef.current?.()}),[courseId])

    // Load course data (reload when progress calculation mode changes)
    useEffect(() => {
        loadCourseData()
        return () => { loadEpoch.current++ }
    }, [courseId])

    // Refresh only course progress when calculation mode changes (don't interrupt video)
    const prevProgressModeRef = useRef(settings.progressCalculationMode)
    useEffect(() => {
        // Skip on initial mount, only respond to actual changes
        if (prevProgressModeRef.current !== settings.progressCalculationMode) {
            prevProgressModeRef.current = settings.progressCalculationMode
            // Recalculation is already awaited by SettingsModal before this state changes
            refreshCourseProgressOnly()
        }
    }, [settings.progressCalculationMode])

    // Lightweight refresh - only updates course progress without affecting video
    async function refreshCourseProgressOnly() {
        try {
            const courseData = await getCourse(courseId)
            if (courseData) {
                setCourse(courseData)
            }
        } catch (err) {
            console.error('Failed to refresh course progress:', err)
        }
    }

    // Update document title when course loads; reset on unmount
    useEffect(() => {
        if (course?.title) {
            document.title = course.title
        }
        return () => {
            document.title = 'TutIn'
        }
    }, [course?.title])

    // Load instructor avatar
    useEffect(() => {
        if (course?.instructor) {
            getInstructorAvatarAsync(course.instructor).then(avatar => {
                setInstructorAvatar(avatar)
            })
        }
    }, [course?.instructor])

    async function loadCourseData() {
        const epoch=++loadEpoch.current
        const valid=()=>loadEpoch.current===epoch
        setIsLoading(true);setError(null);setContentLoading(true);setContentError('')
        setCurrentVideo(null);setModules([]);setCourse(null);setMetadataVideos([]);metadataDurations.current.clear()
        function chooseVideo(videos) {
            const recent=[...videos].filter(video=>video.lastWatchedAt).sort((a,b)=>new Date(b.lastWatchedAt)-new Date(a.lastWatchedAt))[0]
            const selected=recent&&!recent.isCompleted?recent:videos.find(video=>!video.isCompleted)||videos[0]
            if(selected)setCurrentVideo(previous=>previous||selected)
            setAutoPlay(false)
        }
        // The selected lesson does not wait for the sidebar's module tree.
        getVideosByCourse(courseId).then(videos=>{
            if(!valid())return
            chooseVideo(videos);setMetadataVideos(videos);setIsLoading(false)
        }).catch(err=>{if(valid()){setError('Could not load lessons: '+err.message);setIsLoading(false)}})
        getCourse(courseId).then(data=>{if(valid())setCourse(data)}).catch(console.error)
        fetchCourseContent(courseId).then(({course: data,flat,tree})=>{
            if(!valid())return
            function mergeMetadata(modules){return modules.map(module=>({...module,videos:module.videos.map(video=>metadataDurations.current.has(video.id)?{...video,duration:metadataDurations.current.get(video.id)}:video),subModules:mergeMetadata(module.subModules||[])}))}
            setCourse(data);setModules(mergeMetadata(tree));setContentError('')
            const videos=flat.flatMap(module=>module.videos||[])
            chooseVideo(videos);setMetadataVideos(previous=>previous.length?previous:videos);setIsLoading(false);setError(null)
        }).catch(err=>{if(valid())setContentError('Could not load course content: '+err.message)})
          .finally(()=>{if(valid())setContentLoading(false)})
    }
    useEffect(()=>{
        if(!metadataVideos.length)return
        const controller=new AbortController()
        const pending=new Map()
        let timer
        function flush(){
            clearTimeout(timer);timer=null
            if(controller.signal.aborted || !pending.size)return
            const updates=new Map(pending);pending.clear()
            setModules(tree=>applyVideoDurations(tree,updates))
            setCurrentVideo(previous=>previous&&updates.has(previous.id)&&previous.duration!==updates.get(previous.id)?{...previous,duration:updates.get(previous.id)}:previous)
        }
        scanVideoMetadata(metadataVideos.filter(video=>video.id!==activeVideoRef.current?.id && !metadataDurations.current.has(video.id)),controller.signal,(id,duration)=>{
            metadataDurations.current.set(id,duration)
            pending.set(id,duration)
            if(!timer)timer=setTimeout(flush,100)
        },setMetadataStatus).then(flush)
        return()=>{controller.abort();clearTimeout(timer)}
    },[metadataVideos])

    const handleVideoSelect = useCallback((video) => {
        setAutoPlay(true) // Autoplay when manually selecting from playlist
        setCurrentVideo(video)
    }, [])

    // Lightweight refresh - only updates modules/videos data without reloading video player
    async function refreshModulesOnly() {
        setContentLoading(true);setContentError('')
        try {
            const { course: courseData, flat: modulesWithVideos, tree: moduleTree } = await fetchCourseContent(courseId)
            setModules(moduleTree)

            if (courseData) {
                setCourse(courseData)
            }

            // Update currentVideo with fresh data if it exists
            if (currentVideo) {
                for (const module of modulesWithVideos) {
                    const updatedVideo = module.videos.find(v => v.id === currentVideo.id)
                    if (updatedVideo) {
                        setCurrentVideo(updatedVideo)
                        break
                    }
                }
            }
        } catch (err) {
            console.error('Failed to refresh modules:', err)
            setContentError('Could not load course content: '+err.message)
        } finally { setContentLoading(false) }
    }

    // Refresh only the current video's data (used after AI transcription)
    async function refreshCurrentVideoOnly() {
        if (!currentVideo) return
        try {
            const { getVideo } = await import('../utils/db')
            const updatedVideo = await getVideo(currentVideo.id)
            if (updatedVideo) {
                setCurrentVideo(prev => ({ ...prev, ...updatedVideo }))
            }
        } catch (err) {
            console.error('Failed to refresh video data:', err)
        }
    }

    // Auto-fetch YouTube transcripts
    useEffect(() => {
        if (IS_BROWSER_MODE) return
        if (!currentVideo) return
        const isYouTube = currentVideo.youtubeId ||
            (currentVideo.url && (currentVideo.url.includes('youtube.com') || currentVideo.url.includes('youtu.be')))

        if (isYouTube && !currentVideo.hasTranscript) {
            const videoIdOrUrl = currentVideo.youtubeId || currentVideo.url
            import('../utils/api').then(({ fetchYoutubeTranscript, put }) => {
                fetchYoutubeTranscript(videoIdOrUrl)
                    .then(async (data) => {
                        if (data.chunks && data.chunks.length > 0) {
                            await put(`/api/transcripts/${currentVideo.id}`, { chunks: data.chunks })
                            refreshCurrentVideoOnly()
                        }
                    })
                    .catch(err => console.log('Notice: Could not auto-fetch YouTube transcript:', err.message))
            })
        }
    }, [currentVideo?.id, currentVideo?.hasTranscript])

    function handleVideoComplete(videoId) {
        // Lightweight refresh - only updates sidebar, doesn't reload video player
        refreshModulesOnly()
    }

    function handleNextVideo() {
        if (!currentVideo || modules.length === 0) return

        const allVideos = getAllVideosFlat(modules)
        const currentIndex = allVideos.findIndex(v => v.id === currentVideo.id)

        if (currentIndex !== -1 && currentIndex < allVideos.length - 1) {
            setAutoPlay(true)
            setCurrentVideo(allVideos[currentIndex + 1])
        }
    }

    function handlePreviousVideo() {
        if (!currentVideo || modules.length === 0) return

        const allVideos = getAllVideosFlat(modules)
        const currentIndex = allVideos.findIndex(v => v.id === currentVideo.id)

        if (currentIndex > 0) {
            setAutoPlay(true)
            setCurrentVideo(allVideos[currentIndex - 1])
        }
    }


    return (
        <div className="-mx-4 -my-6 relative overflow-hidden">
            {/* Main Content */}
            <div className="course-layout relative z-10 flex h-[calc(100vh-64px)]">
                {/* Video Player Area — padding-right tracks sidebar width exactly */}
                <div
                    className="course-video-area flex-1 flex flex-col overflow-y-auto min-w-0"
                    style={{
                        paddingRight: sidebarCollapsed ? 0 : sidebarWidth,
                        transition: 'padding-right 0.3s ease'
                    }}
                >
                    {currentVideo ? (
                        <>
                            {/* Player wrapper */}
                            <div
                                ref={setPlayerWrapperEl}
                                className="course-video-frame bg-transparent relative sticky top-0 z-20 mx-4 mt-4 rounded-xl overflow-hidden"
                                style={{ height: playerHeight }}
                            >
                                <div className="relative z-10 w-full h-full">
                                    <VideoPlayer
                                        ref={videoRef}
                                        video={currentVideo}
                                        courseId={courseId}
                                        onComplete={handleVideoComplete}
                                        onNext={handleNextVideo}
                                        onPrevious={handlePreviousVideo}
                                        autoPlay={autoPlay}
                                        onTimeUpdate={handlePlaybackTime}
                                        onAspectRatioChange={(w, h) => setVideoAspect({ w, h })}
                                    />
                                </div>
                            </div>

                            {/* Video Info Section */}
                            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                                <div>
                                    {course?.title && (
                                        <div className="flex items-center flex-wrap gap-1.5 text-xs font-semibold text-primary-fg dark:text-neutral-400 uppercase tracking-wider mb-2 select-none">
                                            <span className="truncate max-w-[200px] sm:max-w-[300px]" title={course.title}>
                                                {course.title}
                                            </span>
                                            {findModulePath(playlistDisplay(modules), currentVideo.moduleId).map(mod => (
                                                <span key={mod.id} className="flex items-center gap-1.5">
                                                    <span className="text-light-text-secondary dark:text-dark-text-secondary font-normal">/</span>
                                                    <span
                                                        className="text-light-text-secondary dark:text-dark-text-secondary font-medium truncate max-w-[150px] sm:max-w-[250px]"
                                                        title={mod.title}
                                                    >
                                                        {mod.title}
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <h2 className="text-lg sm:text-2xl font-bold mb-2">{currentVideo.title}</h2>
                                </div>

                                <div className="pt-6 border-t border-light-border dark:border-dark-border">
                                    <div
                                        className="inline-flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => course?.instructor && navigate(`/instructors?filter=${encodeURIComponent(course.instructor)}`)}
                                        title={course?.instructor ? `View ${course.instructor}'s profile` : ''}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {instructorAvatar ? (
                                                <img src={instructorAvatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-lg font-bold text-primary-fg">
                                                    {course?.instructor ? course.instructor.charAt(0).toUpperCase() : 'I'}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-semibold hover:text-gray-700 dark:hover:text-white transition-colors">{course?.instructor || 'Instructor'}</p>
                                            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                                Course Instructor
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-black text-white">
                            {isLoading ? <LoadingSpinner message="Loading selected lesson…" /> : error ? <div className="p-5 text-center"><p role="alert" className="text-sm">{error}</p><button onClick={loadCourseData} className="mt-3 rounded bg-blue-600 px-4 py-2">Retry lesson</button></div> : <p>No video selected</p>}
                        </div>
                    )}
                </div>

                {/* Playlist Sidebar */}
                <PlaylistSidebar
                    contentLoading={contentLoading}
                    contentError={contentError}
                    metadataStatus={metadataStatus}
                    onRetryMetadata={()=>setMetadataVideos(getAllVideosFlat(modules).filter(video=>!(video.duration>0)))}
                    onRetryContent={handlePlaylistRefresh}
                    course={course}
                    modules={modules}
                    currentVideo={currentVideo}
                    onVideoSelect={handleVideoSelect}
                    isCollapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                    onRefresh={handlePlaylistRefresh}
                    onVideoDataChange={refreshCurrentVideoOnly}
                    courseId={courseId}
                    playbackClock={playbackClock}
                    onSeek={(time) => videoRef.current?.seekTo?.(time)}
                    onWidthChange={handleSidebarWidthChange}
                />
            </div>

        </div>
    )
}

export default CoursePlayerPage
