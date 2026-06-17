import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { transcriptionApi } from '@/api/transcription'
import { useTerms } from '@/lib/terms'

interface TranscriptUploadModalProps {
  open: boolean
  onClose: () => void
  onUploadComplete?: () => void
}

const SAMPLE_TEXT = `Продавец: Здравствуйте, добро пожаловать в автосалон, меня зовут Михаил. Чем могу помочь?
Клиент: Здравствуйте, мы с супругой подбираем семейный автомобиль до миллиона рублей.
Продавец: Отлично, у нас как раз есть несколько хороших вариантов в этом бюджете.
Клиент: А полный привод можно?
Продавец: В этом бюджете полного привода не будет, но есть очень экономичные машины с передним приводом.`

export function TranscriptUploadModal({ open, onClose, onUploadComplete }: TranscriptUploadModalProps) {
  const terms = useTerms()
  const [rawText, setRawText] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0])
  const [direction, setDirection] = useState<'' | 'inbound' | 'outbound'>('')
  const [clientPhone, setClientPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: storesData } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => adminApi.getStores(),
    enabled: open,
  })
  const { data: sellersData } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: () => adminApi.getSellers(),
    enabled: open,
  })

  const stores = storesData?.items ?? []
  const sellers = (sellersData?.items ?? []).filter((s: any) => !storeId || s.store_id === storeId)

  // Простая live-валидация: считаем сколько строк начинается с "Продавец:" / "Клиент:"
  const lineStats = (() => {
    let seller = 0, customer = 0
    for (const line of rawText.split('\n')) {
      const m = line.match(/^\s*([A-Za-zА-Яа-яЁё]+)\s*[:\-—–]/)
      if (!m) continue
      const label = m[1].toLowerCase()
      if (['продавец', 'продавца', 'менеджер', 'консультант', 'оператор', 'seller', 's'].includes(label)) seller++
      else if (['клиент', 'покупатель', 'customer', 'client', 'c'].includes(label)) customer++
    }
    return { seller, customer }
  })()

  const handleClose = () => {
    setRawText('')
    setSellerId('')
    setStoreId('')
    setSessionDate(new Date().toISOString().split('T')[0])
    setDirection('')
    setClientPhone('')
    setStatus('idle')
    setErrorMsg('')
    onClose()
  }

  const handleUpload = async () => {
    if (!sellerId || !storeId || !rawText.trim()) return
    setStatus('uploading')
    setErrorMsg('')
    try {
      await transcriptionApi.uploadTranscript({
        seller_id: sellerId,
        store_id: storeId,
        session_date: sessionDate,
        raw_text: rawText,
        call_direction: direction || undefined,
        client_phone: clientPhone.trim() || undefined,
      })
      setStatus('success')
      setTimeout(() => {
        onUploadComplete?.()
        handleClose()
      }, 1500)
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err?.response?.data?.detail || 'Ошибка загрузки')
    }
  }

  if (!open) return null

  const canSubmit =
    !!storeId && !!sellerId && rawText.trim().length > 0 &&
    (lineStats.seller + lineStats.customer) >= 2 &&
    status !== 'uploading' && status !== 'success'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={handleClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        width: 680, maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} style={{ color: 'var(--primary)' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Загрузка транскрибации (для тестов)
            </div>
          </div>
          <button className="icon-btn" onClick={handleClose} style={{ width: 32, height: 32 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5,
            padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)',
          }}>
            Введите диалог в формате <b>«Роль: текст»</b>, каждая реплика на новой строке.
            Допустимые роли: <code>Продавец</code>, <code>Менеджер</code>, <code>Консультант</code>,
            {' '}<code>Клиент</code>, <code>Покупатель</code>. Запись попадёт сразу в анализ
            (скоринг скриптов, возражения, апсейл/кросс-сейл).
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="form-label">{terms.store}</label>
              <select className="form-input" value={storeId} onChange={(e) => { setStoreId(e.target.value); setSellerId('') }}>
                <option value="">—</option>
                {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{terms.seller}</label>
              <select className="form-input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} disabled={!storeId}>
                <option value="">—</option>
                {sellers.map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Дата</label>
              <input className="form-input" type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            </div>
          </div>

          {terms.isTelephony && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="form-label">Тип звонка (опционально)</label>
                <select className="form-input" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
                  <option value="">Не звонок / не указывать</option>
                  <option value="inbound">Входящий звонок</option>
                  <option value="outbound">Исходящий звонок</option>
                </select>
              </div>
              <div>
                <label className="form-label">Номер клиента (опционально)</label>
                <input className="form-input" type="tel" placeholder="+7..." value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)} disabled={!direction} />
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ margin: 0 }}>Текст диалога</label>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_TEXT)}
                style={{
                  fontSize: 11, color: 'var(--primary)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Подставить пример
              </button>
            </div>
            <textarea
              className="form-input"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={'Продавец: Здравствуйте...\nКлиент: Здравствуйте, мне нужно...'}
              rows={14}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 16 }}>
              <span>Продавец: <b>{lineStats.seller}</b></span>
              <span>Клиент: <b>{lineStats.customer}</b></span>
            </div>
          </div>

          {status === 'success' && (
            <div style={{ marginTop: 16, textAlign: 'center', padding: '12px' }}>
              <CheckCircle size={32} style={{ color: 'var(--success)', marginBottom: 6 }} />
              <div style={{ fontSize: 14, color: 'var(--success)', fontWeight: 500 }}>
                Транскрипт принят, идёт анализ
              </div>
            </div>
          )}

          {status === 'error' && errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
              padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)',
              color: 'var(--danger)', fontSize: 13,
            }}>
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button className="btn btn-sm" onClick={handleClose}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Отмена
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleUpload} disabled={!canSubmit}>
            {status === 'uploading' ? 'Отправка...' : 'Отправить на анализ'}
          </button>
        </div>
      </div>
    </div>
  )
}
