import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../cloudflare/worker.js'
import { preferHostedDrivePreview } from '../src/utils/hostedVideoPolicy.js'

test('hosted Drive policy preserves local and YouTube player behavior',()=>{
    assert.equal(preferHostedDrivePreview({driveFileId:'public12345'},true),true)
    assert.equal(preferHostedDrivePreview({url:'https://drive.google.com/file/d/public12345/view'},true),true)
    assert.equal(preferHostedDrivePreview({driveFileId:'public12345'},false),false)
    assert.equal(preferHostedDrivePreview({youtubeId:'youtube1234'},true),false)
    assert.equal(preferHostedDrivePreview({filePath:'lesson.mp4'},true),false)
})

test('Cloudflare serves the SPA through assets and never fetches video bytes',async()=>{
    const previous=globalThis.fetch
    let assets=0,fetches=0
    globalThis.fetch=async()=>{fetches++;throw Error('Network must not run')}
    const env={ASSETS:{fetch:async()=>{assets++;return new Response('app-shell')}}}
    try{
        assert.equal(await (await worker.fetch(new Request('https://app.test/course/saved'),env)).text(),'app-shell')
        assert.equal(assets,1)
        const blocked=await worker.fetch(new Request('https://app.test/api/drive-video?id=public12345'),env)
        assert.equal(blocked.status,410)
        assert.equal(fetches,0)
        const missing=await worker.fetch(new Request('https://app.test/api/missing'),env)
        assert.equal(missing.status,404)
        assert.equal(assets,1)
        assert.equal((await (await worker.fetch(new Request('https://app.test/api/health'),env)).json()).videoRelay,false)
    }finally{globalThis.fetch=previous}
})

test('Cloudflare adapts existing public imports and rejects invalid or mutating requests',async()=>{
    const previous=globalThis.fetch
    const requested=[]
    globalThis.fetch=async url=>{requested.push(String(url));return Response.json({title:'Lesson',author_name:'Teacher',thumbnail_url:'https://example.test/thumb.jpg'})}
    try{
        const imported=await worker.fetch(new Request('https://app.test/api/public-import?provider=youtube&type=video&id=youtube1234'),{})
        assert.equal(imported.status,200)
        assert.equal((await imported.json()).videos[0].youtubeId,'youtube1234')
        assert.match(requested[0],/^https:\/\/www.youtube.com\/oembed/)
        const invalid=await worker.fetch(new Request('https://app.test/api/public-import?provider=drive&id=bad'),{})
        assert.equal(invalid.status,400)
        assert.equal(requested.length,1)
        const mutation=await worker.fetch(new Request('https://app.test/api/public-import',{method:'POST'}),{})
        assert.equal(mutation.status,405)
    }finally{globalThis.fetch=previous}
})

test('public metadata cache normalizes duplicate parameters consistently and skips failures',async()=>{
    const previousFetch=globalThis.fetch,previousCaches=Object.getOwnPropertyDescriptor(globalThis,'caches')
    const stored=new Map(),pending=[],requested=[]
    Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{match:async request=>stored.get(request.url)?.clone(),put:async(request,response)=>stored.set(request.url,response)}}})
    globalThis.fetch=async url=>{requested.push(String(url));return Response.json({title:'Lesson',author_name:'Teacher',thumbnail_url:''})}
    try{
        const context={waitUntil:task=>pending.push(task)}
        const response=await worker.fetch(new Request('https://app.test/api/public-import?provider=youtube&type=video&id=youtube1234&id=different123'),{},context)
        assert.equal((await response.json()).videos[0].youtubeId,'youtube1234')
        await Promise.all(pending)
        assert.equal(stored.size,1)
        await worker.fetch(new Request('https://app.test/api/public-import?id=youtube1234&type=video&provider=youtube'),{},context)
        assert.equal(requested.length,1)
        await worker.fetch(new Request('https://app.test/api/public-import?provider=drive&id=bad'),{},context)
        await Promise.all(pending)
        assert.equal(stored.size,1)
    }finally{
        globalThis.fetch=previousFetch
        if(previousCaches)Object.defineProperty(globalThis,'caches',previousCaches);else delete globalThis.caches
    }
})
