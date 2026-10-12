import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { openLibraryDatabase } from '../src/utils/libraryDatabase.js'
import { writeProgressValue, readProgressValue, flushProgressStorage } from '../src/utils/progressStorage.js'
test('progress remains durable in IndexedDB even when localStorage is exhausted', async () => {
    globalThis.localStorage = { setItem() { throw Error('quota') }, getItem() { return null }, removeItem() {} }
    writeProgressValue('tutin_study_session_durable', JSON.stringify({version:1,hours:{'2026-10-12T12':60}}))
    await flushProgressStorage()
    const db = await openLibraryDatabase()
    const saved = await new Promise(resolve => { const r=db.transaction('settings').objectStore('settings').get('progress:tutin_study_session_durable');r.onsuccess=()=>resolve(r.result) })
    assert.equal(JSON.parse(saved.value).hours['2026-10-12T12'],60)
    assert.equal(readProgressValue('tutin_study_session_durable'),saved.value)
})
test('overlapping tabs cannot overwrite disjoint watched ranges with a last-writer update',async()=>{
    writeProgressValue('tutin_coverage_shared',JSON.stringify([[0,10]]))
    writeProgressValue('tutin_coverage_shared',JSON.stringify([[20,30]]))
    await flushProgressStorage()
    assert.deepEqual(JSON.parse(readProgressValue('tutin_coverage_shared')),[[0,10],[20,30]])
})
