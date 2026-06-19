import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CalculatorDark from '../components/CalculatorDark'
import { useStore } from '../store/useStore'
import logoSrc from '../assets/logo.png'

// ── Secciones estáticas ───────────────────────────────────────────────────────
const FEATURES = [
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#7dd3fc" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, title: 'Transferencias en minutos', desc: 'Procesamos tu envío al instante. Sin esperas, sin burocracia.' },
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#86efac" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>, title: 'Seguridad de nivel bancario', desc: 'Datos y dinero protegidos con cifrado y certificación.' },
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#a5b4fc" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>, title: 'Cero comisiones ocultas', desc: 'Ves exactamente cuánto recibe tu beneficiario antes de confirmar.' },
  { icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>, title: 'Tasas en tiempo real', desc: 'Tipos de cambio actualizados en vivo para la mejor tasa.' },
]
const STEPS = [
  { n: '1', title: 'Calcula tu envío', desc: 'Ingresa el monto y elige el país. Tasa en tiempo real.' },
  { n: '2', title: 'Ingresa los datos', desc: 'Datos de tu beneficiario y banco destino.' },
  { n: '3', title: 'Confirma el pago', desc: 'Transfiere y adjunta tu comprobante.' },
  { n: '✓', title: '¡Listo!', desc: 'Procesamos y notificamos cada paso.', green: true },
]
const TICKER = [['USD','CLP'],['USD','VES'],['USD','COP'],['EUR','MXN'],['USD','PEN'],['USD','BRL'],['GBP','ARS'],['USD','PHP']]
const RATES  = { USD:1, EUR:0.92, GBP:0.79, CLP:950, COP:4100, PEN:3.75, BRL:5.4, MXN:18, VES:40, ARS:1000, PHP:57 }
const fmt = (n, c) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: ['CLP','COP','VES','ARS','PYG'].includes(c)?0:2, minimumFractionDigits: 0 }).format(n)
const tickerItems = TICKER.map(([a,b]) => `1 ${a} = ${fmt(RATES[b]/RATES[a], b)} ${b}`)

// Reveal inicial — globe.js aplica opacity:'1' + transform:'none' al entrar en viewport
const R0 = { opacity: 0, transform: 'translateY(34px)', transition: 'opacity .8s cubic-bezier(.22,.61,.36,1),transform .8s cubic-bezier(.22,.61,.36,1)' }
const RD = (d) => ({ ...R0, transitionDelay: `${d}s,${d}s` })

