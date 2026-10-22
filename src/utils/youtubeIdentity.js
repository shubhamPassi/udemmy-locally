export function youtubeId(video){
    if(video.youtubeId)return video.youtubeId
    try{
        const url=new URL(video.url)
        if(url.hostname==='youtu.be')return url.pathname.split('/')[1]
        if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname))return url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
    }catch{}
    return null
}
