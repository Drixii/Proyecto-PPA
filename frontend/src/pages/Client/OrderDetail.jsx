import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import StatusBadge from '../../components/StatusBadge'
import ChatBox from '../../components/ChatBox'
import { esPagoExterno } from '../../utils/payments'

const STATUS_STEPS_TRANSFER = ['en_aprobacion', 'en_proceso', 'completado']
const STATUS_STEPS_CARD = ['en_proceso', 'completado']
const STATUS_LABELS = { en_aprobacion: 'En Aprobación', en_proceso: 'En Proceso', completado: 'Completado' }

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [compartiendo, setCompartiendo] = useState(false)
  const [avisoCompartir, setAvisoCompartir] = useState('')

  // Compartir el comprobante.
  //
  // El PNG lo dibuja el servidor y no el navegador: sale igual en todos los
  // teléfonos y lo que se comparte es una imagen de verdad, no una captura.
  //
  // navigator.share con ficheros solo existe en móvil y bajo HTTPS; donde no
  // esté, se descarga, que es lo que la gente hace después de todas formas.
  const compartirComprobante = async () => {
    setCompartiendo(true)
    setAvisoCompartir('')
    try {
      const r = await api.get(`/orders/${id}/comprobante`, { responseType: 'blob' })
      const archivo = new File([r.data], `comprobante-${id}.png`, { type: 'image/png' })

      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: 'Comprobante de envío' })
        return
      }

      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `comprobante-${id}.png`
      a.click()
      URL.revokeObjectURL(url)
      setAvisoCompartir('Comprobante descargado')
    } catch (e) {
      // Cancelar el menú de compartir lanza AbortError: no es un fallo.
      if (e?.name !== 'AbortError') setAvisoCompartir('No se pudo generar el comprobante')
    } finally {
      setCompartiendo(false)
      setTimeout(() => setAvisoCompartir(''), 4000)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((r) => r.data.data),
  })

  if (isLoading) return <div className="flex items-center justify-center h-screen" style={{color:'#8aa0cc'}}>Cargando...</div>
  if (!data) return <div className="flex items-center justify-center h-screen" style={{color:'#8aa0cc'}}>Orden no encontrada</div>

  // Tarjeta y métodos de Koywe se saltan la aprobación: el proveedor confirma
  // el cobro, no hay comprobante que revisar.
  const STATUS_STEPS = esPagoExterno(data.payment_method) ? STATUS_STEPS_CARD : STATUS_STEPS_TRANSFER
  const currentStep = STATUS_STEPS.indexOf(data.status)

  return (
    <div className="min-h-screen" style={{background:'#060e24'}}>
      <div className="px-6 py-4 flex items-center gap-3" style={{ ...GLASS, borderRadius:0, borderLeft:'none', borderRight:'none', borderTop:'none' }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-colors shrink-0"
          style={{border:'1px solid rgba(248,113,113,.35)', color:'#f87171', background:'rgba(248,113,113,.08)'}}
        >← Volver</button>
        <div>
          <p className="font-mono text-sm" style={{color:'#8aa0cc'}}>{data.order_number}</p>
          <h1 className="font-bold" style={{color:'#eaf2ff'}}>Detalle de transferencia</h1>
        </div>
        <div className="ml-auto"><StatusBadge status={data.status} /></div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Progreso */}
        <div className="rounded-xl p-6" style={GLASS}>
          <h2 className="font-semibold mb-4" style={{color:'#eaf2ff'}}>Estado del envío</h2>
          <div className="flex items-center">
            {STATUS_STEPS.map((step, i) => (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                  style={
                    i < currentStep
                      ? {background:'#38bdf8', boxShadow:'0 0 8px rgba(56,189,248,.4)', color:'#fff'}
                      : i === currentStep
                        ? {background:'rgba(56,189,248,.15)', border:'2px solid #38bdf8', color:'#38bdf8'}
                        : {background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#64748b'}
                  }
                >
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <div className="hidden sm:block ml-1">
                  <p
                    className="text-xs"
                    style={i <= currentStep ? {color:'#38bdf8', fontWeight:500} : {color:'#64748b'}}
                  >
                    {STATUS_LABELS[step]}
                  </p>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className="flex-1 h-0.5 mx-2"
                    style={i < currentStep ? {background:'#38bdf8'} : {background:'rgba(255,255,255,.08)'}}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Montos */}
        <div className="rounded-xl p-6" style={GLASS}>
          <h2 className="font-semibold mb-4" style={{color:'#eaf2ff'}}>Resumen</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{color:'#8aa0cc'}}>Monto enviado</span>
              <span className="font-medium" style={{color:'#eaf2ff'}}>{data.amount_sent.toLocaleString()} {data.currency_from}</span>
            </div>
            <div className="flex justify-between">
              <span style={{color:'#8aa0cc'}}>Tasa</span>
              <span className="font-medium" style={{color:'#eaf2ff'}}>1 {data.currency_from} = {data.exchange_rate.toFixed(4)} {data.currency_to}</span>
            </div>
            <div className="flex justify-between border-t pt-2" style={{borderColor:'rgba(255,255,255,.06)'}}>
              <span className="font-semibold" style={{color:'#eaf2ff'}}>Recibe</span>
              <span className="font-bold text-lg" style={{color:'#38bdf8'}}>{data.amount_received.toLocaleString()} {data.currency_to}</span>
            </div>
          </div>
        </div>

        {/* Compartir */}
        <div className="rounded-xl p-6" style={GLASS}>
          <button
            onClick={compartirComprobante}
            disabled={compartiendo}
            className="w-full font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm"
            style={{background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', border:'none', color:'#fff',
                    cursor: compartiendo ? 'wait' : 'pointer', opacity: compartiendo ? .7 : 1}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {compartiendo ? 'Preparando…' : 'Compartir comprobante'}
          </button>
          <p className="text-[11px] text-center mt-2.5 leading-relaxed" style={{color:'#64748b'}}>
            Se comparte como imagen. No incluye el número de cuenta completo del
            destinatario ni su teléfono.
          </p>
          {avisoCompartir && (
            <p className="text-xs text-center mt-2" style={{color:'#4ade80'}}>{avisoCompartir}</p>
          )}
        </div>

        {/* Receptor */}
        <div className="rounded-xl p-6" style={GLASS}>
          <h2 className="font-semibold mb-4" style={{color:'#eaf2ff'}}>Datos del receptor</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span style={{color:'#8aa0cc'}}>Nombre</span>
              <span style={{color:'#eaf2ff'}}>{data.receiver_name}</span>
            </div>
            <div className="flex justify-between">
              <span style={{color:'#8aa0cc'}}>País</span>
              <span style={{color:'#eaf2ff'}}>{data.receiver_country}</span>
            </div>
            {data.receiver_account && (
              <div className="flex justify-between">
                <span style={{color:'#8aa0cc'}}>Cuenta</span>
                <span style={{color:'#eaf2ff'}}>{data.receiver_account}</span>
              </div>
            )}
            {data.receiver_phone && (
              <div className="flex justify-between">
                <span style={{color:'#8aa0cc'}}>Teléfono</span>
                <span style={{color:'#eaf2ff'}}>{data.receiver_phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="rounded-xl p-6" style={GLASS}>
          <h2 className="font-semibold mb-4" style={{color:'#eaf2ff'}}>Chat con soporte</h2>
          <ChatBox orderId={parseInt(id)} />
        </div>
      </div>
    </div>
  )
}
