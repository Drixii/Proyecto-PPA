import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import CountriesManager from './CountriesManager'
import api from '../../services/api'

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
const ISO2 = { CLP:'cl', COP:'co', USD:'us', EUR:'es', PEN:'pe', BRL:'br', MXN:'mx', ARS:'ar', CAD:'ca', VES:'ve' }
const flag = cur => ISO2[cur] ? `https://flagcdn.com/20x15/${ISO2[cur]}.png` : null

function FlagImg({ cur, size = 20 }) {
  const src = flag(cur)
  if (!src) return null
  return <img src={src} alt={cur} style={{ width: size, height: Math.round(size * 0.75), borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
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
              <FlagImg cur={o.cur} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#eaf2ff' }}>{o.cur}</span>
                  <span style={{ fontSize: 12, color: '#8aa0cc' }}>{o.label}</span>
                </div>
                {o.rate != null && ratesFrom && (
                  <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>
                    1 {ratesFrom} = {fmt(o.rate, o.cur)} {o.cur}
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
        {sel && <FlagImg cur={sel.cur} size={22} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: '#eaf2ff' }}>{sel?.cur}</span>
          {sel?.rate != null && ratesFrom ? (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              1 {ratesFrom} = {fmt(sel.rate, sel.cur)} {sel.cur}
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
function RateTester({ commData }) {
  const currencies = commData?.currencies || []
  const labels = commData?.labels || {}
  const [fromCur, setFromCur] = useState('CLP')
  const [toCur, setToCur]   = useState('COP')
  const [amount, setAmount] = useState('100000')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  // Live rates for the selected from currency
  const { data: ratesData } = useQuery({
    queryKey: ['admin-all-rates', fromCur],
    queryFn: () => api.get('/admin/commissions/all-rates', { params: { from_currency: fromCur } }).then(r => r.data.data),
    enabled: !!fromCur,
  })

  useEffect(() => {
    if (fromCur === toCur) {
      const next = currencies.find(c => c !== fromCur)
      if (next) setToCur(next)
    }
    setResult(null)
  }, [fromCur])

  const fromOptions = currencies.map(c => ({ cur: c, label: labels[c] || c, rate: null }))
  const toOptions   = currencies.filter(c => c !== fromCur).map(c => ({
    cur: c, label: labels[c] || c, rate: ratesData?.[c] ?? null,
  }))

  const handleCalc = async () => {
    const amt = parseFloat(String(amount).replace(/\./g,'').replace(',','.'))
    if (!amt || fromCur === toCur) return
    setLoading(true)
    try {
      const r = await api.get('/admin/commissions/preview', { params: { from_currency: fromCur, to_currency: toCur, amount: amt } })
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
        <CurrencyPopup label="Hacia" value={toCur} onChange={setToCur} options={toOptions} ratesFrom={fromCur} />
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Monto a enviar</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" style={{ ...INP, flex: 1 }} />
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

  const destinations = currencies.filter(c => c !== fromCur)

  const getRow = (fc, tc) => matrix.find(r => r.from_currency === fc && r.to_currency === tc)
  const k = (fc, tc) => `${fc}_${tc}`

  // Base % for current from currency
  const currentBase = myFromDefaults[fromCur] ?? globalFromDefaults[fromCur] ?? globalDefault
  const baseSource  = fromCur in myFromDefaults ? 'mine' : (fromCur in globalFromDefaults ? 'global' : 'default')

  useEffect(() => { setBaseEdit('') }, [fromCur])

  const handleEdit = (tc, val) => setEditMap(m => ({ ...m, [k(fromCur, tc)]: val }))

  const showMsg = (key, txt) => {
    setMsgs(m => ({ ...m, [key]: txt }))
    setTimeout(() => setMsgs(m => { const n = {...m}; delete n[key]; return n }), 2500)
  }

  const handleSaveRow = async (tc) => {
    const key = k(fromCur, tc)
    const pct = parseFloat(editMap[key])
    if (isNaN(pct) || pct < 0 || pct > 100) return
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await api.put('/admin/commissions', { from_currency: fromCur, to_currency: tc, commission_pct: pct, apply_to_all: applyAll[key] || false })
      setEditMap(m => { const n = {...m}; delete n[key]; return n })
      showMsg(key, '✓ Guardado')
      qc.invalidateQueries(['admin-commissions'])
      onSaved()
    } catch { showMsg(key, '✗ Error') }
    finally { setSaving(s => ({ ...s, [key]: false })) }
  }

  const handleReset = async (tc) => {
    const key = k(fromCur, tc)
    try {
      await api.delete('/admin/commissions', { data: { from_currency: fromCur, to_currency: tc } })
      showMsg(key, '↩ Reseteado')
      qc.invalidateQueries(['admin-commissions'])
      onSaved()
    } catch {}
  }

  const handleSaveBase = async () => {
    const pct = parseFloat(baseEdit)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    setBaseSaving(true)
    try {
      await api.put('/admin/commissions', { from_currency: fromCur, to_currency: '*', commission_pct: pct, apply_to_all: false })
      setBaseEdit('')
      setBaseMsg('✓ Base guardada')
      setTimeout(() => setBaseMsg(''), 2500)
      qc.invalidateQueries(['admin-commissions'])
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

      {/* FROM tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {currencies.map(c => (
          <button key={c} onClick={() => setFromCur(c)}
            style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 6,
              background: fromCur === c ? 'rgba(56,189,248,.18)' : 'rgba(255,255,255,.06)',
              color: fromCur === c ? '#eaf2ff' : '#8aa0cc',
              outline: fromCur === c ? '1px solid rgba(56,189,248,.4)' : 'none' }}>
            <FlagImg cur={c} size={18} />
            {c}
          </button>
        ))}
      </div>

      {/* Per-country base commission */}
      <div style={{ background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.15)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FlagImg cur={fromCur} size={20} />
          <span style={{ fontSize: 13, color: '#aebfe2' }}>
            Comisión base para <strong style={{ color: '#eaf2ff' }}>{countryName(fromCur)}</strong>:
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
            {destinations.map(tc => {
              const row = getRow(fromCur, tc)
              const key = k(fromCur, tc)
              const edited = editMap[key] !== undefined
              const src = row?.source || 'default'
              const srcStyle = SRC_STYLE[src] || SRC_STYLE.default
              const hasOwn = row?.my_pct != null

              return (
                <tr key={tc} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  {/* Destino */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FlagImg cur={tc} size={18} />
                      <span style={{ color: '#eaf2ff', fontWeight: 600 }}>{tc}</span>
                      <span style={{ fontSize: 12, color: '#8aa0cc' }}>{countryName(tc)}</span>
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
                      <button onClick={() => handleSaveRow(tc)} disabled={!edited || saving[key]}
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

      {/* Legend */}
      <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: '#8aa0cc' }}>
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
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Claves de Stripe</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            {claves?.listo
              ? 'Cobrando con las claves de este modo'
              : claves?.secret_key
                ? 'Falta el secreto del webhook — el pago con tarjeta sigue oculto'
                : 'Sin configurar — el pago con tarjeta está oculto para los clientes'}
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
                    flex: 1, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: activo ? 'default' : 'pointer',
                    fontSize: 12.5, fontWeight: 700,
                    background: activo ? (v === 'test' ? 'rgba(251,191,36,.16)' : 'rgba(74,222,128,.16)') : 'transparent',
                    color: activo ? (v === 'test' ? '#fcd34d' : '#4ade80') : '#8aa0cc',
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
                  flex: 1, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: activo ? 'default' : 'pointer',
                  fontSize: 12.5, fontWeight: 700,
                  background: activo ? (v === 'test' ? 'rgba(251,191,36,.16)' : 'rgba(74,222,128,.16)') : 'transparent',
                  color: activo ? (v === 'test' ? '#fcd34d' : '#4ade80') : '#8aa0cc',
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
    { k: 'banco', label: 'Banco', ph: 'entidad donde está la cuenta', obligatorio: true },
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
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
        Koywe emite una cuenta bancaria real por país. Si rellenas el titular y el banco,
        el cliente que elija «Transferencia» en esa moneda ve estos datos y el dinero cae
        directo en tu saldo de ese país, sin pasar por una cuenta tuya. Sin esos dos datos
        la cuenta no se muestra: media instrucción de pago es peor que ninguna.
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
              {c.publicada ? 'Visible para clientes' : `Falta ${(c.faltan || []).join(' y ')}`}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8aa0cc' }}>{c.numero}</span>
          </div>

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

          <button
            onClick={() => guardar.mutate({
              moneda: c.moneda,
              ...Object.fromEntries(campos.map(({ k }) => [k, valor(c.moneda, k, c[k])])),
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
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Stripe</h3>
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

export default function AdminSettings() {
  const qc = useQueryClient()
  const [section, setSection] = useState(null)

  const { data: commData, isLoading } = useQuery({
    queryKey: ['admin-commissions'],
    queryFn: () => api.get('/admin/commissions').then(r => r.data.data),
    enabled: section === 'tasas',
  })

  const refresh = useCallback(() => qc.invalidateQueries(['admin-commissions']), [qc])

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
          ) : (
            <>
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
        {section === 'pagos' && <><StripeKeysForm /><PaymentIntegrations /><KoyweKeysForm /><Global66KeysForm /></>}
      </div>
    </FinexyLayout>
  )
}
