import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '@/api/dashboard';
import { Drawer } from '@/components/Drawer';
import { ScoreBadge } from '@/components/ScoreBadge';
import { OutcomeTag } from '@/components/OutcomeTag';
import { AlertCircle, Info, ExternalLink } from 'lucide-react';
const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];
export function SellerDrawer({ sellerId, onClose, period }) {
    const navigate = useNavigate();
    const { data, isLoading } = useQuery({
        queryKey: ['seller-detail', sellerId, period],
        queryFn: () => dashboardApi.getSellerDetail(sellerId, { period }),
        enabled: !!sellerId,
    });
    const profile = data?.seller;
    const stats = data?.stats;
    const displayName = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Без имени'
        : 'Профиль продавца';
    return (_jsxs(Drawer, { isOpen: !!sellerId, onClose: onClose, title: displayName, children: [isLoading && _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }), data && profile && stats && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '20px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [_jsxs("div", { style: {
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: AVATAR_COLORS[(profile.first_name?.charCodeAt(0) || 0) % AVATAR_COLORS.length],
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '20px', fontWeight: 700,
                                }, children: [(profile.first_name?.[0] || '?'), (profile.last_name?.[0] || '')] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: '18px', fontWeight: 600, color: 'var(--text)' }, children: displayName }), _jsx("div", { style: { fontSize: '13px', color: 'var(--text-muted)' }, children: profile.store_name || '—' })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }, children: [_jsxs("div", { className: "metric-card", style: { padding: '14px' }, children: [_jsx("div", { className: "metric-label", children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F" }), _jsxs("div", { className: "metric-value", style: { fontSize: '22px' }, children: [Math.round((stats.conversion_rate || 0) * 100), "%"] }), _jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }, children: "\u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432 \u0441 \u043F\u043E\u043A\u0443\u043F\u043A\u043E\u0439" })] }), _jsxs("div", { className: "metric-card", style: { padding: '14px' }, children: [_jsx("div", { className: "metric-label", children: "\u0421\u043A\u043E\u0440\u0438\u043D\u0433 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsxs("div", { className: "metric-value", style: { fontSize: '22px' }, children: [Math.round(stats.avg_score || 0), "%"] }), stats.score_trend !== 0 && (_jsxs("div", { className: `metric-change ${stats.score_trend > 0 ? 'up' : 'down'}`, children: [stats.score_trend > 0 ? '↑' : '↓', " ", Math.abs(stats.score_trend), "% vs \u043F\u0440\u0435\u0434."] }))] }), _jsxs("div", { className: "metric-card", style: { padding: '14px' }, children: [_jsx("div", { className: "metric-label", children: "\u0421\u0438\u043B\u044C\u043D\u044B\u0445 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("div", { className: "metric-value", style: { fontSize: '22px', color: 'var(--success)' }, children: stats.strong_count }), _jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }, children: "\u0441\u043A\u043E\u0440\u0438\u043D\u0433 \u2265 70%" })] }), _jsxs("div", { className: "metric-card", style: { padding: '14px' }, children: [_jsx("div", { className: "metric-label", children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439 \u043A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441\u0430" }), _jsx("div", { className: "metric-value", style: {
                                            fontSize: '22px',
                                            color: stats.compliance_violations_count > 0 ? 'var(--danger)' : 'var(--text)',
                                        }, children: stats.compliance_violations_count }), _jsxs("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }, children: ["\u0432 ", stats.total_conversations, " \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u0445"] })] })] }), data.stage_breakdown.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }, children: "\u042D\u0442\u0430\u043F\u044B \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u2014 \u0437\u043E\u043D\u044B \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u044F" }), data.stage_breakdown.map((group) => (_jsxs("div", { style: { marginBottom: 16 }, children: [data.stage_breakdown.length > 1 && (_jsx("div", { title: group.script_full_name || undefined, style: {
                                            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                                            textTransform: 'uppercase', letterSpacing: 0.4,
                                            marginBottom: 6, paddingBottom: 4,
                                            borderBottom: '1px solid var(--border-light)',
                                        }, children: group.script_name })), group.steps.map((step, i) => {
                                        const score = Math.round(step.avg_score || 0);
                                        const barColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
                                        return (_jsxs("div", { style: {
                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                padding: '8px 0', borderBottom: '1px solid var(--border-light)',
                                            }, children: [_jsx("div", { style: { flex: 1, fontSize: '13px', color: 'var(--text)' }, children: step.step_name }), _jsx("div", { style: { width: '120px' }, children: _jsx("div", { className: "progress-bar", style: { height: '6px' }, children: _jsx("div", { className: `progress-bar-fill ${barColor}`, style: { width: `${score}%` } }) }) }), _jsxs("div", { style: {
                                                        width: '36px', fontSize: '13px', fontWeight: 600, textAlign: 'right',
                                                        color: score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)',
                                                    }, children: [score, "%"] })] }, i));
                                    })] }, group.script_id || '_')))] })), data.recommendations.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }, children: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u0438 \u043F\u043E \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u044E" }), _jsx("div", { className: "alert-list", children: data.recommendations.map((rec, i) => (_jsxs("div", { className: `alert-item ${rec.severity}`, children: [rec.severity === 'warning' ? (_jsx(AlertCircle, { className: "alert-icon", size: 16 })) : (_jsx(Info, { className: "alert-icon", size: 16 })), _jsx("div", { className: "alert-text", style: { fontSize: '12px' }, children: rec.text })] }, i))) })] })), data.recent_conversations.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }, children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B" }), data.recent_conversations.map((conv) => {
                                const dur = conv.duration_seconds || 0;
                                const mins = Math.floor(dur / 60);
                                const secs = dur % 60;
                                const date = new Date(conv.session_date).toLocaleDateString('ru-RU');
                                return (_jsxs("button", { onClick: () => {
                                        onClose();
                                        navigate(`/conversations?conv=${conv.id}`);
                                    }, style: {
                                        background: 'transparent', border: 'none', textAlign: 'left',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        gap: 8, padding: '10px 0', width: '100%',
                                        borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                                    }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--bg)'), onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'), children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: conv.topic || 'Без темы' }), _jsxs("div", { style: { fontSize: '11px', color: 'var(--text-muted)' }, children: [date, dur > 0 ? ` · ${mins}:${String(secs).padStart(2, '0')}` : ''] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }, children: [_jsx(ScoreBadge, { score: conv.overall_score || 0 }), conv.outcome && _jsx(OutcomeTag, { outcome: conv.outcome }), _jsx(ExternalLink, { size: 13, style: { color: 'var(--text-muted)' } })] })] }, conv.id));
                            })] }))] }))] }));
}
