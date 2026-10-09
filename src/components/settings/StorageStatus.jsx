import { useEffect,useState } from 'react'
export default function StorageStatus(){
    const [estimate,setEstimate]=useState(null),[persisted,setPersisted]=useState(false)
    const [lastBackup,setLastBackup]=useState(()=>{try{return localStorage.getItem('tutin_last_backup')}catch{return null}})
    useEffect(()=>{
        let active=true
        Promise.all([navigator.storage?.estimate?.(),navigator.storage?.persisted?.()]).then(([usage,persistent])=>{if(active){setEstimate(usage);setPersisted(!!persistent)}}).catch(()=>{})
        const refresh=()=>{try{setLastBackup(localStorage.getItem('tutin_last_backup'))}catch{}}
        const storage=event=>{if(event.key==='tutin_last_backup')refresh()}
        window.addEventListener('tutin-backup-exported',refresh)
        window.addEventListener('storage',storage)
        return()=>{active=false;window.removeEventListener('tutin-backup-exported',refresh);window.removeEventListener('storage',storage)}
    },[])
    const percent=estimate?.quota?estimate.usage/estimate.quota*100:0
    const mb=value=>`${((value||0)/1048576).toFixed(1)} MB`
    return <section className="p-4 rounded-lg border border-light-border dark:border-dark-border space-y-2"><h3 className="font-semibold text-sm">Browser storage</h3><p className="text-xs text-neutral-500">{estimate?`${mb(estimate.usage)} used of ${mb(estimate.quota)}`:'Usage estimate unavailable'} · {persisted?'Persistent storage granted':'Browser-managed storage'}</p><div className="h-1.5 rounded bg-gray-200 dark:bg-white/10 overflow-hidden"><div className="h-full bg-blue-500" style={{width:`${Math.min(100,percent)}%`}}/></div><p className="text-xs text-neutral-500">Last backup export: {lastBackup?new Date(lastBackup).toLocaleString():'Not exported yet'}</p>{percent>=80&&<p role="alert" className="text-xs text-amber-500">Storage is getting full. Export a backup before adding more courses.</p>}{!lastBackup&&<p className="text-xs text-amber-500">Export your first backup to keep a copy of courses and learning progress.</p>}<p className="text-xs text-neutral-500">Backups include study history and watched sections. Local video files stay on your device.</p></section>
}
