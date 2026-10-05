// Only timestamp-aware panels subscribe; ticks do not re-render the course page.
export function createPlaybackClock() {
    let time = 0
    const listeners = new Set()
    return {
        getSnapshot: () => time,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        update: next => {
            if (!Number.isFinite(next) || next < 0) return
            const changed = Math.floor(next) !== Math.floor(time)
            time = next
            if (changed) for (const listener of listeners) listener()
        },
    }
}
