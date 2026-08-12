const COLORS = {
  pendiente_pago: 'bg-yellow-100 text-yellow-900',
  en_aprobacion: 'bg-orange-100 text-orange-800',
  en_proceso: 'bg-blue-100 text-blue-800',
  completado: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
}

const LABELS = {
  pendiente_pago: 'Pendiente de pago',
  en_aprobacion: 'En Aprobación',
  en_proceso: 'En Proceso',
  completado: 'Completado',
  rechazado: 'Rechazado',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${COLORS[status] || 'bg-gray-100 text-gray-800'}`}>
      {LABELS[status] || status}
    </span>
  )
}
