import test from 'node:test'
import assert from 'node:assert/strict'
import {connectGoogleDrive,disconnectGoogleDrive,driveSession,subscribeDriveSession,DRIVE_SCOPE} from '../src/utils/driveAuthorization.js'

test('Google consent installs credentials before publishing session, rejects missing scope, and clears on disconnect',async()=>{
    const saved=new Map(['window','navigator','MessageChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
    const messages=[],changes=[]
    let result={access_token:'memory-only-token',expires_in:3600},granted=true,revoked=false
    const unsubscribe=subscribeDriveSession(value=>changes.push(value))
    try{
        Object.defineProperty(globalThis,'window',{configurable:true,value:{google:{accounts:{oauth2:{
            initTokenClient:config=>{assert.equal(config.scope,DRIVE_SCOPE);return {requestAccessToken:()=>config.callback(result)}},
            hasGrantedAllScopes:()=>granted,
            revoke:(_token,done)=>{revoked=true;done()},
        }}}}})
        class TestChannel {
            constructor() {
                this.port1 = { close() {} }
                this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage({data})) }
            }
        }
        Object.defineProperty(globalThis,'MessageChannel',{configurable:true,value:TestChannel})
        Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>{},ready:Promise.resolve(),controller:{postMessage:(data,ports)=>{messages.push(data);ports[0].postMessage({ok:true})}}}}})
        await assert.rejects(connectGoogleDrive('AIza-api-key'),/Web Client ID/)
        assert.equal(changes.length,0)
        const clientId='123456-example.apps.googleusercontent.com'
        await connectGoogleDrive(clientId)
        assert.equal(driveSession().token,'memory-only-token')
        assert.ok(driveSession().expiresAt>Date.now())
        assert.equal(messages[0].token,'memory-only-token')
        assert.equal(changes.length,1)
        await disconnectGoogleDrive()
        assert.equal(driveSession(),null)
        assert.equal(messages.at(-1).token,'')
        assert.equal(revoked,true)
        granted=false
        await assert.rejects(connectGoogleDrive(clientId),/permission was not granted/)
        result={error:'access_denied'}
        await assert.rejects(connectGoogleDrive(clientId),/permission was not granted/)
        assert.equal(driveSession(),null)
    }finally{unsubscribe();for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
})
