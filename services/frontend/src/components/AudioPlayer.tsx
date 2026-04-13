import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause } from 'lucide-react'

interface AudioPlayerProps {
  src?: string
  duration?: number
  onTimeUpdate?: (currentTime: number) => void
}

const SPEEDS = [0.5, 1, 1.5, 2]

export function AudioPlayer({ src, duration: totalDuration, onTimeUpdate }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
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

  const handleBarClick = (index: number) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const newTime = (index / bars.length) * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
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
          <div className="audio-wave">
            {bars.map((h, i) => (
              <div
                key={i}
                className={`bar ${i <= activeBarIndex ? 'active' : ''}`}
                style={{ height: `${h * 100}%` }}
                onClick={() => handleBarClick(i)}
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
