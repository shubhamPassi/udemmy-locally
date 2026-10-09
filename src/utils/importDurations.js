export function importVideos(modules) {
    return modules.flatMap(module => [...(module.videos || []), ...importVideos(module.subModules || [])])
}
export function applyImportDuration(modules, key, duration) {
    return modules.map(module => {
        const videos = (module.videos || []).map(video => (video.filePath || video.id || video.url) === key ? { ...video, duration } : video)
        const subModules = applyImportDuration(module.subModules || [], key, duration)
        return { ...module, videos, subModules, totalDuration: videos.reduce((sum, video) => sum + (video.duration || 0), 0) + subModules.reduce((sum, child) => sum + child.totalDuration, 0) }
    })
}
