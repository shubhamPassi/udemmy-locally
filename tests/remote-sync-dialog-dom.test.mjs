import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('successful online scan keeps the same dialog and visible results while the homepage refreshes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test'}),saved=new Map()
 for(const key of ['window','document','navigator','localStorage','Event','CustomEvent','HTMLElement','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})
 }
 Object.defineProperty(navigator,'connection',{value:{saveData:true}})
 const dir=mkdtempSync(join(tmpdir(),'tutin-sync-ui-')),out=join(dir,'home.cjs');let root,api
 try{
  await build({stdin:{contents:"export {default as Home} from './src/pages/HomePage.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';export {reads,releaseRefresh,course} from './src/utils/db.js';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:out,plugins:[{name:'isolate',setup(b){
   b.onLoad({filter:/contextHooks\.js$/},()=>({contents:'const noop=()=>{};export const useSettings=()=>({settings:{viewMode:"grid"},updateSettings:noop});export const useSearch=()=>({searchQuery:"",setSearchQuery:noop});export const useNotification=()=>({showNotification:noop});export const useImport=()=>({registerLoadCourses:noop});'}))
   b.onLoad({filter:/libraryChanges\.js$/},()=>({contents:'export const subscribeLibraryChanges=()=>()=>{};'}))
   b.onLoad({filter:/[\\/]utils[\\/]db\.js$/},()=>({contents:`export const course={id:'course',title:'Test course',customMetadata:{remoteSource:{url:'https://drive.google.com/drive/folders/folder001'}}};export let reads=0,releaseRefresh;export const getAllCourses=async()=>{reads++;if(reads>1)await new Promise(resolve=>releaseRefresh=resolve);return [{...course}]};export const getCourseContent=async()=>({course,videos:[{driveFileId:'video0001'}]});export const recalculateAllCoursesProgress=async()=>{};export const addCourse=async()=>{},addModule=async()=>{},addVideo=async()=>{},deleteCourse=async()=>{},setInstructorAvatar=async()=>{};`}))
   b.onLoad({filter:/remoteCourseSync\.js$/},()=>({contents:`import {course} from './db.js';export const remoteVideoKey=()=>"drive:video0001";export const parseRemoteSource=url=>({url});export const scanRemoteSource=async()=>({});export const planRemoteSync=()=>({additions:[{}],updates:[{}],subtitleFiles:4,missing:0});export const rememberRemoteSource=async(_id,source)=>{course.customMetadata.remoteSource=source};export const applyRemoteSync=async()=>({added:1,updated:1,subtitleFiles:4});`}))
   b.onLoad({filter:/fileSystem\.js$/},()=>({contents:'export const pickFolder=async()=>null,scanCourseFolder=async()=>{},syncCoursePreview=async()=>{},applySyncChanges=async()=>{};'}))
   b.onLoad({filter:/googleDrive\.js$/},()=>({contents:'export const getDriveVideoUrl=()=>"";'}))
   b.onLoad({filter:/[\\/]utils[\\/]api\.js$/},()=>({contents:'export const IS_BROWSER_MODE=true;export const get=async()=>{},post=async()=>{};'}))
   b.onLoad({filter:/CourseCard\.jsx$/},()=>({contents:'import React from "react";export default function Card({course,onSync}){return <button onClick={()=>onSync(course)}>Sync course</button>}',loader:'jsx'}))
   b.onLoad({filter:/\.jsx$/},args=>/HomePage|RemoteSyncModal/.test(args.path)?undefined:{contents:'export default function Placeholder(){return null}'})
  }}]})
  api=createRequire(import.meta.url)(out);root=api.createRoot(document.getElementById('root'))
  await api.act(async()=>root.render(api.element(api.Home)))
  const find=text=>[...document.querySelectorAll('button')].find(button=>button.textContent===text)
  await api.act(async()=>find('Sync course').click())
  const dialog=document.querySelector('[aria-label="Resync online course"]');assert.ok(dialog)
  await api.act(async()=>find('Scan for updates').click())
  assert.ok(api.reads>1,'Successful scan should refresh the course list')
  // Leave that refresh unresolved: the original bug unmounted this dialog here.
  assert.equal(document.querySelector('[aria-label="Resync online course"]'),dialog)
  assert.match(document.querySelector('[aria-label="Scan results"]').textContent,/Scan complete/)
  assert.ok(find('Apply updates'))
  await api.act(async()=>api.releaseRefresh())
  assert.equal(document.querySelector('[aria-label="Resync online course"]'),dialog)
  assert.ok(find('Scan again'));assert.ok(find('Apply updates'))
  assert.equal(api.course.customMetadata.remoteSource.url,'https://drive.google.com/drive/folders/folder001')
  await api.act(async()=>find('Apply updates').click())
  assert.equal(document.querySelector('[aria-label="Resync online course"]'),dialog)
  assert.match(dialog.textContent,/Synced: 1 new videos/)
  await api.act(async()=>api.releaseRefresh())
  assert.ok(find('Done'))
  assert.equal(find('Scan for updates'),undefined)
 }finally{if(root)await api.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];rmSync(dir,{recursive:true,force:true})}
})
