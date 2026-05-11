import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
const SPEEDS = [0.5, 1, 1.5, 2];
export function AudioPlayer({ src, duration: totalDuration, onTimeUpdate }) {
    const audioRef = useRef(null);
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
    const handleBarClick = (index) => {
        const audio = audioRef.current;
        if (!audio || !duration)
            return;
        const newTime = (index / bars.length) * duration;
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };
    const handleEnded = () => setIsPlaying(false);
    const formatTime = (t) => {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    };
    const progress = duration > 0 ? currentTime / duration : 0;
    const activeBarIndex = Math.floor(progress * bars.length);
    return (_jsxs("div", { className: "audio-player", children: [src && (_jsx("audio", { ref: audioRef, src: src, onTimeUpdate: handleTimeUpdate, onLoadedMetadata: handleTimeUpdate, onEnded: handleEnded, preload: "metadata" })), _jsxs("div", { className: "audio-player-controls", children: [_jsx("button", { className: "play-btn", onClick: togglePlay, disabled: !src, children: isPlaying ? _jsx(Pause, { size: 18 }) : _jsx(Play, { size: 18, style: { marginLeft: 2 } }) }), _jsxs("div", { className: "audio-timeline", style: { flex: 1 }, children: [_jsx("div", { className: "audio-wave", children: bars.map((h, i) => (_jsx("div", { className: `bar ${i <= activeBarIndex ? 'active' : ''}`, style: { height: `${h * 100}%` }, onClick: () => handleBarClick(i) }, i))) }), _jsxs("div", { className: "audio-time", children: [_jsx("span", { children: formatTime(currentTime) }), _jsx("span", { children: formatTime(duration) })] })] }), _jsxs("button", { className: "audio-speed", onClick: toggleSpeed, children: [SPEEDS[speedIndex], "x"] })] })] }));
}
