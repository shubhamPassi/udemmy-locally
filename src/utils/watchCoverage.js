import { isProgressResetting } from './playbackBookmarks.js'
import { writeProgressValue, readProgressValue, clearProgressPrefix } from './progressStorage.js'
import {mergeWatchedRanges} from './progressRecords.js'
export {mergeWatchedRanges} from './progressRecords.js'
const prefix = 'tutin_coverage_'
const cache = new Map(), listeners = new Set()
const durations = new Map()
let version = 0
const notify = () => { version++; listeners.forEach(listener => listener()) }
export const subscribeCoverage = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export const coverageVersion = () => version
export function recordVideoDuration(id,duration) {
    if(!Number.isFinite(duration)||duration<=0||durations.get(id)===duration)return
    durations.set(id,duration);notify()
}
export function readCoverage(id) {
    if(cache.has(id))return cache.get(id)
    let ranges=[]
    try { const stored=JSON.parse(readProgressValue(prefix+id)); if(Array.isArray(stored)) ranges=mergeWatchedRanges(stored,0,0) } catch {}
    cache.set(id,ranges)
    return ranges
}
export function recordWatchedRange(id,start,end) {
    if(!id || isProgressResetting())return
    const previous=readCoverage(id)
    const ranges=mergeWatchedRanges(previous,start,end)
    if(ranges.length===previous.length && ranges.every((range,index)=>range[0]===previous[index][0] && range[1]===previous[index][1]))return
    cache.set(id,ranges)
    writeProgressValue(prefix+id,JSON.stringify(ranges))
    notify()
}
export function clearWatchCoverage() {
    clearProgressPrefix(prefix)
    cache.clear();notify()
}
export function watchedSeconds(ranges,duration) {
    return ranges.reduce((sum,[start,end])=>sum+Math.max(0,Math.min(end,duration)-Math.min(start,duration)),0)
}
export function courseCoverage(videos) {
    let total=0,watched=0,known=0
    for(const video of videos) {
        const duration=Number(durations.get(video.id)||video.duration)
        if(!Number.isFinite(duration)||duration<=0)continue
        known++;total+=duration;watched+=watchedSeconds(readCoverage(video.id),duration)
    }
    return {total,watched,remaining:Math.max(0,total-watched),percent:total?watched/total*100:0,known,count:videos.length}
}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
    if(event.key===null){cache.clear();notify()}
    else if(event.key?.startsWith(prefix)){cache.delete(event.key.slice(prefix.length));notify()}
})
if(typeof window!=='undefined')window.addEventListener('tutin-progress-hydrated',()=>{cache.clear();notify()})
