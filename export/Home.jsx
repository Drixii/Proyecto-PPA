import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import CalculatorDark from '../components/CalculatorDark'
import Portal from '../components/Portal'
import { useStore } from '../store/useStore'
import { flagUrl } from '../utils/flags'
import api from '../services/api'
import logoSrc from '../assets/logo.png'

// ── Utilidades del globo ──────────────────────────────────────────────────────
function initGlobe(canvas) {
  const ctx = canvas.getContext('2d')
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 0, rafId = null

  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2)
    const r = canvas.getBoundingClientRect()
    W = r.width; H = r.height
    canvas.width = Math.max(1, W * DPR)
    canvas.height = Math.max(1, H * DPR)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    cx = W * 0.5; cy = H * 0.5
    R = Math.min(W * 0.40, H * 0.62)
  }
  resize()
  window.addEventListener('resize', resize, { passive: true })

  const dots = []
  for (let lat = -82; lat <= 82; lat += 5) {
    const rr = Math.cos(lat * Math.PI / 180)
    const n = Math.max(1, Math.round(48 * rr))
    for (let i = 0; i < n; i++) dots.push({ lat: lat * Math.PI / 180, lon: (i / n) * Math.PI * 2 })
  }

  const cities = {
    usa: [40.7, -74.0], ven: [10.5, -66.9], col: [4.7, -74.1], chl: [-33.4, -70.6],
    mex: [19.4, -99.1], bra: [-23.5, -46.6], esp: [40.4, -3.7], gbr: [51.5, -0.1],
    nga: [6.5, 3.4], ken: [-1.3, 36.8], ind: [19.1, 72.9], aus: [-33.9, 151.2],
  }
  const toVec = ([la, lo]) => {
    const a = la * Math.PI / 180, b = lo * Math.PI / 180
    return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]
  }
  const arcDefs = [
    ['usa', 'ven'], ['usa', 'col'], ['mex', 'esp'], ['chl', 'esp'],
    ['bra', 'gbr'], ['bra', 'ind'], ['gbr', 'nga'], ['esp', 'ven'],
    ['ind', 'aus'], ['nga', 'ken'], ['usa', 'gbr'], ['col', 'ind'],
  ]
  const arcs = arcDefs.map((d, i) => ({
    a: toVec(cities[d[0]]), b: toVec(cities[d[1]]),
    off: i / arcDefs.length, spd: 0.055 + ((i * 2) % 6) * 0.009,
  }))
  const cityVecs = Object.fromEntries(Object.entries(cities).map(([k, v]) => [k, toVec(v)]))
  const cityKeys = Object.keys(cities)
  const cityIso2 = { usa: 'us', ven: 've', col: 'co', chl: 'cl', mex: 'mx', bra: 'br', esp: 'es', gbr: 'gb', nga: 'ng', ken: 'ke', ind: 'in', aus: 'au' }
  const flagImgs = {}
  for (const key of cityKeys) {
    if (cityIso2[key]) {
      const img = new Image(); img.crossOrigin = 'anonymous'
      img.src = `https://flagcdn.com/40x30/${cityIso2[key]}.png?v=g`
      flagImgs[key] = img
    }
  }

  const slerp = (a, b, t) => {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    dot = Math.max(-1, Math.min(1, dot))
    const om = Math.acos(dot), so = Math.sin(om) || 1e-6
    const s0 = Math.sin((1 - t) * om) / so, s1 = Math.sin(t * om) / so
    return [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1]
  }

  let rot = 0
  const draw = () => {
    ctx.clearRect(0, 0, W, H)
    rot += 0.0018
    const cosR = Math.cos(rot), sinR = Math.sin(rot)
    const rotY = (x, y, z) => [x * cosR - z * sinR, y, x * sinR + z * cosR]

    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.55)
    g.addColorStop(0, 'rgba(56,189,248,0.10)'); g.addColorStop(1, 'rgba(56,189,248,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(120,180,255,0.18)'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()

    for (const d of dots) {
      const x0 = Math.cos(d.lat) * Math.sin(d.lon), y0 = Math.sin(d.lat), z0 = Math.cos(d.lat) * Math.cos(d.lon)
      const [x, y, z] = rotY(x0, y0, z0)
      const depth = (z + 1) / 2, alpha = 0.12 + depth * 0.68, size = depth * 1.5 + 0.3
      ctx.fillStyle = z > 0 ? `rgba(125,211,252,${alpha})` : `rgba(90,130,210,${alpha * 0.45})`
      ctx.beginPath(); ctx.arc(cx + x * R, cy - y * R, size, 0, Math.PI * 2); ctx.fill()
    }

    const now = performance.now() / 1000
    for (const arc of arcs) {
      const N = 44; let prev = null
      for (let i = 0; i <= N; i++) {
        const t = i / N; let v = slerp(arc.a, arc.b, t)
        const lift = 1 + Math.sin(t * Math.PI) * 0.22; v = [v[0] * lift, v[1] * lift, v[2] * lift]
        const [x, y, z] = rotY(v[0], v[1], v[2]); const sx = cx + x * R, sy = cy - y * R
        if (prev && prev.z > -0.1 && z > -0.1) {
          ctx.strokeStyle = `rgba(255,20,150,${0.18 + Math.max(0, z) * 0.42})`; ctx.lineWidth = 1.1
          ctx.beginPath(); ctx.moveTo(prev.sx, prev.sy); ctx.lineTo(sx, sy); ctx.stroke()
        }
        prev = { sx, sy, z }
      }
      const tp = (now * arc.spd + arc.off) % 1
      let pv = slerp(arc.a, arc.b, tp); const plift = 1 + Math.sin(tp * Math.PI) * 0.22
      pv = [pv[0] * plift, pv[1] * plift, pv[2] * plift]
      const [px, py, pz] = rotY(pv[0], pv[1], pv[2])
      if (pz > -0.1) {
        const psx = cx + px * R, psy = cy - py * R
        const gg = ctx.createRadialGradient(psx, psy, 0, psx, psy, 11)
        gg.addColorStop(0, 'rgba(255,220,0,0.95)'); gg.addColorStop(0.35, 'rgba(255,180,0,0.65)'); gg.addColorStop(1, 'rgba(255,120,0,0)')
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(psx, psy, 11, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,248,160,1)'; ctx.beginPath(); ctx.arc(psx, psy, 2.4, 0, Math.PI * 2); ctx.fill()
      }
    }

    for (const key of cityKeys) {
      const v = cityVecs[key]; if (!v) continue
      const [x, y, z] = rotY(v[0], v[1], v[2]); if (z < -0.08) continue
      const sx = cx + x * R, sy = cy - y * R, a = Math.max(0, (z + 0.08) / 1.08)
      const fr = Math.max(11, Math.round(R * 0.048 * (0.55 + a * 0.45)))
      const hh = ctx.createRadialGradient(sx, sy, fr * 0.4, sx, sy, fr * 2.8)
      hh.addColorStop(0, `rgba(255,220,0,${a * 0.52})`); hh.addColorStop(0.45, `rgba(255,160,0,${a * 0.26})`); hh.addColorStop(1, 'rgba(255,100,0,0)')
      ctx.fillStyle = hh; ctx.beginPath(); ctx.arc(sx, sy, fr * 2.8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(10,18,46,${a * 0.88})`; ctx.beginPath(); ctx.arc(sx, sy, fr, 0, Math.PI * 2); ctx.fill()
      const img = flagImgs[key]
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save(); ctx.globalAlpha = a
        ctx.beginPath(); ctx.arc(sx, sy, fr - 0.5, 0, Math.PI * 2); ctx.clip()
        const asp = img.naturalWidth / (img.naturalHeight || 1), dw = fr * 2, dh = dw / asp
        ctx.drawImage(img, sx - fr, sy - dh / 2, dw, dh); ctx.restore()
      }
      ctx.strokeStyle = `rgba(125,211,252,${a * 0.65})`; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(sx, sy, fr, 0, Math.PI * 2); ctx.stroke()
    }
    rafId = requestAnimationFrame(draw)
  }
  draw()
  return () => {
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
  }
}

// ── Auth Modal ────────────────────────────────────────────────────────────────
function AuthModal({ mode, onClose, onSwitch }) {
  const navigate = useNavigate()
  const { login } = useStore()
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [regForm, setRegForm] = useState({ email: '', full_name: '', password: '', phone: '', country: 'Chile' })
  const [regError, setRegError] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const COUNTRIES = ['Chile', 'Colombia', 'Venezuela', 'Perú', 'Argentina', 'Ecuador', 'México', 'Bolivia', 'Brasil', 'Uruguay', 'Paraguay']

  const submitLogin = async (e) => {
    e.preventDefault(); setLoginLoading(true); setLoginError('')
    try {
      const res = await api.post('/auth/login', loginForm)
      login(res.data.data.access_token, res.data.data.user); onClose()
      const role = res.data.data.user.role
      navigate(role === 'admin' ? '/admin' : role === 'sub_admin' ? '/sub-admin' : '/dashboard')
    } catch (err) { setLoginError(err.response?.data?.detail || 'Error al iniciar sesión') }
    finally { setLoginLoading(false) }
  }

  const submitRegister = async (e) => {
    e.preventDefault(); setRegLoading(true); setRegError('')
    try {
      const res = await api.post('/auth/register', regForm)
      login(res.data.data.access_token, res.data.data.user); onClose(); navigate('/dashboard')
    } catch (err) { setRegError(err.response?.data?.detail || 'Error al registrarse') }
    finally { setRegLoading(false) }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
        style={{ background: 'rgba(6,13,34,0.7)' }} onClick={onClose}>
        <div className="relative w-full max-w-sm rounded-3xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 70px rgba(2,8,30,0.6), inset 0 1px 0 rgba(255,255,255,0.2)' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition-colors z-10">✕</button>
          <div className="p-7">
            <div className="flex items-center gap-3 mb-6">
              <img src={logoSrc} alt="Ksa Global" className="w-9 h-9 object-contain" style={{ filter: 'drop-shadow(0 0 6px rgba(56,189,248,.5))' }} />
              <div>
                <p className="font-bold text-white text-sm leading-tight">Ksa Global</p>
                <p className="text-[9px] font-semibold tracking-widest uppercase leading-tight" style={{ background: 'linear-gradient(90deg,#38bdf8,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVOLUTION</p>
              </div>
            </div>
            <div className="flex gap-1 bg-white/10 rounded-xl p-1 mb-6">
              {['login', 'register'].map(m => (
                <button key={m} onClick={() => onSwitch(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-white text-blue-700 shadow-sm' : 'text-white/60 hover:text-white'}`}>
                  {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </button>
              ))}
            </div>
            {mode === 'login' ? (
              <form onSubmit={submitLogin} className="space-y-4">
                {[{ key: 'email', label: 'Email', type: 'email', ph: 'tu@email.com' }, { key: 'password', label: 'Contraseña', type: 'password', ph: '••••••••' }].map(({ key, label, type, ph }) => (
                  <div key={key}>
                    <label className="text-white/80 text-xs font-semibold block mb-1.5">{label}</label>
                    <input type={type} value={loginForm[key]} onChange={e => setLoginForm({ ...loginForm, [key]: e.target.value })} required placeholder={ph}
                      className="w-full bg-white/10 border border-white/25 rounded-xl px-4 py-2.5 text-white placeholder-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50" />
                  </div>
                ))}
                {loginError && <p className="text-red-300 text-xs bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">{loginError}</p>}
                <button type="submit" disabled={loginLoading} className="w-full text-slate-900 font-bold py-3 rounded-xl transition-all text-sm shadow-md mt-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)' }}>
                  {loginLoading ? 'Ingresando...' : 'Iniciar sesión →'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitRegister} className="space-y-3">
                {[{ key: 'full_name', label: 'Nombre', type: 'text', ph: 'Juan García', req: true }, { key: 'email', label: 'Email', type: 'email', ph: 'tu@email.com', req: true }, { key: 'password', label: 'Contraseña', type: 'password', ph: '••••••••', req: true }, { key: 'phone', label: 'Teléfono (opcional)', type: 'tel', ph: '+56 9...' }].map(({ key, label, type, ph, req }) => (
                  <div key={key}>
                    <label className="text-white/80 text-xs font-semibold block mb-1">{label}</label>
                    <input type={type} value={regForm[key]} onChange={e => setRegForm({ ...regForm, [key]: e.target.value })} required={req} placeholder={ph}
                      className="w-full bg-white/10 border border-white/25 rounded-xl px-4 py-2.5 text-white placeholder-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50" />
                  </div>
                ))}
                <div>
                  <label className="text-white/80 text-xs font-semibold block mb-1">País</label>
                  <select value={regForm.country} onChange={e => setRegForm({ ...regForm, country: e.target.value })}
                    className="w-full bg-white/10 border border-white/25 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none [&>option]:text-gray-900 [&>option]:bg-white">
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {regError && <p className="text-red-300 text-xs bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">{regError}</p>}
                <button type="submit" disabled={regLoading} className="w-full text-slate-900 font-bold py-3 rounded-xl transition-all text-sm shadow-md mt-1 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)' }}>
                  {regLoading ? 'Creando cuenta...' : 'Crear cuenta gratis →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ── SECCIONES ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#7dd3fc" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, title: 'Transferencias en minutos', desc: 'Procesamos tu envío al instante. Sin esperas, sin burocracia.', glow: 'rgba(56,189,248,.18)' },
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#86efac" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>, title: 'Seguridad de nivel bancario', desc: 'Datos y dinero protegidos con cifrado y certificación.', glow: 'rgba(74,222,128,.14)' },
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#a5b4fc" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>, title: 'Cero comisiones ocultas', desc: 'Ves exactamente cuánto recibe tu beneficiario antes de confirmar.', glow: 'rgba(129,140,248,.16)' },
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>, title: 'Tasas en tiempo real', desc: 'Tipos de cambio actualizados en vivo para la mejor tasa.', glow: 'rgba(251,191,36,.14)' },
]
const STEPS = [
  { n: '1', title: 'Calcula tu envío', desc: 'Ingresa el monto y elige el país. Tasa en tiempo real.' },
  { n: '2', title: 'Ingresa los datos', desc: 'Datos de tu beneficiario y banco destino.' },
  { n: '3', title: 'Confirma el pago', desc: 'Transfiere y adjunta tu comprobante.' },
  { n: '✓', title: '¡Listo!', desc: 'Procesamos y notificamos cada paso.', green: true },
]
const COUNTRIES_LIST = ['Venezuela', 'Colombia', 'Argentina', 'Perú', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'México', 'Brasil', 'España', 'Estados Unidos', 'India', 'Filipinas', 'Nigeria', 'China', 'Reino Unido', 'Chile']
const TICKER = [['USD','CLP'],['USD','VES'],['USD','COP'],['EUR','MXN'],['USD','PEN'],['USD','BRL'],['GBP','ARS'],['USD','PHP']]
const RATES = { USD:1,EUR:0.92,GBP:0.79,CLP:950,COP:4100,PEN:3.75,BRL:5.4,MXN:18,VES:40,ARS:1000,PHP:57 }
const fmt = (n, c) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: ['CLP','COP','VES','ARS','PYG'].includes(c)?0:2, minimumFractionDigits: 0 }).format(n)
const tickerItems = TICKER.map(([a,b]) => `1 ${a} = ${fmt(RATES[b]/RATES[a], b)} ${b}`)

