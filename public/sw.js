const CACHE_NAME = 'tutin-offline-__BUILD__'
self.addEventListener('install', event => event.waitUntil((async () => {
    const response=await fetch('/offline-manifest.json',{cache:'no-store'})
    if(!response.ok)throw new Error('Offline manifest unavailable')
    const assets=await response.json(),cache=await caches.open(CACHE_NAME)
    // Prepare the app shell without downloading videos, API responses or models.
    for(const asset of assets)await cache.add(asset)
})()))
self.addEventListener('activate', event => event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('tutin-offline-')&&key!==CACHE_NAME)await caches.delete(key)
    await self.clients.claim()
})()))
self.addEventListener('fetch', event => {
    const request=event.request,url=new URL(request.url)
    if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return
    if(request.mode==='navigate'){
        event.respondWith((async()=>{
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000)
            try{const response=await fetch(request,{signal:controller.signal});if(response.ok)return response;throw new Error('Offline')}catch{const cached=await caches.match('/index.html');if(cached)return cached;throw new Error('Open the app online once to prepare offline use.')}finally{clearTimeout(timer)}
        })())
    }else if(/\.(?:js|css|svg|webmanifest)$/.test(url.pathname)){
        event.respondWith((async()=>{const cached=await caches.match(request);if(cached)return cached;return fetch(request)})())
    }
})
