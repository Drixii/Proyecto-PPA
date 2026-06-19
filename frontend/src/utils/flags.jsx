export const COUNTRY_CODE = {
  'Venezuela': 've', 'Colombia': 'co', 'Argentina': 'ar', 'Perú': 'pe',
  'Peru': 'pe', 'Chile': 'cl', 'Ecuador': 'ec', 'Bolivia': 'bo',
  'Paraguay': 'py', 'Uruguay': 'uy', 'México': 'mx', 'Mexico': 'mx',
  'Brasil': 'br', 'Brazil': 'br', 'Panamá': 'pa', 'Panama': 'pa',
  'Costa Rica': 'cr', 'Guatemala': 'gt', 'Honduras': 'hn',
  'Nicaragua': 'ni', 'El Salvador': 'sv', 'Cuba': 'cu',
  'República Dominicana': 'do', 'Estados Unidos': 'us', 'España': 'es',
}

export function flagUrl(country) {
  const code = COUNTRY_CODE[country]
  return code ? `https://flagcdn.com/20x15/${code}.png` : null
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
