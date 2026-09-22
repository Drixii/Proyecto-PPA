import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Actualización sola, sin botón.
//
// Esto ha pasado por los dos extremos. Primero el service worker recargaba en
// cuanto había versión nueva, y la web se reiniciaba en mitad de lo que uno
// estuviera haciendo. Después se puso un botón "Actualizar", y el problema fue
// el contrario: la gente lo ignoraba y seguía días con una versión vieja,
// viendo errores ya arreglados.
//
// Ahora se actualiza sola pero mirando qué está haciendo la persona: si hay un
// formulario a medio rellenar o una ventana abierta, espera —a que cambie de
// pantalla, a que cierre lo que tenga abierto, o a que vuelva a la pestaña— y
// entonces recarga. Al volver, un aviso de tres segundos dice qué pasó, para
// que una recarga inesperada no parezca un fallo.

const MARCA = 'ksa-recien-actualizada'

// Si hay algo que se perdería al recargar.
//
// Un dato escrito a mano es trabajo de verdad: una cuenta bancaria, un
// documento, un monto. Las casillas de búsqueda no cuentan —se vuelven a
// escribir en dos segundos— y una ventana abierta sí, porque casi siempre es
// un pago o una confirmación a medias.
function hayTrabajoAMedias() {
  try {
    if (document.querySelector('.fixed.inset-0')) return true

    const campos = document.querySelectorAll('input, textarea')
    for (const campo of campos) {
      const tipo = (campo.type || '').toLowerCase()
      if (tipo === 'hidden' || tipo === 'checkbox' || tipo === 'radio' || tipo === 'submit') continue
      const nombre = `${campo.name || ''} ${campo.placeholder || ''} ${campo.className || ''}`.toLowerCase()
      if (nombre.includes('buscar') || nombre.includes('search')) continue
      if ((campo.value || '').trim().length > 2) return true
    }
  } catch { /* ante la duda, se actualiza */ }
  return false
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
  const yaVa = useRef(false)
  const [esperando, setEsperando] = useState(false)
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

  useEffect(() => {
    if (!hayVersionNueva || yaVa.current) return

    const intentar = async () => {
      if (yaVa.current) return
      if (hayTrabajoAMedias()) { setEsperando(true); return }
      yaVa.current = true

      try { sessionStorage.setItem(MARCA, '1') } catch { /* da igual */ }
      try { await updateServiceWorker(true) } catch { /* se recarga igual */ }

      // Red de seguridad: a veces no hay ningún service worker esperando —ya
      // activó, o el aviso venía de una comprobación anterior— y la recarga no
      // llega nunca. Se vacían las cachés y se recarga a mano; vaciarlas
      // importa, porque si no se vuelven a servir los mismos archivos viejos.
      setTimeout(async () => {
        try {
          if (window.caches) {
            const nombres = await caches.keys()
            await Promise.all(nombres.map(n => caches.delete(n)))
          }
        } catch { /* si no deja borrarlas, se recarga igual */ }
        window.location.reload()
      }, 1500)
    }

    intentar()

    // Y si había trabajo a medias, se vuelve a mirar cuando cambie algo:
    // al volver a la pestaña o cada pocos segundos, por si cerró la ventana.
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }
    document.addEventListener('visibilitychange', alVolver)
    const reloj = setInterval(intentar, 8000)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(reloj)
    }
    // location: cambiar de pantalla es el momento perfecto —lo que se estaba
    // rellenando ya se envió o se abandonó.
  }, [hayVersionNueva, location.pathname, updateServiceWorker])

  if (!reciénActualizada && !esperando) return null

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 9998,
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '11px 15px', borderRadius: 14, maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(8,16,44,.95)',
      border: `1px solid ${reciénActualizada ? 'rgba(74,222,128,.35)' : 'rgba(56,189,248,.28)'}`,
      boxShadow: '0 12px 34px rgba(0,6,28,.55)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      animation: 'ksaSube .35s cubic-bezier(.16,1,.3,1)',
    }}>
      <style>{`
        @keyframes ksaSube{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(prefers-reduced-motion:reduce){@keyframes ksaSube{from{opacity:0}to{opacity:1}}}
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
            animation: 'spin .8s linear infinite',
          }} />
          <span style={{ fontSize: 12.5, color: '#c3d2ee' }}>
            Versión nueva lista — se aplica al terminar esto
          </span>
        </>
      )}
    </div>
  )
}
