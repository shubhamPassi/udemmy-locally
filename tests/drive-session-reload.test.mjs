import test from 'node:test'
import assert from 'node:assert/strict'

test('a valid Google session restores after a page reload without another consent popup, after worker acknowledgement',async()=>{
 const saved=new Map(['window','navigator','MessageChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 const storage=new Map(),messages=[]
 let popups=0,hold=false,ack
 const clientId='123456-example.apps.googleusercontent.com'
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},google:{accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:()=>{popups++;config.callback({access_token:'test-short-lived-access',expires_in:3600})}}),hasGrantedAllScopes:()=>true,revoke:(_token,done)=>done()}}}}})
  class TestChannel {
   constructor() {
    this.port1={close(){}}
    this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage({data}))}
   }
  }
  Object.defineProperty(globalThis,'MessageChannel',{configurable:true,value:TestChannel})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>{},ready:Promise.resolve(),controller:{postMessage:(data,ports)=>{messages.push(data);const done=()=>ports[0].postMessage({ok:true});if(hold)ack=done;else done()}}}}})
  const first=await import('../src/utils/driveAuthorization.js?session=first')
  await first.connectGoogleDrive(clientId)
  const expiry=first.driveSession().expiresAt
  assert.equal(popups,1);assert.equal(storage.size,1)
  assert.deepEqual(Object.keys(JSON.parse(storage.values().next().value)).sort(),['expiresAt','token'])
  // A different module instance models the refreshed page: memory is empty,
  // but this tab's short-lived session record remains available.
  const reloaded=await import('../src/utils/driveAuthorization.js?session=reload')
  assert.equal(reloaded.driveSession(),null);assert.equal(reloaded.savedDriveSession().expiresAt,expiry)
  hold=true
  const restoring=reloaded.restoreDriveAuthorization()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(reloaded.driveSession(),null,'Do not start authenticated playback until the worker accepts its credential')
  assert.ok(ack);ack();await restoring
  assert.equal(reloaded.driveSession().token,'test-short-lived-access');assert.equal(reloaded.driveSession().expiresAt,expiry)
  assert.equal(popups,1,'Reload must not open Google consent again')
  assert.equal(messages.at(-1).type,'tutin-drive-authorization')
  hold=false;await reloaded.disconnectGoogleDrive()
  assert.equal(storage.size,0);assert.equal(messages.at(-1).token,'')
  const disconnected=await import('../src/utils/driveAuthorization.js?session=disconnected')
  assert.equal(await disconnected.restoreDriveAuthorization(),null)
  for(const value of [JSON.stringify({token:'expired',expiresAt:Date.now()-1}),'{bad-json',JSON.stringify({token:'too-long',expiresAt:Date.now()+86400000})]){
   storage.set('tutin_drive_session_v1',value)
   assert.equal(disconnected.savedDriveSession(),null);assert.equal(storage.size,0)
  }
 }finally{for(const[key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
})
