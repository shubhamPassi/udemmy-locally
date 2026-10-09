import { getVideoUrl, releaseVideoUrl } from './fileSystem.js'
import { IS_BROWSER_MODE } from './api.js'
import { updateVideo } from './db.js'
export async function loadVideoMetadata(video, signal, persist = true) {
    if(video.duration>0)return video.duration
    if(video.youtubeId || /youtu(?:be\.com|\.be)/.test(video.url||''))throw new Error('Duration becomes available when the YouTube lesson opens')
    let source, revoke=false
    if(video.driveFileId)source=IS_BROWSER_MODE?`/api/drive-video?id=${encodeURIComponent(video.driveFileId)}`:`https://drive.usercontent.google.com/download?id=${encodeURIComponent(video.driveFileId)}&export=download&confirm=t`
    else {
        if(video.fileHandle && await video.fileHandle.queryPermission({mode:'read'})!=='granted')throw new Error('Folder access required')
        source=await getVideoUrl(video.fileHandle||video.filePath);revoke=source.startsWith('blob:')
    }
    if(signal.aborted){if(revoke)releaseVideoUrl(source);throw new Error('Cancelled')}
    const duration=await new Promise((resolve,reject)=>{
        const media=document.createElement('video')
        const finish=(error)=>{
            clearTimeout(timer);signal.removeEventListener('abort',abort)
            const duration=media.duration
            media.onloadedmetadata=media.onerror=null;media.removeAttribute('src');media.load()
            if(revoke)releaseVideoUrl(source)
            error?reject(error):resolve(duration)
        }
        const abort=()=>finish(new Error('Cancelled'))
        const timer=setTimeout(()=>finish(new Error('Metadata timed out')),12000)
        signal.addEventListener('abort',abort,{once:true})
        media.preload='metadata';media.onloadedmetadata=()=>finish(Number.isFinite(media.duration)&&media.duration>0?null:new Error('Duration unavailable'))
        media.onerror=()=>finish(new Error('Metadata unavailable'));media.src=source
    })
    if(!signal.aborted && persist && video.id)await updateVideo(video.id,{duration})
    return duration
}
// Bound concurrency so a large playlist cannot compete with the active video for every connection.
export async function scanVideoMetadata(videos, signal, onResult, onProgress, load = loadVideoMetadata) {
    const pending=videos.filter(video=>!(video.duration>0)),total=pending.length
    let index=0,done=0,failed=0
    onProgress({total,done,failed})
    async function worker(){while(index<pending.length&&!signal.aborted){const video=pending[index++];try{const duration=await load(video,signal);if(!signal.aborted)onResult(video.id,duration)}catch{failed++}finally{done++;if(!signal.aborted)onProgress({total,done,failed})}}}
    await Promise.all([worker(),worker()])
}
