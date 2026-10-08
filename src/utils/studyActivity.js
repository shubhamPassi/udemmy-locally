export const studyColors = ['#3b82f6', '#22b8cf', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#94a3b8']
export function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function moveDay(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()+amount, 12)
}
export function studyActivity(records, courses, endDate, periodDays) {
    const length = periodDays === 1 ? 1 : 7
    const dates = Array.from({length}, (_,index) => moveDay(endDate, index-length+1))
    const keys = dates.map(dayKey)
    const previousKeys = dates.map(date => dayKey(moveDay(date,-length)))
    const bins = Array.from({length:length===1?24:7}, (_,index) => ({index,date:dates[length===1?0:index],seconds:0,courses:{}}))
    const totals = new Map()
    let previousSeconds=0
    for(const record of records) {
        for(const [hour,seconds] of Object.entries(record.hours||{})) {
            if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(hour)||!Number.isFinite(seconds)||seconds<=0)continue
            const date=hour.slice(0,10), dayIndex=keys.indexOf(date)
            if(previousKeys.includes(date))previousSeconds+=seconds
            if(dayIndex<0)continue
            const id=record.courseId||'unknown'
            const bin=bins[length===1?Number(hour.slice(11)):dayIndex]
            bin.seconds+=seconds
            bin.courses[id]=(bin.courses[id]||0)+seconds
            totals.set(id,(totals.get(id)||0)+seconds)
        }
    }
    const rows=[...totals].sort((a,b)=>b[1]-a[1]).map(([id,seconds])=>{
        const courseIndex=courses.findIndex(course=>course.id===id)
        return {id,seconds,title:courses[courseIndex]?.title||'Other study time',color:studyColors[courseIndex<0?studyColors.length-1:courseIndex%studyColors.length]}
    })
    const totalSeconds=bins.reduce((sum,bin)=>sum+bin.seconds,0)
    const peak=bins.reduce((best,bin)=>bin.seconds>best.seconds?bin:best,bins[0])
    return {dates,bins,rows,totalSeconds,previousSeconds,averageSeconds:totalSeconds/length,activeDays:length===1?(totalSeconds?1:0):bins.filter(bin=>bin.seconds>0).length,peak}
}

export function studyConsistency(records, today = new Date()) {
    const days = new Map()
    for (const record of records) for (const [hour, seconds] of Object.entries(record.hours || {})) {
        if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(hour) || !Number.isFinite(seconds) || seconds <= 0) continue
        const key = hour.slice(0, 10)
        if (key > dayKey(today)) continue
        days.set(key, (days.get(key) || 0) + seconds)
    }
    let cursor = days.has(dayKey(today)) ? moveDay(today, 0) : moveDay(today, -1)
    let currentStreak = 0, bestStreak = 0, run = 0, previous = null
    while (days.has(dayKey(cursor))) { currentStreak++; cursor = moveDay(cursor, -1) }
    for (const key of [...days.keys()].sort()) {
        const [year, month, day] = key.split('-').map(Number)
        const date = new Date(year, month - 1, day, 12)
        run = previous && dayKey(moveDay(previous, 1)) === key ? run + 1 : 1
        bestStreak = Math.max(bestStreak, run)
        previous = date
    }
    return { currentStreak, bestStreak, studiedDays: days.size, totalSeconds: [...days.values()].reduce((sum, seconds) => sum + seconds, 0) }
}

export function studyReportCsv(activity, periodDays) {
    function cell(value) {
        let text = String(value)
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
        return '"' + text.replace(/"/g, '""') + '"'
    }
    const rows = [['Date', 'Hour', 'Course', 'Study time', 'Seconds']]
    for (const bin of activity.bins) for (const course of activity.rows) {
        const seconds = bin.courses[course.id]
        if (!seconds) continue
        const rounded = Math.round(seconds)
        const duration = `${Math.floor(rounded / 3600)}:${String(Math.floor(rounded % 3600 / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
        rows.push([dayKey(bin.date), periodDays === 1 ? `${String(bin.index).padStart(2, '0')}:00` : 'All day', course.title, duration, rounded])
    }
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
