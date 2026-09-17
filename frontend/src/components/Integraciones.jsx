import { useEffect, useRef, useState } from 'react'
import koywe from '../assets/pagos/koywe.svg'
import stripe from '../assets/pagos/stripe.svg'
import binance from '../assets/pagos/binance.svg'
import haulmer from '../assets/pagos/haulmer.svg'
import logoSrc from '../assets/logo.png'

// Integraciones: con quién está conectada la plataforma.
//
// Un centro con el logo de Ksa Global y las cuatro integraciones alrededor,
// unidas por líneas por las que viajan pulsos de luz hacia el centro. Es la
// forma habitual de enseñar «esto está conectado con aquello» sin una lista.
//
// La entrada se dispara la primera vez que la sección se ve: el centro
// aparece, las tarjetas llegan desde los lados y las líneas se dibujan hacia
// el centro; después empiezan los pulsos. Antes de eso no se anima nada, para
// no gastar la animación en algo que todavía está fuera de pantalla.

export const INTEGRACIONES = [
  { id: 'koywe', logo: koywe, alto: 50, color: '#C8FF1E', titulo: 'Koywe', desc: 'Transferencias y pagos locales en Latinoamérica.' },
  { id: 'stripe', logo: stripe, nombre: 'Stripe', alto: 34, color: '#635BFF', titulo: 'Stripe', desc: 'Cobros con tarjetas de crédito y débito.' },
  { id: 'binance', logo: binance, nombre: 'BINANCE', alto: 34, color: '#F0B90B', titulo: 'Binance', desc: 'Tasas de mercado P2P en tiempo real.' },
  { id: 'haulmer', logo: haulmer, alto: 26, color: '#38BDF8', titulo: 'Haulmer', desc: 'Soluciones de pago para Chile.' },
]

// Curvas de cada tarjeta al centro, en un lienzo de 1000×460 que se estira al
// ancho real. Izquierda arriba, izquierda abajo, derecha arriba, derecha abajo.
const CURVAS = [
  'M318,118 C392,118 392,230 432,230',
  'M318,342 C392,342 392,230 432,230',
  'M682,118 C608,118 608,230 568,230',
  'M682,342 C608,342 608,230 568,230',
]

