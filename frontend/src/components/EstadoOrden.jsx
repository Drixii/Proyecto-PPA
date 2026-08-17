import { ESTADO_COLOR, ESTADO_LABEL, ESTADO_PIDE_ACCION } from '../utils/orderStatus'

// Punto de color + nombre del estado, para las tablas y listas.
//
// Existe porque este mismo par se pintaba a mano en seis pantallas, cada una
// con su lista de colores y su forma de sacar la etiqueta —varias hacían
// `status.replace('_',' ')` con CSS capitalize, que daba "Pendiente Pago" y
// dejaba el punto sin color porque su mapa no incluía ese estado.
//
// Los estados que esperan al cliente van además en rojo y en negrita: en una
// tabla larga, el punto solo no basta.
export default function EstadoOrden({ status, tamano = 'w-2 h-2', className = '' }) {
  const pideAccion = ESTADO_PIDE_ACCION.has(status)
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div
        className={`${tamano} rounded-full shrink-0`}
        style={{ background: ESTADO_COLOR[status] || '#64748b' }}
      />
      <span
        className="text-xs"
        style={{
          color: pideAccion ? '#f87171' : '#aebfe2',
          fontWeight: pideAccion ? 600 : 400,
        }}
      >
        {ESTADO_LABEL[status] || (status || '').replace(/_/g, ' ')}
      </span>
    </div>
  )
}
