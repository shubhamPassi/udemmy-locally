import { mergeWatchedRanges, recordWatchedRange } from './watchCoverage.js'
import { invalidatePlaybackBookmarks } from './playbackBookmarks.js'
export function exportProgressBackup() {
    const backup={version:1,bookmarks:{},coverage:{},sessions:{},subtitles:{},preferences:{}}
    for(const key of ['tutin_daily_goal','tutin_hide_upcoming_durations']){
        const value=localStorage.getItem(key)
        if(value!==null)backup.preferences[key]=value
    }
    for(const key of Object.keys(localStorage)) {
        const group=key.startsWith('tutin_playback_')?'bookmarks':key.startsWith('tutin_coverage_')?'coverage':key.startsWith('tutin_study_session_')?'sessions':key.startsWith('tutin_subtitles_')?'subtitles':null
        if(!group)continue
        try{backup[group][key]=JSON.parse(localStorage.getItem(key))}catch{}
    }
    return backup
}
export function restoreProgressBackup(backup) {
    if(backup?.version!==1)return
    const goal=Number(backup.preferences?.tutin_daily_goal)
    if(backup.preferences?.tutin_daily_goal!==undefined&&[0,15,30,45,60,90,120].includes(goal))localStorage.setItem('tutin_daily_goal',String(goal))
    const hidden=backup.preferences?.tutin_hide_upcoming_durations
    if(hidden==='true'||hidden==='false')localStorage.setItem('tutin_hide_upcoming_durations',hidden)
    if(typeof window!=='undefined')window.dispatchEvent(new Event('tutin-preferences-restored'))
    for(const [key,cues] of Object.entries(backup.subtitles||{})){
        if(!key.startsWith('tutin_subtitles_')||!Array.isArray(cues))continue
        const valid=cues.filter(cue=>Number.isFinite(cue?.start)&&cue.start>=0&&Number.isFinite(cue.end)&&cue.end>cue.start&&typeof cue.text==='string')
        localStorage.setItem(key,JSON.stringify(valid))
    }
    for(const [key,value] of Object.entries(backup.bookmarks||{})) {
        if(!key.startsWith('tutin_playback_')||!value||(!Number.isFinite(value.position)&&typeof value.isCompleted!=='boolean'))continue
        if(value.position!==undefined&&value.position<0)continue
        let existing
        try{existing=JSON.parse(localStorage.getItem(key))}catch{}
        if(existing?.updatedAt&&existing.updatedAt>value.updatedAt)continue
        localStorage.setItem(key,JSON.stringify(value))
    }
    invalidatePlaybackBookmarks()
    for(const [key,value] of Object.entries(backup.coverage||{})) {
        if(!key.startsWith('tutin_coverage_')||!Array.isArray(value))continue
        for(const [start,end] of mergeWatchedRanges(value,0,0))recordWatchedRange(key.slice('tutin_coverage_'.length),start,end)
    }
    for(const [key,value] of Object.entries(backup.sessions||{})) {
        if(!key.startsWith('tutin_study_session_')||value?.version!==1)continue
        const hours={}
        let existing
        try{existing=JSON.parse(localStorage.getItem(key))}catch{}
        for(const record of [existing,value])for(const [hour,seconds] of Object.entries(record?.hours||{})) {
            if(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(hour)&&Number.isFinite(seconds)&&seconds>0)hours[hour]=Math.max(hours[hour]||0,seconds)
        }
        // A backup restore must surface storage failures instead of reporting a
        // successful import after dropping study-time records.
        localStorage.setItem(key,JSON.stringify({version:1,videoId:value.videoId,courseId:value.courseId,hours,updatedAt:value.updatedAt}))
    }
}
