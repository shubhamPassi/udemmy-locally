import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'

test('instructor rename supports casing changes and merging keeps all course progress',async()=>{
 const previousWindow=globalThis.window
 globalThis.window=new EventTarget()
 globalThis.window.location={hostname:'udemy.chaigallery.in'}
 try{
  const {request}=await import('../src/utils/browserStore.js')
  const {renameInstructorCourses,getAllCourses}=await import('../src/utils/db.js')
  await request('POST','/api/courses',{id:'rename-a',title:'A',instructor:'Techworld with Nana',completedVideos:4})
  await request('POST','/api/courses',{id:'rename-b',title:'B',instructor:'Techworld with Nana',completedVideos:2})
  await request('POST','/api/courses',{id:'rename-target',title:'Target',instructor:'Other Instructor',completedVideos:1})
  const source=(await getAllCourses()).filter(course=>course.instructor==='Techworld with Nana')
  await renameInstructorCourses(source,'Techworld With Nana')
  assert.equal((await request('GET','/api/courses/rename-a')).instructor,'Techworld With Nana')
  await renameInstructorCourses(source,'OTHER INSTRUCTOR')
  const courses=await getAllCourses()
  assert.equal(courses.filter(course=>course.instructor==='Other Instructor').length,3)
  assert.equal(courses.find(course=>course.id==='rename-a').completedVideos,4)
  assert.equal(courses.find(course=>course.id==='rename-b').completedVideos,2)
 }finally{globalThis.window=previousWindow}
})
