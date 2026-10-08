// Flatten only scanner-generated video buckets, without changing saved module/video IDs.
export function playlistDisplay(modules) {
    return modules.map(module => {
        const videos = [...(module.videos || [])], subModules = []
        for (const child of playlistDisplay(module.subModules || [])) {
            const generated = child.title === 'Videos' && child.originalTitle === 'Videos' &&
                !child.folderPath && !child.subModules.length
            if (generated) videos.push(...child.videos)
            else subModules.push(child)
        }
        return { ...module, videos, subModules }
    })
}
