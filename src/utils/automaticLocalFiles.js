import * as api from './api.js'
import {scanBrowserFolder} from './browserFiles.js'
import {importVideos} from './importDurations.js'
import {createReconnectMatcher} from './reconnectFiles.js'
import {getCourseContent,updateCourse,updateVideo} from './db.js'
import {batchWork} from './batchWork.js'
const running=new Map()
export const isLocalFileHandle=handle=>!!handle&&typeof handle.getFile==='function'&&typeof handle.queryPermission==='function'
const isFolderHandle=handle=>!!handle&&typeof handle.values==='function'&&typeof handle.queryPermission==='function'
export async function rememberLocalFolder(handle){
    if(isFolderHandle(handle))await api.post('/api/data/local-folders',{handle})
}
export function canRestoreLocalCourse(videos,matches,videoId){
    return videos.length>0&&matches.length/videos.length>=0.7&&(!videoId||matches.some(item=>item.video.id===videoId))
}
export async function restoreLocalCourse(courseId,selectedHandle,videoId){
    if(!selectedHandle&&running.has(courseId))return running.get(courseId)
    const task=(async()=>{
        const content=await getCourseContent(courseId)
        const registry=await api.get('/api/data/local-folders')
        const handles=selectedHandle?[selectedHandle]:[content.course?.folderHandle,...registry.map(folder=>folder.handle)].filter(isFolderHandle)
        let permissionHandle=null
        for(const handle of handles){
            const permission=await handle.queryPermission({mode:'read'})
            if(permission!=='granted'){permissionHandle ||= handle;continue}
            let scanned
            try{scanned=importVideos((await scanBrowserFolder(handle)).modules)}catch{continue}
            const matcher=createReconnectMatcher(scanned,{originalRoot:content.course?.folderPath,selectedRoot:handle.name})
            const matches=(content.videos||[]).map(video=>({video,file:matcher(video)})).filter(item=>item.file)
            if(!canRestoreLocalCourse(content.videos||[],matches,videoId))continue
            const revision=Date.now()
            await batchWork(matches,({video,file})=>updateVideo(video.id,{fileHandle:file.fileHandle,filePath:file.filePath,fileName:file.fileName,fileAccessUpdatedAt:revision}),8)
            await updateCourse(courseId,{folderHandle:handle})
            await rememberLocalFolder(handle)
            return {content:await getCourseContent(courseId),restored:matches.length}
        }
        return {permissionHandle,title:content.course?.title,folderName:content.course?.folderPath,missing:true}
    })()
    if(!selectedHandle)running.set(courseId,task)
    try{return await task}finally{if(running.get(courseId)===task)running.delete(courseId)}
}
