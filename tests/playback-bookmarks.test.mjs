import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writePlaybackBookmark, readPlaybackBookmark, withPlaybackBookmark, resumeTime } from '../src/utils/playbackBookmarks.js'
const entries = new Map()
globalThis.localStorage = { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) }
test('last real playback time survives reload and overrides older asynchronous database data', () => {
 writePlaybackBookmark('lesson', 599, 1099)
 const stored = { id:'lesson', duration:0, lastWatchedPosition:0, lastWatchedAt:'2020-01-01T00:00:00.000Z' }
 assert.equal(resumeTime(stored),599)
 assert.equal(withPlaybackBookmark(stored).duration,1099)
 assert.equal(readPlaybackBookmark('lesson').position,599)
 assert.equal(resumeTime(stored,false),0)
})
test('completed videos restart, intentional rewind to zero is saved, invalid samples cannot erase progress', () => {
 assert.equal(resumeTime({id:'lesson',isCompleted:true}),0)
 writePlaybackBookmark('lesson',NaN,100)
 assert.equal(readPlaybackBookmark('lesson').position,599)
 writePlaybackBookmark('lesson',0,1099)
 assert.equal(resumeTime({id:'lesson',lastWatchedPosition:599}),0)
})
test('newer database progress wins over old cache and malformed cache is ignored', () => {
 const video={id:'lesson',duration:1200,lastWatchedPosition:900,lastWatchedAt:'2999-01-01T00:00:00.000Z'}
 assert.equal(resumeTime(video),900)
 entries.set('tutin_playback_broken','bad json')
 assert.equal(readPlaybackBookmark('broken'),null)
})
