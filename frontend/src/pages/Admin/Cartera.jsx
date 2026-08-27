import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import DateRangePicker from '../../components/DateRangePicker'
import SlidePanel from '../../components/SlidePanel'
import { AdminOrderPanel } from '../../components/OrderPanel'
import api from '../../services/api'
import { flagUrl } from '../../utils/flags'
import { fmtDate } from '../../utils/timezone'

// Mi cartera: lo ganado, no lo movido.
//
// El panel ya mostraba el volumen, que es el dinero de los clientes pasando
// por la casa. Lo que la casa se queda es la comisión de cada orden, y ese
// número no estaba en ninguna pantalla: había que abrir orden por orden.
//
// Se lee por rango de fechas y se agrupa por día, porque la pregunta real es
// "cuánto hice hoy" y no "cuánto llevo en total".

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: '22px',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)',
}

const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

const TODOS = '__todos__'

const money = (n, moneda) =>
  `${Math.round(n || 0).toLocaleString('es-CL')}${moneda ? ` ${moneda}` : ''}`

// Día en horario de Chile: es el que usa el resto del panel para decir "hoy".
// Con el del navegador, un admin fuera de Chile vería las órdenes de la noche
// caídas en el día siguiente.
const diaDe = (iso) => fmtDate(iso, 'America/Santiago', { dateStyle: 'full' })

