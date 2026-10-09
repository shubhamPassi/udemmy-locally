import { useSyncExternalStore } from 'react'
const key='tutin_hide_upcoming_durations',listeners=new Set()
const read=()=>{try{return localStorage.getItem(key)==='true'}catch{return false}}
const notify=()=>listeners.forEach(listener=>listener())
function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}
export function useDurationVisibility(){return useSyncExternalStore(subscribe,read,()=>false)}
export function toggleDurationVisibility(){try{localStorage.setItem(key,String(!read()))}catch{}notify()}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===key||event.key===null)notify()})
