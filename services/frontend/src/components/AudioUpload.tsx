import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, X, FileAudio } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { recorderApi } from '@/api/recorder'
import { adminApi } from '@/api/admin'

interface AudioUploadModalProps {
  open: boolean
  onClose: () => void
  onUploadComplete?: () => void
}

export function AudioUploadModal({ open, onClose, onUploadComplete }: AudioUploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sellerId, setSellerId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0])
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
      await recorderApi.uploadAudio(
        file,
        { seller_id: sellerId, store_id: storeId, session_date: sessionDate },
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
    setSessionDate(new Date().toISOString().split('T')[0])
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
        width: 480, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
            Загрузка аудиозаписи
          </div>
          <button className="icon-btn" onClick={handleClose} style={{ width: 32, height: 32 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* File drop zone */}
          <input ref={fileRef} type="file" accept=".wav,.mp3,.ogg" onChange={handleFileSelect} style={{ display: 'none' }} />

          {!file ? (
            <div
              style={{
                border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
                padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                transition: 'border-color 0.15s',
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
              <Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Перетащите файл или нажмите для выбора
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 6 }}>
                WAV, MP3, OGG · до 500 МБ
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

          {/* Form fields */}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Магазин</label>
              <select className="form-input" value={storeId} onChange={(e) => { setStoreId(e.target.value); setSellerId('') }}>
                <option value="">Выберите магазин</option>
                {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Продавец</label>
              <select className="form-input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} disabled={!storeId}>
                <option value="">Выберите продавца</option>
                {sellers.map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Дата разговора</label>
              <input className="form-input" type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
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
                {status === 'uploading' ? `Загрузка файла ${progress}%...` : 'Транскрибация через Deepgram...'}
              </div>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div style={{ marginTop: 20, textAlign: 'center', padding: '12px' }}>
              <CheckCircle size={36} style={{ color: 'var(--success)', marginBottom: 8 }} />
              <div style={{ fontSize: '14px', color: 'var(--success)', fontWeight: 500 }}>
                Файл загружен и отправлен на обработку
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 4 }}>
                Транскрибация и анализ выполняются в фоне
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
              padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)',
              color: 'var(--danger)', fontSize: '13px',
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
            {status === 'uploading' ? 'Загрузка...' : status === 'processing' ? 'Обработка...' : 'Загрузить и обработать'}
          </button>
        </div>
      </div>
    </div>
  )
}
