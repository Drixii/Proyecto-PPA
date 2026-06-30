import { useState, useEffect, useCallback } from 'react'
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

const inp = {
  background: 'rgba(6,13,40,.8)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 10,
  color: '#eaf2ff',
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

function fmt(n, cur) {
  if (n == null) return '—'
  const isInt = ['CLP', 'COP', 'VES', 'ARS'].includes(cur)
  return isInt ? Math.round(n).toLocaleString('es-CL') : Number(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Global Default Section ───────────────────────────────────────────────────
function GlobalDefault({ data, onSaved }) {
  const [val, setVal] = useState('')
  useEffect(() => { if (data) setVal(String(data.global_default)) }, [data])
  const [ok, setOk] = useState(false)

  const mut = useMutation({
    mutationFn: v => api.put('/admin/settings', { commission_pct: parseFloat(v) }),
    onSuccess: () => { setOk(true); setTimeout(() => setOk(false), 3000); onSaved() },
  })

  return (
    <div style={{ ...GLASS, padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(56,189,248,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#38bdf8" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Comisión base global</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Aplica a rutas sin regla específica</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ position: 'relative' }}>
            <input type="number" value={val} onChange={e => setVal(e.target.value)} min="0" max="100" step="0.01"
              style={{ ...inp, fontSize: 22, fontWeight: 700, paddingRight: 36 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#8aa0cc', fontWeight: 700 }}>%</span>
          </div>
        </div>
        <button onClick={() => { const v = parseFloat(val); if (!isNaN(v) && v >= 0 && v <= 100) mut.mutate(val) }}
          disabled={mut.isPending}
          style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          {mut.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {ok && <p style={{ marginTop: 10, fontSize: 12, color: '#4ade80' }}>✓ Guardado correctamente</p>}
    </div>
  )
}

// ── Commission Matrix ─────────────────────────────────────────────────────────
function CommissionMatrix({ data, onSaved }) {
  const qc = useQueryClient()
  const [fromCur, setFromCur] = useState('CLP')
  const [editMap, setEditMap] = useState({})   // key → string
  const [saving, setSaving] = useState({})
  const [applyAll, setApplyAll] = useState({}) // key → bool
  const [msgs, setMsgs] = useState({})

  const currencies = data?.currencies || []
  const flags = data?.flags || {}
  const labels = data?.labels || {}
  const matrix = data?.matrix || []

  const getRow = (fc, tc) => matrix.find(r => r.from_currency === fc && r.to_currency === tc)
  const key = (fc, tc) => `${fc}_${tc}`

  const destinations = currencies.filter(c => c !== fromCur)

  const handleEdit = (tc, val) => setEditMap(m => ({ ...m, [key(fromCur, tc)]: val }))

  const handleSave = async (tc) => {
    const k = key(fromCur, tc)
    const raw = editMap[k]
    const pct = parseFloat(raw)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    setSaving(s => ({ ...s, [k]: true }))
    try {
      await api.put('/admin/commissions', {
        from_currency: fromCur,
        to_currency: tc,
        commission_pct: pct,
        apply_to_all: applyAll[k] || false,
      })
      setMsgs(m => ({ ...m, [k]: '✓' }))
      setTimeout(() => setMsgs(m => { const n = { ...m }; delete n[k]; return n }), 2000)
      setEditMap(m => { const n = { ...m }; delete n[k]; return n })
      qc.invalidateQueries(['admin-commissions'])
      onSaved()
    } catch {
      setMsgs(m => ({ ...m, [k]: '✗ Error' }))
    } finally {
      setSaving(s => ({ ...s, [k]: false }))
    }
  }

  const handleReset = async (tc) => {
    const k = key(fromCur, tc)
    try {
      await api.delete('/admin/commissions', { data: { from_currency: fromCur, to_currency: tc } })
      setMsgs(m => ({ ...m, [k]: '↩ Reseteado' }))
      setTimeout(() => setMsgs(m => { const n = { ...m }; delete n[k]; return n }), 2000)
      qc.invalidateQueries(['admin-commissions'])
      onSaved()
    } catch {}
  }

  const sourceColor = s => s === 'mine' ? '#38bdf8' : s === 'global_rule' ? '#a78bfa' : '#8aa0cc'
  const sourceLabel = s => s === 'mine' ? 'Tuya' : s === 'global_rule' ? 'Global' : 'Base'

  return (
    <div style={{ ...GLASS, padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(129,140,248,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🗂</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Comisiones por ruta</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Elige moneda origen y configura cada destino</p>
        </div>
      </div>

      {/* FROM tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {currencies.map(c => (
          <button key={c} onClick={() => setFromCur(c)}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: fromCur === c ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.06)',
              color: fromCur === c ? '#38bdf8' : '#8aa0cc',
              outline: fromCur === c ? '1px solid rgba(56,189,248,.35)' : 'none' }}>
            {flags[c]} {c}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#8aa0cc', marginBottom: 14 }}>
        Desde <strong style={{ color: '#eaf2ff' }}>{flags[fromCur]} {labels[fromCur]}</strong> hacia:
      </p>

      {/* Destination table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(4,10,30,.6)' }}>
              {['Destino', 'Comisión actual', 'Nueva comisión %', 'Aplicar a todos', 'Acciones'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#8aa0cc', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {destinations.map(tc => {
              const row = getRow(fromCur, tc)
              const k = key(fromCur, tc)
              const edited = editMap[k] !== undefined
              const displayPct = edited ? editMap[k] : (row?.effective_pct ?? data?.global_default ?? 1.5)
              const src = row?.source || 'default'
              const hasOwn = row?.my_pct != null

              return (
                <tr key={tc} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  {/* Destino */}
                  <td style={{ padding: '10px 12px', color: '#eaf2ff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {flags[tc]} {labels[tc]}
                  </td>
                  {/* Actual */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: sourceColor(src) }}>
                      {row?.effective_pct?.toFixed(2) ?? (data?.global_default?.toFixed(2) ?? '1.50')}%
                    </span>
                    <span style={{ marginLeft: 6, fontSize: 10, color: sourceColor(src), background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>
                      {sourceLabel(src)}
                    </span>
                  </td>
                  {/* Input */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ position: 'relative', width: 110 }}>
                      <input type="number" value={edited ? editMap[k] : ''} placeholder={row?.effective_pct?.toFixed(2) ?? '1.50'}
                        onChange={e => handleEdit(tc, e.target.value)}
                        min="0" max="100" step="0.01"
                        style={{ ...inp, width: 110, paddingRight: 28, fontSize: 13 }} />
                      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#8aa0cc', fontSize: 12 }}>%</span>
                    </div>
                  </td>
                  {/* Apply all toggle */}
                  <td style={{ padding: '10px 12px' }}>
                    <button type="button" onClick={() => setApplyAll(a => ({ ...a, [k]: !a[k] }))}
                      style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
                        background: applyAll[k] ? 'rgba(129,140,248,.5)' : 'rgba(255,255,255,.12)', transition: 'background .2s' }}>
                      <span style={{ position: 'absolute', top: 2, left: applyAll[k] ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                    </button>
                    {applyAll[k] && <span style={{ marginLeft: 6, fontSize: 10, color: '#a78bfa' }}>Todos</span>}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => handleSave(tc)} disabled={!edited || saving[k]}
                        style={{ padding: '5px 14px', borderRadius: 8, border: 'none', cursor: edited ? 'pointer' : 'not-allowed',
                          background: edited ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'rgba(255,255,255,.06)',
                          color: edited ? '#fff' : '#8aa0cc', fontWeight: 600, fontSize: 12 }}>
                        {saving[k] ? '...' : 'Guardar'}
                      </button>
                      {hasOwn && (
                        <button onClick={() => handleReset(tc)}
                          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
                          ↩
                        </button>
                      )}
                      {msgs[k] && <span style={{ fontSize: 12, color: msgs[k].startsWith('✓') || msgs[k].startsWith('↩') ? '#4ade80' : '#f87171' }}>{msgs[k]}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 11, color: '#8aa0cc' }}>
        <span><span style={{ color: '#38bdf8' }}>●</span> Tuya = tu comisión personalizada</span>
        <span><span style={{ color: '#a78bfa' }}>●</span> Global = compartida con todos</span>
        <span><span style={{ color: '#8aa0cc' }}>●</span> Base = porcentaje base global</span>
        <span>↩ = resetear a valor por defecto</span>
      </div>
    </div>
  )
}

// ── Live Rate Tester ──────────────────────────────────────────────────────────
function RateTester({ data }) {
  const currencies = data?.currencies || []
  const flags = data?.flags || {}
  const labels = data?.labels || {}

  const [fromCur, setFromCur] = useState('CLP')
  const [toCur, setToCur] = useState('COP')
  const [amount, setAmount] = useState('100000')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const selStyle = { ...inp, cursor: 'pointer' }

  const handlePreview = async () => {
    const amt = parseFloat(amount.replace(/\./g, '').replace(',', '.'))
    if (!amt || fromCur === toCur) return
    setLoading(true)
    try {
      const r = await api.get('/admin/commissions/preview', { params: { from_currency: fromCur, to_currency: toCur, amount: amt } })
      setResult(r.data.data)
    } catch { setResult(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (fromCur === toCur) setToCur(currencies.find(c => c !== fromCur) || '') }, [fromCur])

  return (
    <div style={{ ...GLASS, padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(74,222,128,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📊</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Simulador de tasas en tiempo real</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#8aa0cc' }}>Prueba cualquier conversión con tu comisión aplicada</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Desde</label>
          <select value={fromCur} onChange={e => setFromCur(e.target.value)} style={selStyle}>
            {currencies.map(c => <option key={c} value={c}>{flags[c]} {c} — {labels[c]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Hacia</label>
          <select value={toCur} onChange={e => setToCur(e.target.value)} style={selStyle}>
            {currencies.filter(c => c !== fromCur).map(c => <option key={c} value={c}>{flags[c]} {c} — {labels[c]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8aa0cc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Monto</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" style={inp} />
        </div>
        <button onClick={handlePreview} disabled={loading}
          style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#4ade80,#22c55e)', border: 'none', borderRadius: 10, color: '#061027', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', height: 40 }}>
          {loading ? '...' : 'Calcular'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Tasa de cambio', value: result.rate ? `1 ${fromCur} = ${fmt(result.rate, toCur)} ${toCur}` : 'No disponible', color: '#38bdf8' },
            { label: 'Comisión aplicada', value: `${result.commission_pct?.toFixed(2)}%`, color: '#fbbf24' },
            { label: `Comisión (${fromCur})`, value: `${fmt(result.fee, fromCur)} ${fromCur}`, color: '#f87171' },
            { label: `Monto neto (${fromCur})`, value: `${fmt(result.net_amount, fromCur)} ${fromCur}`, color: '#aebfe2' },
            { label: `Cliente recibe (${toCur})`, value: result.amount_received != null ? `${fmt(result.amount_received, toCur)} ${toCur}` : '—', color: '#4ade80' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '14px 16px' }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, color: '#8aa0cc' }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}
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
      <div style={{ padding: '24px', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#eaf2ff' }}>Ajustes</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8aa0cc' }}>Comisiones por ruta y simulador de tasas</p>
        </div>

        {isLoading ? (
          <div style={{ height: 200, borderRadius: 22, background: 'rgba(255,255,255,.04)', animation: 'pulse 1.5s infinite' }} />
        ) : (
          <>
            <GlobalDefault data={commData} onSaved={refresh} />
            <CommissionMatrix data={commData} onSaved={refresh} />
            <RateTester data={commData} />
          </>
        )}
      </div>
    </FinexyLayout>
  )
}
