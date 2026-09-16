import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

// Nombres bonitos para las monedas que ya existían. Si aparece una nueva, se
// usa el nombre del país — así un país añadido desde Ajustes funciona sin
// tocar código.
const CURRENCY_NAMES = {
  CLP: 'Peso Chileno', COP: 'Peso Colombiano', USD: 'Dólar',
  EUR: 'Euro', PEN: 'Sol Peruano', BRL: 'Real Brasileño',
  MXN: 'Peso Mexicano', ARS: 'Peso Argentino', CAD: 'Dólar Canadiense',
  VES: 'Bolívar', BOB: 'Boliviano', PYG: 'Guaraní', UYU: 'Peso Uruguayo',
}

// Países que comparten divisa: el nombre a secas ("Dólar") no distingue tres
// filas iguales en la lista, así que se les pone gentilicio.
const DIVISA_POR_PAIS = {
  'Estados Unidos': 'Dólar estadounidense',
  Ecuador: 'Dólar ecuatoriano',
  'Panamá': 'Dólar panameño',
}

const nombreDivisa = (c) =>
  DIVISA_POR_PAIS[c.country] || CURRENCY_NAMES[c.currency] || c.country

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

  // Origen: una entrada por PAÍS, no por moneda.
  //
  // Antes se agrupaba por divisa, así que Ecuador, Estados Unidos y Panamá
  // caían en una sola fila "USD" — con la bandera del primero por orden
  // alfabético, que es Ecuador. Y como cada uno puede tener su propia comisión
  // desde que las reglas son por país, agruparlos impedía cotizar bien: el
  // cliente elegía "USD" y no había forma de saber desde cuál de los tres.
  const sendCountries = countries.filter(c => c.can_send).map(c => ({
    country: c.country,
    code: c.currency,
    iso2: c.iso2,
    name: nombreDivisa(c),
  }))

  const receiveCountries = countries.filter(c => c.can_receive)

  return { countries, sendCountries, receiveCountries, isLoading }
}
