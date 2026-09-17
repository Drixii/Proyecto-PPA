import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import CalculatorDark from '../components/CalculatorDark'
import DemoEnvio from '../components/DemoEnvio'
import CintaDeTasas from '../components/CintaDeTasas'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useCountries } from '../hooks/useCountries'
import { useStore } from '../store/useStore'
import logoSrc from '../assets/logo.png'

// ── Secciones estáticas ───────────────────────────────────────────────────────
const FEATURES = [
  { accent: '#7dd3fc', icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#7dd3fc" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, title: 'Transferencias en minutos', desc: 'Procesamos tu envío al instante. Sin esperas, sin burocracia.' },
  { accent: '#86efac', icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#86efac" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>, title: 'Seguridad de nivel bancario', desc: 'Datos y dinero protegidos con cifrado y certificación.' },
  { accent: '#a5b4fc', icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#a5b4fc" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>, title: 'Cero comisiones ocultas', desc: 'Ves exactamente cuánto recibe tu beneficiario antes de confirmar.' },
  { accent: '#fcd34d', icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>, title: 'Tasas en tiempo real', desc: 'Tipos de cambio actualizados en vivo para la mejor tasa.' },
]
const STEPS = [
  { n: '1', title: 'Calcula tu envío', desc: 'Ingresa el monto y elige el país. Tasa en tiempo real.' },
  { n: '2', title: 'Ingresa los datos', desc: 'Datos de tu beneficiario y banco destino.' },
  { n: '3', title: 'Confirma el pago', desc: 'Transfiere y adjunta tu comprobante.' },
  { n: '✓', title: '¡Listo!', desc: 'Procesamos y notificamos cada paso.', green: true },
]
// La cinta de tasas iba con números escritos a mano: decía 1 USD = 40 VES
// cuando el real ronda los 880, y 4.100 COP cuando son 3.136. Es la primera
// cifra que ve alguien que entra, y encima la página promete "tasas en tiempo
// real" tres bloques más abajo. Ahora salen de la misma fuente que usa el
// calculador; si no cargan, no se muestra nada en vez de inventar.
const fmt = (n, c) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: ['CLP','COP','VES','ARS','PYG'].includes(c)?0:2, minimumFractionDigits: 0 }).format(n)

// Reveal inicial — globe.js aplica opacity:'1' + transform:'none' al entrar en viewport
const R0 = { opacity: 0, transform: 'translateY(34px)', transition: 'opacity .8s cubic-bezier(.22,.61,.36,1),transform .8s cubic-bezier(.22,.61,.36,1)' }
const RD = (d) => ({ ...R0, transitionDelay: `${d}s,${d}s` })

// ── HOME ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const { receiveCountries } = useCountries()
  const { data: ratesRaw } = useQuery({
    queryKey: ['rates-all'],
    queryFn: () => api.get('/rates').then(r => r.data.data),
    staleTime: 60000,
  })

  // 1 USD = X para cada moneda que la plataforma ofrece como destino. Antes la
  // lista de pares también estaba fija e incluía el peso filipino, un país en
  // el que no se opera.
  const tickerItems = (() => {
    const desdeUsd = {}
    for (const r of ratesRaw || []) {
      if (r.from_currency === 'USD') desdeUsd[r.to_currency] = r.rate
    }
    const vistas = new Set()
    const items = []
    for (const c of receiveCountries) {
      if (c.currency === 'USD' || vistas.has(c.currency)) continue
      const tasa = desdeUsd[c.currency]
      if (!tasa) continue
      vistas.add(c.currency)
      items.push(`1 USD = ${fmt(tasa, c.currency)} ${c.currency}`)
    }
    return items
  })()

  const navigate = useNavigate()
  const { user } = useStore()
  const deferredPrompt = useRef(null)
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); deferredPrompt.current = e; setCanInstall(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const [showHint, setShowHint] = useState(false)

  // La primera vez que se abre la web en esta pestaña hay una presentación:
  // primero se ve solo el globo, después baja el header y al final entra el
  // texto con la calculadora. Se recuerda en sessionStorage para que volver
  // a la portada desde otra pantalla no la repita; recargar sí la repite,
  // que es lo que uno espera al recargar.
  const presentacionRef = useRef(null)
  if (presentacionRef.current === null) {
    try {
      presentacionRef.current = !sessionStorage.getItem('ksa-presentacion')
      sessionStorage.setItem('ksa-presentacion', '1')
    } catch { presentacionRef.current = true }   // modo incógnito o sin permiso
  }
  const presentacion = presentacionRef.current

  // Cuánto espera el hero antes de empezar a entrar: lo que dura el globo
  // solo más la bajada del header.
  const ESPERA_HERO = presentacion ? 1.6 : 0

  // Las animaciones se retiran en cuanto terminan. Un elemento con
  // animation puesta, aunque solo esté rellenando el último fotograma, hace
  // de bloque contenedor, y eso deja sin efecto el backdrop-filter del
  // header y de la calculadora: el cristal esmerilado se ve plano.
  const [navListo, setNavListo] = useState(!presentacion)
  const [heroListo, setHeroListo] = useState(false)
  // Paso que muestra el teléfono de «Cómo funciona», y el último salto pedido
  // desde una tarjeta (con marca de tiempo para que tocar dos veces la misma
  // también vuelva a empezar ese paso).
  const [pasoDemo, setPasoDemo] = useState(0)
  const [saltoDemo, setSaltoDemo] = useState(null)
  useEffect(() => {
    const relojes = [
      setTimeout(() => setNavListo(true), presentacion ? 2000 : 0),
      setTimeout(() => setHeroListo(true), (ESPERA_HERO + 1.8) * 1000),
    ]
    return () => relojes.forEach(clearTimeout)
  }, [])
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

  const handleInstall = async () => {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt()
      await deferredPrompt.current.userChoice
      deferredPrompt.current = null
      setCanInstall(false)
    } else {
      setShowHint(h => !h)
    }
  }

  // Carga globe.js desde /public — IIFE que busca los IDs en el DOM
  useEffect(() => {
    const script = document.createElement('script')
    // Con versión en la URL: el servidor lo manda sin Cache-Control y el
    // teléfono seguía usando el globo viejo después de cada cambio. Súbela
    // cuando se toque globe.js.
    script.src = '/globe.js?v=20260917'
    script.async = true
    document.body.appendChild(script)
    return () => {
      if (window.__ksaStop) window.__ksaStop()
      if (document.body.contains(script)) document.body.removeChild(script)
    }
  }, [])

  // Scroll → opacidad del nav + re-lock hero al volver al top en mobile
  useEffect(() => {
    const onScroll = () => {
      const nav = document.getElementById('main-nav')
      if (nav) nav.style.background = window.scrollY > 20 ? 'rgba(7,14,35,.88)' : 'rgba(7,14,35,.45)'
      // Mobile: si vuelve al inicio del todo, re-bloquear hero
      if (window.innerWidth <= 768 && document.body.style.position !== 'fixed' && window.scrollY < 10) {
        window.scrollTo(0, 0)
        document.body.style.position = 'fixed'
        document.body.style.top = '0px'
        document.body.style.width = '100%'
        document.body.style.overflow = 'hidden'
        window.__heroProgress = 0
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Mobile: congelar body desde el inicio — ningún scroll posible en el primer bloque
  useEffect(() => {
    if (window.innerWidth > 768) return
    document.body.style.position = 'fixed'
    document.body.style.top = '0px'
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    window.__heroProgress = 0
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflow = ''
      window.__heroProgress = null
    }
  }, [])

  // Mobile: TOCA AQUÍ → animación lenta al presionar
  const handleTocaAqui = () => {
    if (window.innerWidth > 768) return
    const pin = document.getElementById('pin-wrap')
    if (!pin) return
    const pinEnd = pin.offsetTop + pin.offsetHeight - window.innerHeight
    const cv = document.getElementById('globe-cv')
    window.__heroProgress = 0
    const duration = 5500
    const t0 = performance.now()
    const ease = t => t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const ep = ease(p)
      window.__heroProgress = ep
      // canvas sube sobre el hero solo cuando este ya está casi invisible (heroOut completo ~0.57)
      if (cv && ep > 0.60 && cv.style.zIndex !== '15') cv.style.zIndex = '15'
      if (p < 1) { requestAnimationFrame(step); return }
      const waitFlags = () => {
        if ((window.__heroVisualProgress ?? 1) >= 0.92) {
          document.body.style.position = ''
          document.body.style.top = ''
          document.body.style.width = ''
          document.body.style.overflow = ''
          window.__heroProgress = null
          if (cv) cv.style.zIndex = ''
          window.scrollTo(0, pinEnd)
        } else { requestAnimationFrame(waitFlags) }
      }
      requestAnimationFrame(waitFlags)
    }
    requestAnimationFrame(step)
  }

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
        /* Entrada del hero: cada pieza aparece un poco despues que la anterior,
           con el retardo en --d. Nace en opacity:0, asi que si el navegador no
           anima —o el usuario pidio menos movimiento— hay que devolverla a la
           vista a mano; de eso se encarga la regla de prefers-reduced-motion. */
        @keyframes heroEntra{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
        .hero-in{opacity:0;animation:heroEntra .72s cubic-bezier(.16,1,.3,1) both;
          animation-delay:calc(var(--d,0s) + var(--espera,0s));}
        /* El header entra desde arriba. Mientras dura, el fotograma inicial
           lo mantiene fuera de pantalla, así que al principio solo se ve el
           globo. */
        @keyframes navBaja{from{opacity:0;transform:translateY(-110%)}to{opacity:1;transform:none}}
        .nav-entra{animation:navBaja .72s cubic-bezier(.16,1,.3,1) both;animation-delay:1.05s;}
        /* El header sigue ocupando sus 70px aunque no se vea, y ahi se colaba
           una franja del fondo sobre el globo que parecia una sombra. Mientras
           el header esta fuera, el globo sube a ocuparla y baja con el, al
           mismo ritmo, asi que no hay salto. */
        @keyframes globoBaja{from{margin-top:-70px}to{margin-top:0}}
        .pin-entra{animation:globoBaja .72s cubic-bezier(.16,1,.3,1) both;animation-delay:1.05s;}
        @media (prefers-reduced-motion: reduce){.nav-entra,.pin-entra{animation:none;}}
        /* Terminada la entrada se quita la animacion. Mientras esta puesta,
           aunque sea solo rellenando el ultimo fotograma, el envoltorio hace
           de bloque contenedor y el backdrop-filter de la calculadora deja de
           ver lo que hay detras: el cristal esmerilado se veia plano. */
        .hero-fin .hero-in{animation:none!important;opacity:1;transform:none;}
        @media (prefers-reduced-motion: reduce){.hero-in{opacity:1;animation:none;}}
        .hero-calc{flex:0 1 420px;min-width:0;animation:floaty 7s ease-in-out infinite;}
        .como-wrap{display:grid;grid-template-columns:auto 1fr;gap:64px;align-items:center;max-width:980px;margin:0 auto;}
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
          .hero-calc{flex:none;width:100%;max-width:460px;margin-top:0!important;margin-right:auto!important;margin-left:auto!important;margin-bottom:0!important;animation:none;}
          /* En un iPhone la pista quedaba 170px por debajo del borde de la
             pantalla y nadie sabía que había algo más abajo. Todo lo de este
             bloque está medido para que quepa en 664px de alto visible. */
          .mob-scroll-hint{display:flex!important;flex-direction:row;align-items:center;gap:5px;cursor:pointer;margin-top:10px!important;margin-bottom:0!important;opacity:.85;transition:opacity .2s;}
          .mob-scroll-hint:active{opacity:1;}
          .hero-hide-mobile{display:none;}
          .section-pad{padding:56px 16px;}
          .hero-buttons{gap:8px;margin-bottom:14px;flex-wrap:nowrap!important;}
          .hero-buttons button,.hero-buttons a{font-size:13px!important;padding:10px 14px!important;border-radius:12px!important;white-space:nowrap!important;flex-shrink:0!important;}
          /* Globe structure mobile */
          #pin-wrap{height:320vh!important;}
          #sticky{position:sticky!important;top:70px!important;height:calc(100svh - 70px)!important;overflow:visible!important;}
          #globe-cv{position:absolute!important;top:0;left:0;width:100%!important;height:100%!important;}
          #hero-content{position:absolute!important;inset:0!important;overflow:visible!important;align-items:flex-start!important;padding-top:0!important;}
          /* Todo el bloque —título, botones, cinta, calculadora y la pista—
             abajo, pegado al borde de la pantalla, y el globo libre arriba.
             El contenedor ocupa todo el alto y el título empuja con
             margin-top:auto; si no sobra alto, ese margen es cero y queda
             igual que antes. */
          #hero-content>div{flex-direction:column;flex-wrap:nowrap!important;align-items:center;height:100%;box-sizing:border-box;padding:10px 16px calc(22px + env(safe-area-inset-bottom, 0px));gap:8px!important;}
          .hero-text{margin-top:auto!important;}
          .hero-text>div:first-child{display:none!important;}
          .hero-text h1{font-size:32px!important;margin-bottom:8px!important;}
          .hero-buttons{margin-bottom:0!important;}
          .hero-calc{margin-top:8px!important;}
          .cinta-tasas{padding:6px 0!important;margin-bottom:8px!important;}
          #scroll-hint{display:none!important;}
          #grid-title{padding:3vh 16px 0!important;}
          #grid-title p{margin-bottom:6px!important;font-size:11px!important;}
          #grid-title h2{font-size:21px!important;}
          .features-grid{grid-template-columns:repeat(2,1fr)!important;gap:12px!important;}
          .stats-band{grid-template-columns:repeat(2,1fr)!important;gap:12px!important;}
          .stats-band>div{padding:20px 16px!important;border-radius:16px!important;}
          .stats-band>div>div{width:34px!important;height:34px!important;margin-bottom:12px!important;}
          .steps-wrap{grid-template-columns:1fr!important;}
          .como-wrap{grid-template-columns:1fr!important;gap:36px!important;}
          .feature-card{padding:16px!important;border-radius:18px!important;}
          .feature-card h3{font-size:14px!important;}
          .feature-card p{font-size:13px!important;}
          .feature-icon{width:38px!important;height:38px!important;border-radius:11px!important;margin-bottom:10px!important;}
          .mob-fab{display:flex!important;}
        }
        @media(max-width:480px){
          .section-pad{padding:44px 12px;}
          .nav-inner{padding:0 10px;}
          .hero-buttons button,.hero-buttons a{font-size:12px!important;padding:11px 12px!important;}
          #hero-content>div{padding:10px 12px calc(22px + env(safe-area-inset-bottom, 0px))!important;gap:8px!important;}
          .nav-auth{flex-wrap:nowrap!important;gap:6px!important;}
          .nav-auth button{padding:7px 8px!important;font-size:12px!important;white-space:nowrap!important;flex-shrink:0!important;}
          .mob-fab{display:flex!important;}
        }
        @media(min-width:769px){ .mob-fab{display:none!important;}.mob-scroll-hint{display:none!important;} }
        @keyframes bounceDown{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
      `}</style>

      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(900px 600px at 75% -5%,rgba(37,99,235,.30),transparent 60%),radial-gradient(700px 700px at 6% 18%,rgba(56,189,248,.14),transparent 60%)' }} />

      {/* ── NAVBAR ── */}
      <nav id="main-nav" className={navListo ? undefined : 'nav-entra'} style={{ position: 'sticky', top: 0, zIndex: 60, background: 'rgba(7,14,35,.45)', backdropFilter: 'blur(22px) saturate(170%)', WebkitBackdropFilter: 'blur(22px) saturate(170%)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
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
                <button onClick={() => navigate('/login')} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 500, color: '#dbe6ff', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Iniciar sesión</button>
                <button onClick={() => navigate('/login', { state: { mode: 'register' } })} style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 8px 24px rgba(56,189,248,.4)', whiteSpace: 'nowrap', flexShrink: 0 }}>Crear cuenta →</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── PIN WRAP — scroll-storytelling hero (340 vh) ── */}
      <div id="pin-wrap" className={navListo ? undefined : 'pin-entra'} style={{ height: '340vh', position: 'relative', zIndex: 1 }}>
        <div id="sticky" style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>

          {/* Canvas gestionado por globe.js */}
          <canvas id="globe-cv" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />

          {/* Hero — globe.js lo desvanece al hacer scroll */}
          <div id="hero-content" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center' }}>
            <div className={heroListo ? 'hero-fin' : undefined} style={{ '--espera': `${ESPERA_HERO}s`, maxWidth: 1200, margin: '0 auto', padding: '0 24px', width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 48 }}>
              <div className="hero-text">
                <div className="hero-in" style={{ '--d': '.05s', display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', marginBottom: 26 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38e1ff', animation: 'pulseDot 2s infinite' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#bfe4ff' }}>Tasas en vivo · +50 países · 24/7</span>
                </div>
                <h1 className="hero-in" style={{ '--d': '.18s', margin: '0 0 20px', fontSize: 'clamp(40px,5.4vw,68px)', lineHeight: 1.02, fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>
                  Bienvenido a la<br />
                  <span style={{ background: 'linear-gradient(120deg,#38bdf8 0%,#7dd3fc 40%,#818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(56,189,248,.55))' }}>Evolución</span><br />
                  financiera
                </h1>
                <p className="hero-hide-mobile hero-in" style={{ '--d': '.31s', margin: '0 0 32px', fontSize: 18, lineHeight: 1.65, color: '#aebfe2', maxWidth: 460 }}>
                  Transferencias internacionales en minutos con tasas en tiempo real y cero comisiones ocultas.
                </p>
                <div className="hero-buttons hero-in" style={{ '--d': '.42s' }}>
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
                    <div key={i} className="hero-in" style={{ '--d': `${.54 + i * .09}s`, display: 'flex', alignItems: 'center', gap: 20 }}>
                      {i > 0 && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.14)' }} />}
                      <div>
                        <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 700, color: '#fff' }}>{val}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* La entrada va en envoltorios, no en .hero-calc: ese ya tiene su
                  propia animación de flotado y una segunda la pisaría. */}
              <div className="hero-calc">
                <div className="hero-in" style={{ '--d': '.62s' }}><CintaDeTasas /></div>
                <div className="hero-in" style={{ '--d': '.74s' }}><CalculatorDark onSend={handleSend} /></div>
              </div>
              <div className="mob-scroll-hint" onClick={handleTocaAqui}>
                <span style={{ fontSize: 11, color: 'rgba(191,228,255,0.8)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>TOCA AQUÍ para más información</span>
                <svg style={{ animation: 'bounceDown 1.6s ease-in-out infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(191,228,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Título "Operamos en estos países" — aparece al hacer morph */}
          <div id="grid-title" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, textAlign: 'center', paddingTop: '12vh', opacity: 0, pointerEvents: 'none' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Cobertura global</p>
            <h2 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,44px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.15 }}>
              Conectamos a los principales destinos de<br />América Latina y el mundo
            </h2>
          </div>

          {/* Scroll hint — desaparece al bajar */}
          <div id="scroll-hint" style={{ position: 'absolute', bottom: 26, left: '50%', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'hintBob 1.8s ease-in-out infinite' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8aa0cc' }}>Scroll</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8aa0cc" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7M19 6l-7 7-7-7" />
            </svg>
          </div>

          {/* Mobile — botón para desbloquear animación y resto de página (position:fixed escapa overflow padre) */}
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
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} className="feature-card" data-reveal="" style={{ ...glassCard, borderRadius: 22, padding: 26, borderTop: `2px solid ${f.accent}`, ...RD(i * 0.1) }}>
                <div className="feature-icon" style={{ width: 50, height: 50, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: 'rgba(4,12,38,.9)', border: `1px solid ${f.accent}33` }}>{f.icon}</div>
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
          {/* A la izquierda, un teléfono que hace un envío de principio a fin;
              a la derecha, los cuatro pasos. El paso que el teléfono está
              mostrando se ilumina, y tocar uno lleva el teléfono ahí. */}
          <div className="como-wrap">
            <div data-reveal="" style={{ display: 'flex', justifyContent: 'center', ...R0 }}>
              <DemoEnvio onPaso={setPasoDemo} salto={saltoDemo} />
            </div>

            <div className="steps-wrap" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, position: 'relative' }}>
              <div className="steps-line-v" style={{ position: 'absolute', left: 47, top: 47, bottom: 47, width: 2, background: 'linear-gradient(180deg,rgba(252,211,77,.3),#fcd34d 20%,#f59e0b 80%,rgba(245,158,11,.3))', borderRadius: 2, zIndex: 0, pointerEvents: 'none' }} />
              {STEPS.map((s, i) => {
                const activo = pasoDemo === i
                return (
                  <div key={s.n} data-reveal="" role="button" tabIndex={0}
                    onClick={() => setSaltoDemo({ paso: i, n: Date.now() })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSaltoDemo({ paso: i, n: Date.now() }) } }}
                    style={{
                      ...glassCard, borderRadius: 20, padding: '18px 22px', position: 'relative', zIndex: 1, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 16, ...RD(i * 0.12),
                      ...(s.green ? { background: 'linear-gradient(135deg,rgba(8,30,70,.95),rgba(8,22,60,.95))' } : {}),
                      border: activo ? '1px solid rgba(56,189,248,.6)' : (s.green ? '1px solid rgba(56,189,248,.32)' : glassCard.border),
                      boxShadow: activo ? '0 10px 36px rgba(56,189,248,.25), inset 0 1px 0 rgba(56,189,248,.2)' : glassCard.boxShadow,
                      transition: 'border-color .35s, box-shadow .35s, opacity .6s, transform .6s',
                    }}>
                    <div style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 700, color: s.green ? '#fff' : '#061027', background: s.green ? 'linear-gradient(135deg,#4ade80,#22c55e)' : 'linear-gradient(135deg,#7dd3fc,#38bdf8)', boxShadow: `0 8px 22px ${s.green ? 'rgba(74,222,128,.38)' : 'rgba(56,189,248,.38)'}, 0 0 0 ${activo ? 5 : 3}px ${activo ? 'rgba(56,189,248,.35)' : 'rgba(252,211,77,.22)'}`, transition: 'box-shadow .35s' }}>{s.n}</div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 4px', fontSize: 15.5, fontWeight: 600, color: '#fff' }}>{s.title}</h3>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: s.green ? '#cfe0ff' : '#9fb0d4' }}>{s.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── BANDA DE CONFIANZA ── */}
      <section className="section-pad" style={{ position: 'relative', zIndex: 2, background: 'rgba(4,10,30,.5)', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div data-reveal="" style={{ textAlign: 'center', marginBottom: 40, ...R0 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, letterSpacing: '.13em', textTransform: 'uppercase', color: '#38bdf8' }}>En números</p>
            <h2 style={{ margin: 0, fontSize: 'clamp(22px,2.8vw,36px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>Resultados que hablan por sí solos</h2>
          </div>
          <div className="stats-band" data-reveal="" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, ...R0 }}>
            {[
              { val: '+12',   label: 'Países conectados',        color: '#38bdf8',
                icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              { val: '2 min', label: 'Tiempo promedio de envío', color: '#4ade80',
                icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
              { val: '24/7',  label: 'Disponibilidad',           color: '#a5b4fc',
                icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              { val: '0%',    label: 'Comisiones ocultas',       color: '#fcd34d',
                icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
            ].map(({ val, label, color, icon }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.10)', borderTop: `2px solid ${color}`, borderRadius: 20, padding: '28px 22px', textAlign: 'center', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color }}>{icon}</div>
                <p style={{ margin: '0 0 6px', fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(30px,3.2vw,44px)', fontWeight: 700, color, lineHeight: 1 }}>{val}</p>
                <p style={{ margin: 0, fontSize: 13.5, color: '#9fb0d4', lineHeight: 1.4 }}>{label}</p>
              </div>
            ))}
          </div>
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

      {/* Mobile floating PWA install button.
          Redondo y sin texto: con «Instalar app» escrito ocupaba la mitad del
          ancho justo a la altura de «Toca aquí para más información», y tapaba
          el final de la frase. El texto de cómo instalar sigue saliendo al
          tocarlo. */}
      <div className="mob-fab" style={{ position:'fixed', bottom:'calc(8px + env(safe-area-inset-bottom, 0px))', right:14, zIndex:200, flexDirection:'column', alignItems:'flex-end', gap:8 }}>
        {showHint && (
          <div style={{ background:'rgba(8,16,44,.97)', border:'1px solid rgba(56,189,248,.3)', borderRadius:14, padding:'12px 14px', maxWidth:220, fontSize:13, color:'#aebfe2', lineHeight:1.5, boxShadow:'0 8px 24px rgba(0,0,0,.5)' }}>
            {isIOS
              ? <>En Safari: toca <strong style={{color:'#38bdf8'}}>Compartir</strong> → <strong style={{color:'#38bdf8'}}>Añadir a pantalla de inicio</ strong></>
              : <>En Chrome: toca los <strong style={{color:'#38bdf8'}}>3 puntos</strong> (⋮) → <strong style={{color:'#38bdf8'}}>Instalar aplicación</strong></>
            }
          </div>
        )}
        <button
          onClick={handleInstall}
          aria-label="Instalar app"
          title="Instalar app"
          style={{
            display:'flex', alignItems:'center', justifyContent:'center',
            width:42, height:42, padding:0,
            background:'linear-gradient(135deg,#1d4ed8,#38bdf8)',
            color:'#fff', border:'none', borderRadius:'50%',
            boxShadow:'0 6px 18px rgba(56,189,248,.45)',
            cursor:'pointer',
          }}
        >
          <svg width="19" height="19" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>

    </div>
  )
}
