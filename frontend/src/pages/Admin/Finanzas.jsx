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

// El peso chileno no tiene céntimos: "119.732,23" no es una cifra que exista.
const pesos = n => Math.round(Number(n) || 0).toLocaleString('es-CL')

// Lo escrito a mano, a número. Se acepta como lo escribe la gente: "20.000",
// "20000", "20.000,50". El punto es separador de miles y la coma decimal, que
// es como se escribe en toda la región.
function aNumero(texto) {
  const limpio = String(texto ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return Number.isFinite(n) ? n : 0
}

// Los puntos de miles puestos mientras se escribe.
//
// Se teclea "20000" y hay que ver "20.000": en Chile un monto sin puntos se
// lee mal, y en una columna de cifras es donde peor se lee. Se respeta la coma
// decimal a medio escribir —"20.000," no puede convertirse en "20.000"— o no
// habría forma de teclear los centavos.
function conPuntos(texto) {
  const crudo = String(texto ?? '').replace(/[^\d,]/g, '')
  if (!crudo) return ''
  const [entera, ...resto] = crudo.split(',')
  const agrupada = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return resto.length ? `${agrupada},${resto.join('').slice(0, 2)}` : agrupada
}

// El ancho del campo, en caracteres, creciendo con lo que se teclea.
//
// Antes cada columna medía lo mismo aunque llevara "500" o "1.250.000", y con
// varios movimientos anotados la tabla se iba de ancho sin motivo. Arranca en
// lo mínimo que sigue siendo cómodo de tocar con el dedo.
const anchoDe = texto => Math.max(3, String(texto ?? '').length + 1)

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
// Los países van en vertical y cada movimiento ocupa su columna. Una columna
// es un movimiento: escribir en ella la reserva para ese país y tranca las
// demás casillas de esa misma columna.
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

  const desde = iso(rango.from)
  const hasta = iso(rango.to || rango.from)

  const { data: respuesta } = useQuery({
    queryKey: ['finanzas', desde, hasta],
    queryFn: () => api.get('/finanzas', { params: { desde, hasta } }).then(r => r.data),
  })

  const apuntes = respuesta?.data || []
  const totales = respuesta?.totales || []
  const porOrigen = respuesta?.por_origen || []
  // Todo lo anotado desde siempre, sin mirar las fechas: es lo que va
  // sumando día tras día.
  const acumulado = respuesta?.acumulado || { por_origen: [], totales: [] }
  // El porcentaje es de la ruta, no de la línea: el badge de cada país.
  const pctDe = (destino) => (respuesta?.porcentajes || [])
    .find(p => p.origen === origen && p.destino === destino)?.porcentaje ?? 0

  const delOrigen = useMemo(() => apuntes.filter(a => a.origen === origen), [apuntes, origen])

  // Cada movimiento ocupa una columna, y su número de columna es el `orden`
  // con el que se guardó. Como una columna solo admite un monto, basta con
  // saber qué apunte hay en cada una.
  const porColumna = useMemo(() => {
    const m = new Map()
    delOrigen.forEach(a => { if (!m.has(a.orden)) m.set(a.orden, a) })
    return m
  }, [delOrigen])

  // Las columnas ya usadas y una libre al final, para el siguiente movimiento.
  const columnas = useMemo(() => {
    const usadas = [...porColumna.keys()]
    const tope = usadas.length ? Math.max(...usadas) + 1 : 0
    return Array.from({ length: tope + 1 }, (_, i) => i)
  }, [porColumna])

  const paisOrigen = origenes.find(p => p.name === origen)

  // Un país no se envía a sí mismo, así que el que está elegido no es un
  // destino y su fila solo ocupaba sitio.
  //
  // Salvo que ya haya algo anotado ahí: esconder la fila escondería el dinero
  // —que seguiría sumando en los totales— y no habría forma de corregirlo.
  const destinosDelOrigen = useMemo(
    () => destinos.filter(d => d.name !== origen || delOrigen.some(a => a.destino === d.name)),
    [destinos, origen, delOrigen],
  )
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  // Lo que se está escribiendo en una casilla todavía vacía. Vive solo aquí
  // hasta que tenga monto: guardar columnas en blanco llenaría el cuaderno de
  // apuntes en cero.
  const [borrador, setBorrador] = useState({ col: null, destino: null, texto: '' })

  // Qué se está mirando: lo que se anota, o lo que suma.
  const [vista, setVista] = useState('diarios')   // 'diarios' | 'total'

  const guardarBorrador = async () => {
    const monto = aNumero(borrador.texto)
    if (!monto || !borrador.destino || borrador.col === null || !origen) return
    await api.post('/finanzas', {
      fecha: desde,               // los apuntes nuevos caen en el primer día del rango
      origen,
      destino: borrador.destino,
      monto,
      orden: borrador.col,
    })
    setBorrador({ col: null, destino: null, texto: '' })
    refrescar()
  }

  const editar = async (id, cambios) => { await api.patch(`/finanzas/${id}`, cambios); refrescar() }
  const borrar = async (id) => { await api.delete(`/finanzas/${id}`); refrescar() }
  const ponerPorcentaje = async (destino, porcentaje) => {
    await api.put('/finanzas/porcentaje', { origen, destino, porcentaje })
    refrescar()
  }

  const ponerPorcentajeGeneral = async (porcentaje) => {
    await api.put('/finanzas/porcentaje-general', {
      origen,
      destinos: destinosDelOrigen.map(d => d.name),
      porcentaje,
    })
    refrescar()
  }

  const movidoDe = destino => delOrigen.filter(a => a.destino === destino).reduce((s, a) => s + a.monto, 0)
  const ganadoDe = destino => delOrigen.filter(a => a.destino === destino).reduce((s, a) => s + a.ganancia, 0)
  // Lo mismo en pesos chilenos, que es la moneda de la caja.
  const movidoClpDe = destino => delOrigen.filter(a => a.destino === destino).reduce((s, a) => s + (a.monto_clp || 0), 0)
  const ganadoClpDe = destino => delOrigen.filter(a => a.destino === destino).reduce((s, a) => s + (a.ganancia_clp || 0), 0)

  const totalMovido = delOrigen.reduce((s, a) => s + a.monto, 0)
  const totalGanado = delOrigen.reduce((s, a) => s + a.ganancia, 0)
  // Lo mismo pasado a pesos chilenos, que es como se lleva la caja.
  const enPesos = porOrigen.find(o => o.origen === origen)
  const variosDias = desde !== hasta

  return (
    <div style={{ minHeight: '100vh', background: '#050f25', display: 'flex' }}>
      <style>{`
        .fin-cel{background:transparent;border:1px solid transparent;border-radius:8px;color:#eaf2ff;
          padding:6px 5px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums;
          box-sizing:content-box}
        .fin-cel:hover:not(:disabled){border-color:rgba(255,255,255,.12)}
        .fin-cel:focus{outline:none;border-color:#38bdf8;background:rgba(56,189,248,.07)}
        /* La casilla trancada ocupa la columna entera: así se ve de un
           vistazo que ese movimiento ya está tomado, en vez de un guion
           suelto que parecía una casilla a medio escribir. */
        .fin-trancada{display:block;width:100%;border:1px solid transparent;border-radius:8px;
          padding:6px 5px;text-align:center;color:#2b3a55;font-size:13px;cursor:pointer;
          background:repeating-linear-gradient(135deg,transparent,transparent 5px,
            rgba(255,255,255,.028) 5px,rgba(255,255,255,.028) 10px)}
        .fin-trancada:hover{border-color:rgba(56,189,248,.3);color:#7dd3fc}
        /* La aspa de quitar iba dentro de la fila y le sumaba su ancho a la
           columna entera. Ahora se superpone sobre la cifra y solo asoma al
           pasar por encima. */
        .fin-x{position:absolute;left:0;top:3px;opacity:0;color:#64748b;font-size:12px;
          line-height:1;padding:3px;transition:opacity .12s}
        .fin-casilla:hover .fin-x{opacity:1}
        .fin-x:hover{color:#f87171}
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
        </header>

        {/* Qué se mira de ese país: los montos que se anotan día a día, o lo
            que suman. Van en pestañas y no uno debajo del otro porque no se
            usan a la vez: se anota, o se mira el total. */}
        <div style={{
          display: 'flex', gap: 4, padding: '0 22px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}>
          {[['diarios', 'Montos diarios'], ['total', 'Total']].map(([id, txt]) => {
            const activa = vista === id
            return (
              <button key={id} type="button" onClick={() => setVista(id)}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 600,
                  color: activa ? '#7dd3fc' : '#64748b',
                  borderBottom: `2px solid ${activa ? '#38bdf8' : 'transparent'}`,
                  marginBottom: -1, transition: 'color .15s',
                }}>
                {txt}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, padding: '18px 22px', overflow: 'auto' }}>
          {vista === 'total' && (
            <>
              {/* El mismo filtro que arriba: la suma del día depende de qué
                  día, y sin él aquí habría que volver a la otra pestaña para
                  cambiarlo. El acumulado no lo mira: es todo. */}
              <div style={{ marginBottom: 16 }}>
                <DateRangePicker value={rango} onChange={setRango} />
              </div>

            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Resumen titulo={variosDias ? 'Suma total del rango' : 'Suma total del día'}
                nota="en pesos chilenos"
                paises={origenes} porOrigen={porOrigen} totales={totales}
                sinTasa={respuesta?.sin_tasa || 0} />
              <Resumen titulo="Acumulable diario"
                nota="todo lo anotado, en pesos chilenos"
                paises={origenes} porOrigen={acumulado.por_origen} totales={acumulado.totales}
                sinTasa={acumulado.sin_tasa || 0} />
            </div>
            </>
          )}

          {/* Los países desde los que se envía. Salen solo en esta pestaña
              porque solo mandan aquí: el cuadro del total es el mismo para
              todos y no depende de cuál esté elegido. */}
          {vista === 'diarios' && (
          <div style={{
            display: 'flex', gap: 7, marginBottom: 16, overflowX: 'auto',
          }}>
            {origenes.map(p => {
              const activo = p.name === origen
              return (
                <button key={p.id} type="button" onClick={() => setElegido(p.name)}
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
          )}

          {vista === 'diarios' && origen && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#eaf2ff', letterSpacing: '-.01em' }}>
                  {origen.toUpperCase()}
                </h2>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  montos en {paisOrigen?.currency || '—'}
                </span>

                {/* El porcentaje de golpe para todo el país. Respeta los que ya
                    estén puestos a mano: si una ruta cobra distinto es a
                    propósito, y borrarlos obligaría a rehacerlos uno a uno. */}
                <PorcentajeGeneral onPoner={ponerPorcentajeGeneral} />

                {/* El filtro de fechas, junto a lo que filtra. */}
                <DateRangePicker value={rango} onChange={setRango} />
                {variosDias && (
                  <span style={{ fontSize: 12, color: '#fcd34d' }}>
                    · el rango son varios días; lo que anotes se guarda en el {desde}
                  </span>
                )}
              </div>

              <div style={{ ...GLASS, overflow: 'auto', width: 'max-content', maxWidth: '100%' }}>
                {/* `max-content`: la tabla mide exactamente lo que ocupa su
                    contenido y ni un píxel más. Con `100%` se estiraba hasta el
                    borde repartiendo el sobrante entre todas las columnas, y
                    con `auto` pasaba lo mismo porque las celdas pedían su ancho
                    en porcentaje. */}
                <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
                  <thead>
                    <tr>
                      <th style={{ ...cabecera, ...pegadaPais, padding: '9px 8px' }}>
                        % · PAÍS
                      </th>

                      {/* Una columna por cliente, numeradas como se anotan. */}
                      {columnas.map(c => (
                        <th key={c} style={{ ...cabecera, color: '#64748b' }}>
                          Cliente {c + 1}
                        </th>
                      ))}

                      {/* Los dos totales de la fila. Antes había un hueco sin
                          título entre medias que no se entendía; ahora lo que
                          los separa de los movimientos es una raya más marcada
                          y su propio nombre. */}
                      <th style={{ ...cabecera, ...separa, color: '#aebfe2' }}>TOTAL</th>
                      <th style={{ ...cabecera, color: '#4ade80', borderRight: 'none' }}>COMISIÓN</th>
                    </tr>
                  </thead>

                  <tbody>
                    {destinosDelOrigen.map(d => (
                      <FilaPais
                        key={`${d.id}:${origen}`}
                        pais={d}
                        pct={pctDe(d.name)}
                        moneda={paisOrigen?.currency}
                        columnas={columnas}
                        porColumna={porColumna}
                        borrador={borrador}
                        setBorrador={setBorrador}
                        onGuardarBorrador={guardarBorrador}
                        onPorcentaje={v => ponerPorcentaje(d.name, v)}
                        onEditar={editar}
                        onBorrar={borrar}
                        movido={movidoDe(d.name)}
                        ganado={ganadoDe(d.name)}
                        movidoClp={movidoClpDe(d.name)}
                        ganadoClp={ganadoClpDe(d.name)}
                      />
                    ))}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td style={{ ...pieCelda, ...pegadaPais, fontSize: 11, color: '#64748b', fontWeight: 700, padding: '9px 8px 9px 5px' }}>
                        TOTAL
                      </td>
                      {columnas.map(c => (
                        <td key={c} style={{ ...pieCelda, textAlign: 'right', color: '#8aa0cc', fontSize: 12 }}>
                          {porColumna.get(c) ? miles(porColumna.get(c).monto) : ''}
                        </td>
                      ))}
                      <td style={{ ...pieCelda, ...separa, textAlign: 'right', color: '#eaf2ff', fontWeight: 700, fontSize: 13 }}>
                        {miles(totalMovido)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>{paisOrigen?.currency}</span>
                        {/* Y lo mismo en pesos chilenos, que es la moneda en la
                            que se lleva la caja: el total del país dice lo que
                            se movió allá, este dice lo que vale aquí. */}
                        {enPesos && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#4ade80', marginTop: 2 }}>
                            {pesos(enPesos.movido)} CLP
                          </span>
                        )}
                      </td>
                      <td style={{ ...pieCelda, textAlign: 'right', color: '#4ade80', fontWeight: 800, fontSize: 14, borderRight: 'none' }}>
                        {miles(totalGanado)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#3f8f5c' }}>{paisOrigen?.currency}</span>
                        {enPesos && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#4ade80', marginTop: 2 }}>
                            {pesos(enPesos.ganado)} CLP
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  )
}

// La raya vertical entre columnas. Antes solo había líneas horizontales y las
// cifras de dos movimientos seguidos parecían la misma columna.
const RAYA = '1px solid rgba(255,255,255,.09)'

// Solo "no partas el texto". El `width: 1%` que había aquí hacía lo contrario
// de lo que parece: un ancho en porcentaje obliga al navegador a calcular la
// tabla contra el ancho del contenedor, o sea a estirarla. Medido en la web:
// la columna del país salía a 363 px y cada movimiento a 210. Lo que encoge de
// verdad es el `max-content` de la tabla.
const ajustada = { whiteSpace: 'nowrap' }

const cabecera = {
  ...ajustada,
  position: 'sticky', top: 0, zIndex: 2, background: '#071331',
  padding: '9px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
  borderBottom: '1px solid rgba(255,255,255,.08)', borderRight: RAYA, color: '#7dd3fc',
  // Centradas todas: media fila alineada a un lado y media al otro se leía
  // como dos tablas distintas.
  textAlign: 'center',
}
const celda = {
  ...ajustada,
  padding: '2px 3px', borderBottom: '1px solid rgba(255,255,255,.05)', borderRight: RAYA,
}
// La raya que separa los movimientos de los totales: son otra cosa, no un
// movimiento más.
const separa = { borderLeft: '2px solid rgba(255,255,255,.14)' }

const pieCelda = {
  ...ajustada,
  padding: '9px 10px', borderTop: '1px solid rgba(255,255,255,.12)', borderRight: RAYA,
}

// El porcentaje y el país van juntos en una sola casilla: son la misma cosa
// —cuánto se cobra ahí— y separarlos gastaba una columna entera con su raya.
//
// Se queda a la vista al desplazar a lo ancho: con veinte movimientos
// anotados, sin esto no se sabe de qué fila es cada cifra.
const pegadaPais = {
  position: 'sticky', left: 0, zIndex: 3, background: '#071331',
  borderRight: '1px solid rgba(255,255,255,.14)',
}

// El badge del porcentaje mide siempre lo mismo para que lo que va detrás
// quede alineado de fila a fila.
const ANCHO_BADGE = 44

/**
 * Lo que se lleva la casa de ese monto, bajo la propia cifra.
 *
 * No cuenta para el ancho de la columna: el texto es más largo que el propio
 * monto, y era eso —no las cifras— lo que estaba abriendo las columnas.
 */
function Comision({ monto, pct, moneda, montoClp }) {
  if (!monto) return null

  // Sin porcentaje puesto no hay comisión que enseñar, pero la casilla no
  // puede quedarse muda: se enseña lo que vale ese monto en pesos y se dice
  // que falta el porcentaje, que es justo lo que hay que arreglar.
  if (!pct) {
    return (
      <div style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.3, padding: '0 7px 3px', whiteSpace: 'nowrap' }}>
        {montoClp > 0 && <p style={{ color: '#64748b' }}>{pesos(montoClp)} CLP</p>}
        <p style={{ color: '#fcd34d' }}>sin %</p>
      </div>
    )
  }

  const enPesos = montoClp ? montoClp * pct / 100 : 0
  return (
    <div title={`Comisión del ${miles(pct)}%`}
      style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.3, padding: '0 7px 3px', whiteSpace: 'nowrap' }}>
      <p style={{ color: '#4ade80' }}>
        comisión: {miles(monto * pct / 100)} <span style={{ color: '#3f8f5c' }}>{moneda}</span>
      </p>
      {/* Y lo mismo en pesos chilenos, que es la moneda en la que se lleva la
          caja: arriba lo que cobró el cliente allá, aquí lo que entra aquí. */}
      {enPesos > 0 && (
        <p style={{ color: '#3f8f5c' }}>{pesos(enPesos)} CLP</p>
      )}
    </div>
  )
}

/**
 * El porcentaje de un país.
 *
 * Es un badge y no una casilla más porque no se toca casi nunca: se pone una
 * vez por ruta y vale para toda la fila. Se edita al tocarlo.
 */
function BadgePorcentaje({ valor, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(String(valor ?? ''))

  const cerrar = () => {
    setEditando(false)
    const n = aNumero(texto)
    if (n !== valor) onGuardar(n)
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={texto}
        inputMode="decimal"
        onChange={e => setTexto(e.target.value)}
        onBlur={cerrar}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{
          width: ANCHO_BADGE, padding: '2px 4px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
          textAlign: 'center', color: '#eaf2ff', background: 'rgba(56,189,248,.14)',
          border: '1px solid #38bdf8', outline: 'none', flexShrink: 0,
        }} />
    )
  }

  const puesto = Number(valor) > 0
  return (
    <button type="button" onClick={() => { setTexto(String(valor ?? '')); setEditando(true) }}
      title="Porcentaje de esta ruta"
      style={{
        // Ancho fijo aunque el número sea más corto: así las banderas y los
        // nombres de todas las filas empiezan en la misma vertical.
        width: ANCHO_BADGE, padding: '2px 4px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
        flexShrink: 0, textAlign: 'center',
        background: puesto ? 'rgba(74,222,128,.13)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${puesto ? 'rgba(74,222,128,.4)' : 'rgba(255,255,255,.12)'}`,
        color: puesto ? '#4ade80' : '#64748b',
      }}>
      {puesto ? `${miles(valor)}%` : '+ %'}
    </button>
  )
}

