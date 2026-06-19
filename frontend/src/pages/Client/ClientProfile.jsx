import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'
import { useStore } from '../../store/useStore'
import { COUNTRY_CODE, CountryWithFlag } from '../../utils/flags'
import { countryToTz, userTz } from '../../utils/timezone'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

function AvatarUpload({ user, setUser }) {
  const fileRef = useRef()
  const [loading, setLoading] = useState(false)
  const avatarUrl = user?.avatar ? `/uploads/avatars/${user.avatar}` : null

  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await api.post('/auth/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUser(res.data.data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al subir foto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative shrink-0 group cursor-pointer" onClick={() => fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleChange} />
      <div className="w-16 h-16 rounded-2xl overflow-hidden">
        {avatarUrl
          ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-800 flex items-center justify-center text-white text-2xl font-bold">
              {user?.full_name?.[0]?.toUpperCase()}
            </div>
        }
      </div>
      <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        {loading
          ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        }
      </div>
    </div>
  )
}

const seen = new Set()
const PROFILE_COUNTRIES = Object.entries(COUNTRY_CODE)
  .filter(([, code]) => { if (seen.has(code)) return false; seen.add(code); return true })
  .map(([name, code]) => ({ name, code }))

function CountryPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const selected = PROFILE_COUNTRIES.find(c => c.name === value)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:border-blue-400 transition-colors text-left"
        style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}>
        {selected
          ? <img src={`https://flagcdn.com/20x15/${selected.code}.png`} alt="" className="w-5 h-[14px] rounded-sm object-cover shrink-0" />
          : <span className="w-5 h-[14px] rounded-sm shrink-0" style={{background:'rgba(255,255,255,.06)'}} />
        }
        <span className="flex-1 text-sm font-semibold" style={{color: selected ? '#eaf2ff' : '#8aa0cc'}}>
          {selected?.name || 'Seleccionar país...'}
        </span>
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="shrink-0" style={{color:'#8aa0cc'}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-xl z-[300] max-h-48 overflow-y-auto"
          style={{background:'rgba(8,16,44,.97)', border:'1px solid rgba(255,255,255,.08)'}}>
          {PROFILE_COUNTRIES.map(c => (
            <button key={c.name} type="button"
              onClick={() => { onChange(c.name); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left"
              style={value === c.name ? {background:'rgba(56,189,248,.08)'} : {}}>
              <img src={`https://flagcdn.com/20x15/${c.code}.png`} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />
              <span className="text-sm" style={{color:'#eaf2ff'}}>{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClientProfile() {
  const { user, setUser } = useStore()

  const { data: coverage } = useQuery({
    queryKey: ['my-coverage'],
    queryFn: () => api.get('/auth/my-coverage').then(r => r.data.data),
    enabled: !!user,
    staleTime: 300000,
  })

  const [infoForm, setInfoForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    country: user?.country || '',
  })
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [infoMsg, setInfoMsg] = useState(null)
  const [pwdMsg, setPwdMsg] = useState(null)
  const [countryConfirm, setCountryConfirm] = useState(null) // pending country to confirm

  const infoMutation = useMutation({
    mutationFn: (data) => api.patch('/auth/profile', data),
    onSuccess: (res, variables) => {
      setUser(res.data.data)
      if (variables.country && variables.country !== user?.country) {
        // Country changed → reload so all dates, clocks, notifications re-render with new tz
        window.location.reload()
      } else {
        setInfoMsg({ ok: true, text: 'Información actualizada' })
        setTimeout(() => setInfoMsg(null), 3000)
      }
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
    infoMutation.mutate({ full_name: infoForm.full_name, phone: infoForm.phone, country: infoForm.country })
  }

  const handleCountryChange = (newCountry) => {
    if (newCountry && newCountry !== infoForm.country) {
      setCountryConfirm(newCountry)
    } else {
      setInfoForm(f => ({ ...f, country: newCountry }))
    }
  }

  const confirmCountryChange = () => {
    const newCountry = countryConfirm
    setCountryConfirm(null)
    setInfoForm(f => ({ ...f, country: newCountry }))
    infoMutation.mutate({ full_name: infoForm.full_name, phone: infoForm.phone, country: newCountry })
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

  return (
    <FinexyLayout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{color:'#eaf2ff'}}>Mi cuenta</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>Administra tu información personal y contraseña</p>
        </div>

        {/* Avatar + info summary */}
        <div className="rounded-2xl p-6 mb-5"
          style={GLASS}>
          <div className="flex items-center gap-5">
            <AvatarUpload user={user} setUser={setUser} />
            <div>
              <p className="text-lg font-bold" style={{color:'#eaf2ff'}}>{user?.full_name}</p>
              <p className="text-sm" style={{color:'#aebfe2'}}>{user?.email}</p>
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-semibold rounded-full"
                style={{background:'rgba(56,189,248,.1)', color:'#38bdf8'}}>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Cliente activo
              </span>
            </div>
          </div>
          {coverage && coverage.countries && coverage.countries.length > 0 && (
            <div className="mt-4 pt-4" style={{borderTop:'1px solid rgba(255,255,255,.06)'}}>
              <p className="text-xs font-semibold mb-2" style={{color:'#8aa0cc'}}>Países cubiertos por tu encargado:</p>
              <div className="flex flex-wrap gap-2">
                {coverage.countries.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{background:'rgba(45,212,191,.08)', color:'#2dd4bf', border:'1px solid rgba(45,212,191,.15)'}}>
                    <CountryWithFlag country={c} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Info form */}
        <div className="rounded-2xl p-6 mb-5"
          style={{...GLASS, position:'relative', zIndex:2}}>
          <h2 className="text-base font-bold mb-4" style={{color:'#eaf2ff'}}>Información personal</h2>
          <form onSubmit={handleInfo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Nombre completo</label>
                <input
                  value={infoForm.full_name}
                  onChange={e => setInfoForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Correo electrónico</label>
                <input
                  value={user?.email || ''}
                  disabled
                  className="w-full rounded-xl px-3 py-2.5 text-sm cursor-not-allowed"
                  style={{background:'rgba(4,10,28,.6)', border:'1px solid rgba(255,255,255,.06)', color:'#64748b'}}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Teléfono</label>
                <input
                  value={infoForm.phone}
                  onChange={e => setInfoForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                  placeholder="+56 9 1234 5678"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>País</label>
                <CountryPicker value={infoForm.country} onChange={handleCountryChange} />
                {infoForm.country && (
                  <p className="text-xs mt-1.5 flex items-center gap-1" style={{color:'#60a5fa'}}>
                    🕐 <span className="font-semibold">{countryToTz(infoForm.country)}</span>
                  </p>
                )}
              </div>
            </div>
            {infoMsg && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={infoMsg.ok ? {background:'rgba(74,222,128,.1)', color:'#4ade80'} : {background:'rgba(239,68,68,.1)', color:'#f87171'}}>
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
        <div className="rounded-2xl p-6"
          style={GLASS}>
          <h2 className="text-base font-bold mb-1" style={{color:'#eaf2ff'}}>Cambiar contraseña</h2>
          <p className="text-xs mb-4" style={{color:'#8aa0cc'}}>Deja los campos en blanco si no deseas cambiarla</p>
          <form onSubmit={handlePwd} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Contraseña actual</label>
              <input type="password"
                value={pwdForm.current_password}
                onChange={e => setPwdForm(f => ({ ...f, current_password: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
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
                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{color:'#aebfe2'}}>Confirmar nueva contraseña</label>
                <input type="password"
                  value={pwdForm.confirm}
                  onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                  placeholder="Repetir contraseña"
                />
              </div>
            </div>
            {pwdMsg && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={pwdMsg.ok ? {background:'rgba(74,222,128,.1)', color:'#4ade80'} : {background:'rgba(239,68,68,.1)', color:'#f87171'}}>
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

      {/* Country change confirmation popup */}
      {countryConfirm && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
            style={{background:'#0a1628', border:'1px solid rgba(56,189,248,.25)', boxShadow:'0 24px 60px rgba(0,6,28,.9)'}}>
            <div className="px-6 py-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{background:'rgba(56,189,248,.1)'}}>
                <span style={{fontSize:22}}>🌍</span>
              </div>
              <h3 className="text-base font-bold text-center mb-2" style={{color:'#eaf2ff'}}>
                ¿Cambiar país?
              </h3>
              <p className="text-sm text-center mb-1" style={{color:'#aebfe2'}}>
                Cambiarás tu país a <strong style={{color:'#eaf2ff'}}>{countryConfirm}</strong>.
              </p>
              <p className="text-xs text-center mb-5" style={{color:'#8aa0cc'}}>
                Se actualizarán los horarios de todos tus pedidos, notificaciones y el reloj del panel.
                La página se recargará automáticamente.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCountryConfirm(null)}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCountryChange}
                  disabled={infoMutation.isPending}
                  className="flex-1 text-sm font-bold py-2.5 rounded-xl transition-all disabled:opacity-60"
                  style={{background:'linear-gradient(135deg,#1e3a6e,#1e40af)', color:'#fff'}}
                >
                  {infoMutation.isPending ? 'Guardando...' : 'Sí, cambiar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </FinexyLayout>
  )
}
