export function isDriveVideo(video) {
    return !!video?.driveFileId || /^https:\/\/drive\.google\.com\//i.test(video?.url || '')
}

export function disableHostedDriveBackground(video, hosted) {
    return hosted && isDriveVideo(video)
}
