import StudyGoal from '../components/settings/StudyGoal'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, BookOpen, RefreshCw, ChevronLeft, ChevronRight, ArrowDown, ArrowUp, Download, Flame, Trophy, CalendarDays } from 'lucide-react'
import { getAllCourses, getCourseContent } from '../utils/db'
import * as api from '../utils/api'
import { withPlaybackBookmark } from '../utils/playbackBookmarks'
import { learningStats } from '../utils/learningStats'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { readStudySessions, studyTimeLabel } from '../utils/studyTime'
import { dayKey, moveDay, studyActivity, studyConsistency, studyReportCsv } from '../utils/studyActivity'

const card = 'min-w-0 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-neutral-900'
const muted = 'text-gray-500 dark:text-neutral-400'
const hourLabel = hour => hour === 0 ? '12 am' : hour < 12 ? `${hour} am` : hour === 12 ? '12 pm' : `${hour-12} pm`

function StudyChart({ activity, periodDays, onSelect, selectedHour }) {
    const max = Math.max(60, ...activity.bins.map(bin => bin.seconds))
    const step = max <= 300 ? 60 : max <= 1800 ? 300 : max <= 7200 ? 1800 : 3600
    const ceiling = Math.ceil(max / step) * step
    return <div className="relative mt-7 pl-0 pr-9 sm:pr-11">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-44 pr-9 sm:pr-11">
            {[1, 0.5, 0].map(level => <div key={level} className="absolute left-0 right-9 sm:right-11 border-t border-dashed border-gray-200 dark:border-white/10" style={{ top: `${(1-level)*100}%` }}><span className={`absolute -right-9 sm:-right-11 -top-2 text-[10px] ${muted}`}>{studyTimeLabel(ceiling*level)}</span></div>)}
        </div>
        <div className="relative grid h-44 items-end gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${activity.bins.length}, minmax(0, 1fr))` }}>
            {activity.bins.map(bin => {
                const label = periodDays === 1 ? hourLabel(bin.index) : bin.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                return <button key={bin.index} onClick={() => onSelect(bin)} aria-label={`${label}: ${studyTimeLabel(bin.seconds)} studied`} aria-pressed={periodDays === 1 ? selectedHour === bin.index : undefined} title={`${label}: ${studyTimeLabel(bin.seconds)} studied`} className="group flex h-full min-w-0 items-end justify-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                    <span className={`flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-sm ${selectedHour === bin.index && periodDays === 1 ? 'ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-neutral-900' : ''}`} style={{ height: `${bin.seconds/ceiling*100}%`, minHeight: bin.seconds ? 3 : 0 }}>
                        {activity.rows.filter(row => bin.courses[row.id]).map(row => <span key={row.id} className="block w-full shrink-0" style={{ backgroundColor: row.color, height: `${bin.courses[row.id]/bin.seconds*100}%` }} />)}
                    </span>
                </button>
            })}
        </div>
        {periodDays === 1 ? <div aria-hidden="true" className={`mt-3 grid grid-cols-4 text-[10px] sm:text-xs ${muted}`}><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span></div> : <div aria-hidden="true" className={`mt-3 grid grid-cols-7 text-center text-[10px] sm:text-xs ${muted}`}>{activity.dates.map(date => <span key={dayKey(date)}>{date.toLocaleDateString(undefined, { weekday: 'short' })}<span className="block mt-1 text-[10px] opacity-70">{date.getDate()}</span></span>)}</div>}
    </div>
}

