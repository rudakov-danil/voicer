import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, periodRange } from '@/api/dashboard';
import { adminApi } from '@/api/admin';
import { clinicApi } from '@/api/clinic';
import { LayoutGrid, AudioLines, PackagePlus, PackageSearch, Coins, Users, ScrollText, ShieldAlert, BarChart3, Settings as SettingsIcon, Wrench, LogOut, Stethoscope, ShieldCheck, } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOrganization, useTerms } from '@/lib/terms';
import { VoicerLogo } from '@/components/VoicerLogo';
import { t, L, isEn, setLang, plural } from '@/i18n';
const MAIN = [
    { path: '/dashboard', label: 'Обзор', icon: LayoutGrid },
    { path: '/upsells', label: 'Допродажи', icon: PackagePlus },
    { path: '/motivation', label: 'Мотивация', icon: Coins },
    { path: '/conversations', label: 'Разговоры', icon: AudioLines },
    { path: '/team', label: 'Команда', icon: Users },
    { path: '/scripts', label: 'Скрипты', icon: ScrollText },
];
// Спрос на товары, которых не оказалось, и список к закупке — у аптек
const DEMAND = { path: '/demand', label: 'Спрос', icon: PackageSearch };
const CONTROL = [
    { path: '/compliance', label: 'Комплаенс', icon: ShieldAlert },
    { path: '/analytics', label: 'Аналитика', icon: BarChart3 },
    { path: '/settings', label: 'Настройки', icon: SettingsIcon },
];
const ADMIN = { path: '/admin', label: 'Администрирование', icon: Wrench };
// Клиники: без продаж и скриптов — приёмы, врачи и общие правила контроля качества
const CLINIC_MAIN = [
    { path: '/clinic', label: 'Обзор', icon: LayoutGrid },
    { path: '/visits', label: 'Приёмы', icon: Stethoscope },
    { path: '/doctors', label: 'Врачи', icon: Users },
];
const CLINIC_CONTROL = [
    { path: '/quality-rules', label: 'Правила контроля', icon: ShieldCheck },
    { path: '/settings', label: 'Настройки', icon: SettingsIcon },
];
const CLINIC_VIEWS = [
    { id: 'fraud', label: 'Сигналы фрода', dot: 'var(--crit)' },
    { id: 'issues', label: 'Нарушения', dot: 'var(--warn)' },
    { id: 'low', label: 'Низкое качество', dot: 'var(--warn)' },
    { id: 'draft', label: 'Протокол не подтверждён', dot: 'var(--accent)' },
];
// Подборки разговоров (ui-concept: блок «Подборки» в сайдбаре) — ведут в список с фильтром
const VIEWS = [
    { id: 'attention', label: 'Требуют внимания', dot: 'var(--crit)' },
    { id: 'violations', label: 'Нарушения', dot: 'var(--crit)' },
    { id: 'competitor', label: 'Ушли к конкурентам', dot: 'var(--warn)' },
    { id: 'no_upsell', label: 'Без допродажи', dot: 'var(--accent)' },
    { id: 'unmet_demand', label: 'Нет в наличии', dot: 'var(--warn)' },
];
const ROLE_LABELS = {
    director: 'Директор',
    admin: 'Админ',
    rop: 'РОП',
    manager: 'Менеджер',
};
function initials(text) {
    return text
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}
/** Сайдбар; mobile — только навигация для выпадающего меню мобильной шапки. */
export function Sidebar({ period, mobile, onNavigate }) {
    const location = useLocation();
    const routerNavigate = useNavigate();
    const navigate = (to) => { routerNavigate(to); onNavigate?.(); };
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const { data: org } = useOrganization();
    const terms = useTerms();
    // У кофеен и аптек главный раздел — допродажи: он первым в меню; у аптек следом — «Спрос»
    const base = terms.offersFirst ? [MAIN[1], MAIN[0], ...MAIN.slice(2)] : MAIN;
    const main = terms.isClinic ? CLINIC_MAIN : terms.tracksDemand ? [base[0], DEMAND, ...base.slice(1)] : base;
    // Счётчики подборок — тем же запросом, что вкладки над списком разговоров
    const { data: counts } = useQuery({
        queryKey: ['conversations', 'sidebar-counts', period],
        queryFn: () => dashboardApi.getConversations({ limit: 1, period, with_counts: true }),
        select: (d) => d.view_counts,
        staleTime: 60000,
        enabled: !!org && !terms.isClinic,
    });
    // У клиник подборки — по приёмам, тот же период, что в шапке
    const { data: clinicCounts } = useQuery({
        queryKey: ['clinic-visits', 'sidebar-counts', period],
        queryFn: () => clinicApi.visits({ ...periodRange(period - 1), limit: 1, with_counts: true }),
        select: (d) => d.counts,
        staleTime: 60000,
        enabled: terms.isClinic,
    });
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60000 });
    const storeCount = (stores?.items || []).filter((s) => s.is_active !== false).length;
    const currentView = new URLSearchParams(location.search).get('view');
    const isAdmin = user?.role === 'director' || user?.role === 'admin';
    const controlBase = terms.isClinic ? CLINIC_CONTROL : CONTROL;
    const control = isAdmin ? [...controlBase, ADMIN] : controlBase;
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
    const renderItem = (item) => {
        // На «Разговорах» с подборкой подсвечена подборка, а не пункт меню; у клиник карточка приёма
        // и страница врача подсвечивают свой раздел
        const inSection = terms.isClinic && location.pathname.startsWith(`${item.path}/`);
        const active = (location.pathname === item.path || inSection) && !((item.path === '/conversations' || item.path === '/visits') && currentView);
        const count = item.path === '/conversations' ? counts?.total : item.path === '/visits' ? clinicCounts?.all : undefined;
        return (_jsxs("button", { type: "button", className: "nav-item", "aria-current": active ? 'page' : undefined, title: t(item.label), onClick: () => navigate(item.path), children: [_jsx(item.icon, { "aria-hidden": "true" }), _jsx("span", { children: t(item.label) }), count != null && _jsx("span", { className: "nav-count", children: count.toLocaleString() })] }, item.path));
    };
    const nav = (_jsxs("nav", { className: "nav", "aria-label": t('Разделы'), children: [main.map(renderItem), _jsx("div", { className: "nav-label", children: t('Контроль') }), control.map(renderItem), _jsx("div", { className: "nav-label", children: t('Подборки') }), terms.isClinic && CLINIC_VIEWS.map((v) => {
                const n = clinicCounts?.[v.id];
                const active = location.pathname === '/visits' && currentView === v.id;
                return (_jsxs("button", { type: "button", className: "nav-item nav-view", "aria-current": active ? 'page' : undefined, title: t(v.label), onClick: () => navigate(`/visits?view=${v.id}`), children: [_jsx("span", { className: "nav-dot", style: { background: v.dot }, "aria-hidden": "true" }), _jsx("span", { children: t(v.label) }), n != null && _jsx("span", { className: "nav-count", children: n.toLocaleString() })] }, v.id));
            }), !terms.isClinic && VIEWS.filter((v) => !(terms.offersFirst && v.id === 'competitor') && (v.id !== 'unmet_demand' || terms.tracksDemand)).map((v) => {
                const n = counts?.[v.id];
                const active = location.pathname === '/conversations' && currentView === v.id;
                return (_jsxs("button", { type: "button", className: "nav-item nav-view", "aria-current": active ? 'page' : undefined, title: t(v.label), onClick: () => navigate(`/conversations?view=${v.id}`), children: [_jsx("span", { className: "nav-dot", style: { background: v.dot }, "aria-hidden": "true" }), _jsx("span", { children: t(v.label) }), n != null && _jsx("span", { className: "nav-count", children: n.toLocaleString() })] }, v.id));
            })] }));
    if (mobile)
        return nav;
    return (_jsxs("aside", { className: "sidebar", "aria-label": t('Навигация'), children: [_jsxs("a", { className: "brand", href: "/", onClick: (e) => { e.preventDefault(); navigate('/'); }, children: [_jsx(VoicerLogo, { size: 18 }), _jsx("span", { className: "brand-name", translate: "no", children: t('Войсер') })] }), org && (_jsxs("div", { className: "org-switch", children: [_jsx("span", { className: "org-logo", "aria-hidden": "true", translate: "no", children: initials(org.name) || 'V' }), _jsxs("div", { className: "ellipsis", children: [_jsx("div", { className: "org-name ellipsis", translate: "no", children: org.name }), _jsx("div", { className: "org-unit ellipsis", children: storeCount ? L(`${storeCount} ${plural(storeCount, terms.storeForms, ['', ''])}`, `${storeCount} ${terms.isCafe ? 'location' : terms.isPharmacy ? 'pharmac' : terms.isClinic ? 'clinic' : 'store'}${terms.isPharmacy ? (storeCount === 1 ? 'y' : 'ies') : storeCount === 1 ? '' : 's'}`) : t(terms.isCafe ? 'Кофейни' : terms.isPharmacy ? 'Аптеки' : terms.isClinic ? 'Клиники' : 'Розница') })] })] })), nav, _jsx("div", { className: "sidebar-foot", children: _jsxs("div", { className: "me", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(fullName) || '?' }), _jsxs("div", { className: "me-meta", children: [_jsx("div", { className: "me-name ellipsis", translate: "no", children: fullName || user?.email }), _jsx("div", { className: "me-role", children: t(ROLE_LABELS[user?.role ?? ''] ?? 'Менеджер') })] }), _jsx("button", { type: "button", className: "lang-btn", translate: "no", "aria-label": isEn ? 'Переключить на русский' : 'Switch to English', title: isEn ? 'Переключить на русский' : 'Switch to English', onClick: () => setLang(isEn ? 'ru' : 'en'), children: isEn ? 'RU' : 'EN' }), _jsx("button", { type: "button", className: "btn-icon", "aria-label": t('Выйти'), title: t('Выйти'), onClick: () => { logout(); routerNavigate('/login'); }, children: _jsx(LogOut, { size: 16, "aria-hidden": "true" }) })] }) })] }));
}
