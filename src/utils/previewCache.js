const CACHE_BUDGET = 32 * 1024 * 1024
let database, queue = Promise.resolve()
function open() {
    if (!database) database = new Promise((resolve,reject) => {
        const request = indexedDB.open('tutin-preview-cache',1)
        request.onupgradeneeded = () => request.result.createObjectStore('frames',{keyPath:'id'})
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => { database=null;reject(request.error) }
    })
    return database
}
export function previewCacheKey(video, duration) {
    if (!video?.id || !(duration > 0)) return null
    return JSON.stringify([2,video.id,video.driveFileId || video.filePath || video.url || '',Math.round(duration*1000),video.fileSize || video.size || 0,video.lastModified || ''])
}
export async function loadPreviewFrames(key) {
    if (!key || typeof indexedDB === 'undefined') return []
    const db=await open()
    const rows=await new Promise((resolve,reject)=>{const r=db.transaction('frames').objectStore('frames').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const cutoff=Date.now()-30*86400000
    return rows.filter(row=>row.key===key&&row.savedAt>cutoff&&Number.isFinite(row.time)&&row.time>=0&&typeof row.image==='string'&&row.image.startsWith('data:image/')&&row.image.length<100000).map(row=>[row.time,row.image])
}
export function storePreviewFrames(key, frames, budget=CACHE_BUDGET) {
    if (!key || typeof indexedDB === 'undefined' || !frames.length) return Promise.resolve()
    const task=queue.catch(()=>{}).then(async()=>{
        const db=await open()
        await new Promise((resolve,reject)=>{
            const tx=db.transaction('frames','readwrite'),store=tx.objectStore('frames'),request=store.getAll()
            request.onsuccess=()=>{
                const rows=new Map(request.result.map(row=>[row.id,row]))
                for(const [time,image] of frames){if(!Number.isFinite(time)||time<0||typeof image!=='string'||image.length>=100000)continue;const row={id:key+'|'+time,key,time,image,size:image.length*2,savedAt:Date.now()};rows.set(row.id,row);store.put(row)}
                let bytes=[...rows.values()].reduce((sum,row)=>sum+row.size,0)
                for(const row of [...rows.values()].sort((a,b)=>a.savedAt-b.savedAt))if(bytes>budget||row.savedAt<Date.now()-30*86400000){store.delete(row.id);bytes-=row.size}
            }
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
        })
    })
    queue=task
    return task
}
export async function clearPreviewCache(){await queue.catch(()=>{});const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('frames','readwrite');tx.objectStore('frames').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
