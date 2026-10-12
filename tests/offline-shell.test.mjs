import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
test('offline shell serves saved routes without intercepting streaming or API requests',async()=>{
    const listeners={},cached={ok:true,offline:true}
    vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self:{location:{origin:'https://app.test'},addEventListener:(name,handler)=>listeners[name]=handler},URL,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw Error('offline')},caches:{match:async()=>cached}})
    let response
    listeners.fetch({request:{url:'https://app.test/course/one',method:'GET',mode:'navigate'},respondWith:promise=>{response=promise}})
    assert.equal(await response,cached)
    for(const url of ['https://app.test/api/drive-video?id=public','https://external.test/video.mp4'])listeners.fetch({request:{url,method:'GET'},respondWith:()=>assert.fail('Video requests must not be cached by the app shell')})
})
