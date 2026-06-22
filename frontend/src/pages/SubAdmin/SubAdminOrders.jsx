import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import SlidePanel from '../../components/SlidePanel'
import Portal from '../../components/Portal'
import StatusBadge from '../../components/StatusBadge'
import DateRangePicker from '../../components/DateRangePicker'
import api from '../../services/api'
import { flagUrl } from '../../utils/flags'
import { useStore } from '../../store/useStore'
import { fmtDateShort, userTz } from '../../utils/timezone'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const today = new Date()
const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
const todayEnd   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

const STATUS_DOT = {
  en_aprobacion: '#fb923c',
  en_proceso: '#60a5fa',
  completado: '#4ade80',
}

const STATUSES = [
  { key: '', label: 'Todos' },
  { key: 'en_aprobacion', label: 'En Aprobación', dot: '#fb923c' },
  { key: 'en_proceso', label: 'En Proceso', dot: '#60a5fa' },
  { key: 'completado', label: 'Completado', dot: '#4ade80' },
]

function OrderDetailPanel({ order, onClose }) {
  const qc = useQueryClient()
  const [showCompletePopup, setShowCompletePopup] = useState(false)
  const [proofFile, setProofFile] = useState(null)

  const completeMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('completion_proof', proofFile)
      return api.post(`/sub-admin/orders/${order.id}/complete`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-admin-orders-table'] })
      qc.invalidateQueries({ queryKey: ['sub-admin-orders'] })
      setShowCompletePopup(false)
      setProofFile(null)
      onClose()
    },
  })

  const apiBase = import.meta.env.VITE_API_URL || ''
  const proofUrl = order.payment_proof ? `${apiBase}/uploads/proofs/${order.payment_proof}` : null
  const proofIsImage = proofUrl && /\.(jpg|jpeg|png|webp)$/i.test(proofUrl)
  const completionProofUrl = order.completion_proof_url ? (order.completion_proof_url.startsWith('http') ? order.completion_proof_url : `${apiBase}${order.completion_proof_url}`) : null
  const completionIsImage = completionProofUrl && /\.(jpg|jpeg|png|webp)$/i.test(completionProofUrl)

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <StatusBadge status={order.status} />
        <span className="font-mono text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</span>
      </div>

      {order.status === 'en_proceso' && (
        <button
          onClick={() => setShowCompletePopup(true)}
          className="w-full font-bold py-3 rounded-xl transition-all"
          style={{background:'linear-gradient(to right, #22c55e, #15803d)', color:'#fff'}}
        >
          ✓ Marcar como Completado
        </button>
      )}

      {/* Amounts */}
      <div className="rounded-2xl p-5" style={GLASS}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs" style={{color:'#8aa0cc'}}>Enviaste</p>
            <p className="text-xl font-bold" style={{color:'#eaf2ff'}}>{order.amount_sent?.toLocaleString()} <span className="text-sm" style={{color:'#8aa0cc'}}>{order.currency_from}</span></p>
          </div>
          <span className="text-2xl" style={{color:'#38bdf8'}}>→</span>
          <div className="text-right">
            <p className="text-xs" style={{color:'#8aa0cc'}}>Recibirá</p>
            <p className="text-xl font-bold" style={{color:'#4ade80'}}>{order.amount_received?.toLocaleString()} <span className="text-sm" style={{color:'#4ade80'}}>{order.currency_to}</span></p>
          </div>
        </div>
      </div>

      {/* Receptor */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Receptor</p>
        <div className="rounded-xl px-4" style={GLASS}>
          {[
            ['Nombre', order.receiver_name],
            ['Teléfono', order.receiver_phone],
            ['País', order.receiver_country],
            ['Banco', order.receiver_bank_name],
            ['Cuenta', order.receiver_account],
            [order.receiver_id_type || 'ID', order.receiver_id_num],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex justify-between items-start py-2" style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
              <span className="text-sm shrink-0 w-36" style={{color:'#8aa0cc'}}>{label}</span>
              <span className="text-sm font-medium text-right" style={{color:'#eaf2ff'}}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Remitente */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Remitente</p>
        <div className="rounded-xl px-4" style={GLASS}>
          {[
            ['Nombre', order.sender_name],
            ['Teléfono', order.sender_phone],
            ['País', order.sender_country],
            [order.sender_id_type || 'ID', order.sender_id_num],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex justify-between items-start py-2" style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
              <span className="text-sm shrink-0 w-36" style={{color:'#8aa0cc'}}>{label}</span>
              <span className="text-sm font-medium text-right" style={{color:'#eaf2ff'}}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {proofUrl && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Comprobante pago</p>
          <div className="rounded-2xl overflow-hidden" style={GLASS}>
            {proofIsImage ? (
              <img src={proofUrl} alt="Comprobante" className="w-full max-h-80 object-contain" />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <p className="text-sm" style={{color:'#8aa0cc'}}>PDF</p>
                <a href={proofUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>Abrir archivo →</a>
              </div>
            )}
          </div>
        </div>
      )}

      {completionProofUrl && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Prueba de envío</p>
          <div className="rounded-2xl overflow-hidden" style={{background:'rgba(74,222,128,.05)', border:'1px solid rgba(74,222,128,.15)'}}>
            {completionIsImage ? (
              <img src={completionProofUrl} alt="Prueba de envío" className="w-full max-h-80 object-contain" />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <p className="text-sm" style={{color:'#8aa0cc'}}>PDF</p>
                <a href={completionProofUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>Abrir archivo →</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete confirmation popup — Portal to escape SlidePanel transform */}
      {showCompletePopup && (
        <Portal>
          <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" style={GLASS}>
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{background:'rgba(74,222,128,.1)'}}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold" style={{color:'#eaf2ff'}}>Confirmar completado</h3>
                    <p className="text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</p>
                  </div>
                </div>

                <div className="rounded-xl p-4 mb-4 text-sm space-y-1" style={{background:'rgba(74,222,128,.08)', color:'#4ade80'}}>
                  <p><strong>Receptor:</strong> {order.receiver_name}</p>
                  <p><strong>País:</strong> {order.receiver_country}</p>
                  <p><strong>Monto a recibir:</strong> {order.amount_received?.toLocaleString()} {order.currency_to}</p>
                </div>

                {/* File upload */}
                <div className="mb-4">
                  <p className="text-xs font-semibold mb-1.5" style={{color:'#8aa0cc'}}>Comprobante de transferencia <span style={{color:'#f87171'}}>*</span></p>
                  <label
                    className="flex items-center gap-2.5 rounded-xl px-4 py-3 cursor-pointer transition-colors"
                    style={proofFile ? {background:'rgba(74,222,128,.08)', border:'2px dashed rgba(74,222,128,.4)'} : {background:'rgba(6,13,40,.8)', border:'2px dashed rgba(255,255,255,.1)'}}
                  >
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      className="hidden"
                      onChange={e => setProofFile(e.target.files?.[0] || null)}
                    />
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={proofFile ? {color:'#4ade80'} : {color:'#8aa0cc'}}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className={`text-sm ${proofFile ? 'font-medium' : ''}`} style={proofFile ? {color:'#4ade80'} : {color:'#8aa0cc'}}>
                      {proofFile ? proofFile.name : 'Seleccionar comprobante (jpg/png/pdf)'}
                    </span>
                  </label>
                  {!proofFile && (
                    <p className="text-[11px] mt-1" style={{color:'#f87171'}}>Debes subir el comprobante antes de completar.</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCompletePopup(false); setProofFile(null) }}
                    className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    style={{border:'1px solid rgba(255,255,255,.1)', color:'#aebfe2', background:'transparent'}}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending || !proofFile}
                    className="flex-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold py-2.5 rounded-xl transition-all"
                    style={{background:'linear-gradient(to right, #22c55e, #15803d)', color:'#fff'}}
                  >
                    {completeMutation.isPending ? 'Completando...' : 'Sí, completar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

export default function SubAdminOrders() {
  const { user } = useStore()
  const tz = userTz(user)
  const qc = useQueryClient()
  const [dateRange, setDateRange] = useState({ from: todayStart, to: todayEnd })
  const [statusFilter, setStatusFilter] = useState('')
  const [adminFilter, setAdminFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [search, setSearch] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sub-admin-orders-table', dateRange, statusFilter],
    queryFn: () => api.get('/sub-admin/orders', {
      params: {
        ...(dateRange ? {
          date_from: dateRange.from.toISOString(),
          date_to: dateRange.to.toISOString(),
        } : {}),
        status: statusFilter || undefined,
        page_size: 500,
      }
    }).then(r => r.data.data.items),
    refetchInterval: 30000,
  })

  const adminNames = [...new Set((data || []).map(o => o.super_admin_name).filter(Boolean))]
  const orders = (data || [])
    .filter(o => {
      if (adminFilter && o.super_admin_name !== adminFilter) return false
      if (!search) return true
      const s = search.toLowerCase()
      return o.sender_name?.toLowerCase().includes(s)
        || o.receiver_name?.toLowerCase().includes(s)
        || o.order_number?.toLowerCase().includes(s)
        || o.receiver_country?.toLowerCase().includes(s)
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{color:'#eaf2ff'}}>Mis Órdenes</h1>
            <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>{orders.length} resultado{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => refetch()} className="text-xs hover:underline flex items-center gap-1" style={{color:'#38bdf8'}}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'#38bdf8'}} />
            Actualizar
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <DateRangePicker value={dateRange || { from: todayStart, to: todayEnd }} onChange={setDateRange} />

          <div className="flex items-center gap-1.5 rounded-xl px-2 py-1.5" style={{background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.07)'}}>
            {STATUSES.map(s => (
              <button key={s.key} onClick={() => setStatusFilter(s.key)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={statusFilter === s.key ? {background:'linear-gradient(135deg,#1e3a6e,#1e40af)', color:'#fff'} : {color:'#8aa0cc'}}>
                {s.key && <span style={{display:'inline-block', width:'6px', height:'6px', borderRadius:'50%', background:s.dot || STATUS_DOT[s.key], marginRight:'6px'}} />}
                {s.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-48 max-w-xs">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:'#8aa0cc'}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              className="w-full rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
          </div>
          {adminNames.length > 1 && (
            <select value={adminFilter} onChange={e => setAdminFilter(e.target.value)}
              className="rounded-xl px-3 py-2 text-xs focus:outline-none"
              style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color: adminFilter ? '#fcd34d' : '#8aa0cc'}}>
              <option value="">Todos los admins</option>
              {adminNames.map(n => <option key={n}>{n}</option>)}
            </select>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'En Aprobación', count: (data || []).filter(o => o.status === 'en_aprobacion').length, color: '#fb923c' },
            { label: 'En Proceso', count: (data || []).filter(o => o.status === 'en_proceso').length, color: '#60a5fa' },
            { label: 'Completado', count: (data || []).filter(o => o.status === 'completado').length, color: '#4ade80' },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-xl p-4 text-center" style={GLASS}>
              <p className="text-2xl font-bold" style={{color}}>{count}</p>
              <p className="text-xs mt-0.5" style={{color:'#8aa0cc'}}>{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden" style={GLASS}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-3" style={{color:'#64748b'}}>Order ID</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Cliente</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Receptor</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Monto</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>{Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-3 rounded animate-pulse w-24" style={{background:'rgba(255,255,255,.06)'}} /></td>
                  ))}</tr>
                ))}
                {!isLoading && orders.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-sm" style={{color:'#475569'}}>Sin órdenes</td></tr>
                )}
                {!isLoading && orders.map(order => (
                  <tr key={order.id} onClick={() => setSelectedOrder(order)} className="cursor-pointer transition-colors"
                    style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-5 py-4"><span className="font-mono text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</span></td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {order.sender_name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium" style={{color:'#eaf2ff'}}>{order.sender_name}</span>
                          {order.super_admin_name && <p className="text-[10px]" style={{color:'#475569'}}>via {order.super_admin_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium" style={{color:'#aebfe2'}}>{order.receiver_name}</p>
                      <span className="inline-flex items-center gap-1 text-xs" style={{color:'#8aa0cc'}}>
                        {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                        {order.receiver_country}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.amount_sent?.toLocaleString()} <span className="text-xs" style={{color:'#8aa0cc'}}>{order.currency_from}</span></p>
                      <p className="text-xs" style={{color:'#4ade80'}}>{order.amount_received?.toLocaleString()} {order.currency_to}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <div style={{width:'8px', height:'8px', borderRadius:'50%', background:STATUS_DOT[order.status] || '#64748b', flexShrink:0}} />
                        <span className="text-xs" style={{color:'#aebfe2'}}>{order.status?.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs" style={{color:'#8aa0cc'}}>
                        {fmtDateShort(order.created_at, tz)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button className="text-lg" style={{background:'rgba(56,189,248,.1)', color:'#7dd3fc', border:'1px solid rgba(56,189,248,.15)', borderRadius:'4px', padding:'2px 8px'}}>···</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SlidePanel
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.sender_name || ''}
        subtitle={selectedOrder ? `${selectedOrder.order_number} · ${selectedOrder.receiver_name} → ${selectedOrder.receiver_country}` : ''}
      >
        {selectedOrder && <OrderDetailPanel order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      </SlidePanel>
    </FinexyLayout>
  )
}
