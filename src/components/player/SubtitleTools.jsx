import {useEffect,useRef,useState} from 'react'
import {Captions,Upload} from 'lucide-react'
import {parseSubtitles} from '../../utils/subtitles'
export default function SubtitleTools({videoId,host}){
    const [cues,setCues]=useState([]),[enabled,setEnabled]=useState(true),[open,setOpen]=useState(false),[error,setError]=useState('')
    const input=useRef(null)
    const importedTrack=useRef(null)
    useEffect(()=>{setError('');setOpen(false);try{setCues(JSON.parse(localStorage.getItem('tutin_subtitles_'+videoId))||[])}catch{setCues([])}},[videoId])
    useEffect(()=>{
        let track
        const attach=()=>{
            const video=host.current?.querySelector('video')
            if(!video||!window.VTTCue||!video.addTextTrack||track)return
            if(!cues.length)return
            track=video.addTextTrack('subtitles','Imported subtitles','en')
            for(const cue of cues)track.addCue(new VTTCue(cue.start,cue.end,cue.text))
            track.mode=enabled?'showing':'disabled';importedTrack.current=track
        }
        attach()
        const observer=new MutationObserver(attach)
        if(host.current)observer.observe(host.current,{childList:true,subtree:true})
        return()=>{observer.disconnect();if(track){track.mode='disabled';for(const cue of [...(track.cues||[])])track.removeCue(cue)}importedTrack.current=null}
    },[cues,enabled,host])
    async function upload(event){const file=event.target.files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('Subtitle file must be smaller than 2 MB.');const parsed=parseSubtitles(await file.text());localStorage.setItem('tutin_subtitles_'+videoId,JSON.stringify(parsed));setCues(parsed);setEnabled(true);setError('')}catch(err){setError(err.message)}event.target.value=''}
    return <div className="absolute top-2 right-2 z-30"><button aria-label="Subtitle options" title="Subtitles" onClick={()=>setOpen(!open)} className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><Captions className="h-5 w-5"/></button>{open&&<div className="mt-2 max-w-64 rounded-lg bg-neutral-900 p-3 text-white shadow-xl"><input ref={input} type="file" accept=".srt,.vtt" onChange={upload} className="hidden"/><button onClick={()=>input.current.click()} className="flex items-center gap-2 text-xs"><Upload className="h-4 w-4"/>Import SRT / VTT</button>{cues.length>0&&<><button onClick={()=>setEnabled(!enabled)} aria-pressed={enabled} className="mt-3 block text-xs">{enabled?'Turn subtitles off':'Turn subtitles on'}</button><button onClick={()=>{localStorage.removeItem('tutin_subtitles_'+videoId);setCues([])}} className="mt-3 block text-xs text-red-400">Remove imported subtitles</button></>}<p className="mt-2 text-[10px] text-neutral-400">For local and resumable Drive playback.</p>{error&&<p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}</div>}</div>
}
