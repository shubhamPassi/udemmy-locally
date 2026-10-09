import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'

test('a remembered permitted folder automatically restores file access without resetting progress',async()=>{
 const previous=globalThis.window
 globalThis.window=new EventTarget();globalThis.window.location={hostname:'udemy.chaigallery.in'}
 try{
  const {request}=await import('../src/utils/browserStore.js')
  const {restoreLocalCourse,canRestoreLocalCourse}=await import('../src/utils/automaticLocalFiles.js')
  await request('POST','/api/courses',{id:'auto-course',title:'Course',folderPath:'Old Course'})
  await request('POST','/api/videos',{id:'auto-one',courseId:'auto-course',title:'Lesson',filePath:'Old Course/1. Lesson.mp4',fileName:'1. Lesson.mp4',lastWatchedPosition:20,watchProgress:0.4})
  const originalGet=IDBObjectStore.prototype.get
  const originalPut=IDBObjectStore.prototype.put
  const file={kind:'file',name:'1. Lesson.mp4'}
  const folder={name:'New Course',kind:'directory',queryPermission:async()=> 'granted',async *values(){yield file}}
  // IDB normally clones native FileSystemHandle objects. This test replaces
  // only the registry read because Node cannot construct those native handles.
  IDBObjectStore.prototype.get=function(key){
   const result=originalGet.call(this,key)
   if(this.name==='settings'&&key==='local-folders')result.addEventListener('success',()=>{Object.defineProperty(result,'result',{value:{id:'local-folders',folders:[{name:folder.name,handle:folder}]}})})
   return result
  }
  IDBObjectStore.prototype.put=function(row,...args){
   const stored={...row}
   if(stored.folderHandle)stored.folderHandle={kind:stored.folderHandle.kind,name:stored.folderHandle.name}
   if(stored.folders)stored.folders=stored.folders.map(item=>({name:item.name,handle:{kind:item.handle.kind,name:item.handle.name}}))
   return originalPut.call(this,stored,...args)
  }
  let restored
  try{restored=await restoreLocalCourse('auto-course',null,'auto-one')}
  finally{IDBObjectStore.prototype.get=originalGet;IDBObjectStore.prototype.put=originalPut}
  const video=await request('GET','/api/videos/auto-one')
  assert.equal(restored.restored,1)
  assert.equal(video.lastWatchedPosition,20)
  assert.equal(video.filePath,'New Course/1. Lesson.mp4')
  assert.equal(video.fileHandle.name,'1. Lesson.mp4')
  assert.equal(canRestoreLocalCourse([{id:'one'},{id:'two'},{id:'three'}],[{video:{id:'one'}}],'one'),false)
  assert.equal(canRestoreLocalCourse([{id:'one'},{id:'two'}],[{video:{id:'one'}},{video:{id:'two'}}],'missing'),false)
 }finally{globalThis.window=previous}
})
