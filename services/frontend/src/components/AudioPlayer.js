import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
const SPEEDS = [0.5, 1, 1.5, 2];
export function AudioPlayer({ src, duration: totalDuration, onTimeUpdate }) {
    const audioRef = useRef(null);
    const waveRef = useRef(null);
    const isDraggingRef = useRef(false);
    const wasPlayingBeforeDragRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(totalDuration || 0);
    const [speedIndex, setSpeedIndex] = useState(1);
    const [bars] = useState(() => Array.from({ length: 80 }, () => Math.random() * 0.7 + 0.3));
    useEffect(() => {
        if (totalDuration)
            setDuration(totalDuration);
    }, [totalDuration]);
    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio)
            return;
        if (isPlaying) {
            audio.pause();
        }
        else {
            audio.play().catch(() => { });
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);
    const toggleSpeed = () => {
        const next = (speedIndex + 1) % SPEEDS.length;
        setSpeedIndex(next);
        if (audioRef.current) {
            audioRef.current.playbackRate = SPEEDS[next];
        }
    };
    const handleTimeUpdate = () => {
        const audio = audioRef.current;
        if (!audio)
            return;
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration || totalDuration || 0);
        onTimeUpdate?.(audio.currentTime);
    };
    const seekToClientX = useCallback((clientX) => {
        const audio = audioRef.current;
        const wave = waveRef.current;
        if (!audio || !wave || !duration)
            return;
        const rect = wave.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const newTime = ratio * duration;
        audio.currentTime = newTime;
        setCurrentTime(newTime);
        onTimeUpdate?.(newTime);
    }, [duration, onTimeUpdate]);
    const handlePointerDown = (e) => {
        if (!audioRef.current || !duration)
            return;
        isDraggingRef.current = true;
        wasPlayingBeforeDragRef.current = !audioRef.current.paused;
        audioRef.current.pause();
        e.currentTarget.setPointerCapture(e.pointerId);
        seekToClientX(e.clientX);
    };
    const handlePointerMove = (e) => {
        if (!isDraggingRef.current)
            return;
        seekToClientX(e.clientX);
    };
    const handlePointerUp = (e) => {
        if (!isDraggingRef.current)
            return;
        isDraggingRef.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        catch { }
        if (wasPlayingBeforeDragRef.current && audioRef.current) {
            audioRef.current.play().catch(() => { });
            setIsPlaying(true);
        }
    };
    const handleEnded = () => setIsPlaying(false);
    const formatTime = (t) => {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    };
    const progress = duration > 0 ? currentTime / duration : 0;
    const activeBarIndex = Math.floor(progress * bars.length);
    return (_jsxs("div", { className: "audio-player", children: [src && (_jsx("audio", { ref: audioRef, src: src, onTimeUpdate: handleTimeUpdate, onLoadedMetadata: handleTimeUpdate, onEnded: handleEnded, preload: "metadata" })), _jsxs("div", { className: "audio-player-controls", children: [_jsx("button", { className: "play-btn", onClick: togglePlay, disabled: !src, children: isPlaying ? _jsx(Pause, { size: 18 }) : _jsx(Play, { size: 18, style: { marginLeft: 2 } }) }), _jsxs("div", { className: "audio-timeline", style: { flex: 1 }, children: [_jsx("div", { ref: waveRef, className: "audio-wave", onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerUp, style: { touchAction: 'none' }, children: bars.map((h, i) => (_jsx("div", { className: `bar ${i <= activeBarIndex ? 'active' : ''}`, style: { height: `${h * 100}%`, pointerEvents: 'none' } }, i))) }), _jsxs("div", { className: "audio-time", children: [_jsx("span", { children: formatTime(currentTime) }), _jsx("span", { children: formatTime(duration) })] })] }), _jsxs("button", { className: "audio-speed", onClick: toggleSpeed, children: [SPEEDS[speedIndex], "x"] })] })] }));
}
