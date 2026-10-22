import { useRef, useState } from 'react'
import useModalFocus from '../../hooks/useModalFocus.js'
import { useSettings } from '../../contexts/contextHooks.js'
import { getCourseContent, recalculateAllCoursesProgress } from '../../utils/db.js'
import { applyRemoteSync, parseRemoteSource, planRemoteSync, scanRemoteSource, rememberRemoteSource } from '../../utils/remoteCourseSync.js'

export default function RemoteSyncModal({ course, onClose, onSynced }) {
    const host=useRef(null)
    const {settings}=useSettings()
    const [url,setUrl]=useState(course.customMetadata?.remoteSource?.url || '')
    const [rememberedUrl,setRememberedUrl]=useState(course.customMetadata?.remoteSource?.url || '')
    const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null)
    useModalFocus(true,host,()=>{if(!busy)onClose()})
    async function scan() {
        setBusy(true);setError('');setPreview(null)
        try {
            const source=parseRemoteSource(url)
            const [content,incoming]=await Promise.all([getCourseContent(course.id),scanRemoteSource(source)])
            const next=planRemoteSync(content,incoming,source)
            // Remember only after confirming this source matches the course.
            // Applying lesson updates is a separate, optional action.
            await rememberRemoteSource(course.id,source)
            setUrl(source.url);setRememberedUrl(source.url);setPreview(next)
            await onSynced?.()
        }
        catch(err){setError(err.message)}finally{setBusy(false)}
    }
    async function apply() {
        setBusy(true);setError('')
        try { const next=await applyRemoteSync(course.id,preview);setResult(next);await recalculateAllCoursesProgress(settings.progressCalculationMode);await onSynced?.() }catch(err){setError(err.message)}finally{setBusy(false)}
    }
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section ref={host} role="dialog" aria-modal="true" aria-label="Resync online course" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-dark-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold">Resync {course.title}</h2>
        <p className="text-sm">Scan the original YouTube playlist or Google Drive course folder for new videos and updated subtitle references. Existing lessons, progress, notes, and custom titles are preserved, including videos no longer listed by the source.</p>
        {!result&&<><label className="block text-sm">Original source URL<input aria-label="Original source URL" value={url} disabled={busy} onChange={event=>{setUrl(event.target.value);setPreview(null)}} className="mt-2 w-full rounded border border-light-border dark:border-dark-border bg-transparent p-2" /></label>
        <p role="status" className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{rememberedUrl&&url===rememberedUrl?'Source URL saved. Future syncs will use this address.':'After a successful scan, this URL is remembered even if you cancel without applying updates.'}</p>
        <button disabled={busy||!url.trim()} onClick={scan} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy?'Working…':preview?'Scan again':'Scan for updates'}</button>
        {preview&&<div role="status" aria-live="polite" aria-label="Scan results" className="text-sm space-y-2"><h3 className="font-semibold">Scan complete</h3><p>{preview.additions.length} new videos · {preview.updates.length} existing videos to refresh · {preview.subtitleFiles} subtitle files</p><p>{preview.missing} unlisted videos will be kept. Subtitle and transcript text refreshes when the lesson is opened; unavailable YouTube captions are reported without interrupting playback.</p><button onClick={apply} disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Apply updates</button></div>}</>}
        {result&&<p role="status">Synced: {result.added} new videos, {result.updated} refreshed lessons, {result.subtitleFiles} subtitle files linked.</p>}
        {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
        <button disabled={busy} onClick={onClose} className="rounded border border-light-border dark:border-dark-border px-4 py-2">{result?'Done':'Cancel'}</button>
    </section></div>
}
