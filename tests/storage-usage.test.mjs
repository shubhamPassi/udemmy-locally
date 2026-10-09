import test from 'node:test'
import assert from 'node:assert/strict'
import {localStorageBytes,isLocalStorageTight} from '../src/utils/storageUsage.js'
test('storage reminder measures progress data separately from browser-wide quota',()=>{
 const storage={one:'abc',two:'defg'}
 Object.defineProperty(storage,'getItem',{value:key=>storage[key]})
 assert.equal(localStorageBytes(storage),26)
 assert.equal(isLocalStorageTight(4*1024*1024),true)
 assert.equal(isLocalStorageTight(3*1024*1024),false)
 assert.equal(localStorageBytes(null),0)
})
