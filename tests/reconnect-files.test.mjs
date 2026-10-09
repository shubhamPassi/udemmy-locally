import test from 'node:test'
import assert from 'node:assert/strict'
import {matchReconnectFile} from '../src/utils/reconnectFiles.js'
test('reconnection matches paths and refuses ambiguous duplicate filenames',()=>{
 const scanned=[{filePath:'Course/A/Intro.mp4',fileName:'Intro.mp4'},{filePath:'Course/B/Intro.mp4',fileName:'Intro.mp4'}]
 assert.equal(matchReconnectFile({filePath:'G:\\Course\\A\\Intro.mp4'},scanned),scanned[0])
 assert.equal(matchReconnectFile({fileName:'Intro.mp4'},scanned),null)
 assert.equal(matchReconnectFile({fileName:'Only.mp4'},[{fileName:'Only.mp4'}]).fileName,'Only.mp4')
})
test('renamed roots, parent folder selection and URI encoded paths still reconnect',()=>{
 const scanned=[{filePath:'Selected parent/Renamed course/0. Welcome/1. Why learn DevSecOps.mp4',fileName:'1. Why learn DevSecOps.mp4',title:'Why learn DevSecOps'}]
 assert.equal(matchReconnectFile({filePath:'G:\\Old course\\0. Welcome\\1. Why learn DevSecOps.mp4'},scanned),scanned[0])
 assert.equal(matchReconnectFile({filePath:'Old%20course/0.%20Welcome/1.%20Why%20learn%20DevSecOps.mp4'},scanned),scanned[0])
 assert.equal(matchReconnectFile({title:'Why learn DevSecOps'},scanned),scanned[0])
})
test('duplicate titles remain unmatched without a path, while relative paths identify them',()=>{
 const scanned=[{filePath:'New/A/1. Intro.mp4',title:'Intro'},{filePath:'New/B/1. Intro.mp4',title:'Intro'}]
 assert.equal(matchReconnectFile({title:'Intro'},scanned),null)
 assert.equal(matchReconnectFile({filePath:'Old/B/1. Intro.mp4'},scanned,{originalRoot:'Old',selectedRoot:'New'}),scanned[1])
})
