import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import CalculatorDark from '../components/CalculatorDark'
import api from '../services/api'
import logoSrc from '../assets/logo.png'

/**
 * La calculadora sola, en un enlace que se comparte.
 *
 * Es la misma de la portada —los mismos desplegables, la misma consulta de
 * tasas— pero sin el resto de la página: se abre, se calcula y se manda el
 * cálculo por WhatsApp al número del super admin dueño del enlace. Pensada
 * para el móvil, que es donde se va a abrir: se le pasa por WhatsApp a
 * alguien y lo abre ahí mismo.
 *
 * El código del enlace dice de quién es. Lo único que cambia de un enlace a
 * otro es el número de WhatsApp: las comisiones son globales, así que las
 * cifras son las mismas en todos.
 */
export default function CalculadoraPublica() {
  const { codigo } = useParams()
  const navigate = useNavigate()
  const [user] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })

  const { data: dueno, isError } = useQuery({
    queryKey: ['calculadora', codigo],
    queryFn: () => api.get(`/rates/calculadora/${codigo}`).then(r => r.data.data),
    retry: false,
  })

  const numero = dueno?.whatsapp || ''

  // Lo que se le manda al super admin. Las dos cifras y los dos países: con
  // eso puede contestar sin preguntar nada más, que es para lo que sirve.
  const mandarPorWhatsapp = ({ fromCurrency, fromCountry, toCountry, toCurrency, result }) => {
    if (!numero || !result) return
    const miles = (n, moneda) => new Intl.NumberFormat('es-CL', {
      maximumFractionDigits: ['CLP', 'COP', 'VES', 'ARS', 'PYG'].includes(moneda) ? 0 : 2,
    }).format(n || 0)

    const texto = [
      '¡Hola! Hice este cálculo en la calculadora:',
      '',
      `Envío ${miles(result.amount_sent, fromCurrency)} ${fromCurrency} desde ${fromCountry}`,
      `Recibe ${miles(result.amount_received, toCurrency)} ${toCurrency} en ${toCountry}`,
      '',
      '¿Me ayudas con el envío?',
    ].join('\n')

    // _blank y no location: en el móvil WhatsApp abre su aplicación y quien
    // vuelve atrás se encuentra la calculadora como la dejó, con sus cifras.
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  const iconoWhatsapp = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.04 21.5h-.01a9.47 9.47 0 0 1-4.82-1.32l-.35-.2-3.58.94.96-3.49-.23-.36a9.42 9.42 0 0 1-1.45-5.04c0-5.22 4.26-9.47 9.49-9.47 2.53 0 4.91.99 6.7 2.78a9.4 9.4 0 0 1 2.77 6.7c0 5.22-4.26 9.46-9.48 9.46m8.07-17.53A11.36 11.36 0 0 0 12.04.75C5.76.75.66 5.85.66 12.11c0 2 .52 3.96 1.52 5.68L.56 23.25l5.6-1.47a11.38 11.38 0 0 0 5.88 1.6h.01c6.28 0 11.38-5.1 11.39-11.37a11.3 11.3 0 0 0-3.33-8.04" />
    </svg>
  )

  const btnSesion = {
    padding: '9px 15px', fontSize: 13.5, fontWeight: 500, color: '#dbe6ff',
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
    borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  }
  const btnCrear = {
    padding: '9px 16px', fontSize: 13.5, fontWeight: 600, color: '#061027',
    background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: 'none',
    borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    boxShadow: '0 8px 24px rgba(56,189,248,.4)',
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#050b1f', color: '#eaf2ff',
      fontFamily: "'Space Grotesk',system-ui,sans-serif",
      // El teclado del móvil y la barra del navegador se comen altura: con
      // dvh y el padding de abajo el botón no queda nunca debajo del borde.
      paddingBottom: 'calc(28px + env(safe-area-inset-bottom))',
    }}>
      <style>{`
        .calc-pub-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;
          padding:14px 16px;padding-top:calc(14px + env(safe-area-inset-top));
          position:sticky;top:0;z-index:60;background:rgba(5,11,31,.82);
          backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
          border-bottom:1px solid rgba(255,255,255,.07)}
        .calc-pub-marca p{margin:0}
        @media(max-width:420px){
          .calc-pub-marca{display:none}
          .calc-pub-nav button{padding:8px 12px!important;font-size:12.5px!important}
        }
        /* En esta pantalla la calculadora es lo único que hay, así que puede
           ocupar lo que en la portada le quitaba el resto de la página. */
        .calc-pub .calc-dark-wrap .calc-card{padding:20px 18px!important;border-radius:26px!important}
        .calc-pub .calc-dark-wrap .calc-amount,
        .calc-pub .calc-dark-wrap .calc-received{font-size:30px!important}
        .calc-pub .calc-dark-wrap .calc-panel{padding:14px 15px!important;border-radius:18px!important}
        .calc-pub .calc-dark-wrap .calc-cta{padding:16px!important;font-size:16px!important}
        .calc-pub .calc-dark-wrap .calc-footer{display:block!important}
        /* El titulo ya esta arriba en grande: dentro de la tarjeta sobraba y
           se leia dos veces seguidas. Se queda el "EN VIVO", pegado a la
           derecha, que es donde estaba. */
        .calc-pub .calc-dark-wrap .calc-title{display:none}
        .calc-pub .calc-dark-wrap .calc-header{justify-content:flex-end!important}
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(900px 600px at 75% -5%,rgba(37,99,235,.30),transparent 60%),radial-gradient(700px 700px at 6% 18%,rgba(56,189,248,.14),transparent 60%)',
      }} />

      <nav className="calc-pub-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src={logoSrc} alt="Ksa Global" style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(56,189,248,.5))' }} />
          <div className="calc-pub-marca">
            <p style={{ fontWeight: 700, fontSize: 14.5, color: '#fff' }}>Ksa Global</p>
            <p style={{
              fontSize: '9px', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase',
              background: 'linear-gradient(90deg,#38bdf8,#818cf8)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>EVOLUTION</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user ? (
            <button style={btnCrear}
              onClick={() => navigate(user.role === 'admin' ? '/admin' : user.role === 'sub_admin' ? '/sub-admin' : '/dashboard')}>
              Mi panel →
            </button>
          ) : (
            <>
              <button style={btnSesion} onClick={() => navigate('/login')}>Iniciar sesión</button>
              <button style={btnCrear} onClick={() => navigate('/login', { state: { mode: 'register' } })}>Registrarse</button>
            </>
          )}
        </div>
      </nav>

      <main className="calc-pub" style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 18, padding: '26px 16px 0',
        // Centrada en la pantalla: es lo unico que hay, y abajo quedaba un
        // hueco del tamano de la calculadora entera.
        justifyContent: 'center', minHeight: 'calc(100dvh - 150px)',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: '#fff' }}>
            Calcula tu envío
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#8aa0cc' }}>
            Elige los países, escribe el monto y mándanos el cálculo por WhatsApp.
          </p>
        </div>

        {isError ? (
          <p style={{
            maxWidth: 420, textAlign: 'center', fontSize: 14, lineHeight: 1.6, color: '#fcd34d',
            background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.25)',
            borderRadius: 14, padding: '14px 16px',
          }}>
            Este enlace no existe o se dio de baja. Pídele uno nuevo a quien te lo pasó.
          </p>
        ) : (
          <CalculatorDark
            grande
            onSend={mandarPorWhatsapp}
            cta={numero ? {
              texto: 'Enviar cálculo por WhatsApp',
              icono: iconoWhatsapp,
              color: '#04210f',
              fondo: 'linear-gradient(135deg,#4ade80,#25d366 55%,#128c7e)',
              sombra: '0 14px 38px rgba(37,211,102,.38)',
              pie: dueno?.nombre ? `Te responde ${dueno.nombre}` : 'Te respondemos por WhatsApp',
            } : {
              texto: 'WhatsApp no configurado',
              desactivado: true,
              pie: 'Quien te pasó el enlace aún no puso su número.',
            }} />
        )}
      </main>
    </div>
  )
}
