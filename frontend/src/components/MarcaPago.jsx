import koyweLogo from '../assets/pagos/koywe.svg'
import stripeLogo from '../assets/pagos/stripe.svg'
import haulmerLogo from '../assets/pagos/haulmer.svg'

// La cara de cada forma de pago.
//
// Antes todos los botones eran un emoji y un texto, y "Transferencia" o "Pago
// con tarjeta" no dicen con quién se está pagando. Aquí cada método sale con
// su marca: Khipu con la suya, la transferencia con el banco de la cuenta, y
// debajo quién lo procesa.
//
// De Koywe, Stripe y Haulmer tenemos el logo de verdad. De los métodos que
// ellos revenden (Khipu, PSE, PIX…) no, así que se dibuja el nombre en su
// color de marca: se reconoce igual y no hay que subir nada.

const MARCAS = {
  KHIPU: { texto: 'khipu', color: '#0DBAE8', fondo: 'rgba(13,186,232,.12)' },
  PSE: { texto: 'PSE', color: '#0FA958', fondo: 'rgba(15,169,88,.12)' },
  PIX: { texto: 'Pix', color: '#32BCAD', fondo: 'rgba(50,188,173,.12)' },
  PIX_STATIC: { texto: 'Pix', color: '#32BCAD', fondo: 'rgba(50,188,173,.12)' },
  PIX_DYNAMIC: { texto: 'Pix', color: '#32BCAD', fondo: 'rgba(50,188,173,.12)' },
  LIGO: { texto: 'Ligo', color: '#7C4DFF', fondo: 'rgba(124,77,255,.12)' },
  SIP_QR: { texto: 'QR', color: '#38bdf8', fondo: 'rgba(56,189,248,.12)' },
  CARD_PAYMENT: { texto: 'Tarjeta', color: '#e2ecff', fondo: 'rgba(255,255,255,.08)' },
}

const LOGOS = { koywe: koyweLogo, stripe: stripeLogo, haulmer: haulmerLogo }

// Un color estable por banco, para que el mismo banco se vea siempre igual sin
// tener que mantener una tabla de todos los bancos de doce países.
const PALETA = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#a78bfa']

export function colorDeBanco(nombre) {
  const texto = String(nombre || '')
  let suma = 0
  for (let i = 0; i < texto.length; i++) suma = (suma + texto.charCodeAt(i)) % 997
  return PALETA[suma % PALETA.length]
}

function Recuadro({ children, fondo, borde, tam = 44 }) {
  return (
    <div style={{
      width: tam, height: tam, flexShrink: 0, borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: fondo || 'rgba(255,255,255,.06)',
      border: `1px solid ${borde || 'rgba(255,255,255,.1)'}`,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

/** El logo (o la marca dibujada) de un método de pago.
 *
 * `codigo` es el del backend: 'transferencia', 'tarjeta', 'link_pago',
 * 'haulmer' o el de un método de Koywe (KHIPU, PSE, PIX…).
 */
export default function MarcaPago({ codigo, banco, tam = 44 }) {
  const cod = String(codigo || '').toUpperCase()

  if (cod === 'TARJETA') {
    return <Recuadro tam={tam} fondo="rgba(99,91,255,.12)" borde="rgba(99,91,255,.3)">
      <img src={LOGOS.stripe} alt="Stripe" style={{ height: tam * 0.4, width: 'auto' }} />
    </Recuadro>
  }

  if (cod === 'LINK_PAGO' || cod === 'HAULMER') {
    return <Recuadro tam={tam} fondo="rgba(56,189,248,.12)" borde="rgba(56,189,248,.3)">
      <img src={LOGOS.haulmer} alt="Haulmer" style={{ height: tam * 0.3, width: 'auto' }} />
    </Recuadro>
  }

  if (cod === 'TRANSFERENCIA') {
    const color = colorDeBanco(banco)
    return <Recuadro tam={tam} fondo={`${color}1f`} borde={`${color}55`}>
      <svg width={tam * 0.46} height={tam * 0.46} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 18h20M12 3 3 8h18l-9-5z" />
      </svg>
    </Recuadro>
  }

  const marca = MARCAS[cod]
  if (marca) {
    return <Recuadro tam={tam} fondo={marca.fondo} borde={`${marca.color}44`}>
      <span style={{
        fontSize: Math.max(11, tam * 0.26), fontWeight: 800, color: marca.color,
        letterSpacing: '-.02em', lineHeight: 1,
      }}>{marca.texto}</span>
    </Recuadro>
  }

  // Cualquier método nuevo de Koywe que aún no tenga marca aquí: su logo.
  return <Recuadro tam={tam} fondo="rgba(200,255,30,.1)" borde="rgba(200,255,30,.3)">
    <img src={LOGOS.koywe} alt="Koywe" style={{ height: tam * 0.34, width: 'auto' }} />
  </Recuadro>
}

/** Quién procesa el cobro, en letra pequeña bajo el nombre del método. */
export function ProcesadoPor({ codigo }) {
  const cod = String(codigo || '').toUpperCase()
  const via = cod === 'TARJETA' ? 'stripe'
    : (cod === 'LINK_PAGO' || cod === 'HAULMER') ? 'haulmer'
      : (cod === 'TRANSFERENCIA' ? null : 'koywe')
  if (!via) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, opacity: .75 }}>
      <span style={{ fontSize: 10.5, color: '#8aa0cc' }}>vía</span>
      <img src={LOGOS[via]} alt={via} style={{ height: via === 'haulmer' ? 8 : 11, width: 'auto' }} />
    </span>
  )
}

/** Cómo se llama el método en pantalla: "Pago con Khipu", no "Khipu". */
export function nombreDeMetodo(codigo, nombre, banco) {
  const cod = String(codigo || '').toUpperCase()
  if (cod === 'TRANSFERENCIA') return banco ? `Transferencia a ${banco}` : 'Transferencia bancaria'
  if (cod === 'TARJETA') return 'Tarjeta de crédito o débito'
  if (cod === 'LINK_PAGO') return 'Tarjeta con Haulmer'
  if (cod === 'HAULMER') return 'Tarjeta internacional'
  if (cod === 'KHIPU') return 'Transferencia con Khipu'
  if (cod === 'PSE') return 'Débito con PSE'
  if (cod.startsWith('PIX')) return 'Pago con Pix'
  return nombre ? `Pago con ${nombre}` : 'Pago'
}
