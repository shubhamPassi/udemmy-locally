import {useEffect,useMemo,useRef,useState} from 'react'
import {BookOpen,X} from 'lucide-react'
import {createLearningPlayerTools,normalizeChapters} from '../../utils/learningPlayerTools.js'
import {formatPreviewTime} from '../../utils/timelinePreview.js'
import {readProgressValue,writeProgressValue} from '../../utils/progressStorage.js'
import {getNotesByVideo} from '../../utils/db.js'
export default function PlayerLearningTools({mediaRef,youtubeRef,hostRef,video,onMarkers,onRepeatChange}) {
    const [open,setOpen]=useState(false),[error,setError]=useState(''),[title,setTitle]=useState(''),[chapters,setChapters]=useState([]),[notes,setNotes]=useState([]),[state,setState]=useState({a:null,b:null,enabled:false,sleepUntil:0})
    const button=useRef(null),panel=useRef(null)
    const [panelHeight,setPanelHeight]=useState(260)
    const id=video?.id
    const adapter=useMemo(()=>({
        read:()=>youtubeRef?.current?.getCurrentTime?{time:youtubeRef.current.getCurrentTime(),duration:youtubeRef.current.getDuration(),paused:youtubeRef.current.getPlayerState()!==1,ended:youtubeRef.current.getPlayerState()===0}:mediaRef?.current?{time:mediaRef.current.currentTime,duration:mediaRef.current.duration,paused:mediaRef.current.paused,seeking:mediaRef.current.seeking,ended:mediaRef.current.ended}:null,
        seek:time=>youtubeRef?.current?.seekTo?youtubeRef.current.seekTo(time,true):mediaRef?.current&&(mediaRef.current.currentTime=time),
        pause:()=>youtubeRef?.current?.pauseVideo?youtubeRef.current.pauseVideo():mediaRef?.current?.pause(),
        play:()=>youtubeRef?.current?.playVideo?youtubeRef.current.playVideo():mediaRef?.current?.play()?.catch(()=>{}),
        beforeLoop:()=>mediaRef?.current?.dispatchEvent(new Event('tutin-playback-checkpoint')),
    }),[mediaRef,youtubeRef])
    const tools=useMemo(()=>({videoId:id,controller:createLearningPlayerTools(adapter)}),[adapter,id]).controller
    useEffect(()=>{let active=true;setOpen(false);setError('');setTitle('');try{setChapters(normalizeChapters(JSON.parse(readProgressValue('tutin_chapters_'+id))))}catch{setChapters([])}
        const refresh=()=>{if(id)getNotesByVideo(id).then(rows=>{if(active)setNotes(rows)}).catch(()=>{if(active)setNotes([])})}
        refresh();window.addEventListener('tutin-notes-changed',refresh)
        return()=>{active=false;window.removeEventListener('tutin-notes-changed',refresh)}
    },[id])
    useEffect(()=>{const tick=()=>{tools.tick();const next=tools.state();setState(previous=>Object.keys(next).every(key=>previous[key]===next[key])?previous:next)};tick();const timer=setInterval(tick,250);return()=>clearInterval(timer)},[tools])
    useEffect(()=>{const media=mediaRef?.current;if(media)media.dataset.repeatSection=String(state.enabled);onRepeatChange?.(state.enabled);return()=>{if(media)delete media.dataset.repeatSection;onRepeatChange?.(false)}},[state.enabled,mediaRef,onRepeatChange])
    useEffect(()=>{if(!open)return;const resize=()=>setPanelHeight(Math.max(120,Math.min(420,(hostRef?.current?.getBoundingClientRect().height||window.innerHeight)-80)));resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[open,hostRef])
    const markers=useMemo(()=>[...chapters.map(chapter=>({...chapter,kind:'chapter'})),...notes.filter(note=>Number.isFinite(note.timestamp)).map(note=>({time:note.timestamp,title:String(note.content||'Note').replace(/<[^>]*>/g,'').slice(0,60),kind:'note'}))].sort((a,b)=>a.time-b.time),[chapters,notes])
    useEffect(()=>{onMarkers?.(markers)},[markers,onMarkers])
    useEffect(()=>{button.current?.dispatchEvent(new Event('tutin-player-menu-change',{bubbles:true}))},[open])
    useEffect(()=>{if(!open)return;panel.current?.querySelector('button')?.focus();const close=event=>{
        if(event.key==='Escape'){event.preventDefault();setOpen(false);button.current?.focus()}
        if(event.key==='Tab'){const controls=[...panel.current.querySelectorAll('button,input,select,summary')].filter(control=>!control.disabled),first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
    };const outside=event=>{if(!panel.current?.contains(event.target)&&!button.current?.contains(event.target))setOpen(false)};document.addEventListener('keydown',close);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',outside)}},[open])
    function act(action){try{setError('');action();setState(tools.state())}catch(problem){setError(problem.message)}}
    function addChapter(){const time=adapter.read()?.time;if(!id||!Number.isFinite(time)||!title.trim())return;const next=normalizeChapters([...chapters,{time,title}]);setChapters(next);writeProgressValue('tutin_chapters_'+id,JSON.stringify(next));setTitle('')}
    const control='min-h-10 rounded-lg border border-white/20 px-3 py-2 text-xs text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
    return <>
        <button ref={button} type="button" aria-label="Learning tools" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="flex h-10 w-7 sm:w-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"><BookOpen className="h-5 w-5"/></button>
        {open&&<div ref={panel} role="dialog" aria-label="Learning tools" data-player-menu-open="true" style={{top:youtubeRef?48:undefined,bottom:youtubeRef?undefined:64,right:12,width:'min(320px, calc(100vw - 24px))',maxHeight:panelHeight}} className="absolute z-40 overflow-y-auto rounded-xl border border-white/20 bg-neutral-950 p-4 text-white shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Learning tools</h3><button className={control} aria-label="Close learning tools" onClick={()=>{setOpen(false);button.current?.focus()}}><X className="h-4 w-4"/></button></div>
            <p className="mt-4 text-xs font-semibold">Repeat a section</p><div className="mt-2 flex flex-wrap gap-2"><button className={control} onClick={()=>act(()=>tools.setA(adapter.read()?.time||0))}>A {state.a===null?'':formatPreviewTime(state.a)}</button><button className={control} onClick={()=>act(()=>tools.setB(adapter.read()?.time||0))}>B {state.b===null?'':formatPreviewTime(state.b)}</button><button className={control} aria-pressed={state.enabled} onClick={()=>act(()=>tools.toggleLoop())}>{state.enabled?'Stop repeat':'Repeat A–B'}</button></div>
            <label className="mt-4 block text-xs font-semibold">Sleep timer<select aria-label="Sleep timer" className="mt-2 block w-full rounded-lg border border-white/20 bg-neutral-900 p-2 text-sm" value={state.sleepMinutes||0} onChange={event=>act(()=>tools.sleep(Number(event.target.value)))}>{[0,15,30,60].map(minutes=><option key={minutes} value={minutes}>{minutes?`${minutes} minutes`:'Off'}</option>)}</select></label>{state.sleepUntil>0&&<p className="mt-1 text-xs text-neutral-400">Pauses at {new Date(state.sleepUntil).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>}
            <p className="mt-4 text-xs font-semibold">Chapters and notes</p><div className="mt-2 flex gap-2"><input aria-label="Chapter title" value={title} maxLength={100} onChange={event=>setTitle(event.target.value)} placeholder="Chapter title" className="min-w-0 flex-1 rounded border border-white/20 bg-neutral-900 p-2 text-xs"/><button className={control} disabled={!title.trim()} onClick={addChapter}>Add here</button></div>
            <div className="mt-2 space-y-1">{markers.map((marker,index)=><div key={`${marker.kind}-${marker.time}-${index}`} className="flex items-center gap-1"><button className={`${control} min-w-0 flex-1 text-left`} onClick={()=>adapter.seek(marker.time)}>{formatPreviewTime(marker.time)} · {marker.title}</button>{marker.kind==='chapter'&&<button className={control} aria-label={`Remove chapter ${marker.title}`} onClick={()=>{const next=chapters.filter(chapter=>chapter.time!==marker.time||chapter.title!==marker.title);setChapters(next);writeProgressValue('tutin_chapters_'+id,JSON.stringify(next))}}>×</button>}</div>)}</div>
            <details className="mt-4 text-xs"><summary className="cursor-pointer py-2 font-semibold">Keyboard shortcuts</summary><dl className="mt-2 grid grid-cols-2 gap-2"><dt>Space / K</dt><dd>Play or pause</dd><dt>J / L</dt><dd>Back / forward 10s</dd><dt>← / →</dt><dd>Back / forward 5s</dd><dt>↑ / ↓</dt><dd>Volume</dd><dt>M / F / C</dt><dd>Mute / fullscreen / captions</dd><dt>0–9</dt><dd>Jump through video</dd><dt>, / .</dt><dd>Previous / next frame</dd><dt>Shift + N / P</dt><dd>Next / previous lesson</dd><dt>Shift + &lt; / &gt;</dt><dd>Playback speed</dd></dl></details>
            {error&&<p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
        </div>}
    </>
}
