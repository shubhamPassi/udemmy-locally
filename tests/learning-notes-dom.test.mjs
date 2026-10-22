import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('Learning tools contains the full note editor and saves a note at the actual player timestamp',async()=>{
 const dom=new JSDOM('<div id="root"></div><video></video>',{url:'https://app.test'}),saved=new Map()
 for(const key of ['window','document','navigator','localStorage','Event','CustomEvent','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})
 }
 const dir=mkdtempSync(join(tmpdir(),'tutin-notes-')),out=join(dir,'tools.cjs');let root,api
 try{
  await build({stdin:{contents:"export {default as Tools} from './src/components/player/PlayerLearningTools.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';export {savedNotes} from './src/utils/db.js';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:out,plugins:[{name:'isolate',setup(b){
   b.onLoad({filter:/contextHooks\.js$/},()=>({contents:'export const useNotification=()=>({showNotification(){}});'}))
   b.onLoad({filter:/[\\/]utils[\\/]db\.js$/},()=>({contents:'export const savedNotes=[];export const getNotesByVideo=async()=>savedNotes;export const addNote=async note=>{savedNotes.push({...note,id:"note1"});return {id:"note1"}};export const updateNote=async()=>{},deleteNote=async()=>{},formatDuration=time=>String(time);'}))
  }}]})
  api=createRequire(import.meta.url)(out);root=api.createRoot(document.getElementById('root'))
  const media=document.querySelector('video');media.currentTime=36
  await api.act(async()=>root.render(api.element(api.Tools,{video:{id:'lesson',courseId:'course'},mediaRef:{current:media},hostRef:{current:document.getElementById('root')}})))
  await api.act(async()=>document.querySelector('[aria-label="Learning tools"]').click())
  const find=text=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===text)
  await api.act(async()=>find('Notes').click())
  await api.act(async()=>find('Add Note at 36').click())
  const editor=document.querySelector('[contenteditable="true"]');assert.ok(editor)
  await api.act(async()=>{editor.innerHTML='Remember this section';editor.dispatchEvent(new Event('input',{bubbles:true}))})
  await api.act(async()=>find('Add Note').click())
  assert.equal(api.savedNotes.length,1);assert.equal(api.savedNotes[0].videoId,'lesson');assert.equal(api.savedNotes[0].courseId,'course');assert.equal(api.savedNotes[0].timestamp,36)
  assert.match(document.body.textContent,/Remember this section/)
 }finally{if(root)await api.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];rmSync(dir,{recursive:true,force:true})}
})
