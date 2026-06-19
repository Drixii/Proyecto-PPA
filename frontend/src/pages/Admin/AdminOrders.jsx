import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useLocation } from 'react-router-dom'
import FinexyLayout from '../../components/FinexyLayout'
import SlidePanel from '../../components/SlidePanel'
import { AdminOrderPanel } from '../../components/OrderPanel'
import StatusBadge from '../../components/StatusBadge'
import DateRangePicker from '../../components/DateRangePicker'
import FilterDropdown from '../../components/FilterDropdown'
import api from '../../services/api'
import { fmtDateShort } from '../../utils/timezone'
import { flagUrl } from '../../utils/flags'

const today = new Date()
const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
const todayEnd   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

const STATUS_DOT = {
  en_aprobacion: 'bg-orange-400',
  en_proceso: 'bg-blue-500',
  completado: 'bg-green-500',
}

const STATUSES_DEFAULT = [
  { key: '', label: 'Todos' },
  { key: 'en_aprobacion', label: 'En Aprobación', dot: 'bg-orange-400' },
  { key: 'en_proceso', label: 'En Proceso', dot: 'bg-blue-500' },
  { key: 'completado', label: 'Completado', dot: 'bg-green-500' },
]
const STATUSES_ALL = [
  { key: '', label: 'Todos' },
  { key: 'en_aprobacion', label: 'En Aprobación', dot: 'bg-orange-400' },
  { key: 'en_proceso', label: 'En Proceso', dot: 'bg-blue-500' },
  { key: 'completado', label: 'Completado', dot: 'bg-green-500' },
]

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function AdminOrders() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [dateRange, setDateRange] = useState({ from: todayStart, to: todayEnd })
  const [statusFilter, setStatusFilter] = useState('')
  const [filterMode, setFilterMode] = useState({ type: 'none' })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [showTrash, setShowTrash] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (location.state?.statusFilter) {
      setStatusFilter(location.state.statusFilter)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setSearch(q)
      setDateRange(null)
    }
  }, [searchParams])

  const { data: subAdmins = [] } = useQuery({
    queryKey: ['sub-admins'],
    queryFn: () => api.get('/admin/sub-admins').then(r => r.data.data),
    staleTime: 60000,
  })

  const subAdminMap = Object.fromEntries(subAdmins.map(s => [s.id, s]))

  const { data: trashOrders = [], refetch: refetchTrash } = useQuery({
    queryKey: ['admin-orders-trash'],
    queryFn: () => api.get('/admin/orders/trash').then(r => r.data.data),
    enabled: showTrash,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/orders/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['admin-orders-filtered']); refetch() },
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/orders/${id}/restore`),
    onSuccess: () => { queryClient.invalidateQueries(['admin-orders-trash']); refetchTrash() },
  })

  const isFiltered = filterMode.type !== 'none'
  const STATUSES = isFiltered ? STATUSES_ALL : STATUSES_DEFAULT

  // Derive API params from filterMode
  const apiParams = {
    page_size: 500,
    all_orders: true,
    ...(dateRange ? {
      date_from: dateRange.from.toISOString(),
      date_to: dateRange.to.toISOString(),
    } : {}),
    status: statusFilter || undefined,
    ...(filterMode.type === 'subadmin' ? { sub_admin_id: filterMode.id } : {}),
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-orders-filtered', dateRange, statusFilter, filterMode],
    queryFn: () => api.get('/admin/orders', { params: apiParams }).then(r => r.data.data.items),
    refetchInterval: 30000,
  })

  const orders = (data || [])
    .filter(o => {
      if (!search) return true
      const s = search.toLowerCase()
      return o.sender_name?.toLowerCase().includes(s)
        || o.receiver_name?.toLowerCase().includes(s)
        || o.order_number?.toLowerCase().includes(s)
        || o.receiver_country?.toLowerCase().includes(s)
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const isToday = dateRange?.from.toDateString() === new Date().toDateString()
    && dateRange?.to.toDateString() === new Date().toDateString()

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              Órdenes {isToday ? '— Hoy' : ''}
            </h1>
            <p className="text-sm mt-1" style={{ color:'#8aa0cc' }}>
              {orders.length} resultado{orders.length !== 1 ? 's' : ''} en el período seleccionado
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowTrash(t => !t); refetchTrash() }}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: showTrash ? '#f87171' : '#8aa0cc', background: showTrash ? 'rgba(248,113,113,.1)' : 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}
            >
              🗑 Papelera
            </button>
            <button
              onClick={() => refetch()}
              className="text-xs hover:underline flex items-center gap-1" style={{ color:'#38bdf8' }}
            >
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              Actualizar
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <DateRangePicker value={dateRange || { from: todayStart, to: todayEnd }} onChange={setDateRange} />
          {!dateRange && (
            <button onClick={() => setDateRange({ from: todayStart, to: todayEnd })}
              className="text-xs hover:underline" style={{ color:'#38bdf8' }}>
              Filtrar por hoy
            </button>
          )}

          {/* FilterDropdown — same as Pipeline */}
          <FilterDropdown
            subAdmins={subAdmins}
            filterMode={filterMode}
            onChange={(mode) => { setFilterMode(mode); setStatusFilter('') }}
          />

          {filterMode.type !== 'none' && (
            <button
              onClick={() => { setFilterMode({ type: 'none' }); setStatusFilter('') }}
              className="text-xs hover:text-red-400 flex items-center gap-1 transition-colors" style={{ color:'#8aa0cc' }}
            >
              ✕ Quitar filtro
            </button>
          )}

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 rounded-xl px-2 py-1.5" style={GLASS}>
            {STATUSES.map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s.key
                    ? 'bg-blue-600 text-white'
                    : ''
                }`}
                style={statusFilter !== s.key ? { color:'#8aa0cc' } : {}}
              >
                {s.key && <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot || STATUS_DOT[s.key]} mr-1.5`} />}
                {s.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-xs">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'#8aa0cc' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, orden..."
              className="w-full rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none"
              style={{ background:'rgba(8,16,44,.85)', border:'1px solid rgba(255,255,255,.08)', color:'#eaf2ff' }}
            />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 mb-6 grid-cols-4">
          {[
            { label: 'Total', count: (data || []).length, color: 'text-[#eaf2ff]' },
            { label: 'En Aprobación', count: (data || []).filter(o => o.status === 'en_aprobacion').length, color: 'text-orange-600' },
            { label: 'En Proceso', count: (data || []).filter(o => o.status === 'en_proceso').length, color: 'text-blue-600' },
            { label: 'Completado', count: (data || []).filter(o => o.status === 'completado').length, color: 'text-green-600' },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-xl p-4 text-center" style={GLASS}>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs mt-0.5" style={{ color:'#8aa0cc' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden" style={GLASS}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="" style={{ background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-3" style={{ color:'#64748b' }}>Order ID</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Cliente</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Receptor</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Monto</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Pago</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Encargado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#fcd34d' }}>Puntos</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="">
                {isLoading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 rounded animate-pulse w-24" style={{ background:'rgba(255,255,255,.06)' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && orders.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-16 text-center text-sm" style={{ color:'#475569' }}>
                      Sin órdenes para el período seleccionado
                    </td>
                  </tr>
                )}
                {!isLoading && orders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(56,189,248,.05)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs" style={{ color:'#8aa0cc' }}>{order.order_number}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {order.sender_name?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium" style={{ color:'#eaf2ff' }}>{order.sender_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium" style={{ color:'#aebfe2' }}>{order.receiver_name}</p>
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color:'#8aa0cc' }}>
                          {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                          {order.receiver_country}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold" style={{ color:'#eaf2ff' }}>{order.amount_sent?.toLocaleString()} <span className="text-xs" style={{ color:'#8aa0cc' }}>{order.currency_from}</span></p>
                      <p className="text-xs text-green-600">{order.amount_received?.toLocaleString()} {order.currency_to}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs" style={{ color:'#aebfe2' }}>{order.payment_method}</p>
                      <p className="text-xs" style={{ color:'#8aa0cc' }}>{order.payment_bank}</p>
                    </td>
                    <td className="px-4 py-4">
                      {(() => {
                        const sa = subAdminMap[order.sub_admin_id]
                        if (!sa) return <span className="text-xs" style={{ color:'rgba(255,255,255,.15)' }}>—</span>
                        return (
                          <div>
                            <p className="text-xs font-medium" style={{ color:'#aebfe2' }}>{sa.full_name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {flagUrl(order.receiver_country) && (
                                <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />
                              )}
                              <span className="text-xs" style={{ color:'#64748b' }}>{order.receiver_country}</span>
                            </div>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-4">
                      {order.points_earned > 0
                        ? <span className="text-xs font-bold" style={{ color:'#fcd34d' }}>⭐ {order.points_earned}</span>
                        : <span className="text-xs" style={{ color:'rgba(255,255,255,.15)' }}>—</span>
                      }
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[order.status] || 'bg-gray-300'}`} />
                        <span className="text-xs capitalize" style={{ color:'#aebfe2' }}>{order.status?.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs" style={{ color:'#8aa0cc' }}>
                        {fmtDateShort(order.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { if (window.confirm(`¿Eliminar orden ${order.order_number}?`)) deleteMutation.mutate(order.id) }}
                        className="text-lg transition-colors hover:text-red-400"
                        style={{ color:'rgba(255,255,255,.2)' }}
                        title="Mover a papelera"
                      >🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trash view */}
        {showTrash && (
          <div className="rounded-2xl overflow-hidden mt-6" style={GLASS}>
            <div className="px-5 py-4" style={{ borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <h2 className="text-sm font-semibold" style={{ color:'#f87171' }}>🗑 Papelera de órdenes</h2>
              <p className="text-xs mt-0.5" style={{ color:'#64748b' }}>Las órdenes se eliminan permanentemente después de 30 días</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-3" style={{ color:'#64748b' }}>Order ID</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Remitente</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Receptor</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Monto</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color:'#64748b' }}>Días restantes</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {trashOrders.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color:'#475569' }}>Papelera vacía</td></tr>
                  )}
                  {trashOrders.map(o => (
                    <tr key={o.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                      <td className="px-5 py-4"><span className="font-mono text-xs" style={{ color:'#8aa0cc' }}>{o.order_number}</span></td>
                      <td className="px-4 py-4"><span className="text-sm" style={{ color:'#aebfe2' }}>{o.sender_name}</span></td>
                      <td className="px-4 py-4">
                        <p className="text-sm" style={{ color:'#aebfe2' }}>{o.receiver_name}</p>
                        <p className="text-xs" style={{ color:'#64748b' }}>{o.receiver_country}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold" style={{ color:'#eaf2ff' }}>{o.amount_sent?.toLocaleString()} <span className="text-xs" style={{ color:'#8aa0cc' }}>{o.currency_from}</span></p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs" style={{ color: o.days_left <= 5 ? '#f87171' : '#fcd34d' }}>{o.days_left} días</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => restoreMutation.mutate(o.id)}
                          className="text-xs px-3 py-1 rounded-lg transition-colors"
                          style={{ color:'#38bdf8', background:'rgba(56,189,248,.08)', border:'1px solid rgba(56,189,248,.2)' }}
                        >Restaurar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <SlidePanel
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.sender_name || ''}
        subtitle={selectedOrder ? `${selectedOrder.order_number} · ${selectedOrder.receiver_name} → ${selectedOrder.receiver_country}` : ''}
      >
        {selectedOrder && <AdminOrderPanel order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      </SlidePanel>
    </FinexyLayout>
  )
}
