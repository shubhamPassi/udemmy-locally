const key = 'tutin_player_preferences_v1'
let memory = null
function valid(value) {
    const result = {}
    if (Number.isFinite(value?.volume) && value.volume >= 0 && value.volume <= 1) result.volume = value.volume
    if (typeof value?.muted === 'boolean') result.muted = value.muted
    if ([0.25,0.5,0.75,1,1.25,1.5,1.75,2].includes(value?.rate)) result.rate = value.rate
    if (typeof value?.subtitles === 'boolean') result.subtitles = value.subtitles
    return result
}
export function playerPreferences(defaults = {}) {
    let stored = memory
    try { stored = JSON.parse(localStorage.getItem(key)) || memory } catch { /* Storage may be disabled. */ }
    return {volume:0.75,muted:false,rate:1,subtitles:false,...valid(defaults),...valid(stored)}
}
export function savePlayerPreferences(updates) {
    const next = {...playerPreferences(),...valid(updates)}
    const json = JSON.stringify(next)
    if (JSON.stringify(memory) === json) return
    memory = next
    try { localStorage.setItem(key,json) } catch { /* Keep choices for this session. */ }
}
export function rememberMediaPreferences(media) {
    let applying = false
    const restore = () => {
        applying = true
        const saved = playerPreferences()
        media.volume = saved.volume;media.muted = saved.muted
        media.defaultPlaybackRate = saved.rate;media.playbackRate = saved.rate
        applying = false
    }
    const volume = () => { if (!applying) savePlayerPreferences({volume:media.volume,muted:media.muted}) }
    const rate = () => { if (!applying && media.readyState > 0) { if(media.defaultPlaybackRate!==media.playbackRate)media.defaultPlaybackRate=media.playbackRate;savePlayerPreferences({rate:media.playbackRate}) } }
    restore()
    media.addEventListener('loadedmetadata',restore)
    media.addEventListener('volumechange',volume);media.addEventListener('ratechange',rate)
    return () => {media.removeEventListener('loadedmetadata',restore);media.removeEventListener('volumechange',volume);media.removeEventListener('ratechange',rate)}
}
