import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import {storePreviewFrames,loadPreviewFrames,clearPreviewCache,previewCacheKey} from '../src/utils/previewCache.js'
import {warmTimelinePreviews} from '../src/utils/timelinePreview.js'
test('persistent previews survive new player instances and quota eviction preserves newer frames',async()=>{
    await clearPreviewCache()
    const key=previewCacheKey({id:'cached',filePath:'lesson.mp4'},20)
    const frames=[[0,'data:image/jpeg;base64,AAAA'],[10,'data:image/jpeg;base64,BBBB']]
    await storePreviewFrames(key,frames)
    assert.deepEqual(await loadPreviewFrames(key),frames)
    const pool=warmTimelinePreviews({duration:20,initialFrames:await loadPreviewFrames(key),createVideo:()=>assert.fail('A complete cache must not create a decoder'),capture:()=>assert.fail('A complete cache must not decode')})
    await pool.done
    assert.equal(pool.get(15).image,frames[1][1]);pool.dispose()
    const newKey=previewCacheKey({id:'new'},10)
    await storePreviewFrames(newKey,[[0,'data:image/jpeg;base64,CCCC']],60)
    assert.equal((await loadPreviewFrames(newKey)).length,1)
    assert.equal((await loadPreviewFrames(key)).length,0)
    assert.notEqual(key,previewCacheKey({id:'cached',filePath:'lesson.mp4'},30))
})
