import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { LayoutGrid, Mic2, Users, CheckSquare, BarChart3, Globe, GraduationCap, Shield, Settings as SettingsIcon, LogOut, ChevronUp, Wrench } from 'lucide-react';
const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];
export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const isActive = (path) => location.pathname === path;
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const isAdmin = user?.role === 'director' || user?.role === 'admin';
    const navigationItems = [
        { path: '/dashboard', label: 'Обзор', icon: LayoutGrid, group: 'Основное' },
        { path: '/conversations', label: 'Разговоры', icon: Mic2, group: 'Основное' },
        { path: '/team', label: 'Команда', icon: Users, group: 'Основное' },
        { path: '/scripts', label: 'Скрипты', icon: CheckSquare, group: 'Основное' },
        { path: '/analytics', label: 'Аналитика', icon: BarChart3, group: 'Аналитика' },
        { path: '/intelligence', label: 'Разведка', icon: Globe, group: 'Аналитика' },
        { path: '/training', label: 'Обучение', icon: GraduationCap, group: 'Управление' },
        { path: '/compliance', label: 'Комплаенс', icon: Shield, group: 'Управление' },
        { path: '/settings', label: 'Настройки', icon: SettingsIcon, group: 'Управление' }
    ];
    const groupedItems = navigationItems.reduce((acc, item) => {
        if (!acc[item.group])
            acc[item.group] = [];
        acc[item.group].push(item);
        return acc;
    }, {});
    const getInitials = () => {
        if (!user)
            return '?';
        return (user.first_name[0] + user.last_name[0]).toUpperCase();
    };
    const getAvatarColor = () => {
        if (!user)
            return COLORS[0];
        const index = user.id.charCodeAt(0) % COLORS.length;
        return COLORS[index];
    };
    return (_jsxs("div", { className: "sidebar", children: [_jsx("div", { className: "sidebar-header", children: _jsxs("div", { className: "logo", children: [_jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", children: [_jsx("rect", { x: "2", y: "2", width: "8", height: "8", fill: "#2563EB", rx: "2" }), _jsx("rect", { x: "14", y: "2", width: "8", height: "8", fill: "#60A5FA", rx: "2" }), _jsx("rect", { x: "2", y: "14", width: "8", height: "8", fill: "#60A5FA", rx: "2" }), _jsx("rect", { x: "14", y: "14", width: "8", height: "8", fill: "#2563EB", rx: "2" })] }), _jsx("span", { className: "logo-text", children: "VoiceIQ" })] }) }), _jsx("nav", { className: "sidebar-nav", children: Object.entries(groupedItems).map(([group, items]) => (_jsxs("div", { children: [_jsx("div", { className: "nav-group-label", children: group }), items.map((item) => (_jsxs("button", { onClick: () => navigate(item.path), className: `nav-item ${isActive(item.path) ? 'active' : ''}`, children: [_jsx(item.icon, { size: 16 }), item.label] }, item.path)))] }, group))) }), _jsxs("div", { className: "sidebar-footer", ref: menuRef, style: { position: 'relative' }, children: [menuOpen && (_jsxs("div", { style: {
                            position: 'absolute', bottom: '100%', left: 8, right: 8,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
                            overflow: 'hidden', zIndex: 50, marginBottom: 4,
                        }, children: [isAdmin && (_jsxs("button", { onClick: () => { navigate('/admin'); setMenuOpen(false); }, style: {
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    width: '100%', padding: '10px 14px', border: 'none',
                                    background: isActive('/admin') ? 'var(--bg)' : 'transparent',
                                    color: 'var(--text)', cursor: 'pointer', fontSize: 13,
                                    textAlign: 'left',
                                }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--bg)'), onMouseLeave: (e) => (e.currentTarget.style.background = isActive('/admin') ? 'var(--bg)' : 'transparent'), children: [_jsx(Wrench, { size: 14 }), "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435"] })), _jsxs("button", { onClick: () => { logout(); navigate('/login'); }, style: {
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    width: '100%', padding: '10px 14px', border: 'none',
                                    background: 'transparent', color: 'var(--danger)',
                                    cursor: 'pointer', fontSize: 13, textAlign: 'left',
                                    borderTop: isAdmin ? '1px solid var(--border)' : 'none',
                                }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--bg)'), onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'), children: [_jsx(LogOut, { size: 14 }), "\u0412\u044B\u0439\u0442\u0438"] })] })), _jsxs("div", { className: "user-info", style: { cursor: 'pointer' }, onClick: () => setMenuOpen(!menuOpen), children: [_jsx("div", { className: "user-avatar", style: { background: getAvatarColor() }, children: getInitials() }), _jsxs("div", { className: "user-meta", children: [_jsxs("div", { className: "user-name", children: [user?.first_name, " ", user?.last_name] }), _jsx("div", { className: "user-role", children: user?.role === 'director' ? 'Директор' : user?.role === 'admin' ? 'Админ' : user?.role === 'rop' ? 'РОП' : 'Менеджер' })] }), _jsx("div", { className: "icon-btn user-more", style: { transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }, children: _jsx(ChevronUp, { size: 16 }) })] })] })] }));
}
