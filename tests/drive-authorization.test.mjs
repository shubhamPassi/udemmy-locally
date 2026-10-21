import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {directDriveVideoUrl} from '../src/utils/directDrivePlayback.js'

function worker(restored = null) {
    const listeners={},calls=[]
    vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{
        self:{location:{origin:'https://app.test'},addEventListener:(name,fn)=>listeners[name]=fn,clients:{get:async id=>restored?{url:'https://app.test/course',postMessage:(_data,ports)=>ports[0].postMessage(id==='tab1'?restored:{})}:null}},
        URL,Headers,Response,Date,Map,AbortController,setTimeout,clearTimeout,
        MessageChannel:class { constructor() { this.port1={close(){}};this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage({data}))} } },
        fetch:async(url,options)=>{calls.push({url,options});return new Response('video',{status:206,headers:{'content-range':'bytes 100-104/1000'}})},
    })
    function authorize(id='tab1',token='temporary',expiresAt=Date.now()+60000,origin='https://app.test'){
        let ack
        listeners.message({data:{type:'tutin-drive-authorization',token,expiresAt},source:{id,url:origin+'/course'},ports:[{postMessage:value=>ack=value}]})
        return ack
    }
    async function request(id='tab1',url=directDriveVideoUrl('public12345','',true)){
        let response
        listeners.fetch({clientId:id,request:{url,method:'GET',headers:new Headers({Range:'bytes=100-104'}),signal:new AbortController().signal},respondWith:value=>response=value})
        return response ? await response : null
    }
    return {calls,authorize,request}
}

test('account media uses a token-free Google URL and browser-only bearer header, preserving Range',async()=>{
    const sw=worker()
    assert.equal(new URL(directDriveVideoUrl('public12345','ignored',true)).searchParams.has('key'),false)
    assert.equal(sw.authorize().ok,true)
    assert.equal((await sw.request()).status,206)
    const call=sw.calls[0]
    assert.equal(call.url,'https://www.googleapis.com/drive/v3/files/public12345?alt=media')
    assert.equal(call.options.headers.get('Authorization'),'Bearer temporary')
    assert.equal(call.options.headers.get('Range'),'bytes=100-104')
    assert.equal(call.options.cache,'no-store')
    assert.equal(call.options.credentials,'omit')
})

test('account media cannot use another tab token, expired token, or revoked token',async()=>{
    const sw=worker();sw.authorize()
    assert.equal((await sw.request('tab2')).status,401)
    sw.authorize('tab1','expired',Date.now()-1)
    assert.equal((await sw.request()).status,401)
    sw.authorize();sw.authorize('tab1','',0)
    assert.equal((await sw.request()).status,401)
    assert.equal(sw.calls.length,0)
})

test('authorization ignores other origins and never intercepts unrelated or anonymous requests',async()=>{
    const sw=worker()
    assert.equal(sw.authorize('tab1','bad',Date.now()+60000,'https://evil.test'),undefined)
    assert.equal((await sw.request()).status,401)
    assert.equal(await sw.request('tab1','https://evil.test/drive/v3/files/public12345?alt=media&tutin_account=1'),null)
    assert.equal(await sw.request('tab1',directDriveVideoUrl('public12345','public-key')),null)
    assert.equal(sw.calls.length,0)
})


test('idle worker restores authorization only from the requesting live tab',async()=>{
    const sw=worker({token:'restored-memory-token',expiresAt:Date.now()+60000})
    assert.equal((await sw.request()).status,206)
    assert.equal(sw.calls[0].options.headers.get('Authorization'),'Bearer restored-memory-token')
    assert.equal((await sw.request('tab2')).status,401)
    assert.equal(sw.calls.length,1)
})
