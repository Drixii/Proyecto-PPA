import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DateRangePicker from '../../components/DateRangePicker'
import api from '../../services/api'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '18px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }

// La entrada de la barra que no es un país, sino la lista entera.
const GENERAL = '__general__'

const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
const finDe = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const miles = n => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })

// El peso chileno no tiene céntimos: "119.732,23" no es una cifra que exista.
const pesos = n => Math.round(Number(n) || 0).toLocaleString('es-CL')

/**
 * Lo mismo en dólares, con la tasa de hoy que manda el servidor.
 *
 * Null cuando no hay tasa: la pantalla entonces enseña solo los pesos en vez
 * de una conversión inventada. Y el dólar SÍ tiene centavos, pero por encima
 * de cien se caen: en "1.040,37 USD" los dos últimos dígitos no dicen nada y
 * estorban al comparar una columna con otra.
 */
const enDolares = (clp, usdClp) => {
  if (!usdClp) return null
  const v = (Number(clp) || 0) / usdClp
  return v.toLocaleString('es-CL', {
    minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
  })
}

// "septiembre", a partir del primer día que manda el servidor. Se toma de ahí
// y no del reloj de quien mira: el mes lo decide el calendario chileno, que es
// donde está la caja.
function nombreDelMes(iso) {
  if (!iso) return 'este mes'
  const [a, m] = String(iso).split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

/**
  * Lo escrito a mano, a número. Se acepta como lo escribe la gente: "20.000",
  * "20000", "20.000,50". El punto es separador de miles y la coma decimal, que
  * es como se escribe en toda la región.
  *
  * Y se suma con el "+": en una casilla que ya tiene 180.000 se escribe
  * "180.000+20.000" y vale 200.000. Es lo que se hacía a mano con la
  * calculadora al lado para luego teclear el resultado, y por el camino se
  * perdía de vista de dónde salía la cifra.
  */
function aNumero(texto) {
  const partes = String(texto ?? '').split('+')
  const uno = parte => {
    const limpio = String(parte).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
    const n = parseFloat(limpio)
    return Number.isFinite(n) ? n : 0
  }
  // Una suma solo cuenta como suma si hay algo a los dos lados: "180.000+"
  // a medio escribir sigue valiendo 180.000 hasta que se teclee el otro.
  return partes.reduce((t, p) => t + uno(p), 0)
}

// Los puntos de miles puestos mientras se escribe.
//
// Se teclea "20000" y hay que ver "20.000": en Chile un monto sin puntos se
// lee mal, y en una columna de cifras es donde peor se lee. Se respeta la coma
// decimal a medio escribir —"20.000," no puede convertirse en "20.000"— o no
// habría forma de teclear los centavos.
function conPuntos(texto) {
  // Cada sumando lleva sus propios puntos de miles, y el "+" se queda tal
  // cual: "180.000+20.000" se lee de un golpe, "180000+20000" no.
  return String(texto ?? '')
    .split('+')
    .map(parte => {
      const crudo = String(parte).replace(/[^\d,]/g, '')
      if (!crudo) return ''
      const [entera, ...resto] = crudo.split(',')
      const agrupada = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      return resto.length ? `${agrupada},${resto.join('').slice(0, 2)}` : agrupada
    })
    .join('+')
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
  // El mes del acumulable va por su cuenta: null es el mes en curso, que es lo
  // que se quiere ver casi siempre.
  const [mesAcum, setMesAcum] = useState(null)
  // Modo de reordenar las filas, y el país que se está preguntando si quitar.
  const [ordenando, setOrdenando] = useState(false)
  const [porQuitar, setPorQuitar] = useState(null)
  // Lo que se va a borrar, mientras se pregunta: { titulo, detalle, hacer }.
  // Las X de esta pantalla borran una cifra que se anotó a mano y no hay
  // papelera donde ir a buscarla, así que ninguna actúa sin preguntar.
  const [porBorrar, setPorBorrar] = useState(null)

  const { data: paises = [] } = useQuery({
    queryKey: ['finanzas-paises'],
    queryFn: () => api.get('/admin/countries').then(r => r.data.data || []),
  })

  const desde = iso(rango.from)
  const hasta = iso(rango.to || rango.from)

  const { data: respuesta } = useQuery({
    queryKey: ['finanzas', desde, hasta, mesAcum],
    queryFn: () => api.get('/finanzas', {
      params: { desde, hasta, ...(mesAcum ? { mes: mesAcum } : {}) },
    }).then(r => r.data),
    // Mientras llega el mes nuevo se sigue viendo el anterior. Sin esto, al
    // cambiar de mes los dos cuadros parpadeaban a "todavía no hay nada
    // anotado", que es justo lo contrario de lo que está pasando.
    placeholderData: previo => previo,
  })

  const apuntes = respuesta?.data || []
  const totales = respuesta?.totales || []
  // Cuántos pesos vale un dólar hoy. En cero cuando el servidor no tiene
  // cambio para el dólar, y entonces no se enseña ninguna cifra en dólares.
  const usdClp = respuesta?.usd_clp || 0
  const porOrigen = respuesta?.por_origen || []
  const prefs = respuesta?.preferencias || { ocultos: [], orden: [], capital_usd: 0 }
  // El arqueo: lo contado en los bancos y lo que salió en gastos, del mismo
  // rango de fechas que el cuaderno.
  const bancos = respuesta?.bancos || []
  const gastos = respuesta?.gastos || []

  const origenes = useMemo(() => {
    const lista = paises.filter(p => p.can_send && p.active && !prefs.ocultos.includes(p.name))
    if (!prefs.orden.length) return lista
    // El mismo orden que las columnas: se deja una vez en "General" y vale
    // para los dos sitios, que es lo que uno espera al moverlos.
    const puesto = n => {
      const i = prefs.orden.indexOf(n)
      return i === -1 ? prefs.orden.length : i
    }
    return [...lista].sort((a, b) => puesto(a.name) - puesto(b.name))
  }, [paises, prefs.ocultos, prefs.orden])
  // Entregar efectivo en Venezuela es otra cosa que transferir allí: se cobra
  // distinto, así que necesita su propia fila y su propio porcentaje.
  //
  // Vive solo en esta pantalla y no en el catálogo de países de la web: no es
  // un país, y añadirlo allí lo sacaría en la calculadora del inicio y en el
  // formulario de envío, donde no tiene sentido. El cuaderno guarda el destino
  // como texto, así que aquí es una fila más.
  const destinos = useMemo(() => {
    const lista = paises.filter(p => p.can_receive && p.active && !prefs.ocultos.includes(p.name))
    const ve = lista.findIndex(p => p.name === 'Venezuela')
    if (ve === -1) return lista
    const cash = { id: 've-cash', name: 'Venezuela Cash', iso2: lista[ve].iso2, currency: lista[ve].currency }
    const con = [...lista.slice(0, ve + 1), cash, ...lista.slice(ve + 1)]
    return con.filter(p => !prefs.ocultos.includes(p.name))
  }, [paises, prefs.ocultos])

  // El orden que se dejó arrastrando. Los que no estén en él —un país nuevo,
  // por ejemplo— van detrás, en el orden de siempre, en vez de desaparecer.
  const destinosOrdenados = useMemo(() => {
    const guardado = prefs.orden
    if (!guardado.length) return destinos
    const puesto = n => {
      const i = guardado.indexOf(n)
      return i === -1 ? guardado.length : i
    }
    return [...destinos].sort((a, b) => puesto(a.name) - puesto(b.name))
  }, [destinos, prefs.orden])

  // Todo lo anotado desde siempre, sin mirar las fechas: es lo que va
  // sumando día tras día.
  const acumulado = respuesta?.acumulado || { por_origen: [], totales: [] }
  // El porcentaje es de la ruta, no de la línea: el badge de cada país.
  const pctDe = (destino) => (respuesta?.porcentajes || [])
    .find(p => p.origen === origen && p.destino === destino)?.porcentaje ?? 0

  // Mientras no se haya tocado nada, el primer país QUE TENGA algo anotado
  // ese día.
  //
  // Antes se abría siempre por el primero de la lista, y si ese día no se
  // había movido nada desde ahí la tabla salía vacía: parecía que lo anotado
  // se había perdido, estando guardado y contando en los totales de arriba.
  //
  // Va detrás de `origenes` a la fuerza: leerlo antes de declararlo deja la
  // pantalla en blanco entera, y el compilador no avisa.
  const conMovimiento = useMemo(
    () => new Set(apuntes.map(a => a.origen)),
    [apuntes],
  )
  const origen = elegido
    ?? origenes.find(p => conMovimiento.has(p.name))?.name
    ?? origenes[0]?.name
    ?? null

  // Lo que hay AHORA MISMO en la casilla que se está escribiendo.
  //
  // Vive aquí y no solo dentro de la celda porque los totales de abajo tienen
  // que moverse con cada tecla: esperar a salir del campo para ver el
  // resultado obliga a un clic al aire cada vez que se anota algo.
  const [tecleando, setTecleando] = useState(null)   // { id, monto }

  const delOrigenGuardado = useMemo(() => apuntes.filter(a => a.origen === origen), [apuntes, origen])

  /**
   * Los apuntes con lo que se está tecleando ya aplicado.
   *
   * La cifra en pesos se estima con el cambio del propio apunte, o con el de
   * cualquier otro del mismo país —misma moneda, mismo cambio—. Mientras no
   * haya ninguno con el que estimarlo, el total en pesos espera a que se
   * guarde: es preferible que falte un rato a enseñar una cifra inventada.
   */
  const delOrigen = useMemo(() => {
    const cambioDe = a => (a.tasa_clp || (a.monto ? a.monto_clp / a.monto : 0))
    const cambioSuelto = delOrigenGuardado.map(cambioDe).find(t => t > 0) || 0

    const lista = delOrigenGuardado.map(a => {
      if (!tecleando || tecleando.id !== a.id) return a
      const tasa = cambioDe(a) || cambioSuelto
      return {
        ...a,
        monto: tecleando.monto,
        ganancia: tecleando.monto * a.porcentaje / 100,
        monto_clp: tecleando.monto * tasa,
        ganancia_clp: tecleando.monto * tasa * a.porcentaje / 100,
      }
    })

    // Y la casilla en blanco que se está rellenando: todavía no existe en la
    // base, pero su cifra ya cuenta en lo que se ve.
    const nuevo = tecleando?.id == null && tecleando?.monto
      ? [{
          id: 'enCurso',
          origen,
          destino: tecleando.destino,
          orden: tecleando.col,
          monto: tecleando.monto,
          porcentaje: tecleando.porcentaje,
          ganancia: tecleando.monto * tecleando.porcentaje / 100,
          monto_clp: tecleando.monto * cambioSuelto,
          ganancia_clp: tecleando.monto * cambioSuelto * tecleando.porcentaje / 100,
        }]
      : []

    return [...lista, ...nuevo]
  }, [delOrigenGuardado, tecleando, origen])

  // Cada movimiento ocupa una columna, y su número de columna es el `orden`
  // con el que se guardó. Como una columna solo admite un monto, basta con
  // saber qué apunte hay en cada una.
  //
  // Se arma con lo GUARDADO, no con la versión viva: la casilla en blanco que
  // se está rellenando no puede convertirse a media tecla en una casilla ya
  // escrita, o el campo dejaría de ser el mismo mientras se escribe en él.
  const porColumna = useMemo(() => {
    const m = new Map()
    delOrigenGuardado.forEach(a => { if (!m.has(a.orden)) m.set(a.orden, a) })
    return m
  }, [delOrigenGuardado])

  // Las filas ya usadas y una libre al final, para el siguiente cliente.
  const filas = useMemo(() => {
    const usadas = [...porColumna.keys()]
    const tope = usadas.length ? Math.max(...usadas) + 1 : 0
    return Array.from({ length: tope + 1 }, (_, i) => i)
  }, [porColumna])

  // Lo que se quitó, para poder devolverlo. Venezuela Cash no está en el
  // catálogo, así que se añade a mano o no habría forma de recuperarlo.
  const quitados = useMemo(() => {
    const todos = [
      ...paises.filter(p => p.active),
      { id: 've-cash', name: 'Venezuela Cash', iso2: 've' },
    ]
    return prefs.ocultos
      .map(n => todos.find(p => p.name === n) || { id: `x-${n}`, name: n })
      .filter(Boolean)
  }, [paises, prefs.ocultos])

  const paisOrigen = origenes.find(p => p.name === origen)

  // Un país no se envía a sí mismo: el elegido no es destino de sí mismo y su
  // fila no sale nunca. El servidor tampoco deja guardar esa ruta, así que no
  // puede quedarse dinero escondido detrás de la fila que no se pinta.
  const destinosDelOrigen = useMemo(
    () => destinosOrdenados.filter(d => d.name !== origen),
    [destinosOrdenados, origen],
  )
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  // Lo que se está escribiendo en una casilla todavía vacía. Vive solo aquí
  // hasta que tenga monto: guardar columnas en blanco llenaría el cuaderno de
  // apuntes en cero.
  const [borrador, setBorrador] = useState({ col: null, destino: null, texto: '' })

  // Qué se está mirando: lo que se anota, o el arqueo contra los bancos.
  //
  // Los totales ya no son una pestaña: viven debajo de la tabla del día, que
  // es donde se miran —se anota una cifra y se quiere ver cómo quedó la suma—.
  // Tenerlos detrás de una pestaña obligaba a cambiar de pantalla y volver.
  const [vista, setVista] = useState('diarios')   // 'diarios' | 'bancos'

  // Lo último que no se pudo guardar, para poder decirlo y reintentarlo.
  const [fallo, setFallo] = useState(null)

  /**
   * Guardar sin perder nada por el camino.
   *
   * Cada casilla se manda sola al salir del campo, y hasta ahora si la
   * petición fallaba no pasaba nada visible: la cifra se quedaba escrita en
   * pantalla como si estuviera guardada y desaparecía al refrescar. El caso
   * normal no es un fallo raro — es el medio minuto en que la API se reinicia
   * al publicar un cambio.
   *
   * Por eso se reintenta solo unas cuantas veces antes de rendirse: casi
   * siempre el segundo intento ya entra. Y si de verdad no se puede, se dice.
   */
  const conReintento = async (quehacer, queEra) => {
    for (let intento = 0; intento < 4; intento++) {
      try {
        const r = await quehacer()
        setFallo(null)
        return r
      } catch (e) {
        const respondio = e?.response?.status
        // Si el servidor contestó que no (un monto inválido, un país
        // repetido), reintentar no va a cambiar nada: se dice y punto.
        const esDeRed = !respondio || respondio >= 500
        if (!esDeRed || intento === 3) {
          setFallo({
            que: queEra,
            porque: e?.response?.data?.detail || 'no se pudo conectar con el servidor',
            reintentar: () => conReintento(quehacer, queEra),
          })
          return null
        }
        await new Promise(r => setTimeout(r, 1200 * (intento + 1)))
      }
    }
  }

  const guardarBorrador = async () => {
    const monto = aNumero(borrador.texto)
    if (!monto || !borrador.destino || borrador.col === null || !origen) return
    const destino = borrador.destino
    const col = borrador.col
    const hecho = await conReintento(
      () => api.post('/finanzas', {
        fecha: desde,             // los apuntes nuevos caen en el primer día del rango
        origen,
        destino,
        monto,
        orden: col,
      }),
      `${miles(monto)} en ${destino}`,
    )
    // El borrador solo se borra si de verdad se guardó: si no, lo escrito
    // sigue en pantalla para poder reintentarlo.
    if (hecho) {
      setBorrador({ col: null, destino: null, texto: '' })
      setTecleando(null)
    }
    refrescar()
  }

  const editar = async (id, cambios) => {
    await conReintento(() => api.patch(`/finanzas/${id}`, cambios), 'el cambio en esa casilla')
    refrescar()
  }
  const borrarYa = async (id) => {
    await conReintento(() => api.delete(`/finanzas/${id}`), 'borrar ese movimiento')
    refrescar()
  }
  const borrar = (id) => setPorBorrar({
    titulo: '¿Borrar este movimiento?',
    detalle: 'Desaparece del día y deja de contar en los totales.',
    hacer: () => borrarYa(id),
  })
  const ponerPorcentaje = async (destino, porcentaje) => {
    await conReintento(
      () => api.put('/finanzas/porcentaje', { origen, destino, porcentaje }),
      `el ${miles(porcentaje)}% de ${destino}`,
    )
    refrescar()
  }

  // --- El arqueo ---------------------------------------------------------
  //
  // Cada cifra se manda sola al salir del campo, con el mismo reintento que el
  // cuaderno: la casilla de un banco se pierde igual de fácil que la de un
  // movimiento si la API se está reiniciando.
  const crearBanco = async (pais, orden, monto) => {
    await conReintento(
      () => api.post('/finanzas/bancos', { fecha: desde, pais, monto, orden }),
      `${miles(monto)} en ${pais}`,
    )
    refrescar()
  }
  const editarBanco = async (id, cambios) => {
    await conReintento(() => api.patch(`/finanzas/bancos/${id}`, cambios), 'ese saldo de banco')
    refrescar()
  }
  const borrarBancoYa = async (id) => {
    await conReintento(() => api.delete(`/finanzas/bancos/${id}`), 'borrar ese saldo')
    refrescar()
  }
  const borrarBanco = (id) => {
    const b = bancos.find(x => x.id === id)
    setPorBorrar({
      titulo: '¿Borrar este saldo?',
      detalle: b
        ? `${b.pais}: ${miles(b.monto)} ${b.moneda}. Deja de contar en el total contado.`
        : 'Deja de contar en el total contado.',
      hacer: () => borrarBancoYa(id),
    })
  }

  const crearGasto = async (datos) => {
    await conReintento(
      () => api.post('/finanzas/gastos', { fecha: desde, ...datos }),
      `el gasto de ${miles(datos.monto)}`,
    )
    refrescar()
  }
  const editarGasto = async (id, cambios) => {
    await conReintento(() => api.patch(`/finanzas/gastos/${id}`, cambios), 'ese gasto')
    refrescar()
  }
  const borrarGastoYa = async (id) => {
    await conReintento(() => api.delete(`/finanzas/gastos/${id}`), 'borrar ese gasto')
    refrescar()
  }
  const borrarGasto = (id) => {
    const g = gastos.find(x => x.id === id)
    setPorBorrar({
      titulo: '¿Borrar este gasto?',
      detalle: g
        ? `${g.concepto || 'Sin concepto'}: ${miles(g.monto)} ${g.moneda}. Vuelve a sumar en los dos totales.`
        : 'Vuelve a sumar en los dos totales.',
      hacer: () => borrarGastoYa(id),
    })
  }

  const guardarCapital = async (capital_usd) => {
    await conReintento(() => api.put('/finanzas/capital', { capital_usd }), 'el capital')
    refrescar()
  }

  const guardarPrefs = async (cambios) => {
    await conReintento(() => api.put('/finanzas/preferencias', cambios), 'la lista de países')
    refrescar()
  }

  const devolverPais = async (nombre) => {
    await guardarPrefs({ ocultos: prefs.ocultos.filter(n => n !== nombre) })
  }

  const quitarPais = async (nombre) => {
    await guardarPrefs({ ocultos: [...prefs.ocultos, nombre] })
    setPorQuitar(null)
    // Si se quitó el que se estaba mirando, hay que soltarlo o la tabla se
    // queda en un país que ya no está en la lista.
    if (elegido === nombre) setElegido(null)
  }

  // Mover un país delante de otro y guardar la lista entera.
  //
  // Se guarda completa y no solo lo que cambió: así el orden queda fijado
  // aunque mañana se añada un país nuevo, y no depende de en qué país se
  // estuviera cuando se arrastró.
  const reordenar = async (quien, delante) => {
    // Sobre todos los países, no solo sobre los que se estén viendo: la barra
    // de arriba enseña los que envían y la tabla los que reciben. Guardar solo
    // la sublista que se arrastró mandaría al final a todos los demás.
    const nombres = [...new Set([
      ...destinosOrdenados.map(d => d.name),
      ...origenes.map(p => p.name),
    ])]
    const desde = nombres.indexOf(quien)
    const hasta = nombres.indexOf(delante)
    if (desde === -1 || hasta === -1 || desde === hasta) return
    nombres.splice(hasta, 0, ...nombres.splice(desde, 1))
    await guardarPrefs({ orden: nombres })
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
  // Lo mismo pasado a pesos chilenos, que es como se lleva la caja. Se suma
  // de los apuntes y no del total que manda el servidor, que no sabe lo que
  // se está tecleando ahora mismo.
  const enPesos = {
    movido: delOrigen.reduce((s, a) => s + (a.monto_clp || 0), 0),
    ganado: delOrigen.reduce((s, a) => s + (a.ganancia_clp || 0), 0),
  }
  // Si el país ya cobra en pesos, el equivalente es la misma cifra repetida.
  const enCaja = paisOrigen?.currency === 'CLP'
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
        /* El aspa de quitar un país solo asoma al pasar por encima. */
        .fin-quitar{position:absolute;right:6px;top:50%;transform:translateY(-50%);
          opacity:0;color:#64748b;font-size:11px;line-height:1;padding:3px;border-radius:6px;
          transition:opacity .12s,color .12s}
        .fin-pais:hover .fin-quitar{opacity:1}
        .fin-quitar:hover{color:#f87171;background:rgba(248,113,113,.12)}
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

        {/* Las cuatro cifras que se miran de un vistazo, antes de entrar en
            ninguna tabla: lo del día a un lado y lo del mes al otro. Va arriba
            del todo y fuera de las pestañas porque es la respuesta a "¿cómo
            vamos?", que no depende de lo que se esté haciendo debajo. */}
        <GananciasDiarias
          dia={totales[0]}
          mes={acumulado.totales?.[0]}
          nombreMes={nombreDelMes(acumulado.desde)}
          unDia={!variosDias}
          usdClp={usdClp} />

        {/* Qué se mira de ese país: los montos que se anotan día a día, o lo
            que suman. Van en pestañas y no uno debajo del otro porque no se
            usan a la vez: se anota, o se mira el total. */}
        <div style={{
          display: 'flex', gap: 4, padding: '0 22px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}>
          {[['diarios', 'Montos diarios'], ['bancos', 'Bancos']].map(([id, txt]) => {
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
          {vista === 'bancos' && (
            <PanelArqueo
              paises={origenes}
              monedaDe={nombre => paises.find(p => p.name === nombre)?.currency || ''}
              bancos={bancos}
              gastos={gastos}
              capitalUsd={prefs.capital_usd || 0}
              capitalDesde={prefs.capital_desde}
              comisionDesdeCapitalClp={respuesta?.comision_desde_capital || 0}
              porOrigen={porOrigen}
              dia={desde}
              totalDiaClp={totales[0]?.ganado || 0}
              variosDias={variosDias}
              usdClp={usdClp}
              rango={<DateRangePicker value={rango} onChange={setRango} />}
              onCrearBanco={crearBanco}
              onEditarBanco={editarBanco}
              onBorrarBanco={borrarBanco}
              onCrearGasto={crearGasto}
              onEditarGasto={editarGasto}
              onBorrarGasto={borrarGasto}
              onCapital={guardarCapital}
              onMover={reordenar} />
          )}

          {/* Los países desde los que se envía. Salen solo en esta pestaña
              porque solo mandan aquí: el cuadro del total es el mismo para
              todos y no depende de cuál esté elegido. */}
          {vista === 'diarios' && (
          <div style={{
            display: 'flex', gap: 7, marginBottom: 16, overflowX: 'auto',
          }}>
            {/* "General" no es un país: es la lista entera para dejarla como
                se quiera, sin tener que entrar en ninguno. */}
            <button type="button" onClick={() => setElegido(GENERAL)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                background: origen === GENERAL ? 'rgba(56,189,248,.13)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${origen === GENERAL ? '#38bdf8' : 'rgba(255,255,255,.07)'}`,
                color: origen === GENERAL ? '#eaf2ff' : '#8aa0cc',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              General
            </button>

            {origenes.map(p => {
              const activo = p.name === origen
              return (
                <BotonPais
                  key={p.id}
                  pais={p}
                  activo={activo}
                  conMovimiento={conMovimiento.has(p.name)}
                  ordenando={ordenando}
                  onElegir={() => setElegido(p.name)}
                  onQuitar={() => setPorQuitar(p.name)}
                  onSoltar={quien => reordenar(quien, p.name)}
                />
              )
            })}

            {/* Devolver lo que se quitó. Sale solo si hay algo que devolver:
                un botón que nunca hace nada estorba más de lo que ayuda. */}
            {quitados.length > 0 && (
              <AgregarPais quitados={quitados} onAgregar={devolverPais} />
            )}

            {!origenes.length && (
              <p style={{ fontSize: 13, color: '#64748b' }}>No hay países marcados como origen.</p>
            )}
          </div>
          )}

          {vista === 'diarios' && origen === GENERAL && (
            <ListaGeneral
              paises={destinosOrdenados}
              quitados={quitados}
              onMover={reordenar}
              onQuitar={setPorQuitar}
              onDevolver={devolverPais} />
          )}

          {vista === 'diarios' && origen && origen !== GENERAL && (
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

                <button type="button" onClick={() => setOrdenando(o => !o)}
                  title="Cambiar el orden de los países arrastrando"
                  style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                    background: ordenando ? 'rgba(74,222,128,.14)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${ordenando ? 'rgba(74,222,128,.4)' : 'rgba(255,255,255,.1)'}`,
                    color: ordenando ? '#4ade80' : '#8aa0cc',
                  }}>
                  {ordenando ? 'Listo' : 'Editar'}
                </button>

                {ordenando && (
                  <span style={{ fontSize: 11.5, color: '#64748b' }}>
                    arrastra los países de la barra de arriba o las columnas de la tabla
                  </span>
                )}
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
                      <th style={{ ...cabecera, ...pegadaPais, padding: '9px 10px' }}>CLIENTE</th>

                      {/* Un país por columna, con su porcentaje encima: es lo
                          que vale para todo lo que se anote debajo. */}
                      {destinosDelOrigen.map(d => (
                        <ColumnaPais
                          key={d.id}
                          pais={d}
                          pct={pctDe(d.name)}
                          ordenando={ordenando}
                          onSoltar={nombre => reordenar(nombre, d.name)}
                          onQuitar={() => setPorQuitar(d.name)}
                          onPorcentaje={v => ponerPorcentaje(d.name, v)}
                        />
                      ))}

                      {/* Lo que cierra cada fila. Lo separa una raya más
                          marcada: no son un país más. */}
                      <th style={{ ...cabecera, ...separa, color: '#aebfe2' }}>TOTAL</th>
                      <th style={{ ...cabecera, color: '#4ade80', borderRight: 'none' }}>COMISIÓN</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filas.map(f => (
                      <FilaCliente
                        key={f}
                        fila={f}
                        destinos={destinosDelOrigen}
                        apunte={porColumna.get(f)}
                        moneda={paisOrigen?.currency}
                        pctDe={pctDe}
                        borrador={borrador}
                        setBorrador={setBorrador}
                        onGuardarBorrador={guardarBorrador}
                        onEditar={editar}
                        onBorrar={borrar}
                        onTecleando={setTecleando}
                      />
                    ))}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td style={{ ...pieCelda, ...pegadaPais, fontSize: 11, color: '#64748b', fontWeight: 700, padding: '9px 10px' }}>
                        TOTAL
                      </td>
                      {destinosDelOrigen.map(d => {
                        const movido = movidoDe(d.name)
                        return (
                          <td key={d.id} style={{ ...pieCelda, textAlign: 'right', fontSize: 12.5 }}>
                            {movido ? (
                              <>
                                <span style={{ color: '#eaf2ff', fontWeight: 700 }}>{miles(movido)}</span>
                                <span style={{ fontSize: 10, color: '#64748b' }}> {paisOrigen?.currency}</span>
                                {enCaja || (
                                  <span style={{ display: 'block', fontSize: 10.5, color: '#64748b' }}>
                                    {pesos(movidoClpDe(d.name))} CLP
                                  </span>
                                )}
                                <span style={{ display: 'block', fontSize: 10.5, color: '#4ade80' }}>
                                  {miles(ganadoDe(d.name))} de comisión
                                  {!enCaja && ganadoClpDe(d.name) > 0 && ` · ${pesos(ganadoClpDe(d.name))} CLP`}
                                </span>
                              </>
                            ) : ''}
                          </td>
                        )
                      })}
                      <td style={{ ...pieCelda, ...separa, textAlign: 'right', color: '#eaf2ff', fontWeight: 700, fontSize: 13 }}>
                        {miles(totalMovido)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>{paisOrigen?.currency}</span>
                        {/* Y lo mismo en pesos chilenos, que es la moneda en la
                            que se lleva la caja: arriba lo que se movió allá,
                            aquí lo que vale aquí. */}
                        {enPesos && !enCaja && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#4ade80', marginTop: 2 }}>
                            {pesos(enPesos.movido)} CLP
                          </span>
                        )}
                      </td>
                      <td style={{ ...pieCelda, textAlign: 'right', color: '#4ade80', fontWeight: 800, fontSize: 14, borderRight: 'none' }}>
                        {miles(totalGanado)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#3f8f5c' }}>{paisOrigen?.currency}</span>
                        {enPesos && !enCaja && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#4ade80', marginTop: 2 }}>
                            {pesos(enPesos.ganado)} CLP
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Lo que suma todo lo anotado, debajo de donde se anota.
                  La raya y el aire de arriba lo separan de la tabla: son dos
                  cosas distintas, una se escribe y la otra solo se lee. */}
              <div style={{
                marginTop: 44, paddingTop: 26,
                borderTop: '1px solid rgba(255,255,255,.22)',
              }}>
                <p style={{
                  fontSize: 20, fontWeight: 800, letterSpacing: '.04em',
                  color: '#eaf2ff', marginBottom: 18,
                }}>
                  TOTAL
                </p>
                <Totales
                  variosDias={variosDias}
                  paises={origenes}
                  porOrigen={porOrigen}
                  totales={totales}
                  acumulado={acumulado}
                  usdClp={usdClp}
                  sinTasa={respuesta?.sin_tasa || 0}
                  onMes={setMesAcum} />
              </div>
            </>
          )}

        </div>
      </main>

      {fallo && (
        <NoSeGuardo fallo={fallo} onCerrar={() => setFallo(null)} />
      )}

      {porQuitar && (
        <ConfirmarQuitar
          pais={porQuitar}
          onSi={() => quitarPais(porQuitar)}
          onNo={() => setPorQuitar(null)} />
      )}

      {porBorrar && (
        <ConfirmarBorrado
          titulo={porBorrar.titulo}
          detalle={porBorrar.detalle}
          onSi={() => { porBorrar.hacer(); setPorBorrar(null) }}
          onNo={() => setPorBorrar(null)} />
      )}
    </div>
  )
}

/**
 * Preguntar antes de quitar un país de la pantalla.
 *
 * Dice qué pasa y qué no: lo que asusta de un "eliminar" es no saber si se
 * lleva por delante lo ya anotado o el país de toda la web. Ni una cosa ni la
 * otra, y por eso se dice aquí en vez de dejarlo a la imaginación.
 */
function ConfirmarQuitar({ pais, onSi, onNo }) {
  return (
    <div
      onClick={onNo}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(3,8,22,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        backdropFilter: 'blur(3px)',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{ ...GLASS, width: 'min(420px, 100%)', padding: '20px 22px' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>
          ¿Quitar {pais} de esta pantalla?
        </p>
        <p style={{ fontSize: 12.5, color: '#8aa0cc', marginTop: 9, lineHeight: 1.5 }}>
          Deja de salir en tu cuaderno de finanzas. Lo que ya tengas anotado de
          {' '}{pais} no se borra y sigue contando en los totales, y la web del
          cliente no cambia en nada.
        </p>

        <div style={{ display: 'flex', gap: 9, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onNo}
            style={{
              padding: '8px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(255,255,255,.12)', color: '#aebfe2',
            }}>
            No, dejarlo
          </button>
          <button type="button" onClick={onSi}
            style={{
              padding: '8px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
              background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.45)', color: '#f87171',
            }}>
            Sí, quitarlo
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Preguntar antes de borrar una cifra anotada a mano.
 *
 * Mismo aspecto que el de quitar un país, pero con el texto que le toque: lo
 * que se borra aquí no está en ningún otro sitio, y las X viven pegadas a las
 * casillas donde se escribe.
 */
function ConfirmarBorrado({ titulo, detalle, onSi, onNo }) {
  return (
    <div
      onClick={onNo}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(3,8,22,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        backdropFilter: 'blur(3px)',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{ ...GLASS, width: 'min(420px, 100%)', padding: '20px 22px' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>{titulo}</p>
        <p style={{ fontSize: 12.5, color: '#8aa0cc', marginTop: 9, lineHeight: 1.5 }}>
          {detalle} No se puede deshacer.
        </p>

        <div style={{ display: 'flex', gap: 9, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onNo}
            style={{
              padding: '8px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(255,255,255,.12)', color: '#aebfe2',
            }}>
            No, dejarlo
          </button>
          <button type="button" onClick={onSi}
            style={{
              padding: '8px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
              background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.45)', color: '#f87171',
            }}>
            Sí, borrarlo
          </button>
        </div>
      </div>
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
        {montoClp > 0 && moneda !== 'CLP' && <p style={{ color: '#64748b' }}>{pesos(montoClp)} CLP</p>}
        <p style={{ color: '#fcd34d' }}>sin %</p>
      </div>
    )
  }

  // Cuando el país ya cobra en pesos, el "equivalente" es la misma cifra: se
  // vería dos veces seguidas y no añade nada.
  const enPesos = moneda === 'CLP' ? 0 : (montoClp ? montoClp * pct / 100 : 0)
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


/**
 * La cabecera de un país: su porcentaje, su nombre y el aspa.
 *
 * El porcentaje va aquí arriba y no en cada celda porque es de la ruta
 * entera: vale para todo lo que se anote en esa columna.
 */
function ColumnaPais({ pais, pct, ordenando, onSoltar, onQuitar, onPorcentaje }) {
  const [encima, setEncima] = useState(false)

  // Arrastrar con lo que trae el navegador, sin librería: se coge una columna
  // por su cabecera y se suelta sobre otra.
  const arrastre = ordenando ? {
    draggable: true,
    onDragStart: e => {
      e.dataTransfer.setData('text/plain', pais.name)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: e => { e.preventDefault(); setEncima(true) },
    onDragLeave: () => setEncima(false),
    onDrop: e => {
      e.preventDefault()
      setEncima(false)
      const quien = e.dataTransfer.getData('text/plain')
      if (quien && quien !== pais.name) onSoltar(quien)
    },
  } : {}

  return (
    <th {...arrastre} className="fin-pais"
      style={{
        ...cabecera, padding: '7px 9px', position: 'relative',
        cursor: ordenando ? 'grab' : undefined,
        // La raya marca dónde va a caer la columna que se arrastra.
        boxShadow: encima ? 'inset 2px 0 0 #38bdf8' : undefined,
        background: encima ? 'rgba(56,189,248,.08)' : '#071331',
      }}>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <BadgePorcentaje valor={pct} onGuardar={onPorcentaje} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#aebfe2' }}>
          <Bandera iso2={pais.iso2} tam={15} />
          {pais.name}
        </span>
      </span>
      <button type="button" className="fin-quitar" onClick={onQuitar}
        title={`Quitar ${pais.name} de esta pantalla`}>
        ✕
      </button>
    </th>
  )
}

/**
 * Una casilla: el cruce de un cliente con un país.
 *
 * Tres estados. La suya —lleva el monto y se edita—, una libre, y una
 * trancada porque ese cliente ya mandó a otro país. La trancada no está
 * muerta: al tocarla el movimiento se pasa a esa columna, que es como se
 * corrige haberse equivocado de país sin borrar nada.
 */
function CeldaMonto({ pais, fila, apunte, pct, moneda, borrador, setBorrador, onGuardarBorrador, onEditar, onBorrar, onTecleando }) {
  const suya = apunte && apunte.destino === pais.name
  const trancada = apunte && !suya
  const enBorrador = !apunte && borrador.col === fila && borrador.destino === pais.name

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
            onChange={e => {
              const nuevo = conPuntos(e.target.value)
              setTexto(nuevo)
              onTecleando({ id: apunte.id, monto: aNumero(nuevo) })
            }}
            onBlur={() => {
              const n = aNumero(texto)
              onTecleando(null)
              if (n !== apunte.monto) onEditar(apunte.id, { monto: n })
            }}
            // Enter guarda, sin tener que pulsar fuera: se anota una fila tras
            // otra con el teclado y buscar un sitio en blanco donde hacer clic
            // cada vez era el camino largo.
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }} />
          <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7, flexShrink: 0 }}>{moneda}</span>
        </span>
        <button type="button" className="fin-x" onClick={() => onBorrar(apunte.id)}
          title="Quitar este movimiento">
          ✕
        </button>
        <Comision monto={aNumero(texto)} pct={pct} moneda={moneda} montoClp={apunte.monto_clp} />
      </td>
    )
  }

  return (
    <td style={celda}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end' }}>
        <input className="fin-cel" inputMode="decimal"
          value={enBorrador ? borrador.texto : ''}
          size={anchoDe(enBorrador ? borrador.texto : '')}
          onChange={e => {
            const texto = conPuntos(e.target.value)
            setBorrador({ col: fila, destino: e.target.value ? pais.name : null, texto })
            onTecleando(texto
              ? { id: null, col: fila, destino: pais.name, monto: aNumero(texto), porcentaje: pct }
              : null)
          }}
          onBlur={onGuardarBorrador}
          // Igual que en la casilla ya guardada: Enter suelta el campo y lo
          // que ya había al salir se encarga de guardarlo.
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }} />
        {enBorrador && (
          <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7, flexShrink: 0 }}>{moneda}</span>
        )}
      </span>
      {enBorrador && <Comision monto={aNumero(borrador.texto)} pct={pct} moneda={moneda} />}
    </td>
  )
}

/** Un cliente: su fila, con el monto en el país al que mandó. */
function FilaCliente({
  fila, destinos, apunte, moneda, pctDe, borrador, setBorrador,
  onGuardarBorrador, onEditar, onBorrar, onTecleando,
}) {
  const pct = apunte ? apunte.porcentaje : 0

  return (
    <tr>
      <td style={{ ...celda, ...pegadaPais, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, color: '#8aa0cc' }}>
        Cliente {fila + 1}
      </td>

      {destinos.map(d => (
        <CeldaMonto
          key={`${d.id}:${apunte?.id ?? 'libre'}:${apunte?.monto ?? ''}:${apunte?.destino ?? ''}`}
          pais={d}
          fila={fila}
          apunte={apunte}
          pct={pctDe(d.name)}
          moneda={moneda}
          borrador={borrador}
          setBorrador={setBorrador}
          onGuardarBorrador={onGuardarBorrador}
          onEditar={onEditar}
          onBorrar={onBorrar}
          onTecleando={onTecleando}
        />
      ))}

      <td style={{ ...celda, ...separa, textAlign: 'right', padding: '6px 10px', color: '#aebfe2', fontSize: 13 }}>
        {apunte ? (
          <>
            {miles(apunte.monto)} <span style={{ fontSize: 10.5, color: '#64748b' }}>{moneda}</span>
            {apunte.monto_clp > 0 && moneda !== 'CLP' && (
              <span style={{ display: 'block', fontSize: 10.5, color: '#4ade80' }}>
                {pesos(apunte.monto_clp)} CLP
              </span>
            )}
          </>
        ) : ''}
      </td>
      <td style={{ ...celda, textAlign: 'right', padding: '6px 12px', color: '#4ade80', fontWeight: 700, fontSize: 13 }}>
        {apunte && pct ? (
          <>
            {miles(apunte.ganancia)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#3f8f5c' }}>{moneda}</span>
            {apunte.ganancia_clp > 0 && moneda !== 'CLP' && (
              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#4ade80' }}>
                {pesos(apunte.ganancia_clp)} CLP
              </span>
            )}
          </>
        ) : ''}
      </td>
    </tr>
  )
}

/**
 * Lo que movió y lo que dejó cada país, y el total.
 *
 * Las cifras van en dólares, que es la moneda en la que se comparan unas con
 * otras. Debajo queda el peso en chico: es lo que está guardado y congelado el
 * día del apunte, y el dólar sale de ahí con la tasa de hoy, así que el peso
 * tiene que seguir a la vista para poder cuadrar.
 */
function Resumen({ titulo, nota, encabezado, paises, porOrigen, totales, usdClp = 0, sinTasa = 0 }) {
  const datoDe = nombre => porOrigen.find(o => o.origen === nombre)

  /** Una cifra: dólares arriba y pesos debajo, o solo pesos si no hay tasa. */
  const Doble = ({ clp, moneda, chico, color, colorChico }) => {
    const usd = enDolares(clp, usdClp)
    if (usd === null) {
      return <>{pesos(clp)} <span style={{ fontWeight: 500, fontSize: chico, color: colorChico }}>{moneda}</span></>
    }
    return (
      <>
        <span style={{ color }}>{usd}</span>{' '}
        <span style={{ fontWeight: 500, fontSize: chico, color: colorChico }}>USD</span>
        <span style={{ display: 'block', fontWeight: 500, fontSize: chico, color: colorChico }}>
          {pesos(clp)} {moneda}
        </span>
      </>
    )
  }

  // Con los países en columnas los dos cuadros son anchos, así que van uno
  // debajo del otro: lado a lado no cabrían sin partir las cifras.
  return (
    <div style={{ width: '100%' }}>
      {/* Los títulos ocupan lo mismo lleven selector de mes o no, para que las
          dos tablas arranquen a la misma altura. Sin esto, la de la derecha
          bajaba lo que mide el selector y las filas de una no coincidían con
          las de la otra, que es justo lo que se quiere comparar. */}
      <div style={{ minHeight: 64, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <p style={{ marginBottom: encabezado ? 8 : 9, fontSize: 13, fontWeight: 700, color: '#eaf2ff' }}>
          {titulo}
          {nota && (
            <span style={{ fontWeight: 500, fontSize: 12, color: '#64748b', marginLeft: 7 }}>{nota}</span>
          )}
        </p>

        {encabezado && <div style={{ marginBottom: 9 }}>{encabezado}</div>}
      </div>

      {/* Lo que no se pudo pasar a pesos se dice, en vez de dar el total por
          bueno: un total al que le falta dinero es peor que un total con una
          advertencia al lado. */}
      {sinTasa > 0 && (
        <p style={{ marginBottom: 8, fontSize: 11.5, color: '#fcd34d' }}>
          ⚠ {sinTasa} {sinTasa === 1 ? 'apunte queda' : 'apuntes quedan'} fuera de esta suma:
          no hay cambio guardado para su moneda.
        </p>
      )}
    {/* A todo el ancho: son dos filas y muchas columnas, y encogidas al
        contenido dejaban media pantalla en blanco a la derecha. */}
    <div style={{ ...GLASS, width: '100%', overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ ...cabecera, ...pegadaPais, textAlign: 'left', padding: '9px 10px' }} />
            {paises.map(p => (
              <th key={p.id} style={{ ...cabecera, padding: '8px 10px', color: '#aebfe2' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <Bandera iso2={p.iso2} tam={15} />
                  {p.name}
                </span>
              </th>
            ))}
            {totales.map(t => (
              <th key={t.moneda} style={{ ...cabecera, ...separa, color: '#7dd3fc', borderRight: 'none' }}>
                TOTAL {usdClp ? 'USD' : t.moneda}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Dos filas y los países en columnas, como la tabla de arriba: así
              las dos se leen igual y no hay que cambiar el chip al pasar de
              una a otra. */}
          <tr>
            <td style={{ ...celda, ...pegadaPais, padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
              TOTAL COMPLETO
            </td>
            {paises.map(p => {
              const d = datoDe(p.name)
              return (
                <td key={p.id} style={{ ...celda, textAlign: 'right', padding: '8px 10px', fontSize: 12.5, color: '#eaf2ff' }}>
                  {d ? <Doble clp={d.movido} moneda={d.moneda} chico={10} color="#eaf2ff" colorChico="#64748b" /> : ''}
                </td>
              )
            })}
            {totales.map(t => (
              <td key={t.moneda} style={{ ...celda, ...separa, textAlign: 'right', padding: '8px 10px', fontSize: 13, fontWeight: 700, color: '#eaf2ff', borderRight: 'none' }}>
                <Doble clp={t.movido} moneda={t.moneda} chico={10.5} color="#eaf2ff" colorChico="#64748b" />
              </td>
            ))}
          </tr>

          <tr>
            <td style={{ ...celda, ...pegadaPais, padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
              TOTAL COMISIÓN
            </td>
            {paises.map(p => {
              const d = datoDe(p.name)
              return (
                <td key={p.id} style={{ ...celda, textAlign: 'right', padding: '8px 10px', fontSize: 12.5, fontWeight: 700, color: '#4ade80' }}>
                  {d ? <Doble clp={d.ganado} moneda={d.moneda} chico={10} color="#4ade80" colorChico="#3f8f5c" /> : ''}
                </td>
              )
            })}
            {totales.map(t => (
              <td key={t.moneda} style={{ ...celda, ...separa, textAlign: 'right', padding: '8px 10px', fontSize: 13.5, fontWeight: 800, color: '#4ade80', borderRight: 'none' }}>
                <Doble clp={t.ganado} moneda={t.moneda} chico={10.5} color="#4ade80" colorChico="#3f8f5c" />
              </td>
            ))}
          </tr>

          {!totales.length && (
            <tr>
              <td colSpan={paises.length + 1} style={{ ...celda, padding: '10px', fontSize: 12.5, color: '#64748b', borderRight: 'none' }}>
                Todavía no hay nada anotado en estas fechas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  )
}

/**
 * Qué mes enseña el acumulable.
 *
 * Con flechas y no con un calendario de dos fechas: lo que se quiere ver aquí
 * es un mes entero, y elegir "del 1 al 30" a mano para eso es dar un rodeo.
 * No deja pasar del mes en curso, porque ahí no hay nada anotado todavía.
 */
function SelectorDeMes({ mes, tope, onCambiar }) {
  if (!mes) return null

  const mueve = (pasos) => {
    const [a, m] = mes.split('-').map(Number)
    const d = new Date(a, m - 1 + pasos, 1)
    const siguiente = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    onCambiar(siguiente === tope ? null : siguiente)
  }

  const esElActual = mes === tope
  const flecha = {
    padding: '4px 9px', borderRadius: 8, fontSize: 13, lineHeight: 1,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#aebfe2',
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <button type="button" onClick={() => mueve(-1)} title="Mes anterior" style={flecha}>‹</button>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#eaf2ff', minWidth: 132, textAlign: 'center' }}>
        {nombreDelMes(`${mes}-01`)}
      </span>
      <button type="button" onClick={() => mueve(1)} disabled={esElActual}
        title={esElActual ? 'No hay meses por delante' : 'Mes siguiente'}
        style={{ ...flecha, opacity: esElActual ? .35 : 1, cursor: esElActual ? 'not-allowed' : 'pointer' }}>
        ›
      </button>
      {!esElActual && (
        <button type="button" onClick={() => onCambiar(null)}
          style={{ fontSize: 11.5, color: '#7dd3fc', padding: '4px 8px' }}>
          volver a este mes
        </button>
      )}
    </span>
  )
}

/** Una cifra grande con su rótulo, y al lado lo que vale en dólares. */
function Cifra({ rotulo, valor, verde, usdClp }) {
  const usd = enDolares(valor, usdClp)

  return (
    <div style={{
      ...GLASS, flex: '1 1 150px', minWidth: 140, padding: '11px 14px',
      borderColor: verde ? 'rgba(74,222,128,.2)' : 'rgba(255,255,255,.07)',
    }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: '#64748b' }}>
        {rotulo}
      </p>
      <p style={{
        fontSize: 21, fontWeight: 800, marginTop: 3, letterSpacing: '-.02em',
        color: verde ? '#4ade80' : '#eaf2ff',
      }}>
        {pesos(valor)} <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>CLP</span>
      </p>
      {/* El mismo dinero en dólares, en chico y debajo: la caja se lleva en
          pesos, el dólar es para saber de qué tamaño es la cifra. */}
      {usd !== null && (
        <p style={{ fontSize: 11.5, fontWeight: 600, marginTop: 1, color: verde ? '#3f8f5c' : '#64748b' }}>
          ≈ {usd} <span style={{ fontWeight: 500 }}>USD</span>
        </p>
      )}
    </div>
  )
}

/**
 * Lo del día y lo del mes, de un vistazo.
 *
 * Las mismas cifras que cierran los dos cuadros de la pestaña "Total", pero
 * arriba del todo: son la respuesta a "¿cómo vamos?" y no tenían por qué estar
 * al final de una tabla de diecisiete filas.
 */
function GananciasDiarias({ dia, mes, nombreMes, unDia, usdClp }) {
  const bloque = { flex: '1 1 320px', minWidth: 290 }
  const rotulo = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', color: '#7dd3fc', marginBottom: 7 }

  return (
    <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#eaf2ff', marginBottom: 11 }}>
        Ganancias diarias
      </p>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div style={bloque}>
          <p style={rotulo}>ENTRADA · {unDia ? 'HOY' : 'RANGO ELEGIDO'}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Cifra rotulo="TOTAL" valor={dia?.movido} usdClp={usdClp} />
            <Cifra rotulo="COMISIÓN" valor={dia?.ganado} usdClp={usdClp} verde />
          </div>
        </div>

        <div style={bloque}>
          <p style={rotulo}>ACUMULABLE · {String(nombreMes || '').toUpperCase()}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Cifra rotulo="TOTAL" valor={mes?.movido} usdClp={usdClp} />
            <Cifra rotulo="GANANCIA" valor={mes?.ganado} usdClp={usdClp} verde />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Devolver a la lista un país que se había quitado. */
function AgregarPais({ quitados, onAgregar }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <span style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setAbierto(a => !a)}
        title="Volver a mostrar un país"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.18)',
          color: '#8aa0cc',
        }}>
        + Agregar
      </button>

      {abierto && (
        <>
          <span onClick={() => setAbierto(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            ...GLASS, position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 21,
            padding: 6, minWidth: 200, maxHeight: 300, overflowY: 'auto',
          }}>
            {quitados.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onAgregar(p.name); setAbierto(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', borderRadius: 9, fontSize: 13, color: '#eaf2ff',
                  textAlign: 'left',
                }}>
                <Bandera iso2={p.iso2} tam={15} />
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

/**
 * La lista entera, para dejarla como se quiera.
 *
 * Aquí no hay montos ni porcentajes: solo el orden y qué se ve. Ordenar desde
 * la tabla de un país obliga a mirar diecisiete columnas de cifras para algo
 * que no tiene que ver con el dinero.
 */
function ListaGeneral({ paises, quitados, onMover, onQuitar, onDevolver }) {
  const [encima, setEncima] = useState(null)

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#eaf2ff' }}>Todos los países</p>
      <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
        Arrástralos para ponerlos en el orden que quieras. Es el mismo orden en
        todas las tablas. Lo que quites deja de salir en el cuaderno, sin borrar
        nada de lo anotado.
      </p>

      <div style={{ ...GLASS, padding: 6 }}>
        {paises.map((p, i) => (
          <div key={p.id}
            draggable
            onDragStart={e => { e.dataTransfer.setData('text/plain', p.name); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={e => { e.preventDefault(); setEncima(p.name) }}
            onDragLeave={() => setEncima(null)}
            onDrop={e => {
              e.preventDefault()
              setEncima(null)
              const quien = e.dataTransfer.getData('text/plain')
              if (quien && quien !== p.name) onMover(quien, p.name)
            }}
            className="fin-pais"
            style={{
              display: 'flex', alignItems: 'center', gap: 9, position: 'relative',
              padding: '9px 11px', borderRadius: 10, cursor: 'grab',
              background: encima === p.name ? 'rgba(56,189,248,.1)' : 'transparent',
              boxShadow: encima === p.name ? 'inset 0 2px 0 #38bdf8' : undefined,
            }}>
            <span style={{ fontSize: 11, color: '#475569', width: 20, textAlign: 'right' }}>{i + 1}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
              <path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />
            </svg>
            <Bandera iso2={p.iso2} tam={16} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }}>{p.name}</span>
            <button type="button" className="fin-quitar" onClick={() => onQuitar(p.name)}
              title={`Quitar ${p.name}`} style={{ position: 'static', transform: 'none' }}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {quitados.length > 0 && (
        <>
          <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', color: '#64748b', margin: '18px 0 8px' }}>
            QUITADOS
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {quitados.map(p => (
              <button key={p.id} type="button" onClick={() => onDevolver(p.name)}
                title={`Volver a mostrar ${p.name}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  background: 'rgba(255,255,255,.03)', border: '1px dashed rgba(255,255,255,.15)',
                  color: '#64748b',
                }}>
                <Bandera iso2={p.iso2} tam={14} />
                {p.name}
                <span style={{ color: '#4ade80', fontSize: 13 }}>+</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Avisar de que algo no se guardó.
 *
 * Se queda en pantalla hasta que se cierre: un aviso que se va solo en tres
 * segundos no sirve para esto, porque lo que hay que hacer es volver a
 * intentarlo y eso lleva más de tres segundos.
 */
function NoSeGuardo({ fallo, onCerrar }) {
  const [reintentando, setReintentando] = useState(false)

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 60, maxWidth: 'min(420px, calc(100vw - 32px))',
      padding: '13px 16px', borderRadius: 14,
      background: 'rgba(40,10,14,.96)', border: '1px solid rgba(248,113,113,.45)',
      boxShadow: '0 12px 34px rgba(0,6,28,.55)',
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>
        No se guardó {fallo.que}
      </p>
      <p style={{ fontSize: 12, color: '#e7b9b9', marginTop: 5, lineHeight: 1.45 }}>
        {fallo.porque}. Lo que escribiste sigue en pantalla: puedes reintentarlo.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 11, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCerrar}
          style={{
            padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600,
            background: 'transparent', border: '1px solid rgba(255,255,255,.14)', color: '#e7b9b9',
          }}>
          Cerrar
        </button>
        <button type="button" disabled={reintentando}
          onClick={async () => {
            setReintentando(true)
            await fallo.reintentar()
            setReintentando(false)
          }}
          style={{
            padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700,
            background: 'rgba(248,113,113,.2)', border: '1px solid rgba(248,113,113,.5)', color: '#fca5a5',
            opacity: reintentando ? .6 : 1,
          }}>
          {reintentando ? 'Probando…' : 'Reintentar'}
        </button>
      </div>
    </div>
  )
}

/**
 * Un país de la barra de arriba.
 *
 * Solo se arrastra con "Editar" puesto, igual que las columnas de la tabla:
 * es la barra que más se pulsa, y con el arrastre siempre suelto un clic que
 * se va dos píxeles mueve el país en vez de abrirlo.
 *
 * El orden que queda es el mismo que el de las columnas de la tabla.
 */
function BotonPais({ pais, activo, conMovimiento, ordenando, onElegir, onQuitar, onSoltar }) {
  const [encima, setEncima] = useState(false)

  const arrastre = ordenando ? {
    draggable: true,
    onDragStart: e => {
      e.dataTransfer.setData('text/plain', pais.name)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: e => { e.preventDefault(); setEncima(true) },
    onDragLeave: () => setEncima(false),
    onDrop: e => {
      e.preventDefault()
      setEncima(false)
      const quien = e.dataTransfer.getData('text/plain')
      if (quien && quien !== pais.name) onSoltar(quien)
    },
  } : {}

  return (
    <span
      className="fin-pais"
      {...arrastre}
      style={{
        position: 'relative', flexShrink: 0, borderRadius: 999,
        // La raya marca dónde va a caer el que se arrastra.
        boxShadow: encima ? 'inset 3px 0 0 #38bdf8' : undefined,
      }}>
      <button type="button" onClick={onElegir}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          cursor: ordenando ? 'grab' : 'pointer',
          padding: '7px 26px 7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          transition: 'all .15s',
          background: activo ? 'rgba(56,189,248,.13)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${activo ? '#38bdf8' : 'rgba(255,255,255,.07)'}`,
          color: activo ? '#eaf2ff' : '#8aa0cc',
        }}>
        <Bandera iso2={pais.iso2} />
        {pais.name}
        {/* Un punto en los que tienen algo anotado ese día. */}
        {conMovimiento && (
          <span title="Tiene movimientos este día"
            style={{ width: 6, height: 6, borderRadius: 999, background: '#4ade80', flexShrink: 0 }} />
        )}
      </button>
      <button type="button" className="fin-quitar" onClick={onQuitar}
        title={`Quitar ${pais.name} de esta pantalla`}>
        ✕
      </button>
    </span>
  )
}


/**
 * Los dos cuadros que suman: lo del día (o del rango) y lo del mes.
 *
 * Están aparte porque se miran en dos sitios: debajo de la tabla donde se
 * anota, y dentro del arqueo, donde hay que comparar lo que dicen con lo que
 * de verdad hay en los bancos.
 */
function Totales({ variosDias, paises, porOrigen, totales, acumulado, usdClp, sinTasa, onMes }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Resumen titulo={variosDias ? 'Suma total del rango' : 'Suma total del día'}
        nota={usdClp ? 'en dólares' : 'en pesos chilenos'}
        paises={paises} porOrigen={porOrigen} totales={totales}
        usdClp={usdClp}
        sinTasa={sinTasa} />
      <Resumen titulo="Acumulable del mes"
        nota={usdClp ? 'en dólares' : 'en pesos chilenos'}
        encabezado={
          <SelectorDeMes
            mes={acumulado.desde?.slice(0, 7)}
            tope={acumulado.mes_actual}
            onCambiar={onMes} />
        }
        paises={paises} porOrigen={acumulado.por_origen} totales={acumulado.totales}
        usdClp={usdClp}
        sinTasa={acumulado.sin_tasa || 0} />
    </div>
  )
}


// "16/10", a partir de la fecha que manda el servidor. Sin año: dentro del
// arqueo todo es del mismo mes y el año solo ocupa sitio.
const diaCorto = f => String(f || '').split('-').reverse().slice(0, 2).join('/')

// Lo que se admite de diferencia para decir que cuadra: un dólar.
//
// Cero no sirve: los saldos se cuentan en varias monedas y pasarlos a dólares
// deja céntimos de redondeo que no son un descuadre, son aritmética.
const MARGEN_USD = 1

/**
 * Una casilla del arqueo: se teclea, Enter o salir del campo la guarda.
 *
 * Ocupa su celda entera. En el cuaderno diario el campo crece con lo escrito
 * porque hay diecisiete columnas y cada píxel cuenta; aquí hay dos, y un campo
 * estrecho en medio de una celda ancha no se ve y cuesta acertarle.
 */
function CasillaArqueo({ valor, moneda, onGuardar, onBorrar, placeholder }) {
  const [texto, setTexto] = useState(valor != null ? conPuntos(String(valor)) : '')

  const soltar = () => {
    const n = aNumero(texto)
    if (n === (valor ?? 0)) return
    if (!n && onBorrar) { onBorrar(); return }
    if (n) onGuardar(n)
  }

  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, width: '100%' }}>
      <input className="fin-cel" inputMode="decimal"
        style={{ flex: 1, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
        value={texto}
        placeholder={placeholder}
        onChange={e => setTexto(conPuntos(e.target.value))}
        onBlur={soltar}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }} />
      {moneda && (
        <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7, flexShrink: 0 }}>{moneda}</span>
      )}
    </span>
  )
}

/**
 * El arqueo: lo que hay, lo que debería haber y lo que se gastó.
 *
 * Los dos primeros cuadros van lado a lado y con la misma forma —países en
 * vertical, una cifra por país, el total abajo— porque lo que se hace con
 * ellos es compararlos fila por fila. Puestos uno debajo del otro había que
 * recordar la cifra mientras se bajaba la vista.
 *
 * Lo que salió va al final: descontar los gastos antes de cuadrar esconde el
 * descuadre.
 */
function PanelArqueo({
  paises, monedaDe, bancos, gastos, capitalUsd, capitalDesde, comisionDesdeCapitalClp,
  porOrigen, dia, totalDiaClp, variosDias, usdClp, rango,
  onCrearBanco, onEditarBanco, onBorrarBanco,
  onCrearGasto, onEditarGasto, onBorrarGasto, onCapital,
  onMover,
}) {
  // El pais sobre el que se esta soltando, para enseñar donde va a caer.
  const [encima, setEncima] = useState(null)

  // Arrastrar una fila entera estorbaria a las casillas donde se escribe, asi
  // que el que se arrastra es el tirador y la fila solo recibe. El orden es
  // el mismo que el de la barra de arriba y el de los montos diarios: se
  // guarda una vez y vale para los dos cuadros de aqui.
  const tirador = nombre => (
    <span draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', nombre)
        e.dataTransfer.effectAllowed = 'move'
      }}
      title="Arrastra para cambiar el orden"
      style={{ cursor: 'grab', color: '#475569', fontSize: 12, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>
      ⠿
    </span>
  )

  const zonaDeSoltar = nombre => ({
    onDragOver: e => { e.preventDefault(); setEncima(nombre) },
    onDragLeave: () => setEncima(a => (a === nombre ? null : a)),
    onDrop: e => {
      e.preventDefault()
      setEncima(null)
      const quien = e.dataTransfer.getData('text/plain')
      if (quien && quien !== nombre) onMover?.(quien, nombre)
    },
  })

  const marcaDeSoltar = nombre => (encima === nombre
    ? { boxShadow: 'inset 0 2px 0 #38bdf8' }
    : null)
  // Una cuenta por país: la primera que haya anotada.
  const porPais = useMemo(() => {
    const m = new Map()
    bancos.forEach(b => { if (!m.has(b.pais)) m.set(b.pais, b) })
    return m
  }, [bancos])

  // Lo anotado con nombre propio: un pago suelto, una caja chica, lo que haga
  // falta. Se guarda igual que un país —el cuaderno guarda el nombre como
  // texto— y se reconoce por no estar en la lista de países.
  const sueltas = useMemo(() => {
    const deLosPaises = new Set(paises.map(p => p.name))
    return bancos.filter(b => !deLosPaises.has(b.pais))
  }, [bancos, paises])

  const enUsd = clp => (usdClp ? (Number(clp) || 0) / usdClp : 0)
  const usd = clp => enDolares(clp, usdClp)

  // Lo contado a mano en los bancos, y el total con el capital dentro: los dos
  // cuadros arrancan de la misma base, así se comparan de frente.
  const anotadoClp = bancos.reduce((t, b) => t + (b.monto_clp || 0), 0)
  const anotadoUsd = enUsd(anotadoClp)

  // Lo gastado en el mes. Sale de los DOS totales: el dinero gastado ya no
  // está en el banco, y tampoco tendría que estar en lo que debería haber. Si
  // se descontara de un lado solo, cada gasto abriría un descuadre que no es
  // tal y el arqueo dejaría de servir para lo que sirve.
  const gastosClp = gastos.reduce((t, g) => t + (g.monto_clp || 0), 0)
  const gastosUsd = enUsd(gastosClp)

  // Lo contado es lo que hay en los bancos y nada mas. El capital NO se suma
  // aqui: ese dinero ya esta dentro de los saldos que se anotan, y sumarlo
  // encima contaba la misma plata dos veces -27.000 de capital mas 22.811 en
  // los bancos daban 49.704 donde habia 22.704-. El capital es la referencia
  // del otro cuadro, el de lo que deberia haber.
  const contadoUsd = anotadoUsd - gastosUsd

  // Lo que debería haber: el capital más lo comisionado desde el día en que se
  // fijó, menos lo gastado. Cada día que pasa se suma solo, sin tocar nada.
  const comisionUsd = enUsd(comisionDesdeCapitalClp)
  const supuestoUsd = capitalUsd + comisionUsd - gastosUsd

  const diferencia = contadoUsd - supuestoUsd
  const cuadra = Math.abs(diferencia) <= MARGEN_USD && anotadoClp > 0

  // El rojo es solo del total de los bancos: es la cifra contada a mano y la
  // única que puede estar mal. Lo que debería haber sale de lo anotado en el
  // cuaderno, y pintarlo de rojo haría pensar que también hay que corregirlo
  // cuando lo que falta por cuadrar está en el banco.
  const colorContado = cuadra ? '#4ade80' : '#f87171'
  const color = cuadra ? '#4ade80' : '#eaf2ff'

  const quedaUsd = contadoUsd

  // Mirando un día anterior al que se fijó el capital no hay nada que
  // arrastrar: el capital de hoy no era el de entonces. La comisión de ese día
  // se ve país por país, pero no se suma al total, y eso hay que decirlo o
  // parece que la pantalla se ha comido una cifra que está ahí mismo.
  const antesDelCapital = Boolean(capitalDesde && dia && dia < capitalDesde)

  const ganadoDe = nombre => porOrigen.find(o => o.origen === nombre)

  const titulo = { fontSize: 13, fontWeight: 700, color: '#eaf2ff' }
  const bajada = { fontSize: 12, color: '#64748b', marginTop: 3, marginBottom: 13, lineHeight: 1.5, minHeight: 36 }
  const rotulo = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#7dd3fc', marginBottom: 7 }
  // Los dos cuadros miden lo mismo y se parten en dos líneas cuando la
  // pantalla no da para los dos.
  const mitad = { flex: '1 1 380px', minWidth: 320 }
  const pais = { ...celda, ...pegadaPais, padding: '6px 10px' }
  const nombreDePais = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#eaf2ff' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      {/* El mismo filtro que el cuaderno: lo contado es de un día, y sin él
          habría que volver a la otra pestaña para cambiarlo. */}
      <div>{rango}</div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* -------------------------------------------------------------- 1 --
            Lo que hay: una cifra por país, escrita a mano, sobre el capital. */}
        <div style={mitad}>
          <p style={rotulo}>1 · LO QUE HAY</p>
          <p style={titulo}>Saldos de los bancos</p>
          <p style={bajada}>
            Lo que hay en el banco de cada país, en la moneda de ese país. Lo
            contado un día sigue valiendo los siguientes hasta que se vuelva a
            contar. El total es la suma de lo anotado, menos los gastos.
            Arrastra ⠿ para cambiar el orden: vale para los dos cuadros.
          </p>

          <div style={{ ...GLASS, width: '100%', overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...cabecera, ...pegadaPais, textAlign: 'left', padding: '9px 10px' }}>PAÍS</th>
                  <th style={{ ...cabecera, padding: '8px 10px', color: '#aebfe2', borderRight: 'none' }}>CUENTA</th>
                </tr>
              </thead>

              <tbody>
                {paises.map(p => {
                  const b = porPais.get(p.name)
                  return (
                    <tr key={p.id} {...zonaDeSoltar(p.name)} style={marcaDeSoltar(p.name)}>
                      <td style={pais}>
                        <span style={nombreDePais}>
                          {tirador(p.name)}
                          <Bandera iso2={p.iso2} tam={16} />
                          {p.name}
                        </span>
                      </td>
                      <td className="fin-casilla"
                        style={{ ...celda, position: 'relative', borderRight: 'none', background: b ? 'rgba(56,189,248,.04)' : undefined }}>
                        <CasillaArqueo
                          key={`${b?.id ?? 'libre'}:${b?.monto ?? ''}`}
                          valor={b ? b.monto : null}
                          moneda={b ? b.moneda : monedaDe(p.name)}
                          onGuardar={n => (b && b.fecha === dia
                            ? onEditarBanco(b.id, { monto: n })
                            : onCrearBanco(p.name, 0, n))}
                          onBorrar={b && b.fecha === dia ? () => onBorrarBanco(b.id) : null} />
                        {/* Lo mismo en dólares, debajo: es la moneda en la que
                            se compara con el cuadro de al lado. */}
                        {b && b.monto_clp > 0 && usd(b.monto_clp) !== null && (
                          <span style={{ display: 'block', textAlign: 'right', fontSize: 10.5, color: '#64748b', paddingRight: 7 }}>
                            {usd(b.monto_clp)} USD
                            {/* De cuándo es el conteo, si no es del día que se
                                mira: así se ve lo que lleva sin tocarse. */}
                            {b.fecha !== dia && (
                              <span style={{ color: '#a78b4a' }}> · del {diaCorto(b.fecha)}</span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {/* Lo que no es un país: filas con el nombre que se quiera. */}
                {sueltas.map(b => (
                  <tr key={b.id} className="fin-casilla">
                    <td style={{ ...pais, position: 'relative' }}>
                      <input className="fin-cel"
                        style={{ textAlign: 'left', width: '100%', boxSizing: 'border-box', fontWeight: 600 }}
                        defaultValue={b.pais}
                        placeholder="a qué corresponde"
                        onBlur={e => {
                          const nuevo = e.target.value.trim()
                          if (nuevo && nuevo !== b.pais) onEditarBanco(b.id, { pais: nuevo })
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
                    </td>
                    <td style={{ ...celda, position: 'relative', borderRight: 'none', background: 'rgba(56,189,248,.04)' }}>
                      <CasillaArqueo
                        key={`${b.id}:${b.monto}`}
                        valor={b.monto}
                        moneda={b.moneda}
                        onGuardar={n => onEditarBanco(b.id, { monto: n })}
                        onBorrar={() => onBorrarBanco(b.id)} />
                      {b.monto_clp > 0 && usd(b.monto_clp) !== null && (
                        <span style={{ display: 'block', textAlign: 'right', fontSize: 10.5, color: '#64748b', paddingRight: 7 }}>
                          {usd(b.monto_clp)} USD
                          {b.fecha !== dia && (
                            <span style={{ color: '#a78b4a' }}> · del {diaCorto(b.fecha)}</span>
                          )}
                        </span>
                      )}
                      <button type="button" className="fin-x" onClick={() => onBorrarBanco(b.id)}
                        title="Quitar esta fila">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}

                {/* La siguiente fila en blanco: se escribe el nombre y el
                    monto, y al guardarse aparece otra. Así no hay que pulsar
                    un botón de "añadir" antes de poder escribir. */}
                <FilaSuelta onCrear={(nombre, monto) => onCrearBanco(nombre, 0, monto)} />
              </tbody>

              <tfoot>
                <tr>
                  <td style={{ ...pieCelda, ...pegadaPais, padding: '9px 10px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    TOTAL CONTADO
                  </td>
                  <td style={{ ...pieCelda, textAlign: 'right', padding: '9px 10px', fontSize: 15, fontWeight: 800, color: colorContado, borderRight: 'none' }}>
                    {cuadra && '✓ '}{miles(Math.round(contadoUsd))} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>USD</span>
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>
                      {miles(Math.round(anotadoUsd))} anotados en los bancos
                      {gastosUsd > 0 && ` − ${miles(Math.round(gastosUsd))} de gastos`}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* -------------------------------------------------------------- 2 --
            Lo que debería haber: la comisión de cada país sobre el capital. */}
        <div style={mitad}>
          <p style={rotulo}>2 · LO QUE DEBERÍA HABER</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <p style={titulo}>El cuadre</p>
            {/* El capital se edita aquí, en chico: se toca una vez y después
                se suma solo. Un campo grande invitaría a reescribirlo cada
                día, que es justo lo que ya no hace falta. */}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 11, color: '#64748b' }}>
              capital:
              <span style={{ width: 86 }}>
                <CasillaArqueo key={capitalUsd} valor={capitalUsd} moneda="USD" onGuardar={n => onCapital(n)} />
              </span>
              {capitalDesde && <span>desde el {diaCorto(capitalDesde)}</span>}
            </span>
          </div>
          <p style={bajada}>
            La comisión de cada país {variosDias ? 'en el rango' : 'del día'}.
            El total es el capital más todo lo comisionado desde que se fijó:
            cada día se suma solo.
          </p>

          <div style={{ ...GLASS, width: '100%', overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...cabecera, ...pegadaPais, textAlign: 'left', padding: '9px 10px' }}>PAÍS</th>
                  <th style={{ ...cabecera, padding: '8px 10px', color: '#4ade80', borderRight: 'none' }}>COMISIÓN</th>
                </tr>
              </thead>

              <tbody>
                {paises.map(p => {
                  const d = ganadoDe(p.name)
                  return (
                    <tr key={p.id} {...zonaDeSoltar(p.name)} style={marcaDeSoltar(p.name)}>
                      <td style={pais}>
                        <span style={nombreDePais}>
                          {tirador(p.name)}
                          <Bandera iso2={p.iso2} tam={16} />
                          {p.name}
                        </span>
                      </td>
                      <td style={{ ...celda, textAlign: 'right', padding: '6px 17px 6px 10px', fontSize: 13, fontWeight: 700, color: '#4ade80', borderRight: 'none' }}>
                        {d && d.ganado ? (
                          <>
                            {usd(d.ganado)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#3f8f5c' }}>USD</span>
                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>
                              {pesos(d.ganado)} CLP
                            </span>
                          </>
                        ) : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              <tfoot>
                <tr>
                  <td style={{ ...pieCelda, ...pegadaPais, padding: '9px 10px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    DEBERÍA HABER
                  </td>
                  <td style={{ ...pieCelda, textAlign: 'right', padding: '9px 10px', fontSize: 15, fontWeight: 800, color, borderRight: 'none' }}>
                    {cuadra && '✓ '}{miles(Math.round(supuestoUsd))} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>USD</span>
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>
                      {miles(Math.round(capitalUsd))} de capital + {miles(Math.round(comisionUsd))} comisionados
                      {gastosUsd > 0 && ` − ${miles(Math.round(gastosUsd))} de gastos`}
                      {!antesDelCapital && !variosDias && totalDiaClp > 0
                        && ` (${miles(Math.round(enUsd(totalDiaClp)))} de este día)`}
                    </span>
                    {antesDelCapital && (
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#fcd34d' }}>
                        este día es anterior al capital ({diaCorto(capitalDesde)}): su comisión
                        no se suma aquí
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* La respuesta de los dos cuadros, a lo ancho: o cuadra, o falta
          explicar una diferencia. */}
      <div style={{
        ...GLASS, width: '100%', padding: '13px 18px',
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'baseline',
        borderColor: cuadra ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.3)',
        background: cuadra ? 'rgba(74,222,128,.05)' : 'rgba(248,113,113,.05)',
      }}>
        {cuadra ? (
          <>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>✓ Está bien</span>
            <span style={{ fontSize: 12.5, color: '#64748b' }}>
              lo contado coincide con lo que debería haber: {miles(Math.round(supuestoUsd))} USD
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: '#64748b' }}>
              {diferencia > 0 ? 'SOBRA' : 'FALTA'}
            </span>
            <span style={{ fontSize: 19, fontWeight: 800, color: '#f87171' }}>
              {miles(Math.abs(Math.round(diferencia)))} <span style={{ fontSize: 11, fontWeight: 500 }}>USD</span>
            </span>
            <span style={{ fontSize: 12.5, color: '#f87171' }}>
              {diferencia > 0
                ? `hay más en los bancos que lo que debería haber (${miles(Math.round(supuestoUsd))} USD)`
                : `para llegar a lo que debería haber (${miles(Math.round(supuestoUsd))} USD)`}
            </span>
          </>
        )}
      </div>

      {/* ---------------------------------------------------------------- 3 --
          Lo que salió. Se resta de lo contado, que es el dinero que de verdad
          está: restarlo de lo que "debería haber" sería restar de una cifra
          que todavía está en duda. */}
      <div style={{ width: '100%' }}>
        <p style={rotulo}>3 · MIS GASTOS</p>
        <p style={titulo}>Mis gastos</p>
        <p style={{ ...bajada, minHeight: 0 }}>
          Lo que sale de la caja y no es un envío. Lo anotado se queda aquí el
          mes entero y se ve igual cualquier día que se mire: un gasto pesa
          hasta que acabe el mes, no la jornada en que se anotó. Se descuenta
          de los dos totales de arriba.
        </p>

        <div style={{ ...GLASS, width: '100%', overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...cabecera, ...pegadaPais, textAlign: 'left', padding: '9px 10px' }}>DÍA</th>
                <th style={{ ...cabecera, textAlign: 'left', padding: '9px 10px' }}>CONCEPTO</th>
                <th style={{ ...cabecera, padding: '8px 10px', color: '#aebfe2' }}>MONTO</th>
                <th style={{ ...cabecera, ...separa, color: '#f87171', borderRight: 'none' }}>EN USD</th>
              </tr>
            </thead>

            <tbody>
              {gastos.map(g => (
                <tr key={g.id} className="fin-casilla" style={{ position: 'relative' }}>
                  <td style={{ ...celda, ...pegadaPais, padding: '6px 10px', fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {diaCorto(g.fecha)}
                  </td>
                  <td style={{ ...celda, padding: '4px 10px' }}>
                    <input className="fin-cel" style={{ textAlign: 'left', width: '100%', boxSizing: 'border-box' }}
                      defaultValue={g.concepto || ''}
                      placeholder="en qué se gastó"
                      onBlur={e => {
                        if (e.target.value !== (g.concepto || '')) onEditarGasto(g.id, { concepto: e.target.value })
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
                  </td>
                  <td style={{ ...celda, position: 'relative' }}>
                    <CasillaArqueo
                      key={`${g.id}:${g.monto}`}
                      valor={g.monto}
                      moneda={g.moneda}
                      onGuardar={n => onEditarGasto(g.id, { monto: n })}
                      onBorrar={() => onBorrarGasto(g.id)} />
                    <button type="button" className="fin-x" onClick={() => onBorrarGasto(g.id)}
                      title="Quitar este gasto">
                      ✕
                    </button>
                  </td>
                  <td style={{ ...celda, ...separa, textAlign: 'right', padding: '6px 10px', fontSize: 13, color: '#f87171', borderRight: 'none' }}>
                    {usd(g.monto_clp) ?? ''} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>USD</span>
                  </td>
                </tr>
              ))}

              {/* La fila en blanco del siguiente gasto. */}
              <GastoNuevo onCrear={onCrearGasto} />
            </tbody>

            <tfoot>
              <tr>
                <td colSpan={2} style={{ ...pieCelda, ...pegadaPais, padding: '9px 10px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                  TOTAL GASTOS DEL MES
                </td>
                <td style={pieCelda} />
                <td style={{ ...pieCelda, ...separa, textAlign: 'right', padding: '9px 10px', fontSize: 14, fontWeight: 800, color: '#f87171', borderRight: 'none' }}>
                  {usd(gastosClp) ?? pesos(gastosClp)} <span style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b' }}>USD</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Lo que queda: lo contado menos los gastos. */}
        <div style={{
          ...GLASS, width: '100%', marginTop: 14, padding: '14px 18px',
          display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'baseline',
          borderColor: cuadra ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.25)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#64748b' }}>
            QUEDA EN CAJA
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: cuadra ? '#4ade80' : '#eaf2ff' }}>
            {cuadra && '✓ '}{miles(Math.round(quedaUsd))} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>USD</span>
          </span>
          <span style={{ fontSize: 11.5, color: '#64748b' }}>
            {miles(Math.round(anotadoUsd))} anotados en los bancos
            {' − '}{miles(Math.round(gastosUsd))} de gastos
          </span>
          {!cuadra && (
            <span style={{ fontSize: 11.5, color: '#f87171' }}>
              · el arqueo todavía no cuadra, así que esta cifra está en duda
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * La fila en blanco del final: lo que no es un país.
 *
 * Un pago suelto, una caja chica, un cobro aparte. Se guarda en dólares: no
 * es de ningún país, así que no hay moneda que heredar, y en dólares es como
 * se lee el arqueo entero.
 */
function FilaSuelta({ onCrear }) {
  const [nombre, setNombre] = useState('')
  const [texto, setTexto] = useState('')

  const guardar = () => {
    const monto = aNumero(texto)
    if (!nombre.trim() || !monto) return
    onCrear(nombre.trim(), monto)
    setNombre('')
    setTexto('')
  }

  return (
    <tr>
      <td style={{ ...celda, ...pegadaPais, padding: '4px 10px' }}>
        <input className="fin-cel"
          style={{ textAlign: 'left', width: '100%', boxSizing: 'border-box' }}
          value={nombre}
          placeholder="+ otra fila (ej: pago de Luis)"
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }} />
      </td>
      <td style={{ ...celda, borderRight: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, width: '100%' }}>
          <input className="fin-cel" inputMode="decimal"
            style={{ flex: 1, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            value={texto}
            onChange={e => setTexto(conPuntos(e.target.value))}
            onBlur={guardar}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
          <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7 }}>USD</span>
        </span>
      </td>
    </tr>
  )
}

/** La fila en blanco para el siguiente gasto. */
function GastoNuevo({ onCrear }) {
  const [concepto, setConcepto] = useState('')
  const [texto, setTexto] = useState('')

  const guardar = () => {
    const monto = aNumero(texto)
    if (!monto) return
    onCrear({ concepto, monto })
    setConcepto('')
    setTexto('')
  }

  return (
    <tr>
      <td style={{ ...celda, ...pegadaPais, padding: '6px 10px', fontSize: 11.5, color: '#475569' }}>
        hoy
      </td>
      <td style={{ ...celda, padding: '4px 10px' }}>
        <input className="fin-cel" style={{ textAlign: 'left', width: '100%', boxSizing: 'border-box' }}
          value={concepto}
          placeholder="en qué se gastó"
          onChange={e => setConcepto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }} />
      </td>
      <td style={celda}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, width: '100%' }}>
          <input className="fin-cel" inputMode="decimal"
            style={{ flex: 1, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            value={texto}
            onChange={e => setTexto(conPuntos(e.target.value))}
            onBlur={guardar}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
          <span style={{ fontSize: 10, color: '#64748b', paddingRight: 7 }}>CLP</span>
        </span>
      </td>
      <td style={{ ...celda, ...separa, borderRight: 'none' }} />
    </tr>
  )
}
