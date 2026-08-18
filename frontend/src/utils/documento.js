// Formato y validación de documentos, mientras se escribe.
//
// Espeja backend/services/documento_service.py. Existe aparte porque avisar al
// escribir es otra cosa que rechazar al enviar: aquí se corrige el formato solo
// y se dice si el número cuadra antes de que el formulario se mande, así nadie
// llena diez campos para que le rechacen el primero.
//
// El backend sigue validando igual. Esto es comodidad, no seguridad: cualquiera
// puede saltarse el navegador.

const soloDigitos = (v) => (v || '').replace(/\D/g, '')

// ── Chile: RUT ───────────────────────────────────────────────────────────────

// Dígito verificador: módulo 11 con multiplicadores 2..7 cíclicos.
export function dvRut(numero) {
  let suma = 0
  let factor = 2
  for (let i = numero.length - 1; i >= 0; i--) {
    suma += parseInt(numero[i], 10) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  if (resto === 11) return '0'
  if (resto === 10) return 'K'
  return String(resto)
}

// El dígito verificador NO siempre es un número: cuando el resto da 10 se
// escribe K. Un RUT terminado en K es tan válido como cualquier otro, y
// cambiarlo por 0 lo rompe — 0 corresponde al resto 11, que es otro caso.
export function formateaRut(valor) {
  let limpio = (valor || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (!limpio) return ''
  if (limpio.length === 1) return limpio

  const dv = limpio.slice(-1)
  let cuerpo = limpio.slice(0, -1)

  // Puntos de miles, de derecha a izquierda.
  cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${cuerpo}-${dv}`
}

export function validaRut(valor) {
  const limpio = (valor || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false
  return dvRut(limpio.slice(0, -1)) === limpio.slice(-1)
}

// ── Brasil: CPF ──────────────────────────────────────────────────────────────

export function formateaCpf(valor) {
  const n = soloDigitos(valor).slice(0, 11)
  if (n.length <= 3) return n
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`
}

export function validaCpf(valor) {
  const n = soloDigitos(valor)
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  for (const largo of [9, 10]) {
    let suma = 0
    for (let i = 0; i < largo; i++) suma += parseInt(n[i], 10) * (largo + 1 - i)
    let dv = (suma * 10) % 11
    if (dv === 10) dv = 0
    if (dv !== parseInt(n[largo], 10)) return false
  }
  return true
}

// ── Argentina: CUIT / CUIL ───────────────────────────────────────────────────

export function formateaCuit(valor) {
  const n = soloDigitos(valor).slice(0, 11)
  if (n.length <= 2) return n
  if (n.length <= 10) return `${n.slice(0, 2)}-${n.slice(2)}`
  return `${n.slice(0, 2)}-${n.slice(2, 10)}-${n.slice(10)}`
}

export function validaCuit(valor) {
  const n = soloDigitos(valor)
  if (n.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let suma = 0
  for (let i = 0; i < 10; i++) suma += parseInt(n[i], 10) * pesos[i]
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return dv === parseInt(n[10], 10)
}

// ── Colombia: NIT ────────────────────────────────────────────────────────────

export function formateaNit(valor) {
  const n = soloDigitos(valor).slice(0, 16)
  if (n.length <= 1) return n
  const cuerpo = n.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${cuerpo}-${n.slice(-1)}`
}

export function validaNit(valor) {
  const n = soloDigitos(valor)
  if (n.length < 8 || n.length > 16) return false
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const cuerpo = n.slice(0, -1)
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    suma += parseInt(cuerpo[cuerpo.length - 1 - i], 10) * pesos[i]
  }
  const resto = suma % 11
  const esperado = resto === 0 || resto === 1 ? 0 : 11 - resto
  return esperado === parseInt(n.slice(-1), 10)
}

// ── Números con separador de miles (cédulas, DNI) ────────────────────────────

const formateaMiles = (valor, max) =>
  soloDigitos(valor).slice(0, max).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// ── Tabla ────────────────────────────────────────────────────────────────────

// Cada tipo: cómo se escribe, cómo se comprueba, y si la comprobación es
// aritmética o solo de formato. Se distingue para no decir "ese número no
// existe" cuando en realidad solo se ha mirado el largo.
const TIPOS = {
  RUT:     { formatea: formateaRut, valida: validaRut, verificado: true,  ejemplo: '12.345.678-5', nombre: 'RUT' },
  CPF:     { formatea: formateaCpf, valida: validaCpf, verificado: true,  ejemplo: '111.444.777-35', nombre: 'CPF' },
  CUIT:    { formatea: formateaCuit, valida: validaCuit, verificado: true, ejemplo: '20-12345678-6', nombre: 'CUIT' },
  CUIL:    { formatea: formateaCuit, valida: validaCuit, verificado: true, ejemplo: '20-12345678-6', nombre: 'CUIL' },
  NIT:     { formatea: formateaNit, valida: validaNit, verificado: true,  ejemplo: '900.123.456-8', nombre: 'NIT' },
  CED_CIU: { formatea: (v) => formateaMiles(v, 12), valida: (v) => soloDigitos(v).length >= 6 && soloDigitos(v).length <= 12, verificado: false, ejemplo: '1.023.456.789', nombre: 'Cédula de ciudadanía' },
  CED_EXT: { formatea: (v) => formateaMiles(v, 12), valida: (v) => soloDigitos(v).length >= 6 && soloDigitos(v).length <= 12, verificado: false, ejemplo: '123.456', nombre: 'Cédula de extranjería' },
  DNI:     { formatea: (v) => formateaMiles(v, 9),  valida: (v) => soloDigitos(v).length >= 7 && soloDigitos(v).length <= 9,  verificado: false, ejemplo: '12.345.678', nombre: 'DNI' },
  CURP:    { formatea: (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18), valida: (v) => /^[A-Z0-9]{18}$/.test((v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')), verificado: false, ejemplo: 'ABCD123456HDFXYZ01', nombre: 'CURP' },
  RFC:     { formatea: (v) => (v || '').toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13), valida: (v) => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test((v || '').toUpperCase().replace(/[^A-ZÑ&0-9]/g, '')), verificado: false, ejemplo: 'ABC123456XYZ', nombre: 'RFC' },
  PP:      { formatea: (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12), valida: (v) => /^[A-Z0-9]{5,12}$/.test((v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')), verificado: false, ejemplo: 'AB123456', nombre: 'Pasaporte' },
}

export const formateaDocumento = (tipo, valor) => {
  const cfg = TIPOS[(tipo || '').toUpperCase()]
  return cfg ? cfg.formatea(valor) : (valor || '')
}

export const ejemploDocumento = (tipo) => TIPOS[(tipo || '').toUpperCase()]?.ejemplo || ''

/**
 * Estado de un documento mientras se escribe.
 * Devuelve { estado: 'vacio'|'incompleto'|'valido'|'invalido', mensaje }.
 *
 * 'incompleto' existe para no marcar en rojo un campo que aún se está
 * rellenando: nadie escribe un RUT entero de una vez.
 */
export function revisaDocumento(tipo, valor) {
  const cfg = TIPOS[(tipo || '').toUpperCase()]
  if (!cfg) return { estado: 'vacio', mensaje: '' }

  const crudo = (valor || '').trim()
  if (!crudo) return { estado: 'vacio', mensaje: '' }

  if (cfg.valida(crudo)) return { estado: 'valido', mensaje: '' }

  // ¿Le falta longitud, o está mal? Un campo a medio escribir no se marca.
  const largo = crudo.replace(/[^0-9A-Za-z]/g, '').length
  const largoEjemplo = cfg.ejemplo.replace(/[^0-9A-Za-z]/g, '').length
  if (largo < largoEjemplo) return { estado: 'incompleto', mensaje: '' }

  return {
    estado: 'invalido',
    mensaje: cfg.verificado
      ? `Ese ${cfg.nombre} no es válido — revisa el número`
      : `Revisa el formato (ej: ${cfg.ejemplo})`,
  }
}

// ── Teléfono ─────────────────────────────────────────────────────────────────

// Solo dígitos, espacios y un + al principio. Lo demás se descarta al escribir
// en vez de rechazarlo al enviar.
export const formateaTelefono = (valor) => {
  const v = (valor || '').replace(/[^\d+\s]/g, '')
  return v.startsWith('+') ? '+' + v.slice(1).replace(/\+/g, '') : v.replace(/\+/g, '')
}

export const validaTelefono = (valor) => soloDigitos(valor).length >= 8

// ── Correo ───────────────────────────────────────────────────────────────────

// Deliberadamente simple: la comprobación de verdad es el código que se manda
// al buzón. Esto solo atrapa el error de escritura evidente.
export const validaEmail = (valor) =>
  /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test((valor || '').trim())


// El formulario del destinatario guarda etiquetas en castellano ("RUT",
// "Cédula de Ciudadanía") porque así se han guardado siempre las órdenes.
// Esto las traduce al código que entiende el módulo, sin tocar lo guardado.
const ETIQUETA_A_CODIGO = {
  'RUT': 'RUT',
  'C\u00e9dula de Ciudadan\u00eda': 'CED_CIU',
  'C\u00e9dula': 'CED_CIU',
  'C\u00e9dula de Extranjer\u00eda': 'CED_EXT',
  'NIT': 'NIT',
  'DNI': 'DNI',
  'CPF': 'CPF',
  'CNPJ': 'CPF',
  'CURP': 'CURP',
  'RFC': 'RFC',
  'CUIL/CUIT': 'CUIT',
  'CUIL': 'CUIT',
  'CUIT': 'CUIT',
  'Pasaporte': 'PP',
}

// Devuelve el código, o '' si no se reconoce. Cuando no se reconoce (SSN, INE,
// "Otro") no se formatea ni se valida: es preferible dejar escribir libremente
// a estropear un número que no sabemos leer.
export const codigoDeEtiqueta = (etiqueta) => ETIQUETA_A_CODIGO[etiqueta] || ''

export const formateaEtiquetado = (etiqueta, valor) => {
  const codigo = codigoDeEtiqueta(etiqueta)
  return codigo ? formateaDocumento(codigo, valor) : (valor || '')
}

export const revisaEtiquetado = (etiqueta, valor) => {
  const codigo = codigoDeEtiqueta(etiqueta)
  return codigo ? revisaDocumento(codigo, valor) : { estado: 'vacio', mensaje: '' }
}
