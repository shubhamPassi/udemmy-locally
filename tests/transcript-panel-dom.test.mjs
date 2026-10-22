import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('transcription follows real playback, seeks on cue click, filters text and can disable following',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test'}),saved=new Map()
 for(const key of ['window','document','navigator','localStorage','Event','HTMLElement','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})
 }
 const dir=mkdtempSync(join(tmpdir(),'tutin-transcript-')),out=join(dir,'panel.cjs');let root,api
 try{
  await build({stdin:{contents:"export {default as Panel} from './src/components/player/TranscriptPanel.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:out,plugins:[{name:'isolate',setup(b){
   b.onLoad({filter:/contextHooks\.js$/},()=>({contents:'export const useSettings=()=>({settings:{googleApiKey:"test"}});'}))
   b.onLoad({filter:/lessonTranscript\.js$/},()=>({contents:'const cues=[{start:1,end:5,text:"First cue"},{start:10,end:15,text:"Second cue"}];export const cachedTranscript=()=>[];export const loadLessonTranscript=async()=>cues;export const activeTranscriptIndex=(rows,time)=>rows.findIndex(cue=>time>=cue.start&&time<cue.end);'}))
  }}]})
  api=createRequire(import.meta.url)(out);root=api.createRoot(document.getElementById('root'))
  let seek,scrolls=0;dom.window.HTMLElement.prototype.scrollIntoView=()=>scrolls++
  const video={id:'lesson',driveFileId:'video0001'},render=async time=>api.act(async()=>root.render(api.element(api.Panel,{video,currentTime:time,onSeek:time=>seek=time})))
  await render(2)
  assert.match(document.querySelector('[aria-current="true"]').textContent,/First cue/)
  await render(11)
  assert.match(document.querySelector('[aria-current="true"]').textContent,/Second cue/)
  assert.ok(scrolls>=2)
  await api.act(async()=>document.querySelector('[aria-current="true"]').click());assert.equal(seek,10)
  await api.act(async()=>document.querySelector('input[type="checkbox"]').click());const before=scrolls
  await render(2);assert.equal(scrolls,before)
  const input=document.querySelector('[aria-label="Search transcription"]')
  await api.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'second');input.dispatchEvent(new Event('input',{bubbles:true}))})
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent.includes('First cue')),false)
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent.includes('Second cue')),true)
 }finally{if(root)await api.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];rmSync(dir,{recursive:true,force:true})}
})
