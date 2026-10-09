import test from 'node:test'
import assert from 'node:assert/strict'
import { sharedRequest } from '../src/utils/sharedRequest.js'
test('simultaneous callers share one read, while later reads fetch fresh data',async()=>{
 let count=0,release
 const request=sharedRequest(()=>{count++;return new Promise(resolve=>{release=resolve})})
 const a=request(),b=request()
 assert.equal(a,b)
 await Promise.resolve();assert.equal(count,1)
 release('first');assert.equal(await a,'first');assert.equal(await b,'first')
 const c=request();await Promise.resolve();assert.equal(count,2)
 release('fresh');assert.equal(await c,'fresh')
})
test('a failed shared request does not prevent a later retry',async()=>{
 let count=0
 const request=sharedRequest(()=>{if(++count===1)throw Error('Offline');return 'ready'})
 await assert.rejects(request(),/Offline/)
 assert.equal(await request(),'ready')
})
