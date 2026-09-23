import { useState } from 'react'
import { leeDatosBancarios } from '../utils/leeDatosBancarios'

// Pegar de una vez los datos de quien recibe.
//
// Nadie escribe estos datos: se los pasan por WhatsApp y los copia. Ir campo
// por campo es donde se cuela un dígito de menos en la cuenta, y ahí el dinero
// acaba en otra parte.
//
// Lo que se entiende se ENSEÑA antes de rellenar nada, y lo que no se entiende
// se deja en blanco para escribirlo a mano. Nunca se rellena a ciegas: un dato
// bancario equivocado con pinta de correcto es peor que un campo vacío.
export default function PegarDatosReceptor({ pais, bancos = [], onUsar }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [leido, setLeido] = useState(null)
  const [nada, setNada] = useState(false)

  const interpretar = (valor) => {
    setTexto(valor)
    const r = leeDatosBancarios(valor, { pais, bancos })
    setLeido(r)
    setNada(valor.trim().length > 12 && !r)
  }

  const cerrar = () => {
    setAbierto(false); setTexto(''); setLeido(null); setNada(false)
  }

  const usar = () => {
    onUsar?.(leido)
    cerrar()
  }

  // Un solo toque: se lee lo que el cliente ya tiene copiado y se interpreta.
  //
  // El navegador solo deja leer el portapapeles a raíz de un clic y pidiendo
  // permiso la primera vez; Firefox directamente no lo permite. Cuando no se
  // puede, queda el recuadro de siempre para pegar a mano — que es lo mismo
  // que había antes, no una vía muerta.
  const [huboQueDenegar, setHuboQueDenegar] = useState(false)

  const abrirLeyendoPortapapeles = async () => {
    setAbierto(true)
    setHuboQueDenegar(false)
    try {
      const copiado = await navigator.clipboard.readText()
      if (copiado?.trim()) interpretar(copiado)
      else setHuboQueDenegar(true)
    } catch {
      // Firefox no deja leer el portapapeles nunca, y en iPhone hay que
      // confirmar en un menú del sistema. Cuando no llega nada, se explica qué
      // hacer en vez de dejar un recuadro vacío sin más.
      setHuboQueDenegar(true)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={abrirLeyendoPortapapeles}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold"
        style={{ background: 'rgba(56,189,248,.08)', border: '1px dashed rgba(56,189,248,.35)', color: '#7dd3fc' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="3" width="8" height="4" rx="1" />
          <path d="M16 5h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2" />
        </svg>
        Pegar los datos que me pasaron
      </button>
    )
  }

  const fila = (etiqueta, valor) => valor ? (
    <div className="flex items-baseline justify-between gap-3 text-xs py-1">
      <span style={{ color: '#8aa0cc' }}>{etiqueta}</span>
      <span className="font-semibold text-right truncate" style={{ color: '#eaf2ff' }}>{valor}</span>
    </div>
  ) : null

  return (
    <div className="rounded-2xl p-3 space-y-2"
      style={{ background: 'rgba(6,13,40,.6)', border: '1px solid rgba(56,189,248,.25)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: '#7dd3fc' }}>
          {leido ? 'Esto es lo que tenías copiado' : 'Pega aquí el mensaje con los datos'}
        </p>
        <button type="button" onClick={cerrar} className="text-sm" style={{ color: '#64748b' }}>✕</button>
      </div>

      {!leido && huboQueDenegar && (
        <p className="text-[11px] leading-relaxed" style={{ color: '#fcd34d' }}>
          Tu navegador no deja leer lo copiado solo. Mantén pulsado el recuadro
          y elige <strong>Pegar</strong>.
        </p>
      )}

      {!leido && (
      <textarea
        autoFocus
        value={texto}
        onChange={e => interpretar(e.target.value)}
        rows={5}
        placeholder={'Banco de Venezuela\nCuenta: 0102 0123 4567 8901 2345\nC.I: V-12.345.678\nMaría Rodríguez'}
        className="w-full rounded-xl px-3 py-2.5 text-xs focus:outline-none"
        style={{ background: 'rgba(6,13,40,.9)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff', resize: 'vertical' }}
      />
      )}

      {nada && (
        <p className="text-xs" style={{ color: '#fcd34d' }}>
          De ahí no pude sacar nada en claro. Escríbelo a mano abajo.
        </p>
      )}

      {leido && (
        <div className="rounded-xl p-3" style={{ background: 'rgba(74,222,128,.06)', border: '1px solid rgba(74,222,128,.25)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#4ade80' }}>
            Esto entendí
          </p>
          {fila('Nombre', leido.nombre)}
          {fila('Banco', leido.banco?.name || leido.bancoTexto)}
          {fila('Cuenta', leido.cuenta)}
          {fila('Documento', leido.documento)}
          {fila('Teléfono', leido.telefono)}

          {leido.aviso && (
            <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#fcd34d' }}>⚠ {leido.aviso}</p>
          )}
          {!leido.banco && leido.bancoTexto && (
            <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#fcd34d' }}>
              Ese banco no está en la lista de {pais}: elígelo tú abajo.
            </p>
          )}

          <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#8aa0cc' }}>
            Revísalo antes de usarlo. Lo que falte se completa a mano.
          </p>

          <div className="flex gap-2 mt-2.5">
            <button type="button" onClick={usar}
              className="flex-1 text-xs font-bold py-2 rounded-lg"
              style={{ background: 'linear-gradient(135deg,#22c55e,#15803d)', border: 'none', color: '#fff' }}>
              Usar estos datos
            </button>
            <button type="button" onClick={() => { setLeido(null); setTexto('') }}
              className="text-xs font-semibold py-2 px-3 rounded-lg"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: '#aebfe2' }}>
              Otro texto
            </button>
            <button type="button" onClick={cerrar}
              className="text-xs font-semibold py-2 px-3 rounded-lg"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: '#64748b' }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
