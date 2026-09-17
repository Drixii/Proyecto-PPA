import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

// Las dos huinchas cruzadas bajo el globo: una delantera de color que va hacia
// la izquierda y otra oscura detrás, inclinada al revés, que va hacia la
// derecha.
//
// Sustituye a una línea de «1 USD = 959 CLP» en letra de 13px que no leía
// nadie. Usa los mismos datos que la cinta de arriba del home —el par, el
// precio y cuánto se movió— y la misma clave de caché, así que no hace una
// consulta más.
//
// El bucle es CSS con la lista duplicada, como la otra cinta: cuando la
// primera copia termina de salir, la segunda está justo donde empezó, y
// reiniciar la animación no se nota.

const num = (v) => {
  if (v == null) return '—'
  if (v >= 1000) return v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  if (v >= 1) return v.toLocaleString('es-CL', { maximumFractionDigits: 2 })
  return v.toLocaleString('es-CL', { maximumFractionDigits: 4 })
}

function Entrada({ fila, oscura }) {
  const tieneVar = fila.variacion != null
  const sube = (fila.variacion ?? 0) > 0
  return (
    <span className="huincha-entrada">
      {fila.iso2 && (
        <img src={`https://flagcdn.com/w80/${fila.iso2.toLowerCase()}.png`} alt="" loading="lazy" className="huincha-bandera" />
      )}
      <span className="huincha-par">{fila.par}</span>
      <span className="huincha-precio">{num(fila.rate)}</span>
      {tieneVar && (
        <span className={`huincha-var ${sube ? 'sube' : 'baja'}${oscura ? ' oscura' : ''}`}>
          {sube ? '▲' : '▼'} {Math.abs(fila.variacion).toFixed(2)}%
        </span>
      )}
      <span className="huincha-sep" aria-hidden="true">✦</span>
    </span>
  )
}

function Pista({ filas, oscura, segundos }) {
  return (
    <div className="huincha-pista" style={{ '--dur': `${segundos}s` }}>
      {[0, 1].map(copia => (
        <span key={copia} className="huincha-copia" aria-hidden={copia === 1}>
          {filas.map(f => <Entrada key={`${copia}-${f.country}`} fila={f} oscura={oscura} />)}
        </span>
      ))}
    </div>
  )
}

export default function HuinchaTasas() {
  const { data: filas = [] } = useQuery({
    queryKey: ['cinta-tasas'],
    queryFn: () => api.get('/rates/cinta').then(r => r.data.data),
    staleTime: 30000,
    refetchInterval: 60000,
  })

  if (!filas.length) return null

  // Letra grande = entradas anchas: sin alargar la vuelta con el número de
  // monedas, con quince pasaría como un borrón.
  const segundos = Math.max(filas.length * 6, 40)

  return (
    <div className="huinchas" aria-label="Tasas del día contra el dólar">
      <style>{`
        .huinchas{position:relative;z-index:2;overflow:hidden;padding:70px 0;margin:-10px 0;}
        .huincha{position:relative;left:-5%;width:110%;overflow:hidden;white-space:nowrap;}
        .huincha.delante{z-index:2;transform:rotate(-3deg);padding:16px 0;
          background:linear-gradient(90deg,#0ea5e9,#3b82f6 45%,#6366f1);
          /* Sombra oscura y corta. Con un resplandor azul grande, el contenedor
             (overflow:hidden, que hace falta para que las huinchas inclinadas
             no ensanchen la página) lo cortaba a ras y quedaba una franja
             luminosa con borde recto debajo. */
          box-shadow:0 10px 24px rgba(2,6,23,.45),inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(0,0,0,.2);}
        .huincha.detras{z-index:1;transform:rotate(3deg);margin-top:-64px;padding:12px 0;
          background:#0a1432;box-shadow:0 8px 20px rgba(2,6,23,.4);}

        .huincha-pista{display:inline-flex;animation:huinchaIzq var(--dur) linear infinite;will-change:transform;}
        .huincha.detras .huincha-pista{animation-name:huinchaDer;}
        .huincha-copia{display:inline-flex;}
        @keyframes huinchaIzq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes huinchaDer{from{transform:translateX(-50%)}to{transform:translateX(0)}}

        .huincha-entrada{display:inline-flex;align-items:center;gap:16px;padding-right:18px;}
        .huincha-bandera{width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;
          box-shadow:0 0 0 3px rgba(255,255,255,.85),0 6px 16px rgba(0,0,0,.25);}
        .huincha-par{font-size:40px;line-height:1;font-weight:800;letter-spacing:-.02em;color:#fff;text-transform:uppercase;}
        .huincha-precio{font-family:'JetBrains Mono',monospace;font-size:40px;line-height:1;font-weight:800;color:#fff;
          text-shadow:0 2px 12px rgba(0,0,0,.18);}
        .huincha-var{display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border-radius:999px;
          font-size:22px;line-height:1;font-weight:800;}
        .huincha-var.sube{color:#052e16;background:#4ade80;box-shadow:0 6px 16px rgba(22,163,74,.35);}
        .huincha-var.baja{color:#450a0a;background:#f87171;box-shadow:0 6px 16px rgba(220,38,38,.35);}
        .huincha-sep{font-size:26px;color:rgba(255,255,255,.55);margin-left:10px;}

        /* La de atrás más discreta: mismos datos, sin competir con la de delante. */
        .huincha.detras .huincha-bandera{width:30px;height:30px;box-shadow:0 0 0 2px rgba(125,211,252,.35);}
        .huincha.detras .huincha-par,.huincha.detras .huincha-precio{font-size:26px;color:#7f93bf;}
        .huincha.detras .huincha-var{font-size:15px;padding:4px 10px;background:transparent;box-shadow:none;}
        .huincha.detras .huincha-var.sube{color:#4ade80;border:1px solid rgba(74,222,128,.4);}
        .huincha.detras .huincha-var.baja{color:#f87171;border:1px solid rgba(248,113,113,.4);}
        .huincha.detras .huincha-sep{font-size:18px;color:#38bdf8;}

        .huinchas:hover .huincha-pista{animation-play-state:paused;}

        @media(max-width:768px){
          /* En un teléfono no hay ancho para que se abran y la de atrás
             quedaba tapada entera: van una debajo de otra, con la de atrás
             asomando bajo la de delante. */
          .huinchas{padding:28px 0 22px;}
          .huincha.delante{padding:11px 0;transform:rotate(-3deg);}
          .huincha.detras{margin-top:-6px;padding:8px 0;transform:rotate(-1deg);}
          .huincha-entrada{gap:10px;padding-right:12px;}
          .huincha-bandera{width:28px;height:28px;box-shadow:0 0 0 2px rgba(255,255,255,.85);}
          .huincha-par,.huincha-precio{font-size:26px;}
          .huincha-var{font-size:14px;padding:4px 9px;}
          .huincha-sep{font-size:18px;margin-left:6px;}
          .huincha.detras .huincha-bandera{width:20px;height:20px;}
          .huincha.detras .huincha-par,.huincha.detras .huincha-precio{font-size:17px;}
          .huincha.detras .huincha-var{font-size:11px;padding:3px 7px;}
        }
        @media(prefers-reduced-motion:reduce){.huincha-pista{animation:none;}}
      `}</style>

      <div className="huincha delante">
        <Pista filas={filas} segundos={segundos} />
      </div>
      <div className="huincha detras" aria-hidden="true">
        <Pista filas={filas} oscura segundos={Math.round(segundos * 1.3)} />
      </div>
    </div>
  )
}
