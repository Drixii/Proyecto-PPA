import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { flagUrl } from '../utils/flags'

const SEND_CURRENCIES = [
  { code: 'CLP', iso2: 'cl', name: 'Peso Chileno' },
  { code: 'COP', iso2: 'co', name: 'Peso Colombiano' },
  { code: 'USD', iso2: 'us', name: 'Dólar Americano' },
  { code: 'EUR', iso2: 'eu', name: 'Euro' },
  { code: 'PEN', iso2: 'pe', name: 'Sol Peruano' },
  { code: 'BRL', iso2: 'br', name: 'Real Brasileño' },
  { code: 'MXN', iso2: 'mx', name: 'Peso Mexicano' },
]
const INTEGER_CURRENCIES = ['CLP', 'COP', 'VES', 'ARS', 'PYG']

const cflag = iso2 => `https://flagcdn.com/40x30/${iso2}.png`

function fmt(num, currency) {
  if (num == null || isNaN(num)) return ''
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: INTEGER_CURRENCIES.includes(currency) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(num)
}
function parseRaw(str) { return parseInt((str || '').replace(/\D/g, ''), 10) || 0 }

const isMobileDevice = () => window.innerWidth <= 768

// ── Modal mobile overlay ──────────────────────────────────────────────────────
function MobileModal({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(3,8,24,0.96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.1)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 10, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bfe4ff" strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-.01em' }}>{title}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {children}
      </div>
    </div>
  )
}

