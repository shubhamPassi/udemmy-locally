import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { request } from '../src/utils/browserStore.js'
import { scanBrowserFolder } from '../src/utils/browserFiles.js'
import { parseDrivePage } from '../api/public-import.js'

test('browser courses retain nested lessons, Drive IDs, progress, and history', async () => {
 await request('POST', '/api/courses', { id:'course', title:'Course' })
 await request('POST', '/api/modules', { id:'module', courseId:'course', title:'Module' })
 await request('POST', '/api/videos', { id:'video', courseId:'course', moduleId:'module', title:'Lesson', driveFileId:'public-file', duration:60 })
 await request('PUT', '/api/videos/video/progress', { watchProgress:0.5, lastWatchedPosition:30 })
 await request('POST', '/api/videos/video/complete', { isCompleted:true })
 const content = await request('GET', '/api/courses/course/content')
 assert.equal(content.videos[0].driveFileId, 'public-file')
 assert.equal(content.videos[0].lastWatchedPosition, 30)
 assert.equal(content.course.completionPercentage,100)
 assert.equal(content.modules[0].completedVideos,1)
 const history = await request('GET','/api/analytics/history')
 assert.equal(history[0].course.title,'Course')
 assert.equal(history[0].video.id,'video')
 await request('DELETE','/api/courses/course')
 assert.deepEqual(await request('GET','/api/videos'),[])
 assert.deepEqual(await request('GET','/api/modules'),[])
})
test('browser folder scanner discovers nested videos without uploading video data', async () => {
 const file = { kind:'file', name:'01 - Welcome.mp4' }
 const nested = { kind:'directory', name:'Module 1', async *values() { yield file } }
 const root = { kind:'directory', name:'Course', async *values() { yield nested; yield {kind:'file', name:'notes.txt'} } }
 const course = await scanBrowserFolder(root)
 assert.equal(course.totalVideos,1)
 assert.equal(course.modules[0].subModules[0].videos[0].fileHandle,file)
 assert.equal(course.modules[0].subModules[0].videos[0].title,'Welcome')
})
test('Drive page decoder reads escaped public names and refuses sign-in pages', () => {
 const payload = JSON.stringify([[[ 'file12345', ['folder123'], 'Lesson "one".mp4', 'video/mp4' ]],1])
 const escaped = [...payload].map(char => `\\x${char.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')
 const parsed = parseDrivePage(`<title>Course – Google Drive</title><script>window['_DRIVE_ivd'] = '${escaped}';</script>`)
 assert.equal(parsed.files[0].name,'Lesson "one".mp4')
 assert.equal(parsed.name,'Course')
 assert.throws(()=>parseDrivePage('<title>Sign in</title>'),/publicly readable/)
})
