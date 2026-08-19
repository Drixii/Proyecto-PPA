import { useState, useEffect, useRef } from 'react'

// Filtro de estado: píldoras en escritorio, desplegable en móvil.
//
// Con seis estados las píldoras no caben en una pantalla de teléfono: se
// desbordaban fuera del contenedor. Envolverlas en varias líneas tampoco
// servía — ocupaban media pantalla antes de llegar a la tabla.
//
// El punto de corte va en 768px y se mide con matchMedia en vez de con clases
// de Tailwind porque hay que renderizar una cosa u otra, no esconder una de
// las dos: montar ambas duplicaría el estado y los dos se desincronizarían.
export default function FiltroEstado({ opciones, valor, onChange, colores = {} }) {
  const [movil, setMovil] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  const [abierto, setAbierto] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const cambio = (e) => setMovil(e.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const punto = (o) => o.dot || colores[o.key]

  // El color puede venir como clase de Tailwind ("bg-red-600") o como valor
  // CSS ("#dc2626"), según la pantalla. Se distingue por el "#".
  const Punto = ({ o, tam = 6 }) => {
    if (!o.key || !punto(o)) return null
    const c = punto(o)
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

  const actual = opciones.find(o => o.key === valor) || opciones[0]

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
        style={{ background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff' }}>
        <Punto o={actual} tam={7} />
        <span className="flex-1 text-left truncate">{actual.label}</span>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
          className="shrink-0" style={{ color: '#8aa0cc', transform: abierto ? 'rotate(180deg)' : 'none' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-50"
          style={{ background: 'rgba(5,11,35,.98)', border: '1px solid rgba(56,189,248,.2)', boxShadow: '0 16px 40px rgba(0,0,0,.7)', maxHeight: 260, overflowY: 'auto' }}>
          {opciones.map(o => (
            <button key={o.key}
              onClick={() => { onChange(o.key); setAbierto(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-3 text-left text-sm"
              style={{ borderBottom: '1px solid rgba(255,255,255,.04)',
                background: valor === o.key ? 'rgba(56,189,248,.12)' : 'transparent',
                color: '#eaf2ff' }}>
              <Punto o={o} tam={7} />
              <span className="flex-1">{o.label}</span>
              {valor === o.key && <span style={{ color: '#38bdf8' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
