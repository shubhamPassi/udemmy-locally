import { useCallback, useEffect, useRef } from 'react'
import { addStudyInterval, measuredStudySeconds, saveStudySession } from '../utils/studyTime'
export default function useStudyTime(getPlayback,videoId,courseId) {
    const getter=useRef(getPlayback),flush=useRef(()=>{})
    getter.current=getPlayback
    useEffect(()=>{
        if(!videoId)return
        const id=crypto.randomUUID(),hours={}
        let previous=getter.current(),last=performance.now(),lastSave=0,dirty=false
        function tick(force=false) {
            const now=performance.now(), current=getter.current()
            const seconds=measuredStudySeconds(previous,current,(now-last)/1000)
            if(seconds>0){addStudyInterval(hours,Date.now()-seconds*1000,Date.now());dirty=true}
            previous=current;last=now
            if(dirty&&(force||now-lastSave>=5000)) {
                saveStudySession(id,{videoId,courseId,hours,updatedAt:new Date().toISOString()})
                lastSave=now;dirty=false
            }
        }
        flush.current=()=>tick(true)
        const events=['play','pause','seeking','seeked','waiting','canplay','ratechange','ended']
        const element=getter.current()?.element
        const onChange=()=>tick(true)
        events.forEach(event=>element?.addEventListener(event,onChange))
        const timer=setInterval(tick,1000)
        const hide=()=>tick(true)
        window.addEventListener('pagehide',hide)
        document.addEventListener('visibilitychange',hide)
        return()=>{
            tick(true);clearInterval(timer)
            events.forEach(event=>element?.removeEventListener(event,onChange))
            window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',hide)
            flush.current=()=>{}
        }
    },[videoId,courseId])
    return useCallback(()=>flush.current(),[])
}
