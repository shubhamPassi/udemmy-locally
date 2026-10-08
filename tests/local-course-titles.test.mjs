import test from 'node:test'
import assert from 'node:assert/strict'
import { localCourseTitle, restoreLocalModuleTitle } from '../src/utils/localCourseTitles.js'
import { scanBrowserFolder } from '../src/utils/browserFiles.js'

test('dotted module names keep their text and file names only lose the final extension', () => {
    assert.equal(localCourseTitle('1. Security Essentials'), 'Security Essentials')
    assert.equal(localCourseTitle('10. IaC and GitOps for DevSecOps'), 'IaC and GitOps for DevSecOps')
    assert.equal(localCourseTitle('4. Node.js Security.mp4', true), 'Node.js Security')
    assert.equal(localCourseTitle('Node.js Security'), 'Node.js Security')
})
test('existing numeric headings are repaired without changing custom titles or IDs', () => {
    assert.deepEqual(restoreLocalModuleTitle({id:'same',title:'1',originalTitle:'1. Security Essentials'}),{id:'same',title:'Security Essentials',originalTitle:'1. Security Essentials'})
    const custom={title:'My custom title',originalTitle:'1. Security Essentials'}
    assert.equal(restoreLocalModuleTitle(custom),custom)
})
test('browser folder scans preserve numbered DevSecOps module headings', async () => {
    const lesson={kind:'file',name:'1. Why learn DevSecOps.mp4'}
    const module={kind:'directory',name:'0. Welcome',async *values(){yield lesson}}
    const root={kind:'directory',name:'DevSecOps Bootcamp',async *values(){yield module}}
    const result=await scanBrowserFolder(root)
    assert.equal(result.modules[0].title,'Welcome')
    assert.equal(result.modules[0].subModules[0].videos[0].title,'Why learn DevSecOps')
})