// ── Dropdown Origen (desktop) ─────────────────────────────────────────────────
function FromDropdown({ value, onChange, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 200, width: 230, borderRadius: 16, overflow: 'hidden', background: 'rgba(12,20,46,.97)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
      {SEND_CURRENCIES.map(c => (
        <button key={c.code} type="button" onClick={() => { onChange(c.code); onClose() }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', background: value === c.code ? 'rgba(56,189,248,.14)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <img src={cflag(c.iso2)} alt="" style={{ width: 22, height: 15, borderRadius: 3, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#eaf2ff' }}>{c.code}</span>
          <span style={{ flex: 1, textAlign: 'right', fontSize: 11.5, color: '#8aa0cc' }}>{c.name}</span>
        </button>
      ))}
    </div>
  )
}

// ── Dropdown Destino (desktop) ────────────────────────────────────────────────
function ToDropdown({ countries, value, onChange, onClose }) {
  const [search, setSearch] = useState('')
  const ref = useRef()
  const inputRef = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])
  const filtered = search ? countries.filter(c => c.country.toLowerCase().includes(search.toLowerCase())) : countries
  return (
    <div ref={ref} style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 200, width: 248, borderRadius: 16, overflow: 'hidden', background: 'rgba(12,20,46,.97)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.07)', borderRadius: 11, padding: '8px 12px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8aa0cc" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar país..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#eaf2ff', fontFamily: 'inherit' }} />
        </div>
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto' }}>
        {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#8aa0cc', fontSize: 12, padding: '12px 0' }}>Sin resultados</p>}
        {filtered.map(c => (
          <button key={c.country} type="button" onClick={() => { onChange(c); onClose() }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', background: value === c.country ? 'rgba(56,189,248,.14)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            {flagUrl(c.country)
              ? <img src={flagUrl(c.country)} alt="" style={{ width: 22, height: 15, borderRadius: 3, objectFit: 'cover' }} />
              : <span style={{ width: 22, height: 15, background: 'rgba(255,255,255,.1)', borderRadius: 3, display: 'inline-block' }} />
            }
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#eaf2ff' }}>{c.country}</span>
            <span style={{ fontSize: 11.5, color: '#8aa0cc', fontFamily: "'JetBrains Mono',monospace" }}>{c.currency}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── CalculatorDark ────────────────────────────────────────────────────────────
export default function CalculatorDark({ onSend }) {
  const [fromCurrency, setFromCurrency] = useState('CLP')
  const [toCountry, setToCountry]       = useState('Venezuela')
  const [toCurrency, setToCurrency]     = useState('VES')
  const [displayAmount, setDisplayAmount] = useState('')
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [rateError, setRateError] = useState(null)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen]     = useState(false)
  const receivedRef = useRef(null)
  const countRaf    = useRef(null)

  const { data: countriesData } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/rates/countries').then(r => r.data.data),
  })
  const countries   = countriesData || []
  const selectedFrom = SEND_CURRENCIES.find(c => c.code === fromCurrency)
  const rawAmount   = parseRaw(displayAmount)

  useEffect(() => {
    const found = countries.find(c => c.country === toCountry)
    if (found) setToCurrency(found.currency)
  }, [toCountry, countries])

  useEffect(() => {
    if (!rawAmount || rawAmount <= 0) { setResult(null); setRateError(null); return }
    if (fromCurrency === toCurrency) { setResult(null); setRateError('Misma moneda en ambos lados'); return }
    const timer = setTimeout(fetchRate, 600)
    return () => clearTimeout(timer)
  }, [displayAmount, fromCurrency, toCurrency])

  useEffect(() => {
    if (!result) return
    const interval = setInterval(fetchRate, 60000)
    return () => clearInterval(interval)
  }, [result, fromCurrency, toCurrency, displayAmount])

  const fetchRate = async () => {
    if (!rawAmount || rawAmount <= 0) return
    setLoading(true); setRateError(null)
    try {
      const res = await api.get('/rates/convert', { params: { from: fromCurrency, to: toCurrency, amount: rawAmount } })
      const prev = result?.amount_received || 0
      setResult(res.data.data)
      animateCount(prev, res.data.data.amount_received, res.data.data)
    } catch (err) {
      setResult(null)
      const detail = err.response?.data?.detail || ''
      if (detail.toLowerCase().includes('tasa') || err.response?.status === 404) {
        setRateError(`Conversión ${fromCurrency} → ${toCurrency} no disponible`)
      } else {
        setRateError('Error al obtener la tasa. Intenta nuevamente.')
      }
    } finally { setLoading(false) }
  }

  const animateCount = (from, to, latestResult) => {
    if (!receivedRef.current) return
    cancelAnimationFrame(countRaf.current)
    const dur = 650, t0 = performance.now()
    const cur = latestResult?.currency || toCurrency
    const ease = t => 1 - Math.pow(1 - t, 3)
    const step = now => {
      const p = Math.min(1, (now - t0) / dur)
      if (receivedRef.current) receivedRef.current.textContent = fmt(from + (to - from) * ease(p), cur)
      if (p < 1) countRaf.current = requestAnimationFrame(step)
    }
    countRaf.current = requestAnimationFrame(step)
  }

  const handleAmountChange = e => {
    const num = parseRaw(e.target.value)
    if (!e.target.value.replace(/\D/g, '')) { setDisplayAmount(''); return }
    setDisplayAmount(fmt(num, fromCurrency))
  }
  const handleFromChange = code => {
    setFromCurrency(code); setResult(null); setRateError(false); setFromOpen(false)
    if (displayAmount) { const n = parseRaw(displayAmount); if (n) setDisplayAmount(fmt(n, code)) }
  }
  const handleCountryChange = c => { setToCountry(c.country); setToCurrency(c.currency); setResult(null); setRateError(null); setToOpen(false) }

  const rateText = result?.rate != null
    ? `1 ${fromCurrency} = ${result.rate.toLocaleString('es-CL', { maximumFractionDigits: 4, minimumFractionDigits: 2 })} ${toCurrency}`
    : loading ? 'Calculando...' : rateError || 'Ingresa un monto para ver la tasa'

  const card = { position: 'relative', borderRadius: 28, padding: 24, background: 'rgba(6,14,40,.18)', backdropFilter: 'blur(10px) saturate(140%)', WebkitBackdropFilter: 'blur(10px) saturate(140%)', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 8px 40px rgba(0,0,0,.18), inset 0 1.5px 0 rgba(255,255,255,.12)' }
  const panel = bg => ({ borderRadius: 18, padding: '15px 16px', background: bg, border: '1px solid rgba(255,255,255,.06)' })
  const btnCurrency = extra => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 999, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.16)', cursor: 'pointer', ...extra })
  const flagAnim = { animation: 'flagWave 2.4s ease-in-out infinite', transformOrigin: 'left center' }

  // ── Mobile: lista de monedas origen ──────────────────────────────────────
  const FromList = () => (
    <>
      {SEND_CURRENCIES.map(c => (
        <button key={c.code} type="button" onClick={() => { handleFromChange(c.code); setFromOpen(false) }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: fromCurrency === c.code ? 'rgba(56,189,248,.12)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,.05)', cursor: 'pointer' }}>
          <img src={cflag(c.iso2)} alt="" style={{ width: 28, height: 19, borderRadius: 4, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#eaf2ff' }}>{c.code}</span>
          <span style={{ flex: 1, textAlign: 'right', fontSize: 13, color: '#8aa0cc' }}>{c.name}</span>
          {fromCurrency === c.code && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
        </button>
      ))}
    </>
  )

  // ── Mobile: lista de países destino ──────────────────────────────────────
  const ToList = () => {
    const [search, setSearch] = useState('')
    const inputRef = useRef()
    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])
    const filtered = search ? countries.filter(c => c.country.toLowerCase().includes(search.toLowerCase())) : countries
    return (
      <>
        <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.08)', position: 'sticky', top: 0, background: 'rgba(3,8,24,.96)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: '10px 14px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8aa0cc" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar país..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: '#eaf2ff', fontFamily: 'inherit' }} />
          </div>
        </div>
        {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#8aa0cc', fontSize: 13, padding: '20px 0' }}>Sin resultados</p>}
        {filtered.map(c => (
          <button key={c.country} type="button" onClick={() => { handleCountryChange(c); setToOpen(false) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: toCountry === c.country ? 'rgba(56,189,248,.12)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,.05)', cursor: 'pointer' }}>
            {flagUrl(c.country)
              ? <img src={flagUrl(c.country)} alt="" style={{ width: 28, height: 19, borderRadius: 4, objectFit: 'cover' }} />
              : <span style={{ width: 28, height: 19, background: 'rgba(255,255,255,.1)', borderRadius: 4, display: 'inline-block' }} />
            }
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: '#eaf2ff', textAlign: 'left' }}>{c.country}</span>
            <span style={{ fontSize: 12, color: '#8aa0cc', fontFamily: "'JetBrains Mono',monospace" }}>{c.currency}</span>
            {toCountry === c.country && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
          </button>
        ))}
      </>
    )
  }

  return (
    <div className="calc-dark-wrap" style={{ width: '100%', maxWidth: 420, fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`
        @keyframes flagWave{0%{transform:perspective(80px) rotateY(0deg) skewY(0deg) scaleX(1);}12%{transform:perspective(80px) rotateY(-14deg) skewY(-2.5deg) scaleX(.94);}46%{transform:perspective(80px) rotateY(2deg) scaleX(1);}62%{transform:perspective(80px) rotateY(10deg) skewY(-1.5deg) scaleX(.95);}100%{transform:perspective(80px) rotateY(0deg) scaleX(1);}}
        @keyframes glowPulse{0%,100%{opacity:.45}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .calc-dark-wrap{position:relative!important;z-index:10!important;}
          .calc-dark-wrap .calc-card{padding:16px!important;background:rgba(6,14,40,0.07)!important;border:1px solid rgba(255,255,255,.07)!important;backdrop-filter:blur(8px) saturate(120%)!important;}
          .calc-dark-wrap .calc-header{margin-bottom:12px!important;}
          .calc-dark-wrap .calc-title{font-size:15px!important;}
          .calc-dark-wrap .calc-badge{padding:4px 8px!important;font-size:10px!important;}
          .calc-dark-wrap .calc-panel{padding:11px 12px!important;}
          .calc-dark-wrap .calc-amount{font-size:24px!important;}
          .calc-dark-wrap .calc-received{font-size:24px!important;}
          .calc-dark-wrap .calc-divider{padding:10px 4px!important;}
          .calc-dark-wrap .calc-cta{padding:12px!important;font-size:14px!important;margin-top:12px!important;}
          .calc-dark-wrap .calc-footer{margin-top:8px!important;font-size:11px!important;}
        }
      `}</style>

      {/* Modales mobile */}
      {fromOpen && isMobileDevice() && (
        <MobileModal title="Selecciona moneda de origen" onClose={() => setFromOpen(false)}>
          <FromList />
        </MobileModal>
      )}
      {toOpen && isMobileDevice() && (
        <MobileModal title="Selecciona país destino" onClose={() => setToOpen(false)}>
          <ToList />
        </MobileModal>
      )}

      <div className="calc-card" style={card}>
        <div style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)' }} />

        <div className="calc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 className="calc-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-.01em' }}>Calcula tu envío</h2>
          <span className="calc-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#9fe7c0', background: 'rgba(34,197,94,.14)', border: '1px solid rgba(74,222,128,.3)', padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'glowPulse 1.6s infinite' }} />EN VIVO
          </span>
        </div>

        {/* TU ENVÍAS */}
        <div className="calc-panel" style={panel('rgba(255,255,255,.04)')}>
          <p style={{ margin: '0 0 9px', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: '#8aa0cc', textTransform: 'uppercase' }}>Tú envías</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button type="button" onClick={() => { setFromOpen(v => !v); setToOpen(false) }} style={btnCurrency()}>
                <img src={cflag(selectedFrom?.iso2)} alt="" style={{ width: 24, height: 16, borderRadius: 3, objectFit: 'cover', ...flagAnim }}
                  onError={e => { e.target.style.display = 'none' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{fromCurrency}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9fb3dd" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {fromOpen && !isMobileDevice() && <FromDropdown value={fromCurrency} onChange={handleFromChange} onClose={() => setFromOpen(false)} />}
            </div>
            <input type="text" inputMode="numeric" value={displayAmount} onChange={handleAmountChange} placeholder="0"
              className="calc-amount"
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 700, color: '#fff' }} />
          </div>
        </div>

        {/* RATE DIVIDER */}
        <div className="calc-divider" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.18))' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, background: 'rgba(56,189,248,.12)', border: '1px solid rgba(56,189,248,.3)' }}>
            {loading
              ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(56,189,248,.6)', borderTopColor: '#38bdf8', animation: 'spin .7s linear infinite' }} />
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            }
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 500, color: rateError ? '#fbbf24' : '#bfe4ff', whiteSpace: 'nowrap' }}>{rateText}</span>
          </div>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,.18),transparent)' }} />
        </div>

        {/* DESTINATARIO RECIBE */}
        <div className="calc-panel" style={panel('rgba(56,189,248,.04)')}>
          <p style={{ margin: '0 0 9px', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: '#9fc7ff', textTransform: 'uppercase' }}>Destinatario recibe</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button type="button" onClick={() => { setToOpen(v => !v); setFromOpen(false) }} style={btnCurrency({ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)' })}>
                {flagUrl(toCountry)
                  ? <img src={flagUrl(toCountry)} alt="" style={{ width: 24, height: 16, borderRadius: 3, objectFit: 'cover', animation: 'flagWave 2.8s ease-in-out infinite', transformOrigin: 'left center', animationDelay: '.4s' }} />
                  : <span>🌍</span>
                }
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{toCurrency}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9fb3dd" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {toOpen && !isMobileDevice() && <ToDropdown countries={countries} value={toCountry} onChange={handleCountryChange} onClose={() => setToOpen(false)} />}
            </div>
            <p ref={receivedRef} className="calc-received" style={{ flex: 1, margin: 0, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 700, color: result ? '#7dd3fc' : 'rgba(125,211,252,.3)', textShadow: result ? '0 0 22px rgba(56,189,248,.45)' : 'none' }}>
              {result ? fmt(result.amount_received, toCurrency) : '—'}
            </p>
          </div>
        </div>

        {/* CTA */}
        <button className="calc-cta" onClick={() => onSend?.({ amount: rawAmount, fromCurrency, toCountry, toCurrency, result })}
          style={{ marginTop: 16, width: '100%', padding: 15, fontSize: 16, fontWeight: 700, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#818cf8)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 38px rgba(56,189,248,.4)' }}>
          ¡Comienza tu envío ahora! →
        </button>
        <p className="calc-footer" style={{ margin: '11px 0 0', textAlign: 'center', fontSize: 11.5, color: '#8aa0cc' }}>🔒 Cifrado de extremo a extremo · Sin sorpresas</p>
      </div>
    </div>
  )
}
