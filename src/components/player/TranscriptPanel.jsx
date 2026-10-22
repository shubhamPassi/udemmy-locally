import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../../contexts/contextHooks.js'
import { activeTranscriptIndex, cachedTranscript, loadLessonTranscript } from '../../utils/lessonTranscript.js'
import { formatPreviewTime } from '../../utils/timelinePreview.js'

export default function TranscriptPanel({ video, currentTime=0, onSeek }) {
    const {settings}=useSettings()
    const [cues,setCues]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[follow,setFollow]=useState(true),[query,setQuery]=useState(''),[attempt,setAttempt]=useState(0)
    const activeRow=useRef(null),lines=useRef(null)
    const active=activeTranscriptIndex(cues,currentTime)
    useEffect(()=>{
        if(!video?.id)return
        let alive=true
        const controller=new AbortController()
        setCues(cachedTranscript(video));setLoading(true);setError('')
        const timer=setTimeout(()=>{controller.abort();if(alive){setError('Transcript lookup timed out. Retry when the source is available.');setLoading(false)}},25000)
        loadLessonTranscript(video,settings.googleApiKey,{signal:controller.signal,force:attempt>0}).then(value=>{if(alive&&!controller.signal.aborted)setCues(value)}).catch(err=>{if(alive&&!controller.signal.aborted)setError(err.message)}).finally(()=>{clearTimeout(timer);if(alive&&!controller.signal.aborted)setLoading(false)})
        const changed=event=>{if(event.detail?.videoId===video.id)setCues(cachedTranscript(video))}
        window.addEventListener('tutin-subtitles-changed',changed)
        return()=>{alive=false;controller.abort();clearTimeout(timer);window.removeEventListener('tutin-subtitles-changed',changed)}
    },[video,settings.googleApiKey,attempt])
    useEffect(()=>{setQuery('');setAttempt(0);setFollow(true)},[video?.id])
    useEffect(()=>{
        if(!follow||query)return
        const list=lines.current,row=activeRow.current
        if(!list||!row)return
        const align=()=>{
            // Leave enough trailing space to align even the final cue at the
            // top. Scroll this list only, never the player or surrounding page.
            list.style.paddingBottom=Math.max(8,list.clientHeight-row.offsetHeight-8)+'px'
            const top=Math.max(0,row.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop-8)
            list.scrollTo?.({top,behavior:'smooth'})
        }
        align()
        const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(align):null
        resize?.observe(list);resize?.observe(row)
        return()=>resize?.disconnect()
    },[active,follow,query])
    return <section className="h-full min-h-0 flex flex-col" aria-label="Lesson transcription">
        <div className="p-3 border-b border-light-border dark:border-dark-border space-y-3">
            <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-sm">Transcription</h3><label className="text-xs flex items-center gap-2"><input type="checkbox" checked={follow} onChange={event=>setFollow(event.target.checked)}/>Follow video</label></div>
            <input aria-label="Search transcription" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search transcription…" className="w-full rounded border border-light-border dark:border-dark-border bg-transparent p-2 text-sm"/>
            {loading&&<p role="status" className="text-xs">Loading transcription…</p>}
            {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
            <button disabled={loading} onClick={()=>setAttempt(value=>value+1)} className="text-xs text-blue-500 disabled:opacity-50">Refresh transcription</button>
        </div>
        <div ref={lines} data-transcript-lines className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {cues.map((cue,index)=>({cue,index})).filter(({cue})=>!query||cue.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(({cue,index})=><button key={`${cue.start}-${index}`} ref={index===active?activeRow:null} aria-current={index===active?'true':undefined} onClick={()=>onSeek?.(cue.start)} className={`w-full rounded-lg p-3 text-left text-sm ${index===active?'bg-blue-500/15 text-blue-600 dark:text-blue-300':'hover:bg-black/5 dark:hover:bg-white/5'}`}><span className="block text-xs text-blue-500 mb-1">{formatPreviewTime(cue.start)}</span>{cue.text}</button>)}
            {!loading&&!error&&!cues.length&&<p className="p-3 text-sm text-neutral-500">No transcription available for this lesson.</p>}
            {query&&cues.length>0&&!cues.some(cue=>cue.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))&&<p className="p-3 text-sm text-neutral-500">No matching text.</p>}
        </div>
    </section>
}
