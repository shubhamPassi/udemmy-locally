import test from 'node:test'
import assert from 'node:assert/strict'
import { driveFailureMessage } from '../src/utils/driveFailure.js'

test('Drive failure messages distinguish access, temporary limits and decoding or streaming', () => {
    assert.match(driveFailureMessage(422), /public access/)
    assert.match(driveFailureMessage(503), /temporarily limiting/)
    assert.match(driveFailureMessage(206), /reachable/)
    for (const status of [206, 403, 422, 429, 503, 502]) assert.match(driveFailureMessage(status), /position is preserved/)
})
