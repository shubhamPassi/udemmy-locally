import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'

test('the full summary flow saves provider output and rejects missing configuration before transcription',async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch
 globalThis.window=new EventTarget();globalThis.window.location={hostname:'udemy.chaigallery.in'}
 try{
  const {request}=await import('../src/utils/browserStore.js')
  const {regenerateSummaryOnly,processVideoForSummary}=await import('../src/utils/aiSummarization.js')
  await request('POST','/api/courses',{id:'ai-course',title:'Course'})
  await request('POST','/api/videos',{id:'ai-lesson',courseId:'ai-course',title:'Lesson',lastWatchedPosition:42})
  let calls=0
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://openrouter.ai/api/v1/chat/completions')
   assert.equal(JSON.parse(options.body).model,'openrouter/free')
   calls++
   return new Response(JSON.stringify({choices:[{message:{content:'## Actual provider summary\n\nLesson notes.'}}]}),{status:200})
  }
  const result=await regenerateSummaryOnly('ai-lesson','This is a saved transcript describing the important details of a learning lesson.',null,'test-key','google/gemini-2.0-flash-exp:free')
  const video=await request('GET','/api/videos/ai-lesson')
  assert.equal(result,video.summary)
  assert.equal(video.lastWatchedPosition,42)
  assert.equal(calls,1)
  await assert.rejects(processVideoForSummary('ai-lesson',null,null,'','openrouter/free'),/API key/)
  assert.equal(calls,1)
 }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch}
})
