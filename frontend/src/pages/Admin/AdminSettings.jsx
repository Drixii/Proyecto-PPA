import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import CountriesManager from './CountriesManager'
import api from '../../services/api'
import { Bandera } from '../../utils/flags'

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: '22px',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.08)',
}
const INP = {
  background: 'rgba(6,13,40,.8)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 10,
  color: '#eaf2ff',
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
// Respaldo por moneda, para los sitios que solo conocen la divisa. Faltaban
// media docena —Bolivia salía sin bandera— y el euro apuntaba a España.
const ISO2 = {
  CLP:'cl', COP:'co', USD:'us', EUR:'eu', PEN:'pe', BRL:'br', MXN:'mx',
  ARS:'ar', CAD:'ca', VES:'ve', BOB:'bo', PYG:'py', UYU:'uy', CRC:'cr',
  DOP:'do', GTQ:'gt', CNY:'cn', JPY:'jp', GBP:'gb',
}
const flag = cur => ISO2[cur] ? `https://flagcdn.com/20x15/${ISO2[cur]}.png` : null

function FlagImg({ cur, size = 20, iso2 }) {
  // iso2 explícito si se conoce; si no, el mapa por moneda. Ese mapa estaba
  // escrito a mano y no tenía todas: Bolivia salía sin bandera.
  return <Bandera iso2={iso2 || ISO2[cur]} ancho={size} alto={Math.round(size * 0.75)} />
}

// Varios países comparten divisa (el dólar lo usan EE.UU., Ecuador y Panamá).
// La comisión se guarda por moneda, así que la comparten; pero cada país se
// pinta con su bandera y su nombre, o los que comparten divisa desaparecían de
// la pantalla y no había forma de saber que su ruta estaba cubierta.
function BanderasDe({ paises, size = 18 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {paises.map(p => <Bandera key={p.name} iso2={p.iso2} ancho={size} alto={Math.round(size * 0.75)} />)}
    </span>
  )
}

function fmt(n, cur) {
  if (n == null || isNaN(n)) return '—'
  const isInt = ['CLP','COP','VES','ARS'].includes(cur)
  return isInt
    ? Math.round(n).toLocaleString('es-CL')
    : Number(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

const SRC_STYLE = {
  mine:               { color: '#38bdf8', label: 'Tuya' },
  global_rule:        { color: '#a78bfa', label: 'Global' },
  from_default_mine:  { color: '#fb923c', label: 'Base país (tuya)' },
  from_default_global:{ color: '#facc15', label: 'Base país (global)' },
  default:            { color: '#8aa0cc', label: 'Defecto' },
}

// ── Currency Popup (portal — encima de todo) ──────────────────────────────────
function CurrencyPopup({ label, value, onChange, options, ratesFrom }) {
  const [open, setOpen] = useState(false)
  const sel = options.find(o => o.cur === value)

  const modal = open && createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(8,17,48,.98)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,.9)', width: 360, maxWidth: '92vw', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#eaf2ff' }}>Seleccionar {label.toLowerCase()}</span>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#8aa0cc', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        {/* Options */}
        <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
          {options.map(o => (
            <button key={o.cur} type="button"
              onClick={() => { onChange(o.cur); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', background: value === o.cur ? 'rgba(56,189,248,.1)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}
              onMouseEnter={e => { if (value !== o.cur) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
              onMouseLeave={e => { if (value !== o.cur) e.currentTarget.style.background = 'transparent' }}>
              <FlagImg cur={o.cur} iso2={o.iso2} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#eaf2ff' }}>{o.cur}</span>
                  <span style={{ fontSize: 12, color: '#8aa0cc' }}>{o.label}</span>
                </div>
                {o.rate != null && ratesFrom && (
                  <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>
                    1 {ratesFrom} = {fmt(o.rate, o.moneda || o.cur)} {o.moneda || o.cur}
                  </span>
                )}
              </div>
              {value === o.cur && (
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(56,189,248,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontSize: 11, flexShrink: 0 }}>✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</label>
      <button type="button" onClick={() => setOpen(true)}
        style={{ ...INP, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', overflow: 'hidden' }}>
        {sel && <FlagImg cur={sel.cur} iso2={sel.iso2} size={22} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: '#eaf2ff' }}>{sel?.cur}</span>
          {sel?.rate != null && ratesFrom ? (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              1 {ratesFrom} = {fmt(sel.rate, sel.moneda || sel.cur)} {sel.moneda || sel.cur}
            </span>
          ) : (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#8aa0cc', whiteSpace: 'nowrap' }}>{sel?.label}</span>
          )}
        </div>
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="2.5" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>
      {modal}
    </div>
  )
}

// ── Live Rate Tester (PRIMERO) ────────────────────────────────────────────────
// Monedas sin céntimos: mostrar "1.000,00 CLP" es ruido, nadie escribe pesos
// con decimales.
const MONEDAS_ENTERAS = ['CLP', 'COP', 'VES', 'ARS', 'PYG', 'CRC', 'GTQ', 'JPY']

// Miles con punto mientras se escribe, al estilo chileno. El campo era texto
// crudo, así que un monto largo se leía "1500000" y había que contar ceros con
// el dedo para saber si eran uno o diez millones.
function formateaMonto(valor, moneda) {
  const soloDigitos = String(valor ?? '').replace(/\D/g, '')
  if (!soloDigitos) return ''
  const n = parseInt(soloDigitos, 10)
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: MONEDAS_ENTERAS.includes(moneda) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(n)
}

const montoANumero = (valor) => parseInt(String(valor ?? '').replace(/\D/g, ''), 10) || 0

function RateTester({ commData }) {
  const currencies = commData?.from_currencies || commData?.currencies || []
  const labels = commData?.labels || {}
  const [fromCur, setFromCur] = useState('Chile')
  const [toCur, setToCur]   = useState('Colombia')
  const [amount, setAmount] = useState('100.000')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  // Live rates for the selected from currency
  const { data: ratesData } = useQuery({
    queryKey: ['admin-all-rates', fromCur],
    queryFn: () => api.get('/admin/commissions/all-rates', {
      params: { from_currency: (commData?.paises || []).find(p => p.name === fromCur)?.currency },
    }).then(r => r.data.data),
    enabled: !!fromCur && !!(commData?.paises || []).length,
  })

  useEffect(() => {
    if (fromCur === toCur) {
      const next = (commData?.paises || []).find(p => p.can_receive && p.name !== fromCur)?.name
      if (next) setToCur(next)
    }
    setResult(null)
  }, [fromCur])

  // Por PAÍS y no por moneda: Ecuador y Estados Unidos comparten el dólar pero
  // pueden tener comisiones distintas, así que simular "USD" no decía cuál de
  // los dos. Origen solo los que envían, destino solo los que reciben — simular
  // una ruta que el sistema no deja crear no sirve de nada.
  const paisesSim = commData?.paises || []
  const paisOrigen = paisesSim.find(p => p.name === fromCur)
  const paisDestino = paisesSim.find(p => p.name === toCur)
  const fromOptions = paisesSim.filter(p => p.can_send)
    .map(p => ({ cur: p.name, label: `${p.name} (${p.currency})`, iso2: p.iso2, moneda: p.currency, rate: null }))
  const toOptions = paisesSim.filter(p => p.can_receive && p.name !== fromCur)
    .map(p => ({ cur: p.name, label: `${p.name} (${p.currency})`, iso2: p.iso2, moneda: p.currency, rate: ratesData?.[p.currency] ?? null }))

  const handleCalc = async () => {
    const amt = montoANumero(amount)
    if (!amt || fromCur === toCur) return
    setLoading(true)
    try {
      const r = await api.get('/admin/commissions/preview', {
        params: {
          from_currency: paisOrigen?.currency, to_currency: paisDestino?.currency,
          from_country: fromCur, to_country: toCur, amount: amt,
        },
      })
      setResult(r.data.data)
    } catch { setResult(null) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ ...GLASS, padding: '24px 28px', position: 'relative', zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(74,222,128,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📊</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Simulador de tasas en tiempo real</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Prueba cualquier ruta con tu comisión aplicada</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
        <CurrencyPopup label="Desde" value={fromCur} onChange={setFromCur} options={fromOptions} ratesFrom={null} />
        <CurrencyPopup label="Hacia" value={toCur} onChange={setToCur} options={toOptions} ratesFrom={paisOrigen?.currency} />
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Monto a enviar</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={amount}
              onChange={e => setAmount(formateaMonto(e.target.value, fromCur))}
              inputMode="numeric"
              placeholder="100.000"
              style={{ ...INP, flex: 1 }} />
            <button onClick={handleCalc} disabled={loading}
              style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#4ade80,#22c55e)', border: 'none', borderRadius: 10, color: '#061027', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {loading ? '...' : 'Calcular'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
          {[
            { label: 'Tasa de cambio', val: result.rate ? `1 ${fromCur} = ${fmt(result.rate, toCur)} ${toCur}` : '—', color: '#38bdf8' },
            { label: 'Comisión aplicada', val: `${result.commission_pct?.toFixed(2)}%`, color: '#fbbf24' },
            { label: `Comisión (${fromCur})`, val: `${fmt(result.fee, fromCur)}`, color: '#f87171' },
            { label: `Neto a cambiar`, val: `${fmt(result.net_amount, fromCur)} ${fromCur}`, color: '#aebfe2' },
            { label: `Cliente recibe`, val: result.amount_received != null ? `${fmt(result.amount_received, toCur)} ${toCur}` : '—', color: '#4ade80' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ margin: '0 0 3px', fontSize: 11, color: '#8aa0cc' }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: item.color, fontFamily: 'monospace' }}>{item.val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Commission Matrix ─────────────────────────────────────────────────────────
function CommissionMatrix({ data, onSaved }) {
  const qc = useQueryClient()
  const [fromCur, setFromCur] = useState('CLP')
  const [editMap, setEditMap] = useState({})
  const [applyAll, setApplyAll] = useState({})
  const [saving, setSaving] = useState({})
  const [msgs, setMsgs] = useState({})
  const [baseEdit, setBaseEdit] = useState('')
  const [baseSaving, setBaseSaving] = useState(false)
  const [baseMsg, setBaseMsg] = useState('')

  const currencies = data?.currencies || []
  const flags_data = data?.flags || {}
  const labels = data?.labels || {}
  const matrix = data?.matrix || []
  const myFromDefaults = data?.my_from_defaults || {}
  const globalFromDefaults = data?.global_from_defaults || {}
  const globalDefault = data?.global_default ?? 1.5

  // Origen y destino son listas distintas: un país puede recibir sin enviar
  // —Ecuador, Venezuela, Panamá— y salía como origen de rutas que nadie puede
  // usar. Las manda el backend desde los países dados de alta.
  // Una entrada por PAÍS, no por moneda: Ecuador, Estados Unidos y Panamá son
  // rutas distintas aunque compartan el dólar, y cada una lleva su comisión.
  const paises = data?.paises || []
  const origenes = paises.filter(p => p.can_send)
  // Venezuela no envía, así que nunca sale como origen, pero es a donde va casi
  // todo: tiene su propia pestaña para ver de un vistazo quién le manda y a
  // cuánto. Ahí no hay comisiones que tocar —esas viven en la ruta de cada
  // país que envía—, solo el cartel.
  const receptor = paises.find(p => p.name === 'Venezuela' && p.can_receive && !p.can_send)
  const soloRecibe = fromCur === RECIBE
  const origen = soloRecibe ? receptor : (origenes.find(p => p.name === fromCur) || origenes[0])
  const destinations = paises.filter(p => p.can_receive && p.name !== origen?.name)

  const getRow = (paisOrigen, paisDestino) =>
    matrix.find(r => r.from_country === paisOrigen && r.to_country === paisDestino)
  const k = (paisOrigen, paisDestino) => `${paisOrigen}_${paisDestino}`

  // Base % for current from currency
  // La base es de la MONEDA, no del país: desde que las pestañas son países,
  // buscarla por `fromCur` preguntaba por "Bolivia" en una tabla con la clave
  // "BOB", así que se guardaba bien y al volver salía el valor por defecto.
  const monedaOrigen = origen?.currency
  const currentBase = myFromDefaults[monedaOrigen] ?? globalFromDefaults[monedaOrigen] ?? globalDefault
  const baseSource  = monedaOrigen in myFromDefaults
    ? 'mine'
    : (monedaOrigen in globalFromDefaults ? 'global' : 'default')

  useEffect(() => { setBaseEdit('') }, [fromCur])

  const handleEdit = (tc, val) => setEditMap(m => ({ ...m, [k(fromCur, tc)]: val }))

  const showMsg = (key, txt) => {
    setMsgs(m => ({ ...m, [key]: txt }))
    setTimeout(() => setMsgs(m => { const n = {...m}; delete n[key]; return n }), 2500)
  }

  const handleSaveRow = async (destino) => {
    const key = k(origen?.name, destino.name)
    const pct = parseFloat(editMap[key])
    if (isNaN(pct) || pct < 0 || pct > 100) return
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await api.put('/admin/commissions', {
        from_currency: origen.currency, to_currency: destino.currency,
        from_country: origen.name, to_country: destino.name,
        commission_pct: pct, apply_to_all: applyAll[key] || false,
      })
      setEditMap(m => { const n = {...m}; delete n[key]; return n })
      showMsg(key, '✓ Guardado')
      qc.invalidateQueries({ queryKey: ['admin-commissions'] })
      onSaved()
    } catch { showMsg(key, '✗ Error') }
    finally { setSaving(s => ({ ...s, [key]: false })) }
  }

  const handleReset = async (tc) => {
    const key = k(fromCur, tc)
    try {
      await api.delete('/admin/commissions', { data: { from_currency: fromCur, to_currency: tc } })
      showMsg(key, '↩ Reseteado')
      qc.invalidateQueries({ queryKey: ['admin-commissions'] })
      onSaved()
    } catch {}
  }

  const handleSaveBase = async () => {
    const pct = parseFloat(baseEdit)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    setBaseSaving(true)
    try {
      await api.put('/admin/commissions', { from_currency: origen.currency, to_currency: '*', commission_pct: pct, apply_to_all: false })
      setBaseEdit('')
      setBaseMsg('✓ Base guardada')
      setTimeout(() => setBaseMsg(''), 2500)
      qc.invalidateQueries({ queryKey: ['admin-commissions'] })
      onSaved()
    } catch { setBaseMsg('✗ Error') }
    finally { setBaseSaving(false) }
  }

  const countryName = cur => (labels[cur] || cur).replace(/ \(.*\)/, '')

  return (
    <div style={{ ...GLASS, padding: '24px 28px', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(129,140,248,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="19" height="19" fill="none" viewBox="0 0 24 24" stroke="#818cf8" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z"/></svg>
          </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Comisiones por ruta</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>
            Elige desde qué país envía el cliente y pon la comisión de cada destino
          </p>
        </div>
      </div>

      {/* FROM tabs — solo las que pueden enviar, más la de Venezuela recibe */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {receptor && (
          <button onClick={() => setFromCur(RECIBE)}
            style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 6,
              background: soloRecibe ? 'rgba(250,204,21,.18)' : 'rgba(255,255,255,.06)',
              color: soloRecibe ? '#fde68a' : '#8aa0cc',
              outline: soloRecibe ? '1px solid rgba(250,204,21,.45)' : 'none' }}>
            <Bandera iso2={receptor.iso2} ancho={16} alto={12} />
            <span>{receptor.name}</span>
            <span style={{ fontSize: 11, opacity: .8 }}>(recibe)</span>
          </button>
        )}
        {origenes.map(p => (
          <button key={p.name} onClick={() => setFromCur(p.name)}
            style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 6,
              background: origen?.name === p.name ? 'rgba(56,189,248,.18)' : 'rgba(255,255,255,.06)',
              color: origen?.name === p.name ? '#eaf2ff' : '#8aa0cc',
              outline: origen?.name === p.name ? '1px solid rgba(56,189,248,.4)' : 'none' }}>
            <Bandera iso2={p.iso2} ancho={16} alto={12} />
            <span>{p.name}</span>
            <span style={{ fontSize: 11, opacity: .7 }}>{p.currency}</span>
          </button>
        ))}
      </div>

      {soloRecibe ? (
        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#8aa0cc', lineHeight: 1.7 }}>
          Aquí solo se ve el cartel de lo que <strong>llega</strong> a {receptor?.name}: una fila
          por país que le envía, con la tasa de esa ruta. Las comisiones se ponen en la
          pestaña del país que envía.
        </p>
      ) : (<>
      {/* Per-country base commission */}
      <div style={{ background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.15)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Bandera iso2={origen?.iso2} ancho={20} alto={15} />
          <span style={{ fontSize: 13, color: '#aebfe2' }}>
            Comisión base para <strong style={{ color: '#eaf2ff' }}>{origen?.currency}</strong>
            <span style={{ color: '#8aa0cc' }}> (toda la moneda)</span>:
          </span>
          <span style={{ fontWeight: 700, color: SRC_STYLE[baseSource === 'mine' ? 'from_default_mine' : baseSource === 'global' ? 'from_default_global' : 'default'].color }}>
            {currentBase.toFixed(2)}%
          </span>
          <span style={{ fontSize: 10, color: '#8aa0cc', background: 'rgba(255,255,255,.06)', padding: '2px 7px', borderRadius: 4 }}>
            {baseSource === 'mine' ? 'Tuya' : baseSource === 'global' ? 'Global' : 'Defecto sistema'}
          </span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 100 }}>
              <input type="number" value={baseEdit} onChange={e => setBaseEdit(e.target.value)}
                placeholder={currentBase.toFixed(2)} min="0" max="100" step="0.01"
                style={{ ...INP, width: 100, paddingRight: 26, fontSize: 13 }} />
              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#8aa0cc', fontSize: 11 }}>%</span>
            </div>
            <button onClick={handleSaveBase} disabled={!baseEdit || baseSaving}
              style={{ padding: '8px 16px', borderRadius: 9, border: 'none', cursor: baseEdit ? 'pointer' : 'not-allowed',
                background: baseEdit ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'rgba(255,255,255,.06)',
                color: baseEdit ? '#fff' : '#8aa0cc', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
              {baseSaving ? '...' : 'Guardar base'}
            </button>
            {baseMsg && <span style={{ fontSize: 12, color: baseMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>{baseMsg}</span>}
          </div>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#8aa0cc', lineHeight: 1.6 }}>
          Es la comisión por defecto para envíos desde <strong>{countryName(fromCur)}</strong>.
          Se cobra cuando el destino no tiene su propio % en la tabla de abajo — así no hace falta
          rellenar país por país: pones una base y solo tocas las excepciones.
        </p>
      </div>

      {/* Destination table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(4,10,30,.6)' }}>
              {['Destino', 'Comisión actual', 'Nueva %', 'Acciones'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, fontWeight: 600, color: '#8aa0cc', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {destinations.map(destino => {
              const tc = destino.name
              const row = getRow(origen?.name, destino.name)
              const key = k(origen?.name, destino.name)
              const edited = editMap[key] !== undefined
              const src = row?.source || 'default'
              const srcStyle = SRC_STYLE[src] || SRC_STYLE.default
              const hasOwn = row?.my_pct != null

              return (
                <tr key={tc} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  {/* Destino */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Bandera iso2={destino.iso2} ancho={18} alto={13} />
                      <span style={{ color: '#eaf2ff', fontWeight: 600 }}>{destino.name}</span>
                      <span style={{ fontSize: 12, color: '#8aa0cc' }}>{destino.currency}</span>
                    </div>
                  </td>
                  {/* Actual */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: srcStyle.color }}>{row?.effective_pct?.toFixed(2) ?? globalDefault.toFixed(2)}%</span>
                    <span style={{ marginLeft: 6, fontSize: 10, color: srcStyle.color, background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>{srcStyle.label}</span>
                  </td>
                  {/* Input + casilla "aplicar a todos", que solo aparece
                      cuando hay algo escrito: antes era una columna siempre
                      visible y se pulsaba esperando que hiciera algo por sí
                      sola, cuando en realidad solo modifica el Guardar. */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ position: 'relative', width: 118 }}>
                      <input type="number" value={edited ? editMap[key] : ''} placeholder={row?.effective_pct?.toFixed(2) ?? '1.50'}
                        onChange={e => handleEdit(tc, e.target.value)} min="0" max="100" step="0.01"
                        style={{ ...INP, width: 118, paddingRight: 26, fontSize: 13 }} />
                      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#8aa0cc', fontSize: 11 }}>%</span>
                    </div>
                    {edited && editMap[key] !== '' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={!!applyAll[key]}
                          onChange={() => setApplyAll(a => ({ ...a, [key]: !a[key] }))}
                          style={{ width: 14, height: 14, accentColor: '#3b82f6', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11, color: applyAll[key] ? '#a78bfa' : '#8aa0cc', lineHeight: 1.3 }}>
                          Aplicar a todos los destinos
                        </span>
                      </label>
                    )}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => handleSaveRow(destino)} disabled={!edited || saving[key]}
                        style={{ padding: '5px 14px', borderRadius: 8, border: 'none', cursor: edited ? 'pointer' : 'not-allowed',
                          background: edited ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'rgba(255,255,255,.06)',
                          color: edited ? '#fff' : '#8aa0cc', fontWeight: 600, fontSize: 12 }}>
                        {saving[key] ? '...' : 'Guardar'}
                      </button>
                      {hasOwn && (
                        <button onClick={() => handleReset(tc)}
                          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.07)', color: '#f87171', fontSize: 12, cursor: 'pointer' }} title="Resetear a base">
                          ↩
                        </button>
                      )}
                      {msgs[key] && <span style={{ fontSize: 11, color: msgs[key].startsWith('✓') || msgs[key].startsWith('↩') ? '#4ade80' : '#f87171' }}>{msgs[key]}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </>)}

      {/* Imagen para compartir: una fila por país del listado, con la
          comisión de cada ruta ya descontada. */}
      <ImagenDeTasas origen={origen} sentido={soloRecibe ? 'recibe' : 'envia'} />

      {/* Legend */}
      <div hidden={soloRecibe} style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: '#8aa0cc' }}>
        {Object.entries(SRC_STYLE).map(([k, v]) => (
          <span key={k}><span style={{ color: v.color }}>●</span> {v.label}</span>
        ))}
        <span>↩ = borrar regla específica</span>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Secciones ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    key: 'tasas',
    icon: '📈',
    title: 'Tasas y comisiones',
    desc: 'Comisión por ruta, países disponibles y simulador de tasas',
  },
  {
    key: 'pagos',
    icon: '💳',
    title: 'Integraciones de pago',
    desc: 'Stripe para tarjeta, Koywe para Chile, Global66 para transferencias',
  },
  {
    key: 'correo',
    icon: '✉️',
    title: 'Correo',
    desc: 'Servidor de envío y verificación del correo de los clientes',
  },
]

function SectionCard({ icon, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...GLASS, padding: '22px 20px 20px', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12, width: '100%',
        minHeight: 152, transition: 'background .15s, transform .15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(56,189,248,.07)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <span style={{
        width: 44, height: 44, borderRadius: 14, fontSize: 22, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.15)',
      }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>{title}</p>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8aa0cc', lineHeight: 1.5 }}>{desc}</p>
      </div>
    </button>
  )
}

function StripeKeysForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ secret_key: '', publishable_key: '', webhook_secret: '', connect_webhook_secret: '' })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(false)

  const { data: claves } = useQuery({
    queryKey: ['stripe-keys'],
    queryFn: () => api.get('/payments/stripe/keys').then(r => r.data.data),
  })

  const cambiarModo = useMutation({
    mutationFn: (modo) => api.put('/payments/stripe/mode', { modo }),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      qc.invalidateQueries({ queryKey: ['stripe-keys'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      qc.invalidateQueries({ queryKey: ['stripe-account'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => setError(e.response?.data?.detail || 'No se pudo cambiar de modo'),
  })

  const guardar = useMutation({
    mutationFn: (body) => api.put('/payments/stripe/keys', body),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      setForm({ secret_key: '', publishable_key: '', webhook_secret: '', connect_webhook_secret: '' })
      qc.invalidateQueries({ queryKey: ['stripe-keys'] })
      qc.invalidateQueries({ queryKey: ['stripe-account'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo guardar'); setMsg('') },
  })

  const campos = [
    { k: 'secret_key', label: 'Clave secreta', ph: 'sk_test_...', actual: claves?.secret_key },
    { k: 'publishable_key', label: 'Clave publicable', ph: 'pk_test_...', actual: claves?.publishable_key },
    { k: 'webhook_secret', label: 'Secreto del webhook', ph: 'whsec_...', actual: claves?.webhook_secret },
    { k: 'connect_webhook_secret', label: 'Secreto del webhook de Connect', ph: 'whsec_... (opcional)', actual: claves?.connect_webhook_secret },
  ]

  const hayAlgo = Object.values(form).some(v => v.trim())

  return (
    <div style={{ ...GLASS, padding: '20px 24px' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ textAlign: 'left' }}>
          {/* El modo va en la cabecera, no solo dentro: el interruptor vive tras
              un acordeon cerrado y con dos tarjetas llamadas "Stripe" y "Claves
              de Stripe" nadie encontraba donde se cambia de prueba a real. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Claves de Stripe</h3>
            {claves?.modo && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: claves.modo === 'test' ? 'rgba(251,191,36,.12)' : 'rgba(74,222,128,.12)',
                color: claves.modo === 'test' ? '#fcd34d' : '#4ade80',
              }}>
                {claves.modo === 'test' ? 'Modo prueba' : 'Modo real'}
              </span>
            )}
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            {claves?.listo
              ? 'Cobrando con las claves de este modo'
              : claves?.secret_key
                ? 'Falta el secreto del webhook — el pago con tarjeta sigue oculto'
                : 'Sin configurar — el pago con tarjeta está oculto para los clientes'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#64748b' }}>
            {abierto ? 'Aquí dentro se cambia entre prueba y real' : 'Abre para pegar las claves o cambiar de modo'}
          </p>
        </div>
        <span style={{ fontSize: 18, color: '#475569' }}>{abierto ? '⌄' : '›'}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: 4, marginBottom: 16,
            background: 'rgba(4,10,30,.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,.07)',
          }}>
            {[
              { v: 'test', txt: 'Modo prueba', hint: 'Cobros falsos con la tarjeta 4242' },
              { v: 'live', txt: 'Modo real', hint: 'Cobra dinero de verdad' },
            ].map(({ v, txt, hint }) => {
              const activo = claves?.modo === v
              return (
                <button
                  key={v}
                  onClick={() => cambiarModo.mutate(v)}
                  disabled={cambiarModo.isPending || activo}
                  title={hint}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 9, cursor: activo ? 'default' : 'pointer',
                    // El inactivo llevaba border:none y fondo transparente: se leia
                    // como deshabilitado y no se pulsaba. Con borde parece un boton.
                    border: activo ? '1px solid transparent' : '1px solid rgba(255,255,255,.14)',
                    fontSize: 12.5, fontWeight: 700,
                    background: activo ? (v === 'test' ? 'rgba(251,191,36,.16)' : 'rgba(74,222,128,.16)') : 'transparent',
                    color: activo ? (v === 'test' ? '#fcd34d' : '#4ade80') : '#c3d2ee',
                  }}
                >
                  {txt}
                </button>
              )
            })}
          </div>

          <p style={{ margin: '-6px 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Cada modo guarda sus propias claves. Cambiar de modo no borra nada: las de
            {claves?.modo === 'test' ? ' producción' : ' prueba'} siguen guardadas
            {claves?.otro_modo_listo ? ' y listas' : ', pero incompletas'}.
          </p>

          {claves?.desde_env && (
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#fcd34d', background: 'rgba(251,191,36,.08)', padding: '9px 12px', borderRadius: 8, lineHeight: 1.6 }}>
              Ahora mismo las claves vienen del archivo .env del servidor. Si guardas aqui, mandaran las nuevas.
            </p>
          )}

          {campos.map(({ k, label, ph, actual }) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#8aa0cc', marginBottom: 5 }}>
                {label}
                {actual && <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{actual}</span>}
              </label>
              <input
                type="password"
                autoComplete="off"
                value={form[k]}
                placeholder={actual ? 'Dejar vacio para no cambiarla' : ph}
                onChange={e => { setForm(f => ({ ...f, [k]: e.target.value })); setError('') }}
                style={{ ...INP, width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
          ))}

          <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Se guardan cifradas y no vuelven a salir de aquí: una vez guardadas solo se ven
            enmascaradas. Para borrar una, escribe <code style={{ color: '#8aa0cc' }}>BORRAR</code> en su campo.
            Las claves tienen que ser del modo seleccionado arriba — pegar una de producción
            estando en prueba se rechaza.
          </p>

          {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8 }}>{error}</p>}
          {msg && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80', background: 'rgba(74,222,128,.08)', padding: '8px 12px', borderRadius: 8 }}>{msg}</p>}

          <button
            onClick={() => guardar.mutate(form)}
            disabled={!hayAlgo || guardar.isPending}
            style={{
              fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 10, border: 'none',
              color: '#fff', cursor: hayAlgo ? 'pointer' : 'not-allowed',
              background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', opacity: hayAlgo ? 1 : .4,
            }}
          >
            {guardar.isPending ? 'Guardando...' : 'Guardar claves'}
          </button>
        </div>
      )}
    </div>
  )
}

function KoyweKeysForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const { data: koywe } = useQuery({
    queryKey: ['koywe-keys'],
    queryFn: () => api.get('/payments/koywe/keys').then(r => r.data.data),
  })

  // Comprueba las credenciales contra su API sin cobrar nada. Sin esto, el
  // primer aviso de que una está mal lo daría un cliente sin poder pagar.
  const probar = useMutation({
    mutationFn: () => api.get('/payments/koywe/test').then(r => r.data),
    onSuccess: (r) => {
      const d = r.data || {}
      setMsg(`Conexión correcta con ${d.merchant_nombre || d.merchant_id} (${d.base_url})`)
      setError('')
      setTimeout(() => setMsg(''), 8000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo conectar'); setMsg('') },
  })

  const guardar = useMutation({
    mutationFn: (body) => api.put('/payments/koywe/keys', body),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      setForm({})
      qc.invalidateQueries({ queryKey: ['koywe-keys'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo guardar'); setMsg('') },
  })

  // Interruptor propio, separado del de Stripe: el sandbox de Koywe se pide
  // por correo, y atarlos obligaria a dejar Stripe en prueba solo por eso.
  const cambiarModo = useMutation({
    mutationFn: (modo) => api.put('/payments/koywe/mode', { modo }),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      qc.invalidateQueries({ queryKey: ['koywe-keys'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo cambiar el modo'); setMsg('') },
  })

  const campos = [
    { k: 'koywe_api_key', label: 'API key', ph: 'la que te env\u00ede Koywe' },
    { k: 'koywe_secret', label: 'Secret', ph: 'firma la autenticaci\u00f3n' },
    { k: 'koywe_org_id', label: 'ID de organizaci\u00f3n', ph: 'org3_...', publico: true },
    { k: 'koywe_merchant_id', label: 'ID de comercio', ph: 'mrc_...', publico: true },
    { k: 'koywe_webhook_secret', label: 'Secreto del webhook (opcional)', ph: 'solo si Koywe llega a darlo' },
  ]

  const hayAlgo = Object.values(form).some(v => (v || '').trim())
  const listo = !!koywe?.listo

  return (
    <div style={{ ...GLASS, padding: '20px 24px' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Koywe</h3>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: listo ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
              color: listo ? '#4ade80' : '#fcd34d',
            }}>
              {listo ? 'Configurado' : 'Sin credenciales'}
            </span>
            {koywe?.modo && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: koywe.modo === 'test' ? 'rgba(251,191,36,.12)' : 'rgba(74,222,128,.12)',
                color: koywe.modo === 'test' ? '#fcd34d' : '#4ade80',
              }}>
                {koywe.modo === 'test' ? 'Modo prueba' : 'Modo real'}
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            M\u00e9todos locales por pa\u00eds \u2014 los que ofrezca tu comercio
          </p>
        </div>
        <span style={{ fontSize: 18, color: '#475569' }}>{abierto ? '\u2304' : '\u203a'}</span>
      </button>

      {abierto && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: 4, marginTop: 18,
          background: 'rgba(4,10,30,.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,.07)',
        }}>
          {[
            { v: 'test', txt: 'Modo prueba', hint: 'Sandbox de Koywe \u2014 no mueve dinero' },
            { v: 'live', txt: 'Modo real', hint: 'Cobra dinero de verdad' },
          ].map(({ v, txt, hint }) => {
            const activo = koywe?.modo === v
            return (
              <button
                key={v}
                onClick={() => cambiarModo.mutate(v)}
                disabled={cambiarModo.isPending || activo}
                title={hint}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 9, cursor: activo ? 'default' : 'pointer',
                  border: activo ? '1px solid transparent' : '1px solid rgba(255,255,255,.14)',
                  fontSize: 12.5, fontWeight: 700,
                  background: activo ? (v === 'test' ? 'rgba(251,191,36,.16)' : 'rgba(74,222,128,.16)') : 'transparent',
                  color: activo ? (v === 'test' ? '#fcd34d' : '#4ade80') : '#c3d2ee',
                }}
              >
                {txt}
              </button>
            )
          })}
        </div>
      )}

      {abierto && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Este interruptor es solo de Koywe: no toca el de Stripe. Cada modo guarda su
            propio juego de credenciales, y las del sandbox se piden por correo a
            soporte@koywe.com.
          </p>

          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.15)', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: '#aebfe2', lineHeight: 1.6 }}>
              El cliente paga en el portal de Koywe con el m\u00e9todo de su pa\u00eds y la orden
              avanza sola: cuando llega el aviso, se le pregunta a Koywe si ese cobro
              existe de verdad antes de dar nada por pagado. Aqu\u00ed{' '}
              <strong>no hay nada que aprobar a mano</strong>.
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8aa0cc', lineHeight: 1.6 }}>
              La API key y el secreto salen de <strong>Configuraci\u00f3n \u2192 Organizaci\u00f3n \u2192
              Usuarios \u2192 Crear usuario API</strong> en su panel. Los dos identificadores
              los devuelve \u00abProbar conexi\u00f3n\u00bb si te equivocas de comercio.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8aa0cc', marginBottom: 5 }}>
              URL que hay que registrar en el panel de Koywe
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={koywe?.webhook_url || ''}
                onFocus={e => e.target.select()}
                style={{ ...INP, flex: 1, fontFamily: 'monospace', fontSize: 12.5, color: '#8aa0cc' }}
              />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(koywe?.webhook_url || '')
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                }}
                style={{ fontSize: 12, fontWeight: 700, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: copiado ? '#4ade80' : '#aebfe2', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {copiado ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
              Koywe no entrega ning\u00fan secreto de firma al registrarla, as\u00ed que{' '}
              <strong style={{ color: '#8aa0cc' }}>el campo de abajo puede quedar vac\u00edo</strong>.
              Cada aviso se comprueba consultando su API, que es m\u00e1s fiable que la firma:
              demuestra que el cobro existe, no solo qui\u00e9n mand\u00f3 el mensaje. Si alg\u00fan d\u00eda
              te dan el secreto, p\u00e9galo y se comprobar\u00e1n las dos cosas.
            </p>
          </div>

          {campos.map(({ k, label, ph, publico }) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#8aa0cc', marginBottom: 5 }}>
                {label}
                {koywe?.[k] && <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{koywe[k]}</span>}
              </label>
              <input
                type={publico ? 'text' : 'password'}
                autoComplete="off"
                value={form[k] || ''}
                placeholder={koywe?.[k] ? 'Dejar vac\u00edo para no cambiarlo' : ph}
                onChange={e => { setForm(f => ({ ...f, [k]: e.target.value })); setError('') }}
                style={{ ...INP, width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
          ))}

          <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Se guardan cifradas y no vuelven a salir de aqu\u00ed. Para borrar una, escribe{' '}
            <code style={{ color: '#8aa0cc' }}>BORRAR</code> en su campo. Cada modo guarda su
            propio juego: las de sandbox y las de producci\u00f3n conviven.
            {koywe?.base_url && (
              <> Ahora mismo apuntar\u00eda a <code style={{ color: '#8aa0cc' }}>{koywe.base_url}</code>.</>
            )}
          </p>

          {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8 }}>{error}</p>}
          {msg && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80', background: 'rgba(74,222,128,.08)', padding: '8px 12px', borderRadius: 8 }}>{msg}</p>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => guardar.mutate(form)}
              disabled={!hayAlgo || guardar.isPending}
              style={{
                fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 10, border: 'none',
                color: '#fff', cursor: hayAlgo ? 'pointer' : 'not-allowed',
                background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', opacity: hayAlgo ? 1 : .4,
              }}
            >
              {guardar.isPending ? 'Guardando...' : 'Guardar credenciales'}
            </button>

            <button
              onClick={() => probar.mutate()}
              disabled={!listo || probar.isPending}
              style={{
                fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)',
                color: '#aebfe2', cursor: listo ? 'pointer' : 'not-allowed', opacity: listo ? 1 : .4,
              }}
            >
              {probar.isPending ? 'Probando...' : 'Probar conexión'}
            </button>
          </div>

          {listo && <KoyweCuentasForm />}

          {listo && koywe?.methods && Object.keys(koywe.methods).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>
                Lo que tu comercio tiene contratado
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(koywe.methods).map(([moneda, ms]) => (
                  <div key={moneda} style={{ fontSize: 11.5, color: '#aebfe2', lineHeight: 1.7 }}>
                    <strong style={{ color: '#eaf2ff' }}>{moneda}</strong>
                    {' · '}
                    {ms.map((m, i) => (
                      <span key={m.codigo}>
                        {i > 0 && ', '}
                        <span style={{ color: m.soportado ? '#aebfe2' : '#64748b' }}>
                          {m.nombre}
                          {!m.soportado && ' (aún no)'}
                        </span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
                Esta lista sale de la API de Koywe, no de una tabla nuestra: si contratas
                un método nuevo aparece solo. Los marcados «aún no» se cobran mostrando un
                QR en vez de un enlace, y esa pantalla está pendiente.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
                El dinero queda en la cuenta de ese país y en esa misma moneda: un pago en
                CLP suma al saldo chileno, uno en COP al colombiano. Pasarlo a tu banco se
                hace desde el panel de Koywe. Estados Unidos no aparece porque Koywe no
                cobra ahí — solo paga.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Cuentas bancarias que Koywe emite a nombre del comercio. El número lo da su
// API; el titular y el banco no vienen por ningún lado y sin ellos el cliente
// no puede completar la transferencia. Por eso se rellenan aquí y la cuenta no
// se le muestra a nadie hasta que estén.
// Monedas donde la tasa oficial no es a la que se cambia dinero de verdad.
//
// Se enseña la diferencia y se deja elegir, en vez de decidirlo en el código:
// cotizar al paralelo solo es correcto si la casa TAMBIÉN liquida a esa tasa.
// Si el dinero se compra al oficial y se promete al paralelo, la diferencia la
// paga la casa en cada orden.
// Editor de la imagen de tasas de un país.
//
// Se sube una imagen ya terminada —fondo y todas sus letras, hecha en el
// programa de diseño de turno— y aquí solo se coloca encima el bloque de
// países y tasas, arrastrándolo con el ratón. Lo que se ve en pantalla es lo
// que sale: el bloque se dibuja con las mismas cuentas que usa el servidor.
//
// Sin imagen subida el país sigue con la versión automática, que se arma
// entera en el servidor con la foto del país.

// Mismas constantes que services/imagen_tasas.py, en píxeles de la imagen
// final. Si cambian allí, cambian aquí: lo que se arrastra dejaría de
// coincidir con lo que se genera.
// Valor de `fromCur` cuando lo elegido no es un origen sino el listado de
// lo que LLEGA a Venezuela.
const RECIBE = '__recibe__'

const ESPACIO_FILA = 5
const ALTO_FILA_MIN = 16
const ALTO_FILA_MAX = 42

// Espejo de reparte_filas en services/imagen_tasas.py. Si cambia allí, cambia
// aquí: lo que se arrastra dejaría de coincidir con lo que se genera.
function reparteFilas(n, alto) {
  const cuantas = Math.max(n, 1)
  let altoFila = Math.max(Math.floor(alto / cuantas) - ESPACIO_FILA, ALTO_FILA_MIN)
  altoFila = Math.min(altoFila, ALTO_FILA_MAX)
  const sobra = alto - (altoFila + ESPACIO_FILA) * cuantas + ESPACIO_FILA
  return { altoFila, desde: Math.max(sobra, 0) / 2 }
}

function ImagenDeTasas({ origen, sentido = 'envia' }) {
  const [url, setUrl] = useState(null)
  const [fondoUrl, setFondoUrl] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [pos, setPos] = useState(null)
  const [anchoVista, setAnchoVista] = useState(340)
  const [encima, setEncima] = useState(false)
  const lienzoRef = useRef(null)
  const arrastreRef = useRef(null)
  const ficheroRef = useRef(null)

  const { data: editor, refetch } = useQuery({
    queryKey: ['imagen-editor', origen?.name, sentido],
    queryFn: () => api.get('/admin/commissions/imagen/editor', {
      params: { from_country: origen.name, sentido },
    }).then(r => r.data.data),
    enabled: !!origen?.name,
  })

  const lienzo = editor?.lienzo || { ancho: 560, alto: 827 }
  const filas = editor?.filas || []
  const posicion = pos || editor?.posicion || { x: 110, y: 215, ancho: 340, alto: 550, letra: 100, negrita: true }

  // La posición vuelve a mandarla el servidor al cambiar de cartel; el estado
  // local solo existe mientras se arrastra.
  useEffect(() => { setPos(null) }, [origen?.name, sentido])

  // La imagen de fondo va detrás de sesión, así que no se puede poner en un
  // <img src>: se pide con el token y se convierte en URL de objeto.
  useEffect(() => {
    let vivo = true
    let creada = null
    setFondoUrl(u => { if (u) URL.revokeObjectURL(u); return null })
    if (origen?.name && editor?.tiene_fondo) {
      api.get('/admin/commissions/imagen/fondo', {
        params: { from_country: origen.name, sentido }, responseType: 'blob',
      }).then(r => {
        if (!vivo) return
        creada = URL.createObjectURL(r.data)
        setFondoUrl(creada)
      }).catch(() => { /* sin fondo se enseña el aviso de arriba */ })
    }
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada) }
  }, [origen?.name, editor?.tiene_fondo])

  // Al cambiar de país la imagen generada anterior deja de valer.
  useEffect(() => {
    setUrl(u => { if (u) URL.revokeObjectURL(u); return null })
    setError('')
  }, [origen?.name])

  const aviso = (texto) => { setMensaje(texto); setTimeout(() => setMensaje(''), 4000) }

  const detalleDeError = async (e, porDefecto) => {
    let detalle = porDefecto
    try {
      const cuerpo = e.response?.data
      detalle = (cuerpo instanceof Blob ? JSON.parse(await cuerpo.text()) : cuerpo)?.detail || detalle
    } catch { /* se queda el genérico */ }
    return detalle
  }

  const generar = async () => {
    if (!origen) return
    setCargando(true); setError('')
    try {
      const r = await api.get('/admin/commissions/imagen', {
        params: { from_country: origen.name, sentido }, responseType: 'blob',
      })
      setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(r.data) })
    } catch (e) {
      setError(await detalleDeError(e, 'No se pudo generar la imagen'))
    } finally { setCargando(false) }
  }

  const subirFondo = async (archivo) => {
    if (!archivo || !origen) return
    setSubiendo(true); setError('')
    const cuerpo = new FormData()
    cuerpo.append('file', archivo)
    try {
      await api.post('/admin/commissions/imagen/fondo', cuerpo, {
        params: { from_country: origen.name, sentido },
      })
      await refetch()
      aviso('Imagen de fondo guardada')
    } catch (e) {
      setError(await detalleDeError(e, 'No se pudo subir la imagen'))
    } finally {
      setSubiendo(false)
      if (ficheroRef.current) ficheroRef.current.value = ''
    }
  }

  const quitarFondo = async () => {
    setError('')
    try {
      await api.delete('/admin/commissions/imagen/fondo', {
        params: { from_country: origen.name, sentido },
      })
      await refetch()
      aviso('Imagen quitada. Este país vuelve a la versión automática.')
    } catch (e) {
      setError(await detalleDeError(e, 'No se pudo quitar la imagen'))
    }
  }

  const guardarPosicion = async (siguiente) => {
    try {
      await api.put('/admin/commissions/imagen/tabla', siguiente, {
        params: { from_country: origen.name, sentido },
      })
    } catch (e) {
      setError(await detalleDeError(e, 'No se pudo guardar la posición'))
    }
  }

  const restablecer = async () => {
    try {
      const r = await api.delete('/admin/commissions/imagen/tabla', {
        params: { from_country: origen.name, sentido },
      })
      setPos(r.data.data)
      aviso('Bloque devuelto a su sitio')
    } catch (e) {
      setError(await detalleDeError(e, 'No se pudo restablecer'))
    }
  }

  // Arrastre. Se usan eventos de puntero para que funcione igual con ratón y
  // con dedo, y setPointerCapture para no perder el bloque si el cursor sale
  // del lienzo a mitad de movimiento.
  const alAgarrar = (e) => {
    const caja = lienzoRef.current?.getBoundingClientRect()
    if (!caja) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const escala = caja.width / lienzo.ancho
    arrastreRef.current = {
      escala,
      dx: e.clientX - caja.left - posicion.x * escala,
      dy: e.clientY - caja.top - posicion.y * escala,
    }
  }

  const alMover = (e) => {
    const agarre = arrastreRef.current
    const caja = lienzoRef.current?.getBoundingClientRect()
    if (!agarre || !caja) return
    setPos({
      ...posicion,
      x: Math.round((e.clientX - caja.left - agarre.dx) / agarre.escala),
      y: Math.round((e.clientY - caja.top - agarre.dy) / agarre.escala),
    })
  }

  const alSoltar = (e) => {
    if (!arrastreRef.current) return
    arrastreRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ya soltado */ }
    guardarPosicion(posicion)
  }

  // El tamano de letra se calcula en pixeles de pantalla, asi que hace falta
  // saber a que tamano se esta viendo el lienzo.
  useEffect(() => {
    const medir = () => {
      const caja = lienzoRef.current?.getBoundingClientRect()
      if (caja?.width) setAnchoVista(caja.width)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [editor?.tiene_fondo, fondoUrl])

  const { altoFila, desde } = reparteFilas(filas.length, posicion.alto)
  const escalaVista = anchoVista / lienzo.ancho
  const factorLetra = (posicion.letra || 100) / 100
  const negrita = posicion.negrita !== false

  const etiqueta = posicion.etiqueta || 'pais'

  const cambiaEtiqueta = (cual) => {
    const siguiente = { ...posicion, etiqueta: cual }
    setPos(siguiente)
    guardarPosicion(siguiente)
  }

  const cambiaNegrita = () => {
    const siguiente = { ...posicion, negrita: !negrita }
    setPos(siguiente)
    guardarPosicion(siguiente)
  }

  // Arrastrar y soltar el fichero. dragover hay que cancelarlo o el navegador
  // abre la imagen en la pestaña y se pierde lo que hubiera en pantalla.
  const alArrastrarEncima = (e) => { e.preventDefault(); setEncima(true) }
  const alSalir = (e) => { e.preventDefault(); setEncima(false) }
  const alSoltarArchivo = (e) => {
    e.preventDefault()
    setEncima(false)
    const archivo = Array.from(e.dataTransfer?.files || [])
      .find(f => f.type.startsWith('image/'))
    if (archivo) subirFondo(archivo)
    else setError('Eso no es una imagen')
  }
  const botonBase = {
    padding: '9px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
    cursor: 'pointer', border: '1px solid rgba(255,255,255,.12)',
    background: 'transparent', color: '#8aa0cc',
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.07)' }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#eaf2ff' }}>
        Imagen de tasas de {origen?.name || ''}
      </h4>
      <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
        Sube la imagen del país con su fondo y sus letras ya puestas, y coloca
        encima el bloque de países y tasas arrastrándolo. Sin imagen subida se
        genera la versión automática.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { clave: 'pais', texto: 'Nombre del país', ayuda: 'ESTADOS UNIDOS' },
          { clave: 'abrev', texto: 'Abreviado', ayuda: 'EEUU' },
          { clave: 'divisa', texto: 'Divisa', ayuda: 'USD, con el país debajo en pequeño' },
        ].map(({ clave, texto, ayuda }) => (
          <button key={clave} onClick={() => cambiaEtiqueta(clave)} title={ayuda}
            style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', border: 'none',
              background: etiqueta === clave ? 'rgba(56,189,248,.18)' : 'rgba(255,255,255,.06)',
              color: etiqueta === clave ? '#eaf2ff' : '#8aa0cc',
              outline: etiqueta === clave ? '1px solid rgba(56,189,248,.4)' : 'none',
            }}>
            {texto}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          ref={ficheroRef}
          type="file"
          accept="image/*"
          onChange={e => subirFondo(e.target.files?.[0])}
          style={{ display: 'none' }} />
        {editor?.tiene_fondo && (
          <>
            <button onClick={quitarFondo} style={botonBase}>Quitar imagen</button>
            <button onClick={restablecer} style={botonBase}>Centrar bloque</button>
          </>
        )}

        <button onClick={generar} disabled={cargando || !origen}
          style={{
            ...botonBase, border: 'none', color: '#fff',
            background: 'linear-gradient(135deg,#22c55e,#15803d)',
            cursor: cargando ? 'wait' : 'pointer',
          }}>
          {cargando ? 'Generando…' : 'Generar imagen'}
        </button>
      </div>

      <div
        onClick={() => !subiendo && ficheroRef.current?.click()}
        onDragOver={alArrastrarEncima}
        onDragEnter={alArrastrarEncima}
        onDragLeave={alSalir}
        onDrop={alSoltarArchivo}
        style={{
          maxWidth: 340, marginBottom: 14, padding: '18px 16px', borderRadius: 14,
          textAlign: 'center', cursor: subiendo ? 'wait' : 'pointer',
          border: `1.5px dashed ${encima ? 'rgba(56,189,248,.85)' : 'rgba(255,255,255,.16)'}`,
          background: encima ? 'rgba(56,189,248,.10)' : 'rgba(6,13,40,.45)',
          transition: 'background .15s, border-color .15s',
        }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: encima ? '#38bdf8' : '#c3d2ee' }}>
          {subiendo
            ? 'Subiendo…'
            : (encima
              ? 'Suelta la imagen aquí'
              : (editor?.tiene_fondo ? 'Cambiar imagen de fondo' : 'Subir imagen de fondo'))}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>
          Arrástrala hasta aquí o haz clic para elegirla. JPG, PNG, WEBP o HEIC.
        </p>
      </div>

      {editor?.tiene_fondo && (
        <>
          <div
            ref={lienzoRef}
            style={{
              position: 'relative', width: '100%', maxWidth: 340,
              aspectRatio: `${lienzo.ancho} / ${lienzo.alto}`,
              borderRadius: 14, overflow: 'hidden', touchAction: 'none',
              border: '1px solid rgba(255,255,255,.12)',
              background: fondoUrl ? `center / cover no-repeat url(${fondoUrl})` : 'rgba(6,13,40,.8)',
            }}>
            <div
              onPointerDown={alAgarrar}
              onPointerMove={alMover}
              onPointerUp={alSoltar}
              onPointerCancel={alSoltar}
              style={{
                position: 'absolute', cursor: 'grab', touchAction: 'none',
                left: `${(posicion.x / lienzo.ancho) * 100}%`,
                top: `${(posicion.y / lienzo.alto) * 100}%`,
                width: `${(posicion.ancho / lienzo.ancho) * 100}%`,
                height: `${(posicion.alto / lienzo.alto) * 100}%`,
                outline: '1px dashed rgba(56,189,248,.55)',
                outlineOffset: 2,
              }}>
              {filas.map((f, i) => (
                <div key={f.name} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${((desde + i * (altoFila + ESPACIO_FILA)) / posicion.alto) * 100}%`,
                  height: `${(altoFila / posicion.alto) * 100}%`,
                  background: '#fff', borderRadius: 999,
                  display: 'flex', alignItems: 'center', gap: `${3 / Math.max(factorLetra, 1)}%`,
                  padding: `0 ${2.5 / Math.max(factorLetra, 1)}%`, boxSizing: 'border-box',
                  color: '#0a1e58', fontWeight: negrita ? 800 : 500, overflow: 'hidden',
                }}>
                  {f.iso2 && (
                    <img src={`https://flagcdn.com/w80/${f.iso2.toLowerCase()}.png`} alt=""
                      style={{
                        height: '80%', aspectRatio: '1 / 1', borderRadius: '50%',
                        objectFit: 'cover', flexShrink: 0,
                      }} />
                  )}
                  <span style={{
                    flex: 1, minWidth: 0, lineHeight: 1.1,
                    fontSize: Math.max(Math.min(altoFila * 0.34 * factorLetra, altoFila * 0.62) * escalaVista, 5),
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {etiqueta === 'divisa' ? (f.currency || '').toUpperCase()
                      : etiqueta === 'abrev' ? (f.abrev || f.name).toUpperCase()
                      : f.name.toUpperCase()}
                    {etiqueta === 'divisa' && (
                      <span style={{
                        display: 'block', color: '#3b82f6', fontWeight: 700,
                        fontSize: Math.max(Math.min(altoFila * 0.34 * factorLetra, altoFila * 0.62) * 0.52 * escalaVista, 4),
                      }}>
                        {f.name.toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: Math.max(Math.min(altoFila * 0.42 * factorLetra, altoFila * 0.62) * escalaVista, 6), flexShrink: 0 }}>{f.tasa}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ maxWidth: 340, marginTop: 10 }}>
            {[
              { campo: 'ancho', texto: 'Ancho', min: 160, max: lienzo.ancho },
              { campo: 'alto', texto: 'Alto', min: 100, max: lienzo.alto },
              // La letra va aparte del alto de fila: agranda el texto sin
              // tocar la pastilla ni el hueco que la rodea.
              { campo: 'letra', texto: 'Letra', min: 60, max: 220 },
            ].map(({ campo, texto, min, max }) => (
              <label key={campo} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                <span style={{ width: 42, fontSize: 11, fontWeight: 700, color: '#8aa0cc' }}>{texto}</span>
                <input
                  type="range" min={min} max={max} value={posicion[campo]}
                  onChange={e => setPos({ ...posicion, [campo]: Number(e.target.value) })}
                  onPointerUp={() => guardarPosicion(posicion)}
                  onKeyUp={() => guardarPosicion(posicion)}
                  style={{ flex: 1, accentColor: '#38bdf8' }} />
                <span style={{ width: 30, fontSize: 11, color: '#64748b', textAlign: 'right' }}>
                  {posicion[campo]}
                </span>
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
              <span style={{ width: 42, fontSize: 11, fontWeight: 700, color: '#8aa0cc' }}>Negrita</span>
              <button
                onClick={cambiaNegrita}
                title={negrita ? 'Quitar negrita' : 'Poner negrita'}
                style={{
                  width: 42, height: 24, borderRadius: 999, border: 'none', padding: 3,
                  cursor: 'pointer', flexShrink: 0,
                  background: negrita ? 'rgba(74,222,128,.28)' : 'rgba(255,255,255,.12)',
                  display: 'flex', justifyContent: negrita ? 'flex-end' : 'flex-start',
                }}>
                <span style={{ width: 18, height: 18, borderRadius: 999, background: negrita ? '#4ade80' : '#64748b' }} />
              </button>
            </label>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
            Arrastra el bloque para moverlo. Se guarda solo al soltar. — x {posicion.x}, y {posicion.y}
          </p>
        </>
      )}

      {mensaje && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#4ade80' }}>{mensaje}</p>}
      {error && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#f87171' }}>{error}</p>}

      {url && (
        <div style={{ marginTop: 16 }}>
          <img src={url} alt="Tasas" style={{ maxWidth: 340, width: '100%', borderRadius: 14, border: '1px solid rgba(255,255,255,.1)' }} />
          <div style={{ marginTop: 10 }}>
            <a href={url} download={`tasas-${origen?.name || 'origen'}.png`}
              style={{ fontSize: 12.5, fontWeight: 700, color: '#38bdf8', textDecoration: 'none' }}>
              Descargar imagen
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function MercadoParalelo() {
  const qc = useQueryClient()
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState(null)   // { country, currency, iso2 }
  const menuRef = useRef(null)

  // Países del sistema. El dólar se deja fuera: es la base de todas las tasas,
  // así que "el paralelo del USD" es siempre 1 y no dice nada.
  const { data: paises = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/rates/countries').then(r => r.data.data),
    // Cambia cuando alguien la edita, no sola: no hace falta preguntar cada
    // pocos segundos, pero sí darla por vieja enseguida para que al volver a
    // esta pantalla ya esté al día. Editar países además la invalida a mano.
    staleTime: 5000,
    refetchInterval: false,
  })
  const opciones = paises
    .filter(p => p.currency && p.currency !== 'USD')
    .sort((a, b) => a.country.localeCompare(b.country, 'es'))

  // Venezuela por defecto: es donde el paralelo manda de verdad.
  useEffect(() => {
    if (seleccion || !opciones.length) return
    setSeleccion(opciones.find(o => o.currency === 'VES') || opciones[0])
  }, [opciones.length])

  // Cerrar al pulsar fuera, comprobando DÓNDE se pulsó: cerrar ante cualquier
  // clic abre y cierra el desplegable en el mismo gesto.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!menuRef.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  // Una moneda cada vez: cada consulta sale a fuentes externas, y pedirlas
  // todas de golpe tardaría decenas de segundos en abrir la pantalla.
  const moneda = seleccion?.currency
  const { data: m, isLoading, isFetching } = useQuery({
    queryKey: ['tasa-paralelo', moneda],
    queryFn: () => api.get(`/rates/parallel/${moneda}`).then(r => r.data.data),
    enabled: !!moneda,
    refetchInterval: 60000,
    staleTime: 30000,
  })

  const cambiar = useMutation({
    mutationFn: (body) => api.post('/rates/parallel', body),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      qc.invalidateQueries({ queryKey: ['tasa-paralelo'] })
      qc.invalidateQueries({ queryKey: ['rates'] })
      setTimeout(() => setMsg(''), 5000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo cambiar'); setMsg('') },
  })

  const num = (v, d = 2) =>
    v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: d })

  // Invierte las monedas que valen mas que el dolar, para leerlas como se
  // consultan: el euro se mira como 1,15 dolares, no como 0,87 euros.
  const comoSeLee = (v) => (v == null ? null : (m?.oficial && m.oficial < 1 ? 1 / v : v))

  const NOMBRE_FUENTE = {
    binance_p2p: 'Binance P2P', yadio: 'Yadio', dolarapi: 'DolarAPI', dolarapi_cripto: 'DolarAPI cripto',
  }

  const etiqueta = { margin: 0, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569' }

  return (
    // La tarjeta entera sube cuando el desplegable esta abierto. No basta con
    // el z-index del desplegable: GLASS lleva backdrop-filter, que crea un
    // contexto de apilamiento propio en CADA tarjeta, asi que las siguientes se
    // pintan encima por orden del DOM y el desplegable quedaba tapado.
    <div style={{ ...GLASS, padding: '20px 24px', marginBottom: 16, position: 'relative', zIndex: abierto ? 60 : 'auto' }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Mercado paralelo</h3>
      <p style={{ margin: '4px 0 14px', fontSize: 12.5, color: '#8aa0cc', lineHeight: 1.6 }}>
        Elige un país para ver a cuánto está el dólar en su mercado real, al lado del cambio
        oficial. Cotizar al paralelo solo tiene sentido si tú también liquidas a esa tasa: si
        compras al oficial y prometes al paralelo, la diferencia la pagas tú en cada envío.
      </p>

      <div ref={menuRef} style={{ position: 'relative', marginBottom: 14, maxWidth: 420 }}>
        <button type="button" onClick={() => setAbierto(a => !a)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 12, cursor: 'pointer', textAlign: 'left', background: 'rgba(6,13,40,.85)',
            border: `1px solid ${abierto ? 'rgba(56,189,248,.45)' : 'rgba(255,255,255,.12)'}`,
          }}>
          {seleccion?.iso2 && <Bandera iso2={seleccion.iso2} ancho={24} alto={17} />}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#eaf2ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {seleccion?.country || 'Elige un país'}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: '#8aa0cc' }}>{seleccion?.currency || ''}</span>
          </span>
          <span style={{ color: '#8aa0cc', fontSize: 11, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
        </button>

        {abierto && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
            maxHeight: 280, overflowY: 'auto', borderRadius: 12, padding: 4,
            background: 'rgba(5,11,35,.98)', border: '1px solid rgba(56,189,248,.2)',
            boxShadow: '0 16px 40px rgba(0,0,0,.6)',
          }}>
            {opciones.map(o => {
              const activa = o.country === seleccion?.country
              return (
                <button key={o.country} type="button"
                  onClick={() => { setSeleccion(o); setAbierto(false); setError(''); setMsg('') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                    borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: activa ? 'rgba(56,189,248,.12)' : 'transparent',
                  }}>
                  <Bandera iso2={o.iso2} ancho={20} alto={14} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }}>{o.country}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: activa ? '#38bdf8' : '#8aa0cc' }}>{o.currency}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8 }}>{error}</p>}
      {msg && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80', background: 'rgba(74,222,128,.08)', padding: '8px 12px', borderRadius: 8 }}>{msg}</p>}

      {moneda && (isLoading || !m || m.moneda !== moneda) && (
        <div style={{ height: 118, borderRadius: 12, background: 'rgba(255,255,255,.04)' }} />
      )}

      {m && m.moneda === moneda && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(4,10,30,.5)', border: '1px solid rgba(255,255,255,.07)', opacity: isFetching ? 0.7 : 1, transition: 'opacity .2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            {/* Las monedas mas fuertes que el dolar se leen al reves: "1 USD =
                0,87 EUR" no le dice nada a nadie, y en Google se ve 1,15. Se
                invierte para mostrarlo como se consulta de verdad. */}
            <strong style={{ fontSize: 13, color: '#eaf2ff' }}>
              {(m.oficial && m.oficial < 1)
                ? `1 ${m.moneda} en USD`
                : `1 USD en ${m.moneda}`}
            </strong>
            {m.configurable && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: m.activo ? 'rgba(74,222,128,.12)' : 'rgba(148,163,184,.12)',
                color: m.activo ? '#4ade80' : '#94a3b8',
              }}>
                {m.activo ? 'Cotizando al paralelo' : 'Cotizando al oficial'}
              </span>
            )}
            {m.diferencia_pct != null && (
              <span style={{ fontSize: 11.5, color: Math.abs(m.diferencia_pct) > 3 ? '#fcd34d' : '#8aa0cc' }}>
                diferencia {m.diferencia_pct > 0 ? '+' : ''}{num(m.diferencia_pct, 1)}%
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <p style={etiqueta}>Oficial</p>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#8aa0cc' }}>{num(comoSeLee(m.oficial), 4)}</p>
            </div>
            <div>
              <p style={etiqueta}>Paralelo</p>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: m.paralelo == null ? '#64748b' : '#eaf2ff' }}>
                {m.paralelo == null ? 'Sin datos' : num(comoSeLee(m.paralelo), 4)}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(m.fuentes || []).map(f => (
              <span key={f.nombre} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: f.creible ? '#aebfe2' : '#64748b' }}>
                {NOMBRE_FUENTE[f.nombre] || f.nombre}: {f.valor == null ? 'sin respuesta' : num(comoSeLee(f.valor), 4)}
                {f.valor != null && !f.creible && ' (descartada)'}
              </span>
            ))}
          </div>

          {/* Con qué tasa cotiza el sistema los envíos a este país. Vale para
              todos, no solo para los que traen varias fuentes. */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <p style={{ ...etiqueta, marginBottom: 6 }}>El sistema cotiza con</p>
            <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 11, background: 'rgba(4,10,30,.6)', border: '1px solid rgba(255,255,255,.07)', maxWidth: 340 }}>
              {[
                { v: false, txt: 'Oficial', hint: 'Cambio oficial del mercado' },
                { v: true, txt: 'Paralelo', hint: 'Precio real al que se cambia en ese país' },
              ].map(({ v, txt, hint }) => {
                const activa = !!m.activo === v
                const sinDatos = v && m.paralelo == null
                return (
                  <button key={txt} type="button" title={sinDatos ? 'No hay cotización de mercado para esta moneda' : hint}
                    onClick={() => { if (!activa && !sinDatos) cambiar.mutate({ moneda: m.moneda, activo: v }) }}
                    disabled={cambiar.isPending || activa || sinDatos}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                      cursor: activa || sinDatos ? 'default' : 'pointer',
                      border: activa ? '1px solid transparent' : '1px solid rgba(255,255,255,.12)',
                      background: activa ? 'rgba(74,222,128,.16)' : 'transparent',
                      color: sinDatos ? '#475569' : activa ? '#4ade80' : '#c3d2ee',
                    }}>
                    {txt}
                  </button>
                )
              })}
            </div>

            {cambiar.isPending && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#8aa0cc' }}>Recalculando las tasas…</p>
            )}

            {!m.configurable && m.paralelo != null && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                Aquí el paralelo sale de una sola fuente (Binance P2P). Si algún día devuelve un
                valor disparatado no hay con qué contrastarlo, así que se compara con el oficial
                y se descarta si se sale de rango: en ese caso se mantiene la tasa anterior.
              </p>
            )}

            {m.paralelo == null && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                Sin cotización de mercado para {m.moneda}, así que solo se puede cotizar al oficial.
              </p>
            )}

            {!!m.activo && m.diferencia_pct != null && Math.abs(m.diferencia_pct) > 1 && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#fcd34d', lineHeight: 1.5 }}>
                Los envíos a este país se cotizan un {num(Math.abs(m.diferencia_pct), 1)}%
                {m.diferencia_pct > 0 ? ' por encima' : ' por debajo'} del oficial. Compra la
                moneda a esa tasa o la diferencia la pones tú en cada envío.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KoyweCuentasForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['koywe-cuentas'],
    queryFn: () => api.get('/payments/koywe/accounts').then(r => r.data.data),
    retry: false,
  })

  const guardar = useMutation({
    mutationFn: (body) => api.put('/payments/koywe/accounts', body),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      qc.invalidateQueries({ queryKey: ['koywe-cuentas'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 5000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo guardar'); setMsg('') },
  })

  const valor = (moneda, campo, actual) => {
    const k = `${moneda}.${campo}`
    return form[k] !== undefined ? form[k] : (actual || '')
  }
  const set = (moneda, campo, v) => setForm(f => ({ ...f, [`${moneda}.${campo}`]: v }))

  const campos = [
    { k: 'titular', label: 'Titular de la cuenta', ph: 'nombre exacto que aparece en el banco', obligatorio: true },
    { k: 'banco', label: 'Banco', ph: 'no hace falta para un CBU o una CLABE' },
    { k: 'documento', label: 'RUT / CUIT / RFC', ph: 'opcional' },
    { k: 'tipo_cuenta', label: 'Tipo de cuenta', ph: 'corriente, vista, ahorro...' },
    { k: 'nota', label: 'Nota para el cliente', ph: 'opcional' },
  ]

  if (isLoading) return null

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.07)' }}>
      <p style={{ margin: '0 0 4px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>
        Cuentas para recibir transferencias
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
        El cliente que elija «Transferencia» en una de estas monedas ve los datos de la
        cuenta y el dinero cae en tu saldo de ese país, sin pasar por una cuenta tuya.
        Para que se muestre hacen falta dos cosas: el <strong>titular</strong>, y marcar
        «Mostrar a los clientes». El resto de campos son opcionales — rellénalos si el
        país los pide para transferir.
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
        Hay dos clases. Las marcadas <strong style={{ color: '#38bdf8' }}>A tu nombre</strong> son
        cuentas emitidas para ti: lo que entra ahí es tuyo sin discusión. Las marcadas{' '}
        <strong style={{ color: '#94a3b8' }}>Cuenta de Koywe</strong> las comparte Koywe entre
        todos sus comercios, y conviene confirmar con ellos cómo atribuyen cada depósito
        antes de dársela a un cliente.
      </p>

      {(!cuentas || cuentas.length === 0) && (
        <p style={{ margin: 0, fontSize: 12.5, color: '#fcd34d', background: 'rgba(251,191,36,.08)', padding: '9px 12px', borderRadius: 8, lineHeight: 1.6 }}>
          Koywe no tiene ninguna cuenta emitida todavía. Se piden a soporte@koywe.com,
          indicando en qué países quieres recibir transferencias.
        </p>
      )}

      {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8 }}>{error}</p>}
      {msg && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80', background: 'rgba(74,222,128,.08)', padding: '8px 12px', borderRadius: 8 }}>{msg}</p>}

      {(cuentas || []).map(c => (
        <div key={c.moneda} style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 12, background: 'rgba(4,10,30,.5)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: '#eaf2ff' }}>{c.pais} · {c.moneda}</strong>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
              background: c.publicada ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
              color: c.publicada ? '#4ade80' : '#fcd34d',
            }}>
              {c.publicada ? 'Visible para clientes'
                : (c.faltan || []).length ? `Falta ${(c.faltan || []).join(' y ')}` : 'Sin publicar'}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
              background: c.clase === 'propia' ? 'rgba(56,189,248,.12)' : 'rgba(148,163,184,.12)',
              color: c.clase === 'propia' ? '#38bdf8' : '#94a3b8',
            }}>
              {c.clase === 'propia' ? 'A tu nombre' : 'Cuenta de Koywe'}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8aa0cc' }}>{c.numero}</span>
          </div>

          {c.clase === 'compartida' && (
            <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#fcd34d', background: 'rgba(251,191,36,.08)', padding: '9px 12px', borderRadius: 8, lineHeight: 1.6 }}>
              Esta cuenta es de <strong>{c.titular}</strong>, no tuya: Koywe la comparte entre
              todos sus comercios. Antes de publicarla pregúntales cómo saben que un depósito
              es tuyo y no de otro — si hace falta una glosa o el RUT de quien transfiere.
              Si se publica sin eso, el cliente paga y el dinero puede no llegar a tu saldo.
            </p>
          )}

          {campos.map(({ k, label, ph, obligatorio }) => (
            <div key={k} style={{ marginBottom: 9 }}>
              <label style={{ display: 'block', fontSize: 11.5, color: '#8aa0cc', marginBottom: 4 }}>
                {label}{obligatorio && <span style={{ color: '#fcd34d' }}> *</span>}
              </label>
              <input
                value={valor(c.moneda, k, c[k])}
                placeholder={ph}
                onChange={e => { set(c.moneda, k, e.target.value); setError('') }}
                style={{ ...INP, width: '100%', fontSize: 12.5 }}
              />
            </div>
          ))}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '12px 0 4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!valor(c.moneda, 'habilitada', c.habilitada)}
              onChange={e => set(c.moneda, 'habilitada', e.target.checked)}
              style={{ marginTop: 2, width: 15, height: 15, accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: '#aebfe2', lineHeight: 1.5 }}>
              <strong>Mostrar a los clientes</strong>
              <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>
                Mientras esté desmarcada nadie la ve, aunque los datos estén completos.
              </span>
            </span>
          </label>

          <button
            onClick={() => guardar.mutate({
              moneda: c.moneda,
              ...Object.fromEntries(campos.map(({ k }) => [k, valor(c.moneda, k, c[k])])),
              habilitada: !!valor(c.moneda, 'habilitada', c.habilitada),
            })}
            disabled={guardar.isPending}
            style={{
              marginTop: 4, fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)',
              color: '#aebfe2', cursor: 'pointer',
            }}
          >
            {guardar.isPending ? 'Guardando...' : `Guardar cuenta ${c.moneda}`}
          </button>
        </div>
      ))}
    </div>
  )
}

