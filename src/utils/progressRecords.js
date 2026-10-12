export function mergeWatchedRanges(ranges,start,end){
    const valid=[...ranges,[start,end]].filter(range=>Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&range[0]>=0&&range[1]>range[0]).sort((a,b)=>a[0]-b[0]),merged=[]
    for(const range of valid){const last=merged[merged.length-1];if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range])}
    return merged
}
export function mergeProgressRecord(key,previous,incoming){
    if(!previous||incoming===null)return incoming
    try{
        const current=JSON.parse(previous),next=JSON.parse(incoming)
        if(key.startsWith('tutin_coverage_'))return JSON.stringify(mergeWatchedRanges([...current,...next],0,0))
        if(key.startsWith('tutin_study_session_')){const hours={...(current.hours||{})};for(const[hour,seconds]of Object.entries(next.hours||{}))hours[hour]=Math.max(hours[hour]||0,seconds);return JSON.stringify({...next,hours})}
        if(key.startsWith('tutin_playback_')&&current.updatedAt>next.updatedAt)return previous
    }catch{/* Invalid legacy values are replaced by the validated incoming record. */}
    return incoming
}
