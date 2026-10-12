import test from 'node:test'
import assert from 'node:assert/strict'
import {createLearningPlayerTools,normalizeChapters} from '../src/utils/learningPlayerTools.js'
test('section repeat ignores pauses/seeks and sleep timer pauses once at its deadline',()=>{
    let time=10,paused=false,seeking=false,now=0,pauses=0
    const tools=createLearningPlayerTools({read:()=>({time,paused,seeking}),seek:value=>{time=value},pause:()=>{paused=true;pauses++}},()=>now)
    tools.setA(10);assert.throws(()=>tools.setB(9));tools.setB(20);tools.toggleLoop()
    time=21;seeking=true;tools.tick();assert.equal(time,21)
    seeking=false;tools.tick();assert.equal(time,10)
    tools.sleep(15);now=15*60000;tools.tick();tools.tick();assert.equal(pauses,1);assert.equal(tools.state().sleepUntil,0)
    assert.deepEqual(normalizeChapters([{time:-1,title:'bad'},{time:20,title:'Later'},{time:10,title:' Intro '}]),[{time:10,title:'Intro'},{time:20,title:'Later'}])
})
test('repeat at the video end resumes the section and checkpoints time before seeking',()=>{
    const calls=[],tools=createLearningPlayerTools({read:()=>({time:30,paused:true,ended:true}),beforeLoop:()=>calls.push('checkpoint'),seek:time=>calls.push(time),play:()=>calls.push('play'),pause:()=>{}})
    tools.setA(10);tools.setB(30);tools.toggleLoop();tools.tick()
    assert.deepEqual(calls,['checkpoint',10,'play'])
})
