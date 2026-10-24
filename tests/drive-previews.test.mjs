import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDrivePreviews, validatePreviewBundle } from '../src/utils/drivePreviews.js'

const image='data:image/jpeg;base64,/9j/AA=='
const bundle={version:1,interval:10,duration:21,frames:[[0,image],[10,image],[20,image]]}

test('Drive previews use metadata and a matching sidecar only, never video bytes',async()=>{
 const previous=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{
  const parsed=new URL(url);calls.push(parsed)
  assert.equal(options.credentials,'omit');assert.equal(options.priority,'low')
  if(calls.length===1){assert.equal(parsed.searchParams.get('alt'),null);return Response.json({name:'Lesson.mp4',parents:['folder123456']})}
  if(calls.length===2){assert.ok(parsed.searchParams.get('q').includes("name = 'Lesson.mp4.tutin-previews.json'"));return Response.json({files:[{id:'sidecar123456'}]})}
  assert.match(parsed.pathname,/sidecar123456$/);assert.equal(parsed.searchParams.get('alt'),'media');return Response.json(bundle)
 }
 try{assert.deepEqual(await loadDrivePreviews({driveFileId:'video123456'},21,'dummy-key',new AbortController().signal),bundle.frames);assert.equal(calls.length,3)}finally{globalThis.fetch=previous}
})

test('preview sidecars reject unsafe images, duplicate buckets, wrong duration and oversized responses',async()=>{
 assert.throws(()=>validatePreviewBundle({...bundle,duration:50},21))
 assert.throws(()=>validatePreviewBundle({...bundle,frames:[[0,'https://other.example/image']]},21))
 assert.throws(()=>validatePreviewBundle({...bundle,frames:[[0,image],[0,image]]},21))
 assert.throws(()=>validatePreviewBundle({...bundle,frames:[[5,image]]},21))
 const previous=globalThis.fetch
 let count=0
 globalThis.fetch=async()=>++count===1?Response.json({name:'Lesson.mp4',parents:['folder123456']}):count===2?Response.json({files:[{id:'sidecar123456'}]}):new Response('oversized',{headers:{'Content-Length':String(20*1024*1024)}})
 try{await assert.rejects(loadDrivePreviews({driveFileId:'video123456'},21,'dummy-key'))}finally{globalThis.fetch=previous}
})

test('missing sidecars and unavailable credentials gracefully yield no previews',async()=>{
 assert.deepEqual(await loadDrivePreviews({driveFileId:'video123456'},21,''),[])
 const previous=globalThis.fetch
 globalThis.fetch=async()=>new Response('',{status:403})
 try{assert.deepEqual(await loadDrivePreviews({driveFileId:'video123456'},21,'dummy-key'),[])}finally{globalThis.fetch=previous}
})
