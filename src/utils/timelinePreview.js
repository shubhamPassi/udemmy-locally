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
            const timer = setTimeout(fail, 8000)
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
                    if (Math.abs(video.currentTime - target) > 0.001) await wait('seeked', () => { video.currentTime = target })
                    else if (video.readyState < 2) await wait('loadeddata')
                    if (disposed) break
                    image = capture(video)
                    cache.set(request.time, image)
                    if (cache.size > 32) cache.delete(cache.keys().next().value)
                }
                if (!latest && !disposed) publish(request.time, image)
            } catch {
                if (!latest && !disposed) publish(request.time, null)
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
        },
    }
}

export function timelinePosition(clientX, rect, duration) {
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    return { time: fraction * duration, x: fraction * rect.width }
}

// Cover the entire timeline first, then fill in finer intervals. Concurrency is
// bounded because hundreds of simultaneous media seeks would starve playback.
export function previewSampleTimes(duration, maxFrames = 720) {
    if (!(duration > 0)) return []
    const step = Math.max(5, duration / maxFrames)
    const times = new Set()
    const add = time => times.add(Math.round(Math.min(time, Math.max(0, duration - 0.001)) * 1000) / 1000)
    for (let index = 0; index <= 24; index++) add(duration * index / 24)
    for (let time = 0; time < duration; time += step) add(time)
    return [...times]
}

export function warmTimelinePreviews({ duration, createVideo, capture, onUpdate, canRun = () => true, concurrency = 2, delay = 80 }) {
    const times = previewSampleTimes(duration), frames = new Map(), workers = []
    let next = 0, disposed = false
    const pending = new Set()
    const pause = () => new Promise(resolve => {
        const timer = setTimeout(() => { pending.delete(cancel); resolve() }, delay)
        const cancel = () => { clearTimeout(timer); resolve() }
        pending.add(cancel)
    })
    async function run() {
        const video = createVideo()
        let finish, failures = 0
        const decoder = createTimelinePreview(video, capture, (time, image) => finish?.({ time, image }))
        const cancel = () => finish?.({ image: null })
        workers.push({ decoder, cancel })
        while (!disposed && next < times.length && failures < 3) {
            if (!canRun()) { await pause(); continue }
            const time = times[next++]
            const frame = await new Promise(resolve => { finish = resolve; decoder.request(time) })
            finish = null
            if (disposed) break
            if (frame.image) {
                failures = 0
                frames.set(frame.time, frame.image)
                onUpdate?.()
            } else failures++
            await pause()
        }
        decoder.dispose()
    }
    const done = Promise.all(Array.from({ length: Math.max(1, Math.min(2, concurrency)) }, run))
    return {
        done,
        nearest(time) {
            let nearest = null, distance = Infinity
            for (const [timestamp, image] of frames) {
                const difference = Math.abs(timestamp - time)
                if (difference < distance) { distance = difference; nearest = { time: timestamp, image } }
            }
            return nearest
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
