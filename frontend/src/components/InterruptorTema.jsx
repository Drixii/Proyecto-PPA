import { useState } from 'react'
import { alternarTema, temaActual } from '../utils/tema'

// Sol y luna para cambiar entre modo claro y oscuro.
//
// Un solo botón con las dos figuras dentro: la que está fuera de uso se va
// hacia arriba girando mientras entra la otra. Así se ve de un vistazo a qué
// modo se cambia, sin texto que traducir.
export default function InterruptorTema({ className = '' }) {
  const [tema, setTema] = useState(temaActual)
  const claro = tema === 'claro'

  return (
    <button
      type="button"
      className={`interruptor-tema ${className}`}
      onClick={() => setTema(alternarTema())}
      aria-label={claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={claro ? 'Modo oscuro' : 'Modo claro'}
      aria-pressed={claro}
    >
      <style>{`
        .interruptor-tema{position:relative;width:38px;height:38px;flex-shrink:0;border-radius:50%;cursor:pointer;
          display:grid;place-items:center;overflow:hidden;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#e2ecff;
          transition:background .25s,border-color .25s,color .25s,transform .25s;}
        .interruptor-tema:hover{transform:scale(1.06);background:rgba(56,189,248,.14);border-color:rgba(56,189,248,.45);}
        .interruptor-tema svg{grid-area:1/1;transition:transform .45s cubic-bezier(.16,1,.3,1),opacity .35s;}
        .interruptor-tema .fuera{opacity:0;transform:translateY(-130%) rotate(-90deg);}
        html[data-tema="claro"] .interruptor-tema{background:rgba(11,28,63,.05);border-color:rgba(11,28,63,.14);color:#0b1c3f;}
        html[data-tema="claro"] .interruptor-tema:hover{background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.4);}
        @media(prefers-reduced-motion:reduce){.interruptor-tema,.interruptor-tema svg{transition:none;}}
      `}</style>

      {/* Luna: lleva al modo oscuro, así que se ve cuando estás en claro. */}
      <svg className={claro ? '' : 'fuera'} width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>

      {/* Sol: lleva al modo claro. */}
      <svg className={claro ? 'fuera' : ''} width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
    </button>
  )
}