const sigueRaton = (e) => {
  const caja = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - caja.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - caja.top}px`)
}

function Tarjeta({ m, lado, i }) {
  return (
    <div className={`int-tarjeta int-${lado}`} style={{ '--c': m.color, '--i': i }} onMouseMove={sigueRaton}>
      <div className="int-cara">
        <div className="int-logo">
          <img src={m.logo} alt={m.titulo} style={{ height: m.alto }} />
          {m.nombre && <span className={`int-nombre int-nombre-${m.id}`}>{m.nombre}</span>}
        </div>
        <p className="int-desc">{m.desc}</p>
        <span className="int-estado"><span className="int-punto" />Conectado</span>
      </div>
    </div>
  )
}

export default function Integraciones() {
  const ref = useRef(null)
  const [visto, setVisto] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisto(true); obs.disconnect() }
    }, { threshold: 0.25 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const [a, b, c, d] = INTEGRACIONES

  return (
    <section id="integraciones" ref={ref} className={`section-pad integraciones${visto ? ' visto' : ''}`}>
      <style>{`
        .integraciones{position:relative;z-index:2;overflow:hidden;background:#0c1b3a;}
        .integraciones::before{content:'';position:absolute;inset:0;pointer-events:none;
          background:
            radial-gradient(520px 320px at 50% 55%,rgba(56,189,248,.14),transparent 70%),
            linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px) 0 0/46px 46px,
            linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/46px 46px;
          -webkit-mask-image:radial-gradient(ellipse 65% 75% at 50% 55%,#000 25%,transparent 78%);
                  mask-image:radial-gradient(ellipse 65% 75% at 50% 55%,#000 25%,transparent 78%);}

        /* Cabecera */
        .int-cab{text-align:center;margin-bottom:56px;}
        .int-cab>*{opacity:0;transform:translateY(22px);filter:blur(6px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1),filter .8s;}
        .integraciones.visto .int-cab>*{opacity:1;transform:none;filter:none;}
        .integraciones.visto .int-cab>*:nth-child(2){transition-delay:.08s;}
        .integraciones.visto .int-cab>*:nth-child(3){transition-delay:.16s;}
        .int-eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;}
        .int-titulo{margin:0;font-size:clamp(30px,3.8vw,48px);font-weight:700;letter-spacing:-.025em;color:#fff;line-height:1.1;}
        .int-titulo span{background:linear-gradient(120deg,#38bdf8,#818cf8 60%,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .int-sub{margin:16px auto 0;max-width:540px;font-size:16px;line-height:1.6;color:#9fb0d4;}

        /* Escena */
        .int-escena{position:relative;max-width:1000px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 260px minmax(0,1fr);
          grid-template-rows:repeat(2,minmax(0,1fr));column-gap:48px;row-gap:28px;min-height:460px;}
        .int-lineas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;}
        .int-base{fill:none;stroke:rgba(125,211,252,.16);stroke-width:1.5;stroke-dasharray:4 6;}
        .int-trazo{fill:none;stroke-width:2;stroke-linecap:round;stroke-dasharray:420;stroke-dashoffset:420;opacity:.65;}
        .integraciones.visto .int-trazo{animation:intDibuja 1.1s cubic-bezier(.65,0,.35,1) forwards;animation-delay:calc(.55s + var(--i) * .12s);}
        .int-pulso{fill:none;stroke-width:3;stroke-linecap:round;stroke-dasharray:26 400;stroke-dashoffset:426;opacity:0;filter:drop-shadow(0 0 6px currentColor);}
        .integraciones.visto .int-pulso{animation:intPulso 2.6s cubic-bezier(.45,0,.55,1) infinite;animation-delay:calc(1.7s + var(--i) * .65s);}

        .int-hueco{align-self:center;}
        .int-h0{grid-column:1;grid-row:1;} .int-h1{grid-column:1;grid-row:2;}
        .int-h2{grid-column:3;grid-row:1;} .int-h3{grid-column:3;grid-row:2;}

        /* Centro */
        .int-centro{grid-column:2;grid-row:1 / span 2;align-self:center;justify-self:center;position:relative;width:180px;height:180px;
          opacity:0;transform:scale(.6);transition:opacity .8s,transform 1s cubic-bezier(.34,1.56,.64,1);transition-delay:.2s;}
        .integraciones.visto .int-centro{opacity:1;transform:none;}
        .int-anillo{position:absolute;inset:0;border-radius:50%;padding:2px;
          background:conic-gradient(from 0deg,#38bdf8,#818cf8,#C8FF1E,#F0B90B,#635BFF,#38bdf8);
          -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 2px));
                  mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 2px));
          animation:intGira 9s linear infinite;}
        .int-onda{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(56,189,248,.45);opacity:0;}
        .integraciones.visto .int-onda{animation:intOnda 3.2s ease-out infinite;}
        .integraciones.visto .int-onda:nth-child(3){animation-delay:1.6s;}
        .int-nucleo{position:absolute;inset:14px;border-radius:50%;display:grid;place-items:center;
          background:radial-gradient(circle at 35% 30%,rgba(56,189,248,.35),rgba(8,18,48,.98) 62%);
          box-shadow:0 0 60px rgba(56,189,248,.35),inset 0 1px 0 rgba(255,255,255,.2),inset 0 -10px 30px rgba(0,0,0,.4);}
        .int-nucleo img{width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 0 14px rgba(56,189,248,.6));animation:intFlota 6s ease-in-out infinite;}
        .int-marca{position:absolute;left:50%;top:calc(100% + 14px);transform:translateX(-50%);white-space:nowrap;text-align:center;}
        .int-marca b{display:block;font-size:14px;color:#fff;}
        .int-marca small{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;}

        /* Tarjetas */
        .int-tarjeta{--c:#38bdf8;position:relative;z-index:1;border-radius:20px;padding:1px;isolation:isolate;
          background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.03) 45%,rgba(255,255,255,.08));
          opacity:0;filter:blur(8px);
          transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1),filter .8s,box-shadow .5s;
          transition-delay:calc(.3s + var(--i) * .1s);}
        .int-izq{transform:translateX(-60px);} .int-der{transform:translateX(60px);}
        .integraciones.visto .int-tarjeta{opacity:1;filter:none;transform:none;}
        .integraciones.visto .int-tarjeta:hover{transform:translateY(-6px);transition-delay:0s;
          box-shadow:0 26px 60px -20px color-mix(in srgb,var(--c) 55%,transparent);}
        .int-tarjeta::before{content:'';position:absolute;inset:0;border-radius:20px;padding:1px;z-index:-1;opacity:0;
          background:linear-gradient(160deg,var(--c),transparent 55%,var(--c));transition:opacity .5s;
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;}
        .int-tarjeta:hover::before{opacity:1;}
        .int-cara{position:relative;overflow:hidden;height:100%;box-sizing:border-box;border-radius:19px;padding:22px 22px 18px;
          display:flex;flex-direction:column;gap:12px;background:linear-gradient(180deg,rgba(12,22,52,.97),rgba(6,12,32,.99));}
        .int-cara::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s;
          background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--c) 18%,transparent),transparent 70%);}
        .int-tarjeta:hover .int-cara::before{opacity:1;}
        /* Destello al llegar */
        .int-cara::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:45%;pointer-events:none;transform:skewX(-18deg);opacity:0;
          background:linear-gradient(100deg,transparent,rgba(255,255,255,.1),transparent);}
        .integraciones.visto .int-cara::after{animation:intDestello 1.2s cubic-bezier(.4,0,.2,1) both;animation-delay:calc(.8s + var(--i) * .12s);}

        .int-logo{height:52px;display:flex;align-items:center;gap:10px;}
        .int-logo img{display:block;width:auto;max-width:100%;transition:transform .6s cubic-bezier(.16,1,.3,1);}
        .int-tarjeta:hover .int-logo img{transform:scale(1.06);}
        .int-nombre{font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff;line-height:1;}
        .int-nombre-binance{letter-spacing:.04em;color:#F0B90B;}
        .int-desc{margin:0;font-size:13.5px;line-height:1.55;color:#9fb0d4;}
        .int-estado{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:#86efac;}
        .int-punto{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:intPing 2s infinite;}

        @keyframes intDibuja{to{stroke-dashoffset:0}}
        @keyframes intPulso{0%{stroke-dashoffset:426;opacity:0}12%{opacity:1}85%{opacity:1}100%{stroke-dashoffset:0;opacity:0}}
        @keyframes intGira{to{transform:rotate(360deg)}}
        @keyframes intOnda{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.7);opacity:0}}
        @keyframes intFlota{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes intDestello{0%{left:-60%;opacity:0}20%{opacity:1}100%{left:130%;opacity:0}}
        @keyframes intPing{0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
        @keyframes intLatido{0%,100%{opacity:1}50%{opacity:.35}}

        @media(max-width:860px){
          .int-escena{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:auto;column-gap:12px;row-gap:12px;min-height:0;}
          .int-lineas{display:none;}
          .int-hueco{align-self:stretch;}
          .int-hueco>.int-tarjeta{height:100%;}
          .int-h0{grid-column:1;grid-row:2;} .int-h1{grid-column:2;grid-row:2;}
          .int-h2{grid-column:1;grid-row:3;} .int-h3{grid-column:2;grid-row:3;}
          .int-centro{grid-column:1 / -1;grid-row:1;width:130px;height:130px;margin-bottom:62px;}
          .int-nucleo img{width:54px;height:54px;}
          .int-izq,.int-der{transform:translateY(30px);}
          .int-cara{padding:16px 14px 14px;gap:9px;}
          .int-logo{height:40px;}
          .int-logo img{max-height:30px;}
          .int-nombre{font-size:18px;}
          .int-desc{font-size:12px;}
        }
        @media(prefers-reduced-motion:reduce){
          .integraciones *,.integraciones *::before,.integraciones *::after{animation:none!important;transition:none!important;}
          .int-cab>*,.int-tarjeta,.int-centro{opacity:1!important;transform:none!important;filter:none!important;}
          .int-trazo{stroke-dashoffset:0;}
        }
      `}</style>

      <div className="int-cab">
        <p className="int-eyebrow">Integraciones</p>
        <h2 className="int-titulo">Conectados con <span>los mejores</span></h2>
        <p className="int-sub">Trabajamos con plataformas líderes para que tu dinero se mueva rápido, seguro y a la tasa real.</p>
      </div>

      <div className="int-escena">
        <svg className="int-lineas" viewBox="0 0 1000 460" preserveAspectRatio="none" aria-hidden="true">
          {CURVAS.map((curva, i) => {
            const color = [a, b, c, d][i].color
            return (
              <g key={i} style={{ '--i': i, color }}>
                <path d={curva} className="int-base" vectorEffect="non-scaling-stroke" />
                <path d={curva} className="int-trazo" stroke={color} vectorEffect="non-scaling-stroke" />
                <path d={curva} className="int-pulso" stroke={color} vectorEffect="non-scaling-stroke" />
              </g>
            )
          })}
        </svg>

        <div className="int-hueco int-h0"><Tarjeta m={a} lado="izq" i={0} /></div>
        <div className="int-hueco int-h1"><Tarjeta m={b} lado="izq" i={1} /></div>

        <div className="int-centro">
          <span className="int-anillo" />
          <span className="int-onda" />
          <span className="int-onda" />
          <span className="int-nucleo"><img src={logoSrc} alt="Ksa Global" /></span>
          <span className="int-marca"><b>Ksa Global</b><small>Hub de pagos</small></span>
        </div>

        <div className="int-hueco int-h2"><Tarjeta m={c} lado="der" i={2} /></div>
        <div className="int-hueco int-h3"><Tarjeta m={d} lado="der" i={3} /></div>
      </div>
    </section>
  )
}
