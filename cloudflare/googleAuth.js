const origins = new Set(['https://udemy.chaigallery.in','https://tutin-learning.passishubham1.workers.dev'])
const sessionCookie='__Host-tutin-drive-session', stateCookie='__Host-tutin-google-state'
const scope='https://www.googleapis.com/auth/drive.readonly'
const maxAge=30*24*60*60
const encoder=new TextEncoder()
const response=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}})
const b64=value=>btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const unb64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)))
function cookie(name,value,seconds){return `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`}
function readCookie(request,name){return (request.headers.get('cookie')||'').split(';').map(item=>item.trim()).find(item=>item.startsWith(name+'='))?.slice(name.length+1)||''}
async function key(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(env.GOOGLE_SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function sealGoogleSession(value,env,purpose){
    const iv=crypto.getRandomValues(new Uint8Array(12))
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)},await key(env),encoder.encode(JSON.stringify(value)))
    return b64(iv)+'.'+b64(new Uint8Array(encrypted))
}
export async function readGoogleSession(value,env,purpose){
    try{
        if(!value||value.length>3800)return null
        const [iv,data]=value.split('.')
        const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(purpose)},await key(env),unb64(data))
        const payload=JSON.parse(new TextDecoder().decode(decrypted))
        return payload.exp>Date.now()?payload:null
    }catch{return null}
}
function configured(env){return !!(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET&&env.GOOGLE_SESSION_SECRET?.length>=32)}
async function tokenRequest(env,fields){
    let result
    // Workers supports manual/follow only. Never follow redirects carrying credentials.
    try{result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_OAUTH_CLIENT_ID,client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,...fields})})}
    catch{const error=Error('Google token service could not be reached.');error.oauthCode='token_network_error';throw error}
    const value=await result.json().catch(()=>({}))
    if(!result.ok||!value.access_token){const error=Error('Google connection could not be renewed.');error.revoked=value.error==='invalid_grant';error.oauthCode=['invalid_client','invalid_grant','redirect_uri_mismatch','unauthorized_client','invalid_scope','invalid_request'].includes(value.error)?value.error:'token_service_unavailable';throw error}
    return value
}
function callbackPage(origin,ok,attempt,errorCode=''){
    const nonce=random()
    const payload=JSON.stringify({type:'tutin-google-connected',ok,attempt}).replace(/</g,'\\u003c')
    const messages={invalid_client:'Google sign-in configuration needs repair. Please contact the app owner.',invalid_grant:'This sign-in link expired or was already used. Close this window and connect again.',redirect_uri_mismatch:'Google sign-in callback settings do not match this website.',unauthorized_client:'Google has not authorized this sign-in client.',invalid_scope:'Google did not accept the requested Drive permission.',token_service_unavailable:'Google could not complete sign-in. Close this window and try again.'}
    return new Response(`<!doctype html><meta charset="utf-8"><title>TutIn Google connection</title><p>${ok?'Google Drive connected. You can close this window.':messages[errorCode]||'Google connection failed. Close this window and try again.'}</p>${errorCode?'<p>Reference: '+errorCode+'</p>':''}<script nonce="${nonce}">if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(origin)});${ok?'window.close()':''}}</script>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`}})
}

