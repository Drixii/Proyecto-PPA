import { useEffect, useState } from 'react'
import Portal from './Portal'

/**
 * Una imagen que se abre a pantalla completa al pulsarla.
 *
 * Los comprobantes se miran para decidir si un pago es válido, y encogidos a
 * la altura de una tarjeta no se lee ni el monto ni el nombre. Se abren en
 * grande, sobre todo lo demás.
 *
 * Va por Portal para que ningún contenedor con overflow o con su propio
 * apilamiento la recorte: los paneles de órdenes son cajas con scroll.
 */
export default function ImagenAmpliable({ src, alt = '', className, style }) {
  const [abierta, setAbierta] = useState(false)

  // Escape cierra, y mientras está abierta el fondo no se mueve: se abre desde
  // un panel con scroll y al cerrar uno aparecía en otro punto de la lista.
  useEffect(() => {
    if (!abierta) return
    const alPulsar = (e) => { if (e.key === 'Escape') setAbierta(false) }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', alPulsar)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', alPulsar)
    }
  }, [abierta])

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setAbierta(true)}
        title="Pulsa para verlo en grande"
        className={className}
        style={{ ...style, cursor: 'zoom-in' }} />

      {abierta && (
        <Portal>
          <div
            onClick={() => setAbierta(false)}
            className="fixed inset-0 flex flex-col items-center justify-center p-4"
            style={{ zIndex: 9500, background: 'rgba(2,6,23,.92)', backdropFilter: 'blur(6px)' }}>

            <img
              src={src}
              alt={alt}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 14, cursor: 'default' }} />

            <div className="flex items-center gap-3 mt-4" onClick={e => e.stopPropagation()}>
              <a href={src} target="_blank" rel="noreferrer"
                className="text-xs font-bold px-4 py-2 rounded-xl"
                style={{ border: '1px solid rgba(255,255,255,.14)', color: '#aebfe2', textDecoration: 'none' }}>
                Abrir original
              </a>
              <button onClick={() => setAbierta(false)}
                className="text-xs font-bold px-4 py-2 rounded-xl"
                style={{ border: 'none', color: '#061027', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)' }}>
                Cerrar
              </button>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}
