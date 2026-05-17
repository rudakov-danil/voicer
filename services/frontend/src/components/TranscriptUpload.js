import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { transcriptionApi } from '@/api/transcription';
const SAMPLE_TEXT = `Продавец: Здравствуйте, добро пожаловать в автосалон, меня зовут Михаил. Чем могу помочь?
Клиент: Здравствуйте, мы с супругой подбираем семейный автомобиль до миллиона рублей.
Продавец: Отлично, у нас как раз есть несколько хороших вариантов в этом бюджете.
Клиент: А полный привод можно?
Продавец: В этом бюджете полного привода не будет, но есть очень экономичные машины с передним приводом.`;
export function TranscriptUploadModal({ open, onClose, onUploadComplete }) {
    const [rawText, setRawText] = useState('');
    const [sellerId, setSellerId] = useState('');
    const [storeId, setStoreId] = useState('');
    const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
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
    // Простая live-валидация: считаем сколько строк начинается с "Продавец:" / "Клиент:"
    const lineStats = (() => {
        let seller = 0, customer = 0;
        for (const line of rawText.split('\n')) {
            const m = line.match(/^\s*([A-Za-zА-Яа-яЁё]+)\s*[:\-—–]/);
            if (!m)
                continue;
            const label = m[1].toLowerCase();
            if (['продавец', 'продавца', 'менеджер', 'консультант', 'оператор', 'seller', 's'].includes(label))
                seller++;
            else if (['клиент', 'покупатель', 'customer', 'client', 'c'].includes(label))
                customer++;
        }
        return { seller, customer };
    })();
    const handleClose = () => {
        setRawText('');
        setSellerId('');
        setStoreId('');
        setSessionDate(new Date().toISOString().split('T')[0]);
        setStatus('idle');
        setErrorMsg('');
        onClose();
    };
    const handleUpload = async () => {
        if (!sellerId || !storeId || !rawText.trim())
            return;
        setStatus('uploading');
        setErrorMsg('');
        try {
            await transcriptionApi.uploadTranscript({
                seller_id: sellerId,
                store_id: storeId,
                session_date: sessionDate,
                raw_text: rawText,
            });
            setStatus('success');
            setTimeout(() => {
                onUploadComplete?.();
                handleClose();
            }, 1500);
        }
        catch (err) {
            setStatus('error');
            setErrorMsg(err?.response?.data?.detail || 'Ошибка загрузки');
        }
    };
    if (!open)
        return null;
    const canSubmit = !!storeId && !!sellerId && rawText.trim().length > 0 &&
        (lineStats.seller + lineStats.customer) >= 2 &&
        status !== 'uploading' && status !== 'success';
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }, onClick: handleClose, children: _jsxs("div", { style: {
                background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                width: 680, maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: {
                        padding: '20px 24px', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx(FileText, { size: 18, style: { color: 'var(--primary)' } }), _jsx("div", { style: { fontSize: '16px', fontWeight: 600, color: 'var(--text)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u0431\u0430\u0446\u0438\u0438 (\u0434\u043B\u044F \u0442\u0435\u0441\u0442\u043E\u0432)" })] }), _jsx("button", { className: "icon-btn", onClick: handleClose, style: { width: 32, height: 32 }, children: _jsx(X, { size: 18 }) })] }), _jsxs("div", { style: { padding: '24px', overflowY: 'auto', flex: 1 }, children: [_jsxs("div", { style: {
                                fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5,
                                padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)',
                            }, children: ["\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0438\u0430\u043B\u043E\u0433 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 ", _jsx("b", { children: "\u00AB\u0420\u043E\u043B\u044C: \u0442\u0435\u043A\u0441\u0442\u00BB" }), ", \u043A\u0430\u0436\u0434\u0430\u044F \u0440\u0435\u043F\u043B\u0438\u043A\u0430 \u043D\u0430 \u043D\u043E\u0432\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u0435. \u0414\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0435 \u0440\u043E\u043B\u0438: ", _jsx("code", { children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), ", ", _jsx("code", { children: "\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440" }), ", ", _jsx("code", { children: "\u041A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u043D\u0442" }), ",", ' ', _jsx("code", { children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), ", ", _jsx("code", { children: "\u041F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044C" }), ". \u0417\u0430\u043F\u0438\u0441\u044C \u043F\u043E\u043F\u0430\u0434\u0451\u0442 \u0441\u0440\u0430\u0437\u0443 \u0432 \u0430\u043D\u0430\u043B\u0438\u0437 (\u0441\u043A\u043E\u0440\u0438\u043D\u0433 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432, \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F, \u0430\u043F\u0441\u0435\u0439\u043B/\u043A\u0440\u043E\u0441\u0441-\u0441\u0435\u0439\u043B)."] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsxs("select", { className: "form-input", value: storeId, onChange: (e) => { setStoreId(e.target.value); setSellerId(''); }, children: [_jsx("option", { value: "", children: "\u2014" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsxs("select", { className: "form-input", value: sellerId, onChange: (e) => setSellerId(e.target.value), disabled: !storeId, children: [_jsx("option", { value: "", children: "\u2014" }), sellers.map((s) => _jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u0414\u0430\u0442\u0430" }), _jsx("input", { className: "form-input", type: "date", value: sessionDate, onChange: (e) => setSessionDate(e.target.value) })] })] }), _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsx("label", { className: "form-label", style: { margin: 0 }, children: "\u0422\u0435\u043A\u0441\u0442 \u0434\u0438\u0430\u043B\u043E\u0433\u0430" }), _jsx("button", { type: "button", onClick: () => setRawText(SAMPLE_TEXT), style: {
                                                fontSize: 11, color: 'var(--primary)', background: 'none',
                                                border: 'none', cursor: 'pointer', padding: 0,
                                            }, children: "\u041F\u043E\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u0438\u043C\u0435\u0440" })] }), _jsx("textarea", { className: "form-input", value: rawText, onChange: (e) => setRawText(e.target.value), placeholder: 'Продавец: Здравствуйте...\nКлиент: Здравствуйте, мне нужно...', rows: 14, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical' } }), _jsxs("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 16 }, children: [_jsxs("span", { children: ["\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446: ", _jsx("b", { children: lineStats.seller })] }), _jsxs("span", { children: ["\u041A\u043B\u0438\u0435\u043D\u0442: ", _jsx("b", { children: lineStats.customer })] })] })] }), status === 'success' && (_jsxs("div", { style: { marginTop: 16, textAlign: 'center', padding: '12px' }, children: [_jsx(CheckCircle, { size: 32, style: { color: 'var(--success)', marginBottom: 6 } }), _jsx("div", { style: { fontSize: 14, color: 'var(--success)', fontWeight: 500 }, children: "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442 \u043F\u0440\u0438\u043D\u044F\u0442, \u0438\u0434\u0451\u0442 \u0430\u043D\u0430\u043B\u0438\u0437" })] })), status === 'error' && errorMsg && (_jsxs("div", { style: {
                                display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
                                padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)',
                                color: 'var(--danger)', fontSize: 13,
                            }, children: [_jsx(AlertCircle, { size: 16 }), " ", errorMsg] }))] }), _jsxs("div", { style: {
                        padding: '16px 24px', borderTop: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'flex-end', gap: 8,
                    }, children: [_jsx("button", { className: "btn btn-sm", onClick: handleClose, style: { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: handleUpload, disabled: !canSubmit, children: status === 'uploading' ? 'Отправка...' : 'Отправить на анализ' })] })] }) }));
}
