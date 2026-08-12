import { useEffect, useMemo, useRef, useState } from 'react'
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

// Los campos de Stripe van DENTRO del dibujo de la tarjeta, no en un
// formulario aparte. No se puede copiar lo que el cliente teclea —cada campo
// es un iframe de Stripe y su contenido es ilegible desde aquí, que es lo que
// mantiene los números de tarjeta fuera de nuestro servidor— así que en vez
// de reflejarlo, se coloca el campo real donde iría el número grabado. Se ve
// escribir sobre el plástico porque es el propio campo.
const TIPO_TARJETA = {
  style: {
    base: {
      color: '#ffffff',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '19px',
      letterSpacing: '.09em',
      '::placeholder': { color: 'rgba(255,255,255,.32)' },
    },
    invalid: { color: '#fca5a5' },
  },
}
const TIPO_PEQUENO = {
  style: {
    base: {
      color: '#ffffff',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '14px',
      letterSpacing: '.06em',
      '::placeholder': { color: 'rgba(255,255,255,.32)' },
    },
    invalid: { color: '#fca5a5' },
  },
}
const TIPO_CVV = {
  style: {
    base: {
      color: '#0f172a',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '15px',
      letterSpacing: '.28em',
      textAlign: 'right',
      '::placeholder': { color: 'rgba(15,23,42,.35)' },
    },
    invalid: { color: '#b91c1c' },
  },
}

const MARCAS = { visa: 'VISA', mastercard: 'Mastercard', amex: 'AMEX', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' }

const CARA = {
  position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
  borderRadius: 18, overflow: 'hidden',
  background: 'linear-gradient(135deg,#1e3a8a 0%,#312e81 52%,#0f172a 100%)',
  boxShadow: '0 20px 44px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.16)',
  border: '1px solid rgba(255,255,255,.12)',
}
const ETIQUETA = { margin: 0, fontSize: 8.5, letterSpacing: '.16em', color: 'rgba(255,255,255,.5)' }

function PayForm({ clientSecret, amountLabel, onSuccess, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [girada, setGirada] = useState(false)
  const [errores, setErrores] = useState({})
  const caducidadCompleta = useRef(false)

  const enfocarCvv = () => {
    setGirada(true)
    // El campo está en la cara de atrás: hay que esperar a que termine el giro
    // o el navegador enfoca algo que todavía no se ve.
    setTimeout(() => elements?.getElement(CardCvcElement)?.focus(), 320)
  }

  const alCambiar = (campo) => (e) => {
    setErrores(x => ({ ...x, [campo]: e.error?.message || '' }))
    if (campo === 'numero') {
      setMarca(e.brand && e.brand !== 'unknown' ? e.brand : '')
    }
    // Al completar la fecha, la tarjeta gira sola: es el orden natural en el
    // que se rellena y ahorra buscar dónde está el CVV.
    if (campo === 'caducidad' && e.complete && !caducidadCompleta.current) {
      caducidadCompleta.current = true
      enfocarCvv()
    }
  }

  const pagar = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setEnviando(true)
    setError('')

    // confirmCardPayment necesita el secret explícito: al usar los campos
    // sueltos no viaja dentro del elemento como sí ocurre con PaymentElement.
    const { error: errStripe, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardNumberElement),
        billing_details: { name: nombre || undefined },
      },
    })

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

  const mensajes = Object.values(errores).filter(Boolean)

  return (
    <form onSubmit={pagar}>
      <div style={{ perspective: 1400, maxWidth: 420, margin: '0 auto' }}>
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '1.586',
          transformStyle: 'preserve-3d', transition: 'transform .6s cubic-bezier(.4,.2,.2,1)',
          transform: girada ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}>
          {/* ── Frente ── */}
          <div style={{ ...CARA, padding: 22, display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-start justify-between">
              <div style={{ width: 44, height: 33, borderRadius: 6, background: 'linear-gradient(135deg,#fde68a,#d97706)', opacity: .92 }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '.04em', opacity: marca ? 1 : 0, transition: 'opacity .25s' }}>
                {MARCAS[marca] || '—'}
              </span>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <p style={{ ...ETIQUETA, marginBottom: 3 }}>NÚMERO</p>
              <CardNumberElement
                options={{ ...TIPO_TARJETA, showIcon: false, placeholder: '•••• •••• •••• ••••' }}
                onChange={alCambiar('numero')}
              />

              <div className="flex items-end justify-between" style={{ marginTop: 16, gap: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={ETIQUETA}>TITULAR</p>
                  <input
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="NOMBRE APELLIDO"
                    style={{
                      width: '100%', background: 'transparent', border: 'none', outline: 'none',
                      color: '#fff', fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '.05em', padding: '2px 0 0',
                    }}
                  />
                </div>
                <div style={{ width: 86 }}>
                  <p style={ETIQUETA}>VENCE</p>
                  <CardExpiryElement options={{ ...TIPO_PEQUENO, placeholder: 'MM/AA' }} onChange={alCambiar('caducidad')} />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={enfocarCvv}
              style={{
                position: 'absolute', top: 14, right: 18, fontSize: 10.5, letterSpacing: '.06em',
                color: 'rgba(255,255,255,.5)', background: 'none', border: 'none', cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: 3, marginTop: 26,
              }}
            >
              CVV ↻
            </button>
          </div>

          {/* ── Reverso ── */}
          <div style={{ ...CARA, transform: 'rotateY(180deg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 46, background: '#0b1020', marginTop: 20 }} />
            <div style={{ padding: '18px 22px' }}>
              <p style={{ ...ETIQUETA, marginBottom: 6 }}>CVV</p>
              <div style={{ background: 'rgba(255,255,255,.92)', borderRadius: 6, padding: '7px 12px' }}>
                <CardCvcElement
                  options={{ ...TIPO_CVV, placeholder: '•••' }}
                  onChange={alCambiar('cvv')}
                  onBlur={() => setGirada(false)}
                />
              </div>
              <button
                type="button"
                onClick={() => setGirada(false)}
                style={{
                  marginTop: 12, fontSize: 10.5, color: 'rgba(255,255,255,.5)', background: 'none',
                  border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0,
                }}
              >
                ↺ Volver al frente
              </button>
            </div>
          </div>
        </div>
      </div>

      {mensajes.length > 0 && (
        <p className="text-xs px-3 py-2 rounded-lg mt-4 text-center" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)' }}>
          {mensajes[0]}
        </p>
      )}
      {error && (
        <p className="text-xs px-3 py-2 rounded-lg mt-4 text-center" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)' }}>{error}</p>
      )}

      <div className="flex gap-3 mt-6" style={{ maxWidth: 420, margin: '24px auto 0' }}>
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

      <p className="text-[11px] mt-4 text-center" style={{ color: '#64748b' }}>
        Pago procesado por Stripe · tus datos no pasan por nuestros servidores
      </p>
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
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,.8)' }}>
        <div className="w-full max-w-lg rounded-2xl p-6 md:p-7 max-h-[92vh] overflow-y-auto" style={{ ...GLASS, background: 'rgba(8,16,44,.97)' }}>
          <div className="flex items-baseline justify-between mb-6 gap-4">
            <div>
              <h3 className="font-bold text-lg" style={{ color: '#eaf2ff' }}>Pagar con tarjeta</h3>
              <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>
                Total: <span style={{ color: '#eaf2ff', fontWeight: 600 }}>{amountLabel}</span>
              </p>
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
            <div className="py-16 text-center text-sm" style={{ color: '#8aa0cc' }}>Preparando el pago seguro...</div>
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
