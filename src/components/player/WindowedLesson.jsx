import { useEffect,useRef,useState } from 'react'
export default function WindowedLesson({children,active=false}){
    const host=useRef(null),[visible,setVisible]=useState(active),height=useRef(72)
    useEffect(()=>{
        if(!host.current||!window.IntersectionObserver){setVisible(true);return}
        const observer=new IntersectionObserver(entries=>{for(const entry of entries)setVisible(entry.isIntersecting)},{rootMargin:'400px'})
        observer.observe(host.current);return()=>observer.disconnect()
    },[])
    useEffect(()=>{if(visible&&host.current)height.current=host.current.getBoundingClientRect().height},[visible,children])
    return <div ref={host} style={visible||active?undefined:{height:height.current}}>{visible||active?children:null}</div>
}
