export function publishLibraryChange(table,courseId){
    if(typeof window==='undefined')return
    const detail={table,courseId,at:Date.now(),nonce:Math.random()}
    window.dispatchEvent(new CustomEvent('tutin-library-change',{detail}))
    try{localStorage.setItem('tutin_library_change',JSON.stringify(detail))}catch{}
}
export function subscribeLibraryChanges(listener){
    if(typeof window==='undefined')return()=>{}
    let timer,pending
    const schedule=detail=>{
        if(pending&&pending.courseId!==detail?.courseId)pending={...detail,courseId:null}
        else pending=detail
        clearTimeout(timer)
        timer=setTimeout(()=>{const change=pending;pending=null;listener(change)},200)
    }
    const local=event=>schedule(event.detail)
    const remote=event=>{if(event.key==='tutin_library_change'){try{schedule(JSON.parse(event.newValue))}catch{}}}
    window.addEventListener('tutin-library-change',local);window.addEventListener('storage',remote)
    return()=>{clearTimeout(timer);window.removeEventListener('tutin-library-change',local);window.removeEventListener('storage',remote)}
}
