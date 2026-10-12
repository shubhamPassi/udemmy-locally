import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTimelinePreview, timelinePosition } from '../src/utils/timelinePreview.js'

class Decoder extends EventTarget {
    readyState = 2
    duration = 100
    time = 0
    seeks = []
    get currentTime() { return this.time }
    set currentTime(time) {
        this.time = time
        this.seeks.push(time)
        setTimeout(() => this.dispatchEvent(new Event('seeked')), 0)
    }
    load() {}
    removeAttribute() {}
}
const settle = () => new Promise(resolve => setTimeout(resolve, 30))

test('hover requests decode exact fractional times without playing; repeated frames are cached', async () => {
    const video = new Decoder(), frames = []
    video.play = () => assert.fail('Preview must never play')
    const preview = createTimelinePreview(video, media => `frame:${media.currentTime}`, (...frame) => frames.push(frame))
    preview.request(10.5)
    await settle()
    assert.deepEqual(frames, [[10.5, 'frame:10.5']])
    preview.request(10.5)
    await settle()
    assert.deepEqual(video.seeks, [10.5])
    preview.dispose()
})

test('rapid hover changes serialize seeks and publish only the latest frame', async () => {
    const video = new Decoder(), frames = []
    const preview = createTimelinePreview(video, media => `frame:${media.currentTime}`, (...frame) => frames.push(frame))
    preview.request(10.5)
    preview.request(20.25)
    preview.request(30.75)
    await settle()
    assert.deepEqual(video.seeks, [10.5, 30.75])
    assert.deepEqual(frames, [[30.75, 'frame:30.75']])
    preview.dispose()
})

test('source cleanup ignores pending frames and capture failures allow timestamp fallback', async () => {
    const video = new Decoder(), frames = []
    const preview = createTimelinePreview(video, () => { throw new Error('Cross-origin capture denied') }, (...frame) => frames.push(frame))
    preview.request(10.5)
    await settle()
    assert.deepEqual(frames, [[10.5, null]])
    preview.request(20)
    preview.dispose()
    await settle()
    assert.equal(frames.length, 1)
})

test('pointer position maps to the hovered timestamp and clamps the timeline edges', () => {
    const rect = { left: 10, width: 200 }
    assert.deepEqual(timelinePosition(31, rect, 100), { time: 10.5, x: 21 })
    assert.equal(timelinePosition(-50, rect, 100).time, 0)
    assert.equal(timelinePosition(500, rect, 100).time, 100)
})
