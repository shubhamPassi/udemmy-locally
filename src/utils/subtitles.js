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
