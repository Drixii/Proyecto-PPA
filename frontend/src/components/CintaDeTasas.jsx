import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

// Cinta de cotizaciones, como la de las webs de bolsa: va pasando cada moneda
// con su precio contra el dólar y cuánto se movió en el día.
//
// El desplazamiento es CSS puro y duplica la lista para que el bucle no dé un
// salto al volver al principio: cuando la primera copia termina de salir, la
// segunda está exactamente donde empezó la primera, así que reiniciar la
// animación no se nota. Con JS y un temporizador esto iría a tirones en cuanto
// la pestaña estuviera ocupada con otra cosa.

const num = (v) => {
  if (v == null) return '—'
  if (v >= 1000) return v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  if (v >= 1) return v.toLocaleString('es-CL', { maximumFractionDigits: 3 })
  return v.toLocaleString('es-CL', { maximumFractionDigits: 5 })
}

function Entrada({ fila }) {
  const sube = (fila.variacion ?? 0) > 0
  const color = fila.variacion == null ? '#8aa0cc' : (sube ? '#4ade80' : '#f87171')

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '0 18px', borderRight: '1px solid rgba(255,255,255,.08)',
      whiteSpace: 'nowrap', fontSize: 12.5,
    }}>
      {fila.iso2 && (
        <img
          src={`https://flagcdn.com/w40/${fila.iso2.toLowerCase()}.png`}
          alt=""
          loading="lazy"
          style={{ width: 17, height: 17, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      )}
      <strong style={{ color: '#eaf2ff', fontWeight: 700 }}>{fila.par}</strong>
      <span style={{ color: '#c3d2ee', fontFamily: "'JetBrains Mono',monospace" }}>
        {num(fila.rate)}
      </span>
      {fila.variacion != null && (
        <span style={{ color, fontWeight: 700 }}>
          {sube ? '▲' : '▼'} {Math.abs(fila.variacion).toFixed(2)}%
        </span>
      )}
    </span>
  )
}

export default function CintaDeTasas() {
  const { data: filas = [] } = useQuery({
    queryKey: ['cinta-tasas'],
    queryFn: () => api.get('/rates/cinta').then(r => r.data.data),
    staleTime: 30000,
    refetchInterval: 60000,
  })

  // Sin datos no se enseña una cinta vacía: se enseña nada.
  if (!filas.length) return null

  // La vuelta entera dura lo mismo por entrada, así que con pocas monedas no
  // pasa volando ni con muchas se hace eterna.
  const segundos = Math.max(filas.length * 4, 20)

  return (
    <div style={{
      width: '100%', overflow: 'hidden', marginBottom: 12,
      borderRadius: 14, padding: '9px 0',
      background: 'rgba(8,16,44,.75)',
      border: '1px solid rgba(255,255,255,.08)',
      backdropFilter: 'blur(12px)',
      WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)',
      maskImage: 'linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)',
    }}>
      <style>{`
        @keyframes cintaTasas { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .cinta-tasas-pista { animation: cintaTasas var(--cinta-dur) linear infinite; }
        .cinta-tasas-pista:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .cinta-tasas-pista { animation: none; }
        }
      `}</style>
      <div className="cinta-tasas-pista"
        style={{ display: 'inline-flex', '--cinta-dur': `${segundos}s` }}>
        {[0, 1].map(copia => (
          <span key={copia} style={{ display: 'inline-flex' }} aria-hidden={copia === 1}>
            {filas.map(f => <Entrada key={`${copia}-${f.country}`} fila={f} />)}
          </span>
        ))}
      </div>
    </div>
  )
}
