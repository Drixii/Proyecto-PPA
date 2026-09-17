import koywe from '../assets/pagos/koywe.svg'
import stripe from '../assets/pagos/stripe.svg'
import binance from '../assets/pagos/binance.svg'
import haulmer from '../assets/pagos/haulmer.svg'

// Con quién se paga un envío.
//
// Cuatro tarjetas oscuras con el logo de cada proveedor. Los de Koywe y
// Haulmer son sus logotipos completos; Stripe y Binance vienen como símbolo y
// el nombre se escribe al lado, en su color de marca, porque el símbolo solo
// no lo reconoce todo el mundo.
//
// Lo «premium» es luz, no ruido: cada tarjeta tiene el color de su marca como
// variable y lo usa en un borde que se enciende, un foco que sigue al ratón y
// un halo suave detrás del logo. Nada se mueve solo; responde a quien pasa.

const METODOS = [
  { id: 'koywe', logo: koywe, alto: 58, color: '#C8FF1E', etiqueta: 'Transferencias locales' },
  { id: 'stripe', logo: stripe, nombre: 'Stripe', alto: 38, color: '#635BFF', etiqueta: 'Tarjetas de crédito y débito' },
  { id: 'binance', logo: binance, nombre: 'BINANCE', alto: 38, color: '#F0B90B', etiqueta: 'Pagos con cripto' },
  { id: 'haulmer', logo: haulmer, alto: 30, color: '#38BDF8', etiqueta: 'Pagos en Chile' },
]

// El foco de luz se coloca con variables CSS en vez de estado de React: mover
// el ratón no vuelve a renderizar nada.
const sigueRaton = (e) => {
  const caja = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - caja.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - caja.top}px`)
}

export default function MetodosPago({ reveal = {}, revealDe = () => ({}) }) {
  return (
    <section className="section-pad metodos-pago" style={{ position: 'relative', zIndex: 2, background: 'rgba(4,10,30,.7)', overflow: 'hidden' }}>
      <style>{`
        .metodos-pago::before{content:'';position:absolute;inset:0;pointer-events:none;
          background:
            radial-gradient(600px 260px at 50% 0%,rgba(56,189,248,.12),transparent 70%),
            linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/44px 44px,
            linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/44px 44px;
          -webkit-mask-image:radial-gradient(ellipse 70% 80% at 50% 40%,#000 30%,transparent 80%);
                  mask-image:radial-gradient(ellipse 70% 80% at 50% 40%,#000 30%,transparent 80%);}

        .metodos-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;}
        .metodo{--c:#38bdf8;position:relative;isolation:isolate;border-radius:22px;padding:1px;
          background:linear-gradient(160deg,rgba(255,255,255,.14),rgba(255,255,255,.03) 45%,rgba(255,255,255,.08));
          transition:transform .5s cubic-bezier(.16,1,.3,1),box-shadow .5s;}
        /* Borde que toma el color de la marca al pasar por encima */
        .metodo::before{content:'';position:absolute;inset:0;border-radius:22px;padding:1px;z-index:-1;opacity:0;
          background:linear-gradient(160deg,var(--c),transparent 55%,var(--c));transition:opacity .5s;
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;}
        .metodo:hover{transform:translateY(-6px);box-shadow:0 24px 60px -18px color-mix(in srgb,var(--c) 45%,transparent);}
        .metodo:hover::before{opacity:1;}

        .metodo-cara{position:relative;overflow:hidden;height:100%;box-sizing:border-box;border-radius:21px;
          display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:26px;
          padding:40px 22px 24px;background:linear-gradient(180deg,rgba(12,22,52,.96),rgba(6,12,32,.98));}
        /* Foco que sigue al ratón */
        .metodo-cara::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s;
          background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--c) 16%,transparent),transparent 70%);}
        .metodo:hover .metodo-cara::before{opacity:1;}

        .metodo-logo{position:relative;height:84px;display:flex;align-items:center;justify-content:center;gap:12px;}
        .metodo-logo::after{content:'';position:absolute;left:50%;top:50%;width:150px;height:70px;transform:translate(-50%,-50%);
          border-radius:50%;z-index:-1;background:var(--c);opacity:.10;filter:blur(30px);transition:opacity .5s;}
        .metodo:hover .metodo-logo::after{opacity:.28;}
        .metodo-logo img{display:block;width:auto;max-width:100%;object-fit:contain;
          transition:transform .6s cubic-bezier(.16,1,.3,1);}
        .metodo:hover .metodo-logo img{transform:scale(1.06);}
        .metodo-nombre{font-size:30px;font-weight:800;letter-spacing:-.02em;color:#fff;line-height:1;}
        .metodo-binance .metodo-nombre{letter-spacing:.04em;color:#F0B90B;}

        .metodo-pie{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#9fb0d4;}
        .metodo-punto{width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);}

        .metodos-nota{display:flex;align-items:center;justify-content:center;gap:10px;margin:34px auto 0;
          font-size:13px;color:#8aa0cc;text-align:center;}

        @media(max-width:900px){.metodos-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media(max-width:480px){
          .metodos-grid{gap:12px;}
          .metodo-cara{padding:26px 12px 18px;gap:16px;}
          .metodo-logo{height:56px;gap:8px;}
          .metodo-logo img{transform:scale(.78);}
          .metodo:hover .metodo-logo img{transform:scale(.82);}
          .metodo-nombre{font-size:20px;}
          .metodo-pie{font-size:11px;text-align:center;}
        }
        @media(prefers-reduced-motion:reduce){.metodo,.metodo-logo img{transition:none;}.metodo:hover{transform:none;}}
      `}</style>

      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto' }}>
        <div data-reveal="" style={{ textAlign: 'center', marginBottom: 48, ...reveal }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Métodos de pago</p>
          <h2 style={{ margin: 0, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>
            Paga con quien ya confías
          </h2>
          <p style={{ margin: '14px auto 0', maxWidth: 520, fontSize: 15.5, lineHeight: 1.6, color: '#9fb0d4' }}>
            Trabajamos con procesadores líderes para que pagues tu envío de la forma que te acomode.
          </p>
        </div>

        <div className="metodos-grid">
          {METODOS.map((m, i) => (
            <div key={m.id} data-reveal="" className={`metodo metodo-${m.id}`}
              onMouseMove={sigueRaton}
              style={{ '--c': m.color, ...revealDe(i * 0.1) }}>
              <div className="metodo-cara">
                <div className="metodo-logo">
                  <img src={m.logo} alt={m.nombre || m.id} style={{ height: m.alto }} />
                  {m.nombre && <span className="metodo-nombre">{m.nombre}</span>}
                </div>
                <span className="metodo-pie"><span className="metodo-punto" />{m.etiqueta}</span>
              </div>
            </div>
          ))}
        </div>

        <p data-reveal="" className="metodos-nota" style={revealDe(0.4)}>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path strokeLinecap="round" d="M8 10.5V7.5a4 4 0 018 0v3" /></svg>
          Eliges el método al momento de pagar tu envío.
        </p>
      </div>
    </section>
  )
}
