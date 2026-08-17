import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import ChatBox from './ChatBox'
import StatusBadge from './StatusBadge'
import Portal from './Portal'
import CardPayment from './CardPayment'
import { flagUrl } from '../utils/flags'
import { useStore } from '../store/useStore'
import { fmtDate, userTz } from '../utils/timezone'
import { esPagoExterno } from '../utils/payments'

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
  const [showRejectPopup, setShowRejectPopup] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState('')
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

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${order.id}/reject`, { reason: rejectReason.trim() }),
    onSuccess: () => {
      setShowRejectPopup(false)
      setRejectReason('')
      setRejectError('')
      qc.invalidateQueries({ queryKey: ['admin-order', order.id] })
      qc.invalidateQueries({ queryKey: ['pipeline-orders'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['admin-orders-filtered'] })
    },
    onError: (err) => {
      setRejectError(err.response?.data?.detail || 'Error al rechazar')
    },
  })

  if (!order) return null

  const apiBase = import.meta.env.VITE_API_URL || ''
  const currentStep = STATUS_STEPS.indexOf(order.status)
  const isApprovalPending = order.status === 'en_aprobacion'
  const proofUrl = order.payment_proof ? `${apiBase}/uploads/proofs/${order.payment_proof}` : null
  const proofIsImage = proofUrl && /\.(jpg|jpeg|png|webp)$/i.test(proofUrl)
  const subAdminName = order.sub_admin_name

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-6 py-3 border-b flex items-center justify-between shrink-0" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <StatusBadge status={order.status} />
        {isApprovalPending && proofUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRejectPopup(true)}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
              style={{ color:'#f87171', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)' }}
            >
              RECHAZAR
            </button>
            <button
              onClick={() => setShowApprovePopup(true)}
              className="bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all"
            >
              APROBAR
            </button>
          </div>
        )}
        {isApprovalPending && !proofUrl && (
          <span className="text-xs text-orange-500 font-medium">Esperando comprobante</span>
        )}
        {order.status === 'rechazado' && (
          <span className="text-xs font-medium" style={{color:'#f87171'}}>Esperando comprobante nuevo</span>
        )}
      </div>

      {order.status === 'rechazado' && order.rejection_reason && (
        <div className="px-6 py-3 text-sm shrink-0" style={{background:'rgba(239,68,68,.08)', borderBottom:'1px solid rgba(239,68,68,.2)', color:'#fca5a5'}}>
          <strong>Rechazado:</strong> {order.rejection_reason}
        </div>
      )}

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
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRejectPopup(true)}
                      className="font-bold py-3 px-5 rounded-xl transition-colors"
                      style={{ color:'#f87171', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)' }}
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => setShowApprovePopup(true)}
                      className="flex-1 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white font-bold py-3 rounded-xl transition-all"
                    >
                      APROBAR comprobante →
                    </button>
                  </div>
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
          const cpUrl = `${apiBase}${order.completion_proof_url}`
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

      {showRejectPopup && (
        <Portal>
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4" style={{background:'rgba(2,6,23,.7)'}}>
            <div className="w-full max-w-md rounded-2xl p-6" style={{...GLASS, background:'rgba(8,16,44,.97)'}}>
              <h3 className="font-bold mb-1" style={{color:'#eaf2ff'}}>Rechazar comprobante</h3>
              <p className="text-xs mb-4" style={{color:'#8aa0cc'}}>{order.order_number} · {order.sender_name}</p>

              <label className="block text-xs font-semibold mb-1.5" style={{color:'#aebfe2'}}>
                Motivo (lo verá el cliente)
              </label>
              <textarea
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setRejectError('') }}
                rows={3}
                autoFocus
                placeholder="Ej: el comprobante está borroso / el monto no coincide"
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
                style={{background:'rgba(4,10,30,.85)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
              />

              <p className="text-xs mt-3 mb-4" style={{color:'#aebfe2'}}>
                La orden queda <strong>Rechazada</strong>. El cliente podrá subir otro comprobante y
                volverá a tu panel — no se cancela el envío.
              </p>

              {rejectError && (
                <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{color:'#f87171', background:'rgba(239,68,68,.08)'}}>{rejectError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRejectPopup(false); setRejectError('') }}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending || !rejectReason.trim()}
                  className="flex-1 text-sm font-bold py-2.5 rounded-xl transition-all disabled:opacity-40"
                  style={{background:'linear-gradient(90deg,#ef4444,#b91c1c)', color:'#fff'}}
                >
                  {rejectMutation.isPending ? 'Rechazando...' : 'Sí, rechazar'}
                </button>
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
  pendiente_pago: 'Pendiente de pago',
  en_aprobacion: 'En Aprobación',
  en_proceso: 'En Proceso',
  completado: 'Completado',
}
const STATUS_TIMELINE = {
  pendiente_pago: { label: 'Pendiente de pago', desc: 'Tu envío se procesa en cuanto completes el pago.' },
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

// Elegir de nuevo cómo pagar una orden que quedó sin cobrar.
//
// Antes, "Pagar ahora" devolvía al cliente al mismo portal que acababa de
// fallarle. Si la tarjeta fue rechazada o el proveedor dio error, repetir el
// mismo camino repite el error: lo que hace falta es poder cambiar de método
// sin rellenar el envío otra vez.
export function ElegirMetodoPago({ order, cerrar, alElegirTarjeta, alFallar }) {
  const qc = useQueryClient()
  const [enCurso, setEnCurso] = useState('')
  const [error, setError] = useState('')
  const [transferencia, setTransferencia] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [pidiendoDatos, setPidiendoDatos] = useState(null)
  const [pagador, setPagador] = useState({})
  const [guardandoDatos, setGuardandoDatos] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['metodos-orden', order.id],
    queryFn: () => api.get(`/payments/orders/${order.id}/methods`).then(r => r.data.data),
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['my-orders'] })
    qc.invalidateQueries({ queryKey: ['my-orders-history'] })
    qc.invalidateQueries({ queryKey: ['client-order', order.id] })
  }

  // Qué le falta al pagador para este método. PSE exige documento, apellido y
  // teléfono, y el formulario de envío nunca los pidió: se toman del nombre de
  // la cuenta. Preguntarlos aquí evita mandar al cliente a editar su perfil y
  // volver a empezar.
  const faltantes = (metodo) => {
    const exige = (metodo?.requiere || []).map(c => String(c).toLowerCase())
    const p = data?.pagador || {}
    const nombre = (pagador.sender_name ?? p.nombre ?? '').trim()
    const falta = []
    if (exige.some(c => c.includes('document')) ) {
      if (!(pagador.sender_id_num ?? p.documento)) falta.push('documento')
      if (!(pagador.sender_id_type ?? p.tipo_documento)) falta.push('tipo')
    }
    if (exige.some(c => c.includes('last')) && nombre.split(/\s+/).filter(Boolean).length < 2) {
      falta.push('apellido')
    }
    if (exige.includes('phone') && !(pagador.sender_phone ?? p.telefono)) falta.push('telefono')
    return falta
  }

  const elegir = (codigo) => {
    const metodo = (data?.metodos || []).find(m => m.codigo === codigo)
    if (faltantes(metodo).length) {
      setError('')
      setPidiendoDatos(metodo)
      return
    }
    elegirSinComprobar(codigo)
  }

  const elegirSinComprobar = async (codigo) => {
    setEnCurso(codigo)
    setError('')
    try {
      await api.put(`/payments/orders/${order.id}/method`, { payment_method: codigo })
    } catch (err) {
      setEnCurso('')
      setError(err.response?.data?.detail || 'No se pudo cambiar el método')
      return
    }

    if (codigo === 'transferencia') {
      refrescar()
      setEnCurso('')
      setTransferencia(true)
      return
    }
    if (codigo === 'tarjeta') {
      refrescar()
      alElegirTarjeta()
      return
    }

    // Métodos de Koywe: la URL se pide en el momento, porque la de un intento
    // anterior ya caducó.
    try {
      const r = await api.post(`/payments/orders/${order.id}/koywe/checkout`)
      window.location.href = r.data.data.url
    } catch (err) {
      setEnCurso('')
      alFallar(err.response?.data?.detail || 'No se pudo abrir el portal de pago')
    }
  }

  const subirComprobante = async (file) => {
    if (!file) return
    setSubiendo(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/orders/${order.id}/upload-proof`, fd)
      refrescar()
      cerrar()
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo subir el comprobante')
    } finally {
      setSubiendo(false)
    }
  }

  const cuenta = data?.cuenta_transferencia

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(2,6,23,.75)'}}
        onClick={cerrar}>
        <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={GLASS}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between mb-1 gap-3">
            <h3 className="font-semibold" style={{color:'#eaf2ff'}}>
              {transferencia ? 'Transfiere y sube tu comprobante' : '¿Cómo quieres pagar?'}
            </h3>
            <button onClick={cerrar} className="text-lg leading-none shrink-0" style={{color:'#64748b'}}>×</button>
          </div>
          <p className="text-xs mb-4" style={{color:'#8aa0cc'}}>
            {order.order_number} · {Number(order.amount_sent).toLocaleString('es-CL')} {order.currency_from}
          </p>

          {error && (
            <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{color:'#fca5a5', background:'rgba(239,68,68,.08)'}}>{error}</p>
          )}

          {isLoading && <p className="text-sm" style={{color:'#8aa0cc'}}>Cargando...</p>}

          {pidiendoDatos && (
            <div className="space-y-3">
              <p className="text-xs" style={{color:'#8aa0cc'}}>
                {pidiendoDatos.nombre} necesita estos datos de quien paga. El banco los
                compara con los de tu cuenta, así que tienen que ser los tuyos.
              </p>

              <div>
                <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Nombre y apellido</label>
                <input
                  value={pagador.sender_name ?? data?.pagador?.nombre ?? ''}
                  onChange={e => setPagador(p => ({ ...p, sender_name: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Tipo de documento</label>
                  <select
                    value={pagador.sender_id_type ?? data?.pagador?.tipo_documento ?? ''}
                    onChange={e => setPagador(p => ({ ...p, sender_id_type: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm"
                    style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}>
                    <option value="" style={{background:'#0f172a'}}>Elige...</option>
                    {(data?.documentos || []).map(d => (
                      <option key={d.codigo} value={d.codigo} style={{background:'#0f172a'}}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Número</label>
                  <input
                    value={pagador.sender_id_num ?? data?.pagador?.documento ?? ''}
                    onChange={e => setPagador(p => ({ ...p, sender_id_num: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm"
                    style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                </div>
              </div>

              <div>
                <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Teléfono</label>
                <input
                  value={pagador.sender_phone ?? data?.pagador?.telefono ?? ''}
                  onChange={e => setPagador(p => ({ ...p, sender_phone: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setPidiendoDatos(null); setPagador({}) }}
                  className="flex-1 text-xs font-semibold py-2.5 rounded-lg"
                  style={{background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc'}}>
                  Volver
                </button>
                <button
                  onClick={async () => {
                    setGuardandoDatos(true)
                    setError('')
                    try {
                      await api.put(`/payments/orders/${order.id}/payer`, {
                        sender_name: pagador.sender_name ?? data?.pagador?.nombre,
                        sender_id_type: pagador.sender_id_type ?? data?.pagador?.tipo_documento,
                        sender_id_num: pagador.sender_id_num ?? data?.pagador?.documento,
                        sender_phone: pagador.sender_phone ?? data?.pagador?.telefono,
                      })
                    } catch (err) {
                      setGuardandoDatos(false)
                      setError(err.response?.data?.detail || 'No se pudieron guardar los datos')
                      return
                    }
                    const metodo = pidiendoDatos
                    await qc.invalidateQueries({ queryKey: ['metodos-orden', order.id] })
                    setGuardandoDatos(false)
                    setPidiendoDatos(null)
                    // Ya guardados: se sigue por el camino normal del método.
                    elegirSinComprobar(metodo.codigo)
                  }}
                  disabled={guardandoDatos}
                  className="flex-1 text-xs font-semibold py-2.5 rounded-lg disabled:opacity-50"
                  style={{background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', border:'none', color:'#fff'}}>
                  {guardandoDatos ? 'Guardando...' : 'Continuar'}
                </button>
              </div>
            </div>
          )}

          {!isLoading && !transferencia && !pidiendoDatos && (
            <div className="grid grid-cols-2 gap-3">
              {(data?.metodos || []).map(m => (
                <button key={m.codigo} type="button"
                  onClick={() => elegir(m.codigo)}
                  disabled={!!enCurso}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all text-center disabled:opacity-50"
                  style={data?.actual === m.codigo
                    ? {background:'rgba(56,189,248,.1)', border:'2px solid #38bdf8'}
                    : {background:'rgba(255,255,255,.04)', border:'2px solid rgba(255,255,255,.08)'}}>
                  <span className="text-2xl">{m.icono}</span>
                  <span className="text-xs font-semibold" style={{color:'#eaf2ff'}}>
                    {enCurso === m.codigo ? 'Abriendo...' : m.nombre}
                  </span>
                  <span className="text-[10px]" style={{color:'#8aa0cc'}}>{m.desc}</span>
                </button>
              ))}
            </div>
          )}

          {transferencia && (
            <div className="space-y-3">
              {cuenta ? (
                <div className="rounded-xl p-4 space-y-2" style={{background:'rgba(56,189,248,.06)', border:'1px solid rgba(56,189,248,.2)'}}>
                  {[
                    ['Número de cuenta', cuenta.numero],
                    ['Titular', cuenta.titular],
                    ['Banco', cuenta.banco],
                    ['Documento', cuenta.documento],
                    ['Tipo de cuenta', cuenta.tipo_cuenta],
                  ].filter(([, v]) => v).map(([label, v]) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{color:'#475569'}}>{label}</p>
                      <p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{v}</p>
                    </div>
                  ))}
                  <p className="text-[11px] pt-1" style={{color:'#fcd34d'}}>
                    Transfiere exactamente {Number(order.amount_sent).toLocaleString('es-CL')} {order.currency_from}.
                  </p>
                </div>
              ) : (
                <p className="text-xs" style={{color:'#8aa0cc'}}>
                  Transfiere el monto a la cuenta que te indicó tu operador y adjunta el comprobante.
                </p>
              )}

              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer"
                style={{borderColor:'rgba(255,255,255,.12)', background:'rgba(6,13,40,.4)'}}>
                <input type="file" accept="image/*,.pdf" className="sr-only"
                  onChange={e => subirComprobante(e.target.files?.[0] || null)} />
                <span className="text-sm font-semibold" style={{color:'#aebfe2'}}>
                  {subiendo ? 'Subiendo...' : 'Adjuntar comprobante'}
                </span>
                <span className="text-xs" style={{color:'#8aa0cc'}}>JPG, PNG o PDF</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}

export function ClientOrderPanel({ order }) {
  const [tab, setTab] = useState(order?._defaultTab || 'estado')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [reuploadError, setReuploadError] = useState('')
  const [payingCard, setPayingCard] = useState(false)
  // Pidiendo la URL del portal de Koywe. Se sale de la aplicación, así que no
  // se vuelve a poner en false salvo que falle.
  const [abrirPagoError, setAbrirPagoError] = useState('')
  const [eligiendoMetodo, setEligiendoMetodo] = useState(false)

  // Rechazar no cancela el envío: el cliente sube otro comprobante y la orden
  // vuelve sola a "en aprobación" (backend/routers/orders.py).
  const reuploadMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(`/orders/${order.id}/upload-proof`, fd)
    },
    onSuccess: () => {
      setReuploadError('')
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      qc.invalidateQueries({ queryKey: ['my-orders-history'] })
      qc.invalidateQueries({ queryKey: ['client-order', order.id] })
    },
    onError: (err) => {
      setReuploadError(err.response?.data?.detail || 'No se pudo subir el comprobante')
    },
  })

  const { data: allOrders } = useQuery({
    queryKey: ['my-orders-history'],
    queryFn: () => api.get('/orders', { params: { page_size: 50 } }).then(r => r.data.data.items || []),
  })

  const sameReceiverOrders = (allOrders || [])
    .filter(o => o.receiver_name === order?.receiver_name && o.id !== order?.id)
    .slice(0, 5)

  if (!order) return null

  const apiBase = import.meta.env.VITE_API_URL || ''
  // Los pagos externos (tarjeta, Khipu, PIX...) no pasan por aprobación: no
  // hay comprobante que revisar, el proveedor confirma el cobro.
  const CLIENT_STATUS_STEPS = esPagoExterno(order.payment_method) ? CARD_STATUS_STEPS : TRANSFER_STATUS_STEPS
  const currentStep = CLIENT_STATUS_STEPS.indexOf(order.status)
  const proofUrl = order.payment_proof ? `${apiBase}/uploads/proofs/${order.payment_proof}` : null
  const proofIsImage = proofUrl && /\.(jpg|jpeg|png|webp)$/i.test(proofUrl)
  const completionProofUrl = order.completion_proof ? `${apiBase}/uploads/completions/${order.completion_proof}` : null
  const completionProofIsImage = completionProofUrl && /\.(jpg|jpeg|png|webp)$/i.test(completionProofUrl)

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

      {/* Pago sin completar: se creó la orden pero el cobro no llegó a pasar
          (cerró el formulario, falló la tarjeta, abandonó el portal...). Se
          puede pagar aquí sin volver a rellenar el envío. En rojo porque es lo
          único de la ficha que exige algo del cliente. */}
      {!order.paid_at && order.status === 'pendiente_pago' && (
        <div className="px-6 py-4 shrink-0" style={{background:'rgba(239,68,68,.08)', borderBottom:'1px solid rgba(239,68,68,.25)'}}>
          <p className="text-sm font-semibold mb-1 flex items-center gap-2" style={{color:'#f87171'}}>
            <span className="inline-block w-2 h-2 rounded-full" style={{background:'#dc2626'}} />
            Pago pendiente
          </p>
          <p className="text-xs mb-3" style={{color:'#fca5a5'}}>
            Esta orden no se ha cobrado todavía. El envío no se procesa hasta que el pago se complete.
          </p>
          {abrirPagoError && (
            <p className="text-xs mb-2" style={{color:'#fca5a5'}}>{abrirPagoError}</p>
          )}
          <button
            onClick={() => { setAbrirPagoError(''); setEligiendoMetodo(true) }}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{background:'rgba(239,68,68,.14)', border:'1px solid rgba(239,68,68,.35)', color:'#f87171'}}
          >
            Pagar ahora
          </button>
        </div>
      )}

      {eligiendoMetodo && (
        <ElegirMetodoPago
          order={order}
          cerrar={() => setEligiendoMetodo(false)}
          alElegirTarjeta={() => { setEligiendoMetodo(false); setPayingCard(true) }}
          alFallar={(msg) => { setEligiendoMetodo(false); setAbrirPagoError(msg) }}
        />
      )}

      {payingCard && (
        <CardPayment
          orderId={order.id}
          amountLabel={`${order.amount_sent?.toLocaleString('es-CL')} ${order.currency_from}`}
          onClose={() => setPayingCard(false)}
          onSuccess={() => {
            setPayingCard(false)
            qc.invalidateQueries({ queryKey: ['my-orders'] })
            qc.invalidateQueries({ queryKey: ['my-orders-history'] })
          }}
        />
      )}

      {/* Comprobante rechazado: motivo + reenvío */}
      {order.status === 'rechazado' && (
        <div className="px-6 py-4 shrink-0" style={{background:'rgba(239,68,68,.08)', borderBottom:'1px solid rgba(239,68,68,.2)'}}>
          <p className="text-sm font-semibold mb-1" style={{color:'#fca5a5'}}>Comprobante rechazado</p>
          {order.rejection_reason && (
            <p className="text-sm mb-3" style={{color:'#fca5a5'}}>{order.rejection_reason}</p>
          )}
          <label
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors"
            style={{background:'rgba(56,189,248,.12)', border:'1px solid rgba(56,189,248,.3)', color:'#38bdf8'}}
          >
            {reuploadMutation.isPending ? 'Subiendo...' : 'Subir comprobante nuevo'}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.webp"
              className="hidden"
              disabled={reuploadMutation.isPending}
              onChange={e => { const f = e.target.files?.[0]; if (f) reuploadMutation.mutate(f); e.target.value = '' }}
            />
          </label>
          {reuploadError && (
            <p className="text-xs mt-2" style={{color:'#f87171'}}>{reuploadError}</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b shrink-0 overflow-x-auto" style={{background:'rgba(6,13,40,.7)', borderColor:'rgba(255,255,255,.08)'}}>
        <TabButton2 active={tab === 'estado'} onClick={() => setTab('estado')}>Estado</TabButton2>
        {proofUrl && <TabButton2 active={tab === 'comprobante'} onClick={() => setTab('comprobante')}>Mi comprobante</TabButton2>}
        {completionProofUrl && <TabButton2 active={tab === 'prueba_envio'} onClick={() => setTab('prueba_envio')}>Recibo de pago</TabButton2>}
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

        {tab === 'prueba_envio' && (
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#8aa0cc'}}>Comprobante de envío</p>
            {completionProofUrl ? (
              <div className="rounded-2xl overflow-hidden" style={{background:'rgba(74,222,128,.05)', border:'1px solid rgba(74,222,128,.15)'}}>
                {completionProofIsImage ? (
                  <img src={completionProofUrl} alt="Prueba de envío" className="w-full max-h-96 object-contain" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <p className="text-sm" style={{color:'#aebfe2'}}>Comprobante PDF</p>
                    <a href={completionProofUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{color:'#38bdf8'}}>Abrir archivo →</a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-center py-10" style={{color:'#8aa0cc'}}>Sin comprobante de envío aún</p>
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
