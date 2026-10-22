import test from 'node:test'
import assert from 'node:assert/strict'
import {rememberRemoteSource,parseRemoteSource} from '../src/utils/remoteCourseSync.js'

for(const url of ['https://drive.google.com/drive/u/0/folders/folder001','https://www.youtube.com/playlist?list=PL12345678'])test('validated sync source is remembered without applying lesson changes: '+url,async()=>{
 const course={id:'course',title:'Custom title',totalVideos:240,customMetadata:{keep:'value',lastRemoteSyncAt:'previous-sync'}}
 let writes=0
 const store={getCourseContent:async()=>({course:structuredClone(course)}),updateCourse:async(id,patch)=>{assert.equal(id,'course');assert.deepEqual(Object.keys(patch),['customMetadata']);Object.assign(course,patch);writes++}}
 const source=parseRemoteSource(url)
 await rememberRemoteSource('course',source,store)
 assert.equal(writes,1);assert.equal(course.customMetadata.remoteSource.url,url);assert.equal(course.customMetadata.keep,'value');assert.equal(course.customMetadata.lastRemoteSyncAt,'previous-sync');assert.equal(course.totalVideos,240)
 // A newly opened dialog reads this durable course field, without Apply updates.
 assert.equal((await store.getCourseContent()).course.customMetadata.remoteSource.url,url)
})
