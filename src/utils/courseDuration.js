export function courseDuration(seconds) {
    const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60)
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
