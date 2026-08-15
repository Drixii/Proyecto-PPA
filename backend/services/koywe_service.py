"""Koywe: cobro con métodos locales de cada país (PAYIN).

Cómo funciona
-------------
Koywe no da una cuenta bancaria a la que el cliente transfiere a ciegas. Se
crea una orden PAYIN y ellos devuelven una URL de checkout (`providedAction`);
el cliente paga ahí con el método de su país (Khipu en Chile, PIX en Brasil,
PSE en Colombia...) y Koywe avisa por webhook cuando el dinero entró.

Por qué esto SÍ puede aprobar la orden solo, y Global66 no
----------------------------------------------------------
Son las dos diferencias que importan:

1. **La orden lleva nuestro identificador.** Al crearla se manda `externalId`
   con el número de orden, y el webhook lo devuelve. No hay que adivinar de
   quién es el dinero cruzando monto y nombre como en Global66.
2. **El aviso va firmado.** `Koywe-Signature` es el HMAC-SHA256 del cuerpo
   exacto con el secreto del endpoint. Falsificarlo exige el secreto Y
   recalcular la firma sobre el cuerpo, igual que en Stripe. Global66 solo
   manda una clave fija, que quien la tenga puede reusar con el cuerpo que
   quiera.

Además reintentan ante 5xx, 429 y errores de red, así que un fallo nuestro no
pierde el aviso.

Dónde cae el dinero
-------------------
Cada merchant tiene una cuenta virtual por moneda, creadas solas. Un cobro en
CLP suma al saldo CLP, uno en BRL al saldo BRL: no se mezclan ni se convierten
sin pedirlo. Sacarlo a una cuenta bancaria real de ese país es aparte
(`POST .../withdrawals` contra una cuenta externa registrada), y se hace desde
su panel — aquí no se mueve saldo.
"""
import hashlib
import hmac
import json
import logging
import os
import time

import httpx

from database import SessionLocal
# El modo (prueba/real) es uno solo para toda la plataforma, compartido con
# Stripe. La clave con la que se guarda se llama "stripe_mode" por historia:
# existía antes de que hubiera un segundo proveedor.
from services.stripe_service import get_mode

log = logging.getLogger("ppa")

CLAVE_API = "koywe_api_key"
CLAVE_SECRET = "koywe_secret"
CLAVE_ORG = "koywe_org_id"
CLAVE_MERCHANT = "koywe_merchant_id"
CLAVE_WEBHOOK = "koywe_webhook_secret"

CAMPOS = (CLAVE_API, CLAVE_SECRET, CLAVE_ORG, CLAVE_MERCHANT, CLAVE_WEBHOOK)

URLS = {
    "test": "https://api-sandbox.koywe.com",
    "live": "https://api.koywe.com",
}

# Métodos de cobro por moneda. La moneda decide el país: nadie paga en pesos
# chilenos desde un banco brasileño.
#
# `codigo` es lo que espera su API en `paymentMethods[].method`; el resto es
# para pintar el selector sin tener que llamarles.
#
# Falta Argentina a propósito: su documentación dice "métodos locales" sin
# nombrar ninguno ni dar código. Ofrecer ARS aquí sería mandar al cliente a un
# checkout que puede no tener con qué pagar.
#
# Estados Unidos, Bolivia y Venezuela no tienen PAYIN en Koywe — solo PAYOUT.
# Los cobros en USD siguen siendo cosa de Stripe o de transferencia manual.
METODOS = {
    "CLP": ("CL", [
        {"codigo": "KHIPU", "nombre": "Khipu", "desc": "Transferencia desde tu banco"},
    ]),
    "COP": ("CO", [
        {"codigo": "PSE", "nombre": "PSE", "desc": "Débito desde tu banco"},
        {"codigo": "NEQUI", "nombre": "Nequi", "desc": "Pago instantáneo"},
    ]),
    "BRL": ("BR", [
        {"codigo": "PIX_STATIC", "nombre": "PIX", "desc": "Instantáneo, 24/7"},
    ]),
    "MXN": ("MX", [
        {"codigo": "SPEI", "nombre": "SPEI", "desc": "Transferencia instantánea"},
        {"codigo": "CARD", "nombre": "Tarjeta", "desc": "Crédito o débito"},
    ]),
    "PEN": ("PE", [
        {"codigo": "QRI", "nombre": "QRI", "desc": "Pago con QR"},
    ]),
}

KOYWE_CURRENCIES = tuple(METODOS.keys())

# Los códigos tal y como se guardan en `orders.payment_method`, en minúscula.
# Sirve para distinguir una orden de Koywe de una de tarjeta o de una
# transferencia con comprobante, que tienen ciclos de vida distintos.
CODIGOS = {m["codigo"].lower() for _, ms in METODOS.values() for m in ms}

