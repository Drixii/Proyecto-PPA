import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import Portal from './Portal'
import CardPayment from './CardPayment'
import { ElegirMetodoPago } from './OrderPanel'
import { useStore } from '../store/useStore'

// Aviso al cliente de que dejó envíos sin pagar.
//
// Una orden en `pendiente_pago` no le llega a nadie: no está en la cola de
// ningún operador, porque no hay nada que aprobar hasta que el dinero entre.
// Si el cliente cierra el portal a medias —o le falla la tarjeta— la orden se
// queda ahí y él cree que la mandó. El punto rojo ayuda, pero solo si va a
// mirar; esto se lo dice.
//
// Se muestra una vez por sesión y por conjunto de órdenes: si aparece una
// nueva sin pagar vuelve a salir, pero navegar por la aplicación no lo repite.
// Un aviso que sale en cada pantalla se aprende a cerrar sin leerlo.
const CLAVE = 'aviso-pagos-pendientes'

export default function AvisoPagosPendientes() {
  const { user } = useStore()
  const [cerrado, setCerrado] = useState(false)
  const [pagando, setPagando] = useState(null)
  const [conTarjeta, setConTarjeta] = useState(null)
  const [error, setError] = useState('')

  const esCliente = user?.role === 'client'

  const { data } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders').then(r => r.data.data),
    enabled: esCliente,
    refetchInterval: 30000,
  })

  const pendientes = (data?.items || []).filter(
    o => o.status === 'pendiente_pago' && !o.paid_at
  )

  // La firma es el conjunto de órdenes sin pagar. Cambia cuando aparece una
  // nueva o se paga alguna, y solo entonces el aviso vuelve.
  const firma = pendientes.map(o => o.id).sort().join(',')
  let yaVisto = false
  try {
    yaVisto = firma !== '' && sessionStorage.getItem(CLAVE) === firma
  } catch {
    // Navegador sin sessionStorage (modo privado en algunos casos): se muestra
    // igual, es preferible repetir el aviso a no darlo nunca.
    yaVisto = false
  }

  const descartar = () => {
    try { sessionStorage.setItem(CLAVE, firma) } catch { /* da igual */ }
    setCerrado(true)
  }

  if (!esCliente || !pendientes.length || cerrado || yaVisto) {
    // Aun así hay que poder terminar un pago con tarjeta ya empezado.
    return conTarjeta ? (
      <CardPayment
        orderId={conTarjeta.id}
        amountLabel={`${Number(conTarjeta.amount_sent).toLocaleString('es-CL')} ${conTarjeta.currency_from}`}
        onClose={() => setConTarjeta(null)}
        onSuccess={() => setConTarjeta(null)}
      />
    ) : null
  }

  const total = pendientes.length

  return (
    <>
      <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,6,23,.75)' }} onClick={descartar}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: 'rgba(8,16,44,.96)',
              border: '1px solid rgba(239,68,68,.3)',
              boxShadow: '0 8px 40px rgba(0,0,0,.5)',
            }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-start gap-3 mb-4">
              <span className="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                style={{ background: '#dc2626' }} />
              <div>
                <h3 className="font-semibold" style={{ color: '#eaf2ff' }}>
                  {total === 1 ? 'Tienes un envío sin pagar' : `Tienes ${total} envíos sin pagar`}
                </h3>
                <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>
                  {total === 1
                    ? 'No se procesa hasta que completes el pago.'
                    : 'No se procesan hasta que completes el pago.'}
                </p>
              </div>
            </div>

            {error && (
              <p className="text-xs mb-3 px-3 py-2 rounded-lg"
                style={{ color: '#fca5a5', background: 'rgba(239,68,68,.08)' }}>{error}</p>
            )}

            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {pendientes.map(o => (
                <div key={o.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>
                      {Number(o.amount_sent).toLocaleString('es-CL')} {o.currency_from}
                    </p>
                    <p className="text-[11px]" style={{ color: '#8aa0cc' }}>
                      {o.order_number} · para {o.receiver_name}
                    </p>
                  </div>
                  <button
                    onClick={() => { setError(''); setPagando(o) }}
                    className="text-xs font-semibold px-4 py-2 rounded-lg shrink-0"
                    style={{ background: 'rgba(239,68,68,.16)', border: '1px solid rgba(239,68,68,.4)', color: '#f87171' }}
                  >
                    Pagar
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={descartar}
              className="w-full text-xs font-semibold py-2.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc' }}
            >
              Ahora no
            </button>
          </div>
        </div>
      </Portal>

      {pagando && (
        <ElegirMetodoPago
          order={pagando}
          cerrar={() => setPagando(null)}
          alElegirTarjeta={() => { setConTarjeta(pagando); setPagando(null) }}
          alFallar={(msg) => { setPagando(null); setError(msg) }}
        />
      )}

      {conTarjeta && (
        <CardPayment
          orderId={conTarjeta.id}
          amountLabel={`${Number(conTarjeta.amount_sent).toLocaleString('es-CL')} ${conTarjeta.currency_from}`}
          onClose={() => setConTarjeta(null)}
          onSuccess={() => setConTarjeta(null)}
        />
      )}
    </>
  )
}
