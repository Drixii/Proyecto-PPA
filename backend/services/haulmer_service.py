"""Haulmer (TUU Pago Online): cobro con tarjeta, en pesos chilenos.

Qué resuelve
------------
Recibir el dinero del cliente en una cuenta chilena, venga de donde venga. El
cliente paga con su tarjeta —también si es extranjera— y el cargo se hace en
CLP; a la cuenta llegan pesos.

Por eso, cuando la orden está en otra moneda, el monto se convierte a CLP con
la tasa del momento antes de abrir el cobro y se guarda en `haulmer_charges`.
El aviso posterior se compara contra ese número guardado: recalcularlo con la
tasa de después haría fallar la comprobación cualquier día que el mercado se
moviera.

Cómo se autentica
-----------------
No hay cabecera con una clave. Cada petición lleva `x_account_id` (el número
de cuenta del comercio) y `x_signature`: HMAC-SHA256, con el secreto del
comercio, sobre todos los campos que empiezan por `x_` ordenados
alfabéticamente y pegados como clave+valor, sin separadores. El aviso de
vuelta viene firmado igual, así que la firma sí se puede comprobar aquí —a
diferencia de Koywe, donde hay que preguntarle a su API.

Qué NO hace este módulo
-----------------------
Marcar órdenes como pagadas. Eso solo ocurre en el webhook, tras comprobar la
firma y que el monto coincide con el que se pidió cobrar.
"""
import hashlib
import hmac
import json
import logging
import os
import time

import httpx

from database import SessionLocal

log = logging.getLogger("ppa")

CLAVE_ACCOUNT = "haulmer_account_id"
CLAVE_SECRET = "haulmer_secret"

CAMPOS = (CLAVE_ACCOUNT, CLAVE_SECRET)

# El método tal como se guarda en `orders.payment_method` y viaja al navegador.
METODO = "haulmer"

# Lo único que admite su API hoy.
MONEDA = "CLP"

URLS = {
    "test": "https://frontend-api.payment.haulmer.dev/v1/payment",
    "live": "https://core.payment.haulmer.com/api/v1/payment",
}

MODOS = ("test", "live")

# Interruptor propio, como el de Koywe: el entorno de integración de Haulmer
# es otro dominio y otras credenciales, y atarlo al modo de Stripe obligaría a
# mover toda la plataforma para probar un cobro.
AJUSTE_MODO = "haulmer_mode"

# Nombre del comercio que ve el cliente en la pantalla de pago.
AJUSTE_COMERCIO = "haulmer_shop_name"

# Montos que acepta su API. Fuera de rango rechaza el cobro con un error
# genérico, así que se avisa antes con un mensaje que se entiende.
MIN_CLP = 100
MAX_CLP = 99_999_999

TIEMPO_ESPERA = 25.0


class HaulmerError(Exception):
    """Algo impide cobrar. El texto va tal cual al cliente."""


# ── Configuración ────────────────────────────────────────────────────────────

def get_mode() -> str:
    from models.setting import Setting
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == AJUSTE_MODO).first()
        valor = (row.value if row else "") or "live"
    except Exception:
        valor = "live"
    finally:
        db.close()
    return valor if valor in MODOS else "live"


def set_mode(db, modo: str) -> None:
    from models.setting import Setting
    if modo not in MODOS:
        raise ValueError(f"Modo inválido: {modo}")
    row = db.query(Setting).filter(Setting.key == AJUSTE_MODO).first()
    if row:
        row.value = modo
    else:
        db.add(Setting(key=AJUSTE_MODO, value=modo))
    db.commit()


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
        log.warning("[haulmer] no se pudo leer '%s': %s", nombre, e)
        valor = None
    finally:
        db.close()
    if not valor:
        valor = os.environ.get(nombre.upper(), "")
    return (valor or "").strip()


def credenciales(modo: str | None = None) -> dict:
    return {c: _config(c, modo) for c in CAMPOS}


