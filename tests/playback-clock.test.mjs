import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlaybackClock } from '../src/utils/playbackClock.js'
test('notes receive precise playback time without repeated UI notifications within a second',()=>{
 const clock=createPlaybackClock()
 let notifications=0
 const unsubscribe=clock.subscribe(()=>notifications++)
 clock.update(599.1);clock.update(599.4);clock.update(599.8)
 assert.equal(clock.getSnapshot(),599.8)
 assert.equal(notifications,1)
 clock.update(600.1)
 assert.equal(notifications,2)
 unsubscribe();clock.update(601.1)
 assert.equal(notifications,2)
})
test('new lessons reset the clock and invalid samples leave the timestamp intact',()=>{
 const clock=createPlaybackClock()
 clock.update(599);clock.update(0)
 assert.equal(clock.getSnapshot(),0)
 clock.update(NaN);clock.update(-1)
 assert.equal(clock.getSnapshot(),0)
})
