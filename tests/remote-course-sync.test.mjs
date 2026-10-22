import test from 'node:test'
import assert from 'node:assert/strict'
import {planRemoteSync,applyRemoteSync,parseRemoteSource} from '../src/utils/remoteCourseSync.js'

const source={provider:'drive',id:'folder001',type:'folder',url:'https://drive.google.com/drive/folders/folder001'}
function fixture(){
 const course={id:'course',title:'My custom course',customMetadata:{keep:'value'}}
 const modules=[{id:'mod1',courseId:'course',title:'Section',originalTitle:'Section'}]
 const videos=[{id:'v1',courseId:'course',moduleId:'mod1',title:'My custom lesson',originalTitle:'Old title',driveFileId:'video0001',duration:60,isCompleted:true,lastWatchedPosition:42,watchProgress:70,order:0},{id:'v2',courseId:'course',moduleId:'mod1',title:'Unlisted',driveFileId:'video0002',lastWatchedPosition:23,order:1}]
 const incoming={modules:[{title:'Section',videos:[{title:'Renamed remote lesson',driveFileId:'video0001',subtitleSources:[{driveFileId:'subtitle01',name:'Lesson.srt'}]},{title:'New lesson',driveFileId:'video0003',duration:25}]}]}
 const store={getCourseContent:async()=>structuredClone({course,modules,videos}),updateCourse:async(_id,patch)=>Object.assign(course,patch),updateVideo:async(id,patch)=>Object.assign(videos.find(v=>v.id===id),patch),addModule:async row=>{const item={...row,id:'mod'+(modules.length+1)};modules.push(item);return item},addVideo:async row=>{const item={...row,id:'v'+(videos.length+1)};videos.push(item);return item},deleteVideo:async id=>{videos.splice(videos.findIndex(v=>v.id===id),1)},deleteModule:async id=>{modules.splice(modules.findIndex(m=>m.id===id),1)}}
 return {course,modules,videos,incoming,store}
}
test('resync identifies new videos and subtitle updates, keeps unlisted lessons and rejects an unrelated source',()=>{
 const {course,modules,videos,incoming}=fixture(),preview=planRemoteSync({course,modules,videos},incoming,source)
 assert.equal(preview.additions.length,1);assert.equal(preview.updates.length,1);assert.equal(preview.subtitleFiles,1);assert.equal(preview.missing,1)
 assert.throws(()=>planRemoteSync({videos},{modules:[{title:'Other',videos:[{driveFileId:'other0001'}]}]},source),/does not match/)
 assert.throws(()=>parseRemoteSource('https://evil.test/playlist?list=PL1'),/Use a Google Drive/)
 assert.equal(parseRemoteSource('https://www.youtube.com/watch?v=abcdefghijk&list=PL12345678').type,'playlist')
})
test('resync preserves lesson IDs, custom titles, completion, bookmarks and other course metadata across repeated syncs',async()=>{
 const f=fixture(),preview=planRemoteSync(f,f.incoming,source)
 const result=await applyRemoteSync('course',preview,f.store)
 assert.equal(result.added,1);assert.equal(f.videos.length,3)
 assert.equal(f.videos[0].id,'v1');assert.equal(f.videos[0].title,'My custom lesson');assert.equal(f.videos[0].isCompleted,true);assert.equal(f.videos[0].lastWatchedPosition,42)
 assert.equal(f.videos[1].lastWatchedPosition,23);assert.equal(f.course.customMetadata.keep,'value');assert.equal(f.course.customMetadata.remoteSource.id,'folder001')
 assert.equal(f.videos[0].subtitleSources[0].driveFileId,'subtitle01');assert.ok(f.videos[0].transcriptRefreshAt)
 assert.equal((await applyRemoteSync('course',preview,f.store)).added,0)
})
test('a failed sync rolls back its additions and metadata updates without touching progress',async()=>{
 const f=fixture(),before=structuredClone(f.videos)
 let failed=false
 const update=f.store.updateCourse
 f.store.updateCourse=async(...args)=>{if(!failed){failed=true;throw Error('storage failure')}return update(...args)}
 await assert.rejects(applyRemoteSync('course',planRemoteSync(f,f.incoming,source),f.store),/storage failure/)
 assert.equal(f.videos.length,2)
 assert.equal(f.videos[0].originalTitle,before[0].originalTitle);assert.equal(f.videos[0].lastWatchedPosition,42);assert.equal(f.course.customMetadata.keep,'value')
})
