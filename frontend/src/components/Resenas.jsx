import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { COUNTRY_CODE } from '../utils/flags'

// Reseñas de clientes en la portada.
//
// Son reales: las escribe un cliente sobre un envío suyo ya completado y se
// publican cuando el super-admin las aprueba. Mientras no haya ninguna
// publicada no se enseña una sección vacía ni de relleno: se muestra lo que
// se pase como `sinResenas` (la llamada a crear cuenta).
//
// Con pocas reseñas van en una rejilla quieta; con suficientes para llenar el
// ancho, en dos cintas que corren en sentidos contrarios y se paran al pasar
// el ratón para poder leer.

const MINIMO_CINTA = 6

function Estrellas({ n }) {
  return (
    <span className="res-estrellas" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="15" height="15" viewBox="0 0 24 24" fill={i <= n ? '#fbbf24' : 'rgba(255,255,255,.12)'}>
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
        </svg>
      ))}
    </span>
  )
}

const bandera = (pais) => {
  const iso = COUNTRY_CODE[pais]
  return iso ? <img src={`https://flagcdn.com/w40/${iso}.png`} alt="" loading="lazy" /> : null
}

function hace(fecha) {
  if (!fecha) return ''
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
  if (dias < 1) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`
}

const TONOS = ['#38bdf8', '#818cf8', '#4ade80', '#f472b6', '#fbbf24', '#2dd4bf']

function Tarjeta({ r }) {
  const tono = TONOS[r.id % TONOS.length]
  return (
    <figure className="res-card">
      <div className="res-card-cab">
        <Estrellas n={r.rating} />
        <span className="res-fecha">{hace(r.fecha)}</span>
      </div>
      <blockquote className="res-texto">“{r.comentario}”</blockquote>
      <figcaption className="res-autor">
        <span className="res-avatar" style={{ background: `linear-gradient(135deg,${tono},color-mix(in srgb,${tono} 40%,#1e1b4b))` }}>
          {r.nombre?.[0] || '·'}
        </span>
        <span className="res-quien">
          <b>{r.nombre} <span className="res-verificado" title="Cliente con un envío completado">✓</span></b>
          <small>
            {bandera(r.pais_origen)}{r.pais_origen} <i>→</i> {bandera(r.pais_destino)}{r.pais_destino}
          </small>
        </span>
      </figcaption>
    </figure>
  )
}

export default function Resenas({ sinResenas = null }) {
  const { data } = useQuery({
    queryKey: ['resenas-publicas'],
    queryFn: () => api.get('/reviews/public').then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  })

  const items = data?.items || []
  if (!items.length) return sinResenas

  const enCinta = items.length >= MINIMO_CINTA
  const mitad = Math.ceil(items.length / 2)
  const filas = enCinta ? [items.slice(0, mitad), items.slice(mitad)] : [items]

  return (
    <section className="section-pad resenas">
      <style>{`
        .resenas{position:relative;z-index:2;overflow:hidden;background:rgba(4,10,30,.6);}
        .resenas::before{content:'';position:absolute;left:50%;top:0;width:900px;height:500px;transform:translateX(-50%);pointer-events:none;
          background:radial-gradient(closest-side,rgba(251,191,36,.07),transparent);}
        .res-cab{position:relative;text-align:center;max-width:720px;margin:0 auto 48px;}
        .res-eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;}
        .res-titulo{margin:0;font-size:clamp(30px,3.8vw,48px);font-weight:700;letter-spacing:-.03em;color:#fff;line-height:1.1;}
        .res-titulo span{background:linear-gradient(120deg,#fde68a,#fbbf24 50%,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .res-resumen{display:inline-flex;align-items:center;gap:12px;margin-top:20px;font-size:14px;color:#9fb0d4;}
        .res-resumen b{font-family:'JetBrains Mono',monospace;font-size:26px;color:#fff;}

        .res-cinta{position:relative;overflow:hidden;padding:8px 0;
          -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);
                  mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);}
        .res-cinta+.res-cinta{margin-top:18px;}
        .res-pista{display:flex;gap:18px;width:max-content;animation:resIzq var(--dur) linear infinite;}
        .res-cinta:nth-child(odd) .res-pista{animation-name:resDer;}
        .res-cinta:hover .res-pista{animation-play-state:paused;}
        @keyframes resIzq{from{transform:translateX(0)}to{transform:translateX(calc(-50% - 9px))}}
        @keyframes resDer{from{transform:translateX(calc(-50% - 9px))}to{transform:translateX(0)}}

        .res-rejilla{position:relative;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}

        .res-card{margin:0;width:360px;flex-shrink:0;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:22px 22px 20px;border-radius:20px;
          background:linear-gradient(180deg,rgba(14,24,56,.92),rgba(7,13,34,.96));border:1px solid rgba(255,255,255,.08);
          box-shadow:0 10px 30px rgba(0,4,20,.35);transition:transform .4s cubic-bezier(.16,1,.3,1),border-color .4s,box-shadow .4s;}
        .res-rejilla .res-card{width:auto;}
        .res-card:hover{transform:translateY(-4px);border-color:rgba(251,191,36,.3);box-shadow:0 20px 44px rgba(0,4,20,.5);}
        .res-card-cab{display:flex;align-items:center;justify-content:space-between;}
        .res-estrellas{display:inline-flex;gap:2px;}
        .res-fecha{font-size:11.5px;color:#64748b;}
        .res-texto{margin:0;flex:1;font-size:14.5px;line-height:1.65;color:#d4def5;
          display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;}
        .res-autor{display:flex;align-items:center;gap:11px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);}
        .res-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;font-size:15px;font-weight:800;color:#fff;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.25);}
        .res-quien{min-width:0;display:flex;flex-direction:column;gap:3px;}
        .res-quien b{font-size:14px;color:#fff;}
        .res-verificado{display:inline-grid;place-items:center;width:15px;height:15px;margin-left:3px;border-radius:50%;font-size:9px;
          color:#052e16;background:#4ade80;vertical-align:1px;}
        .res-quien small{display:flex;align-items:center;gap:4px;font-size:12px;color:#8fa3cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .res-quien small img{width:14px;height:14px;border-radius:50%;object-fit:cover;}
        .res-quien small i{font-style:normal;color:#475569;margin:0 2px;}

        .res-pie{position:relative;text-align:center;margin-top:40px;font-size:13px;color:#7384ab;}

        @media(max-width:520px){
          .res-card{width:290px;padding:18px;}
          .res-texto{font-size:13.5px;}
          .res-rejilla{grid-template-columns:1fr;}
        }
        @media(prefers-reduced-motion:reduce){.res-pista{animation:none;flex-wrap:wrap;width:auto;justify-content:center;}}
      `}</style>

      <div className="res-cab">
        <p className="res-eyebrow">Reseñas</p>
        <h2 className="res-titulo">Lo que dicen <span>nuestros clientes</span></h2>
        {data?.promedio && (
          <div className="res-resumen">
            <b>{data.promedio.toLocaleString('es-CL', { minimumFractionDigits: 1 })}</b>
            <Estrellas n={Math.round(data.promedio)} />
            <span>· {data.total} {data.total === 1 ? 'reseña' : 'reseñas'} de clientes con envíos completados</span>
          </div>
        )}
      </div>

      {enCinta ? filas.map((fila, i) => (
        <div key={i} className="res-cinta">
          <div className="res-pista" style={{ '--dur': `${Math.max(40, fila.length * 9)}s` }}>
            {[...fila, ...fila].map((r, k) => <Tarjeta key={`${r.id}-${k}`} r={r} />)}
          </div>
        </div>
      )) : (
        <div className="res-rejilla">
          {items.map(r => <Tarjeta key={r.id} r={r} />)}
        </div>
      )}

      <p className="res-pie">¿Ya enviaste con nosotros? Deja tu opinión desde tu envío completado.</p>
    </section>
  )
}
