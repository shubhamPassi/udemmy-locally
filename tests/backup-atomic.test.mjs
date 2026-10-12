import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBObjectStore } from 'fake-indexeddb'
import { request } from '../src/utils/browserStore.js'
test('backup validation happens before mutation and transaction failure rolls all library changes back', async () => {
    await request('POST','/api/courses',{id:'atomic-course',title:'Original'})
    await assert.rejects(request('POST','/api/data/import',{version:4,courses:[{id:'atomic-course',title:'Changed'}],videos:[{id:'invalid',courseId:'missing'}]}),/missing course/)
    assert.equal((await request('GET','/api/courses/atomic-course')).title,'Original')
    const original=IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put=function(value,...args){if(value.id==='abort-note')throw Error('disk full');return original.call(this,value,...args)}
    try { await assert.rejects(request('POST','/api/data/import',{version:4,courses:[{id:'atomic-course',title:'Changed'}],notes:[{id:'abort-note',courseId:'atomic-course',content:'safe'}]})) }
    finally { IDBObjectStore.prototype.put=original }
    assert.equal((await request('GET','/api/courses/atomic-course')).title,'Original')
    assert.equal(await request('GET','/api/notes/abort-note'),undefined)
})
