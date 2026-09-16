import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

// Nombres bonitos para las monedas que ya existían. Si aparece una nueva, se
// usa el nombre del país — así un país añadido desde Ajustes funciona sin
// tocar código.
const CURRENCY_NAMES = {
  CLP: 'Peso Chileno', COP: 'Peso Colombiano', USD: 'Dólar Americano',
  EUR: 'Euro', PEN: 'Sol Peruano', BRL: 'Real Brasileño',
  MXN: 'Peso Mexicano', ARS: 'Peso Argentino', CAD: 'Dólar Canadiense',
  VES: 'Bolívar', BOB: 'Boliviano', PYG: 'Guaraní', UYU: 'Peso Uruguayo',
}

/**
 * Países disponibles, editables desde Ajustes → Países.
 *
 * Antes esta lista estaba repetida a mano en tres archivos (SEND_CURRENCIES y
 * ALLOWED_RECV_CURRENCIES), así que añadir un país obligaba a tocar el código
 * y desplegar, y era fácil que un archivo se quedara desincronizado.
 */
export function useCountries() {
  const { data: countries = [], isLoading } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/rates/countries').then(r => r.data.data),
    staleTime: 60000,
  })

  // Origen: una entrada por moneda. Varios países comparten divisa (USD lo
  // usan Estados Unidos, Ecuador y Panamá) y el desplegable de origen elige
  // moneda, no país: sin esto saldría "USD" tres veces.
  //
  // Cuál de los tres pone la bandera importa. Se tomaba el primero de la lista,
  // que viene ordenada por nombre, así que el dólar salía con la bandera de
  // Ecuador. Para las divisas compartidas se nombra el país de referencia.
  const PAIS_DE_LA_DIVISA = { USD: 'Estados Unidos', EUR: 'EURO' }

  const sendCurrencies = []
  const vistas = new Set()
  const envian = countries.filter(c => c.can_send)
  for (const c of envian) {
    if (vistas.has(c.currency)) continue
    vistas.add(c.currency)
    const referencia = envian.find(x => x.country === PAIS_DE_LA_DIVISA[c.currency]) || c
    sendCurrencies.push({
      code: c.currency,
      iso2: referencia.iso2,
      name: CURRENCY_NAMES[c.currency] || referencia.country,
    })
  }

  const receiveCountries = countries.filter(c => c.can_receive)

  return { countries, sendCurrencies, receiveCountries, isLoading }
}
