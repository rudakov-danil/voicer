import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { VoicerLogo } from '@/components/VoicerLogo';
import { t, L, isEn, setLang } from '@/i18n';
// Витрины под отрасль на поддоменах: тот же кабинет, своя подпись. Какие данные открыть, решает
// auth-service по домену (DOMAIN_ORGS): horeca. — демо кофеен, pharma. и apteka. — демо аптек, medicine. — демо клиник.
const SHOWCASES = {
    horeca: { title: 'Voicer — HoReCa', sub: ['Допродажи у стойки: речевая аналитика для кофеен', 'Counter upsells: speech analytics for coffee shops'] },
    pharma: { title: 'Voicer — Аптеки', sub: ['Речевая аналитика для аптек: допродажи и спрос, которого не было в наличии', 'Speech analytics for pharmacies: add-ons and unmet demand'] },
    apteka: { title: 'Voicer — Аптеки', sub: ['Речевая аналитика для аптек: допродажи и спрос, которого не было в наличии', 'Speech analytics for pharmacies: add-ons and unmet demand'] },
    medicine: { title: 'Voicer — Клиники', sub: ['Протоколы приёмов и контроль качества работы врачей', 'Visit notes and quality control of doctors’ work'] },
};
const SHOWCASE = typeof window !== 'undefined' ? SHOWCASES[window.location.hostname.split('.')[0]] : undefined;
if (SHOWCASE)
    document.title = SHOWCASE.title;
const loginSchema = z.object({
    email: z.string().email('Некорректный email'),
    password: z.string().min(6, 'Пароль должен быть не менее 6 символов')
});
export function LoginPage() {
    const navigate = useNavigate();
    const setTokens = useAuthStore((s) => s.setTokens);
    const setUser = useAuthStore((s) => s.setUser);
    const [generalError, setGeneralError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm({
        resolver: zodResolver(loginSchema)
    });
    const onSubmit = async (data) => {
        try {
            setLoading(true);
            setGeneralError('');
            const response = await authApi.login(data);
            setTokens(response.access_token, response.refresh_token);
            setUser(response.user);
            navigate('/');
        }
        catch (error) {
            if (error.response?.status === 401) {
                setGeneralError('Неверный email или пароль');
            }
            else {
                setGeneralError('Ошибка соединения с сервером');
            }
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "login-page", children: [_jsx("button", { type: "button", className: "lang-btn login-lang", translate: "no", "aria-label": isEn ? 'Переключить на русский' : 'Switch to English', onClick: () => setLang(isEn ? 'ru' : 'en'), children: isEn ? 'RU' : 'EN' }), _jsxs("div", { className: "login-card", children: [_jsxs("div", { className: "login-brand", children: [_jsx(VoicerLogo, { size: 28 }), _jsx("span", { className: "brand-name", translate: "no", children: t('Войсер') })] }), _jsx("p", { className: "login-sub", children: SHOWCASE ? L(...SHOWCASE.sub) : 'Речевая аналитика для розницы' }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", children: "Email" }), _jsx("input", { type: "email", className: "form-input", placeholder: "name@example.com", autoComplete: "username", ...register('email') }), errors.email && (_jsx("p", { className: "login-error-text", children: errors.email.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", children: "\u041F\u0430\u0440\u043E\u043B\u044C" }), _jsx("input", { type: "password", className: "form-input", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", autoComplete: "current-password", ...register('password') }), errors.password && (_jsx("p", { className: "login-error-text", children: errors.password.message }))] }), generalError && _jsx("div", { className: "login-error", children: generalError }), _jsx("button", { type: "submit", className: "btn btn-primary", style: { width: '100%', height: 38 }, disabled: loading, children: loading ? 'Вход...' : 'Войти' })] })] })] }));
}
