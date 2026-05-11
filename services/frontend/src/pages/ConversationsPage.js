import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { adminApi } from '@/api/admin';
import { recorderApi } from '@/api/recorder';
import { ScoreBadge } from '@/components/ScoreBadge';
import { OutcomeTag } from '@/components/OutcomeTag';
import { Drawer } from '@/components/Drawer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AudioUploadModal } from '@/components/AudioUpload';
import { useState, useEffect, useCallback } from 'react';
import { Upload, RefreshCw, CheckCircle, Clock, Loader, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
// Подсвечивает в тексте сегмента вхождения raw_text возражений.
// Цвет: зелёный если возражение закрыто, красный если нет.
function renderTranscriptText(text, objections) {
    if (!text || !objections || !objections.length)
        return text;
    const ranges = [];
    const lower = text.toLowerCase();
    for (const obj of objections) {
        const raw = (obj?.raw_text || '').trim();
        if (raw.length < 3)
            continue;
        const needle = raw.toLowerCase();
        let pos = 0;
        while ((pos = lower.indexOf(needle, pos)) !== -1) {
            ranges.push({ start: pos, end: pos + raw.length, resolved: !!obj.is_resolved, type: obj.type || '' });
            pos += raw.length;
        }
    }
    if (!ranges.length)
        return text;
    ranges.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const r of ranges) {
        if (merged.length && r.start < merged[merged.length - 1].end)
            continue;
        merged.push(r);
    }
    const parts = [];
    let cursor = 0;
    merged.forEach((r, i) => {
        if (cursor < r.start)
            parts.push(text.slice(cursor, r.start));
        const cls = r.resolved ? 'objection-mark resolved' : 'objection-mark unresolved';
        const tip = `Возражение${r.type ? `: ${r.type}` : ''} — ${r.resolved ? 'закрыто' : 'не закрыто'}`;
        parts.push(_jsx("mark", { className: cls, title: tip, children: text.slice(r.start, r.end) }, `m-${i}`));
        cursor = r.end;
    });
    if (cursor < text.length)
        parts.push(text.slice(cursor));
    return parts;
}
const OUTCOME_LABELS = {
    purchase: 'Покупка',
    deferred: 'Отложил',
    price_objection: 'Ценовой отказ',
    competitor: 'Ушёл к конкурентам',
    unknown: 'Не определён',
};
const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1'];
// ─── Pipeline status badge ────────────────────────────────────────────────────
function PipelineStatus({ status }) {
    if (status === 'processing')
        return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }, children: [_jsx("span", { style: { width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', animation: 'viq-pulse 1.4s ease-in-out infinite' } }), "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u0431\u0430\u0446\u0438\u044F..."] }));
    if (status === 'transcribed')
        return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: 'rgba(99,102,241,0.12)', color: '#6366F1' }, children: [_jsx("span", { style: { width: 7, height: 7, borderRadius: '50%', background: '#6366F1', display: 'inline-block', animation: 'viq-pulse 1.4s ease-in-out 0.3s infinite' } }), "\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442\u0441\u044F..."] }));
    if (status === 'failed')
        return (_jsx("span", { style: { padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }, children: "\u2715 \u041E\u0448\u0438\u0431\u043A\u0430" }));
    return null;
}
// ─── Detailed card for in-progress recording ─────────────────────────────────
function RecordingDetail({ recording }) {
    const status = recording.status;
    const sellerName = recording.seller_name || '—';
    const storeName = recording.store_name || '—';
    const dateObj = recording.started_at ? new Date(recording.started_at) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const timeStr = dateObj ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    const mins = Math.floor((recording.duration_seconds || 0) / 60);
    const secs = (recording.duration_seconds || 0) % 60;
    // Pipeline steps based on status progression
    // processing → transcribed → diarized → analyzed
    const isFailed = status === 'failed';
    const isDiarized = ['diarized', 'analyzed'].includes(status);
    const isAnalyzed = status === 'analyzed';
    const steps = [
        { key: 'upload', label: 'Загрузка файла', done: true },
        { key: 'transcribe', label: 'Транскрибация (Whisper)', done: status !== 'processing' },
        { key: 'diarize', label: 'Распределение ролей', done: isDiarized },
        { key: 'analyze', label: 'Анализ соответствия скрипту', done: isAnalyzed },
    ];
    const currentStep = status === 'processing' ? 'transcribe'
        : status === 'transcribed' ? 'diarize'
            : status === 'diarized' ? 'analyze'
                : null;
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 20 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { style: { width: 44, height: 44, borderRadius: '50%', background: AVATAR_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16, flexShrink: 0 }, children: sellerName[0]?.toUpperCase() || '?' }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', fontSize: 15 }, children: sellerName }), _jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }, children: storeName })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsxs("span", { className: "tag tag-neutral", children: ["\uD83D\uDCC5 ", dateStr, ", ", timeStr] }), recording.duration_seconds
                        ? _jsxs("span", { className: "tag tag-neutral", children: ["\u23F1 ", mins, ":", String(secs).padStart(2, '0')] })
                        : _jsx("span", { className: "tag tag-neutral", style: { color: 'var(--text-muted)' }, children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F..." }), recording.file_size_bytes && (_jsxs("span", { className: "tag tag-neutral", children: ["\uD83D\uDCBE ", (recording.file_size_bytes / 1024 / 1024).toFixed(1), " \u041C\u0411"] }))] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 12, fontSize: 14 }, children: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 0 }, children: steps.map((step, i) => {
                            const isActive = step.key === currentStep && !isFailed;
                            const isFail = isFailed && step.key === currentStep;
                            const isDone = step.done && !isFailed;
                            const isPending = !step.done && step.key !== currentStep;
                            return (_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 12 }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }, children: [_jsxs("div", { style: {
                                                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: isDone ? 'var(--success)' : isActive ? '#6366F1' : isFail ? 'var(--danger)' : 'var(--border)',
                                                    color: (isDone || isActive || isFail) ? 'white' : 'var(--text-muted)',
                                                    fontSize: 13, fontWeight: 700,
                                                }, children: [isDone && _jsx(CheckCircle, { size: 14 }), isActive && _jsx(Loader, { size: 14, style: { animation: 'viq-spin 1s linear infinite' } }), isFail && _jsx(AlertCircle, { size: 14 }), isPending && _jsx(Clock, { size: 14 })] }), i < steps.length - 1 && (_jsx("div", { style: { width: 2, flex: 1, minHeight: 20, background: isDone ? 'var(--success)' : 'var(--border)', margin: '2px 0' } }))] }), _jsx("div", { style: { paddingBottom: i < steps.length - 1 ? 16 : 0, paddingTop: 3 }, children: _jsxs("div", { style: {
                                                fontSize: 14, fontWeight: isActive ? 600 : 400,
                                                color: isDone ? 'var(--text)' : isActive ? '#6366F1' : isFail ? 'var(--danger)' : 'var(--text-muted)',
                                            }, children: [step.label, isActive && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }, children: "\u2014 \u0432 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" }), isDone && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--success)' }, children: "\u2014 \u0433\u043E\u0442\u043E\u0432\u043E" }), isFail && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--danger)' }, children: "\u2014 \u043E\u0448\u0438\u0431\u043A\u0430" })] }) })] }, step.key));
                        }) })] }), isFailed && recording.error_message && (_jsx("div", { style: { padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 13 }, children: recording.error_message })), !isFailed && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }, children: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0435 5 \u0441\u0435\u043A\u0443\u043D\u0434 \u2014 \u0441\u0442\u0430\u0442\u0443\u0441 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438." }))] }));
}
// ─── Full conversation detail (analyzed) ─────────────────────────────────────
function ConversationDetail({ conversationId }) {
    const { data, isLoading } = useQuery({
        queryKey: ['conversation-detail', conversationId],
        queryFn: () => dashboardApi.getConversationDetail(conversationId),
    });
    const [audioTime, setAudioTime] = useState(0);
    const [audioUrl, setAudioUrl] = useState();
    const recordingId = data?.conversation?.recording_id || data?.recording_id;
    useEffect(() => {
        if (recordingId) {
            recorderApi.getAudioUrl(recordingId).then(setAudioUrl).catch(() => { });
        }
    }, [recordingId]);
    if (isLoading)
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    if (!data)
        return null;
    const c = data.conversation || data;
    const transcript = data.transcript || {};
    const segments = transcript.segments || c.segments || data.segments || [];
    const scriptResults = c.script_results || data.script_results || [];
    const objections = c.objections || data.objections || [];
    const sellerName = c.seller_name || c.seller_id || '?';
    const storeName = c.store_name || c.store_id || '';
    const mins = Math.floor((c.duration_seconds || 0) / 60);
    const secs = (c.duration_seconds || 0) % 60;
    const dateSource = c.analyzed_at || c.recorded_at || c.session_date || '';
    const dateStr = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const timeStr = dateSource ? new Date(dateSource).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    const overallScore = Math.round(c.overall_score || 0);
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { className: "avatar", style: { background: AVATAR_COLORS[0], width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }, children: sellerName[0].toUpperCase() }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', fontSize: 15 }, children: sellerName }), _jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }, children: storeName })] }), _jsxs("div", { style: { textAlign: 'right' }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: dateStr }), _jsxs("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: [timeStr, " \u00B7 ", mins, ":", String(secs).padStart(2, '0')] })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx(OutcomeTag, { outcome: c.outcome }), c.topic && _jsx("span", { className: "tag tag-neutral", children: c.topic }), c.compliance_ok !== undefined && (_jsxs("span", { className: `tag ${c.compliance_ok ? 'tag-success' : 'tag-danger'}`, children: ["\u041A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441: ", c.compliance_ok ? 'OK' : 'Нарушение'] }))] }), scriptResults.map((sr, i) => {
                const score = Math.round(sr.script_score || sr.total_score || 0);
                const sColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
                return (_jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 8 }, children: ["\u0421\u043A\u043E\u0440\u0438\u043D\u0433 \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u2014 ", score, "%"] }), _jsx("div", { className: "progress-bar", style: { marginBottom: 12 }, children: _jsx("div", { className: `progress-bar-fill ${sColor}`, style: { width: `${score}%` } }) }), _jsx("ul", { className: "checklist", children: (sr.step_scores || sr.steps || []).map((step, j) => {
                                const detected = step.detected !== false && (step.score > 0 || step.detected);
                                return (_jsxs("li", { className: "checklist-item", children: [_jsx("div", { className: `check-icon ${detected ? 'done' : 'missed'}`, children: detected ? '✓' : '✕' }), _jsx("span", { className: `checklist-text ${detected ? 'done' : 'missed'}`, children: step.step_name || step.name })] }, j));
                            }) })] }, i));
            }), objections.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 8 }, children: "\u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsx("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: objections.map((o, i) => (_jsx("span", { className: "tag tag-warning", children: o.type || o.text }, i))) })] })), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 8 }, children: "\u0410\u0443\u0434\u0438\u043E\u0437\u0430\u043F\u0438\u0441\u044C" }), _jsx(AudioPlayer, { src: audioUrl, duration: c.duration_seconds, onTimeUpdate: setAudioTime })] }), segments.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 12 }, children: "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: (() => {
                            // Группируем подряд идущие реплики одного спикера
                            const groups = [];
                            for (const seg of segments) {
                                const role = seg.speaker_role || 'unknown';
                                if (groups.length > 0 && groups[groups.length - 1].role === role) {
                                    groups[groups.length - 1].segs.push(seg);
                                }
                                else {
                                    groups.push({ role, segs: [seg] });
                                }
                            }
                            return groups.map((group, gi) => {
                                const isSeller = group.role === 'seller';
                                const firstSeg = group.segs[0];
                                const startSec = firstSeg.start_time || (firstSeg.start_ms ?? 0) / 1000;
                                const m = Math.floor(startSec / 60);
                                const s = Math.floor(startSec % 60);
                                const timeStr = `${m}:${String(s).padStart(2, '0')}`;
                                return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: isSeller ? 'flex-start' : 'flex-end', gap: 4 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', paddingLeft: isSeller ? 4 : 0, paddingRight: isSeller ? 0 : 4 }, children: [isSeller && _jsx("span", { style: { fontWeight: 600, color: '#6366F1' }, children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), !isSeller && _jsx("span", { style: { fontWeight: 600, color: '#10B981' }, children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("span", { children: timeStr })] }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 3, alignItems: isSeller ? 'flex-start' : 'flex-end', maxWidth: '75%' }, children: group.segs.map((seg, si) => (_jsx("div", { style: {
                                                    padding: '8px 12px',
                                                    borderRadius: isSeller
                                                        ? (si === 0 ? '4px 16px 16px 16px' : '4px 16px 16px 4px')
                                                        : (si === 0 ? '16px 4px 16px 16px' : '16px 4px 4px 16px'),
                                                    background: isSeller ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                                                    border: `1px solid ${isSeller ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                                    color: 'var(--text)',
                                                    fontSize: 13,
                                                    lineHeight: 1.5,
                                                }, children: renderTranscriptText(seg.text, objections) }, si))) })] }, gi));
                            });
                        })() })] })), _jsxs("div", { style: { display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }, children: [_jsx("button", { className: "btn btn-outline btn-sm", children: "\u0412 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435" }), _jsx("button", { className: "btn btn-outline btn-sm", children: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442" }), _jsx("button", { className: "btn btn-outline btn-sm", style: { color: 'var(--danger)' }, children: "\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435" })] })] }));
}
// ─── Main page ────────────────────────────────────────────────────────────────
export function ConversationsPage() {
    const [page, setPage] = useState(1);
    const [selectedConvId, setSelectedConvId] = useState(null);
    const [selectedRec, setSelectedRec] = useState(null);
    const [showUpload, setShowUpload] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [sort, setSort] = useState({ by: 'date', dir: 'desc' });
    const [filters, setFilters] = useState({
        store_id: '', seller_id: '', outcome: '',
        score_min: undefined,
        score_max: undefined,
    });
    const toggleSort = useCallback((by) => {
        setSort(prev => prev.by === by
            ? { by, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
            : { by, dir: by === 'date' || by === 'duration' ? 'desc' : 'asc' });
    }, []);
    const { data: conversations, dataUpdatedAt: convAt } = useQuery({
        queryKey: ['conversations', page, filters],
        queryFn: () => dashboardApi.getConversations({
            page, limit: 20,
            store_id: filters.store_id || undefined,
            seller_id: filters.seller_id || undefined,
            outcome: filters.outcome || undefined,
            score_min: filters.score_min,
            score_max: filters.score_max,
        }),
        refetchInterval: 5000,
    });
    const { data: recordingsData, dataUpdatedAt: recAt } = useQuery({
        queryKey: ['recordings-status'],
        queryFn: () => recorderApi.getRecordings({ limit: 50 }),
        refetchInterval: 5000,
    });
    const { data: stores } = useQuery({
        queryKey: ['admin-stores'],
        queryFn: () => adminApi.getStores(),
    });
    useEffect(() => {
        if (convAt || recAt)
            setLastUpdated(new Date());
    }, [convAt, recAt]);
    const analyzedIds = new Set((conversations?.items || []).map((c) => c.recording_id).filter(Boolean));
    const pendingRows = (recordingsData?.items || []).filter((r) => !analyzedIds.has(r.id));
    const allRows = [
        ...pendingRows.map((r) => ({
            _type: 'pending',
            _date: r.started_at ? new Date(r.started_at).getTime() : 0,
            _name: (r.seller_name || '').toLowerCase(),
            _duration: r.duration_seconds || 0,
            _store: (r.store_name || '').toLowerCase(),
            ...r,
        })),
        ...(conversations?.items || []).map((c) => ({
            _type: 'analyzed',
            _date: new Date(c.analyzed_at || c.recorded_at || c.session_date || 0).getTime(),
            _name: (c.seller_name || '').toLowerCase(),
            _duration: c.duration_seconds || 0,
            _store: (c.store_name || '').toLowerCase(),
            ...c,
        })),
    ];
    const sortedRows = [...allRows].sort((a, b) => {
        let v = 0;
        if (sort.by === 'date')
            v = a._date - b._date;
        else if (sort.by === 'name')
            v = a._name.localeCompare(b._name, 'ru');
        else if (sort.by === 'duration')
            v = a._duration - b._duration;
        else if (sort.by === 'store')
            v = a._store.localeCompare(b._store, 'ru');
        return sort.dir === 'asc' ? v : -v;
    });
    const handleScoreFilter = (v) => {
        if (v === '80+')
            setFilters(p => ({ ...p, score_min: 80, score_max: undefined }));
        else if (v === '60-79')
            setFilters(p => ({ ...p, score_min: 60, score_max: 79 }));
        else if (v === '<60')
            setFilters(p => ({ ...p, score_min: undefined, score_max: 59 }));
        else
            setFilters(p => ({ ...p, score_min: undefined, score_max: undefined }));
        setPage(1);
    };
    const lastUpdatedStr = lastUpdated
        ? lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;
    const drawerTitle = selectedConvId
        ? `Разговор #${selectedConvId.slice(0, 8)}`
        : selectedRec
            ? `Запись #${String(selectedRec.id).slice(0, 8)}`
            : '';
    return (_jsxs("div", { children: [_jsx("style", { children: `
        @keyframes viq-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.8)} }
        @keyframes viq-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      ` }), _jsxs("div", { className: "filter-bar fade-in", children: [_jsxs("select", { value: filters.store_id, onChange: e => { setFilters(p => ({ ...p, store_id: e.target.value })); setPage(1); }, children: [_jsx("option", { value: "", children: "\u0412\u0441\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" }), (stores?.items || []).map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] }), _jsxs("select", { value: filters.outcome, onChange: e => { setFilters(p => ({ ...p, outcome: e.target.value })); setPage(1); }, children: [_jsx("option", { value: "", children: "\u0412\u0441\u0435 \u0438\u0441\u0445\u043E\u0434\u044B" }), Object.entries(OUTCOME_LABELS).map(([k, l]) => _jsx("option", { value: k, children: l }, k))] }), _jsxs("select", { onChange: e => handleScoreFilter(e.target.value), children: [_jsx("option", { value: "", children: "\u041B\u044E\u0431\u043E\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("option", { value: "80+", children: "80%+" }), _jsx("option", { value: "60-79", children: "60\u201379%" }), _jsx("option", { value: "<60", children: "<60%" })] }), _jsxs("select", { value: `${sort.by}_${sort.dir}`, onChange: e => {
                            const [by, dir] = e.target.value.split('_');
                            setSort({ by, dir });
                        }, children: [_jsx("option", { value: "date_desc", children: "\u0414\u0430\u0442\u0430 \u2193 (\u043D\u043E\u0432\u044B\u0435)" }), _jsx("option", { value: "date_asc", children: "\u0414\u0430\u0442\u0430 \u2191 (\u0441\u0442\u0430\u0440\u044B\u0435)" }), _jsx("option", { value: "name_asc", children: "\u0418\u043C\u044F \u0410\u2192\u042F" }), _jsx("option", { value: "name_desc", children: "\u0418\u043C\u044F \u042F\u2192\u0410" }), _jsx("option", { value: "duration_desc", children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u2193" }), _jsx("option", { value: "duration_asc", children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u2191" }), _jsx("option", { value: "store_asc", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u0410\u2192\u042F" }), _jsx("option", { value: "store_desc", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u042F\u2192\u0410" })] }), _jsx("div", { style: { flex: 1 } }), lastUpdatedStr && (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }, children: [_jsx(RefreshCw, { size: 12, style: { opacity: .5 } }), " \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E ", lastUpdatedStr] })), _jsxs("span", { style: { fontSize: 13, color: 'var(--text-muted)' }, children: [(conversations?.total || 0) + pendingRows.length, " \u0437\u0430\u043F\u0438\u0441\u0435\u0439"] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: () => setShowUpload(true), children: [_jsx(Upload, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u0443\u0434\u0438\u043E"] })] }), _jsx(AudioUploadModal, { open: showUpload, onClose: () => setShowUpload(false), onUploadComplete: () => { } }), _jsxs("div", { className: "card fade-in", children: [_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [['date', 'name', 'store', 'duration'].map(col => {
                                                const labels = { date: 'Дата и время', name: 'Продавец', store: 'Магазин', duration: 'Длительность' };
                                                const active = sort.by === col;
                                                const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                                                return (_jsx("th", { onClick: () => toggleSort(col), style: { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }, children: _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [labels[col], _jsx(Icon, { size: 12, style: { opacity: active ? 1 : 0.3, color: active ? 'var(--primary)' : 'inherit' } })] }) }, col));
                                            }), _jsx("th", { children: "\u0422\u0435\u043C\u0430" }), _jsx("th", { children: "\u0421\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("th", { children: "\u0410\u043F\u0441\u0435\u0439\u043B" }), _jsx("th", { children: "\u0418\u0441\u0445\u043E\u0434 / \u0421\u0442\u0430\u0442\u0443\u0441" })] }) }), _jsx("tbody", { children: sortedRows.map((row, idx) => {
                                        const dateObj = row._date ? new Date(row._date) : null;
                                        const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
                                        const timeStr = dateObj ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                                        const mins = Math.floor(row._duration / 60);
                                        const secs = row._duration % 60;
                                        const durStr = row._duration ? `${mins}:${String(secs).padStart(2, '0')}` : '—';
                                        if (row._type === 'pending') {
                                            const sellerName = row.seller_name || '—';
                                            return (_jsxs("tr", { onClick: () => { setSelectedRec(row); setSelectedConvId(null); }, style: { cursor: 'pointer', background: 'var(--bg)', opacity: .92,
                                                    outline: selectedRec?.id === row.id ? '1px solid var(--primary)' : undefined }, children: [_jsxs("td", { children: [dateStr, " ", _jsx("span", { style: { color: 'var(--text-muted)' }, children: timeStr })] }), _jsx("td", { children: _jsxs("div", { className: "seller-cell", children: [_jsx("div", { className: "avatar", style: { background: '#94A3B8' }, children: sellerName[0]?.toUpperCase() || '?' }), _jsx("div", { className: "name", children: sellerName })] }) }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: row.store_name || '—' }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: durStr }), _jsx("td", { children: "\u2014" }), _jsx("td", { children: "\u2014" }), _jsx("td", {}), _jsx("td", { children: _jsx(PipelineStatus, { status: row.status }) })] }, row.id));
                                        }
                                        const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                                        return (_jsxs("tr", { onClick: () => { setSelectedConvId(row.id); setSelectedRec(null); }, style: { cursor: 'pointer', background: selectedConvId === row.id ? 'var(--bg-active)' : undefined }, children: [_jsxs("td", { children: [dateStr, " ", _jsx("span", { style: { color: 'var(--text-muted)' }, children: timeStr })] }), _jsx("td", { children: _jsxs("div", { className: "seller-cell", children: [_jsx("div", { className: "avatar", style: { background: color }, children: (row.seller_name || '?')[0].toUpperCase() }), _jsx("div", { className: "name", children: row.seller_name || row.seller_id })] }) }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: row.store_name || row.store_id }), _jsx("td", { children: durStr }), _jsx("td", { style: { color: 'var(--text-secondary)' }, children: row.topic || '—' }), _jsx("td", { children: _jsx(ScoreBadge, { score: row.overall_score }) }), _jsx("td", { children: row.has_upsell !== undefined && (_jsx("span", { className: `tag ${row.has_upsell ? 'tag-success' : 'tag-neutral'}`, children: row.has_upsell ? 'Да' : 'Нет' })) }), _jsx("td", { children: _jsx(OutcomeTag, { outcome: row.outcome }) })] }, row.id));
                                    }) })] }) }), _jsxs("div", { style: { padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }, children: [_jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setPage(Math.max(1, page - 1)), disabled: page === 1, children: "\u2190 \u041D\u0430\u0437\u0430\u0434" }), _jsxs("span", { style: { margin: '0 16px', color: 'var(--text-muted)', fontSize: 13 }, children: ["\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 ", page] }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setPage(page + 1), disabled: !conversations || conversations.items.length < 20, children: "\u0412\u043F\u0435\u0440\u0451\u0434 \u2192" })] })] }), _jsxs(Drawer, { isOpen: !!(selectedConvId || selectedRec), onClose: () => { setSelectedConvId(null); setSelectedRec(null); }, title: drawerTitle, children: [selectedConvId && _jsx(ConversationDetail, { conversationId: selectedConvId }), selectedRec && !selectedConvId && _jsx(RecordingDetail, { recording: selectedRec })] })] }));
}
