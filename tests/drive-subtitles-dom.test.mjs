import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('Drive subtitle menu loads matching imported captions and keeps them off until selected',async()=>{
 const dom=new JSDOM('<div id="root"></div><div id="player"><video></video><div data-subtitle-controls></div></div>',{url:'https://app.test'}),saved=new Map()
 for(const key of ['window','document','navigator','localStorage','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})
 }
 const dir=mkdtempSync(join(tmpdir(),'tutin-subs-')),out=join(dir,'subs.cjs');let root,api
 try{
  await build({stdin:{contents:"export {default as Subtitles} from './src/components/player/SubtitleTools.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';export {saved} from './src/utils/progressStorage.js';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:out,plugins:[{name:'isolate',setup(b){
   b.onLoad({filter:/progressStorage\.js$/},()=>({contents:'export const saved=new Map();export const readProgressValue=key=>saved.get(key)||null;export const writeProgressValue=(key,value)=>saved.set(key,value);'}))
   b.onLoad({filter:/[\\/]utils[\\/]api\.js$/},()=>({contents:'export const IS_BROWSER_MODE=true;export const get=async()=>[],fetchYoutubeTranscript=async()=>({chunks:[]});'}))
   b.onLoad({filter:/driveSubtitles\.js$/},()=>({contents:'export const discoverDriveSubtitles=async()=>[{driveFileId:"subtitle01"}];export const loadDriveSubtitle=async()=>[{start:1,end:3,text:"Hello course"}];'}))
  }}]})
  api=createRequire(import.meta.url)(out);root=api.createRoot(document.getElementById('root'))
  await api.act(async()=>root.render(api.element(api.Subtitles,{videoId:'lesson',video:{driveFileId:'video0001'},googleApiKey:'test-key',host:{current:document.getElementById('player')}})))
  await api.act(async()=>document.querySelector('[aria-label="Subtitle settings"]').click())
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Imported subtitles')
  assert.ok(button);assert.equal(button.getAttribute('aria-pressed'),'false')
  assert.equal(JSON.parse(api.saved.get('tutin_subtitles_lesson'))[0].text,'Hello course')
  await api.act(async()=>button.click())
  await api.act(async()=>document.querySelector('[aria-label="Subtitle settings"]').click())
  assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Imported subtitles').getAttribute('aria-pressed'),'true')
 }finally{if(root)await api.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];rmSync(dir,{recursive:true,force:true})}
})
