import { openLibraryDatabase } from './libraryDatabase.js'
import {mergeProgressRecord} from './progressRecords.js'
const prefixes = ['tutin_playback_', 'tutin_coverage_', 'tutin_study_session_', 'tutin_subtitles_', 'tutin_chapters_']
const memory = new Map()
let queue = Promise.resolve(), hydration, lastError = 0
let errorMessage='',durableSettings=null
const generations=new Map()
export const currentStorageError=()=>errorMessage
export const readDurableAppSettings=()=>durableSettings
const channel = typeof window !== 'undefined' && window.BroadcastChannel ? new window.BroadcastChannel('tutin-durable-progress') : null
export const isProgressKey = key => prefixes.some(prefix => key.startsWith(prefix)) || ['tutin_daily_goal','tutin_hide_upcoming_durations'].includes(key)
export function storageFailure(error) {
    errorMessage=`Progress could not be saved: ${error?.message || 'browser storage unavailable'}. Export a backup before closing this page.`
    if (typeof window === 'undefined' || Date.now() - lastError < 10000) return
    lastError = Date.now()
    window.dispatchEvent(new CustomEvent('tutin-storage-error', { detail: errorMessage }))
}
async function persist(key, value) {
    const db = await openLibraryDatabase()
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite'), store = tx.objectStore('settings')
        let saved=value
        if(value===null)store.delete('progress:'+key)
        else {const current=store.get('progress:'+key);current.onsuccess=()=>{saved=mergeProgressRecord(key,current.result?.value,value);store.put({id:'progress:'+key,value:saved})}}
        tx.oncomplete = () => resolve(saved); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Progress save aborted'))
    })
}
export function readProgressValue(key) {
    if (memory.has(key)) return memory.get(key)
    try { return localStorage.getItem(key) } catch { return null }
}
export function progressKeys() {
    const keys = new Set(memory.keys())
    try { for (const key of Object.keys(localStorage)) if (isProgressKey(key)) keys.add(key) } catch {}
    return [...keys]
}
export function writeProgressValue(key, value) {
    const generation=(generations.get(key)||0)+1
    generations.set(key,generation)
    value === null ? memory.delete(key) : memory.set(key, value)
    let mirrored = false
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); mirrored = true } catch {}
    if (typeof indexedDB === 'undefined') { if (!mirrored) storageFailure(new Error('Storage is full')); return }
    queue = queue.catch(() => {}).then(() => persist(key, value)).then(saved => {
        if(generations.get(key)===generation){const canonical=mergeProgressRecord(key,readProgressValue(key),saved);if(readProgressValue(key)!==canonical)acceptProgressValues({[key]:canonical})}
        channel?.postMessage({key,value:saved})
    }).catch(error => { storageFailure(error); throw error })
    // Keep synchronous playback handlers responsive, while reporting failures.
    queue.catch(() => {})
}
export function clearProgressPrefix(prefix) {
    for (const key of progressKeys()) if (key.startsWith(prefix)) writeProgressValue(key, null)
}
export const flushProgressStorage = () => queue
export function acceptProgressValues(values) {
    let mirror=true
    for (const [key, value] of Object.entries(values)) {
        const canonical=mergeProgressRecord(key,memory.get(key),value)
        canonical===null?memory.delete(key):memory.set(key,canonical)
        if(mirror)try { canonical===null?localStorage.removeItem(key):localStorage.getItem(key)!==canonical&&localStorage.setItem(key,canonical) } catch { mirror=false /* IndexedDB transaction already committed. */ }
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('tutin-progress-hydrated'))
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tutin-preferences-restored'))
        for(const key of Object.keys(values))if(key.startsWith('tutin_subtitles_'))window.dispatchEvent(new CustomEvent('tutin-subtitles-changed',{detail:{videoId:key.slice('tutin_subtitles_'.length)}}))
    }
}
export function clearAllDurableProgress(){for(const key of progressKeys())writeProgressValue(key,null)}
if (channel) channel.onmessage = event => {
    const { key, value } = event.data || {}
    if (typeof key !== 'string' || !isProgressKey(key)) return
    acceptProgressValues({[key]:mergeProgressRecord(key,readProgressValue(key),value)})
}
export function readyProgressStorage() {
    if (hydration) return hydration
    hydration = (async () => {
        if (typeof indexedDB === 'undefined') return
        const db = await openLibraryDatabase()
        const records = await new Promise((resolve, reject) => {
            const request = db.transaction('settings').objectStore('settings').getAll()
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
        })
        const values = {}
        for (const record of records) {if(record.id==='settings')durableSettings=record.value;if (record.id.startsWith('progress:')) values[record.id.slice(9)] = record.value}
        const migration={}
        for (const key of progressKeys()) {
            const value = readProgressValue(key)
            if (value !== null) { const merged=mergeProgressRecord(key,values[key],value);if(values[key]!==merged)migration[key]=merged;values[key]=merged }
        }
        if(Object.keys(migration).length)try{
            await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings');for(const[key,value]of Object.entries(migration)){const current=store.get('progress:'+key);current.onsuccess=()=>{values[key]=mergeProgressRecord(key,current.result?.value,value);store.put({id:'progress:'+key,value:values[key]})}}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
        }catch(error){storageFailure(error)}
        acceptProgressValues(values)
    })().catch(error => { hydration = null; storageFailure(error) })
    return hydration
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    if (!event.key) memory.clear()
    else if (isProgressKey(event.key)) memory.set(event.key, event.newValue)
})
