import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
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

// ── Currency Dropdown with live rate ──────────────────────────────────────────
function CurrencyDropdown({ label, value, onChange, options, ratesFrom }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const sel = options.find(o => o.cur === value)

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 200 : 'auto' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{label}</label>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ ...INP, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%', textAlign: 'left', overflow: 'hidden' }}>
        {sel && <FlagImg cur={sel.cur} size={22} />}
        <span style={{ fontWeight: 700, color: '#eaf2ff', whiteSpace: 'nowrap' }}>{sel?.cur}</span>
        {sel?.rate != null && ratesFrom ? (
          <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
            1 {ratesFrom} = {fmt(sel.rate, sel.cur)} {sel.cur}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: '#8aa0cc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{sel?.label}</span>
        )}
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="2.5" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: 'rgba(8,17,48,.99)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.85)', maxHeight: 320, overflowY: 'auto' }}>
          {options.map(o => (
            <button key={o.cur} type="button" onClick={() => { onChange(o.cur); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: value === o.cur ? 'rgba(56,189,248,.1)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <FlagImg cur={o.cur} size={20} />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#eaf2ff', whiteSpace: 'nowrap', width: 36, flexShrink: 0 }}>{o.cur}</span>
              <span style={{ fontSize: 12, color: '#8aa0cc', whiteSpace: 'nowrap', flex: 1 }}>{o.label}</span>
              {o.rate != null && ratesFrom && (
                <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  1 {ratesFrom} = {fmt(o.rate, o.cur)} {o.cur}
                </span>
              )}
              {value === o.cur && <span style={{ color: '#38bdf8', fontSize: 12, marginLeft: 4 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
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
        <CurrencyDropdown label="Desde" value={fromCur} onChange={setFromCur} options={fromOptions} ratesFrom={null} />
        <CurrencyDropdown label="Hacia" value={toCur} onChange={setToCur} options={toOptions} ratesFrom={fromCur} />
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
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(129,140,248,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🗂</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Comisiones por ruta</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Selecciona moneda origen y configura cada destino</p>
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
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8aa0cc' }}>
          Esta % aplica a todos los destinos desde <strong>{countryName(fromCur)}</strong> que no tengan una regla específica configurada abajo.
        </p>
      </div>

      {/* Destination table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(4,10,30,.6)' }}>
              {['Destino', 'Comisión actual', 'Nueva %', 'Aplicar a todos', 'Acciones'].map(h => (
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
                  {/* Input */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ position: 'relative', width: 100 }}>
                      <input type="number" value={edited ? editMap[key] : ''} placeholder={row?.effective_pct?.toFixed(2) ?? '1.50'}
                        onChange={e => handleEdit(tc, e.target.value)} min="0" max="100" step="0.01"
                        style={{ ...INP, width: 100, paddingRight: 26, fontSize: 13 }} />
                      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#8aa0cc', fontSize: 11 }}>%</span>
                    </div>
                  </td>
                  {/* Apply all */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={() => setApplyAll(a => ({ ...a, [key]: !a[key] }))}
                        style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                          background: applyAll[key] ? 'rgba(129,140,248,.5)' : 'rgba(255,255,255,.12)', transition: 'background .2s' }}>
                        <span style={{ position: 'absolute', top: 2, left: applyAll[key] ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                      </button>
                      {applyAll[key] && <span style={{ fontSize: 10, color: '#a78bfa' }}>Todos</span>}
                    </div>
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
export default function AdminSettings() {
  const qc = useQueryClient()

  const { data: commData, isLoading } = useQuery({
    queryKey: ['admin-commissions'],
    queryFn: () => api.get('/admin/commissions').then(r => r.data.data),
  })

  const refresh = useCallback(() => qc.invalidateQueries(['admin-commissions']), [qc])

  return (
    <FinexyLayout>
      <style>{`select option { background: #0a1628; color: #eaf2ff; } input[type=number]::-webkit-inner-spin-button { opacity: 0.3 }`}</style>
      <div style={{ padding: '24px', maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#eaf2ff' }}>Ajustes</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8aa0cc' }}>Comisiones por ruta y simulador de tasas en tiempo real</p>
        </div>

        {isLoading ? (
          <div style={{ height: 200, borderRadius: 22, background: 'rgba(255,255,255,.04)' }} />
        ) : (
          <>
            <RateTester commData={commData} />
            <CommissionMatrix data={commData} onSaved={refresh} />
          </>
        )}
      </div>
    </FinexyLayout>
  )
}
