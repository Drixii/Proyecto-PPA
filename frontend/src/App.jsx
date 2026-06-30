import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import api from './services/api'
import Home from './pages/Home'
import Login from './pages/Auth/Login'
import Dashboard from './pages/Client/Dashboard'
import NewTransfer from './pages/Client/NewTransfer'
import OrderDetail from './pages/Client/OrderDetail'
import AdminDashboard from './pages/Admin/AdminDashboard'
import Pipeline from './pages/Admin/Pipeline'
import OrderAdmin from './pages/Admin/OrderAdmin'
import AdminSettings from './pages/Admin/AdminSettings'
import AdminOrders from './pages/Admin/AdminOrders'
import AdminUsers from './pages/Admin/AdminUsers'
import ClientHistory from './pages/Client/ClientHistory'
import ClientProfile from './pages/Client/ClientProfile'
import SubAdminDashboard from './pages/SubAdmin/SubAdminDashboard'
import SubAdminPipeline from './pages/SubAdmin/SubAdminPipeline'
import SubAdminOrders from './pages/SubAdmin/SubAdminOrders'
import AdminProfile from './pages/Admin/AdminProfile'
import AdminPoints from './pages/Admin/AdminPoints'
import ClientPoints from './pages/Client/ClientPoints'
import VuelosPrueba from './pages/VuelosPrueba'

function roleHome(role) {
  if (role === 'admin') return '/admin'
  if (role === 'sub_admin') return '/sub-admin'
  return '/dashboard'
}

function RequireAuth({ children, role }) {
  const { user, token } = useStore()
  if (!token || !user) return <Navigate to="/" replace />
  if (role) {
    const allowed = Array.isArray(role) ? role : [role]
    if (!allowed.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />
  }
  return children
}

function UserRefresh() {
  const { token, setUser } = useStore()
  useEffect(() => {
    if (!token) return
    api.get('/auth/me').then(r => setUser(r.data.data)).catch(() => {})
  }, [])
  return null
}

function ForceChangePassword() {
  const { user, setUser } = useStore()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [show, setShow] = useState(false)

  if (!user?.must_change_password || done) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    if (pwd.length < 6) { setErr('Mínimo 6 caracteres'); return }
    if (pwd !== confirm) { setErr('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const r = await api.patch('/auth/force-change-password', { new_password: pwd })
      setUser(r.data.data)
      setDone(true)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Error al cambiar contraseña')
    } finally {
      setLoading(false)
    }
  }

  const GLASS = { background: 'rgba(8,16,44,.97)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,.8)' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,6,.82)', backdropFilter: 'blur(8px)' }}>
      <div style={{ ...GLASS, width: '90vw', maxWidth: 420, padding: '32px 28px' }}>
        {/* Icono */}
        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#fbbf24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 style={{ color: '#eaf2ff', fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Cambia tu contraseña ahora</h2>
        <p style={{ color: '#8aa0cc', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          Por seguridad, debes establecer una nueva contraseña antes de continuar.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: '#aebfe2', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Nueva contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoFocus
                style={{ width: '100%', background: 'rgba(6,13,40,.85)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 40px 10px 14px', color: '#eaf2ff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShow(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8aa0cc', cursor: 'pointer', fontSize: 13 }}>
                {show ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#aebfe2', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Confirmar contraseña</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              style={{ width: '100%', background: 'rgba(6,13,40,.85)', border: confirm && confirm !== pwd ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', color: '#eaf2ff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {err && (
            <p style={{ color: '#f87171', fontSize: 12, padding: '8px 12px', background: 'rgba(239,68,68,.1)', borderRadius: 8 }}>{err}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: 4, padding: '12px 0', borderRadius: 12, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <UserRefresh />
      <ForceChangePassword />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* Cliente */}
        <Route path="/dashboard" element={<RequireAuth role="client"><Dashboard /></RequireAuth>} />
        <Route path="/historial" element={<RequireAuth role="client"><ClientHistory /></RequireAuth>} />
        <Route path="/new-transfer" element={<RequireAuth role="client"><NewTransfer /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth role="client"><OrderDetail /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth role="client"><ClientProfile /></RequireAuth>} />
        <Route path="/mis-puntos" element={<RequireAuth role="client"><ClientPoints /></RequireAuth>} />

        {/* Super-Admin */}
        <Route path="/admin" element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>} />
        <Route path="/admin/pipeline" element={<RequireAuth role="admin"><Pipeline /></RequireAuth>} />
        <Route path="/admin/orders/:id" element={<RequireAuth role="admin"><OrderAdmin /></RequireAuth>} />
        <Route path="/admin/settings" element={<RequireAuth role="admin"><AdminSettings /></RequireAuth>} />
        <Route path="/admin/orders" element={<RequireAuth role="admin"><AdminOrders /></RequireAuth>} />
        <Route path="/admin/users" element={<RequireAuth role="admin"><AdminUsers /></RequireAuth>} />

        {/* Super-Admin Profile */}
        <Route path="/admin/profile" element={<RequireAuth role="admin"><AdminProfile /></RequireAuth>} />
        <Route path="/admin/points" element={<RequireAuth role="admin"><AdminPoints /></RequireAuth>} />

        {/* Sub-Admin */}
        <Route path="/sub-admin" element={<RequireAuth role="sub_admin"><SubAdminDashboard /></RequireAuth>} />
        <Route path="/sub-admin/pipeline" element={<RequireAuth role="sub_admin"><SubAdminPipeline /></RequireAuth>} />
        <Route path="/sub-admin/orders" element={<RequireAuth role="sub_admin"><SubAdminOrders /></RequireAuth>} />
        <Route path="/sub-admin/profile" element={<RequireAuth role="sub_admin"><AdminProfile /></RequireAuth>} />

        <Route path="/Vuelos-prueba" element={<VuelosPrueba />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
