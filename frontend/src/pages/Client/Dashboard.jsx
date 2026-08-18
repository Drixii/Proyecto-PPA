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
import { flagUrl, Bandera } from '../../utils/flags'
import EstadoOrden from '../../components/EstadoOrden'
import { ESTADO_COLOR } from '../../utils/orderStatus'
import { fmtDateShort, userTz } from '../../utils/timezone'

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: '22px',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)',
}



// Cada cuánto se vuelve a pedir la tasa. Se muestra al cliente, así que sale
// de aquí y no de un número escrito dos veces.
const TASA_REFRESCO_MS = 60000

// Qué está pasando con un envío, en palabras. El nombre del estado no dice si
// toca esperar o hacer algo, y es lo primero que se pregunta quien mandó
// dinero.
const PASOS = {
  pendiente_pago: { texto: 'Esperando tu pago para empezar', color: '#f87171' },
  en_aprobacion: { texto: 'Revisando tu comprobante', color: '#fb923c' },
  en_proceso: { texto: 'Enviando el dinero al destinatario', color: '#60a5fa' },
  rechazado: { texto: 'Necesitamos otro comprobante', color: '#f87171' },
  completado: { texto: 'Entregado', color: '#4ade80' },
}

const FRASES = [
  'Envíos seguros',
  'Entrega rápida',
  'Tasa real, sin sorpresas',
  'Seguimiento paso a paso',
  'Atención por chat en cada envío',
  'Sin comisiones ocultas',
]

