import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, RotateCw, Loader2 } from 'lucide-react'
import { formatDuration } from '../../utils/db'

export default function StreamPlayerControls({ mediaRef, containerRef }) {
    const [state, setState] = useState({ time: 0, duration: 0, paused: true, muted: false, volume: 1, rate: 1, buffering: true })
    const [visible, setVisible] = useState(true)
    const hideTimer = useRef(null)
    const interacting = useRef(false)
    useEffect(() => {
        reveal()
        const release = () => {
            if (!interacting.current) return
            interacting.current = false
            reveal()
        }
        window.addEventListener('pointerup', release)
        window.addEventListener('pointercancel', release)
        return () => {
            clearTimeout(hideTimer.current)
            window.removeEventListener('pointerup', release)
            window.removeEventListener('pointercancel', release)
        }
    }, [])
    useEffect(() => {
        const media = mediaRef.current
        if (!media) return
        const sync = () => setState(previous => {
            const next = { time: media.currentTime, duration: Number.isFinite(media.duration) ? media.duration : 0, paused: media.paused, muted: media.muted, volume: media.volume, rate: media.playbackRate, buffering: !media.paused && media.readyState < 3 }
            return Math.floor(previous.time) === Math.floor(next.time) && Object.keys(next).filter(key => key !== 'time').every(key => next[key] === previous[key]) ? previous : next
        })
        const events = ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended', 'volumechange', 'ratechange', 'waiting', 'canplay', 'seeked']
        events.forEach(event => media.addEventListener(event, sync)); sync()
        return () => { events.forEach(event => media.removeEventListener(event, sync)); clearTimeout(hideTimer.current) }
    }, [mediaRef])
    function reveal() {
        setVisible(true)
        clearTimeout(hideTimer.current)
        if (!interacting.current) hideTimer.current = setTimeout(() => setVisible(false), 1000)
    }
    function toggle() {
        const media = mediaRef.current
        if (!media) return
        media.paused ? media.play().catch(() => {}) : media.pause()
        reveal()
    }
    function seek(delta) { const media = mediaRef.current; if (media && state.duration) media.currentTime = Math.max(0, Math.min(state.duration, media.currentTime + delta)); reveal() }
    function fullscreen() {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
        else if (containerRef.current?.requestFullscreen) containerRef.current.requestFullscreen().catch(() => {})
        else mediaRef.current?.webkitEnterFullscreen?.()
    }
    const shown = visible
    const button = 'h-10 w-8 sm:w-10 flex shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
    return <div className={`absolute inset-0 flex flex-col justify-end ${shown ? '' : 'cursor-none'}`} onMouseMove={reveal} onTouchStart={reveal} onKeyDownCapture={reveal} onMouseLeave={() => { if (!interacting.current) setVisible(false) }}>
        <button className="absolute inset-0 w-full h-full" onClick={toggle} aria-label={state.paused ? 'Play video' : 'Pause video'} />
        {state.buffering && <div className="absolute inset-0 pointer-events-none flex items-center justify-center"><Loader2 className="w-9 h-9 text-white animate-spin" /></div>}
        {state.paused && shown && <button onClick={toggle} aria-label="Play" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/65 border border-white/20 text-white flex items-center justify-center hover:bg-blue-600"><Play className="w-7 h-7 ml-1" fill="currentColor" /></button>}
        <div className={`relative px-3 sm:px-5 pt-8 pb-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-150 ${shown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onFocusCapture={reveal} onPointerDown={() => { interacting.current = true; clearTimeout(hideTimer.current) }}>
            <input type="range" aria-label="Video position" min="0" max={state.duration || 1} step="0.1" value={Math.min(state.time, state.duration || 1)} disabled={!state.duration}
                onChange={event => { mediaRef.current.currentTime = Number(event.target.value); reveal() }}
                className="w-full h-4 cursor-pointer accent-blue-500" style={{ touchAction: 'none' }} />
            <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-0 sm:gap-1 min-w-0">
                    <button className={button} onClick={toggle} aria-label={state.paused ? 'Play' : 'Pause'} title="Play / pause (K)">{state.paused ? <Play className="w-5 h-5" fill="currentColor" /> : <Pause className="w-5 h-5" fill="currentColor" />}</button>
                    <button className={button} onClick={() => seek(-10)} aria-label="Back 10 seconds" title="Back 10 seconds (J)"><RotateCcw className="w-5 h-5" /></button>
                    <button className={button} onClick={() => seek(10)} aria-label="Forward 10 seconds" title="Forward 10 seconds (L)"><RotateCw className="w-5 h-5" /></button>
                    <span className="text-[11px] sm:text-xs text-white/90 tabular-nums whitespace-nowrap">{formatDuration(state.time)} <span className="text-white/50">/ {formatDuration(state.duration)}</span></span>
                </div>
                <div className="flex items-center gap-1">
                    <button className={`${button} hidden sm:flex`} onClick={() => { mediaRef.current.muted = !mediaRef.current.muted }} aria-label={state.muted ? 'Unmute' : 'Mute'} title="Mute (M)">{state.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>
                    <input type="range" aria-label="Volume" min="0" max="1" step="0.05" value={state.muted ? 0 : state.volume} onChange={event => { mediaRef.current.volume = Number(event.target.value); mediaRef.current.muted = false }} className="hidden lg:block w-16 accent-blue-500" />
                    <select aria-label="Playback speed" value={state.rate} onChange={event => { mediaRef.current.playbackRate = Number(event.target.value); reveal() }} className="text-xs text-white bg-black/70 rounded-lg py-2 px-1 sm:px-2 cursor-pointer">
                        {[0.25,0.5,0.75,1,1.25,1.5,1.75,2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
                    </select>
                    <button className={button} onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (F)"><Maximize className="w-5 h-5" /></button>
                </div>
            </div>
        </div>
    </div>
}
