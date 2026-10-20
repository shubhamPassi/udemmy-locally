import { isDriveVideo } from './hostedVideoPolicy.js'

// Remote previews share bandwidth with playback and Google's request quotas.
export function previewWorkload(video, saveData = false) {
    return isDriveVideo(video)
        ? { concurrency: 1, delay: saveData ? 1000 : 400 }
        : { concurrency: saveData ? 1 : 2, delay: 80 }
}

// A separate, paused decoder keeps hover seeks out of playback and study tracking.
export function createTimelinePreview(video, capture, publish) {
    let latest = null, running = false, disposed = false, cancelWait
    const cache = new Map()
    function wait(event, action) {
        return new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timer)
                video.removeEventListener(event, done)
                video.removeEventListener('error', fail)
                cancelWait = null
                error ? reject(error) : resolve()
            }
            const done = () => finish(), fail = () => finish(new Error('Preview unavailable'))
            const timer = setTimeout(fail, event === 'loadedmetadata' ? 20000 : 15000)
            cancelWait = fail
            video.addEventListener(event, done, { once: true })
            video.addEventListener('error', fail, { once: true })
            try { action?.() } catch (error) { finish(error) }
        })
    }
    async function drain() {
        if (running || disposed) return
        running = true
        while (latest && !disposed) {
            const request = latest
            latest = null
            try {
                let image = cache.get(request.time)
                if (!image) {
                    if (video.readyState < 1) await wait('loadedmetadata', () => video.load())
                    const target = Math.min(request.time, Math.max(0, video.duration - 0.001))
                    if (Math.abs(video.currentTime - target) > 0.001 || video.readyState < 2) {
                        // Metadata-only media may never emit loadeddata at time
                        // zero. An explicit seek requests and decodes that frame.
                        const seekTime = video.readyState < 2 && Math.abs(video.currentTime - target) <= 0.001
                            ? Math.min(target + 0.001, Math.max(0, video.duration - 0.001)) : target
                        await wait('seeked', () => { video.currentTime = seekTime })
                    }
                    if (disposed) break
                    image = await capture(video)
                    if (disposed) break
                    cache.set(request.time, image)
                    if (cache.size > 32) cache.delete(cache.keys().next().value)
                }
                if (!latest && !disposed) publish(request.time, image)
            } catch (error) {
                if (!latest && !disposed) publish(request.time, null, error)
            }
        }
        running = false
    }
    return {
        request(time) { latest = { time }; void drain() },
        dispose() {
            disposed = true
            latest = null
            cancelWait?.()
            cache.clear()
            video.removeAttribute('src')
            video.load()
            video.remove?.()
        },
    }
}

export function timelinePosition(clientX, rect, duration) {
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    return { time: fraction * duration, x: fraction * rect.width }
}

// Cover the entire timeline first, then fill in finer intervals. Concurrency is
// bounded because hundreds of simultaneous media seeks would starve playback.
export const PREVIEW_INTERVAL_SECONDS = 10

export function previewBucket(time, duration = Infinity) {
    return Math.floor(Math.max(0, Math.min(time || 0, Math.max(0, duration - 0.001))) / PREVIEW_INTERVAL_SECONDS) * PREVIEW_INTERVAL_SECONDS
}

export function formatPreviewTime(time) {
    const seconds = Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':')
}

export function previewSampleTimes(duration) {
    if (!(duration > 0)) return []
    const times = new Set()
    const add = time => times.add(previewBucket(time, duration))
    for (let index = 0; index <= 24; index++) add(duration * index / 24)
    for (let time = 0; time < duration; time += PREVIEW_INTERVAL_SECONDS) add(time)
    return [...times]
}

export function canPrepareTimeline(media, hidden = false) {
    return !hidden && !!media && !media.error && !media.seeking && media.readyState >= 1 && (media.paused || media.readyState >= 3)
}

export function warmTimelinePreviews({ duration, createVideo, capture, onUpdate, initialFrames = [], canRun = () => true, concurrency = 2, delay = 80 }) {
    const frames = new Map(initialFrames), times = previewSampleTimes(duration).filter(time=>!frames.has(time)).map(time=>({time,attempt:0})), workers = []
    let next = 0, disposed = false
    const pending = new Set()
    const pause = () => new Promise(resolve => {
        const timer = setTimeout(() => { pending.delete(cancel); resolve() }, delay)
        const cancel = () => { clearTimeout(timer); resolve() }
        pending.add(cancel)
    })
    async function run() {
        if(next>=times.length || disposed)return
        const video = createVideo()
        let finish, failures = 0
        const decoder = createTimelinePreview(video, capture, (time, image, error) => finish?.({ time, image, error }))
        const cancel = () => finish?.({ image: null })
        workers.push({ decoder, cancel })
        while (!disposed && next < times.length && failures < 6) {
            if (!canRun()) { await pause(); continue }
            const request = times[next++], time=request.time
            if (frames.has(time)) continue
            const frame = await new Promise(resolve => { finish = resolve; decoder.request(time) })
            finish = null
            if (disposed) break
            if (frame.image) {
                failures = 0
                frames.set(frame.time, frame.image)
                onUpdate?.(frame.time)
            } else {
                failures++
                if(frame.error?.name==='SecurityError'||video.error?.code===4)break
                if(request.attempt<1)times.push({time,attempt:request.attempt+1})
            }
            await pause()
        }
        decoder.dispose()
    }
    const done = Promise.all(Array.from({ length: Math.max(1, Math.min(2, concurrency)) }, run))
    return {
        done,
        get(time) {
            const timestamp = previewBucket(time, duration), image = frames.get(timestamp)
            return image ? { time: timestamp, image } : null
        },
        dispose() {
            disposed = true
            for (const worker of workers) { worker.cancel(); worker.decoder.dispose() }
            for (const cancel of pending) cancel()
            pending.clear()
            frames.clear()
        },
    }
}
