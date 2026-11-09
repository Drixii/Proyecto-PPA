import { useEffect, useRef, useState } from 'react'

// Botón flotante para instalar la app.
//
// Antes vivía dentro del inicio, así que quien abría la web con la sesión ya
// empezada —y cae directo en su panel— no veía nunca cómo instalarla. Ahora
// se monta una sola vez en App y acompaña a todas las pantallas.
//
// Sale siempre que la app NO esté instalada, y vuelve a salir si la persona
// la borra del teléfono: la respuesta se calcula en cada carga y no se guarda
// en ninguna parte, así que no hay nada que «recuerde» una instalación que ya
// no existe.

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

// Abierta como app: Android y escritorio lo dicen con display-mode, Safari
// con su propia bandera.
const abiertaComoApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
  window.navigator.standalone === true

export default function BotonInstalar() {
  const prompt = useRef(null)
  const [instalada, setInstalada] = useState(abiertaComoApp)
  const [puedeInstalar, setPuedeInstalar] = useState(false)
  const [movil, setMovil] = useState(() => window.matchMedia?.('(max-width: 768px)').matches === true)
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    // Chrome solo ofrece la instalación cuando la app todavía no está
    // instalada: que dispare esto es la prueba más fiable de que no la tiene.
    const alOfrecer = (e) => {
      e.preventDefault()
      prompt.current = e
      setPuedeInstalar(true)
      setInstalada(false)
    }
    const alInstalar = () => {
      prompt.current = null
      setPuedeInstalar(false)
      setInstalada(true)
      setAyuda(false)
    }
    window.addEventListener('beforeinstallprompt', alOfrecer)
    window.addEventListener('appinstalled', alInstalar)

    const mqApp = window.matchMedia?.('(display-mode: standalone)')
    const mqMovil = window.matchMedia?.('(max-width: 768px)')
    const verApp = () => setInstalada(abiertaComoApp())
    const verMovil = (e) => setMovil(e.matches)
    mqApp?.addEventListener?.('change', verApp)
    mqMovil?.addEventListener?.('change', verMovil)

    // Aquí se consultaba `getInstalledRelatedApps()` para esconder el botón
    // cuando la app ya estaba instalada aunque se abriera en una pestaña
    // normal. Se quitó: esa respuesta tarda en ponerse al día cuando la app
    // se desinstala, y el resultado era el peor de los dos: quien la borraba
    // del teléfono no encontraba cómo volver a instalarla.
    //
    // Ahora solo se esconde cuando de verdad se está DENTRO de la app. Que
    // sobre un botón a quien ya la tiene es molestia menor; que falte a quien
    // no la tiene es no poder instalarla.

    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer)
      window.removeEventListener('appinstalled', alInstalar)
      mqApp?.removeEventListener?.('change', verApp)
      mqMovil?.removeEventListener?.('change', verMovil)
    }
  }, [])

  // En el teléfono sale siempre: el iPhone no avisa nunca de que se puede
  // instalar y hay que explicar el camino a mano. En el escritorio, solo
  // cuando el navegador lo ofrece, para no plantar un botón encima de las
  // tablas de los paneles sin que sirva para nada.
  if (instalada || (!movil && !puedeInstalar)) return null

  const instalar = async () => {
    if (prompt.current) {
      prompt.current.prompt()
      const r = await prompt.current.userChoice
      prompt.current = null
      setPuedeInstalar(false)
      if (r?.outcome === 'accepted') setInstalada(true)
      return
    }
    setAyuda((a) => !a)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        right: 14,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      {ayuda && (
        <div style={{ background: 'rgba(8,16,44,.97)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 14, padding: '12px 14px', maxWidth: 220, fontSize: 13, color: '#aebfe2', lineHeight: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          {esIOS()
            ? <>En Safari: toca <strong style={{ color: '#38bdf8' }}>Compartir</strong> → <strong style={{ color: '#38bdf8' }}>Añadir a pantalla de inicio</strong></>
            : <>En Chrome: toca los <strong style={{ color: '#38bdf8' }}>3 puntos</strong> (⋮) → <strong style={{ color: '#38bdf8' }}>Instalar aplicación</strong></>
          }
        </div>
      )}
      <button
        onClick={instalar}
        aria-label="Instalar app"
        title="Instalar app"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 42, padding: 0,
          background: 'linear-gradient(135deg,#1d4ed8,#38bdf8)',
          color: '#fff', border: 'none', borderRadius: '50%',
          boxShadow: '0 6px 18px rgba(56,189,248,.45)',
          cursor: 'pointer',
        }}
      >
        <svg width="19" height="19" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
    </div>
  )
}
