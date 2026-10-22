import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

test('companion migration and course API retain Drive subtitle sources and resync revisions',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'tutin-resync-db-'))
 try{
  const source=`
   import assert from 'node:assert/strict';
   import express from 'express';
   import {initDatabase,run,closeDatabase,getAll} from './server/database.js';
   import videos from './server/routes/videos.js';
   import courses from './server/routes/courses.js';
   await initDatabase();
   for(const name of ['drive_file_id','drive_folder_id','subtitle_revision','transcript_refresh_at'])assert.ok(getAll('PRAGMA table_info(videos)').some(row=>row.name===name));
   run('INSERT INTO courses (id,title) VALUES (?,?)',['course','Course']);
   run('INSERT INTO modules (id,course_id,title) VALUES (?,?,?)',['module','course','Module']);
   const app=express();app.use(express.json());app.use('/api/videos',videos);app.use('/api/courses',courses);
   const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});
   const base='http://127.0.0.1:'+server.address().port;
   try{
    const created=await fetch(base+'/api/videos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'lesson',courseId:'course',moduleId:'module',title:'Lesson',driveFileId:'video0001',driveFolderId:'folder001',subtitleSources:[{driveFileId:'subtitle01',name:'Lesson.srt'}],subtitleRevision:'one'})});
    assert.equal(created.status,201);
    assert.equal((await fetch(base+'/api/videos/lesson',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({subtitleRevision:'two',transcriptRefreshAt:'two',subtitleSources:[{driveFileId:'subtitle02',name:'Lesson.vtt'}]})})).status,200);
    const content=await(await fetch(base+'/api/courses/course/content')).json();
    assert.equal(content.videos[0].driveFileId,'video0001');assert.equal(content.videos[0].driveFolderId,'folder001');assert.equal(content.videos[0].subtitleRevision,'two');assert.equal(content.videos[0].transcriptRefreshAt,'two');assert.equal(content.videos[0].subtitleSources[0].driveFileId,'subtitle02');
   }finally{await new Promise(resolve=>server.close(resolve));closeDatabase()}
   console.log('isolated companion resync check passed');
  `
  const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{env:{...process.env,APPDATA:directory,XDG_CONFIG_HOME:directory},timeout:30000})
  assert.match(result.stdout,/isolated companion resync check passed/)
 }finally{rmSync(directory,{recursive:true,force:true})}
})
