import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DateRangePicker from '../../components/DateRangePicker'
import api from '../../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '18px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }

const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
const finDe = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const miles = n => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })

// Lo escrito a mano, a número. Se acepta como lo escribe la gente: "20.000",
// "20000", "20.000,50". El punto es separador de miles y la coma decimal, que
// es como se escribe en toda la región.
function aNumero(texto) {
  const limpio = String(texto ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return Number.isFinite(n) ? n : 0
}

function Bandera({ iso2, tam = 18 }) {
  if (!iso2) return null
  return (
    <img src={`https://flagcdn.com/40x30/${String(iso2).toLowerCase()}.png`} alt=""
      style={{ width: tam, height: tam * .75, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
      onError={e => { e.target.style.visibility = 'hidden' }} />
  )
}

// Gestión de finanzas: el capital, lo generado cada día y el acumulado.
//
// Pantalla aparte del panel, con su propio menú: lo que se ve aquí no es la
// operación del día a día, es el dinero de la casa.
//
// Es un cuaderno, no un informe. Nada se rellena con los envíos de la web a
// propósito: por aquí entra también lo que se movió fuera de la plataforma, y
// eso ningún listado de envíos lo sabe.
//
// AVISO mientras siga así: la única llave es ser super-admin. La clave aparte
// todavía no existe. No se puso un campo de contraseña de adorno esperándola,
// porque un candado que el servidor no comprueba aparenta una protección que
// no hay.
export default function Finanzas() {
  const qc = useQueryClient()
  const [rango, setRango] = useState({ from: hoy(), to: finDe(hoy()) })
  const [elegido, setElegido] = useState(null)

  const { data: paises = [] } = useQuery({
    queryKey: ['finanzas-paises'],
    queryFn: () => api.get('/admin/countries').then(r => r.data.data || []),
  })

  const origenes = useMemo(() => paises.filter(p => p.can_send && p.active), [paises])
  const destinos = useMemo(() => paises.filter(p => p.can_receive && p.active), [paises])

  // Mientras no se haya tocado nada, el primero de la lista. Derivado y no
  // guardado con un efecto: así no hay un primer dibujado sin país y otro con
  // él, que es lo que hacía parpadear la tabla al entrar.
  const origen = elegido ?? origenes[0]?.name ?? null
  const setOrigen = setElegido

  const desde = iso(rango.from)
  const hasta = iso(rango.to || rango.from)

  const { data: respuesta } = useQuery({
    queryKey: ['finanzas', desde, hasta],
    queryFn: () => api.get('/finanzas', { params: { desde, hasta } }).then(r => r.data),
  })

  const apuntes = respuesta?.data || []
  const totales = respuesta?.totales || []
  const delOrigen = useMemo(
    () => apuntes.filter(a => a.origen === origen),
    [apuntes, origen],
  )

  const paisOrigen = origenes.find(p => p.name === origen)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  // La fila en blanco del final. Vive solo aquí hasta que tenga monto: guardar
  // filas vacías llenaría el cuaderno de apuntes en cero.
  const [nueva, setNueva] = useState({ porcentaje: '', destino: null, monto: '' })

  const guardarNueva = async () => {
    const monto = aNumero(nueva.monto)
    if (!monto || !nueva.destino || !origen) return
    await api.post('/finanzas', {
      fecha: desde,               // los apuntes nuevos caen en el primer día del rango
      origen,
      destino: nueva.destino,
      monto,
      porcentaje: aNumero(nueva.porcentaje),
      orden: delOrigen.length,
    })
    setNueva({ porcentaje: '', destino: null, monto: '' })
    refrescar()
  }

  const editar = async (id, cambios) => {
    await api.patch(`/finanzas/${id}`, cambios)
    refrescar()
  }

  const borrar = async (id) => {
    await api.delete(`/finanzas/${id}`)
    refrescar()
  }

  const totalMovido = delOrigen.reduce((s, a) => s + a.monto, 0)
  const totalGanado = delOrigen.reduce((s, a) => s + a.ganancia, 0)
  const variosDias = desde !== hasta

  return (
    <div style={{ minHeight: '100vh', background: '#050f25', display: 'flex' }}>
      <style>{`
        .fin-cel{background:transparent;border:1px solid transparent;border-radius:9px;color:#eaf2ff;
          padding:7px 9px;width:100%;text-align:right;font-size:13px;font-variant-numeric:tabular-nums}
        .fin-cel:hover:not(:disabled){border-color:rgba(255,255,255,.12)}
        .fin-cel:focus{outline:none;border-color:#38bdf8;background:rgba(56,189,248,.07)}
        .fin-cel:disabled{color:#334155;cursor:not-allowed}
        .fin-th{position:sticky;top:0;z-index:2;background:#071331}
        .fin-nav{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:11px;
          font-size:13px;font-weight:600;transition:background .15s,color .15s}
      `}</style>

      {/* Menú propio. Solo dos sitios a los que ir: aquí y de vuelta. */}
      <aside style={{
        width: 220, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,.07)',
        padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: '#475569', padding: '0 12px 12px' }}>
          FINANZAS
        </p>

        <span className="fin-nav" style={{ background: 'rgba(56,189,248,.12)', color: '#7dd3fc' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="M7 15l3.5-4 3 2.5L20 7" />
          </svg>
          Dashboard
        </span>

        <Link to="/admin" className="fin-nav" style={{ color: '#8aa0cc' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Volver al panel
        </Link>

        <div style={{ flex: 1 }} />

        <p style={{ fontSize: 11, lineHeight: 1.5, color: '#fcd34d', padding: '0 12px' }}>
          Sin clave propia todavía: entra cualquiera con sesión de super-admin.
        </p>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header: qué se está mirando y de qué fechas. */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,.07)',
        }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: '#eaf2ff' }}>Gestión de finanzas</h1>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Lo que se movió y lo que se ganó, anotado a mano.
            </p>
          </div>
          <DateRangePicker value={rango} onChange={setRango} />
        </header>

        {/* Subheader: los países desde los que se envía. */}
        <div style={{
          display: 'flex', gap: 7, padding: '11px 22px', overflowX: 'auto',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}>
          {origenes.map(p => {
            const activo = p.name === origen
            return (
              <button key={p.id} type="button" onClick={() => setOrigen(p.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                  padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  transition: 'all .15s',
                  background: activo ? 'rgba(56,189,248,.13)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${activo ? '#38bdf8' : 'rgba(255,255,255,.07)'}`,
                  color: activo ? '#eaf2ff' : '#8aa0cc',
                }}>
                <Bandera iso2={p.iso2} />
                {p.name}
              </button>
            )
          })}
          {!origenes.length && (
            <p style={{ fontSize: 13, color: '#64748b' }}>No hay países marcados como origen.</p>
          )}
        </div>

        <div style={{ flex: 1, padding: '18px 22px', overflow: 'auto' }}>
          {origen && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#eaf2ff', letterSpacing: '-.01em' }}>
                  {origen.toUpperCase()}
                </h2>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  montos en {paisOrigen?.currency || '—'}
                </span>
                {variosDias && (
                  <span style={{ fontSize: 12, color: '#fcd34d' }}>
                    · el rango son varios días; lo que anotes se guarda en el {desde}
                  </span>
                )}
              </div>

              <div style={{ ...GLASS, overflow: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + destinos.length * 130 }}>
                  <thead>
                    <tr>
                      {/* El porcentaje a la izquierda del todo, antes que los países. */}
                      <th className="fin-th" style={{
                        textAlign: 'right', padding: '11px 12px', fontSize: 11, fontWeight: 700,
                        letterSpacing: '.08em', color: '#7dd3fc', width: 92,
                        borderBottom: '1px solid rgba(255,255,255,.08)',
                        borderRight: '1px solid rgba(255,255,255,.08)',
                        position: 'sticky', left: 0, zIndex: 3,
                      }}>%</th>

                      {destinos.map(d => (
                        <th key={d.id} className="fin-th" style={{
                          padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#aebfe2',
                          borderBottom: '1px solid rgba(255,255,255,.08)', whiteSpace: 'nowrap',
                        }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Bandera iso2={d.iso2} tam={16} />
                            {d.name}
                          </span>
                        </th>
                      ))}

                      <th className="fin-th" style={{
                        textAlign: 'right', padding: '11px 14px', fontSize: 11, fontWeight: 700,
                        letterSpacing: '.08em', color: '#4ade80', whiteSpace: 'nowrap',
                        borderBottom: '1px solid rgba(255,255,255,.08)',
                      }}>GANANCIA</th>
                      <th className="fin-th" style={{ width: 34, borderBottom: '1px solid rgba(255,255,255,.08)' }} />
                    </tr>
                  </thead>

                  <tbody>
                    {delOrigen.map(a => (
                      <Fila key={`${a.id}:${a.porcentaje}:${a.monto}`}
                        apunte={a}
                        destinos={destinos}
                        onEditar={cambios => editar(a.id, cambios)}
                        onBorrar={() => borrar(a.id)} />
                    ))}

                    {/* La fila en blanco: escribir en una columna la reserva
                        para ese destino y apaga el resto, porque una fila es un
                        solo movimiento. */}
                    <tr>
                      <td style={celdaIzq}>
                        <input className="fin-cel" value={nueva.porcentaje} inputMode="decimal"
                          placeholder="%"
                          onChange={e => setNueva(n => ({ ...n, porcentaje: e.target.value }))}
                          onBlur={guardarNueva} />
                      </td>
                      {destinos.map(d => {
                        const bloqueada = nueva.destino && nueva.destino !== d.name
                        return (
                          <td key={d.id} style={celda}>
                            <input className="fin-cel" inputMode="decimal"
                              disabled={bloqueada}
                              value={nueva.destino === d.name ? nueva.monto : ''}
                              onChange={e => setNueva(n => ({
                                ...n,
                                destino: e.target.value ? d.name : null,
                                monto: e.target.value,
                              }))}
                              onBlur={guardarNueva} />
                          </td>
                        )
                      })}
                      <td style={{ ...celda, textAlign: 'right', color: '#4ade80', fontWeight: 700, fontSize: 13 }}>
                        {miles(aNumero(nueva.monto) * aNumero(nueva.porcentaje) / 100)}
                      </td>
                      <td style={celda} />
                    </tr>
                  </tbody>

                  <tfoot>
                    <tr>
                      <td style={{ ...celdaIzq, textAlign: 'right', fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                        TOTAL
                      </td>
                      <td colSpan={destinos.length} style={{ ...celda, textAlign: 'right', color: '#aebfe2', fontSize: 13 }}>
                        movido {miles(totalMovido)} {paisOrigen?.currency}
                      </td>
                      <td style={{ ...celda, textAlign: 'right', color: '#4ade80', fontWeight: 800, fontSize: 14 }}>
                        {miles(totalGanado)}
                      </td>
                      <td style={celda} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* El acumulado de TODOS los países del rango, por moneda y sin
              convertir: mezclar pesos con soles a la tasa de hoy daría una
              cifra que mañana es otra, y esto es un registro de lo que pasó. */}
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: '#64748b', marginBottom: 9 }}>
              GANADO EN TODO EL RANGO
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {totales.map(t => (
                <div key={t.moneda} style={{ ...GLASS, padding: '12px 16px', minWidth: 150 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', letterSpacing: '.06em' }}>{t.moneda}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: '#4ade80', marginTop: 3 }}>{miles(t.ganado)}</p>
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>de {miles(t.movido)} movidos</p>
                </div>
              ))}
              {!totales.length && (
                <p style={{ fontSize: 13, color: '#64748b' }}>Todavía no hay nada anotado en estas fechas.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

const celda = { padding: '2px 4px', borderBottom: '1px solid rgba(255,255,255,.04)' }
const celdaIzq = {
  ...celda, position: 'sticky', left: 0, background: '#071331', zIndex: 1,
  borderRight: '1px solid rgba(255,255,255,.08)',
}

/** Una fila ya guardada. Su destino está decidido, así que el resto se apaga. */
function Fila({ apunte, destinos, onEditar, onBorrar }) {
  const [pct, setPct] = useState(String(apunte.porcentaje ?? ''))
  const [monto, setMonto] = useState(String(apunte.monto ?? ''))

  // Si el apunte cambia por detrás, la fila se monta de nuevo entera: la clave
  // que le pone la tabla lleva el monto y el porcentaje. Copiarlos aquí con un
  // efecto obligaba a dibujar dos veces cada cambio.

  return (
    <tr>
      <td style={celdaIzq}>
        <input className="fin-cel" value={pct} inputMode="decimal"
          onChange={e => setPct(e.target.value)}
          onBlur={() => {
            const n = aNumero(pct)
            if (n !== apunte.porcentaje) onEditar({ porcentaje: n })
          }} />
      </td>

      {destinos.map(d => {
        const suya = d.name === apunte.destino
        return (
          <td key={d.id} style={celda}>
            <input className="fin-cel" inputMode="decimal" disabled={!suya}
              value={suya ? monto : ''}
              onChange={e => setMonto(e.target.value)}
              onBlur={() => {
                const n = aNumero(monto)
                if (suya && n !== apunte.monto) onEditar({ monto: n })
              }} />
          </td>
        )
      })}

      <td style={{ ...celda, textAlign: 'right', color: '#4ade80', fontWeight: 700, fontSize: 13, paddingRight: 14 }}>
        {miles(apunte.ganancia)}
      </td>

      <td style={celda}>
        <button type="button" onClick={onBorrar} title="Borrar esta línea"
          style={{ color: '#475569', padding: '4px 6px', fontSize: 14, lineHeight: 1 }}>
          ✕
        </button>
      </td>
    </tr>
  )
}
