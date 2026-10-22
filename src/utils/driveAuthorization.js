// Short-lived access tokens stay in tab storage. Remembered connections use an
// encrypted HttpOnly cookie; only the Worker can renew its refresh token.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
import { googleClientId } from './googleClientConfig.js'
const sessionKey = 'tutin_drive_session_v1'
let session = null, identityPromise
let restoring = null, generation = 0, renewalTimer, renewalRetries=0, backendClient = '', preparation
const listeners = new Set()
let listening = false
export function driveSession() { return session }
export function subscribeDriveSession(listener) { listeners.add(listener); return () => listeners.delete(listener) }
function rememberedOrigin(){return typeof window!=='undefined'&&!!googleClientId('',window.location?.origin)}
export function hasRestorableDriveSession(){return !!savedDriveSession()||rememberedOrigin()}
export function savedDriveSession() {
    try {
        const value = JSON.parse(window.sessionStorage?.getItem(sessionKey) || 'null')
        if (typeof value?.token === 'string' && value.token && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now()+5000 && value.expiresAt <= Date.now()+3605000) return value
        window.sessionStorage?.removeItem(sessionKey)
    } catch { try { window.sessionStorage?.removeItem(sessionKey) } catch {} }
    return null
}
function publish(value,{renewal=false}={}) {
    clearTimeout(renewalTimer)
    renewalRetries=0
    session = value
    try { if(value)window.sessionStorage?.setItem(sessionKey,JSON.stringify({token:value.token,expiresAt:value.expiresAt,...(value.persistent?{persistent:true}:{})}));else window.sessionStorage?.removeItem(sessionKey) } catch {}
    listeners.forEach(listener => listener(value,{renewal}))
    if(value?.persistent){
        renewalTimer=setTimeout(()=>restoreDriveAuthorization({renew:true}),Math.max(1000,value.expiresAt-Date.now()-60000))
        renewalTimer.unref?.()
    }
}
async function rememberedSession(attempt=''){
    const result=await fetch('/api/google/auth/session',{credentials:'same-origin',cache:'no-store',headers:{'X-TutIn-Session':'1'},signal:AbortSignal.timeout(15000)})
    if(result.status===401)return null
    if(!result.ok)throw Error('Google connection is temporarily unavailable.')
    const value=await result.json()
    if(typeof value.token!=='string'||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()+5000||attempt&&value.connectionId!==attempt)return null
    return {...value,persistent:true}
}
export async function restoreDriveAuthorization({renew=false}={}) {
    if (!renew&&session?.expiresAt > Date.now()+5000) return session
    if (restoring) return restoring
    const saved = !renew&&savedDriveSession()
    if (!saved&&!rememberedOrigin()) return null
    const epoch = generation
    restoring = (async()=>{
        try {
            const value=saved||await rememberedSession()
            if(!value){if(renew)publish(null);return null}
            await sendDriveAuthorization(value)
            if(epoch !== generation){await sendDriveAuthorization(session);return session}
            if(value.expiresAt <= Date.now()+5000)return null
            publish(value,{renewal:renew})
            return value
        } catch {
            if(renew&&session?.persistent&&renewalRetries<3){renewalRetries++;renewalTimer=setTimeout(()=>restoreDriveAuthorization({renew:true}),30000*renewalRetries);renewalTimer.unref?.()}
            return null
        }
        finally { restoring = null }
    })()
    return restoring
}

export async function prepareDriveConnection(clientId){
    if(rememberedOrigin()){
        try{
            preparation ||= fetch('/api/google/auth/config',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(result=>result.json())
            const config=await preparation
            if(config.enabled&&config.clientId===googleClientId(clientId)){backendClient=config.clientId;return}
        }catch{}
    }
    await loadGoogleIdentity()
}

function connectRememberedDrive(){
    const attempt=crypto.randomUUID().replace(/-/g,'')
    const popup=window.open('/api/google/auth/start?attempt='+attempt,'tutin-google-connection','popup=yes,width=520,height=700,resizable=yes,scrollbars=yes')
    if(!popup)return Promise.reject(Error('Allow the Google sign-in popup, then try again.'))
    return new Promise((resolve,reject)=>{
        let finished=false,checking=false
        const cleanup=()=>{finished=true;clearInterval(poll);clearTimeout(timer);window.removeEventListener('message',message)}
        const check=async()=>{
            if(checking||finished)return
            checking=true
            try{
                const value=await rememberedSession(attempt)
                if(value&&!finished){await sendDriveAuthorization(value);if(finished)return;publish(value);cleanup();try{popup.close()}catch{}resolve(value)}
            }catch{}finally{checking=false}
        }
        const message=event=>{
            if(event.origin!==window.location.origin||event.source!==popup||event.data?.type!=='tutin-google-connected'||event.data.attempt!==attempt)return
            if(!event.data.ok){cleanup();reject(Error('Google connection failed. Try connecting again.'));return}
            check()
        }
        const poll=setInterval(check,2000)
        const timer=setTimeout(()=>{cleanup();reject(Error('Google sign-in timed out. Please try again.'))},300000)
        window.addEventListener('message',message)
    })
}

export function loadGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
    if (!identityPromise) identityPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.onload = () => { clearTimeout(timer); resolve(window.google.accounts.oauth2) }
        script.onerror = () => { clearTimeout(timer); script.remove(); identityPromise = null; reject(new Error('Google sign-in could not load. Check your connection or content blocker.')) }
        const timer = setTimeout(() => script.onerror(), 20000)
        document.head.appendChild(script)
    })
    return identityPromise
}

