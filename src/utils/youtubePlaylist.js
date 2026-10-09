import {getCourseContent,addModule,addVideo,deleteVideo,deleteModule} from './db.js'
import {batchWork} from './batchWork.js'
const appending=new Set()

export function youtubeId(video){
    if(video.youtubeId)return video.youtubeId
    try{
        const url=new URL(video.url)
        if(url.hostname==='youtu.be')return url.pathname.split('/')[1]
        if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname))return url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
    }catch{}
    return null
}
export function uniqueYouTubeVideos(existing,incoming){
    const seen=new Set(existing.map(youtubeId).filter(Boolean)),videos=[]
    let skipped=0
    for(const video of incoming){
        const id=youtubeId(video)
        if(!id)throw new Error('A video is missing its YouTube URL.')
        if(seen.has(id)){skipped++;continue}
        seen.add(id);videos.push({...video,youtubeId:id,url:`https://www.youtube.com/watch?v=${id}`})
    }
    return {videos,skipped}
}
export async function appendYouTubeVideos(courseId,incoming,preferredModuleId){
    if(appending.has(courseId))throw new Error('Videos are already being added to this playlist. Please wait.')
    appending.add(courseId)
    const created=[]
    let createdModule
    try{
        const content=await getCourseContent(courseId)
        const unique=uniqueYouTubeVideos(content.videos||[],incoming)
        if(!unique.videos.length)return {added:0,skipped:unique.skipped}
        let module=content.modules.find(module=>module.id===preferredModuleId)
        if(!module)module=content.modules.find(module=>(content.videos||[]).some(video=>video.moduleId===module.id&&youtubeId(video)))
        if(!module)module=content.modules.find(module=>module.title==='Videos')
        if(!module){
            module=await addModule({courseId,title:'YouTube videos',originalTitle:'YouTube videos',order:Math.max(-1,...content.modules.map(module=>Number(module.order)||0))+1})
            createdModule=module.id
        }
        const start=Math.max(-1,...content.videos.filter(video=>video.moduleId===module.id).map(video=>Number(video.order)||0))+1
        await batchWork(unique.videos,async(video,index)=>{
            const duration=Number(video.duration)
            const saved=await addVideo({courseId,moduleId:module.id,title:video.title||'YouTube video',originalTitle:video.title||'YouTube video',youtubeId:video.youtubeId,url:video.url,duration:Number.isFinite(duration)?Math.max(0,duration):0,order:start+index})
            created.push(saved.id)
        },4)
        return {added:created.length,skipped:unique.skipped}
    }catch(error){
        let incomplete=false
        for(const id of created){try{await deleteVideo(id)}catch{incomplete=true}}
        if(createdModule){try{await deleteModule(createdModule);incomplete=false}catch{incomplete=true}}
        if(incomplete)throw new Error('Adding videos failed and some new entries could not be removed. Refresh the playlist before retrying; existing progress is preserved.')
        throw error
    }finally{appending.delete(courseId)}
}
