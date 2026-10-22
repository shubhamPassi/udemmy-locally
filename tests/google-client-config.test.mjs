import test from 'node:test'
import assert from 'node:assert/strict'
import {googleClientId} from '../src/utils/googleClientConfig.js'

test('deployed app provides its public OAuth identifier to fresh profiles without requiring API keys',()=>{
 for(const origin of ['https://udemy.chaigallery.in','https://tutin-learning.passishubham1.workers.dev'])assert.match(googleClientId('',origin),/^\d+-[\w-]+\.apps\.googleusercontent\.com$/)
 assert.equal(googleClientId('','https://other.example'),'')
 assert.equal(googleClientId(' custom-client ','https://udemy.chaigallery.in'),'custom-client')
})
