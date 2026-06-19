import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import FinexyLayout from '../../components/FinexyLayout'
import OrderCard from '../../components/OrderCard'
import SlidePanel from '../../components/SlidePanel'
import { AdminOrderPanel } from '../../components/OrderPanel'
import DateRangePicker from '../../components/DateRangePicker'
import FilterDropdown from '../../components/FilterDropdown'
import api from '../../services/api'

const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0)
const todayEnd   = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59)

const COLUMNS_DEFAULT = [
  { key: 'en_aprobacion', label: 'En Aprobación', dot: 'bg-orange-400', bg: 'border-t-orange-400' },
  { key: 'completado',    label: 'Completado',    dot: 'bg-green-500',  bg: 'border-t-green-500'  },
]
const COLUMNS_ALL = [
  { key: 'en_aprobacion', label: 'En Aprobación', dot: 'bg-orange-400', bg: 'border-t-orange-400' },
  { key: 'en_proceso',    label: 'En Proceso',    dot: 'bg-blue-500',   bg: 'border-t-blue-500'   },
  { key: 'completado',    label: 'Completado',    dot: 'bg-green-500',  bg: 'border-t-green-500'  },
]

export default function Pipeline() {
  const qc = useQueryClient()
  const location = useLocation()
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [dateRange, setDateRange] = useState({ from: todayStart, to: todayEnd })
  const [filterMode, setFilterMode] = useState({ type: 'none' })

  useEffect(() => {
    if (location.state?.openOrderId) {
      const id = location.state.openOrderId
      const tab = location.state.openTab || 'resumen'
      api.get(`/admin/orders/${id}`).then(r => {
        setSelectedOrder({ ...r.data.data, _defaultTab: tab })
      }).catch(() => {})
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [location.state])

  const { data: subAdmins = [] } = useQuery({
    queryKey: ['sub-admins'],
    queryFn: () => api.get('/admin/sub-admins').then(r => r.data.data),
    staleTime: 60000,
  })

  // Derive API params from filterMode
  const apiParams = {
    page_size: 500,
    date_from: dateRange.from.toISOString(),
    date_to: dateRange.to.toISOString(),
    ...(filterMode.type === 'all' ? { all_orders: true } : {}),
    ...(filterMode.type === 'subadmin' ? { sub_admin_id: filterMode.id, all_orders: true } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-orders', dateRange, filterMode],
    queryFn: () => api.get('/admin/orders', { params: apiParams }).then(r => r.data.data.items),
    refetchInterval: 15000,
  })

  const COLUMNS = filterMode.type === 'none' ? COLUMNS_DEFAULT : COLUMNS_ALL

  // Build name lookup for "Asignado" badge (only shown in 'all' mode)
  const idToName = {}
  const countryToName = {}
  subAdmins.forEach(sa => {
    idToName[sa.id] = sa.full_name
    ;(sa.managed_countries || []).forEach(c => { countryToName[c] = sa.full_name })
  })

  const getAssignedName = (order) => {
    return order.sub_admin_id
      ? idToName[order.sub_admin_id]
      : countryToName[order.receiver_country]
  }

  const byStatus = (status) => (data || [])
    .filter(o => o.status === status)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <FinexyLayout fullHeight>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Sub-header */}
        <div className="px-6 py-3 flex items-center gap-4 shrink-0 flex-wrap" style={{ background:'rgba(6,13,40,.9)', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          <h2 className="font-semibold" style={{ color:'#eaf2ff' }}>Pipeline</h2>
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <FilterDropdown
            subAdmins={subAdmins}
            filterMode={filterMode}
            onChange={setFilterMode}
          />

          {filterMode.type !== 'none' && (
            <button
              onClick={() => setFilterMode({ type: 'none' })}
              className="text-xs hover:text-red-400 flex items-center gap-1 transition-colors"
              style={{ color:'#8aa0cc' }}
            >
              ✕ Quitar filtro
            </button>
          )}

          <span className="text-xs ml-auto" style={{ color:'#8aa0cc' }}>actualiza cada 15s · {(data || []).length} órdenes</span>
        </div>

        {/* Kanban area */}
        <div className="flex-1 overflow-x-auto p-6">
          {isLoading ? (
            <div className="flex gap-5">
              {COLUMNS.map(col => (
                <div key={col.key} className="w-72 shrink-0 space-y-3">
                  <div className="h-8 rounded-xl animate-pulse" style={{ background:'rgba(255,255,255,.06)' }} />
                  {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background:'rgba(255,255,255,.06)' }} />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-5 min-h-full">
              {COLUMNS.map(({ key, label, dot, bg }) => {
                const orders = byStatus(key)
                return (
                  <div key={key} className="w-72 shrink-0 flex flex-col">
                    <div className={`rounded-xl border-t-4 ${bg} px-4 py-3 mb-3 flex items-center justify-between`} style={{ background:'rgba(8,16,44,.92)', border:'1px solid rgba(255,255,255,.08)', borderTopWidth:4 }}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                        <span className="font-semibold text-sm" style={{ color:'#eaf2ff' }}>{label}</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:'rgba(255,255,255,.08)', color:'#8aa0cc' }}>{orders.length}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      {orders.map(order => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          isAdmin
                          onView={o => setSelectedOrder(o)}
                          assignedName={filterMode.type === 'all' ? getAssignedName(order) : null}
                        />
                      ))}
                      {orders.length === 0 && (
                        <div className="text-center py-10 text-xs rounded-xl border-2 border-dashed" style={{ color:'#8aa0cc', background:'rgba(255,255,255,.02)', borderColor:'rgba(255,255,255,.08)' }}>
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
        onClose={() => {
          setSelectedOrder(null)
          qc.invalidateQueries({ queryKey: ['pipeline-orders'] })
        }}
        title={selectedOrder?.sender_name || ''}
        subtitle={selectedOrder ? `${selectedOrder.order_number} · ${selectedOrder.receiver_name} → ${selectedOrder.receiver_country}` : ''}
      >
        {selectedOrder && <AdminOrderPanel order={selectedOrder} onClose={() => {
          setSelectedOrder(null)
          qc.invalidateQueries({ queryKey: ['pipeline-orders'] })
        }} />}
      </SlidePanel>
    </FinexyLayout>
  )
}
