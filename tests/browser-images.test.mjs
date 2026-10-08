import test from 'node:test'
import assert from 'node:assert/strict'
import { loadBrowserImage, normalizeImageUrl } from '../src/utils/browserImages.js'

test('accepts extensionless image addresses and unwraps Google image links', () => {
    const direct = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:example&s=10'
    assert.equal(normalizeImageUrl(direct), direct)
    assert.equal(normalizeImageUrl('https://www.google.com/imgres?imgurl=' + encodeURIComponent(direct)), direct)
    assert.throws(() => normalizeImageUrl('https://google.com/search?q=course'), /Google search page/)
    assert.throws(() => normalizeImageUrl('javascript:alert(1)'), /valid image URL/)
})

test('downloads a browser copy, rejects pages and stops oversized downloads', async () => {
    const oldFetch = globalThis.fetch, oldReader = globalThis.FileReader
    globalThis.FileReader = class {
        async readAsDataURL(blob) {
            this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
            this.onload()
        }
    }
    try {
        globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
        assert.deepEqual(await loadBrowserImage('https://example.com/image'), { base64: 'data:image/jpeg;base64,AQID' })
        globalThis.fetch = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })
        await assert.rejects(loadBrowserImage('https://example.com/page'), /not an image/)
        globalThis.fetch = async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } })
        await assert.rejects(loadBrowserImage('https://example.com/large'), /smaller than 2 MB/)
    } finally { globalThis.fetch = oldFetch; globalThis.FileReader = oldReader }
})

test('validates display-only images when their host blocks cross-origin downloads', async () => {
    const oldFetch = globalThis.fetch, oldImage = globalThis.Image
    globalThis.fetch = async () => { throw new TypeError('CORS') }
    globalThis.Image = class {
        naturalWidth = 200
        set src(value) { if (value) queueMicrotask(() => this.onload()) }
    }
    try {
        assert.deepEqual(await loadBrowserImage('https://example.com/image'), { imageSrc: 'https://example.com/image' })
    } finally { globalThis.fetch = oldFetch; globalThis.Image = oldImage }
})
