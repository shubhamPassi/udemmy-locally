import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { sanitizeNoteHtml } from '../src/utils/noteSafety.js'
test('notes preserve safe formatting but remove executable markup and unsafe links', () => {
    const {window}=new JSDOM('')
    const result=sanitizeNoteHtml('<p><strong>Study</strong><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a><svg onload="alert(1)"></svg><script>alert(1)</script></p>',window)
    assert.match(result,/<strong>Study<\/strong>/)
    assert.ok(!/onerror|javascript:|<svg|<script/.test(result))
    assert.match(sanitizeNoteHtml('<img src="data:image/png;base64,aGVsbG8=" alt="note">',window),/data:image\/png/)
    window.close()
})
