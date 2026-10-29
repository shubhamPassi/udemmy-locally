import { driveSession, restoreDriveAuthorization } from './driveAuthorization.js'

export async function driveMetadataAccess(apiKey = '') {
    let account = driveSession()
    if (!(account?.expiresAt > Date.now()+5000)) account = await restoreDriveAuthorization().catch(()=>null)
    return account?.expiresAt > Date.now()+5000 ? {token:account.token} : apiKey?.trim() ? {apiKey:apiKey.trim()} : null
}

// Folder metadata only: no alt=media requests, decoders or video relays.
export async function driveFolderDurations(folderId, access) {
    const durations = new Map()
    if (!access || !/^[a-zA-Z0-9_-]{8,160}$/.test(folderId || '')) return durations
    let pageToken = ''
    const seen = new Set()
    try {
        do {
            if (seen.has(pageToken) || seen.size >= 100) break
            seen.add(pageToken)
            const params = new URLSearchParams({q:`'${folderId}' in parents and trashed = false`,fields:'nextPageToken,files(id,videoMediaMetadata(durationMillis))',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})})
            if (!access.token) params.set('key',access.apiKey)
            const response = await fetch('https://www.googleapis.com/drive/v3/files?'+params,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),headers:access.token?{Authorization:'Bearer '+access.token}:{}})
            if (!response.ok) break
            const data = await response.json()
            for (const file of data.files || []) {
                const milliseconds = Number(file.videoMediaMetadata?.durationMillis)
                if (Number.isFinite(milliseconds) && milliseconds > 0) durations.set(file.id,Math.max(1,Math.round(milliseconds/1000)))
            }
            pageToken = data.nextPageToken || ''
        } while (pageToken)
    } catch { /* Keep accessible metadata; unknown lengths must not erase saved ones. */ }
    return durations
}
