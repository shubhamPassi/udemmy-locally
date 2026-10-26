import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtemp,unlink,rmdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('homepage folder drop shows scan feedback and opens review only for valid courses, without saving',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://udemy.chaigallery.in'})
 const saved=new Map()
 for(const key of ['window','document','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})}
 const directory=await mkdtemp(join(tmpdir(),'tutin-folder-drop-')),output=join(directory,'test.cjs')
 let root,api
 try{
  await build({stdin:{contents:"export {default as Drop} from './src/components/course/LocalCourseDrop.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:output,plugins:[{name:'isolate-import',setup(build){
   build.onLoad({filter:/[\\/]api\.js$/},()=>({contents:'export const IS_BROWSER_MODE=true'}))
   build.onLoad({filter:/[\\/]fileSystem\.js$/},()=>({contents:"import {scanBrowserFolder} from './browserFiles.js';export async function scanCourseSelection(handle){return {courses:[await scanBrowserFolder(handle)]}}"}))
  }}]})
  api=createRequire(import.meta.url)(output);root=api.createRoot(document.getElementById('root'))
  const courses=[],errors=[],props={onCourse:course=>courses.push(course),onError:error=>errors.push(error)}
  await api.act(async()=>root.render(api.element(api.Drop,props)))
  const event=(type,transfer)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:transfer});window.dispatchEvent(event);return event}
  const file={kind:'file',name:'Lesson.mp4'},folder={kind:'directory',name:'Course',async *values(){yield file}}
  let release,captured=false
  const transfer={types:['Files'],items:[{kind:'file',getAsFileSystemHandle(){captured=true;return new Promise(resolve=>{release=resolve})}}]}
  await api.act(async()=>event('dragenter',transfer));assert.match(document.body.textContent,/Drop your course folder/)
  await api.act(async()=>{const drop=event('drop',transfer);assert.equal(drop.defaultPrevented,true);assert.equal(captured,true)})
  assert.match(document.body.textContent,/Scanning course folder/)
  await api.act(async()=>event('drop',transfer));assert.equal(courses.length,0)
  await api.act(async()=>release(folder));assert.equal(courses.length,1);assert.equal(courses[0].folderHandle,folder);assert.equal(courses[0].totalVideos,1)
  await api.act(async()=>event('drop',{types:['Files'],items:[{kind:'file',getAsFileSystemHandle:()=>({kind:'directory',name:'Empty',async *values(){}})}]}))
  assert.equal(courses.length,1);assert.match(errors.at(-1),/No supported video/)
  await api.act(async()=>{assert.equal(event('drop',{types:['text/plain']}).defaultPrevented,false)})
  await api.act(async()=>root.render(api.element(api.Drop,{...props,disabled:true})))
  await api.act(async()=>event('drop',transfer));assert.equal(courses.length,1)
 }finally{
  if(root)await api.act(async()=>root.unmount())
  dom.window.close()
  for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await unlink(output).catch(()=>{});await rmdir(directory)
 }
})
