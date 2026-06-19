import { useState } from 'react'
import { fmtDate } from '../../utils/timezone'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import StatusBadge from '../../components/StatusBadge'
import ChatBox from '../../components/ChatBox'

const STATUS_STEPS = ['en_aprobacion', 'en_proceso', 'completado']
const STATUS_LABELS = { en_aprobacion: 'En Aprobación', en_proceso: 'En Proceso', completado: 'Completado' }

const darkCard = { background: 'rgba(8,16,44,.85)', border: '1px solid rgba(255,255,255,.08)', boxShadow: '0 4px 16px rgba(0,6,28,.4)' }
const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function OrderAdmin() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showApprovePopup, setShowApprovePopup] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => api.get(`/admin/orders/${id}`).then((r) => r.data.data),
  })

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${id}/approve`, { confirmation: 'COMPROBADO' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order', id] })
      setShowApprovePopup(false)
    },
  })

  if (isLoading) return <div className="flex items-center justify-center h-screen" style={{color:'#8aa0cc'}}>Cargando...</div>
  if (!order) return <div className="flex items-center justify-center h-screen" style={{color:'#8aa0cc'}}>Orden no encontrada</div>

  const currentStep = STATUS_STEPS.indexOf(order.status)
  const canApprove = order.status === 'en_aprobacion' && order.payment_proof_url

  const Section = ({ title, children }) => (
    <div className="rounded-xl p-6" style={GLASS}>
      <h2 className="font-semibold mb-4" style={{color:'#eaf2ff'}}>{title}</h2>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  )

  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between">
      <span style={{color:'#8aa0cc'}}>{label}</span>
      <span className="font-medium" style={{color:'#eaf2ff'}}>{value}</span>
    </div>
  ) : null

  return (
    <div className="min-h-screen" style={{background:'#020b1a'}}>
      <div className="px-6 py-4 flex items-center gap-3" style={GLASS}>
        <button
          onClick={() => navigate('/admin/pipeline')}
          style={{color:'#8aa0cc', background:'none', border:'none', cursor:'pointer', fontSize:'1.2rem'}}
        >←</button>
        <div>
          <p className="font-mono text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</p>
          <h1 className="font-bold" style={{color:'#eaf2ff'}}>Detalle — Vista Admin</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatusBadge status={order.status} />
          {canApprove && (
            <button
              onClick={() => setShowApprovePopup(true)}
              className="text-sm font-medium px-4 py-2 rounded-lg"
              style={{background:'#16a34a', color:'#fff', border:'none', cursor:'pointer'}}
            >
              Aprobar
            </button>
          )}
        </div>
      </div>

      {/* Progress steps */}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="rounded-xl p-6 flex items-center" style={GLASS}>
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                style={i <= currentStep
                  ? {background:'#1e40af', color:'#fff'}
                  : {background:'rgba(255,255,255,.06)', color:'#64748b'}}
              >
                {i < currentStep ? '✓' : i + 1}
              </div>
              <p
                className="ml-1 text-xs hidden sm:block"
                style={i <= currentStep ? {color:'#38bdf8', fontWeight:'500'} : {color:'#64748b'}}
              >
                {STATUS_LABELS[step]}
              </p>
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mx-2"
                  style={{background: i < currentStep ? '#1e40af' : 'rgba(255,255,255,.08)'}}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <Section title="Montos y tasa">
          <Row label="Envía" value={`${order.amount_sent?.toLocaleString()} ${order.currency_from}`} />
          <Row label="Comisión" value={`${order.fee} ${order.currency_from}`} />
          <Row label="Tasa" value={`1 ${order.currency_from} = ${order.exchange_rate} ${order.currency_to}`} />
          <Row label="Recibe" value={`${order.amount_received?.toLocaleString()} ${order.currency_to}`} />
          <Row label="Método pago" value={order.payment_method} />
          <Row label="Banco pago" value={order.payment_bank} />
          {order.sub_admin_name && <Row label="Encargado" value={order.sub_admin_name} />}
          {order.points_earned > 0 && (
            <div className="flex justify-between pt-2 mt-2" style={{ borderTop: '1px solid rgba(253,211,77,.15)' }}>
              <span style={{ color: '#fcd34d' }}>⭐ Puntos obtenidos</span>
              <span className="font-bold" style={{ color: '#fcd34d' }}>{order.points_earned} pts</span>
            </div>
          )}
        </Section>

        {order.payment_proof_url && (
          <Section title="Comprobante de pago">
            <a
              href={order.payment_proof_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm"
              style={{color:'#38bdf8', textDecoration:'none'}}
              onMouseEnter={e => e.target.style.textDecoration='underline'}
              onMouseLeave={e => e.target.style.textDecoration='none'}
            >
              Ver comprobante →
            </a>
          </Section>
        )}

        <Section title="Remitente">
          <Row label="Nombre" value={order.sender_name} />
          <Row label="Teléfono" value={order.sender_phone} />
          <Row label="País" value={order.sender_country} />
          <Row label={order.sender_id_type} value={order.sender_id_num} />
        </Section>

        <Section title="Receptor">
          <Row label="Nombre" value={order.receiver_name} />
          <Row label="Teléfono" value={order.receiver_phone} />
          <Row label="País" value={order.receiver_country} />
          <Row label="Cuenta" value={order.receiver_account} />
          <Row label={order.receiver_id_type} value={order.receiver_id_num} />
        </Section>

        <Section title="Fechas">
          <Row label="Creado" value={fmtDate(order.created_at)} />
          <Row label="Actualizado" value={fmtDate(order.updated_at)} />
          {order.completed_at && <Row label="Completado" value={fmtDate(order.completed_at)} />}
        </Section>

        <div className="rounded-xl p-6" style={GLASS}>
          <h2 className="font-semibold mb-4" style={{color:'#eaf2ff'}}>Chat con cliente</h2>
          <ChatBox orderId={parseInt(id)} />
        </div>
      </div>

      {/* Approve popup */}
      {showApprovePopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{background:'rgba(0,0,0,.6)'}}>
          <div className="rounded-2xl w-full max-w-md p-6" style={{...darkCard, boxShadow:'0 8px 32px rgba(0,6,28,.7)'}}>
            <h3 className="text-lg font-bold mb-1" style={{color:'#eaf2ff'}}>Aprobar orden</h3>
            <p className="text-sm mb-4" style={{color:'#8aa0cc'}}>La orden pasará a En Proceso y será derivada al encargado del país.</p>

            <div className="rounded-xl p-4 space-y-1 text-sm mb-4" style={{background:'rgba(4,10,30,.6)', border:'1px solid rgba(255,255,255,.06)'}}>
              <div className="flex justify-between">
                <span style={{color:'#8aa0cc'}}>Orden</span>
                <span className="font-mono" style={{color:'#eaf2ff'}}>{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span style={{color:'#8aa0cc'}}>Receptor</span>
                <span style={{color:'#eaf2ff'}}>{order.receiver_name}</span>
              </div>
              <div className="flex justify-between">
                <span style={{color:'#8aa0cc'}}>País destino</span>
                <span style={{color:'#eaf2ff'}}>{order.receiver_country}</span>
              </div>
              <div className="flex justify-between">
                <span style={{color:'#8aa0cc'}}>Monto</span>
                <span style={{color:'#38bdf8'}}>{order.amount_received?.toLocaleString()} {order.currency_to}</span>
              </div>
              {order.sub_admin_name
                ? <div className="flex justify-between"><span style={{color:'#8aa0cc'}}>Encargado</span><span className="font-medium" style={{color:'#7dd3fc'}}>{order.sub_admin_name}</span></div>
                : <div className="flex justify-between"><span style={{color:'#8aa0cc'}}>Encargado</span><span style={{color:'#eab308'}}>Sin encargado asignado</span></div>
              }
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowApprovePopup(false)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-xl"
                style={{background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#aebfe2', cursor:'pointer'}}
              >
                Cancelar
              </button>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-xl"
                style={{background:'#16a34a', color:'#fff', border:'none', cursor:'pointer', opacity: approveMutation.isPending ? 0.5 : 1}}
              >
                {approveMutation.isPending ? 'Aprobando...' : 'Confirmar aprobación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
