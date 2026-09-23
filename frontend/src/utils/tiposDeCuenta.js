// Los tipos de cuenta que existen de verdad en cada país.
//
// Antes esto solo se preguntaba en Colombia, y con dos opciones fijas. El
// problema es que cada país los llama a su manera y no son intercambiables: en
// Chile la "cuenta vista" y la "cuenta corriente" son productos distintos, en
// Bolivia se dice "caja de ahorro" y en Brasil "poupança". Mandar el pago con
// el tipo equivocado es motivo de rechazo en el banco de destino.
//
// El nombre que va aquí es el que entiende el banco de allá, no una traducción
// nuestra: es el texto que acaba en la orden de pago.
export const TIPOS_POR_PAIS = {
  'Chile': ['Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro', 'Chequera Electrónica'],
  'Colombia': ['Ahorros', 'Corriente'],
  'Venezuela': ['Ahorro', 'Corriente'],
  'Perú': ['Ahorros', 'Corriente'],
  'Bolivia': ['Caja de Ahorro', 'Cuenta Corriente'],
  'Ecuador': ['Ahorros', 'Corriente'],
  'Argentina': ['Caja de Ahorro', 'Cuenta Corriente'],
  'Brasil': ['Conta Poupança', 'Conta Corrente'],
  'México': ['Cuenta de Ahorro', 'Cuenta de Cheques'],
  'Paraguay': ['Caja de Ahorro', 'Cuenta Corriente'],
  'Uruguay': ['Caja de Ahorro', 'Cuenta Corriente'],
  'República Dominicana': ['Ahorros', 'Corriente'],
  'Panamá': ['Ahorros', 'Corriente'],
  'Costa Rica': ['Ahorros', 'Corriente'],
  'Estados Unidos': ['Checking', 'Savings'],
  'Canadá': ['Chequing', 'Savings'],
  'España': ['Cuenta Corriente', 'Cuenta de Ahorro'],
}

// Billeteras y pagos por celular: no tienen tipo de cuenta, y preguntarlo hace
// dudar de si se está rellenando bien.
const SIN_TIPO = ['nequi', 'daviplata', 'movii', 'rappipay', 'yape', 'plin', 'lulo',
  'nu ', 'tigo money', 'mercado pago', 'uala', 'ualá', 'naranja', 'yappy', 'sinpe',
  'pago movil', 'pago móvil', 'deuna', 'tenpo', 'prex', 'zelle', 'pix', 'revolut',
  'n26', 'mi dinero', 'klar', 'spin', 'brubank', 'movii']

const sinAcentos = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// El mismo producto, con el nombre de cada sitio. Cada fila es una familia:
// basta con reconocer una palabra de la fila para encontrar la equivalente en
// la lista del país de destino.
const FAMILIAS = [
  ['vista'],                                             // solo Chile
  ['ahorro', 'poupanc', 'saving'],
  ['corriente', 'corrente', 'checking', 'chequing', 'cheque'],
]

/** Los tipos que hay que ofrecer. Vacío = este destino no tiene tipo de cuenta. */
export function tiposDeCuenta(pais, nombreBanco) {
  const banco = sinAcentos(nombreBanco)
  if (banco && SIN_TIPO.some(w => banco.includes(sinAcentos(w)))) return []
  return TIPOS_POR_PAIS[pais] || ['Ahorros', 'Corriente']
}

/**
 * Encaja en la lista del país lo que se entendió de un texto pegado.
 *
 * El lector de datos devuelve el tipo en genérico —"Ahorros", "Corriente",
 * "Vista"— porque es lo que se puede deducir de un mensaje de WhatsApp. Aquí
 * se traduce al nombre exacto del país: "Corriente" pegado sobre un envío a
 * Chile tiene que acabar siendo "Cuenta Corriente".
 */
export function normalizaTipo(pais, texto, nombreBanco) {
  const lista = tiposDeCuenta(pais, nombreBanco)
  if (!texto || !lista.length) return ''

  const t = sinAcentos(texto)
  const exacto = lista.find(o => sinAcentos(o) === t)
  if (exacto) return exacto

  // Por familia, no por la palabra exacta: lo que en Colombia es "Ahorros" en
  // Brasil se llama "Poupança" y en Estados Unidos "Savings". Sin esto, pegar
  // los datos de un brasileño no marcaba nada.
  const familia = FAMILIAS.find(f => f.some(r => t.includes(r)))
  if (!familia) return ''

  // Dentro de la lista del país y en su orden: "cheque" vale tanto para la
  // "cuenta de cheques" mexicana como para la "chequera electrónica" chilena,
  // y en Chile la corriente va primero porque es la que se usa.
  return lista.find(o => familia.some(r => sinAcentos(o).includes(r))) || ''
}
