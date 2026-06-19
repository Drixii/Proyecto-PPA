import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import SlidePanel from '../../components/SlidePanel'
import { ClientOrderPanel } from '../../components/OrderPanel'
import TransactionsBackground from '../../components/TransactionsBackground'
import api from '../../services/api'
import { useStore } from '../../store/useStore'
import { flagUrl } from '../../utils/flags'
import { fmtDateShort, userTz } from '../../utils/timezone'

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: '22px',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)',
}

const STATUS_DOT_STYLE = {
  en_aprobacion: { background: '#eab308' },
  en_proceso: { background: '#60a5fa' },
  completado: { background: '#4ade80' },
}

const STATUS_STEP = { en_aprobacion: 1, en_proceso: 2, completado: 3 }

export default function Dashboard() {
  const { user } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [selectedOrder, setSelectedOrder] = useState(null)
  const [successBanner, setSuccessBanner] = useState(null)
  const [completedPopup, setCompletedPopup] = useState(null)
  const [rateCountry, setRateCountry] = useState('Venezuela')
  const [rateCurrency, setRateCurrency] = useState('VES')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const tz = userTz(user)
  const userHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }), 10)
  const userTimeStr = now.toLocaleTimeString('es-CL', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const greeting = userHour < 12 ? 'Buenos días' : userHour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders').then(r => r.data.data),
    refetchInterval: 30000,
  })

  const orders = data?.items || []
  const active = orders.filter(o => o.status !== 'completado')
  const completed = orders.filter(o => o.status === 'completado')
  const inProcess = orders.filter(o => o.status === 'en_proceso')
  const totalSent = orders.reduce((sum, o) => sum + (o.amount_sent || 0), 0)

  // Detect post-payment redirect OR notification navigation
  useEffect(() => {
    if (location.state?.newOrder) {
      const order = location.state.newOrder
      setSuccessBanner(order)
      setSelectedOrder(order)
      window.history.replaceState({}, '', window.location.pathname)
      const t = setTimeout(() => setSuccessBanner(null), 6000)
      return () => clearTimeout(t)
    }
    // From notification bell click
    if (location.state?.openOrderId) {
      const orderId = location.state.openOrderId
      const tab = location.state.openTab || 'estado'
      // Find order in loaded list or create a placeholder
      const found = (data?.items || []).find(o => o.id === orderId)
      if (found) setSelectedOrder({ ...found, _defaultTab: tab })
      else {
        // Fetch the order
        api.get(`/orders/${orderId}`).then(r => {
          setSelectedOrder({ ...r.data.data, _defaultTab: tab })
        }).catch(() => {})
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [location.state])

  // Show popup for newly completed orders not yet acknowledged
  useEffect(() => {
    if (!orders.length || !user?.id) return
    const seenKey = `completed_seen_${user.id}`
    const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'))
    const newlyDone = orders.filter(o => o.status === 'completado' && !seen.has(o.id))
    if (newlyDone.length > 0) setCompletedPopup(newlyDone)
  }, [orders, user?.id])

  const { data: pointsData } = useQuery({
    queryKey: ['my-points'],
    queryFn: () => api.get('/points/my').then(r => r.data.data),
    staleTime: 60000,
  })

  const { data: countriesData } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/rates/countries').then(r => r.data.data),
  })

  const { data: rateData } = useQuery({
    queryKey: ['live-rate', 'CLP', rateCurrency],
    queryFn: () => api.get('/rates/convert', { params: { from: 'CLP', to: rateCurrency, amount: 1000 } }).then(r => r.data.data),
    refetchInterval: 60000,
    enabled: !!rateCurrency,
  })

  return (
    <FinexyLayout>
      {createPortal(<TransactionsBackground style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }} />, document.body)}
      {/* Success banner */}
      {successBanner && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] w-[380px] rounded-2xl p-4 flex items-start gap-3" style={GLASS}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{background:'rgba(74,222,128,.08)'}}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{color:'#eaf2ff'}}>Pago registrado</p>
            <p className="text-xs mt-0.5" style={{color:'#aebfe2'}}>Tu envío se encuentra en proceso. Te notificaremos cada cambio de estado.</p>
            <p className="text-xs font-mono mt-1" style={{color:'#38bdf8'}}>{successBanner.order_number}</p>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="shrink-0" style={{color:'#8aa0cc'}}>✕</button>
        </div>
      )}

      <div className="p-6 max-w-[1300px] mx-auto" style={{ position: 'relative', zIndex: 2 }}>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold" style={{color:'#eaf2ff'}}>{greeting}, {user?.full_name?.split(' ')[0]}.</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>
            {active.length > 0
              ? `Tienes ${active.length} envío${active.length !== 1 ? 's' : ''} activo${active.length !== 1 ? 's' : ''}.`
              : 'No tienes envíos activos.'}
            <span className="ml-3 font-mono" style={{color:'#475569'}}>🕐 {userTimeStr} <span style={{fontSize:10}}>{user?.country || 'Santiago'}</span></span>
          </p>
        </div>

        {/* ── 3-column grid ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_280px] gap-4 mb-4" style={{ position: 'relative', zIndex: 1 }}>

          {/* LEFT */}
          <div className="space-y-4 self-start">
            {/* Total sent card */}
            <div className="rounded-2xl p-5" style={GLASS}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{color:'#8aa0cc'}}>Total enviado</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold" style={{color:'#38bdf8'}}>{totalSent.toLocaleString('es-CL')}</p>
                  <p className="text-xs mt-0.5" style={{color:'#8aa0cc'}}>CLP en total</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => navigate('/new-transfer')}
                  className="flex-1 bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-xs font-semibold py-2 rounded-xl transition-all shadow-sm shadow-blue-200 flex items-center justify-center gap-1"
                >
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Enviar
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex-1 text-xs font-semibold py-2 rounded-xl transition-colors"
                  style={{background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#aebfe2'}}
                >
                  Historial
                </button>
              </div>
            </div>

            {/* Points card */}
            <button
              onClick={() => navigate('/mis-puntos')}
              className="w-full rounded-2xl p-5 text-left transition-all"
              style={{ ...GLASS, border: '1px solid rgba(253,211,77,.2)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(253,211,77,.45)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(253,211,77,.2)'}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-wider" style={{ color: '#8aa0cc' }}>Tus puntos</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(253,211,77,.1)' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: '#fcd34d' }}>{(pointsData?.total_points || 0).toLocaleString()}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>puntos acumulados · ver canjeables →</p>
            </button>

            {/* Active orders mini list (like Wallets) */}
            <div className="rounded-2xl p-5" style={GLASS}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Envíos activos</p>
                <p className="text-xs" style={{color:'#8aa0cc'}}>{active.length} en curso</p>
              </div>
              {active.length === 0 && (
                <p className="text-xs text-center py-4" style={{color:'#475569'}}>Sin envíos activos</p>
              )}
              <div className="space-y-2">
                {active.slice(0, 3).map(order => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="w-full flex items-center justify-between p-3 rounded-xl transition-colors"
                    style={{border:'1px solid rgba(255,255,255,.08)'}}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={STATUS_DOT_STYLE[order.status]} />
                      <span className="inline-flex items-center gap-1 text-xs font-medium truncate" style={{color:'#aebfe2'}}>
                        {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                        {order.receiver_country}
                      </span>
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{color:'#eaf2ff'}}>{order.amount_sent?.toLocaleString()} {order.currency_from}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* MIDDLE: 2x2 stats */}
          <div className="grid grid-cols-2 gap-4">
            {/* Blue gradient card */}
            <button
              onClick={() => navigate('/historial', { state: { filter: 'active' } })}
              className="bg-gradient-to-br from-blue-400 to-blue-800 rounded-2xl p-5 text-white shadow-lg shadow-blue-200/50 flex flex-col justify-between text-left hover:shadow-2xl hover:from-blue-500 hover:to-blue-900 transition-all cursor-pointer">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-blue-100">Envíos Activos</p>
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3">{active.length}</p>
                <p className="text-blue-200 text-xs mt-1">en proceso ahora →</p>
              </div>
            </button>

            {/* Completados */}
            <button
              onClick={() => navigate('/historial', { state: { filter: 'completado' } })}
              className="rounded-2xl p-5 flex flex-col justify-between text-left transition-all cursor-pointer"
              style={GLASS}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Completados</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(74,222,128,.08)'}}>
                  <div className="w-3 h-3 rounded-full" style={{background:'#4ade80'}} />
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3" style={{color:'#eaf2ff'}}>{completed.length}</p>
                <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>transferencias completadas →</p>
              </div>
            </button>

            {/* En proceso */}
            <button
              onClick={() => navigate('/historial', { state: { filter: 'en_proceso' } })}
              className="rounded-2xl p-5 flex flex-col justify-between text-left transition-all cursor-pointer"
              style={GLASS}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>En Proceso</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(56,189,248,.08)'}}>
                  <div className="w-3 h-3 rounded-full animate-pulse" style={{background:'#60a5fa'}} />
                </div>
              </div>
              <div>
                <p className="text-4xl font-bold mt-3" style={{color:'#eaf2ff'}}>{inProcess.length}</p>
                <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>siendo procesados →</p>
              </div>
            </button>

            {/* Tasa en vivo — selector con banderas */}
            <LiveRateCard
              countries={countriesData || []}
              rateCountry={rateCountry}
              rateCurrency={rateCurrency}
              rateData={rateData}
              onChange={(country, currency) => { setRateCountry(country); setRateCurrency(currency) }}
            />
          </div>

          {/* RIGHT: recent orders hub */}
          <div className="xl:col-start-3 xl:row-start-1 rounded-2xl flex flex-col overflow-hidden max-h-[420px] self-start" style={GLASS}>
            <div className="px-5 py-4" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
              <h2 className="text-sm font-bold" style={{color:'#eaf2ff'}}>Mis envíos</h2>
              <p className="text-xs mt-0.5" style={{color:'#8aa0cc'}}>Actividad reciente</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <div className="w-9 h-9 rounded-full animate-pulse shrink-0" style={{background:'rgba(255,255,255,.06)'}} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 rounded animate-pulse w-24" style={{background:'rgba(255,255,255,.06)'}} />
                    <div className="h-2 rounded animate-pulse w-16" style={{background:'rgba(255,255,255,.06)'}} />
                  </div>
                </div>
              ))}
              {!isLoading && orders.length === 0 && (
                <div className="py-10 px-5 text-center">
                  <p className="text-xs" style={{color:'#475569'}}>Sin envíos todavía</p>
                  <button onClick={() => navigate('/new-transfer')} className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 rounded-lg">
                    Hacer mi primer envío
                  </button>
                </div>
              )}
              {!isLoading && orders.slice(0, 8).map(order => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="flex items-center gap-3 px-5 py-3 w-full text-left transition-colors"
                  style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}
                >
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {order.receiver_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{color:'#eaf2ff'}}>{order.receiver_name}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] truncate" style={{color:'#8aa0cc'}}>
                      {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                      {order.receiver_country}
                    </span>
                  </div>
                  <div className="w-2 h-2 rounded-full shrink-0" style={STATUS_DOT_STYLE[order.status]} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom: orders table ──────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={GLASS}>
          <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
            <h2 className="text-sm font-bold" style={{color:'#eaf2ff'}}>Historial de transferencias</h2>
            <button
              onClick={() => navigate('/new-transfer')}
              className="bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-sm shadow-blue-200 transition-all"
            >
              + Nuevo envío
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'rgba(4,10,30,.6)'}}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-6 py-3" style={{color:'#8aa0cc'}}>Order ID</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#8aa0cc'}}>Receptor</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#8aa0cc'}}>Monto enviado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#8aa0cc'}}>Recibe</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#8aa0cc'}}>Estado</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{color:'#8aa0cc'}}>Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-3 rounded animate-pulse w-20" style={{background:'rgba(255,255,255,.06)'}} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm" style={{color:'#475569'}}>Sin transferencias</td>
                  </tr>
                )}
                {!isLoading && orders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="cursor-pointer transition-colors"
                    style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs" style={{color:'#8aa0cc'}}>{order.order_number}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {order.receiver_name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{color:'#eaf2ff'}}>{order.receiver_name}</p>
                          <span className="inline-flex items-center gap-1 text-[11px]" style={{color:'#8aa0cc'}}>
                            {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                            {order.receiver_country}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold" style={{color:'#eaf2ff'}}>
                        {order.amount_sent?.toLocaleString()} <span className="font-normal text-xs" style={{color:'#8aa0cc'}}>{order.currency_from}</span>
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold" style={{color:'#4ade80'}}>
                        {order.amount_received?.toLocaleString()} <span className="font-normal text-xs" style={{color:'#4ade80'}}>{order.currency_to}</span>
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={STATUS_DOT_STYLE[order.status]} />
                        <span className="text-xs capitalize" style={{color:'#aebfe2'}}>{order.status?.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs" style={{color:'#8aa0cc'}}>
                        {fmtDateShort(order.created_at, tz)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button className="text-lg leading-none" style={{color:'#8aa0cc'}}>···</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Slide panel */}
      <SlidePanel
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.receiver_name || ''}
        subtitle={selectedOrder ? `${selectedOrder.order_number} · ${selectedOrder.amount_sent?.toLocaleString()} ${selectedOrder.currency_from} → ${selectedOrder.receiver_country}` : ''}
      >
        {selectedOrder && <ClientOrderPanel order={selectedOrder} />}
      </SlidePanel>

      {/* Completed orders popup */}
      {completedPopup && completedPopup.length > 0 && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)' }}>
          <div style={{ ...GLASS, maxWidth: 440, width: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(74,222,128,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#4ade80' }} />
                </div>
                <div>
                  <p style={{ color: '#eaf2ff', fontWeight: 700, fontSize: 15, margin: 0 }}>
                    {completedPopup.length === 1 ? '¡Tu caso fue completado!' : `¡${completedPopup.length} casos completados!`}
                  </p>
                  <p style={{ color: '#8aa0cc', fontSize: 12, marginTop: 2 }}>Estos envíos ya fueron procesados</p>
                </div>
              </div>
            </div>
            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {completedPopup.map(order => (
                <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {order.receiver_name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#eaf2ff', fontWeight: 600, fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.receiver_name}</p>
                    <p style={{ color: '#8aa0cc', fontSize: 11, marginTop: 2 }}>{order.order_number} · {order.receiver_country}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 13, margin: 0 }}>{order.amount_received?.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400 }}>{order.currency_to}</span></p>
                    <p style={{ color: '#8aa0cc', fontSize: 10, marginTop: 1 }}>{order.amount_sent?.toLocaleString()} {order.currency_from}</p>
                    {order.points_earned > 0 && (
                      <p style={{ color: '#fbbf24', fontSize: 10, marginTop: 3, fontWeight: 600 }}>⭐ +{order.points_earned} pts</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
              <button
                onClick={() => {
                  const seenKey = `completed_seen_${user?.id}`
                  const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'))
                  completedPopup.forEach(o => seen.add(o.id))
                  localStorage.setItem(seenKey, JSON.stringify([...seen]))
                  setCompletedPopup(null)
                }}
                style={{ width: '100%', padding: '11px 0', borderRadius: 12, background: 'linear-gradient(135deg, #4ade80, #16a34a)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </FinexyLayout>
  )
}

function LiveRateCard({ countries, rateCountry, rateCurrency, rateData, onChange }) {
  const [dropOpen, setDropOpen] = useState(false)
  const cardRef = useRef()

  useEffect(() => {
    const h = (e) => { if (cardRef.current && !cardRef.current.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const availableCountries = countries.filter(c => c.currency !== 'CLP')

  return (
    <div ref={cardRef} className="rounded-2xl p-5 flex flex-col gap-3 relative" style={{ ...GLASS, overflow: 'visible' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Tasa en vivo</p>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{background:'rgba(74,222,128,.08)'}}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'#4ade80'}} />
          <span className="text-[10px] font-semibold" style={{color:'#4ade80'}}>24/7</span>
        </div>
      </div>

      {/* Country selector + dropdown */}
      <div className="relative">
        <button
          onClick={() => setDropOpen(v => !v)}
          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all text-left"
          style={{
            background: 'rgba(6,13,40,.85)',
            border: dropOpen ? '1px solid rgba(56,189,248,.45)' : '1px solid rgba(255,255,255,.1)',
            boxShadow: dropOpen ? '0 0 0 3px rgba(56,189,248,.08)' : 'none',
          }}>
          {flagUrl(rateCountry)
            ? <img src={flagUrl(rateCountry)} alt="" className="w-6 h-[17px] rounded-sm object-cover shrink-0" />
            : <span className="text-xl leading-none">🌍</span>
          }
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate" style={{color:'#eaf2ff'}}>{rateCountry}</p>
            <p className="text-[10px]" style={{color:'#8aa0cc'}}>{rateCurrency}</p>
          </div>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
            className="shrink-0 transition-transform" style={{color:'#8aa0cc', transform: dropOpen ? 'rotate(180deg)' : 'none'}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dropOpen && (
          <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-[300]"
            style={{
              background: 'rgba(5,11,35,.98)',
              border: '1px solid rgba(56,189,248,.2)',
              boxShadow: '0 16px 40px rgba(0,0,0,.7)',
              maxHeight: 200,
              overflowY: 'auto',
            }}>
            {availableCountries.length === 0 && (
              <p className="text-xs text-center py-4" style={{color:'#475569'}}>Cargando países...</p>
            )}
            {availableCountries.map(c => (
              <button key={c.country}
                onClick={() => { onChange(c.country, c.currency); setDropOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,.04)',
                  background: rateCountry === c.country ? 'rgba(56,189,248,.1)' : 'transparent',
                }}
                onMouseEnter={e => { if (rateCountry !== c.country) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                onMouseLeave={e => { if (rateCountry !== c.country) e.currentTarget.style.background = 'transparent' }}
              >
                {flagUrl(c.country)
                  ? <img src={flagUrl(c.country)} alt="" className="w-5 h-[14px] rounded-sm object-cover shrink-0" />
                  : <span className="text-base leading-none shrink-0">🌍</span>
                }
                <p className="flex-1 text-xs font-semibold truncate" style={{color:'#eaf2ff'}}>{c.country}</p>
                <span className="text-[10px] font-mono shrink-0" style={{color: rateCountry === c.country ? '#38bdf8' : '#8aa0cc'}}>{c.currency}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rate display */}
      <div className="rounded-xl px-3 py-2.5" style={{background:'rgba(6,13,40,.5)', border:'1px solid rgba(255,255,255,.06)'}}>
        <p className="text-xl font-bold" style={{color: rateData ? '#eaf2ff' : '#475569'}}>
          {rateData ? (rateData.rate * 1000).toFixed(4) : '— '}
          <span className="text-xs font-normal ml-1" style={{color:'#8aa0cc'}}>{rateCurrency}</span>
        </p>
        <p className="text-[10px] mt-0.5" style={{color:'#8aa0cc'}}>por 1.000 CLP</p>
      </div>
    </div>
  )
}
