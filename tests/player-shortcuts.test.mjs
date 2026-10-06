import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playerShortcut } from '../src/utils/playerShortcuts.js'
test('YouTube shortcuts distinguish frame stepping from speed and playlist changes',()=>{
 assert.deepEqual(playerShortcut({key:'j'}),{type:'seek',value:-10})
 assert.deepEqual(playerShortcut({key:'ArrowRight'}),{type:'seek',value:5})
 assert.deepEqual(playerShortcut({key:'5'}),{type:'percent',value:0.5})
 assert.equal(playerShortcut({key:'.'}).type,'frame')
 assert.equal(playerShortcut({key:'>',shiftKey:true}).type,'speed')
 assert.equal(playerShortcut({key:'P',shiftKey:true}).type,'previous')
})
test('typing, browser shortcuts, dialogs, and focused buttons keep their normal behavior',()=>{
 for(const event of [{key:'k',ctrlKey:true},{key:'k',isComposing:true},{key:'k',target:{isContentEditable:true}},{key:'k',target:{closest:()=>({})}},{key:' ',target:{closest:selector=>selector.startsWith('button')?{}:null}}]) assert.equal(playerShortcut(event),null)
})