// ── HOME ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const { user } = useStore()
  const canvasRef = useRef(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authModal, setAuthModal] = useState(null)

  useEffect(() => {
    if (!canvasRef.current) return
    return initGlobe(canvasRef.current)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const nav = document.getElementById('main-nav')
      if (nav) nav.style.background = window.scrollY > 20 ? 'rgba(7,14,35,.88)' : 'rgba(7,14,35,.45)'
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSend = ({ amount, fromCurrency, toCountry, toCurrency, result }) => {
    if (!user) { setAuthModal('login'); return }
    navigate('/new-transfer', { state: { amount, fromCurrency, toCountry, toCurrency, result } })
  }

  const glassCard = { background: 'rgba(255,255,255,.05)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12)' }

  return (
    <div style={{ background: '#060d22', minHeight: '100vh', fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#eaf2ff' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(56,225,255,.55)}70%{box-shadow:0 0 0 9px rgba(56,225,255,0)}100%{box-shadow:0 0 0 0 rgba(56,225,255,0)}}
        @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes glowPulse{0%,100%{opacity:.45}50%{opacity:1}}
        #main-nav{transition:background .35s ease;}
        .globe-canvas{position:absolute;inset:0;width:100%;height:100%;}
      `}</style>

      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(900px 600px at 75% -5%,rgba(37,99,235,.32),transparent 60%),radial-gradient(700px 700px at 6% 18%,rgba(56,189,248,.16),transparent 60%)' }} />

      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />}

      {/* NAVBAR */}
      <nav id="main-nav" style={{ position: 'sticky', top: 0, zIndex: 60, background: 'rgba(7,14,35,.45)', backdropFilter: 'blur(22px) saturate(170%)', WebkitBackdropFilter: 'blur(22px) saturate(170%)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoSrc} alt="Ksa Global" style={{ width: 40, height: 40, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(56,189,248,.5))' }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#fff' }}>Ksa Global</p>
              <p style={{ margin: 0, fontSize: '9.5px', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#38bdf8,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVOLUTION</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="#paises" style={{ padding: '9px 14px', fontSize: 14, fontWeight: 500, color: '#b9c8ec', textDecoration: 'none', borderRadius: 10 }}>Cobertura</a>
            <a href="#como" style={{ padding: '9px 14px', fontSize: 14, fontWeight: 500, color: '#b9c8ec', textDecoration: 'none', borderRadius: 10 }}>¿Cómo funciona?</a>
            {user ? (
              <button onClick={() => navigate(user.role === 'admin' ? '/admin' : '/dashboard')}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 8px 24px rgba(56,189,248,.4)' }}>
                Mi panel →
              </button>
            ) : (
              <>
                <button onClick={() => setAuthModal('login')} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 500, color: '#dbe6ff', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, cursor: 'pointer' }}>Iniciar sesión</button>
                <button onClick={() => setAuthModal('register')} style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 8px 24px rgba(56,189,248,.4)' }}>Crear cuenta →</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', zIndex: 1, overflow: 'hidden', minHeight: '90vh', padding: '40px 24px 70px', display: 'flex', alignItems: 'center' }}>
        <canvas ref={canvasRef} className="globe-canvas" style={{ zIndex: 0 }} />
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(90deg,rgba(6,13,34,.75) 0%,rgba(6,13,34,.18) 32%,rgba(6,13,34,.18) 68%,rgba(6,13,34,.75) 100%),linear-gradient(rgba(6,13,34,.55) 0%,transparent 22%,transparent 75%,rgba(6,13,34,.6) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 40 }}>
          <div style={{ flex: '1 1 360px', minWidth: 280 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', marginBottom: 26 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38e1ff', animation: 'pulseDot 2s infinite' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#bfe4ff' }}>Tasas en vivo · +50 países · 24/7</span>
            </div>
            <h1 style={{ margin: '0 0 20px', fontSize: 'clamp(40px,5.4vw,68px)', lineHeight: 1.02, fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>
              Bienvenido a la<br />
              <span style={{ background: 'linear-gradient(120deg,#38bdf8 0%,#7dd3fc 40%,#818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(56,189,248,.55))' }}>Evolución</span><br />
              financiera
            </h1>
            <p style={{ margin: '0 0 32px', fontSize: 18, lineHeight: 1.65, color: '#aebfe2', maxWidth: 460 }}>
              Transferencias internacionales en minutos con tasas en tiempo real y cero comisiones ocultas.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 36 }}>
              {user ? (
                <button onClick={() => navigate('/new-transfer')} style={{ padding: '16px 28px', fontSize: 16, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 38px rgba(56,189,248,.45)' }}>Enviar ahora →</button>
              ) : (
                <>
                  <button onClick={() => setAuthModal('register')} style={{ padding: '16px 28px', fontSize: 16, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 38px rgba(56,189,248,.45)' }}>Comenzar ahora →</button>
                  <a href="#como" style={{ padding: '16px 24px', fontSize: 16, fontWeight: 600, color: '#e6efff', textDecoration: 'none', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 16 }}>Ver cómo funciona</a>
                </>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
              {[['2 min', 'tiempo promedio'], ['+50', 'países conectados'], ['0%', 'comisiones ocultas']].map(([val, label], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  {i > 0 && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.14)' }} />}
                  <div><p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 700, color: '#fff' }}>{val}</p><p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>{label}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '0 1 400px', minWidth: 340, animation: 'floaty 7s ease-in-out infinite' }}>
            <CalculatorDark onSend={handleSend} />
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,.08)', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(7,14,35,.55)', overflow: 'hidden', padding: '14px 0' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'marquee 30s linear infinite' }}>
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#aebfe2', whiteSpace: 'nowrap', margin: '0 21px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38e1ff', flexShrink: 0 }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '90px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Por qué Ksa Global</p>
          <h2 style={{ margin: 0, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>Diseñado para mover dinero<br />sin fronteras</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ ...glassCard, borderRadius: 22, padding: 26 }}>
              <div style={{ width: 50, height: 50, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>{f.icon}</div>
              <h3 style={{ margin: '0 0 7px', fontSize: 17, fontWeight: 600, color: '#fff' }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#9fb0d4' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como" style={{ position: 'relative', zIndex: 2, padding: '90px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Simple y transparente</p>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>En 4 pasos, tu dinero llega</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ ...glassCard, borderRadius: 20, padding: 24, ...(s.green ? { background: 'linear-gradient(135deg,rgba(56,189,248,.14),rgba(37,99,235,.1))', border: '1px solid rgba(125,211,252,.25)' } : {}) }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 700, color: s.green ? '#fff' : '#061027', background: s.green ? 'linear-gradient(135deg,#4ade80,#22c55e)' : 'linear-gradient(135deg,#7dd3fc,#38bdf8)', boxShadow: `0 8px 22px ${s.green ? 'rgba(74,222,128,.38)' : 'rgba(56,189,248,.38)'}`, marginBottom: 14 }}>{s.n}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15.5, fontWeight: 600, color: '#fff' }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: s.green ? '#cfe0ff' : '#9fb0d4' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COUNTRIES */}
      <section id="paises" style={{ position: 'relative', zIndex: 2, padding: '90px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Cobertura global</p>
            <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>Conectados a todo el mundo</h2>
            <p style={{ margin: 0, fontSize: 16, color: '#9fb0d4' }}>Enviamos a los principales países de América Latina y más allá.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {COUNTRIES_LIST.map(c => {
              const url = flagUrl(c)
              return (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 15px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}>
                  {url ? <img src={url} alt="" style={{ width: 22, height: 15, borderRadius: 2, objectFit: 'cover' }} /> : <span>🌍</span>}
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: '#dbe6ff' }}>{c}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      {!user && (
        <section style={{ position: 'relative', zIndex: 2, padding: '40px 24px 100px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', borderRadius: 32, overflow: 'hidden', padding: '64px 40px', textAlign: 'center', background: 'linear-gradient(135deg,rgba(37,99,235,.35),rgba(56,189,248,.22))', backdropFilter: 'blur(28px)', border: '1px solid rgba(125,211,252,.28)', boxShadow: '0 36px 80px rgba(2,8,30,.5)' }}>
            <h2 style={{ margin: '0 0 13px', fontSize: 'clamp(28px,4vw,46px)', fontWeight: 700, color: '#fff' }}>¿Listo para enviar?</h2>
            <p style={{ margin: '0 0 30px', fontSize: 17.5, color: 'rgba(255,255,255,.82)' }}>Crea tu cuenta gratis y realiza tu primera transferencia hoy mismo.</p>
            <button onClick={() => setAuthModal('register')} style={{ padding: '16px 36px', fontSize: 17, fontWeight: 700, color: '#061027', background: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 36px rgba(0,0,0,.28)' }}>Comenzar gratis →</button>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(5,11,30,.7)', padding: '40px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoSrc} alt="Ksa Global" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#fff' }}>Ksa Global</p>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#38bdf8,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVOLUTION</p>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#8aa0cc' }}>© {new Date().getFullYear()} Ksa Global · Todos los derechos reservados</p>
          <div style={{ display: 'flex', gap: 18 }}>
            <button onClick={() => setAuthModal('login')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#8aa0cc', cursor: 'pointer' }}>Iniciar sesión</button>
            <button onClick={() => setAuthModal('register')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#8aa0cc', cursor: 'pointer' }}>Registrarse</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