def is_configured(modo: str | None = None) -> bool:
    creds = credenciales(modo)
    return all(creds[c] for c in CAMPOS)


def es_metodo(metodo: str | None) -> bool:
    return (metodo or "").strip().lower() == METODO


def nombre_comercio() -> str:
    from models.setting import Setting
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == AJUSTE_COMERCIO).first()
        return ((row.value if row else "") or "Ksa Global Evolution").strip()
    except Exception:
        return "Ksa Global Evolution"
    finally:
        db.close()


# ── Firma ────────────────────────────────────────────────────────────────────

def _texto(valor) -> str:
    """Cómo se escribe un valor dentro de la firma.

    Tiene que coincidir carácter a carácter con lo que va en el cuerpo, o la
    firma no cuadra. Los enteros se escriben sin `.0`: un monto en pesos no
    lleva decimales y `19990.0` no es lo que viaja en el JSON.
    """
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor)


def firmar(campos: dict, secreto: str) -> str:
    base = "".join(
        f"{k}{_texto(campos[k])}"
        for k in sorted(campos)
        if k.startswith("x_") and k != "x_signature" and campos[k] is not None
    )
    return hmac.new(secreto.encode(), base.encode(), hashlib.sha256).hexdigest()


def verificar_firma(campos: dict, modo: str | None = None) -> bool:
    """Si el aviso lo firmó de verdad Haulmer con nuestro secreto."""
    recibida = (campos.get("x_signature") or "").strip().lower()
    secreto = _config(CLAVE_SECRET, modo)
    if not recibida or not secreto:
        return False
    return hmac.compare_digest(recibida, firmar(campos, secreto))


# ── Cobro ────────────────────────────────────────────────────────────────────

def _partes_del_nombre(nombre: str) -> tuple[str, str]:
    partes = [p for p in (nombre or "").split() if p]
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], partes[0]
    return partes[0], " ".join(partes[1:])


def referencia_para(order_number: str) -> str:
    """Única por intento: Haulmer rechaza una referencia repetida.

    El número de orden va delante para poder reconocerla de un vistazo en su
    panel, pero la orden se busca por la fila de `haulmer_charges`, no
    recortando este texto.
    """
    return f"{order_number}-{int(time.time())}"


def crear_cobro(
    *,
    referencia: str,
    monto_clp: int,
    email: str,
    nombre: str,
    telefono: str,
    descripcion: str,
    url_callback: str,
    url_completo: str,
    url_cancelado: str,
    modo: str | None = None,
) -> dict:
    """Abre el cobro y dice a dónde mandar al cliente.

    Devuelve `{"tipo": "enlace", "url": ...}` cuando su API contesta con la
    dirección del formulario, o `{"tipo": "formulario", "url": ..., "campos":
    {...}}` cuando no: en ese caso el navegador manda esos mismos campos por
    POST a la URL y Haulmer responde con su pantalla de pago. Los dos caminos
    acaban igual; el segundo existe porque su documentación no promete qué
    devuelve el modo sin redirección, y quedarse sin cobrar por eso sería peor.
    """
    modo = modo or get_mode()
    creds = credenciales(modo)
    if not all(creds[c] for c in CAMPOS):
        raise HaulmerError("Haulmer no está configurado")

    monto = int(round(monto_clp))
    if monto < MIN_CLP:
        raise HaulmerError(f"El mínimo que cobra Haulmer son {MIN_CLP} CLP")
    if monto > MAX_CLP:
        raise HaulmerError("El monto supera el máximo que cobra Haulmer")

    nombre_pila, apellido = _partes_del_nombre(nombre)
    if not email:
        raise HaulmerError("Haulmer exige el correo de quien paga")
    if not nombre_pila:
        raise HaulmerError("Haulmer exige el nombre de quien paga")

    campos = {
        "x_account_id": creds[CLAVE_ACCOUNT],
        "x_amount": monto,
        "x_currency": MONEDA,
        "x_customer_email": email,
        "x_customer_first_name": nombre_pila,
        "x_customer_last_name": apellido,
        "x_customer_phone": telefono or "",
        "x_description": (descripcion or "")[:120],
        "x_reference": referencia,
        "x_shop_name": nombre_comercio(),
        "x_url_callback": url_callback,
        "x_url_cancel": url_cancelado,
        "x_url_complete": url_completo,
    }
    campos["x_signature"] = firmar(campos, creds[CLAVE_SECRET])

    url = base_url(modo)
    try:
        r = httpx.post(
            url,
            json=campos,
            headers={"Content-Type": "application/json", "X-REDIRECT": "false"},
            timeout=TIEMPO_ESPERA,
            follow_redirects=False,
        )
    except httpx.HTTPError as e:
        raise HaulmerError(f"No se pudo contactar con Haulmer: {e}") from e

    # Redirección: la dirección del formulario viene en la cabecera.
    destino = r.headers.get("Location")
    if destino:
        return {"tipo": "enlace", "url": destino, "campos": campos}

    if r.status_code >= 400:
        raise HaulmerError(_motivo(r))

    destino = _url_de_respuesta(r)
    if destino:
        return {"tipo": "enlace", "url": destino, "campos": campos}

    # Sin URL que seguir: que el propio navegador mande el formulario. Los
    # campos ya van firmados, así que Haulmer los acepta igual.
    log.warning("[haulmer] su API no devolvió URL de pago (%s): %s — se usa el envío "
                "por formulario", r.status_code, (r.text or "")[:300])
    return {"tipo": "formulario", "url": url, "campos": campos}


