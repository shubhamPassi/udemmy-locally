const CACHE_NAME = 'tutin-offline-__BUILD__'
// Per-tab, memory-only credentials. Browser fetches Google directly; no host
// route, persistent credential, media cache, or server relay is involved.
const driveTokens = new Map()
async function driveSessionFor(clientId) {
    const cached = driveTokens.get(clientId)
    if (cached?.expiresAt > Date.now()) return cached
    driveTokens.delete(clientId)
    // Workers may be stopped while idle. Restore only from the requesting live
    // tab's memory, never from disk or a different tab.
    const client = await self.clients?.get(clientId)
    if (!client || new URL(client.url).origin !== self.location.origin) return null
    return new Promise(resolve => {
        const channel = new MessageChannel()
        const timer = setTimeout(() => { channel.port1.close(); resolve(null) }, 3000)
        channel.port1.onmessage = event => {
            clearTimeout(timer); channel.port1.close()
            const value = event.data
            if (typeof value?.token === 'string' && value.token && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now()) { driveTokens.set(clientId, value); resolve(value) }
            else resolve(null)
        }
        client.postMessage({ type: 'tutin-drive-session-required' }, [channel.port2])
    })
}
self.addEventListener('message', event => {
    if (event.data?.type !== 'tutin-drive-authorization') return
    if (!event.source?.id || new URL(event.source.url).origin !== self.location.origin) return
    const { token, expiresAt } = event.data
    if (typeof token === 'string' && token && Number.isFinite(expiresAt) && expiresAt > Date.now()) driveTokens.set(event.source.id, { token, expiresAt })
    else driveTokens.delete(event.source.id)
    event.ports[0]?.postMessage({ ok: true })
})
self.addEventListener('install', event => event.waitUntil((async () => {
    const response=await fetch('/offline-manifest.json',{cache:'no-store'})
    if(!response.ok)throw new Error('Offline manifest unavailable')
    const assets=await response.json(),cache=await caches.open(CACHE_NAME)
    // Prepare the app shell without downloading videos, API responses or models.
    for(const asset of assets)await cache.add(asset)
    await self.skipWaiting()
})()))
self.addEventListener('activate', event => event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('tutin-offline-')&&key!==CACHE_NAME)await caches.delete(key)
    await self.clients.claim()
})()))
self.addEventListener('fetch', event => {
    const request=event.request,url=new URL(request.url)
    if (request.method === 'GET' && url.origin === 'https://www.googleapis.com' && /^\/drive\/v3\/files\/[a-zA-Z0-9_-]+$/.test(url.pathname) && url.searchParams.get('alt') === 'media' && url.searchParams.get('tutin_account') === '1') {
        event.respondWith((async () => {
            const session = await driveSessionFor(event.clientId)
            if (!session || session.expiresAt <= Date.now()) {
                driveTokens.delete(event.clientId)
                return new Response('Reconnect Google Drive to renew this browser session.', { status: 401 })
            }
            url.searchParams.delete('tutin_account')
            url.searchParams.delete('key')
            const headers = new Headers()
            headers.set('Authorization', `Bearer ${session.token}`)
            if (request.headers.has('Range')) headers.set('Range', request.headers.get('Range'))
            return fetch(url.href, { method: 'GET', headers, mode: 'cors', credentials: 'omit', cache: 'no-store', signal: request.signal, referrerPolicy: 'no-referrer' })
        })())
        return
    }
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
