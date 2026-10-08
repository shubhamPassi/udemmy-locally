import { test } from 'node:test'
import assert from 'node:assert/strict'
import { learningStats } from '../src/utils/learningStats.js'
test('completed lessons count without watch history and saved time cannot exceed duration',()=>{
 const stats=learningStats([{id:'c'}],[{courseId:'c',isCompleted:true,duration:100},{courseId:'c',duration:50,lastWatchedPosition:999}],new Date(2026,9,8))
 assert.equal(stats.completed,1);assert.equal(stats.total,2);assert.equal(stats.savedSeconds,150);assert.equal(stats.percent,50);assert.equal(stats.active,1)
})
test('recent activity uses local calendar days and excludes older dates',()=>{
 const stats=learningStats([{id:'c'}],[{courseId:'c',lastWatchedAt:new Date(2026,9,8,10).toISOString()},{courseId:'c',lastWatchedAt:new Date(2026,8,1).toISOString()}],new Date(2026,9,8,12))
 assert.equal(stats.days.length,7);assert.equal(stats.days[6].count,1);assert.equal(stats.days.reduce((s,d)=>s+d.count,0),1)
})
