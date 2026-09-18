import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useCountries } from '../hooks/useCountries'
import { INTEGRACIONES } from './Integraciones'
import logoSrc from '../assets/logo.png'

// Pie de la portada.
//
// Tres pisos: arriba la marca y los enlaces en columnas; en medio la franja
// de integraciones y «Hecho con ♥ en LATAM»; abajo el copyright y el botón
// para volver arriba.
//
// Solo enlaza a lo que existe. No hay páginas legales ni redes sociales
// publicadas, así que no se ponen: un enlace de «Términos» que lleva a la
// portada o un Instagram inventado resta más confianza de la que da.

const irA = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function PiePagina() {
  const navigate = useNavigate()
  const { user } = useStore()
  const { receiveCountries = [] } = useCountries()

  // Un país por moneda basta para la lista de destinos.
  const destinos = receiveCountries.filter((c, i, todos) =>
    c.iso2 && todos.findIndex(o => o.country === c.country) === i).slice(0, 12)

  const panel = user?.role === 'admin' ? '/admin' : user?.role === 'sub_admin' ? '/sub-admin' : '/dashboard'

  return (
    <footer className="pie">
      <style>{`
        .pie{position:relative;z-index:2;overflow:hidden;
          /* La raya de 1px que había arriba cortaba en seco la sección anterior.
             Arranca en el tono con que termina la sección de reseñas —su
             resplandor de fondo llega hasta el borde— y baja de ahí. */
          background:linear-gradient(180deg,#07142f,#050f25 150px,#030817 60%);}
        .pie::before{content:'';position:absolute;left:50%;top:-1px;width:min(900px,80%);height:1px;transform:translateX(-50%);
          background:linear-gradient(90deg,transparent,rgba(56,189,248,.7),rgba(129,140,248,.7),transparent);}
        .pie::after{content:'';position:absolute;left:50%;top:-220px;width:900px;height:360px;transform:translateX(-50%);pointer-events:none;
          background:radial-gradient(closest-side,rgba(56,189,248,.10),transparent);}
        .pie-in{position:relative;max-width:1200px;margin:0 auto;padding:0 24px;}

        .pie-top{display:grid;grid-template-columns:1.5fr 1fr 1fr 1.3fr;gap:48px;padding:64px 0 48px;}
        .pie-marca{display:flex;align-items:center;gap:11px;margin-bottom:18px;}
        .pie-marca img{width:42px;height:42px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(56,189,248,.45));}
        .pie-marca b{display:block;font-size:17px;color:#fff;}
        .pie-marca small{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
          background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .pie-lema{margin:0 0 22px;max-width:340px;font-size:14.5px;line-height:1.65;color:#8fa3cc;}
        .pie-cta{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:12px;border:none;cursor:pointer;
          font:700 14px 'Space Grotesk',system-ui,sans-serif;color:#061027;background:linear-gradient(135deg,#7dd3fc,#38bdf8);
          box-shadow:0 10px 26px rgba(56,189,248,.35);transition:transform .25s,box-shadow .25s;}
        .pie-cta:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(56,189,248,.5);}
        .pie-cta span{transition:transform .25s;} .pie-cta:hover span{transform:translateX(3px);}

        .pie-col h4{margin:4px 0 18px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e2ecff;}
        .pie-col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;}
        .pie-enlace{position:relative;display:inline-block;padding:0;border:none;background:none;cursor:pointer;
          font:500 14.5px 'Space Grotesk',system-ui,sans-serif;color:#8fa3cc;transition:color .2s;}
        .pie-enlace::after{content:'';position:absolute;left:0;bottom:-3px;height:1px;width:100%;transform:scaleX(0);transform-origin:left;
          background:linear-gradient(90deg,#38bdf8,#818cf8);transition:transform .3s cubic-bezier(.16,1,.3,1);}
        .pie-enlace:hover{color:#fff;} .pie-enlace:hover::after{transform:scaleX(1);}

        .pie-paises{display:flex;flex-wrap:wrap;gap:8px;}
        .pie-pais{display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 6px;border-radius:999px;font-size:12px;font-weight:600;color:#aebfe2;
          background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);transition:background .2s,border-color .2s,transform .2s;}
        .pie-pais:hover{background:rgba(56,189,248,.1);border-color:rgba(56,189,248,.3);transform:translateY(-1px);}
        .pie-pais img{width:16px;height:16px;border-radius:50%;object-fit:cover;}

        /* Franja: integraciones y hecho en LATAM */
        .pie-franja{display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap;padding:30px 0;
          border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07);}
        .pie-rotulo{margin:0 0 14px;font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7f93bf;display:flex;align-items:center;gap:8px;}
        .pie-logos{display:flex;align-items:center;gap:28px;flex-wrap:wrap;}
        .pie-logo{display:inline-flex;align-items:center;gap:7px;opacity:.55;filter:grayscale(1) brightness(1.6);transition:opacity .3s,filter .3s,transform .3s;}
        .pie-logo:hover{opacity:1;filter:none;transform:translateY(-2px);}
        .pie-logo img{display:block;width:auto;}
        .pie-logo span{font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em;}
        .pie-logo-binance span{color:#F0B90B;letter-spacing:.04em;}

        .pie-latam{text-align:right;}
        .pie-latam .pie-rotulo{justify-content:flex-end;}
        .pie-corazon{color:#f43f5e;display:inline-block;animation:pieLate 1.6s ease-in-out infinite;}
        .pie-chile{display:inline-flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:14px;
          background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08);}
        .pie-chile img{width:34px;height:24px;border-radius:5px;object-fit:cover;box-shadow:0 4px 12px rgba(0,0,0,.35);}
        .pie-chile b{display:block;font-size:15px;color:#fff;line-height:1.1;}
        .pie-chile small{font-size:11px;color:#8fa3cc;}

        /* Base */
        .pie-base{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0 28px;}
        .pie-copy{flex:1;min-width:0;margin:0;font-size:13px;color:#7384ab;}
        .pie-arriba{flex-shrink:0;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#cfe3ff;
          background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);transition:transform .3s,background .3s,border-color .3s,color .3s;}
        .pie-arriba:hover{transform:translateY(-4px);background:rgba(56,189,248,.14);border-color:rgba(56,189,248,.45);color:#fff;}

        @keyframes pieLate{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}30%{transform:scale(1)}45%{transform:scale(1.15)}}

        @media(max-width:960px){.pie-top{grid-template-columns:1fr 1fr;gap:36px;}}
        @media(max-width:600px){
          .pie-top{grid-template-columns:1fr 1fr;gap:30px 20px;padding:48px 0 36px;}
          .pie-top>div:first-child,.pie-top>div:last-child{grid-column:1 / -1;}
          .pie-franja{flex-direction:column;align-items:flex-start;gap:24px;}
          .pie-latam{text-align:left;} .pie-latam .pie-rotulo{justify-content:flex-start;}
          .pie-logos{gap:20px;}
          .pie-base{padding-bottom:calc(28px + env(safe-area-inset-bottom, 0px));}
        }
        @media(prefers-reduced-motion:reduce){.pie *{animation:none!important;transition:none!important;}}
      `}</style>

      <div className="pie-in">
        <div className="pie-top">
          <div>
            <div className="pie-marca">
              <img src={logoSrc} alt="" />
              <div><b>Ksa Global</b><small>Evolution</small></div>
            </div>
            <p className="pie-lema">
              Transferencias internacionales en minutos, con tasas en tiempo real y sin comisiones ocultas.
            </p>
            {user ? (
              <button className="pie-cta" onClick={() => navigate(panel)}>Ir a mi panel <span>→</span></button>
            ) : (
              <button className="pie-cta" onClick={() => navigate('/login', { state: { mode: 'register' } })}>Crear cuenta gratis <span>→</span></button>
            )}
          </div>

          <div className="pie-col">
            <h4>Producto</h4>
            <ul>
              <li><button className="pie-enlace" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Calcular envío</button></li>
              <li><button className="pie-enlace" onClick={() => irA('como')}>Cómo funciona</button></li>
              <li><button className="pie-enlace" onClick={() => irA('integraciones')}>Integraciones</button></li>
            </ul>
          </div>

          <div className="pie-col">
            <h4>Cuenta</h4>
            <ul>
              {user ? (
                <li><button className="pie-enlace" onClick={() => navigate(panel)}>Mi panel</button></li>
              ) : (
                <>
                  <li><button className="pie-enlace" onClick={() => navigate('/login')}>Iniciar sesión</button></li>
                  <li><button className="pie-enlace" onClick={() => navigate('/login', { state: { mode: 'register' } })}>Crear cuenta</button></li>
                </>
              )}
            </ul>
          </div>

          {destinos.length > 0 && (
            <div className="pie-col">
              <h4>Enviamos a</h4>
              <div className="pie-paises">
                {destinos.map(c => (
                  <span key={c.country} className="pie-pais">
                    <img src={`https://flagcdn.com/w40/${c.iso2.toLowerCase()}.png`} alt="" loading="lazy" />
                    {/* El euro está dado de alta como «país» EURO. */}
                    {c.country === 'EURO' ? 'Europa' : c.country}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pie-franja">
          <div>
            <p className="pie-rotulo">Integraciones</p>
            <div className="pie-logos">
              {INTEGRACIONES.map(m => (
                <span key={m.id} className={`pie-logo pie-logo-${m.id}`} title={m.titulo}>
                  <img src={m.logo} alt={m.titulo} style={{ height: Math.round(m.alto * 0.52) }} />
                  {m.nombre && <span>{m.nombre}</span>}
                </span>
              ))}
            </div>
          </div>

          <div className="pie-latam">
            <p className="pie-rotulo">Hecho con <span className="pie-corazon">♥</span> en LATAM</p>
            <span className="pie-chile">
              <img src="https://flagcdn.com/w80/cl.png" alt="" />
              <span><b>Chile</b><small>Latinoamérica</small></span>
            </span>
          </div>
        </div>

        <div className="pie-base">
          <p className="pie-copy">Copyright © {new Date().getFullYear()} Ksa Global — Todos los derechos reservados</p>
          <button className="pie-arriba" aria-label="Volver arriba" title="Volver arriba"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </div>
    </footer>
  )
}
