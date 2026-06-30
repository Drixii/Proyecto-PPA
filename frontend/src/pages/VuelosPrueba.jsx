import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'

// ── Aeropuertos por país ──────────────────────────────────────────────────────
const AIRPORTS = [
  { iata: 'SCL', city: 'Santiago',        country: 'Chile',      iso2: 'cl' },
  { iata: 'PMC', city: 'Puerto Montt',    country: 'Chile',      iso2: 'cl' },
  { iata: 'IQQ', city: 'Iquique',         country: 'Chile',      iso2: 'cl' },
  { iata: 'BOG', city: 'Bogotá',          country: 'Colombia',   iso2: 'co' },
  { iata: 'MDE', city: 'Medellín',        country: 'Colombia',   iso2: 'co' },
  { iata: 'CLO', city: 'Cali',            country: 'Colombia',   iso2: 'co' },
  { iata: 'CTG', city: 'Cartagena',       country: 'Colombia',   iso2: 'co' },
  { iata: 'JFK', city: 'Nueva York (JFK)', country: 'EE.UU.',   iso2: 'us' },
  { iata: 'MIA', city: 'Miami',           country: 'EE.UU.',     iso2: 'us' },
  { iata: 'LAX', city: 'Los Ángeles',     country: 'EE.UU.',     iso2: 'us' },
  { iata: 'ORD', city: 'Chicago',         country: 'EE.UU.',     iso2: 'us' },
  { iata: 'MAD', city: 'Madrid',          country: 'España',     iso2: 'es' },
  { iata: 'BCN', city: 'Barcelona',       country: 'España',     iso2: 'es' },
  { iata: 'LIM', city: 'Lima',            country: 'Perú',       iso2: 'pe' },
  { iata: 'CUZ', city: 'Cusco',           country: 'Perú',       iso2: 'pe' },
  { iata: 'GRU', city: 'São Paulo',       country: 'Brasil',     iso2: 'br' },
  { iata: 'GIG', city: 'Río de Janeiro',  country: 'Brasil',     iso2: 'br' },
  { iata: 'FOR', city: 'Fortaleza',       country: 'Brasil',     iso2: 'br' },
  { iata: 'MEX', city: 'Ciudad de México', country: 'México',   iso2: 'mx' },
  { iata: 'CUN', city: 'Cancún',          country: 'México',     iso2: 'mx' },
  { iata: 'GDL', city: 'Guadalajara',     country: 'México',     iso2: 'mx' },
  { iata: 'EZE', city: 'Buenos Aires',    country: 'Argentina',  iso2: 'ar' },
  { iata: 'COR', city: 'Córdoba',         country: 'Argentina',  iso2: 'ar' },
  { iata: 'YYZ', city: 'Toronto',         country: 'Canadá',     iso2: 'ca' },
  { iata: 'YVR', city: 'Vancouver',       country: 'Canadá',     iso2: 'ca' },
  { iata: 'YUL', city: 'Montreal',        country: 'Canadá',     iso2: 'ca' },
  { iata: 'CCS', city: 'Caracas',         country: 'Venezuela',  iso2: 've' },
]

const CABIN_OPTIONS = [
  { value: 'economy',         label: 'Económica' },
  { value: 'premium_economy', label: 'Premium Económica' },
  { value: 'business',        label: 'Business' },
  { value: 'first',           label: 'Primera Clase' },
]

const GLASS = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 20,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
}

const flag = iso2 => `https://flagcdn.com/20x15/${iso2}.png`