# Estados en los que el dinero ya es nuestro. PAID es "pago confirmado" y
# COMPLETED "fondos liquidados"; a efectos del cliente ambos significan que
# pagó y la orden puede avanzar.
ESTADOS_PAGADOS = ("PAID", "COMPLETED")

# El token dura ~1h según su documentación. Se renueva antes para no jugarse
# un cobro a que caduque a mitad de la petición.
VIDA_TOKEN = 45 * 60

TIMEOUT = 20.0


class KoyweError(Exception):
    """Algo falló hablando con Koywe. El router lo convierte en 400."""


class KoyweNotConfigured(KoyweError):
    pass


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
        log.warning("[koywe] no se pudo leer '%s': %s", nombre, e)
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


def metodos_de(moneda: str | None) -> list:
    """Métodos disponibles para esa moneda. Vacío si Koywe no la cubre."""
    if not is_configured():
        return []
    _, ms = METODOS.get((moneda or "").upper(), (None, []))
    return list(ms)


def es_metodo(payment_method: str | None) -> bool:
    return (payment_method or "").strip().lower() in CODIGOS


def _metodo_valido(moneda: str, codigo: str) -> dict | None:
    for m in metodos_de(moneda):
        if m["codigo"].lower() == (codigo or "").lower():
            return m
    return None


# ── Cliente de la API ────────────────────────────────────────────────────────

# El token se guarda en memoria del proceso, no en la base: es de usar y tirar
# y el backend corre con --workers 1, así que hay un único proceso que lo
# comparte. Si se reinicia, se pide otro y ya.
_token_cache: dict = {"token": None, "expira": 0.0, "modo": None}


def _token(modo: str | None = None) -> str:
    modo = modo or get_mode()
    ahora = time.time()
    if (_token_cache["token"] and _token_cache["modo"] == modo
            and _token_cache["expira"] > ahora):
        return _token_cache["token"]

    api_key = _config(CLAVE_API, modo)
    secret = _config(CLAVE_SECRET, modo)
    if not api_key or not secret:
        raise KoyweNotConfigured("Faltan la API key y el secreto de Koywe")

    datos = _pedir("POST", "/api/v1/auth/sign-in", modo=modo, autenticado=False,
                   json={"apiKey": api_key, "secret": secret})
    token = datos.get("token") or datos.get("accessToken")
    if not token:
        raise KoyweError("Koywe no devolvió token al iniciar sesión")

    _token_cache.update({"token": token, "expira": ahora + VIDA_TOKEN, "modo": modo})
    return token


def _pedir(metodo: str, ruta: str, modo: str | None = None, autenticado: bool = True, **kwargs):
    """Una llamada a su API. Devuelve el JSON o levanta KoyweError."""
    modo = modo or get_mode()
    url = base_url(modo).rstrip("/") + ruta
    cabeceras = dict(kwargs.pop("headers", {}))
    if autenticado:
        cabeceras["Authorization"] = f"Bearer {_token(modo)}"

    try:
        r = httpx.request(metodo, url, headers=cabeceras, timeout=TIMEOUT, **kwargs)
    except httpx.RequestError as e:
        raise KoyweError(f"no se pudo contactar con Koywe: {e}") from e

    if r.status_code == 401 and autenticado:
        # Token caducado antes de tiempo o credenciales cambiadas. Se tira la
        # caché para que el siguiente intento pida uno nuevo en vez de repetir
        # el mismo token muerto hasta que expire el temporizador.
        _token_cache.update({"token": None, "expira": 0.0})

    if r.status_code >= 400:
        # Su cuerpo de error trae el motivo real ("merchant not found",
        # "currency not enabled"...). Sin él, el admin solo vería un 400 pelado.
        raise KoyweError(f"Koywe respondió {r.status_code}: {r.text[:500]}")

    if not r.content:
        return {}
    try:
        return r.json()
    except ValueError as e:
        raise KoyweError(f"Koywe devolvió algo que no era JSON: {r.text[:300]}") from e


def _ids(modo: str | None = None) -> tuple[str, str]:
    org = _config(CLAVE_ORG, modo)
    merchant = _config(CLAVE_MERCHANT, modo)
    if not org or not merchant:
        raise KoyweNotConfigured("Faltan el id de organización o el de comercio de Koywe")
    return org, merchant


