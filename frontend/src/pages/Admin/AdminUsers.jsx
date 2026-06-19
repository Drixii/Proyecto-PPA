import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import { CountryWithFlag, COUNTRY_CODE } from '../../utils/flags'
import { countryToTz } from '../../utils/timezone'
import api from '../../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

function PointsModal({ userId, userName, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-points', userId],
    queryFn: () => api.get(`/admin/points/${userId}`).then(r => r.data.data),
    staleTime: 0,
  })
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col" style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 60px rgba(0,6,28,.8)' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <div>
            <h3 className="font-bold" style={{ color: '#eaf2ff' }}>Puntos — {userName}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>Vista del super-admin</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: '#8aa0cc' }}>✕</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto" style={{ color: '#eaf2ff' }}>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,.06)' }} />)}
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(253,211,77,.08)', border: '1px solid rgba(253,211,77,.2)' }}>
                  <p className="text-xs mb-1" style={{ color: '#8aa0cc' }}>Total puntos</p>
                  <p className="text-2xl font-bold" style={{ color: '#fcd34d' }}>{data.total_points.toLocaleString()}</p>
                </div>
                <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)' }}>
                  <p className="text-xs mb-1" style={{ color: '#8aa0cc' }}>Equivalente CLP</p>
                  <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>${data.clp_equivalent.toLocaleString('es-CL')}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#8aa0cc' }}>1 pto = ${data.clp_rate} CLP</p>
                </div>
              </div>
              {data.transactions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#8aa0cc' }}>Historial reciente</p>
                  <div className="space-y-1">
                    {data.transactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,.03)' }}>
                        <p className="text-xs" style={{ color: '#8aa0cc' }}>{t.description}</p>
                        <span className="text-xs font-bold" style={{ color: t.points > 0 ? '#4ade80' : '#f87171' }}>
                          {t.points > 0 ? '+' : ''}{t.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.transactions.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: '#475569' }}>Sin transacciones de puntos aún</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const ROLE_LABEL = { client: 'Cliente', admin: 'Super-admin', sub_admin: 'Sub-admin' }
const ROLE_COLOR = {
  client: 'text-blue-600 bg-blue-50',
  admin: 'text-purple-600 bg-purple-50',
  sub_admin: 'text-teal-600 bg-teal-50',
}
const AVAILABLE_COUNTRIES = Object.keys(COUNTRY_CODE).filter(c => !['Peru', 'Mexico', 'Brazil', 'Panama'].includes(c))

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col" style={{background:'#0a1628', border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 60px rgba(0,6,28,.8)'}}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,.07)'}}>
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-xl leading-none" style={{color:'#8aa0cc'}}>✕</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto" style={{color:'#eaf2ff'}}>{children}</div>
      </div>
    </div>
  )
}

function CountryMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const ref = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [open])
  const toggle = (c) => {
    if (selected.includes(c)) onChange(selected.filter(x => x !== c))
    else onChange([...selected, c])
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full rounded-xl px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[38px]"
        style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
      >
        {selected.length === 0
          ? <span style={{color:'#8aa0cc'}}>Seleccionar países...</span>
          : <span className="flex flex-wrap gap-1">
              {selected.map(c => (
                <span key={c} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{background:'rgba(45,212,191,.1)', color:'#2dd4bf'}}>
                  <CountryWithFlag country={c} />
                  <button type="button" onClick={e => { e.stopPropagation(); toggle(c) }} className="ml-0.5" style={{color:'rgba(45,212,191,.6)'}}>✕</button>
                </span>
              ))}
            </span>
        }
      </button>
      {open && (
        <div className="absolute z-[300] mt-1 w-full rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{background:'#0a1628', border:'1px solid rgba(255,255,255,.1)'}}>
          {AVAILABLE_COUNTRIES.map(c => {
            const tz = countryToTz(c)
            const timeNow = now.toLocaleTimeString('es-CL', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                style={selected.includes(c) ? {background:'rgba(45,212,191,.08)'} : {}}
                onMouseEnter={e => { if (!selected.includes(c)) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                onMouseLeave={e => { if (!selected.includes(c)) e.currentTarget.style.background = '' }}
              >
                <CountryWithFlag country={c} />
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[10px]" style={{color:'#475569'}}>{timeNow}</span>
                  {selected.includes(c) && <span className="text-xs" style={{color:'#2dd4bf'}}>✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const [roleTab, setRoleTab] = useState('client')
  const [createModal, setCreateModal] = useState(false)
  const [pwdModal, setPwdModal] = useState(null)
  const [countriesModal, setCountriesModal] = useState(null)
  const [pointsModal, setPointsModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null) // user to delete
  const [trashView, setTrashView] = useState(false)
  const [toast, setToast] = useState(null)

  const [form, setForm] = useState({ email: '', full_name: '', password: '', phone: '', country: '', managed_countries: [] })
  const [pwdMode, setPwdMode] = useState('generate') // 'manual' | 'generate'
  const [pwdVisible, setPwdVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [newPwdMode, setNewPwdMode] = useState('generate')
  const [newPwdVisible, setNewPwdVisible] = useState(false)
  const [newPwdCopied, setNewPwdCopied] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [formError, setFormError] = useState('')
  const [editCountries, setEditCountries] = useState([])

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const roleForQuery = roleTab === 'sub_admin' ? 'sub_admin' : roleTab
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users', roleForQuery],
    queryFn: () => api.get('/admin/users', { params: { role: roleForQuery } }).then(r => r.data.data),
    staleTime: 0,
  })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/admin/users', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setCreateModal(false)
      setForm({ email: '', full_name: '', password: '', phone: '', country: '', managed_countries: [] })
      showToast(res.data.message || 'Usuario creado')
    },
    onError: (err) => setFormError(err.response?.data?.detail || 'Error al crear usuario'),
  })

  const pwdMutation = useMutation({
    mutationFn: ({ id, password }) => api.patch(`/admin/users/${id}/password`, { new_password: password }),
    onSuccess: () => {
      setPwdModal(null)
      setNewPwd('')
      showToast('Contraseña actualizada')
    },
    onError: (err) => setPwdError(err.response?.data?.detail || 'Error'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/admin/users/${id}/toggle-active`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const countriesMutation = useMutation({
    mutationFn: ({ id, countries }) => api.put(`/admin/users/${id}/countries`, { countries }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['sub-admins'] })
      setCountriesModal(null)
      showToast('Países actualizados')
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Error', false),
  })

  const { data: trashUsers = [], isLoading: trashLoading } = useQuery({
    queryKey: ['admin-users-trash'],
    queryFn: () => api.get('/admin/users/trash').then(r => r.data.data),
    enabled: trashView,
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/users/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-users-trash'] })
      setDeleteModal(null)
      showToast(res.data.message || 'Usuario movido a papelera')
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Error al eliminar', false),
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/restore`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-users-trash'] })
      showToast(res.data.message || 'Usuario restaurado')
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Error al restaurar', false),
  })

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*'
    let pwd = ''
    for (let i = 0; i < 14; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    return pwd
  }

  const copyToClipboard = (text, setCopiedFn) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedFn(true)
      setTimeout(() => setCopiedFn(false), 2000)
    })
  }

  const handleCreate = (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.email || !form.full_name || !form.password) {
      setFormError('Email, nombre y contraseña son requeridos')
      return
    }
    const role = roleTab === 'sub_admin' ? 'sub_admin' : (roleTab === 'admin' ? 'admin' : 'client')
    createMutation.mutate({ ...form, role })
  }

  const handlePwd = (e) => {
    e.preventDefault()
    setPwdError('')
    if (newPwd.length < 6) { setPwdError('Mínimo 6 caracteres'); return }
    pwdMutation.mutate({ id: pwdModal.id, password: newPwd })
  }

  const openCountriesModal = (u) => {
    setEditCountries(u.managed_countries || [])
    setCountriesModal(u)
  }

  const TABS = [
    { key: 'client', label: 'Clientes' },
    { key: 'sub_admin', label: 'Sub-admins' },
    { key: 'admin', label: 'Super-admins' },
  ]

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
            <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>
              {trashView ? `${trashUsers.length} en papelera` : `${users.length} usuario${users.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTrashView(v => !v) }}
              className="text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
              style={trashView
                ? {background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', color:'#f87171'}
                : {background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc'}}
            >
              🗑 Papelera
            </button>
            {!trashView && roleTab !== 'admin' && (
              <button
                onClick={() => {
                  const pwd = generatePassword()
                  setForm({ email: '', full_name: '', password: pwd, phone: '', country: '', managed_countries: [] })
                  setPwdMode('generate')
                  setPwdVisible(false)
                  setCopied(false)
                  setFormError('')
                  setCreateModal(true)
                }}
                className="bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm shadow-blue-200 transition-all flex items-center gap-2"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {roleTab === 'sub_admin' ? 'Nuevo sub-admin' : 'Nuevo cliente'}
              </button>
            )}
          </div>
        </div>

        {/* Role tabs — only when not in trash view */}
        {!trashView && (
          <div className="flex items-center rounded-full p-[3px] gap-0.5 w-fit mb-6" style={{background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.07)'}}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setRoleTab(t.key)}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all"
                style={roleTab === t.key ? {background:'linear-gradient(135deg,#1e3a6e,#1e40af)', color:'#fff'} : {color:'#8aa0cc'}}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Trash view */}
        {trashView && (
          <div className="rounded-2xl shadow-sm overflow-hidden" style={{ ...GLASS, border: '1px solid rgba(239,68,68,.2)' }}>
            <div className="px-6 py-4" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
              <p className="text-sm font-semibold" style={{color:'#f87171'}}>Papelera — usuarios eliminados</p>
              <p className="text-xs mt-0.5" style={{color:'#8aa0cc'}}>Se eliminan automáticamente después de 30 días. No se puede forzar la eliminación desde aquí.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-3" style={{color:'#64748b'}}>Usuario</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Email</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Rol</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Eliminado</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#f87171'}}>Días restantes</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {trashLoading && Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {[1,2,3,4,5,6].map(j => (
                        <td key={j} className="px-5 py-4"><div className="h-3 rounded animate-pulse w-24" style={{background:'rgba(255,255,255,.06)'}} /></td>
                      ))}
                    </tr>
                  ))}
                  {!trashLoading && trashUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-sm" style={{color:'#475569'}}>Papelera vacía</td>
                    </tr>
                  )}
                  {!trashLoading && trashUsers.map(u => (
                    <tr key={u.id} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{background:'rgba(239,68,68,.3)'}}>
                            {u.full_name?.[0]?.toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold" style={{color:'#aebfe2'}}>{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4"><span className="text-sm" style={{color:'#8aa0cc'}}>{u.email}</span></td>
                      <td className="px-4 py-4">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{background:'rgba(255,255,255,.06)', color:'#8aa0cc'}}>
                          {u.role === 'client' ? 'Cliente' : u.role === 'sub_admin' ? 'Sub-admin' : 'Admin'}
                        </span>
                      </td>
                      <td className="px-4 py-4"><span className="text-xs" style={{color:'#8aa0cc'}}>{new Date(u.deleted_at).toLocaleDateString('es-CL')}</span></td>
                      <td className="px-4 py-4">
                        <span className="text-xs font-bold" style={{color: u.days_left <= 3 ? '#f87171' : u.days_left <= 7 ? '#fcd34d' : '#4ade80'}}>
                          {u.days_left} día{u.days_left !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => restoreMutation.mutate(u.id)}
                          disabled={restoreMutation.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-colors"
                          style={{background:'rgba(74,222,128,.1)', color:'#4ade80', border:'1px solid rgba(74,222,128,.2)'}}
                        >
                          Restaurar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users table */}
        {!trashView && <div className="rounded-2xl shadow-sm overflow-hidden" style={GLASS}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-3" style={{color:'#64748b'}}>Usuario</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Email</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Teléfono</th>
                  {roleTab === 'sub_admin' && (
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Países</th>
                  )}
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Registro</th>
                  <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: roleTab === 'sub_admin' ? 7 : 6 }).map((__, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 rounded animate-pulse w-24" style={{background:'rgba(255,255,255,.06)'}} /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={roleTab === 'sub_admin' ? 7 : 6} className="px-5 py-16 text-center text-sm" style={{color:'#475569'}}>
                      Sin usuarios registrados
                    </td>
                  </tr>
                )}
                {!isLoading && users.map(u => (
                  <tr key={u.id}
                    style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.full_name?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm" style={{color:'#aebfe2'}}>{u.email}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm" style={{color:'#8aa0cc'}}>{u.phone || '—'}</span>
                    </td>
                    {roleTab === 'sub_admin' && (
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(u.managed_countries || []).length === 0
                            ? <span className="text-xs" style={{color:'#475569'}}>Sin países</span>
                            : (u.managed_countries || []).map(c => (
                                <span key={c} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{background:'rgba(45,212,191,.1)', color:'#2dd4bf'}}>
                                  <CountryWithFlag country={c} />
                                </span>
                              ))
                          }
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-4">
                      <button onClick={() => toggleMutation.mutate(u.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                        style={u.is_active
                          ? {background:'rgba(74,222,128,.1)', color:'#4ade80', border:'1px solid rgba(74,222,128,.2)'}
                          : {background:'rgba(239,68,68,.1)', color:'#f87171', border:'1px solid rgba(239,68,68,.2)'}}>
                        <div className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs" style={{color:'#8aa0cc'}}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('es-CL') : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {roleTab === 'sub_admin' && (
                          <button
                            onClick={() => openCountriesModal(u)}
                            className="text-xs px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
                            style={{background:'rgba(45,212,191,.1)', color:'#2dd4bf'}}
                          >
                            Países
                          </button>
                        )}
                        {roleTab === 'client' && (
                          <button
                            onClick={() => setPointsModal(u)}
                            className="text-xs px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
                            style={{background:'rgba(253,211,77,.1)', color:'#fcd34d'}}
                          >
                            Ver puntos
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const pwd = generatePassword()
                            setNewPwd(pwd)
                            setNewPwdMode('generate')
                            setNewPwdVisible(false)
                            setNewPwdCopied(false)
                            setPwdError('')
                            setPwdModal(u)
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
                          style={{background:'rgba(255,255,255,.06)', color:'#aebfe2'}}
                        >
                          Cambiar clave
                        </button>
                        {roleTab !== 'admin' && (
                          <button
                            onClick={() => setDeleteModal(u)}
                            className="text-xs px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
                            style={{background:'rgba(239,68,68,.1)', color:'#f87171', border:'1px solid rgba(239,68,68,.15)'}}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>}
      </div>

      {/* Create user modal */}
      {createModal && (
        <Modal title={roleTab === 'sub_admin' ? 'Nuevo Sub-admin' : 'Nuevo Cliente'} onClose={() => setCreateModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Nombre completo *</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                placeholder="Juan García" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Contraseña *</label>
              {/* Toggle manual / generar */}
              <div className="flex rounded-lg overflow-hidden mb-2" style={{border:'1px solid rgba(255,255,255,.08)'}}>
                {['generate', 'manual'].map(m => (
                  <button key={m} type="button"
                    onClick={() => {
                      setPwdMode(m)
                      if (m === 'generate') setForm(f => ({ ...f, password: generatePassword() }))
                    }}
                    className="flex-1 text-xs font-semibold py-1.5 transition-colors"
                    style={pwdMode === m
                      ? {background:'rgba(56,189,248,.15)', color:'#38bdf8'}
                      : {background:'transparent', color:'#8aa0cc'}}>
                    {m === 'generate' ? '✨ Generar segura' : '✏️ Manual'}
                  </button>
                ))}
              </div>
              {/* Campo contraseña */}
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)'}}>
                <input
                  type={pwdVisible ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  readOnly={pwdMode === 'generate'}
                  className="flex-1 text-sm focus:outline-none font-mono"
                  style={{background:'transparent', color: pwdMode === 'generate' ? '#4ade80' : '#eaf2ff'}}
                  placeholder="Mínimo 6 caracteres"
                />
                <button type="button" onClick={() => setPwdVisible(v => !v)}
                  className="shrink-0 text-xs" style={{color:'#475569'}}>
                  {pwdVisible ? '🙈' : '👁'}
                </button>
                {pwdMode === 'generate' && (
                  <>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, password: generatePassword() }))}
                      title="Regenerar"
                      className="shrink-0 text-xs px-1" style={{color:'#8aa0cc'}}>⟳</button>
                    <button type="button"
                      onClick={() => copyToClipboard(form.password, setCopied)}
                      className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-semibold transition-colors"
                      style={copied
                        ? {background:'rgba(74,222,128,.15)', color:'#4ade80'}
                        : {background:'rgba(255,255,255,.06)', color:'#8aa0cc'}}>
                      {copied ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </>
                )}
              </div>
              {pwdMode === 'generate' && (
                <p className="text-[10px] mt-1" style={{color:'#475569'}}>
                  Contraseña generada automáticamente. El sub-admin deberá cambiarla al primer inicio de sesión.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Teléfono</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                placeholder="+56 9 1234 5678" />
            </div>
            {roleTab === 'sub_admin' && (
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Países asignados</label>
                <CountryMultiSelect
                  selected={form.managed_countries}
                  onChange={v => setForm(f => ({ ...f, managed_countries: v }))}
                />
                {form.managed_countries.length > 0 && (
                  <p className="text-xs mt-1.5 flex items-center gap-1 flex-wrap" style={{color:'#60a5fa'}}>
                    🕐 Zona horaria principal:
                    <span className="font-semibold">{countryToTz(form.managed_countries[0])}</span>
                    <span style={{color:'#475569'}}>(país #{1}: {form.managed_countries[0]})</span>
                  </p>
                )}
              </div>
            )}
            {formError && <p className="text-xs px-3 py-2 rounded-lg" style={{color:'#f87171', background:'rgba(239,68,68,.1)'}}>{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setCreateModal(false)}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                Cancelar
              </button>
              <button type="submit" disabled={createMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-all disabled:opacity-60">
                {createMutation.isPending ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit countries modal */}
      {countriesModal && (
        <Modal title={`Países — ${countriesModal.full_name}`} onClose={() => setCountriesModal(null)}>
          <div className="space-y-4">
            <p className="text-xs" style={{color:'#8aa0cc'}}>El primer país seleccionado define la zona horaria del sub-admin.</p>
            <CountryMultiSelect selected={editCountries} onChange={setEditCountries} />
            {editCountries.length > 0 && (
              <p className="text-xs flex items-center gap-1 flex-wrap" style={{color:'#60a5fa'}}>
                🕐 Zona horaria: <span className="font-semibold">{countryToTz(editCountries[0])}</span>
                <span style={{color:'#475569'}}>(país principal: {editCountries[0]})</span>
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setCountriesModal(null)}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                Cancelar
              </button>
              <button
                onClick={() => countriesMutation.mutate({ id: countriesModal.id, countries: editCountries })}
                disabled={countriesMutation.isPending}
                className="flex-1 bg-gradient-to-r from-teal-500 to-teal-700 hover:from-teal-600 hover:to-teal-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-all disabled:opacity-60">
                {countriesMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Change password modal */}
      {pwdModal && (
        <Modal title={`Cambiar clave — ${pwdModal.full_name}`} onClose={() => { setPwdModal(null); setNewPwdCopied(false) }}>
          <form onSubmit={handlePwd} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Nueva contraseña</label>
              {/* Toggle */}
              <div className="flex rounded-lg overflow-hidden mb-2" style={{border:'1px solid rgba(255,255,255,.08)'}}>
                {['generate', 'manual'].map(m => (
                  <button key={m} type="button"
                    onClick={() => {
                      setNewPwdMode(m)
                      if (m === 'generate') setNewPwd(generatePassword())
                    }}
                    className="flex-1 text-xs font-semibold py-1.5 transition-colors"
                    style={newPwdMode === m
                      ? {background:'rgba(56,189,248,.15)', color:'#38bdf8'}
                      : {background:'transparent', color:'#8aa0cc'}}>
                    {m === 'generate' ? '✨ Generar segura' : '✏️ Manual'}
                  </button>
                ))}
              </div>
              {/* Campo */}
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)'}}>
                <input
                  type={newPwdVisible ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  readOnly={newPwdMode === 'generate'}
                  autoFocus={newPwdMode === 'manual'}
                  className="flex-1 text-sm focus:outline-none font-mono"
                  style={{background:'transparent', color: newPwdMode === 'generate' ? '#4ade80' : '#eaf2ff'}}
                  placeholder="Mínimo 6 caracteres"
                />
                <button type="button" onClick={() => setNewPwdVisible(v => !v)}
                  className="shrink-0 text-xs" style={{color:'#475569'}}>
                  {newPwdVisible ? '🙈' : '👁'}
                </button>
                {newPwdMode === 'generate' && (
                  <>
                    <button type="button"
                      onClick={() => setNewPwd(generatePassword())}
                      title="Regenerar"
                      className="shrink-0 text-xs px-1" style={{color:'#8aa0cc'}}>⟳</button>
                    <button type="button"
                      onClick={() => copyToClipboard(newPwd, setNewPwdCopied)}
                      className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-semibold transition-colors"
                      style={newPwdCopied
                        ? {background:'rgba(74,222,128,.15)', color:'#4ade80'}
                        : {background:'rgba(255,255,255,.06)', color:'#8aa0cc'}}>
                      {newPwdCopied ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] mt-1" style={{color:'#475569'}}>
                El usuario deberá cambiar su contraseña al próximo inicio de sesión.
              </p>
            </div>
            {pwdError && <p className="text-xs px-3 py-2 rounded-lg" style={{color:'#f87171', background:'rgba(239,68,68,.1)'}}>{pwdError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setPwdModal(null)}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                Cancelar
              </button>
              <button type="submit" disabled={pwdMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-all disabled:opacity-60">
                {pwdMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Points modal */}
      {pointsModal && (
        <PointsModal
          userId={pointsModal.id}
          userName={pointsModal.full_name}
          onClose={() => setPointsModal(null)}
        />
      )}

      {/* Delete confirm modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{background:'#0a1628', border:'1px solid rgba(239,68,68,.3)', boxShadow:'0 24px 60px rgba(0,6,28,.9)'}}>
            <div className="px-6 py-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'rgba(239,68,68,.12)'}}>
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#f87171" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-center mb-1" style={{color:'#eaf2ff'}}>Eliminar usuario</h3>
              <p className="text-sm text-center mb-1" style={{color:'#aebfe2'}}>
                <strong style={{color:'#eaf2ff'}}>{deleteModal.full_name}</strong> será movido a la papelera.
              </p>
              <p className="text-xs text-center mb-5" style={{color:'#8aa0cc'}}>
                Podrás restaurarlo durante los próximos 30 días desde la papelera.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal(null)}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deleteModal.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 text-sm font-bold py-2.5 rounded-xl transition-all disabled:opacity-60"
                  style={{background:'rgba(239,68,68,.8)', color:'#fff'}}
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Mover a papelera'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[700] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${toast.ok ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}
    </FinexyLayout>
  )
}