function fmt_date(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmt_duration(iso_dur) {
  if (!iso_dur) return ''
  const m = iso_dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return iso_dur
  return `${m[1] || 0}h ${m[2] || '00'}m`
}
function fmt_price(amount, currency) {
  return `${currency} ${parseFloat(amount).toLocaleString('es-CL', { minimumFractionDigits: 2 })}`
}

// ── Date picker ──────────────────────────────────────────────────────────────
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_ES   = ['Lu','Ma','Mi','Ju','Vi','Sa','Do']

function isoToLocal(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function localToIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function DatePicker({ label, value, onChange, minDate, lightMode = false }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const min = minDate ? isoToLocal(minDate) : today
  const selected = isoToLocal(value)

  const initView = () => {
    const base = selected || min
    return { y: base.getFullYear(), m: base.getMonth() }
  }
  const [view, setView] = useState(initView)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  useEffect(() => {
    if (selected && min && selected < min) onChange(null)
  }, [minDate])

  const prevMonth = () => setView(v => v.m === 0 ? { y: v.y-1, m: 11 } : { y: v.y, m: v.m-1 })
  const nextMonth = () => setView(v => v.m === 11 ? { y: v.y+1, m: 0  } : { y: v.y, m: v.m+1 })

  const firstDay = new Date(view.y, view.m, 1)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m+1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const pick = d => {
    if (!d) return
    const dt = new Date(view.y, view.m, d); dt.setHours(0,0,0,0)
    if (dt < min) return
    onChange(localToIso(dt))
    setOpen(false)
  }

  const isDisabled = d => { if (!d) return true; const dt = new Date(view.y, view.m, d); dt.setHours(0,0,0,0); return dt < min }
  const isToday    = d => { if (!d) return false; const dt = new Date(view.y, view.m, d); dt.setHours(0,0,0,0); return dt.getTime() === today.getTime() }
  const isSelected = d => { if (!d || !selected) return false; const dt = new Date(view.y, view.m, d); dt.setHours(0,0,0,0); return dt.getTime() === selected.getTime() }

  const displayLabel = selected
    ? selected.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Seleccionar...'

  const calendar = open && createPortal(
    <div onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(8,17,48,.99)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,.9)', padding: '20px 18px', width: 310 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button type="button" onClick={prevMonth} style={{ background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 8, color: '#8aa0cc', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#eaf2ff' }}>{MONTHS_ES[view.m]} {view.y}</span>
          <button type="button" onClick={nextMonth} style={{ background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 8, color: '#8aa0cc', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>›</button>
        </div>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 6 }}>
          {DAYS_ES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#8aa0cc', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>
        {/* Days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            const dis = isDisabled(d); const sel = isSelected(d); const tod = isToday(d)
            return (
              <button key={i} type="button" onClick={() => pick(d)} disabled={dis || !d}
                style={{ height: 36, width: '100%', border: 'none', borderRadius: 8, cursor: (dis || !d) ? 'default' : 'pointer', fontSize: 13, fontWeight: sel ? 700 : 400,
                  background: sel ? 'linear-gradient(135deg,#38bdf8,#818cf8)' : tod ? 'rgba(56,189,248,.12)' : 'transparent',
                  color: !d ? 'transparent' : sel ? '#061027' : dis ? 'rgba(255,255,255,.2)' : '#eaf2ff',
                  outline: tod && !sel ? '1px solid rgba(56,189,248,.4)' : 'none' }}
                onMouseEnter={e => { if (!dis && d && !sel) e.currentTarget.style.background = 'rgba(56,189,248,.15)' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = tod ? 'rgba(56,189,248,.12)' : 'transparent' }}>
                {d || ''}
              </button>
            )
          })}
        </div>
        {value && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#8aa0cc' }}>{displayLabel}</span>
            <button type="button" onClick={() => { onChange(null); setOpen(false) }} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>Limpiar</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )

  return (
    <div>
      {label && !lightMode && <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</label>}
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: lightMode ? 'transparent' : 'rgba(6,13,40,.8)',
          border: lightMode ? 'none' : `1px solid ${value ? 'rgba(56,189,248,.4)' : 'rgba(255,255,255,.12)'}`,
          borderRadius: lightMode ? 0 : 12,
          color: lightMode ? (value ? '#0f172a' : '#94a3b8') : (value ? '#eaf2ff' : '#8aa0cc'),
          padding: lightMode ? '4px 0' : '12px 16px', fontSize: 14, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={value ? '#0ea5e9' : '#94a3b8'} strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span style={{ fontWeight: value ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayLabel}</span>
      </button>
      {calendar}
    </div>
  )
}

// ── Airport selector ──────────────────────────────────────────────────────────
function AirportPicker({ label, value, onChange, exclude, lightMode = false }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const filtered = AIRPORTS.filter(a =>
    a.iata !== exclude &&
    (search === '' ||
      a.city.toLowerCase().includes(search.toLowerCase()) ||
      a.country.toLowerCase().includes(search.toLowerCase()) ||
      a.iata.toLowerCase().includes(search.toLowerCase()))
  )

  const selected = AIRPORTS.find(a => a.iata === value)

  const modal = open && createPortal(
    <div onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(8,17,48,.99)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,.9)', width: 420, maxWidth: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>✈ {label || 'Aeropuerto'}</span>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#8aa0cc', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        {/* Search */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ciudad, país o código IATA..."
            style={{ width: '100%', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#eaf2ff', padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {/* List */}
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0
            ? <p style={{ textAlign: 'center', color: '#8aa0cc', fontSize: 13, padding: '20px 0' }}>Sin resultados</p>
            : filtered.map(a => (
              <button key={a.iata} type="button"
                onClick={() => { onChange(a.iata); setOpen(false); setSearch('') }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', background: value === a.iata ? 'rgba(56,189,248,.1)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => { if (value !== a.iata) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                onMouseLeave={e => { if (value !== a.iata) e.currentTarget.style.background = 'transparent' }}>
                <img src={flag(a.iso2)} alt="" style={{ width: 24, height: 17, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: '#38bdf8', width: 38, flexShrink: 0 }}>{a.iata}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: '#eaf2ff', fontWeight: 600 }}>{a.city}</div>
                  <div style={{ fontSize: 11, color: '#8aa0cc' }}>{a.country}</div>
                </div>
                {value === a.iata && <span style={{ color: '#38bdf8', fontSize: 14 }}>✓</span>}
              </button>
            ))
          }
        </div>
      </div>
    </div>,
    document.body
  )

  return (
    <div>
      {label && !lightMode && <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</label>}
      <button type="button" onClick={() => setOpen(true)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: lightMode ? 'transparent' : 'rgba(6,13,40,.8)',
          border: lightMode ? 'none' : '1px solid rgba(255,255,255,.12)',
          borderRadius: lightMode ? 0 : 12,
          color: lightMode ? '#0f172a' : '#eaf2ff',
          padding: lightMode ? '4px 0' : '12px 16px', fontSize: 14, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box', overflow: 'hidden' }}>
        {selected ? (
          <>
            <img src={flag(selected.iso2)} alt="" style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 16, flexShrink: 0 }}>{selected.iata}</span>
            <span style={{ fontSize: 12, color: lightMode ? '#475569' : '#aebfe2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.city}</span>
          </>
        ) : (
          <span style={{ color: lightMode ? '#94a3b8' : '#8aa0cc', whiteSpace: 'nowrap' }}>Seleccionar...</span>
        )}
      </button>
      {modal}
    </div>
  )
}

// ── Step 1: Search ────────────────────────────────────────────────────────────
function SearchStep({ onResults }) {
  const [origin, setOrigin] = useState('SCL')
  const [destination, setDestination] = useState('BOG')
  const [date, setDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [roundTrip, setRoundTrip] = useState(false)
  const [passengers, setPassengers] = useState(1)
  const [cabin, setCabin] = useState('economy')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const inp = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#eaf2ff', padding: '12px 16px', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!origin || !destination || !date || (roundTrip && !returnDate)) return
    setError(null)
    setLoading(true)
    try {
      const slices = [{ origin, destination, departure_date: date }]
      if (roundTrip && returnDate) slices.push({ origin: destination, destination: origin, departure_date: returnDate })
      const res = await api.post('/flights/search', { slices, passengers: parseInt(passengers), cabin_class: cabin })
      onResults(res.data)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail[0]?.message : JSON.stringify(detail)) || 'Error buscando vuelos.')
    } finally {
      setLoading(false)
    }
  }

  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.07em' }
  const field = { background: 'transparent', border: 'none', outline: 'none', color: '#0f172a', fontSize: 14, width: '100%', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div>
      {/* ── Hero banner ── */}
      <div style={{ position: 'relative', width: '100%', height: 'clamp(220px,38vw,420px)', overflow: 'hidden' }}>
        <img src="/banner-vuelos.png" alt="Vuelos" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%' }} />
        {/* gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(6,13,34,.15) 0%, rgba(6,13,34,.55) 100%)' }} />
        {/* text */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 999, padding: '5px 16px', marginBottom: 14 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '.1em' }}>MODO PRUEBA · DUFFEL API</span>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,5vw,52px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,.4)' }}>
            ¿A dónde quieres volar?
          </h1>
          <p style={{ margin: 0, fontSize: 'clamp(13px,2vw,17px)', color: 'rgba(255,255,255,.8)', textShadow: '0 1px 8px rgba(0,0,0,.4)' }}>
            Busca y reserva vuelos reales en segundos
          </p>
        </div>
      </div>

      {/* ── Search card (sobresale del banner) ── */}
      <div style={{ maxWidth: 1100, margin: '-52px auto 0', padding: '0 20px 40px', position: 'relative', zIndex: 10 }}>
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 48px rgba(0,0,0,.18)', overflow: 'visible' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, padding: '14px 20px 0', borderBottom: '1px solid #f1f5f9' }}>
            {[false, true].map(rt => (
              <button key={String(rt)} type="button" onClick={() => setRoundTrip(rt)}
                style={{ padding: '8px 18px', borderRadius: '10px 10px 0 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: roundTrip === rt ? '#fff' : 'transparent',
                  color: roundTrip === rt ? '#0ea5e9' : '#94a3b8',
                  borderBottom: roundTrip === rt ? '2px solid #0ea5e9' : '2px solid transparent' }}>
                {rt ? '⇄ Ida y vuelta' : '→ Solo ida'}
              </button>
            ))}
          </div>

          {/* Fields row */}
          <form onSubmit={handleSearch}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 0 }}>

              {/* Origen */}
              <div style={{ padding: '14px 18px', borderRight: '1px solid #f1f5f9' }}>
                <label style={lbl}>✈ Origen</label>
                <AirportPicker label="" value={origin} onChange={setOrigin} exclude={destination} lightMode />
              </div>

              {/* Swap btn + Destino */}
              <div style={{ padding: '14px 18px', borderRight: '1px solid #f1f5f9', position: 'relative' }}>
                <button type="button" onClick={() => { const t = origin; setOrigin(destination); setDestination(t) }}
                  style={{ position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)', zIndex: 5, width: 28, height: 28, borderRadius: '50%', background: '#fff', border: '2px solid #e2e8f0', color: '#0ea5e9', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
                  ⇄
                </button>
                <label style={lbl}>⚑ Destino</label>
                <AirportPicker label="" value={destination} onChange={setDestination} exclude={origin} lightMode />
              </div>

              {/* Fecha ida */}
              <div style={{ padding: '14px 18px', borderRight: '1px solid #f1f5f9' }}>
                <label style={lbl}>📅 Fecha ida</label>
                <DatePicker label="" value={date} onChange={v => { setDate(v || ''); if (returnDate && v && v >= returnDate) setReturnDate('') }} lightMode />
              </div>

              {/* Fecha vuelta (condicional) */}
              {roundTrip && (
                <div style={{ padding: '14px 18px', borderRight: '1px solid #f1f5f9' }}>
                  <label style={lbl}>📅 Fecha vuelta</label>
                  <DatePicker label="" value={returnDate} onChange={v => setReturnDate(v || '')} minDate={date || undefined} lightMode />
                </div>
              )}

              {/* Pasajeros */}
              <div style={{ padding: '14px 18px', borderRight: '1px solid #f1f5f9' }}>
                <label style={lbl}>👤 Pasajeros</label>
                <select value={passengers} onChange={e => setPassengers(e.target.value)} style={{ ...field, color: '#0f172a' }}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'pasajero' : 'pasajeros'}</option>)}
                </select>
              </div>

              {/* Cabina */}
              <div style={{ padding: '14px 18px', borderRight: '1px solid #f1f5f9' }}>
                <label style={lbl}>💺 Cabina</label>
                <select value={cabin} onChange={e => setCabin(e.target.value)} style={{ ...field, color: '#0f172a' }}>
                  {CABIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Botón buscar */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'stretch' }}>
                <button type="submit" disabled={loading || !origin || !destination || !date || (roundTrip && !returnDate)}
                  style={{ flex: 1, background: loading ? '#7dd3fc' : 'linear-gradient(135deg,#0ea5e9,#0284c7)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 800, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 54 }}>
                  <span style={{ fontSize: 18 }}>🔍</span>
                  <span>{loading ? 'Buscando...' : 'Buscar'}</span>
                </button>
              </div>
            </div>

            {error && (
              <div style={{ margin: '0 20px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Results ───────────────────────────────────────────────────────────
function OfferCard({ offer, onSelect }) {
  const sl = offer.slices[0]
  return (
    <div onClick={() => onSelect(offer)}
      style={{ ...GLASS, padding: '20px 24px', cursor: 'pointer', transition: 'border-color .2s, box-shadow .2s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(56,189,248,.4)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(56,189,248,.1)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.boxShadow = 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        {/* Aerolínea */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140 }}>
          {sl?.airline_logo
            ? <img src={sl.airline_logo} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: '#fff', padding: 3 }} />
            : <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56,189,248,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✈</div>
          }
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }}>{sl?.airline || '—'}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{sl?.flight_number}</p>
          </div>
        </div>

        {/* Ruta + horario */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, justifyContent: 'center', minWidth: 240 }}>
          <div style={{ textAlign: 'center' }}>
            {(() => { const a = AIRPORTS.find(x => x.iata === sl?.origin); return a ? <img src={flag(a.iso2)} alt="" style={{ width: 24, height: 16, borderRadius: 3, objectFit: 'cover', marginBottom: 4 }} /> : null })()}
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: '#eaf2ff' }}>{sl?.origin}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{fmt_date(sl?.departure_at)}</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#8aa0cc' }}>{fmt_duration(sl?.duration)}</p>
            <div style={{ height: 1, background: 'rgba(255,255,255,.15)', position: 'relative' }}>
              <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 13, color: '#38bdf8' }}>✈</span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: sl?.stops === 0 ? '#4ade80' : '#fcd34d' }}>
              {sl?.stops === 0 ? 'Directo' : `${sl.stops} escala${sl.stops > 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            {(() => { const a = AIRPORTS.find(x => x.iata === sl?.destination); return a ? <img src={flag(a.iso2)} alt="" style={{ width: 24, height: 16, borderRadius: 3, objectFit: 'cover', marginBottom: 4 }} /> : null })()}
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: '#eaf2ff' }}>{sl?.destination}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{fmt_date(sl?.arriving_at)}</p>
          </div>
        </div>

        {/* Precio */}
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#7dd3fc', fontFamily: 'monospace' }}>
            {fmt_price(offer.total_amount, offer.total_currency)}
          </p>
          <p style={{ margin: '2px 0 8px', fontSize: 11, color: '#8aa0cc' }}>por persona</p>
          <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(56,189,248,.15)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>
            Seleccionar →
          </div>
        </div>
      </div>

      {/* Vuelta */}
      {offer.slices[1] && (() => {
        const sl2 = offer.slices[1]
        const a1 = AIRPORTS.find(x => x.iata === sl2.origin)
        const a2 = AIRPORTS.find(x => x.iata === sl2.destination)
        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8aa0cc', background: 'rgba(255,255,255,.06)', padding: '3px 8px', borderRadius: 6 }}>VUELTA</span>
            {a1 && <img src={flag(a1.iso2)} alt="" style={{ width: 18, height: 12, borderRadius: 2, objectFit: 'cover' }} />}
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#aebfe2', fontWeight: 700 }}>{sl2.origin}</span>
            <span style={{ color: '#8aa0cc' }}>→</span>
            {a2 && <img src={flag(a2.iso2)} alt="" style={{ width: 18, height: 12, borderRadius: 2, objectFit: 'cover' }} />}
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#aebfe2', fontWeight: 700 }}>{sl2.destination}</span>
            <span style={{ fontSize: 11, color: '#8aa0cc' }}>{fmt_date(sl2.departure_at)}</span>
            <span style={{ fontSize: 11, color: '#8aa0cc' }}>· {fmt_duration(sl2.duration)}</span>
          </div>
        )
      })()}
    </div>
  )
}

function ResultsStep({ data, onSelect, onBack }) {
  const { offers } = data
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#8aa0cc', padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>← Nueva búsqueda</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#eaf2ff' }}>{offers.length} vuelos encontrados</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Ordenados por precio · Haz clic para reservar</p>
        </div>
      </div>
      {offers.length === 0
        ? <div style={{ ...GLASS, padding: 40, textAlign: 'center' }}><p style={{ color: '#8aa0cc' }}>No hay vuelos disponibles para esta ruta y fecha.</p></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {offers.map(o => <OfferCard key={o.id} offer={o} onSelect={onSelect} />)}
          </div>
      }
    </div>
  )
}

// ── Step 3: Passenger form ────────────────────────────────────────────────────
function PassengerForm({ offer, onBook, onBack }) {
  const count = offer.passengers?.length || 1
  const emptyPax = { title: 'mr', given_name: '', family_name: '', born_on: '', gender: 'm', email: '', phone_number: '' }
  const [paxList, setPaxList] = useState(Array.from({ length: count }, () => ({ ...emptyPax })))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const sl = offer.slices[0]
  const ao = AIRPORTS.find(x => x.iata === sl?.origin)
  const ad = AIRPORTS.find(x => x.iata === sl?.destination)

  const update = (i, field, val) => setPaxList(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))

  const handleBook = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const passengers = paxList.map((p, i) => ({ ...p, id: offer.passengers[i]?.id }))
      const res = await api.post('/flights/book', {
        offer_id: offer.id,
        passengers,
        currency: offer.total_currency,
        amount: offer.total_amount,
      })
      onBook(res.data)
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : (Array.isArray(d) ? d[0]?.message : JSON.stringify(d)) || 'Error al reservar.')
    } finally {
      setLoading(false)
    }
  }

  const inp = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#eaf2ff', padding: '10px 14px', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#8aa0cc', padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>← Volver</button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#eaf2ff' }}>Datos de pasajeros</h2>
      </div>

      {/* Resumen vuelo seleccionado */}
      <div style={{ ...GLASS, padding: '18px 22px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              {ao && <img src={flag(ao.iso2)} alt="" style={{ width: 24, height: 16, borderRadius: 3, objectFit: 'cover', marginBottom: 2 }} />}
              <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#eaf2ff' }}>{sl?.origin}</p>
            </div>
            <span style={{ color: '#38bdf8', fontSize: 16 }}>→</span>
            <div style={{ textAlign: 'center' }}>
              {ad && <img src={flag(ad.iso2)} alt="" style={{ width: 24, height: 16, borderRadius: 3, objectFit: 'cover', marginBottom: 2 }} />}
              <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#eaf2ff' }}>{sl?.destination}</p>
            </div>
            <div style={{ fontSize: 12, color: '#8aa0cc' }}>
              <p style={{ margin: 0 }}>{sl?.airline} · {sl?.stops === 0 ? 'Directo' : `${sl.stops} escala(s)`}</p>
              <p style={{ margin: 0 }}>{fmt_date(sl?.departure_at)} · {fmt_duration(sl?.duration)}</p>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#7dd3fc', fontFamily: 'monospace' }}>
            {fmt_price(offer.total_amount, offer.total_currency)}
          </p>
        </div>
      </div>

      <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {paxList.map((pax, i) => (
          <div key={i} style={{ ...GLASS, padding: 22 }}>
            <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Pasajero {i + 1}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Tratamiento</label>
                <select value={pax.title} onChange={e => update(i, 'title', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="mr">Sr.</option><option value="ms">Sra.</option><option value="mrs">Sra. (casada)</option><option value="miss">Srta.</option><option value="dr">Dr.</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Género</label>
                <select value={pax.gender} onChange={e => update(i, 'gender', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="m">Masculino</option><option value="f">Femenino</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Nombre(s)</label>
                <input value={pax.given_name} onChange={e => update(i, 'given_name', e.target.value)} required placeholder="Juan" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Apellido(s)</label>
                <input value={pax.family_name} onChange={e => update(i, 'family_name', e.target.value)} required placeholder="Pérez" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Fecha de nacimiento <span style={{ color: '#fbbf24' }}>(18+ años)</span></label>
                <input type="date" value={pax.born_on} onChange={e => update(i, 'born_on', e.target.value)} required
                  max={(() => { const d = new Date(); d.setFullYear(d.getFullYear()-18); return d.toISOString().split('T')[0] })()}
                  style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Teléfono (+código país)</label>
                <input value={pax.phone_number} onChange={e => update(i, 'phone_number', e.target.value)} required placeholder="+56912345678" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Correo electrónico</label>
                <input type="email" value={pax.email} onChange={e => update(i, 'email', e.target.value)} required placeholder="juan@ejemplo.com" style={inp} />
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#fca5a5' }}>{error}</div>
        )}

        <button type="submit" disabled={loading}
          style={{ padding: '14px', fontSize: 15, fontWeight: 700, color: '#061027', background: loading ? 'rgba(74,222,128,.4)' : 'linear-gradient(135deg,#4ade80,#22c55e)', border: 'none', borderRadius: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Reservando...' : `Confirmar reserva · ${fmt_price(offer.total_amount, offer.total_currency)}`}
        </button>
      </form>
    </div>
  )
}

// ── Step 4: Success ───────────────────────────────────────────────────────────
function SuccessStep({ booking, onReset }) {
  return (
    <div style={{ ...GLASS, padding: 40, maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✅</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#eaf2ff' }}>¡Reserva confirmada!</h2>
      <p style={{ margin: '0 0 28px', fontSize: 14, color: '#8aa0cc' }}>Vuelo reservado exitosamente vía Duffel</p>

      <div style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#8aa0cc', textTransform: 'uppercase', letterSpacing: '.1em' }}>Código de reserva</p>
        <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 32, fontWeight: 800, color: '#38bdf8', letterSpacing: '.15em' }}>{booking.booking_reference}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, padding: '0 8px' }}>
        <div style={{ textAlign: 'left' }}>
          <p style={{ margin: '0 0 2px', fontSize: 11, color: '#8aa0cc' }}>ID de orden</p>
          <p style={{ margin: 0, fontSize: 11, color: '#aebfe2', fontFamily: 'monospace' }}>{booking.order_id?.slice(0, 20)}...</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0 0 2px', fontSize: 11, color: '#8aa0cc' }}>Total</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#7dd3fc' }}>{fmt_price(booking.total_amount || 0, booking.total_currency)}</p>
        </div>
      </div>

      <button onClick={onReset} style={{ padding: '12px 28px', fontSize: 14, fontWeight: 600, color: '#061027', background: '#38bdf8', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
        Buscar otro vuelo
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VuelosPrueba() {
  const [step, setStep] = useState('search')
  const [searchData, setSearchData] = useState(null)
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [booking, setBooking] = useState(null)

  const isSearch = step === 'search'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060d22 0%,#0a1628 60%,#06142e 100%)', fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(.5)}
        select option{background:#0a1628;color:#eaf2ff}
        @media(max-width:700px){.search-grid{grid-template-columns:1fr 1fr !important}}
        @media(max-width:420px){.search-grid{grid-template-columns:1fr !important}}
      `}</style>

      {!isSearch && (
        <div style={{ padding: '32px 20px 0' }}>
          <div style={{ maxWidth: 820, margin: '0 auto 24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 999, padding: '4px 14px', marginBottom: 14 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', letterSpacing: '.08em' }}>MODO PRUEBA · DUFFEL API</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px,4vw,34px)', fontWeight: 800, color: '#fff' }}>Vuelos ✈️</h1>
          </div>
        </div>
      )}

      <div style={isSearch ? {} : { padding: '0 20px 40px' }}>
        {step === 'search' && <SearchStep onResults={d => { setSearchData(d); setStep('results') }} />}
        {step === 'results' && searchData && <ResultsStep data={searchData} onSelect={o => { setSelectedOffer(o); setStep('passengers') }} onBack={() => setStep('search')} />}
        {step === 'passengers' && selectedOffer && <PassengerForm offer={selectedOffer} onBook={b => { setBooking(b); setStep('success') }} onBack={() => setStep('results')} />}
        {step === 'success' && booking && <SuccessStep booking={booking} onReset={() => { setStep('search'); setSearchData(null); setSelectedOffer(null); setBooking(null) }} />}
      </div>
    </div>
  )
}
