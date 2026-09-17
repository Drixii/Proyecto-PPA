// El envío que alguien empezó a calcular en la portada antes de tener sesión.
//
// Escribe 20.000 CLP a Colombia en la calculadora del home, pulsa «Comienza tu
// envío» y le toca registrarse. Sin esto, al terminar el registro aterrizaba
// en el panel y tenía que volver a escribirlo todo: justo en el momento en que
// ya había decidido enviar.
//
// Se guarda en sessionStorage, no en localStorage: dura lo que la pestaña. Si
// alguien calcula hoy y se registra la semana que viene, no debe encontrarse
// una transferencia a medio hacer que ya no recuerda. Por lo mismo caduca a la
// hora aunque la pestaña siga abierta.

const CLAVE = 'ksa_envio_pendiente'
const VIGENCIA_MS = 60 * 60 * 1000

export function guardarEnvioPendiente(envio) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ ...envio, guardado: Date.now() }))
  } catch { /* sin almacenamiento: se pierde el atajo, no el registro */ }
}

// Lo devuelve una sola vez y lo borra: un envío ya retomado no debe volver a
// aparecer en el siguiente inicio de sesión.
export function tomarEnvioPendiente() {
  try {
    const crudo = sessionStorage.getItem(CLAVE)
    if (!crudo) return null
    sessionStorage.removeItem(CLAVE)
    const envio = JSON.parse(crudo)
    if (!envio?.amount || Date.now() - (envio.guardado || 0) > VIGENCIA_MS) return null
    return envio
  } catch {
    return null
  }
}

// Estado con el que se abre /new-transfer desde la calculadora: directo al
// paso de calcular, como destinatario nuevo y con los montos ya puestos.
export function estadoNuevaTransferencia({ amount, fromCurrency, fromCountry, toCountry, toCurrency, result }) {
  return { amount, fromCurrency, fromCountry, toCountry, toCurrency, result, nuevoDestinatario: true }
}
