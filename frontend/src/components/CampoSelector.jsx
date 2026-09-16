import { useState } from 'react'
import SelectorBusqueda from './SelectorBusqueda'

/**
 * Un campo con aspecto de `<select>` que abre el selector con buscador.
 *
 * Existe para poder sustituir los `<select>` nativos sin reescribir cada
 * formulario: se le pasa `value`, `onChange` y `opciones`, igual que al select.
 *
 * El nativo se abre como lo decida el sistema —una rueda diminuta en iPhone,
 * una lista sin buscador en Android— y no se puede escribir para filtrar.
 * Con veinte bancos o veinte países eso es recorrer la lista a ciegas.
 *
 * `opciones` es [{ valor, texto, iso2? }]. `onChange` recibe el valor a secas,
 * no un evento, que es lo único que usaban las llamadas de todos modos.
 */
export default function CampoSelector({
  value, onChange, opciones = [], placeholder = 'Elige...',
  titulo, className, style, disabled,
}) {
  const [abierto, setAbierto] = useState(false)
  const elegida = opciones.find(o => String(o.valor) === String(value ?? ''))

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAbierto(a => !a)}
        className={className}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1,
          ...style,
        }}>
        {elegida?.iso2 && (
          <img src={`https://flagcdn.com/40x30/${String(elegida.iso2).toLowerCase()}.png`} alt=""
            style={{ width: 20, height: 15, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
            onError={e => { e.target.style.visibility = 'hidden' }} />
        )}
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', color: elegida ? 'inherit' : '#64748b',
        }}>
          {elegida?.texto || placeholder}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" style={{ opacity: .55, flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {abierto && (
        <SelectorBusqueda
          titulo={titulo || placeholder}
          placeholder="Buscar..."
          valor={String(value ?? '')}
          opciones={opciones.map(o => ({
            clave: String(o.valor), titulo: o.texto, subtitulo: o.subtexto, iso2: o.iso2,
            valor: o.valor,
          }))}
          onElegir={o => onChange?.(o.valor)}
          onCerrar={() => setAbierto(false)} />
      )}
    </div>
  )
}
