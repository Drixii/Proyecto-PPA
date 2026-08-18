import { ESTADO_LABEL, ESTADO_COLOR, ESTADO_PIDE_ACCION } from '../utils/orderStatus'

// Fondo de la píldora. El color del punto y la etiqueta salen de
// utils/orderStatus para no volver a tener dos listas que se contradigan.
const FONDO = {
  pendiente_pago: 'bg-red-100 text-red-800',
  retenido: 'bg-purple-100 text-purple-800',
  en_aprobacion: 'bg-orange-100 text-orange-800',
  en_proceso: 'bg-blue-100 text-blue-800',
  completado: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${FONDO[status] || 'bg-gray-100 text-gray-800'}`}>
      {ESTADO_PIDE_ACCION.has(status) && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: ESTADO_COLOR[status] }}
          aria-hidden="true"
        />
      )}
      {ESTADO_LABEL[status] || status}
    </span>
  )
}
