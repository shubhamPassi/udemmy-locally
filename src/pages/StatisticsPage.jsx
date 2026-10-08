import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Clock, BookOpen, CheckCircle, Trophy, RefreshCw, CalendarDays } from 'lucide-react'
import { getAllCourses, getCourseContent } from '../utils/db'
import * as api from '../utils/api'
import { withPlaybackBookmark } from '../utils/playbackBookmarks'
import { learningStats, learningTime } from '../utils/learningStats'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { readStudyHours, studyTimeLabel } from '../utils/studyTime'

const card='min-w-0 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-neutral-900 p-5 sm:p-6'
export default function StatisticsPage() {
    const [courses,setCourses]=useState([]),[videos,setVideos]=useState([])
    const [loading,setLoading]=useState(true),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false)
    const [studyHours,setStudyHours]=useState({}),[selectedDay,setSelectedDay]=useState(6)
    const [periodDays,setPeriodDays]=useState(7)
    async function load() {
        setRefreshing(true);setError('')
        setStudyHours(readStudyHours())
        try {
            const library=await getAllCourses()
            const lessons=api.IS_BROWSER_MODE?await api.get('/api/videos'):(await Promise.all(library.map(course=>getCourseContent(course.id)))).flatMap(content=>content.videos||[])
            setCourses(library);setVideos(lessons.map(withPlaybackBookmark))
        } catch(err) {setError(err.message||'Could not load your statistics.')}
        finally {setLoading(false);setRefreshing(false)}
    }
    useEffect(()=>{load()},[])
    const stats=useMemo(()=>learningStats(courses,videos,new Date(),studyHours,periodDays),[courses,videos,studyHours,periodDays])
    if(loading)return <LoadingSpinner message="Loading your learning overview…" />
    const metrics=[
        {label:'Lessons completed',value:stats.completed,detail:`of ${stats.total} lessons`,icon:CheckCircle,color:'text-emerald-500 bg-emerald-500/10'},
        {label:'Courses finished',value:stats.finished,detail:`of ${courses.length} courses`,icon:Trophy,color:'text-violet-500 bg-violet-500/10'},
        {label:'Time studied',value:studyTimeLabel(stats.periodStudySeconds),detail:`Actual playing time · last ${periodDays} days`,icon:Clock,color:'text-blue-500 bg-blue-500/10'},
        {label:'Courses in progress',value:stats.active,detail:`${stats.notStarted} not started`,icon:BookOpen,color:'text-amber-500 bg-amber-500/10'},
    ]
    return <div className="py-4 sm:py-6 space-y-6 text-gray-900 dark:text-white">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-blue-500 mb-2"><BarChart3 className="w-4 h-4" />Your learning, at a glance</div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Learning Statistics</h1><p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">A clearer view of what you’ve finished and what’s next.</p></div><button onClick={load} disabled={refreshing} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing?'animate-spin':''}`} />Refresh</button></header>
        {error&&<p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-500">{error}</p>}
        {error ? null : courses.length===0?<div className={`${card} text-center py-16`}><BookOpen className="mx-auto w-10 h-10 text-blue-500 mb-4" /><h2 className="text-xl font-semibold">Your learning starts here</h2><p className="text-sm text-neutral-500 mt-2">Add a course to start building your progress.</p><Link to="/" className="inline-flex mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white">Go to courses</Link></div>:<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">{metrics.map(({label,value,detail,icon:Icon,color})=><div key={label} className={card}><span className={`inline-flex rounded-xl p-2.5 ${color}`}><Icon className="w-5 h-5" /></span><div className="mt-4 text-2xl sm:text-3xl font-bold tabular-nums">{value}</div><h2 className="mt-1 text-sm font-medium">{label}</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-neutral-500">{detail}</p></div>)}</div>
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
            <section className={card}><h2 className="font-semibold">Overall progress</h2><div className="flex items-center gap-5 py-6"><svg viewBox="0 0 120 120" className="h-28 w-28 sm:h-32 sm:w-32 shrink-0" role="img" aria-label={`${Math.round(stats.percent)} percent of lessons completed`}><circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="9" className="text-gray-100 dark:text-white/5" /><circle cx="60" cy="60" r="50" fill="none" stroke="#3b82f6" strokeWidth="9" strokeLinecap="round" strokeDasharray="314.159" strokeDashoffset={314.159*(1-stats.percent/100)} transform="rotate(-90 60 60)" /><text x="60" y="63" textAnchor="middle" fill="currentColor" fontSize="24" fontWeight="700">{Math.round(stats.percent)}%</text><text x="60" y="81" textAnchor="middle" fill="#737373" fontSize="10">completed</text></svg><div className="space-y-3 min-w-0 text-sm"><p><strong className="text-blue-500">{stats.completed}</strong> lessons finished</p><p><strong>{Math.max(0,stats.total-stats.completed)}</strong> lessons to go</p><p className="text-xs text-gray-500 dark:text-neutral-500">Known video duration<br /><span className="text-sm text-gray-700 dark:text-neutral-300">{learningTime(stats.knownSeconds)}</span></p></div></div><p className="text-xs leading-5 text-gray-500 dark:text-neutral-500">Study time is recorded from this update onward. Paused, buffering, and skipped time don’t count.</p></section>
            <section className={card}>
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4 text-blue-500" />Recent lesson activity</h2><div className="inline-flex rounded-lg bg-gray-100 dark:bg-white/5 p-1" aria-label="Activity period">{[{label:'Weekly',days:7},{label:'Monthly',days:30}].map(option=><button key={option.days} aria-pressed={periodDays===option.days} onClick={()=>{setPeriodDays(option.days);setSelectedDay(option.days-1)}} className={`rounded-md px-3 py-1.5 text-xs font-medium ${periodDays===option.days?'bg-blue-600 text-white':'text-gray-500 dark:text-neutral-400 hover:text-blue-500'}`}>{option.label}</button>)}</div></div>
                <p className="mt-3 text-xs text-gray-500">Last {periodDays} days · {studyTimeLabel(stats.periodStudySeconds)} studied</p>
                <div className="mt-6 grid items-end h-40 gap-0.5 sm:gap-1" style={{gridTemplateColumns:`repeat(${periodDays},minmax(0,1fr))`}}>{stats.days.map((day,index)=><button key={index} onClick={()=>setSelectedDay(index)} aria-pressed={selectedDay===index} aria-label={`${day.date.toLocaleDateString()}, ${studyTimeLabel(day.seconds)} studied`} title={`${day.date.toLocaleDateString()}: ${studyTimeLabel(day.seconds)} studied`} className="min-w-0 flex h-full flex-col items-center justify-end gap-2 rounded-sm focus-visible:outline focus-visible:outline-blue-500">
                    <span className={`text-[10px] sm:text-xs tabular-nums text-gray-600 dark:text-neutral-300 ${periodDays===30?'sr-only':''}`}>{studyTimeLabel(day.seconds)}</span>
                    <span className="w-full max-w-9 rounded-t-lg bg-blue-500/10 flex items-end" style={{height:'100px'}}><span className={`w-full rounded-t-lg ${selectedDay===index?'bg-blue-500':'bg-blue-500/50'}`} style={{height:`${day.seconds/Math.max(1,...stats.days.map(d=>d.seconds))*100}%`,minHeight:day.seconds?4:0}} /></span>
                    <span className={`h-4 whitespace-nowrap text-[9px] sm:text-[10px] ${selectedDay===index?'font-semibold text-blue-500':'text-gray-500'}`}>{periodDays===30?(index%5===0||index===29?day.date.getDate():''):day.label}</span>
                </button>)}</div>
                <div className="mt-6 border-t border-gray-200 dark:border-white/10 pt-4">
                    <div className="flex items-center justify-between gap-3 text-sm"><h3 className="font-medium">{stats.days[selectedDay].date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})} · by hour</h3><span className="font-semibold text-blue-500">{studyTimeLabel(stats.days[selectedDay].seconds)} studied</span></div>
                    <div className="mt-3 grid gap-0.5 sm:gap-1 h-24 items-end" style={{gridTemplateColumns:'repeat(24,minmax(0,1fr))'}}>{stats.days[selectedDay].hours.map((seconds,hour)=><div key={hour} className="min-w-0 flex flex-col items-center justify-end gap-1 h-full" title={`${String(hour).padStart(2,'0')}:00–${String(hour).padStart(2,'0')}:59 · ${studyTimeLabel(seconds)} studied`}>
                        <div className="w-full flex items-end h-16"><div className="w-full rounded-t bg-blue-500/70" style={{height:`${seconds/Math.max(1,...stats.days[selectedDay].hours)*100}%`,minHeight:seconds?3:0}} /></div><span className="h-3 text-[9px] text-gray-500">{hour%4===0||hour===23?String(hour).padStart(2,'0'):''}</span>
                    </div>)}</div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-neutral-400">{stats.days[selectedDay].hours.map((seconds,hour)=>seconds>0&&<span key={hour}>{String(hour).padStart(2,'0')}:00 · {studyTimeLabel(seconds)}</span>)}</div>
                    {stats.days[selectedDay].seconds===0&&<p className="mt-2 text-xs text-neutral-500">No recorded study time for this day yet.</p>}
                </div>
                <p className="mt-4 text-xs text-gray-500 dark:text-neutral-500">Select a day to see the hours you studied. Refresh to load the latest time.</p>
            </section>
        </div>
        </>}
    </div>
}
