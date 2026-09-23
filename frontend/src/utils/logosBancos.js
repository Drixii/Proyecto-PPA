// El logo de cada banco.
//
// En la lista de bancos salía un planeta 🌍 para todos: es el icono que pinta
// el selector cuando una opción no trae bandera, y los bancos no traen
// ninguna. Elegir banco en una lista de veinte líneas iguales se hace leyendo
// palabra por palabra.
//
// Los archivos están servidos por nosotros, en `/bancos/`. Se podrían pedir a
// un servicio de iconos al vuelo, pero eso contaría a un tercero a qué banco
// va cada transferencia, y dejaría la lista sin logos en la aplicación
// instalada cuando no hay conexión.
//
// El dominio es la clave con la que se descargaron (ver
// `scripts/bajarLogosBancos.mjs`). Si el super-admin añade un banco que no
// está aquí, no pasa nada: sale su monograma con el color de la marca.
import ARCHIVOS from './logosBancosArchivos.json'

const DOMINIOS = {
  // Venezuela
  'banco de venezuela': 'bancodevenezuela.com',
  'venezolano de credito': 'venezolano.com',
  'mercantil': 'mercantilbanco.com',
  'provincial': 'provincial.com',
  'bancaribe': 'bancaribe.com.ve',
  'exterior': 'bancoexterior.com',
  'banco occidental de descuento': 'bod.com.ve',
  'banco caroni': 'bancaroni.com',
  'banesco': 'banesco.com',
  'sofitasa': 'sofitasa.com',
  'banco plaza': 'bancoplaza.com',
  'bfc banco fondo comun': 'bfc.com.ve',
  '100% banco': '100x100banco.com',
  'delsur': 'delsur.com.ve',
  'banco del tesoro': 'bt.gob.ve',
  'banco agricola de venezuela': 'bav.com.ve',
  'bancrecer': 'bancrecer.com.ve',
  'mi banco': 'mibanco.com.ve',
  'banco activo': 'bancoactivo.com',
  'bancamiga': 'bancamiga.com',
  'banplus': 'banplus.com',
  'banco bicentenario': 'bicentenariobu.com',
  'banfanb': 'banfanb.com.ve',
  'bnc nacional de credito': 'bnc.com.ve',

  // Colombia
  'bancolombia': 'bancolombia.com',
  'banco de bogota': 'bancodebogota.com',
  'davivienda': 'davivienda.com',
  'bbva colombia': 'bbva.com.co',
  'banco de occidente': 'bancodeoccidente.com.co',
  'banco popular': 'bancopopular.com.co',
  'banco caja social': 'bancocajasocial.com',
  'banco agrario': 'bancoagrario.com.co',
  'banco av villas': 'avvillas.com.co',
  'itau': 'itau.co',
  'scotiabank colpatria': 'scotiabankcolpatria.com',
  'banco pichincha': 'bancopichincha.com.co',
  'bancoomeva': 'bancoomeva.com.co',
  'banco serfinanza': 'bancoserfinanza.com',
  'nequi': 'nequi.com.co',
  'daviplata': 'daviplata.com',
  'lulo bank': 'lulobank.com',
  'nu colombia': 'nu.com.co',
  'movii': 'movii.com.co',
  'rappipay': 'rappipay.com.co',
  'banco w': 'bancow.com.co',
  'bancamia': 'bancamia.com.co',
  'coltefinanciera': 'coltefinanciera.com.co',

  // Chile
  'banco estado': 'bancoestado.cl',
  'banco de chile': 'bancochile.cl',
  'banco santander': 'santander.es',
  'bci': 'bci.com',
  'scotiabank chile': 'scotiabank.com.pe',
  'itau chile': 'itau.cl',
  'banco falabella': 'bancofalabella.cl',
  'banco security': 'security.cl',
  'banco bice': 'bice.cl',
  'banco consorcio': 'consorcio.cl',
  'banco internacional': 'bancointernacional.cl',
  'banco ripley': 'bancoripley.cl',
  'coopeuch': 'coopeuch.cl',
  'tenpo': 'tenpo.cl',
  'banco btg pactual': 'btgpactual.cl',

  // Bolivia
  'banco ganadero': 'bg.com.bo',
  'banco nacional de bolivia': 'bnb.com.bo',
  'banco mercantil santa cruz': 'bmsc.com.bo',
  'banco union': 'bancounion.com.bo',
  'banco bisa': 'bancobisa.com',
  'banco economico': 'baneco.com.bo',
  'banco sol': 'bancosol.com.bo',
  'banco fassil': 'fassil.com.bo',
  'banco fortaleza': 'bancofortaleza.com.bo',
  'banco fie': 'bancofie.com.bo',
  'banco prodem': 'prodem.com.bo',

  // Perú
  'bcp banco de credito': 'viabcp.com',
  'interbank': 'interbank.pe',
  'bbva peru': 'bbva.pe',
  'scotiabank peru': 'scotiabank.com.pe',
  'banco de la nacion': 'bn.com.pe',
  'banbif': 'banbif.com.pe',
  'mibanco': 'mibanco.com.pe',
  'yape': 'yape.com.pe',

  // Ecuador
  'produbanco': 'produbanco.com.ec',
  'banco guayaquil': 'bancoguayaquil.com',
  'banco del pacifico': 'bancodelpacifico.com',
  'banco bolivariano': 'bolivariano.com',
  'banco machala': 'bancomachala.com',
  'deuna': 'deuna.app',

  // Brasil
  'banco do brasil': 'bb.com.br',
  'itau unibanco': 'itau.com.br',
  'bradesco': 'bradesco.com.br',
  'caixa economica federal': 'caixa.gov.br',
  'santander brasil': 'santander.com.br',
  'nubank': 'nubank.com.br',
  'inter': 'bancointer.com.br',
  'c6 bank': 'c6bank.com.br',
  'picpay': 'picpay.com',
  'pix': 'bcb.gov.br',

  // México
  'bbva mexico': 'bbva.mx',
  'banorte': 'banorte.com',
  'santander mexico': 'santander.com.mx',
  'banamex': 'banamex.com',
  'hsbc mexico': 'hsbc.com.mx',
  'scotiabank mexico': 'scotiabank.com.mx',
  'banco azteca': 'bancoazteca.com.mx',
  'inbursa': 'inbursa.com',
  'nu mexico': 'nu.com.mx',
  'klar': 'klar.mx',
  'spin by oxxo': 'spinbyoxxo.com.mx',

  // Argentina
  'banco nacion': 'bna.com.ar',
  'banco provincia': 'bancoprovincia.com.ar',
  'banco galicia': 'bancogalicia.com',
  'santander argentina': 'santander.com.ar',
  'bbva argentina': 'bbva.com.ar',
  'banco macro': 'macro.com.ar',
  'brubank': 'brubank.com',
  'banco ciudad': 'bancociudad.com.ar',
  'uala': 'uala.com.ar',
  'naranja x': 'naranjax.com',

  // República Dominicana
  'banreservas': 'banreservas.com',
  'banco popular dominicano': 'popularenlinea.com',
  'bhd': 'bhd.com.do',
  'scotiabank rd': 'scotiabank.com.pe',
  'banco santa cruz': 'bancosantacruz.com.do',
  'banco caribe': 'bancocaribe.com.do',
  'banco promerica': 'promerica.com.do',

  // Panamá
  'banco general': 'bgeneral.com',
  'banistmo': 'banistmo.com',
  'banco nacional de panama': 'banconal.com.pa',
  'global bank': 'globalbank.com.pa',
  'multibank': 'multibank.com.pa',
  'bac panama': 'baccredomatic.com',
  'yappy': 'yappy.com.pa',

  // Costa Rica
  'banco nacional': 'bncr.fi.cr',
  'banco de costa rica': 'bancobcr.com',
  'bac credomatic': 'baccredomatic.com',
  'davivienda costa rica': 'davivienda.cr',
  'sinpe movil': 'bccr.fi.cr',

  // Paraguay
  'banco itau paraguay': 'itau.com.py',
  'banco continental': 'bancontinental.com.py',
  'banco familiar': 'familiar.com.py',
  'banco atlas': 'atlas.com.py',
  'ueno bank': 'ueno.com.py',
  'tigo money': 'tigo.com.py',

  // Uruguay
  'brou': 'brou.com.uy',
  'itau uruguay': 'itau.com.br',
  'santander uruguay': 'santander.com.uy',
  'scotiabank uruguay': 'scotiabank.com.uy',
  'bbva uruguay': 'bbva.com.uy',
  'prex': 'prexcard.com',
  'mi dinero': 'midinero.com.uy',

  // Estados Unidos
  'bank of america': 'bankofamerica.com',
  'chase': 'chase.com',
  'wells fargo': 'wellsfargo.com',
  'citibank': 'citi.com',
  'zelle': 'zellepay.com',
  'capital one': 'capitalone.com',
  'pnc bank': 'pnc.com',
  'us bank': 'usbank.com',
  'td bank': 'td.com',

  // España
  'santander': 'santander.es',
  'bbva': 'bbva.es',
  'caixabank': 'caixabank.es',
  'sabadell': 'bancsabadell.com',
  'bankinter': 'bankinter.com',
  'ing espana': 'ing.es',
  'unicaja': 'unicajabanco.es',
  'revolut': 'revolut.com',
  'n26': 'n26.com',

  // Canadá
  'rbc royal bank': 'rbcroyalbank.com',
  'td canada trust': 'td.com',
  'scotiabank': 'scotiabank.com.pe',
  'bmo': 'bmo.com',
  'cibc': 'cibc.com',
  'desjardins': 'desjardins.com',
  'tangerine': 'tangerine.ca',

  // Presentes en varios países con el mismo logo
  'mercado pago': 'mercadopago.com',
  'banco pichincha ec': 'pichincha.com',
}

export const clave = t => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9% ]/g, ' ').replace(/\s+/g, ' ').trim()

/** El archivo del logo, o null si ese banco no tiene uno guardado. */
export function logoDeBanco(nombre) {
  const k = clave(nombre)
  if (!k) return null

  const dominio = DOMINIOS[k]
    // Sin coincidencia exacta: por nombre contenido, que cubre "Banco
    // Bancolombia" o "Bancolombia S.A." tal como los escriba el admin.
    || Object.entries(DOMINIOS).find(([n]) => n.length >= 4 && (k.includes(n) || n.includes(k)))?.[1]

  // Solo los que se llegaron a bajar: pedir uno que no existe deja un hueco y
  // un 404 en el registro por cada banco de la lista.
  const archivo = dominio && ARCHIVOS[dominio]
  return archivo ? `/bancos/${archivo}` : null
}

/** Las iniciales, para cuando no hay logo. Nunca más de dos letras. */
export function inicialesDeBanco(nombre) {
  const palabras = clave(nombre)
    .replace(/\b(banco|bank|bco|de|del|la|el|s a|sa)\b/g, ' ')
    .split(' ').filter(Boolean)
  if (!palabras.length) return '?'
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (palabras[0][0] + palabras[1][0]).toUpperCase()
}
