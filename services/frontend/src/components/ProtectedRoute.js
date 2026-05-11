import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
export function ProtectedRoute() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
    if (!isAuthenticated) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    return _jsx(Outlet, {});
}