export async function sendDriveAuthorization(value) {
    if (!navigator.serviceWorker) throw new Error('Account playback requires HTTPS and service worker support.')
    if (!listening) {
        navigator.serviceWorker.addEventListener?.('message', event => {
            if (event.source !== navigator.serviceWorker.controller || event.data?.type !== 'tutin-drive-session-required') return
            const active = session && session.expiresAt > Date.now() ? session : null
            event.ports[0]?.postMessage({ token: active?.token || '', expiresAt: active?.expiresAt || 0 })
        })
        listening = true
        if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session?.persistent&&session.expiresAt<Date.now()+90000)restoreDriveAuthorization({renew:true})})
    }
    let startupTimer
    try {
        await Promise.race([
            navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready),
            new Promise((_, reject) => { startupTimer = setTimeout(() => reject(new Error('Playback service worker could not start. Reload this page online and reconnect.')), 20000) }),
        ])
    } finally { clearTimeout(startupTimer) }
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
        const done = () => { if (navigator.serviceWorker.controller) { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve() } }
        const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', done); reject(new Error('Reload this page once to enable account playback, then connect Google Drive again.')) }, 5000)
        navigator.serviceWorker.addEventListener('controllerchange', done)
        done()
    })
    await new Promise((resolve, reject) => {
        const channel = new MessageChannel()
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Reload the page to update the playback service worker, then reconnect Google Drive.')) }, 5000)
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data?.ok ? resolve() : reject(new Error('Google Drive authorization could not be installed.')) }
        navigator.serviceWorker.controller.postMessage({ type: 'tutin-drive-authorization', token: value?.token || '', expiresAt: value?.expiresAt || 0 }, [channel.port2])
    })
}

// Called directly from a user click after preloading GIS to preserve popup activation.
export function connectGoogleDrive(clientId) {
    clientId = googleClientId(clientId)
    if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId?.trim() || '')) return Promise.reject(new Error('Add a Google OAuth Web Client ID in Settings first. An API key is not a Client ID.'))
    if(backendClient&&clientId===backendClient){generation++;return connectRememberedDrive()}
    const oauth = window.google?.accounts?.oauth2
    if (!oauth) return Promise.reject(new Error('Google sign-in is still loading. Try Connect Google Drive again.'))
    generation++
    return new Promise((resolve, reject) => {
        const client = oauth.initTokenClient({
            client_id: clientId.trim(), scope: DRIVE_SCOPE, include_granted_scopes: false,
            callback: async result => {
                if (result.error || !result.access_token || !oauth.hasGrantedAllScopes(result, DRIVE_SCOPE)) { reject(new Error('Google Drive read-only permission was not granted.')); return }
                const value = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 }
                try { await sendDriveAuthorization(value); publish(value); resolve(value) } catch (error) { reject(error) }
            },
            error_callback: () => reject(new Error('Google sign-in was closed or blocked. Allow the sign-in popup and try again.')),
        })
        client.requestAccessToken({ prompt: 'select_account' })
    })
}

export async function disconnectGoogleDrive() {
    const previous = session
    generation++
    publish(null)
    try {
        if(previous?.persistent)await fetch('/api/google/auth/disconnect',{method:'POST',credentials:'same-origin',headers:{'X-TutIn-Session':'1'},signal:AbortSignal.timeout(15000)})
        await sendDriveAuthorization(null)
    }
    finally { if (previous?.token) window.google?.accounts?.oauth2?.revoke(previous.token, () => {}) }
}
