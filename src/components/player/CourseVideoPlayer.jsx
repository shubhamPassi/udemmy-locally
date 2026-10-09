import SubtitleTools from './SubtitleTools'
import { forwardRef, lazy, Suspense, useRef } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import ResumableEmbedPlayer from './ResumableEmbedPlayer'

const LocalVideoPlayer = lazy(() => import('./VideoPlayer'))
const CourseVideoPlayer = forwardRef(function CourseVideoPlayer(props, ref) {
    const host=useRef(null)
    const { settings } = useSettings()
    const { video } = props
    const embedded = video?.youtubeId || video?.driveFileId || /youtu(?:be\.com|\.be)|drive\.google\.com/.test(video?.url || '')
    if (embedded) return <div ref={host} className="relative w-full h-full"><ResumableEmbedPlayer key={video.id} ref={ref} {...props} settings={settings} />{!video.youtubeId&&<SubtitleTools videoId={video.id} host={host}/>}</div>
    return <div ref={host} className="relative w-full h-full"><Suspense fallback={<div className="w-full h-full flex items-center justify-center text-sm text-neutral-400">Loading player…</div>}>
        <LocalVideoPlayer key={`${video.id}:${video.fileAccessUpdatedAt||''}`} ref={ref} {...props} />
    </Suspense><SubtitleTools videoId={video.id} host={host}/></div>
})
export default CourseVideoPlayer
