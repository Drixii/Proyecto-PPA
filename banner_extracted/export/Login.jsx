import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import api from '../../services/api'
import logoSrc from '../../assets/logo.png'

// ── Globe animation ───────────────────────────────────────────────────────────
function initGlobe(canvas) {
  const ctx = canvas.getContext('2d')
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 0, rafId = null

  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2)
    const r = canvas.getBoundingClientRect()
    W = r.width; H = r.height
    canvas.width = Math.max(1, W * DPR); canvas.height = Math.max(1, H * DPR)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    cx = W * 0.5; cy = H * 0.46; R = Math.min(W * 0.55, H * 0.48)
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
    ctx.clearRect(0, 0, W, H); rot += 0.0016
    const cosR = Math.cos(rot), sinR = Math.sin(rot)
    const rotY = (x, y, z) => [x * cosR - z * sinR, y, x * sinR + z * cosR]
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.6)
    g.addColorStop(0, 'rgba(56,189,248,0.10)'); g.addColorStop(1, 'rgba(56,189,248,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(120,180,255,0.16)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    for (const d of dots) {
      const x0 = Math.cos(d.lat) * Math.sin(d.lon), y0 = Math.sin(d.lat), z0 = Math.cos(d.lat) * Math.cos(d.lon)
      const [x, y, z] = rotY(x0, y0, z0)
      const depth = (z + 1) / 2, alpha = 0.12 + depth * 0.65, size = depth * 1.4 + 0.3
      ctx.fillStyle = z > 0 ? `rgba(125,211,252,${alpha})` : `rgba(90,130,210,${alpha * 0.4})`
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
          ctx.strokeStyle = `rgba(255,20,150,${0.16 + Math.max(0, z) * 0.38})`; ctx.lineWidth = 1
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
        const gg = ctx.createRadialGradient(psx, psy, 0, psx, psy, 10)
        gg.addColorStop(0, 'rgba(255,220,0,0.95)'); gg.addColorStop(0.35, 'rgba(255,180,0,0.65)'); gg.addColorStop(1, 'rgba(255,120,0,0)')
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(psx, psy, 10, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,248,160,1)'; ctx.beginPath(); ctx.arc(psx, psy, 2.2, 0, Math.PI * 2); ctx.fill()
      }
    }
    for (const key of cityKeys) {
      const v = cityVecs[key]; if (!v) continue
      const [x, y, z] = rotY(v[0], v[1], v[2]); if (z < -0.08) continue
      const sx = cx + x * R, sy = cy - y * R, a = Math.max(0, (z + 0.08) / 1.08)
      const fr = Math.max(9, Math.round(R * 0.046 * (0.55 + a * 0.45)))
      const hh = ctx.createRadialGradient(sx, sy, fr * 0.4, sx, sy, fr * 2.6)
      hh.addColorStop(0, `rgba(255,220,0,${a * 0.52})`); hh.addColorStop(0.45, `rgba(255,160,0,${a * 0.26})`); hh.addColorStop(1, 'rgba(255,100,0,0)')
      ctx.fillStyle = hh; ctx.beginPath(); ctx.arc(sx, sy, fr * 2.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(10,18,46,${a * 0.88})`; ctx.beginPath(); ctx.arc(sx, sy, fr, 0, Math.PI * 2); ctx.fill()
      const img = flagImgs[key]
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save(); ctx.globalAlpha = a
        ctx.beginPath(); ctx.arc(sx, sy, fr - 0.5, 0, Math.PI * 2); ctx.clip()
        const asp = img.naturalWidth / (img.naturalHeight || 1), dw = fr * 2, dh = dw / asp
        ctx.drawImage(img, sx - fr, sy - dh / 2, dw, dh); ctx.restore()
      }
      ctx.strokeStyle = `rgba(125,211,252,${a * 0.6})`; ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.arc(sx, sy, fr, 0, Math.PI * 2); ctx.stroke()
    }
    rafId = requestAnimationFrame(draw)
  }
  draw()
  return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', resize) }
}

const REGISTER_COUNTRIES = ['Chile', 'Colombia', 'Venezuela', 'Perú', 'Argentina', 'Ecuador', 'México', 'Bolivia', 'Brasil', 'Uruguay', 'Paraguay']

export default function Login() {
  const navigate = useNavigate()
  const { login } = useStore()
  const canvasRef = useRef(null)
  const [mode, setMode] = useState('login')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({ email: '', full_name: '', password: '', phone: '', country: 'Chile' })
  const [loginError, setLoginError] = useState('')
  const [regError, setRegError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [regLoading, setRegLoading] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    return initGlobe(canvasRef.current)
  }, [])

  const submitLogin = async (e) => {
    e.preventDefault(); setLoginLoading(true); setLoginError('')
    try {
      const res = await api.post('/auth/login', loginForm)
      login(res.data.data.access_token, res.data.data.user)
      const role = res.data.data.user.role
      navigate(role === 'admin' ? '/admin' : role === 'sub_admin' ? '/sub-admin' : '/dashboard')
    } catch (err) { setLoginError(err.response?.data?.detail || 'Error al iniciar sesión') }
    finally { setLoginLoading(false) }
  }

  const submitRegister = async (e) => {
    e.preventDefault(); setRegLoading(true); setRegError('')
    try {
      const res = await api.post('/auth/register', regForm)
      login(res.data.data.access_token, res.data.data.user)
      navigate('/dashboard')
    } catch (err) { setRegError(err.response?.data?.detail || 'Error al registrarse') }
    finally { setRegLoading(false) }
  }

  const inputStyle = {
    width: '100%', padding: '13px 16px', background: 'rgba(8,16,40,.6)',
    border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, fontSize: 15,
    color: '#fff', outline: 'none', fontFamily: "'Space Grotesk',sans-serif",
    boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8aa0cc', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 7 }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#060d22', overflow: 'hidden', fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(56,225,255,.55)}70%{box-shadow:0 0 0 9px rgba(56,225,255,0)}100%{box-shadow:0 0 0 0 rgba(56,225,255,0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        @keyframes slideIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
        .login-input:focus{border-color:rgba(56,189,248,.6)!important;}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 100px rgba(8,16,40,.9) inset!important;-webkit-text-fill-color:#eaf2ff!important;}
      `}</style>

      {/* LEFT — Globe */}
      <div style={{ position: 'relative', flex: '0 0 44%', minWidth: 340, overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 60% 40%,rgba(6,13,34,.15),rgba(6,13,34,.55) 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(6,13,34,.45) 0%,transparent 30%,transparent 60%,rgba(6,13,34,.88) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent 55%,rgba(6,13,34,.95) 100%)', pointerEvents: 'none' }} />

        {/* Logo top-left */}
        <div style={{ position: 'absolute', top: 28, left: 28, display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logoSrc} alt="Ksa Global" style={{ width: 38, height: 38, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(56,189,248,.6))' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#fff' }}>Ksa Global</p>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#38bdf8,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVOLUTION</p>
          </div>
        </div>

        {/* Bottom tagline */}
        <div style={{ position: 'absolute', bottom: 40, left: 32, right: 32, animation: 'fadeUp .9s ease both .3s' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(12px)', marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38e1ff', animation: 'pulseDot 2s infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#bfe4ff' }}>Transferencias globales · 24/7</span>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,3.2vw,34px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.02em', color: '#fff' }}>
            Bienvenido a la<br />
            <span style={{ background: 'linear-gradient(120deg,#38bdf8 0%,#7dd3fc 40%,#818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Evolución</span><br />
            financiera.
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#8aa0cc' }}>Tu dinero, conectado al mundo.</p>
        </div>
      </div>

      {/* RIGHT — Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', overflowY: 'auto', background: '#080f28', borderLeft: '1px solid rgba(255,255,255,.07)', position: 'relative' }}>

        {/* Logo top-right */}
        <div style={{ position: 'absolute', top: 28, right: 32, display: 'flex', alignItems: 'center', gap: 9 }}>
          <img src={logoSrc} alt="" style={{ width: 30, height: 30, objectFit: 'contain', opacity: .7 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8aa0cc' }}>Ksa Global</span>
        </div>

        <div style={{ width: '100%', maxWidth: 360, animation: 'slideIn .6s cubic-bezier(.16,1,.3,1) both' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, textAlign: 'center', color: '#fff' }}>
            {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: 14, color: '#8aa0cc', textAlign: 'center' }}>
            {mode === 'login' ? 'Inicia sesión en tu cuenta Ksa Global' : 'Únete a la evolución financiera'}
          </p>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setLoginError(''); setRegError('') }}
                style={{ flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 11, cursor: 'pointer', transition: 'all .22s', background: mode === m ? 'linear-gradient(135deg,#1e3a6e,#1e40af)' : 'transparent', color: mode === m ? '#fff' : '#64748b', boxShadow: mode === m ? '0 4px 14px rgba(37,99,235,.4)' : 'none' }}>
                {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>

          {mode === 'login' ? (
            <form onSubmit={submitLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Correo electrónico</label>
                <input className="login-input" type="email" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required placeholder="tu@email.com" style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Contraseña</label>
                <input className="login-input" type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required placeholder="••••••••" style={inputStyle} />
              </div>
              {loginError && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)' }}><p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>{loginError}</p></div>}
              <button type="submit" disabled={loginLoading} style={{ width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#818cf8)', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 10px 30px rgba(56,189,248,.35)', opacity: loginLoading ? 0.65 : 1 }}>
                {loginLoading ? 'Ingresando...' : 'Iniciar sesión →'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Nombre completo</label>
                <input className="login-input" type="text" value={regForm.full_name} onChange={e => setRegForm({ ...regForm, full_name: e.target.value })} required placeholder="Juan García" style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Correo electrónico</label>
                <input className="login-input" type="email" value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} required placeholder="tu@email.com" style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Contraseña</label>
                <input className="login-input" type="password" value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} required placeholder="••••••••" style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Teléfono (opcional)</label>
                <input className="login-input" type="tel" value={regForm.phone} onChange={e => setRegForm({ ...regForm, phone: e.target.value })} placeholder="+56 9 1234 5678" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>País</label>
                <select value={regForm.country} onChange={e => setRegForm({ ...regForm, country: e.target.value })} style={{ ...inputStyle, appearance: 'none' }}>
                  {REGISTER_COUNTRIES.map(c => <option key={c} value={c} style={{ background: '#0f172a', color: '#fff' }}>{c}</option>)}
                </select>
              </div>
              {regError && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)' }}><p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>{regError}</p></div>}
              <button type="submit" disabled={regLoading} style={{ width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#818cf8)', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 10px 30px rgba(56,189,248,.35)', opacity: regLoading ? 0.65 : 1 }}>
                {regLoading ? 'Creando cuenta...' : 'Crear cuenta gratis →'}
              </button>
            </form>
          )}

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
            <span style={{ fontSize: 12, color: '#475569' }}>o continúa con</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
          </div>

          {/* Google */}
          <button style={{ width: '100%', padding: 13, fontSize: 14, fontWeight: 600, color: '#eaf2ff', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Continuar con Google
          </button>

          <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>
            Al continuar aceptas nuestros{' '}
            <a href="#" style={{ color: '#7dd3fc', textDecoration: 'none' }}>Términos de servicio</a>
            {' '}y{' '}
            <a href="#" style={{ color: '#7dd3fc', textDecoration: 'none' }}>Política de privacidad</a>
          </p>
        </div>
      </div>
    </div>
  )
}
