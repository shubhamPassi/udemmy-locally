import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'

test('custom YouTube playlist appends different URLs, skips duplicates and preserves existing progress',async()=>{
 const previous=globalThis.window
 globalThis.window=new EventTarget();globalThis.window.location={hostname:'udemy.chaigallery.in'}
 try{
  const {request}=await import('../src/utils/browserStore.js')
  const {appendYouTubeVideos,uniqueYouTubeVideos}=await import('../src/utils/youtubePlaylist.js')
  await request('POST','/api/courses',{id:'youtube-custom',title:'My learning playlist',instructor:'Original instructor'})
  await request('POST','/api/modules',{id:'youtube-module',courseId:'youtube-custom',title:'Videos',order:0})
  await request('POST','/api/videos',{id:'youtube-first',courseId:'youtube-custom',moduleId:'youtube-module',title:'First',youtubeId:'hi_cLcyruI0',duration:100,order:0,isCompleted:true,lastWatchedPosition:50})
  const result=await appendYouTubeVideos('youtube-custom',[{title:'Second',url:'https://youtu.be/mHxLXzYjQRE',duration:60},{title:'Duplicate first',youtubeId:'hi_cLcyruI0'},{title:'Duplicate second',url:'https://www.youtube.com/watch?v=mHxLXzYjQRE'}],'youtube-module')
  assert.deepEqual(result,{added:1,skipped:2})
  const content=await request('GET','/api/courses/youtube-custom/content')
  assert.equal(content.videos.length,2)
  assert.equal(content.modules.length,1)
  assert.equal(content.videos.find(v=>v.id==='youtube-first').lastWatchedPosition,50)
  assert.equal(content.videos.find(v=>v.id==='youtube-first').isCompleted,true)
  const added=content.videos.find(v=>v.id!=='youtube-first')
  assert.equal(added.order,1);assert.equal(added.youtubeId,'mHxLXzYjQRE')
  assert.equal(content.course.totalVideos,2);assert.equal(content.course.totalDuration,160)
  assert.equal(content.course.title,'My learning playlist');assert.equal(content.course.instructor,'Original instructor')
  assert.equal(uniqueYouTubeVideos(content.videos,[{youtubeId:'mHxLXzYjQRE'}]).videos.length,0)
  const originalPut=IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put=function(row,...args){if(this.name==='videos'&&row.title==='Storage failure')throw Error('Storage full');return originalPut.call(this,row,...args)}
  try{
   await assert.rejects(appendYouTubeVideos('youtube-custom',[{title:'Temporary new',youtubeId:'dQw4w9WgXcQ'},{title:'Storage failure',youtubeId:'abcdefghijk'}],'youtube-module'),/Storage full/)
  }finally{IDBObjectStore.prototype.put=originalPut}
  const afterFailure=await request('GET','/api/courses/youtube-custom/content')
  assert.equal(afterFailure.videos.length,2)
  assert.equal(afterFailure.videos.find(v=>v.id==='youtube-first').lastWatchedPosition,50)
 }finally{globalThis.window=previous}
})
