import { useState, useEffect, useRef } from 'react'
import CampoSelector from '../../components/CampoSelector'
import SelectorBusqueda from '../../components/SelectorBusqueda'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import CardPayment from '../../components/CardPayment'
import api from '../../services/api'
import { useStore } from '../../store/useStore'
import { useCountries } from '../../hooks/useCountries'
import { Bandera } from '../../utils/flags'
import { formateaEtiquetado, revisaEtiquetado, formateaTelefono, validaTelefono } from '../../utils/documento'
import Portal from '../../components/Portal'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const INTEGER_CURRENCIES = ['CLP', 'COP', 'VES', 'ARS', 'PYG']

// Países y monedas llegan de Ajustes → Países (hooks/useCountries).

const COUNTRY_PHONE_PREFIX = {
  'Colombia': '+57 ', 'Chile': '+56 ', 'Estados Unidos': '+1 ', 'México': '+52 ',
  'Brasil': '+55 ', 'España': '+34 ', 'EURO': '+34 ', 'Perú': '+51 ', 'Argentina': '+54 ',
  'Canadá': '+1 ', 'Venezuela': '+58 ',
}

const COUNTRY_ID_TYPES = {
  'Colombia': ['Cédula de Ciudadanía', 'Pasaporte', 'NIT'],
  'Chile': ['RUT', 'Pasaporte'],
  'Perú': ['DNI', 'Pasaporte', 'RUC'],
  'Brasil': ['CPF', 'CNPJ', 'Pasaporte'],
  'México': ['CURP', 'INE', 'RFC', 'Pasaporte'],
  'España': ['DNI', 'NIE', 'Pasaporte'],
  'EURO': ['DNI', 'NIE', 'Pasaporte'],
  'Argentina': ['DNI', 'CUIL/CUIT', 'Pasaporte'],
  'Estados Unidos': ['SSN', 'Pasaporte', 'Otro'],
  'Canadá': ['SIN', 'Pasaporte', 'Otro'],
}
const DEFAULT_ID_TYPES = ['Cédula', 'DNI', 'RUT', 'Pasaporte', 'Otro']

const COUNTRY_ACCOUNT_HINT = {
  'Colombia': 'Cuenta de Ahorros o Corriente',
  'Chile': 'Cuenta Vista o Corriente (RUT)',
  'Perú': 'CCI (20 dígitos)',
  'Brasil': 'Conta Corrente / Poupança + Agência',
  'México': 'CLABE (18 dígitos)',
  'España': 'IBAN (ES + 22 dígitos)',
  'EURO': 'IBAN',
  'Argentina': 'CBU o CVU (22 dígitos) / Alias',
  'Estados Unidos': 'Account + Routing Number',
  'Canadá': 'Account + Transit Number',
}

const COUNTRY_CODE = {
  'Venezuela': 've', 'Colombia': 'co', 'Argentina': 'ar', 'Perú': 'pe',
  'Chile': 'cl', 'Ecuador': 'ec', 'Bolivia': 'bo', 'Paraguay': 'py',
  'Uruguay': 'uy', 'México': 'mx', 'Brasil': 'br', 'Panamá': 'pa',
  'Costa Rica': 'cr', 'Guatemala': 'gt', 'Honduras': 'hn',
  'Nicaragua': 'ni', 'El Salvador': 'sv', 'Cuba': 'cu',
  'República Dominicana': 'do', 'Estados Unidos': 'us', 'España': 'es', 'EURO': 'eu',
  'Peru': 'pe',
}

function flagUrl(country) {
  const code = COUNTRY_CODE[country]
  return code ? `https://flagcdn.com/20x15/${code}.png` : null
}

function currencyFlagUrl(iso2) {
  return `https://flagcdn.com/20x15/${iso2}.png`
}

function formatDisplay(num, currency) {
  if (!num && num !== 0) return ''
  const isInt = INTEGER_CURRENCIES.includes(currency)
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: isInt ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(num)
}

function parseRaw(str) {
  return parseInt((str || '').replace(/\D/g, '')) || 0
}

