export function subtitleTime(value){
    const parts=value.trim().replace(',','.').split(':').map(Number)
    if(parts.length<2||parts.length>3||parts.some(value=>!Number.isFinite(value)||value<0))return NaN
    return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1]
}
export function parseSubtitles(text){
    const cues=[]
    for(const block of text.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){
        const lines=block.trim().split('\n'),index=lines.findIndex(line=>line.includes('-->'))
        if(index<0)continue
        const [from,to]=lines[index].split('-->'),start=subtitleTime(from),end=subtitleTime(to.trim().split(/\s+/)[0])
        const caption=lines.slice(index+1).join('\n').replace(/<[^>]*>/g,'').trim()
        if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&caption)cues.push({start,end,text:caption})
    }
    if(!cues.length)throw Error('No valid subtitles found. Choose an SRT or VTT file.')
    return cues.sort((a,b)=>a.start-b.start)
}
export function subtitleTimestamp(seconds, separator='.') {
    const value=Math.max(0,Math.round((Number(seconds)||0)*1000))
    return `${String(Math.floor(value/3600000)).padStart(2,'0')}:${String(Math.floor(value/60000)%60).padStart(2,'0')}:${String(Math.floor(value/1000)%60).padStart(2,'0')}${separator}${String(value%1000).padStart(3,'0')}`
}
export function exportSubtitles(chunks, format='vtt') {
    const cues=chunks.map(chunk=>({start:Number(chunk.start??chunk.timestamp?.[0]),end:Number(chunk.end??chunk.timestamp?.[1]),text:String(chunk.text||'').replace(/<[^>]*>/g,'')})).filter(cue=>Number.isFinite(cue.start)&&cue.start>=0&&Number.isFinite(cue.end)&&cue.end>cue.start&&cue.text.trim())
    const srt=format==='srt'
    return (srt?'':'WEBVTT\n\n')+cues.map((cue,index)=>`${srt?`${index+1}\n`:''}${subtitleTimestamp(cue.start,srt?',':'.')} --> ${subtitleTimestamp(cue.end,srt?',':'.')}\n${cue.text.trim()}\n`).join('\n')
}
export function searchTranscript(chunks, query) {
    const term=query.trim().toLocaleLowerCase()
    return chunks.filter(chunk=>!term||String(chunk.text||'').toLocaleLowerCase().includes(term))
}
