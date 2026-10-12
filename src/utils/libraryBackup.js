import { libraryTables } from './libraryDatabase.js'
import { mergeWatchedRanges } from './progressRecords.js'
export function validateLibraryBackup(backup) {
    if (!backup || typeof backup !== 'object' || ![1,2,3,4].includes(backup.version)) throw new Error('Unsupported or invalid backup version')
    for (const table of libraryTables) {
        if (backup[table] === undefined) continue
        if (!Array.isArray(backup[table])) throw new Error(`Invalid ${table} in backup`)
        const ids = new Set()
        for (const row of backup[table]) {
            if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id || row.id.length > 200 || ids.has(row.id)) throw new Error(`Invalid or duplicate ${table} record`)
            ids.add(row.id)
            for (const key of ['courseId','moduleId','videoId']) if (row[key] !== undefined && row[key] !== null && typeof row[key] !== 'string') throw new Error(`Invalid ${key} in ${table}`)
            for (const key of ['duration','lastWatchedPosition']) if (row[key] !== undefined && (!Number.isFinite(row[key]) || row[key] < 0)) throw new Error(`Invalid ${key} in ${table}`)
            if (table === 'notes' && row.content !== undefined && typeof row.content !== 'string') throw new Error('Invalid note content')
        }
    }
    if (backup.progress !== undefined) validateProgress(backup.progress)
    return backup
}
export function validateProgress(progress) {
    if (!progress || progress.version !== 1) throw new Error('Invalid progress backup')
    for (const group of ['bookmarks','coverage','sessions','subtitles','chapters','preferences']) if (progress[group] !== undefined && (!progress[group] || Array.isArray(progress[group]) || typeof progress[group] !== 'object')) throw new Error(`Invalid ${group} in backup`)
    for (const [key, ranges] of Object.entries(progress.coverage || {})) if (!key.startsWith('tutin_coverage_') || !Array.isArray(ranges) || ranges.some(range => !Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] < 0 || range[1] <= range[0])) throw new Error('Invalid watched ranges in backup')
    for (const [key, record] of Object.entries(progress.sessions || {})) if (!key.startsWith('tutin_study_session_') || record?.version !== 1 || !record.hours || Object.entries(record.hours).some(([hour, seconds]) => !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(hour) || !Number.isFinite(seconds) || seconds < 0)) throw new Error('Invalid study history in backup')
    for (const [key, record] of Object.entries(progress.bookmarks || {})) if (!key.startsWith('tutin_playback_') || !record || (record.position !== undefined && (!Number.isFinite(record.position) || record.position < 0))) throw new Error('Invalid playback bookmark in backup')
    for (const [key, cues] of Object.entries(progress.subtitles || {})) if (!key.startsWith('tutin_subtitles_') || !Array.isArray(cues) || cues.some(cue => !Number.isFinite(cue?.start) || cue.start < 0 || !Number.isFinite(cue.end) || cue.end <= cue.start || typeof cue.text !== 'string')) throw new Error('Invalid subtitles in backup')
    for(const [key,chapters] of Object.entries(progress.chapters||{}))if(!key.startsWith('tutin_chapters_')||!Array.isArray(chapters)||chapters.some(chapter=>!Number.isFinite(chapter?.time)||chapter.time<0||typeof chapter.title!=='string'||!chapter.title.trim()))throw new Error('Invalid chapters in backup')
}
export function mergedProgressEntries(current, incoming) {
    const values = {}
    if (!incoming) return values
    validateProgress(incoming)
    for (const [key, value] of Object.entries(incoming.bookmarks || {})) {
        const previous = current.bookmarks?.[key]
        values[key] = JSON.stringify(previous?.updatedAt > value.updatedAt ? previous : value)
    }
    for (const [key, ranges] of Object.entries(incoming.coverage || {})) values[key] = JSON.stringify(mergeWatchedRanges([...(current.coverage?.[key] || []), ...ranges], 0, 0))
    for (const [key, record] of Object.entries(incoming.sessions || {})) {
        const hours = { ...(current.sessions?.[key]?.hours || {}) }
        for (const [hour, seconds] of Object.entries(record.hours)) hours[hour] = Math.max(hours[hour] || 0, seconds)
        values[key] = JSON.stringify({ ...record, hours })
    }
    for (const [key, cues] of Object.entries(incoming.subtitles || {})) values[key] = JSON.stringify(cues)
    for(const [key,chapters] of Object.entries(incoming.chapters||{})){const merged=new Map([...(current.chapters?.[key]||[]),...chapters].map(chapter=>[JSON.stringify([chapter.time,chapter.title]),chapter]));values[key]=JSON.stringify([...merged.values()].sort((a,b)=>a.time-b.time))}
    const preferences = incoming.preferences || {}
    if ([0,15,30,45,60,90,120].includes(Number(preferences.tutin_daily_goal)) && preferences.tutin_daily_goal !== undefined) values.tutin_daily_goal = String(preferences.tutin_daily_goal)
    if (['true','false'].includes(preferences.tutin_hide_upcoming_durations)) values.tutin_hide_upcoming_durations = preferences.tutin_hide_upcoming_durations
    return values
}
