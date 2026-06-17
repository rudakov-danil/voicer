import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, X, PhoneIncoming, PhoneOutgoing, FileAudio } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { recorderApi } from '@/api/recorder'
import { adminApi } from '@/api/admin'
import { useTerms } from '@/lib/terms'

interface CallUploadModalProps {
  open: boolean
  onClose: () => void
  onUploadComplete?: () => void
}

/** Ручная загрузка записи телефонного звонка с метаданными (направление, номер клиента).
 *  Стерео-записи (оператор/клиент в раздельных каналах) распознаются автоматически —
 *  роли в них определяются по каналам без LLM. */
export function CallUploadModal({ open, onClose, onUploadComplete }: CallUploadModalProps) {
  const terms = useTerms()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sellerId, setSellerId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound')
  const [clientPhone, setClientPhone] = useState('')
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0])
  const [channelMode, setChannelMode] = useState<'auto' | 'stereo' | 'mono'>('auto')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle')
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

  const ALLOWED_EXT = /\.(wav|mp3|ogg)$/i
  const MAX_SIZE = 500 * 1024 * 1024

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.name.match(ALLOWED_EXT)) {
      setErrorMsg('Поддерживаются форматы: WAV, MP3, OGG')
      setStatus('error')
      return
    }
    if (selected.size > MAX_SIZE) {
      setErrorMsg('Файл слишком большой (макс. 500 МБ)')
      setStatus('error')
      return
    }
    setFile(selected)
    setStatus('idle')
    setErrorMsg('')
  }

  const handleUpload = async () => {
    if (!file || !sellerId || !storeId) return
    setStatus('uploading')
    setProgress(0)
    try {
      await recorderApi.uploadCall(
        file,
        {
          seller_id: sellerId,
          store_id: storeId,
          direction,
          client_phone: clientPhone.trim() || undefined,
          session_date: sessionDate,
          channel_mode: channelMode,
        },
        (p) => {
          setProgress(p)
          if (p >= 100) setStatus('processing')
        }
      )
      setStatus('success')
      setTimeout(() => {
        onUploadComplete?.()
        handleClose()
      }, 2000)
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err?.response?.data?.detail || 'Ошибка загрузки')
    }
  }

  const handleClose = () => {
    setFile(null)
    setSellerId('')
    setStoreId('')
    setDirection('inbound')
    setClientPhone('')
    setSessionDate(new Date().toISOString().split('T')[0])
    setChannelMode('auto')
    setProgress(0)
    setStatus('idle')
    setErrorMsg('')
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

  if (!open) return null

  const canSubmit = !!file && !!sellerId && !!storeId && status !== 'uploading' && status !== 'processing' && status !== 'success'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={handleClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        width: 520, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PhoneIncoming size={18} style={{ color: 'var(--primary)' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Загрузка звонка
            </div>
          </div>
          <button className="icon-btn" onClick={handleClose} style={{ width: 32, height: 32 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          <input ref={fileRef} type="file" accept=".wav,.mp3,.ogg" onChange={handleFileSelect} style={{ display: 'none' }} />

          {!file ? (
            <div
              style={{
                border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
                padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)' }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.style.borderColor = 'var(--border)'
                const dropped = e.dataTransfer.files[0]
                if (dropped) {
                  const fakeEvent = { target: { files: [dropped] } } as any
                  handleFileSelect(fakeEvent)
                }
              }}
            >
              <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Перетащите запись звонка или нажмите для выбора
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 6 }}>
                WAV, MP3, OGG · до 500 МБ · стерео-записи АТС распознаются автоматически
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: 4,
            }}>
              <FileAudio size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {(file.size / 1024 / 1024).toFixed(1)} МБ
                </div>
              </div>
              {status === 'idle' && (
                <button className="icon-btn" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ width: 28, height: 28 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Direction toggle */}
          <div style={{ marginTop: 20 }}>
            <label className="form-label">Направление звонка</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: 'inbound', label: 'Входящий', Icon: PhoneIncoming },
                { id: 'outbound', label: 'Исходящий', Icon: PhoneOutgoing },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDirection(id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    border: `1px solid ${direction === id ? 'var(--primary)' : 'var(--border)'}`,
                    background: direction === id ? 'rgba(99,102,241,0.08)' : 'var(--bg)',
                    color: direction === id ? 'var(--primary)' : 'var(--text-secondary)',
                  }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Form fields */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
              <label className="form-label">Номер клиента</label>
              <input className="form-input" type="tel" placeholder="+7..." value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Дата звонка</label>
              <input className="form-input" type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Каналы записи</label>
              <select className="form-input" value={channelMode} onChange={(e) => setChannelMode(e.target.value as any)}>
                <option value="auto">Автоопределение (рекомендуется)</option>
                <option value="stereo">Стерео — оператор и клиент в раздельных каналах</option>
                <option value="mono">Моно — общий канал (роли определит AI)</option>
              </select>
            </div>
          </div>

          {/* Progress */}
          {(status === 'uploading' || status === 'processing') && (
            <div style={{ marginTop: 20 }}>
              <div className="progress-bar" style={{ marginBottom: 8 }}>
                <div className="progress-bar-fill blue" style={{
                  width: status === 'processing' ? '100%' : `${progress}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                {status === 'uploading' ? `Загрузка файла ${progress}%...` : 'Транскрибация запущена...'}
              </div>
            </div>
          )}

          {status === 'success' && (
            <div style={{ marginTop: 20, textAlign: 'center', padding: '12px' }}>
              <CheckCircle size={36} style={{ color: 'var(--success)', marginBottom: 8 }} />
              <div style={{ fontSize: '14px', color: 'var(--success)', fontWeight: 500 }}>
                Звонок загружен и отправлен на обработку
              </div>
            </div>
          )}

          {status === 'error' && errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
              padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)',
              color: 'var(--danger)', fontSize: '13px',
            }}>
              <AlertCircle size={16} /> {String(errorMsg)}
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
            {status === 'uploading' ? 'Загрузка...' : status === 'processing' ? 'Обработка...' : 'Загрузить звонок'}
          </button>
        </div>
      </div>
    </div>
  )
}
