import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTimelinePreview, timelinePosition, previewSampleTimes, warmTimelinePreviews, previewBucket, formatPreviewTime } from '../src/utils/timelinePreview.js'

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

test('background workers prepare the full timeline and cached hover reads require no seek', async () => {
    const videos = []
    const pool = warmTimelinePreviews({
        duration: 100,
        createVideo: () => { const video = new Decoder(); videos.push(video); return video },
        capture: media => `frame:${media.currentTime}`,
        delay: 0,
    })
    await pool.done
    assert.equal(videos.length, 2)
    assert.equal(videos.flatMap(video => video.seeks).length, previewSampleTimes(100).length - 1)
    const seeks = videos.flatMap(video => video.seeks).length
    assert.deepEqual(pool.get(15), { time: 15, image: 'frame:15' })
    assert.deepEqual(pool.get(19.9), pool.get(15))
    assert.equal(videos.flatMap(video => video.seeks).length, seeks)
    assert.equal(pool.get(99).time, 95)
    pool.dispose()
    assert.equal(pool.get(15), null)
})

test('even long videos retain every five-second preview and distribute early samples across the timeline', () => {
    const times = previewSampleTimes(36000)
    assert.equal(times.length, 7200)
    assert.equal(times[1], 1500)
    assert.equal(times[24], 35995)
    assert.deepEqual([...times].sort((a,b) => a-b), Array.from({ length: 7200 }, (_, index) => index * 5))
    assert.equal(new Set(times).size, times.length)
})

test('buffering pauses preparation and source changes cancel all pending work', async () => {
    const videos = []
    const pool = warmTimelinePreviews({ duration: 100, createVideo: () => { const video = new Decoder(); videos.push(video); return video }, capture: () => 'image', canRun: () => false, delay: 1 })
    await settle()
    assert.equal(videos.flatMap(video => video.seeks).length, 0)
    pool.dispose()
    await pool.done
    assert.equal(pool.get(15), null)
})

test('persistent frame failures stop background requests instead of scanning every timestamp', async () => {
    const videos = []
    const pool = warmTimelinePreviews({ duration: 100, createVideo: () => { const video = new Decoder(); videos.push(video); return video }, capture: () => { throw new Error('blocked') }, delay: 0 })
    await pool.done
    assert.ok(videos.flatMap(video => video.seeks).length <= 6)
    assert.equal(pool.get(15), null)
    pool.dispose()
})

test('hover intervals share frames while timestamps show hours, minutes and whole seconds', () => {
    assert.equal(previewBucket(10.5, 100), 10)
    assert.equal(previewBucket(14.9, 100), 10)
    assert.equal(previewBucket(15, 100), 15)
    assert.equal(previewBucket(100, 100), 95)
    assert.equal(formatPreviewTime(10.9), '00:00:10')
    assert.equal(formatPreviewTime(910.7), '00:15:10')
    assert.equal(formatPreviewTime(3661.9), '01:01:01')
})
