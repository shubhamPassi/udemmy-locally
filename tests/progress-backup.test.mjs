import test from 'node:test'
import assert from 'node:assert/strict'
import { exportProgressBackup,restoreProgressBackup } from '../src/utils/progressBackup.js'
import { recordWatchedRange,readCoverage,clearWatchCoverage } from '../src/utils/watchCoverage.js'
import { saveStudySession,readStudyHours,clearStudyHistory } from '../src/utils/studyTime.js'
import { writePlaybackBookmark,readPlaybackBookmark,clearPlaybackBookmarks } from '../src/utils/playbackBookmarks.js'
test('backup restores exact coverage, resume positions and study hours without doubling repeated restores',()=>{
 const original=globalThis.localStorage,storage={}
 Object.defineProperties(storage,{getItem:{value:key=>storage[key]||null},setItem:{value:(key,value)=>storage[key]=value},removeItem:{value:key=>delete storage[key]}})
 globalThis.localStorage=storage
 try {
  writePlaybackBookmark('lesson',40,100)
  recordWatchedRange('lesson',10,20)
  saveStudySession('session',{videoId:'lesson',courseId:'course',hours:{'2026-10-09T10':10}})
  storage.secret='should not export'
  const backup=exportProgressBackup()
  assert.ok(!JSON.stringify(backup).includes('secret'))
  clearWatchCoverage();clearStudyHistory();clearPlaybackBookmarks()
  restoreProgressBackup(backup);restoreProgressBackup(backup)
  assert.equal(readPlaybackBookmark('lesson').position,40)
  assert.deepEqual(readCoverage('lesson'),[[10,20]])
  assert.equal(readStudyHours()['2026-10-09T10'],10)
  restoreProgressBackup({version:1,bookmarks:{secret:{position:1}},coverage:{other:[[0,10]]},sessions:{bad:{version:1,hours:{}}}})
  assert.equal(storage.secret,'should not export')
 }finally{clearWatchCoverage();clearStudyHistory();clearPlaybackBookmarks();globalThis.localStorage=original}
})
