import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTimelinePreview, timelinePosition, previewSampleTimes, warmTimelinePreviews, previewBucket, formatPreviewTime, canPrepareTimeline, previewWorkload } from '../src/utils/timelinePreview.js'

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

test('Drive background previews use a single paced decoder while local previews retain their concurrency', async () => {
    const drive = {driveFileId:'public12345'}
    assert.deepEqual(previewWorkload(drive), {concurrency:1,delay:2000,minBufferSeconds:30,maxFailures:1})
    assert.deepEqual(previewWorkload(drive,true), {concurrency:1,delay:5000,minBufferSeconds:30,maxFailures:1})
    assert.deepEqual(previewWorkload({filePath:'lesson.mp4'}), {concurrency:2,delay:80,minBufferSeconds:0,maxFailures:6})
    let decoders=0
    const pool=warmTimelinePreviews({...previewWorkload(drive),delay:0,duration:20,createVideo:()=>{decoders++;return new Decoder()},capture:media=>`frame:${media.currentTime}`})
    await pool.done
    assert.equal(decoders,1)
    assert.equal(pool.get(10).image,'frame:10')
    pool.dispose()
})

test('remote preparation waits for a first frame and sufficient playback buffer',()=>{
    const media={readyState:1,paused:true,seeking:false,currentTime:10,duration:100}
    assert.equal(canPrepareTimeline(media,false,30),false)
    media.readyState=2
    assert.equal(canPrepareTimeline(media,false,30),true)
    media.paused=false;media.readyState=4
    media.buffered={length:1,start:()=>0,end:()=>20}
    assert.equal(canPrepareTimeline(media,false,30),false)
    media.buffered.end=()=>45
    assert.equal(canPrepareTimeline(media,false,30),true)
    assert.equal(canPrepareTimeline({...media,seeking:true},false,30),false)
    assert.equal(canPrepareTimeline(media,true,30),false)
})

test('buffering cancels an in-flight decoder and resumes without discarding cached frames',async()=>{
    let allowed=true,release
    const videos=[]
    const pool=warmTimelinePreviews({duration:30,concurrency:1,delay:1,canRun:()=>allowed,initialFrames:[[0,'saved-frame']],createVideo:()=>{const video=new Decoder();videos.push(video);return video},capture:()=>new Promise(resolve=>{release=resolve})})
    await settle()
    allowed=false;pool.suspend()
    const stopped=videos[0]
    release?.('stale-frame')
    await settle()
    assert.equal(pool.get(0).image,'saved-frame')
    assert.equal(pool.get(10),null)
    assert.equal(videos.length,1)
    assert.equal(stopped.seeks.length,1)
    allowed=true
    await settle()
    assert.equal(videos.length,2)
    pool.dispose()
    await pool.done
})

test('remote preview failures stop at the configured limit without a retry burst',async()=>{
    let captures=0
    const pool=warmTimelinePreviews({...previewWorkload({driveFileId:'public12345'}),duration:100,delay:0,createVideo:()=>new Decoder(),capture:()=>{captures++;throw Error('Google refused request')}})
    await pool.done
    assert.equal(captures,1)
    pool.dispose()
})

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
    assert.deepEqual(frames.map(frame=>frame.slice(0,2)), [[10.5, null]])
    assert.match(frames[0][2].message,/Cross-origin/)
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
    assert.deepEqual(pool.get(10), { time: 10, image: 'frame:10' })
    assert.deepEqual(pool.get(19.9), pool.get(10))
    assert.equal(videos.flatMap(video => video.seeks).length, seeks)
    assert.equal(pool.get(99).time, 90)
    pool.dispose()
    assert.equal(pool.get(15), null)
})

