// Pendiente de pago va en rojo, no en amarillo, y con punto. Es el único
// estado que exige algo del cliente ahora mismo: el resto son cosas que pasan
// solas o que dependen del operador. En amarillo se confundía con "en
// aprobación", que no requiere hacer nada, y las órdenes se quedaban sin pagar
// sin que nadie lo notara.
const COLORS = {
  pendiente_pago: 'bg-red-100 text-red-800',
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

// Estados que piden acción del cliente. El punto los hace visibles de un
// vistazo en una lista larga, donde el color del fondo se pierde.
const CON_PUNTO = new Set(['pendiente_pago', 'rechazado'])

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${COLORS[status] || 'bg-gray-100 text-gray-800'}`}>
      {CON_PUNTO.has(status) && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#dc2626' }}
          aria-hidden="true"
        />
      )}
      {LABELS[status] || status}
    </span>
  )
}
