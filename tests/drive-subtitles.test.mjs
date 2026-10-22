import test from 'node:test'
import assert from 'node:assert/strict'
import {matchDriveSubtitles,discoverDriveSubtitles,loadDriveSubtitle} from '../src/utils/driveSubtitles.js'

test('Drive subtitles pair with same-folder video names and language suffixes without crossing lesson numbers',()=>{
 const files=[{id:'subtitle01',name:'01 - Introduction.srt'},{id:'english001',name:'01 - Introduction.en.vtt'},{id:'wrong0001',name:'02 - Introduction.srt'},{id:'wrong0002',name:'01 - Introduction.mp4'}]
 assert.deepEqual(matchDriveSubtitles({name:'01 - Introduction.mp4'},files),[{driveFileId:'subtitle01',name:'01 - Introduction.srt'},{driveFileId:'english001',name:'01 - Introduction.en.vtt'}])
 assert.equal(matchDriveSubtitles({name:'01 - Introduction.mp4'},[{name:'01 - Introduction extra.srt'}]).length,0)
})

test('already-imported lessons discover matching Drive subtitle via real filename and parent, without altering lesson',async()=>{
 const previous=globalThis.fetch,video={id:'lesson',driveFileId:'video0001',title:'Introduction',lastWatchedPosition:125}
 try{
  globalThis.fetch=async url=>{assert.equal(new URL(url).searchParams.get('alt'),null);return Response.json({name:'01 - Introduction.mp4',parents:['folder001']})}
  const sources=await discoverDriveSubtitles(video,'test-key',new AbortController().signal,async id=>{assert.equal(id,'folder001');return {files:[{id:'subtitle01',name:'01 - Introduction.srt'}]}})
  assert.equal(sources[0].driveFileId,'subtitle01');assert.equal(video.lastWatchedPosition,125)
  globalThis.fetch=()=>assert.fail('Stored subtitle associations must not rediscover the folder')
  assert.deepEqual(await discoverDriveSubtitles({...video,subtitleSources:sources},'test-key'),sources)
 }finally{globalThis.fetch=previous}
})

test('Drive subtitle downloads parse safe cues, reject denied or oversized content and need credentials',async()=>{
 const previous=globalThis.fetch,signal=new AbortController().signal
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).searchParams.get('alt'),'media');assert.equal(options.credentials,'omit');return new Response('1\n00:00:01,000 --> 00:00:03,500\n<b>Hello</b>\n')}
  assert.deepEqual(await loadDriveSubtitle({driveFileId:'subtitle01'},'test-key',signal),[{start:1,end:3.5,text:'Hello'}])
  globalThis.fetch=async()=>new Response('Denied',{status:403})
  await assert.rejects(loadDriveSubtitle({driveFileId:'subtitle01'},'test-key',signal),/403/)
  globalThis.fetch=async()=>new Response('x'.repeat(2*1024*1024+1))
  await assert.rejects(loadDriveSubtitle({driveFileId:'subtitle01'},'test-key',signal),/2 MB/)
  await assert.rejects(loadDriveSubtitle({driveFileId:'subtitle01'},'',signal),/Connect Google Drive/)
 }finally{globalThis.fetch=previous}
})