def _url_de_respuesta(r: httpx.Response) -> str:
    """Busca la dirección del formulario en lo que haya contestado.

    Su documentación no fija el nombre del campo, así que se aceptan los
    habituales en vez de escoger uno y romper el día que devuelvan otro.
    """
    try:
        cuerpo = r.json()
    except ValueError:
        return ""
    if isinstance(cuerpo, str):
        return cuerpo if cuerpo.startswith("http") else ""
    if not isinstance(cuerpo, dict):
        return ""

    candidatos = ("url", "payment_url", "paymentUrl", "redirect_url", "redirectUrl",
                  "checkout_url", "checkoutUrl", "x_url", "link", "urlPago")
    dentro = cuerpo.get("data") if isinstance(cuerpo.get("data"), dict) else {}
    for sitio in (cuerpo, dentro):
        for clave in candidatos:
            valor = (sitio or {}).get(clave)
            if isinstance(valor, str) and valor.startswith("http"):
                return valor
    return ""


def _motivo(r: httpx.Response) -> str:
    try:
        cuerpo = r.json()
    except ValueError:
        return f"Haulmer respondió {r.status_code}: {(r.text or '')[:200]}"
    if isinstance(cuerpo, dict):
        for clave in ("message", "error", "detail", "x_message"):
            if cuerpo.get(clave):
                return f"Haulmer: {cuerpo[clave]}"
    return f"Haulmer respondió {r.status_code}: {json.dumps(cuerpo)[:200]}"


# ── Conversión ───────────────────────────────────────────────────────────────

def monto_en_clp(db, monto: float, moneda: str) -> tuple[int, float]:
    """Cuántos pesos hay que cobrar por un envío en otra moneda.

    Devuelve (monto en CLP, tasa usada). Sin tasa no se puede cobrar: es
    preferible no ofrecer el método que cobrar una cifra inventada.
    """
    moneda = (moneda or "").upper()
    if moneda == MONEDA:
        return int(round(monto)), 1.0

    from services.exchange_service import get_rate
    tasa = get_rate(db, moneda, MONEDA)
    if not tasa or tasa <= 0:
        raise HaulmerError(f"No hay tasa de {moneda} a CLP para cobrar con Haulmer")
    return int(round(monto * tasa)), float(tasa)
