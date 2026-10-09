export function courseDuration(seconds) {
    const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60)
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function contentDuration(seconds) {
    const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60)
    const hours = Math.floor(minutes / 60)
    return hours ? `${hours}hr${minutes % 60 ? ` ${minutes % 60}min` : ''}` : `${minutes}min`
}
