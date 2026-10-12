import { useSyncExternalStore } from 'react'
import {readProgressValue,writeProgressValue} from './progressStorage.js'
const key='tutin_hide_upcoming_durations',listeners=new Set()
const read=()=>readProgressValue(key)!=='false'
const notify=()=>listeners.forEach(listener=>listener())
function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}
export function useDurationVisibility(){return useSyncExternalStore(subscribe,read,()=>true)}
export function toggleDurationVisibility(){writeProgressValue(key,String(!read()));notify()}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===key||event.key===null)notify()})
if(typeof window!=='undefined')window.addEventListener('tutin-preferences-restored',notify)
