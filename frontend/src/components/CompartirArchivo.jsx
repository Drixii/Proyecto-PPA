import { useState } from 'react'

// Botón para compartir un archivo (el recibo de pago) por WhatsApp, Instagram,
// correo o lo que tenga el teléfono.
//
// Se comparte el archivo, no un enlace: un enlace al recibo lo abre cualquiera
// que lo reciba, y lo que la gente manda es la imagen. navigator.share con
// archivos existe en móvil y en Chrome/Edge de escritorio; donde no, el
// archivo se descarga para adjuntarlo a mano, que es lo que se haría igual.

const EXTENSION = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }

export default function CompartirArchivo({ url, nombre = 'recibo-de-pago', titulo = 'Recibo de pago', texto }) {
  const [estado, setEstado] = useState('')      // '', 'cargando', o un aviso
  if (!url) return null

  const compartir = async () => {
    setEstado('cargando')
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const tipo = blob.type || 'application/octet-stream'
      const archivo = new File([blob], `${nombre}.${EXTENSION[tipo] || 'bin'}`, { type: tipo })

      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: titulo, text: texto })
        setEstado('')
        return
      }

      const enlace = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = enlace
      a.download = archivo.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(enlace), 1000)
      setEstado('Descargado: adjúntalo en la red social que quieras')
    } catch (e) {
      // Cerrar el menú de compartir no es un error.
      setEstado(e?.name === 'AbortError' ? '' : 'No se pudo compartir el recibo')
    }
    setTimeout(() => setEstado(''), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <button type="button" onClick={compartir} disabled={estado === 'cargando'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
          padding: '11px 16px', borderRadius: 12, border: 'none', cursor: estado === 'cargando' ? 'wait' : 'pointer',
          fontSize: 14, fontWeight: 700, color: '#061027',
          background: 'linear-gradient(135deg,#86efac,#4ade80)', boxShadow: '0 8px 22px rgba(74,222,128,.25)',
        }}>
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {estado === 'cargando' ? 'Preparando…' : 'Compartir recibo'}
      </button>
      {estado && estado !== 'cargando' && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: '#8aa0cc' }}>{estado}</p>
      )}
    </div>
  )
}
