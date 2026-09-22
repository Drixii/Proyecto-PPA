import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Actualización sola, sin botón.
//
// Esto pasó por tres versiones. Primero el service worker recargaba por su
// cuenta en cuanto había un despliegue, y la web se reiniciaba en mitad de lo
// que uno estuviera haciendo. Después un botón "Actualizar", que nadie
// pulsaba: la gente seguía días con una versión vieja viendo errores ya
// arreglados. Después el aviso automático del propio service worker, que en
// pruebas no llegaba a dispararse: depende de que el navegador decida que hay
// un worker «esperando», y eso no se puede provocar ni comprobar con
// fiabilidad.
//
// Ahora es una cosa sola y verificable: cada build publica `version.json`, la
// web lo mira cada minuto y, si cambió, es que hay versión nueva. Solo se ve
// el final —una cuenta atrás de cuatro segundos y, al volver, "Web
// actualizada"—, porque que haya una versión esperando es asunto nuestro, no
// de quien está usando la web.

const MARCA = 'ksa-recien-actualizada'
const CUENTA_ATRAS = 4          // segundos de aviso antes de recargar
const CADA = 60_000             // cada cuánto se mira si hay versión nueva
const ESPERA_MAXIMA = 90_000    // tras esto se actualiza aunque estorbe

// Si ahora mismo se perdería algo al recargar.
//
// Mira dos cosas y solo dos: que haya una ventana abierta —casi siempre un
// pago o una confirmación a medias— o que el cursor esté dentro de un campo,
// es decir, que la persona esté escribiendo en este instante.
//
// Una versión anterior miraba si CUALQUIER casilla tenía texto, y eso no
// funcionaba: la calculadora de la portada siempre lleva un monto escrito, así
// que la actualización no llegaba nunca y el cartel se quedaba dando vueltas.
// Un campo con algo escrito pero sin el cursor dentro no es trabajo en curso:
// es una pantalla que quedó abierta.
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

async function versionPublicada() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const d = await r.json()
    return d?.build || null
  } catch {
    return null   // sin red; se vuelve a mirar dentro de un minuto
  }
}

export default function AvisoActualizacion() {
  const location = useLocation()
  const mia = useRef(null)          // la versión con la que arrancó esta pestaña
  const hayNueva = useRef(false)
  const lanzado = useRef(false)
  const desde = useRef(0)
  const [quedan, setQuedan] = useState(null)        // null = sin cuenta atrás
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

  // Mirar si cambió la versión publicada, y decidir cuándo recargar.
  useEffect(() => {
    let vivo = true

    const arrancar = () => {
      if (lanzado.current || !hayNueva.current) return
      const urge = desde.current && Date.now() - desde.current > ESPERA_MAXIMA
      if (estorba() && !urge) return
      lanzado.current = true
      setQuedan(CUENTA_ATRAS)
    }

    const mirar = async () => {
      if (!vivo || lanzado.current) return
      if (hayNueva.current) { arrancar(); return }

      const publicada = await versionPublicada()
      if (!vivo || !publicada) return

      // La primera lectura solo sirve para saber con qué versión se abrió esta
      // pestaña; no hay nada que actualizar todavía.
      if (mia.current === null) { mia.current = publicada; return }

      if (publicada !== mia.current) {
        hayNueva.current = true
        desde.current = Date.now()
        arrancar()
      }
    }

    mirar()
    const reloj = setInterval(mirar, CADA)
    // Y también al volver a la pestaña o al cambiar de pantalla: son los dos
    // momentos en que se puede recargar sin cortarle nada a nadie.
    const alVolver = () => { if (document.visibilityState === 'visible') mirar() }
    document.addEventListener('visibilitychange', alVolver)
    const reintento = setInterval(arrancar, 3000)

    return () => {
      vivo = false
      clearInterval(reloj)
      clearInterval(reintento)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [location.pathname])

  // La cuenta atrás y la recarga.
  useEffect(() => {
    if (quedan === null) return

    if (quedan > 0) {
      const t = setTimeout(() => setQuedan(q => q - 1), 1000)
      return () => clearTimeout(t)
    }

    let cancelado = false
    ;(async () => {
      try { sessionStorage.setItem(MARCA, '1') } catch { /* da igual */ }

      // Vaciar las cachés es lo que hace que la recarga sirva de algo: el
      // service worker guarda la aplicación entera y, sin esto, volvería a
      // servir exactamente los mismos archivos viejos.
      try {
        if (window.caches) {
          const nombres = await caches.keys()
          await Promise.all(nombres.map(n => caches.delete(n)))
        }
      } catch { /* si no deja borrarlas, se recarga igual */ }

      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
        await Promise.all(regs.map(r => r.update().catch(() => {})))
      } catch { /* idem */ }

      if (!cancelado) window.location.reload()
    })()

    return () => { cancelado = true }
  }, [quedan])

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
