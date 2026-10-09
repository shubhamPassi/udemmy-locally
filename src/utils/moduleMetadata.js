export function applyVideoDurations(modules, durations) {
    let changed = false
    const result = modules.map(module => {
        const existingVideos = module.videos || []
        let videosChanged = false
        const videos = existingVideos.map(video => {
            const duration = durations.get(video.id)
            if (!Number.isFinite(duration) || duration <= 0 || duration === video.duration) return video
            videosChanged = true
            return { ...video, duration }
        })
        const children = module.subModules || []
        const subModules = applyVideoDurations(children, durations)
        if (!videosChanged && subModules === children) return module
        changed = true
        return { ...module, videos: videosChanged ? videos : existingVideos, subModules }
    })
    return changed ? result : modules
}
