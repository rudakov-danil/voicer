import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { adminApi } from '@/api/admin';
import { recorderApi } from '@/api/recorder';
import { OutcomeTag } from '@/components/OutcomeTag';
import { Drawer } from '@/components/Drawer';
import { AudioUploadModal } from '@/components/AudioUpload';
import { TranscriptUploadModal } from '@/components/TranscriptUpload';
import { CallUploadModal } from '@/components/CallUpload';
import { useTerms } from '@/lib/terms';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useSearchParams, useOutletContext, useNavigate } from 'react-router-dom';
import { OUTCOME_LABELS, TELEPHONY_OUTCOME_LABELS, CALL_CATEGORY_LABELS, DirectionIcon, useObjectionTypeLabel, } from '@/components/conversation/shared';
import { Upload, CheckCircle, Clock, Loader, AlertCircle, X, FileText, Phone, Sparkles, ChevronRight, Search, ShieldAlert, MessageCircleWarning } from 'lucide-react';
import { Fingerprint, clock } from '@/components/ui/Fingerprint';
import { Meter, UpsellDots } from '@/components/ui/Meter';
import { t, L, locale } from '@/i18n';
import { MultiSelect } from '@/components/scripts/MultiSelect';
import { QuickView } from '@/components/conversation/QuickView';
// ─── Pipeline status badge ────────────────────────────────────────────────────
// Флаги концепта, без бесконечной пульсации: статус обновляется опросом списка.
function PipelineStatus({ status }) {
    if (status === 'processing' || status === 'uploaded' || status === 'pending')
        return (_jsxs("span", { className: "flag is-warn", children: [_jsx(Loader, { "aria-hidden": "true" }), "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u0431\u0430\u0446\u0438\u044F..."] }));
    if (status === 'transcribed')
        return (_jsxs("span", { className: "flag is-info", children: [_jsx(Sparkles, { "aria-hidden": "true" }), "\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442\u0441\u044F..."] }));
    if (status === 'failed')
        return (_jsxs("span", { className: "flag is-crit", children: [_jsx(AlertCircle, { "aria-hidden": "true" }), "\u041E\u0448\u0438\u0431\u043A\u0430"] }));
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
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 20 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("span", { className: "avatar avatar-lg", "aria-hidden": "true", translate: "no", children: initialsOf(recording.seller_name) }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', fontSize: 15 }, children: sellerName }), _jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }, children: storeName })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsxs("span", { className: "tag tag-neutral", children: ["\uD83D\uDCC5 ", dateStr, ", ", timeStr] }), recording.duration_seconds
                        ? _jsxs("span", { className: "tag tag-neutral", children: ["\u23F1 ", mins, ":", String(secs).padStart(2, '0')] })
                        : _jsx("span", { className: "tag tag-neutral", style: { color: 'var(--text-muted)' }, children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F..." }), recording.file_size_bytes && (_jsxs("span", { className: "tag tag-neutral", children: ["\uD83D\uDCBE ", (recording.file_size_bytes / 1024 / 1024).toFixed(1), " \u041C\u0411"] }))] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 12, fontSize: 14 }, children: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 0 }, children: steps.map((step, i) => {
                            const isActive = step.key === currentStep && !isFailed;
                            const isFail = isFailed && step.key === currentStep;
                            const isDone = step.done && !isFailed;
                            const isPending = !step.done && step.key !== currentStep;
                            return (_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 12 }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }, children: [_jsxs("div", { style: {
                                                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : isFail ? 'var(--danger)' : 'var(--border)',
                                                    color: (isDone || isActive || isFail) ? 'white' : 'var(--text-muted)',
                                                    fontSize: 13, fontWeight: 700,
                                                }, children: [isDone && _jsx(CheckCircle, { size: 14 }), isActive && _jsx(Loader, { size: 14, style: { animation: 'viq-spin 1s linear infinite' } }), isFail && _jsx(AlertCircle, { size: 14 }), isPending && _jsx(Clock, { size: 14 })] }), i < steps.length - 1 && (_jsx("div", { style: { width: 2, flex: 1, minHeight: 20, background: isDone ? 'var(--success)' : 'var(--border)', margin: '2px 0' } }))] }), _jsx("div", { style: { paddingBottom: i < steps.length - 1 ? 16 : 0, paddingTop: 3 }, children: _jsxs("div", { style: {
                                                fontSize: 14, fontWeight: isActive ? 600 : 400,
                                                color: isDone ? 'var(--text)' : isActive ? 'var(--accent)' : isFail ? 'var(--danger)' : 'var(--text-muted)',
                                            }, children: [step.label, isActive && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }, children: "\u2014 \u0432 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" }), isDone && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--success)' }, children: "\u2014 \u0433\u043E\u0442\u043E\u0432\u043E" }), isFail && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--danger)' }, children: "\u2014 \u043E\u0448\u0438\u0431\u043A\u0430" })] }) })] }, step.key));
                        }) })] }), isFailed && recording.error_message && (_jsx("div", { style: { padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 13 }, children: recording.error_message })), !isFailed && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }, children: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0435 5 \u0441\u0435\u043A\u0443\u043D\u0434 \u2014 \u0441\u0442\u0430\u0442\u0443\u0441 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438." }))] }));
}
// ─── Вложенные строки группы: прежние звонки того же клиента ──────────────────
function GroupChildRows({ conversationId, selectedConvId, onSelect }) {
    const { data, isLoading } = useQuery({
        queryKey: ['client-history', conversationId],
        queryFn: () => dashboardApi.getClientHistory(conversationId),
        staleTime: 60 * 1000,
    });
    // Показываем в группе все звонки клиента, КРОМЕ текущего представителя (он — родительская строка)
    const children = (data?.items || []).filter((it) => !it.is_current);
    if (isLoading)
        return (_jsx("tr", { children: _jsx("td", { colSpan: 9, style: { padding: '8px 16px 8px 52px', color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u0438\u2026" }) }));
    if (!children.length)
        return null;
    return (_jsx(_Fragment, { children: children.map((it) => {
            const d = it.session_date ? new Date(it.session_date) : null;
            const dateStr = d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
            const mins = Math.floor((it.duration_seconds || 0) / 60);
            const secs = (it.duration_seconds || 0) % 60;
            const durStr = it.duration_seconds ? `${mins}:${String(secs).padStart(2, '0')}` : '—';
            return (_jsxs("tr", { onClick: () => onSelect(it.id), style: { cursor: 'pointer', background: selectedConvId === it.id ? 'var(--bg-active)' : 'var(--bg)' }, children: [_jsx("td", { style: { paddingLeft: 52 }, children: _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }, children: [_jsx(DirectionIcon, { direction: it.call_direction }), dateStr] }) }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: it.seller_name || '—' }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: it.store_name || '—' }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: durStr }), _jsx("td", { style: { color: 'var(--text-secondary)' }, children: it.topic || '—' }), _jsx("td", { style: { textAlign: 'center' }, children: it.is_scorable === false
                            ? _jsx("span", { className: "tag tag-neutral", title: `Категория: ${CALL_CATEGORY_LABELS[it.call_category || ''] || it.call_category || 'нецелевой'}. Не влияет на рейтинг.`, children: "\u041D\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u0435\u0442\u0441\u044F" })
                            : _jsx(Meter, { score: it.overall_score }) }), _jsx("td", { style: { textAlign: 'center' }, children: it.is_scorable === false ? _jsx("span", { style: { color: 'var(--text-muted)' }, children: "\u2014" })
                            : it.has_upsell === true ? _jsx("span", { className: "tag tag-success", children: "\u0414\u0430" })
                                : it.has_upsell === false ? _jsx("span", { className: "tag tag-danger", children: "\u041D\u0435\u0442" })
                                    : _jsx("span", { style: { color: 'var(--text-muted)' }, children: "\u2014" }) }), _jsx("td", { style: { textAlign: 'center' }, children: it.is_scorable === false ? _jsx("span", { style: { color: 'var(--text-muted)' }, children: "\u2014" })
                            : it.has_crosssell === true ? _jsx("span", { className: "tag tag-success", children: "\u0414\u0430" })
                                : it.has_crosssell === false ? _jsx("span", { className: "tag tag-danger", children: "\u041D\u0435\u0442" })
                                    : _jsx("span", { style: { color: 'var(--text-muted)' }, children: "\u2014" }) }), _jsx("td", { style: { textAlign: 'center' }, children: _jsx(OutcomeTag, { outcome: it.outcome || 'unknown' }) })] }, it.id));
        }) }));
}
// Номера страниц с многоточиями: 1 … 4 5 6 … 50
function buildPageList(current, totalPages) {
    if (totalPages <= 7)
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3)
        pages.push('…');
    const start = Math.max(2, current - 1);
    const end = Math.min(totalPages - 1, current + 1);
    for (let i = start; i <= end; i++)
        pages.push(i);
    if (current < totalPages - 2)
        pages.push('…');
    pages.push(totalPages);
    return pages;
}
// Подборки над таблицей: ключ API → подпись и «тревожность» счётчика
const VIEWS = [
    { id: '', label: 'Все' },
    { id: 'attention', label: 'Требуют внимания', alert: true },
    { id: 'violations', label: 'Нарушения', alert: true },
    { id: 'low_score', label: 'Низкий балл' },
    { id: 'price_open', label: '«Дорого» без ответа' },
    { id: 'competitor', label: 'Ушли к конкурентам' },
    { id: 'no_upsell', label: 'Без допродажи' },
];
function initialsOf(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
/** Подсветка найденной фразы в реплике. */
function HitText({ text, q }) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0)
        return _jsx(_Fragment, { children: text });
    return _jsxs(_Fragment, { children: [text.slice(0, i), _jsx("mark", { children: text.slice(i, i + q.length) }), text.slice(i + q.length)] });
}
export function ConversationsPage() {
    const { period } = useOutletContext();
    const terms = useTerms();
    const objectionLabel = useObjectionTypeLabel();
    const [searchParams, setSearchParams] = useSearchParams();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const navigate = useNavigate();
    const openConversation = useCallback((id) => navigate(`/conversations/${id}`), [navigate]);
    const [selectedRec, setSelectedRec] = useState(null);
    // Быстрый просмотр: ?open=<id> — на него можно сослаться
    const quickId = searchParams.get('open');
    const setQuick = useCallback((id) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (id)
                next.set('open', id);
            else
                next.delete('open');
            return next;
        }, { replace: true });
    }, [setSearchParams]);
    const closeQuick = useCallback(() => setQuick(null), [setQuick]);
    // Подборка и фраза живут в адресе: на них ссылаются «Обзор» и оповещения
    const view = (searchParams.get('view') || '');
    const q = searchParams.get('q') || '';
    const [qInput, setQInput] = useState(q);
    const setParam = useCallback((key, value) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (value)
                next.set(key, value);
            else
                next.delete(key);
            return next;
        }, { replace: true });
        setPage(1);
    }, [setSearchParams]);
    // Поиск по фразе — с небольшой задержкой после ввода
    useEffect(() => {
        const id = setTimeout(() => { if (qInput.trim() !== q)
            setParam('q', qInput.trim()); }, 400);
        return () => clearTimeout(id);
    }, [qInput, q, setParam]);
    // Старые ссылки вида /conversations?conv=<id> (оповещения, обзор) ведут на страницу разговора
    useEffect(() => {
        const conv = searchParams.get('conv');
        if (conv)
            navigate(`/conversations/${conv}`, { replace: true });
    }, [searchParams, navigate]);
    const [showUpload, setShowUpload] = useState(false);
    const [showTranscriptUpload, setShowTranscriptUpload] = useState(false);
    const [showCallUpload, setShowCallUpload] = useState(false);
    const [sort, setSort] = useState({ by: 'date', dir: 'desc' });
    // Группировка звонков по клиенту (только для телефонии; контур сейчас отключён)
    const groupByPhone = terms.isTelephony;
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const toggleGroup = useCallback((id) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);
    const [filters, setFilters] = useState({
        store_id: '', seller_id: '', outcome: '', direction: '', source: '',
        score_min: undefined,
        score_max: undefined,
    });
    const { data: conversations, isLoading } = useQuery({
        queryKey: ['conversations', page, pageSize, filters, period, groupByPhone, view, q],
        queryFn: () => dashboardApi.getConversations({
            page, limit: pageSize,
            store_id: filters.store_id || undefined,
            seller_id: filters.seller_id || undefined,
            outcome: filters.outcome || undefined,
            direction: filters.direction || undefined,
            source: filters.source || undefined,
            score_min: filters.score_min,
            score_max: filters.score_max,
            group_by_phone: groupByPhone,
            view: view || undefined,
            q: q || undefined,
            with_counts: true,
            period,
        }),
        refetchInterval: 5000,
        placeholderData: (prev) => prev,
    });
    const { data: recordingsData } = useQuery({
        queryKey: ['recordings-status'],
        queryFn: () => recorderApi.getRecordings({ limit: 50 }),
        refetchInterval: 5000,
    });
    const { data: stores } = useQuery({
        queryKey: ['admin-stores'],
        queryFn: () => adminApi.getStores(),
    });
    // «Отпечатки» строк текущей страницы — одним запросом; данные разговора не меняются
    const convIds = (conversations?.items || []).map((c) => c.id);
    const { data: fingerprints } = useQuery({
        queryKey: ['fingerprints', convIds.join(',')],
        queryFn: () => dashboardApi.getFingerprints(convIds),
        enabled: convIds.length > 0,
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });
    const analyzedIds = new Set((conversations?.items || []).map((c) => c.recording_id).filter(Boolean));
    // «Ожидающие» — записи, ещё не ставшие разговором. Проанализированные (status='analyzed')
    // исключаем: раньше такая запись, чей разговор не попал в текущую страницу/период,
    // ошибочно показывалась как «Анализируется…». Статус 'failed' оставляем — это реальная ошибка.
    // Показываем только на 1-й странице «Всех» без поиска, чтобы не мешали подборкам.
    const pendingRows = page === 1 && !view && !q
        ? (recordingsData?.items || []).filter((r) => !analyzedIds.has(r.id) && r.status !== 'analyzed')
        : [];
    const totalItems = conversations?.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    // Если после удаления страниц стало меньше — не зависаем на пустой странице
    useEffect(() => {
        if (page > totalPages)
            setPage(totalPages);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalPages]);
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
            _date: new Date(c.recorded_at || c.analyzed_at || c.session_date || 0).getTime(),
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
    // ─── Filter metadata ───────────────────────────────────────────────────────
    const scoreValue = filters.score_min === 80 ? '80+' :
        filters.score_min === 60 && filters.score_max === 79 ? '60-79' :
            filters.score_max === 59 ? '<60' : '';
    const sortLabels = {
        date_desc: 'Сначала новые',
        date_asc: 'Сначала старые',
        name_asc: 'Имя А→Я',
        name_desc: 'Имя Я→А',
        duration_desc: 'Длинные сначала',
        duration_asc: 'Короткие сначала',
        store_asc: `${terms.store} А→Я`,
        store_desc: `${terms.store} Я→А`,
    };
    const sortKey = `${sort.by}_${sort.dir}`;
    const sortActive = sortKey !== 'date_desc';
    const hasActiveFilters = !!(filters.store_id || filters.outcome || filters.direction || filters.source || scoreValue || sortActive);
    const resetAll = () => {
        setFilters({ store_id: '', seller_id: '', outcome: '', direction: '', source: '', score_min: undefined, score_max: undefined });
        setSort({ by: 'date', dir: 'desc' });
        setPage(1);
    };
    const drawerTitle = selectedRec ? `Запись #${String(selectedRec.id).slice(0, 8)}` : '';
    const counts = conversations?.view_counts;
    const markTitle = (m) => {
        if (m.k === 'warn' || m.k === 'warn-ok') {
            const what = t(objectionLabel(m.label));
            return m.k === 'warn' ? L(`возражение «${what}» не отработано`, `objection “${what}” unanswered`) : L(`возражение «${what}» отработано`, `objection “${what}” handled`);
        }
        if (m.k === 'ok')
            return t('предложение допродажи');
        return m.label ? t(m.label) : t('нарушение');
    };
    const fmtTime = (d) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const fmtDate = (d) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return (_jsxs("div", { children: [_jsx("div", { className: "views-bar", children: _jsx("div", { className: "tabs", role: "tablist", "aria-label": t('Подборки разговоров'), children: VIEWS.map((v) => {
                        const n = counts ? (v.id ? counts[v.id] : counts.total) : undefined;
                        return (_jsxs("button", { type: "button", role: "tab", "aria-selected": view === v.id, className: `tab ${view === v.id ? 'active' : ''}`, onClick: () => setParam('view', v.id), children: [t(v.label), n != null && _jsx("span", { className: `count ${v.alert && n > 0 ? 'is-alert' : ''}`, children: n.toLocaleString(locale) })] }, v.id || 'all'));
                    }) }) }), _jsxs("div", { className: "conv-filters", children: [_jsxs("label", { className: "input", children: [_jsx(Search, { size: 15, "aria-hidden": "true" }), _jsx("input", { type: "search", value: qInput, onChange: (e) => setQInput(e.target.value), placeholder: t('Фраза из разговора, например «заменим на новый»'), "aria-label": t('Поиск по фразам из разговоров') }), qInput && (_jsx("button", { type: "button", className: "btn-icon", style: { width: 22, height: 22 }, onClick: () => setQInput(''), "aria-label": t('Очистить'), children: _jsx(X, { size: 13 }) }))] }), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: (stores?.items || []).map((s) => ({ id: s.id, label: s.name })), selected: filters.store_id ? [filters.store_id] : [''], onChange: (ids) => { setFilters(p => ({ ...p, store_id: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: terms.allStores }, placeholder: terms.allStores }) }), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: Object.entries(terms.isTelephony ? TELEPHONY_OUTCOME_LABELS : OUTCOME_LABELS).map(([k, l]) => ({ id: k, label: l })), selected: filters.outcome ? [filters.outcome] : [''], onChange: (ids) => { setFilters(p => ({ ...p, outcome: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: 'Все исходы' }, placeholder: "\u0412\u0441\u0435 \u0438\u0441\u0445\u043E\u0434\u044B" }) }), terms.isTelephony && (_jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: [
                                { id: 'inbound', label: 'Входящие' },
                                { id: 'outbound', label: 'Исходящие' },
                            ], selected: filters.direction ? [filters.direction] : [''], onChange: (ids) => { setFilters(p => ({ ...p, direction: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: 'Все направления' }, placeholder: "\u0412\u0441\u0435 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F" }) })), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: [
                                { id: '80+', label: 'Скоринг 80%+' },
                                { id: '60-79', label: 'Скоринг 60–79%' },
                                { id: '<60', label: 'Скоринг < 60%' },
                            ], selected: scoreValue ? [scoreValue] : [''], onChange: (ids) => handleScoreFilter(ids[0] === '' ? '' : ids[0]), prependOption: { id: '', label: 'Любой скоринг' }, placeholder: "\u041B\u044E\u0431\u043E\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }) }), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: Object.entries(sortLabels).map(([k, l]) => ({ id: k, label: l })), selected: [sortKey], onChange: (ids) => {
                                const [by, dir] = (ids[0] || 'date_desc').split('_');
                                setSort({ by, dir });
                            }, placeholder: "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430" }) }), hasActiveFilters && (_jsxs("button", { className: "filter-clear", onClick: resetAll, title: t('Сбросить все фильтры'), children: [_jsx(X, { size: 12 }), " \u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C"] })), _jsxs("div", { className: "conv-actions", children: [_jsxs("button", { className: "btn btn-ghost", onClick: () => setShowTranscriptUpload(true), title: t('Загрузить готовый размеченный диалог — для тестов скоринга и апсейла без аудио'), children: [_jsx(FileText, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u0431\u0430\u0446\u0438\u0438"] }), _jsxs("button", { className: "btn btn-primary", onClick: () => setShowUpload(true), children: [_jsx(Upload, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u0443\u0434\u0438\u043E"] }), terms.isTelephony && (_jsxs("button", { className: "btn btn-primary", onClick: () => setShowCallUpload(true), title: t('Загрузить запись телефонного звонка с метаданными (направление, номер клиента)'), children: [_jsx(Phone, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0432\u043E\u043D\u043E\u043A"] }))] })] }), q && (_jsxs("div", { className: "search-note", role: "status", children: [_jsx(Search, { size: 16, "aria-hidden": "true" }), _jsxs("span", { children: [L('Фраза', 'Phrase'), " ", _jsxs("b", { translate: "no", children: ["\u00AB", q, "\u00BB"] }), " \u2014 ", L(`нашлась в ${totalItems} разговорах`, `found in ${totalItems} conversations`)] }), _jsx("button", { className: "btn btn-sm", onClick: () => setQInput(''), children: t('Сбросить') })] })), _jsx(AudioUploadModal, { open: showUpload, onClose: () => setShowUpload(false), onUploadComplete: () => { } }), _jsx(TranscriptUploadModal, { open: showTranscriptUpload, onClose: () => setShowTranscriptUpload(false), onUploadComplete: () => { } }), _jsx(CallUploadModal, { open: showCallUpload, onClose: () => setShowCallUpload(false), onUploadComplete: () => { } }), _jsxs("div", { className: "card", style: { padding: 0 }, children: [!isLoading && sortedRows.length === 0 ? (_jsxs("div", { className: "empty", children: [_jsx("h3", { children: q || view ? t('Ничего не нашлось') : t('Разговоров пока нет') }), _jsx("p", { children: q || view ? t('Попробуйте другую фразу, подборку или период.') : t('Записи появятся после выгрузки бейджей или загрузки аудио.') }), (q || view) && (_jsx("button", { className: "btn btn-sm", onClick: () => { setQInput(''); setParam('view', ''); }, children: t('Показать все разговоры') }))] })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "conv-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "c-when", children: t('Когда') }), _jsx("th", { className: "c-seller", children: terms.seller }), _jsx("th", { className: "c-topic", children: t('Тема и события') }), _jsx("th", { className: "c-fp", children: t('Разговор') }), _jsx("th", { className: "c-score", children: t('Балл') }), _jsx("th", { className: "c-up", children: t('Допродажа') }), _jsx("th", { className: "c-out", children: t('Исход') }), _jsx("th", { className: "c-go", children: _jsx("span", { className: "sr-only", children: t('Открыть') }) })] }) }), _jsx("tbody", { children: sortedRows.map((row) => {
                                        const dateObj = row._date ? new Date(row._date) : null;
                                        const durStr = row._duration ? clock(row._duration) : '—';
                                        if (row._type === 'pending') {
                                            const sellerName = row.seller_name || '—';
                                            return (_jsxs("tr", { onClick: () => setSelectedRec(row), className: selectedRec?.id === row.id ? 'is-selected' : undefined, children: [_jsx("td", { className: "c-when", children: dateObj ? _jsxs(_Fragment, { children: [_jsx("b", { children: fmtTime(dateObj) }), _jsx("span", { children: fmtDate(dateObj) })] }) : '—' }), _jsx("td", { className: "c-seller", children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initialsOf(row.seller_name) }), _jsxs("span", { className: "ellipsis", children: [_jsx("span", { className: "person-name ellipsis", translate: "no", children: sellerName }), row.store_name && _jsx("span", { className: "person-sub ellipsis", translate: "no", children: row.store_name })] })] }) }), _jsx("td", { className: "c-topic", children: _jsx("div", { className: "topic-title is-empty", children: t('Разговор обрабатывается') }) }), _jsx("td", { className: "c-fp", children: _jsxs("div", { className: "fp-row", children: [_jsx(Fingerprint, { data: null }), _jsx("span", { className: "fp-dur", children: durStr })] }) }), _jsx("td", { className: "c-score", children: _jsx("span", { className: "muted", children: "\u2014" }) }), _jsx("td", { className: "c-up", children: _jsx("span", { className: "muted", children: "\u2014" }) }), _jsx("td", { className: "c-out", children: _jsx(PipelineStatus, { status: row.status }) }), _jsx("td", { className: "c-go", children: _jsx(ChevronRight, { size: 16 }) })] }, row.id));
                                        }
                                        const groupCount = row.group_count || 1;
                                        const isExpanded = expandedGroups.has(row.id);
                                        const notScored = row.is_scorable === false;
                                        return (_jsxs(Fragment, { children: [_jsxs("tr", { tabIndex: 0, className: quickId === row.id ? 'is-selected' : undefined, "aria-label": L(`${row.topic || 'Разговор'}, ${row.seller_name || ''}. Открыть быстрый просмотр`, `${row.topic || 'Conversation'}, ${row.seller_name || ''}. Open quick view`), onClick: (e) => {
                                                        // Ctrl/⌘-клик — сразу полная карточка, обычный — быстрый просмотр
                                                        if (e.metaKey || e.ctrlKey) {
                                                            window.open(`/conversations/${row.id}`, '_blank');
                                                            return;
                                                        }
                                                        setQuick(row.id);
                                                    }, onKeyDown: (e) => {
                                                        if (e.target !== e.currentTarget)
                                                            return;
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setQuick(row.id);
                                                        }
                                                    }, children: [_jsx("td", { className: "c-when", children: _jsxs("span", { style: { display: 'inline-flex', alignItems: 'flex-start', gap: 6 }, title: row.client_phone ? `${row.call_direction === 'inbound' ? 'Входящий' : 'Исходящий'} · ${row.client_phone}` : undefined, children: [groupCount > 1 && (_jsxs("button", { onClick: (e) => { e.stopPropagation(); toggleGroup(row.id); }, title: `${groupCount} звонков от этого клиента`, style: { display: 'inline-flex', alignItems: 'center', gap: 1, color: 'var(--accent)', flexShrink: 0 }, children: [_jsx(ChevronRight, { size: 14, style: { transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' } }), _jsx("span", { style: { fontSize: 11, fontWeight: 700 }, children: groupCount })] })), terms.isTelephony && row.call_direction && _jsx(DirectionIcon, { direction: row.call_direction }), _jsx("span", { children: dateObj ? _jsxs(_Fragment, { children: [_jsx("b", { children: fmtTime(dateObj) }), _jsx("span", { children: fmtDate(dateObj) })] }) : '—' })] }) }), _jsx("td", { className: "c-seller", children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initialsOf(row.seller_name) }), _jsxs("span", { className: "ellipsis", children: [_jsx("span", { className: "person-name ellipsis", translate: "no", children: row.seller_name || '—' }), row.store_name && _jsx("span", { className: "person-sub ellipsis", translate: "no", children: row.store_name })] })] }) }), _jsxs("td", { className: "c-topic", children: [_jsx("div", { className: `topic-title ${row.topic ? '' : 'is-empty'}`, translate: row.topic ? 'no' : undefined, children: row.topic || t('Без темы') }), (row.top_violation || row.open_objection || notScored) && (_jsxs("div", { className: "topic-flags", children: [row.top_violation && (_jsxs("span", { className: `flag ${row.top_violation_severity === 'high' ? 'is-crit' : 'is-warn'}`, children: [_jsx(ShieldAlert, { "aria-hidden": "true" }), row.top_violation] })), row.open_objection && (_jsxs("span", { className: "flag is-warn", children: [_jsx(MessageCircleWarning, { "aria-hidden": "true" }), L(`«${objectionLabel(row.open_objection)}» без ответа`, `“${t(objectionLabel(row.open_objection))}” unanswered`)] })), notScored && (_jsx("span", { className: "flag is-plain", title: `Категория: ${CALL_CATEGORY_LABELS[row.call_category] || row.call_category || 'нецелевой'}. Не влияет на рейтинг.`, children: "\u041D\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u0435\u0442\u0441\u044F" }))] })), row.hit && (_jsxs("div", { className: "hit", children: [_jsx("span", { className: "mono", children: clock(row.hit.t) }), _jsxs("span", { translate: "no", children: ["\u00AB", _jsx(HitText, { text: row.hit.text, q: q }), "\u00BB"] })] }))] }), _jsx("td", { className: "c-fp", children: _jsxs("div", { className: "fp-row", children: [_jsx(Fingerprint, { data: fingerprints?.[row.id], markTitle: markTitle }), _jsx("span", { className: "fp-dur", children: durStr })] }) }), _jsx("td", { className: "c-score", children: notScored ? _jsx("span", { className: "muted", children: "\u2014" }) : _jsx(Meter, { score: row.overall_score }) }), _jsx("td", { className: "c-up", children: notScored ? _jsx("span", { className: "muted", children: "\u2014" }) : _jsx(UpsellDots, { value: row.upsell }) }), _jsx("td", { className: "c-out", children: _jsx(OutcomeTag, { outcome: row.outcome }) }), _jsx("td", { className: "c-go", children: _jsx(ChevronRight, { size: 16 }) })] }), isExpanded && groupCount > 1 && (_jsx(GroupChildRows, { conversationId: row.id, selectedConvId: null, onSelect: openConversation }))] }, row.id));
                                    }) })] }) })), _jsxs("div", { className: "table-foot", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { children: t('Показывать:') }), _jsx("select", { value: pageSize, onChange: (e) => { setPageSize(Number(e.target.value)); setPage(1); }, className: "select-pill", style: { height: 30 }, children: [20, 50, 100].map(n => _jsx("option", { value: n, children: n }, n)) }), _jsx("span", { children: L(`· всего ${totalItems}`, `· ${totalItems} total`) })] }), _jsxs("nav", { className: "pager", "aria-label": t('Страницы'), children: [_jsx("button", { onClick: () => setPage(Math.max(1, page - 1)), disabled: page === 1, "aria-label": t('Назад'), children: "\u2190" }), buildPageList(page, totalPages).map((p, i) => (p === '…'
                                        ? _jsx("span", { style: { padding: '0 4px' }, children: "\u2026" }, `e${i}`)
                                        : _jsx("button", { "aria-current": p === page ? 'page' : undefined, onClick: () => setPage(p), children: p }, p))), _jsx("button", { onClick: () => setPage(Math.min(totalPages, page + 1)), disabled: page >= totalPages, "aria-label": t('Вперёд'), children: "\u2192" })] })] })] }), _jsx(QuickView, { id: quickId, row: (conversations?.items || []).find((c) => c.id === quickId), fingerprint: quickId ? fingerprints?.[quickId] : null, markTitle: markTitle, onClose: closeQuick }), _jsx(Drawer, { isOpen: !!selectedRec, onClose: () => setSelectedRec(null), title: drawerTitle, children: selectedRec && _jsx(RecordingDetail, { recording: selectedRec }) })] }));
}
