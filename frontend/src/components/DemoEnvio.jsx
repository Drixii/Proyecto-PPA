import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

// Vista previa de un envío, dentro de un teléfono.
//
// Réplica de /new-transfer tal como la ve el cliente en el móvil, rellenándose
// sola: elige destinatario, escribe el monto, llena los datos del receptor,
// paga por transferencia y confirma. No es la página de verdad embebida —esa
// pide sesión y crearía órdenes—, sino la misma maqueta con datos inventados.
// La tasa sí es la real del día: es lo único que el visitante puede comprobar
// después, y un ejemplo con una tasa falsa sería mentirle.
//
// Todo se deriva de un solo reloj `t`, en milisegundos dentro de la vuelta. No
// hay estado de «qué campo va»: cada cosa que se ve es función de `t`, así que
// saltar a un paso es solo mover el reloj, y no puede quedar nada a medias.

const ANCHO = 360
const ALTO = 760

const DURACION = 31000
export const ESCENAS = [
  { id: 'destino',   desde: 0,     paso: 0 },
  { id: 'calcular',  desde: 2600,  paso: 0 },
  { id: 'receptor',  desde: 7200,  paso: 1 },
  { id: 'pago',      desde: 15600, paso: 2 },
  { id: 'confirmar', desde: 22600, paso: 2 },
  { id: 'listo',     desde: 26800, paso: 3 },
]
// Dónde empieza cada una de las cuatro tarjetas de pasos del home.
export const INICIO_DE_PASO = [2600, 7200, 15600, 26800]

const NOMBRES = ['María', 'José', 'Luis', 'Carmen', 'Andrea', 'Carlos', 'Daniela', 'Miguel', 'Valentina', 'Jesús', 'Gabriela', 'Rafael']
const APELLIDOS = ['González', 'Rodríguez', 'Hernández', 'Pérez', 'Martínez', 'Ramírez', 'Torres', 'Díaz', 'Morales', 'Rojas', 'Castillo', 'Medina']
const BANCOS = [['Banco de Venezuela', '0102'], ['Banesco', '0134'], ['Mercantil', '0105'], ['BBVA Provincial', '0108'], ['Bancamiga', '0172'], ['Banco del Tesoro', '0163']]
const BANCOS_CHILE = ['Banco Estado', 'BCI', 'Santander', 'Banco de Chile', 'Scotiabank']

const MONTO = 50000
const TASA_RESPALDO = 0.9176

// Pseudoaleatorio con semilla: los datos cambian en cada vuelta pero no en
// cada fotograma, que es lo que pasaría con Math.random() en el render.
function generador(semilla) {
  let s = (semilla * 2654435761) % 4294967296
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function datosDeEjemplo(vuelta) {
  const r = generador(vuelta + 11)
  const elige = a => a[Math.floor(r() * a.length)]
  const digitos = n => Array.from({ length: n }, () => Math.floor(r() * 10)).join('')
  const [banco, codigo] = elige(BANCOS)
  const cedula = 9000000 + Math.floor(r() * 21000000)
  return {
    nombre: `${elige(NOMBRES)} ${elige(APELLIDOS)}`,
    telefono: `${elige(['412', '414', '416', '424', '426'])} ${digitos(3)} ${digitos(4)}`,
    banco,
    cuenta: (codigo + digitos(16)).replace(/(\d{4})(?=\d)/g, '$1 '),
    documento: cedula.toLocaleString('es-CL'),
    orden: `KG-2026-${1000 + Math.floor(r() * 8999)}`,
    bancoCobro: elige(BANCOS_CHILE),
    finCuentaCobro: digitos(4),
    contactos: [
      { nombre: `${elige(NOMBRES)} ${elige(APELLIDOS)}`, fin: digitos(4) },
      { nombre: `${elige(NOMBRES)} ${elige(APELLIDOS)}`, fin: digitos(4) },
    ],
  }
}

const entre = (t, a, b) => t >= a && t < b
const avance = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)))
// Texto que se va escribiendo letra a letra desde `desde`.
const escribe = (texto, t, desde, msPorLetra = 55) =>
  t < desde ? '' : texto.slice(0, Math.floor((t - desde) / msPorLetra) + 1)

const miles = n => Math.round(n).toLocaleString('es-CL')

// Los tramos de escritura del receptor, uno detrás de otro. Se calculan del
// largo de cada dato para que un nombre largo no se coma el tiempo del
// siguiente campo.
function tramosReceptor(d) {
  const campos = [
    ['nombre', d.nombre, 55],
    ['telefono', d.telefono, 50],
    ['banco', null, 0],
    ['cuenta', d.cuenta, 32],
    ['documento', d.documento, 60],
  ]
  let t = 7900
  const tramos = {}
  for (const [campo, texto, ms] of campos) {
    const dura = texto ? texto.length * ms : 700
    tramos[campo] = { desde: t, hasta: t + dura, ms }
    t += dura + 260
  }
  tramos.continuar = { desde: t + 350, hasta: t + 750 }
  return tramos
}

// ── Piezas de la maqueta ────────────────────────────────────────────────────

// Círculo que marca dónde «toca» el dedo.
function Toque({ activo }) {
  if (!activo) return null
  return (
    <span style={{
      position: 'absolute', left: '50%', top: '50%', width: 34, height: 34,
      marginLeft: -17, marginTop: -17, borderRadius: '50%', pointerEvents: 'none',
      background: 'rgba(255,255,255,.35)', border: '2px solid rgba(255,255,255,.7)',
      animation: 'demoToque .45s ease-out both',
    }} />
  )
}

