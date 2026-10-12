export function registerOfflineApp() {
    if(!('serviceWorker' in navigator)||location.protocol!=='https:')return
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}),{once:true})
}
