import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Captions,Upload,Settings,Check,X} from 'lucide-react'
import {parseSubtitles} from '../../utils/subtitles'

function savedAppearance(){
    try{const saved=JSON.parse(localStorage.getItem('tutin_caption_appearance'));
        return {size:[14,18,22,26,32].includes(saved?.size)?saved.size:22,background:saved?.background==='transparent'?'transparent':'dark'}
    }catch{return {size:22,background:'dark'}}
}
export default function SubtitleTools({videoId,host,keyboardShortcuts=true}){
    const [cues,setCues]=useState([]),[enabled,setEnabled]=useState(true),[open,setOpen]=useState(false),[error,setError]=useState('')
    const [slot,setSlot]=useState(null),[appearance,setAppearance]=useState(savedAppearance)
    const input=useRef(null),menu=useRef(null),importedTrack=useRef(null),trackVideo=useRef(null),appliedCues=useRef(null),enabledRef=useRef(enabled)
    enabledRef.current=enabled
    useEffect(()=>{
        setError('');setOpen(false)
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
        const outside=event=>{if(!menu.current?.contains(event.target))setOpen(false)}
        const escape=event=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation()}}
        document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true)
        return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)}
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
        <style>{`video[data-subtitle-player="${marker}"]::cue{color:#fff;background-color:${appearance.background==='dark'?'rgba(0,0,0,.78)':'transparent'};font-family:Arial,Roboto,sans-serif;font-size:${appearance.size}px;font-weight:500;text-shadow:0 1px 2px #000;}`}</style>
        <input ref={input} type="file" accept=".srt,.vtt" onChange={upload} className="hidden"/>
        <button onClick={()=>cues.length?setEnabled(!enabled):setOpen(!open)} className={button} aria-label={cues.length?(enabled?'Turn subtitles off':'Turn subtitles on'):'Add subtitles'} aria-pressed={enabled&&cues.length>0} title="Subtitles / closed captions (C)"><Captions className="h-5 w-5"/>{enabled&&cues.length>0&&<span className="absolute bottom-1 left-1.5 right-1.5 h-0.5 rounded bg-red-500"/>}</button>
        <button onClick={()=>setOpen(!open)} className={button} aria-label="Subtitle settings" aria-expanded={open} title="Subtitle settings"><Settings className="h-5 w-5"/></button>
        {open&&<div role="dialog" aria-label="Subtitle settings" className="absolute bottom-14 right-0 z-40 w-64 max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 text-sm text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><span className="font-semibold">Subtitles</span><button onClick={()=>setOpen(false)} className="rounded p-1 hover:bg-white/10" aria-label="Close subtitle settings"><X className="h-4 w-4"/></button></div>
            {cues.length>0?<button onClick={()=>setEnabled(!enabled)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/10"><span>Imported subtitles</span>{enabled?<Check className="h-4 w-4 text-white"/>:<span className="text-xs text-neutral-400">Off</span>}</button>:<p className="px-4 pt-3 text-xs leading-5 text-neutral-400">Import a subtitle file to add captions to this video.</p>}
            <button onClick={()=>input.current.click()} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10"><Upload className="h-4 w-4"/>Import SRT / VTT</button>
            <div className="space-y-3 border-t border-white/10 px-4 py-3">
                <label className="flex items-center justify-between gap-3"><span>Font size</span><select aria-label="Caption font size" value={appearance.size} onChange={event=>changeAppearance({size:Number(event.target.value)})} className="rounded bg-neutral-800 px-2 py-1 text-xs text-white">{[14,18,22,26,32].map(size=><option key={size} value={size}>{size}px</option>)}</select></label>
                <label className="flex items-center justify-between gap-3"><span>Background</span><select aria-label="Caption background" value={appearance.background} onChange={event=>changeAppearance({background:event.target.value})} className="rounded bg-neutral-800 px-2 py-1 text-xs text-white"><option value="dark">Dark</option><option value="transparent">Transparent</option></select></label>
            </div>
            {cues.length>0&&<button onClick={()=>{localStorage.removeItem('tutin_subtitles_'+videoId);setCues([]);setOpen(false)}} className="w-full border-t border-white/10 px-4 py-3 text-left text-xs text-neutral-400 hover:bg-white/10">Remove imported subtitles</button>}
            {error&&<p role="alert" className="px-4 pb-3 text-xs text-red-400">{error}</p>}
        </div>}
    </div>,slot)
}
