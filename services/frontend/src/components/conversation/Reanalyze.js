import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader, RotateCcw } from 'lucide-react';
import { analyticsApi } from '@/api/analytics';
import { toast } from '@/components/ui/Toast';
import { t } from '@/i18n';
/* «Перезапустить анализ»: запись снова уходит в очередь анализа. Воркер удаляет
   разговор и создаёт новый с другим id, поэтому ждём его по записи и открываем. */
const POLL_MS = 5000;
const WAIT_MS = 5 * 60 * 1000;
export function ReanalyzeButton({ conversationId, recordingId }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [running, setRunning] = useState(false);
    const timer = useRef(0);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    if (!recordingId)
        return null;
    const start = async () => {
        if (!window.confirm(t('Перезапустить анализ? Исход, балл и разбор посчитаются заново, план разбора сохранится.')))
            return;
        setRunning(true);
        try {
            await analyticsApi.reanalyze(recordingId);
        }
        catch {
            setRunning(false);
            toast(t('Не удалось запустить анализ'));
            return;
        }
        toast(t('Анализ запущен, обычно это занимает до минуты'));
        const deadline = Date.now() + WAIT_MS;
        const poll = async () => {
            const fresh = await analyticsApi.findByRecording(recordingId).catch(() => null);
            if (fresh && fresh.id !== conversationId) {
                setRunning(false);
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
                toast(t('Анализ готов'));
                navigate(`/conversations/${fresh.id}`, { replace: true });
                return;
            }
            if (Date.now() > deadline) {
                setRunning(false);
                toast(t('Анализ ещё идёт — обновите список разговоров позже'));
                return;
            }
            timer.current = window.setTimeout(poll, POLL_MS);
        };
        timer.current = window.setTimeout(poll, POLL_MS);
    };
    return (_jsxs("button", { type: "button", className: "btn", onClick: start, disabled: running, children: [running ? _jsx(Loader, { size: 15, className: "spin", "aria-hidden": "true" }) : _jsx(RotateCcw, { size: 15, "aria-hidden": "true" }), running ? t('Анализ идёт…') : t('Перезапустить анализ')] }));
}
