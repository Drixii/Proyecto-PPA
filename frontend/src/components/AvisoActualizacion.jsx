import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Actualización sola, sin botón.
//
// Esto pasó por los dos extremos. Primero el service worker recargaba en
// cuanto había versión nueva, y la web se reiniciaba en mitad de lo que uno
// estuviera haciendo. Después un botón "Actualizar", que nadie pulsaba: la
// gente seguía días con una versión vieja viendo errores ya arreglados.
//
// Ahora se actualiza sola y solo se ve el final: una cuenta atrás de cuatro
// segundos —"Actualizando… 4"— y al volver, "Web actualizada". Mientras tanto
// no se enseña nada; que una versión esté esperando es asunto nuestro, no de
// quien está usando la web.
//
// Lo único que la retrasa es estar escribiendo o tener una ventana abierta, y
// aun así no indefinidamente: pasado un minuto y medio se actualiza igual.

const MARCA = 'ksa-recien-actualizada'
const CUENTA_ATRAS = 4          // segundos de aviso antes de recargar
const ESPERA_MAXIMA = 90_000    // tras esto se actualiza aunque estorbe

// Si ahora mismo se perdería algo al recargar.
//
// Mira dos cosas, y solo dos: que haya una ventana abierta —casi siempre un
// pago o una confirmación a medias— o que el cursor esté dentro de un campo,
// es decir, que la persona esté escribiendo en este instante.
//
// La primera versión miraba si CUALQUIER casilla tenía texto, y eso no
// funcionaba: la calculadora de la portada siempre lleva un monto escrito, así
// que la actualización no llegaba nunca y el cartel se quedaba dando vueltas
// para siempre. Un campo con algo escrito pero sin el cursor dentro no es
// trabajo en curso: es una pantalla que quedó abierta.
function estorba() {
  try {
    if (document.querySelector('.fixed.inset-0')) return true

    const activo = document.activeElement
    if (!activo) return false
    const etiqueta = (activo.tagName || '').toLowerCase()
    if (etiqueta !== 'input' && etiqueta !== 'textarea') return false

    const tipo = (activo.type || '').toLowerCase()
    if (tipo === 'checkbox' || tipo === 'radio' || tipo === 'submit') return false
    return true
  } catch {
    return false   // ante la duda, se actualiza
  }
}

export default function AvisoActualizacion() {
  const {
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(e) { console.warn('[sw] no se pudo registrar', e) },

    // Sin esto, una versión nueva podía tardar horas en notarse: el service
    // worker solo comprueba al arrancar, y una app instalada en el teléfono no
    // arranca casi nunca —se queda en segundo plano y se vuelve a ella—. Se
    // mira cada cinco minutos y cada vez que se vuelve a la pantalla.
    onRegisteredSW(url, registro) {
      if (!registro) return
      const mirar = () => {
        if (navigator.onLine === false) return
        registro.update().catch(() => { /* sin red; ya se reintenta */ })
      }
      setInterval(mirar, 5 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') mirar()
      })
    },
  })

  const location = useLocation()
  const lanzado = useRef(false)
  const desde = useRef(0)
  const [quedan, setQuedan] = useState(null)        // null = no hay cuenta atrás
  const [reciénActualizada, setReciénActualizada] = useState(false)

  // Al volver de la recarga: el cartel de que todo fue bien.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(MARCA)) {
        sessionStorage.removeItem(MARCA)
        setReciénActualizada(true)
        setTimeout(() => setReciénActualizada(false), 3500)
      }
    } catch { /* modo privado */ }
  }, [])

  // Decidir cuándo toca.
  useEffect(() => {
    if (!hayVersionNueva || lanzado.current) return
    if (!desde.current) desde.current = Date.now()

    const intentar = () => {
      if (lanzado.current) return
      const urge = Date.now() - desde.current > ESPERA_MAXIMA
      if (estorba() && !urge) return
      lanzado.current = true
      setQuedan(CUENTA_ATRAS)
    }

    intentar()
    const reloj = setInterval(intentar, 3000)
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
    }
    // location: cambiar de pantalla es buen momento —lo que se estaba
    // rellenando ya se envió o se abandonó.
  }, [hayVersionNueva, location.pathname])

  // La cuenta atrás, y la recarga al llegar a cero.
  useEffect(() => {
    if (quedan === null) return

    if (quedan > 0) {
      const t = setTimeout(() => setQuedan(q => q - 1), 1000)
      return () => clearTimeout(t)
    }

    let cancelado = false
    ;(async () => {
      try { sessionStorage.setItem(MARCA, '1') } catch { /* da igual */ }
      try { await updateServiceWorker(true) } catch { /* se recarga igual */ }

      // Red de seguridad: a veces no hay ningún service worker esperando —ya
      // activó, o el aviso venía de una comprobación anterior— y la recarga
      // que hace updateServiceWorker no llega nunca. Se vacían las cachés y se
      // recarga a mano; vaciarlas importa, porque si no se vuelven a servir
      // los mismos archivos viejos y la web se queda igual que estaba.
      setTimeout(async () => {
        if (cancelado) return
        try {
          if (window.caches) {
            const nombres = await caches.keys()
            await Promise.all(nombres.map(n => caches.delete(n)))
          }
        } catch { /* si no deja borrarlas, se recarga igual */ }
        window.location.reload()
      }, 1200)
    })()

    return () => { cancelado = true }
  }, [quedan, updateServiceWorker])

  const enCuenta = quedan !== null
  if (!reciénActualizada && !enCuenta) return null

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 9998,
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '11px 15px', borderRadius: 14, maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(8,16,44,.95)',
      border: `1px solid ${reciénActualizada ? 'rgba(74,222,128,.35)' : 'rgba(56,189,248,.3)'}`,
      boxShadow: '0 12px 34px rgba(0,6,28,.55)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      animation: 'ksaSube .3s cubic-bezier(.16,1,.3,1)',
    }}>
      <style>{`
        @keyframes ksaSube{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes ksaGira{to{transform:rotate(360deg)}}
        @media(prefers-reduced-motion:reduce){
          @keyframes ksaSube{from{opacity:0}to{opacity:1}}
        }
      `}</style>

      {reciénActualizada ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#eaf2ff' }}>Web actualizada</span>
        </>
      ) : (
        <>
          <span style={{
            width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
            border: '2px solid rgba(56,189,248,.35)', borderTopColor: '#38bdf8',
            animation: 'ksaGira .8s linear infinite',
          }} />
          <span style={{ fontSize: 12.5, color: '#c3d2ee' }}>
            Actualizando{quedan > 0 ? `… ${quedan}` : '…'}
          </span>
        </>
      )}
    </div>
  )
}
