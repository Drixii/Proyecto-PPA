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
  const sendCurrencies = []
  const vistas = new Set()
  for (const c of countries) {
    if (!c.can_send || vistas.has(c.currency)) continue
    vistas.add(c.currency)
    sendCurrencies.push({
      code: c.currency,
      iso2: c.iso2,
      name: CURRENCY_NAMES[c.currency] || c.country,
    })
  }

  const receiveCountries = countries.filter(c => c.can_receive)

  return { countries, sendCurrencies, receiveCountries, isLoading }
}