/**
 * Una casilla: el cruce de un país con un movimiento.
 *
 * Tres estados. La suya —lleva el monto y se edita—, una libre, y una trancada
 * porque ese movimiento ya es de otro país. La trancada no está muerta: al
 * tocarla el movimiento se pasa a este país, que es como se corrige haberse
 * equivocado de fila sin tener que borrar nada.
 */
function Casilla({ pais, col, apunte, pct, moneda, borrador, setBorrador, onGuardarBorrador, onEditar, onBorrar }) {
  const suya = apunte && apunte.destino === pais.name
  const trancada = apunte && !suya
  const enBorrador = !apunte && borrador.col === col && borrador.destino === pais.name

  const [texto, setTexto] = useState(suya ? conPuntos(String(apunte.monto)) : '')

  if (trancada) {
    return (
      <td style={celda}>
        <button type="button" className="fin-trancada"
          title={`Pasar este movimiento a ${pais.name}`}
          onClick={() => onEditar(apunte.id, { destino: pais.name })}>
          —
        </button>
      </td>
    )
  }

  if (suya) {
    return (
      <td className="fin-casilla" style={{ ...celda, background: 'rgba(56,189,248,.04)', position: 'relative' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end' }}>
          <input className="fin-cel" inputMode="decimal" value={texto} size={anchoDe(texto)}
            onChange={e => setTexto(conPuntos(e.target.value))}
            onBlur={() => {
              const n = aNumero(texto)
              if (n !== apunte.monto) onEditar(apunte.id, { monto: n })
            }} />
          <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7, flexShrink: 0 }}>{moneda}</span>
        </span>
        <button type="button" className="fin-x" onClick={() => onBorrar(apunte.id)}
          title="Quitar este movimiento">
          ✕
        </button>
        <Comision monto={apunte.monto} pct={pct} moneda={moneda} montoClp={apunte.monto_clp} />
      </td>
    )
  }

  return (
    <td style={celda}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end' }}>
        <input className="fin-cel" inputMode="decimal"
          value={enBorrador ? borrador.texto : ''}
          size={anchoDe(enBorrador ? borrador.texto : '')}
          onChange={e => setBorrador({
            col,
            destino: e.target.value ? pais.name : null,
            texto: conPuntos(e.target.value),
          })}
          onBlur={onGuardarBorrador} />
        {enBorrador && (
          <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7, flexShrink: 0 }}>{moneda}</span>
        )}
      </span>
      {enBorrador && <Comision monto={aNumero(borrador.texto)} pct={pct} moneda={moneda} />}
    </td>
  )
}

