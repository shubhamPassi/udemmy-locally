import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { droppedCourseFolder, hasDroppedFiles } from '../../utils/droppedCourseFolder.js'
import { scanCourseSelection } from '../../utils/fileSystem.js'
import { IS_BROWSER_MODE } from '../../utils/api.js'
import useEventCallback from '../../hooks/useEventCallback.js'

export default function LocalCourseDrop({ onCourse, onError, autoDetectThumbnails, disabled = false }) {
    const [dragging,setDragging] = useState(false), [scanning,setScanning] = useState(false)
    const busy = useRef(false), alive = useRef(true)
    const drop = useEventCallback(async event => {
        if (!hasDroppedFiles(event.dataTransfer)) return
        event.preventDefault()
        setDragging(false)
        if (disabled || busy.current || document.querySelector('[role="dialog"], [aria-modal="true"]')) return
        // Acquire the handle before yielding to an asynchronous scan.
        const selected = droppedCourseFolder(event.dataTransfer)
        busy.current = true;setScanning(true)
        try {
            const handle = await selected
            if (!IS_BROWSER_MODE) throw Error('Use Add Course to select this folder for the companion server.')
            const result = await scanCourseSelection(handle,autoDetectThumbnails)
            if (!alive.current) return
            if (!result?.courses?.[0]?.totalVideos) throw Error('No supported video files found in this folder. Choose a course folder containing videos.')
            onCourse(result.courses.length > 1 ? {type:'collection',...result} : result.courses[0])
        } catch (error) { if (alive.current && error.name !== 'AbortError') onError(error.message || 'Could not scan this folder.') }
        finally { busy.current=false;if (alive.current) setScanning(false) }
    })
    useEffect(() => {
        alive.current=true
        let depth=0
        const reset=()=>{depth=0;setDragging(false)}
        const enter=event=>{if (!hasDroppedFiles(event.dataTransfer)) return;event.preventDefault();if(!disabled&&!busy.current&&!document.querySelector('[role="dialog"], [aria-modal="true"]')){depth++;setDragging(true)}}
        const over=event=>{if(hasDroppedFiles(event.dataTransfer)){event.preventDefault();event.dataTransfer.dropEffect=disabled||busy.current?'none':'copy'}}
        const leave=()=>{depth=Math.max(0,depth-1);if(!depth)setDragging(false)}
        const receive=event=>{depth=0;void drop(event)}
        window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',receive);window.addEventListener('dragend',reset);window.addEventListener('blur',reset)
        return ()=>{alive.current=false;window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',receive);window.removeEventListener('dragend',reset);window.removeEventListener('blur',reset)}
    },[disabled,drop])
    if (!scanning && (!dragging || disabled)) return null
    return <div className="fixed inset-0 z-[70] pointer-events-none bg-black/60 flex items-center justify-center p-6" role="status" aria-live="polite">
        <div className="max-w-md w-full rounded-2xl border-2 border-dashed border-primary bg-white dark:bg-neutral-900 p-10 text-center shadow-xl">
            {scanning ? <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary"/> : <FolderOpen className="mx-auto mb-4 h-10 w-10 text-primary"/>}
            <p className="text-xl font-semibold text-gray-900 dark:text-white">{scanning?'Scanning course folder…':'Drop your course folder here'}</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">{scanning?'Checking videos and sections.':'Review the course before adding it. Files stay on your computer.'}</p>
        </div>
    </div>
}
