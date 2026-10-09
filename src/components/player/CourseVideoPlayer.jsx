import SubtitleTools from './SubtitleTools'
import { forwardRef, useRef } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import ResumableEmbedPlayer from './ResumableEmbedPlayer'

import AutomaticLocalPlayer from './AutomaticLocalPlayer'
const CourseVideoPlayer = forwardRef(function CourseVideoPlayer(props, ref) {
    const host=useRef(null)
    const { settings } = useSettings()
    const { video } = props
    const embedded = video?.youtubeId || video?.driveFileId || /youtu(?:be\.com|\.be)|drive\.google\.com/.test(video?.url || '')
    if (embedded) return <div ref={host} className="relative w-full h-full"><ResumableEmbedPlayer key={video.id} ref={ref} {...props} settings={settings} />{!video.youtubeId&&<SubtitleTools videoId={video.id} host={host} keyboardShortcuts={settings.keyboardShortcuts}/>}</div>
    return <div ref={host} className="relative w-full h-full"><AutomaticLocalPlayer ref={ref} {...props}/><SubtitleTools videoId={video.id} host={host} keyboardShortcuts={settings.keyboardShortcuts}/></div>
})
export default CourseVideoPlayer
