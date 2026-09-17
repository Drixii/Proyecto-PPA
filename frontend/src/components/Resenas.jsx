import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { COUNTRY_CODE } from '../utils/flags'

// Reseñas de clientes en la portada, en un carrusel.
//
// Son reales: las escribe un cliente sobre un envío suyo ya completado y se
// publican cuando el super-admin las aprueba. Sin ninguna publicada la
// sección no se muestra.
//
// El carrusel pone la reseña activa al frente y las vecinas detrás, giradas y
// en perspectiva, como tarjetas en una mesa. Avanza solo cada pocos segundos
// —la barra del punto activo marca cuánto falta—, se para al pasar el ratón o
// al tocarlo, y se mueve con las flechas, los puntos, el teclado o
// arrastrando con el dedo.

const INTERVALO_MS = 6000

function Estrellas({ n, tam = 16 }) {
  return (
    <span className="car-estrellas" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={tam} height={tam} viewBox="0 0 24 24" fill={i <= n ? '#fbbf24' : 'rgba(255,255,255,.12)'}>
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

// Posición de cada tarjeta respecto a la activa, contando por el camino más
// corto en el círculo: con 10 reseñas, la 9 está a -1 de la 0, no a +9.
function desfase(i, activa, total) {
  let d = i - activa
  if (d > total / 2) d -= total
  if (d < -total / 2) d += total
  return d
}

export default function Resenas() {
  const { data } = useQuery({
    queryKey: ['resenas-publicas'],
    queryFn: () => api.get('/reviews/public').then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  })
  const items = data?.items || []
  const total = items.length

  const [activa, setActiva] = useState(0)
  const [pausa, setPausa] = useState(false)
  const [ciclo, setCiclo] = useState(0)     // reinicia la barra del punto
  const arrastre = useRef(null)
  const zona = useRef(null)
  const [visible, setVisible] = useState(false)

  const ir = useCallback((n) => {
    if (!total) return
    setActiva(((n % total) + total) % total)
    setCiclo(c => c + 1)
  }, [total])

  // Solo corre cuando la sección se ve y nadie la está mirando de cerca.
  useEffect(() => {
    const el = zona.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [total])

  // Al reanudar, la barra del punto vuelve a empezar junto con el temporizador:
  // si no, la barra seguía donde se quedó y la tarjeta cambiaba antes de
  // llenarse.
  useEffect(() => { if (!pausa) setCiclo(c => c + 1) }, [pausa])

  useEffect(() => {
    if (total < 2 || pausa || !visible) return
    const id = setTimeout(() => ir(activa + 1), INTERVALO_MS)
    return () => clearTimeout(id)
  }, [activa, pausa, visible, total, ir, ciclo])

  if (!total) return null

  const alPulsar = (e) => { arrastre.current = { x: e.clientX, t: Date.now() }; setPausa(true) }
  const alSoltar = (e) => {
    const a = arrastre.current
    arrastre.current = null
    setPausa(false)
    if (!a) return
    const dx = e.clientX - a.x
    if (Math.abs(dx) > 45) ir(activa + (dx < 0 ? 1 : -1))
  }

  const actual = items[activa]

  return (
    <section className="section-pad car seccion-clara" ref={zona}>
      <style>{`
        .car{position:relative;z-index:2;overflow:hidden;background:linear-gradient(180deg,#e8edf7,#dce4f0);}
        .car::before{content:'';position:absolute;left:50%;top:38%;width:1000px;height:560px;transform:translate(-50%,-50%);pointer-events:none;
          background:radial-gradient(closest-side,rgba(251,191,36,.09),transparent 70%);}
        .car-cab{position:relative;text-align:center;max-width:720px;margin:0 auto 34px;}
        .car-rotulo{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;}
        .car-titulo{margin:0;font-size:clamp(30px,3.8vw,48px);font-weight:700;letter-spacing:-.03em;color:#0b1c3f;line-height:1.1;}
        .car-titulo span{background:linear-gradient(120deg,#f59e0b,#d97706 50%,#b45309);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .car-resumen{display:inline-flex;align-items:center;gap:12px;margin-top:18px;font-size:14px;color:#5b6f96;flex-wrap:wrap;justify-content:center;}
        .car-resumen b{font-family:'JetBrains Mono',monospace;font-size:26px;color:#0b1c3f;}

        /* Escenario en perspectiva */
        .car-escena{position:relative;height:360px;perspective:1600px;touch-action:pan-y;user-select:none;cursor:grab;}
        .car-escena:active{cursor:grabbing;}
        .car-card{position:absolute;left:50%;top:50%;width:min(560px,86vw);box-sizing:border-box;margin:0;
          padding:34px 34px 28px;border-radius:26px;
          background:#f8fafd;
          border:1px solid rgba(11,28,63,.14);box-shadow:0 22px 50px rgba(11,28,63,.12);
          transition:transform .8s cubic-bezier(.16,1,.3,1),opacity .6s ease,filter .6s ease;
          will-change:transform;}
        .car-card.frente{border-color:rgba(245,158,11,.45);
          box-shadow:0 34px 80px rgba(11,28,63,.18),0 0 0 1px rgba(245,158,11,.25);}
        .car-card::before{content:'”';position:absolute;right:26px;bottom:-62px;font:700 150px/1 Georgia,serif;
          background:linear-gradient(180deg,rgba(245,158,11,.4),rgba(245,158,11,0));-webkit-background-clip:text;background-clip:text;color:transparent;pointer-events:none;}
        /* Brillo que cruza la tarjeta cuando pasa al frente */
        .car-card::after{content:'';position:absolute;inset:0;border-radius:26px;pointer-events:none;opacity:0;
          background:linear-gradient(115deg,transparent 30%,rgba(37,99,235,.1) 48%,transparent 66%);background-size:250% 100%;}
        .car-card.frente::after{animation:carBrillo 1.4s .25s ease both;}

        .car-cabeza{display:flex;align-items:center;gap:12px;margin-bottom:18px;}
        .car-estrellas{display:inline-flex;gap:3px;}
        .car-card.frente .car-estrellas svg{animation:carEstrella .5s cubic-bezier(.34,1.56,.64,1) both;}
        .car-card.frente .car-estrellas svg:nth-child(2){animation-delay:.06s}
        .car-card.frente .car-estrellas svg:nth-child(3){animation-delay:.12s}
        .car-card.frente .car-estrellas svg:nth-child(4){animation-delay:.18s}
        .car-card.frente .car-estrellas svg:nth-child(5){animation-delay:.24s}
        .car-fecha{margin-left:auto;font-size:12px;color:#8fa0c0;}
        .car-texto{margin:0 0 24px;font-size:clamp(16px,1.6vw,19px);line-height:1.6;color:#33415c;
          display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;min-height:3.2em;}
        .car-autor{display:flex;align-items:center;gap:13px;padding-top:18px;border-top:1px solid rgba(11,28,63,.08);}
        .car-avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;font-size:18px;font-weight:800;color:#fff;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 18px rgba(0,0,0,.35);}
        .car-quien{min-width:0;display:flex;flex-direction:column;gap:4px;}
        .car-quien b{font-size:15.5px;color:#0b1c3f;}
        .car-ok{display:inline-grid;place-items:center;width:16px;height:16px;margin-left:5px;border-radius:50%;font-size:10px;color:#052e16;background:#4ade80;vertical-align:1px;}
        .car-quien small{display:flex;align-items:center;gap:5px;font-size:12.5px;color:#5b6f96;white-space:nowrap;}
        .car-quien small img{width:15px;height:15px;border-radius:50%;object-fit:cover;}
        .car-quien small i{font-style:normal;color:#475569;}

        /* Controles */
        .car-controles{position:relative;display:flex;align-items:center;justify-content:center;gap:18px;margin-top:26px;}
        .car-flecha{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#0b1c3f;
          background:#f8fafd;border:1px solid rgba(11,28,63,.12);box-shadow:0 6px 18px rgba(11,28,63,.1);
          backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:background .25s,border-color .25s,transform .25s;}
        .car-flecha:hover{background:#fff7e6;border-color:rgba(245,158,11,.5);transform:scale(1.06);}
        .car-puntos{display:flex;align-items:center;gap:7px;}
        .car-punto{position:relative;width:8px;height:8px;padding:0;border:none;border-radius:999px;cursor:pointer;overflow:hidden;
          background:rgba(11,28,63,.18);transition:width .45s cubic-bezier(.16,1,.3,1),background .3s;}
        .car-punto.activo{width:38px;background:rgba(11,28,63,.12);}
        .car-punto.activo span{position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,#f59e0b,#d97706);
          animation:carBarra ${INTERVALO_MS}ms linear both;}
        
        @keyframes carBrillo{from{opacity:1;background-position:120% 0}to{opacity:0;background-position:-40% 0}}
        @keyframes carEstrella{from{transform:scale(.2) rotate(-40deg);opacity:0}to{transform:none;opacity:1}}
        @keyframes carBarra{from{transform:scaleX(0)}to{transform:scaleX(1)}}

        @media(max-width:640px){
          .car-escena{height:430px;}
          .car-card{padding:26px 22px 22px;}
          .car-card::before{font-size:110px;right:16px;bottom:-46px;}
          .car-flecha{width:42px;height:42px;}
        }
        @media(prefers-reduced-motion:reduce){
          .car-card{transition:opacity .2s;}
          .car-card::after,.car-estrellas svg,.car-punto span{animation:none!important;}
        }
      `}</style>

      <div className="car-cab">
        <p className="car-rotulo">Reseñas</p>
        <h2 className="car-titulo">Lo que dicen <span>nuestros clientes</span></h2>
        {data?.promedio && (
          <div className="car-resumen">
            <b>{data.promedio.toLocaleString('es-CL', { minimumFractionDigits: 1 })}</b>
            <Estrellas n={Math.round(data.promedio)} tam={17} />
            <span>· {data.total} {data.total === 1 ? 'reseña' : 'reseñas'} de clientes con envíos completados</span>
          </div>
        )}
      </div>

      <div
        className={`car-marco${pausa ? ' pausa' : ''}`}
        onMouseEnter={() => setPausa(true)}
        onMouseLeave={() => { setPausa(false); arrastre.current = null }}
      >
        <div className="car-escena"
          role="region" aria-roledescription="carrusel" aria-label="Reseñas de clientes"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'ArrowRight') ir(activa + 1); if (e.key === 'ArrowLeft') ir(activa - 1) }}
          onPointerDown={alPulsar} onPointerUp={alSoltar} onPointerCancel={() => { arrastre.current = null; setPausa(false) }}>
          {items.map((r, i) => {
            const d = total === 1 ? 0 : desfase(i, activa, total)
            const lejos = Math.abs(d)
            const tono = TONOS[r.id % TONOS.length]
            const estilo = {
              transform: `translate(-50%,-50%) translateX(${d * 58}%) translateZ(${-lejos * 180}px) rotateY(${-d * 14}deg) scale(${1 - Math.min(lejos, 2) * 0.08})`,
              opacity: lejos > 2 ? 0 : lejos === 0 ? 1 : lejos === 1 ? 0.5 : 0.18,
              filter: lejos ? `blur(${lejos * 1.5}px) saturate(.7)` : 'none',
              zIndex: 10 - lejos,
              pointerEvents: lejos ? 'none' : 'auto',
            }
            return (
              <figure key={r.id} className={`car-card${d === 0 ? ' frente' : ''}`} style={estilo} aria-hidden={d !== 0}>
                <div className="car-cabeza">
                  <Estrellas n={r.rating} />
                  <span className="car-fecha">{hace(r.fecha)}</span>
                </div>
                <blockquote className="car-texto">{r.comentario}</blockquote>
                <figcaption className="car-autor">
                  <span className="car-avatar" style={{ background: `linear-gradient(135deg,${tono},color-mix(in srgb,${tono} 35%,#1e1b4b))` }}>
                    {r.nombre?.[0] || '·'}
                  </span>
                  <span className="car-quien">
                    <b>{r.nombre}<span className="car-ok" title="Cliente con un envío completado">✓</span></b>
                    <small>{bandera(r.pais_origen)}{r.pais_origen} <i>→</i> {bandera(r.pais_destino)}{r.pais_destino}</small>
                  </span>
                </figcaption>
              </figure>
            )
          })}
        </div>

        {total > 1 && (
          <div className="car-controles">
            <button className="car-flecha" onClick={() => ir(activa - 1)} aria-label="Reseña anterior">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <div className="car-puntos">
              {items.map((r, i) => (
                <button key={r.id} className={`car-punto${i === activa ? ' activo' : ''}`} onClick={() => ir(i)}
                  aria-label={`Ver reseña ${i + 1}`} aria-current={i === activa}>
                  {i === activa && <span key={`${activa}-${ciclo}`} style={{ animationPlayState: pausa ? 'paused' : 'running' }} />}
                </button>
              ))}
            </div>
            <button className="car-flecha" onClick={() => ir(activa + 1)} aria-label="Reseña siguiente">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        )}
      </div>

      <span className="sr-only" aria-live="polite">{actual ? `${actual.nombre}: ${actual.comentario}` : ''}</span>
    </section>
  )
}
