// Colores y etiquetas de los estados de una orden, en un solo sitio.
//
// Estaban repetidos en cinco archivos con listas distintas, y varios ni
// mencionaban `pendiente_pago` ni `rechazado`: el punto salía transparente
// —color indefinido— y una orden sin pagar se veía igual que cualquier otra.
// Añadir un estado tenía que hacerse cinco veces y bastaba olvidar una para
// que desapareciera de esa pantalla sin que nadie lo notara.
//
// Cualquier vista nueva que pinte un estado debe tirar de aquí.

export const ESTADO_LABEL = {
  pendiente_pago: 'Pendiente de pago',
  retenido: 'Retención',
  en_aprobacion: 'En Aprobación',
  en_proceso: 'En Proceso',
  completado: 'Completado',
  rechazado: 'Rechazado',
}

// Color del punto, como valor CSS (para style={{ background }}).
export const ESTADO_COLOR = {
  pendiente_pago: '#dc2626',
  retenido: '#a855f7',
  en_aprobacion: '#f97316',
  en_proceso: '#60a5fa',
  completado: '#4ade80',
  rechazado: '#ef4444',
}

// El mismo color como clase de Tailwind, para las vistas que ya lo usaban así.
export const ESTADO_DOT = {
  pendiente_pago: 'bg-red-600',
  retenido: 'bg-purple-500',
  en_aprobacion: 'bg-orange-400',
  en_proceso: 'bg-blue-500',
  completado: 'bg-green-500',
  rechazado: 'bg-red-500',
}

// Estados que esperan a que alguien haga algo: el cliente pague, o suba un
// comprobante nuevo. Se marcan aparte para que destaquen en una lista larga,
// donde el color por sí solo se pierde.
export const ESTADO_PIDE_ACCION = new Set(['pendiente_pago', 'rechazado'])

// Estados en los que el envio espera a la casa, no al cliente. Se marcan
// aparte porque el cliente no tiene nada que hacer: solo esperar.
export const ESTADO_EN_ESPERA = new Set(['retenido'])

// Al cliente se le dice "Retención/Verificación": "retención" a secas suena
// a castigo cuando lo que está pasando es una comprobación rutinaria. En el
// panel de la casa se llama solo "Retención", que es lo que operativamente es.
export const ESTADO_LABEL_CLIENTE = {
  ...ESTADO_LABEL,
  retenido: 'Retención/Verificación',
}

export const etiquetaEstadoCliente = (estado) =>
  ESTADO_LABEL_CLIENTE[estado] || (estado || '').replace(/_/g, ' ')

export const etiquetaEstado = (estado) =>
  ESTADO_LABEL[estado] || (estado || '').replace(/_/g, ' ')

export const colorEstado = (estado) => ESTADO_COLOR[estado] || '#64748b'