def probar_conexion(modo: str | None = None) -> dict:
    """Inicia sesión y consulta los métodos de una moneda. Solo lee.

    Existe para poder comprobar unas credenciales recién pegadas sin crear
    ninguna orden: si esto pasa, el cobro va a funcionar; si falla, dice
    exactamente en qué paso.
    """
    modo = modo or get_mode()
    _token(modo)                       # falla aquí si la key o el secreto están mal
    org, merchant = _ids(modo)

    salida = {"modo": modo, "base_url": base_url(modo), "org_id": org, "merchant_id": merchant}

    # Que el merchant exista y sea nuestro: es el error silencioso más probable
    # cuando la organización tiene más de uno.
    try:
        datos = _pedir("GET", f"/api/v1/organizations/{org}/merchants/{merchant}", modo=modo)
        salida["merchant_nombre"] = datos.get("name") or datos.get("legalName")
    except KoyweError as e:
        raise KoyweError(f"la sesión funciona pero el comercio no responde — {e}") from e

    monedas = {}
    for moneda, (pais, _) in METODOS.items():
        try:
            r = _pedir("GET", f"/api/v1/payment-method?countrySymbol={pais}&currencySymbol={moneda}", modo=modo)
            monedas[moneda] = [m.get("method") for m in (r or []) if isinstance(m, dict)]
        except KoyweError as e:
            monedas[moneda] = f"error: {e}"
    salida["metodos"] = monedas
    return salida


def crear_cobro(order, metodo: str, volver_a: str) -> dict:
    """Crea la orden PAYIN y devuelve a dónde mandar al cliente a pagar.

    No toca la orden nuestra: quien decide si está pagada es el webhook.
    """
    modo = get_mode()
    if not is_configured(modo):
        raise KoyweNotConfigured("Falta configurar las credenciales de Koywe")

    moneda = (order.currency_from or "").upper()
    elegido = _metodo_valido(moneda, metodo)
    if not elegido:
        raise KoyweError(f"«{metodo}» no es un método de pago válido para {moneda}")

    org, merchant = _ids(modo)

    # El externalId debe ser único por intento: si el cliente abandona el
    # checkout y vuelve a intentarlo, Koywe rechazaría uno repetido. El número
    # de orden va de prefijo para poder reconstruirla desde el webhook aunque
    # se pierda el id que guardamos.
    external_id = f"{order.order_number}-{int(time.time())}"

    cuerpo = {
        "type": "PAYIN",
        "originCurrencySymbol": moneda,
        # Misma moneda a la entrada y a la salida: el dinero se queda en la
        # cuenta virtual del país donde se pagó. Convertirlo es una operación
        # aparte y con su propia tasa, que no tiene por qué ser la que se le
        # prometió al cliente.
        "destinationCurrencySymbol": moneda,
        "amountIn": order.amount_sent,
        "description": f"Envío {order.order_number} a {order.receiver_name}",
        "externalId": external_id,
        "paymentMethods": [{"method": elegido["codigo"]}],
        "successUrl": volver_a,
        "failedUrl": volver_a,
    }

    datos = _pedir("POST", f"/api/v1/organizations/{org}/merchants/{merchant}/orders",
                   modo=modo, json=cuerpo)

    url = datos.get("providedAction")
    koywe_id = datos.get("id")
    if not url or not koywe_id:
        raise KoyweError(f"Koywe creó la orden pero sin URL de pago: {json.dumps(datos)[:300]}")

    log.info("[koywe] %s -> %s (%s %s por %s)",
             order.order_number, koywe_id, moneda, order.amount_sent, elegido["codigo"])
    return {"url": url, "koywe_order_id": koywe_id, "external_id": external_id,
            "metodo": elegido["nombre"]}


def consultar_orden(koywe_order_id: str) -> dict:
    """Estado de una orden según Koywe. Fuente de verdad si dudamos del webhook."""
    modo = get_mode()
    org, merchant = _ids(modo)
    return _pedir("GET", f"/api/v1/organizations/{org}/merchants/{merchant}/orders/{koywe_order_id}",
                  modo=modo)


# ── Webhook ──────────────────────────────────────────────────────────────────

def verificar_firma(cuerpo: bytes, firma: str | None, modo: str | None = None) -> bool:
    """HMAC-SHA256 del cuerpo exacto con el secreto del endpoint.

    Sobre los bytes tal y como llegaron, no sobre el JSON re-serializado: un
    espacio de más o un orden de claves distinto cambia el hash y tiraría
    avisos legítimos.
    """
    secreto = _config(CLAVE_WEBHOOK, modo)
    if not secreto or not firma:
        return False
    esperada = hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    # La cabecera puede venir como "sha256=abc..." según cómo la emitan.
    recibida = firma.strip().split("=")[-1].strip()
    return hmac.compare_digest(esperada, recibida)


def orden_de_externo(external_id: str | None) -> str | None:
    """Recupera nuestro número de orden del externalId («CC-2026-0011-1699…»).

    No vale con cortar por el último guion: el número de orden termina también
    en dígitos («CC-2026-0011» daría «CC-2026»). Lo que distingue al sufijo es
    que es un instante Unix, de diez cifras hoy y once a partir del año 2286;
    el correlativo de la orden tiene cuatro. Por eso se exige el largo.
    """
    if not external_id:
        return None
    base, _, sufijo = external_id.rpartition("-")
    if base and sufijo.isdigit() and len(sufijo) >= 10:
        return base
    return external_id
