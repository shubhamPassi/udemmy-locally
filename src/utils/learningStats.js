export function learningStats(courses, videos, today = new Date()) {
    const days = Array.from({ length:7 }, (_,index) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index)
        return { date, label:date.toLocaleDateString(undefined,{weekday:'short'}), count:0 }
    })
    const byCourse = new Map()
    let savedSeconds=0, knownSeconds=0
    for (const video of videos) {
        const own=byCourse.get(video.courseId)||[]; own.push(video); byCourse.set(video.courseId,own)
        const duration=Math.max(0,Number(video.duration)||0)
        knownSeconds+=duration
        const position=Math.max(0,Number(video.lastWatchedPosition)||0)
        savedSeconds+=video.isCompleted ? duration : duration ? Math.min(duration,position) : position
        if(video.lastWatchedAt) {
            const day=days.find(day=>day.date.toDateString()===new Date(video.lastWatchedAt).toDateString())
            if(day)day.count++
        }
    }
    const rows=courses.map(course=>{
        const own=byCourse.get(course.id)||[]
        const total=own.length || Number(course.totalVideos)||0
        const completed=own.length ? own.filter(video=>video.isCompleted).length : Math.min(total,Number(course.completedVideos)||0)
        const active=own.some(video=>video.lastWatchedPosition>0 || video.lastWatchedAt) || completed>0
        const lastVideo=own.filter(video=>video.lastWatchedAt).sort((a,b)=>new Date(b.lastWatchedAt)-new Date(a.lastWatchedAt))[0]
        return {...course,total,completed,active,percent:total?completed/total*100:0,lastVideo}
    })
    const total=rows.reduce((sum,row)=>sum+row.total,0),completed=rows.reduce((sum,row)=>sum+row.completed,0)
    const finished=rows.filter(row=>row.total>0&&row.completed===row.total).length
    const active=rows.filter(row=>row.active&&row.completed<row.total).length
    const continueCourse=[...rows].filter(row=>row.active&&row.completed<row.total).sort((a,b)=>new Date(b.lastVideo?.lastWatchedAt||0)-new Date(a.lastVideo?.lastWatchedAt||0))[0]
    return {rows,total,completed,finished,active,notStarted:Math.max(0,rows.length-finished-active),savedSeconds,knownSeconds,days,percent:total?completed/total*100:0,continueCourse}
}
export function learningTime(seconds) {
    const minutes=Math.floor(Math.max(0,seconds)/60)
    return minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`
}
