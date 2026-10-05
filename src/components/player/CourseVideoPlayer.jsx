import { forwardRef, lazy, Suspense } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import ResumableEmbedPlayer from './ResumableEmbedPlayer'

const LocalVideoPlayer = lazy(() => import('./VideoPlayer'))
const CourseVideoPlayer = forwardRef(function CourseVideoPlayer(props, ref) {
    const { settings } = useSettings()
    const { video } = props
    const embedded = video?.youtubeId || video?.driveFileId || /youtu(?:be\.com|\.be)|drive\.google\.com/.test(video?.url || '')
    if (embedded) return <ResumableEmbedPlayer key={video.id} ref={ref} {...props} settings={settings} />
    return <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-sm text-neutral-400">Loading player…</div>}>
        <LocalVideoPlayer ref={ref} {...props} />
    </Suspense>
})
export default CourseVideoPlayer
