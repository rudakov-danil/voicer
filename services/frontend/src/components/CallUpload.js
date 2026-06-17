import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, X, PhoneIncoming, PhoneOutgoing, FileAudio } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { recorderApi } from '@/api/recorder';
import { adminApi } from '@/api/admin';
import { useTerms } from '@/lib/terms';
/** Ручная загрузка записи телефонного звонка с метаданными (направление, номер клиента).
 *  Стерео-записи (оператор/клиент в раздельных каналах) распознаются автоматически —
 *  роли в них определяются по каналам без LLM. */
export function CallUploadModal({ open, onClose, onUploadComplete }) {
    const terms = useTerms();
    const fileRef = useRef(null);
    const [file, setFile] = useState(null);
    const [sellerId, setSellerId] = useState('');
    const [storeId, setStoreId] = useState('');
    const [direction, setDirection] = useState('inbound');
    const [clientPhone, setClientPhone] = useState('');
    const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [channelMode, setChannelMode] = useState('auto');
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const { data: storesData } = useQuery({
        queryKey: ['admin-stores'],
        queryFn: () => adminApi.getStores(),
        enabled: open,
    });
    const { data: sellersData } = useQuery({
        queryKey: ['admin-sellers'],
        queryFn: () => adminApi.getSellers(),
        enabled: open,
    });
    const stores = storesData?.items ?? [];
    const sellers = (sellersData?.items ?? []).filter((s) => !storeId || s.store_id === storeId);
    const ALLOWED_EXT = /\.(wav|mp3|ogg)$/i;
    const MAX_SIZE = 500 * 1024 * 1024;
    const handleFileSelect = (e) => {
        const selected = e.target.files?.[0];
        if (!selected)
            return;
        if (!selected.name.match(ALLOWED_EXT)) {
            setErrorMsg('Поддерживаются форматы: WAV, MP3, OGG');
            setStatus('error');
            return;
        }
        if (selected.size > MAX_SIZE) {
            setErrorMsg('Файл слишком большой (макс. 500 МБ)');
            setStatus('error');
            return;
        }
        setFile(selected);
        setStatus('idle');
        setErrorMsg('');
    };
    const handleUpload = async () => {
        if (!file || !sellerId || !storeId)
            return;
        setStatus('uploading');
        setProgress(0);
        try {
            await recorderApi.uploadCall(file, {
                seller_id: sellerId,
                store_id: storeId,
                direction,
                client_phone: clientPhone.trim() || undefined,
                session_date: sessionDate,
                channel_mode: channelMode,
            }, (p) => {
                setProgress(p);
                if (p >= 100)
                    setStatus('processing');
            });
            setStatus('success');
            setTimeout(() => {
                onUploadComplete?.();
                handleClose();
            }, 2000);
        }
        catch (err) {
            setStatus('error');
            setErrorMsg(err?.response?.data?.detail || 'Ошибка загрузки');
        }
    };
    const handleClose = () => {
        setFile(null);
        setSellerId('');
        setStoreId('');
        setDirection('inbound');
        setClientPhone('');
        setSessionDate(new Date().toISOString().split('T')[0]);
        setChannelMode('auto');
        setProgress(0);
        setStatus('idle');
        setErrorMsg('');
        if (fileRef.current)
            fileRef.current.value = '';
        onClose();
    };
    if (!open)
        return null;
    const canSubmit = !!file && !!sellerId && !!storeId && status !== 'uploading' && status !== 'processing' && status !== 'success';
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }, onClick: handleClose, children: _jsxs("div", { style: {
                background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                width: 520, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: {
                        padding: '20px 24px', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx(PhoneIncoming, { size: 18, style: { color: 'var(--primary)' } }), _jsx("div", { style: { fontSize: '16px', fontWeight: 600, color: 'var(--text)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0437\u0432\u043E\u043D\u043A\u0430" })] }), _jsx("button", { className: "icon-btn", onClick: handleClose, style: { width: 32, height: 32 }, children: _jsx(X, { size: 18 }) })] }), _jsxs("div", { style: { padding: '24px' }, children: [_jsx("input", { ref: fileRef, type: "file", accept: ".wav,.mp3,.ogg", onChange: handleFileSelect, style: { display: 'none' } }), !file ? (_jsxs("div", { style: {
                                border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
                                padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                            }, onClick: () => fileRef.current?.click(), onDragOver: (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }, onDragLeave: (e) => { e.currentTarget.style.borderColor = 'var(--border)'; }, onDrop: (e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = 'var(--border)';
                                const dropped = e.dataTransfer.files[0];
                                if (dropped) {
                                    const fakeEvent = { target: { files: [dropped] } };
                                    handleFileSelect(fakeEvent);
                                }
                            }, children: [_jsx(Upload, { size: 32, style: { color: 'var(--text-muted)', marginBottom: 10 } }), _jsx("div", { style: { fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }, children: "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0437\u0430\u043F\u0438\u0441\u044C \u0437\u0432\u043E\u043D\u043A\u0430 \u0438\u043B\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430" }), _jsx("div", { style: { fontSize: '12px', color: 'var(--text-muted)', marginTop: 6 }, children: "WAV, MP3, OGG \u00B7 \u0434\u043E 500 \u041C\u0411 \u00B7 \u0441\u0442\u0435\u0440\u0435\u043E-\u0437\u0430\u043F\u0438\u0441\u0438 \u0410\u0422\u0421 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" })] })) : (_jsxs("div", { style: {
                                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                                background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: 4,
                            }, children: [_jsx(FileAudio, { size: 24, style: { color: 'var(--primary)', flexShrink: 0 } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: file.name }), _jsxs("div", { style: { fontSize: '11px', color: 'var(--text-muted)' }, children: [(file.size / 1024 / 1024).toFixed(1), " \u041C\u0411"] })] }), status === 'idle' && (_jsx("button", { className: "icon-btn", onClick: () => { setFile(null); if (fileRef.current)
                                        fileRef.current.value = ''; }, style: { width: 28, height: 28 }, children: _jsx(X, { size: 14 }) }))] })), _jsxs("div", { style: { marginTop: 20 }, children: [_jsx("label", { className: "form-label", children: "\u041D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0437\u0432\u043E\u043D\u043A\u0430" }), _jsx("div", { style: { display: 'flex', gap: 8 }, children: [
                                        { id: 'inbound', label: 'Входящий', Icon: PhoneIncoming },
                                        { id: 'outbound', label: 'Исходящий', Icon: PhoneOutgoing },
                                    ].map(({ id, label, Icon }) => (_jsxs("button", { type: "button", onClick: () => setDirection(id), style: {
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            padding: '10px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                            border: `1px solid ${direction === id ? 'var(--primary)' : 'var(--border)'}`,
                                            background: direction === id ? 'rgba(99,102,241,0.08)' : 'var(--bg)',
                                            color: direction === id ? 'var(--primary)' : 'var(--text-secondary)',
                                        }, children: [_jsx(Icon, { size: 15 }), " ", label] }, id))) })] }), _jsxs("div", { style: { marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", children: terms.store }), _jsxs("select", { className: "form-input", value: storeId, onChange: (e) => { setStoreId(e.target.value); setSellerId(''); }, children: [_jsx("option", { value: "", children: "\u2014" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: terms.seller }), _jsxs("select", { className: "form-input", value: sellerId, onChange: (e) => setSellerId(e.target.value), disabled: !storeId, children: [_jsx("option", { value: "", children: "\u2014" }), sellers.map((s) => _jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u041D\u043E\u043C\u0435\u0440 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsx("input", { className: "form-input", type: "tel", placeholder: "+7...", value: clientPhone, onChange: (e) => setClientPhone(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u0414\u0430\u0442\u0430 \u0437\u0432\u043E\u043D\u043A\u0430" }), _jsx("input", { className: "form-input", type: "date", value: sessionDate, onChange: (e) => setSessionDate(e.target.value) })] }), _jsxs("div", { style: { gridColumn: '1 / -1' }, children: [_jsx("label", { className: "form-label", children: "\u041A\u0430\u043D\u0430\u043B\u044B \u0437\u0430\u043F\u0438\u0441\u0438" }), _jsxs("select", { className: "form-input", value: channelMode, onChange: (e) => setChannelMode(e.target.value), children: [_jsx("option", { value: "auto", children: "\u0410\u0432\u0442\u043E\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 (\u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F)" }), _jsx("option", { value: "stereo", children: "\u0421\u0442\u0435\u0440\u0435\u043E \u2014 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0438 \u043A\u043B\u0438\u0435\u043D\u0442 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043A\u0430\u043D\u0430\u043B\u0430\u0445" }), _jsx("option", { value: "mono", children: "\u041C\u043E\u043D\u043E \u2014 \u043E\u0431\u0449\u0438\u0439 \u043A\u0430\u043D\u0430\u043B (\u0440\u043E\u043B\u0438 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442 AI)" })] })] })] }), (status === 'uploading' || status === 'processing') && (_jsxs("div", { style: { marginTop: 20 }, children: [_jsx("div", { className: "progress-bar", style: { marginBottom: 8 }, children: _jsx("div", { className: "progress-bar-fill blue", style: {
                                            width: status === 'processing' ? '100%' : `${progress}%`,
                                            transition: 'width 0.3s',
                                        } }) }), _jsx("div", { style: { fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }, children: status === 'uploading' ? `Загрузка файла ${progress}%...` : 'Транскрибация запущена...' })] })), status === 'success' && (_jsxs("div", { style: { marginTop: 20, textAlign: 'center', padding: '12px' }, children: [_jsx(CheckCircle, { size: 36, style: { color: 'var(--success)', marginBottom: 8 } }), _jsx("div", { style: { fontSize: '14px', color: 'var(--success)', fontWeight: 500 }, children: "\u0417\u0432\u043E\u043D\u043E\u043A \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D \u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u043D\u0430 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443" })] })), status === 'error' && errorMsg && (_jsxs("div", { style: {
                                display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
                                padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)',
                                color: 'var(--danger)', fontSize: '13px',
                            }, children: [_jsx(AlertCircle, { size: 16 }), " ", String(errorMsg)] }))] }), _jsxs("div", { style: {
                        padding: '16px 24px', borderTop: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'flex-end', gap: 8,
                    }, children: [_jsx("button", { className: "btn btn-sm", onClick: handleClose, style: { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: handleUpload, disabled: !canSubmit, children: status === 'uploading' ? 'Загрузка...' : status === 'processing' ? 'Обработка...' : 'Загрузить звонок' })] })] }) }));
}
