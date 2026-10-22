import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('edit course offers thumbnail search with existing image, clipboard paste and blocked-popup feedback',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test'}),saved=new Map()
 for(const key of ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})
 }
 const dir=mkdtempSync(join(tmpdir(),'tutin-edit-')),out=join(dir,'edit.cjs');let root,api
 try{
  await build({stdin:{contents:"export {default as Modal} from './src/components/course/EditCourseModal.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:out,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolate',setup(b){
   b.onLoad({filter:/useModalFocus\.js$/},()=>({contents:'export default function useModalFocus(){}'}))
   b.onLoad({filter:/InstructorPicker\.jsx$/},()=>({contents:'export default function InstructorPicker(){return null}'}))
   b.onLoad({filter:/[\\/]utils[\\/]db\.js$/},()=>({contents:'export const updateCourse=async()=>{},formatDuration=()=>"1h";'}))
   b.onLoad({filter:/[\\/]utils[\\/]api\.js$/},()=>({contents:'export const post=async()=>({base64:"data:image/png;base64,new"});'}))
  }}]})
  api=createRequire(import.meta.url)(out);root=api.createRoot(document.getElementById('root'))
  await api.act(async()=>root.render(api.element(api.Modal,{course:{id:'one',title:'AI & RAG course',thumbnailData:'data:image/png;base64,old'},isOpen:true,onClose(){}})))
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
  assert.ok(button('Upload Image'));assert.ok(button('Browse images'));assert.ok(button('Paste image URL'))
  let opened;const popup={opener:{}};window.open=(...args)=>(opened=args,popup)
  await api.act(async()=>button('Browse images').click())
  assert.equal(new URL(opened[0]).searchParams.get('q'),'AI & RAG course');assert.match(opened[2],/popup=yes/);assert.equal(popup.opener,null)
  Object.defineProperty(navigator,'clipboard',{value:{readText:async()=> 'https://images.example/course.jpg'}})
  await api.act(async()=>button('Paste image URL').click())
  assert.equal(document.querySelector('[aria-label="Thumbnail image URL"]').value,'https://images.example/course.jpg')
  await api.act(async()=>button('Use URL').click())
  assert.equal(document.querySelector('img[alt="Thumbnail"]').src,'data:image/png;base64,new')
  window.open=()=>null;await api.act(async()=>button('Browse images').click());assert.match(document.body.textContent,/Allow pop-ups/)
 }finally{if(root)await api.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];rmSync(dir,{recursive:true,force:true})}
})