function Global66KeysForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const { data: g66 } = useQuery({
    queryKey: ['global66-keys'],
    queryFn: () => api.get('/payments/global66/keys').then(r => r.data.data),
  })

  // Los avisos solo se piden con la sección abierta y la clave puesta: sin
  // endpoint registrado la lista está siempre vacía y sería una consulta al
  // servidor cada vez que alguien entra en Ajustes.
  const { data: depositos } = useQuery({
    queryKey: ['global66-deposits'],
    queryFn: () => api.get('/payments/global66/deposits').then(r => r.data.data),
    enabled: !!(abierto && g66?.webhook_listo),
    refetchInterval: 30000,
  })

  const guardar = useMutation({
    mutationFn: (body) => api.put('/payments/global66/keys', body),
    onSuccess: (r) => {
      setMsg(r.data.message)
      setError('')
      setForm({})
      qc.invalidateQueries({ queryKey: ['global66-keys'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo guardar'); setMsg('') },
  })

  const campos = [
    { k: 'global66_webhook_key', label: 'Clave del webhook (x-api-key)', ph: 'te la dan al registrar la URL' },
    { k: 'global66_client_id', label: 'Client ID', ph: 'de las credenciales de API', publico: true },
    { k: 'global66_client_secret', label: 'Client Secret', ph: 'de las credenciales de API' },
  ]

  const hayAlgo = Object.values(form).some(v => (v || '').trim())
  const listo = !!g66?.webhook_listo

  const copiarUrl = () => {
    navigator.clipboard?.writeText(g66?.webhook_url || '')
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div style={{ ...GLASS, padding: '20px 24px' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Global66</h3>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: listo ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
              color: listo ? '#4ade80' : '#fcd34d',
            }}>
              {listo ? 'Recibiendo avisos' : 'Sin credenciales'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            Avisa cuando entra plata en tus cuentas de cada país
          </p>
        </div>
        <span style={{ fontSize: 18, color: '#475569' }}>{abierto ? '⌄' : '›'}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 18 }}>
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.15)', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: '#aebfe2', lineHeight: 1.6 }}>
              Esto <strong>no aprueba órdenes solo</strong>. Cuando alguien te transfiere,
              Global66 avisa y aquí abajo aparece el depósito con la orden que
              probablemente le corresponde. Aprobar lo sigues haciendo tú.
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8aa0cc', lineHeight: 1.6 }}>
              El aviso de Global66 no trae ningún campo para el número de orden, así que
              el cruce se hace por monto + moneda + nombre de quien transfirió.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8aa0cc', marginBottom: 5 }}>
              URL que hay que registrar en el panel de Global66
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={g66?.webhook_url || ''}
                onFocus={e => e.target.select()}
                style={{ ...INP, flex: 1, fontFamily: 'monospace', fontSize: 12.5, color: '#8aa0cc' }}
              />
              <button
                onClick={copiarUrl}
                style={{ fontSize: 12, fontWeight: 700, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: copiado ? '#4ade80' : '#aebfe2', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {copiado ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
              Pídeles también que dejen entrar solo desde <code style={{ color: '#8aa0cc' }}>138.197.47.184</code>.
              La clave que dan es fija, no una firma: la lista blanca de IP es lo que impide
              que alguien con esa clave se invente un depósito.
            </p>
          </div>

          {campos.map(({ k, label, ph, publico }) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#8aa0cc', marginBottom: 5 }}>
                {label}
                {g66?.[k] && <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{g66[k]}</span>}
              </label>
              <input
                type={publico ? 'text' : 'password'}
                autoComplete="off"
                value={form[k] || ''}
                placeholder={g66?.[k] ? 'Dejar vacío para no cambiarlo' : ph}
                onChange={e => { setForm(f => ({ ...f, [k]: e.target.value })); setError('') }}
                style={{ ...INP, width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
          ))}

          <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Con la <strong>clave del webhook</strong> ya empiezan a llegar los avisos. El Client
            ID y el Secret hacen falta después, para confirmar cada depósito contra su API.
            Se guardan cifradas. Para borrar una, escribe <code style={{ color: '#8aa0cc' }}>BORRAR</code> en su campo.
          </p>

          {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8 }}>{error}</p>}
          {msg && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80', background: 'rgba(74,222,128,.08)', padding: '8px 12px', borderRadius: 8 }}>{msg}</p>}

          <button
            onClick={() => guardar.mutate(form)}
            disabled={!hayAlgo || guardar.isPending}
            style={{
              fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 10, border: 'none',
              color: '#fff', cursor: hayAlgo ? 'pointer' : 'not-allowed',
              background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', opacity: hayAlgo ? 1 : .4,
            }}
          >
            {guardar.isPending ? 'Guardando...' : 'Guardar credenciales'}
          </button>

          {listo && (
            <div style={{ marginTop: 22 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#eaf2ff' }}>
                Últimos avisos recibidos
              </h4>
              {!depositos?.length ? (
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
                  Todavía no ha llegado ninguno. Aparecerán aquí en cuanto Global66 mande el
                  primero — si registraste la URL y no llega nada, es que el endpoint no quedó
                  bien guardado en su panel.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {depositos.map(d => (
                    <div key={d.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eaf2ff' }}>
                          {d.amount?.toLocaleString('es-CL')} {d.currency}
                        </span>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: d.confirmado ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
                          color: d.confirmado ? '#4ade80' : '#fcd34d',
                        }}>
                          {d.status || 'sin estado'}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8aa0cc' }}>
                        De {d.remitter_name || 'sin nombre'}
                        {d.remitter_bank ? ` · ${d.remitter_bank}` : ''}
                        {d.account_branch ? ` → ${d.account_branch}` : ''}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: d.orden?.id ? '#4ade80' : '#64748b', lineHeight: 1.5 }}>
                        {d.match_note || 'Sin cruce calculado'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PaymentIntegrations() {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [yendo, setYendo] = useState(false)

  const { data: cuenta, isLoading } = useQuery({
    queryKey: ['stripe-account'],
    queryFn: () => api.get('/payments/stripe/account').then(r => r.data.data),
    // Se refresca al volver del formulario de Stripe: el admin regresa a esta
    // misma pantalla y el estado tiene que estar al día.
    refetchOnWindowFocus: true,
  })

  const irA = async (path) => {
    setYendo(true); setError('')
    try {
      const r = path === 'onboard'
        ? await api.post('/payments/stripe/account/onboard')
        : await api.get('/payments/stripe/account/dashboard')
      window.location.href = r.data.data.url
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo conectar con Stripe')
      setYendo(false)
    }
  }

  if (isLoading) return <div style={{ ...GLASS, height: 180 }} />

  const plataformaLista = !!cuenta?.platform_configured
  const conectada = !!cuenta?.connected
  const cobrando = !!cuenta?.charges_enabled

  const estado = !conectada ? { txt: 'Sin conectar', color: '#fcd34d', bg: 'rgba(251,191,36,.12)' }
    : cobrando ? { txt: 'Cobrando', color: '#4ade80', bg: 'rgba(74,222,128,.12)' }
    : { txt: 'Verificación pendiente', color: '#fb923c', bg: 'rgba(251,146,60,.12)' }

  return (
    <div style={{ ...GLASS, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        {/* "Cuenta de Stripe", no "Stripe" a secas: arriba hay otra tarjeta
            llamada "Claves de Stripe" y el mismo nombre para las dos hacia que
            se buscara el interruptor de modo en esta, que no lo tiene. */}
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Cuenta de Stripe</h3>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: estado.bg, color: estado.color }}>
          {estado.txt}
        </span>
      </div>

      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8aa0cc', lineHeight: 1.6 }}>
        Conecta tu cuenta y el dinero de <strong>tus</strong> clientes entra directamente en ella.
        No compartes claves con nadie: te das de alta en el formulario de Stripe.
      </p>

      {!plataformaLista && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#fcd34d', lineHeight: 1.6 }}>
            Primero hay que guardar las claves de Stripe, ahí arriba. Hasta entonces no se
            puede conectar ninguna cuenta y el pago con tarjeta está oculto para los clientes.
          </p>
        </div>
      )}

      {conectada && !cobrando && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.2)', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#fb923c', lineHeight: 1.6 }}>
            Stripe todavía no te deja cobrar: falta completar la verificación.
            Mientras tanto, los pagos de tus clientes entran en la cuenta de la plataforma.
          </p>
        </div>
      )}

      {error && (
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => irA('onboard')}
          disabled={!plataformaLista || yendo}
          style={{
            fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 10,
            border: 'none', color: '#fff', cursor: plataformaLista ? 'pointer' : 'not-allowed',
            background: 'linear-gradient(135deg,#635bff,#4b45c6)', opacity: plataformaLista ? 1 : .4,
          }}
        >
          {yendo ? 'Abriendo Stripe...' : conectada ? (cobrando ? 'Actualizar datos' : 'Continuar verificación') : 'Conectar con Stripe'}
        </button>

        {conectada && (
          <button
            onClick={() => irA('dashboard')}
            disabled={yendo}
            style={{
              fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: '#aebfe2',
            }}
          >
            Ver mis cobros en Stripe
          </button>
        )}

        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['stripe-account'] })}
          style={{
            fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc',
          }}
        >
          Actualizar estado
        </button>
      </div>

      {conectada && (
        <p style={{ margin: '14px 0 0', fontSize: 11.5, color: '#475569', fontFamily: 'monospace' }}>
          {cuenta.account_id}
        </p>
      )}

      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
        Una orden solo pasa a <strong>En Proceso</strong> cuando Stripe confirma el cobro por webhook.
        Nunca desde el navegador.
      </p>
    </div>
  )
}

// Correo saliente.
//
// La verificación por correo no se puede exigir sin esto: si no hay proveedor
// configurado nadie podría recibir el código, así que el registro y el envío
// siguen funcionando sin verificar. En cuanto se guarda algo aquí, para mandar
// dinero hace falta verificar el buzón.
//
// El servidor tiene los puertos SMTP (25, 587, 465) cerrados de salida, así
// que la vía que funciona es la API sobre HTTPS. El SMTP se deja porque sigue
// valiendo en cualquier otro servidor, pero avisado.
const PROVEEDORES = [
  {
    id: 'gmail',
    nombre: 'Gmail',
    via: 'API · Workspace',
    alta: 'console.cloud.google.com',
    ayuda: 'Escribe desde tu propio dominio con una cuenta de servicio de Google. El administrador de Workspace tiene que autorizarla una vez en Delegación de todo el dominio; después no caduca ni hay que volver a iniciar sesión.',
    phClave: null,
  },
  {
    id: 'resend',
    nombre: 'Resend',
    via: 'API',
    alta: 'resend.com',
    ayuda: 'Crea la clave en Resend → API Keys. El remitente tiene que ser una dirección de un dominio verificado allí (hashtagcl.com). 3.000 correos al mes gratis.',
    phClave: 're_...',
  },
  {
    id: 'brevo',
    nombre: 'Brevo',
    via: 'API',
    alta: 'brevo.com',
    ayuda: 'Crea la clave en Brevo → SMTP & API → API Keys. El remitente tiene que estar dado de alta como Sender verificado. 300 correos al día gratis.',
    phClave: 'xkeysib-...',
  },
  {
    id: 'smtp',
    nombre: 'SMTP',
    via: 'puertos cerrados',
    alta: null,
    ayuda: 'Gmail, Workspace o cualquier servidor propio. En este servidor no funciona: DigitalOcean bloquea la salida por los puertos 25, 587 y 465.',
    phClave: null,
  },
]

function SmtpForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const { data: smtp } = useQuery({
    queryKey: ['smtp'],
    queryFn: () => api.get('/admin/smtp').then(r => r.data.data),
  })

  // Lo que se está editando: lo tocado en el formulario o, si no, lo guardado.
  const prov = form.email_provider ?? smtp?.email_provider ?? 'gmail'
  const info = PROVEEDORES.find(p => p.id === prov) || PROVEEDORES[0]

  const guardar = useMutation({
    mutationFn: (body) => api.put('/admin/smtp', body),
    onSuccess: (r) => {
      setMsg(r.data.message); setError(''); setForm({})
      qc.invalidateQueries({ queryKey: ['smtp'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo guardar'); setMsg('') },
  })

  const probar = useMutation({
    mutationFn: () => api.post('/admin/smtp/test'),
    onSuccess: (r) => { setMsg(r.data.message); setError('') },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo conectar'); setMsg('') },
  })

  // El interruptor se guarda solo, sin pasar por el botón de Guardar: es lo
  // que corta el paso a los clientes y tiene que poder apagarse de un toque.
  const alternar = useMutation({
    mutationFn: (v) => api.put('/admin/smtp', { email_verificacion_activa: v ? '1' : '0' }),
    onSuccess: (r) => {
      setMsg(r.data.message); setError('')
      qc.invalidateQueries({ queryKey: ['smtp'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo cambiar'); setMsg('') },
  })

  const campos = prov === 'gmail'
    ? [
        { k: 'gmail_service_account', label: 'JSON de la cuenta de servicio', ph: 'pega aquí el archivo entero que descarga Google', multilinea: true },
        { k: 'smtp_from', label: 'Escribir como', ph: 'contacto@ksatokio.com', publico: true },
      ]
    : prov === 'smtp'
    ? [
        { k: 'smtp_host', label: 'Servidor', ph: 'smtp.gmail.com', publico: true },
        { k: 'smtp_port', label: 'Puerto', ph: '587', publico: true },
        { k: 'smtp_user', label: 'Usuario', ph: 'envios@tudominio.com', publico: true },
        { k: 'smtp_password', label: 'Contraseña', ph: 'contraseña de aplicación' },
        { k: 'smtp_from', label: 'Remitente', ph: 'igual que el usuario si lo dejas vacío', publico: true },
      ]
    : [
        { k: 'email_api_key', label: 'Clave de API', ph: info.phClave },
        { k: 'smtp_from', label: 'Remitente', ph: 'envios@hashtagcl.com', publico: true },
      ]

  // Cambiar de proveedor cuenta como cambio, aunque no se toque ningún campo:
  // si no, elegir Resend teniendo ya la clave guardada no se podría guardar.
  const hayAlgo = Object.entries(form).some(([, v]) => (v || '').trim())
  const listo = !!smtp?.listo

  return (
    <div style={{ ...GLASS, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Correo saliente</h3>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          background: listo ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
          color: listo ? '#4ade80' : '#fcd34d',
        }}>
          {listo ? 'Activo' : 'Sin configurar'}
        </span>
      </div>

      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8aa0cc', lineHeight: 1.6 }}>
        {listo
          ? 'Los clientes reciben un código de 6 cifras al registrarse y no pueden enviar dinero hasta verificarlo.'
          : 'Mientras esté apagado, cualquiera puede registrarse con un correo inventado y enviar dinero.'}
      </p>

      {/* El interruptor va aparte de las credenciales: guardar unas claves no
          debe cortarle el paso a nadie hasta que se haya visto llegar un
          correo de verdad. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, marginBottom: 18,
        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
      }}>
        <button
          onClick={() => alternar.mutate(!smtp?.activa)}
          disabled={alternar.isPending}
          style={{
            width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
            padding: 3, display: 'flex', justifyContent: smtp?.activa ? 'flex-end' : 'flex-start',
            background: smtp?.activa ? 'linear-gradient(135deg,#38bdf8,#818cf8)' : 'rgba(255,255,255,.14)',
            transition: 'background .15s',
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', display: 'block' }} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#eaf2ff' }}>
            Exigir verificación del correo
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#8aa0cc', lineHeight: 1.5 }}>
            {smtp?.activa
              ? 'Un cliente sin verificar no puede enviar dinero.'
              : 'Apagado: se puede enviar dinero sin verificar el correo.'}
          </p>
        </div>
      </div>

      {smtp?.activa && !smtp?.credenciales_listas && (
        <div style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#fca5a5', lineHeight: 1.6 }}>
            Está exigiendo verificación pero no hay con qué mandar el código. Ningún cliente
            nuevo puede enviar dinero. Apaga el interruptor o termina de configurar el proveedor.
          </p>
        </div>
      )}

      {/* Elegir proveedor */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {PROVEEDORES.map(p => (
          <button
            key={p.id}
            onClick={() => setForm(f => ({ ...f, email_provider: p.id }))}
            style={{
              padding: '9px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
              background: prov === p.id ? 'rgba(56,189,248,.14)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${prov === p.id ? 'rgba(56,189,248,.4)' : 'rgba(255,255,255,.08)'}`,
              color: prov === p.id ? '#38bdf8' : '#8aa0cc',
            }}
          >
            {p.nombre}
            <span style={{ fontSize: 10.5, fontWeight: 500, opacity: .8 }}>{p.via}</span>
          </button>
        ))}
      </div>

      {prov === 'smtp' && (
        <div style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#fca5a5', lineHeight: 1.6 }}>
            En este servidor el SMTP no sale: DigitalOcean bloquea los puertos 25, 587 y 465.
            Comprobado contra Gmail, Resend y Brevo — todos agotan el tiempo de espera mientras
            el resto de internet responde. Se puede pedir el desbloqueo por ticket a DigitalOcean,
            pero no siempre lo aprueban. Con la API de Resend o Brevo funciona hoy.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
        {campos.map(c => (
          <label key={c.k} style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: c.multilinea ? '1 / -1' : 'auto' }}>
            <span style={{ fontSize: 12, color: '#8aa0cc', fontWeight: 600 }}>{c.label}</span>
            {c.multilinea ? (
              <textarea
                value={form[c.k] ?? ''}
                onChange={e => setForm(f => ({ ...f, [c.k]: e.target.value }))}
                placeholder={c.ph}
                rows={5}
                spellCheck={false}
                style={{
                  padding: '10px 12px', borderRadius: 10, fontSize: 11.5, resize: 'vertical',
                  fontFamily: 'monospace', lineHeight: 1.5,
                  background: 'rgba(6,13,40,.7)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff',
                }}
              />
            ) : (
              <input
                value={form[c.k] ?? ''}
                onChange={e => setForm(f => ({ ...f, [c.k]: e.target.value }))}
                placeholder={smtp?.[c.k] || c.ph}
                type={c.publico ? 'text' : 'password'}
                autoComplete="off"
                style={{
                  padding: '10px 12px', borderRadius: 10, fontSize: 13,
                  background: 'rgba(6,13,40,.7)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff',
                }}
              />
            )}
          </label>
        ))}
      </div>

      {prov === 'gmail' && smtp?.gmail_service_account && !smtp.gmail_service_account.invalido && (
        <div style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 14, background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.18)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#8aa0cc' }}>Cuenta de servicio guardada</p>
          <p style={{ margin: 0, fontSize: 12, color: '#bfe4ff', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {smtp.gmail_service_account.client_email}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#8aa0cc' }}>
            Id de cliente para la consola de administración:{' '}
            <strong style={{ color: '#bfe4ff', fontFamily: 'monospace' }}>{smtp.gmail_service_account.client_id}</strong>
          </p>
        </div>
      )}

      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
        {info.ayuda}
        {info.alta && <> Alta en <strong>{info.alta}</strong>.</>}
        {' '}Para borrar un dato guardado escribe <strong>BORRAR</strong> en su casilla.
      </p>

      {msg && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80', background: 'rgba(74,222,128,.08)', padding: '8px 12px', borderRadius: 8 }}>{msg}</p>}
      {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-word' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => guardar.mutate({ ...form, email_provider: prov })}
          disabled={!hayAlgo || guardar.isPending}
          style={{
            fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 10, border: 'none',
            color: '#060d22', cursor: hayAlgo ? 'pointer' : 'not-allowed', opacity: hayAlgo ? 1 : .4,
            background: 'linear-gradient(135deg,#38bdf8,#818cf8)',
          }}
        >
          {guardar.isPending ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={() => probar.mutate()}
          disabled={probar.isPending}
          style={{
            fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: '#aebfe2',
          }}
        >
          {probar.isPending ? 'Probando...' : 'Probar conexión'}
        </button>
      </div>
    </div>
  )
}

export default function AdminSettings() {
  const qc = useQueryClient()

  // La sección abierta vive en la URL (?seccion=tasas) y no en el estado del
  // componente. Antes se perdía en cuanto la página se volvía a montar: al
  // recargar volvías al menú, y un despliegue nuevo —que recarga la pestaña
  // sola cuando entra la versión nueva— te sacaba de donde estabas sin motivo
  // aparente. De paso, el botón Atrás del navegador hace lo esperado y la
  // dirección se puede guardar o compartir.
  const [searchParams, setSearchParams] = useSearchParams()
  const section = SECTIONS.some(s => s.key === searchParams.get('seccion'))
    ? searchParams.get('seccion')
    : null
  const setSection = useCallback((key) => {
    setSearchParams(key ? { seccion: key } : {}, { replace: false })
  }, [setSearchParams])

  const { data: commData, isLoading, isError, refetch: reintentarComisiones } = useQuery({
    queryKey: ['admin-commissions'],
    queryFn: () => api.get('/admin/commissions').then(r => r.data.data),
    enabled: section === 'tasas',
  })

  // Con objeto y no con el array suelto: la firma vieja de React Query no
  // coincide con nada en la versión actual, así que la invalidación se perdía
  // en silencio y la tabla seguía mostrando los valores anteriores.
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['admin-commissions'] }), [qc])

  const actual = SECTIONS.find(s => s.key === section)

  return (
    <FinexyLayout>
      <style>{`select option { background: #0a1628; color: #eaf2ff; } input[type=number]::-webkit-inner-spin-button { opacity: 0.3 }`}</style>
      {/* 1400 y centrado, igual que Órdenes y el resto del panel. Estaba en
          980 sin centrar, de cuando esta pantalla era una sola columna: con
          la tabla de comisiones y los países al lado, sobraba pantalla a la
          derecha y todo quedaba pegado a la izquierda. */}
      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {actual && (
            <button
              onClick={() => setSection(null)}
              style={{
                width: 34, height: 34, borderRadius: 11, cursor: 'pointer', fontSize: 16,
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc',
              }}
            >
              ←
            </button>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#eaf2ff' }}>
              {actual ? actual.title : 'Ajustes'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8aa0cc' }}>
              {actual ? actual.desc : 'Elige qué quieres configurar'}
            </p>
          </div>
        </div>

        {!actual && (
          // auto-fill con minmax en vez de un número fijo de columnas: en el
          // móvil queda una sola y en pantalla ancha llena la fila, sin media
          // queries y sin dejar huecos al añadir secciones nuevas.
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {SECTIONS.map(s => (
              <SectionCard key={s.key} {...s} onClick={() => setSection(s.key)} />
            ))}
          </div>
        )}

        {section === 'tasas' && (
          isLoading ? (
            <div style={{ height: 200, borderRadius: 22, background: 'rgba(255,255,255,.04)' }} />
          ) : isError ? (
            /* Antes, si la consulta fallaba, la sección salía vacía sin decir
               nada y había que recargar a mano — pasaba sobre todo justo
               después de un despliegue, mientras la API reinicia. */
            <div style={{ ...GLASS, padding: '28px 24px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fcd34d' }}>
                No se pudieron cargar las tasas y comisiones
              </p>
              <p style={{ margin: '6px 0 14px', fontSize: 12.5, color: '#8aa0cc' }}>
                Puede ser un corte momentáneo. Vuelve a intentarlo sin recargar la página.
              </p>
              <button onClick={() => reintentarComisiones()}
                style={{
                  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  border: 'none', background: 'rgba(56,189,248,.16)', color: '#38bdf8', cursor: 'pointer',
                }}>
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <MercadoParalelo />
              <RateTester commData={commData} />
              {/* Comisiones y países juntos: los países de la derecha son los
                  que aparecen como destino en la tabla de la izquierda, así
                  que activar uno y ponerle comisión se hace sin cambiar de
                  pantalla. minmax(0,...) evita que la tabla ancha desborde la
                  columna. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 18, alignItems: 'start' }}>
                <CommissionMatrix data={commData} onSaved={refresh} />
                <CountriesManager />
              </div>
            </>
          )
        )}
        {section === 'pagos' && <><CuentasPropiasForm /><StripeKeysForm /><PaymentIntegrations /><KoyweKeysForm /><Global66KeysForm /></>}
        {section === 'correo' && <SmtpForm />}
      </div>
    </FinexyLayout>
  )
}

// ── Cuentas propias de cobro ─────────────────────────────────────────────────
//
// Koywe solo emite cuenta en MXN, ARS y CLP. En las otras seis monedas de
// origen el cliente veía "Transferencia / sube tu comprobante" sin datos
// bancarios: se le pedía transferir sin decirle a dónde. Aquí cada super-admin
// carga la suya, y son suyas: sus clientes ven estas y ningún otro admin las ve.
//
// Los campos los manda el backend por moneda, no están escritos aquí. Un IBAN
// español y una clave PIX brasileña no se parecen, y duplicar esa lista en el
// navegador garantiza que un día deje de coincidir con lo que valida el
// servidor.
function CuentasPropiasForm() {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(null)   // moneda en edición
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const { data } = useQuery({
    queryKey: ['cuentas-propias'],
    queryFn: () => api.get('/admin/cuentas-propias').then(r => r.data.data),
    // Más espaciada que el resto: por dentro pregunta a Koywe por el estado de
    // sus cuentas, y al ritmo general serían cientos de llamadas por hora.
    refetchInterval: 120000,
  })

  const catalogo = data?.catalogo || {}
  const cuentas = data?.cuentas || []
  const porMoneda = Object.fromEntries(cuentas.map(c => [c.moneda, c]))
  const listas = cuentas.filter(c => c.activa && Object.keys(c.datos || {}).length).length
  const conFicha = Object.values(catalogo).filter(i => !i.koywe).length

  const guardar = useMutation({
    mutationFn: ({ moneda, datos, activa }) =>
      api.put(`/admin/cuentas-propias/${moneda}`, { datos, activa }),
    onSuccess: (r) => {
      setMsg(r.data.message); setError(''); setEditando(null); setForm({})
      qc.invalidateQueries({ queryKey: ['cuentas-propias'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo guardar'); setMsg('') },
  })

  const cambiarTarjeta = useMutation({
    mutationFn: ({ moneda, activa }) =>
      api.patch(`/admin/cuentas-propias/${moneda}/tarjeta`, { activa }),
    onSuccess: (r) => {
      setMsg(r.data.message); setError('')
      qc.invalidateQueries({ queryKey: ['cuentas-propias'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo cambiar'); setMsg('') },
  })

  const cambiarIntegracion = useMutation({
    mutationFn: ({ moneda, activa }) =>
      api.patch(`/admin/cuentas-propias/${moneda}/integracion`, { activa }),
    onSuccess: (r) => {
      setMsg(r.data.message); setError('')
      qc.invalidateQueries({ queryKey: ['cuentas-propias'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo cambiar'); setMsg('') },
  })

  const borrar = useMutation({
    mutationFn: (moneda) => api.delete(`/admin/cuentas-propias/${moneda}`),
    onSuccess: () => {
      setMsg('Cuenta eliminada'); setError(''); setEditando(null); setForm({})
      qc.invalidateQueries({ queryKey: ['cuentas-propias'] })
      qc.invalidateQueries({ queryKey: ['payments-config'] })
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo eliminar'); setMsg('') },
  })

  const abrirEdicion = (moneda) => {
    setEditando(moneda)
    setForm({ ...(porMoneda[moneda]?.datos || {}) })
    setError(''); setMsg('')
  }

  const ENTRADA = {
    width: '100%', padding: '9px 11px', borderRadius: 9, fontSize: 13,
    background: 'rgba(2,6,23,.7)', color: '#eaf2ff',
    border: '1px solid rgba(255,255,255,.12)',
  }

  return (
    <div style={{ ...GLASS, padding: '20px 24px' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Mis cuentas de cobro</h3>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: listas ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
              color: listas ? '#4ade80' : '#fcd34d',
            }}>
              {listas ? `${listas} de ${conFicha}` : 'Sin cuentas'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            Dónde te transfieren en los países que Koywe no cubre
          </p>
        </div>
        <span style={{ fontSize: 18, color: '#475569' }}>{abierto ? '⌄' : '›'}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 18 }}>
          <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Los nueve países desde los que se puede enviar. Koywe emite cuenta sola en
            {' '}{(data?.cubiertas_por_koywe || []).join(', ')}; en el resto, tus clientes no ven a
            dónde transferir hasta que cargues una cuenta aquí — y son tuyas, las ven solo
            tus clientes. El interruptor de tarjeta va aparte y aplica a todos.
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(catalogo).map(([moneda, info]) => {
              const cuenta = porMoneda[moneda]
              const cargada = cuenta && Object.keys(cuenta.datos || {}).length > 0
              const enEdicion = editando === moneda
              // Sin fila todavia, encendido: es como se comporta el backend.
              const tarjetaOn = cuenta ? cuenta.tarjeta !== false : true
              // Sin fila, la integracion manda: es como se comportaba antes.
              const integracionOn = cuenta ? cuenta.integracion !== false : true

              // Estado de la cuenta que emite Koywe, cuando aplica.
              const ek = info.estado_koywe
              const koywe = !info.koywe ? {} :
                !ek ? { texto: 'No se pudo consultar a Koywe ahora mismo', color: '#fcd34d' }
                : ek.publicada ? { texto: 'Activa en Koywe — visible para tus clientes', color: '#4ade80' }
                : !ek.habilitada ? { texto: 'Emitida pero deshabilitada en Koywe', color: '#fb923c' }
                : { texto: `Falta rellenar en Koywe: ${(ek.faltan || []).join(', ')}`, color: '#fcd34d' }

              return (
                <div key={moneda} style={{
                  borderRadius: 12, padding: '12px 14px',
                  background: 'rgba(4,10,30,.5)',
                  border: `1px solid ${enEdicion ? 'rgba(56,189,248,.3)' : 'rgba(255,255,255,.07)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={`https://flagcdn.com/w40/${info.bandera}.png`} alt="" width={22}
                      style={{ borderRadius: 3, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#eaf2ff' }}>
                        {info.pais} <span style={{ color: '#64748b', fontWeight: 600 }}>· {moneda}</span>
                      </p>
                      {/* En los de Koywe se muestra el estado REAL de su
                          cuenta, no un "la emite Koywe" fijo: puede estar
                          emitida pero deshabilitada, o sin titular, y entonces
                          al cliente no se le enseña nada aunque aquí pusiera
                          que está cubierta. */}
                      <p style={{ margin: '2px 0 0', fontSize: 11.5, color: info.koywe ? koywe.color : (cargada && cuenta.activa ? '#4ade80' : '#64748b') }}>
                        {info.koywe && integracionOn
                          ? koywe.texto
                          : cargada
                            ? (cuenta.activa ? 'Visible para tus clientes' : 'Cargada, pero apagada')
                            : 'Sin cuenta — no se ofrece transferencia'}
                      </p>
                      {info.koywe && ek?.publicada && ek.banco && (
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#475569' }}>
                          {ek.banco}{ek.numero ? ` · ${ek.numero}` : ''}
                        </p>
                      )}
                    </div>
                    {(
                      <button onClick={() => (enEdicion ? setEditando(null) : abrirEdicion(moneda))}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          border: '1px solid rgba(255,255,255,.14)', background: 'transparent',
                          color: '#c3d2ee', cursor: 'pointer', flexShrink: 0,
                        }}>
                        {enEdicion ? 'Cancelar' : (cargada ? 'Editar' : 'Añadir')}
                      </button>
                    )}
                  </div>

                  {/* Interruptor de tarjeta. Solo donde Stripe puede cobrar
                      de verdad: en el resto de monedas el boton no aparece
                      nunca, y ofrecer un control que no cambia nada confunde
                      mas que ayuda. */}
                  {info.koywe && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, marginTop: 10, paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,.06)',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#c3d2ee' }}>
                          Transferencia por la integración
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                          {integracionOn
                            ? 'Transfieren a la cuenta de Koywe y el cobro se marca solo'
                            : 'Libre: transfieren a tu cuenta y tú apruebas el comprobante'}
                        </p>
                      </div>
                      <button
                        onClick={() => cambiarIntegracion.mutate({ moneda, activa: !integracionOn })}
                        disabled={cambiarIntegracion.isPending}
                        title={integracionOn ? 'Pasar a transferencia libre' : 'Volver a la integración'}
                        style={{
                          width: 42, height: 24, borderRadius: 999, border: 'none', padding: 3,
                          cursor: 'pointer', flexShrink: 0,
                          background: integracionOn ? 'rgba(74,222,128,.28)' : 'rgba(255,255,255,.12)',
                          display: 'flex', justifyContent: integracionOn ? 'flex-end' : 'flex-start',
                        }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: 999,
                          background: integracionOn ? '#4ade80' : '#64748b',
                        }} />
                      </button>
                    </div>
                  )}

                  {!integracionOn && !cargada && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#fcd34d', lineHeight: 1.5 }}>
                      Carga tu cuenta aquí o tus clientes no verán a dónde transferir.
                    </p>
                  )}

                  {info.tiene_tarjeta ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, marginTop: 10, paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,.06)',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#c3d2ee' }}>
                          Pago con tarjeta
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                          {tarjetaOn
                            ? 'Tus clientes pueden pagar con tarjeta desde este pais'
                            : 'Solo transferencia — el boton de tarjeta no aparece'}
                        </p>
                      </div>
                      <button
                        onClick={() => cambiarTarjeta.mutate({ moneda, activa: !tarjetaOn })}
                        disabled={cambiarTarjeta.isPending}
                        title={tarjetaOn ? 'Desactivar tarjeta aqui' : 'Activar tarjeta aqui'}
                        style={{
                          width: 42, height: 24, borderRadius: 999, border: 'none', padding: 3,
                          cursor: 'pointer', flexShrink: 0,
                          background: tarjetaOn ? 'rgba(74,222,128,.28)' : 'rgba(255,255,255,.12)',
                          display: 'flex', justifyContent: tarjetaOn ? 'flex-end' : 'flex-start',
                        }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: 999,
                          background: tarjetaOn ? '#4ade80' : '#64748b',
                        }} />
                      </button>
                    </div>
                  ) : (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#475569' }}>
                      En {moneda} no hay ninguna pasarela de tarjeta — aquí nunca sale ese botón.
                    </p>
                  )}

                  {enEdicion && (
                    <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                      {info.campos.map(c => (
                        <div key={c.clave}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8aa0cc', marginBottom: 4 }}>
                            {c.etiqueta}{c.requerido && <span style={{ color: '#f87171' }}> *</span>}
                          </label>
                          {c.tipo === 'select' ? (
                            <select
                              value={form[c.clave] || ''}
                              onChange={e => setForm(f => ({ ...f, [c.clave]: e.target.value }))}
                              style={ENTRADA}>
                              <option value="">Elegir…</option>
                              {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              value={form[c.clave] || ''}
                              onChange={e => setForm(f => ({ ...f, [c.clave]: e.target.value }))}
                              placeholder={c.ayuda}
                              style={ENTRADA} />
                          )}
                          {c.ayuda && c.tipo !== 'select' && (
                            <p style={{ margin: '3px 0 0', fontSize: 10.5, color: '#475569' }}>{c.ayuda}</p>
                          )}
                        </div>
                      ))}

                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => guardar.mutate({ moneda, datos: form, activa: true })}
                          disabled={guardar.isPending}
                          style={{
                            padding: '9px 16px', borderRadius: 9, border: 'none', fontSize: 12.5,
                            fontWeight: 700, background: 'rgba(56,189,248,.16)', color: '#38bdf8',
                            cursor: 'pointer',
                          }}>
                          {guardar.isPending ? 'Guardando…' : 'Guardar y mostrar'}
                        </button>
                        {cargada && (
                          <>
                            <button
                              onClick={() => guardar.mutate({ moneda, datos: form, activa: !cuenta.activa })}
                              style={{
                                padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                                border: '1px solid rgba(255,255,255,.14)', background: 'transparent',
                                color: '#c3d2ee', cursor: 'pointer',
                              }}>
                              {cuenta.activa ? 'Guardar y ocultar' : 'Guardar y mostrar'}
                            </button>
                            <button
                              onClick={() => borrar.mutate(moneda)}
                              style={{
                                padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                                border: '1px solid rgba(248,113,113,.25)', background: 'transparent',
                                color: '#f87171', cursor: 'pointer',
                              }}>
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {msg && <p style={{ marginTop: 14, fontSize: 12.5, color: '#4ade80' }}>{msg}</p>}
          {error && <p style={{ marginTop: 14, fontSize: 12.5, color: '#f87171' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
