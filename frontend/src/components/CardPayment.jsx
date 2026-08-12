import { useEffect, useMemo, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements, CardNumberElement, CardExpiryElement, CardCvcElement,
  useStripe, useElements,
} from '@stripe/react-stripe-js'
import Portal from './Portal'
import api from '../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const stripeCache = {}
function stripeFor(key, account) {
  // La clave de caché incluye la cuenta: el mismo publishable key apunta a
  // cuentas conectadas distintas según de quién sea la orden, y reutilizar la
  // instancia equivocada hace que el client_secret no se pueda confirmar.
  const ck = `${key}::${account || 'plataforma'}`
  if (!stripeCache[ck]) {
    stripeCache[ck] = account ? loadStripe(key, { stripeAccount: account }) : loadStripe(key)
  }
  return stripeCache[ck]
}

// Estilo de los campos de Stripe. Van dentro de un iframe suyo, así que no
// heredan el CSS de la página y hay que pasárselo así.
const ESTILO_CAMPO = {
  style: {
    base: {
      color: '#eaf2ff',
      fontFamily: 'inherit',
      fontSize: '15px',
      '::placeholder': { color: '#64748b' },
    },
    invalid: { color: '#f87171', iconColor: '#f87171' },
  },
}

const MARCAS = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  amex: 'AMEX',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
}

function Campo({ label, children, error }) {
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: '#8aa0cc' }}>{label}</label>
      <div className="rounded-xl px-3 py-3" style={{ background: 'rgba(4,10,30,.85)', border: `1px solid ${error ? 'rgba(248,113,113,.5)' : 'rgba(255,255,255,.1)'}` }}>
        {children}
      </div>
      {error && <p className="text-[11px] mt-1" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}

/** Tarjeta que gira. Refleja lo que se puede reflejar.
 *
 *  El número, la caducidad y el CVV se teclean dentro de iframes de Stripe y
 *  no son legibles desde aquí — es justo lo que evita que estos datos pasen
 *  por nuestro servidor. Lo que sí llega de Stripe es la marca y si el campo
 *  está completo, y el nombre es un campo nuestro. Con eso: la marca aparece
 *  al escribir, el nombre se copia en vivo, los dígitos se van marcando como
 *  completados, y al tocar el CVV la tarjeta gira para enseñar la banda.
 */
