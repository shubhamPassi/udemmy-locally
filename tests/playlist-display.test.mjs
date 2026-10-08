import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playlistDisplay } from '../src/utils/playlistDisplay.js'
test('synthetic Videos buckets are hidden while lesson IDs and source data remain intact',()=>{
 const video={id:'lesson',moduleId:'bucket',lastWatchedPosition:599}
 const original=[{id:'concepts',title:'Key Concepts',videos:[],subModules:[{id:'bucket',title:'Videos',originalTitle:'Videos',videos:[video]}]}]
 const display=playlistDisplay(original)
 assert.deepEqual(display[0].subModules,[])
 assert.equal(display[0].videos[0],video)
 assert.equal(display[0].videos[0].moduleId,'bucket')
 assert.equal(original[0].subModules.length,1)
 assert.equal(original[0].videos.length,0)
})
test('real folders named Videos and other nested modules retain their hierarchy',()=>{
 const display=playlistDisplay([{id:'root',subModules:[{id:'real',title:'Videos',originalTitle:'Videos',folderPath:'Course/Videos',videos:[{id:'v'}]}]}])
 assert.equal(display[0].subModules[0].id,'real')
})
