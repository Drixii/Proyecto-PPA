import { useRegisterSW } from 'virtual:pwa-register/react'

// Aviso de versión nueva.
//
// Antes esto no existía porque el service worker estaba en `autoUpdate`, que
// llama a location.reload() él solo en cuanto detecta un despliegue nuevo. El
// efecto era una web que parpadeaba y volvía a empezar en mitad de lo que uno
// estuviera haciendo — y en un formulario a medio rellenar eso es perder el
// trabajo, no un parpadeo.
//
// Ahora la versión nueva se queda esperando y se avisa aquí. Quien quiera la
// toma en el momento; quien no, la recibe igual la próxima vez que abra la
// web. Nadie pierde nada por sorpresa.
export default function AvisoActualizacion() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(e) { console.warn('[sw] no se pudo registrar', e) },

    // Sin esto, una versión nueva podía tardar horas en notarse: el service
    // worker solo comprueba al arrancar, y una app instalada en el teléfono no
    // arranca casi nunca —se queda en segundo plano y se vuelve a ella—. Se
    // mira cada media hora y cada vez que se vuelve a la pantalla.
    onRegisteredSW(url, registro) {
      if (!registro) return
      const mirar = () => {
        if (navigator.onLine === false) return
        registro.update().catch(() => { /* sin red; ya se reintenta */ })
      }
      setInterval(mirar, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') mirar()
      })
    },
  })

  if (!hayVersionNueva) return null

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 9998,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 14, maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(8,16,44,.95)', border: '1px solid rgba(56,189,248,.28)',
      boxShadow: '0 12px 34px rgba(0,6,28,.55)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    }}>
      <span style={{ fontSize: 12.5, color: '#c3d2ee' }}>Hay una versión nueva</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          padding: '7px 14px', borderRadius: 10, border: 'none', fontSize: 12.5,
          fontWeight: 700, cursor: 'pointer', color: '#061027',
          background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)',
        }}>
        Actualizar
      </button>
      <button
        onClick={() => setHayVersionNueva(false)}
        title="Ahora no"
        style={{
          padding: '7px 10px', borderRadius: 10, fontSize: 12.5, cursor: 'pointer',
          background: 'transparent', border: '1px solid rgba(255,255,255,.12)',
          color: '#8aa0cc',
        }}>
        ✕
      </button>
    </div>
  )
}
