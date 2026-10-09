import test from 'node:test'
import assert from 'node:assert/strict'
import { batchWork } from '../src/utils/batchWork.js'
test('imports run with bounded concurrency and retain their original order',async()=>{
 let active=0,max=0
 const result=await batchWork(Array.from({length:21},(_,i)=>i),async(item,index)=>{
  active++;max=Math.max(max,active)
  await new Promise(resolve=>setTimeout(resolve,1))
  active--;return index
 },8)
 assert.equal(max,8)
 assert.deepEqual(result,Array.from({length:21},(_,i)=>i))
})
test('batch failures settle active writes and stop the next batch',async()=>{
 const visited=[]
 await assert.rejects(batchWork([0,1,2,3],async item=>{visited.push(item);if(item===0)throw Error('Storage failed')},2),/Storage failed/)
 assert.deepEqual(visited,[0,1])
})
