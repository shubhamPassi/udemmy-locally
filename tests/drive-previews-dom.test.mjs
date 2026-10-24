import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtemp,unlink,rmdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('Drive preview preparation starts before hover, reads cached frames on hover and never seeks or creates a video',async()=>{
 const dom=new JSDOM('<div id="root"></div><video src="https://www.googleapis.com/drive/v3/files/video123456?alt=media"></video>',{url:'https://udemy.chaigallery.in',pretendToBeVisual:true})
 const saved=new Map()
 for(const key of ['window','document','navigator','MessageChannel','IS_REACT_ACT_ENVIRONMENT']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})}
 const directory=await mkdtemp(join(tmpdir(),'tutin-drive-preview-')),output=join(directory,'test.cjs')
 let root,api
 try{
  await build({stdin:{contents:"export {default as Preview} from './src/components/player/TimelinePreview.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';export {calls} from './src/utils/drivePreviews.js';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:output,plugins:[{name:'fake-images',setup(build){
   build.onLoad({filter:/[\\/]drivePreviews\.js$/},()=>({contents:"export const calls=[];export async function loadDrivePreviews(...args){calls.push(args);return [[0,'data:image/jpeg;base64,AAAA'],[10,'data:image/jpeg;base64,BBBB']]}"}))
   build.onLoad({filter:/[\\/]previewCache\.js$/},()=>({contents:"export const previewCacheKey=()=> 'lesson';export const loadPreviewFrames=async()=>[];export const storePreviewFrames=async()=>{}"}))
  }}]})
  api=createRequire(import.meta.url)(output)
  const media=document.querySelector('video'),ref={current:media},video={id:'lesson',driveFileId:'video123456'}
  Object.defineProperties(media,{duration:{value:20},readyState:{value:4},currentTime:{value:7,writable:true}})
  root=api.createRoot(document.getElementById('root'))
  await api.act(async()=>root.render(api.element(api.Preview,{mediaRef:ref,video,duration:20,position:null,prepareFrames:false})))
  await api.act(async()=>{await new Promise(resolve=>setTimeout(resolve,1700))})
  assert.equal(api.calls.length,1,'Previews load without hovering')
  await api.act(async()=>root.render(api.element(api.Preview,{mediaRef:ref,video,duration:20,position:{time:15,x:100,width:300},prepareFrames:false})))
  assert.equal(document.querySelector('img')?.getAttribute('src'),'data:image/jpeg;base64,BBBB')
  assert.equal(document.querySelectorAll('video').length,1);assert.equal(media.currentTime,7);assert.equal(api.calls.length,1)
 }finally{
  if(root)await api.act(async()=>root.unmount())
  dom.window.close()
  for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await unlink(output).catch(()=>{});await rmdir(directory)
 }
})

