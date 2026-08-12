"""Siembra inicial de países.

Los valores reproducen exactamente lo que estaba fijo en el código antes de
que esta lista fuera editable: los países salían de un diccionario en
routers/rates.py y el frontend los filtraba con dos arrays repetidos en tres
archivos (ALLOWED_RECV_CURRENCIES y SEND_CURRENCIES). Al arrancar con estos
datos, nadie nota el cambio salvo que ahora se pueden editar.
"""
from sqlalchemy.orm import Session

from models.country import Country

# (nombre, moneda, iso2, puede_enviar, puede_recibir)
DEFAULT_COUNTRIES = [
    ("Chile",                "CLP", "cl", True,  True),
    ("Colombia",             "COP", "co", True,  True),
    ("Estados Unidos",       "USD", "us", True,  True),
    ("España",               "EUR", "es", True,  True),
    ("Perú",                 "PEN", "pe", True,  True),
    ("Brasil",               "BRL", "br", True,  True),
    ("México",               "MXN", "mx", True,  True),
    ("Argentina",            "ARS", "ar", True,  True),
    ("Canadá",               "CAD", "ca", True,  True),
    ("Venezuela",            "VES", "ve", False, True),
    # Ecuador y Panamá usan el dólar: reciben, pero no se ofrecen como origen
    # para que el desplegable de "envías desde" no muestre USD tres veces.
    ("Ecuador",              "USD", "ec", False, True),
    ("Panamá",               "USD", "pa", False, True),
    # Inactivos para envío y recepción, pero listados: activarlos es marcar
    # una casilla en Ajustes.
    ("Bolivia",              "BOB", "bo", False, False),
    ("Paraguay",             "PYG", "py", False, False),
    ("Uruguay",              "UYU", "uy", False, False),
    ("Costa Rica",           "CRC", "cr", False, False),
    ("República Dominicana", "DOP", "do", False, False),
    ("Guatemala",            "GTQ", "gt", False, False),
    ("Reino Unido",          "GBP", "gb", False, False),
    ("China",                "CNY", "cn", False, False),
    ("Japón",                "JPY", "jp", False, False),
]


def seed_countries_if_empty(db: Session) -> int:
    """Crea la lista por defecto solo si la tabla está vacía.

    Se ejecuta en cada arranque, así que la condición importa: sin ella un
    reinicio revertiría los países que el admin haya quitado.
    """
    if db.query(Country).first():
        return 0
    for name, currency, iso2, can_send, can_receive in DEFAULT_COUNTRIES:
        db.add(Country(
            name=name, currency=currency, iso2=iso2,
            can_send=can_send, can_receive=can_receive, active=True,
        ))
    db.commit()
    return len(DEFAULT_COUNTRIES)
