import { useEffect, useRef, useState } from 'react'
import { useCountries } from '../hooks/useCountries'

// «En números»: cuatro bloques que ocupan el ancho entero de la página.
//
// Cada cifra cuenta hasta su valor al aparecer y lleva un detalle que la
// ilustra: las banderas de los países, un anillo que se completa, las 24
// horas encendiéndose una a una y el porcentaje de comisiones ocultas que
// baja hasta cero.
//
// Las cifras tienen que ser ciertas. Los países salen de la lista de la
// plataforma, no de un número escrito a mano. El tiempo de envío lo fija la
// casa como su promedio desde que se confirma el pago. Una estadística inventada en la portada
// de un servicio de dinero es lo primero que hace desconfiar a alguien que
// después lo comprueba.

const MINUTOS_PROMEDIO = 3

// Cuenta de `desde` a `hasta` cuando `activo` pasa a true.
function useCuenta(hasta, activo, { desde = 0, ms = 1600, retraso = 0 } = {}) {
  const [v, setV] = useState(desde)
  useEffect(() => {
    if (!activo) return
    let raf, t0
    const id = setTimeout(() => {
      const paso = (t) => {
        t0 ??= t
        const p = Math.min(1, (t - t0) / ms)
        const e = 1 - Math.pow(1 - p, 3)
        setV(Math.round(desde + (hasta - desde) * e))
        if (p < 1) raf = requestAnimationFrame(paso)
      }
      raf = requestAnimationFrame(paso)
    }, retraso)
    return () => { clearTimeout(id); cancelAnimationFrame(raf) }
  }, [hasta, activo, desde, ms, retraso])
  return v
}

