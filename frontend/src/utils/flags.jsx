import { useState } from 'react'

export const COUNTRY_CODE = {
  'Venezuela': 've', 'Colombia': 'co', 'Argentina': 'ar', 'Perú': 'pe',
  'Peru': 'pe', 'Chile': 'cl', 'Ecuador': 'ec', 'Bolivia': 'bo',
  'Paraguay': 'py', 'Uruguay': 'uy', 'México': 'mx', 'Mexico': 'mx',
  'Brasil': 'br', 'Brazil': 'br', 'Panamá': 'pa', 'Panama': 'pa',
  'Costa Rica': 'cr', 'Guatemala': 'gt', 'Honduras': 'hn',
  'Nicaragua': 'ni', 'El Salvador': 'sv', 'Cuba': 'cu',
  'República Dominicana': 'do', 'Estados Unidos': 'us', 'España': 'es',
  // Faltaban: están en la tabla de países y se quedaban sin bandera en las
  // pantallas que solo tienen el nombre y no el iso2.
  'Canadá': 'ca', 'Canada': 'ca', 'China': 'cn', 'Japón': 'jp', 'Japon': 'jp',
  'Reino Unido': 'gb',
}

export function flagUrl(country) {
  const code = COUNTRY_CODE[country]
  return code ? `https://flagcdn.com/20x15/${code}.png` : null
}

// Bandera a partir del código ISO de dos letras.
//
// No usa `onError` para esconderse. Ese era el fallo: mientras la lista de
// países aún carga, `iso2` llega vacío, la URL da 404 y el manejador ponía
// display:none directamente sobre el nodo. Cuando después llegaba el código
// bueno, React actualizaba el `src` pero no ese estilo puesto a mano, así que
// la bandera quedaba oculta para siempre — y le tocaba justo a la primera
// moneda de la lista, que es la que se pinta antes de tener datos.
//
// Aquí no se pinta nada hasta que hay código, y un fallo de carga se recuerda
// por código, de modo que otro país no hereda el error del anterior.
export function Bandera({ iso2, ancho = 22, alto = 15, style = {}, className = '' }) {
  const [rotas, setRotas] = useState(() => new Set())
  const code = (iso2 || '').trim().toLowerCase()

  if (!code || rotas.has(code)) {
    // Hueco del mismo tamaño: sin esto la fila da un salto al cargar.
    return <span style={{ width: ancho, height: alto, flexShrink: 0, display: 'inline-block', ...style }} className={className} />
  }

  return (
    <img
      src={`https://flagcdn.com/40x30/${code}.png`}
      alt=""
      className={className}
      style={{ width: ancho, height: alto, borderRadius: 3, objectFit: 'cover', flexShrink: 0, ...style }}
      onError={() => setRotas(prev => new Set(prev).add(code))}
    />
  )
}

export function CountryFlag({ country, size = 'sm' }) {
  const url = flagUrl(country)
  if (!url) return null
  const cls = size === 'sm'
    ? 'w-5 h-[14px] rounded-sm object-cover shrink-0'
    : 'w-4 h-[11px] rounded-sm object-cover shrink-0'
  return <img src={url} alt="" className={cls} />
}

export function CountryWithFlag({ country, className = '' }) {
  const url = flagUrl(country)
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {url && <img src={url} alt="" className="w-4 h-[11px] rounded-sm object-cover shrink-0" />}
      <span>{country}</span>
    </span>
  )
}
