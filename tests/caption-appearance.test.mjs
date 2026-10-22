import test from 'node:test'
import assert from 'node:assert/strict'
import {balancedCaption,captionAppearance,captionFontSize} from '../src/utils/captionAppearance.js'

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
