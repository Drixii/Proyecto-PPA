import { useState } from 'react'
import api from '../services/api'

const CABIN_OPTIONS = [
  { value: 'economy', label: 'Económica' },
  { value: 'premium_economy', label: 'Premium Económica' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'Primera Clase' },
]

const GLASS = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 20,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
}

function fmt_date(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmt_duration(iso_dur) {
  if (!iso_dur) return ''
  const m = iso_dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return iso_dur
  const h = m[1] || '0', min = m[2] || '00'
  return `${h}h ${min}m`
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

  const handleSearch = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const slices = [{ origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date: date }]
      if (roundTrip && returnDate) {
        slices.push({ origin: destination.toUpperCase(), destination: origin.toUpperCase(), departure_date: returnDate })
      }
      const res = await api.post('/flights/search', { slices, passengers: parseInt(passengers), cabin_class: cabin })
      onResults(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Error buscando vuelos. Verifica los códigos IATA.')
    } finally {
      setLoading(false)
    }
  }

  const inp = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#eaf2ff', padding: '12px 16px', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ ...GLASS, padding: 32, maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#38bdf8,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✈️</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#eaf2ff' }}>Buscar Vuelos</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Powered by Duffel · Modo prueba</p>
        </div>
      </div>

      {/* Round trip toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[false, true].map(rt => (
          <button key={String(rt)} onClick={() => setRoundTrip(rt)}
            style={{ padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: roundTrip === rt ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.06)', color: roundTrip === rt ? '#38bdf8' : '#8aa0cc', outline: roundTrip === rt ? '1px solid rgba(56,189,248,.4)' : 'none' }}>
            {rt ? 'Ida y vuelta' : 'Solo ida'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Origen (IATA)</label>
            <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="SCL" maxLength={3} required style={{ ...inp, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.1em' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Destino (IATA)</label>
            <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="BOG" maxLength={3} required style={{ ...inp, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.1em' }} />
          </div>
        </div>

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

        <button type="submit" disabled={loading}
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
      style={{ ...GLASS, padding: '20px 24px', cursor: 'pointer', transition: 'border-color .2s', border: '1px solid rgba(255,255,255,.08)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,.4)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        {/* Airline + route */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {sl?.airline_logo
            ? <img src={sl.airline_logo} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: '#fff', padding: 4 }} />
            : <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56,189,248,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✈️</div>
          }
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }}>{sl?.airline || 'Aerolínea'} · {sl?.flight_number}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{sl?.stops === 0 ? 'Directo' : `${sl?.stops} escala${sl?.stops > 1 ? 's' : ''}`} · {fmt_duration(sl?.duration)}</p>
          </div>
        </div>

        {/* Times */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, justifyContent: 'center', minWidth: 220 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: '#eaf2ff' }}>{sl?.origin}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{fmt_date(sl?.departure_at)}</p>
          </div>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.15)', position: 'relative', maxWidth: 80 }}>
            <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', fontSize: 13 }}>✈</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: '#eaf2ff' }}>{sl?.destination}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{fmt_date(sl?.arriving_at)}</p>
          </div>
        </div>

        {/* Price */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#7dd3fc', fontFamily: "'JetBrains Mono',monospace" }}>
            {offer.total_currency} {parseFloat(offer.total_amount).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>por persona</p>
          <button style={{ marginTop: 6, padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#061027', background: '#38bdf8', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Seleccionar
          </button>
        </div>
      </div>

      {/* Return slice if exists */}
      {offer.slices[1] && (() => {
        const sl2 = offer.slices[1]
        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#8aa0cc', fontWeight: 600 }}>VUELTA</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#aebfe2' }}>{sl2.origin} → {sl2.destination}</span>
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
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#8aa0cc', padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>← Volver</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#eaf2ff' }}>{offers.length} vuelos encontrados</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Ordenados por precio · Selecciona para reservar</p>
        </div>
      </div>
      {offers.length === 0
        ? <div style={{ ...GLASS, padding: 40, textAlign: 'center' }}><p style={{ color: '#8aa0cc' }}>No se encontraron vuelos para esta ruta y fecha.</p></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {offers.map(o => <OfferCard key={o.id} offer={o} onSelect={onSelect} />)}
          </div>
      }
    </div>
  )
}

// ── Step 3: Passenger form ────────────────────────────────────────────────────
function PassengerForm({ offer, onBook, onBack }) {
  const passengerCount = offer.passengers?.length || 1
  const emptyPax = { title: 'mr', given_name: '', family_name: '', born_on: '', gender: 'm', email: '', phone_number: '' }
  const [paxList, setPaxList] = useState(Array.from({ length: passengerCount }, () => ({ ...emptyPax })))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const updatePax = (i, field, value) => {
    setPaxList(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  const handleBook = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const passengers = paxList.map((p, i) => ({
        ...p,
        id: offer.passengers[i]?.id,
      }))
      const res = await api.post('/flights/book', {
        offer_id: offer.id,
        passengers,
        currency: offer.total_currency,
        amount: offer.total_amount,
      })
      onBook(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al reservar. Verifica los datos.')
    } finally {
      setLoading(false)
    }
  }

  const inp = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#eaf2ff', padding: '10px 14px', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const sl = offer.slices[0]

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#8aa0cc', padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>← Volver</button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#eaf2ff' }}>Datos de pasajeros</h2>
      </div>

      {/* Selected flight summary */}
      <div style={{ ...GLASS, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }}>{sl?.origin} → {sl?.destination}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>{sl?.airline} · {sl?.stops === 0 ? 'Directo' : `${sl?.stops} escala(s)`} · {fmt_duration(sl?.duration)}</p>
        </div>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#7dd3fc', fontFamily: "'JetBrains Mono',monospace" }}>
          {offer.total_currency} {parseFloat(offer.total_amount).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
        </p>
      </div>

      <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {paxList.map((pax, i) => (
          <div key={i} style={{ ...GLASS, padding: 24 }}>
            <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Pasajero {i + 1}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Tratamiento</label>
                <select value={pax.title} onChange={e => updatePax(i, 'title', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="mr">Sr.</option>
                  <option value="ms">Sra.</option>
                  <option value="mrs">Sra. (casada)</option>
                  <option value="miss">Srta.</option>
                  <option value="dr">Dr.</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Género</label>
                <select value={pax.gender} onChange={e => updatePax(i, 'gender', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="m">Masculino</option>
                  <option value="f">Femenino</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Nombre(s)</label>
                <input value={pax.given_name} onChange={e => updatePax(i, 'given_name', e.target.value)} required placeholder="Juan" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Apellido(s)</label>
                <input value={pax.family_name} onChange={e => updatePax(i, 'family_name', e.target.value)} required placeholder="Pérez" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Fecha de nacimiento</label>
                <input type="date" value={pax.born_on} onChange={e => updatePax(i, 'born_on', e.target.value)} required style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Teléfono (con código país)</label>
                <input value={pax.phone_number} onChange={e => updatePax(i, 'phone_number', e.target.value)} required placeholder="+56912345678" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 11, color: '#8aa0cc', marginBottom: 5 }}>Correo electrónico</label>
                <input type="email" value={pax.email} onChange={e => updatePax(i, 'email', e.target.value)} required placeholder="juan@ejemplo.com" style={inp} />
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#fca5a5' }}>
            {typeof error === 'string' ? error : JSON.stringify(error)}
          </div>
        )}

        <button type="submit" disabled={loading}
          style={{ padding: '14px', fontSize: 15, fontWeight: 700, color: '#061027', background: loading ? 'rgba(74,222,128,.4)' : 'linear-gradient(135deg,#4ade80,#22c55e)', border: 'none', borderRadius: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Reservando...' : `Confirmar reserva · ${offer.total_currency} ${parseFloat(offer.total_amount).toLocaleString('es-CL', { minimumFractionDigits: 2 })}`}
        </button>
      </form>
    </div>
  )
}

// ── Step 4: Success ───────────────────────────────────────────────────────────
function SuccessStep({ booking, onReset }) {
  return (
    <div style={{ ...GLASS, padding: 40, maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(74,222,128,.15)', border: '1px solid rgba(74,222,128,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✅</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#eaf2ff' }}>¡Reserva confirmada!</h2>
      <p style={{ margin: '0 0 28px', fontSize: 14, color: '#8aa0cc' }}>Tu vuelo ha sido reservado exitosamente vía Duffel</p>

      <div style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#8aa0cc', textTransform: 'uppercase', letterSpacing: '.1em' }}>Código de reserva</p>
        <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 800, color: '#38bdf8', letterSpacing: '.15em' }}>{booking.booking_reference}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, padding: '0 8px' }}>
        <div style={{ textAlign: 'left' }}>
          <p style={{ margin: '0 0 2px', fontSize: 11, color: '#8aa0cc' }}>ID de orden</p>
          <p style={{ margin: 0, fontSize: 12, color: '#aebfe2', fontFamily: 'monospace' }}>{booking.order_id?.slice(0, 24)}...</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0 0 2px', fontSize: 11, color: '#8aa0cc' }}>Total pagado</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#7dd3fc' }}>{booking.total_currency} {parseFloat(booking.total_amount || 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <button onClick={onReset}
        style={{ padding: '12px 28px', fontSize: 14, fontWeight: 600, color: '#061027', background: '#38bdf8', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
        Buscar otro vuelo
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VuelosPrueba() {
  const [step, setStep] = useState('search') // search | results | passengers | success
  const [searchData, setSearchData] = useState(null)
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [booking, setBooking] = useState(null)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060d22 0%,#0a1628 60%,#06142e 100%)', padding: '40px 20px', fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ maxWidth: 800, margin: '0 auto 32px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 999, padding: '4px 14px', marginBottom: 16 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', letterSpacing: '.08em' }}>MODO PRUEBA · DUFFEL API</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, color: '#fff', letterSpacing: '-.02em' }}>
          Vuelos ✈️
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8aa0cc' }}>
          Busca y reserva vuelos reales usando la API de Duffel
        </p>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}`}</style>

      {step === 'search' && (
        <SearchStep onResults={data => { setSearchData(data); setStep('results') }} />
      )}
      {step === 'results' && searchData && (
        <ResultsStep
          data={searchData}
          onSelect={offer => { setSelectedOffer(offer); setStep('passengers') }}
          onBack={() => setStep('search')}
        />
      )}
      {step === 'passengers' && selectedOffer && (
        <PassengerForm
          offer={selectedOffer}
          onBook={b => { setBooking(b); setStep('success') }}
          onBack={() => setStep('results')}
        />
      )}
      {step === 'success' && booking && (
        <SuccessStep
          booking={booking}
          onReset={() => { setStep('search'); setSearchData(null); setSelectedOffer(null); setBooking(null) }}
        />
      )}
    </div>
  )
}
