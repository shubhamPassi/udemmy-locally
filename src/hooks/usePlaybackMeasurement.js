import {useEffect} from 'react'
export default function usePlaybackMeasurement(player,videoId){
    useEffect(()=>{
        const navigation=performance.getEntriesByType('navigation')[0]
        if(navigation)document.documentElement.dataset.startupTiming=JSON.stringify({domInteractiveMs:Math.round(navigation.domInteractive),loadMs:Math.round(navigation.loadEventEnd)})
        if(!videoId)return
        const start=performance.now()
        let timer
        function measure(){const media=player.current?.getInternalVideo?.();if(media?.readyState>=2){document.documentElement.dataset.playbackTiming=JSON.stringify({readyMs:Math.round(performance.now()-start)});clearInterval(timer)}}
        timer=setInterval(measure,100);measure()
        const limit=setTimeout(()=>clearInterval(timer),45000)
        return()=>{clearInterval(timer);clearTimeout(limit)}
    },[player,videoId])
}
