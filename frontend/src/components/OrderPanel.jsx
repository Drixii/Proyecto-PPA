import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import ChatBox from './ChatBox'
import StatusBadge from './StatusBadge'
import Portal from './Portal'
import { flagUrl } from '../utils/flags'
import { useStore } from '../store/useStore'
import { fmtDate, userTz } from '../utils/timezone'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const STATUS_STEPS = ['en_aprobacion', 'en_proceso', 'completado']
const STATUS_LABELS = {
  en_aprobacion: 'En Aprobación',
  en_proceso: 'En Proceso',
  completado: 'Completado',
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-0" style={{borderColor:'rgba(255,255,255,.06)'}}>
      <span className="text-sm shrink-0 w-36" style={{color:'#8aa0cc'}}>{label}</span>
      <span className="text-sm font-medium text-right" style={{color:'#eaf2ff'}}>{value}</span>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
      style={active
        ? {borderColor:'#38bdf8', color:'#38bdf8'}
        : {borderColor:'transparent', color:'#8aa0cc'}}
    >
      {children}
    </button>
  )
}

// ── ADMIN VIEW ────────────────────────────────────────────

export function AdminOrderPanel({ order: initialOrder, onClose }) {
  const { user: _viewerUser } = useStore()
  const tz = userTz(_viewerUser)
  const [tab, setTab] = useState(initialOrder?._defaultTab || 'resumen')
  const [confirmText, setConfirmText] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [showApprovePopup, setShowApprovePopup] = useState(false)
  const qc = useQueryClient()

  const { data: order = initialOrder, isFetching } = useQuery({
    queryKey: ['admin-order', initialOrder?.id],
    queryFn: () => api.get(`/admin/orders/${initialOrder.id}`).then(r => r.data.data),
    enabled: !!initialOrder?.id,
    placeholderData: initialOrder,
    staleTime: 0,
  })

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${order.id}/approve`, { confirmation: 'COMPROBADO' }),
    onSuccess: () => {
      setShowApprovePopup(false)
      setConfirmText('')
      setConfirmError('')
      qc.invalidateQueries({ queryKey: ['admin-order', order.id] })
      qc.invalidateQueries({ queryKey: ['pipeline-orders'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['admin-orders-filtered'] })
    },
    onError: (err) => {
      setConfirmError(err.response?.data?.detail || 'Error al aprobar')
    },
  })

  if (!order) return null

  const currentStep = STATUS_STEPS.indexOf(order.status)
  const isApprovalPending = order.status === 'en_aprobacion'
  const proofUrl = order.payment_proof ? `/uploads/proofs/${order.payment_proof}` : null
  const proofIsImage = proofUrl && /\.(jpg|jpeg|png|webp)$/i.test(proofUrl)
  const subAdminName = order.sub_admin_name

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-6 py-3 border-b flex items-center justify-between shrink-0" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <StatusBadge status={order.status} />
        {isApprovalPending && proofUrl && (
          <button
            onClick={() => setShowApprovePopup(true)}
            className="bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all"
          >
            APROBAR
          </button>
        )}
        {isApprovalPending && !proofUrl && (
          <span className="text-xs text-orange-500 font-medium">Esperando comprobante</span>
        )}
      </div>

      {/* Progress */}
      <div className="px-6 py-4 border-b shrink-0" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <div className="flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={i <= currentStep
                  ? {background:'#38bdf8', color:'#08102c'}
                  : {background:'rgba(255,255,255,.06)', color:'#8aa0cc'}}
              >
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span
                className="hidden sm:block ml-1 text-xs truncate"
                style={i <= currentStep ? {color:'#38bdf8', fontWeight:500} : {color:'#8aa0cc'}}
              >
                {STATUS_LABELS[step]}
              </span>
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mx-1"
                  style={{background: i < currentStep ? '#38bdf8' : 'rgba(255,255,255,.1)'}}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0 overflow-x-auto" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <TabButton active={tab === 'resumen'} onClick={() => setTab('resumen')}>Resumen</TabButton>
        {proofUrl && (
          <TabButton active={tab === 'comprobante'} onClick={() => setTab('comprobante')}>
            <span className="flex items-center gap-1.5">
              Comprobante
              {isApprovalPending && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />}
            </span>
          </TabButton>
        )}
        {order.completion_proof_url && (
          <TabButton active={tab === 'prueba_envio'} onClick={() => setTab('prueba_envio')}>Prueba envío</TabButton>
        )}
        <TabButton active={tab === 'datos'} onClick={() => setTab('datos')}>Datos</TabButton>
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>Chat</TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'resumen' && (
          <div className="p-6 space-y-6">
            <div className="rounded-2xl p-6" style={GLASS}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{color:'#aebfe2'}}>Monto enviado</p>
                  <p className="text-2xl font-bold" style={{color:'#38bdf8'}}>{order.amount_sent?.toLocaleString()} <span className="text-base" style={{color:'#8aa0cc'}}>{order.currency_from}</span></p>
                </div>
                <span className="text-3xl" style={{color:'#38bdf8'}}>→</span>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider" style={{color:'#aebfe2'}}>Recibe</p>
                  <p className="text-2xl font-bold" style={{color:'#4ade80'}}>{order.amount_received?.toLocaleString()} <span className="text-base" style={{color:'#4ade80'}}>{order.currency_to}</span></p>
                </div>
              </div>
              <div className={`grid gap-3 text-center pt-3 border-t ${order.points_earned > 0 ? 'grid-cols-4' : 'grid-cols-3'}`} style={{borderColor:'rgba(255,255,255,.06)'}}>
                <div><p className="text-xs" style={{color:'#8aa0cc'}}>Tasa</p><p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.exchange_rate?.toFixed(4)}</p></div>
                <div><p className="text-xs" style={{color:'#8aa0cc'}}>Comisión</p><p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.fee} {order.currency_from}</p></div>
                <div><p className="text-xs" style={{color:'#8aa0cc'}}>Creado</p><p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{new Date(order.created_at).toLocaleDateString('es-CL')}</p></div>
                {order.points_earned > 0 && (
                  <div>
                    <p className="text-xs" style={{color:'#fcd34d'}}>⭐ Puntos</p>
                    <p className="text-sm font-bold" style={{color:'#fcd34d'}}>{order.points_earned} pts</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:'#8aa0cc'}}>Pago</p>
              <Row label="Método" value={order.payment_method} />
              <Row label="Banco" value={order.payment_bank} />
            </div>
            {subAdminName && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:'#8aa0cc'}}>Encargado</p>
                <div className="rounded-xl px-4" style={GLASS}>
                  <Row label="Sub-admin" value={subAdminName} />
                  <Row label="País" value={order.receiver_country} />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'comprobante' && (
          <div className="p-6 space-y-5">
            {proofUrl ? (
              <>
                <div className="rounded-2xl overflow-hidden" style={GLASS}>
                  {proofIsImage ? (
                    <img src={proofUrl} alt="Comprobante" className="w-full max-h-80 object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-sm" style={{color:'#aebfe2'}}>Comprobante PDF</p>
                      <a href={proofUrl} target="_blank" rel="noreferrer"
                        className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>
                        Abrir archivo →
                      </a>
                    </div>
                  )}
                </div>
                {isApprovalPending && (
                  <button
                    onClick={() => setShowApprovePopup(true)}
                    className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    APROBAR comprobante →
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-2" style={{color:'#64748b'}}>
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                <p className="text-sm">Sin comprobante adjunto</p>
              </div>
            )}
          </div>
        )}

        {tab === 'prueba_envio' && order.completion_proof_url && (() => {
          const cpUrl = order.completion_proof_url
          const cpIsImage = /\.(jpg|jpeg|png|webp)$/i.test(cpUrl)
          return (
            <div className="p-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#8aa0cc'}}>Comprobante de envío (sub-admin)</p>
              <div className="rounded-2xl overflow-hidden" style={{background:'rgba(74,222,128,.05)', border:'1px solid rgba(74,222,128,.15)'}}>
                {cpIsImage ? (
                  <img src={cpUrl} alt="Prueba de envío" className="w-full max-h-80 object-contain" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <p className="text-sm" style={{color:'#aebfe2'}}>Comprobante de envío PDF</p>
                    <a href={cpUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>Abrir archivo →</a>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {tab === 'datos' && (
          <div className="p-6 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Remitente</p>
              <div className="rounded-xl px-4" style={GLASS}>
                <Row label="Nombre" value={order.sender_name} />
                <Row label="Teléfono" value={order.sender_phone} />
                <Row label="País" value={order.sender_country} />
                <Row label={order.sender_id_type || 'ID'} value={order.sender_id_num} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Receptor</p>
              <div className="rounded-xl px-4" style={GLASS}>
                <Row label="Nombre" value={order.receiver_name} />
                <Row label="Teléfono" value={order.receiver_phone} />
                <Row label="País" value={order.receiver_country} />
                <Row label="Banco" value={order.receiver_bank_name} />
                <Row label="Cuenta" value={order.receiver_account} />
                <Row label={order.receiver_id_type || 'ID'} value={order.receiver_id_num} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#8aa0cc'}}>Fechas</p>
              <div className="rounded-xl px-4" style={GLASS}>
                <Row label="Creado" value={fmtDate(order.created_at, tz)} />
                <Row label="Actualizado" value={fmtDate(order.updated_at, tz)} />
                {order.completed_at && <Row label="Completado" value={fmtDate(order.completed_at, tz)} />}
              </div>
            </div>
          </div>
        )}

        {tab === 'chat' && (
          <div className="p-4 h-full flex flex-col">
            <ChatBox orderId={order.id} />
          </div>
        )}
      </div>

      {/* Approve confirmation popup — rendered via Portal to escape SlidePanel transform context */}
      {showApprovePopup && (
        <Portal>
          <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" style={{background:'#0a1628', border:'1px solid rgba(255,255,255,.1)'}}>
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{background:'rgba(74,222,128,.1)'}}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold" style={{color:'#eaf2ff'}}>Confirmar aprobación</h3>
                    <p className="text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</p>
                  </div>
                </div>

                <div className="rounded-xl p-4 mb-4 text-sm space-y-1.5" style={{background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.15)', color:'#7dd3fc'}}>
                  <p><strong>Receptor:</strong> {order.receiver_name}</p>
                  <div className="flex items-center gap-1.5">
                    <strong>País:</strong>
                    {flagUrl(order.receiver_country) && (
                      <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />
                    )}
                    <span>{order.receiver_country}</span>
                  </div>
                  <p><strong>Monto:</strong> {order.amount_received?.toLocaleString()} {order.currency_to}</p>
                  <div className="pt-1 mt-1" style={{borderTop:'1px solid rgba(56,189,248,.15)'}}>
                    {isFetching && !subAdminName ? (
                      <span className="text-xs" style={{color:'#7dd3fc'}}>Buscando encargado...</span>
                    ) : subAdminName ? (
                      <div className="flex items-center gap-1.5">
                        <strong>Encargado:</strong>
                        {flagUrl(order.receiver_country) && (
                          <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />
                        )}
                        <span className="font-semibold" style={{color:'#38bdf8'}}>{subAdminName}</span>
                      </div>
                    ) : (
                      <p className="text-orange-600">Sin encargado asignado para {order.receiver_country}</p>
                    )}
                  </div>
                </div>

                <p className="text-xs mb-4" style={{color:'#aebfe2'}}>
                  Al aprobar, la orden pasa a <strong>En Proceso</strong> y será derivada al encargado del país.
                </p>

                {confirmError && (
                  <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{color:'#f87171', background:'rgba(239,68,68,.08)'}}>{confirmError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowApprovePopup(false); setConfirmError('') }}
                    className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending || isFetching}
                    className="flex-1 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition-all"
                  >
                    {approveMutation.isPending ? 'Aprobando...' : 'Sí, aprobar'}
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

// ── CLIENT VIEW ───────────────────────────────────────────

const TRANSFER_STATUS_STEPS = ['en_aprobacion', 'en_proceso', 'completado']
const CARD_STATUS_STEPS = ['en_proceso', 'completado']
const CLIENT_STATUS_LABELS = {
  en_aprobacion: 'En Aprobación',
  en_proceso: 'En Proceso',
  completado: 'Completado',
}
const STATUS_TIMELINE = {
  en_aprobacion: { label: 'En aprobación', desc: 'Tu comprobante está siendo revisado por el operador.' },
  en_proceso: { label: 'En proceso', desc: 'El operador está procesando el envío.' },
  completado: { label: 'Completado', desc: 'El receptor recibió el dinero exitosamente.' },
}

function TabButton2({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
      style={active
        ? {borderColor:'#38bdf8', color:'#38bdf8'}
        : {borderColor:'transparent', color:'#8aa0cc'}}
    >
      {children}
    </button>
  )
}

export function ClientOrderPanel({ order }) {
  const [tab, setTab] = useState(order?._defaultTab || 'estado')
  const navigate = useNavigate()

  const { data: allOrders } = useQuery({
    queryKey: ['my-orders-history'],
    queryFn: () => api.get('/orders', { params: { page_size: 50 } }).then(r => r.data.data.items || []),
  })

  const sameReceiverOrders = (allOrders || [])
    .filter(o => o.receiver_name === order?.receiver_name && o.id !== order?.id)
    .slice(0, 5)

  if (!order) return null

  const CLIENT_STATUS_STEPS = order.payment_method === 'tarjeta' ? CARD_STATUS_STEPS : TRANSFER_STATUS_STEPS
  const currentStep = CLIENT_STATUS_STEPS.indexOf(order.status)
  const proofUrl = order.payment_proof ? `/uploads/proofs/${order.payment_proof}` : null
  const proofIsImage = proofUrl && /\.(jpg|jpeg|png|webp)$/i.test(proofUrl)

  const handleSendAgain = () => {
    navigate('/new-transfer', {
      state: {
        prefillReceiver: {
          receiver_name: order.receiver_name,
          receiver_phone: order.receiver_phone,
          receiver_country: order.receiver_country,
          receiver_bank_id: order.receiver_bank_id,
          receiver_account: order.receiver_account,
          receiver_id_type: order.receiver_id_type,
          receiver_id_num: order.receiver_id_num,
        },
        toCountry: order.receiver_country,
        toCurrency: order.currency_to,
        fromCurrency: order.currency_from,
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-6 py-3 border-b flex items-center justify-between shrink-0" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <StatusBadge status={order.status} />
        <button
          onClick={handleSendAgain}
          className="bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
        >
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Enviar nuevamente
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0 overflow-x-auto" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <TabButton2 active={tab === 'estado'} onClick={() => setTab('estado')}>Estado</TabButton2>
        {proofUrl && <TabButton2 active={tab === 'comprobante'} onClick={() => setTab('comprobante')}>Comprobante</TabButton2>}
        <TabButton2 active={tab === 'receptor'} onClick={() => setTab('receptor')}>Receptor</TabButton2>
        <TabButton2 active={tab === 'chat'} onClick={() => setTab('chat')}>Chat</TabButton2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'estado' && (
          <div className="p-6 space-y-6">
            {/* Progress */}
            <div className="rounded-2xl p-5" style={GLASS}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{color:'#8aa0cc'}}>Progreso del envío</p>
              <div className="flex items-center">
                {CLIENT_STATUS_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={i <= currentStep
                        ? {background:'#38bdf8', color:'#08102c'}
                        : {background:'rgba(255,255,255,.06)', color:'#8aa0cc'}}
                    >
                      {i < currentStep ? '✓' : i + 1}
                    </div>
                    <span
                      className="hidden sm:block ml-1 text-xs truncate"
                      style={i <= currentStep ? {color:'#38bdf8', fontWeight:500} : {color:'#8aa0cc'}}
                    >
                      {CLIENT_STATUS_LABELS[step]}
                    </span>
                    {i < CLIENT_STATUS_STEPS.length - 1 && (
                      <div
                        className="flex-1 h-0.5 mx-1"
                        style={{background: i < currentStep ? '#38bdf8' : 'rgba(255,255,255,.1)'}}
                      />
                    )}
                  </div>
                ))}
              </div>
              {STATUS_TIMELINE[order.status] && (
                <div className="mt-4 p-3 rounded-xl" style={{background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.1)'}}>
                  <p className="text-xs font-semibold" style={{color:'#7dd3fc'}}>{STATUS_TIMELINE[order.status].label}</p>
                  <p className="text-xs mt-0.5" style={{color:'#60a5fa'}}>{STATUS_TIMELINE[order.status].desc}</p>
                </div>
              )}
            </div>

            {/* Amounts */}
            <div className="rounded-2xl p-5" style={GLASS}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs" style={{color:'#aebfe2'}}>Enviaste</p>
                  <p className="text-xl font-bold" style={{color:'#38bdf8'}}>{order.amount_sent?.toLocaleString()} <span className="text-sm" style={{color:'#8aa0cc'}}>{order.currency_from}</span></p>
                </div>
                <span className="text-2xl" style={{color:'#38bdf8'}}>→</span>
                <div className="text-right">
                  <p className="text-xs" style={{color:'#aebfe2'}}>Recibirá</p>
                  <p className="text-xl font-bold" style={{color:'#4ade80'}}>{order.amount_received?.toLocaleString()} <span className="text-sm" style={{color:'#4ade80'}}>{order.currency_to}</span></p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center pt-3 text-xs" style={{borderTop:'1px solid rgba(255,255,255,.06)', color:'#8aa0cc'}}>
                <div>Tasa: <span className="font-semibold" style={{color:'#eaf2ff'}}>{order.exchange_rate?.toFixed(4)}</span></div>
                <div>Comisión: <span className="font-semibold" style={{color:'#eaf2ff'}}>{order.fee} {order.currency_from}</span></div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:'#8aa0cc'}}>Pago</p>
              <div className="rounded-xl px-4" style={GLASS}>
                <Row label="Método" value={order.payment_method} />
                <Row label="Banco" value={order.payment_bank} />
              </div>
            </div>
          </div>
        )}

        {tab === 'comprobante' && (
          <div className="p-6 space-y-4">
            {proofUrl ? (
              <div className="rounded-2xl overflow-hidden" style={GLASS}>
                {proofIsImage ? (
                  <img src={proofUrl} alt="Comprobante" className="w-full max-h-96 object-contain" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <p className="text-sm" style={{color:'#aebfe2'}}>Comprobante PDF</p>
                    <a href={proofUrl} target="_blank" rel="noreferrer"
                      className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>
                      Abrir archivo →
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-center py-10" style={{color:'#8aa0cc'}}>Sin comprobante</p>
            )}
          </div>
        )}

        {tab === 'receptor' && (
          <div className="p-6 space-y-4">
            <div className="rounded-xl px-4 py-2" style={GLASS}>
              <Row label="Nombre" value={order.receiver_name} />
              <Row label="Teléfono" value={order.receiver_phone} />
              <Row label="País" value={order.receiver_country} />
              <Row label="Cuenta" value={order.receiver_account} />
              <Row label={order.receiver_id_type || 'ID'} value={order.receiver_id_num} />
            </div>
            <button
              onClick={handleSendAgain}
              className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-200"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Realizar envío a {order.receiver_name?.split(' ')[0]} nuevamente
            </button>
          </div>
        )}

        {tab === 'chat' && (
          <div className="p-4 flex-1 flex flex-col">
            <ChatBox orderId={order.id} />
          </div>
        )}
      </div>
    </div>
  )
}
