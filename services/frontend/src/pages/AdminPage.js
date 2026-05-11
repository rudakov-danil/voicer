import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Store, Building2, Smartphone, Users, Plus, X, Check, Pencil, Power } from 'lucide-react';
const ROLE_LABELS = {
    director: 'Директор', admin: 'Администратор', rop: 'РОП', manager: 'Менеджер',
};
export function AdminPage() {
    const [activeTab, setActiveTab] = useState('stores');
    return (_jsxs("div", { children: [_jsx("div", { className: "tabs fade-in", children: [
                    { key: 'stores', label: 'Магазины', icon: Store },
                    { key: 'sellers', label: 'Продавцы', icon: Building2 },
                    { key: 'devices', label: 'Устройства', icon: Smartphone },
                    { key: 'users', label: 'Пользователи', icon: Users },
                ].map((tab) => (_jsxs("button", { className: `tab ${activeTab === tab.key ? 'active' : ''}`, onClick: () => setActiveTab(tab.key), children: [_jsx(tab.icon, { size: 14, style: { marginRight: 6 } }), tab.label] }, tab.key))) }), activeTab === 'stores' && _jsx(StoresTab, {}), activeTab === 'sellers' && _jsx(SellersTab, {}), activeTab === 'devices' && _jsx(DevicesTab, {}), activeTab === 'users' && _jsx(UsersTab, {})] }));
}
// ─── Inline Form Row ───────────────────────────────────────
function FormRow({ children, onSubmit, onCancel, disabled }) {
    return (_jsxs("div", { style: {
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
        }, children: [children, _jsxs("div", { style: { display: 'flex', gap: 6, paddingBottom: 1 }, children: [_jsx("button", { className: "btn btn-primary btn-sm", onClick: onSubmit, disabled: disabled, style: { height: 38, width: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx(Check, { size: 16 }) }), _jsx("button", { className: "btn btn-sm", onClick: onCancel, style: { height: 38, width: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }, children: _jsx(X, { size: 16 }) })] })] }));
}
function Field({ label, children, flex }) {
    return (_jsxs("div", { style: { flex: flex || '1 1 160px' }, children: [_jsx("label", { className: "form-label", style: { fontSize: 12, marginBottom: 4 }, children: label }), children] }));
}
function StatusTag({ active, labels }) {
    const [on, off] = labels || ['Активен', 'Отключён'];
    return (_jsx("span", { className: `tag ${active ? 'tag-success' : 'tag-danger'}`, children: active ? on : off }));
}
function ActionButtons({ isActive, onEdit, onToggle }) {
    return (_jsxs("div", { style: { display: 'flex', gap: 4, justifyContent: 'flex-end' }, children: [_jsx("button", { className: "icon-btn", title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C", onClick: (e) => { e.stopPropagation(); onEdit(); }, style: { width: 32, height: 32 }, children: _jsx(Pencil, { size: 14 }) }), _jsx("button", { className: "icon-btn", title: isActive ? 'Деактивировать' : 'Активировать', onClick: (e) => { e.stopPropagation(); onToggle(); }, style: { width: 32, height: 32, color: isActive ? 'var(--danger)' : 'var(--success)' }, children: _jsx(Power, { size: 14 }) })] }));
}
// ─── Stores Tab ─────────────────────────────────────────────
function StoresTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ name: '', address: '' });
    const { data, isLoading } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const createMut = useMutation({
        mutationFn: () => adminApi.createStore(form),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-stores'] }); setShowForm(false); setForm({ name: '', address: '' }); },
    });
    const updateMut = useMutation({
        mutationFn: ({ id, data }) => adminApi.updateStore(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-stores'] }); setEditId(null); },
    });
    const stores = data?.items ?? [];
    const startEdit = (s) => {
        setEditId(s.id);
        setForm({ name: s.name, address: s.address || '' });
        setShowForm(false);
    };
    const startCreate = () => {
        setShowForm(true);
        setEditId(null);
        setForm({ name: '', address: '' });
    };
    return (_jsxs("div", { className: "card fade-in", style: { marginTop: 16 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" }), _jsxs("div", { className: "card-subtitle", children: [stores.length, " \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u043E\u0432"] })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: startCreate, children: [_jsx(Plus, { size: 14 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), showForm && (_jsxs(FormRow, { onSubmit: () => createMut.mutate(), onCancel: () => setShowForm(false), disabled: !form.name || createMut.isPending, children: [_jsx(Field, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", children: _jsx("input", { className: "form-input", value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430" }) }), _jsx(Field, { label: "\u0410\u0434\u0440\u0435\u0441", children: _jsx("input", { className: "form-input", value: form.address, onChange: (e) => setForm({ ...form, address: e.target.value }), placeholder: "\u0410\u0434\u0440\u0435\u0441" }) })] })), isLoading ? (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("th", { children: "\u0410\u0434\u0440\u0435\u0441" }), _jsx("th", { children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432" }), _jsx("th", { children: "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { style: { width: 80 } })] }) }), _jsx("tbody", { children: stores.map((s) => (editId === s.id ? (_jsx("tr", { style: { background: 'var(--bg)' }, children: _jsx("td", { colSpan: 6, style: { padding: 0 }, children: _jsxs(FormRow, { onSubmit: () => updateMut.mutate({ id: s.id, data: form }), onCancel: () => setEditId(null), disabled: !form.name || updateMut.isPending, children: [_jsx(Field, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", children: _jsx("input", { className: "form-input", value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) }) }), _jsx(Field, { label: "\u0410\u0434\u0440\u0435\u0441", children: _jsx("input", { className: "form-input", value: form.address, onChange: (e) => setForm({ ...form, address: e.target.value }) }) })] }) }) }, s.id)) : (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: s.name }), _jsx("td", { children: s.address || '—' }), _jsx("td", { children: s.seller_count ?? 0 }), _jsx("td", { children: s.device_count ?? 0 }), _jsx("td", { children: _jsx(StatusTag, { active: s.is_active }) }), _jsx("td", { children: _jsx(ActionButtons, { isActive: s.is_active, onEdit: () => startEdit(s), onToggle: () => updateMut.mutate({ id: s.id, data: { is_active: !s.is_active } }) }) })] }, s.id)))) })] }) }))] }));
}
// ─── Sellers Tab ────────────────────────────────────────────
function SellersTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ store_id: '', first_name: '', last_name: '' });
    const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data, isLoading } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() });
    const createMut = useMutation({
        mutationFn: () => adminApi.createSeller(form),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sellers'] }); setShowForm(false); setForm({ store_id: '', first_name: '', last_name: '' }); },
    });
    const updateMut = useMutation({
        mutationFn: ({ id, data }) => adminApi.updateSeller(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sellers'] }); setEditId(null); },
    });
    const sellers = data?.items ?? [];
    const stores = storesData?.items ?? [];
    const startEdit = (s) => {
        setEditId(s.id);
        setForm({ store_id: s.store_id, first_name: s.first_name, last_name: s.last_name });
        setShowForm(false);
    };
    const startCreate = () => {
        setShowForm(true);
        setEditId(null);
        setForm({ store_id: '', first_name: '', last_name: '' });
    };
    return (_jsxs("div", { className: "card fade-in", style: { marginTop: 16 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0446\u044B" }), _jsxs("div", { className: "card-subtitle", children: [sellers.length, " \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432"] })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: startCreate, children: [_jsx(Plus, { size: 14 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), showForm && (_jsxs(FormRow, { onSubmit: () => createMut.mutate(), onCancel: () => setShowForm(false), disabled: !form.store_id || !form.first_name || createMut.isPending, children: [_jsx(Field, { label: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", children: _jsxs("select", { className: "form-input", value: form.store_id, onChange: (e) => setForm({ ...form, store_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] }) }), _jsx(Field, { label: "\u0418\u043C\u044F", children: _jsx("input", { className: "form-input", value: form.first_name, onChange: (e) => setForm({ ...form, first_name: e.target.value }), placeholder: "\u0418\u043C\u044F" }) }), _jsx(Field, { label: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F", children: _jsx("input", { className: "form-input", value: form.last_name, onChange: (e) => setForm({ ...form, last_name: e.target.value }), placeholder: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F" }) })] })), isLoading ? (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0418\u043C\u044F" }), _jsx("th", { children: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F" }), _jsx("th", { children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { style: { width: 80 } })] }) }), _jsx("tbody", { children: sellers.map((s) => (editId === s.id ? (_jsx("tr", { style: { background: 'var(--bg)' }, children: _jsx("td", { colSpan: 5, style: { padding: 0 }, children: _jsxs(FormRow, { onSubmit: () => updateMut.mutate({ id: s.id, data: form }), onCancel: () => setEditId(null), disabled: !form.first_name || updateMut.isPending, children: [_jsx(Field, { label: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", children: _jsx("select", { className: "form-input", value: form.store_id, onChange: (e) => setForm({ ...form, store_id: e.target.value }), children: stores.map((st) => _jsx("option", { value: st.id, children: st.name }, st.id)) }) }), _jsx(Field, { label: "\u0418\u043C\u044F", children: _jsx("input", { className: "form-input", value: form.first_name, onChange: (e) => setForm({ ...form, first_name: e.target.value }) }) }), _jsx(Field, { label: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F", children: _jsx("input", { className: "form-input", value: form.last_name, onChange: (e) => setForm({ ...form, last_name: e.target.value }) }) })] }) }) }, s.id)) : (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: s.first_name }), _jsx("td", { style: { color: 'var(--text)' }, children: s.last_name }), _jsx("td", { children: s.store_name || stores.find((st) => st.id === s.store_id)?.name || '—' }), _jsx("td", { children: _jsx(StatusTag, { active: s.is_active }) }), _jsx("td", { children: _jsx(ActionButtons, { isActive: s.is_active, onEdit: () => startEdit(s), onToggle: () => updateMut.mutate({ id: s.id, data: { is_active: !s.is_active } }) }) })] }, s.id)))) })] }) }))] }));
}
// ─── Devices Tab ────────────────────────────────────────────
function DevicesTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ store_id: '', seller_id: '', serial_number: '', model: '' });
    const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data: sellersData } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() });
    const { data, isLoading } = useQuery({ queryKey: ['admin-devices'], queryFn: () => adminApi.getDevices() });
    const createMut = useMutation({
        mutationFn: () => adminApi.createDevice({ ...form, seller_id: form.seller_id || undefined }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-devices'] }); setShowForm(false); setForm({ store_id: '', seller_id: '', serial_number: '', model: '' }); },
    });
    const updateMut = useMutation({
        mutationFn: ({ id, data }) => adminApi.updateDevice(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-devices'] }); setEditId(null); },
    });
    const devices = data?.items ?? [];
    const stores = storesData?.items ?? [];
    const sellers = sellersData?.items ?? [];
    const startEdit = (d) => {
        setEditId(d.id);
        setForm({ store_id: d.store_id, seller_id: d.seller_id || '', serial_number: d.serial_number, model: d.model || '' });
        setShowForm(false);
    };
    const startCreate = () => {
        setShowForm(true);
        setEditId(null);
        setForm({ store_id: '', seller_id: '', serial_number: '', model: '' });
    };
    return (_jsxs("div", { className: "card fade-in", style: { marginTop: 16 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430" }), _jsxs("div", { className: "card-subtitle", children: [devices.length, " \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432"] })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: startCreate, children: [_jsx(Plus, { size: 14 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), showForm && (_jsxs(FormRow, { onSubmit: () => createMut.mutate(), onCancel: () => setShowForm(false), disabled: !form.store_id || !form.serial_number || !form.model || createMut.isPending, children: [_jsx(Field, { label: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", children: _jsxs("select", { className: "form-input", value: form.store_id, onChange: (e) => setForm({ ...form, store_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] }) }), _jsx(Field, { label: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 (\u043E\u043F\u0446.)", children: _jsxs("select", { className: "form-input", value: form.seller_id, onChange: (e) => setForm({ ...form, seller_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D" }), sellers.filter((s) => !form.store_id || s.store_id === form.store_id).map((s) => (_jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id)))] }) }), _jsx(Field, { label: "\u0421\u0435\u0440\u0438\u0439\u043D\u044B\u0439 \u043D\u043E\u043C\u0435\u0440", flex: "0 1 150px", children: _jsx("input", { className: "form-input", value: form.serial_number, onChange: (e) => setForm({ ...form, serial_number: e.target.value }), placeholder: "VIQ-XXX" }) }), _jsx(Field, { label: "\u041C\u043E\u0434\u0435\u043B\u044C", flex: "0 1 160px", children: _jsx("input", { className: "form-input", value: form.model, onChange: (e) => setForm({ ...form, model: e.target.value }), placeholder: "VoiceIQ Badge v2" }) })] })), isLoading ? (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0421\u0435\u0440\u0438\u0439\u043D\u044B\u0439 \u043D\u043E\u043C\u0435\u0440" }), _jsx("th", { children: "\u041C\u043E\u0434\u0435\u043B\u044C" }), _jsx("th", { children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsx("th", { children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C" }), _jsx("th", { style: { width: 80 } })] }) }), _jsx("tbody", { children: devices.map((d) => {
                                const store = stores.find((s) => s.id === d.store_id);
                                const seller = sellers.find((s) => s.id === d.seller_id);
                                if (editId === d.id) {
                                    return (_jsx("tr", { style: { background: 'var(--bg)' }, children: _jsx("td", { colSpan: 7, style: { padding: 0 }, children: _jsxs(FormRow, { onSubmit: () => updateMut.mutate({ id: d.id, data: { ...form, seller_id: form.seller_id || null } }), onCancel: () => setEditId(null), disabled: !form.store_id || !form.serial_number || updateMut.isPending, children: [_jsx(Field, { label: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", children: _jsx("select", { className: "form-input", value: form.store_id, onChange: (e) => setForm({ ...form, store_id: e.target.value }), children: stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id)) }) }), _jsx(Field, { label: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446", children: _jsxs("select", { className: "form-input", value: form.seller_id, onChange: (e) => setForm({ ...form, seller_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D" }), sellers.filter((s) => !form.store_id || s.store_id === form.store_id).map((s) => (_jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id)))] }) }), _jsx(Field, { label: "\u0421\u0435\u0440\u0438\u0439\u043D\u044B\u0439 \u043D\u043E\u043C\u0435\u0440", flex: "0 1 150px", children: _jsx("input", { className: "form-input", value: form.serial_number, onChange: (e) => setForm({ ...form, serial_number: e.target.value }) }) }), _jsx(Field, { label: "\u041C\u043E\u0434\u0435\u043B\u044C", flex: "0 1 160px", children: _jsx("input", { className: "form-input", value: form.model, onChange: (e) => setForm({ ...form, model: e.target.value }) }) })] }) }) }, d.id));
                                }
                                return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }, children: d.serial_number }), _jsx("td", { children: d.model || '—' }), _jsx("td", { children: store?.name || '—' }), _jsx("td", { children: seller ? `${seller.first_name} ${seller.last_name}` : '—' }), _jsx("td", { children: _jsx(StatusTag, { active: d.is_active, labels: ['Активно', 'Отключено'] }) }), _jsx("td", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('ru-RU') : '—' }), _jsx("td", { children: _jsx(ActionButtons, { isActive: d.is_active, onEdit: () => startEdit(d), onToggle: () => updateMut.mutate({ id: d.id, data: { is_active: !d.is_active } }) }) })] }, d.id));
                            }) })] }) }))] }));
}
// ─── Users Tab ──────────────────────────────────────────────
function UsersTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ email: '', password: '', role: 'manager', first_name: '', last_name: '', store_id: '' });
    const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => adminApi.getUsers() });
    const createMut = useMutation({
        mutationFn: () => adminApi.createUser({ ...form, store_id: form.store_id || undefined }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setShowForm(false); setForm({ email: '', password: '', role: 'manager', first_name: '', last_name: '', store_id: '' }); },
    });
    const updateMut = useMutation({
        mutationFn: ({ id, data }) => adminApi.updateUser(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setEditId(null); },
    });
    const users = data?.items ?? [];
    const stores = storesData?.items ?? [];
    const startEdit = (u) => {
        setEditId(u.id);
        setForm({ email: u.email, password: '', role: u.role, first_name: u.first_name, last_name: u.last_name, store_id: u.store_id || '' });
        setShowForm(false);
    };
    const startCreate = () => {
        setShowForm(true);
        setEditId(null);
        setForm({ email: '', password: '', role: 'manager', first_name: '', last_name: '', store_id: '' });
    };
    const saveEdit = (id) => {
        const payload = { first_name: form.first_name, last_name: form.last_name, role: form.role, store_id: form.store_id || null };
        if (form.password)
            payload.password = form.password;
        updateMut.mutate({ id, data: payload });
    };
    return (_jsxs("div", { className: "card fade-in", style: { marginTop: 16 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u044B" }), _jsxs("div", { className: "card-subtitle", children: [users.length, " \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439"] })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: startCreate, children: [_jsx(Plus, { size: 14 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), showForm && (_jsxs(FormRow, { onSubmit: () => createMut.mutate(), onCancel: () => setShowForm(false), disabled: !form.email || !form.password || !form.first_name || createMut.isPending, children: [_jsx(Field, { label: "Email", children: _jsx("input", { className: "form-input", type: "email", value: form.email, onChange: (e) => setForm({ ...form, email: e.target.value }), placeholder: "email@example.com" }) }), _jsx(Field, { label: "\u041F\u0430\u0440\u043E\u043B\u044C", flex: "0 1 140px", children: _jsx("input", { className: "form-input", type: "password", value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }), placeholder: "\u041C\u0438\u043D. 8 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432" }) }), _jsx(Field, { label: "\u0418\u043C\u044F", flex: "0 1 130px", children: _jsx("input", { className: "form-input", value: form.first_name, onChange: (e) => setForm({ ...form, first_name: e.target.value }), placeholder: "\u0418\u043C\u044F" }) }), _jsx(Field, { label: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F", flex: "0 1 130px", children: _jsx("input", { className: "form-input", value: form.last_name, onChange: (e) => setForm({ ...form, last_name: e.target.value }), placeholder: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F" }) }), _jsx(Field, { label: "\u0420\u043E\u043B\u044C", flex: "0 1 140px", children: _jsxs("select", { className: "form-input", value: form.role, onChange: (e) => setForm({ ...form, role: e.target.value }), children: [_jsx("option", { value: "manager", children: "\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440" }), _jsx("option", { value: "rop", children: "\u0420\u041E\u041F" }), _jsx("option", { value: "admin", children: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440" }), _jsx("option", { value: "director", children: "\u0414\u0438\u0440\u0435\u043A\u0442\u043E\u0440" })] }) }), (form.role === 'manager' || form.role === 'rop') && (_jsx(Field, { label: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", flex: "0 1 160px", children: _jsxs("select", { className: "form-input", value: form.store_id, onChange: (e) => setForm({ ...form, store_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u0412\u0441\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] }) }))] })), isLoading ? (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0418\u043C\u044F" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "\u0420\u043E\u043B\u044C" }), _jsx("th", { children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { style: { width: 80 } })] }) }), _jsx("tbody", { children: users.map((u) => {
                                const store = stores.find((s) => s.id === u.store_id);
                                if (editId === u.id) {
                                    return (_jsx("tr", { style: { background: 'var(--bg)' }, children: _jsx("td", { colSpan: 6, style: { padding: 0 }, children: _jsxs(FormRow, { onSubmit: () => saveEdit(u.id), onCancel: () => setEditId(null), disabled: !form.first_name || updateMut.isPending, children: [_jsx(Field, { label: "\u0418\u043C\u044F", flex: "0 1 130px", children: _jsx("input", { className: "form-input", value: form.first_name, onChange: (e) => setForm({ ...form, first_name: e.target.value }) }) }), _jsx(Field, { label: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F", flex: "0 1 130px", children: _jsx("input", { className: "form-input", value: form.last_name, onChange: (e) => setForm({ ...form, last_name: e.target.value }) }) }), _jsx(Field, { label: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C", flex: "0 1 140px", children: _jsx("input", { className: "form-input", type: "password", value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }), placeholder: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C" }) }), _jsx(Field, { label: "\u0420\u043E\u043B\u044C", flex: "0 1 140px", children: _jsxs("select", { className: "form-input", value: form.role, onChange: (e) => setForm({ ...form, role: e.target.value }), children: [_jsx("option", { value: "manager", children: "\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440" }), _jsx("option", { value: "rop", children: "\u0420\u041E\u041F" }), _jsx("option", { value: "admin", children: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440" }), _jsx("option", { value: "director", children: "\u0414\u0438\u0440\u0435\u043A\u0442\u043E\u0440" })] }) }), _jsx(Field, { label: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", flex: "0 1 160px", children: _jsxs("select", { className: "form-input", value: form.store_id, onChange: (e) => setForm({ ...form, store_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u0412\u0441\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] }) })] }) }) }, u.id));
                                }
                                return (_jsxs("tr", { children: [_jsxs("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: [u.first_name, " ", u.last_name] }), _jsx("td", { children: u.email }), _jsx("td", { children: _jsx("span", { className: "tag tag-primary", children: ROLE_LABELS[u.role] || u.role }) }), _jsx("td", { children: store?.name || '—' }), _jsx("td", { children: _jsx(StatusTag, { active: u.is_active }) }), _jsx("td", { children: _jsx(ActionButtons, { isActive: u.is_active, onEdit: () => startEdit(u), onToggle: () => updateMut.mutate({ id: u.id, data: { is_active: !u.is_active } }) }) })] }, u.id));
                            }) })] }) }))] }));
}