export default function Cartera() {
  const hoy = new Date()
  const [rango, setRango] = useState({ from: sod(hoy), to: eod(hoy) })
  const [pais, setPais] = useState(TODOS)
  const [orden, setOrden] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cartera', rango, pais],
    queryFn: () => api.get('/admin/cartera', {
      params: {
        date_from: rango.from.toISOString(),
        date_to: rango.to.toISOString(),
        ...(pais === TODOS ? {} : { country: pais }),
      },
    }).then(r => r.data.data),
    refetchInterval: 30000,
  })

  const items = data?.items || []
  const totals = data?.totals || []
  const paises = data?.countries || []

  // Agrupado por día, con su subtotal. Los items llegan ya ordenados de más
  // reciente a más antiguo, así que basta con recorrerlos en orden.
  const dias = []
  let actual = null
  items.forEach(it => {
    const dia = diaDe(it.created_at)
    if (!actual || actual.dia !== dia) {
      actual = { dia, filas: [], porMoneda: {}, clp: 0 }
      dias.push(actual)
    }
    actual.filas.push(it)
    actual.porMoneda[it.currency_from] = (actual.porMoneda[it.currency_from] || 0) + (it.fee || 0)
    actual.clp += it.fee_clp || 0
  })

  const abrirOrden = async (id) => {
    try {
      const r = await api.get(`/admin/orders/${id}`)
      setOrden(r.data.data)
    } catch { /* la orden pudo borrarse entre la carga y el clic */ }
  }

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1400px] mx-auto" style={{ fontFamily: "'Space Grotesk',system-ui,sans-serif" }}>

        <div className="mb-5">
          <h1 className="text-2xl font-bold" style={{ color: '#eaf2ff' }}>Mi cartera</h1>
          <p className="text-sm mt-1" style={{ color: '#8aa0cc' }}>
            Solo comisiones. No incluye el dinero de los clientes, ni las órdenes rechazadas o sin pagar.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <DateRangePicker value={rango} onChange={setRango} />
          <SelectorPais valor={pais} paises={paises} onChange={setPais} />
          {pais !== TODOS && (
            <button
              onClick={() => setPais(TODOS)}
              className="text-xs hover:text-red-400 transition-colors"
              style={{ color: '#8aa0cc' }}
            >
              ✕ Quitar filtro
            </button>
          )}
          <span className="text-xs ml-auto" style={{ color: '#8aa0cc' }}>
            {isLoading ? 'cargando…' : `${data?.total_orders || 0} transacciones`}
          </span>
        </div>

        {/* Total ganado */}
        <div className="rounded-2xl p-5 mb-4" style={GLASS}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8aa0cc' }}>
            Ganado en comisiones
          </p>
          <p className="text-3xl font-bold" style={{ color: '#eaf2ff' }}>
            {isLoading ? '—' : money(data?.total_clp, 'CLP')}
          </p>
          <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>
            equivalente en pesos a la tasa de hoy
          </p>

          {totals.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-4">
              {totals.map(t => (
                <div
                  key={t.currency}
                  className="px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.18)' }}
                >
                  <p className="text-sm font-bold" style={{ color: '#7dd3fc' }}>{money(t.fee, t.currency)}</p>
                  <p className="text-[11px]" style={{ color: '#8aa0cc' }}>
                    {t.count} {t.count === 1 ? 'orden' : 'órdenes'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detalle */}
        <div className="rounded-2xl overflow-hidden" style={GLASS}>
          {isLoading && (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && dias.length === 0 && (
            <p className="text-center text-sm py-14" style={{ color: '#475569' }}>
              Sin comisiones en este rango.
            </p>
          )}

          {!isLoading && dias.map(d => (
            <div key={d.dia}>
              <div
                className="flex items-center justify-between px-6 py-3 flex-wrap gap-2"
                style={{ background: 'rgba(4,10,30,.6)', borderBottom: '1px solid rgba(255,255,255,.06)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8aa0cc' }}>
                  {d.dia}
                </p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>
                  + {Object.entries(d.porMoneda).map(([m, v]) => money(v, m)).join(' · ')}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {d.filas.map(it => (
                      <Fila key={it.id} it={it} onClick={() => abrirOrden(it.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {data?.truncated && (
            <p className="text-center text-xs py-4" style={{ color: '#fcd34d' }}>
              Mostrando las 1.000 órdenes más recientes del rango. Acorta las fechas para verlo completo.
            </p>
          )}
        </div>
      </div>

      <SlidePanel
        open={!!orden}
        onClose={() => setOrden(null)}
        title={orden?.sender_name || ''}
        subtitle={orden ? `${orden.order_number} · ${orden.receiver_name} → ${orden.receiver_country}` : ''}
      >
        {orden && <AdminOrderPanel order={orden} onClose={() => setOrden(null)} />}
      </SlidePanel>
    </FinexyLayout>
  )
}

function Fila({ it, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid rgba(255,255,255,.04)',
        background: hover ? 'rgba(56,189,248,.05)' : 'transparent',
      }}
    >
      <td className="px-6 py-3 whitespace-nowrap">
        <span className="font-mono text-xs" style={{ color: '#8aa0cc' }}>{it.order_number}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-medium" style={{ color: '#c8d8f0' }}>{it.sender_name}</span>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#8aa0cc' }}>
          {flagUrl(it.receiver_country) && (
            <img src={flagUrl(it.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />
          )}
          {it.receiver_country}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs" style={{ color: '#64748b' }}>
          envió {money(it.amount_sent, it.currency_from)}
        </span>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-bold" style={{ color: '#4ade80' }}>
          + {money(it.fee, it.currency_from)}
        </span>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-xs" style={{ color: '#8aa0cc' }}>
          {fmtDate(it.created_at, 'America/Santiago', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </td>
    </tr>
  )
}

// Desplegable de países.
//
// Arranca en "Todos los países" y esa opción va siempre la primera: el uso
// normal es mirar la cartera entera y filtrar solo para comprobar un destino.
function SelectorPais({ valor, paises, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const etiqueta = valor === TODOS ? 'Todos los países' : valor

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
        style={{
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.1)',
          color: '#c8d8f0',
        }}
      >
        {valor !== TODOS && flagUrl(valor) && (
          <img src={flagUrl(valor)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />
        )}
        {etiqueta}
        <span style={{ color: '#64748b' }}>▾</span>
      </button>

      {abierto && (
        <div
          className="absolute left-0 mt-1 z-30 rounded-xl overflow-hidden max-h-72 overflow-y-auto min-w-[200px]"
          style={{ background: 'rgba(8,16,44,.99)', border: '1px solid rgba(255,255,255,.12)' }}
        >
          {[TODOS, ...paises].map(p => (
            <button
              key={p}
              onClick={() => { onChange(p); setAbierto(false) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs transition-colors hover:bg-white/5"
              style={{ color: p === valor ? '#38bdf8' : '#c8d8f0' }}
            >
              {p !== TODOS && flagUrl(p) && (
                <img src={flagUrl(p)} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />
              )}
              {p === TODOS ? 'Todos los países' : p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
