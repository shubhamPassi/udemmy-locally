import test from 'node:test'
import assert from 'node:assert/strict'
import {directDriveVideoUrl,directDriveFailureMessage} from '../src/utils/directDrivePlayback.js'

test('Drive source URLs connect only to Google and encode browser API keys',()=>{
    const publicUrl=new URL(directDriveVideoUrl('public12345'))
    assert.equal(publicUrl.hostname,'drive.usercontent.google.com')
    const apiUrl=new URL(directDriveVideoUrl('public12345',' key&other=value '))
    assert.equal(apiUrl.origin,'https://www.googleapis.com')
    assert.equal(apiUrl.pathname,'/drive/v3/files/public12345')
    assert.equal(apiUrl.searchParams.get('alt'),'media')
    assert.equal(apiUrl.searchParams.get('key'),'key&other=value')
    assert.equal(apiUrl.searchParams.get('other'),null)
    for(const invalid of [undefined,'bad','https://example.com/video.mp4','../private'])assert.equal(directDriveVideoUrl(invalid,'key'),'')
})

test('direct playback failures explain required access without exposing API keys or inventing tracking',()=>{
    assert.match(directDriveFailureMessage(4,false),/Add a Google API key/)
    assert.match(directDriveFailureMessage(4,true),/browser cannot decode/)
    assert.match(directDriveFailureMessage(2,true),/interrupted/)
    assert.match(directDriveFailureMessage(4,true),/saved position and study history are preserved/)
})