function ChevronDown() {
  return (
    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="shrink-0" style={{color:'#8aa0cc'}}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// Steps per path — 1.Destino 2.Calcular 3.Receptor 4.Pago 5.Confirmar
const NUEVO_STEPS = ['Destino', 'Calcular', 'Receptor', 'Pago', 'Confirmar']
const ANTERIOR_STEPS = ['Destino', 'Calcular', 'Pago', 'Confirmar']

export default function NewTransfer() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useStore()
  const prefill = location.state || {}
  const prefillReceiver = prefill.prefillReceiver || null

  // Internal steps: 0=Destino, 1=Calcular, 2=Receptor, 3=Pago, 4=Confirmar
  // "Enviar nuevamente" (prefillReceiver) jumps directly to Calcular (step 1)
  // Desde la calculadora de la portada (nuevoDestinatario) también: ya eligió
  // monto y países, y lo que falta es a quién. Se abre como destinatario nuevo
  // con lo que escribió, en vez de hacerle elegir en Destino y reescribirlo.
  const vieneDeCalculadora = !prefillReceiver && !!prefill.nuevoDestinatario
  const [step, setStep] = useState(prefillReceiver || vieneDeCalculadora ? 1 : 0)
  const [destinatarioType, setDestinatarioType] = useState(prefillReceiver ? 'anterior' : vieneDeCalculadora ? 'nuevo' : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [proofFile, setProofFile] = useState(null)
  const [montoCopiado, setMontoCopiado] = useState(false)
  const [proofError, setProofError] = useState('')
  // Orden ya creada en este envio. En una ref y no en estado: no repinta,
  // y sobrevive a los reintentos dentro del mismo submit.
  const ordenCreadaRef = useRef(null)
  const [proofPreview, setProofPreview] = useState(null)
  const [editingContact, setEditingContact] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  // Orden creada y esperando el cobro con tarjeta.
  const [cardOrder, setCardOrder] = useState(null)

  const { data: payCfg } = useQuery({
    queryKey: ['payments-config'],
    queryFn: () => api.get('/payments/config').then(r => r.data.data),
    staleTime: 300000,
  })
  const [calc, setCalc] = useState({
    amount: prefill.amount || '',
    fromCurrency: prefill.fromCurrency || 'CLP',
    fromCountry: prefill.fromCountry || 'Chile',
    toCountry: prefill.toCountry || prefillReceiver?.receiver_country || 'Colombia',
    toCurrency: prefill.toCurrency || 'COP',
    result: prefill.result || null,
  })

  const [receiver, setReceiver] = useState({
    receiver_name: prefillReceiver?.receiver_name || '',
    receiver_phone: prefillReceiver?.receiver_phone || '',
    receiver_country: prefillReceiver?.receiver_country || prefill.toCountry || 'Colombia',
    receiver_bank_id: prefillReceiver?.receiver_bank_id || '',
    receiver_account: prefillReceiver?.receiver_account || '',
    // El primero del país de destino, no uno fijo: arrancaba siempre en
    // 'Cédula de Ciudadanía' aunque el envío fuera a Chile.
    receiver_id_type: prefillReceiver?.receiver_id_type
      || (COUNTRY_ID_TYPES[prefill.toCountry || prefillReceiver?.receiver_country || 'Colombia'] || DEFAULT_ID_TYPES)[0],
    receiver_id_num: prefillReceiver?.receiver_id_num || '',
  })

  const [payment, setPayment] = useState({ payment_method: 'transferencia', payment_bank: '' })
  // Qué campo se acaba de copiar. Era un booleano para todos los botones, así
  // que al pulsar uno se encendía «Copiado» en todos a la vez y no había forma
  // de saber cuál se había copiado de verdad.
  const [copiado, setCopiado] = useState('')
  const copiaRef = useRef(null)

  const copiar = (clave, texto) => {
    navigator.clipboard?.writeText(String(texto ?? '').trim())
    setCopiado(clave)
    clearTimeout(copiaRef.current)
    copiaRef.current = setTimeout(() => setCopiado(''), 2000)
  }
  // Cobro por QR pendiente de escanear (Ligo, SIP). No hay redirección:
  // el cliente paga desde su banco y la orden avanza con el aviso de Koywe.
  const [qrPago, setQrPago] = useState(null)

  const PAYMENT_BANKS = [
    'BancoEstado', 'Banco de Chile', 'Santander', 'BCI', 'BBVA',
    'Itaú', 'Scotiabank', 'Security', 'Falabella', 'Ripley',
  ]

  // Formatos que acepta el backend. Se comprueba aqui para que un archivo malo
  // se rechace ANTES de crear la orden: antes se creaba, fallaba la subida, y
  // quedaba una orden huerfana por cada intento.
  const FORMATOS_OK = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.heic', '.heif']

  const handleProofChange = (file) => {
    if (!file) { setProofFile(null); setProofPreview(null); setProofError(''); return }
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase()
    if (!FORMATOS_OK.includes(ext)) {
      setProofFile(null); setProofPreview(null)
      setProofError(`No se puede usar un archivo ${ext || 'sin extensión'}. Acepta JPG, PNG, WEBP, HEIC o PDF.`)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setProofFile(null); setProofPreview(null)
      setProofError('La imagen no puede pesar más de 10 MB.')
      return
    }
    setProofError('')
    setProofFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setProofPreview(e.target.result)
      reader.readAsDataURL(file)
    } else {
      setProofPreview(null)
    }
  }

  // Después de `calc` a propósito: depende de la moneda elegida, y ponerlo
  // antes deja la página en blanco (se lee `calc` sin haberse inicializado).
  // Solo se ofrece tarjeta si Stripe está configurado Y el cliente envía en
  // una moneda que la cuenta admite: desde Chile el método no aparece, en vez
  // de aparecer y fallar al intentar cobrar.
  const cardEnabled = !!payCfg?.enabled
    && (payCfg?.currencies || []).includes(calc.fromCurrency)

  // Métodos locales de Koywe para la moneda que se está enviando: Khipu en
  // CLP, PIX en BRL, PSE en COP... El backend manda el catálogo entero y aquí
  // solo se elige la fila que toca, así que cambiar de moneda no pide nada.
  const koyweMethods = (payCfg?.koywe?.enabled && (payCfg?.koywe?.methods || {})[calc.fromCurrency]) || []
  const koyweCodes = new Set(
    Object.values(payCfg?.koywe?.methods || {}).flat().map(m => String(m.codigo).toLowerCase())
  )
  const esKoywe = (metodo) => koyweCodes.has(String(metodo || '').toLowerCase())

  // Haulmer cobra con tarjeta, siempre en pesos chilenos. Se ofrece desde las
  // monedas que el backend sabe convertir hoy; el cargo sale en CLP aunque el
  // envío esté en dólares, y aquí se calcula solo para poder enseñar la cifra
  // antes de que el cliente se comprometa. La de verdad la calcula el backend
  // al abrir el cobro.
  const haulmerActivo = !!payCfg?.haulmer?.enabled
    && (payCfg?.haulmer?.currencies || []).includes(calc.fromCurrency)
  const esHaulmer = (metodo) => String(metodo || '').toLowerCase() === 'haulmer'
  // El link de pago es otra cosa: no hay aviso de vuelta, así que se
  // comprueba con el comprobante igual que una transferencia.
  const linkPago = payCfg?.link_pago?.enabled
    && (payCfg?.link_pago?.currencies || []).includes(calc.fromCurrency)
    ? payCfg.link_pago.url : ''
  const esLinkPago = (metodo) => String(metodo || '').toLowerCase() === 'link_pago'
  const montoHaulmerCLP = (() => {
    const monto = rawAmount || parseFloat(calc.amount || '0')
    if (!monto) return null
    if (calc.fromCurrency === 'CLP') return Math.round(monto)
    const tasa = payCfg?.haulmer?.tasas?.[calc.fromCurrency]
    return tasa ? Math.round(monto * tasa) : null
  })()
  const koyweElegido = koyweMethods.find(m => String(m.codigo).toLowerCase() === String(payment.payment_method).toLowerCase())

  // Datos de quien paga. El remitente sale del nombre de la cuenta, que no
  // trae documento ni siempre apellido; los métodos que los exigen (PSE) los
  // piden aquí antes de crear el cobro. Se arranca con lo que ya sabemos para
  // que solo haya que completar, no reescribir.
  const [pagador, setPagador] = useState(() => ({
    sender_name: user?.full_name || '',
    sender_id_type: '',
    sender_id_num: '',
    sender_phone: user?.phone || '',
  }))

  // Qué campos se muestran. Depende SOLO de lo que exige el método, nunca de
  // si ya están rellenos: cuando dependía de lo que faltaba, terminar de
  // escribir el apellido hacía desaparecer el campo a media palabra y lo mismo
  // al elegir el documento.
  const camposPagador = (() => {
    const exige = (koyweElegido?.requiere || []).map(c => String(c).toLowerCase())
    if (!exige.length) return []
    const campos = []
    if (exige.some(c => c.includes('last') || c.includes('first'))) campos.push('nombre')
    if (exige.some(c => c.includes('document'))) campos.push('documento')
    if (exige.includes('phone')) campos.push('telefono')
    return campos
  })()

  // Qué falta de verdad. Solo decide si el botón de pagar está activo.
  const faltaDelPagador = (() => {
    const falta = []
    const nombre = (pagador.sender_name || '').trim()
    if (camposPagador.includes('nombre') && nombre.split(/\s+/).filter(Boolean).length < 2) {
      falta.push('apellido')
    }
    if (camposPagador.includes('documento') && !(pagador.sender_id_num.trim() && pagador.sender_id_type)) {
      falta.push('documento')
    }
    if (camposPagador.includes('telefono') && !pagador.sender_phone.trim()) falta.push('telefono')
    return falta
  })()

  // Cuenta a la que transferir. Cuando Koywe tiene una emitida en esta moneda,
  // el dinero cae directo en el saldo de ese país en vez de en una cuenta
  // nuestra. No hay lista de países aquí a propósito: la manda el backend, así
  // que el día que Koywe habilite una moneda nueva aparece sola.
  // Donde Koywe no emite cuenta (todo salvo MXN, ARS y CLP) se usa la que haya
  // cargado el super-admin dueño de este cliente, que el backend ya filtra por
  // dueño: nadie ve la cuenta de otro.
  // Todas las cuentas a las que se puede transferir desde este país. Suele
  // haber una, pero una casa puede tener dos bancos y entonces el cliente
  // elige: mandar a la que no es cuesta un día de revisión manual.
  const cuentasTransfer = (() => {
    const koywe = (payCfg?.koywe?.transfer_accounts || {})[calc.fromCurrency]
    if (koywe) return [koywe]
    const propia = (payCfg?.cuentas_propias || {})[calc.fromCurrency]
    if (!propia) return []
    const todas = propia.todas || [propia]
    // Varios países comparten moneda y cada uno cobra por su lado: desde
    // Estados Unidos se paga por Zelle, no a la cuenta de Ecuador.
    const delPais = todas.filter(c => !c.pais || !calc.fromCountry || c.pais === calc.fromCountry)
    return delPais.length ? delPais : todas
  })()

  const [cuentaElegida, setCuentaElegida] = useState(0)
  const cuentaTransfer = cuentasTransfer[cuentaElegida] || cuentasTransfer[0] || null

  const [displayAmount, setDisplayAmount] = useState(
    calc.amount ? formatDisplay(parseRaw(String(calc.amount)), calc.fromCurrency) : ''
  )
  const [liveResult, setLiveResult] = useState(calc.result || null)
  const [liveLoading, setLiveLoading] = useState(false)

  // Arriba del todo a propósito: `sendCurrencies` y `receiveCountries` se usan
  // más abajo en este mismo componente, y declararlos después dejaba la página
  // en blanco (ReferenceError por leer un const antes de inicializarlo).
  const { sendCountries, receiveCountries, countries } = useCountries()

  // Bandera de un país por su nombre. Primero lo que dice la base (así un país
  // añadido desde Ajustes tiene bandera), y si no está —una orden vieja de un
  // país que ya se quitó— se recurre al mapa fijo de este archivo.
  const iso2De = (nombre) =>
    countries.find(c => c.country === nombre)?.iso2 || COUNTRY_CODE[nombre] || ''

  // El documento del destinatario se formatea y se comprueba igual que el del
  // titular: un RUT mal escrito aquí hace que el banco rechace la entrega, y
  // eso se descubre cuando el dinero ya salió.
  const docReceptor = revisaEtiquetado(receiver.receiver_id_type, receiver.receiver_id_num)
  // El telefono es opcional, pero si se escribe algo tiene que ser un numero
  // usable: un "no tiene" en el campo llegaba tal cual al encargado del pais.
  const telReceptorMal = !!receiver.receiver_phone.trim() && !validaTelefono(receiver.receiver_phone)
  // Continuar exige nombre y, si se rellenaron, documento y telefono correctos.
  // Antes solo pedia el nombre: el documento se pintaba en rojo y se pasaba de
  // pantalla igual, y el error aparecia al final o directamente en el banco.
  const receptorOk = !!receiver.receiver_name.trim()
    && docReceptor.estado !== 'invalido'
    && docReceptor.estado !== 'incompleto'
    && !telReceptorMal

  // Aviso de que el pago debe salir de la cuenta del propio titular. Se abre al
  // entrar al paso de pago y una sola vez por sesión: repetirlo en cada envío
  // se aprende a cerrarlo sin leerlo, y no enseñarlo nunca deja al cliente sin
  // forma de conocer la regla hasta que le rechazan un pago.
  //
  // Hubo un tiempo en que había DOS avisos distintos diciendo esto mismo, y al
  // llegar al paso de pago salían los dos, uno encima del otro.
  const [avisoPagador, setAvisoPagador] = useState(false)
  const avisoMostrado = useRef(false)
  useEffect(() => {
    if (step !== 3 || avisoMostrado.current) return
    avisoMostrado.current = true
    let titularVisto = false
    try {
      titularVisto = sessionStorage.getItem('aviso-titular') === 'visto'
    } catch { /* sin sessionStorage se enseña igual */ }
    // Un único aviso: se abre si hay algo que decir. Lo de la verificación por
    // monto se enseña siempre que aplique, aunque lo del titular ya se haya
    // visto — es de este envío en concreto, no una regla general.
    if (!titularVisto || superaUmbral) setAvisoPagador(true)
  }, [step])

  const cerrarAvisoPagador = () => {
    try { sessionStorage.setItem('aviso-titular', 'visto') } catch { /* da igual */ }
    setAvisoPagador(false)
  }

  // Al cambiar de país de origen, la cuenta elegida ya no existe.
  useEffect(() => { setCuentaElegida(0) }, [calc.fromCountry, calc.fromCurrency])

  const rawAmount = parseRaw(displayAmount)

  // Los datos de la cuenta a la que hay que transferir, en un solo sitio: los
  // pinta la lista y los copia el botón de «todos», así que no pueden decir
  // cosas distintas.
  //
  // La cuenta de Koywe viene plana con claves fijas; la que carga el
  // super-admin trae `campos` etiquetados, porque cada país pide datos
  // distintos.
  const datosCuenta = (cuentaTransfer
    ? (cuentaTransfer.campos
      ? cuentaTransfer.campos.map(c => ({ label: c.etiqueta, value: c.valor, principal: c.principal }))
      : [
        { label: 'Número de cuenta', value: cuentaTransfer.numero, principal: true },
        { label: 'Titular', value: cuentaTransfer.titular },
        { label: 'Banco', value: cuentaTransfer.banco },
        { label: 'Documento', value: cuentaTransfer.documento },
        { label: 'Tipo de cuenta', value: cuentaTransfer.tipo_cuenta },
      ])
    : []).filter(f => f.value)

  // Con el monto incluido: es el dato con el que se reconoce la transferencia,
  // y copiarlo aparte era un paso más donde equivocarse.
  const textoCuenta = [
    ...datosCuenta.map(f => `${f.label}: ${f.value}`),
    `Monto: ${(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')} ${calc.fromCurrency}`,
  ].join('\n')


  // ¿Este envío pasará por verificación? Solo aplica a clientes sin envíos
  // completados; el backend decide de verdad, esto solo avisa.
  const umbralCLP = payCfg?.retencion?.activa ? payCfg?.retencion?.umbral_clp : null
  const montoActual = rawAmount || parseFloat(calc.amount || '0')
  const superaUmbral = (() => {
    if (!umbralCLP || !montoActual) return false
    if (calc.fromCurrency === 'CLP') return montoActual >= umbralCLP
    // Fuera de CLP no se estima aquí: sin tasa a mano, un aviso inventado
    // asusta sin motivo. El backend igual retiene si corresponde.
    return false
  })()

  const selectedFrom = sendCountries.find(c => c.country === calc.fromCountry)
    || sendCountries.find(c => c.code === calc.fromCurrency)

  useEffect(() => {
    if (!rawAmount) { setLiveResult(null); return }
    setLiveLoading(true)
    setLiveResult(null)
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/rates/convert', {
          params: {
            from: calc.fromCurrency, to: calc.toCurrency, amount: rawAmount,
            from_country: calc.fromCountry, to_country: calc.toCountry,
          }
        })
        setLiveResult(res.data.data)
      } catch {
        setLiveResult(null)
      } finally {
        setLiveLoading(false)
      }
    }, 600)
    return () => { clearTimeout(t); setLiveLoading(false) }
  }, [displayAmount, calc.fromCurrency, calc.toCurrency])

  const handleAmountChange = (e) => {
    const num = parseRaw(e.target.value)
    if (!e.target.value.replace(/\D/g, '')) { setDisplayAmount(''); return }
    setDisplayAmount(formatDisplay(num, calc.fromCurrency))
  }

  const handleFromCurrencyChange = (origen) => {
    const code = origen.code
    // Con un destinatario ya guardado, su país está fijado ("bloqueado") y no
    // se puede tocar: moverlo cambiaría el receptor por debajo y la orden
    // saldría para otra persona, o crearía un contacto nuevo con el nombre del
    // anterior. Si la moneda elegida choca con su país, no se acepta el
    // cambio — el desplegable ya no la ofrece, esto es la última defensa.
    if (destinoBloqueado && calc.toCurrency === code) return

    let newCountry = null, newCurrency = null
    if (calc.toCurrency === code) {
      const avail = receiveCountries.filter(c => c.currency !== code)
      if (avail.length > 0) { newCountry = avail[0].country; newCurrency = avail[0].currency }
    }
    setCalc(prev => ({
      ...prev,
      fromCurrency: code,
      fromCountry: origen.country,
      ...(newCountry ? { toCountry: newCountry, toCurrency: newCurrency } : {}),
    }))
    if (newCountry) setReceiver(r => ({ ...r, receiver_country: newCountry }))
    if (displayAmount) {
      const num = parseRaw(displayAmount)
      if (num) setDisplayAmount(formatDisplay(num, code))
    }
    setLiveResult(null)
  }

  const handleCountryChange = (c) => {
    setCalc(prev => ({ ...prev, toCountry: c.country, toCurrency: c.currency }))
    // El tipo de documento es del país, así que al cambiarlo hay que cambiarlo
    // también. Si no, quedaba el del país anterior —RUT con destino Colombia—
    // y el número se formateaba y se validaba con las reglas equivocadas: el
    // desplegable enseñaba los tipos nuevos y el valor seguía siendo el viejo.
    setReceiver(r => {
      const tipos = COUNTRY_ID_TYPES[c.country] || DEFAULT_ID_TYPES
      if (tipos.includes(r.receiver_id_type)) return { ...r, receiver_country: c.country }
      return { ...r, receiver_country: c.country, receiver_id_type: tipos[0], receiver_id_num: '' }
    })
    setLiveResult(null)
  }

  const countriesData = receiveCountries.filter(c => c.currency !== calc.fromCurrency)

  // Con destinatario guardado, su país no se puede cambiar desde aquí.
  const destinoBloqueado = destinatarioType === 'anterior'

  // Monedas de origen ofrecibles. El destino ya excluía la moneda de origen,
  // pero el origen no excluía la de destino: con un destinatario colombiano
  // bloqueado, COP seguía apareciendo como origen. Elegirlo pedía un envío de
  // Colombia a Colombia y, al intentar resolverlo, movía el país del receptor.
  const origenesData = destinoBloqueado
    ? sendCountries.filter(c => c.code !== calc.toCurrency)
    : sendCountries

  // Si Ajustes quita el país o la moneda elegida, caer en una válida: si no,
  // el paso de calcular se queda pidiendo una tasa inexistente.
  useEffect(() => {
    if (origenesData.length && !origenesData.some(c => c.country === calc.fromCountry)) {
      const uno = origenesData.find(c => c.code === calc.fromCurrency) || origenesData[0]
      setCalc(prev => ({ ...prev, fromCurrency: uno.code, fromCountry: uno.country }))
    }
  }, [origenesData, calc.fromCurrency, calc.fromCountry])

  const { data: banksData } = useQuery({
    queryKey: ['banks', receiver.receiver_country],
    queryFn: () => api.get('/admin/banks', { params: { country: receiver.receiver_country } }).then(r => r.data.data).catch(() => []),
  })

  const { data: prevOrdersData } = useQuery({
    queryKey: ['my-orders-contacts'],
    queryFn: () => api.get('/orders', { params: { page_size: 50 } }).then(r => r.data.data.items || []),
  })

  const previousContacts = (() => {
    if (!prevOrdersData?.length) return []
    const seen = new Set()
    return prevOrdersData
      .filter(o => {
        const key = `${o.receiver_name}|${o.receiver_account || ''}|${o.receiver_country}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 6)
  })()

  const selectContact = (order) => {
    setReceiver({
      receiver_name: order.receiver_name || '',
      receiver_phone: order.receiver_phone || '',
      receiver_country: order.receiver_country || '',
      receiver_bank_id: order.receiver_bank_id || '',
      receiver_account: order.receiver_account || '',
      receiver_id_type: order.receiver_id_type || 'Cédula',
      receiver_id_num: order.receiver_id_num || '',
    })
    // Se busca en la lista COMPLETA, no en countriesData: esa excluye los
    // países cuya moneda es la de origen, así que al enviar desde CLP no
    // contiene Chile. Al elegir un contacto chileno no se encontraba nada, la
    // moneda de destino se quedaba con la anterior (COP por defecto) y salía
    // una orden para entregar pesos colombianos en Chile — pasó de verdad
    // (CC-2026-0010).
    const pais = countries.find(c => c.country === order.receiver_country)
    if (!pais) return

    setCalc(prev => {
      // Si el contacto está en el mismo país de origen no hay envío posible:
      // se mueve el origen a otra moneda en vez de dejar la orden incoherente.
      const chocaConOrigen = pais.currency === prev.fromCurrency
      // `sendCountries`, no `sendCurrencies`: ese nombre dejó de existir al
      // pasar a elegir país de origen y quedó aquí suelto. Tocar «editar» en
      // un contacto guardado lanzaba ReferenceError y la pantalla se quedaba
      // en blanco.
      const otroOrigen = sendCountries.find(c => c.code !== pais.currency)
      const mover = chocaConOrigen && otroOrigen
      return {
        ...prev,
        toCurrency: pais.currency,
        toCountry: pais.country,
        fromCurrency: mover ? otroOrigen.code : prev.fromCurrency,
        fromCountry: mover ? otroOrigen.country : prev.fromCountry,
      }
    })
  }

  // Cambiar importe, monedas o receptor invalida la orden ya creada: reutilizarla
  // enviaria un dinero distinto al que dice la orden.
  useEffect(() => {
    ordenCreadaRef.current = null
  }, [calc.amount, calc.fromCurrency, calc.toCurrency, receiver.receiver_name, receiver.receiver_account])

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const payload = {
        sender_name: (pagador.sender_name || '').trim() || user.full_name,
        sender_phone: (pagador.sender_phone || '').trim() || user.phone || '',
        sender_country: user.country || 'Chile',
        sender_id_type: pagador.sender_id_type || undefined,
        sender_id_num: (pagador.sender_id_num || '').trim() || undefined,
        ...receiver,
        receiver_bank_id: receiver.receiver_bank_id ? parseInt(receiver.receiver_bank_id) : null,
        amount_sent: rawAmount || parseFloat(calc.amount),
        // La tasa que se le mostró al cotizar. El backend la respeta si el
        // mercado no se movió mucho, para que no acepte un número y se le
        // cobre otro. Ver create_order.
        quoted_rate: (liveResult || calc.result)?.rate,
        currency_from: calc.fromCurrency,
        currency_to: calc.toCurrency,
        ...payment,
      }
      // Si un intento anterior ya creo la orden, se reutiliza. Sin esto, un
      // fallo POSTERIOR a crearla —la subida del comprobante, por ejemplo—
      // dejaba la orden hecha, y al reintentar se creaba otra: el cliente veia
      // dos envios identicos por el mismo dinero.
      let orderId, orderData
      if (ordenCreadaRef.current) {
        orderId = ordenCreadaRef.current.id
        orderData = ordenCreadaRef.current.data
      } else {
        const res = await api.post('/orders', payload)
        orderId = res.data.data.id
        orderData = res.data.data
        ordenCreadaRef.current = { id: orderId, data: orderData }
      }

      // Tarjeta: la orden ya existe pero NO está pagada. Se abre el
      // formulario de Stripe y solo cuando el cobro pasa, su webhook la mueve
      // a "en proceso". Hasta entonces el encargado no la ve.
      if ((payment.payment_method || '').toLowerCase() === 'tarjeta') {
        setShowConfirm(false)
        setCardOrder({ id: orderId, data: orderData })
        setLoading(false)
        return
      }

      // Haulmer: la orden existe y NO está pagada. El cobro ocurre en su
      // pantalla; el webhook firmado es lo único que la mueve a \"en proceso\".
      if (esHaulmer(payment.payment_method)) {
        setShowConfirm(false)
        try {
          const chk = await api.post(`/payments/orders/${orderId}/haulmer/checkout`)
          const cobro = chk.data.data
          // Cuando su API no devuelve una dirección, manda el navegador los
          // campos por POST: son los mismos que le enviamos, ya firmados.
          if (cobro.tipo === 'formulario') {
            const f = document.createElement('form')
            f.method = 'POST'
            f.action = cobro.url
            Object.entries(cobro.campos || {}).forEach(([k, v]) => {
              const i = document.createElement('input')
              i.type = 'hidden'; i.name = k; i.value = String(v)
              f.appendChild(i)
            })
            document.body.appendChild(f)
            f.submit()
            return
          }
          window.location.href = cobro.url
          return
        } catch (err) {
          setError(err.response?.data?.detail
            || 'La orden se creó pero no se pudo abrir el pago. Inténtalo desde tu panel.')
          setLoading(false)
          return
        }
      }

      // Koywe: igual que la tarjeta, la orden existe y NO está pagada. El
      // cobro ocurre en el portal de ellos, así que se sale de la aplicación.
      // Si el cliente no llega a pagar, la orden le espera en su panel.
      if (esKoywe(payment.payment_method)) {
        setShowConfirm(false)
        try {
          const chk = await api.post(`/payments/orders/${orderId}/koywe/checkout`)
          const cobro = chk.data.data
          // Ligo en Perú o SIP en Bolivia no dan enlace sino la imagen de un
          // QR: se muestra aquí en vez de redirigir a ninguna parte.
          if (cobro.tipo === 'qr') {
            setQrPago({ ...cobro, orderId })
            setLoading(false)
            return
          }
          window.location.href = cobro.url
          return
        } catch (err) {
          setError(err.response?.data?.detail
            || 'La orden se creó pero no se pudo abrir el pago. Inténtalo desde tu panel.')
          setLoading(false)
          return
        }
      }

      if (proofFile) {
        const formData = new FormData()
        formData.append('file', proofFile)
        const proofRes = await api.post(`/orders/${orderId}/upload-proof`, formData)
        orderData = proofRes.data.data ?? { ...orderData, status: 'en_aprobacion' }
      }

      navigate('/dashboard', { state: { newOrder: orderData } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear la orden')
      setLoading(false)
    }
  }

  const rateDisplay = liveResult?.rate != null
    ? `Tasa: ${liveResult.rate.toLocaleString('es-CL', { maximumFractionDigits: 4, minimumFractionDigits: 4 })}`
    : null

  const receivedDisplay = liveResult ? formatDisplay(liveResult.amount_received, calc.toCurrency) : null

  // Stepper: anterior path skips step 2 (Receptor), maps step 3→2, 4→3
  const displaySteps = destinatarioType === 'anterior' ? ANTERIOR_STEPS : NUEVO_STEPS
  const displayStep = destinatarioType === 'anterior' && step >= 3 ? step - 1 : step

  return (
    <FinexyLayout>
      {qrPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(2,6,23,.8)'}}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{background:'rgba(8,16,44,.97)', border:'1px solid rgba(56,189,248,.25)'}}>
            <h3 className="font-semibold text-center mb-1" style={{color:'#eaf2ff'}}>Escanea con {qrPago.metodo}</h3>
            <p className="text-xs text-center mb-4" style={{color:'#8aa0cc'}}>
              {(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')} {calc.fromCurrency}
            </p>
            <div className="rounded-2xl p-4 flex justify-center mb-4" style={{background:'#fff'}}>
              <img src={qrPago.qr} alt="Código QR para pagar" className="w-full max-w-[240px]" />
            </div>
            <p className="text-xs text-center leading-relaxed mb-4" style={{color:'#8aa0cc'}}>
              Abre la aplicación de tu banco, escanea el código y confirma el pago.
              El envío avanza solo en cuanto se acredite — no hace falta subir comprobante.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full text-sm font-semibold py-3 rounded-xl"
              style={{background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', border:'none', color:'#fff'}}>
              Ya pagué
            </button>
          </div>
        </div>
      )}

      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{color:'#eaf2ff'}}>Nueva transferencia</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>Envía dinero de forma rápida y segura</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center mb-8">
          {displaySteps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all" style={
                i === displayStep
                  ? {background:'rgba(56,189,248,.15)', border:'2px solid #38bdf8', color:'#38bdf8'}
                  : i < displayStep
                    ? {background:'#38bdf8', color:'#060d22'}
                    : {background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#64748b'}
              }>
                {i < displayStep ? '✓' : i + 1}
              </div>
              <span className="hidden sm:block ml-1 text-xs" style={
                i === displayStep ? {color:'#38bdf8'} : i < displayStep ? {color:'#aebfe2'} : {color:'#64748b'}
              }>{s}</span>
              {i < displaySteps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 rounded-full" style={
                  i < displayStep ? {background:'#38bdf8'} : {background:'rgba(255,255,255,.08)'}
                } />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6" style={GLASS}>

          {/* ── Paso 0: Destino ──
              Un botón para empezar de cero y, debajo, la lista de siempre.
              Antes había que elegir primero "nuevo" o "anterior" en dos
              tarjetas, luego el contacto, y luego Continuar: tres decisiones
              para lo que casi siempre es "a la misma persona de la vez
              pasada". Ahora tocar el contacto ya avanza. */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="font-semibold" style={{color:'#eaf2ff'}}>¿A quién quieres enviar?</h2>

              <button
                type="button"
                onClick={() => {
                  setDestinatarioType('nuevo')
                  setEditingContact(false)
                  setReceiver(r => ({ ...r, receiver_name: '', receiver_phone: '', receiver_account: '', receiver_bank_id: '', receiver_id_num: '' }))
                  setStep(1)
                }}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all"
                style={{background:'rgba(56,189,248,.1)', border:'1px dashed rgba(56,189,248,.45)'}}
              >
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
                  style={{background:'rgba(56,189,248,.15)', color:'#38bdf8'}}>+</span>
                <span className="text-left">
                  <span className="block font-semibold text-sm" style={{color:'#eaf2ff'}}>Nuevo destinatario</span>
                  <span className="block text-xs mt-0.5" style={{color:'#8aa0cc'}}>Enviar a alguien por primera vez</span>
                </span>
                <span className="ml-auto text-lg" style={{color:'#38bdf8'}}>→</span>
              </button>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#aebfe2'}}>
                  Enviar de nuevo a
                </p>

                {previousContacts.length === 0 ? (
                  <div className="rounded-2xl px-5 py-8 text-center" style={{...GLASS}}>
                    <p className="text-sm" style={{color:'#8aa0cc'}}>No tienes contactos anteriores</p>
                    <p className="text-xs mt-1.5" style={{color:'#64748b'}}>
                      Aparecerán aquí en cuanto hagas tu primer envío
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,.08)'}}>
                    {previousContacts.map((order, i) => {
                      const abierto = editingContact
                        && receiver.receiver_name === order.receiver_name
                        && (receiver.receiver_account || '') === (order.receiver_account || '')
                        && receiver.receiver_country === order.receiver_country

                      return (
                        <div key={i}>
                          <div className="flex items-center transition-colors"
                            style={{borderBottom: abierto ? 'none' : '1px solid rgba(255,255,255,.06)'}}>
                            <button
                              onClick={() => { setDestinatarioType('anterior'); selectContact(order); setEditingContact(false); setStep(1) }}
                              className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left min-w-0"
                            >
                              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{background:'linear-gradient(135deg,#38bdf8,#818cf8)', color:'#fff'}}>
                                {order.receiver_name?.[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate" style={{color:'#eaf2ff'}}>{order.receiver_name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <img src={`https://flagcdn.com/20x15/${iso2De(order.receiver_country)}.png`} alt=""
                                    className="w-4 h-[11px] rounded-sm object-cover shrink-0"
                                    onError={e => { e.target.style.visibility = 'hidden' }} />
                                  <p className="text-xs truncate" style={{color:'#8aa0cc'}}>
                                    {order.receiver_country}{order.receiver_account && ` · ${order.receiver_account}`}
                                  </p>
                                </div>
                              </div>
                              <span className="text-base shrink-0" style={{color:'#475569'}}>→</span>
                            </button>

                            <button
                              type="button"
                              title="Editar datos del contacto"
                              onClick={() => {
                                setDestinatarioType('anterior')
                                selectContact(order)
                                setEditingContact(!abierto)
                              }}
                              className="px-3.5 py-3.5 text-sm shrink-0 transition-colors"
                              style={{color: abierto ? '#38bdf8' : '#475569', borderLeft:'1px solid rgba(255,255,255,.06)'}}
                            >
                              ✎
                            </button>
                          </div>

                          {abierto && (
                            <div className="px-4 py-4 space-y-3" style={{background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                              {[
                                { label: 'Nombre', field: 'receiver_name' },
                                { label: 'Teléfono', field: 'receiver_phone' },
                                { label: 'N° de cuenta', field: 'receiver_account' },
                                { label: 'N° de documento', field: 'receiver_id_num' },
                              ].map(({ label, field }) => (
                                <div key={field}>
                                  <label className="text-xs block mb-1" style={{color:'#8aa0cc'}}>{label}</label>
                                  <input
                                    value={receiver[field] || ''}
                                    onChange={e => setReceiver(r => ({ ...r, [field]: e.target.value }))}
                                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                                  />
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => { setEditingContact(false); setStep(1) }}
                                className="w-full text-sm font-bold py-2.5 rounded-xl transition-all bg-gradient-to-r from-blue-400 to-blue-700 text-white"
                              >
                                Usar este contacto →
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Paso 1: Calcular ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors shrink-0"
                  style={{border:'1px solid rgba(248,113,113,.35)', color:'#f87171', background:'rgba(248,113,113,.08)'}}>
                  ← Volver
                </button>
                <h2 className="font-semibold" style={{color:'#eaf2ff'}}>¿Cuánto quieres enviar?</h2>
              </div>

              <div className="rounded-2xl overflow-visible" style={{border:'1px solid rgba(255,255,255,.1)'}}>
                {/* TOP ROW: Tu envías */}
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{color:'#8aa0cc'}}>Tu envías</p>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <button type="button"
                        onClick={() => { setFromOpen(v => !v); setToOpen(false) }}
                        className="flex items-center gap-2 rounded-full px-3 py-2 transition-colors"
                        style={{border:'1px solid rgba(255,255,255,.1)', background:'rgba(6,13,40,.8)'}}>
                        <Bandera iso2={selectedFrom?.iso2} ancho={22} alto={15} />
                        <span className="text-sm font-bold" style={{color:'#eaf2ff'}}>{calc.fromCurrency}</span>
                        <ChevronDown />
                      </button>
                      {fromOpen && (
                        <SelectorBusqueda
                          titulo="¿Desde dónde envías?"
                          placeholder="Buscar país o moneda..."
                          valor={calc.fromCountry}
                          opciones={origenesData.map(c => ({ clave: c.country, titulo: c.country, subtitulo: c.code, iso2: c.iso2, code: c.code }))}
                          onElegir={o => handleFromCurrencyChange({ country: o.clave, code: o.code })}
                          onCerrar={() => setFromOpen(false)} />
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={displayAmount}
                      onChange={handleAmountChange}
                      placeholder="0"
                      className="flex-1 text-3xl font-bold text-right outline-none bg-transparent min-w-0"
                      style={{color: displayAmount ? '#eaf2ff' : '#64748b'}}
                    />
                  </div>
                </div>
                {/* DIVIDER */}
                <div className="flex items-center gap-2 px-4 py-2.5" style={{background:'rgba(6,13,40,.5)', borderTop:'1px solid rgba(255,255,255,.06)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  {liveLoading
                    ? <div className="w-2 h-2 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                    : <div className="w-2 h-2 rounded-full shrink-0" style={{background: liveResult ? '#4ade80' : '#64748b'}} />
                  }
                  <span className="text-xs font-medium truncate" style={{color:'#8aa0cc'}}>
                    {liveLoading ? 'Calculando...' : rateDisplay || 'Ingresa un monto para ver la tasa'}
                  </span>
                </div>
                {/* BOTTOM ROW: Destinatario recibe */}
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{color:'#8aa0cc'}}>Destinatario recibe</p>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      {destinatarioType === 'anterior' ? (
                        <div className="flex items-center gap-2 rounded-full px-3 py-2"
                          style={{border:'1px solid rgba(255,255,255,.08)', background:'rgba(6,13,40,.6)'}}>
                          {flagUrl(calc.toCountry)
                            ? <img src={flagUrl(calc.toCountry)} alt="" className="w-[22px] h-[15px] rounded-sm object-cover shrink-0" />
                            : <span className="text-sm shrink-0">🌍</span>
                          }
                          <span className="text-sm font-bold" style={{color:'#eaf2ff'}}>{calc.toCurrency}</span>
                          {/* Decía solo «bloqueado», y leído junto al nombre
                              del país parecía que ese país no estuviera
                              disponible. Lo que está fijado es el destinatario
                              elegido, no el país. */}
                          <span title="Lo fija el destinatario que elegiste. Para enviar a otro país, elige «Nuevo destinatario»."
                            className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                            style={{background:'rgba(100,116,139,.2)', color:'#64748b'}}>
                            del destinatario
                          </span>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setToOpen(v => !v); setFromOpen(false) }}
                          className="flex items-center gap-2 rounded-full px-3 py-2 transition-colors"
                          style={{border:'1px solid rgba(255,255,255,.1)', background:'rgba(6,13,40,.8)'}}>
                          {flagUrl(calc.toCountry)
                            ? <img src={flagUrl(calc.toCountry)} alt="" className="w-[22px] h-[15px] rounded-sm object-cover shrink-0" />
                            : <span className="text-sm shrink-0">🌍</span>
                          }
                          <span className="text-sm font-bold" style={{color:'#eaf2ff'}}>{calc.toCurrency}</span>
                          <ChevronDown />
                        </button>
                      )}
                      {toOpen && destinatarioType !== 'anterior' && (
                        <SelectorBusqueda
                          titulo="¿A qué país envías?"
                          placeholder="Buscar país..."
                          valor={calc.toCountry}
                          opciones={countriesData.map(c => ({ clave: c.country, titulo: c.country, subtitulo: c.currency, iso2: c.iso2, currency: c.currency }))}
                          onElegir={o => handleCountryChange({ country: o.clave, currency: o.currency })}
                          onCerrar={() => setToOpen(false)} />
                      )}
                    </div>
                    <p className="flex-1 text-3xl font-bold text-right" style={{color: receivedDisplay ? '#38bdf8' : '#64748b'}}>
                      {receivedDisplay || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm" style={{color:'#f87171'}}>{error}</p>}

              {destinatarioType === 'anterior' && (
                <button
                  type="button"
                  onClick={() => {
                    setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult }))
                    setStep(2)
                  }}
                  disabled={!liveResult || !rawAmount}
                  className="w-full text-sm font-semibold py-2.5 rounded-xl transition-all"
                  style={{background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)', color:'#8aa0cc', opacity: (!liveResult || !rawAmount) ? 0.4 : 1}}
                >
                  ✏️ Modificar datos del receptor
                </button>
              )}
              <button
                onClick={() => {
                  setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult }))
                  setStep(destinatarioType === 'anterior' ? 3 : 2)
                }}
                disabled={!liveResult || !rawAmount}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-40 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm shadow-blue-200"
              >
                {destinatarioType === 'anterior' ? 'Ir a pago →' : 'Continuar →'}
              </button>
            </div>
          )}

          {/* ── Paso 2: Receptor (solo nuevo) ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(1)} className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors shrink-0"
                  style={{border:'1px solid rgba(248,113,113,.35)', color:'#f87171', background:'rgba(248,113,113,.08)'}}>
                  ← Volver
                </button>
                <div className="flex-1">
                  <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Datos del receptor</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {flagUrl(calc.toCountry) && (
                      <img src={flagUrl(calc.toCountry)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />
                    )}
                    <p className="text-xs" style={{color:'#8aa0cc'}}>{calc.toCountry}</p>
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded" style={{background:'rgba(56,189,248,.12)', color:'#38bdf8'}}>{calc.toCurrency}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Nombre completo *</label>
                  <input type="text" value={receiver.receiver_name} onChange={e => setReceiver({ ...receiver, receiver_name: e.target.value })}
                    className="w-full rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                </div>

                <div>
                  <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Teléfono</label>
                  <div className="flex gap-2">
                    <div className="rounded-xl px-3 py-2.5 text-sm shrink-0" style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc'}}>
                      {COUNTRY_PHONE_PREFIX[calc.toCountry] || '+'}
                    </div>
                    <input type="tel" inputMode="tel" value={receiver.receiver_phone} onChange={e => setReceiver({ ...receiver, receiver_phone: formateaTelefono(e.target.value) })}
                      className="flex-1 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                      placeholder="Número sin código de país" />
                  </div>
                  {telReceptorMal && (
                    <p className="text-xs mt-1" style={{color:'#f87171'}}>
                      Faltan dígitos — escribe el número completo o déjalo vacío
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>
                    Banco destino
                    {flagUrl(receiver.receiver_country) && (
                      <img src={flagUrl(receiver.receiver_country)} alt="" className="inline-block w-4 h-[11px] rounded-sm object-cover ml-2 align-middle" />
                    )}
                  </label>
                  {banksData?.length > 0 ? (
                    <CampoSelector
                      value={receiver.receiver_bank_id}
                      onChange={v => setReceiver({ ...receiver, receiver_bank_id: v })}
                      placeholder="Seleccionar banco..."
                      titulo="Banco del destinatario"
                      opciones={banksData.map(b => ({ valor: b.id, texto: b.name }))}
                      className="w-full rounded-xl px-3 py-2.5"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                  ) : (
                    <input type="text" value={receiver.receiver_bank_id} onChange={e => setReceiver({ ...receiver, receiver_bank_id: e.target.value })}
                      placeholder="Nombre del banco"
                      className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                  )}
                </div>

                <div>
                  <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Número de cuenta</label>
                  {COUNTRY_ACCOUNT_HINT[calc.toCountry] && (
                    <p className="text-xs mb-1.5" style={{color:'#475569'}}>📌 {COUNTRY_ACCOUNT_HINT[calc.toCountry]}</p>
                  )}
                  <input type="text" value={receiver.receiver_account} onChange={e => setReceiver({ ...receiver, receiver_account: e.target.value })}
                    className="w-full rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Tipo de ID</label>
                    <CampoSelector
                      value={receiver.receiver_id_type}
                      onChange={v => setReceiver({ ...receiver, receiver_id_type: v, receiver_id_num: '' })}
                      titulo="Tipo de documento"
                      opciones={(COUNTRY_ID_TYPES[calc.toCountry] || DEFAULT_ID_TYPES).map(t => ({ valor: t, texto: t }))}
                      className="w-full rounded-xl px-3 py-2.5"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                  </div>
                  <div>
                    <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Número de ID</label>
                    <input value={receiver.receiver_id_num}
                      onChange={e => setReceiver({ ...receiver, receiver_id_num: formateaEtiquetado(receiver.receiver_id_type, e.target.value) })}
                      className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', color:'#eaf2ff',
                        border: docReceptor.estado === 'invalido' ? '1px solid rgba(239,68,68,.5)'
                          : docReceptor.estado === 'valido' ? '1px solid rgba(74,222,128,.4)'
                          : '1px solid rgba(255,255,255,.1)'}} />
                    {docReceptor.estado === 'invalido' && (
                      <p className="text-xs mt-1" style={{color:'#f87171'}}>{docReceptor.mensaje}</p>
                    )}
                  </div>
                </div>
              </div>

              <button onClick={() => { if (receptorOk) setStep(3) }} disabled={!receptorOk}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl">
                Continuar →
              </button>
            </div>
          )}


          {/* ── Paso 3: Pago ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(destinatarioType === 'anterior' ? 1 : 2)} className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors shrink-0"
                  style={{border:'1px solid rgba(248,113,113,.35)', color:'#f87171', background:'rgba(248,113,113,.08)'}}>
                  ← Volver
                </button>
                <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Método de pago</h2>
              </div>

              {/* Method selector — cada método solo aparece si se puede cobrar
                  de verdad con la moneda elegida; si no, el cliente lo
                  elegiría y se quedaría atascado sin poder pagar. */}
              {/* Puede no quedar ninguno: una moneda sin cuenta de
                  transferencia, sin tarjeta y sin métodos de Koywe. Antes la
                  rejilla salía vacía y parecía que la página se había roto. */}
              {!cuentaTransfer && !cardEnabled && !koyweMethods.length && (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)' }}>
                  <p className="text-sm font-semibold" style={{ color: '#fcd34d' }}>
                    Todavía no hay forma de pagar desde {calc.fromCurrency}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>
                    Escríbenos por el chat y te damos los datos para completar este envío.
                  </p>
                </div>
              )}

              <div className={`grid gap-3 ${(cardEnabled || koyweMethods.length) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {[
                  // Transferencia solo si hay a dónde transferir. Sin cuenta
                  // —ni de Koywe ni cargada por el super-admin— el cliente
                  // elegía el método y no veía ningún dato bancario: se
                  // quedaba mirando "sube tu comprobante" sin saber a quién
                  // pagarle.
                  ...(cuentaTransfer
                    ? [{
                      value: 'transferencia', label: 'Transferencia', icon: '🏦',
                      desc: 'Te damos la cuenta',
                    }]
                    : []),
                  ...(cardEnabled
                    ? [{ value: 'tarjeta', label: 'Pago con tarjeta', icon: '💳', desc: 'Portal de pago' }]
                    : []),
                  // Tarjeta cobrada en Chile. Se distingue de la de arriba en
                  // la moneda del cargo, no en el medio: por eso el texto dice
                  // en qué se cobra.
                  ...(haulmerActivo
                    ? [{
                      value: 'haulmer', label: 'Tarjeta internacional', icon: '🌎',
                      desc: calc.fromCurrency === 'CLP' ? 'Se cobra en pesos' : 'El cargo sale en pesos',
                    }]
                    : []),
                  ...(linkPago
                    ? [{
                      value: 'link_pago', label: 'Link de pago', icon: '🔗',
                      desc: 'Tarjeta, con comprobante',
                    }]
                    : []),
                  // El icono lo manda el backend con el método: un banco para
                  // Khipu o PSE, una tarjeta para Clink, un QR para Ligo. Antes
                  // era el mismo rayo para todos y los botones se distinguían
                  // solo por el texto.
                  ...koyweMethods.map(m => ({
                    value: String(m.codigo).toLowerCase(),
                    label: m.nombre,
                    icon: m.icono || '💸',
                    desc: m.desc,
                  })),
                ].map(({ value, label, icon, desc }) => (
                  <button key={value} type="button"
                    onClick={() => { setPayment(p => ({ ...p, payment_method: value, payment_bank: '' })); setProofFile(null); setProofPreview(null) }}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all text-center"
                    style={payment.payment_method === value
                      ? {background:'rgba(56,189,248,.1)', border:'2px solid #38bdf8'}
                      : {background:'rgba(255,255,255,.04)', border:'2px solid rgba(255,255,255,.08)'}
                    }>
                    <span className="text-2xl">{icon}</span>
                    <p className="font-semibold text-sm" style={{color:'#eaf2ff'}}>{label}</p>
                    <p className="text-xs" style={{color:'#8aa0cc'}}>{desc}</p>
                  </button>
                ))}
              </div>

              {/* Transferencia: file upload */}
              {payment.payment_method === 'transferencia' && (
                <div className="space-y-3">
                  {/* A dónde transferir. Sin esto el cliente tenía que saberlo
                      por fuera de la aplicación. */}
                  {cuentaTransfer && (
                    <div className="rounded-2xl p-4 space-y-3" style={{...GLASS, border:'1px solid rgba(56,189,248,.2)'}}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#38bdf8'}}>
                          Transfiere a esta cuenta
                        </p>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{background:'rgba(56,189,248,.12)', color:'#38bdf8'}}>
                          {calc.fromCurrency}
                        </span>
                      </div>

                      {/* Con más de una cuenta en el país, el cliente elige a
                          cuál transfiere: mandar a la que no es cuesta un día
                          de revisión a mano. */}
                      {cuentasTransfer.length > 1 && (
                        <div className="flex gap-2 flex-wrap">
                          {cuentasTransfer.map((c, i) => (
                            <button key={c.id ?? i} type="button"
                              onClick={() => setCuentaElegida(i)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                              style={{
                                background: i === cuentaElegida ? 'rgba(56,189,248,.16)' : 'rgba(255,255,255,.04)',
                                border: `1px solid ${i === cuentaElegida ? 'rgba(56,189,248,.45)' : 'rgba(255,255,255,.1)'}`,
                                color: i === cuentaElegida ? '#eaf2ff' : '#8aa0cc',
                              }}>
                              {c.alias || c.campos?.find(x => /banco/i.test(x.etiqueta))?.valor || `Cuenta ${i + 1}`}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        {/* La cuenta de Koywe viene plana con claves fijas; la
                            que carga el super-admin trae `campos` etiquetados,
                            porque cada país pide datos distintos. El primero se
                            marca copiable: es el dato que hay que pegar en el
                            banco (número, IBAN o clave PIX según el país). */}
                        {datosCuenta.map(({ label, value, principal }) => (
                          <div key={label} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{color:'#475569'}}>{label}</p>
                              <p className="text-sm font-semibold truncate" style={{color:'#eaf2ff', fontFamily: principal ? 'monospace' : undefined}}>{value}</p>
                            </div>
                            {/* Copia en TODOS los campos, no solo en el número:
                                el formulario del banco pide el RUT, el titular
                                y el banco por separado, y escribir a mano un
                                RUT es exactamente como se equivoca uno. */}
                            <button type="button"
                              onClick={() => copiar(label, value)}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
                              style={{border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.04)', color: copiado === label ? '#4ade80' : '#aebfe2'}}>
                              {copiado === label ? 'Copiado' : 'Copiar'}
                            </button>
                          </div>
                        ))}

                        <button type="button"
                          onClick={() => copiar('__todos__', textoCuenta)}
                          className="w-full text-xs font-bold py-2.5 rounded-xl mt-1"
                          style={{border:'1px solid rgba(56,189,248,.3)', background:'rgba(56,189,248,.08)', color: copiado === '__todos__' ? '#4ade80' : '#38bdf8'}}>
                          {copiado === '__todos__' ? '✓ Datos copiados' : 'Copiar todos los datos'}
                        </button>
                      </div>

                      <div className="rounded-xl p-3" style={{background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.15)'}}>
                        <p className="text-[11px] leading-relaxed" style={{color:'#fcd34d'}}>
                          Transfiere exactamente{' '}
                          <strong>{(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')} {calc.fromCurrency}</strong>.
                          Un monto distinto retrasa la revisión, porque es lo que usamos para
                          reconocer tu transferencia.
                        </p>
                      </div>

                      {cuentaTransfer.nota && (
                        <p className="text-[11px] leading-relaxed" style={{color:'#8aa0cc'}}>{cuentaTransfer.nota}</p>
                      )}
                    </div>
                  )}

                  <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#aebfe2'}}>Comprobante de transferencia</p>
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors"
                    style={proofFile
                      ? {borderColor:'rgba(74,222,128,.3)', background:'rgba(74,222,128,.06)'}
                      : {borderColor:'rgba(255,255,255,.1)', background:'rgba(6,13,40,.4)'}
                    }>
                    <input type="file" accept="image/*,.pdf" className="sr-only"
                      onChange={e => handleProofChange(e.target.files?.[0] || null)} />
                    {proofFile ? (
                      <>
                        {proofPreview ? (
                          <img src={proofPreview} alt="preview" className="max-h-32 rounded-xl object-contain" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:'rgba(74,222,128,.12)'}}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        <p className="text-sm font-semibold" style={{color:'#4ade80'}}>{proofFile.name}</p>
                        <p className="text-xs" style={{color:'#4ade80', opacity:0.7}}>Toca para cambiar</p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:'rgba(255,255,255,.06)'}}>
                          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Adjuntar comprobante</p>
                        <p className="text-xs" style={{color:'#8aa0cc'}}>JPG, PNG, HEIC o PDF — requerido</p>
                      </>
                    )}
                  </label>

                  {proofError && (
                    <div className="rounded-xl px-3 py-2.5" style={{background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)'}}>
                      <p className="text-xs leading-relaxed" style={{color:'#fca5a5'}}>{proofError}</p>
                    </div>
                  )}

                  <button
                    onClick={() => setStep(4)}
                    disabled={!proofFile}
                    className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all">
                    Continuar →
                  </button>
                </div>
              )}

              {/* Tarjeta: payment portal */}
              {payment.payment_method === 'tarjeta' && (
                <div className="space-y-3">
                  {/* Receptor summary */}
                  <div className="rounded-2xl p-4 space-y-2" style={{...GLASS, border:'1px solid rgba(56,189,248,.15)'}}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'#64748b'}}>Datos del destinatario</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Nombre', value: receiver.receiver_name },
                        { label: 'País', value: receiver.receiver_country },
                        { label: 'Teléfono', value: receiver.receiver_phone || '—' },
                        { label: 'Banco', value: (() => { const b = (banksData || []).find(b => String(b.id) === String(receiver.receiver_bank_id)); return b?.name || '—' })() },
                        { label: 'Cuenta', value: receiver.receiver_account || '—' },
                        { label: 'Documento', value: receiver.receiver_id_num ? `${receiver.receiver_id_type}: ${receiver.receiver_id_num}` : '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{color:'#475569'}}>{label}</p>
                          <p className="text-xs font-semibold mt-0.5 truncate" style={{color:'#aebfe2'}}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden" style={GLASS}>
                  {/* Portal header */}
                  <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-white text-sm font-semibold">Pago seguro</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-white bg-blue-900/50 px-1.5 py-0.5 rounded tracking-wider">VISA</span>
                      <span className="text-[10px] font-black text-white bg-blue-900/50 px-1.5 py-0.5 rounded tracking-wider">MC</span>
                      <span className="text-[10px] font-black text-white bg-blue-900/50 px-1.5 py-0.5 rounded tracking-wider">AMEX</span>
                    </div>
                  </div>

                  {/* Amount summary */}
                  <div className="px-5 pt-5 pb-3">
                    <p className="text-xs mb-1" style={{color:'#8aa0cc'}}>Total a pagar</p>
                    <p className="text-3xl font-bold" style={{color:'#eaf2ff'}}>
                      {(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')}
                      <span className="text-base ml-1.5" style={{color:'#8aa0cc'}}>{calc.fromCurrency}</span>
                    </p>
                    {calc.result && (
                      <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>
                        Destinatario recibirá{' '}
                        <span className="font-semibold" style={{color:'#aebfe2'}}>
                          {calc.result.amount_received?.toLocaleString()} {calc.toCurrency}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Pay button */}
                  <div className="px-5 pb-5 space-y-3">
                    <button
                      onClick={() => {
                        setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult || calc.result }))
                        setShowConfirm(true)
                      }}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all text-base shadow-md shadow-green-200 flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                          Pagar ahora
                        </>
                      )}
                    </button>
                    <p className="text-xs text-center" style={{color:'#8aa0cc'}}>
                      🔒 Tu pago está protegido con cifrado SSL
                    </p>
                  </div>
                </div>
                </div>
              )}

              {/* Link de pago: se paga en la página de Haulmer, pero nadie nos
                  avisa. El cliente vuelve con la captura del pago y el envío
                  espera a que un admin la mire, como una transferencia. */}
              {esLinkPago(payment.payment_method) && (
                <div className="space-y-3">
                  <div className="rounded-2xl p-4 space-y-3" style={{...GLASS, border:'1px solid rgba(56,189,248,.2)'}}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#38bdf8'}}>
                      Paga con tarjeta este monto
                    </p>
                    <div className="flex items-end gap-2 flex-wrap">
                      <p className="text-3xl font-bold" style={{color:'#eaf2ff'}}>
                        {montoHaulmerCLP ? montoHaulmerCLP.toLocaleString('es-CL') : '—'}
                        <span className="text-base ml-1.5" style={{color:'#8aa0cc'}}>CLP</span>
                      </p>
                      <button type="button"
                        onClick={() => { if (montoHaulmerCLP) navigator.clipboard?.writeText(String(montoHaulmerCLP)); setMontoCopiado(true); setTimeout(() => setMontoCopiado(false), 2000) }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg mb-1"
                        style={{background:'rgba(56,189,248,.12)', border:'1px solid rgba(56,189,248,.3)', color: montoCopiado ? '#4ade80' : '#7dd3fc'}}>
                        {montoCopiado ? 'Copiado' : 'Copiar monto'}
                      </button>
                    </div>
                    {calc.fromCurrency !== 'CLP' && (
                      <p className="text-xs" style={{color:'#fcd34d'}}>
                        Tu envío es en {calc.fromCurrency} y la tarjeta se cobra en pesos chilenos.
                        Escribe exactamente este monto en la página de pago.
                      </p>
                    )}
                    {/* Se copia el monto al abrir: la página de Haulmer pide
                        escribirlo a mano y no admite que se lo pasemos en la
                        dirección —probado—, así que al menos se pega. */}
                    <a href={linkPago} target="_blank" rel="noopener noreferrer"
                      onClick={() => { if (montoHaulmerCLP) { navigator.clipboard?.writeText(String(montoHaulmerCLP)); setMontoCopiado(true); setTimeout(() => setMontoCopiado(false), 4000) } }}
                      className="block w-full text-center bg-gradient-to-r from-cyan-500 to-blue-700 text-white font-bold py-3 rounded-xl">
                      Abrir la página de pago →
                    </a>
                    {montoCopiado && (
                      <p className="text-xs text-center" style={{color:'#4ade80'}}>
                        Monto copiado: pégalo en «Ingresar el monto a pagar».
                      </p>
                    )}
                    <p className="text-[11px] leading-relaxed" style={{color:'#8aa0cc'}}>
                      Se abre en otra pestaña. Cuando termines, vuelve aquí y sube la captura del
                      pago: el envío se revisa y avanza en cuanto se confirme.
                    </p>
                  </div>

                  <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#aebfe2'}}>Comprobante del pago</p>
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors"
                    style={proofFile
                      ? {borderColor:'rgba(74,222,128,.3)', background:'rgba(74,222,128,.06)'}
                      : {borderColor:'rgba(255,255,255,.1)', background:'rgba(6,13,40,.4)'}
                    }>
                    <input type="file" accept="image/*,.pdf" className="sr-only"
                      onChange={e => handleProofChange(e.target.files?.[0] || null)} />
                    {proofFile ? (
                      <>
                        {proofPreview ? (
                          <img src={proofPreview} alt="preview" className="max-h-32 rounded-xl object-contain" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:'rgba(74,222,128,.12)'}}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        <p className="text-sm font-semibold" style={{color:'#4ade80'}}>{proofFile.name}</p>
                        <p className="text-xs" style={{color:'#4ade80', opacity:0.7}}>Toca para cambiar</p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:'rgba(255,255,255,.06)'}}>
                          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Adjuntar comprobante</p>
                        <p className="text-xs" style={{color:'#8aa0cc'}}>JPG, PNG, HEIC o PDF — requerido</p>
                      </>
                    )}
                  </label>

                  {proofError && (
                    <div className="rounded-xl px-3 py-2.5" style={{background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)'}}>
                      <p className="text-xs leading-relaxed" style={{color:'#fca5a5'}}>{proofError}</p>
                    </div>
                  )}

                  <button
                    onClick={() => setStep(4)}
                    disabled={!proofFile}
                    className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all">
                    Continuar →
                  </button>
                </div>
              )}

              {/* Haulmer: también se paga fuera, y además el cargo puede ir en
                  otra moneda que la del envío. Eso hay que decirlo antes, no
                  cuando el banco muestre el cargo en pesos. */}
              {esHaulmer(payment.payment_method) && (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden" style={GLASS}>
                    <div className="bg-gradient-to-r from-sky-600 to-indigo-800 px-5 py-4 flex items-center gap-2">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <span className="text-white text-sm font-semibold">Tarjeta internacional</span>
                    </div>

                    <div className="px-5 pt-5 pb-3">
                      <p className="text-xs mb-1" style={{color:'#8aa0cc'}}>Total a pagar</p>
                      <p className="text-3xl font-bold" style={{color:'#eaf2ff'}}>
                        {(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')}
                        <span className="text-base ml-1.5" style={{color:'#8aa0cc'}}>{calc.fromCurrency}</span>
                      </p>
                      {calc.fromCurrency !== 'CLP' && (
                        <p className="text-xs mt-1" style={{color:'#fcd34d'}}>
                          Tu tarjeta se cobrará en pesos chilenos
                          {montoHaulmerCLP ? ` (unos ${montoHaulmerCLP.toLocaleString('es-CL')} CLP)` : ''}.
                          El monto exacto se calcula al abrir el pago.
                        </p>
                      )}
                    </div>

                    <div className="px-5 pb-5 space-y-3">
                      <p className="text-xs" style={{color:'#8aa0cc'}}>
                        Sirve cualquier tarjeta, también de fuera de Chile. Te llevaremos a la
                        pantalla segura de Haulmer y al terminar vuelves aquí: el envío avanza
                        solo, sin subir comprobante.
                      </p>
                      <button
                        onClick={() => {
                          setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult || calc.result }))
                          setShowConfirm(true)
                        }}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all text-base flex items-center justify-center gap-2">
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Abriendo el pago...
                          </>
                        ) : 'Pagar con tarjeta'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Koywe: se paga fuera de la aplicación, en el portal de ellos.
                  No hay formulario que rellenar aquí, así que esto solo
                  explica a dónde va y confirma el importe. */}
              {koyweElegido && (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden" style={GLASS}>
                    <div className="bg-gradient-to-r from-cyan-600 to-blue-800 px-5 py-4 flex items-center gap-2">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-white text-sm font-semibold">Pago con {koyweElegido.nombre}</span>
                    </div>

                    <div className="px-5 pt-5 pb-3">
                      <p className="text-xs mb-1" style={{color:'#8aa0cc'}}>Total a pagar</p>
                      <p className="text-3xl font-bold" style={{color:'#eaf2ff'}}>
                        {(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')}
                        <span className="text-base ml-1.5" style={{color:'#8aa0cc'}}>{calc.fromCurrency}</span>
                      </p>
                      {calc.result && (
                        <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>
                          Destinatario recibirá{' '}
                          <span className="font-semibold" style={{color:'#aebfe2'}}>
                            {calc.result.amount_received?.toLocaleString()} {calc.toCurrency}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="px-5 pb-5 space-y-3">
                      {/* Lo que el método exige del pagador y no tenemos. PSE
                          en Colombia no cobra sin documento y apellido, y esto
                          nunca se pidió: el remitente sale del nombre de la
                          cuenta. Sin preguntarlo aquí, el cobro se creaba y
                          Koywe lo rechazaba después. */}
                      {camposPagador.length > 0 && (
                        <div className="space-y-3 pb-1">
                          <p className="text-xs" style={{color:'#fcd34d'}}>
                            {koyweElegido.nombre} necesita estos datos de quien paga. El banco
                            los compara con los de tu cuenta.
                          </p>
                          {camposPagador.includes('nombre') && (
                            <div>
                              <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Nombre y apellido</label>
                              <input value={pagador.sender_name} onChange={e => setPagador(p => ({ ...p, sender_name: e.target.value }))}
                                className="w-full rounded-xl px-3 py-2.5 text-sm"
                                style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                            </div>
                          )}
                          {camposPagador.includes('documento') && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Tipo de documento</label>
                                <CampoSelector
                                  value={pagador.sender_id_type}
                                  onChange={v => setPagador(p => ({ ...p, sender_id_type: v }))}
                                  titulo="Tipo de documento"
                                  opciones={(payCfg?.koywe?.documentos?.[calc.fromCurrency] || []).map(d => ({ valor: d.codigo, texto: d.nombre }))}
                                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                              </div>
                              <div>
                                <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Número</label>
                                <input value={pagador.sender_id_num} onChange={e => setPagador(p => ({ ...p, sender_id_num: e.target.value }))}
                                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                                  style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                              </div>
                            </div>
                          )}
                          {camposPagador.includes('telefono') && (
                            <div>
                              <label className="text-xs block mb-1" style={{color:'#aebfe2'}}>Teléfono</label>
                              <input value={pagador.sender_phone} onChange={e => setPagador(p => ({ ...p, sender_phone: e.target.value }))}
                                className="w-full rounded-xl px-3 py-2.5 text-sm"
                                style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                            </div>
                          )}
                        </div>
                      )}

                      {faltaDelPagador.length > 0 && (
                        <p className="text-xs" style={{color:'#fca5a5'}}>
                          Falta {faltaDelPagador.join(', ')} para poder continuar.
                        </p>
                      )}

                      <p className="text-xs" style={{color:'#8aa0cc'}}>
                        Te llevaremos al portal seguro de {koyweElegido.nombre} para completar el pago.
                        Al terminar volverás aquí y el envío avanza solo, sin subir comprobante.
                      </p>
                      <button
                        onClick={() => {
                          setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult || calc.result }))
                          setShowConfirm(true)
                        }}
                        disabled={loading || faltaDelPagador.length > 0}
                        className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all text-base flex items-center justify-center gap-2">
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Abriendo el portal...
                          </>
                        ) : `Pagar con ${koyweElegido.nombre}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm" style={{color:'#f87171'}}>{error}</p>}
            </div>
          )}

          {/* ── Paso 4: Confirmar ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(3)} className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors shrink-0"
                  style={{border:'1px solid rgba(248,113,113,.35)', color:'#f87171', background:'rgba(248,113,113,.08)'}}>
                  ← Volver
                </button>
                <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Confirmar transferencia</h2>
              </div>

              {calc.result && (
                <div className="rounded-2xl p-5" style={{ ...GLASS, border: '1px solid rgba(56,189,248,.15)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs mb-0.5" style={{color:'#8aa0cc'}}>Envías</p>
                      <p className="text-2xl font-bold" style={{color:'#eaf2ff'}}>
                        {formatDisplay(rawAmount || parseFloat(calc.amount), calc.fromCurrency)}
                        <span className="text-base ml-1" style={{color:'#8aa0cc'}}>{calc.fromCurrency}</span>
                      </p>
                    </div>
                    <span className="text-3xl" style={{color:'#38bdf8'}}>→</span>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5 mb-0.5">
                        <p className="text-xs" style={{color:'#8aa0cc'}}>Recibe</p>
                        {flagUrl(calc.toCountry) && <img src={flagUrl(calc.toCountry)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />}
                      </div>
                      <p className="text-2xl font-bold" style={{color:'#4ade80'}}>
                        {formatDisplay(calc.result.amount_received, calc.toCurrency)}
                        <span className="text-base ml-1" style={{color:'#4ade80', opacity:0.7}}>{calc.toCurrency}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-center mt-3 pt-3 text-xs" style={{borderTop:'1px solid rgba(56,189,248,.15)', color:'#8aa0cc'}}>
                    <div>Tasa: <span className="font-semibold" style={{color:'#aebfe2'}}>{calc.result.rate?.toFixed(4)}</span></div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'#8aa0cc'}}>Receptor</span>
                  <span className="font-semibold" style={{color:'#eaf2ff'}}>{receiver.receiver_name}</span>
                </div>
                <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'#8aa0cc'}}>País</span>
                  <div className="flex items-center gap-1.5">
                    {flagUrl(receiver.receiver_country) && <img src={flagUrl(receiver.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />}
                    <span className="font-medium" style={{color:'#aebfe2'}}>{receiver.receiver_country}</span>
                  </div>
                </div>
                {receiver.receiver_account && (
                  <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                    <span style={{color:'#8aa0cc'}}>Cuenta</span>
                    <span className="font-medium" style={{color:'#aebfe2'}}>{receiver.receiver_account}</span>
                  </div>
                )}
                <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'#8aa0cc'}}>Método pago</span>
                  <span className="font-medium capitalize" style={{color:'#aebfe2'}}>{payment.payment_method}</span>
                </div>
                {payment.payment_bank && (
                  <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                    <span style={{color:'#8aa0cc'}}>Banco</span>
                    <span className="font-medium" style={{color:'#aebfe2'}}>{payment.payment_bank}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span style={{color:'#8aa0cc'}}>Comprobante</span>
                  {proofFile ? (
                    <span className="font-medium text-sm flex items-center gap-1" style={{color:'#4ade80'}}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Adjunto
                    </span>
                  ) : (
                    <span className="text-sm" style={{color:'#8aa0cc'}}>Sin adjuntar</span>
                  )}
                </div>
              </div>

              {error && <p className="text-sm" style={{color:'#f87171'}}>{error}</p>}

              <button onClick={() => setShowConfirm(true)} disabled={loading}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-md shadow-blue-200">
                {loading ? 'Procesando...' : '✓ Confirmar envío'}
              </button>

            </div>
          )}

          {showConfirm && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,.7)', backdropFilter:'blur(6px)' }}>
              <div className="w-full max-w-sm rounded-2xl p-6" style={{ background:'rgba(8,16,44,.98)', border:'1px solid rgba(56,189,248,.2)', boxShadow:'0 24px 64px rgba(0,0,0,.7)' }}>
                <h3 className="text-lg font-bold mb-1" style={{ color:'#eaf2ff' }}>¿Confirmar envío?</h3>
                <p className="text-xs mb-5" style={{ color:'#8aa0cc' }}>Revisa los datos antes de continuar</p>

                <div className="space-y-0 rounded-xl overflow-hidden mb-5" style={{ border:'1px solid rgba(255,255,255,.06)' }}>
                  {[
                    ['Receptor', receiver.receiver_name],
                    ['País destino', receiver.receiver_country],
                    ['Cuenta', receiver.receiver_account || '—'],
                    ['Banco', banksData?.find(b => String(b.id) === String(receiver.receiver_bank_id))?.name || payment.payment_bank || '—'],
                    ['Envías', `${(rawAmount || parseFloat(calc.amount) || 0).toLocaleString()} ${calc.fromCurrency}`],
                    ['Recibe', liveResult ? `${liveResult.amount_received?.toLocaleString()} ${calc.toCurrency}` : '—'],
                    ['Método de pago', payment.payment_method || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between px-4 py-2.5" style={{ borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                      <span className="text-xs" style={{ color:'#64748b' }}>{label}</span>
                      <span className="text-xs font-semibold text-right max-w-[55%]" style={{ color:'#aebfe2' }}>{value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setShowConfirm(false)}
                    className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
                    style={{ background:'rgba(255,255,255,.06)', color:'#aebfe2', border:'1px solid rgba(255,255,255,.1)' }}>
                    Cancelar
                  </button>
                  <button onClick={() => { setShowConfirm(false); submit() }} disabled={loading}
                    className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    style={{ background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', color:'#fff', boxShadow:'0 4px 16px rgba(59,130,246,.4)' }}>
                    {loading ? 'Procesando...' : 'Sí, enviar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {cardOrder && (
        <CardPayment
          orderId={cardOrder.id}
          amountLabel={`${formatDisplay(rawAmount || parseFloat(calc.amount), calc.fromCurrency)} ${calc.fromCurrency}`}
          onClose={() => {
            // La orden queda creada y sin pagar; el cliente puede pagarla
            // luego desde su panel, no se pierde lo que ya rellenó.
            setCardOrder(null)
            navigate('/dashboard', { state: { newOrder: cardOrder.data } })
          }}
          onSuccess={() => {
            setCardOrder(null)
            navigate('/dashboard', { state: { newOrder: { ...cardOrder.data, status: 'en_proceso' } } })
          }}
        />
      )}

      {avisoPagador && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(2,6,23,.8)', backdropFilter: 'blur(4px)' }}
            onClick={cerrarAvisoPagador}>
            <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={GLASS}
              onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
                style={{ width: 56, height: 56, background: 'rgba(251,191,36,.12)', fontSize: 28 }}>
                ⚠️
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: '#eaf2ff' }}>
                Antes de pagar
              </h3>
              <p className="text-sm leading-relaxed mb-1" style={{ color: '#c8d8f0' }}>
                La cuenta desde la que pagues tiene que estar <strong>a tu nombre</strong>, el
                mismo con el que te registraste.
              </p>
              <p className="text-xs leading-relaxed mb-4" style={{ color: '#8aa0cc' }}>
                Si el dinero llega desde la cuenta de otra persona, el envío queda retenido y
                hay que devolverlo.
              </p>

              {/* Lo de la verificación iba en un segundo aviso, encima de este.
                  Dos ventanas seguidas se cierran sin leer ninguna. */}
              {superaUmbral && (
                <div className="rounded-xl p-3 mb-4 text-left"
                  style={{ background: 'rgba(168,85,247,.07)', border: '1px solid rgba(168,85,247,.22)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#d8b4fe' }}>
                    Este envío pasará por verificación
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: '#c8d8f0' }}>
                    Por ser tu primer envío y por el monto, lo revisaremos antes de entregarlo
                    al destinatario. Tu pago se procesa con normalidad.
                  </p>
                  <p className="text-[11px] leading-relaxed mt-2" style={{ color: '#8aa0cc' }}>
                    Es un paso único: tus siguientes envíos no pasan por aquí.
                  </p>
                </div>
              )}
              <button onClick={cerrarAvisoPagador}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 text-white font-semibold py-3 rounded-xl">
                Entendido
              </button>
            </div>
          </div>
        </Portal>
      )}

    </FinexyLayout>
  )
}
