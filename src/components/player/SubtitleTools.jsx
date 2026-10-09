import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {MessageSquare,Upload,Settings,Check,X,ChevronDown} from 'lucide-react'
import {parseSubtitles} from '../../utils/subtitles'

function savedAppearance(){
    try{const saved=JSON.parse(localStorage.getItem('tutin_caption_appearance'));
        return {size:[14,18,22,26,32].includes(saved?.size)?saved.size:26,background:saved?.background==='dark'?'dark':'transparent'}
    }catch{return {size:26,background:'transparent'}}
}
export default function SubtitleTools({videoId,host,keyboardShortcuts=true}){
    const [cues,setCues]=useState([]),[enabled,setEnabled]=useState(true),[open,setOpen]=useState(false),[error,setError]=useState('')
    const [slot,setSlot]=useState(null),[appearance,setAppearance]=useState(savedAppearance)
    const [showAppearance,setShowAppearance]=useState(false),[panelHeight,setPanelHeight]=useState(360)
    const input=useRef(null),menu=useRef(null),importedTrack=useRef(null),trackVideo=useRef(null),appliedCues=useRef(null),enabledRef=useRef(enabled)
    enabledRef.current=enabled
    useEffect(()=>{
        setError('');setOpen(false);setShowAppearance(false)
        try{const stored=JSON.parse(localStorage.getItem('tutin_subtitles_'+videoId));setCues(Array.isArray(stored)?stored:[])}catch{setCues([])}
    },[videoId])
    useEffect(()=>{
        const attach=()=>{
            const target=host.current?.querySelector('[data-subtitle-controls]')||null
            setSlot(previous=>previous===target?previous:target)
            const video=host.current?.querySelector('video'),Cue=window.VTTCue||window.WebKitVTTCue
            if(!video||!Cue||!video.addTextTrack)return
            if(trackVideo.current!==video){
                if(importedTrack.current)importedTrack.current.mode='disabled'
                trackVideo.current=video;importedTrack.current=null;appliedCues.current=null
            }
            if(!cues.length&&!importedTrack.current)return
            const marker=videoId.replace(/[^a-zA-Z0-9_-]/g,'_')
            video.dataset.subtitlePlayer=marker
            if(!importedTrack.current)importedTrack.current=video.addTextTrack('subtitles','Imported subtitles','')
            const track=importedTrack.current
            if(appliedCues.current!==cues){
                track.mode='hidden'
                for(const existing of [...(track.cues||[])])track.removeCue(existing)
                for(const cue of cues){const item=new Cue(cue.start,cue.end,cue.text);item.align='center';item.position=50;item.size=88;track.addCue(item)}
                appliedCues.current=cues
            }
            const visible=target?.closest('[data-controls-visible]')?.dataset.controlsVisible!=='false'
            for(const cue of [...(track.cues||[])])cue.line=visible?-4:-2
            track.mode=enabledRef.current&&cues.length?'showing':'disabled'
        }
        attach()
        const observer=new MutationObserver(attach)
        if(host.current)observer.observe(host.current,{childList:true,subtree:true,attributes:true,attributeFilter:['data-controls-visible']})
        return()=>observer.disconnect()
    },[cues,host,videoId])
    useEffect(()=>{if(importedTrack.current)importedTrack.current.mode=enabled&&cues.length?'showing':'disabled'},[enabled,cues])
    useEffect(()=>{
        if(!open)return
        const resize=()=>setPanelHeight(Math.max(120,Math.min(360,(host.current?.getBoundingClientRect().height||440)-80)))
        resize();window.addEventListener('resize',resize)
        const outside=event=>{if(!menu.current?.contains(event.target))setOpen(false)}
        const escape=event=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation()}}
        document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true)
        return()=>{window.removeEventListener('resize',resize);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)}
    },[open])
    useEffect(()=>{slot?.dispatchEvent(new Event('tutin-subtitle-menu-change',{bubbles:true}))},[open,slot])
    useEffect(()=>{
        if(!keyboardShortcuts||!slot)return
        const keydown=event=>{
            if(event.key.toLowerCase()!=='c'||event.ctrlKey||event.metaKey||event.altKey||event.repeat)return
            if(event.target.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]'))return
            event.preventDefault();event.stopImmediatePropagation()
            if(cues.length)setEnabled(previous=>!previous)
            else setOpen(previous=>!previous)
        }
        window.addEventListener('keydown',keydown,true);return()=>window.removeEventListener('keydown',keydown,true)
    },[keyboardShortcuts,cues.length,slot])
    function changeAppearance(updates){const next={...appearance,...updates};setAppearance(next);try{localStorage.setItem('tutin_caption_appearance',JSON.stringify(next))}catch{}}
    async function upload(event){
        const file=event.target.files?.[0];if(!file)return
        try{
            if(file.size>2*1024*1024)throw Error('Subtitle file must be smaller than 2 MB.')
            const parsed=parseSubtitles(await file.text())
            localStorage.setItem('tutin_subtitles_'+videoId,JSON.stringify(parsed))
            setCues(parsed);setEnabled(true);setError('');setOpen(false)
        }catch(err){setError(err.message)}
        event.target.value=''
    }
    if(!slot)return null
    const marker=videoId.replace(/[^a-zA-Z0-9_-]/g,'_')
    const button='relative h-10 w-7 sm:w-10 flex shrink-0 items-center justify-center rounded text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
    return createPortal(<div ref={menu} data-subtitle-menu-open={open?'true':'false'} className="relative flex shrink-0 items-center">
        <style>{`video[data-subtitle-player="${marker}"]::cue{color:#fff;background-color:${appearance.background==='dark'?'rgba(0,0,0,.78)':'transparent'};font-family:Arial,Helvetica,sans-serif;font-size:${appearance.size}px;font-weight:600;text-shadow:0 2px 4px #000,1px 1px 2px #000,-1px -1px 2px #000;}`}</style>
        <input ref={input} type="file" accept=".srt,.vtt" onChange={upload} className="hidden"/>
        <button onClick={()=>setOpen(!open)} className={button} aria-label="Subtitle settings" aria-expanded={open} title="Subtitles (C)"><MessageSquare className="h-6 w-6" strokeWidth={1.8}/></button>
        {open&&<div role="dialog" aria-label="Subtitle settings" style={{maxHeight:panelHeight}} className="absolute bottom-14 right-0 z-40 w-72 max-w-[calc(100vw-32px)] overflow-y-auto rounded-md border border-white/10 bg-black/95 text-sm text-white shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-2"><span className="text-base font-semibold tracking-wide">Subtitles</span><button onClick={()=>setOpen(false)} className="rounded p-1 text-neutral-400 hover:text-white" aria-label="Close subtitle settings"><X className="h-4 w-4"/></button></div>
            <div role="group" aria-label="Subtitle selection" className="pb-2">
                <button aria-pressed={!enabled||!cues.length} onClick={()=>{setEnabled(false);setOpen(false)}} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/10"><span className="w-4">{(!enabled||!cues.length)&&<Check className="h-4 w-4"/>}</span><span className={!enabled||!cues.length?'font-semibold text-white':'text-neutral-300'}>Off</span></button>
                {cues.length>0&&<button aria-pressed={enabled} onClick={()=>{setEnabled(true);setOpen(false)}} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/10"><span className="w-4">{enabled&&<Check className="h-4 w-4"/>}</span><span className={enabled?'font-semibold text-white':'text-neutral-300'}>Imported subtitles</span></button>}
            </div>
            <button onClick={()=>input.current.click()} className="flex w-full items-center gap-3 border-t border-white/10 px-5 py-3 text-left text-xs text-neutral-300 hover:bg-white/10"><Upload className="h-4 w-4"/>Import subtitle file</button>
            <button aria-expanded={showAppearance} onClick={()=>setShowAppearance(!showAppearance)} className="flex w-full items-center gap-3 border-t border-white/10 px-5 py-3 text-left text-xs text-neutral-300 hover:bg-white/10"><Settings className="h-4 w-4"/>Caption appearance<ChevronDown className={`ml-auto h-4 w-4 transition-transform ${showAppearance?'rotate-180':''}`}/></button>
            {showAppearance&&<div className="space-y-3 bg-white/5 px-5 py-4 text-xs">
                <label className="flex items-center justify-between gap-3"><span>Text size</span><select aria-label="Caption font size" value={appearance.size} onChange={event=>changeAppearance({size:Number(event.target.value)})} className="rounded bg-neutral-800 px-2 py-1 text-xs text-white">{[14,18,22,26,32].map(size=><option key={size} value={size}>{size}px</option>)}</select></label>
                <label className="flex items-center justify-between gap-3"><span>Background</span><select aria-label="Caption background" value={appearance.background} onChange={event=>changeAppearance({background:event.target.value})} className="rounded bg-neutral-800 px-2 py-1 text-xs text-white"><option value="transparent">None</option><option value="dark">Dark</option></select></label>
                <button onClick={()=>changeAppearance({size:26,background:'transparent'})} className="text-neutral-400 hover:text-white">Reset appearance</button>
            </div>}
            {cues.length>0&&<button onClick={()=>{localStorage.removeItem('tutin_subtitles_'+videoId);setCues([]);setOpen(false)}} className="w-full border-t border-white/10 px-5 py-3 text-left text-xs text-neutral-500 hover:bg-white/10 hover:text-neutral-300">Remove imported subtitles</button>}
            {!cues.length&&<p className="px-5 pb-4 text-xs leading-5 text-neutral-400">Add an SRT or VTT file to display subtitles.</p>}
            {error&&<p role="alert" className="px-5 pb-4 text-xs text-red-400">{error}</p>}
        </div>}
    </div>,slot)
}
