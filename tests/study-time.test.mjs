import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addStudyInterval, hourKey, measuredStudySeconds, readStudySessions, clearStudyHistory } from '../src/utils/studyTime.js'
test('study time is actual elapsed playback, not skipped content or playback speed',()=>{
 assert.equal(measuredStudySeconds({playing:true,time:10,rate:2},{time:12},1),1)
 assert.equal(measuredStudySeconds({playing:false,time:10,rate:1},{time:10},1),0)
 assert.equal(measuredStudySeconds({playing:true,time:10,rate:1},{time:100},1),0)
 assert.equal(measuredStudySeconds({playing:true,time:10,rate:1},{time:10},1),0)
 assert.equal(measuredStudySeconds({playing:true,time:10,rate:1},{time:11,seeking:true},1),0)
})
test('study sessions split accurately across hour and day boundaries',()=>{
 const start=new Date(2026,9,8,23,59,50),end=new Date(2026,9,9,0,0,10),hours={}
 addStudyInterval(hours,start.getTime(),end.getTime())
 assert.equal(hours[hourKey(start)],10)
 assert.equal(hours[hourKey(end)],10)
})
test('unchanged study sessions retain their snapshot and changed or removed records invalidate it',()=>{
 const original=globalThis.localStorage
 const storage={tutin_study_session_test:JSON.stringify({version:1,hours:{'2026-10-09T10':60}})}
 Object.defineProperty(storage,'getItem',{value:key=>storage[key]||null})
 Object.defineProperty(storage,'removeItem',{value:key=>delete storage[key]})
 globalThis.localStorage=storage
 try{
  const first=readStudySessions()
  assert.equal(readStudySessions(),first)
  storage.tutin_study_session_test=JSON.stringify({version:1,hours:{'2026-10-09T10':120}})
  const next=readStudySessions()
  assert.notEqual(next,first);assert.equal(next[0].hours['2026-10-09T10'],120)
  delete storage.tutin_study_session_test
  assert.deepEqual(readStudySessions(),[])
  clearStudyHistory()
 }finally{globalThis.localStorage=original}
})
