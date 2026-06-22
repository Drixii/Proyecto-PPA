import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'
import { useStore } from '../../store/useStore'
import { userTz, countryToTz, fmtDateShort } from '../../utils/timezone'
import { CountryWithFlag } from '../../utils/flags.jsx'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const STATUS_CFG = {
  en_aprobacion: { label: 'Por Aprobar', bg: 'rgba(251,146,60,.12)', color: '#fb923c' },
  en_proceso:    { label: 'En Proceso',  bg: 'rgba(96,165,250,.12)',  color: '#60a5fa' },
  completado:    { label: 'Completado',  bg: 'rgba(74,222,128,.12)',  color: '#4ade80' },
}

function StatusChip({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, bg: 'rgba(255,255,255,.08)', color: '#8aa0cc' }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

export default function SubAdminDashboard() {
  const { user } = useStore()
  const navigate = useNavigate()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { data: stats, isLoading } = useQuery({
    queryKey: ['sub-admin-stats'],
    queryFn: () => api.get('/sub-admin/stats').then(r => r.data.data),
    refetchInterval: 30000,
  })

  // Timezone: use stats.managed_countries (reliable) → fallback to userTz
  const tz = stats?.managed_countries?.length > 0
    ? countryToTz(stats.managed_countries[0])
    : userTz(user)

  const userHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }), 10)
  const timeStr = now.toLocaleTimeString('es-CL', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('es-CL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
  const greeting = userHour < 12 ? 'Buenos días' : userHour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const primaryCountry = stats?.managed_countries?.[0] || user?.managed_countries?.[0] || user?.country || ''

  return (
    <FinexyLayout>
      <div className="p-4 md:p-6 max-w-[1200px] mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: '#eaf2ff' }}>
            {greeting}, {user?.full_name?.split(' ')[0]}.
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-sm" style={{ color: '#8aa0cc' }}>
              {stats?.en_aprobacion_pending > 0
                ? `${stats.en_aprobacion_pending} caso${stats.en_aprobacion_pending !== 1 ? 's' : ''} pendiente${stats.en_aprobacion_pending !== 1 ? 's' : ''} de procesar`
                : 'Sin casos nuevos pendientes'}
            </p>
            <span className="font-mono text-xs flex items-center gap-1" style={{ color: '#475569' }}>
              🕐 {timeStr}
              {primaryCountry && <span style={{ fontSize: 10 }}>{primaryCountry}</span>}
            </span>
          </div>
          <p className="text-xs mt-0.5 capitalize" style={{ color: '#475569' }}>{dateStr}</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

          {/* En proceso hoy */}
          <div className="rounded-2xl p-5" style={GLASS}>
            <div className="flex items-start justify-between">
              <p className="text-xs md:text-sm font-semibold" style={{ color: '#aebfe2' }}>En Proceso hoy</p>
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(96,165,250,.08)' }}>
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#60a5fa' }} />
              </div>
            </div>
            <p className="text-3xl md:text-4xl font-bold mt-3" style={{ color: '#eaf2ff' }}>
              {isLoading ? '—' : (stats?.en_proceso_today ?? 0)}
            </p>
            <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>casos activos hoy</p>
          </div>

          {/* Pendientes aprobación */}
          <div className="rounded-2xl p-5" style={GLASS}>
            <div className="flex items-start justify-between">
              <p className="text-xs md:text-sm font-semibold" style={{ color: '#aebfe2' }}>Por Aprobar</p>
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(251,146,60,.08)' }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#fb923c' }} />
              </div>
            </div>
            <p className="text-3xl md:text-4xl font-bold mt-3" style={{ color: '#eaf2ff' }}>
              {isLoading ? '—' : (stats?.en_aprobacion_pending ?? 0)}
            </p>
            <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>esperando proceso</p>
          </div>

          {/* Countries */}
          <div className="col-span-2 lg:col-span-1 rounded-2xl p-5" style={GLASS}>
            <p className="text-xs md:text-sm font-semibold mb-3" style={{ color: '#aebfe2' }}>Países asignados</p>
            {isLoading ? (
              <div className="space-y-1">
                {[1, 2].map(i => <div key={i} className="h-5 rounded animate-pulse w-24" style={{ background: 'rgba(255,255,255,.04)' }} />)}
              </div>
            ) : (stats?.managed_countries || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(stats?.managed_countries || []).map(c => (
                  <span key={c} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold"
                    style={{ background: 'rgba(45,212,191,.1)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,.15)' }}>
                    <CountryWithFlag country={c} />
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: '#475569' }}>Sin países asignados</p>
            )}
          </div>
        </div>

        {/* Historial de Hoy */}
        <div className="rounded-2xl overflow-hidden" style={GLASS}>
          <div className="flex items-center justify-between px-5 md:px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: '#eaf2ff' }}>Historial de Hoy</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>Todos los casos de hoy — todos los estados</p>
            </div>
            <button
              onClick={() => navigate('/sub-admin/pipeline')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(56,189,248,.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.15)' }}
            >
              Pipeline →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(4,10,30,.6)' }}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 md:px-6 py-3" style={{ color: '#8aa0cc' }}>Orden</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#8aa0cc' }}>Receptor</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden sm:table-cell" style={{ color: '#8aa0cc' }}>País</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#8aa0cc' }}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden sm:table-cell" style={{ color: '#8aa0cc' }}>Derivado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden md:table-cell" style={{ color: '#8aa0cc' }}>Hora</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    {[1, 2, 3, 4, 5, 6].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 rounded animate-pulse w-20" style={{ background: 'rgba(255,255,255,.06)' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && (stats?.today_orders || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm" style={{ color: '#475569' }}>
                      Sin actividad hoy
                    </td>
                  </tr>
                )}
                {!isLoading && (stats?.today_orders || []).map(order => (
                  <tr key={order.id}
                    onClick={() => navigate('/sub-admin/pipeline', { state: { openOrderId: order.id } })}
                    className="cursor-pointer"
                    style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td className="px-5 md:px-6 py-3">
                      <span className="font-mono text-xs" style={{ color: '#38bdf8' }}>{order.order_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold" style={{ color: '#eaf2ff' }}>{order.receiver_name}</p>
                      <p className="text-[10px]" style={{ color: '#475569' }}>{order.sender_name}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#8aa0cc' }}>
                        <CountryWithFlag country={order.receiver_country} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={order.status} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {order.super_admin_name && (
                        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(56,189,248,.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.15)' }}>
                          {order.super_admin_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs" style={{ color: '#8aa0cc' }}>{fmtDateShort(order.updated_at, tz)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </FinexyLayout>
  )
}
