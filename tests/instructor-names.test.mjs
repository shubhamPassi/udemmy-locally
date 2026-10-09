import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalInstructor, normalizeCourseInstructors } from '../src/utils/instructorNames.js'
test('capitalization and spacing variants share one instructor without combining different names',()=>{
 const courses=[{id:'a',instructor:'Techworld with Nana'},{id:'b',instructor:' Techworld  With Nana '},{id:'c',instructor:'Akshay Saini'}]
 const result=normalizeCourseInstructors(courses)
 assert.equal(result[1].instructor,'Techworld with Nana')
 assert.equal(result[2].instructor,'Akshay Saini')
 assert.equal(canonicalInstructor('TECHWORLD WITH NANA',courses),'Techworld with Nana')
 assert.equal(courses[1].instructor,' Techworld  With Nana ')
})
