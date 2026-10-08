import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { request } from '../src/utils/browserStore.js'
import { saveLibraryRecovery, restoreLibraryRecovery } from '../src/utils/browserPersistence.js'
import { withPlaybackBookmark, writePlaybackBookmark, writeCompletionBookmark, beginProgressReset, cancelProgressReset } from '../src/utils/playbackBookmarks.js'
const values=new Map()
globalThis.localStorage={ getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key) }
test('completion checkpoint does not erase an existing playback position',()=>{
 writeCompletionBookmark('lesson',false)
 const saved=withPlaybackBookmark({id:'lesson',lastWatchedPosition:599,duration:1000,watchProgress:0.599})
 assert.equal(saved.lastWatchedPosition,599)
 writePlaybackBookmark('lesson',600,1000)
 writeCompletionBookmark('lesson',true)
 assert.equal(withPlaybackBookmark({id:'lesson'}).isCompleted,true)
})
test('progress-only reset keeps courses, videos, and notes and suppresses unload bookmarks',async()=>{
 await request('POST','/api/courses',{id:'course',title:'Course'})
 await request('POST','/api/modules',{id:'module',courseId:'course'})
 await request('POST','/api/videos',{id:'video',courseId:'course',moduleId:'module',isCompleted:true,lastWatchedPosition:50,watchProgress:0.5,lastWatchedAt:'2026-10-01',duration:100})
 await request('POST','/api/notes',{id:'note',courseId:'course',videoId:'video',text:'Keep this note'})
 beginProgressReset()
 assert.equal(writePlaybackBookmark('video',75,100),null)
 await request('POST','/api/data/reset-progress')
 cancelProgressReset()
 const content=await request('GET','/api/courses/course/content')
 assert.equal(content.course.title,'Course')
 assert.equal(content.course.completionPercentage,0)
 assert.equal(content.videos[0].lastWatchedPosition,0)
 assert.equal(content.videos[0].isCompleted,false)
 assert.equal((await request('GET','/api/notes/by-video/video'))[0].text,'Keep this note')
})
test('recovery copy restores a missing library and applies the latest resume checkpoint',async()=>{
 saveLibraryRecovery({courses:[{id:'restored',title:'Recovered'}],modules:[{id:'restored-module',courseId:'restored'}],videos:[{id:'restored-video',courseId:'restored',moduleId:'restored-module',duration:1000,lastWatchedPosition:0}]})
 writePlaybackBookmark('restored-video',599,1000)
 const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('recovery-test',1);open.onupgradeneeded=()=>{for(const name of ['courses','modules','videos'])open.result.createObjectStore(name,{keyPath:'id'})};open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)})
 await restoreLibraryRecovery(db)
 const video=await new Promise(resolve=>{const get=db.transaction('videos').objectStore('videos').get('restored-video');get.onsuccess=()=>resolve(get.result)})
 assert.equal(video.lastWatchedPosition,599)
 db.close()
})
