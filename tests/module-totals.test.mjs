import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleTotals } from '../src/utils/moduleTotals.js'
test('module totals match individual lesson durations and completion without repeated scans',()=>{
 const videos=[{moduleId:'a',duration:60,isCompleted:true},{moduleId:'b',duration:20},{moduleId:'a',duration:40},{moduleId:'b',isCompleted:true}]
 const totals=moduleTotals(videos)
 assert.deepEqual(totals.get('a'),{totalDuration:100,completedVideos:1})
 assert.deepEqual(totals.get('b'),{totalDuration:20,completedVideos:1})
 assert.equal(moduleTotals([]).size,0)
})
