// Catálogo de países del mundo para añadirlos desde Ajustes → Países.
//
// Solo se guarda el código ISO de dos letras y su moneda; el nombre en español
// lo da el propio navegador (Intl.DisplayNames), así no hay que mantener una
// lista de doscientos nombres a mano ni se cuelan erratas.

const MONEDAS = 'AD:EUR AE:AED AF:AFN AG:XCD AL:ALL AM:AMD AO:AOA AR:ARS AT:EUR AU:AUD AW:AWG AZ:AZN BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BM:BMD BN:BND BO:BOB BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:ANG CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GH:GHS GM:GMD GN:GNF GQ:XAF GR:EUR GT:GTQ GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IN:INR IQ:IQD IR:IRR IS:ISK IT:EUR JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KM:KMF KN:XCD KR:KRW KW:KWD KY:KYD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MG:MGA MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MR:MRU MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NE:XOF NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NZ:NZD OM:OMR PA:USD PE:PEN PG:PGK PH:PHP PK:PKR PL:PLN PR:USD PT:EUR PY:PYG QA:QAR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SI:EUR SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SY:SYP SZ:SZL TD:XAF TG:XOF TH:THB TJ:TJS TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VC:XCD VE:VES VN:VND VU:VUV WS:WST YE:YER ZA:ZAR ZM:ZMW ZW:ZWL'

let cache = null

export function paisesDelMundo() {
  if (cache) return cache
  let nombres = null
  try { nombres = new Intl.DisplayNames(['es'], { type: 'region' }) } catch { /* navegador muy viejo */ }
  cache = MONEDAS.split(' ').map(par => {
    const [iso, moneda] = par.split(':')
    return { iso2: iso.toLowerCase(), nombre: nombres?.of(iso) || iso, moneda }
  })
  // Europa como zona del euro, igual que ya existe en la plataforma.
  cache.push({ iso2: 'eu', nombre: 'Europa (euro)', moneda: 'EUR', guardarComo: 'EURO' })
  cache.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return cache
}

// Quita tildes y mayúsculas para comparar «Perú» con «peru».
export const normaliza = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
