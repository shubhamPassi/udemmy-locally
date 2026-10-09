import {useEffect,useState} from 'react'
import {studyTimeLabel} from '../../utils/studyTime'
export default function StudyGoal({seconds}){
    const [minutes,setMinutes]=useState(()=>{try{return Number(localStorage.getItem('tutin_daily_goal'))||0}catch{return 0}})
    useEffect(()=>{
        const refresh=()=>{try{const value=Number(localStorage.getItem('tutin_daily_goal'))||0;setMinutes([0,15,30,45,60,90,120].includes(value)?value:0)}catch{}}
        const storage=event=>{if(event.key==='tutin_daily_goal'||event.key===null)refresh()}
        window.addEventListener('storage',storage);window.addEventListener('tutin-preferences-restored',refresh)
        return()=>{window.removeEventListener('storage',storage);window.removeEventListener('tutin-preferences-restored',refresh)}
    },[])
    const progress=minutes?Math.min(100,seconds/(minutes*60)*100):0
    return <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-neutral-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-sm">Daily study goal</h2><select aria-label="Daily study goal" value={minutes} onChange={event=>{const value=Number(event.target.value);setMinutes(value);localStorage.setItem('tutin_daily_goal',String(value))}} className="rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm">{[0,15,30,45,60,90,120].map(value=><option key={value} value={value}>{value?`${value} minutes`:'Off'}</option>)}</select></div>{minutes>0&&<><p className="mt-3 text-xs text-gray-600 dark:text-neutral-400">Today: {studyTimeLabel(seconds)} of {minutes}min{progress===100?' · Goal reached':''}</p><div role="progressbar" aria-label="Daily study goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="mt-3 h-2 overflow-hidden rounded bg-gray-200 dark:bg-white/10"><div className="h-full bg-blue-500" style={{width:`${progress}%`}}/></div></>}</section>
}
