import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import 'fake-indexeddb/auto'

for (const hosted of [false, true]) test(hosted ? 'hosted Drive resumes native playback and records real study time without counting pauses or seeks' : 'Drive failure preserves the native player and bookmark without switching to preview',async()=>{
    const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test',pretendToBeVisual:true})
    const saved=new Map(),timers=[],originalTimeout=globalThis.setTimeout
    for(const key of ['window','document','navigator','localStorage','Event','CustomEvent','HTMLElement','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){
        saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
        Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})
    }
    globalThis.setTimeout=(fn,delay,...args)=>[1500,3000].includes(delay)?(timers.push(fn),timers.length):originalTimeout(fn,delay,...args)
    const directory=mkdtempSync(join(tmpdir(),'tutin-drive-test-')),output=join(directory,'player.cjs')
    const previousPerformance=Object.getOwnPropertyDescriptor(globalThis,'performance')
    let root,api
    try{
        await build({stdin:{contents:"export {default as Player} from './src/components/player/ResumableEmbedPlayer.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';export {writes} from './src/utils/playbackBookmarks.js';export {renderedControls} from './src/components/player/StreamPlayerControls.jsx';export {readStudySessions} from './src/utils/studyTime.js';export {readCoverage} from './src/utils/watchCoverage.js';export {flushProgressStorage} from './src/utils/progressStorage.js';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:output,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolate-player',setup(build){
            build.onLoad({filter:/[\\/]utils[\\/]db\.js$/},()=>({contents:'export const updateVideoProgress=async()=>{},updateVideo=async()=>{},markVideoComplete=async()=>{};'}))
            build.onLoad({filter:/[\\/]utils[\\/]api\.js$/},()=>({contents:`export const IS_BROWSER_MODE=${hosted};`}))
            build.onLoad({filter:/[\\/]utils[\\/]playbackBookmarks\.js$/},()=>({contents:'export const writes=[];export const resumeTime=()=>writes.at(-1)?.[1]||125;export const writePlaybackBookmark=(...args)=>writes.push(args);export const isProgressResetting=()=>false;'}))
            if(!hosted)build.onLoad({filter:/[\\/]hooks[\\/]useStudyTime\.js$/},()=>({contents:'export default function useStudyTime(){return ()=>{}}'}))
            build.onLoad({filter:/[\\/](StreamPlayerControls|PlayerLearningTools)\.jsx$/},()=>({contents:'export const renderedControls=[];export default function Controls(props){renderedControls.push(props);return null}'}))
        }}]})
        api=createRequire(import.meta.url)(output)
        let clock=0
        if(hosted)Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}})
        root=api.createRoot(document.getElementById('root'))
        await api.act(async()=>root.render(api.element(api.Player,{video:{id:'lesson',driveFileId:'public12345',duration:600,title:'Lesson'},courseId:'course',settings:{resumePlayback:true,autoMarkCompleteAt:95,googleApiKey:hosted?'test-key':''}})))
        if(hosted){
            const media=document.querySelector('video')
            assert.equal(new URL(media.src).hostname,'www.googleapis.com')
            assert.equal(new URL(media.src).searchParams.get('alt'),'media')
            assert.equal(new URL(media.src).searchParams.get('key'),'test-key')
            assert.equal(api.renderedControls.at(-1).allowFramePreviews,true)
            assert.equal(document.querySelector('iframe'),null)
            let paused=false,seeking=false
            Object.defineProperties(media,{duration:{value:600,configurable:true},readyState:{value:4,configurable:true},paused:{get:()=>paused,configurable:true},seeking:{get:()=>seeking,configurable:true}})
            const send=async name=>api.act(async()=>media.dispatchEvent(new Event(name)))
            await send('loadedmetadata')
            assert.equal(media.currentTime,125)
            await send('seeked')
            const watch=async time=>{clock+=5000;media.currentTime=time;await send('timeupdate');await send('tutin-playback-checkpoint')}
            await watch(130)
            paused=true;await send('pause');clock+=10000;await send('tutin-playback-checkpoint')
            seeking=true;await send('seeking');media.currentTime=300;seeking=false;await send('seeked')
            paused=false;await send('play');await watch(305)
            seeking=true;await send('seeking');media.currentTime=125;seeking=false;await send('seeked')
            await watch(130)
            const seconds=api.readStudySessions().reduce((sum,record)=>sum+Object.values(record.hours).reduce((a,b)=>a+b,0),0)
            assert.equal(seconds,15)
            assert.deepEqual(api.readCoverage('lesson'),[[125,130],[300,305]])
            assert.equal(api.writes.at(-1)[1],130)
            await api.act(async()=>root.render(null))
            await api.act(async()=>root.render(api.element(api.Player,{video:{id:'lesson',driveFileId:'public12345',duration:600,title:'Lesson'},courseId:'course',settings:{resumePlayback:true,autoMarkCompleteAt:95,googleApiKey:'test-key'}})))
            const restored=document.querySelector('video')
            Object.defineProperty(restored,'duration',{value:600,configurable:true})
            await api.act(async()=>restored.dispatchEvent(new Event('loadedmetadata')))
            assert.equal(restored.currentTime,130)
            return
        }
        let media=document.querySelector('video')
        Object.defineProperty(media,'duration',{value:600,configurable:true})
        await api.act(async()=>media.dispatchEvent(new Event('loadedmetadata')))
        media.currentTime=150
        await api.act(async()=>media.dispatchEvent(new Event('timeupdate')))
        for(let attempt=0;attempt<3;attempt++){
            await api.act(async()=>document.querySelector('video').dispatchEvent(new Event('error')))
            if(attempt<2){assert.equal(document.querySelector('iframe'),null);await api.act(async()=>timers.shift()())}
        }
        assert.ok(document.querySelector('video'))
        assert.equal(document.querySelector('iframe'),null)
        assert.match(document.querySelector('[role="alert"]').textContent,/Add a Google API key/)
        assert.equal(api.writes.at(-1)[1],150)
        await api.act(async()=>document.querySelector('button').click())
        assert.equal(document.querySelector('iframe'),null)
        assert.ok(document.querySelector('video'))
    }finally{
        if(root&&api)await api.act(async()=>root.unmount())
        await api?.flushProgressStorage().catch(()=>{})
        if(previousPerformance)Object.defineProperty(globalThis,'performance',previousPerformance)
        globalThis.setTimeout=originalTimeout
        dom.window.close()
        for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
        rmSync(directory,{recursive:true,force:true})
    }
})
