import { discoverDriveSubtitles, loadDriveSubtitle } from './driveSubtitles.js'
import { readProgressValue, writeProgressValue } from './progressStorage.js'
import { fetchPublicImport } from './publicImport.js'
import { youtubeId } from './youtubeIdentity.js'
import { IS_BROWSER_MODE, get, fetchYoutubeTranscript } from './api.js'

export function normalizeTranscript(chunks) {
    return (Array.isArray(chunks) ? chunks : []).map(cue => ({ ...cue, start: Number(cue.start ?? cue.timestamp?.[0]), end: Number(cue.end ?? cue.timestamp?.[1]), text: String(cue.text || '').replace(/<[^>]*>/g,'').trim() }))
        .filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.text).sort((a,b) => a.start-b.start)
}
export function activeTranscriptIndex(cues, time) {
    let low=0,high=cues.length-1,index=-1
    while(low<=high){const middle=(low+high)>>1;if(cues[middle].start<=time){index=middle;low=middle+1}else high=middle-1}
    return index>=0&&time<cues[index].end?index:-1
}
export function cachedTranscript(video) {
    try { const value=normalizeTranscript(JSON.parse(readProgressValue('tutin_subtitles_'+video.id)));if(value.length)return value } catch {}
    return normalizeTranscript(video?.captionChunks)
}
export function needsTranscriptRefresh(video,cues) {
    const source=cues[0]?.sourceProvider
    // Uploaded/manual captions take priority over automated updates.
    return !!source && cues[0]?.sourceRevision !== String(video.subtitleRevision || video.transcriptRefreshAt || '')
}
export async function loadLessonTranscript(video, apiKey, { signal, force=false } = {}) {
    const cached=cachedTranscript(video)
    if(cached.length&&!force&&!needsTranscriptRefresh(video,cached))return cached
    let cues,provider
    if(video.driveFileId||/drive\.google\.com/.test(video.url||'')){
        const sources=await discoverDriveSubtitles(video,apiKey,signal,id=>fetchPublicImport('drive',id,undefined,force))
        if(!sources.length)throw Error('No matching SRT or VTT file was found beside this lesson in Drive.')
        cues=await loadDriveSubtitle(sources[0],apiKey,signal);provider='drive'
    }else if(youtubeId(video)){
        const data=IS_BROWSER_MODE?await fetchPublicImport('youtube',youtubeId(video),'transcript',force):await fetchYoutubeTranscript(youtubeId(video))
        cues=normalizeTranscript(data.chunks);provider='youtube'
    }else if(!IS_BROWSER_MODE){cues=normalizeTranscript(await get(`/api/transcripts/${video.id}/chunks`));provider='local'}
    else cues=normalizeTranscript(video.captionChunks)
    if(signal?.aborted)throw Error('Cancelled')
    if(!cues?.length)throw Error('No timed transcript is available. Import an SRT/VTT file in Subtitle settings, or generate a transcript in the AI tab.')
    const result=normalizeTranscript(cues).map(cue=>({...cue,sourceProvider:provider,sourceRevision:String(video.subtitleRevision||video.transcriptRefreshAt||'')}))
    // Never replace captions uploaded while the network request was in flight.
    const latest=cachedTranscript(video)
    if(latest.length&&!latest[0]?.sourceProvider&&readProgressValue('tutin_subtitles_'+video.id))return latest
    writeProgressValue('tutin_subtitles_'+video.id,JSON.stringify(result))
    return result
}
