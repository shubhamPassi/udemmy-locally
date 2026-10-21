import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {buildSync} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import 'fake-indexeddb/auto'
test('player tools open by keyboard, set a repeat range, configure a timer and restore focus without a browser',async()=>{
    const dom=new JSDOM('<div id="root"></div><video></video>',{url:'https://app.test',pretendToBeVisual:true}),saved=new Map()
    for(const key of ['window','document','navigator','localStorage','Event','CustomEvent','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT','MessageChannel']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setImmediate(()=>this.port1.onmessage?.())}}}:dom.window[key]})}
    const directory=mkdtempSync(join(tmpdir(),'tutin-dom-test-')),output=join(directory,'components.cjs')
    let root,act
    try{
        buildSync({stdin:{contents:"export {default as Player} from './src/components/player/StreamPlayerControls.jsx';export {createRoot} from 'react-dom/client';export {act,createElement as element} from 'react';",resolveDir:resolve('.'),loader:'jsx'},bundle:true,jsx:'automatic',platform:'browser',format:'cjs',outfile:output,define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'}})
        const api=createRequire(import.meta.url)(output);act=api.act
        const media=document.querySelector('video');Object.defineProperties(media,{duration:{value:100,configurable:true},readyState:{value:0,configurable:true}})
        const mediaRef={current:media},containerRef={current:document.getElementById('root')}
        root=api.createRoot(containerRef.current)
        // createElement exported below avoids mixing React instances in the test.
        await act(async()=>root.render(api.element(api.Player,{mediaRef,containerRef,video:{id:'dom-lesson',title:'Lesson'}})))
        Object.defineProperties(media,{paused:{value:false,configurable:true},readyState:{value:2,configurable:true}})
        await act(async()=>media.dispatchEvent(new Event('waiting')))
        assert.ok(document.querySelector('[aria-label="Loading video"]'))
        Object.defineProperty(media,'readyState',{value:4,configurable:true})
        await act(async()=>media.dispatchEvent(new Event('playing')))
        assert.equal(document.querySelector('[aria-label="Loading video"]'),null)
        Object.defineProperties(media,{paused:{value:true,configurable:true},readyState:{value:0,configurable:true}})
        await act(async()=>media.dispatchEvent(new Event('pause')))
        const tools=document.querySelector('button[aria-label="Learning tools"]')
        await act(async()=>tools.click())
        const panel=document.querySelector('[role="dialog"][aria-label="Learning tools"]');assert.ok(panel)
        assert.equal(document.activeElement.getAttribute('aria-label'),'Close learning tools')
        await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})))
        assert.equal(document.activeElement.tagName,'SUMMARY')
        await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})))
        assert.equal(document.activeElement.getAttribute('aria-label'),'Close learning tools')
        media.currentTime=10;await act(async()=>[...panel.querySelectorAll('button')].find(button=>button.textContent.startsWith('A ')).click())
        media.currentTime=20;await act(async()=>[...panel.querySelectorAll('button')].find(button=>button.textContent.startsWith('B ')).click())
        await act(async()=>panel.querySelector('button[aria-pressed]').click());assert.equal(panel.querySelector('button[aria-pressed]').getAttribute('aria-pressed'),'true')
        const timer=panel.querySelector('select[aria-label="Sleep timer"]');await act(async()=>{timer.value='15';timer.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(timer.value,'15')
        await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
        assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,tools)
    }finally{
        if(root&&act)await act(async()=>root.unmount())
        dom.window.close()
        for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
        unlinkSync(output);rmdirSync(directory)
    }
})
