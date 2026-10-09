import {useEffect,useRef} from 'react'
export default function useModalFocus(active,host,onClose){
    const close=useRef(onClose);close.current=onClose
    useEffect(()=>{
        if(!active)return
        const previous=document.activeElement
        const previousOverflow=document.body.style.overflow
        document.body.style.overflow='hidden'
        const node=host.current
        const selectors='button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]'
        const first=node?.querySelector(selectors);first?.focus()
        const keydown=event=>{
            if(event.key==='Escape'){event.preventDefault();close.current?.()}
            if(event.key!=='Tab')return
            const controls=[...(node?.querySelectorAll(selectors)||[])].filter(element=>element.getClientRects().length)
            const first=controls[0],last=controls[controls.length-1]
            if(!first){event.preventDefault();return}
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
        }
        node?.addEventListener('keydown',keydown)
        return()=>{node?.removeEventListener('keydown',keydown);document.body.style.overflow=previousOverflow;previous?.focus?.()}
    },[active,host])
}
