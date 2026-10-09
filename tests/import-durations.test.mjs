import test from 'node:test'
import assert from 'node:assert/strict'
import { importVideos, applyImportDuration } from '../src/utils/importDurations.js'
test('preview duration sums nested videos once while preserving edits and original file handles',()=>{
 const handle={},modules=[{title:'Edited module',videos:[{filePath:'a',duration:10,fileHandle:handle}],subModules:[{title:'Child',videos:[{filePath:'b',duration:0}],subModules:[]}]}]
 const updated=applyImportDuration(modules,'b',20)
 assert.equal(updated[0].totalDuration,30)
 assert.equal(updated[0].subModules[0].totalDuration,20)
 assert.equal(updated[0].title,'Edited module')
 assert.equal(updated[0].videos[0].fileHandle,handle)
 assert.equal(modules[0].subModules[0].videos[0].duration,0)
 assert.equal(importVideos(updated).length,2)
})
