import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'
import { VoicerLogo } from '@/components/VoicerLogo'
import { t, L, isEn, setLang } from '@/i18n'

// Витрины под отрасль на поддоменах: тот же кабинет, своя подпись. Какие данные открыть, решает
// auth-service по домену (DOMAIN_ORGS): horeca. — демо кофеен, pharma. и apteka. — демо аптек, medicine. — демо клиник.
const SHOWCASES: Record<string, { title: string; sub: [string, string] }> = {
  horeca: { title: 'Voicer — HoReCa', sub: ['Допродажи у стойки: речевая аналитика для кофеен', 'Counter upsells: speech analytics for coffee shops'] },
  pharma: { title: 'Voicer — Аптеки', sub: ['Речевая аналитика для аптек: допродажи и спрос, которого не было в наличии', 'Speech analytics for pharmacies: add-ons and unmet demand'] },
  apteka: { title: 'Voicer — Аптеки', sub: ['Речевая аналитика для аптек: допродажи и спрос, которого не было в наличии', 'Speech analytics for pharmacies: add-ons and unmet demand'] },
  medicine: { title: 'Voicer — Клиники', sub: ['Протоколы приёмов и контроль качества работы врачей', 'Visit notes and quality control of doctors’ work'] },
}
const SHOWCASE = typeof window !== 'undefined' ? SHOWCASES[window.location.hostname.split('.')[0]] : undefined
if (SHOWCASE) document.title = SHOWCASE.title

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
      navigate('/')
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
    <div className="login-page">
      <button
        type="button"
        className="lang-btn login-lang"
        translate="no"
        aria-label={isEn ? 'Переключить на русский' : 'Switch to English'}
        onClick={() => setLang(isEn ? 'ru' : 'en')}
      >
        {isEn ? 'RU' : 'EN'}
      </button>
      <div className="login-card">
        <div className="login-brand">
          <VoicerLogo size={28} />
          <span className="brand-name" translate="no">{t('Войсер')}</span>
        </div>
        <p className="login-sub">{SHOWCASE ? L(...SHOWCASE.sub) : 'Речевая аналитика для розницы'}</p>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="name@example.com"
              autoComplete="username"
              {...register('email')}
            />
            {errors.email && (
              <p className="login-error-text">{errors.email.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="login-error-text">{errors.password.message}</p>
            )}
          </div>

          {generalError && <div className="login-error">{generalError}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', height: 38 }}
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