// Cinta con las frases en movimiento. La lista se pinta dos veces seguidas y
// la animación recorre justo la mitad: así el salto del final coincide con el
// principio y no se ve corte.
function CintaConfianza() {
  return (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ ...GLASS, padding: '10px 0' }}>
      <style>{`
        @keyframes cintaCorre { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .cinta-pista { display: flex; width: max-content; animation: cintaCorre 28s linear infinite; }
        .cinta-pista:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .cinta-pista { animation: none } }
      `}</style>
      <div className="cinta-pista">
        {[...FRASES, ...FRASES].map((f, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-6 text-xs font-medium whitespace-nowrap"
            style={{ color: '#aebfe2' }}>
            <span style={{ color: '#38bdf8' }}>✓</span>
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}



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
  const completed = orders.filter(o => o.status === 'completado')
  // Lo que el cliente entiende por "en camino": todo lo que no está terminado
  // ni esperando su pago. Antes había dos tarjetas, "activos" y "en proceso",
  // que medían casi lo mismo y sumaban distinto.
  const enProceso = orders.filter(
    o => o.status !== 'completado' && o.status !== 'pendiente_pago'
  )

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

  const { data: rateData, dataUpdatedAt: rateUpdatedAt } = useQuery({
    queryKey: ['live-rate', 'CLP', rateCurrency],
    queryFn: () => api.get('/rates/convert', { params: { from: 'CLP', to: rateCurrency, amount: 1000 } }).then(r => r.data.data),
    refetchInterval: TASA_REFRESCO_MS,
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

        {/* Saludo */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold" style={{color:'#eaf2ff'}}>{greeting}, {user?.full_name?.split(' ')[0]}.</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>
            {enProceso.length > 0
              ? `Tienes ${enProceso.length} envío${enProceso.length !== 1 ? 's' : ''} en camino ahora mismo.`
              : 'Todo al día. ¿Mandamos dinero hoy?'}
            <span className="ml-3 font-mono" style={{color:'#475569'}}>🕐 {userTimeStr} <span style={{fontSize:10}}>{user?.country || 'Santiago'}</span></span>
          </p>
        </div>

        {/* Cinta de confianza. Da contexto sin ocupar sitio: lo que alguien
            quiere saber antes de mandar dinero cabe en cinco frases. */}
        <CintaConfianza />

        {/* ── Lo primero: la tasa y qué hacer con ella ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-4" style={{ position: 'relative', zIndex: 3 }}>
          <TasaYAcciones
            countries={countriesData || []}
            rateCountry={rateCountry}
            rateCurrency={rateCurrency}
            rateData={rateData}
            actualizado={rateUpdatedAt}
            onChange={(country, currency) => { setRateCountry(country); setRateCurrency(currency) }}
            onTransferir={() => navigate('/new-transfer')}
            onHistorial={() => navigate('/historial')}
          />

          {/* Los puntos, al lado de transferir: se ganan enviando. */}
          <button
            onClick={() => navigate('/mis-puntos')}
            className="rounded-2xl p-5 text-left transition-all flex flex-col justify-between"
            style={{ ...GLASS, border: '1px solid rgba(253,211,77,.2)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(253,211,77,.45)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(253,211,77,.2)'}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8aa0cc' }}>Tus puntos</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(253,211,77,.1)' }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-4xl font-bold" style={{ color: '#fcd34d' }}>{(pointsData?.total_points || 0).toLocaleString()}</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8aa0cc' }}>
                Ganas puntos con cada envío. Cánjealos cuando quieras →
              </p>
            </div>
          </button>
        </div>

        {/* ── Cómo van tus envíos ─────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <button
            onClick={() => navigate('/historial', { state: { filter: 'en_proceso' } })}
            className="rounded-2xl p-5 flex items-center justify-between text-left transition-all"
            style={{ ...GLASS, border: '1px solid rgba(96,165,250,.22)' }}>
            <div>
              <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Envíos en proceso</p>
              <p className="text-4xl font-bold mt-1" style={{color:'#eaf2ff'}}>{enProceso.length}</p>
              <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>en camino ahora →</p>
            </div>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(96,165,250,.1)'}}>
              <div className="w-3.5 h-3.5 rounded-full animate-pulse" style={{background:'#60a5fa'}} />
            </div>
          </button>

          <button
            onClick={() => navigate('/historial', { state: { filter: 'completado' } })}
            className="rounded-2xl p-5 flex items-center justify-between text-left transition-all"
            style={{ ...GLASS, border: '1px solid rgba(74,222,128,.18)' }}>
            <div>
              <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Completados</p>
              <p className="text-4xl font-bold mt-1" style={{color:'#eaf2ff'}}>{completed.length}</p>
              <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>ya recibidos →</p>
            </div>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(74,222,128,.1)'}}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </button>
        </div>

        {/* ── Detalle de lo que está en camino ────────────── */}
        <div className="rounded-2xl overflow-hidden mb-4" style={GLASS}>
          <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
            <div>
              <h2 className="text-sm font-bold" style={{color:'#eaf2ff'}}>Envíos en proceso</h2>
              <p className="text-xs mt-0.5" style={{color:'#8aa0cc'}}>Dónde va cada uno, paso a paso</p>
            </div>
            {enProceso.length > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full" style={{background:'rgba(96,165,250,.1)', color:'#60a5fa'}}>
                {enProceso.length} en camino
              </span>
            )}
          </div>

          {enProceso.length === 0 && (
            <div className="py-10 px-6 text-center">
              <p className="text-sm" style={{color:'#8aa0cc'}}>No tienes envíos en proceso.</p>
              <button onClick={() => navigate('/new-transfer')}
                className="mt-3 bg-gradient-to-r from-blue-400 to-blue-700 text-white text-xs font-semibold px-5 py-2 rounded-xl">
                Enviar dinero
              </button>
            </div>
          )}

          {enProceso.map(order => (
            <button key={order.id} onClick={() => setSelectedOrder(order)}
              className="w-full flex items-center gap-4 px-6 py-4 text-left transition-colors"
              style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                {order.receiver_name?.[0]?.toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{color:'#eaf2ff'}}>{order.receiver_name}</p>
                <span className="inline-flex items-center gap-1.5 text-xs" style={{color:'#8aa0cc'}}>
                  {flagUrl(order.receiver_country) && <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
                  {order.receiver_country}
                  <span style={{color:'#334155'}}>·</span>
                  <span className="font-mono">{order.order_number}</span>
                </span>
                {/* Qué está pasando, en palabras. El nombre del estado por sí
                    solo no dice si toca esperar o hacer algo. */}
                <p className="text-xs mt-1.5" style={{color: PASOS[order.status]?.color || '#8aa0cc'}}>
                  {PASOS[order.status]?.texto || 'En curso'}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-bold" style={{color:'#eaf2ff'}}>
                  {order.amount_sent?.toLocaleString('es-CL')} <span className="text-xs font-normal" style={{color:'#8aa0cc'}}>{order.currency_from}</span>
                </p>
                <p className="text-xs font-semibold mt-0.5" style={{color:'#4ade80'}}>
                  recibe {order.amount_received?.toLocaleString('es-CL')} {order.currency_to}
                </p>
                <p className="text-[11px] mt-0.5" style={{color:'#64748b'}}>{fmtDateShort(order.created_at, tz)}</p>
              </div>
            </button>
          ))}
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
                      <EstadoOrden status={order.status} />
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

// La tasa y los dos botones, juntos y arriba del todo.
//
// Antes la tasa era una tarjeta más en una cuadrícula de cuatro y los botones
// vivían escondidos bajo "Total enviado". Es al revés: se entra a ver a cómo
// está y, si conviene, se envía. Los dos pasos van en el mismo sitio.
function TasaYAcciones({ countries, rateCountry, rateCurrency, rateData, actualizado, onChange, onTransferir, onHistorial }) {
  const [dropOpen, setDropOpen] = useState(false)
  const [hace, setHace] = useState(0)
  const cardRef = useRef()

  useEffect(() => {
    const h = (e) => { if (cardRef.current && !cardRef.current.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Segundos desde la última consulta. Decir "se actualiza sola" y no moverse
  // nunca no convence a nadie; el contador demuestra que está viva.
  useEffect(() => {
    if (!actualizado) return
    const calc = () => setHace(Math.max(0, Math.round((Date.now() - actualizado) / 1000)))
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [actualizado])

  const disponibles = countries.filter(c => c.currency !== 'CLP')
  const isoTasa = disponibles.find(c => c.country === rateCountry)?.iso2
  const segundos = Math.round(TASA_REFRESCO_MS / 1000)

  return (
    <div ref={cardRef} className="rounded-2xl p-5 relative" style={{ ...GLASS, overflow: 'visible', border: '1px solid rgba(56,189,248,.18)' }}>
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-5">

        {/* Tasa */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold" style={{ color: '#eaf2ff' }}>Mira en cuánto está la tasa ahora</h2>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(74,222,128,.1)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
              <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>EN VIVO</span>
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: '#8aa0cc' }}>
            Se actualiza sola cada {segundos} segundos
            {actualizado ? ` · vista hace ${hace} s` : ''}
          </p>

          <div className="flex items-center gap-3">
            {/* Selector de país */}
            <div className="relative shrink-0" style={{ width: 190 }}>
              <button
                onClick={() => setDropOpen(v => !v)}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all text-left"
                style={{
                  background: 'rgba(6,13,40,.85)',
                  border: dropOpen ? '1px solid rgba(56,189,248,.45)' : '1px solid rgba(255,255,255,.1)',
                }}>
                <Bandera iso2={isoTasa} ancho={24} alto={17} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: '#eaf2ff' }}>{rateCountry}</p>
                  <p className="text-[10px]" style={{ color: '#8aa0cc' }}>{rateCurrency}</p>
                </div>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                  className="shrink-0 transition-transform" style={{ color: '#8aa0cc', transform: dropOpen ? 'rotate(180deg)' : 'none' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-[300]"
                  style={{ background: 'rgba(5,11,35,.98)', border: '1px solid rgba(56,189,248,.2)', boxShadow: '0 16px 40px rgba(0,0,0,.7)', maxHeight: 220, overflowY: 'auto' }}>
                  {disponibles.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: '#475569' }}>Cargando países...</p>
                  )}
                  {disponibles.map(c => (
                    <button key={c.country}
                      onClick={() => { onChange(c.country, c.currency); setDropOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,.04)', background: rateCountry === c.country ? 'rgba(56,189,248,.1)' : 'transparent' }}
                      onMouseEnter={e => { if (rateCountry !== c.country) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                      onMouseLeave={e => { if (rateCountry !== c.country) e.currentTarget.style.background = 'transparent' }}
                    >
                      <Bandera iso2={c.iso2} ancho={20} alto={14} />
                      <p className="flex-1 text-xs font-semibold truncate" style={{ color: '#eaf2ff' }}>{c.country}</p>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: rateCountry === c.country ? '#38bdf8' : '#8aa0cc' }}>{c.currency}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Valor */}
            <div className="flex-1 rounded-xl px-4 py-2.5 min-w-0" style={{ background: 'rgba(6,13,40,.5)', border: '1px solid rgba(255,255,255,.06)' }}>
              <p className="text-2xl font-bold leading-tight truncate" style={{ color: rateData ? '#eaf2ff' : '#475569' }}>
                {rateData ? (rateData.rate * 1000).toLocaleString('es-CL', { maximumFractionDigits: 4 }) : '—'}
                <span className="text-xs font-normal ml-1.5" style={{ color: '#8aa0cc' }}>{rateCurrency}</span>
              </p>
              <p className="text-[11px]" style={{ color: '#8aa0cc' }}>por cada 1.000 CLP que envíes</p>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col justify-end gap-2 lg:w-[220px] shrink-0">
          <button
            onClick={onTransferir}
            className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white text-sm font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Transferir ahora
          </button>
          <button
            onClick={onHistorial}
            className="w-full text-xs font-semibold py-2.5 rounded-xl transition-colors"
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#aebfe2' }}
          >
            Ir a mi historial
          </button>
        </div>
      </div>
    </div>
  )
}