/** Un país: su porcentaje, sus casillas y lo que deja. */
function FilaPais({
  pais, pct, moneda, columnas, porColumna, borrador, setBorrador, onGuardarBorrador,
  onPorcentaje, onEditar, onBorrar, movido, ganado, movidoClp, ganadoClp,
}) {
  return (
    <tr>
      <td style={{ ...celda, ...pegadaPais, padding: '5px 8px 5px 5px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }}>
          <BadgePorcentaje valor={pct} onGuardar={onPorcentaje} />
          <Bandera iso2={pais.iso2} tam={16} />
          {pais.name}
        </span>
      </td>

      {columnas.map(c => {
        const apunte = porColumna.get(c)
        return (
          <Casilla
            key={`${c}:${apunte?.id ?? 'libre'}:${apunte?.monto ?? ''}:${apunte?.destino ?? ''}`}
            pais={pais}
            col={c}
            apunte={apunte}
            pct={pct}
            moneda={moneda}
            borrador={borrador}
            setBorrador={setBorrador}
            onGuardarBorrador={onGuardarBorrador}
            onEditar={onEditar}
            onBorrar={onBorrar}
          />
        )
      })}

      <td style={{ ...celda, ...separa, textAlign: 'right', padding: '6px 10px', color: '#aebfe2', fontSize: 13 }}>
        {movido ? (
          <>
            {miles(movido)} <span style={{ fontSize: 10.5, color: '#64748b' }}>{moneda}</span>
            {movidoClp > 0 && (
              <span style={{ display: 'block', fontSize: 10.5, color: '#4ade80' }}>
                {pesos(movidoClp)} CLP
              </span>
            )}
          </>
        ) : ''}
      </td>
      <td style={{ ...celda, textAlign: 'right', padding: '6px 12px', color: '#4ade80', fontWeight: 700, fontSize: 13 }}>
        {ganado ? (
          <>
            {miles(ganado)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#3f8f5c' }}>{moneda}</span>
            {ganadoClp > 0 && (
              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#4ade80' }}>
                {pesos(ganadoClp)} CLP
              </span>
            )}
          </>
        ) : ''}
      </td>
    </tr>
  )
}

/**
 * Poner el mismo porcentaje a todos los destinos de un país de una vez.
 *
 * Con diecisiete destinos, ir badge por badge para dejarlos todos igual es el
 * camino largo del caso normal: casi siempre se cobra lo mismo en casi todos.
 */
function PorcentajeGeneral({ onPoner }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        title="Poner un mismo porcentaje a todos los países de este origen"
        style={{
          padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
          color: '#8aa0cc',
        }}>
        % para todos
      </button>
    )
  }

  const aplicar = () => {
    const n = aNumero(texto)
    setAbierto(false)
    setTexto('')
    if (n > 0) onPoner(n)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        autoFocus
        value={texto}
        inputMode="decimal"
        placeholder="%"
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') aplicar()
          if (e.key === 'Escape') { setAbierto(false); setTexto('') }
        }}
        style={{
          width: 62, padding: '5px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
          textAlign: 'center', color: '#eaf2ff', background: 'rgba(56,189,248,.12)',
          border: '1px solid #38bdf8', outline: 'none',
        }} />
      <button type="button" onClick={aplicar}
        style={{
          padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
          background: 'rgba(74,222,128,.14)', border: '1px solid rgba(74,222,128,.4)', color: '#4ade80',
        }}>
        Poner a todos
      </button>
      <span style={{ fontSize: 11, color: '#64748b' }}>
        respeta los que ya tienen el suyo
      </span>
    </span>
  )
}

