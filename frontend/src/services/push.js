import api from './api'

// Alta del navegador en las notificaciones del sistema.
//
// En iPhone solo funcionan si la web está instalada en la pantalla de inicio;
// Safari no se las da a una pestaña suelta. En Android y en escritorio no hace
// falta instalar nada. `puedeNotificar` distingue los dos casos para no pedir
// un permiso que el navegador va a negar igualmente.

export function puedeNotificar() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

export function permisoActual() {
  return puedeNotificar() ? Notification.permission : 'unsupported'
}

// La clave VAPID viaja en base64url y PushManager la quiere en bytes.
function aBytes(base64url) {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const crudo = atob(base64)
  return Uint8Array.from(crudo, c => c.charCodeAt(0))
}

/**
 * Pide permiso si hace falta y registra este navegador en el servidor.
 * Devuelve true solo si quedó suscrito.
 *
 * No lanza nunca: quedarse sin notificaciones no puede romper el registro ni
 * el envío que la persona esté haciendo.
 */
export async function activarNotificaciones({ pedirPermiso = true } = {}) {
  if (!puedeNotificar()) return false

  try {
    const { data } = await api.get('/notifications/push/clave')
    const { clave, activo } = data.data || {}
    if (!activo || !clave) return false      // el servidor no las tiene puestas

    let permiso = Notification.permission
    if (permiso === 'default' && pedirPermiso) permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return false

    const registro = await navigator.serviceWorker.ready
    // Si ya había una suscripción se reutiliza: pedir otra al mismo navegador
    // devuelve un endpoint distinto y quedarían dos, con el aviso duplicado.
    const suscripcion = await registro.pushManager.getSubscription()
      || await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: aBytes(clave),
      })

    await api.post('/notifications/push/suscribir', suscripcion.toJSON())
    return true
  } catch (e) {
    console.warn('[push] no se pudo activar', e)
    return false
  }
}

export async function desactivarNotificaciones() {
  if (!puedeNotificar()) return
  try {
    const registro = await navigator.serviceWorker.ready
    const suscripcion = await registro.pushManager.getSubscription()
    if (!suscripcion) return
    await api.delete('/notifications/push/suscribir', {
      params: { endpoint: suscripcion.endpoint },
    })
    await suscripcion.unsubscribe()
  } catch (e) {
    console.warn('[push] no se pudo desactivar', e)
  }
}

/**
 * Vuelve a registrar el navegador al abrir sesión.
 *
 * Hace falta porque la suscripción vive en el navegador y la fila en la base:
 * si el permiso ya estaba dado pero la fila se borró —cuenta nueva, base
 * reiniciada, suscripción caducada—, sin esto los avisos dejan de llegar y
 * nadie se entera, porque el navegador sigue diciendo que tiene permiso.
 *
 * No pide permiso: solo revalida el que ya hubiera.
 */
export function revalidarNotificaciones() {
  if (permisoActual() !== 'granted') return
  activarNotificaciones({ pedirPermiso: false })
}
