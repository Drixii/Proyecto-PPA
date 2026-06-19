export const COUNTRY_TZ = {
  'Chile': 'America/Santiago',
  'Venezuela': 'America/Caracas',
  'Colombia': 'America/Bogota',
  'Bolivia': 'America/La_Paz',
  'Perú': 'America/Lima',
  'Peru': 'America/Lima',
  'Argentina': 'America/Argentina/Buenos_Aires',
  'Paraguay': 'America/Asuncion',
  'Uruguay': 'America/Montevideo',
  'Ecuador': 'America/Guayaquil',
  'Panamá': 'America/Panama',
  'Panama': 'America/Panama',
  'México': 'America/Mexico_City',
  'Mexico': 'America/Mexico_City',
  'Brasil': 'America/Sao_Paulo',
  'Brazil': 'America/Sao_Paulo',
  'Cuba': 'America/Havana',
  'España': 'Europe/Madrid',
  'Estados Unidos': 'America/New_York',
  'Costa Rica': 'America/Costa_Rica',
  'Guatemala': 'America/Guatemala',
  'Honduras': 'America/Tegucigalpa',
  'Nicaragua': 'America/Managua',
  'El Salvador': 'America/El_Salvador',
  'República Dominicana': 'America/Santo_Domingo',
}

export function countryToTz(country) {
  return COUNTRY_TZ[country] || 'America/Santiago'
}

// Get IANA timezone for a user object.
// Sub-admins: derive from first managed_country (most reliable, handles legacy accounts).
// Others: use stored timezone, then country fallback.
export function userTz(user) {
  if (user?.managed_countries?.length > 0) return countryToTz(user.managed_countries[0])
  if (user?.timezone) return user.timezone
  return countryToTz(user?.country) || 'America/Santiago'
}

// SQLite stores naive datetimes (no Z suffix). Append Z so JS treats as UTC.
function toUtcDate(isoStr) {
  if (!isoStr) return null
  const hasOffset = isoStr.endsWith('Z') || /[+\-]\d{2}:?\d{2}$/.test(isoStr)
  const d = new Date(hasOffset ? isoStr : isoStr + 'Z')
  return isNaN(d.getTime()) ? null : d
}

export function fmtDate(isoStr, tz = 'America/Santiago', opts = {}) {
  const d = toUtcDate(isoStr)
  if (!d) return '—'
  return d.toLocaleString('es-CL', { timeZone: tz, ...opts })
}

export function fmtDateShort(isoStr, tz = 'America/Santiago') {
  return fmtDate(isoStr, tz, { dateStyle: 'medium', timeStyle: 'short' })
}

export function fmtDateMini(isoStr, tz = 'America/Santiago') {
  return fmtDate(isoStr, tz, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtDateOnly(isoStr, tz = 'America/Santiago') {
  return fmtDate(isoStr, tz, { dateStyle: 'medium' })
}
