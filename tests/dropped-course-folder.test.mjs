import test from 'node:test'
import assert from 'node:assert/strict'
import { droppedCourseFolder, hasDroppedFiles } from '../src/utils/droppedCourseFolder.js'
import { scanBrowserFolder } from '../src/utils/browserFiles.js'

const directory=(name,entries=[])=>({name,kind:'directory',async *values(){yield*entries}})
test('folder drop captures a real directory handle synchronously and preserves nested playable handles',async()=>{
 const file={kind:'file',name:'01 - Lesson.mp4',getFile:()=>assert.fail('Scanning must not read video bytes')}
 const folder=directory('Course',[directory('01 - Introduction',[file]),{kind:'file',name:'notes.txt'}])
 let captured=false
 const pending=droppedCourseFolder({items:[{kind:'file',getAsFileSystemHandle(){captured=true;return Promise.resolve(folder)}}]})
 assert.equal(captured,true,'Drag data must be read before awaiting')
 const handle=await pending;assert.equal(handle,folder)
 const course=await scanBrowserFolder(handle)
 assert.equal(course.totalVideos,1);assert.equal(course.folderHandle,folder)
 assert.equal(course.modules[0].subModules[0].videos[0].fileHandle,file)
 assert.equal(course.modules[0].subModules[0].videos[0].filePath,'Course/01 - Introduction/01 - Lesson.mp4')
})
test('folder drop rejects files, multiple roots and unsupported browsers; text is not a file drag',async()=>{
 assert.equal(hasDroppedFiles({types:['text/plain']}),false)
 assert.equal(hasDroppedFiles({types:['Files']}),true)
 await assert.rejects(droppedCourseFolder({items:[]}),/one course folder/)
 const item={kind:'file',getAsFileSystemHandle:()=>({kind:'file'})}
 await assert.rejects(droppedCourseFolder({items:[item]}),/course folder/)
 await assert.rejects(droppedCourseFolder({items:[item,item]}),/one course folder/)
 await assert.rejects(droppedCourseFolder({items:[{kind:'file'}]}),/Add Course/)
 const empty=await scanBrowserFolder(directory('Not a course',[{kind:'file',name:'README.txt'}]))
 assert.equal(empty.totalVideos,0)
})
