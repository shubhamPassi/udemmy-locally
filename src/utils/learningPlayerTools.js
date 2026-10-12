export function createLearningPlayerTools(adapter, now=Date.now) {
    let a=null,b=null,enabled=false,sleepUntil=0,sleepMinutes=0
    return {
        setA(time){a=Math.max(0,time);b=null;enabled=false},
        setB(time){if(a===null||!Number.isFinite(time)||time<=a)throw new Error('Set B after the A position.');b=time},
        toggleLoop(){if(a===null||b===null)throw new Error('Set both A and B first.');enabled=!enabled},
        sleep(minutes){if(![0,15,30,60].includes(minutes))throw new Error('Choose a supported sleep timer.');sleepMinutes=minutes;sleepUntil=minutes?now()+minutes*60000:0},
        tick(){const state=adapter.read();if(sleepUntil&&now()>=sleepUntil){sleepUntil=0;sleepMinutes=0;adapter.pause();return}if(enabled&&state&&(!state.paused||state.ended)&&!state.seeking&&state.time>=b){adapter.beforeLoop?.();adapter.seek(a);if(state.ended)adapter.play?.()}},
        state(){return {a,b,enabled,sleepUntil,sleepMinutes}},
    }
}
export function normalizeChapters(chapters,duration=Infinity) {
    return (Array.isArray(chapters)?chapters:[]).filter(chapter=>Number.isFinite(chapter?.time)&&chapter.time>=0&&chapter.time<duration&&typeof chapter.title==='string'&&chapter.title.trim()).map(chapter=>({time:chapter.time,title:chapter.title.trim().slice(0,100)})).sort((a,b)=>a.time-b.time)
}
