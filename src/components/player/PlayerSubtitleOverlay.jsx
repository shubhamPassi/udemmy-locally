import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { balancedCaption, captionFontSize } from '../../utils/captionAppearance.js'

export default function PlayerSubtitleOverlay({ target, media, cues, enabled, appearance }) {
    const [layout,setLayout]=useState(null),[text,setText]=useState('')
    useEffect(()=>{
        if(!media||!target)return
        const bar=target.querySelector('[data-player-controls-bar]')
        const controls=target.querySelector('[data-controls-visible]')
        let frame
        function measure(){
            const rect=media.getBoundingClientRect(),host=target.getBoundingClientRect()
            if(!rect.height||!rect.width)return
            const scale=media.videoWidth&&media.videoHeight?Math.min(rect.width/media.videoWidth,rect.height/media.videoHeight):1
            const height=media.videoHeight?media.videoHeight*scale:rect.height
            const width=media.videoWidth?media.videoWidth*scale:rect.width
            const top=rect.top+(rect.height-height)/2,bottom=top+height
            const visible=controls?.dataset.controlsVisible!=='false'
            const controlTop=bar?.getBoundingClientRect().top ?? host.bottom-96
            const baseline=visible?Math.min(bottom-12,controlTop-16):bottom-12
            setLayout({bottom:Math.max(12,host.bottom-baseline),left:rect.left+rect.width/2-host.left,width:width*.78,fontSize:captionFontSize(appearance.size,height)})
        }
        function refresh(){measure();if(window.requestAnimationFrame){window.cancelAnimationFrame(frame);frame=window.requestAnimationFrame(measure)}}
        const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(refresh):null
        for(const element of [target,media,bar])if(element)resize?.observe(element)
        const observer=new MutationObserver(refresh)
        if(controls)observer.observe(controls,{attributes:true,attributeFilter:['data-controls-visible']})
        window.addEventListener('resize',refresh);document.addEventListener('fullscreenchange',refresh)
        refresh()
        return()=>{resize?.disconnect();observer.disconnect();window.cancelAnimationFrame?.(frame);window.removeEventListener('resize',refresh);document.removeEventListener('fullscreenchange',refresh)}
    },[target,media,appearance.size])
    useEffect(()=>{
        if(!media)return
        const update=()=>setText(cues.filter(cue=>media.currentTime>=cue.start&&media.currentTime<cue.end).map(cue=>balancedCaption(cue.text)).join('\n'))
        const events=['timeupdate','seeked','loadedmetadata','playing']
        events.forEach(event=>media.addEventListener(event,update))
        const tracks=[...(media.textTracks||[])]
        tracks.forEach(track=>track.addEventListener?.('cuechange',update))
        update()
        return()=>{events.forEach(event=>media.removeEventListener(event,update));tracks.forEach(track=>track.removeEventListener?.('cuechange',update))}
    },[media,cues])
    if(!enabled||!text||!layout)return null
    return createPortal(<div data-player-subtitles className="pointer-events-none absolute z-20 text-center" style={{bottom:layout.bottom,left:layout.left,width:layout.width,transform:'translateX(-50%)',fontSize:layout.fontSize,lineHeight:1.35,color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',fontWeight:500,textShadow:'0 1px 3px rgba(0,0,0,.85)',whiteSpace:'pre-line',overflowWrap:'anywhere'}}>
        <span style={{background:appearance.background==='dark'?'rgba(0,0,0,.62)':'transparent',padding:'2px 6px',borderRadius:4,boxDecorationBreak:'clone',WebkitBoxDecorationBreak:'clone'}}>{text}</span>
    </div>,target)
}
