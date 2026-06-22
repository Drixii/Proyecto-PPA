import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { fmtDate, userTz } from '../../utils/timezone'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import OrderCard from '../../components/OrderCard'
import SlidePanel from '../../components/SlidePanel'
import Portal from '../../components/Portal'
import DateRangePicker from '../../components/DateRangePicker'
import StatusBadge from '../../components/StatusBadge'
import { CountryWithFlag } from '../../utils/flags'
import api from '../../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0)
const todayEnd   = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59)

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2 last:border-0" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
      <span className="text-sm shrink-0 w-36" style={{color:'#8aa0cc'}}>{label}</span>
      <span className="text-sm font-medium text-right" style={{color:'#eaf2ff'}}>{value}</span>
    </div>
  )
}

function OrderDetail({ order, onClose }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState('resumen')
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
      qc.invalidateQueries({ queryKey: ['sub-admin-orders'] })
      setShowCompletePopup(false)
      setProofFile(null)
      onClose()
    },
  })

  const proofUrl = order.payment_proof ? `/uploads/proofs/${order.payment_proof}` : null
  const proofIsImage = proofUrl && /\.(jpg|jpeg|png|webp)$/i.test(proofUrl)
  const completionProofUrl = order.completion_proof_url || null
  const completionIsImage = completionProofUrl && /\.(jpg|jpeg|png|webp)$/i.test(completionProofUrl)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 flex items-center justify-between shrink-0" style={{background:'rgba(8,16,44,.92)', borderBottom:'1px solid rgba(255,255,255,.07)'}}>
        <StatusBadge status={order.status} />
        {order.status === 'en_proceso' && (
          <button
            onClick={() => setShowCompletePopup(true)}
            className="bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all"
          >
            ✓ Marcar como Completado
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,.07)', background:'rgba(8,16,44,.92)'}}>
        {[
          'resumen', 'datos',
          proofUrl ? 'comprobante' : null,
          completionProofUrl ? 'comprobante_env' : null,
        ].filter(Boolean).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500' : 'border-transparent'}`}
            style={{color: tab === t ? '#38bdf8' : '#8aa0cc'}}>
            {t === 'comprobante' ? 'Comprobante' : t === 'comprobante_env' ? 'Prueba envío' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'resumen' && (
          <div className="p-6 space-y-6">
            <div className="rounded-2xl p-6" style={{background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)'}}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{color:'#8aa0cc'}}>Monto enviado</p>
                  <p className="text-2xl font-bold" style={{color:'#eaf2ff'}}>{order.amount_sent?.toLocaleString()} <span className="text-base" style={{color:'#8aa0cc'}}>{order.currency_from}</span></p>
                </div>
                <span className="text-3xl" style={{color:'#38bdf8'}}>→</span>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider" style={{color:'#8aa0cc'}}>Recibe</p>
                  <p className="text-2xl font-bold" style={{color:'#4ade80'}}>{order.amount_received?.toLocaleString()} <span className="text-base" style={{color:'#4ade80', opacity:.7}}>{order.currency_to}</span></p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center pt-3" style={{borderTop:'1px solid rgba(255,255,255,.07)'}}>
                <div><p className="text-xs" style={{color:'#8aa0cc'}}>Tasa</p><p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.exchange_rate?.toFixed(4)}</p></div>
                <div><p className="text-xs" style={{color:'#8aa0cc'}}>Comisión</p><p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.fee} {order.currency_from}</p></div>
                <div><p className="text-xs" style={{color:'#8aa0cc'}}>Método</p><p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.payment_method}</p></div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:'#8aa0cc'}}>Receptor</p>
              <div className="rounded-xl px-4" style={{background:'rgba(255,255,255,.04)'}}>
                <Row label="Nombre" value={order.receiver_name} />
                <Row label="Teléfono" value={order.receiver_phone} />
                <Row label="País" value={order.receiver_country} />
                <Row label="Banco" value={order.receiver_bank_name} />
                <Row label="Cuenta" value={order.receiver_account} />
                <Row label={order.receiver_id_type || 'ID'} value={order.receiver_id_num} />
              </div>
            </div>
          </div>
        )}

        {tab === 'datos' && (
          <div className="p-6 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Remitente</p>
              <div className="rounded-xl px-4" style={{background:'rgba(255,255,255,.04)'}}>
                <Row label="Nombre" value={order.sender_name} />
                <Row label="Teléfono" value={order.sender_phone} />
                <Row label="País" value={order.sender_country} />
                <Row label={order.sender_id_type || 'ID'} value={order.sender_id_num} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Fechas</p>
              <div className="rounded-xl px-4" style={{background:'rgba(255,255,255,.04)'}}>
                <Row label="Creado" value={fmtDate(order.created_at, tz)} />
                <Row label="Actualizado" value={fmtDate(order.updated_at, tz)} />
                {order.completed_at && <Row label="Completado" value={fmtDate(order.completed_at, tz)} />}
              </div>
            </div>
          </div>
        )}

        {tab === 'comprobante' && proofUrl && (
          <div className="p-6">
            <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)'}}>
              {proofIsImage ? (
                <img src={proofUrl} alt="Comprobante" className="w-full max-h-96 object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <p className="text-sm" style={{color:'#8aa0cc'}}>Comprobante PDF</p>
                  <a href={proofUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>Abrir archivo →</a>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'comprobante_env' && completionProofUrl && (
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Prueba de envío</p>
            <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(74,222,128,.25)', background:'rgba(74,222,128,.05)'}}>
              {completionIsImage ? (
                <img src={completionProofUrl} alt="Prueba de envío" className="w-full max-h-96 object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <p className="text-sm" style={{color:'#8aa0cc'}}>Comprobante de envío PDF</p>
                  <a href={completionProofUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>Abrir archivo →</a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Complete confirmation popup — Portal to escape SlidePanel transform */}
      {showCompletePopup && (
        <Portal>
          <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" style={GLASS}>
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{background:'rgba(74,222,128,.15)'}}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2.5">
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

                {/* File upload — required before confirming */}
                <div className="mb-4">
                  <p className="text-xs font-semibold mb-1.5" style={{color:'#8aa0cc'}}>Comprobante de transferencia <span style={{color:'#f87171'}}>*</span></p>
                  <label
                    className="flex items-center gap-2.5 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-colors"
                    style={proofFile
                      ? {borderColor:'rgba(74,222,128,.5)', background:'rgba(74,222,128,.06)'}
                      : {borderColor:'rgba(255,255,255,.1)', background:'rgba(255,255,255,.03)'}}>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      className="hidden"
                      onChange={e => setProofFile(e.target.files?.[0] || null)}
                    />
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{color: proofFile ? '#4ade80' : '#8aa0cc'}}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="text-sm" style={{color: proofFile ? '#4ade80' : '#8aa0cc', fontWeight: proofFile ? 500 : 400}}>
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
                    style={{border:'1px solid rgba(255,255,255,.1)', color:'#aebfe2', background:'rgba(255,255,255,.04)'}}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending || !proofFile}
                    className="flex-1 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 rounded-xl transition-all"
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

const ALL_COLUMNS = [
  { key: 'en_aprobacion', label: 'En Aprobación', dot: 'bg-orange-400', borderColor: '#fb923c', readOnly: true },
  { key: 'en_proceso',    label: 'En Proceso',    dot: 'bg-blue-500',   borderColor: '#3b82f6' },
  { key: 'completado',    label: 'Completado',    dot: 'bg-green-500',  borderColor: '#22c55e' },
]

export default function SubAdminPipeline() {
  const { user } = useStore()
  const tz = userTz(user)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [dateRange, setDateRange] = useState({ from: todayStart, to: todayEnd })
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sub-admin-orders', dateRange],
    queryFn: () => api.get('/sub-admin/orders', {
      params: {
        page_size: 500,
        date_from: dateRange.from.toISOString(),
        date_to: dateRange.to.toISOString(),
      }
    }).then(r => r.data.data.items),
    refetchInterval: 15000,
  })

  const byStatus = (status) => (data || [])
    .filter(o => o.status === status)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <FinexyLayout fullHeight>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Sub-header */}
        <div className="px-6 py-3 flex items-center gap-4 shrink-0" style={{background:'rgba(6,13,40,.9)', borderBottom:'1px solid rgba(255,255,255,.07)'}}>
          <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Pipeline</h2>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <span className="text-xs ml-auto" style={{color:'#aebfe2'}}>actualiza cada 15s · {(data || []).length} órdenes</span>
        </div>

        {/* Kanban */}
        <div className="flex-1 overflow-x-auto p-6">
          {isLoading ? (
            <div className="flex gap-5">
              {ALL_COLUMNS.map(col => (
                <div key={col.key} className="w-72 shrink-0 space-y-3">
                  <div className="h-8 rounded-xl animate-pulse" style={{background:'rgba(255,255,255,.06)'}} />
                  {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl animate-pulse" style={{background:'rgba(255,255,255,.06)'}} />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-5 min-h-full">
              {ALL_COLUMNS.map(({ key, label, dot, borderColor, readOnly }) => {
                const orders = byStatus(key)
                return (
                  <div key={key} className="w-72 shrink-0 flex flex-col">
                    <div className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between"
                      style={{ ...GLASS, borderTopWidth:4, borderTopColor:borderColor }}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                        <span className="font-semibold text-sm" style={{color:'#eaf2ff'}}>{label}</span>
                        {readOnly && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{color:'#8aa0cc', background:'rgba(255,255,255,.07)'}}>Solo lectura</span>}
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'rgba(255,255,255,.08)', color:'#8aa0cc'}}>{orders.length}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      {orders.map(order => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          isAdmin
                          assignedName={order.super_admin_name || undefined}
                          onView={o => setSelectedOrder(o)}
                        />
                      ))}
                      {orders.length === 0 && (
                        <div className="text-center py-10 text-xs rounded-xl" style={{border:'2px dashed rgba(255,255,255,.08)', color:'#475569'}}>
                          Sin órdenes
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <SlidePanel
        open={!!selectedOrder}
        onClose={() => { setSelectedOrder(null); qc.invalidateQueries({ queryKey: ['sub-admin-orders'] }) }}
        title={selectedOrder?.sender_name || ''}
        subtitle={selectedOrder ? `${selectedOrder.order_number} · ${selectedOrder.receiver_name} → ${selectedOrder.receiver_country}` : ''}
      >
        {selectedOrder && (
          <OrderDetail
            order={selectedOrder}
            onClose={() => { setSelectedOrder(null); qc.invalidateQueries({ queryKey: ['sub-admin-orders'] }) }}
          />
        )}
      </SlidePanel>
    </FinexyLayout>
  )
}
