import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { useStore } from '../../store/useStore'

const COUNTRIES = ['Chile','Colombia','Venezuela','Perú','Argentina','Ecuador','México','Bolivia','Brasil','Uruguay','Paraguay']
const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)' }
const INPUT_STYLE = { width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '11px 14px', color: '#eaf2ff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }

export default function Register() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ email: '', full_name: '', password: '', phone: '', country: 'Chile', invite_code: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) setForm(f => ({ ...f, invite_code: code.toUpperCase() }))
  }, [searchParams])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.invite_code.trim()) { setError('Debes ingresar un código de invitación'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/register', form)
      login(res.data.data.access_token, res.data.data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060e24', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 38, marginBottom: 6 }}>🌐</div>
          <h1 style={{ color: '#eaf2ff', fontSize: 22, fontWeight: 700, margin: 0 }}>Crear cuenta</h1>
          <p style={{ color: '#8aa0cc', fontSize: 13, marginTop: 4 }}>Ingresa tu código de invitación para acceder</p>
        </div>

        <div style={GLASS}>
          <form onSubmit={submit} style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div>
              <label style={{ display: 'block', color: '#fcd34d', fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Código de invitación *
              </label>
              <input
                type="text"
                value={form.invite_code}
                onChange={e => setForm({ ...form, invite_code: e.target.value.toUpperCase() })}
                required
                placeholder="Ej: ABC12345"
                style={{ ...INPUT_STYLE, border: '1px solid rgba(252,211,77,.35)', background: 'rgba(252,211,77,.05)', fontFamily: 'monospace', letterSpacing: '0.1em', fontSize: 15 }}
              />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'full_name', label: 'Nombre completo', type: 'text', placeholder: 'Juan García' },
                { key: 'email', label: 'Correo electrónico', type: 'email', placeholder: 'tu@email.com' },
                { key: 'password', label: 'Contraseña', type: 'password', placeholder: '••••••••' },
                { key: 'phone', label: 'Teléfono (opcional)', type: 'tel', placeholder: '+56 9...' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', color: '#8aa0cc', fontSize: 12, fontWeight: 500, marginBottom: 5 }}>{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    required={key !== 'phone'}
                    placeholder={placeholder}
                    style={INPUT_STYLE}
                  />
                </div>
              ))}

              <div>
                <label style={{ display: 'block', color: '#8aa0cc', fontSize: 12, fontWeight: 500, marginBottom: 5 }}>País</label>
                <select
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                >
                  {COUNTRIES.map(c => <option key={c} style={{ background: '#0d1f3c' }}>{c}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 12px', color: '#f87171', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', background: loading ? 'rgba(252,211,77,.3)' : 'linear-gradient(135deg,#fcd34d,#f59e0b)', border: 'none', borderRadius: 12, padding: '13px 0', color: '#0d1117', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#8aa0cc', marginTop: 18 }}>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" style={{ color: '#fcd34d', fontWeight: 600, textDecoration: 'none' }}>Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
