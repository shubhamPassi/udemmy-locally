import { courseCoverage, subscribeCoverage, coverageVersion, readCoverage, watchedSeconds } from '../../utils/watchCoverage'
import { lazy, Suspense, useState, useMemo, useRef, useEffect, useCallback, useSyncExternalStore } from 'react'
import {
    ChevronDown, ChevronRight, ChevronLeft, Check,
    Pencil, GripVertical, Folder, FolderOpen
} from 'lucide-react'
import { formatDuration, markVideoComplete, updateModule, updateVideo } from '../../utils/db'
import { useNotification } from '../../contexts/NotificationContext'
import { playlistDisplay } from '../../utils/playlistDisplay'

const EditModuleModal = lazy(() => import('./EditModuleModal'))
const NotesPanel = lazy(() => import('./NotesPanel'))
const BulkEditPlaylist = lazy(() => import('./BulkEditPlaylist'))
const AISummaryPanel = lazy(() => import('./AISummaryPanel'))

function TimestampPanel({ playbackClock, component: Panel, ...props }) {
    const currentTime = useSyncExternalStore(playbackClock.subscribe, playbackClock.getSnapshot, () => 0)
    return <Panel {...props} currentTime={currentTime} />
}

/**
 * Collect all videos from a module tree recursively
 */
function collectAllVideos(modules) {
    const result = []
    for (const mod of modules) {
        result.push(...(mod.videos || []))
        if (mod.subModules?.length > 0) {
            result.push(...collectAllVideos(mod.subModules))
        }
    }
    return result
}

/**
 * Collect all top-level and sub-modules in a single list
 * (No longer used for Bulk Edit, but kept if needed elsewhere)
 */
function flattenModuleTree(modules) {
    const result = []
    for (const mod of modules) {
        result.push(mod)
        if (mod.subModules?.length > 0) {
            result.push(...flattenModuleTree(mod.subModules))
        }
    }
    return result
}