export default function EnNumeros() {
  const ref = useRef(null)
  const [visto, setVisto] = useState(false)
  const { receiveCountries = [] } = useCountries()

  const unicos = receiveCountries.filter((c, i, t) => c.iso2 && c.country !== 'EURO' && t.findIndex(o => o.country === c.country) === i)
  const totalPaises = unicos.length || 16

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisto(true); obs.disconnect() }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const paises = useCuenta(totalPaises, visto, { retraso: 250 })
  const minutos = useCuenta(MINUTOS_PROMEDIO, visto, { ms: 1200, retraso: 400 })
  const horas = useCuenta(24, visto, { ms: 1500, retraso: 550 })
  const comision = useCuenta(0, visto, { desde: 30, ms: 1800, retraso: 700 })

  return (
    <section ref={ref} className={`en-num${visto ? ' visto' : ''}`}>
      <style>{`
        .en-num{position:relative;z-index:2;background:#050f25;padding:88px 0 0;overflow:hidden;}
        .en-num-cab{text-align:center;padding:0 24px;margin-bottom:52px;}
        .en-num-cab>*{opacity:0;transform:translateY(20px);filter:blur(6px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1),filter .8s;}
        .en-num.visto .en-num-cab>*{opacity:1;transform:none;filter:none;}
        .en-num.visto .en-num-cab>*:nth-child(2){transition-delay:.08s;}
        .en-num-eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;}
        .en-num-titulo{margin:0;font-size:clamp(30px,3.8vw,50px);font-weight:700;letter-spacing:-.03em;color:#fff;}
        .en-num-titulo span{background:linear-gradient(120deg,#38bdf8,#818cf8 55%,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent;}

        /* La banda: de borde a borde */
        .en-banda{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
          border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);}
        .en-banda::after{content:'';position:absolute;top:0;bottom:0;left:-30%;width:25%;pointer-events:none;opacity:0;
          background:linear-gradient(100deg,transparent,rgba(125,211,252,.07),transparent);transform:skewX(-14deg);}
        .en-num.visto .en-banda::after{animation:enBarrido 2.4s .4s cubic-bezier(.4,0,.2,1) both;}

        .en-caja{--c:#38bdf8;position:relative;overflow:hidden;min-height:330px;padding:40px clamp(20px,2.6vw,40px) 34px;
          display:flex;flex-direction:column;justify-content:space-between;gap:28px;
          border-right:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.015),transparent);
          opacity:0;transform:translateY(40px);
          transition:opacity .9s cubic-bezier(.16,1,.3,1),transform 1s cubic-bezier(.16,1,.3,1),background .5s;
          transition-delay:calc(var(--i) * .12s);}
        .en-caja:last-child{border-right:none;}
        .en-num.visto .en-caja{opacity:1;transform:none;}
        /* Resplandor del color de cada cifra, que se enciende al pasar */
        .en-caja::before{content:'';position:absolute;left:50%;bottom:-160px;width:420px;height:320px;transform:translateX(-50%);border-radius:50%;
          background:radial-gradient(closest-side,color-mix(in srgb,var(--c) 30%,transparent),transparent);opacity:.35;transition:opacity .6s,transform .8s cubic-bezier(.16,1,.3,1);pointer-events:none;}
        .en-caja:hover::before{opacity:.9;transform:translateX(-50%) translateY(-30px);}
        .en-caja::after{content:'';position:absolute;left:0;right:0;top:0;height:2px;transform:scaleX(0);transform-origin:left;
          background:linear-gradient(90deg,transparent,var(--c),transparent);transition:transform .9s cubic-bezier(.16,1,.3,1);transition-delay:calc(.5s + var(--i) * .12s);}
        .en-num.visto .en-caja::after{transform:scaleX(1);}

        .en-arriba{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;}
        .en-icono{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:var(--c);
          background:color-mix(in srgb,var(--c) 12%,transparent);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);}
        .en-cifra{position:relative;margin:0;font-family:'JetBrains Mono',monospace;font-weight:700;line-height:.95;letter-spacing:-.04em;
          font-size:clamp(48px,5.4vw,84px);color:#fff;font-variant-numeric:tabular-nums;}
        .en-cifra small{font-size:.42em;letter-spacing:-.02em;color:var(--c);margin-left:4px;}
        .en-cifra em{font-style:normal;color:var(--c);}
        .en-etq{position:relative;margin:10px 0 0;font-size:15px;font-weight:600;color:#c3d2ee;}
        .en-nota{position:relative;margin:4px 0 0;font-size:12.5px;color:#7384ab;}

        /* Detalles */
        .en-banderas{display:flex;}
        .en-banderas img{width:26px;height:26px;border-radius:50%;object-fit:cover;margin-left:-8px;border:2px solid #07102a;
          opacity:0;transform:scale(.4);transition:opacity .4s,transform .5s cubic-bezier(.34,1.56,.64,1);transition-delay:calc(.8s + var(--k) * .07s);}
        .en-banderas img:first-child{margin-left:0;}
        .en-num.visto .en-banderas img{opacity:1;transform:none;}

        .en-anillo{width:44px;height:44px;transform:rotate(-90deg);}
        .en-anillo circle:last-child{stroke-dasharray:113;stroke-dashoffset:113;transition:stroke-dashoffset 1.4s cubic-bezier(.65,0,.35,1) .6s;}
        .en-num.visto .en-anillo circle:last-child{stroke-dashoffset:18;}

        .en-horas{display:flex;gap:3px;align-items:flex-end;height:26px;}
        .en-horas i{width:4px;border-radius:2px;background:rgba(255,255,255,.1);height:calc(40% + var(--h) * 60%);}
        .en-num.visto .en-horas i{animation:enHora .4s forwards;animation-delay:calc(.7s + var(--k) * .05s);}

        .en-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;font-size:11.5px;font-weight:700;color:#fde68a;
          background:rgba(252,211,77,.08);border:1px solid rgba(252,211,77,.25);opacity:0;transform:translateY(6px);transition:opacity .5s 2.4s,transform .5s 2.4s;}
        .en-num.visto .en-chip{opacity:1;transform:none;}

        @keyframes enBarrido{0%{left:-30%;opacity:0}15%{opacity:1}100%{left:120%;opacity:0}}
        @keyframes enHora{to{background:var(--c);box-shadow:0 0 6px var(--c)}}

        @media(max-width:1000px){
          .en-banda{grid-template-columns:repeat(2,minmax(0,1fr));}
          .en-caja:nth-child(2){border-right:none;}
          .en-caja:nth-child(-n+2){border-bottom:1px solid rgba(255,255,255,.08);}
          .en-caja{min-height:260px;}
        }
        @media(max-width:520px){
          .en-num{padding-top:64px;}
          .en-caja{min-height:210px;padding:24px 16px 22px;gap:18px;}
          .en-icono{width:36px;height:36px;border-radius:11px;}
          .en-banderas img{width:20px;height:20px;margin-left:-7px;}
          .en-horas{display:none;}
          .en-anillo{width:36px;height:36px;}
          .en-etq{font-size:13px;}
          .en-nota{font-size:11px;}
        }
        @media(prefers-reduced-motion:reduce){
          .en-num *,.en-num *::before,.en-num *::after{animation:none!important;transition:none!important;}
          .en-num-cab>*,.en-caja,.en-banderas img,.en-chip{opacity:1!important;transform:none!important;filter:none!important;}
        }
      `}</style>

      <div className="en-num-cab">
        <p className="en-num-eyebrow">En números</p>
        <h2 className="en-num-titulo">Resultados que <span>hablan por sí solos</span></h2>
      </div>

      <div className="en-banda">
        <div className="en-caja" style={{ '--c': '#38bdf8', '--i': 0 }}>
          <div className="en-arriba">
            <span className="en-icono">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
            </span>
            <span className="en-banderas">
              {unicos.slice(0, 6).map((c, k) => (
                <img key={c.country} src={`https://flagcdn.com/w40/${c.iso2.toLowerCase()}.png`} alt="" loading="lazy" style={{ '--k': k }} />
              ))}
            </span>
          </div>
          <div>
            <p className="en-cifra">{paises}</p>
            <p className="en-etq">Países conectados</p>
            <p className="en-nota">En Latinoamérica, Norteamérica y Europa</p>
          </div>
        </div>

        <div className="en-caja" style={{ '--c': '#4ade80', '--i': 1 }}>
          <div className="en-arriba">
            <span className="en-icono">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </span>
            <svg className="en-anillo" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="en-cifra">~{minutos}<small>min</small></p>
            <p className="en-etq">Tiempo promedio de envío</p>
            <p className="en-nota">Desde que confirmamos tu pago</p>
          </div>
        </div>

        <div className="en-caja" style={{ '--c': '#a5b4fc', '--i': 2 }}>
          <div className="en-arriba">
            <span className="en-icono">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" /></svg>
            </span>
            <span className="en-horas" aria-hidden="true">
              {Array.from({ length: 24 }, (_, k) => (
                <i key={k} style={{ '--k': k, '--h': (Math.sin(k * 0.7) + 1) / 2 }} />
              ))}
            </span>
          </div>
          <div>
            <p className="en-cifra">{horas}<em>/7</em></p>
            <p className="en-etq">Disponibilidad</p>
            <p className="en-nota">Calcula y envía cuando quieras</p>
          </div>
        </div>

        <div className="en-caja" style={{ '--c': '#fcd34d', '--i': 3 }}>
          <div className="en-arriba">
            <span className="en-icono">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
            </span>
            <span className="en-chip">Sin letra chica</span>
          </div>
          <div>
            <p className="en-cifra">{comision}<em>%</em></p>
            <p className="en-etq">Comisiones ocultas</p>
            <p className="en-nota">Ves cuánto llega antes de confirmar</p>
          </div>
        </div>
      </div>
    </section>
  )
}
