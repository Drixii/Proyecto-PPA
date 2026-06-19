COUNTRY_TZ = {
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


def country_to_tz(country: str) -> str:
    return COUNTRY_TZ.get(country or '', 'America/Santiago')
