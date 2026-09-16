import { useEffect, useMemo, useRef, useState } from 'react'
import Portal from './Portal'

/**
 * Desplegable con buscador, uno para toda la aplicación.
 *
 * En escritorio cuelga del botón que lo abrió, como cualquier desplegable. En
 * el móvil se abre como hoja pegada al borde de abajo: una lista colgando en
 * una pantalla de teléfono se sale por el lado o queda cortada por el primer
 * contenedor con overflow, y hay que hacer scroll dentro de un sitio diminuto.
 * Pegada abajo cae donde está el pulgar y puede ocupar el ancho entero.
 *
 * El buscador está siempre, también en escritorio: con veinte países, buscar
 * es más rápido que recorrer la lista con la vista.
 *
 * Cada opción es { clave, titulo, subtitulo, iso2 }. `iso2` pinta la bandera.
 */

function useEsMovil() {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const alCambiar = e => setEsMovil(e.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])
  return esMovil
}

function Bandera({ iso2 }) {
  if (!iso2) return <span className="text-sm shrink-0">🌍</span>
  return (
    <img src={`https://flagcdn.com/40x30/${String(iso2).toLowerCase()}.png`} alt=""
      className="w-5 h-[15px] rounded-sm object-cover shrink-0"
      onError={e => { e.target.style.visibility = 'hidden' }} />
  )
}

export default function SelectorBusqueda({
  opciones = [], valor, onElegir, onCerrar,
  titulo = 'Elige una opción', placeholder = 'Buscar...',
}) {
  const esMovil = useEsMovil()
  const [busca, setBusca] = useState('')
  const ref = useRef()
  const inputRef = useRef()

  // En el móvil no se enfoca solo: el teclado saltaría encima de la lista y
  // taparía justo lo que se acaba de abrir. Se escribe si hace falta.
  useEffect(() => {
    if (!esMovil) setTimeout(() => inputRef.current?.focus(), 40)
  }, [esMovil])

  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) onCerrar?.() }
    const escape = (e) => { if (e.key === 'Escape') onCerrar?.() }
    document.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', escape)
    }
  }, [onCerrar])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter(o =>
      `${o.titulo || ''} ${o.subtitulo || ''} ${o.clave || ''}`.toLowerCase().includes(q))
  }, [opciones, busca])

  const buscador = (
    <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(6,13,40,.85)' }}>
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
          className="shrink-0" style={{ color: '#8aa0cc' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input ref={inputRef} value={busca} onChange={e => setBusca(e.target.value)}
          placeholder={placeholder} className="flex-1 text-sm outline-none bg-transparent"
          style={{ color: '#eaf2ff' }} />
        {busca && (
          <button type="button" onClick={() => setBusca('')} className="text-xs shrink-0" style={{ color: '#64748b' }}>✕</button>
        )}
      </div>
    </div>
  )

  const lista = (
    <div className="overflow-y-auto" style={{ maxHeight: esMovil ? '48dvh' : '13.5rem' }}>
      {filtradas.length === 0 && (
        <p className="text-xs text-center py-5" style={{ color: '#8aa0cc' }}>Sin resultados</p>
      )}
      {filtradas.map(o => (
        <button key={o.clave} type="button"
          onClick={() => { onElegir?.(o); onCerrar?.() }}
          className="w-full flex items-center gap-3 px-4 text-left transition-colors"
          style={{
            paddingTop: esMovil ? 13 : 10, paddingBottom: esMovil ? 13 : 10,
            background: valor === o.clave ? 'rgba(56,189,248,.12)' : 'transparent',
          }}>
          <Bandera iso2={o.iso2} />
          <span className="flex-1 text-sm font-medium truncate" style={{ color: '#eaf2ff' }}>{o.titulo}</span>
          {o.subtitulo && (
            <span className="text-xs font-mono shrink-0" style={{ color: '#8aa0cc' }}>{o.subtitulo}</span>
          )}
        </button>
      ))}
    </div>
  )

  if (!esMovil) {
    return (
      <div ref={ref}
        className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-[400] w-64 overflow-hidden"
        style={{ background: 'rgba(8,16,44,.97)', border: '1px solid rgba(255,255,255,.08)' }}>
        {buscador}
        {lista}
      </div>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0" style={{ zIndex: 9400, background: 'rgba(2,6,23,.66)' }} onClick={onCerrar} />
      <div ref={ref}
        className="fixed left-0 right-0 bottom-0 rounded-t-3xl overflow-hidden"
        style={{
          zIndex: 9401, background: 'rgba(8,16,44,.99)',
          borderTop: '1px solid rgba(255,255,255,.1)',
          boxShadow: '0 -18px 50px rgba(0,0,0,.55)',
          // Los teléfonos con gesto de inicio se comen la última fila.
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <span style={{ width: 38, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)' }} />
        </div>
        <p className="px-4 pb-2 text-sm font-bold" style={{ color: '#eaf2ff' }}>{titulo}</p>
        {buscador}
        {lista}
      </div>
    </Portal>
  )
}
