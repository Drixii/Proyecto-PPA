import { useState, useEffect } from 'react'
import { fmtDateShort } from '../../utils/timezone'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import SlidePanel from '../../components/SlidePanel'
import { AdminOrderPanel } from '../../components/OrderPanel'
import StatusBadge from '../../components/StatusBadge'
import TransactionsBackground from '../../components/TransactionsBackground'
import api from '../../services/api'
import { useStore } from '../../store/useStore'
import { flagUrl } from '../../utils/flags'

const STATUS_DOT = {
  en_aprobacion: 'bg-orange-400',
  en_proceso: 'bg-blue-500',
  completado: 'bg-green-500',
}

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: '22px',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)',
}

const CARD_STYLE = GLASS

export default function AdminDashboard() {
  const { user } = useStore()
  const navigate = useNavigate()
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [hoveredStatCard, setHoveredStatCard] = useState(null)
  const [hoveredStatusItem, setHoveredStatusItem] = useState(null)
  const [hoveredRecentItem, setHoveredRecentItem] = useState(null)
  const [hoveredSettingsBtn, setHoveredSettingsBtn] = useState(false)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const chileHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Santiago', hour: 'numeric', hour12: false }), 10)
  const chileTimeStr = now.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const greeting = chileHour < 12 ? 'Buenos días' : chileHour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data.data),
    refetchInterval: 30000,
  })

  const stats = data || {}
  const byStatus = stats.by_status || {}
  const recent = stats.recent_orders || []
  const totalPending = byStatus.en_aprobacion || 0

  return (
    <FinexyLayout>
      {createPortal(<TransactionsBackground style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }} />, document.body)}
      <div className="p-6 max-w-[1400px] mx-auto" style={{ position: 'relative', zIndex: 2, fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>

        {/* Page title */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#eaf2ff' }}>{greeting}, {user?.full_name?.split(' ')[0]}.</h1>
            <p className="text-sm mt-1" style={{ color: '#8aa0cc' }}>
              {totalPending > 0
                ? `Tienes ${totalPending} orden${totalPending !== 1 ? 'es' : ''} pendiente${totalPending !== 1 ? 's' : ''} de procesar.`
                : 'Todo al día. Sin órdenes pendientes.'}
              <span className="ml-3 font-mono" style={{color:'#475569'}}>🕐 {chileTimeStr} <span style={{fontSize:10}}>Santiago</span></span>
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs hover:underline flex items-center gap-1 mt-1" style={{ color: '#38bdf8' }}
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Actualizar
          </button>
        </div>

        {/* ── 3-column grid ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_280px] gap-4 mb-4" style={{ position: 'relative', zIndex: 1 }}>

          {/* LEFT: Summary + Estado cards */}
          <div className="space-y-4 self-start">
            {/* Volume card */}
            <div className="rounded-2xl p-5" style={CARD_STYLE}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8aa0cc' }}>Volumen hoy</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold" style={{ color: '#eaf2ff' }}>
                    {isLoading ? '—' : (stats.volume_today || 0).toLocaleString('es-CL')}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>CLP procesados</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-300 font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(56,189,248,.15)' }}>
                  ↑ activo
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => navigate('/admin/pipeline')}
                  className="flex-1 bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-xs font-semibold py-2 rounded-xl transition-all shadow-sm shadow-blue-200"
                >
                  Pipeline
                </button>
                <button
                  onClick={() => navigate('/admin/settings')}
                  onMouseEnter={() => setHoveredSettingsBtn(true)}
                  onMouseLeave={() => setHoveredSettingsBtn(false)}
                  className="flex-1 text-xs font-semibold py-2 rounded-xl transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: hoveredSettingsBtn ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)' }}
                >
                  Ajustes
                </button>
              </div>
            </div>

            {/* Estado breakdown */}
            <div className="rounded-2xl p-5" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: '#c8d8f0' }}>Por estado</p>
                <p className="text-xs" style={{ color: '#8aa0cc' }}>{stats.total_orders || 0} total</p>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'en_aprobacion', label: 'En Aprobación' },
                  { key: 'en_proceso', label: 'En Proceso' },
                  { key: 'completado', label: 'Completado' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => navigate('/admin/pipeline')}
                    onMouseEnter={() => setHoveredStatusItem(key)}
                    onMouseLeave={() => setHoveredStatusItem(null)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border transition-colors"
                    style={{
                      borderColor: hoveredStatusItem === key ? 'rgba(56,189,248,.15)' : 'rgba(255,255,255,.08)',
                      background: hoveredStatusItem === key ? 'rgba(56,189,248,.08)' : 'rgba(255,255,255,.03)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[key]}`} />
                      <span className="text-xs font-medium" style={{ color: '#c8d8f0' }}>{label}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#eaf2ff' }}>{byStatus[key] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* MIDDLE: 2x2 stat cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Blue gradient card */}
            <button
              onClick={() => navigate('/admin/orders')}
              className="bg-gradient-to-br from-blue-400 to-blue-800 rounded-2xl p-5 text-white shadow-lg shadow-blue-200/50 flex flex-col justify-between text-left hover:from-blue-500 hover:to-blue-900 hover:shadow-2xl transition-all cursor-pointer">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-blue-100">Órdenes Hoy</p>
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3">
                  {isLoading ? '—' : Object.values(byStatus).reduce((a, b) => a + b, 0)}
                </p>
                <p className="text-blue-200 text-xs mt-1">ver todas →</p>
              </div>
            </button>

            {/* Pending */}
            <button
              onClick={() => navigate('/admin/orders', { state: { statusFilter: 'pending' } })}
              onMouseEnter={() => setHoveredStatCard('pending')}
              onMouseLeave={() => setHoveredStatCard(null)}
              className="rounded-2xl p-5 flex flex-col justify-between text-left cursor-pointer transition-all"
              style={{ ...GLASS, border: hoveredStatCard === 'pending' ? '1px solid rgba(251,191,36,.3)' : '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold" style={{ color: '#8aa0cc' }}>Pendientes</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,.15)' }}>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3" style={{ color: '#eaf2ff' }}>{totalPending}</p>
                <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>sin procesar →</p>
              </div>
            </button>

            {/* En proceso */}
            <button
              onClick={() => navigate('/admin/orders', { state: { statusFilter: 'en_proceso' } })}
              onMouseEnter={() => setHoveredStatCard('en_proceso')}
              onMouseLeave={() => setHoveredStatCard(null)}
              className="rounded-2xl p-5 flex flex-col justify-between text-left cursor-pointer transition-all"
              style={{ ...GLASS, border: hoveredStatCard === 'en_proceso' ? '1px solid rgba(56,189,248,.3)' : '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold" style={{ color: '#8aa0cc' }}>En Proceso</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(56,189,248,.12)' }}>
                  <div className="w-3 h-3 bg-blue-400 rounded-full" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3" style={{ color: '#eaf2ff' }}>{byStatus.en_proceso || 0}</p>
                <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>procesando →</p>
              </div>
            </button>

            {/* Completado */}
            <button
              onClick={() => navigate('/admin/orders', { state: { statusFilter: 'completado' } })}
              onMouseEnter={() => setHoveredStatCard('completado')}
              onMouseLeave={() => setHoveredStatCard(null)}
              className="rounded-2xl p-5 flex flex-col justify-between text-left cursor-pointer transition-all"
              style={{ ...GLASS, border: hoveredStatCard === 'completado' ? '1px solid rgba(74,222,128,.3)' : '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold" style={{ color: '#8aa0cc' }}>Completadas</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,222,128,.12)' }}>
                  <div className="w-3 h-3 bg-green-400 rounded-full" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3" style={{ color: '#eaf2ff' }}>{byStatus.completado || 0}</p>
                <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>completadas →</p>
              </div>
            </button>
          </div>

          {/* RIGHT: Recent hub */}
          <div className="xl:col-start-3 xl:row-start-1 rounded-2xl flex flex-col overflow-hidden max-h-[420px] self-start" style={GLASS}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <h2 className="text-sm font-bold" style={{ color: '#eaf2ff' }}>Órdenes de hoy</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>Por orden de llegada</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 bg-white/5 rounded-full animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-white/5 rounded animate-pulse w-28" />
                    <div className="h-2 bg-white/5 rounded animate-pulse w-20" />
                  </div>
                </div>
              ))}
              {!isLoading && recent.length === 0 && (
                <p className="text-center text-xs py-10" style={{ color: '#475569' }}>Sin órdenes hoy</p>
              )}
              {!isLoading && recent.map(order => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  onMouseEnter={() => setHoveredRecentItem(order.id)}
                  onMouseLeave={() => setHoveredRecentItem(null)}
                  className="flex items-center gap-3 px-5 py-3 w-full text-left transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,.04)',
                    background: hoveredRecentItem === order.id ? 'rgba(56,189,248,.05)' : 'transparent',
                  }}
                >
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {order.sender_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: '#eaf2ff' }}>{order.sender_name}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] truncate" style={{ color: '#8aa0cc' }}>
                      {order.amount_sent?.toLocaleString()} {order.currency_from} →
                      {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0 ml-0.5" />}
                      {order.receiver_country}
                    </span>
                  </div>
                  <div className="shrink-0">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.status]}`} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom: Recent activities table ──────── */}
        <div className="rounded-2xl overflow-hidden" style={GLASS}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <h2 className="text-sm font-bold" style={{ color: '#eaf2ff' }}>Órdenes de hoy</h2>
            <button
              onClick={() => navigate('/admin/pipeline')}
              className="text-xs font-medium hover:underline"
              style={{ color: '#38bdf8' }}
            >
              Ver pipeline →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(4,10,30,.6)' }}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-6 py-3" style={{ color: '#8aa0cc' }}>Order ID</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#8aa0cc' }}>Cliente</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#8aa0cc' }}>Monto</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#8aa0cc' }}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#8aa0cc' }}>Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-3 bg-white/5 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && recent.map(order => (
                  <TableRow
                    key={order.id}
                    order={order}
                    onClick={() => setSelectedOrder(order)}
                  />
                ))}
                {!isLoading && recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm" style={{ color: '#475569' }}>Sin órdenes hoy</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Slide panel */}
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

function TableRow({ order, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer transition-all"
      style={{ borderBottom: '1px solid rgba(255,255,255,.04)', background: hovered ? 'rgba(56,189,248,.05)' : 'transparent' }}
    >
      <td className="px-6 py-4">
        <span className="font-mono text-xs" style={{ color: '#8aa0cc' }}>{order.order_number}</span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {order.sender_name?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-medium" style={{ color: '#c8d8f0' }}>{order.sender_name}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>
          {order.amount_sent?.toLocaleString()} <span className="font-normal text-xs" style={{ color: '#8aa0cc' }}>{order.currency_from}</span>
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[order.status]}`} />
          <span className="text-xs capitalize" style={{ color: '#aebfe2' }}>{order.status?.replace('_', ' ')}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="text-xs" style={{ color: '#8aa0cc' }}>
          {fmtDateShort(order.created_at)}
        </span>
      </td>
      <td className="px-4 py-4 text-right">
        <button className="text-lg leading-none" style={{ color: 'rgba(255,255,255,.2)' }}>···</button>
      </td>
    </tr>
  )
}
