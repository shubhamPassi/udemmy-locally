export function matchReconnectFile(existing, scanned) {
    const normalize=value=>String(value||'').replace(/\\/g,'/').toLowerCase()
    const path=normalize(existing.filePath)
    const exact=scanned.find(file=>path===normalize(file.filePath)||path.endsWith('/'+normalize(file.filePath)))
    if(exact)return exact
    const name=normalize(existing.fileName||existing.originalTitle)
    const candidates=scanned.filter(file=>normalize(file.fileName||file.originalTitle)===name)
    return candidates.length===1?candidates[0]:null
}
