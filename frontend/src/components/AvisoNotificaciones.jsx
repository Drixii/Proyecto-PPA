import { useEffect, useState } from 'react'
import { activarNotificaciones, permisoActual, puedeNotificar } from '../services/push'

// Aviso para activar las notificaciones del teléfono.
//
// El permiso solo se pedía al crear la cuenta. Quien ya tenía cuenta, o
// instaló la app después, nunca veía la pregunta y no recibía nada, aunque el
// servidor enviara los avisos: no había ningún teléfono suscrito. Aquí se
// ofrece desde el panel, con un botón, porque el navegador —Safari sobre
// todo— solo deja pedir el permiso como respuesta a un toque.
//
// Al montar, si el permiso ya estaba dado, se vuelve a registrar el teléfono
// en silencio: una app instalada puede pasar semanas sin pasar por el inicio
// de sesión, que era el único sitio donde se revalidaba.

const CLAVE_POSPUESTO = 'ksa_aviso_notif_pospuesto'
const DIAS_POSPUESTO = 7

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

function pospuesto() {
  try {
    const t = Number(localStorage.getItem(CLAVE_POSPUESTO) || 0)
    return Date.now() - t < DIAS_POSPUESTO * 86400000
  } catch { return false }
}

export default function AvisoNotificaciones() {
  const [modo, setModo] = useState(null)       // 'pedir' | 'instalar-ios' | 'listo'
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    const permiso = permisoActual()
    if (permiso === 'granted') {
      activarNotificaciones({ pedirPermiso: false })
      return
    }
    if (pospuesto()) return
    if (permiso === 'default') { setModo('pedir'); return }
    // iPhone en Safari, sin instalar: el navegador no ofrece notificaciones.
    if (permiso === 'unsupported' && esIOS() && !instalada()) setModo('instalar-ios')
  }, [])

  if (!modo) return null

  const posponer = () => {
    try { localStorage.setItem(CLAVE_POSPUESTO, String(Date.now())) } catch { /* sin almacenamiento */ }
    setModo(null)
  }

  const activar = async () => {
    setOcupado(true)
    const ok = await activarNotificaciones()
    setOcupado(false)
    if (ok) {
      setModo('listo')
      setTimeout(() => setModo(null), 3500)
    } else if (permisoActual() === 'denied') {
      posponer()
    }
  }

  return (
    <div className="aviso-notif" role="dialog" aria-live="polite">
      <style>{`
        .aviso-notif{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:9990;
          width:min(380px,calc(100vw - 32px));box-sizing:border-box;padding:16px 16px 14px;border-radius:18px;
          background:rgba(8,16,44,.97);border:1px solid rgba(56,189,248,.3);box-shadow:0 18px 50px rgba(0,4,20,.6);
          backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:'Space Grotesk',system-ui,sans-serif;
          animation:avisoNotifSube .5s cubic-bezier(.16,1,.3,1) both;}
        @keyframes avisoNotifSube{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
        .aviso-notif-fila{display:flex;gap:12px;align-items:flex-start;}
        .aviso-notif-icono{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:grid;place-items:center;font-size:18px;
          background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.3);}
        .aviso-notif b{display:block;font-size:14px;color:#eaf2ff;margin-bottom:3px;}
        .aviso-notif p{margin:0;font-size:12.5px;line-height:1.5;color:#9fb0d4;}
        .aviso-notif-botones{display:flex;gap:8px;margin-top:12px;justify-content:flex-end;}
        .aviso-notif button{padding:8px 14px;border-radius:10px;font:700 12.5px 'Space Grotesk',system-ui,sans-serif;cursor:pointer;}
        .aviso-notif .secundario{background:transparent;border:1px solid rgba(255,255,255,.12);color:#8aa0cc;}
        .aviso-notif .primario{border:none;color:#061027;background:linear-gradient(135deg,#7dd3fc,#38bdf8);}
        @media(max-width:520px){.aviso-notif{left:12px;right:12px;width:auto;}}
      `}</style>

      {modo === 'listo' ? (
        <div className="aviso-notif-fila">
          <span className="aviso-notif-icono">✅</span>
          <div><b>Notificaciones activadas</b><p>Te avisaremos en este dispositivo cada vez que tu envío cambie de estado.</p></div>
        </div>
      ) : modo === 'instalar-ios' ? (
        <>
          <div className="aviso-notif-fila">
            <span className="aviso-notif-icono">📲</span>
            <div>
              <b>Recibe avisos en tu iPhone</b>
              <p>Instala la app: toca <strong style={{ color: '#7dd3fc' }}>Compartir</strong> y luego <strong style={{ color: '#7dd3fc' }}>Añadir a pantalla de inicio</strong>. Ábrela desde ahí para activar las notificaciones.</p>
            </div>
          </div>
          <div className="aviso-notif-botones">
            <button className="secundario" onClick={posponer}>Entendido</button>
          </div>
        </>
      ) : (
        <>
          <div className="aviso-notif-fila">
            <span className="aviso-notif-icono">🔔</span>
            <div>
              <b>Activa las notificaciones</b>
              <p>Te avisamos al instante cuando tu envío cambie de estado, aunque tengas la app cerrada.</p>
            </div>
          </div>
          <div className="aviso-notif-botones">
            <button className="secundario" onClick={posponer} disabled={ocupado}>Ahora no</button>
            <button className="primario" onClick={activar} disabled={ocupado}>{ocupado ? 'Activando…' : 'Activar'}</button>
          </div>
        </>
      )}
    </div>
  )
}