function PlaylistSidebar({
    contentLoading, contentError, onRetryContent, metadataStatus,
    course,
    modules,
    currentVideo,
    onVideoSelect,
    isCollapsed,
    onToggle,
    onRefresh,
    onVideoDataChange,
    courseId,
    playbackClock,
    onSeek,
    onWidthChange
}) {
    const [expandedModules, setExpandedModules] = useState(() => {
        // Large courses initially expand only the selected lesson's module path.
        const largeCourse = collectAllVideos(modules).length > 100
        function expandAll(mods) {
            const acc = {}
            for (const m of mods) {
                acc[m.id] = !largeCourse || collectAllVideos([m]).some(video => video.id === currentVideo?.id)
                if (m.subModules?.length > 0) {
                    Object.assign(acc, expandAll(m.subModules))
                }
            }
            return acc
        }
        return expandAll(modules)
    })
    const [editingModule, setEditingModule] = useState(null)
    const [activeTab, setActiveTab] = useState('playlist')
    const [isBulkEditing, setIsBulkEditing] = useState(false)
    useEffect(() => {
        function selectedPath(nodes, parents = []) {
            for (const node of nodes) {
                const path = [...parents, node.id]
                if (node.videos?.some(video => video.id === currentVideo?.id)) return path
                const nested = selectedPath(node.subModules || [], path)
                if (nested.length) return nested
            }
            return []
        }
        const path = selectedPath(modules)
        setExpandedModules(previous => path.every(id => previous[id]) ? previous : { ...previous, ...Object.fromEntries(path.map(id => [id, true])) })
    }, [modules, currentVideo?.id])
    const { showNotification } = useNotification()

    // Resizable panel state
    const [panelWidth, setPanelWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarPanelWidth')
        return saved ? Math.max(280, Math.min(600, parseInt(saved, 10))) : 360
    })
    const isResizing = useRef(false)
    const resizeStartX = useRef(0)
    const resizeStartWidth = useRef(0)

    useEffect(() => {
        localStorage.setItem('sidebarPanelWidth', panelWidth.toString())
        onWidthChange?.(panelWidth)
    }, [panelWidth])

    const handleResizeStart = useCallback((e) => {
        e.preventDefault()
        isResizing.current = true
        resizeStartX.current = e.clientX
        resizeStartWidth.current = panelWidth
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
    }, [panelWidth])

    useEffect(() => {
        const handleResizeMove = (e) => {
            if (!isResizing.current) return
            const delta = resizeStartX.current - e.clientX
            const newWidth = Math.max(280, Math.min(600, resizeStartWidth.current + delta))
            setPanelWidth(newWidth)
        }

        const handleResizeEnd = () => {
            if (isResizing.current) {
                isResizing.current = false
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }
        }

        document.addEventListener('mousemove', handleResizeMove)
        document.addEventListener('mouseup', handleResizeEnd)
        return () => {
            document.removeEventListener('mousemove', handleResizeMove)
            document.removeEventListener('mouseup', handleResizeEnd)
        }
    }, [])

    const toggleModule = useCallback((moduleId) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleId]: !prev[moduleId]
        }))
    }, [])

    const handleToggleComplete = useCallback(async (e, video) => {
        e.stopPropagation()
        try {
            await markVideoComplete(video.id, !video.isCompleted)
            onRefresh?.()
        } catch (err) {
            console.error('Failed to update completion:', err)
        }
    }, [onRefresh])

    async function handleBulkSave(updatedModules) {
        try {
            async function saveDeep(mods, parentId = null) {
                for (let i = 0; i < mods.length; i++) {
                    const mod = mods[i]
                    // Update module order and parent
                    await updateModule(mod.id, {
                        title: mod.title,
                        order: i,
                        parentModuleId: parentId
                    })

                    // Update videos in this module
                    if (mod.videos) {
                        for (let j = 0; j < mod.videos.length; j++) {
                            const vid = mod.videos[j]
                            await updateVideo(vid.id, {
                                title: vid.title,
                                order: j,
                                moduleId: mod.id
                            })
                        }
                    }

                    // Recurse into sub-modules
                    if (mod.subModules && mod.subModules.length > 0) {
                        await saveDeep(mod.subModules, mod.id)
                    }
                }
            }

            await saveDeep(updatedModules)

            setIsBulkEditing(false)
            onRefresh?.()
        } catch (err) {
            console.error('Bulk save failed:', err)
            showNotification('Failed to save changes', 'error')
        }
    }

    // Calculate totals from tree
    const allVideos = useMemo(() => collectAllVideos(modules), [modules])
    const totalVideos = allVideos.length
    const completedVideos = allVideos.filter(v => v.isCompleted).length
    const totalDuration = allVideos.reduce((sum, v) => sum + (v.duration || 0), 0)

    // Use course's stored completion percentage
    useSyncExternalStore(subscribeCoverage,coverageVersion,coverageVersion)
    const coverage=courseCoverage(allVideos)
    const partialLessons = allVideos.filter(video => !video.isCompleted && video.duration > 0).reduce((sum, video) => sum + Math.min(1, watchedSeconds(readCoverage(video.id), video.duration) / video.duration), 0)
    const progressPercentage = totalVideos ? Math.min(100, (completedVideos + partialLessons) / totalVideos * 100) : 0

    // Calculate remaining time


    /**
     * Render a module and its sub-modules recursively
     */
    const renderModule = useCallback(function renderModule(module, depth = 0) {
        const isExpanded = expandedModules[module.id]
        const hasSubModules = module.subModules && module.subModules.length > 0
        const hasContent = (module.videos?.length > 0) || hasSubModules

        // Calculate completion for this module's own videos
        const ownCompleted = (module.videos || []).filter(v => v.isCompleted).length
        const ownTotal = (module.videos || []).length

        // Calculate completion including sub-modules
        const allModuleVideos = collectAllVideos([module])
        const totalModuleCompleted = allModuleVideos.filter(v => v.isCompleted).length
        const totalModuleCount = allModuleVideos.length
        const moduleDuration = allModuleVideos.reduce((sum, v) => sum + (v.duration || 0), 0)

        return (
            <div key={module.id} className={`${depth === 0 ? 'border-b border-light-border dark:border-dark-border last:border-b-0' : ''}`}>
                {/* Module Header */}
                <div
                    className={`flex items-center gap-2 p-3 hover:bg-light-surface dark:hover:bg-dark-bg transition-colors cursor-pointer`}
                    style={{ paddingLeft: `${12 + depth * 16}px` }}
                    onClick={() => toggleModule(module.id)}
                >
                    {hasContent ? (
                        isExpanded ? (
                            <ChevronDown className="w-4 h-4 flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary" />
                        ) : (
                            <ChevronRight className="w-4 h-4 flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary" />
                        )
                    ) : (
                        <span className="w-4" />
                    )}

                    {depth > 0 ? (
                        <FolderOpen className="w-3.5 h-3.5 text-primary-fg/60 flex-shrink-0" />
                    ) : null}

                    <div className="flex-1 min-w-0">
                        <h3 className={`text-sm truncate select-none ${depth === 0 ? 'font-medium' : 'font-normal text-light-text-secondary dark:text-dark-text-secondary'}`}>
                            {module.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            {totalModuleCount > 0 ? (
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary select-none">
                                    {totalModuleCompleted}/{totalModuleCount} videos • {formatDuration(moduleDuration)}
                                </p>
                            ) : hasSubModules ? (
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary select-none">
                                    {module.subModules.length} sub-modules • {formatDuration(moduleDuration)}
                                </p>
                            ) : null}
                        </div>
                    </div>

                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div>
                        {/* Sub-modules */}
                        {hasSubModules && module.subModules.map(sub => renderModule(sub, depth + 1))}

                        {/* Videos */}
                        {module.videos?.map((video) => {
                            const isActive = currentVideo?.id === video.id
                            const isCompleted = video.isCompleted

                            return (
                                <div
                                    key={video.id}
                                    onClick={() => onVideoSelect(video)}
                                    className={`
                                        w-full flex items-start gap-3 py-2 text-left cursor-pointer
                                        transition-colors group text-sm
                                        ${isActive
                                            ? 'bg-primary-fg/10 dark:bg-primary-fg/10 border-l-2 border-blue-600 dark:border-primary-fg'
                                            : 'hover:bg-light-surface dark:hover:bg-dark-bg border-l-2 border-transparent'
                                        }
                                    `}
                                    style={{ paddingLeft: `${28 + depth * 16}px`, paddingRight: '16px' }}
                                >
                                    {/* Checkbox */}
                                    <button
                                        onClick={(e) => handleToggleComplete(e, video)}
                                        className={`
                                            w-4 h-4 rounded border flex-shrink-0 mt-0.5
                                            flex items-center justify-center transition-colors
                                            ${isCompleted
                                                ? 'bg-success border-success text-white'
                                                : 'border-gray-400 dark:border-gray-600 hover:border-primary'
                                            }
                                        `}
                                    >
                                        {isCompleted && <Check className="w-3 h-3" />}
                                    </button>

                                    {/* Title */}
                                    <div className="flex-1 min-w-0">
                                        <div className={`line-clamp-2 ${isCompleted ? 'text-light-text-secondary dark:text-dark-text-secondary line-through' : ''} ${isActive ? 'text-primary-fg font-medium' : ''}`}>
                                            {video.title}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            <span>{formatDuration(video.duration)}</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }, [expandedModules, currentVideo?.id, toggleModule, handleToggleComplete, onVideoSelect])

    const playlistRows = useMemo(() => playlistDisplay(modules).map(module => renderModule(module, 0)), [modules, renderModule])

    const sidebarContent = (
        <>
            <div
                className={`
                    course-playlist-panel
                    fixed right-0 top-[64px] bottom-0
                    bg-white dark:bg-dark-surface 
                    border-l border-light-border dark:border-dark-border
                    flex flex-col
                    transition-transform duration-300
                    ${isCollapsed ? 'translate-x-full' : 'translate-x-0'}
                    z-30
                `}
                style={{ width: panelWidth, maxWidth: '100vw', willChange: 'transform' }}
            >
                {/* Resize Handle */}
                <div
                    onMouseDown={handleResizeStart}
                    className="course-playlist-resize absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10 group"
                    title="Drag to resize"
                >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-light-border dark:bg-dark-border rounded group-hover:bg-primary/50 transition-colors" />
                </div>

                {/* Header Section */}
                <div className="flex flex-col border-b border-light-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    {/* Top Progress Bar */}
                    <div className="px-4 pt-4 pb-2">
                        <div className="flex items-center justify-between text-sm mb-3">
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                {completedVideos}/{totalVideos} videos completed
                            </span>
                            <span className="font-medium text-primary-fg">
                                {Math.round(progressPercentage)}%
                            </span>
                        </div>
                        {coverage.known < coverage.count && <p className="mb-2 text-xs text-neutral-500">Partial total · {coverage.known}/{coverage.count} durations known{metadataStatus?.done < metadataStatus?.total ? ' · Loading metadata…' : ' · Other durations appear when available'}</p>}
                        <div className="progress-bar h-2 w-full bg-light-bg dark:bg-dark-bg rounded-full overflow-hidden">
                            <div
                                className="progress-bar-fill h-full bg-[var(--primary-fg)] rounded-full transition-all duration-300"
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center px-2 mt-2">
                        <button
                            onClick={() => setActiveTab('playlist')}
                            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'playlist'
                                ? 'border-blue-600 text-primary-fg dark:border-white dark:text-white'
                                : 'border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                                }`}
                        >
                            Playlist
                        </button>
                        <button
                            onClick={() => setActiveTab('notes')}
                            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'notes'
                                ? 'border-blue-600 text-primary-fg dark:border-white dark:text-white'
                                : 'border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                                }`}
                        >
                            Notes
                        </button>
                        <button
                            onClick={() => setActiveTab('ai')}
                            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ai'
                                ? 'border-blue-600 text-primary-fg dark:border-white dark:text-white'
                                : 'border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                                }`}
                        >
                            AI
                        </button>
                    </div>

                    {/* Playlist Toolbar */}
                    <div className={`items-center justify-between p-3 border-t border-light-border dark:border-dark-border bg-light-surface/50 dark:bg-dark-bg/50 ${activeTab === 'playlist' && !isBulkEditing ? 'flex' : 'hidden'}`}>
                        <h3 className="text-sm font-semibold">Playlist</h3>
                        <button
                            onClick={() => setIsBulkEditing(true)}
                            className="flex items-center gap-1 text-sm text-primary-fg hover:text-primary-dark"
                        >
                            <Pencil className="w-3 h-3" />
                            Bulk Edit
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative flex flex-col">
                    {/* Playlist Tab */}
                    <div className={`flex-1 overflow-hidden flex-col ${activeTab === 'playlist' ? 'flex' : 'hidden'}`}>
                        {contentLoading && !modules.length ? <div role="status" className="p-6 text-sm text-neutral-400">Loading course content…</div> : contentError ? <div className="p-5 text-sm"><p role="alert">{contentError}</p><button onClick={onRetryContent} className="mt-3 rounded bg-blue-600 px-4 py-2 text-white">Retry content</button></div> : isBulkEditing ? (
                            <Suspense fallback={null}>
                                <BulkEditPlaylist
                                    modules={modules}
                                    onSave={handleBulkSave}
                                    onCancel={() => setIsBulkEditing(false)}
                                />
                            </Suspense>
                        ) : (
                            <div className="flex-1 overflow-y-auto">
                                {playlistRows}
                            </div>
                        )}
                    </div>

                    {/* Notes Tab */}
                    <div className={`flex-1 overflow-hidden flex-col ${activeTab === 'notes' ? 'flex' : 'hidden'}`}>
                        <div className="h-full overflow-y-auto">
                            {activeTab === 'notes' && (
                                <Suspense fallback={null}>
                                    <TimestampPanel component={NotesPanel} playbackClock={playbackClock}
                                        video={currentVideo}
                                        courseId={courseId}
                                        onSeek={onSeek}
                                        isCollapsed={false}
                                        hideHeader={true}
                                    />
                                </Suspense>
                            )}
                        </div>
                    </div>

                    {/* AI Tab */}
                    <div className={`flex-1 overflow-hidden flex-col ${activeTab === 'ai' ? 'flex' : 'hidden'}`}>
                        <div className="h-full overflow-y-auto">
                            {activeTab === 'ai' && (
                                <Suspense fallback={null}>
                                    <TimestampPanel component={AISummaryPanel} playbackClock={playbackClock}
                                        video={currentVideo}
                                        courseId={courseId}
                                        onSeek={onSeek}
                                        onVideoDataChange={onVideoDataChange}
                                    />
                                </Suspense>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Collapse Toggle Button — always tracks the panel's right edge */}
            <button
                onClick={onToggle}
                className="
                    course-playlist-toggle
                    fixed top-1/2 -translate-y-1/2
                    w-6 h-12 
                    bg-light-surface dark:bg-dark-surface 
                    border border-light-border dark:border-dark-border
                    rounded-l-lg
                    flex items-center justify-center
                    hover:bg-light-bg dark:hover:bg-dark-bg
                    z-40
                "
                style={{
                    right: isCollapsed ? 0 : panelWidth,
                    transition: 'right 0.3s ease'
                }}
            >
                {isCollapsed ? (
                    <ChevronLeft className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>
        </>
    )

    return (
        <>
            {sidebarContent}

            {/* Edit Module Modal */}
            <Suspense fallback={null}>
                {editingModule && (
                    <EditModuleModal
                        module={editingModule}
                        isOpen={!!editingModule}
                        onClose={() => setEditingModule(null)}
                        onSave={() => {
                            onRefresh?.()
                        }}
                    />
                )}
            </Suspense>
        </>
    )
}

export default PlaylistSidebar
