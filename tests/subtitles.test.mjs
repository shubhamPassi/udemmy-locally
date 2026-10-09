import test from 'node:test'
import assert from 'node:assert/strict'
import {parseSubtitles} from '../src/utils/subtitles.js'
test('SRT and VTT timestamps support multiline safe text and cue settings',()=>{
 const srt='1\n00:00:01,500 --> 00:00:03,000\nHello\nworld\n\n2\n00:00:04,000 --> 00:00:05,000\n<b>Safe text</b>'
 assert.deepEqual(parseSubtitles(srt),[{start:1.5,end:3,text:'Hello\nworld'},{start:4,end:5,text:'Safe text'}])
 assert.deepEqual(parseSubtitles('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nCaption'),[{start:1,end:2.5,text:'Caption'}])
 assert.throws(()=>parseSubtitles('not captions'),/No valid/)
})
