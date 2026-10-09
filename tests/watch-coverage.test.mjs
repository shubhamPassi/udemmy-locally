import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeWatchedRanges, watchedSeconds, recordWatchedRange, courseCoverage, clearWatchCoverage, coverageVersion } from '../src/utils/watchCoverage.js'
import { scanVideoMetadata } from '../src/utils/videoMetadata.js'

test('watched ranges count replay once and leave sought-over gaps unwatched',()=>{
    let ranges=mergeWatchedRanges([],0,10)
    ranges=mergeWatchedRanges(ranges,5,15)
    ranges=mergeWatchedRanges(ranges,40,50)
    assert.deepEqual(ranges,[[0,15],[40,50]])
    assert.equal(watchedSeconds(ranges,100),25)
    assert.equal(watchedSeconds(ranges,45),20)
    assert.deepEqual(mergeWatchedRanges(ranges,20,10),ranges)
})
test('course totals reflect only observed ranges, keep unknown durations explicit, and clear on reset',()=>{
    clearWatchCoverage()
    recordWatchedRange('one',10,30);recordWatchedRange('one',20,40)
    recordWatchedRange('two',0,10)
    const result=courseCoverage([{id:'one',duration:100,isCompleted:true},{id:'two',duration:100},{id:'unknown',duration:0}])
    assert.deepEqual(result,{total:200,watched:40,remaining:160,percent:20,known:2,count:3})
    clearWatchCoverage()
    assert.equal(courseCoverage([{id:'one',duration:100}]).watched,0)
})
test('replaying already covered content causes no storage write or subscriber update',()=>{
    clearWatchCoverage()
    recordWatchedRange('replay',0,30)
    const version=coverageVersion()
    recordWatchedRange('replay',10,20)
    assert.equal(coverageVersion(),version)
    recordWatchedRange('replay',20,40)
    assert.equal(coverageVersion(),version+1)
})
test('metadata runs two independent requests, publishes fast results before slow ones, and tolerates failures',async()=>{
    let release,active=0,max=0
    const gate=new Promise(resolve=>{release=resolve}),results=[],progress=[]
    const job=scanVideoMetadata([{id:'slow'},{id:'fast'},{id:'bad'},{id:'cached',duration:5}],new AbortController().signal,(id)=>results.push(id),status=>progress.push(status),async video=>{
        active++;max=Math.max(max,active)
        try{if(video.id==='slow')await gate;if(video.id==='bad')throw new Error('Unavailable');return 60}finally{active--}
    })
    await new Promise(resolve=>setTimeout(resolve,0))
    assert.deepEqual(results,['fast']);assert.equal(max,2)
    release();await job
    assert.deepEqual(results,['fast','slow'])
    assert.deepEqual(progress.at(-1),{total:3,done:3,failed:1})
})
