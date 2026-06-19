import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../../services/api'
import { useStore } from '../../store/useStore'

const COUNTRIES = ['Chile', 'Colombia', 'Venezuela', 'Perú', 'Argentina', 'Ecuador', 'México', 'Bolivia', 'Brasil', 'Uruguay', 'Paraguay']

export default function Register() {
  const [form, setForm] = useState({ email: '', full_name: '', password: '', phone: '', country: 'Chile' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useStore()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💱</div>
          <h1 className="text-2xl font-bold text-gray-900">Crear cuenta</h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {[
            { key: 'full_name', label: 'Nombre completo', type: 'text', placeholder: 'Juan García' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'tu@email.com' },
            { key: 'password', label: 'Contraseña', type: 'password', placeholder: '••••••••' },
            { key: 'phone', label: 'Teléfono (opcional)', type: 'tel', placeholder: '+56 9...' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={key !== 'phone'}
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">País</label>
            <select
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