test('even long videos retain every ten-second preview and distribute early samples across the timeline', () => {
    const times = previewSampleTimes(36000)
    assert.equal(times.length, 3600)
    assert.equal(times[1], 1500)
    assert.equal(times[24], 35990)
    assert.deepEqual([...times].sort((a,b) => a-b), Array.from({ length: 3600 }, (_, index) => index * 10))
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
    assert.ok(videos.flatMap(video => video.seeks).length <= 12)
    assert.equal(pool.get(15), null)
    pool.dispose()
})

test('hover intervals share frames while timestamps show hours, minutes and whole seconds', () => {
    assert.equal(previewBucket(10.5, 100), 10)
    assert.equal(previewBucket(14.9, 100), 10)
    assert.equal(previewBucket(19.9, 100), 10)
    assert.equal(previewBucket(20, 100), 20)
    assert.equal(previewBucket(100, 100), 90)
    assert.equal(formatPreviewTime(10.9), '00:00:10')
    assert.equal(formatPreviewTime(910.7), '00:15:10')
    assert.equal(formatPreviewTime(3661.9), '01:01:01')
})

test('paused metadata-only lessons can warm previews without waiting for Play or canplay', () => {
    const media = { readyState: 1, paused: true, seeking: false }
    assert.equal(canPrepareTimeline(media), true)
    assert.equal(canPrepareTimeline({ ...media, paused: false }), false)
    assert.equal(canPrepareTimeline({ ...media, readyState: 3, paused: false }), true)
    assert.equal(canPrepareTimeline(media, true), false)
    assert.equal(canPrepareTimeline({ ...media, seeking: true }), false)
})

test('metadata-only decoders actively request the first frame rather than waiting for loadeddata', async () => {
    class MetadataDecoder extends Decoder {
        readyState = 0
        load() { if (this.readyState === 0) { this.readyState = 1; queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))) } }
        get currentTime() { return super.currentTime }
        set currentTime(time) { this.readyState = 2; super.currentTime = time }
    }
    const video = new MetadataDecoder(), frames = []
    const decoder = createTimelinePreview(video, media => {
        assert.equal(media.readyState, 2)
        return 'decoded-first-frame'
    }, (...frame) => frames.push(frame))
    decoder.request(0)
    await settle()
    assert.deepEqual(video.seeks, [0.001])
    assert.deepEqual(frames, [[0, 'decoded-first-frame']])
    decoder.dispose()
})

test('background publishes the prepared interval so an already-hovered empty cache can refresh', async () => {
    const published = []
    const pool = warmTimelinePreviews({ duration: 20, createVideo: () => new Decoder(), capture: media => `frame:${media.currentTime}`, onUpdate: time => published.push(time), delay: 0 })
    assert.equal(pool.get(10), null)
    await pool.done
    assert.deepEqual([...published].sort((a,b) => a-b), [0, 10])
    assert.equal(pool.get(10).image, 'frame:10')
    pool.dispose()
})

test('a thumbnail is not advertised as cached until its background image decoding completes', async () => {
    let release
    const decoded = new Promise(resolve => { release = resolve }), frames = []
    const video = new Decoder()
    const decoder = createTimelinePreview(video, async () => { await decoded; return 'decoded-thumbnail' }, (...frame) => frames.push(frame))
    decoder.request(10)
    await settle()
    assert.equal(frames.length, 0)
    release()
    await settle()
    assert.deepEqual(frames, [[10, 'decoded-thumbnail']])
    decoder.dispose()
})
test('preparation selectively retries a transient failed interval without decoding successful frames again',async()=>{
    const attempts=new Map()
    const pool=warmTimelinePreviews({duration:30,createVideo:()=>new Decoder(),capture:media=>{const time=media.currentTime;attempts.set(time,(attempts.get(time)||0)+1);if(time===10&&attempts.get(time)===1)throw Error('Temporary fetch failure');return `frame:${time}`},delay:0})
    await pool.done
    assert.equal(pool.get(10).image,'frame:10');assert.equal(attempts.get(10),2);assert.equal(attempts.get(20),1)
    pool.dispose()
})
