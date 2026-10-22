import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../cloudflare/worker.js'

test('hosted YouTube transcription returns timed caption text, never video bytes',async()=>{
 const previous=globalThis.fetch,calls=[]
 try{
  globalThis.fetch=async(url)=>{
   calls.push(String(url))
   if(String(url).includes('/youtubei/v1/player'))return Response.json({captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'https://www.youtube.com/api/timedtext?v=abcdefghijk',languageCode:'en'}]}}})
   if(String(url).includes('/api/timedtext'))return new Response('<transcript><text start="1.5" dur="2.5">Hello &amp; welcome</text></transcript>')
   throw Error('Unexpected source')
  }
  const response=await worker.fetch(new Request('https://app.test/api/public-import?provider=youtube&type=transcript&id=abcdefghijk'),{})
  assert.equal(response.status,200)
  const data=await response.json();assert.deepEqual(data.chunks,[{start:1.5,end:4,text:'Hello & welcome'}])
  assert.equal(calls.length,2);assert.ok(calls.every(url=>url.startsWith('https://www.youtube.com/')))
 }finally{globalThis.fetch=previous}
})

test('resync explicitly bypasses cached public listings and does not cache its fresh result',async()=>{
 const previous=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'caches');let matches=0,puts=0
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{match:async()=>{matches++;return Response.json({title:'old'})},put:async()=>puts++}}})
 globalThis.fetch=async()=>Response.json({title:'fresh',author_name:'teacher',thumbnail_url:''})
 try{
  const response=await worker.fetch(new Request('https://app.test/api/public-import?provider=youtube&type=video&id=abcdefghijk&fresh=1'),{},{waitUntil:()=>{}})
  assert.equal((await response.json()).title,'fresh');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(matches,0);assert.equal(puts,0)
 }finally{globalThis.fetch=previous;descriptor?Object.defineProperty(globalThis,'caches',descriptor):delete globalThis.caches}
})
