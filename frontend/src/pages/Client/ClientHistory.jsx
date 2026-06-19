import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import SlidePanel from '../../components/SlidePanel'
import { ClientOrderPanel } from '../../components/OrderPanel'
import StatusBadge from '../../components/StatusBadge'
import DateRangePicker from '../../components/DateRangePicker'
import api from '../../services/api'
import { flagUrl } from '../../utils/flags'
import { useStore } from '../../store/useStore'
import { fmtDateShort, userTz } from '../../utils/timezone'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const STATUS_COLOR = {
  en_aprobacion: '#f97316',
  en_proceso: '#60a5fa',
  completado: '#4ade80',
}

export default function ClientHistory() {
  const { user } = useStore()
  const tz = userTz(user)
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)

  useEffect(() => {
    if (location.state?.filter) {
      setStatusFilter(location.state.filter)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders-full'],
    queryFn: () => api.get('/orders', { params: { page_size: 500 } }).then(r => r.data.data.items || []),
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const orders = (data || []).filter(o => {
    const matchStatus = !statusFilter
      || (statusFilter === 'active' ? o.status !== 'completado' : o.status === statusFilter)
    const matchSearch = !search || o.receiver_name?.toLowerCase().includes(search.toLowerCase())
      || o.order_number?.toLowerCase().includes(search.toLowerCase())
      || o.receiver_country?.toLowerCase().includes(search.toLowerCase())
    const matchDate = !dateRange || (
      new Date(o.created_at) >= dateRange.from &&
      new Date(o.created_at) <= dateRange.to
    )
    return matchStatus && matchSearch && matchDate
  })

  const handleSendAgain = (order, e) => {
    e.stopPropagation()
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
      }
    })
  }

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{color:'#eaf2ff'}}>Historial de transferencias</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>{(data || []).length} transferencias en total</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
          {dateRange && (
            <button onClick={() => setDateRange(null)}
              className="text-xs flex items-center gap-1 transition-colors"
              style={{color:'#8aa0cc'}}>
              ✕ Quitar filtro fecha
            </button>
          )}
          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-sm">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{color:'#8aa0cc'}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por receptor, país, orden..."
              className="w-full rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
            />
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 shadow-sm"
            style={{background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.07)'}}>
            {[
              { key: '', label: 'Todos' },
              { key: 'active', label: 'Activos', dotColor: '#60a5fa' },
              { key: 'en_aprobacion', label: 'En Aprobación' },
              { key: 'en_proceso', label: 'En Proceso' },
              { key: 'completado', label: 'Completado' },
            ].map(s => (
              <button key={s.key} onClick={() => setStatusFilter(s.key)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={statusFilter === s.key
                  ? {background:'linear-gradient(135deg,#1e3a6e,#1e40af)', color:'#fff'}
                  : {color:'#8aa0cc'}}>
                {s.key && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{background: s.dotColor || STATUS_COLOR[s.key]}} />}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden"
          style={GLASS}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-3" style={{color:'#64748b'}}>Order ID</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Receptor</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Enviado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Recibió</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#fcd34d'}}>Puntos</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Fecha</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#64748b'}}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 rounded animate-pulse w-20" style={{background:'rgba(255,255,255,.06)'}} /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && orders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center">
                      <p className="text-sm" style={{color:'#475569'}}>Sin transferencias</p>
                      <button onClick={() => navigate('/new-transfer')}
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-xl font-medium">
                        Hacer mi primera transferencia
                      </button>
                    </td>
                  </tr>
                )}
                {!isLoading && orders.map(order => (
                  <tr key={order.id} onClick={() => setSelectedOrder(order)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,.04)',
                      background: hoveredRow === order.id ? 'rgba(56,189,248,.05)' : 'transparent',
                    }}
                    onMouseEnter={() => setHoveredRow(order.id)}
                    onMouseLeave={() => setHoveredRow(null)}>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {order.receiver_name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.receiver_name}</p>
                          <span className="inline-flex items-center gap-1 text-xs" style={{color:'#8aa0cc'}}>
                            {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                            {order.receiver_country}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.amount_sent?.toLocaleString()} <span className="text-xs" style={{color:'#8aa0cc'}}>{order.currency_from}</span></span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold" style={{color:'#4ade80'}}>{order.amount_received?.toLocaleString()} <span className="text-xs" style={{color:'#4ade80'}}>{order.currency_to}</span></span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{background: STATUS_COLOR[order.status]}} />
                        <span className="text-xs capitalize" style={{color:'#aebfe2'}}>{order.status?.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {order.points_earned > 0
                        ? <span className="text-xs font-bold" style={{color:'#fcd34d'}}>⭐ {order.points_earned}</span>
                        : <span className="text-xs" style={{color:'rgba(255,255,255,.15)'}}>—</span>
                      }
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs" style={{color:'#8aa0cc'}}>
                        {fmtDateShort(order.created_at, tz)}
                      </span>
                    </td>
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleSendAgain(order, e)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        style={{background:'rgba(56,189,248,.08)', border:'1px solid rgba(56,189,248,.2)', color:'#38bdf8'}}
                      >
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        Enviar nuevamente
                      </button>
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
        title={selectedOrder?.receiver_name || ''}
        subtitle={selectedOrder ? `${selectedOrder.order_number} · ${selectedOrder.receiver_country}` : ''}
      >
        {selectedOrder && <ClientOrderPanel order={selectedOrder} />}
      </SlidePanel>
    </FinexyLayout>
  )
}
