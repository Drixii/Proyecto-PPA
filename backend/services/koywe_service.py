"""Credenciales de Koywe (cobros en Chile: Khipu y transferencia).

Solo el almacén de credenciales. El flujo de cobro se construye cuando lleguen
las claves de sandbox y se pueda probar de verdad contra su API — escribirlo a
ciegas contra una documentación leída sería código que nadie ha visto
funcionar.

Koywe reparte cinco datos distintos y los emite su soporte a mano tras el KYB;
no se generan desde un panel como los de Stripe.
"""
import os

from database import SessionLocal
# El modo (prueba/real) es uno solo para toda la plataforma, compartido con
# Stripe. La clave con la que se guarda se llama "stripe_mode" por historia:
# existía antes de que hubiera un segundo proveedor.
from services.stripe_service import get_mode

CLAVE_API = "koywe_api_key"
CLAVE_SECRET = "koywe_secret"
CLAVE_ORG = "koywe_org_id"
CLAVE_MERCHANT = "koywe_merchant_id"
CLAVE_WEBHOOK = "koywe_webhook_secret"

CAMPOS = (CLAVE_API, CLAVE_SECRET, CLAVE_ORG, CLAVE_MERCHANT, CLAVE_WEBHOOK)

# Monedas que se cobran por Koywe. Es el hueco que deja Stripe, cuya cuenta
# solo liquida dólares y euros.
KOYWE_CURRENCIES = ("CLP",)

URLS = {
    "test": "https://api-sandbox.koywe.com",
    "live": "https://api.koywe.com",
}


def clave_de(nombre: str, modo: str | None = None) -> str:
    return f"{nombre}_{modo or get_mode()}"


def base_url(modo: str | None = None) -> str:
    return URLS[modo or get_mode()]


def _config(nombre: str, modo: str | None = None) -> str:
    from services.secret_store import get_secret
    db = SessionLocal()
    try:
        valor = get_secret(db, clave_de(nombre, modo))
    except Exception as e:
        print(f"[koywe] no se pudo leer '{nombre}': {e}")
        valor = None
    finally:
        db.close()
    if not valor:
        valor = os.environ.get(nombre.upper(), "")
    return (valor or "").strip()


def credenciales(modo: str | None = None) -> dict:
    return {c: _config(c, modo) for c in CAMPOS}


def is_configured(modo: str | None = None) -> bool:
    """Listo para cobrar.

    Exige también el secreto del webhook: sin él llega el aviso de pago pero
    no se puede verificar su firma, así que la orden nunca avanzaría y el
    cliente habría pagado para nada. Mismo criterio que con Stripe.
    """
    creds = credenciales(modo)
    return all(creds[c] for c in CAMPOS)