// ── HOME ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const { user } = useStore()

  // Carga globe.js desde /public — IIFE que busca los IDs en el DOM
  useEffect(() => {
    const script = document.createElement('script')
    script.src = '/globe.js'
    script.async = true
    document.body.appendChild(script)
    return () => {
      if (window.__ksaStop) window.__ksaStop()
      if (document.body.contains(script)) document.body.removeChild(script)
    }
  }, [])

  // Scroll → opacidad del nav
  useEffect(() => {
    const onScroll = () => {
      const nav = document.getElementById('main-nav')
      if (nav) nav.style.background = window.scrollY > 20 ? 'rgba(7,14,35,.88)' : 'rgba(7,14,35,.45)'
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSend = ({ amount, fromCurrency, toCountry, toCurrency, result }) => {
    if (!user) { navigate('/login'); return }
    navigate('/new-transfer', { state: { amount, fromCurrency, toCountry, toCurrency, result } })
  }

  const glassCard = {
    background: 'rgba(8,16,44,.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(56,189,248,.18)', boxShadow: '0 8px 32px rgba(0,6,28,.6),inset 0 1px 0 rgba(56,189,248,.08)',
  }

  return (
    <div style={{ background: '#060d22', minHeight: '100vh', fontFamily: "'Space Grotesk',system-ui,sans-serif", color: '#eaf2ff' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        @keyframes floaty   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes pulseDot { 0%{box-shadow:0 0 0 0 rgba(56,225,255,.55)} 70%{box-shadow:0 0 0 9px rgba(56,225,255,0)} 100%{box-shadow:0 0 0 0 rgba(56,225,255,0)} }
        @keyframes marquee  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes hintBob  { 0%,100%{transform:translateX(-50%) translateY(0);opacity:.55} 50%{transform:translateX(-50%) translateY(7px);opacity:1} }
        *{box-sizing:border-box;}
        #main-nav{transition:background .35s ease;}
        .nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;height:70px;display:flex;align-items:center;justify-content:space-between;}
        .nav-text-link{padding:9px 14px;font-size:14px;font-weight:500;color:#b9c8ec;text-decoration:none;border-radius:10px;}
        .hero-text{flex:1 1 340px;min-width:0;}
        .hero-calc{flex:0 1 420px;min-width:0;animation:floaty 7s ease-in-out infinite;}
        .hero-buttons{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:36px;}
        .stats-row{display:flex;flex-wrap:wrap;gap:28px;}
        .hero-hide-mobile{}
        .section-pad{padding:96px 24px;}
        @media(max-width:1024px){
          .nav-text-link{display:none;}
          .section-pad{padding:72px 20px;}
        }
        @media(max-width:768px){
          .nav-inner{padding:0 14px;}
          .hero-text{flex:none;width:100%;}
          .hero-calc{flex:none;width:100%;max-width:420px;margin:0 auto;animation:none;}
          .hero-hide-mobile{display:none;}
          .section-pad{padding:56px 16px;}
          .hero-buttons{gap:10px;margin-bottom:20px;}
          /* Mantener scroll storytelling en mobile pero más corto (200vh) */
          #pin-wrap{height:200vh!important;}
          #sticky{position:sticky!important;top:0!important;height:100svh!important;overflow:hidden!important;}
          #globe-cv{position:absolute!important;top:0;left:0;width:100%!important;height:100%!important;}
          #hero-content{position:absolute!important;inset:0!important;min-height:unset!important;align-items:flex-start!important;padding-top:80px!important;}
          #hero-content>div{flex-direction:column;align-items:center;padding:0 16px 56px;}
          #scroll-hint{display:none!important;}
          #grid-title{display:none!important;}
        }
        @media(max-width:480px){
          .section-pad{padding:44px 12px;}
          .nav-inner{padding:0 12px;}
          #hero-content>div{padding:0 12px 48px;}
          .hero-buttons{gap:8px;}
          /* Nav auth buttons: una línea, font más chico */
          .nav-auth{flex-wrap:nowrap!important;}
          .nav-auth button{padding:8px 10px!important;font-size:12px!important;white-space:nowrap;}
        }
      `}</style>

      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(900px 600px at 75% -5%,rgba(37,99,235,.30),transparent 60%),radial-gradient(700px 700px at 6% 18%,rgba(56,189,248,.14),transparent 60%)' }} />

      {/* ── NAVBAR ── */}
      <nav id="main-nav" style={{ position: 'sticky', top: 0, zIndex: 60, background: 'rgba(7,14,35,.45)', backdropFilter: 'blur(22px) saturate(170%)', WebkitBackdropFilter: 'blur(22px) saturate(170%)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div className="nav-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoSrc} alt="Ksa Global" style={{ width: 40, height: 40, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(56,189,248,.5))' }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#fff' }}>Ksa Global</p>
              <p style={{ margin: 0, fontSize: '9.5px', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#38bdf8,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVOLUTION</p>
            </div>
          </div>
          <div className="nav-auth" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="#como" className="nav-text-link">¿Cómo funciona?</a>
            {user ? (
              <button
                onClick={() => navigate(user.role === 'admin' ? '/admin' : user.role === 'sub_admin' ? '/sub-admin' : '/dashboard')}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 8px 24px rgba(56,189,248,.4)' }}>
                Mi panel →
              </button>
            ) : (
              <>
                <button onClick={() => navigate('/login')} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 500, color: '#dbe6ff', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, cursor: 'pointer' }}>Iniciar sesión</button>
                <button onClick={() => navigate('/login', { state: { mode: 'register' } })} style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 8px 24px rgba(56,189,248,.4)' }}>Crear cuenta →</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── PIN WRAP — scroll-storytelling hero (340 vh) ── */}
      <div id="pin-wrap" style={{ height: '340vh', position: 'relative', zIndex: 1 }}>
        <div id="sticky" style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>

          {/* Canvas gestionado por globe.js */}
          <canvas id="globe-cv" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />

          {/* Hero — globe.js lo desvanece al hacer scroll */}
          <div id="hero-content" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 48 }}>
              <div className="hero-text">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', marginBottom: 26 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38e1ff', animation: 'pulseDot 2s infinite' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#bfe4ff' }}>Tasas en vivo · +50 países · 24/7</span>
                </div>
                <h1 style={{ margin: '0 0 20px', fontSize: 'clamp(40px,5.4vw,68px)', lineHeight: 1.02, fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>
                  Bienvenido a la<br />
                  <span style={{ background: 'linear-gradient(120deg,#38bdf8 0%,#7dd3fc 40%,#818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(56,189,248,.55))' }}>Evolución</span><br />
                  financiera
                </h1>
                <p className="hero-hide-mobile" style={{ margin: '0 0 32px', fontSize: 18, lineHeight: 1.65, color: '#aebfe2', maxWidth: 460 }}>
                  Transferencias internacionales en minutos con tasas en tiempo real y cero comisiones ocultas.
                </p>
                <div className="hero-buttons">
                  {user ? (
                    <button onClick={() => navigate('/new-transfer')} style={{ padding: '16px 28px', fontSize: 16, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 38px rgba(56,189,248,.45)' }}>Enviar ahora →</button>
                  ) : (
                    <>
                      <button onClick={() => navigate('/login', { state: { mode: 'register' } })} style={{ padding: '16px 28px', fontSize: 16, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 38px rgba(56,189,248,.45)' }}>Comenzar ahora →</button>
                      <a href="#como" style={{ padding: '16px 24px', fontSize: 16, fontWeight: 600, color: '#e6efff', textDecoration: 'none', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 16 }}>Ver cómo funciona</a>
                    </>
                  )}
                </div>
                <div className="stats-row hero-hide-mobile">
                  {[['2 min', 'tiempo promedio'], ['+50', 'países conectados'], ['0%', 'comisiones ocultas']].map(([val, label], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      {i > 0 && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.14)' }} />}
                      <div>
                        <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 700, color: '#fff' }}>{val}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="hero-calc">
                <CalculatorDark onSend={handleSend} />
              </div>
            </div>
          </div>

          {/* Título "Operamos en estos países" — aparece al hacer morph */}
          <div id="grid-title" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, textAlign: 'center', paddingTop: '12vh', opacity: 0, pointerEvents: 'none' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Cobertura global</p>
            <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(30px,4vw,52px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>Operamos en estos países</h2>
            <p style={{ margin: 0, fontSize: 16, color: '#9fb0d4' }}>Conectados a los principales destinos de América Latina y el mundo.</p>
          </div>

          {/* Scroll hint — desaparece al bajar */}
          <div id="scroll-hint" style={{ position: 'absolute', bottom: 26, left: '50%', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'hintBob 1.8s ease-in-out infinite' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8aa0cc' }}>Scroll</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8aa0cc" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7M19 6l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── TICKER de divisas ── */}
      <div style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,.08)', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(7,14,35,.6)', overflow: 'hidden', padding: '14px 0' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'marquee 32s linear infinite' }}>
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#aebfe2', whiteSpace: 'nowrap', margin: '0 21px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38e1ff', flexShrink: 0 }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* ── POR QUÉ KSA GLOBAL ── */}
      <section className="section-pad" style={{ position: 'relative', zIndex: 2, background: 'rgba(4,10,30,.82)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div data-reveal="" style={{ textAlign: 'center', marginBottom: 52, ...R0 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Por qué Ksa Global</p>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>Diseñado para mover dinero<br />sin fronteras</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} data-reveal="" style={{ ...glassCard, borderRadius: 22, padding: 26, ...RD(i * 0.1) }}>
                <div style={{ width: 50, height: 50, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: 'rgba(4,12,38,.9)', border: '1px solid rgba(56,189,248,.2)' }}>{f.icon}</div>
                <h3 style={{ margin: '0 0 7px', fontSize: 17, fontWeight: 600, color: '#fff' }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#9fb0d4' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section id="como" className="section-pad" style={{ position: 'relative', zIndex: 2, background: 'rgba(4,10,30,.55)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div data-reveal="" style={{ textAlign: 'center', marginBottom: 56, ...R0 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Simple y transparente</p>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>En 4 pasos, tu dinero llega</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} data-reveal="" style={{ ...glassCard, borderRadius: 20, padding: 24, ...RD(i * 0.12), ...(s.green ? { background: 'linear-gradient(135deg,rgba(8,30,70,.95),rgba(8,22,60,.95))', border: '1px solid rgba(56,189,248,.32)', boxShadow: '0 8px 32px rgba(0,6,28,.6),inset 0 1px 0 rgba(56,189,248,.15)' } : {}) }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 700, color: s.green ? '#fff' : '#061027', background: s.green ? 'linear-gradient(135deg,#4ade80,#22c55e)' : 'linear-gradient(135deg,#7dd3fc,#38bdf8)', boxShadow: `0 8px 22px ${s.green ? 'rgba(74,222,128,.38)' : 'rgba(56,189,248,.38)'}`, marginBottom: 14 }}>{s.n}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15.5, fontWeight: 600, color: '#fff' }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: s.green ? '#cfe0ff' : '#9fb0d4' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BANDA DE CONFIANZA ── */}
      <section className="section-pad" style={{ position: 'relative', zIndex: 2, background: 'rgba(4,10,30,.35)' }}>
        <div data-reveal="" style={{ maxWidth: 1100, margin: '0 auto', ...R0, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: 32, textAlign: 'center' }}>
          {[
            ['+12',  'países conectados'],
            ['2 min','tiempo promedio de envío'],
            ['24/7', 'disponibilidad'],
            ['0%',   'comisiones ocultas'],
          ].map(([val, label]) => (
            <div key={label} style={{ flex: '1 1 180px' }}>
              <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(32px,4vw,46px)', fontWeight: 700, color: '#7dd3fc' }}>{val}</p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#9fb0d4' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      {!user && (
        <section className="section-pad" style={{ position: 'relative', zIndex: 2, background: 'rgba(4,10,30,.55)', textAlign: 'center' }}>
          <div data-reveal="" style={{ maxWidth: 1000, margin: '0 auto', ...R0, borderRadius: 32, overflow: 'hidden', padding: 'clamp(32px,6vw,64px) clamp(20px,5vw,40px)', background: 'linear-gradient(135deg,rgba(37,99,235,.35),rgba(56,189,248,.22))', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(125,211,252,.28)', boxShadow: '0 36px 80px rgba(2,8,30,.5)' }}>
            <h2 style={{ margin: '0 0 13px', fontSize: 'clamp(28px,4vw,46px)', fontWeight: 700, color: '#fff' }}>¿Listo para enviar?</h2>
            <p style={{ margin: '0 0 30px', fontSize: 17.5, color: 'rgba(255,255,255,.82)' }}>Crea tu cuenta gratis y realiza tu primera transferencia hoy mismo.</p>
            <button onClick={() => navigate('/login', { state: { mode: 'register' } })} style={{ padding: '16px 36px', fontSize: 17, fontWeight: 700, color: '#061027', background: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 36px rgba(0,0,0,.28)' }}>Comenzar gratis →</button>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
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
            <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#8aa0cc', cursor: 'pointer' }}>Iniciar sesión</button>
            <button onClick={() => navigate('/login', { state: { mode: 'register' } })} style={{ background: 'none', border: 'none', fontSize: 13, color: '#8aa0cc', cursor: 'pointer' }}>Registrarse</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
