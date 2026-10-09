import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
    Map, Plus, Trash2, ZoomIn, ZoomOut,
    Maximize2, BookOpen, Play, CheckCircle,
    ArrowRight, X, Grid3X3
} from 'lucide-react'
import { getAllCourses } from '../utils/db'
import { getRoadmaps, addRoadmap, updateRoadmap, deleteRoadmap as deleteRoadmapDb } from '../utils/roadmapDb'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useNotification } from '../contexts/NotificationContext'
import { fitRoadmapViewport } from '../utils/roadmapLayout'
import {pushRoadmapHistory,undoRoadmapHistory} from '../utils/roadmapHistory'

// Generate unique ID
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

function handleDialogKeyDown(event, busy, close) {
    if (event.key === 'Escape' && !busy) close()
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
    if (!controls.length) { event.preventDefault(); return }
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function RoadmapPage() {
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [roadmaps, setRoadmaps] = useState([])
    const [currentRoadmap, setCurrentRoadmap] = useState(null)
    const [showCoursePanel, setShowCoursePanel] = useState(true)
    const [showNewRoadmapModal, setShowNewRoadmapModal] = useState(false)
    const [newRoadmapTitle, setNewRoadmapTitle] = useState('')

    const { showNotification } = useNotification()
    const [courseSearch, setCourseSearch] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [saveStatus, setSaveStatus] = useState('Saved')
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [history,setHistory]=useState([]),[renameTitle,setRenameTitle]=useState(''),[renaming,setRenaming]=useState(false)
    function rememberEdit(){setHistory(previous=>pushRoadmapHistory(previous,nodes,connections))}
    function undoEdit(){const previous=undoRoadmapHistory(history);if(!previous)return;setNodes(previous.snapshot.nodes);setConnections(previous.snapshot.connections);setHistory(previous.history);setConnectingFrom(null)}
    async function renameRoadmap(){const title=renameTitle.trim();if(!title)return;try{const updated={...currentRoadmap,title,name:title};await updateRoadmap({id:currentRoadmap.id,title,name:title});setCurrentRoadmap(updated);setRoadmaps(previous=>previous.map(roadmap=>roadmap.id===updated.id?updated:roadmap));setRenaming(false)}catch{showNotification('Could not rename roadmap.','error')}}

    // Canvas state
    const [nodes, setNodes] = useState([])
    const [connections, setConnections] = useState([])
    const [selectedNode, setSelectedNode] = useState(null)
    const [connectingFrom, setConnectingFrom] = useState(null)
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [draggedNode, setDraggedNode] = useState(null)

    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    // Track the last stored canvas and serialize writes to preserve edit order.
    const savedSnapshot = useRef('')
    const activeRoadmapId = useRef(null)
    const saveQueue = useRef(Promise.resolve())

    // Load courses and roadmaps
    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setIsLoading(true)
            setLoadError('')
            const allCourses = await getAllCourses()
            setCourses(allCourses)

            // Load roadmaps from API/storage
            const parsed = await getRoadmaps()
            setRoadmaps(parsed)
            // Load the last active roadmap
            if (parsed.length > 0) {
                const lastActive = localStorage.getItem('last_roadmap_id')
                const roadmap = parsed.find(r => r.id === lastActive) || parsed[0]
                loadRoadmap(roadmap)
            }
        } catch (err) {
            console.error('Failed to load data:', err)
            setLoadError('Could not load your roadmaps. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    function loadRoadmap(roadmap) {
        // Normalize: server returns 'name', frontend uses 'title'
        const normalized = { ...roadmap, title: roadmap.title || roadmap.name }
        // Also restore pan/zoom from viewport if stored that way by server
        const viewport = roadmap.viewport || {}
        setHistory([]);setRenaming(false)
        activeRoadmapId.current = normalized.id
        savedSnapshot.current = JSON.stringify([normalized.nodes || [], normalized.connections || [], normalized.pan || viewport.pan || { x: 0, y: 0 }, normalized.zoom || viewport.zoom || 1])
        setSaveStatus('Saved')
        setSelectedNode(null)
        setConnectingFrom(null)
        setCourseSearch('')
        setCurrentRoadmap(normalized)
        setNodes(normalized.nodes || [])
        setConnections(normalized.connections || [])
        setPan(normalized.pan || viewport.pan || { x: 0, y: 0 })
        setZoom(normalized.zoom || viewport.zoom || 1)
        localStorage.setItem('last_roadmap_id', normalized.id)
    }

    async function saveRoadmap() {
        if (!currentRoadmap) return

        const updated = {
            ...currentRoadmap,
            nodes,
            connections,
            pan,
            zoom,
            updatedAt: new Date().toISOString()
        }

        const snapshot = JSON.stringify([nodes, connections, pan, zoom])
        if (snapshot === savedSnapshot.current) return true
        setSaveStatus('Saving…')
        const write = saveQueue.current.catch(() => {}).then(() => updateRoadmap(updated))
        saveQueue.current = write
        try {
            await write
            setRoadmaps(prev => prev.map(r => r.id === updated.id ? updated : r))
            if (activeRoadmapId.current === updated.id) {
                savedSnapshot.current = snapshot
                setSaveStatus('Saved')
            }
            return true
        } catch (error) {
            setSaveStatus('Save failed')
            showNotification('Could not save your roadmap. Please retry.', 'error')
            return false
        }
    }

    async function createNewRoadmap() {
        if (!newRoadmapTitle.trim() || isCreating) return
        setIsCreating(true)

        const newRoadmap = {
            id: generateId(),
            title: newRoadmapTitle.trim(),
            nodes: [],
            connections: [],
            pan: { x: 0, y: 0 },
            zoom: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }

        try {
            if (await saveRoadmap() === false) return
            await addRoadmap(newRoadmap)
            setRoadmaps(prev => [...prev, newRoadmap])
            loadRoadmap(newRoadmap)
            setShowNewRoadmapModal(false)
            setNewRoadmapTitle('')
            setShowCoursePanel(true)
        } catch {
            showNotification('Could not create your roadmap. Please try again.', 'error')
        } finally { setIsCreating(false) }
    }

    async function deleteRoadmap(id) {
        if (isDeleting) return
        setIsDeleting(true)

        try {
            await saveQueue.current.catch(() => {})
            await deleteRoadmapDb(id)
            const newRoadmaps = roadmaps.filter(r => r.id !== id)
            setRoadmaps(newRoadmaps)

            if (currentRoadmap?.id === id) {
                if (newRoadmaps.length > 0) {
                    loadRoadmap(newRoadmaps[0])
                } else {
                    activeRoadmapId.current = null
                    localStorage.removeItem('last_roadmap_id')
                    setCurrentRoadmap(null)
                    setNodes([])
                    setConnections([])
                }
            }
            setShowDeleteDialog(false)
        } catch { showNotification('Could not delete your roadmap. Please try again.', 'error') }
        finally { setIsDeleting(false) }
    }

    // Add course to canvas
    function addCourseToCanvas(course) {
        const container = containerRef.current
        if (!currentRoadmap || !container || nodes.some(node => node.courseId === course.id)) return

        const rect = container.getBoundingClientRect()
        const centerX = (rect.width / 2 - pan.x) / zoom
        const centerY = (rect.height / 2 - pan.y) / zoom

        // Put new courses beside the existing cards instead of stacking them.
        const rightEdge = nodes.length ? Math.max(...nodes.map(node => node.x + node.width)) : centerX - 140

        const newNode = {
            id: generateId(),
            courseId: course.id,
            x: nodes.length ? rightEdge + 40 : centerX - 140,
            y: nodes.length ? nodes[0].y : centerY - 80,
            width: 280,
            height: 160
        }

        rememberEdit()
        const nextNodes = [...nodes, newNode]
        setNodes(nextNodes)
        const view = fitRoadmapViewport(nextNodes, rect.width, rect.height)
        setZoom(view.zoom)
        setPan(view.pan)
    }

    // Remove node
    function removeNode(nodeId) {
        rememberEdit()
        setNodes(prev => prev.filter(n => n.id !== nodeId))
        setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId))
        setSelectedNode(null)
    }

    // Handle node dragging
    const handleNodeMouseDown = (e, node) => {
        if (e.button !== 0 || e.target.closest('button, a')) return
        e.stopPropagation()
        rememberEdit()
        setDraggedNode(node)
        setDragStart({ x: e.clientX - node.x * zoom, y: e.clientY - node.y * zoom })
        setSelectedNode(node.id)
    }

    const handleCanvasMouseDown = (e) => {
        if (!currentRoadmap || e.button !== 0 || draggedNode || e.target.closest('button, a')) return
        if (e.target === canvasRef.current || e.target.closest('.canvas-bg')) {
            setIsDragging(true)
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
            setSelectedNode(null)
            setConnectingFrom(null)
        }
    }

    const handleMouseMove = useCallback((e) => {
        if (draggedNode) {
            const newX = (e.clientX - dragStart.x) / zoom
            const newY = (e.clientY - dragStart.y) / zoom
            setNodes(prev => prev.map(n =>
                n.id === draggedNode.id ? { ...n, x: newX, y: newY } : n
            ))
        } else if (isDragging) {
            setPan({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            })
        }
    }, [draggedNode, isDragging, dragStart, zoom])

    const handleMouseUp = () => {
        setDraggedNode(null)
        setIsDragging(false)
    }

    useEffect(() => {
        window.addEventListener('pointermove', handleMouseMove)
        window.addEventListener('pointerup', handleMouseUp)
        window.addEventListener('pointercancel', handleMouseUp)
        return () => {
            window.removeEventListener('pointermove', handleMouseMove)
            window.removeEventListener('pointerup', handleMouseUp)
            window.removeEventListener('pointercancel', handleMouseUp)
        }
    }, [handleMouseMove])

    // Connection handling
    function startConnecting(nodeId) {
        if (connectingFrom === nodeId) {
            setConnectingFrom(null)
        } else if (connectingFrom) {
            // Create connection
            if (connectingFrom !== nodeId) {
                const exists = connections.some(c =>
                    c.fromNodeId === connectingFrom && c.toNodeId === nodeId
                )
                if (!exists) {
                    rememberEdit()
                    setConnections(prev => [...prev, {
                        id: generateId(),
                        fromNodeId: connectingFrom,
                        toNodeId: nodeId
                    }])
                }
            }
            setConnectingFrom(null)
        } else {
            setConnectingFrom(nodeId)
        }
    }

    function removeConnection(connectionId) {
        rememberEdit()
        setConnections(prev => prev.filter(c => c.id !== connectionId))
    }

    // Zoom controls
    const handleZoom = (delta) => {
        setZoom(prev => Math.min(2, Math.max(0.25, prev + delta)))
    }

    const resetView = () => {
        const rect = containerRef.current?.getBoundingClientRect()
        const view = fitRoadmapViewport(nodes, rect?.width || 800, rect?.height || 500)
        setZoom(view.zoom)
        setPan(view.pan)
    }

    // Get course data for a node
    const getCourseForNode = (node) => {
        return courses.find(c => c.id === node.courseId)
    }

    // Get optimal connection point on node edge based on target position
    const getNodeEdgePoint = (fromNodeId, toNodeId) => {
        const fromNode = nodes.find(n => n.id === fromNodeId)
        const toNode = nodes.find(n => n.id === toNodeId)
        if (!fromNode || !toNode) return { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }

        // Calculate centers
        const fromCenter = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }
        const toCenter = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 }

        // Calculate angle between nodes
        const dx = toCenter.x - fromCenter.x
        const dy = toCenter.y - fromCenter.y
        const angle = Math.atan2(dy, dx)

        // Determine which edge to connect from/to based on angle
        const getEdgePoint = (node, isSource) => {
            const cx = node.x + node.width / 2
            const cy = node.y + node.height / 2
            const hw = node.width / 2
            const hh = node.height / 2

            // For source, we go in direction of target; for target, opposite
            const a = isSource ? angle : angle + Math.PI

            // Calculate intersection with node rectangle
            const tanA = Math.tan(a)
            const cosA = Math.cos(a)
            const sinA = Math.sin(a)

            // Check horizontal vs vertical edge intersection
            let px, py

            if (Math.abs(cosA) * hh > Math.abs(sinA) * hw) {
                // Intersects left or right edge
                px = cosA > 0 ? cx + hw : cx - hw
                py = cy + (px - cx) * tanA
            } else {
                // Intersects top or bottom edge
                py = sinA > 0 ? cy + hh : cy - hh
                px = cx + (py - cy) / tanA
            }

            return { x: px, y: py }
        }

        return {
            from: getEdgePoint(fromNode, true),
            to: getEdgePoint(toNode, false)
        }
    }

    // Calculate smooth bezier curve control points
    const getBezierControlPoints = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Control point offset - increases with distance for smoother curves
        const offset = Math.min(distance * 0.4, 100)

        // Determine curve direction based on relative positions
        const isHorizontal = Math.abs(dx) > Math.abs(dy)

        if (isHorizontal) {
            // Horizontal flow - curve horizontally then vertically
            return {
                cp1: { x: from.x + offset, y: from.y },
                cp2: { x: to.x - offset, y: to.y }
            }
        } else {
            // Vertical flow - curve vertically then horizontally
            return {
                cp1: { x: from.x, y: from.y + (dy > 0 ? offset : -offset) },
                cp2: { x: to.x, y: to.y + (dy > 0 ? -offset : offset) }
            }
        }
    }

    // Auto-save on changes
    useEffect(() => {
        if (!isDeleting && currentRoadmap && JSON.stringify([nodes, connections, pan, zoom]) !== savedSnapshot.current) {
            setSaveStatus('Unsaved changes')
            const timeout = setTimeout(saveRoadmap, 1000)
            return () => clearTimeout(timeout)
        }
    }, [currentRoadmap?.id, nodes, connections, pan, zoom, isDeleting])

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Loading roadmap..." />
            </div>
        )
    }

    return (
        <div className="min-h-[650px] h-[calc(100dvh-8rem)] flex flex-col text-gray-900 dark:text-white">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-3">
                        <Map className="w-7 h-7 text-primary-fg" />
                        Learning Roadmap
                    </h1>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        Create a roadmap, add your courses, then connect them in the order you want to learn.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Roadmap Selector */}
                    <select
                        aria-label="Choose roadmap"
                        disabled={!roadmaps.length}
                        value={currentRoadmap?.id || ''}
                        onChange={async (e) => {
                            const roadmap = roadmaps.find(r => r.id === e.target.value)
                            if (roadmap && await saveRoadmap() !== false) loadRoadmap(roadmap)
                        }}
                        className="px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                    >
                        {roadmaps.length === 0 && (
                            <option value="">No roadmaps</option>
                        )}
                        {roadmaps.map(r => (
                            <option key={r.id} value={r.id}>{r.title || r.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowNewRoadmapModal(true)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm font-medium"
                        title="Create new roadmap"
                    >
                        <Plus className="w-4 h-4" />New roadmap
                    </button>

                    {currentRoadmap && (
                        <button
                            onClick={() => setShowDeleteDialog(true)}
                            className="p-2 rounded-lg text-light-text-secondary hover:text-error hover:bg-error/10 transition-colors"
                            aria-label="Delete roadmap" title="Delete roadmap"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {loadError && <div role="alert" className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">{loadError}<button onClick={loadData} className="ml-3 underline">Try again</button></div>}
            {currentRoadmap && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-neutral-400"><p>{nodes.length} courses · {connections.length} connections · Drag cards to arrange your plan</p><span role="status">{saveStatus}{saveStatus === 'Save failed' && <button onClick={saveRoadmap} className="ml-2 text-blue-500 underline">Retry</button>}</span></div>}
            {currentRoadmap && <div className="mb-3 flex flex-wrap gap-2"><button onClick={()=>{setRenameTitle(currentRoadmap.title);setRenaming(true)}} className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-xs">Rename</button><button disabled={!history.length} onClick={undoEdit} className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-xs disabled:opacity-40">Undo</button>{renaming&&<><input autoFocus aria-label="New roadmap name" maxLength={100} value={renameTitle} onChange={event=>setRenameTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')renameRoadmap();if(event.key==='Escape')setRenaming(false)}} className="rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm"/><button onClick={renameRoadmap} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white">Save name</button><button onClick={()=>setRenaming(false)} className="px-3 text-xs">Cancel</button></>}</div>}
            {/* Main Content */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 overflow-hidden">
                {/* Course Panel (Left) */}
                {currentRoadmap && showCoursePanel && (
                    <div className="w-full md:w-72 md:shrink-0 max-h-56 md:max-h-none bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-light-border dark:border-dark-border">
                            <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-primary-fg" />
                                Courses
                            </h3>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                Choose courses for this roadmap
                            </p>
                        </div>
                        <div className="px-3 pt-3"><input aria-label="Search courses for roadmap" value={courseSearch} onChange={e => setCourseSearch(e.target.value)} placeholder="Search your courses…" className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {courses.filter(course => course.title.toLowerCase().includes(courseSearch.toLowerCase())).map(course => {
                                const isOnCanvas = nodes.some(n => n.courseId === course.id)
                                return (
                                    <button
                                        key={course.id}
                                        onClick={() => !isOnCanvas && addCourseToCanvas(course)}
                                        disabled={!currentRoadmap || isOnCanvas}
                                        className={`w-full p-3 rounded-lg text-left mb-2 transition-colors ${isOnCanvas
                                            ? 'bg-primary/10 dark:bg-primary/50/10 cursor-not-allowed opacity-60'
                                            : 'bg-light-surface dark:bg-dark-bg hover:bg-primary/5 dark:hover:bg-primary/50/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Thumbnail */}
                                            <div className="w-16 h-10 rounded bg-light-border dark:bg-dark-border flex-shrink-0 overflow-hidden">
                                                {course.thumbnailData ? (
                                                    <img
                                                        src={course.thumbnailData}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <BookOpen className="w-4 h-4 opacity-50" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate text-light-text-primary dark:text-dark-text-primary">
                                                    {course.title}
                                                </div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2 mt-1">
                                                    <span>{Math.round(course.completionPercentage || 0)}%</span>
                                                    {isOnCanvas && (
                                                        <span className="text-primary-fg">Added</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                            {courses.length > 0 && !courses.some(course => course.title.toLowerCase().includes(courseSearch.toLowerCase())) && <p className="p-4 text-sm text-neutral-500">No courses match your search.</p>}
                            {courses.length === 0 && (
                                <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary text-sm">
                                    No courses yet. <Link to="/" className="text-blue-500 underline">Add your first course</Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Canvas Area */}
                <div
                    ref={containerRef}
                    className="flex-1 min-h-[320px] bg-light-surface dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border overflow-hidden relative"
                >
                    {/* Toolbar */}
                    {currentRoadmap && <div className="absolute top-4 left-4 z-10 flex gap-2">
                        <button
                            onClick={() => setShowCoursePanel(prev => !prev)}
                            className={`p-2 rounded-lg shadow-md transition-colors border border-light-border dark:border-dark-border ${showCoursePanel
                                ? 'bg-white dark:bg-dark-surface text-primary-fg'
                                : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-bg'
                                }`}
                            aria-label="Toggle course panel" title="Toggle course panel"
                        >
                            <Grid3X3 className="w-5 h-5" />
                        </button>
                    </div>

                    }
                    {/* Zoom Controls */}
                    {currentRoadmap && <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                        <button
                            onClick={() => handleZoom(0.25)}
                            className="p-2 rounded-lg bg-white dark:bg-dark-surface shadow-md hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Zoom in" title="Zoom in"
                        >
                            <ZoomIn className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleZoom(-0.25)}
                            className="p-2 rounded-lg bg-white dark:bg-dark-surface shadow-md hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Zoom out" title="Zoom out"
                        >
                            <ZoomOut className="w-5 h-5" />
                        </button>
                        <button
                            onClick={resetView}
                            className="p-2 rounded-lg bg-white dark:bg-dark-surface shadow-md hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Fit to view" title="Fit to view"
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                        <div className="px-2 py-1 bg-white dark:bg-dark-surface rounded-lg shadow-md text-xs text-center">
                            {Math.round(zoom * 100)}%
                        </div>
                    </div>

                    }
                    {/* Canvas */}
                    <div
                        ref={canvasRef}
                        className="w-full h-full cursor-grab active:cursor-grabbing canvas-bg"
                        onPointerDown={handleCanvasMouseDown}
                        style={{
                            touchAction: 'none',
                            backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
                            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                            backgroundPosition: `${pan.x}px ${pan.y}px`
                        }}
                    >
                        {/* SVG for connections */}
                        <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{ overflow: 'visible' }}
                        >
                            <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                                {connections.map(conn => {
                                    const points = getNodeEdgePoint(conn.fromNodeId, conn.toNodeId)
                                    const from = points.from
                                    const to = points.to
                                    const { cp1, cp2 } = getBezierControlPoints(from, to)

                                    // Calculate angle at the endpoint for arrow
                                    // Use the control point to determine arrow direction
                                    const arrowAngle = Math.atan2(to.y - cp2.y, to.x - cp2.x)
                                    const arrowLength = 10
                                    const arrowSpread = Math.PI / 7

                                    // Arrow head vertices
                                    const arrow1X = to.x - Math.cos(arrowAngle - arrowSpread) * arrowLength
                                    const arrow1Y = to.y - Math.sin(arrowAngle - arrowSpread) * arrowLength
                                    const arrow2X = to.x - Math.cos(arrowAngle + arrowSpread) * arrowLength
                                    const arrow2Y = to.y - Math.sin(arrowAngle + arrowSpread) * arrowLength

                                    return (
                                        <g key={conn.id} className="cursor-pointer group">
                                            {/* Invisible wider hit area for easier clicking */}
                                            <path
                                                d={`M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`}
                                                fill="none"
                                                stroke="transparent"
                                                strokeWidth="20" role="button" tabIndex={0} aria-label="Remove course connection" onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();removeConnection(conn.id)}}}
                                                style={{ pointerEvents: 'stroke' }}
                                                onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}
                                            />
                                            {/* Connection line - cubic bezier for smooth curves */}
                                            <path
                                                d={`M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`}
                                                fill="none"
                                                stroke="var(--primary-fg)"
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                className="group-hover:stroke-red-500 transition-colors pointer-events-none"
                                            />
                                            {/* Arrow head at endpoint */}
                                            <polygon
                                                points={`${to.x},${to.y} ${arrow1X},${arrow1Y} ${arrow2X},${arrow2Y}`}
                                                fill="var(--primary-fg)"
                                                className="group-hover:fill-red-500 transition-colors pointer-events-none"
                                            />
                                            {/* Delete indicator on hover - shows at midpoint */}
                                            <g
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                transform={`translate(${(from.x + to.x) / 2}, ${(from.y + to.y) / 2})`}
                                            >
                                                <circle r="12" fill="white" stroke="#ef4444" strokeWidth="2" />
                                                <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fill="#ef4444" fontSize="14" fontWeight="bold">×</text>
                                            </g>
                                        </g>
                                    )
                                })}
                            </g>
                        </svg>

                        {/* Nodes */}
                        <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transformOrigin: '0 0'
                            }}
                        >
                            {nodes.map(node => {
                                const course = getCourseForNode(node)
                                if (!course) return null

                                const progress = course.completionPercentage || 0
                                const isSelected = selectedNode === node.id
                                const isConnecting = connectingFrom === node.id

                                return (
                                    <div
                                        key={node.id}
                                        className={`absolute pointer-events-auto touch-none bg-white dark:bg-dark-surface rounded-xl shadow-lg border-2 transition-shadow cursor-move select-none ${isSelected ? 'border-primary shadow-xl ring-2 ring-primary/20' :
                                            isConnecting ? 'border-green-500 shadow-xl' :
                                                'border-light-border dark:border-dark-border hover:shadow-xl'
                                            }`}
                                        style={{
                                            left: node.x,
                                            top: node.y,
                                            width: node.width,
                                            height: node.height
                                        }}
                                        onPointerDown={(e) => handleNodeMouseDown(e, node)}
                                        onClick={() => { if (connectingFrom && connectingFrom !== node.id) startConnecting(node.id) }}
                                    >
                                        {/* Node Content */}
                                        <div className="p-4 h-full flex flex-col">
                                            {/* Header */}
                                            <div className="flex items-start gap-3 mb-3">
                                                {/* Thumbnail */}
                                                <div className="w-16 h-10 rounded bg-light-surface dark:bg-dark-bg flex-shrink-0 overflow-hidden">
                                                    {course.thumbnailData ? (
                                                        <img
                                                            src={course.thumbnailData}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <BookOpen className="w-4 h-4 opacity-50" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-sm truncate text-light-text-primary dark:text-dark-text-primary">
                                                        {course.title}
                                                    </h4>
                                                    {course.instructor && (
                                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                                                            {course.instructor}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress */}
                                            <div className="mb-3">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                                        {course.completedVideos || 0}/{course.totalVideos || 0} videos
                                                    </span>
                                                    <span className={`font-medium ${progress === 100 ? 'text-green-500' : 'text-primary-fg'
                                                        }`}>
                                                        {Math.round(progress)}%
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-light-surface dark:bg-dark-bg rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${progress === 100
                                                            ? 'bg-green-500'
                                                            : 'bg-gradient-to-r from-blue-500 to-blue-600'
                                                            }`}
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 mt-auto">
                                                <Link
                                                    to={`/course/${course.id}`}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-primary-fg/10 dark:bg-primary-fg/10 text-primary-fg rounded-lg text-xs font-medium hover:bg-blue-200 dark:hover:bg-primary-fg/20 transition-colors"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Play className="w-3 h-3" />
                                                    Open
                                                </Link>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        startConnecting(node.id)
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isConnecting
                                                        ? 'bg-green-500 text-white'
                                                        : 'bg-light-surface dark:bg-dark-bg hover:bg-primary/5 dark:hover:bg-primary/50/10 text-light-text-primary dark:text-dark-text-primary'
                                                        }`}
                                                    aria-label={`Connect ${course.title}`} title={isConnecting ? 'Click another node to connect' : 'Connect to another course'}
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removeNode(node.id)
                                                    }}
                                                    className="p-1.5 rounded-lg text-light-text-secondary hover:text-error hover:bg-error/10 transition-colors"
                                                    aria-label={`Remove ${course.title} from roadmap`} title="Remove from roadmap"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Status indicator */}
                                        {progress === 100 && (
                                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                                <CheckCircle className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Empty state */}
                        {nodes.length === 0 && currentRoadmap && (
                            <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none text-light-text-secondary dark:text-dark-text-secondary">
                                <div className="text-center">
                                    <Map className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                    <p className="text-lg font-medium mb-2">Start building your roadmap</p>
                                    <p className="text-sm">Use the course panel to add your first course. Drag cards to arrange them.</p>
                                </div>
                            </div>
                        )}

                        {/* No roadmap selected */}
                        {!currentRoadmap && (
                            <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none text-light-text-secondary dark:text-dark-text-secondary">
                                <div className="text-center">
                                    <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500"><Map className="w-8 h-8" /></span>
                                    <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-3">Build your learning path</h2>
                                    <p className="max-w-md mx-auto text-sm leading-6 mb-5">Start by creating a roadmap. Then choose courses from your library and connect them into a clear plan.</p>
                                    <ol className="flex flex-wrap justify-center gap-3 sm:gap-6 text-xs mb-6"><li>1. Name your roadmap</li><li>2. Add courses</li><li>3. Connect your path</li></ol>
                                    <button
                                        onClick={() => setShowNewRoadmapModal(true)}
                                        className="pointer-events-auto mx-auto px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 font-medium"
                                    >
                                        <Plus className="w-5 h-5" />
                                        Create Your First Roadmap
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Connection hint */}
                    {connectingFrom && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg text-sm">
                            Click another course node to create a connection <button onClick={()=>setConnectingFrom(null)} className="ml-3 underline">Cancel</button>
                        </div>
                    )}
                </div>
            </div>

            {showDeleteDialog && currentRoadmap && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-roadmap-heading" onKeyDown={e => handleDialogKeyDown(e, isDeleting, () => setShowDeleteDialog(false))}>
                <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-neutral-900 p-6 shadow-2xl">
                    <h2 id="delete-roadmap-heading" className="text-lg font-semibold">Delete this roadmap?</h2>
                    <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-neutral-400">“{currentRoadmap.title}” and its connections will be removed. Your courses and learning progress will stay saved.</p>
                    <div className="mt-6 flex gap-3"><button disabled={isDeleting} onClick={() => deleteRoadmap(currentRoadmap.id)} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">{isDeleting ? 'Deleting…' : 'Delete roadmap'}</button><button autoFocus disabled={isDeleting} onClick={() => setShowDeleteDialog(false)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">Cancel</button></div>
                </div>
            </div>}
            {/* New Roadmap Modal */}
            {showNewRoadmapModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="new-roadmap-heading" onKeyDown={e => handleDialogKeyDown(e, isCreating, () => setShowNewRoadmapModal(false))}>
                    <div className="bg-white dark:bg-dark-surface rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 id="new-roadmap-heading" className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
                            Create New Roadmap
                        </h3>
                        <input
                            type="text"
                            value={newRoadmapTitle}
                            onChange={(e) => setNewRoadmapTitle(e.target.value)}
                            aria-label="Roadmap title" maxLength={100} disabled={isCreating} placeholder="e.g. My path to data science"
                            className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:border-primary dark:focus:border-blue-400 outline-none focus:outline-none ring-0 focus:ring-0 mb-4"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createNewRoadmap() } }}
                        />
                        <div className="flex gap-3">
                            <button
                                disabled={isCreating}
                                onClick={() => {
                                    setShowNewRoadmapModal(false)
                                    setNewRoadmapTitle('')
                                }}
                                className="flex-1 px-4 py-2 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createNewRoadmap}
                                disabled={!newRoadmapTitle.trim() || isCreating}
                                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                            >
                                {isCreating ? 'Creating…' : 'Create roadmap'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RoadmapPage
