import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Check, Trash2, Undo2 } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'
import { clock } from '@/components/ui/Fingerprint'
import type { CoachingItem } from '@/types'
import { t, L, locale } from '@/i18n'

/* «Разобрать с продавцом» (ui-concept/conversation.html): разговор попадает в план
   разбора продавца, руководитель оставляет к нему комментарии с моментом записи.
   План виден на странице «Команда» в профиле продавца. */

export function useCoaching(conversationId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['coaching', conversationId],
    queryFn: () => dashboardApi.getCoaching(conversationId),
    enabled: !!conversationId,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['coaching'] })
  return { items: query.data || [], isLoading: query.isLoading, refresh }
}

/** Кнопка в шапке разговора: добавить в план разбора или убрать из него. */
export function ReviewButton({ conversationId, sellerName }: { conversationId: string; sellerName?: string | null }) {
  const { items, refresh } = useCoaching(conversationId)
  const planned = items.find((i) => !i.comment && i.status === 'open')

  const add = useMutation({
    mutationFn: () => dashboardApi.addCoaching(conversationId),
    onSuccess: () => {
      refresh()
      toast(sellerName
        ? L(`Разговор добавлен в план разбора: ${sellerName}`, `Added to the coaching plan: ${sellerName}`)
        : t('Разговор добавлен в план разбора'))
    },
    onError: () => toast(t('Не удалось добавить в план разбора')),
  })
  const remove = useMutation({
    mutationFn: (id: string) => dashboardApi.deleteCoaching(id),
    onSuccess: () => { refresh(); toast(t('Разговор убран из плана разбора')) },
    onError: () => toast(t('Не удалось убрать из плана разбора')),
  })

  if (planned) {
    return (
      <button
        type="button"
        className="btn"
        aria-pressed="true"
        disabled={remove.isPending}
        title={t('Убрать из плана разбора')}
        onClick={() => remove.mutate(planned.id)}
      >
        <Check size={15} aria-hidden="true" />{t('В плане разбора')}
      </button>
    )
  }
  return (
    <button type="button" className="btn btn-primary" disabled={add.isPending} onClick={() => add.mutate()}>
      <ListChecks size={15} aria-hidden="true" />{t('Разобрать с продавцом')}
    </button>
  )
}

/** Комментарии руководителя к разговору: список и форма с моментом записи. */
export function CoachingComments({ conversationId, sellerName, now, onSeek }: {
  conversationId: string
  sellerName?: string | null
  /** Текущая секунда плеера — её можно приложить к комментарию */
  now: number
  onSeek: (sec: number) => void
}) {
  const { items, refresh } = useCoaching(conversationId)
  const userId = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.user?.role)
  const [text, setText] = useState('')
  const [attach, setAttach] = useState(true)
  const comments = items.filter((i) => i.comment)

  const send = useMutation({
    mutationFn: () => dashboardApi.addCoaching(conversationId, {
      comment: text.trim(),
      moment_seconds: attach ? Math.round(now) : null,
    }),
    onSuccess: () => { setText(''); refresh(); toast(t('Комментарий сохранён в плане разбора')) },
    onError: () => toast(t('Не удалось сохранить комментарий')),
  })
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'done' }) => dashboardApi.setCoachingStatus(id, status),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => dashboardApi.deleteCoaching(id),
    onSuccess: refresh,
  })

  const submit = () => {
    if (!text.trim()) { toast(t('Напишите комментарий — пустой не сохраним')); return }
    send.mutate()
  }

  return (
    <section className="panel cv-comment" aria-labelledby="cv-comment-title">
      <div className="panel-head">
        <div>
          <h2 id="cv-comment-title" className="panel-title">{t('Комментарий продавцу')}</h2>
          <div className="panel-sub">
            {sellerName
              ? L(`${sellerName} · попадёт в план разбора на странице «Команда»`, `${sellerName} · goes to the coaching plan on the Team page`)
              : t('Попадёт в план разбора продавца на странице «Команда»')}
          </div>
        </div>
      </div>
      <div className="panel-body">
        {comments.length > 0 && (
          <ul className="cv-comments">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                item={c}
                canDelete={c.author_id === userId || role === 'director' || role === 'admin'}
                onSeek={onSeek}
                onToggle={() => setStatus.mutate({ id: c.id, status: c.status === 'done' ? 'open' : 'done' })}
                onDelete={() => { if (window.confirm(t('Удалить комментарий?'))) remove.mutate(c.id) }}
              />
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor="cv-comment-text">{t('Комментарий')}</label>
        <textarea
          id="cv-comment-text"
          className="cv-comment-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
          placeholder={t('Например: «Не обещайте обмен — объясните гарантийный ремонт»…')}
        />
        <div className="cv-comment-row">
          <label className="cv-check">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            {t('Приложить момент')} <span className="mono">{clock(now)}</span>
          </label>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={send.isPending}>
            {send.isPending ? t('Сохранение…') : t('Сохранить комментарий')}
          </button>
        </div>
      </div>
    </section>
  )
}

function CommentRow({ item, canDelete, onSeek, onToggle, onDelete }: {
  item: CoachingItem
  canDelete: boolean
  onSeek: (sec: number) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const done = item.status === 'done'
  const when = new Date(item.created_at)
  return (
    <li className={`cv-comment-item ${done ? 'is-done' : ''}`}>
      <div className="cv-comment-meta">
        <span translate="no">{item.author_name || '—'}</span>
        <span aria-hidden="true">·</span>
        <span>{when.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, {when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
        {item.moment_seconds != null && (
          <button type="button" className="cv-step-go" onClick={() => onSeek(item.moment_seconds!)}>▶ {clock(item.moment_seconds)}</button>
        )}
        {done && <span className="tag tag-success">{t('Разобрано')}</span>}
      </div>
      <p className="cv-comment-body" translate="no">{item.comment}</p>
      <div className="cv-comment-tools">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onToggle}>
          {done ? <><Undo2 size={13} aria-hidden="true" />{t('Вернуть в план')}</> : <><Check size={13} aria-hidden="true" />{t('Разобрано')}</>}
        </button>
        {canDelete && (
          <button type="button" className="btn btn-sm btn-ghost cv-danger" onClick={onDelete} aria-label={t('Удалить комментарий')}>
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  )
}
