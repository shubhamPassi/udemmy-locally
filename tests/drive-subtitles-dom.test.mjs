import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('Drive subtitle menu loads matching imported captions and keeps them off until selected',async()=>{
 const dom=new JSDOM('<div id="root"></div><div id="player"><video></video><div data-controls-visible="true"><div data-player-controls-bar><div data-subtitle-controls></div></div></div></div>',{url:'https://app.test'}),saved=new Map()
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
  const track={cues:[],mode:'disabled',addCue(cue){this.cues.push(cue)},removeCue(cue){this.cues.splice(this.cues.indexOf(cue),1)}}
  window.VTTCue=class{constructor(start,end,text){this.startTime=start;this.endTime=end;this.text=text}}
  document.querySelector('video').addTextTrack=()=>track
  document.querySelector('video').getBoundingClientRect=()=>({top:0,width:960,height:540})
  document.querySelector('[data-player-controls-bar]').getBoundingClientRect=()=>({top:440,width:960,height:100})
  api=createRequire(import.meta.url)(out);root=api.createRoot(document.getElementById('root'))
  await api.act(async()=>root.render(api.element(api.Subtitles,{videoId:'lesson',video:{driveFileId:'video0001'},googleApiKey:'test-key',host:{current:document.getElementById('player')}})))
  await api.act(async()=>document.querySelector('[aria-label="Subtitle settings"]').click())
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='On')
  assert.ok(button);assert.equal(button.getAttribute('aria-pressed'),'false')
  assert.equal(JSON.parse(api.saved.get('tutin_subtitles_lesson'))[0].text,'Hello course')
  assert.equal(track.mode,'disabled');assert.equal(track.cues[0].size,78);assert.equal(track.cues[0].snapToLines,false);assert.equal(track.cues[0].lineAlign,'end');assert.ok(track.cues[0].line<80)
  await api.act(async()=>button.click())
  assert.equal(track.mode,'showing')
  await api.act(async()=>{document.querySelector('[data-controls-visible]').dataset.controlsVisible='false'})
  assert.equal(track.cues[0].line,-1);assert.equal(track.cues[0].snapToLines,true)
  await api.act(async()=>{document.querySelector('[data-controls-visible]').dataset.controlsVisible='true'})
  assert.equal(track.cues[0].snapToLines,false);assert.ok(track.cues[0].line<80)
  assert.match(document.querySelector('style').textContent,/font-weight:500/)
  await api.act(async()=>document.querySelector('[aria-label="Subtitle settings"]').click())
  assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='On').getAttribute('aria-pressed'),'true')
  const media=document.querySelector('video'),fullscreenHost=document.getElementById('player'),bar=document.querySelector('[data-player-controls-bar]')
  media.currentTime=2
  Object.defineProperties(media,{videoWidth:{configurable:true,value:1920},videoHeight:{configurable:true,value:1080}})
  media.getBoundingClientRect=()=>({top:0,left:0,right:1920,bottom:1080,width:1920,height:1080})
  fullscreenHost.getBoundingClientRect=()=>({top:0,left:0,right:1920,bottom:1080,width:1920,height:1080})
  bar.getBoundingClientRect=()=>({top:980,left:0,bottom:1080,width:1920,height:100})
  Object.defineProperty(document,'fullscreenElement',{configurable:true,value:fullscreenHost})
  await api.act(async()=>document.dispatchEvent(new Event('fullscreenchange')))
  assert.equal(track.mode,'hidden','Native captions must not duplicate the fullscreen overlay')
  const caption=document.querySelector('[data-fullscreen-subtitles]');assert.ok(caption)
  assert.equal(caption.textContent,'Hello course');assert.equal(Number.parseFloat(caption.style.bottom),116)
  await api.act(async()=>{document.querySelector('[data-controls-visible]').dataset.controlsVisible='false'})
  assert.equal(Number.parseFloat(caption.style.bottom),12)
  await api.act(async()=>{document.querySelector('[data-controls-visible]').dataset.controlsVisible='true'})
  assert.equal(Number.parseFloat(caption.style.bottom),116)
  await api.act(async()=>{media.currentTime=4;media.dispatchEvent(new Event('timeupdate'))})
  assert.equal(document.querySelector('[data-fullscreen-subtitles]'),null)
  await api.act(async()=>{media.currentTime=2;media.dispatchEvent(new Event('seeked'))})
  assert.ok(document.querySelector('[data-fullscreen-subtitles]'))
  Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null})
  await api.act(async()=>document.dispatchEvent(new Event('fullscreenchange')))
  assert.equal(document.querySelector('[data-fullscreen-subtitles]'),null);assert.equal(track.mode,'showing')

 }finally{if(root)await api.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];rmSync(dir,{recursive:true,force:true})}
})
