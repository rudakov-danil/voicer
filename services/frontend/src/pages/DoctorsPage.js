import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Copy, ExternalLink, Smartphone } from 'lucide-react';
import { clinicApi } from '@/api/clinic';
import { useAuthStore } from '@/store/authStore';
import { num, pct } from '@/components/upsells/metrics';
import { toast } from '@/components/ui/Toast';
import { HINT, ProtocolBadge, Score, SignalChip, Tile, minutes, onVisits, useClinicRange } from '@/components/clinic/shared';
import { Criteria, DoctorsTable, Weeks } from '@/pages/ClinicOverviewPage';
import { L, t } from '@/i18n';
/* Врачи: список с баллами и сигналами; страница врача — разбор по правилам в сравнении с его
   клиникой, сигналы с цитатами, последние приёмы и подключение приложения врача. */
export function DoctorsPage() {
    const range = useClinicRange();
    const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-overview', range], queryFn: () => clinicApi.overview(range) });
    if (isError)
        return _jsx("div", { className: "panel up-empty", children: L('Не удалось загрузить врачей. Обновите страницу.', 'Could not load doctors. Refresh the page.') });
    if (isLoading || !data)
        return _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') });
    return _jsx("div", { className: "cl", children: _jsx(DoctorsTable, { rows: data.doctors, title: L(`Врачи · ${data.doctors.length}`, `Doctors · ${data.doctors.length}`) }) });
}
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const quoted = (s) => L(`«${s}»`, `“${s}”`);
export function DoctorPage() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const range = useClinicRange();
    const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-doctor', id, range], queryFn: () => clinicApi.doctor(id, range), enabled: !!id });
    const { data: recent } = useQuery({
        queryKey: ['clinic-visits', 'doctor', id, range],
        queryFn: () => clinicApi.visits({ ...range, seller_id: id, limit: 10 }),
        enabled: !!id,
    });
    if (isError)
        return _jsx("div", { className: "panel up-empty", children: L('Врач не найден или недоступен.', 'The doctor was not found or is not available.') });
    if (isLoading || !data)
        return _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') });
    const s = data.totals;
    const team = data.team;
    const vsTeam = (mine, all) => mine == null || all == null ? undefined : L(`по клинике ${pct(all)}`, `clinic ${pct(all)}`);
    return (_jsxs("div", { className: "cl", children: [_jsxs("nav", { className: "cl-crumbs", "aria-label": L('Навигация', 'Breadcrumbs'), children: [_jsx(Link, { to: "/doctors", children: L('Врачи', 'Doctors') }), _jsx(ChevronRight, { "aria-hidden": "true" }), _jsx("span", { translate: "no", children: data.doctor.name })] }), _jsxs("header", { className: "cl-doc-head", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(data.doctor.name) }), _jsxs("div", { children: [_jsx("h1", { className: "cl-doc-name", translate: "no", children: data.doctor.name }), _jsxs("div", { className: "cl-doc-sub", children: [_jsx(Specialty, { id: id, value: data.doctor.specialty }), _jsx("span", { translate: "no", children: data.doctor.store_name })] })] })] }), _jsxs("div", { className: "m-tiles", children: [_jsx(Tile, { title: L('Приёмы', 'Visits'), hint: HINT.visits, value: num(s.visits), base: L(`в среднем ${minutes(s.avg_duration_sec)}; по клинике — ${minutes(team.avg_duration_sec)}`, `${minutes(s.avg_duration_sec)} on average; clinic ${minutes(team.avg_duration_sec)}`) }), _jsx(Tile, { title: L('Сервис', 'Service'), hint: HINT.service, value: _jsx(Score, { value: s.service }), base: vsTeam(s.service, team.service) }), _jsx(Tile, { title: L('Компетентность', 'Competence'), hint: HINT.competence, value: _jsx(Score, { value: s.competence }), base: vsTeam(s.competence, team.competence) }), _jsx(Tile, { title: L('Сигналы фрода', 'Fraud signals'), hint: HINT.fraud, value: num(s.fraud_signals), base: s.fraud_signals ? onVisits(s.fraud_visits, s.visits) : L('не найдено', 'none found') }), _jsx(Tile, { title: L('Нарушения', 'Violations'), hint: HINT.issues, value: num(s.issue_signals), base: s.issue_signals ? onVisits(s.issue_visits, s.visits) : L('не найдено', 'none found') }), _jsx(Tile, { title: L('Протоколы подтверждены', 'Notes confirmed'), hint: HINT.protocols, value: pct(s.protocols ? s.protocols_confirmed / s.protocols : null), base: L(`${num(s.protocols_confirmed)} из ${num(s.protocols)}`, `${num(s.protocols_confirmed)} of ${num(s.protocols)}`) })] }), _jsxs("div", { className: "cl-grid", children: [_jsx(Criteria, { rows: data.criteria, compare: true }), _jsxs("section", { className: "panel", "aria-labelledby": "cl-doc-sig", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "cl-doc-sig", className: "panel-title", children: L('Сигналы с цитатами', 'Signals with quotes') }), _jsx("div", { className: "panel-sub", children: L('Последние сработавшие запреты. Нажмите, чтобы открыть приём и проверить по записи.', 'Latest triggered prohibitions. Click to open the visit and check it.') })] }) }), _jsx("div", { className: "cl-panel-body", children: data.signals.length === 0 ? _jsx("p", { className: "cl-muted", children: L('За период нарушений и сигналов фрода нет.', 'No violations or fraud signals for the period.') }) : (_jsx("ul", { className: "cl-queue", children: data.signals.map((x, i) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "cl-q", onClick: () => navigate(`/visits/${x.conversation_id}`), children: [_jsx("span", { className: "cl-q-title", children: _jsx(SignalChip, { title: x.title, category: x.category, severity: x.severity }) }), _jsx("span", { className: "cl-q-when", children: x.when }), _jsx("span", { className: "cl-q-quote", translate: "no", children: quoted(x.quote) }), x.reason && _jsx("span", { className: "cl-q-meta", translate: "no", children: x.reason })] }) }, i))) })) })] })] }), _jsxs("div", { className: "cl-grid", children: [_jsxs("section", { className: "panel", "aria-labelledby": "cl-doc-recent", children: [_jsxs("div", { className: "panel-head", children: [_jsx("div", { children: _jsx("h2", { id: "cl-doc-recent", className: "panel-title", children: L('Последние приёмы', 'Latest visits') }) }), _jsx(Link, { className: "btn btn-ghost btn-sm", to: `/visits?seller=${id}`, children: L('Все приёмы врача', 'All visits') })] }), _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "cl-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: L('Когда', 'When') }), _jsx("th", { scope: "col", children: L('Причина обращения', 'Reason') }), _jsx("th", { scope: "col", className: "t-num", children: L('Сервис', 'Service') }), _jsx("th", { scope: "col", className: "t-num", children: L('Компет.', 'Compet.') }), _jsx("th", { scope: "col", children: L('Протокол', 'Note') })] }) }), _jsx("tbody", { children: (recent?.items || []).map((v) => (_jsxs("tr", { tabIndex: 0, onClick: () => navigate(`/visits/${v.conversation_id}`), onKeyDown: (e) => { if (e.key === 'Enter')
                                                    navigate(`/visits/${v.conversation_id}`); }, children: [_jsxs("td", { className: "cl-time", children: [v.time, _jsx("span", { children: new Date(`${v.session_date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) })] }), _jsx("td", { children: _jsxs("div", { className: "cl-reason", children: [_jsx("b", { translate: "no", children: v.reason || '—' }), v.signals.length > 0 && _jsx("div", { className: "cl-signals", children: v.signals.map((x, i) => _jsx(SignalChip, { ...x }, i)) })] }) }), _jsx("td", { className: "t-num", children: _jsx(Score, { value: v.service }) }), _jsx("td", { className: "t-num", children: _jsx(Score, { value: v.competence }) }), _jsx("td", { children: _jsx(ProtocolBadge, { status: v.protocol_status }) })] }, v.conversation_id))) })] }) })] }), _jsx(Weeks, { weeks: data.weeks })] }), _jsx(DoctorApp, { id: id, name: data.doctor.name })] }));
}
function Specialty({ id, value }) {
    const role = useAuthStore((s) => s.user?.role);
    const qc = useQueryClient();
    const [edit, setEdit] = useState(false);
    const [draft, setDraft] = useState(value || '');
    const save = useMutation({
        mutationFn: () => clinicApi.setSpecialty(id, draft),
        onSuccess: () => { setEdit(false); qc.invalidateQueries({ queryKey: ['clinic-doctor', id] }); qc.invalidateQueries({ queryKey: ['clinic-overview'] }); },
        onError: () => toast(L('Не удалось сохранить специальность.', 'Could not save the specialty.')),
    });
    if (role === 'manager' && !edit)
        return _jsx("span", { translate: "no", children: value || L('Специальность не указана', 'No specialty') });
    if (!edit) {
        return (_jsxs("span", { className: "cl-spec", children: [_jsx("span", { translate: "no", children: value || L('Специальность не указана', 'No specialty') }), _jsx("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => { setDraft(value || ''); setEdit(true); }, children: L('Изменить', 'Edit') })] }));
    }
    return (_jsxs("span", { className: "cl-spec", children: [_jsx("input", { value: draft, maxLength: 100, autoFocus: true, onChange: (e) => setDraft(e.target.value), "aria-label": L('Специальность', 'Specialty'), onKeyDown: (e) => { if (e.key === 'Enter')
                    save.mutate(); if (e.key === 'Escape')
                    setEdit(false); } }), _jsx("button", { type: "button", className: "btn btn-primary btn-sm", disabled: save.isPending, onClick: () => save.mutate(), children: L('Сохранить', 'Save') }), _jsx("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setEdit(false), children: L('Отмена', 'Cancel') })] }));
}
/** Приложение врача: одноразовая ссылка подключения на 24 часа. Новая ссылка отключает прежний телефон. */
function DoctorApp({ id, name }) {
    const [invitation, setInvitation] = useState(null);
    const connect = useMutation({
        mutationFn: () => clinicApi.invite(id),
        onSuccess: (data) => setInvitation(data),
        onError: () => toast(L('Не удалось создать ссылку. Попробуйте ещё раз.', 'Could not create the link. Try again.')),
    });
    const revoke = useMutation({
        mutationFn: () => clinicApi.revoke(id),
        onSuccess: () => { setInvitation(null); toast(L('Доступ врача к приложению отозван.', 'The doctor’s app access is revoked.')); },
        onError: () => toast(L('Не удалось отозвать доступ.', 'Could not revoke access.')),
    });
    const copy = async () => {
        if (!invitation)
            return;
        try {
            await navigator.clipboard.writeText(invitation.url);
            toast(L('Ссылка скопирована.', 'Link copied.'));
        }
        catch {
            toast(L('Выделите и скопируйте ссылку из поля.', 'Select and copy the link from the field.'));
        }
    };
    return (_jsxs("section", { className: "panel", "aria-labelledby": "cl-app", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsxs("h2", { id: "cl-app", className: "panel-title", children: [_jsx(Smartphone, { size: 17, "aria-hidden": "true", style: { verticalAlign: '-3px', marginRight: 6 } }), L('Приложение врача', 'Doctor app')] }), _jsx("div", { className: "panel-sub", children: L('В приложении два раздела: «Запись» — записать приём, и «Протокол» — проверить черновик протокола, поправить и подтвердить. Ссылка одноразовая, действует 24 часа; новая ссылка отключает прежний телефон.', 'The app has two sections: “Record” to record a visit and “Note” to review, edit and confirm the draft note. The link is single-use and valid for 24 hours; a new link disconnects the previous phone.') })] }) }), _jsxs("div", { className: "cl-panel-body cl-app", children: [_jsxs("div", { className: "cl-app-row", children: [_jsx("button", { type: "button", className: "btn btn-primary", disabled: connect.isPending || revoke.isPending, onClick: () => connect.mutate(), children: connect.isPending ? L('Готовим…', 'Preparing…') : L('Создать ссылку подключения', 'Create a connection link') }), _jsx("button", { type: "button", className: "btn btn-outline", disabled: connect.isPending || revoke.isPending, onClick: () => revoke.mutate(), children: L('Отозвать доступ', 'Revoke access') })] }), invitation && (_jsxs("div", { className: "cl-app-link", children: [_jsx("input", { readOnly: true, value: invitation.url, onFocus: (e) => e.target.select(), "aria-label": L(`Личная ссылка для ${name}`, `Personal link for ${name}`) }), _jsxs("button", { type: "button", className: "btn btn-outline", onClick: copy, children: [_jsx(Copy, { size: 14, "aria-hidden": "true" }), L('Скопировать', 'Copy')] }), _jsxs("a", { className: "btn btn-ghost", href: invitation.url, target: "_blank", rel: "noopener", children: [L('Открыть', 'Open'), _jsx(ExternalLink, { size: 14, "aria-hidden": "true" })] }), _jsx("span", { className: "cl-muted", children: L(`Действует до ${new Date(invitation.expires_at).toLocaleString('ru-RU')}.`, `Valid until ${new Date(invitation.expires_at).toLocaleString('en-GB')}.`) })] }))] })] }));
}
