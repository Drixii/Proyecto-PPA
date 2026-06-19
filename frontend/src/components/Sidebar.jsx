import { NavLink, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

const ADMIN_NAV = [
  { path: '/admin', label: 'Inicio', icon: '⊞', exact: true },
  { path: '/admin/pipeline', label: 'Pipeline', icon: '◫' },
  { path: '/admin/settings', label: 'Ajustes', icon: '⚙' },
]

const CLIENT_NAV = [
  { path: '/dashboard', label: 'Inicio', icon: '⊞', exact: true },
  { path: '/new-transfer', label: 'Nueva transferencia', icon: '+' },
]

export default function Sidebar() {
  const { user, logout } = useStore()
  const navigate = useNavigate()
  const nav = user?.role === 'admin' ? ADMIN_NAV : CLIENT_NAV

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <aside className="w-60 bg-slate-900 min-h-screen flex flex-col text-white shrink-0">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-lg font-bold">CC</div>
          <div>
            <p className="font-bold text-sm leading-tight">CasaCambios</p>
            <p className="text-xs text-slate-400 uppercase tracking-wider">
              {user?.role === 'admin' ? 'Administrador' : 'Cliente'}
            </p>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="px-6 py-4 border-b border-slate-700/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-sm font-bold">
            {user?.full_name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ path, label, icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-base w-5 text-center">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-700/60">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-white w-full transition-all duration-150"
        >
          <span className="text-base w-5 text-center">→</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
