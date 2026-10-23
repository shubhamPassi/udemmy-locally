import test from 'node:test'
import assert from 'node:assert/strict'
import {googleAuth,sealGoogleSession,readGoogleSession} from '../cloudflare/googleAuth.js'
const origin='https://udemy.chaigallery.in'
const env={GOOGLE_OAUTH_CLIENT_ID:'123-test.apps.googleusercontent.com',GOOGLE_OAUTH_CLIENT_SECRET:'test-client-secret',GOOGLE_SESSION_SECRET:'test-encryption-key-at-least-thirty-two-characters'}
const scope='https://www.googleapis.com/auth/drive.readonly'
const cookieName='__Host-tutin-drive-session'
const sessionRequest=cookie=>new Request(origin+'/api/google/auth/session',{headers:{Cookie:cookie,'X-TutIn-Session':'1'}})

test('callback token failures show safe actionable errors without leaking Google response data',async()=>{
 const previous=globalThis.fetch
 try{
  for(const code of ['invalid_client','invalid_grant','redirect_uri_mismatch','untrusted-error']){
   const start=await googleAuth(new Request(origin+'/api/google/auth/start?attempt=attempt123456789'),env)
   const state=new URL(start.headers.get('location')).searchParams.get('state')
   globalThis.fetch=async()=>Response.json({error:code,error_description:'private-client-secret-and-authorization-code'},{status:400})
   const result=await googleAuth(new Request(origin+'/api/google/auth/callback?state='+state+'&code=private-code',{headers:{Cookie:start.headers.get('set-cookie').split(';')[0]}}),env)
   const html=await result.text()
   assert.match(result.headers.get('content-type'),/text\/html/)
   assert.ok(html.includes('Reference: '+(code==='untrusted-error'?'token_service_unavailable':code)))
   assert.ok(!html.includes('private-client-secret'));assert.ok(!html.includes('private-code'))
   assert.ok(!html.includes('window.close()'));assert.equal(result.headers.get('set-cookie'),null)
  }
 }finally{globalThis.fetch=previous}
})

test('remembered Google flow binds state and PKCE, encrypts persistent cookies, restores and renews without media requests',async()=>{
 const previous=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.redirect,'manual','OAuth credentials must not follow redirects; Workers does not support redirect:error')
  calls.push({url,body:new URLSearchParams(options.body)})
  if(String(url).endsWith('/revoke'))return new Response('')
  const refresh=calls.at(-1).body.get('grant_type')==='refresh_token'
  return Response.json({access_token:refresh?'access-renewed':'access-initial',refresh_token:refresh?undefined:'refresh-private',expires_in:3600,scope})
 }
 try{
  const start=await googleAuth(new Request(origin+'/api/google/auth/start?attempt=attempt123456789'),env)
  assert.equal(start.status,302)
  const google=new URL(start.headers.get('location'))
  assert.equal(google.origin,'https://accounts.google.com');assert.equal(google.searchParams.get('access_type'),'offline');assert.equal(google.searchParams.get('code_challenge_method'),'S256')
  const stateCookie=start.headers.get('set-cookie').split(';')[0]
  const state=google.searchParams.get('state')
  const invalid=await googleAuth(new Request(origin+'/api/google/auth/callback?state=wrong&code=code',{headers:{Cookie:stateCookie}}),env)
  assert.match(await invalid.text(),/failed/);assert.equal(calls.length,0)
  const callback=await googleAuth(new Request(origin+'/api/google/auth/callback?state='+state+'&code=code',{headers:{Cookie:stateCookie}}),env)
  const html=await callback.text()
  assert.match(html,/connected/);assert.ok(!html.includes('refresh-private'));assert.ok(!html.includes('access-initial'))
  const set=callback.headers.getSetCookie().find(value=>value.startsWith(cookieName+'='))
  assert.ok(set);assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Lax/);assert.match(set,/Max-Age=2592000/)
  assert.ok(!set.includes('refresh-private'));assert.ok(!set.includes('access-initial'))
  assert.equal(calls[0].body.get('code_verifier').length>30,true)
  const cookie=set.split(';')[0]
  const restored=await googleAuth(sessionRequest(cookie),env)
  const data=await restored.json()
  assert.equal(data.token,'access-initial');assert.equal(data.persistent,true);assert.equal(data.connectionId,'attempt123456789');assert.equal(data.refreshToken,undefined)
  assert.equal(restored.headers.get('cache-control'),'no-store');assert.equal(calls.length,1)
  const raw=await readGoogleSession(cookie.slice(cookie.indexOf('=')+1),env,origin+':session')
  raw.expiresAt=Date.now()-1000
  const stale=cookieName+'='+await sealGoogleSession(raw,env,origin+':session')
  const renewed=await googleAuth(sessionRequest(stale),env)
  assert.equal((await renewed.json()).token,'access-renewed');assert.ok(renewed.headers.get('set-cookie'))
  assert.equal(calls[1].body.get('grant_type'),'refresh_token');assert.equal(calls[1].body.get('refresh_token'),'refresh-private')
  assert.ok(calls.every(call=>String(call.url).startsWith('https://oauth2.googleapis.com/')))
 }finally{globalThis.fetch=previous}
})

test('remembered sessions reject cookie tampering, origin changes, missing headers and cross-site disconnects',async()=>{
 const payload={refreshToken:'private-refresh',token:'short-access',expiresAt:Date.now()+3600000,exp:Date.now()+86400000}
 const encrypted=await sealGoogleSession(payload,env,origin+':session')
 assert.equal(await readGoogleSession(encrypted,env,'https://other.example:session'),null)
 assert.equal(await readGoogleSession(encrypted+'bad',env,origin+':session'),null)
 assert.equal((await googleAuth(new Request(origin+'/api/google/auth/session'),env)).status,403)
 assert.equal((await googleAuth(sessionRequest(cookieName+'=tampered'),env)).status,401)
 assert.equal((await googleAuth(new Request('https://other.example/api/google/auth/config'),env)).status,403)
 assert.equal((await googleAuth(new Request(origin+'/api/google/auth/disconnect',{method:'POST',headers:{Origin:'https://other.example','X-TutIn-Session':'1'}}),env)).status,403)
})

test('revoked authorization clears remembered connection and disconnect revokes its grant',async()=>{
 const previous=globalThis.fetch
 const payload={refreshToken:'private-refresh',token:'expired',expiresAt:Date.now()-1,exp:Date.now()+86400000}
 const cookie=cookieName+'='+await sealGoogleSession(payload,env,origin+':session')
 try{
  globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400})
  const failed=await googleAuth(sessionRequest(cookie),env)
  assert.equal(failed.status,401);assert.match(failed.headers.get('set-cookie'),/Max-Age=0/)
  let revoked=false
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://oauth2.googleapis.com/revoke');assert.equal(new URLSearchParams(options.body).get('token'),'private-refresh');revoked=true;return new Response('')}
  const result=await googleAuth(new Request(origin+'/api/google/auth/disconnect',{method:'POST',headers:{Origin:origin,'X-TutIn-Session':'1',Cookie:cookie}}),env)
  assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);assert.equal(revoked,true)
 }finally{globalThis.fetch=previous}
})
