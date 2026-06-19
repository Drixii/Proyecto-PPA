import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function AdminSettings() {
  const [commission, setCommission] = useState('')
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings').then(r => r.data.data),
  })

  useEffect(() => {
    if (data) setCommission(String(data.commission_pct))
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (value) => api.put('/admin/settings', { commission_pct: parseFloat(value) }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000) },
  })

  const handleSave = (e) => {
    e.preventDefault()
    const val = parseFloat(commission)
    if (isNaN(val) || val < 0 || val > 100) return
    saveMutation.mutate(val)
  }

  const inputStyle = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff' }

  return (
    <FinexyLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div className="mb-2">
          <h1 className="text-2xl font-bold">Ajustes</h1>
          <p className="text-sm mt-1" style={{ color:'#8aa0cc' }}>Configuración de la casa de cambios</p>
        </div>

        {/* ── Commission ── */}
        <div className="rounded-2xl p-8" style={GLASS}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:'rgba(56,189,248,.12)', color:'#38bdf8' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold">Comisión por transferencia</h2>
              <p className="text-xs" style={{ color:'#8aa0cc' }}>Porcentaje cobrado al monto enviado</p>
            </div>
          </div>

          {isLoading ? (
            <div className="h-12 rounded-xl animate-pulse" style={{ background:'rgba(255,255,255,.06)' }} />
          ) : (
            <form onSubmit={handleSave} className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-2" style={{ color:'#aebfe2' }}>Porcentaje de comisión</label>
                <div className="relative">
                  <input type="number" value={commission} onChange={e => setCommission(e.target.value)}
                    min="0" max="100" step="0.1"
                    className="w-full rounded-xl px-4 py-3 pr-10 text-2xl font-bold focus:outline-none"
                    style={inputStyle} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-lg" style={{ color:'#8aa0cc' }}>%</span>
                </div>
                <p className="text-xs mt-2" style={{ color:'#8aa0cc' }}>
                  Con {commission || '?'}%: envío de $100.000 → comisión ${commission ? Math.round(100000 * parseFloat(commission) / 100).toLocaleString() : '?'} → se cambian ${commission ? Math.round(100000 * (1 - parseFloat(commission)/100)).toLocaleString() : '?'}
                </p>
              </div>
              <button type="submit" disabled={saveMutation.isPending}
                className="bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-all">
                {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </form>
          )}
          {saved && (
            <div className="mt-4 border text-sm px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:'rgba(74,222,128,.08)', borderColor:'rgba(74,222,128,.2)', color:'#4ade80' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Comisión guardada. Se aplicará a las próximas órdenes.
            </div>
          )}
        </div>

        {/* Preview table */}
        {commission && !isNaN(parseFloat(commission)) && (
          <div className="rounded-2xl overflow-hidden" style={GLASS}>
            <div className="px-6 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <h3 className="text-sm font-semibold">Vista previa de comisión</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background:'rgba(4,10,30,.6)' }}>
                  <th className="text-left text-xs font-medium px-6 py-3" style={{ color:'#64748b' }}>Monto enviado</th>
                  <th className="text-left text-xs font-medium px-4 py-3" style={{ color:'#64748b' }}>Comisión</th>
                  <th className="text-left text-xs font-medium px-4 py-3" style={{ color:'#64748b' }}>Se cambian</th>
                </tr>
              </thead>
              <tbody>
                {[50000, 100000, 200000, 500000, 1000000].map(amount => {
                  const pct = parseFloat(commission)
                  const fee = Math.round(amount * pct / 100)
                  const net = amount - fee
                  return (
                    <tr key={amount}>
                      <td className="px-6 py-3 font-semibold" style={{ color:'#eaf2ff', borderBottom:'1px solid rgba(255,255,255,.04)' }}>${amount.toLocaleString()} CLP</td>
                      <td className="px-4 py-3 text-red-500 font-medium">–${fee.toLocaleString()}</td>
                      <td className="px-4 py-3 text-green-600 font-bold">${net.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </FinexyLayout>
  )
}
