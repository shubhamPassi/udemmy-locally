import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { request } from '../src/utils/browserStore.js'
test('existing browser courses work without upgrading or closing other tabs',async()=>{
 const db=await new Promise((resolve,reject)=>{
   const opening=indexedDB.open('tutin-web',1)
   opening.onupgradeneeded=()=>{for(const name of ['courses','modules','videos','notes','instructors','roadmaps','transcripts','summaries','settings']) opening.result.createObjectStore(name,{keyPath:'id'})}
   opening.onsuccess=()=>resolve(opening.result)
   opening.onerror=()=>reject(opening.error)
 })
 await new Promise((resolve,reject)=>{
   const tx=db.transaction(['courses','modules','videos'],'readwrite')
   tx.objectStore('courses').put({id:'existing',title:'Existing course'})
   tx.objectStore('modules').put({id:'existing-module',courseId:'existing'})
   tx.objectStore('videos').put({id:'existing-video',courseId:'existing',moduleId:'existing-module',lastWatchedPosition:599,duration:1099})
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
 })
 const content=await request('GET','/api/courses/existing/content')
 assert.equal(content.videos[0].lastWatchedPosition,599)
 assert.equal(content.modules.length,1)
 assert.equal((await request('GET','/api/videos/by-module/existing-module')).length,1)
 assert.equal(db.version,1)
 db.close()
})
