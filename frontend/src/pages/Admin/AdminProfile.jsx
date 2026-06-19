import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'
import { useStore } from '../../store/useStore'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function AdminProfile() {
  const { user, setUser } = useStore()
  const fileRef = useRef()

  const [infoForm, setInfoForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
  })
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [infoMsg, setInfoMsg] = useState(null)
  const [pwdMsg, setPwdMsg] = useState(null)
  const [avatarLoading, setAvatarLoading] = useState(false)

  const avatarUrl = user?.avatar ? `/uploads/avatars/${user.avatar}` : null

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await api.post('/auth/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUser(res.data.data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al subir foto')
    } finally {
      setAvatarLoading(false)
    }
  }

  const infoMutation = useMutation({
    mutationFn: (data) => api.patch('/auth/profile', data),
    onSuccess: (res) => {
      setUser(res.data.data)
      setInfoMsg({ ok: true, text: 'Información actualizada' })
      setTimeout(() => setInfoMsg(null), 3000)
    },
    onError: (err) => setInfoMsg({ ok: false, text: err.response?.data?.detail || 'Error al guardar' }),
  })

  const pwdMutation = useMutation({
    mutationFn: (data) => api.patch('/auth/profile', data),
    onSuccess: () => {
      setPwdForm({ current_password: '', new_password: '', confirm: '' })
      setPwdMsg({ ok: true, text: 'Contraseña actualizada' })
      setTimeout(() => setPwdMsg(null), 3000)
    },
    onError: (err) => setPwdMsg({ ok: false, text: err.response?.data?.detail || 'Error' }),
  })

  const handleInfo = (e) => {
    e.preventDefault()
    setInfoMsg(null)
    infoMutation.mutate({ full_name: infoForm.full_name, phone: infoForm.phone })
  }

  const handlePwd = (e) => {
    e.preventDefault()
    setPwdMsg(null)
    if (pwdForm.new_password !== pwdForm.confirm) {
      setPwdMsg({ ok: false, text: 'Las contraseñas nuevas no coinciden' })
      return
    }
    if (pwdForm.new_password.length < 6) {
      setPwdMsg({ ok: false, text: 'Mínimo 6 caracteres' })
      return
    }
    pwdMutation.mutate({ current_password: pwdForm.current_password, new_password: pwdForm.new_password })
  }

  const roleLabel = user?.role === 'admin' ? 'Super Admin' : 'Sub Administrador'
  const roleBadgeColor = user?.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
  const roleDot = user?.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'

  const inputStyle = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff' }
  const inputDisabledStyle = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#64748b' }

  return (
    <FinexyLayout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{color:'#eaf2ff'}}>Mi cuenta</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>Administra tu información y contraseña</p>
        </div>

        {/* Avatar + info summary */}
        <div className="rounded-2xl p-6 mb-5 flex items-center gap-5" style={GLASS}>
          {/* Avatar with click-to-change */}
          <div className="relative shrink-0 group" onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAvatarChange} />
            <div className="w-16 h-16 rounded-2xl overflow-hidden cursor-pointer">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-purple-400 to-purple-800 flex items-center justify-center text-white text-2xl font-bold">
                    {user?.full_name?.[0]?.toUpperCase()}
                  </div>
              }
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              {avatarLoading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              }
            </div>
          </div>
          <div>
            <p className="text-lg font-bold" style={{color:'#eaf2ff'}}>{user?.full_name}</p>
            <p className="text-sm" style={{color:'#aebfe2'}}>{user?.email}</p>
            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-semibold rounded-full ${roleBadgeColor}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${roleDot}`} />
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Info form */}
        <div className="rounded-2xl p-6 mb-5" style={GLASS}>
          <h2 className="text-base font-bold mb-4" style={{color:'#eaf2ff'}}>Información personal</h2>
          <form onSubmit={handleInfo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Nombre completo</label>
                <input
                  value={infoForm.full_name}
                  onChange={e => setInfoForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={inputStyle}
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Correo electrónico</label>
                <input
                  value={user?.email || ''}
                  disabled
                  className="w-full rounded-xl px-3 py-2.5 text-sm cursor-not-allowed"
                  style={inputDisabledStyle}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Teléfono</label>
              <input
                value={infoForm.phone}
                onChange={e => setInfoForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={inputStyle}
                placeholder="+56 9 1234 5678"
              />
            </div>
            {infoMsg && (
              <p className="text-xs px-3 py-2 rounded-lg" style={infoMsg.ok ? {background:'rgba(74,222,128,.1)', color:'#4ade80'} : {background:'rgba(239,68,68,.1)', color:'#f87171'}}>
                {infoMsg.text}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={infoMutation.isPending}
                className="bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                {infoMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>

        {/* Password form */}
        <div className="rounded-2xl p-6" style={GLASS}>
          <h2 className="text-base font-bold mb-1" style={{color:'#eaf2ff'}}>Cambiar contraseña</h2>
          <p className="text-xs mb-4" style={{color:'#8aa0cc'}}>Deja los campos en blanco si no deseas cambiarla</p>
          <form onSubmit={handlePwd} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Contraseña actual</label>
              <input type="password"
                value={pwdForm.current_password}
                onChange={e => setPwdForm(f => ({ ...f, current_password: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={inputStyle}
                placeholder="••••••••"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Nueva contraseña</label>
                <input type="password"
                  value={pwdForm.new_password}
                  onChange={e => setPwdForm(f => ({ ...f, new_password: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={inputStyle}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Confirmar nueva contraseña</label>
                <input type="password"
                  value={pwdForm.confirm}
                  onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={inputStyle}
                  placeholder="Repetir contraseña"
                />
              </div>
            </div>
            {pwdMsg && (
              <p className="text-xs px-3 py-2 rounded-lg" style={pwdMsg.ok ? {background:'rgba(74,222,128,.1)', color:'#4ade80'} : {background:'rgba(239,68,68,.1)', color:'#f87171'}}>
                {pwdMsg.text}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={pwdMutation.isPending}
                className="bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                {pwdMutation.isPending ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </FinexyLayout>
  )
}
