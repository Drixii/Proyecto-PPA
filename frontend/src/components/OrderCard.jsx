import StatusBadge from './StatusBadge'
import { flagUrl } from '../utils/flags'
import { useStore } from '../store/useStore'
import { fmtDateShort, userTz } from '../utils/timezone'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function OrderCard({ order, isAdmin = false, onView, assignedName }) {
  const { user } = useStore()
  const tz = userTz(user)
  return (
    <div className="rounded-xl p-4 transition-all" style={GLASS}
      onMouseEnter={e => e.currentTarget.style.borderColor='rgba(56,189,248,.25)'}
      onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,.06)'}>
      <div className="flex justify-between items-start mb-2">
        <span className="font-mono text-xs" style={{ color:'#8aa0cc' }}>{order.order_number}</span>
        <div className="flex items-center gap-1.5">
          {assignedName && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ color:'#7dd3fc', background:'rgba(56,189,248,.12)', border:'1px solid rgba(56,189,248,.2)' }}>
              {assignedName}
            </span>
          )}
          <StatusBadge status={order.status} />
        </div>
      </div>
      <p className="font-semibold text-sm" style={{ color:'#eaf2ff' }}>{order.sender_name}</p>
      <span className="inline-flex items-center gap-1 text-xs mb-2" style={{ color:'#8aa0cc' }}>
        → {order.receiver_name} ·
        {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0 mx-0.5" />}
        {order.receiver_country}
      </span>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold" style={{ color:'#7dd3fc' }}>{order.amount_sent?.toLocaleString()} {order.currency_from}</span>
        <span style={{ color:'rgba(255,255,255,.2)' }}>→</span>
        <span className="font-semibold text-green-400">{order.amount_received?.toLocaleString()} {order.currency_to}</span>
      </div>
      {order.points_earned > 0 && (
        <p className="text-xs mt-1 font-semibold" style={{ color:'#fcd34d' }}>⭐ {order.points_earned} puntos obtenidos</p>
      )}
      <p className="text-xs mt-1.5" style={{ color:'rgba(255,255,255,.25)' }}>{fmtDateShort(order.created_at, tz)}</p>
      <div className="mt-3">
        <button
          onClick={() => onView?.(order)}
          className="w-full text-xs px-3 py-1.5 rounded-lg transition-colors font-medium"
          style={{ background:'rgba(56,189,248,.1)', color:'#7dd3fc', border:'1px solid rgba(56,189,248,.15)' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(56,189,248,.18)'; e.currentTarget.style.borderColor='rgba(56,189,248,.3)' }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(56,189,248,.1)'; e.currentTarget.style.borderColor='rgba(56,189,248,.15)' }}
        >
          Ver detalle
        </button>
      </div>
    </div>
  )
}
