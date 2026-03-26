import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль должен быть не менее 6 символов')
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  })

  const onSubmit = async (data: LoginFormData) => {
    try {
      setLoading(true)
      setGeneralError('')
      const response = await authApi.login(data)
      setTokens(response.access_token, response.refresh_token)
      setUser(response.user as import('@/types').User)
      navigate('/dashboard')
    } catch (error: any) {
      if (error.response?.status === 401) {
        setGeneralError('Неверный email или пароль')
      } else {
        setGeneralError('Ошибка соединения с сервером')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg)'
    }}>
      <div className="card" style={{ width: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px' }}>
            <rect x="2" y="2" width="8" height="8" fill="#2563EB" rx="2" />
            <rect x="14" y="2" width="8" height="8" fill="#60A5FA" rx="2" />
            <rect x="2" y="14" width="8" height="8" fill="#60A5FA" rx="2" />
            <rect x="14" y="14" width="8" height="8" fill="#2563EB" rx="2" />
          </svg>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>VoiceIQ</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Речевая аналитика для розницы
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="name@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>
                {errors.password.message}
              </p>
            )}
          </div>

          {generalError && (
            <div
              style={{
                fontSize: '13px',
                color: 'var(--danger)',
                background: 'var(--danger-light)',
                border: '1px solid var(--danger-100)',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '16px'
              }}
            >
              {generalError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginTop: '16px'
        }}>
          Тестовые учетные данные: admin@voiceiq.ru / password123
        </p>
      </div>
    </div>
  )
}