function TarjetaVisual({ nombre, marca, numeroListo, caducidadLista, girada }) {
  const etiqueta = MARCAS[marca] || ''

  return (
    <div style={{ perspective: 1000 }}>
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1.586',
        transformStyle: 'preserve-3d', transition: 'transform .6s cubic-bezier(.4,.2,.2,1)',
        transform: girada ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        {/* Frente */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
          borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg,#1e3a8a 0%,#312e81 50%,#0f172a 100%)',
          boxShadow: '0 18px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.15)',
          border: '1px solid rgba(255,255,255,.1)',
        }}>
          <div className="flex items-start justify-between">
            <div style={{ width: 42, height: 32, borderRadius: 6, background: 'linear-gradient(135deg,#fcd34d,#d97706)', opacity: .9 }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '.04em', opacity: etiqueta ? 1 : 0, transition: 'opacity .25s' }}>
              {etiqueta || '—'}
            </span>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <p style={{
              margin: 0, fontFamily: 'monospace', fontSize: 17, letterSpacing: '.12em',
              color: numeroListo ? '#fff' : 'rgba(255,255,255,.35)', transition: 'color .3s',
            }}>
              •••• •••• •••• {numeroListo ? '••••' : '____'}
            </p>
            <div className="flex items-end justify-between" style={{ marginTop: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 8.5, letterSpacing: '.14em', color: 'rgba(255,255,255,.45)' }}>TITULAR</p>
                <p style={{
                  margin: '2px 0 0', fontSize: 12.5, fontWeight: 600, color: '#fff',
                  textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {nombre || 'NOMBRE APELLIDO'}
                </p>
              </div>
              <div style={{ textAlign: 'right', marginLeft: 12 }}>
                <p style={{ margin: 0, fontSize: 8.5, letterSpacing: '.14em', color: 'rgba(255,255,255,.45)' }}>VENCE</p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, fontFamily: 'monospace', color: caducidadLista ? '#fff' : 'rgba(255,255,255,.35)' }}>
                  {caducidadLista ? '••/••' : '__/__'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Reverso */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
          borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg,#1e3a8a 0%,#312e81 50%,#0f172a 100%)',
          boxShadow: '0 18px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.15)',
          border: '1px solid rgba(255,255,255,.1)',
        }}>
          <div style={{ height: 42, background: '#0b1020', marginTop: 18 }} />
          <div style={{ padding: '16px 20px' }}>
            <p style={{ margin: '0 0 5px', fontSize: 8.5, letterSpacing: '.14em', color: 'rgba(255,255,255,.45)' }}>CVV</p>
            <div style={{ background: 'rgba(255,255,255,.9)', borderRadius: 5, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#0f172a', letterSpacing: '.2em' }}>•••</span>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 9.5, color: 'rgba(255,255,255,.35)', lineHeight: 1.5 }}>
              Los datos de tu tarjeta viajan cifrados directamente a Stripe.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PayForm({ clientSecret, amountLabel, onSuccess, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [numeroListo, setNumeroListo] = useState(false)
  const [caducidadLista, setCaducidadLista] = useState(false)
  const [girada, setGirada] = useState(false)
  const [errores, setErrores] = useState({})

  const alCambiar = (campo, setter) => (e) => {
    setErrores(x => ({ ...x, [campo]: e.error?.message || '' }))
    if (setter) setter(e.complete)
    if (e.brand && e.brand !== 'unknown') setMarca(e.brand)
    else if (campo === 'numero' && e.empty) setMarca('')
  }

  const pagar = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setEnviando(true)
    setError('')

    // confirmCardPayment necesita el secret explícito: al usar los campos
    // sueltos (número/caducidad/CVV) no viaja dentro del elemento como sí
    // ocurre con PaymentElement.
    const { error: errStripe, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      {
        payment_method: {
          card: elements.getElement(CardNumberElement),
          billing_details: { name: nombre || undefined },
        },
      },
    )

    if (errStripe) {
      setError(errStripe.message || 'No se pudo procesar el pago')
      setEnviando(false)
      return
    }

    // Quien manda la orden a proceso es el webhook de Stripe, no esta
    // respuesta: el navegador puede cerrarse justo aquí y el cobro es válido
    // igual. Esto solo decide qué se le enseña al cliente.
    if (paymentIntent && ['succeeded', 'processing'].includes(paymentIntent.status)) {
      onSuccess(paymentIntent.status)
      return
    }
    setError('El pago quedó en un estado inesperado. Revisa tu correo antes de reintentar.')
    setEnviando(false)
  }

  return (
    <form onSubmit={pagar} className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,320px)' }}>
      <div className="space-y-4 order-2 md:order-1">
        <Campo label="Número de tarjeta" error={errores.numero}>
          <CardNumberElement options={{ ...ESTILO_CAMPO, showIcon: false }} onChange={alCambiar('numero', setNumeroListo)} />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Vencimiento" error={errores.caducidad}>
            <CardExpiryElement options={ESTILO_CAMPO} onChange={alCambiar('caducidad', setCaducidadLista)} />
          </Campo>
          <Campo label="CVV" error={errores.cvv}>
            <CardCvcElement
              options={ESTILO_CAMPO}
              onChange={alCambiar('cvv')}
              onFocus={() => setGirada(true)}
              onBlur={() => setGirada(false)}
            />
          </Campo>
        </div>

        <Campo label="Nombre del titular">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Como aparece en la tarjeta"
            className="w-full bg-transparent outline-none text-[15px]"
            style={{ color: '#eaf2ff' }}
          />
        </Campo>

        {error && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)' }}>{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="flex-1 text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-40"
            style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: 'rgba(255,255,255,.04)' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!stripe || enviando}
            className="flex-1 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition-all"
          >
            {enviando ? 'Procesando...' : `Pagar ${amountLabel}`}
          </button>
        </div>
      </div>

      <div className="order-1 md:order-2">
        <TarjetaVisual
          nombre={nombre}
          marca={marca}
          numeroListo={numeroListo}
          caducidadLista={caducidadLista}
          girada={girada}
        />
        <p className="text-[11px] mt-3 text-center" style={{ color: '#64748b' }}>
          Pago procesado por Stripe · cifrado de extremo a extremo
        </p>
      </div>
    </form>
  )
}

export default function CardPayment({ orderId, amountLabel, onSuccess, onClose }) {
  const [clientSecret, setClientSecret] = useState('')
  const [pubKey, setPubKey] = useState('')
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelado = false
    api.post(`/payments/orders/${orderId}/intent`)
      .then(r => {
        if (cancelado) return
        setClientSecret(r.data.data.client_secret)
        setPubKey(r.data.data.publishable_key)
        setAccount(r.data.data.connected_account_id || null)
      })
      .catch(err => {
        if (!cancelado) setError(err.response?.data?.detail || 'No se pudo iniciar el pago')
      })
    return () => { cancelado = true }
  }, [orderId])

  const stripePromise = useMemo(() => (pubKey ? stripeFor(pubKey, account) : null), [pubKey, account])

  return (
    <Portal>
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,.78)' }}>
        <div className="w-full max-w-3xl rounded-2xl p-6 md:p-7 max-h-[92vh] overflow-y-auto" style={{ ...GLASS, background: 'rgba(8,16,44,.97)' }}>
          <div className="flex items-baseline justify-between mb-5 gap-4">
            <div>
              <h3 className="font-bold text-lg" style={{ color: '#eaf2ff' }}>Pagar con tarjeta</h3>
              <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>Total: <span style={{ color: '#eaf2ff', fontWeight: 600 }}>{amountLabel}</span></p>
            </div>
            <button onClick={onClose} className="text-lg leading-none" style={{ color: '#64748b' }}>✕</button>
          </div>

          {error && (
            <>
              <p className="text-sm px-3 py-2 rounded-lg mb-4" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)' }}>{error}</p>
              <button
                onClick={onClose}
                className="w-full text-sm font-semibold py-3 rounded-xl"
                style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: 'rgba(255,255,255,.04)' }}
              >
                Cerrar
              </button>
            </>
          )}

          {!error && !clientSecret && (
            <div className="py-14 text-center text-sm" style={{ color: '#8aa0cc' }}>Preparando el pago seguro...</div>
          )}

          {!error && clientSecret && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#38bdf8' } } }}
            >
              <PayForm clientSecret={clientSecret} amountLabel={amountLabel} onSuccess={onSuccess} onClose={onClose} />
            </Elements>
          )}
        </div>
      </div>
    </Portal>
  )
}
