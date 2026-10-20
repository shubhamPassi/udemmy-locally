import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/drive-video.js'

test('the retired Vercel video endpoint cannot relay or redirect video requests', async () => {
    const previous = globalThis.fetch
    let fetches = 0
    globalThis.fetch = async () => { fetches++; throw Error('Video network request forbidden') }
    try {
        for (const method of ['GET', 'HEAD', 'POST']) {
            const headers = {}, res = {setHeader(name,value){headers[name]=value},status(code){this.code=code;return this},json(value){this.body=value;return this}}
            await handler({method,query:{id:'public12345'},headers:{range:'bytes=0-'}},res)
            assert.equal(res.code,410)
            assert.equal(headers['Cache-Control'],'no-store')
            assert.equal(headers.Location,undefined)
            assert.match(res.body.error,/removed/)
        }
        assert.equal(fetches,0)
    } finally { globalThis.fetch = previous }
})
