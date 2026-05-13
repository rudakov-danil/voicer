import { useState, useRef, useEffect, useCallback } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Play, Pause } from 'lucide-react'

interface AudioPlayerProps {
  src?: string
  duration?: number
  onTimeUpdate?: (currentTime: number) => void
}

const SPEEDS = [0.5, 1, 1.5, 2]

export function AudioPlayer({ src, duration: totalDuration, onTimeUpdate }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const wasPlayingBeforeDragRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(totalDuration || 0)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [bars] = useState(() =>
    Array.from({ length: 80 }, () => Math.random() * 0.7 + 0.3)
  )

  useEffect(() => {
    if (totalDuration) setDuration(totalDuration)
  }, [totalDuration])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const toggleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(next)
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[next]
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
    setDuration(audio.duration || totalDuration || 0)
    onTimeUpdate?.(audio.currentTime)
  }

  const seekToClientX = useCallback((clientX: number) => {
    const audio = audioRef.current
    const wave = waveRef.current
    if (!audio || !wave || !duration) return
    const rect = wave.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const newTime = ratio * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
    onTimeUpdate?.(newTime)
  }, [duration, onTimeUpdate])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    isDraggingRef.current = true
    wasPlayingBeforeDragRef.current = !audioRef.current.paused
    audioRef.current.pause()
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    seekToClientX(e.clientX)
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    if (wasPlayingBeforeDragRef.current && audioRef.current) {
      audioRef.current.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  const handleEnded = () => setIsPlaying(false)

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const progress = duration > 0 ? currentTime / duration : 0
  const activeBarIndex = Math.floor(progress * bars.length)

  return (
    <div className="audio-player">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleTimeUpdate}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}
      <div className="audio-player-controls">
        <button className="play-btn" onClick={togglePlay} disabled={!src}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>
        <div className="audio-timeline" style={{ flex: 1 }}>
          <div
            ref={waveRef}
            className="audio-wave"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            {bars.map((h, i) => (
              <div
                key={i}
                className={`bar ${i <= activeBarIndex ? 'active' : ''}`}
                style={{ height: `${h * 100}%`, pointerEvents: 'none' }}
              />
            ))}
          </div>
          <div className="audio-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <button className="audio-speed" onClick={toggleSpeed}>
          {SPEEDS[speedIndex]}x
        </button>
      </div>
    </div>
  )
}
