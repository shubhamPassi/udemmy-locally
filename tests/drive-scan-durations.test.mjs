import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtemp,unlink,rmdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

test('public Drive course scan enriches nested lessons and totals from account metadata',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tutin-drive-duration-')),output=join(directory,'scanner.cjs'),previous=globalThis.fetch
 try{
  await build({stdin:{contents:"export {scanPublicDriveFolder} from './src/utils/googleDrive.js'",resolveDir:resolve('.'),loader:'js'},bundle:true,platform:'node',format:'cjs',outfile:output,plugins:[{name:'isolate',setup(build){
   build.onLoad({filter:/[\\/]api\.js$/},()=>({contents:'export const IS_BROWSER_MODE=true'}))
   build.onLoad({filter:/[\\/]driveAuthorization\.js$/},()=>({contents:'export const driveSession=()=>({token:"test-token",expiresAt:Date.now()+3600000});export const restoreDriveAuthorization=async()=>null'}))
  }}]})
  let mediaRequests=0
  globalThis.fetch=async url=>{
   const parsed=new URL(url,'https://app.test')
   if(parsed.searchParams.has('alt'))mediaRequests++
   if(parsed.pathname==='/api/public-import')return Response.json(parsed.searchParams.get('id')==='rootfolder01'?{name:'Course',files:[{id:'firstvideo01',name:'First.mp4',mimeType:'video/mp4'},{id:'childfolder01',name:'Section 2',mimeType:'application/vnd.google-apps.folder'}]}:{name:'Section 2',files:[{id:'secondvideo01',name:'Second.mp4',mimeType:'video/mp4'},{id:'pendingvideo01',name:'Pending.mp4',mimeType:'video/mp4'}]})
   assert.equal(parsed.origin,'https://www.googleapis.com')
   return Response.json({files:parsed.searchParams.get('q').includes('rootfolder01')?[{id:'firstvideo01',videoMediaMetadata:{durationMillis:'60000'}}]:[{id:'secondvideo01',videoMediaMetadata:{durationMillis:'120000'}}]})
  }
  const {scanPublicDriveFolder}=createRequire(import.meta.url)(output)
  const course=await scanPublicDriveFolder('rootfolder01',true)
  assert.equal(course.totalVideos,3);assert.equal(course.totalDuration,180)
  assert.equal(course.modules[0].totalDuration,60);assert.equal(course.modules[1].totalDuration,120)
  assert.equal(course.modules[1].videos[1].duration,120)
  assert.equal(mediaRequests,0)
 }finally{globalThis.fetch=previous;await unlink(output).catch(()=>{});await rmdir(directory)}
})
