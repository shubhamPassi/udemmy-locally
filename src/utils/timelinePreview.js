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
