import { isProgressResetting } from './playbackBookmarks.js'
const prefix='tutin_study_session_'
const sessionCache=new Map()
let sessionSnapshot=[]
export function hourKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}`
}
export function addStudyInterval(hours,start,end) {
    let cursor=start
    while(cursor<end) {
        const date=new Date(cursor), next=new Date(date)
        next.setHours(date.getHours()+1,0,0,0)
        const boundary=Math.min(end,next.getTime())
        if(boundary<=cursor)break
        const key=hourKey(date)
        hours[key]=(hours[key]||0)+(boundary-cursor)/1000
        cursor=boundary
    }
}
export function measuredStudySeconds(previous,current,elapsed) {
    if(!previous?.playing || !current || current.seeking || elapsed<=0) return 0
    const advanced=current.time-previous.time, rate=previous.rate||1
    if(advanced<=0 || advanced>elapsed*rate+2) return 0
    return Math.min(elapsed,advanced/rate)
}
export function saveStudySession(id,record) {
    if(isProgressResetting())return
    try {localStorage.setItem(prefix+id,JSON.stringify({version:1,...record}))}catch{}
}
export function readStudySessions() {
    const records=[],seen=new Set()
    try {
        for(const key of Object.keys(localStorage)) {
            if(!key.startsWith(prefix))continue
            seen.add(key)
            try {
                const raw=localStorage.getItem(key),cached=sessionCache.get(key)
                if(cached?.raw===raw){if(cached.record)records.push(cached.record);continue}
                let record
                try{record=JSON.parse(raw)}catch{sessionCache.set(key,{raw,record:null});continue}
                if(record?.version!==1){sessionCache.set(key,{raw,record:null});continue}
                const hours={}
                for(const [hour,seconds] of Object.entries(record.hours||{})) if(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(hour)&&Number.isFinite(seconds)&&seconds>0) hours[hour]=seconds
                const validated={...record,hours}
                sessionCache.set(key,{raw,record:validated})
                records.push(validated)
            }catch{}
        }
    }catch{}
    for(const key of sessionCache.keys())if(!seen.has(key))sessionCache.delete(key)
    if(records.length!==sessionSnapshot.length||records.some((record,index)=>record!==sessionSnapshot[index]))sessionSnapshot=records
    return sessionSnapshot
}
export function readStudyHours() {
    const hours={}
    for(const record of readStudySessions())for(const [hour,seconds] of Object.entries(record.hours))hours[hour]=(hours[hour]||0)+seconds
    return hours
}
export function clearStudyHistory() {
    try {for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key)}catch{}
    sessionCache.clear();sessionSnapshot=[]
}
export function studyTimeLabel(seconds) {
    const value=Math.floor(Math.max(0,seconds||0))
    if(value>=3600)return `${Math.floor(value/3600)}h ${Math.floor(value%3600/60)}m`
    if(value>=60)return `${Math.floor(value/60)}m`
    return `${value}s`
}
