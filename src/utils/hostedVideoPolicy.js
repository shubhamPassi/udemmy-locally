export function isDriveVideo(video) {
    return !!video?.driveFileId || /^https:\/\/drive\.google\.com\//i.test(video?.url || '')
}

export function preferHostedDrivePreview(video, hosted) {
    return hosted && isDriveVideo(video)
}
