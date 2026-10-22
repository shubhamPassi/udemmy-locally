import test from 'node:test'
import assert from 'node:assert/strict'
import {googleClientId} from '../src/utils/googleClientConfig.js'

test('browser restart restores remembered Google authorization without a popup and renews access without resetting playback state',async()=>{
 const saved=new Map(['window','navigator','MessageChannel','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 const origin='https://udemy.chaigallery.in',storage=new Map(),listeners=new Map(),messages=[]
 const popup={close(){}};let attempt='',connected=false,access='first-access',opened=0
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},open:url=>{opened++;attempt=new URL(url,origin).searchParams.get('attempt');connected=true;return popup},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)}})
  class Channel{constructor(){this.port1={close(){}};this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage({data}))}}}
  Object.defineProperty(globalThis,'MessageChannel',{configurable:true,value:Channel})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>{},ready:Promise.resolve(),controller:{postMessage:(data,ports)=>{messages.push(data);ports[0].postMessage({ok:true})}}}}})
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(url,options)=>{
   assert.equal(options.credentials,'same-origin')
   if(url.endsWith('/config'))return Response.json({enabled:true,clientId:googleClientId('',origin)})
   if(url.endsWith('/disconnect')){assert.equal(options.method,'POST');connected=false;return Response.json({connected:false})}
   assert.ok(url.endsWith('/session'));assert.equal(options.headers['X-TutIn-Session'],'1')
   return connected?Response.json({token:access,expiresAt:Date.now()+3600000,persistent:true,connectionId:attempt}):Response.json({connected:false},{status:401})
  }})
  const first=await import('../src/utils/driveAuthorization.js?remembered=first')
  await first.prepareDriveConnection('')
  const pending=first.connectGoogleDrive('')
  listeners.get('message')({origin,source:popup,data:{type:'tutin-google-connected',ok:true,attempt}})
  await pending
  assert.equal(first.driveSession().persistent,true);assert.equal(opened,1)
  const stored=JSON.parse(storage.values().next().value)
  assert.equal(stored.token,'first-access');assert.equal(stored.refreshToken,undefined)
  storage.clear() // Session/tab storage is gone after a complete browser close.
  const restarted=await import('../src/utils/driveAuthorization.js?remembered=restart')
  assert.equal(restarted.savedDriveSession(),null)
  await restarted.restoreDriveAuthorization()
  assert.equal(restarted.driveSession().token,'first-access');assert.equal(opened,1,'Restart should not require another Google popup')
  const metadata=[];restarted.subscribeDriveSession((_value,meta)=>metadata.push(meta))
  access='renewed-access';await restarted.restoreDriveAuthorization({renew:true})
  assert.equal(restarted.driveSession().token,'renewed-access');assert.equal(metadata.at(-1).renewal,true)
  assert.equal(messages.at(-1).token,'renewed-access')
  await restarted.disconnectGoogleDrive()
  assert.equal(connected,false);assert.equal(storage.size,0)
  const afterDisconnect=await import('../src/utils/driveAuthorization.js?remembered=disconnected')
  assert.equal(await afterDisconnect.restoreDriveAuthorization(),null)
 }finally{for(const[key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
})