export async function googleAuth(request,env,context){
    const url=new URL(request.url),origin=url.origin,path=url.pathname
    if(!origins.has(origin))return response({error:'Remembered Google connections are unavailable on this host.'},403)
    if(path==='/api/google/auth/config')return response({enabled:configured(env),clientId:env.GOOGLE_OAUTH_CLIENT_ID||''})
    const allowed=path.endsWith('/disconnect')?'POST':'GET'
    if(request.method!==allowed)return response({error:'Method not allowed'},405,{Allow:allowed})
    if(path.endsWith('/disconnect')&&(request.headers.get('Origin')!==origin||request.headers.get('X-TutIn-Session')!=='1'))return response({error:'Invalid origin'},403)
    if(!configured(env))return response({error:'Remembered Google connection setup is unavailable.'},503)
    try{
        if(path==='/api/google/auth/start'){
            const attempt=url.searchParams.get('attempt')||''
            if(!/^[a-zA-Z0-9_-]{12,128}$/.test(attempt))return response({error:'Invalid connection attempt'},400)
            const state=random(),verifier=random()
            const proof=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))))
            const saved=await sealGoogleSession({state,verifier,attempt,exp:Date.now()+600000},env,origin+':state')
            const params=new URLSearchParams({client_id:env.GOOGLE_OAUTH_CLIENT_ID,redirect_uri:origin+'/api/google/auth/callback',response_type:'code',scope,access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,code_challenge:proof,code_challenge_method:'S256'})
            return new Response(null,{status:302,headers:{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+params,'Set-Cookie':cookie(stateCookie,saved,600),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
        }
        if(path==='/api/google/auth/callback'){
            const saved=await readGoogleSession(readCookie(request,stateCookie),env,origin+':state')
            if(!saved||saved.state!==url.searchParams.get('state')||!url.searchParams.get('code')||url.searchParams.has('error'))return callbackPage(origin,false,saved?.attempt||'')
            let tokens
            try{tokens=await tokenRequest(env,{grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:origin+'/api/google/auth/callback',code_verifier:saved.verifier})}
            catch(error){return callbackPage(origin,false,saved.attempt,error.oauthCode||'token_service_unavailable')}
            if(!tokens.refresh_token||!String(tokens.scope||'').split(' ').includes(scope))return callbackPage(origin,false,saved.attempt)
            const payload={refreshToken:tokens.refresh_token,token:tokens.access_token,expiresAt:Date.now()+Math.min(3600,Number(tokens.expires_in)||3600)*1000,connectionId:saved.attempt,exp:Date.now()+maxAge*1000}
            const encrypted=await sealGoogleSession(payload,env,origin+':session')
            if(encrypted.length>3700)return callbackPage(origin,false,saved.attempt)
            const result=callbackPage(origin,true,saved.attempt)
            result.headers.append('Set-Cookie',cookie(sessionCookie,encrypted,maxAge))
            result.headers.append('Set-Cookie',cookie(stateCookie,'',0))
            return result
        }
        if(path==='/api/google/auth/session'){
            if(request.headers.get('X-TutIn-Session')!=='1')return response({error:'Missing session header'},403)
            const saved=await readGoogleSession(readCookie(request,sessionCookie),env,origin+':session')
            if(!saved?.refreshToken)return response({connected:false},401,{'Set-Cookie':cookie(sessionCookie,'',0)})
            let updated=false
            if(saved.expiresAt<=Date.now()+90000){
                try{
                    const tokens=await tokenRequest(env,{grant_type:'refresh_token',refresh_token:saved.refreshToken})
                    saved.token=tokens.access_token;saved.expiresAt=Date.now()+Math.min(3600,Number(tokens.expires_in)||3600)*1000
                    if(tokens.refresh_token)saved.refreshToken=tokens.refresh_token
                    updated=true
                }catch(error){return response({connected:false,error:error.revoked?'Reconnect Google Drive.':'Google is temporarily unavailable. Retry shortly.'},error.revoked?401:503,error.revoked?{'Set-Cookie':cookie(sessionCookie,'',0)}:{})}
            }
            const headers=updated?{'Set-Cookie':cookie(sessionCookie,await sealGoogleSession(saved,env,origin+':session'),Math.max(0,Math.floor((saved.exp-Date.now())/1000)))}:{}
            return response({token:saved.token,expiresAt:saved.expiresAt,connectionId:saved.connectionId,persistent:true},200,headers)
        }
        if(path==='/api/google/auth/disconnect'){
            const saved=await readGoogleSession(readCookie(request,sessionCookie),env,origin+':session')
            if(saved?.refreshToken){
                const revoke=fetch('https://oauth2.googleapis.com/revoke',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:saved.refreshToken})}).catch(()=>{})
                if(context?.waitUntil)context.waitUntil(revoke);else await revoke
            }
            return response({connected:false},200,{'Set-Cookie':cookie(sessionCookie,'',0)})
        }
        return response({error:'Unknown authorization endpoint'},404)
    }catch{return response({error:'Google connection is temporarily unavailable. Retry shortly.'},503)}
}
