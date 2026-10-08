import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw } from 'lucide-react'

export default function ClearProgressDialog({ busy, onCancel, onConfirm }) {
    const panel = useRef(null), cancelButton = useRef(null)
    useEffect(() => {
        const previousFocus = document.activeElement
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        cancelButton.current?.focus()
        return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
    }, [])
    function keydown(event) {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); if (!busy) onCancel() }
        if (event.key !== 'Tab') return
        const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')]
        if (!buttons.length) { event.preventDefault(); return }
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus() }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() }
    }
    return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" onClick={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
        <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby="clear-progress-title" aria-describedby="clear-progress-description" onKeyDown={keydown} className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-neutral-900 p-6 shadow-xl text-gray-900 dark:text-white">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-500"><RotateCcw className="h-5 w-5" /></div>
            <h2 id="clear-progress-title" className="text-xl font-semibold">Clear your progress?</h2>
            <p id="clear-progress-description" className="mt-3 text-sm leading-6 text-gray-600 dark:text-neutral-400">This will reset completed lessons, watched positions, and watch history for all courses. Your courses and notes will be kept.</p>
            <div className="mt-6 flex items-center justify-between gap-3">
                <button onClick={onConfirm} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{busy ? 'Clearing…' : 'Clear progress'}</button>
                <button ref={cancelButton} onClick={onCancel} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Cancel</button>
            </div>
        </div>
    </div>, document.body)
}
