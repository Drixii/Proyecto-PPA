// Métodos que se cobran fuera de la aplicación: el cliente paga en un portal
// externo y la orden solo avanza cuando llega el aviso del proveedor. Nacen en
// `pendiente_pago`, no en `en_aprobacion`, y no llevan comprobante — así que
// la ficha se pinta distinta que la de una transferencia manual.
//
// Los códigos de Koywe salen de backend/services/koywe_service.py (NOMBRES).
// Es una lista fija a propósito: clasificar una orden vieja no puede depender
// de que Koywe responda ni de que el método siga contratado. Si allí se añade
// un código, hay que añadirlo aquí — el script de pruebas compara las dos.
export const METODOS_EXTERNOS = [
  'tarjeta',                                  // Stripe
  // Koywe
  'khipu', 'card_payment', 'pse', 'nequi', 'pix_static', 'pix_dynamic',
  'spei', 'card', 'ligo', 'qri',
]

export const esPagoExterno = (metodo) =>
  METODOS_EXTERNOS.includes(String(metodo || '').toLowerCase())

// Solo Stripe se cobra dentro de la aplicación, con su formulario incrustado.
// Los de Koywe salen a su portal, así que el botón de reintentar hace cosas
// distintas según cuál sea.
export const esKoywe = (metodo) =>
  esPagoExterno(metodo) && String(metodo || '').toLowerCase() !== 'tarjeta'
