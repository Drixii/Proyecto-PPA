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
const TIPO_FORM = {
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


// Cuántos dígitos tiene cada marca y cómo se agrupan en el plástico.
const FORMATO = {
  amex:   { largo: 15, grupos: [4, 6, 5], cvv: 4 },
  diners: { largo: 14, grupos: [4, 6, 4], cvv: 3 },
  _:      { largo: 16, grupos: [4, 4, 4, 4], cvv: 3 },
}
const formatoDe = (marca) => FORMATO[marca] || FORMATO._

/** Máscara de puntos del número, agrupada según la marca.
 *
 *  No refleja cuántos dígitos llevas escritos, y no por falta de ganas: Stripe
 *  solo emite un evento cuando cambia algo de lo que expone —vacío, completo,
 *  marca, error— y no uno por tecla. Contar pulsaciones daba saltos raros
 *  (un punto al reconocer la marca y de golpe todos al completar), así que la
 *  tarjeta muestra tres estados honestos: en blanco, rellenándose y lleno.
 */
function mascara({ grupos }, lleno) {
  let i = 0
  return grupos.map(n => {
    let bloque = ''
    for (let j = 0; j < n; j++, i++) bloque += lleno ? '\u2022' : '\u00b7'
    return bloque
  }).join(' ')
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

function Campo({ label, children, error }) {
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: '#8aa0cc' }}>{label}</label>
      <div className="rounded-xl px-3 py-3" style={{
        background: 'rgba(4,10,30,.85)',
        border: `1px solid ${error ? 'rgba(248,113,113,.5)' : 'rgba(255,255,255,.1)'}`,
      }}>
        {children}
      </div>
      {error && <p className="text-[11px] mt-1" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}

/** La tarjeta refleja lo que se puede reflejar.
 *
 *  Los dígitos, la fecha y el CVV se teclean dentro de iframes de Stripe y no
 *  son legibles desde aquí — es justo lo que evita que esos datos pasen por
 *  nuestro servidor. De Stripe sí llega la marca y si cada campo está
 *  completo; el nombre es un campo nuestro. Con eso la tarjeta muestra la
 *  marca en cuanto se reconoce, copia el nombre según se escribe, marca cada
 *  bloque como relleno y gira al tocar el CVV.
 */
function TarjetaVisual({ nombre, marca, campos, girada }) {
  const fmt = formatoDe(marca)

  // El degradado en movimiento solo aparece en "escribiendo": comunica que el
  // campo está a medias sin fingir un número de dígitos que no conocemos.
  const pinta = (estado) => estado === 'completo'
    ? { color: '#fff' }
    : estado === 'escribiendo'
      ? {
          color: 'transparent',
          backgroundImage: 'linear-gradient(90deg,#fff 0%,#fff 35%,rgba(255,255,255,.25) 55%,rgba(255,255,255,.25) 100%)',
          backgroundSize: '250% 100%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          animation: 'ppaRelleno 1.4s linear infinite',
        }
      : { color: 'rgba(255,255,255,.3)' }

  return (
    <div style={{ perspective: 1200 }}>
      <style>{`@keyframes ppaRelleno { from { background-position: 120% 0 } to { background-position: -40% 0 } }`}</style>
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1.586',
        transformStyle: 'preserve-3d', transition: 'transform .6s cubic-bezier(.4,.2,.2,1)',
        transform: girada ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        {/* Frente */}
        <div style={{ ...CARA, padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div className="flex items-start justify-between">
            <div style={{ width: 42, height: 32, borderRadius: 6, background: 'linear-gradient(135deg,#fde68a,#d97706)', opacity: .92 }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '.04em', opacity: marca ? 1 : 0, transition: 'opacity .25s' }}>
              {MARCAS[marca] || '\u2014'}
            </span>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <p style={{
              margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 18,
              letterSpacing: '.1em', transition: 'color .25s', ...pinta(campos.numero),
            }}>
              {mascara(fmt, campos.numero === 'completo')}
            </p>
            <div className="flex items-end justify-between" style={{ marginTop: 14, gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={ETIQUETA}>TITULAR</p>
                <p style={{
                  margin: '2px 0 0', fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'color .25s', ...pinta(nombre ? 'completo' : 'vacio'),
                }}>
                  {nombre || 'NOMBRE APELLIDO'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={ETIQUETA}>VENCE</p>
                <p style={{
                  margin: '2px 0 0', fontSize: 12.5, fontFamily: 'ui-monospace, Menlo, monospace',
                  transition: 'color .25s', ...pinta(campos.caducidad),
                }}>
                  {campos.caducidad === 'completo' ? '\u2022\u2022/\u2022\u2022' : '\u00b7\u00b7/\u00b7\u00b7'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Reverso */}
        <div style={{ ...CARA, transform: 'rotateY(180deg)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 42, background: '#0b1020', marginTop: 18 }} />
          <div style={{ padding: '16px 20px' }}>
            <p style={{ ...ETIQUETA, marginBottom: 5 }}>CVV</p>
            <div style={{ background: 'rgba(255,255,255,.92)', borderRadius: 5, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 12 }}>
              <span style={{
                fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15, letterSpacing: '.3em',
                color: campos.cvv === 'completo' ? '#0f172a'
                  : campos.cvv === 'escribiendo' ? 'rgba(15,23,42,.6)' : 'rgba(15,23,42,.28)',
                transition: 'color .25s',
              }}>
                {mascara({ largo: fmt.cvv, grupos: [fmt.cvv] }, campos.cvv === 'completo')}
              </span>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 9.5, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
              Tus datos viajan cifrados directamente a Stripe.
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
  // vacio | escribiendo | completo, por campo.
  const [campos, setCampos] = useState({ numero: 'vacio', caducidad: 'vacio', cvv: 'vacio' })
  const [girada, setGirada] = useState(false)
  const [errores, setErrores] = useState({})

  // Tres estados y no dos: Stripe avisa en cada tecla si el campo está vacío
  // y si está completo, así que la tarjeta puede reaccionar mientras se
  // escribe en vez de esperar al final. Lo que no llega es el contenido, así
  // que se marca el avance, no los dígitos.
  const alCambiar = (campo) => (e) => {
    setErrores(x => ({ ...x, [campo]: e.error?.message || '' }))
    if (campo === 'numero') setMarca(e.brand && e.brand !== 'unknown' ? e.brand : '')
    setCampos(prev => {
      const siguiente = e.empty ? 'vacio' : e.complete ? 'completo' : 'escribiendo'
      return prev[campo] === siguiente ? prev : { ...prev, [campo]: siguiente }
    })
  }

  // Pagar solo cuando Stripe da los tres campos por completos y hay titular.
  // Antes el botón estaba siempre activo y pulsarlo a medias devolvía un error
  // de Stripe, que es una forma fea de enterarse de que falta el CVV.
  const listo = campos.numero === 'completo'
    && campos.caducidad === 'completo'
    && campos.cvv === 'completo'
    && nombre.trim().length > 1

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

  return (
    <form onSubmit={pagar}>
      <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,290px)' }}>
        <div className="space-y-4 order-2 md:order-1">
          <Campo label="Número de tarjeta" error={errores.numero}>
            <CardNumberElement
              options={{ ...TIPO_FORM, showIcon: false, placeholder: '1234 1234 1234 1234' }}
              onChange={alCambiar('numero')}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Vencimiento" error={errores.caducidad}>
              <CardExpiryElement options={{ ...TIPO_FORM, placeholder: 'MM/AA' }} onChange={alCambiar('caducidad')} />
            </Campo>
            <Campo label="CVV" error={errores.cvv}>
              <CardCvcElement
                options={{ ...TIPO_FORM, placeholder: '123' }}
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
              disabled={!stripe || enviando || !listo}
              title={listo ? '' : 'Completa los datos de la tarjeta'}
              className="flex-1 bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold py-3 rounded-xl transition-all"
            >
              {enviando ? 'Procesando...' : listo ? `Pagar ${amountLabel}` : 'Completa la tarjeta'}
            </button>
          </div>
        </div>

        <div className="order-1 md:order-2">
          <TarjetaVisual
            nombre={nombre}
            marca={marca}
            campos={campos}
            girada={girada}
          />
          <p className="text-[11px] mt-3 text-center" style={{ color: '#64748b' }}>
            Pago procesado por Stripe
          </p>
        </div>
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
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,.8)' }}>
        <div className="w-full max-w-3xl rounded-2xl p-6 md:p-7 max-h-[92vh] overflow-y-auto" style={{ ...GLASS, background: 'rgba(8,16,44,.97)' }}>
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