/** Lo que movió y lo que dejó cada país, y el total. */
function Resumen({ titulo, nota, paises, porOrigen, totales, sinTasa = 0 }) {
  const datoDe = nombre => porOrigen.find(o => o.origen === nombre)

  // A diferencia de la tabla de captura, estos dos cuadros sí se estiran: son
  // dos y tienen que repartirse el ancho de la pantalla a partes iguales. El
  // mínimo es para que en una ventana estrecha caigan uno debajo del otro en
  // vez de quedar espachurrados.
  return (
    <div style={{ flex: '1 1 380px', minWidth: 300 }}>
      <p style={{ marginBottom: 9, fontSize: 13, fontWeight: 700, color: '#eaf2ff' }}>
        {titulo}
        {nota && (
          <span style={{ fontWeight: 500, fontSize: 12, color: '#64748b', marginLeft: 7 }}>{nota}</span>
        )}
      </p>

      {/* Lo que no se pudo pasar a pesos se dice, en vez de dar el total por
          bueno: un total al que le falta dinero es peor que un total con una
          advertencia al lado. */}
      {sinTasa > 0 && (
        <p style={{ marginBottom: 8, fontSize: 11.5, color: '#fcd34d' }}>
          ⚠ {sinTasa} {sinTasa === 1 ? 'apunte queda' : 'apuntes quedan'} fuera de esta suma:
          no hay cambio guardado para su moneda.
        </p>
      )}
    <div style={{ ...GLASS, width: '100%', overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...cabecera, textAlign: 'left', width: 'auto' }}>PAÍS</th>
            <th style={{ ...cabecera, textAlign: 'right', color: '#aebfe2' }}>TOTAL COMPLETO</th>
            <th style={{ ...cabecera, textAlign: 'right', color: '#4ade80', borderRight: 'none' }}>TOTAL COMISIÓN</th>
          </tr>
        </thead>

        <tbody>
          {paises.map(p => {
            const d = datoDe(p.name)
            return (
              <tr key={p.id}>
                <td style={{ ...celda, padding: '5px 14px 5px 10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#eaf2ff' }}>
                    <Bandera iso2={p.iso2} tam={15} />
                    {p.name}
                  </span>
                </td>
                <td style={{ ...celda, textAlign: 'right', padding: '5px 10px', fontSize: 12.5, color: '#aebfe2' }}>
                  {d ? `${pesos(d.movido)} ${d.moneda}` : ''}
                </td>
                <td style={{ ...celda, textAlign: 'right', padding: '5px 10px', fontSize: 12.5, fontWeight: 700, color: '#4ade80', borderRight: 'none' }}>
                  {d ? <>{pesos(d.ganado)} <span style={{ fontWeight: 500, fontSize: 11, color: '#3f8f5c' }}>{d.moneda}</span></> : ''}
                </td>
              </tr>
            )
          })}
        </tbody>

        <tfoot>
          {totales.map(t => (
            <tr key={t.moneda}>
              <td style={{ ...pieCelda, fontSize: 11, fontWeight: 700, color: '#64748b', padding: '8px 14px 8px 10px' }}>
                TOTAL {t.moneda}
              </td>
              <td style={{ ...pieCelda, textAlign: 'right', padding: '8px 10px', fontSize: 13, fontWeight: 700, color: '#eaf2ff' }}>
                {pesos(t.movido)} <span style={{ fontWeight: 500, fontSize: 11, color: '#64748b' }}>{t.moneda}</span>
              </td>
              <td style={{ ...pieCelda, textAlign: 'right', padding: '8px 10px', fontSize: 13.5, fontWeight: 800, color: '#4ade80', borderRight: 'none' }}>
                {pesos(t.ganado)} <span style={{ fontWeight: 500, fontSize: 11, color: '#3f8f5c' }}>{t.moneda}</span>
              </td>
            </tr>
          ))}
          {!totales.length && (
            <tr>
              <td colSpan={3} style={{ ...pieCelda, fontSize: 12.5, color: '#64748b', borderRight: 'none' }}>
                Todavía no hay nada anotado en estas fechas.
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
    </div>
  )
}
