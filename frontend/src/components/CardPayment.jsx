import { useEffect, useMemo, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import Portal from './Portal'
import api from '../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

// loadStripe se cachea por clave: montar el formulario dos veces no debe
// descargar el SDK dos veces.
const stripeCache = {}
function stripeFor(key) {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key)
  return stripeCache[key]
}

function PayForm({ amountLabel, onSuccess, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError('')

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/dashboard` },
    })

    if (stripeError) {
      setError(stripeError.message || 'No se pudo procesar el pago')
      setSubmitting(false)
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
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg mt-4" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-40"
          style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: 'rgba(255,255,255,.04)' }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition-all"
        >
          {submitting ? 'Procesando...' : `Pagar ${amountLabel}`}
        </button>
      </div>
    </form>
  )
}

export default function CardPayment({ orderId, amountLabel, onSuccess, onClose }) {
  const [clientSecret, setClientSecret] = useState('')
  const [pubKey, setPubKey] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.post(`/payments/orders/${orderId}/intent`)
      .then(r => {
        if (cancelled) return
        setClientSecret(r.data.data.client_secret)
        setPubKey(r.data.data.publishable_key)
      })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.detail || 'No se pudo iniciar el pago')
      })
    return () => { cancelled = true }
  }, [orderId])

  const stripePromise = useMemo(() => (pubKey ? stripeFor(pubKey) : null), [pubKey])

  return (
    <Portal>
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,.75)' }}>
        <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ ...GLASS, background: 'rgba(8,16,44,.97)' }}>
          <h3 className="font-bold mb-1" style={{ color: '#eaf2ff' }}>Pago con tarjeta</h3>
          <p className="text-xs mb-5" style={{ color: '#8aa0cc' }}>Total a pagar: {amountLabel}</p>

          {error && (
            <>
              <p className="text-sm px-3 py-2 rounded-lg mb-4" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)' }}>
                {error}
              </p>
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
            <div className="py-10 text-center text-sm" style={{ color: '#8aa0cc' }}>Cargando pago seguro...</div>
          )}

          {!error && clientSecret && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#38bdf8' } } }}
            >
              <PayForm amountLabel={amountLabel} onSuccess={onSuccess} onClose={onClose} />
            </Elements>
          )}
        </div>
      </div>
    </Portal>
  )
}