function Bandera({ iso, w = 22, h = 15 }) {
  return <img src={`https://flagcdn.com/w40/${iso}.png`} alt="" style={{ width: w, height: h, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
}

const campoBase = (activo) => ({
  width: '100%', boxSizing: 'border-box', borderRadius: 12, padding: '10px 14px',
  fontSize: 14, minHeight: 42, display: 'flex', alignItems: 'center',
  background: 'rgba(6,13,40,.8)', color: '#eaf2ff',
  border: `1px solid ${activo ? '#3b82f6' : 'rgba(255,255,255,.1)'}`,
  boxShadow: activo ? '0 0 0 2px rgba(59,130,246,.35)' : 'none',
  transition: 'border-color .2s, box-shadow .2s',
})

function Cursor({ visible }) {
  return visible
    ? <span style={{ display: 'inline-block', width: 1.5, height: 16, marginLeft: 1, background: '#38bdf8', animation: 'demoCursor 1s steps(2) infinite' }} />
    : null
}

function BotonPrincipal({ children, toque, apagado }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', width: '100%', textAlign: 'center',
      padding: '13px 0', borderRadius: 12, fontSize: 14.5, fontWeight: 600, color: '#fff',
      background: 'linear-gradient(90deg,#60a5fa,#1d4ed8)', opacity: apagado ? .4 : 1,
      transform: toque ? 'scale(.97)' : 'none', transition: 'transform .15s, opacity .3s',
    }}>
      {children}
      <Toque activo={toque} />
    </div>
  )
}

function Volver() {
  return (
    <span style={{ height: 30, padding: '0 10px', borderRadius: 11, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, border: '1px solid rgba(248,113,113,.35)', color: '#f87171', background: 'rgba(248,113,113,.08)', flexShrink: 0 }}>
      ← Volver
    </span>
  )
}

const PASOS_APP = ['Destino', 'Calcular', 'Receptor', 'Pago', 'Confirmar']

function Stepper({ actual }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0 18px' }}>
      {PASOS_APP.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < PASOS_APP.length - 1 ? 1 : 'none' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, transition: 'all .3s',
            ...(i === actual
              ? { background: 'rgba(56,189,248,.15)', border: '2px solid #38bdf8', color: '#38bdf8' }
              : i < actual
                ? { background: '#38bdf8', color: '#060d22' }
                : { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#64748b' }),
          }}>
            {i < actual ? '✓' : i + 1}
          </div>
          {i < PASOS_APP.length - 1 && (
            <div style={{ flex: 1, height: 2, margin: '0 6px', borderRadius: 2, background: i < actual ? '#38bdf8' : 'rgba(255,255,255,.08)', transition: 'background .3s' }} />
          )}
        </div>
      ))}
    </div>
  )
}

const tarjeta = {
  borderRadius: 20, padding: 18,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)',
}

// ── Pantallas ───────────────────────────────────────────────────────────────

