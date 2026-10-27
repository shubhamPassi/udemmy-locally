import test from 'node:test'
import assert from 'node:assert/strict'

test('player choices survive source changes, new media elements and a fresh module session',async()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage=new Map()
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}})
 try{
  const prefs=await import('../src/utils/playerPreferences.js?initial')
  assert.equal(prefs.playerPreferences().subtitles,false)
  class Media extends EventTarget {volume=1;muted=false;playbackRate=1;defaultPlaybackRate=1;readyState=4;currentTime=42}
  const first=new Media(),stop=prefs.rememberMediaPreferences(first)
  first.volume=0.35;first.muted=true;first.dispatchEvent(new Event('volumechange'))
  first.playbackRate=1.75;first.dispatchEvent(new Event('ratechange'));prefs.savePlayerPreferences({subtitles:true})
  first.readyState=0;first.playbackRate=1;first.dispatchEvent(new Event('ratechange'))
  first.readyState=4;first.dispatchEvent(new Event('loadedmetadata'))
  assert.equal(first.playbackRate,1.75);assert.equal(first.currentTime,42)
  stop()
  const fresh=await import('../src/utils/playerPreferences.js?restart'),second=new Media()
  const cleanup=fresh.rememberMediaPreferences(second)
  assert.equal(second.volume,0.35);assert.equal(second.muted,true);assert.equal(second.playbackRate,1.75);assert.equal(fresh.playerPreferences().subtitles,true)
  cleanup()
  storage.set('tutin_player_preferences_v1',JSON.stringify({volume:99,rate:-2,muted:'yes',subtitles:'true'}))
  const invalid=await import('../src/utils/playerPreferences.js?invalid')
  assert.deepEqual(invalid.playerPreferences(),{volume:0.75,muted:false,rate:1,subtitles:false})
 }finally{if(saved)Object.defineProperty(globalThis,'localStorage',saved);else delete globalThis.localStorage}
})
