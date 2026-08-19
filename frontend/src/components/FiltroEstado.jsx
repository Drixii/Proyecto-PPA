import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Filtro de estado: píldoras en escritorio, popup en móvil.
//
// Con seis o siete estados las píldoras no caben en una pantalla de teléfono y
// se desbordaban. Un desplegable anclado al botón tampoco servía: quedaba
// pegado a un lado y sin sitio para abrirse. En móvil es un botón ancho que
// abre un popup centrado, que es lo único que se ve bien a cualquier ancho.
//
// El punto de corte se mide con matchMedia y no con clases de Tailwind porque
// hay que renderizar una cosa u otra, no esconder una de las dos: montar ambas
// duplicaría el estado y acabarían desincronizadas.
export default function FiltroEstado({ opciones, valor, onChange, colores = {}, etiqueta = 'Filtrar por categoría' }) {
  const [movil, setMovil] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const cambio = (e) => setMovil(e.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])

  // Con el popup abierto no se desplaza lo de detrás.
  useEffect(() => {
    if (!abierto) return
    const antes = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = antes }
  }, [abierto])

  // El color llega como clase de Tailwind ("bg-red-600") o como valor CSS
  // ("#dc2626") según la pantalla. Se distingue por el "#".
  const Punto = ({ o, tam = 6 }) => {
    const c = o.dot || colores[o.key]
    if (!o.key || !c) return null
    return c.startsWith('#')
      ? <span style={{ display: 'inline-block', width: tam, height: tam, borderRadius: '50%', background: c, flexShrink: 0 }} />
      : <span className={`inline-block rounded-full shrink-0 ${c}`} style={{ width: tam, height: tam }} />
  }

  if (!movil) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl px-2 py-1.5"
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)' }}>
        {opciones.map(o => (
          <button key={o.key} onClick={() => onChange(o.key)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            style={valor === o.key
              ? { background: 'linear-gradient(135deg,#1e3a6e,#1e40af)', color: '#fff' }
              : { color: '#8aa0cc' }}>
            <Punto o={o} />
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  const actual = opciones.find(o => o.key === valor)
  const activo = actual && actual.key

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="w-full flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
        style={{ background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff' }}>
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"
          className="shrink-0" style={{ color: '#8aa0cc' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span className="flex-1 text-left truncate">
          {activo ? actual.label : etiqueta}
        </span>
        {activo && <Punto o={actual} tam={7} />}
      </button>

      {abierto && createPortal(
        // z-index por encima del menú inferior del móvil, que es z-50 y si no
        // se queda por delante del popup.
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(2,6,23,.8)' }}
          onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(8,16,44,.99)', border: '1px solid rgba(255,255,255,.12)', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <span className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>{etiqueta}</span>
              <button onClick={() => setAbierto(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-base"
                style={{ background: 'rgba(255,255,255,.08)', color: '#bfe4ff' }}>✕</button>
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {opciones.map(o => (
                <button key={o.key}
                  onClick={() => { onChange(o.key); setAbierto(false) }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm"
                  style={{ borderBottom: '1px solid rgba(255,255,255,.04)',
                    background: valor === o.key ? 'rgba(56,189,248,.12)' : 'transparent',
                    color: '#eaf2ff' }}>
                  <Punto o={o} tam={8} />
                  <span className="flex-1">{o.label}</span>
                  {valor === o.key && <span style={{ color: '#38bdf8' }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
