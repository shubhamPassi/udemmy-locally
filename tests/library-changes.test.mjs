import test from 'node:test'
import assert from 'node:assert/strict'
import {subscribeLibraryChanges,publishLibraryChange} from '../src/utils/libraryChanges.js'

test('rapid edits to different courses produce one broad refresh and cleanup stops callbacks',async()=>{
 const previousWindow=globalThis.window
 globalThis.window=new EventTarget()
 try{
  const changes=[]
  const unsubscribe=subscribeLibraryChanges(change=>changes.push(change))
  publishLibraryChange('courses','one')
  publishLibraryChange('courses','two')
  await new Promise(resolve=>setTimeout(resolve,230))
  assert.equal(changes.length,1)
  assert.equal(changes[0].courseId,null)
  publishLibraryChange('videos','one')
  unsubscribe()
  await new Promise(resolve=>setTimeout(resolve,230))
  assert.equal(changes.length,1)
 }finally{globalThis.window=previousWindow}
})
