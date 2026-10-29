import test from 'node:test'
import assert from 'node:assert/strict'
import {driveFolderDurations} from '../src/utils/driveDurationMetadata.js'

test('Drive duration metadata handles pagination using account access and never requests media bytes',async()=>{
 const previous=globalThis.fetch,requests=[]
 globalThis.fetch=async(url,options)=>{
  const parsed=new URL(url);requests.push(parsed)
  assert.equal(parsed.origin,'https://www.googleapis.com');assert.equal(parsed.pathname,'/drive/v3/files');assert.equal(parsed.searchParams.has('alt'),false)
  assert.equal(parsed.searchParams.has('key'),false);assert.equal(options.headers.Authorization,'Bearer test-account-token');assert.equal(options.credentials,'omit')
  assert.match(parsed.searchParams.get('fields'),/durationMillis/)
  return requests.length===1?Response.json({files:[{id:'video1',videoMediaMetadata:{durationMillis:'60000'}}],nextPageToken:'page-two'}):Response.json({files:[{id:'video2',videoMediaMetadata:{durationMillis:'125600'}},{id:'pending-video'},{id:'invalid',videoMediaMetadata:{durationMillis:'NaN'}}]})
 }
 try{
  const durations=await driveFolderDurations('folder0001',{token:'test-account-token'})
  assert.deepEqual([...durations],[['video1',60],['video2',126]])
  assert.equal(requests[1].searchParams.get('pageToken'),'page-two')
 }finally{globalThis.fetch=previous}
})

test('Drive metadata failures remain unknown and API-key fallback reads metadata only',async()=>{
 const previous=globalThis.fetch
 try{
  globalThis.fetch=async(url)=>{assert.equal(new URL(url).searchParams.get('key'),'test-key');return new Response('',{status:403})}
  assert.equal((await driveFolderDurations('folder0001',{apiKey:'test-key'})).size,0)
  globalThis.fetch=async()=>assert.fail('No requests without credentials')
  assert.equal((await driveFolderDurations('folder0001',null)).size,0)
 }finally{globalThis.fetch=previous}
})
