import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
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
            navigate('/dashboard');
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
    return (_jsx("div", { style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'var(--bg)'
        }, children: _jsxs("div", { className: "card", style: { width: '360px' }, children: [_jsxs("div", { style: { textAlign: 'center', marginBottom: '32px' }, children: [_jsxs("svg", { width: "40", height: "40", viewBox: "0 0 24 24", fill: "none", style: { margin: '0 auto 16px' }, children: [_jsx("rect", { x: "2", y: "2", width: "8", height: "8", fill: "#2563EB", rx: "2" }), _jsx("rect", { x: "14", y: "2", width: "8", height: "8", fill: "#60A5FA", rx: "2" }), _jsx("rect", { x: "2", y: "14", width: "8", height: "8", fill: "#60A5FA", rx: "2" }), _jsx("rect", { x: "14", y: "14", width: "8", height: "8", fill: "#2563EB", rx: "2" })] }), _jsx("h1", { style: { fontSize: '24px', fontWeight: 700, color: 'var(--text)' }, children: "VoiceIQ" }), _jsx("p", { style: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }, children: "\u0420\u0435\u0447\u0435\u0432\u0430\u044F \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430 \u0434\u043B\u044F \u0440\u043E\u0437\u043D\u0438\u0446\u044B" })] }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", children: "Email" }), _jsx("input", { type: "email", className: "form-input", placeholder: "name@example.com", ...register('email') }), errors.email && (_jsx("p", { style: { fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }, children: errors.email.message }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", children: "\u041F\u0430\u0440\u043E\u043B\u044C" }), _jsx("input", { type: "password", className: "form-input", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", ...register('password') }), errors.password && (_jsx("p", { style: { fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }, children: errors.password.message }))] }), generalError && (_jsx("div", { style: {
                                fontSize: '13px',
                                color: 'var(--danger)',
                                background: 'var(--danger-light)',
                                border: '1px solid var(--danger-100)',
                                borderRadius: '6px',
                                padding: '10px 12px',
                                marginBottom: '16px'
                            }, children: generalError })), _jsx("button", { type: "submit", className: "btn btn-primary", style: { width: '100%' }, disabled: loading, children: loading ? 'Вход...' : 'Войти' })] }), _jsx("p", { style: {
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        marginTop: '16px'
                    }, children: "\u0422\u0435\u0441\u0442\u043E\u0432\u044B\u0435 \u0443\u0447\u0435\u0442\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435: admin@voiceiq.ru / password123" })] }) }));
}
