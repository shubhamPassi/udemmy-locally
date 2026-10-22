import test from 'node:test'
import assert from 'node:assert/strict'
import {balancedCaption,captionAppearance,captionFontSize,captionPlacement} from '../src/utils/captionAppearance.js'

test('captions balance long sentences without orphaned words or changing spoken text',()=>{
 const text="This is one of my biggest passions and I'm so glad that you're here."
 const result=balancedCaption(text),lines=result.split('\n')
 assert.equal(lines.length,2);assert.equal(result.replace(/\s+/g,' '),text)
 assert.ok(lines.every(line=>line.split(' ').length>=4))
 assert.equal(balancedCaption('A short caption.'),'A short caption.')
})
test('subtitle sizes adapt to small players and fullscreen without becoming oversized',()=>{
 assert.equal(captionAppearance(null).size,22)
 assert.equal(captionAppearance({size:26,background:'dark'}).size,22)
 assert.equal(captionAppearance({size:26,version:2}).size,26)
 assert.equal(captionAppearance({size:18,background:'transparent'}).background,'transparent')
 assert.ok(captionFontSize(22,260)<captionFontSize(22,540))
 assert.ok(captionFontSize(22,1080)>captionFontSize(22,540))
 assert.ok(captionFontSize(22,2160)<=28)
})


test('visible controls anchor multiline captions above the actual bar; hidden controls keep bottom placement',()=>{
 const frame={top:100,width:960,height:540}
 const shown=captionPlacement(frame,540,true,1920,1080)
 assert.equal(shown.snapToLines,false);assert.equal(shown.lineAlign,'end')
 assert.ok(100+shown.line/100*540<=540-12)
 const taller=captionPlacement(frame,500,true,1920,1080)
 assert.ok(taller.line<shown.line)
 assert.deepEqual(captionPlacement(frame,540,false),{snapToLines:true,line:-1,lineAlign:'start'})
 const letterboxed=captionPlacement({top:0,width:960,height:720},600,true,1920,1080)
 assert.ok(90+letterboxed.line/100*540<=588)
})