function PantallaDestino({ t, d }) {
  const toque = entre(t, 1700, 2150)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#eaf2ff' }}>¿A quién quieres enviar?</p>
      <div style={{
        position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderRadius: 16, background: 'rgba(56,189,248,.1)',
        border: '1px dashed rgba(56,189,248,.45)', transform: toque ? 'scale(.97)' : 'none', transition: 'transform .15s',
      }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'rgba(56,189,248,.15)', color: '#38bdf8' }}>+</span>
        <span>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: '#eaf2ff' }}>Nuevo destinatario</span>
          <span style={{ display: 'block', fontSize: 11.5, marginTop: 2, color: '#8aa0cc' }}>Enviar a alguien por primera vez</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 17, color: '#38bdf8' }}>→</span>
        <Toque activo={toque} />
      </div>

      <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#aebfe2' }}>Enviar de nuevo a</p>
      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
        {d.contactos.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i === 0 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#38bdf8,#818cf8)' }}>
              {c.nombre[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#eaf2ff' }}>{c.nombre}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Bandera iso="ve" w={16} h={11} />
                <span style={{ fontSize: 11.5, color: '#8aa0cc' }}>Venezuela · •••• {c.fin}</span>
              </div>
            </div>
            <span style={{ color: '#475569' }}>→</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PantallaCalcular({ t, tasa }) {
  const inicio = 3000
  const texto = String(MONTO)
  const escritas = t < inicio ? 0 : Math.min(texto.length, Math.floor((t - inicio) / 190) + 1)
  const monto = escritas ? Number(texto.slice(0, escritas)) : 0
  const finEscritura = inicio + texto.length * 190
  const calculando = entre(t, finEscritura, finEscritura + 550)
  const listo = t >= finEscritura + 550
  // El resultado sube contando, como en la calculadora real.
  const recibe = listo ? MONTO * tasa * (0.35 + 0.65 * avance(t, finEscritura + 550, finEscritura + 1250)) : 0
  const toque = entre(t, 6400, 6850)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Volver />
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#eaf2ff' }}>¿Cuánto quieres enviar?</p>
      </div>

      <div style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ padding: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#8aa0cc' }}>Tu envías</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '7px 11px', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(6,13,40,.8)' }}>
              <Bandera iso="cl" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eaf2ff' }}>CLP</span>
              <span style={{ fontSize: 10, color: '#8aa0cc' }}>▾</span>
            </span>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 28, fontWeight: 700, color: monto ? '#eaf2ff' : '#64748b' }}>
              {monto ? miles(monto) : '0'}
              <Cursor visible={entre(t, inicio - 300, finEscritura + 200)} />
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(6,13,40,.5)', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: listo ? '#4ade80' : '#64748b', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, fontWeight: 500, color: '#8aa0cc' }}>
            {calculando ? 'Calculando...' : listo ? `Tasa: ${tasa.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : 'Ingresa un monto para ver la tasa'}
          </span>
        </div>
        <div style={{ padding: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#8aa0cc' }}>Destinatario recibe</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '7px 11px', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(6,13,40,.8)' }}>
              <Bandera iso="ve" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eaf2ff' }}>VES</span>
              <span style={{ fontSize: 10, color: '#8aa0cc' }}>▾</span>
            </span>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 28, fontWeight: 700, color: recibe ? '#38bdf8' : '#64748b' }}>
              {recibe ? miles(recibe) : '—'}
            </span>
          </div>
        </div>
      </div>

      <BotonPrincipal toque={toque} apagado={!listo}>Continuar →</BotonPrincipal>
    </div>
  )
}

function PantallaReceptor({ t, d }) {
  const tr = tramosReceptor(d)
  const valor = (campo, texto) => escribe(texto, t, tr[campo].desde, tr[campo].ms)
  const activo = campo => entre(t, tr[campo].desde - 150, tr[campo].hasta + 200)
  const bancoElegido = t >= tr.banco.desde + 450
  const etiqueta = { fontSize: 12.5, display: 'block', marginBottom: 6, color: '#aebfe2' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Volver />
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#eaf2ff' }}>Datos del receptor</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Bandera iso="ve" w={16} h={11} />
            <span style={{ fontSize: 11.5, color: '#8aa0cc' }}>Venezuela</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(56,189,248,.12)', color: '#38bdf8' }}>VES</span>
          </div>
        </div>
      </div>

      <div>
        <span style={etiqueta}>Nombre completo *</span>
        <div style={campoBase(activo('nombre'))}>{valor('nombre', d.nombre)}<Cursor visible={activo('nombre')} /></div>
      </div>

      <div>
        <span style={etiqueta}>Teléfono</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...campoBase(false), width: 'auto', color: '#8aa0cc' }}>+58</div>
          <div style={{ ...campoBase(activo('telefono')), flex: 1 }}>{valor('telefono', d.telefono)}<Cursor visible={activo('telefono')} /></div>
        </div>
      </div>

      <div>
        <span style={{ ...etiqueta, display: 'flex', alignItems: 'center', gap: 6 }}>Banco destino <Bandera iso="ve" w={16} h={11} /></span>
        <div style={{ ...campoBase(activo('banco')), position: 'relative', overflow: 'hidden', justifyContent: 'space-between', transform: entre(t, tr.banco.desde, tr.banco.desde + 300) ? 'scale(.98)' : 'none' }}>
          <span style={{ color: bancoElegido ? '#eaf2ff' : '#64748b' }}>{bancoElegido ? d.banco : 'Seleccionar banco...'}</span>
          <span style={{ fontSize: 10, color: '#8aa0cc' }}>▾</span>
          <Toque activo={entre(t, tr.banco.desde, tr.banco.desde + 400)} />
        </div>
      </div>

      <div>
        <span style={etiqueta}>Número de cuenta</span>
        <div style={{ ...campoBase(activo('cuenta')), fontFamily: 'monospace', fontSize: 13 }}>{valor('cuenta', d.cuenta)}<Cursor visible={activo('cuenta')} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={etiqueta}>Tipo de ID</span>
          <div style={{ ...campoBase(false), justifyContent: 'space-between' }}><span>V</span><span style={{ fontSize: 10, color: '#8aa0cc' }}>▾</span></div>
        </div>
        <div>
          <span style={etiqueta}>Número de ID</span>
          <div style={{
            ...campoBase(activo('documento')),
            ...(t >= tr.documento.hasta + 200 ? { border: '1px solid rgba(74,222,128,.4)', boxShadow: 'none' } : {}),
          }}>{valor('documento', d.documento)}<Cursor visible={activo('documento')} /></div>
        </div>
      </div>

      <BotonPrincipal toque={entre(t, tr.continuar.desde, tr.continuar.hasta)} apagado={t < tr.documento.hasta}>Continuar →</BotonPrincipal>
    </div>
  )
}

function PantallaPago({ t, d }) {
  const eligeTransfer = t >= 16700
  const copiado = entre(t, 18400, 19600)
  const comprobante = t >= 19900
  const fila = (etiqueta, valor, mono) => (
    <div key={etiqueta} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 9.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#475569' }}>{etiqueta}</p>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#eaf2ff', fontFamily: mono ? 'monospace' : undefined }}>{valor}</p>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: '#aebfe2' }}>Copiar</span>
    </div>
  )
  const metodo = (activo, icono, titulo, desc, toque) => (
    <div style={{
      position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      padding: 13, borderRadius: 16, textAlign: 'center', transform: toque ? 'scale(.96)' : 'none', transition: 'all .2s',
      ...(activo ? { background: 'rgba(56,189,248,.1)', border: '2px solid #38bdf8' } : { background: 'rgba(255,255,255,.04)', border: '2px solid rgba(255,255,255,.08)' }),
    }}>
      <span style={{ fontSize: 22 }}>{icono}</span>
      <span style={{ fontWeight: 600, fontSize: 13, color: '#eaf2ff' }}>{titulo}</span>
      <span style={{ fontSize: 11, color: '#8aa0cc' }}>{desc}</span>
      <Toque activo={toque} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Volver />
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#eaf2ff' }}>Método de pago</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {metodo(eligeTransfer, '🏦', 'Transferencia', 'Te damos la cuenta', entre(t, 16300, 16750))}
        {metodo(false, '💳', 'Pago con tarjeta', 'Portal de pago', false)}
      </div>

      {eligeTransfer && (
        <>
          <div style={{ ...tarjeta, padding: 14, border: '1px solid rgba(56,189,248,.2)', display: 'flex', flexDirection: 'column', gap: 10, animation: 'demoEntra .35s ease-out both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#38bdf8' }}>Transfiere a esta cuenta</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 999, background: 'rgba(56,189,248,.12)', color: '#38bdf8' }}>CLP</span>
            </div>
            {fila('Banco', d.bancoCobro)}
            {fila('Titular', 'KSA Global SpA')}
            {fila('Número de cuenta', `•••• ${d.finCuentaCobro}`, true)}
            <div style={{
              position: 'relative', overflow: 'hidden', textAlign: 'center', padding: '9px 0', borderRadius: 11, fontSize: 11.5, fontWeight: 700,
              border: '1px solid rgba(56,189,248,.3)', background: 'rgba(56,189,248,.08)', color: copiado ? '#4ade80' : '#38bdf8',
            }}>
              {copiado ? '✓ Datos copiados' : 'Copiar todos los datos'}
              <Toque activo={entre(t, 18200, 18650)} />
            </div>
            <div style={{ borderRadius: 11, padding: 10, background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.15)' }}>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, color: '#fcd34d' }}>
                Transfiere exactamente <strong>{miles(MONTO)} CLP</strong>. Un monto distinto retrasa la revisión.
              </p>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#aebfe2' }}>Comprobante de transferencia</p>
          <div style={{
            position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 18, borderRadius: 16,
            border: `2px dashed ${comprobante ? 'rgba(74,222,128,.3)' : 'rgba(255,255,255,.1)'}`,
            background: comprobante ? 'rgba(74,222,128,.06)' : 'rgba(6,13,40,.4)', transition: 'all .3s',
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: comprobante ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.06)', color: comprobante ? '#4ade80' : '#8aa0cc', fontSize: 19 }}>
              {comprobante ? '✓' : '↑'}
            </div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: comprobante ? '#4ade80' : '#aebfe2' }}>
              {comprobante ? 'comprobante.jpg' : 'Adjuntar comprobante'}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: comprobante ? 'rgba(74,222,128,.7)' : '#8aa0cc' }}>
              {comprobante ? 'Toca para cambiar' : 'JPG, PNG, HEIC o PDF — requerido'}
            </p>
            <Toque activo={entre(t, 19300, 19750)} />
          </div>

          <BotonPrincipal toque={entre(t, 21700, 22150)} apagado={!comprobante}>Continuar →</BotonPrincipal>
        </>
      )}
    </div>
  )
}

function PantallaConfirmar({ t, d, tasa }) {
  const modal = t >= 24500
  const linea = (a, b, color = '#aebfe2') => (
    <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 13 }}>
      <span style={{ color: '#8aa0cc' }}>{a}</span>
      <span style={{ fontWeight: 600, color }}>{b}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Volver />
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#eaf2ff' }}>Confirmar transferencia</p>
      </div>

      <div style={{ ...tarjeta, border: '1px solid rgba(56,189,248,.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc' }}>Envías</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#eaf2ff' }}>{miles(MONTO)} <span style={{ fontSize: 12, color: '#8aa0cc' }}>CLP</span></p>
          </div>
          <span style={{ fontSize: 22, color: '#38bdf8' }}>→</span>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 11, color: '#8aa0cc', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Recibe <Bandera iso="ve" w={14} h={10} /></p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#4ade80' }}>{miles(MONTO * tasa)} <span style={{ fontSize: 12, opacity: .7 }}>VES</span></p>
          </div>
        </div>
        <p style={{ margin: '10px 0 0', paddingTop: 10, textAlign: 'center', fontSize: 11.5, color: '#8aa0cc', borderTop: '1px solid rgba(56,189,248,.15)' }}>
          Tasa: <strong style={{ color: '#aebfe2' }}>{tasa.toFixed(4)}</strong>
        </p>
      </div>

      <div>
        {linea('Receptor', d.nombre, '#eaf2ff')}
        {linea('País', 'Venezuela')}
        {linea('Cuenta', `•••• ${d.cuenta.replace(/\s/g, '').slice(-4)}`)}
        {linea('Método pago', 'Transferencia')}
        {linea('Comprobante', '✓ Adjunto', '#4ade80')}
      </div>

      <BotonPrincipal toque={entre(t, 23900, 24350)}>✓ Confirmar envío</BotonPrincipal>

      {modal && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: 'rgba(0,0,0,.7)', animation: 'demoEntra .25s ease-out both' }}>
          <div style={{ width: '100%', borderRadius: 18, padding: 18, background: 'rgba(8,16,44,.98)', border: '1px solid rgba(56,189,248,.2)' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#eaf2ff' }}>¿Confirmar envío?</p>
            <p style={{ margin: '3px 0 14px', fontSize: 11.5, color: '#8aa0cc' }}>Revisa los datos antes de continuar</p>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.06)', marginBottom: 14 }}>
              {[['Receptor', d.nombre], ['Banco', d.banco], ['Envías', `${miles(MONTO)} CLP`], ['Recibe', `${miles(MONTO * tasa)} VES`]].map(([a, b]) => (
                <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 11.5 }}>
                  <span style={{ color: '#64748b' }}>{a}</span>
                  <span style={{ fontWeight: 600, color: '#aebfe2' }}>{b}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 11, fontSize: 13, background: 'rgba(255,255,255,.06)', color: '#aebfe2', border: '1px solid rgba(255,255,255,.1)' }}>Cancelar</span>
              <span style={{ position: 'relative', overflow: 'hidden', flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 11, fontSize: 13, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', transform: entre(t, 25900, 26350) ? 'scale(.96)' : 'none' }}>
                Sí, enviar
                <Toque activo={entre(t, 25900, 26350)} />
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PantallaListo({ t, d }) {
  const aviso = t >= 28400
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 70 }}>
      {aviso && (
        <div style={{ position: 'absolute', top: 8, left: 10, right: 10, zIndex: 6, display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 16, background: 'rgba(30,41,70,.96)', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 10px 30px rgba(0,0,0,.5)', textAlign: 'left', animation: 'demoBaja .45s cubic-bezier(.16,1,.3,1) both' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)' }}>KG</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#eaf2ff' }}>Tu envío está en proceso</p>
            <p style={{ margin: 0, fontSize: 11, color: '#aebfe2' }}>{d.orden} · {d.nombre}</p>
          </div>
        </div>
      )}
      <div style={{ width: 86, height: 86, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#fff', background: 'linear-gradient(135deg,#4ade80,#16a34a)', boxShadow: '0 12px 40px rgba(74,222,128,.45)', animation: 'demoSalta .55s cubic-bezier(.34,1.56,.64,1) both' }}>✓</div>
      <p style={{ margin: '22px 0 4px', fontSize: 22, fontWeight: 700, color: '#eaf2ff' }}>¡Envío creado!</p>
      <p style={{ margin: 0, fontSize: 13, color: '#8aa0cc' }}>Orden <span style={{ fontFamily: 'monospace', color: '#aebfe2' }}>{d.orden}</span></p>
      <span style={{ marginTop: 14, fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: 'rgba(251,146,60,.12)', color: '#fb923c', border: '1px solid rgba(251,146,60,.3)' }}>● En aprobación</span>

      <div style={{ ...tarjeta, width: '100%', boxSizing: 'border-box', marginTop: 26, textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
          <span style={{ color: '#8aa0cc' }}>Para</span><span style={{ fontWeight: 600, color: '#eaf2ff' }}>{d.nombre}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
          <span style={{ color: '#8aa0cc' }}>Banco</span><span style={{ fontWeight: 600, color: '#aebfe2' }}>{d.banco}</span>
        </div>
      </div>
      <p style={{ margin: '18px 12px 0', fontSize: 12, lineHeight: 1.5, color: '#8aa0cc' }}>
        Te avisamos por notificación en cada paso, hasta que el dinero llegue.
      </p>
    </div>
  )
}

// Cuánto se desplaza el contenido de la pantalla hacia arriba, para seguir lo
// que se está rellenando: un teléfono de verdad también hace scroll.
function desplazamiento(escena, t, d) {
  if (escena === 'receptor') {
    const tr = tramosReceptor(d)
    return t >= tr.cuenta.desde - 200 ? 150 : 0
  }
  if (escena === 'pago') {
    if (t >= 21200) return 340
    if (t >= 18900) return 300
    if (t >= 17300) return 130
    return 0
  }
  return 0
}

// ── Línea de pasos ──────────────────────────────────────────────────────────
//
// Las cuatro tarjetas del home, al lado del teléfono y al ritmo de él. Solo se
// ve el paso en el que va el teléfono y los anteriores: el siguiente entra
// cuando le toca, así la columna cuenta la misma historia que la pantalla en
// vez de enseñarlo todo de golpe. Al volver a empezar la vuelta se recogen y
// vuelven a salir.
//
// Todo lo que se mueve es CSS sobre clases (visto, activo, hecho): el reloj
// solo decide qué clase lleva cada tarjeta, y las transiciones hacen el resto.

// Tramo del reloj que cubre cada tarjeta.
const TRAMOS_PASO = [[0, 7200], [7200, 15600], [15600, 26800], [26800, DURACION]]

const ICONOS_PASO = [
  <svg key="0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="18" rx="2.5" /><path strokeLinecap="round" d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01" /></svg>,
  <svg key="1" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.6" /><path strokeLinecap="round" d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>,
  <svg key="2" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>,
  <svg key="3" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6l7-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8.8 12.2l2.2 2.2 4.3-4.6" /></svg>,
]

function LineaDePasos({ pasos, t, onElegir }) {
  const activo = Math.max(0, TRAMOS_PASO.findIndex(([a, b]) => t >= a && t < b))
  const dentro = avance(t, TRAMOS_PASO[activo][0], TRAMOS_PASO[activo][1])
  const n = pasos.length
  // La línea llega hasta la insignia del paso activo y avanza con él hacia el
  // siguiente.
  const relleno = Math.min(1, (activo + Math.min(dentro, 0.92)) / Math.max(1, n - 1))

  return (
    <ol className="pasos-demo">
      <li aria-hidden="true" className="pasos-riel"><span className="pasos-relleno" style={{ transform: `scaleY(${relleno})` }} /></li>
      {pasos.map((s, i) => {
        const visto = i <= activo
        const hecho = i < activo
        const esActivo = i === activo
        const final = i === n - 1
        const clases = ['paso-demo', visto && 'visto', esActivo && 'activo', hecho && 'hecho', final && 'final'].filter(Boolean).join(' ')
        return (
          <li key={s.n}
            className={clases}
            role="button"
            tabIndex={visto ? 0 : -1}
            aria-hidden={!visto}
            aria-current={esActivo ? 'step' : undefined}
            onClick={() => { if (visto) onElegir(i) }}
            onKeyDown={e => { if (visto && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onElegir(i) } }}>
            <span className="paso-insignia">
              {hecho || final
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="paso-trazo" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                : s.n}
            </span>
            <div className="paso-cuerpo">
              <span className="paso-etiqueta">{final ? 'Final' : `Paso ${i + 1}`}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <span className="paso-barra"><span style={{ transform: `scaleX(${esActivo ? dentro : hecho ? 1 : 0})` }} /></span>
            </div>
            <span className="paso-icono">{ICONOS_PASO[i]}</span>
          </li>
        )
      })}
    </ol>
  )
}

const CSS_PASOS = `
  .como-wrap{--ancho:300px;--escala:${300 / ANCHO};display:grid;grid-template-columns:auto minmax(0,1fr);gap:64px;align-items:stretch;max-width:1000px;margin:0 auto;}
  @media(min-width:900px){.como-wrap{--ancho:330px;--escala:${330 / ANCHO};}}
  @media(max-width:360px){.como-wrap{--ancho:270px;--escala:${270 / ANCHO};}}
  .como-tel{display:flex;justify-content:center;align-items:center;}

  .pasos-demo{position:relative;list-style:none;margin:0;padding:6px 0;display:flex;flex-direction:column;justify-content:space-between;gap:16px;}
  .pasos-riel{position:absolute;left:47px;top:52px;bottom:52px;width:2px;border-radius:2px;background:rgba(255,255,255,.07);pointer-events:none;}
  .pasos-relleno{position:absolute;inset:0;border-radius:2px;transform-origin:top;background:linear-gradient(180deg,#38bdf8,#818cf8 60%,#4ade80);box-shadow:0 0 14px rgba(56,189,248,.55);transition:transform .25s linear;}

  .paso-demo{position:relative;z-index:1;overflow:hidden;display:flex;align-items:center;gap:18px;padding:20px 22px;border-radius:20px;cursor:default;
    background:rgb(9,17,44);border:1px solid rgba(255,255,255,.07);
    box-shadow:0 4px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);
    opacity:0;transform:translateX(56px) scale(.94);filter:blur(10px);
    transition:opacity .4s ease,transform .45s ease,filter .4s ease,border-color .45s,box-shadow .45s,background .45s;}
  .paso-demo.visto{cursor:pointer;opacity:1;transform:none;filter:none;
    transition:opacity .75s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1),filter .7s ease,border-color .45s,box-shadow .45s,background .45s;}
  /* Los hechos se atenúan por dentro y no con opacity en la tarjeta: con
     la tarjeta translúcida la línea vertical se veía pasar por encima. */
  .paso-demo.hecho .paso-cuerpo,.paso-demo.hecho .paso-icono{opacity:.72;transition:opacity .45s;}
  .paso-demo.hecho:hover .paso-cuerpo,.paso-demo.hecho:hover .paso-icono{opacity:1;}
  .paso-demo.visto.activo{transform:translateX(-8px);border-color:rgba(56,189,248,.55);
    background:linear-gradient(135deg,rgba(16,44,96,.95),rgba(8,22,60,.95));
    box-shadow:0 22px 50px rgba(56,189,248,.18),0 0 0 1px rgba(56,189,248,.18),inset 0 1px 0 rgba(125,211,252,.25);}
  .paso-demo.visto.final.activo{border-color:rgba(74,222,128,.55);box-shadow:0 22px 50px rgba(74,222,128,.18),0 0 0 1px rgba(74,222,128,.18),inset 0 1px 0 rgba(134,239,172,.25);}

  /* Destello que cruza la tarjeta al aparecer */
  .paso-demo::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:45%;pointer-events:none;
    background:linear-gradient(100deg,transparent,rgba(125,211,252,.16),transparent);transform:skewX(-18deg);opacity:0;}
  .paso-demo.visto::after{animation:pasoDestello 1.3s .25s cubic-bezier(.4,0,.2,1) both;}

  .paso-insignia{position:relative;width:52px;height:52px;flex-shrink:0;border-radius:15px;display:grid;place-items:center;
    font:700 19px 'JetBrains Mono',monospace;color:#061027;background:linear-gradient(135deg,#7dd3fc,#38bdf8);
    box-shadow:0 8px 22px rgba(56,189,248,.35),0 0 0 3px rgba(8,16,44,1);transition:background .45s,box-shadow .45s,color .45s;}
  .paso-demo.visto .paso-insignia{animation:pasoInsignia .75s cubic-bezier(.34,1.56,.64,1) .12s both;}
  .paso-demo.activo .paso-insignia::before{content:'';position:absolute;inset:-7px;border-radius:20px;border:2px solid rgba(56,189,248,.6);animation:pasoPulso 1.9s ease-out infinite;}
  .paso-demo.final.activo .paso-insignia::before{border-color:rgba(74,222,128,.6);}
  .paso-demo.hecho .paso-insignia,.paso-demo.final .paso-insignia{color:#fff;background:linear-gradient(135deg,#4ade80,#16a34a);box-shadow:0 8px 22px rgba(74,222,128,.35),0 0 0 3px rgba(8,16,44,1);}
  .paso-trazo{stroke-dasharray:24;stroke-dashoffset:24;}
  .paso-demo.visto .paso-trazo{animation:pasoTrazo .5s .35s cubic-bezier(.65,0,.35,1) forwards;}

  .paso-cuerpo{flex:1;min-width:0;}
  .paso-etiqueta{display:block;margin-bottom:3px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#38bdf8;}
  .paso-demo.final .paso-etiqueta{color:#4ade80;}
  .paso-cuerpo h3{margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;}
  .paso-cuerpo p{margin:0;font-size:13.5px;line-height:1.55;color:#9fb0d4;}
  .paso-barra{display:block;height:3px;margin-top:12px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,.07);opacity:0;transition:opacity .4s;}
  .paso-demo.activo .paso-barra{opacity:1;}
  .paso-barra>span{display:block;height:100%;transform-origin:left;background:linear-gradient(90deg,#38bdf8,#818cf8);transition:transform .2s linear;}
  .paso-demo.final .paso-barra>span{background:linear-gradient(90deg,#4ade80,#22c55e);}

  .paso-icono{width:42px;height:42px;flex-shrink:0;border-radius:12px;display:grid;place-items:center;color:#475569;
    background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);transition:color .45s,background .45s,border-color .45s,transform .6s cubic-bezier(.34,1.56,.64,1);}
  .paso-demo.activo .paso-icono{color:#7dd3fc;background:rgba(56,189,248,.1);border-color:rgba(56,189,248,.3);transform:rotate(-8deg) scale(1.08);}
  .paso-demo.final.activo .paso-icono{color:#86efac;background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.3);}

  @keyframes pasoInsignia{0%{transform:scale(.3) rotate(-25deg);opacity:0}100%{transform:none;opacity:1}}
  @keyframes pasoPulso{0%{transform:scale(.92);opacity:.9}100%{transform:scale(1.28);opacity:0}}
  @keyframes pasoTrazo{to{stroke-dashoffset:0}}
  @keyframes pasoDestello{0%{left:-60%;opacity:0}20%{opacity:1}100%{left:130%;opacity:0}}

  /* Sobre fondo claro: tarjetas blancas y texto azul oscuro. El teléfono se
     queda oscuro, que es como se ve un teléfono de verdad. */
  .seccion-clara .paso-demo{background:#fff;border-color:rgba(11,28,63,.1);box-shadow:0 6px 24px rgba(11,28,63,.08);}
  .seccion-clara .paso-demo.visto.activo{background:linear-gradient(135deg,#fff,#eef4ff);border-color:rgba(37,99,235,.45);
    box-shadow:0 20px 44px rgba(37,99,235,.16),0 0 0 1px rgba(37,99,235,.14);}
  .seccion-clara .paso-cuerpo h3{color:#0b1c3f;}
  .seccion-clara .paso-cuerpo p{color:#5b6f96;}
  .seccion-clara .paso-etiqueta{color:#2563eb;}
  .seccion-clara .paso-demo.final .paso-etiqueta{color:#15803d;}
  .seccion-clara .pasos-riel{background:rgba(11,28,63,.1);}
  .seccion-clara .paso-barra{background:rgba(11,28,63,.08);}
  .seccion-clara .paso-icono{color:#8fa0c0;background:rgba(11,28,63,.04);border-color:rgba(11,28,63,.08);}
  .seccion-clara .paso-insignia{box-shadow:0 8px 22px rgba(56,189,248,.35),0 0 0 3px #f2f6fd;}
  .seccion-clara .paso-demo.hecho .paso-insignia,.seccion-clara .paso-demo.final .paso-insignia{box-shadow:0 8px 22px rgba(74,222,128,.35),0 0 0 3px #f2f6fd;}
  .seccion-clara .paso-demo::after{background:linear-gradient(100deg,transparent,rgba(37,99,235,.10),transparent);}

  @media(max-width:768px){
    .como-wrap{grid-template-columns:1fr;gap:36px;}
    /* En móvil los pasos van debajo del teléfono y no hay alto que igualar:
       los que no han salido se pliegan en vez de guardar su hueco, y cada
       uno nuevo abre su sitio al entrar. */
    .pasos-demo{gap:0;justify-content:flex-start;}
    .paso-demo{padding:0 16px;gap:14px;max-height:0;margin-bottom:0;border-width:0;
      transition:opacity .35s ease,transform .4s ease,filter .35s ease,max-height .45s ease,padding .45s ease,margin .45s ease,border-width .45s;}
    .paso-demo.visto{padding:16px;max-height:220px;margin-bottom:12px;border-width:1px;
      transition:opacity .75s cubic-bezier(.16,1,.3,1) .15s,transform .9s cubic-bezier(.16,1,.3,1) .15s,filter .7s ease .15s,max-height .6s cubic-bezier(.16,1,.3,1),padding .6s cubic-bezier(.16,1,.3,1),margin .6s cubic-bezier(.16,1,.3,1),border-color .45s,box-shadow .45s,background .45s;}
    .paso-demo.visto.activo{transform:none;}
    .pasos-riel{left:41px;}
    .paso-insignia{width:48px;height:48px;font-size:17px;}
    .paso-icono{display:none;}
  }
  @media(prefers-reduced-motion:reduce){
    .paso-demo{opacity:1;transform:none;filter:none;transition:none;}
    .paso-demo *,.paso-demo::after,.paso-insignia::before{animation:none!important;}
    .paso-trazo{stroke-dashoffset:0;}
  }
`

// ── Componente ──────────────────────────────────────────────────────────────

export default function DemoEnvio({ pasos = [] }) {
  const [reloj, setReloj] = useState(0)          // ms totales desde el inicio
  const caja = useRef(null)
  const visible = useRef(false)

  const { data: cotizacion } = useQuery({
    queryKey: ['demo-envio-tasa'],
    queryFn: () => api.get('/rates/convert', {
      params: { from: 'CLP', to: 'VES', amount: MONTO, from_country: 'Chile', to_country: 'Venezuela' },
    }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  })
  const tasa = cotizacion?.rate || TASA_RESPALDO

  // Solo corre mientras se ve: fuera de pantalla sería gastar batería en una
  // animación que nadie mira.
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    let ultimo = performance.now()
    const id = setInterval(() => {
      const ahora = performance.now()
      const delta = Math.min(200, ahora - ultimo)
      ultimo = ahora
      if (visible.current && document.visibilityState === 'visible') setReloj(r => r + delta)
    }, 50)
    return () => clearInterval(id)
  }, [])

  // Saltar a un paso desde las tarjetas: se lleva el reloj al inicio de esa
  // escena dentro de la vuelta actual.
  const saltarA = (paso) =>
    setReloj(r => Math.floor(r / DURACION) * DURACION + INICIO_DE_PASO[paso])

  const vuelta = Math.floor(reloj / DURACION)
  const t = reloj % DURACION
  const d = datosDeEjemplo(vuelta)
  const escena = [...ESCENAS].reverse().find(e => t >= e.desde)

  const pasoApp = { destino: 0, calcular: 1, receptor: 2, pago: 3, confirmar: 4, listo: 5 }[escena.id]

  let pantalla
  if (escena.id === 'destino') pantalla = <PantallaDestino t={t} d={d} />
  else if (escena.id === 'calcular') pantalla = <PantallaCalcular t={t} tasa={tasa} />
  else if (escena.id === 'receptor') pantalla = <PantallaReceptor t={t} d={d} />
  else if (escena.id === 'pago') pantalla = <PantallaPago t={t} d={d} />
  else if (escena.id === 'confirmar') pantalla = <PantallaConfirmar t={t} d={d} tasa={tasa} />
  else pantalla = <PantallaListo t={t} d={d} />

  const telefono = (
    <div ref={caja} className="demo-tel" aria-label="Vista previa de un envío en el celular">
      <style>{`
        .demo-tel{flex-shrink:0;}
        @keyframes demoToque{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
        @keyframes demoCursor{50%{opacity:0}}
        @keyframes demoEntra{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes demoBaja{from{opacity:0;transform:translateY(-120%)}to{opacity:1;transform:none}}
        @keyframes demoSalta{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
      `}</style>

      {/* El marco del teléfono */}
      <div style={{
        position: 'relative', padding: 10, borderRadius: 46,
        background: 'linear-gradient(145deg,#1b2440,#0a1024)',
        border: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 30px 80px rgba(0,6,28,.7), 0 0 0 2px rgba(56,189,248,.08), inset 0 1px 0 rgba(255,255,255,.12)',
      }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 37,
          width: 'var(--ancho)', height: `calc(${ALTO}px * var(--escala))`,
          background: 'radial-gradient(420px 300px at 80% -10%,rgba(37,99,235,.35),transparent 60%),#050b1f',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: ANCHO, height: ALTO, transform: 'scale(var(--escala))', transformOrigin: 'top left' }}>
            {/* Barra de estado y la isla */}
            <div style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontSize: 14, fontWeight: 600, color: '#fff' }}>
              <span>9:41</span>
              <span style={{ position: 'absolute', left: '50%', top: 10, width: 104, height: 28, marginLeft: -52, borderRadius: 999, background: '#000' }} />
              <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
                <span style={{ letterSpacing: -1 }}>▂▄▆</span>
                <span style={{ width: 22, height: 11, borderRadius: 3, border: '1.5px solid #fff', position: 'relative' }}>
                  <span style={{ position: 'absolute', inset: 1.5, right: 5, borderRadius: 1, background: '#fff' }} />
                </span>
              </span>
            </div>

            {/* Cabecera de la aplicación */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 12px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)' }}>KG</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#eaf2ff' }}>Ksa Global</span>
              <span style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#38bdf8,#818cf8)' }} />
            </div>

            <div style={{ position: 'absolute', top: 95, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
              {/* Dos capas: la de fuera entra con animación y la de dentro se
                  desplaza. En una sola, el transform final de la animación
                  pisaba el desplazamiento y la pantalla no bajaba nunca. */}
              <div key={escena.id} style={{ animation: 'demoEntra .35s ease-out both' }}>
              <div style={{
                padding: '16px 18px 40px',
                transform: `translateY(-${desplazamiento(escena.id, t, d)}px)`,
                transition: 'transform .7s cubic-bezier(.4,0,.2,1)',
              }}>
                {escena.id !== 'listo' && (
                  <>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#eaf2ff' }}>Nueva transferencia</p>
                    <p style={{ margin: '2px 0 14px', fontSize: 12.5, color: '#8aa0cc' }}>Envía dinero de forma rápida y segura</p>
                    <Stepper actual={pasoApp} />
                  </>
                )}
                <div style={escena.id !== 'listo' ? tarjeta : undefined}>
                  {pantalla}
                </div>
              </div>
              </div>
            </div>

            {/* Indicador de inicio */}
            <span style={{ position: 'absolute', bottom: 8, left: '50%', width: 120, height: 4, marginLeft: -60, borderRadius: 4, background: 'rgba(255,255,255,.55)' }} />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="como-wrap">
      <style>{CSS_PASOS}</style>
      <div className="como-tel">{telefono}</div>
      <LineaDePasos pasos={pasos} t={t} onElegir={saltarA} />
    </div>
  )
}
