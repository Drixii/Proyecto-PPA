import { useState, useRef, useEffect } from 'react'
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

// ── Airport selector ──────────────────────────────────────────────────────────
function AirportPicker({ label, value, onChange, exclude }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = AIRPORTS.filter(a =>
    a.iata !== exclude &&
    (search === '' ||
      a.city.toLowerCase().includes(search.toLowerCase()) ||
      a.country.toLowerCase().includes(search.toLowerCase()) ||
      a.iata.toLowerCase().includes(search.toLowerCase()))
  )

  const selected = AIRPORTS.find(a => a.iata === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</label>
      <button type="button" onClick={() => { setOpen(v => !v); setSearch('') }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#eaf2ff', padding: '12px 16px', fontSize: 14, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box' }}>
        {selected ? (
          <>
            <img src={flag(selected.iso2)} alt="" style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>{selected.iata}</span>
            <span style={{ flex: 1, fontSize: 13, color: '#aebfe2' }}>{selected.city}</span>
          </>
        ) : (
          <span style={{ color: '#8aa0cc' }}>Seleccionar aeropuerto...</span>
        )}
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 300, background: 'rgba(10,20,52,.98)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.7)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ciudad o código..."
              style={{ width: '100%', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#eaf2ff', padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <p style={{ textAlign: 'center', color: '#8aa0cc', fontSize: 13, padding: '16px 0' }}>Sin resultados</p>
              : filtered.map(a => (
                <button key={a.iata} type="button"
                  onClick={() => { onChange(a.iata); setOpen(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: value === a.iata ? 'rgba(56,189,248,.12)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <img src={flag(a.iso2)} alt="" style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#38bdf8', width: 36, flexShrink: 0 }}>{a.iata}</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#eaf2ff' }}>{a.city}</span>
                  <span style={{ fontSize: 11, color: '#8aa0cc' }}>{a.country}</span>
                  {value === a.iata && <span style={{ color: '#38bdf8' }}>✓</span>}
                </button>
              ))
            }
          </div>
        </div>
      )}
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
    if (!origin || !destination || !date) return
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

  return (
    <div style={{ ...GLASS, padding: 32, maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#38bdf8,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✈️</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#eaf2ff' }}>Buscar Vuelos</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Powered by Duffel · Modo prueba</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[false, true].map(rt => (
          <button key={String(rt)} type="button" onClick={() => setRoundTrip(rt)}
            style={{ padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: roundTrip === rt ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.06)', color: roundTrip === rt ? '#38bdf8' : '#8aa0cc', outline: roundTrip === rt ? '1px solid rgba(56,189,248,.4)' : 'none' }}>
            {rt ? 'Ida y vuelta' : 'Solo ida'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Origin / Destination con botón swap */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <AirportPicker label="Origen" value={origin} onChange={setOrigin} exclude={destination} />
          <button type="button" onClick={() => { const t = origin; setOrigin(destination); setDestination(t) }}
            style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 10, width: 32, height: 32, borderRadius: '50%', background: 'rgba(56,189,248,.2)', border: '1px solid rgba(56,189,248,.4)', color: '#38bdf8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ⇄
          </button>
          <AirportPicker label="Destino" value={destination} onChange={setDestination} exclude={origin} />
        </div>

        {/* Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: roundTrip ? '1fr 1fr' : '1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Fecha de ida</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
          </div>
          {roundTrip && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Fecha de vuelta</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} required style={inp} />
            </div>
          )}
        </div>

        {/* Pasajeros + Cabina */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Pasajeros</label>
            <select value={passengers} onChange={e => setPassengers(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'pasajero' : 'pasajeros'}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Cabina</label>
            <select value={cabin} onChange={e => setCabin(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {CABIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading || !origin || !destination || !date}
          style={{ padding: '14px', fontSize: 15, fontWeight: 700, color: '#061027', background: loading ? 'rgba(56,189,248,.4)' : 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none', borderRadius: 14, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}>
          {loading ? 'Buscando vuelos...' : 'Buscar vuelos →'}
        </button>
      </form>
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
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Fecha de nacimiento</label>
                <input type="date" value={pax.born_on} onChange={e => update(i, 'born_on', e.target.value)} required style={inp} />
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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060d22 0%,#0a1628 60%,#06142e 100%)', padding: '40px 20px', fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}} input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(.5)} select option{background:#0a1628;color:#eaf2ff}`}</style>

      <div style={{ maxWidth: 820, margin: '0 auto 32px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 999, padding: '4px 14px', marginBottom: 16 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', letterSpacing: '.08em' }}>MODO PRUEBA · DUFFEL API</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(22px,4vw,34px)', fontWeight: 800, color: '#fff' }}>Vuelos ✈️</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8aa0cc' }}>Busca y reserva vuelos reales con Duffel</p>
      </div>

      {step === 'search' && <SearchStep onResults={d => { setSearchData(d); setStep('results') }} />}
      {step === 'results' && searchData && <ResultsStep data={searchData} onSelect={o => { setSelectedOffer(o); setStep('passengers') }} onBack={() => setStep('search')} />}
      {step === 'passengers' && selectedOffer && <PassengerForm offer={selectedOffer} onBook={b => { setBooking(b); setStep('success') }} onBack={() => setStep('results')} />}
      {step === 'success' && booking && <SuccessStep booking={booking} onReset={() => { setStep('search'); setSearchData(null); setSelectedOffer(null); setBooking(null) }} />}
    </div>
  )
}
