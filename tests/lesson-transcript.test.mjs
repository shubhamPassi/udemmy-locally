import test from 'node:test'
import assert from 'node:assert/strict'
import {activeTranscriptIndex,normalizeTranscript,needsTranscriptRefresh} from '../src/utils/lessonTranscript.js'

test('transcript follows playback, backward seeks and gaps using real timed cue boundaries',()=>{
 const cues=normalizeTranscript([{text:'Second',timestamp:[12,16]},{start:1,end:5,text:'<b>First</b>'},{start:2,end:1,text:'Bad'}])
 assert.equal(cues.length,2);assert.equal(cues[0].text,'First')
 assert.equal(activeTranscriptIndex(cues,0),-1);assert.equal(activeTranscriptIndex(cues,2),0);assert.equal(activeTranscriptIndex(cues,5),-1);assert.equal(activeTranscriptIndex(cues,13),1);assert.equal(activeTranscriptIndex(cues,2),0)
})
test('resync invalidates only automated transcripts and keeps manually uploaded captions',()=>{
 assert.equal(needsTranscriptRefresh({subtitleRevision:'new'},[{start:1,end:2,text:'Manual'}]),false)
 assert.equal(needsTranscriptRefresh({subtitleRevision:'new'},[{sourceProvider:'drive',sourceRevision:'old'}]),true)
 assert.equal(needsTranscriptRefresh({transcriptRefreshAt:'new'},[{sourceProvider:'youtube',sourceRevision:'new'}]),false)
})
