import test from 'node:test'
import assert from 'node:assert/strict'
import {matchReconnectFile} from '../src/utils/reconnectFiles.js'
test('reconnection matches paths and refuses ambiguous duplicate filenames',()=>{
 const scanned=[{filePath:'Course/A/Intro.mp4',fileName:'Intro.mp4'},{filePath:'Course/B/Intro.mp4',fileName:'Intro.mp4'}]
 assert.equal(matchReconnectFile({filePath:'G:\\Course\\A\\Intro.mp4'},scanned),scanned[0])
 assert.equal(matchReconnectFile({fileName:'Intro.mp4'},scanned),null)
 assert.equal(matchReconnectFile({fileName:'Only.mp4'},[{fileName:'Only.mp4'}]).fileName,'Only.mp4')
})
