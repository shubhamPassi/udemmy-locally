import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import handler from '../api/drive-video.js'

test('temporary Drive failures are retryable and never cached as permission errors', async () => {
 const realFetch = globalThis.fetch
 try {
   for (const status of [429, 503, 403]) {
     globalThis.fetch = async () => new Response('unavailable', {status,headers:{'Content-Type':'text/html'}})
     const headers = {}, res = {setHeader(name,value){headers[name]=value},status(code){this.code=code;return this},json(value){this.body=value;return this}}
     await handler({method:'GET',query:{id:'public12345'},headers:{}},res)
     assert.equal(res.code,status===403?422:503)
     assert.equal(headers['Cache-Control'],'no-store')
     if(status!==403){assert.equal(headers['Retry-After'],'3');assert.match(res.body.error,/temporarily/)}
   }
 } finally {globalThis.fetch=realFetch}
})

test('Drive relay streams before the upstream completes and caps ranges at 4 MB', async () => {
 const realFetch = globalThis.fetch
 let upstreamRange, release, upstreamFinished = false
 globalThis.fetch = async (_url, options) => {
   upstreamRange = options.headers.Range
   return new Response(new ReadableStream({
     start(controller) {
       controller.enqueue(new Uint8Array([1,2]))
       release = () => { controller.enqueue(new Uint8Array([3,4])); upstreamFinished = true; controller.close() }
     }
   }), {status:206,headers:{'Content-Type':'video/mp4','Content-Length':'4','Content-Range':'bytes 1048576-1048579/5000000'}})
 }
 const server = createServer((req,res) => {
   req.query={id:'public12345'}
   res.status=code=>{res.statusCode=code;return res}
   res.json=data=>res.end(JSON.stringify(data))
   handler(req,res).catch(error=>res.destroy(error))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try {
   const response=await realFetch(`http://127.0.0.1:${server.address().port}`,{headers:{Range:'bytes=1048576-'}})
   const reader=response.body.getReader()
   assert.equal(response.status,206)
   assert.equal(upstreamRange,'bytes=1048576-5242879')
   const first=await reader.read()
   assert.deepEqual([...first.value],[1,2])
   assert.equal(upstreamFinished,false)
   release()
   assert.deepEqual([...(await reader.read()).value],[3,4])
   await reader.read()
 } finally { globalThis.fetch=realFetch; await new Promise(resolve=>server.close(resolve)) }
})
