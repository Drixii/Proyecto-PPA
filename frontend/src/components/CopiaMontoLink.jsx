import { useState } from 'react'

// El paso intermedio antes de mandar a alguien a pagar por el link de Haulmer.
//
// Su página pide escribir el monto a mano y no acepta que se lo pasemos en la
// dirección (probado con amount, monto, precio y x_amount). Un monto mal
// tecleado significa un cobro que no cuadra con ningún envío y una revisión a
// mano, así que aquí se obliga a copiarlo: hasta que no se copia, el botón de
// ir a pagar no se enciende.
export default function CopiaMontoLink({ monto, url, abierto, cerrar }) {
  const [copiado, setCopiado] = useState(false)
  if (!abierto) return null

  const texto = String(monto || '')

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Sin permiso de portapapeles —Safari viejo, http— se copia a la
      // antigua. Si tampoco se puede, se deja pasar igual: bloquear el pago
      // por no poder copiar sería peor que un monto tecleado a mano.
      try {
        const campo = document.createElement('textarea')
        campo.value = texto
        campo.style.position = 'fixed'
        campo.style.opacity = '0'
        document.body.appendChild(campo)
        campo.select()
        document.execCommand('copy')
        document.body.removeChild(campo)
      } catch { /* se sigue igual */ }
    }
    setCopiado(true)
  }

  const irAPagar = () => {
    window.open(url, '_blank', 'noopener')
    setCopiado(false)
    cerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2,6,23,.8)' }}
      onClick={() => { setCopiado(false); cerrar() }}>
      <div className="w-full max-w-sm rounded-2xl p-6" onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(8,16,44,.98)', border: '1px solid rgba(56,189,248,.25)', boxShadow: '0 24px 64px rgba(0,0,0,.7)' }}>

        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#38bdf8' }}>
          Copia el monto exacto
        </p>
        <p className="text-xs mb-4" style={{ color: '#8aa0cc' }}>
          En la página de Haulmer tendrás que escribirlo en «Ingresar el monto a pagar».
        </p>

        <button type="button" onClick={copiar}
          className="w-full rounded-2xl px-4 py-4 mb-3 flex items-center justify-between gap-3"
          style={{
            background: copiado ? 'rgba(74,222,128,.1)' : 'rgba(56,189,248,.08)',
            border: `1px solid ${copiado ? 'rgba(74,222,128,.4)' : 'rgba(56,189,248,.3)'}`,
          }}>
          <span className="text-2xl font-bold" style={{ color: '#eaf2ff' }}>
            {Number(monto || 0).toLocaleString('es-CL')}
            <span className="text-sm ml-1.5" style={{ color: '#8aa0cc' }}>CLP</span>
          </span>
          <span className="text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap"
            style={{
              background: copiado ? 'rgba(74,222,128,.15)' : 'rgba(56,189,248,.15)',
              color: copiado ? '#4ade80' : '#7dd3fc',
            }}>
            {copiado ? '✓ Copiado' : 'Copiar monto'}
          </span>
        </button>

        <button type="button" onClick={irAPagar} disabled={!copiado}
          className="w-full text-white font-bold py-3.5 rounded-xl transition-all"
          style={{
            background: copiado ? 'linear-gradient(135deg,#22d3ee,#1d4ed8)' : 'rgba(255,255,255,.06)',
            color: copiado ? '#fff' : '#64748b',
            cursor: copiado ? 'pointer' : 'not-allowed',
          }}>
          Ir a pagar →
        </button>

        {!copiado && (
          <p className="text-xs text-center mt-2.5" style={{ color: '#fcd34d' }}>
            Dale a copiar para que puedas ir a pagar.
          </p>
        )}

        {/* El aviso del comprobante va aquí y no al volver: al volver, la
            pantalla de pago ya se cerró y la captura hay que haberla tomado
            antes. */}
        <p className="text-xs text-center mt-3 px-3 py-2.5 rounded-xl leading-relaxed"
          style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.2)', color: '#aebfe2' }}>
          <strong style={{ color: '#eaf2ff' }}>Recuerda tomar captura del pago</strong> para que la
          subas aquí: es lo que nos deja confirmar tu envío.
        </p>

        <button type="button" onClick={() => { setCopiado(false); cerrar() }}
          className="w-full text-xs font-semibold py-2.5 mt-2 rounded-xl"
          style={{ background: 'transparent', border: 'none', color: '#64748b' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
