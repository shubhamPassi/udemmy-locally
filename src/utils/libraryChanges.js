export function publishLibraryChange(table,courseId){
    if(typeof window==='undefined')return
    const detail={table,courseId,at:Date.now(),nonce:Math.random()}
    window.dispatchEvent(new CustomEvent('tutin-library-change',{detail}))
    try{localStorage.setItem('tutin_library_change',JSON.stringify(detail))}catch{}
}
export function subscribeLibraryChanges(listener){
    if(typeof window==='undefined')return()=>{}
    let timer
    const schedule=detail=>{clearTimeout(timer);timer=setTimeout(()=>listener(detail),200)}
    const local=event=>schedule(event.detail)
    const remote=event=>{if(event.key==='tutin_library_change'){try{schedule(JSON.parse(event.newValue))}catch{}}}
    window.addEventListener('tutin-library-change',local);window.addEventListener('storage',remote)
    return()=>{clearTimeout(timer);window.removeEventListener('tutin-library-change',local);window.removeEventListener('storage',remote)}
}