export default function StatisticsPage() {
    const [courses, setCourses] = useState([]), [videos, setVideos] = useState([]), [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false)
    const [periodDays, setPeriodDays] = useState(1), [endDate, setEndDate] = useState(() => moveDay(new Date(), 0))
    const [selectedHour, setSelectedHour] = useState(null)
    async function load() {
        setRefreshing(true); setError(''); setSessions(readStudySessions())
        try {
            const [library, browserLessons] = await Promise.all([getAllCourses(), api.IS_BROWSER_MODE ? api.get('/api/videos') : Promise.resolve(null)])
            const lessons = browserLessons || (await Promise.all(library.map(course => getCourseContent(course.id)))).flatMap(content => content.videos || [])
            setCourses(library); setVideos(lessons.map(withPlaybackBookmark))
        } catch (err) { setError(err.message || 'Could not load your statistics.') }
        finally { setLoading(false); setRefreshing(false) }
    }
    useEffect(() => {
        load()
        function updateSessions() { if (!document.hidden) setSessions(readStudySessions()) }
        function onStorage(event) { if (event.key?.startsWith('tutin_study_session_') || event.key === 'tutin_progress_reset' || event.key === null) updateSessions() }
        function onVisible() { if (!document.hidden) load() }
        const timer = setInterval(updateSessions, 15000)
        window.addEventListener('storage', onStorage)
        document.addEventListener('visibilitychange', onVisible)
        return () => { clearInterval(timer); window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisible) }
    }, [])
    const stats = useMemo(() => learningStats(courses, videos), [courses, videos])
    const activity = useMemo(() => studyActivity(sessions, courses, endDate, periodDays), [sessions, courses, endDate, periodDays])
    const todayActivity=useMemo(()=>studyActivity(sessions,courses,new Date(),1),[sessions,courses])
    const consistency = useMemo(() => studyConsistency(sessions), [sessions])
    const selectedRows = selectedHour === null ? [] : activity.rows.filter(row => activity.bins[selectedHour]?.courses[row.id]).map(row => ({ ...row, seconds: activity.bins[selectedHour].courses[row.id] }))
    const isToday = dayKey(endDate) === dayKey(new Date())
    const dateTitle = periodDays === 1 ? isToday ? 'Today' : endDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : `${activity.dates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    const difference = activity.totalSeconds-activity.previousSeconds
    function changeDate(amount) { setEndDate(date => moveDay(date, amount)); setSelectedHour(null) }
    function selectBin(bin) {
        if (periodDays === 7) { setPeriodDays(1); setEndDate(bin.date); setSelectedHour(null) }
        else setSelectedHour(bin.index)
    }
    function exportReport() {
        const url = URL.createObjectURL(new Blob([studyReportCsv(activity, periodDays)], { type: 'text/csv;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url; link.download = `study-${periodDays === 1 ? 'day' : 'week'}-${dayKey(endDate)}.csv`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    if (loading) return <LoadingSpinner message="Loading your learning overview…" />
    return <div className="mx-auto max-w-5xl py-4 sm:py-6 space-y-5 text-gray-900 dark:text-white">
        <header className="flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Learning Statistics</h1><p className={`mt-1 text-sm ${muted}`}>Your study time, one day at a time.</p></div>
            <div className="flex items-center gap-1"><button onClick={load} disabled={refreshing} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-500 hover:bg-blue-500/10 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button><button onClick={exportReport} disabled={!activity.totalSeconds || loading || !!error} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-500 hover:bg-blue-500/10 disabled:opacity-40"><Download className="h-4 w-4" />Export CSV</button></div>
        </header>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-500">{error}</p>}
        {!error && courses.length === 0 ? <section className={`${card} p-8 text-center`}><BookOpen className="mx-auto mb-4 h-10 w-10 text-blue-500" /><h2 className="text-xl font-semibold">Your learning starts here</h2><p className={`mt-2 text-sm ${muted}`}>Add a course to start tracking your study time.</p><Link to="/" className="mt-5 inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm text-white">Go to courses</Link></section> : !error && <>
            <section className={card}><div className="px-5 sm:px-7 pt-5"><h2 className="font-semibold">Study consistency</h2><p className={`mt-1 text-xs ${muted}`}>Based on your recorded study days.</p></div><div className="grid grid-cols-3 gap-2 px-5 sm:px-7 py-5">{[
                { label: 'Current streak', value: `${consistency.currentStreak} ${consistency.currentStreak === 1 ? 'day' : 'days'}`, icon: Flame, help: 'Consecutive study days ending today or yesterday.' },
                { label: 'Best streak', value: `${consistency.bestStreak} ${consistency.bestStreak === 1 ? 'day' : 'days'}`, icon: Trophy, help: 'Your longest run of consecutive recorded study days.' },
                { label: 'Total studied', value: studyTimeLabel(consistency.totalSeconds), icon: Clock, help: `Across ${consistency.studiedDays} recorded study days.` },
            ].map(({label,value,icon:Icon,help}) => <div key={label} title={help}><Icon className="h-4 w-4 text-blue-500" /><p className="mt-2 text-lg sm:text-2xl font-semibold tabular-nums">{value}</p><p className={`mt-1 text-[10px] sm:text-xs ${muted}`}>{label}</p></div>)}</div></section>
            <StudyGoal seconds={todayActivity.totalSeconds} />
            <div className="mx-auto flex max-w-xs rounded-xl bg-gray-200/70 dark:bg-white/10 p-1" aria-label="Study time period">{[{ label: 'Day', days: 1 }, { label: 'Week', days: 7 }].map(option => <button key={option.days} aria-pressed={periodDays === option.days} onClick={() => { setPeriodDays(option.days); setSelectedHour(null) }} className={`flex-1 rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${periodDays === option.days ? 'bg-white dark:bg-neutral-600 text-gray-900 dark:text-white shadow-sm' : muted}`}>{option.label}</button>)}</div>
            <section className={card}>
                <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-white/10 px-4 sm:px-6 py-3">
                    <button aria-label={`Previous ${periodDays === 1 ? 'day' : 'week'}`} onClick={() => changeDate(-periodDays)} className="rounded-lg p-2 text-blue-500 hover:bg-blue-500/10"><ChevronLeft className="h-5 w-5" /></button>
                    <div className="min-w-0 text-center"><h2 className="text-sm font-medium">{dateTitle}</h2><label className={`mt-1 inline-flex items-center gap-1 text-xs ${muted}`}><CalendarDays className="h-3 w-3" /><span className="sr-only">Choose date</span><input aria-label="Choose date" type="date" value={dayKey(endDate)} max={dayKey(new Date())} onChange={event => { const value = event.target.value; if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > dayKey(new Date())) return; const [year, month, day] = value.split('-').map(Number); setEndDate(new Date(year, month-1, day, 12)); setSelectedHour(null) }} className="w-32 rounded bg-transparent px-1 text-xs [color-scheme:light] dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-blue-500" /></label></div>
                    <button aria-label={`Next ${periodDays === 1 ? 'day' : 'week'}`} disabled={isToday} onClick={() => { setEndDate(date => { const next = moveDay(date, periodDays), today = moveDay(new Date(), 0); return next > today ? today : next }); setSelectedHour(null) }} className="rounded-lg p-2 text-blue-500 hover:bg-blue-500/10 disabled:opacity-25"><ChevronRight className="h-5 w-5" /></button>
                </div>
                <div className="p-5 sm:p-7">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div><p className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wider ${muted}`}><Clock className="h-3.5 w-3.5" />Study time</p><p className="mt-2 text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums">{studyTimeLabel(activity.totalSeconds)}</p>{periodDays === 7 && <p className={`mt-2 text-sm ${muted}`}>{studyTimeLabel(activity.averageSeconds)} daily average</p>}</div>
                        <div className="text-sm">{activity.previousSeconds > 0 ? <p className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">{difference < 0 ? <ArrowDown className="h-4 w-4" /> : difference > 0 ? <ArrowUp className="h-4 w-4" /> : null}{difference === 0 ? 'Same as' : `${studyTimeLabel(Math.abs(difference))} ${difference < 0 ? 'less' : 'more'} than`} {periodDays === 1 ? 'the previous day' : 'the previous week'}</p> : <p className={muted}>Actual video playback</p>}{!isToday && <button onClick={() => { setEndDate(moveDay(new Date(), 0)); setSelectedHour(null) }} className="mt-2 text-blue-500 hover:underline">Back to today</button>}</div>
                    </div>
                    <StudyChart activity={activity} periodDays={periodDays} onSelect={selectBin} selectedHour={selectedHour} />
                    {activity.totalSeconds === 0 && <p className={`mt-4 text-sm ${muted}`}>No recorded study time for this {periodDays === 1 ? 'day' : 'week'} yet.</p>}
                    {periodDays === 1 && selectedHour !== null && <div className="mt-4 rounded-xl bg-gray-50 dark:bg-white/5 p-4"><p role="status" className="text-sm font-medium">{hourLabel(selectedHour)} – {hourLabel((selectedHour+1)%24)} · {studyTimeLabel(activity.bins[selectedHour].seconds)} studied</p>{selectedRows.length ? <ul className="mt-2 space-y-2">{selectedRows.map(row => <li key={row.id} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="min-w-0 flex-1 truncate" title={row.title}>{row.title}</span><span>{studyTimeLabel(row.seconds)}</span></li>)}</ul> : <p className={`mt-2 text-xs ${muted}`}>No study time recorded during this hour.</p>}</div>}
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">{activity.rows.slice(0, 3).map(row => <div key={row.id} className="min-w-0"><p className="flex items-center gap-2 text-xs sm:text-sm"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="truncate" title={row.title}>{row.title}</span></p><p className="mt-1 pl-4 text-lg font-medium tabular-nums">{studyTimeLabel(row.seconds)}</p></div>)}</div>
                </div>
                <div className="grid grid-cols-2 border-t border-gray-200 dark:border-white/10 divide-x divide-gray-200 dark:divide-white/10">
                    <div className="p-4 sm:px-7"><p className={`text-xs ${muted}`}>{periodDays === 1 ? 'Most active hour' : 'Most active day'}</p><p className="mt-1 text-sm font-medium">{activity.totalSeconds ? periodDays === 1 ? hourLabel(activity.peak.index) : activity.peak.date.toLocaleDateString(undefined, { weekday: 'long' }) : '—'}</p></div>
                    <div className="p-4 sm:px-7"><p className={`text-xs ${muted}`}>{periodDays === 1 ? 'Courses studied' : 'Days studied'}</p><p className="mt-1 text-sm font-medium">{periodDays === 1 ? activity.rows.length : `${activity.activeDays} of 7`}</p></div>
                </div>
            </section>
            {activity.rows.length > 0 && <section className={card}><h2 className="px-5 sm:px-7 pt-5 font-semibold">Study breakdown</h2><div className="mt-2 divide-y divide-gray-200 dark:divide-white/10">{activity.rows.map(row => <div key={row.id} className="flex items-center gap-3 px-5 sm:px-7 py-4"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={row.title}>{row.title}</p><div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"><div className="h-full rounded-full" style={{ backgroundColor: row.color, width: `${row.seconds/activity.totalSeconds*100}%` }} /></div></div><span className="shrink-0 text-sm tabular-nums">{studyTimeLabel(row.seconds)}</span></div>)}</div></section>}

            <section className={`${card} p-5 sm:px-7`}>
                <div className="flex flex-wrap items-center gap-4"><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Overall progress</h2><p className={`mt-1 text-xs ${muted}`}>All-time lesson completion</p></div><p className="text-2xl font-semibold tabular-nums">{Math.round(stats.percent)}%</p></div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"><div className="h-full rounded-full bg-blue-500" style={{ width: `${stats.percent}%` }} /></div>
                <div className={`mt-3 flex flex-wrap justify-between gap-2 text-xs ${muted}`}><span>{stats.completed} of {stats.total} lessons finished</span><span>{stats.finished} of {courses.length} courses finished</span></div>
            </section>
            <p className={`px-1 text-xs leading-5 ${muted}`}>Updates automatically while this page is open. Study time reflects recorded playback only; activity before time tracking began cannot be reconstructed. Pauses, buffering, and skipped time don’t count. Tap a {periodDays === 1 ? 'bar to see that hour' : 'day to see its hours'}.</p>
        </>}
    </div>
}
