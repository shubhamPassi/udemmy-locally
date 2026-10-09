export function moduleTotals(videos) {
    const totals = new Map()
    for (const video of videos) {
        let own = totals.get(video.moduleId)
        if (!own) { own = { totalDuration: 0, completedVideos: 0 }; totals.set(video.moduleId, own) }
        own.totalDuration += video.duration || 0
        if (video.isCompleted) own.completedVideos++
    }
    return totals
}
