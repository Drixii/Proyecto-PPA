import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCountries } from '../hooks/useCountries'
import api from '../services/api'

// Quiénes somos: qué hace Ksa Global y por qué conviene.
//
// A la izquierda, en pocas líneas, qué es esto y tres datos que se pueden
// comprobar —cuántos países, cada cuánto se actualizan las tasas, cómo se
// sigue un envío—. A la derecha, las cuatro ventajas en un mosaico, cada una
// con una pequeña animación que enseña lo que dice en vez de solo decirlo: la
// barra de estados que avanza, el escudo, el recibo sin sorpresas y la gráfica
// de la tasa, que es la real del dólar a bolívares.
//
// La entrada se dispara una vez, al verse. Los detalles que se repiten (la
// barra, el anillo, la gráfica) son lentos y pequeños: acompañan, no llaman.

const sigueRaton = (e) => {
  const caja = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - caja.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - caja.top}px`)
}

const num = (v) => v == null ? '—' : v >= 1000
  ? v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  : v.toLocaleString('es-CL', { maximumFractionDigits: 2 })

function Minutos() {
  return (
    <div className="qs-vis qs-estados" aria-hidden="true">
      <div className="qs-riel"><span className="qs-riel-lleno" /></div>
      {['Creado', 'En proceso', 'Completado'].map((e, i) => (
        <div key={e} className="qs-estado" style={{ '--k': i }}>
          <span className="qs-bolita">{i === 2 ? '✓' : ''}</span>
          <small>{e}</small>
        </div>
      ))}
    </div>
  )
}

function Seguridad() {
  return (
    <div className="qs-vis qs-escudo" aria-hidden="true">
      <span className="qs-anillo" />
      <span className="qs-anillo qs-anillo-2" />
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6l7-3z" fill="rgba(134,239,172,.08)" />
        <path className="qs-check" d="M8.8 12.2l2.2 2.2 4.3-4.6" />
      </svg>
    </div>
  )
}

function Recibo() {
  return (
    <div className="qs-vis qs-recibo" aria-hidden="true">
      <div className="qs-fila"><span>Tú envías</span><b>✓ a la vista</b></div>
      <div className="qs-fila"><span>Recibe</span><b>✓ a la vista</b></div>
      <div className="qs-fila qs-fila-total"><span>Sorpresas</span><b className="qs-cero">0</b></div>
    </div>
  )
}

function Tasa({ fila }) {
  return (
    <div className="qs-vis qs-tasa" aria-hidden="true">
      <div className="qs-tasa-cab">
        <span className="qs-vivo"><i />EN VIVO</span>
        {fila && (
          <span className="qs-par">
            <img src="https://flagcdn.com/w40/ve.png" alt="" /> USD → VES <b>{num(fila.rate)}</b>
          </span>
        )}
      </div>
      <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="qs-grafica">
        <defs>
          <linearGradient id="qsArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fcd34d" stopOpacity=".28" />
            <stop offset="1" stopColor="#fcd34d" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="qs-area" d="M0,52 C25,48 40,56 62,44 C84,32 100,40 122,34 C146,27 160,38 184,26 C206,15 226,24 248,16 C266,10 284,14 300,8 L300,70 L0,70 Z" fill="url(#qsArea)" />
        <path className="qs-linea" d="M0,52 C25,48 40,56 62,44 C84,32 100,40 122,34 C146,27 160,38 184,26 C206,15 226,24 248,16 C266,10 284,14 300,8" fill="none" stroke="#fcd34d" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <circle className="qs-punta" cx="300" cy="8" r="4" fill="#fcd34d" />
      </svg>
    </div>
  )
}

export default function QuienesSomos() {
  const ref = useRef(null)
  const [visto, setVisto] = useState(false)
  const { receiveCountries = [] } = useCountries()
  const { data: cinta = [] } = useQuery({
    queryKey: ['cinta-tasas'],
    queryFn: () => api.get('/rates/cinta').then(r => r.data.data),
    staleTime: 30000,
    refetchInterval: 60000,
  })
  const venezuela = cinta.find(f => f.country === 'Venezuela')
  const paises = new Set(receiveCountries.map(c => c.country).filter(c => c && c !== 'EURO')).size

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisto(true); obs.disconnect() }
    }, { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const tarjetas = [
    { clase: 'qs-t1', color: '#7dd3fc', titulo: 'Transferencias en minutos', desc: 'Procesamos tu envío al instante. Sin esperas, sin burocracia.', vis: <Minutos /> },
    { clase: 'qs-t2', color: '#86efac', titulo: 'Seguridad de nivel bancario', desc: 'Datos y dinero protegidos con cifrado y certificación.', vis: <Seguridad /> },
    { clase: 'qs-t3', color: '#a5b4fc', titulo: 'Cero comisiones ocultas', desc: 'Ves exactamente cuánto recibe tu beneficiario antes de confirmar.', vis: <Recibo /> },
    { clase: 'qs-t4', color: '#fcd34d', titulo: 'Tasas en tiempo real', desc: 'Tipos de cambio actualizados en vivo para la mejor tasa.', vis: <Tasa fila={venezuela} /> },
  ]

  return (
    <section id="nosotros" ref={ref} className={`section-pad qs${visto ? ' visto' : ''}`}>
      <style>{`
        .qs{position:relative;z-index:2;overflow:hidden;background:rgba(4,10,30,.82);scroll-margin-top:80px;}
        .qs::before{content:'';position:absolute;right:-10%;top:10%;width:720px;height:720px;border-radius:50%;pointer-events:none;
          background:radial-gradient(closest-side,rgba(99,102,241,.14),transparent);}
        .qs::after{content:'';position:absolute;left:-15%;bottom:-20%;width:620px;height:620px;border-radius:50%;pointer-events:none;
          background:radial-gradient(closest-side,rgba(56,189,248,.10),transparent);}
        .qs-in{position:relative;z-index:1;max-width:1200px;margin:0 auto;display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:64px;align-items:center;}

        /* Aparición */
        .qs-sube{opacity:0;transform:translateY(26px);filter:blur(8px);
          transition:opacity .9s cubic-bezier(.16,1,.3,1),transform 1s cubic-bezier(.16,1,.3,1),filter .9s;transition-delay:calc(var(--d,0) * 1s);}
        .qs.visto .qs-sube{opacity:1;transform:none;filter:none;}

        /* Columna de texto */
        .qs-eyebrow{margin:0 0 16px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;}
        .qs-titulo{margin:0 0 20px;font-size:clamp(32px,4vw,52px);line-height:1.05;font-weight:700;letter-spacing:-.03em;color:#fff;}
        .qs-titulo span{background:linear-gradient(120deg,#38bdf8,#818cf8 55%,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .qs-texto{margin:0 0 30px;max-width:470px;font-size:16.5px;line-height:1.7;color:#9fb0d4;}
        .qs-texto b{color:#dbe6ff;font-weight:600;}
        .qs-datos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:480px;}
        .qs-dato{padding:16px 14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);}
        .qs-dato b{display:block;font-family:'JetBrains Mono',monospace;font-size:24px;line-height:1;color:#fff;margin-bottom:6px;}
        .qs-dato small{font-size:12px;line-height:1.35;color:#8fa3cc;}

        /* Mosaico */
        .qs-mosaico{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;}
        .qs-t1,.qs-t4{grid-column:span 2;}
        .qs-card{--c:#38bdf8;position:relative;isolation:isolate;border-radius:22px;padding:1px;
          background:linear-gradient(160deg,rgba(255,255,255,.15),rgba(255,255,255,.03) 45%,rgba(255,255,255,.07));
          transition:transform .5s cubic-bezier(.16,1,.3,1),box-shadow .5s;}
        .qs-card::before{content:'';position:absolute;inset:0;border-radius:22px;padding:1px;z-index:-1;opacity:0;transition:opacity .5s;
          background:linear-gradient(160deg,var(--c),transparent 55%,var(--c));
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;}
        /* Con la clase de aparición el transform queda en none con más peso;
           el hover necesita la misma especificidad y sin el retraso de entrada. */
        .qs.visto .qs-card:hover{transform:translateY(-5px);transition-delay:0s;box-shadow:0 26px 60px -24px color-mix(in srgb,var(--c) 55%,transparent);}
        .qs-card:hover::before{opacity:1;}
        .qs-cara{position:relative;overflow:hidden;height:100%;box-sizing:border-box;border-radius:21px;padding:22px;
          background:linear-gradient(180deg,rgba(12,22,52,.96),rgba(6,12,32,.98));display:flex;gap:22px;}
        .qs-t2 .qs-cara,.qs-t3 .qs-cara{flex-direction:column;}
        .qs-t1 .qs-cara,.qs-t4 .qs-cara{align-items:center;}
        .qs-cara::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s;
          background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--c) 15%,transparent),transparent 70%);}
        .qs-card:hover .qs-cara::before{opacity:1;}
        .qs-txt{flex:1;min-width:0;}
        .qs-txt h3{margin:0 0 6px;font-size:17px;font-weight:600;color:#fff;}
        .qs-txt p{margin:0;font-size:14px;line-height:1.55;color:#9fb0d4;}
        .qs-t1 .qs-txt,.qs-t4 .qs-txt{flex:0 0 42%;}

        .qs-vis{position:relative;flex:1;min-width:0;}

        /* 1 · Estados */
        .qs-estados{display:flex;justify-content:space-between;align-items:flex-start;padding:4px 6px 0;}
        .qs-riel{position:absolute;left:24px;right:24px;top:15px;height:3px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;}
        .qs-riel-lleno{position:absolute;inset:0;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,#38bdf8,#818cf8,#4ade80);}
        .qs.visto .qs-riel-lleno{animation:qsRiel 4.5s cubic-bezier(.65,0,.35,1) 1s infinite;}
        .qs-estado{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;width:33%;}
        .qs-estado small{font-size:11.5px;font-weight:600;color:#8fa3cc;white-space:nowrap;}
        .qs-bolita{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:800;color:#052e16;
          background:#0b1638;border:2px solid rgba(255,255,255,.14);}
        .qs.visto .qs-bolita{animation:qsBolita 4.5s ease infinite;animation-delay:calc(1s + var(--k) * 1.35s);}

        /* 2 · Escudo */
        .qs-escudo{flex:1;min-height:100px;display:grid;place-items:center;}
        .qs-anillo{position:absolute;width:86px;height:86px;border-radius:50%;border:1.5px dashed rgba(134,239,172,.4);}
        .qs.visto .qs-anillo{animation:qsGira 14s linear infinite;}
        .qs-anillo-2{width:62px;height:62px;border-style:solid;border-color:rgba(134,239,172,.2);}
        .qs.visto .qs-anillo-2{animation:qsOnda 2.8s ease-out infinite;}
        .qs-check{stroke-dasharray:14;stroke-dashoffset:14;}
        .qs.visto .qs-check{animation:qsTrazo .6s .9s ease forwards;}

        /* 3 · Recibo */
        .qs-recibo{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px dashed rgba(165,180,252,.28);}
        .qs-fila{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12.5px;color:#8fa3cc;
          opacity:0;transform:translateX(-10px);transition:opacity .5s,transform .5s;}
        .qs.visto .qs-fila{opacity:1;transform:none;}
        .qs.visto .qs-fila:nth-child(1){transition-delay:.9s;} .qs.visto .qs-fila:nth-child(2){transition-delay:1.05s;} .qs.visto .qs-fila:nth-child(3){transition-delay:1.2s;}
        .qs-fila b{font-weight:700;color:#c7d2fe;}
        .qs-fila-total{margin-top:4px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);}
        .qs-cero{font-family:'JetBrains Mono',monospace;font-size:20px;color:#4ade80!important;}
        .qs.visto .qs-cero{animation:qsSalta .6s 1.5s cubic-bezier(.34,1.56,.64,1) both;}

        /* 4 · Tasa */
        .qs-tasa-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
        .qs-vivo{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;letter-spacing:.1em;color:#fcd34d;}
        .qs-vivo i{width:7px;height:7px;border-radius:50%;background:#fcd34d;box-shadow:0 0 0 0 rgba(252,211,77,.6);animation:qsPing 2s infinite;}
        .qs-par{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#8fa3cc;white-space:nowrap;}
        .qs-par img{width:16px;height:16px;border-radius:50%;object-fit:cover;}
        .qs-par b{font-family:'JetBrains Mono',monospace;font-size:15px;color:#fff;}
        .qs-grafica{display:block;width:100%;height:70px;overflow:visible;}
        .qs-linea{stroke-dasharray:420;stroke-dashoffset:420;}
        .qs.visto .qs-linea{animation:qsDibuja 1.8s 1s cubic-bezier(.65,0,.35,1) forwards;}
        .qs-area,.qs-punta{opacity:0;}
        .qs.visto .qs-area{animation:qsAparece 1s 2.2s forwards;}
        .qs.visto .qs-punta{animation:qsAparece .4s 2.7s forwards,qsLate 2s 3.1s ease-in-out infinite;transform-origin:300px 8px;transform-box:view-box;}

        @keyframes qsRiel{0%{transform:scaleX(0)}70%{transform:scaleX(1)}90%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}
        @keyframes qsBolita{0%,8%{background:#0b1638;border-color:rgba(255,255,255,.14);box-shadow:none}
          16%,85%{background:#4ade80;border-color:#86efac;box-shadow:0 0 18px rgba(74,222,128,.55)}100%{background:#0b1638;border-color:rgba(255,255,255,.14);box-shadow:none}}
        @keyframes qsGira{to{transform:rotate(360deg)}}
        @keyframes qsOnda{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.6);opacity:0}}
        @keyframes qsTrazo{to{stroke-dashoffset:0}}
        @keyframes qsSalta{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
        @keyframes qsPing{0%{box-shadow:0 0 0 0 rgba(252,211,77,.55)}70%{box-shadow:0 0 0 7px rgba(252,211,77,0)}100%{box-shadow:0 0 0 0 rgba(252,211,77,0)}}
        @keyframes qsDibuja{to{stroke-dashoffset:0}}
        @keyframes qsAparece{to{opacity:1}}
        @keyframes qsLate{0%,100%{transform:scale(1)}50%{transform:scale(1.5)}}

        @media(max-width:980px){.qs-in{grid-template-columns:1fr;gap:44px;}.qs-texto,.qs-datos{max-width:none;}}
        @media(max-width:600px){
          .qs-mosaico{grid-template-columns:1fr;gap:12px;}
          .qs-t1,.qs-t4{grid-column:auto;}
          .qs-t1 .qs-cara,.qs-t4 .qs-cara{flex-direction:column;align-items:stretch;}
          .qs-t1 .qs-txt,.qs-t4 .qs-txt{flex:none;}
          .qs-cara{padding:18px;gap:16px;}
          .qs-datos{gap:8px;}
          .qs-dato{padding:12px 10px;}
          .qs-dato b{font-size:19px;}
          .qs-dato small{font-size:11px;}
        }
        @media(prefers-reduced-motion:reduce){
          .qs *,.qs *::before{animation:none!important;transition:none!important;}
          .qs-sube,.qs-fila,.qs-area,.qs-punta{opacity:1!important;transform:none!important;filter:none!important;}
          .qs-linea,.qs-check{stroke-dashoffset:0;}
        }
      `}</style>

      <div className="qs-in">
        <div>
          <p className="qs-eyebrow qs-sube">Quiénes somos</p>
          <h2 className="qs-titulo qs-sube" style={{ '--d': .08 }}>
            Movemos tu dinero <span>entre países</span>, sin fricción
          </h2>
          <p className="qs-texto qs-sube" style={{ '--d': .16 }}>
            Ksa Global es una plataforma para <b>enviar dinero a Latinoamérica y el mundo</b> desde
            tu celular. Calculas con la tasa del momento, ves cuánto recibe la otra persona antes
            de pagar y sigues tu envío paso a paso hasta que llega.
          </p>
          <div className="qs-datos">
            <div className="qs-dato qs-sube" style={{ '--d': .26 }}>
              <b>{paises || '—'}</b><small>países de destino</small>
            </div>
            <div className="qs-dato qs-sube" style={{ '--d': .34 }}>
              <b>5 min</b><small>cada cuánto se actualizan las tasas</small>
            </div>
            <div className="qs-dato qs-sube" style={{ '--d': .42 }}>
              <b>24/7</b><small>seguimiento con notificaciones</small>
            </div>
          </div>
        </div>

        <div className="qs-mosaico">
          {tarjetas.map((t, i) => (
            <div key={t.titulo} className={`qs-card qs-sube ${t.clase}`} onMouseMove={sigueRaton}
              style={{ '--c': t.color, '--d': .2 + i * .12 }}>
              <div className="qs-cara">
                <div className="qs-txt">
                  <h3>{t.titulo}</h3>
                  <p>{t.desc}</p>
                </div>
                {t.vis}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
