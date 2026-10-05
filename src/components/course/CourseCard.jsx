import { Link, useNavigate } from 'react-router-dom'
import { Play, Clock, Video, Pencil, Trash2, RefreshCw, Link2 } from 'lucide-react'
import { formatDuration, deleteCourse, getInstructorAvatarAsync, updateCourse } from '../../utils/db'
import { useState, useEffect } from 'react'
import { useNotification } from '../../contexts/NotificationContext'

function scheduleAfterFirstPaint(callback) {
    const run = () => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(callback, { timeout: 2500 })
        } else {
            window.setTimeout(callback, 800)
        }
    }

    return window.setTimeout(run, 150)
}

function CourseCard({ course, viewMode = 'grid', onRefresh, onEdit, onSync }) {
    const navigate = useNavigate()
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [instructorAvatar, setInstructorAvatar] = useState(null)
    const { showNotification } = useNotification()

    // Load instructor avatar
    useEffect(() => {
        let isMounted = true
        let timer = null

        async function loadAvatar() {
            if (course.instructor) {
                const avatar = await getInstructorAvatarAsync(course.instructor)
                if (isMounted) {
                    setInstructorAvatar(avatar)
                }
            }
        }

        if (course.instructor) {
            timer = scheduleAfterFirstPaint(loadAvatar)
        }

        return () => {
            isMounted = false
            if (timer) window.clearTimeout(timer)
        }
    }, [course.instructor])

    function handleInstructorClick(e) {
        e.preventDefault()
        e.stopPropagation()
        if (course.instructor) {
            navigate(`/instructors?filter=${encodeURIComponent(course.instructor)}`)
        }
    }

    async function handleAvatarChange() {
        // Reload avatar after change
        if (course.instructor) {
            const avatar = await getInstructorAvatarAsync(course.instructor)
            setInstructorAvatar(avatar)
        }
        onRefresh?.()
    }

    const completionPercentage = course.completionPercentage || 0
    const formattedDuration = formatDuration(course.totalDuration)

    async function handleDelete(e) {
        e.preventDefault()
        e.stopPropagation()

        if (!confirm(`Are you sure you want to delete "${course.title}"? This action cannot be undone.`)) {
            return
        }

        try {
            setIsDeleting(true)
            await deleteCourse(course.id)
            showNotification(`Deleted "${course.title}".`, 'success')
            onRefresh?.()
        } catch (err) {
            console.error('Failed to delete course:', err)
            showNotification('Failed to delete course: ' + err.message, 'error')
        } finally {
            setIsDeleting(false)
        }
    }

    function handleEdit(e) {
        e.preventDefault()
        e.stopPropagation()
        onEdit?.(course)
    }

    async function handleSync(e) {
        e.preventDefault()
        e.stopPropagation()
        if (onSync) {
            setIsSyncing(true)
            try {
                await onSync(course)
            } finally {
                setIsSyncing(false)
            }
        }
    }

    const isLocalCourse = !!(course.folderHandle || (course.originalTitle && !course.youtubePlaylistId && !course.driveFileId && course.sourceType !== 'external-link'))
    const isExternalCourse = course.sourceType === 'external-link' || !!course.courseUrl

    async function handleExternalClick() {
        if (isExternalCourse) {
            try {
                await updateCourse(course.id, { lastAccessedClickTime: new Date().toISOString() })
            } catch (err) {
                console.error("Failed to update course click history:", err)
            }
        }
    }

    const CardWrapper = isExternalCourse ? 'a' : Link
    const wrapperProps = isExternalCourse 
        ? { href: course.courseUrl, target: '_blank', rel: 'noopener noreferrer', onClick: handleExternalClick }
        : { to: `/course/${course.id}` }
    const actions = (
        <div className="flex items-center gap-1 flex-shrink-0">
            <button
                onClick={handleEdit}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
                title="Edit course"
                aria-label="Edit course"
            >
                <Pencil className="w-4 h-4" />
            </button>
            {isLocalCourse && (
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
                    title="Sync course"
                    aria-label="Sync course"
                >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
            )}
            <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors text-red-500 dark:text-red-400"
                title="Delete course"
                aria-label="Delete course"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    )

    if (viewMode === 'list') {
        return (
            <CardWrapper
                {...wrapperProps}
                className="flex items-center gap-4 p-4 glass rounded-2xl hover:bg-white/50 dark:hover:bg-white/5 transition-all group relative"
            >
                {/* Thumbnail */}
                <div className="w-40 h-24 bg-gray-200 dark:bg-neutral-900 rounded-lg overflow-hidden flex-shrink-0 relative group-hover:ring-1 group-hover:ring-primary/20 dark:group-hover:ring-white/20 transition-all">
                    {course.thumbnailData ? (
                        <img
                            src={course.thumbnailData}
                            alt={course.title}
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-10 h-10 text-gray-400 dark:text-neutral-600" />
                        </div>
                    )}
                    

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {isExternalCourse ? (
                            <Link2 className="w-8 h-8 text-white" />
                        ) : (
                            <Play className="w-8 h-8 text-white" fill="white" />
                        )}
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate text-lg tracking-tight">
                        {course.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-neutral-400 mt-1">
                        <span className="flex items-center gap-1.5">
                            <Video className="w-4 h-4" />
                            {course.completedVideos}/{course.totalVideos}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {formattedDuration}
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-3 progress-bar h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary-fg text-primary-content rounded-full transition-all duration-300"
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>
                </div>

                {/* Completion */}
                <div className="text-right flex-shrink-0">
                    <span className="text-xl font-bold text-primary dark:text-white">
                        {Math.round(completionPercentage)}%
                    </span>
                </div>

                {actions}
            </CardWrapper>
        )
    }

    // Grid view (default)
    return (
        <>
            <CardWrapper
                {...wrapperProps}
                className="group glass rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1 relative"
            >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-200 dark:bg-neutral-900 relative overflow-hidden">
                    {course.thumbnailData ? (
                        <img
                            src={course.thumbnailData}
                            alt={course.title}
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-16 h-16 text-gray-400 dark:text-neutral-700" />
                        </div>
                    )}



                    {/* Gradient Overlay for Text Readability (Dark mode only or subtle in light) */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 dark:opacity-60 group-hover:opacity-40 dark:group-hover:opacity-80 transition-opacity" />

                    {/* Play/Open overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-14 h-14 bg-white/90 dark:bg-white/10 rounded-full flex items-center justify-center border border-white/20 shadow-2xl opacity-0 scale-90 backdrop-blur-none group-hover:opacity-100 group-hover:scale-100 group-hover:backdrop-blur-md transition-all duration-300">
                            {isExternalCourse ? (
                                <Link2 className="w-6 h-6 text-primary dark:text-white" />
                            ) : (
                                <Play className="w-6 h-6 text-primary dark:text-white ml-1" fill="currentColor" />
                            )}
                        </div>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-md text-white text-[10px] font-medium rounded-md border border-white/10">
                        {formattedDuration}
                    </div>

                    {/* Quick actions */}
                    <div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-black/45 border border-gray-200 dark:border-white/10 rounded-full backdrop-blur-md shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {actions}
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col h-full relative z-10">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-1 text-lg tracking-tight group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
                        {course.title}
                    </h3>

                    {/* Instructor */}
                    {course.instructor && (
                        <div className="mb-4">
                            <div
                                className="inline-flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={handleInstructorClick}
                                title={`View ${course.instructor}'s profile`}
                            >
                                <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-white text-[10px] font-medium overflow-hidden flex-shrink-0">
                                    {instructorAvatar ? (
                                        <img src={instructorAvatar} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        course.instructor.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <span className="text-xs text-gray-500 dark:text-neutral-400 truncate hover:text-gray-700 dark:hover:text-white transition-colors">
                                    {course.instructor}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Progress Bar */}
                    <div className="progress-bar mb-3 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary-fg text-primary-content rounded-full transition-all duration-300"
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-neutral-500 font-medium">
                        <span>{course.completedVideos} / {course.totalVideos} videos</span>
                        <span className="text-primary dark:text-white">{Math.round(completionPercentage)}%</span>
                    </div>
                </div>
            </CardWrapper>
        </>
    )
}

export default CourseCard
