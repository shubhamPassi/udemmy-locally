import test from 'node:test'
import assert from 'node:assert/strict'
import {summaryModel,summaryConfiguration,summaryTranscript,requestAISummary} from '../src/utils/summaryInputs.js'

test('summaries use a current free route and reject missing keys or paid model selections',()=>{
 assert.equal(summaryModel('google/gemini-2.0-flash-exp:free'),'openrouter/free')
 assert.equal(summaryModel(undefined),'openrouter/free')
 assert.throws(()=>summaryConfiguration('','openrouter/free'),/API key/)
 assert.throws(()=>summaryConfiguration('test-key','paid-model'),/Paid models/)
})
test('existing generated or imported captions can supply a transcript without video downloads',()=>{
 assert.equal(summaryTranscript({transcript:' Saved text '}),'Saved text')
 assert.equal(summaryTranscript({captionChunks:[{text:'One'},{text:'Two'}]}),'One Two')
 assert.equal(summaryTranscript({},[{text:'Imported'},{text:'captions'}]),'Imported captions')
})
test('AI requests use the free route, return real provider text and expose authentication failures',async()=>{
 let body
 const success=async(url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:' Real summary '}}]}),{status:200})}
 assert.equal(await requestAISummary('Transcript','test-key',undefined,null,success),'Real summary')
 assert.equal(body.model,'openrouter/free')
 await assert.rejects(requestAISummary('Transcript','bad','openrouter/free',null,async()=>new Response('{}',{status:401})),/rejected the API key/)
 let requests=0
 await assert.rejects(requestAISummary('Transcript','key','openrouter/free',null,async()=>{requests++;return new Response('{}',{status:429})},async()=>{}),/rate-limited/)
 assert.equal(requests,3)
})
