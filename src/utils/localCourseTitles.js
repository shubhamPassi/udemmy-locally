export function localCourseTitle(name, isFile = false) {
    const base = isFile ? name.replace(/\.[^.]+$/, '') : name
    return base.replace(/^\d+[\s._-]+/, '').trim() || base
}

export function restoreLocalModuleTitle(module) {
    // Only repair the exact numeric result of the old dotted-folder parser.
    // Preserve custom titles, ordering, IDs, and playback progress.
    const match = module.originalTitle?.match(/^(\d+)\.\s+(.+)$/)
    if (match && module.title === match[1]) return { ...module, title: localCourseTitle(module.originalTitle) }
    return module
}
