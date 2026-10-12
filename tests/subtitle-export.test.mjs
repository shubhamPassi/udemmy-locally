import test from 'node:test'
import assert from 'node:assert/strict'
import {exportSubtitles,parseSubtitles,searchTranscript} from '../src/utils/subtitles.js'
test('browser subtitle downloads round-trip timestamps and transcript search retains seek positions',()=>{
    const chunks=[{timestamp:[10.25,12.75],text:'Learn Security'},{timestamp:[20,22],text:'Practice Python'}]
    for(const format of ['srt','vtt']) assert.deepEqual(parseSubtitles(exportSubtitles(chunks,format)),[{start:10.25,end:12.75,text:'Learn Security'},{start:20,end:22,text:'Practice Python'}])
    assert.deepEqual(searchTranscript(chunks,'security'),[chunks[0]])
    assert.equal(searchTranscript(chunks,'absent').length,0)
})
