import { useState, useEffect, useRef } from 'react'
import SelectorBusqueda from './SelectorBusqueda'
import { createPortal } from 'react-dom'
import api from '../services/api'
import { Bandera } from '../utils/flags'
import { useCountries } from '../hooks/useCountries'

// Los países y monedas ya no viven aquí: se editan en Ajustes → Países y
// llegan por API (hooks/useCountries).
const INTEGER_CURRENCIES = ['CLP', 'COP', 'VES', 'ARS', 'PYG']

function fmt(num, currency) {
  if (num == null || isNaN(num)) return ''
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: INTEGER_CURRENCIES.includes(currency) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(num)
}
function parseRaw(str) { return parseInt((str || '').replace(/\D/g, ''), 10) || 0 }

export default function CalculatorDark({ onSend }) {
  const [fromCurrency, setFromCurrency] = useState('CLP')
  // El país, no solo la moneda: Ecuador, Estados Unidos y Panamá comparten
  // el dólar y cada uno puede tener su comisión.
  const [fromCountry, setFromCountry]   = useState('Chile')
  const [toCountry, setToCountry]       = useState('Colombia')
  const [toCurrency, setToCurrency]     = useState('COP')
  const [displayAmount, setDisplayAmount] = useState('')
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [rateError, setRateError] = useState(null)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen]     = useState(false)
  const [isMobile]              = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768)
  const receivedRef = useRef(null)
  // Qué casilla manda. Se puede escribir arriba —cuánto envío— o abajo
  // —cuánto quiero que le llegue— y la otra se rellena sola.
  const [lado, setLado] = useState('envia')
  const [displayRecibe, setDisplayRecibe] = useState('')
  const countRaf    = useRef(null)

  const { sendCountries, receiveCountries } = useCountries()
  const countries   = receiveCountries.filter(c => c.currency !== fromCurrency)
  // El iso2 del pais elegido sale de la propia lista: el mapa de nombres no
  // cubre a todos (Canada, China, Japon, Reino Unido se quedaban sin bandera).
  const isoDestino  = receiveCountries.find(c => c.country === toCountry)?.iso2
  const selectedFrom = sendCountries.find(c => c.country === fromCountry)
    || sendCountries.find(c => c.code === fromCurrency)
  const rawAmount   = parseRaw(displayAmount)
  const rawRecibe = parseRaw(displayRecibe)

  // Si el admin quita el país o la moneda que estaba elegida, hay que caer en
  // una válida; si no, el calculador se queda pidiendo una tasa que ya no
  // existe y muestra un error permanente.
  useEffect(() => {
    if (sendCountries.length && !sendCountries.some(c => c.country === fromCountry)) {
      const uno = sendCountries.find(c => c.code === fromCurrency) || sendCountries[0]
      setFromCurrency(uno.code); setFromCountry(uno.country)
    }
  }, [sendCountries, fromCurrency, fromCountry])

  useEffect(() => {
    if (countries.length && !countries.some(c => c.country === toCountry)) {
      setToCountry(countries[0].country)
      setToCurrency(countries[0].currency)
    }
  }, [countries, toCountry])

  useEffect(() => {
    const found = countries.find(c => c.country === toCountry)
    if (found) setToCurrency(found.currency)
  }, [toCountry, countries])

  useEffect(() => {
    const monto = lado === 'envia' ? rawAmount : rawRecibe
    if (!monto || monto <= 0) {
      setResult(null); setRateError(null)
      if (lado === 'envia') setDisplayRecibe('')
      else setDisplayAmount('')
      return
    }
    if (fromCurrency === toCurrency) { setResult(null); setRateError('Misma moneda en ambos lados'); return }
    const timer = setTimeout(fetchRate, 600)
    return () => clearTimeout(timer)
    // Solo la casilla activa: con las dos, rellenar una disparaba otra
    // consulta y las dos se perseguían.
  }, [lado === 'envia' ? displayAmount : displayRecibe, lado, fromCurrency, toCurrency])

  useEffect(() => {
    if (!result) return
    const interval = setInterval(fetchRate, 60000)
    return () => clearInterval(interval)
  }, [result, fromCurrency, toCurrency, displayAmount, displayRecibe])

  const fetchRate = async () => {
    const monto = lado === 'envia' ? rawAmount : rawRecibe
    if (!monto || monto <= 0) return
    setLoading(true); setRateError(null)
    try {
      const res = await api.get('/rates/convert', {
        params: {
          from: fromCurrency, to: toCurrency,
          ...(lado === 'envia' ? { amount: rawAmount } : { amount_received: rawRecibe }),
          from_country: fromCountry, to_country: toCountry,
        },
      })
      const d = res.data.data
      // Se rellena la casilla que NO se está escribiendo: tocar la otra a
      // media cifra le borraría lo tecleado a quien está escribiendo.
      if (lado === 'envia') setDisplayRecibe(fmt(d.amount_received, toCurrency))
      else setDisplayAmount(fmt(d.amount_sent, fromCurrency))
      setResult(d)
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
    setLado('envia')
    const num = parseRaw(e.target.value)
    if (!e.target.value.replace(/\D/g, '')) { setDisplayAmount(''); return }
    setDisplayAmount(fmt(num, fromCurrency))
  }
  const handleRecibeChange = e => {
    setLado('recibe')
    const num = parseRaw(e.target.value)
    if (!e.target.value.replace(/\D/g, '')) { setDisplayRecibe(''); return }
    setDisplayRecibe(fmt(num, toCurrency))
  }
  const handleFromChange = (origen) => {
    const code = origen.code
    setFromCurrency(code); setFromCountry(origen.country)
    setResult(null); setRateError(false); setFromOpen(false)
    if (displayAmount) { const n = parseRaw(displayAmount); if (n) setDisplayAmount(fmt(n, code)) }
    if (toCurrency === code) {
      const next = receiveCountries.filter(c => c.currency !== code)
      if (next.length > 0) { setToCountry(next[0].country); setToCurrency(next[0].currency) }
    }
  }
  const handleCountryChange = c => { setToCountry(c.country); setToCurrency(c.currency); setResult(null); setRateError(null); setToOpen(false) }

  const rateText = result?.rate != null
    ? `1 ${fromCurrency} = ${result.rate.toLocaleString('es-CL', { maximumFractionDigits: 4, minimumFractionDigits: 2 })} ${toCurrency}`
    : loading ? 'Calculando...' : rateError || 'Ingresa un monto para ver la tasa'

  const card = { position: 'relative', borderRadius: 28, padding: 24, background: 'rgba(6,14,40,.18)', backdropFilter: 'blur(10px) saturate(140%)', WebkitBackdropFilter: 'blur(10px) saturate(140%)', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 8px 40px rgba(0,0,0,.18), inset 0 1.5px 0 rgba(255,255,255,.12)' }
  const panel = bg => ({ borderRadius: 18, padding: '15px 16px', background: bg, border: '1px solid rgba(255,255,255,.06)' })
  const btnCurrency = extra => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 999, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.16)', cursor: 'pointer', ...extra })
  const flagAnim = { animation: 'flagWave 2.4s ease-in-out infinite', transformOrigin: 'left center' }

  return (
    <div className="calc-dark-wrap" style={{ width: '100%', maxWidth: 420, fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`
        @keyframes flagWave{0%{transform:perspective(80px) rotateY(0deg) skewY(0deg) scaleX(1);}12%{transform:perspective(80px) rotateY(-14deg) skewY(-2.5deg) scaleX(.94);}46%{transform:perspective(80px) rotateY(2deg) scaleX(1);}62%{transform:perspective(80px) rotateY(10deg) skewY(-1.5deg) scaleX(.95);}100%{transform:perspective(80px) rotateY(0deg) scaleX(1);}}
        @keyframes glowPulse{0%,100%{opacity:.45}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @media(max-width:768px){
          .calc-dark-wrap .calc-card{padding:11px 13px!important;border-radius:22px!important;background:rgba(6,14,40,0.07)!important;border:1px solid rgba(255,255,255,.07)!important;backdrop-filter:blur(8px) saturate(120%)!important;}
          .calc-dark-wrap .calc-header{margin-bottom:8px!important;}
          .calc-dark-wrap .calc-title{font-size:15px!important;}
          .calc-dark-wrap .calc-badge{padding:4px 8px!important;font-size:10px!important;}
          .calc-dark-wrap .calc-panel{padding:8px 11px!important;border-radius:14px!important;}
          .calc-dark-wrap .calc-panel>p:first-child{margin-bottom:4px!important;font-size:10px!important;}
          .calc-dark-wrap .calc-panel button{padding:6px 10px!important;}
          .calc-dark-wrap .calc-amount{font-size:22px!important;}
          .calc-dark-wrap .calc-received{font-size:22px!important;}
          .calc-dark-wrap .calc-divider{padding:6px 4px!important;}
          .calc-dark-wrap .calc-cta{padding:11px!important;font-size:14px!important;margin-top:9px!important;border-radius:13px!important;}
          /* Fuera en móvil: son 22px que dejaban la pista de abajo fuera de
             la pantalla, y el candado no cambia lo que se decide aquí. */
          .calc-dark-wrap .calc-footer{display:none!important;}
        }
      `}</style>

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
                <Bandera iso2={selectedFrom?.iso2} ancho={24} alto={16} style={flagAnim} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{fromCurrency}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9fb3dd" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {fromOpen && (
                <SelectorBusqueda
                  titulo="¿Desde dónde envías?"
                  placeholder="Buscar país o moneda..."
                  valor={fromCountry}
                  opciones={sendCountries.map(c => ({ clave: c.country, titulo: c.country, subtitulo: c.code, iso2: c.iso2, code: c.code }))}
                  onElegir={o => handleFromChange({ country: o.clave, code: o.code })}
                  onCerrar={() => setFromOpen(false)} />
              )}
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
            {/* La casa no cobra comisión aparte: va dentro de la tasa. Decirlo
                donde se ve la cifra evita la pregunta de siempre. */}
            {result && !rateError && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: 'rgba(74,222,128,.12)', color: '#4ade80', whiteSpace: 'nowrap' }}>
                0 comisión
              </span>
            )}
          </div>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,.18),transparent)' }} />
        </div>

        {/* DESTINATARIO RECIBE */}
        <div className="calc-panel" style={panel('rgba(56,189,248,.04)')}>
          <p style={{ margin: '0 0 9px', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: '#9fc7ff', textTransform: 'uppercase' }}>Destinatario recibe</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button type="button" onClick={() => { setToOpen(v => !v); setFromOpen(false) }} style={btnCurrency({ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)' })}>
                <Bandera iso2={isoDestino} ancho={24} alto={16}
                  style={{ animation: 'flagWave 2.8s ease-in-out infinite', transformOrigin: 'left center', animationDelay: '.4s' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{toCurrency}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9fb3dd" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {toOpen && (
                <SelectorBusqueda
                  titulo="¿A qué país envías?"
                  placeholder="Buscar país..."
                  valor={toCountry}
                  opciones={countries.map(c => ({ clave: c.country, titulo: c.country, subtitulo: c.currency, iso2: c.iso2, currency: c.currency }))}
                  onElegir={o => handleCountryChange({ country: o.clave, currency: o.currency })}
                  onCerrar={() => setToOpen(false)} />
              )}
            </div>
            <input ref={receivedRef} className="calc-received" type="text" inputMode="decimal"
              value={displayRecibe} onChange={handleRecibeChange} onFocus={() => setLado('recibe')}
              placeholder="0"
              style={{ flex: 1, minWidth: 0, margin: 0, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 700, color: displayRecibe ? '#7dd3fc' : 'rgba(125,211,252,.3)', textShadow: displayRecibe ? '0 0 22px rgba(56,189,248,.45)' : 'none' }} />
          </div>
        </div>

        {/* CTA */}
        <button className="calc-cta" onClick={() => onSend?.({ amount: rawAmount, fromCurrency, fromCountry, toCountry, toCurrency, result })}
          style={{ marginTop: 16, width: '100%', padding: 15, fontSize: 16, fontWeight: 700, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#818cf8)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 14px 38px rgba(56,189,248,.4)' }}>
          ¡Comienza tu envío ahora! →
        </button>
        <p className="calc-footer" style={{ margin: '11px 0 0', textAlign: 'center', fontSize: 11.5, color: '#8aa0cc' }}>🔒 Cifrado de extremo a extremo · Sin sorpresas</p>
      </div>
    </div>
  )
}
