import test from 'node:test'
import assert from 'node:assert/strict'
import { applyVideoDurations } from '../src/utils/moduleMetadata.js'
test('metadata updates preserve unrelated branches and do not mutate the course',()=>{
 const modules=[{id:'a',videos:[{id:'one',duration:0}],subModules:[]},{id:'b',videos:[{id:'two',duration:30}],subModules:[]}]
 const next=applyVideoDurations(modules,new Map([['one',60]]))
 assert.notEqual(next,modules)
 assert.notEqual(next[0],modules[0])
 assert.equal(next[1],modules[1])
 assert.equal(next[0].videos[0].duration,60)
 assert.equal(modules[0].videos[0].duration,0)
 assert.equal(applyVideoDurations(next,new Map([['one',60]])),next)
})
test('nested changes only copy the affected path and apply multiple results together',()=>{
 const modules=[{videos:[],subModules:[{videos:[{id:'a',duration:0},{id:'b',duration:0}],subModules:[]}]}]
 const next=applyVideoDurations(modules,new Map([['a',20],['b',40]]))
 assert.equal(next[0].videos,modules[0].videos)
 assert.deepEqual(next[0].subModules[0].videos.map(video=>video.duration),[20,40])
 assert.equal(applyVideoDurations(modules,new Map([['missing',50]])),modules)
})
