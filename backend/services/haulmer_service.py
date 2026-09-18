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

Qué credenciales hacen falta, y por qué solo dos
------------------------------------------------
El RUT del comercio y la API key («clave secreta» en su panel). Eso es todo lo
que su Espacio de Trabajo entrega, y basta: el identificador de cuenta y la
clave de firma NO se pegan a mano, se piden en caliente.

    GET  {base}/token/{rut}      con Bearer <api key>   ->  {"token": ...}
    POST {base}/validatetoken    con Bearer <api key>   ->  {"account_id", "secret_key"}

Con esos dos se arma el cobro: `x_account_id` es el account_id y la firma se
calcula con el secret_key. Es exactamente lo que hace su plugin oficial de
WooCommerce, que es la única implementación publicada de este flujo.

La firma
--------
HMAC-SHA256 sobre los campos que empiezan por `x_`, ordenados
alfabéticamente y pegados como clave+valor sin separadores. Los campos que no
empiezan por `x_` (platform, dte...) viajan pero quedan fuera de la firma. El
aviso de vuelta viene firmado igual, así que aquí sí se puede comprobar —a
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
import re
import threading
import time

import httpx

from database import SessionLocal

log = logging.getLogger("ppa")

CLAVE_RUT = "haulmer_rut"
CLAVE_API_KEY = "haulmer_api_key"
# Los dos que su documentación llama «proporcionados por TUU». Si los entregan
# directamente se pegan aquí y no hace falta pedirlos con el RUT.
CLAVE_ACCOUNT = "haulmer_account_id"
CLAVE_SECRET = "haulmer_secret_key"

CAMPOS = (CLAVE_RUT, CLAVE_API_KEY, CLAVE_ACCOUNT, CLAVE_SECRET)

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

# Su plugin manda un campo `secret` con un valor fijo que identifica a la
# plataforma que integra. No está documentado, así que es un ajuste: vacío no
# se manda, y si algún día su API lo exige se pega el valor que ellos den.
AJUSTE_PLATAFORMA = "haulmer_platform_secret"

# Documento tributario que se emite por el cobro. 0 es ninguno, que es lo que
# corresponde aquí: el envío no es una venta de productos y la boleta la emite
# —si toca— el sistema de facturación, no la pasarela. Su plugin de tienda usa
# 48 porque ahí sí hay una venta detrás.
DTE_TIPO = 0

# Montos que acepta su API. Fuera de rango rechaza el cobro con un error
# genérico, así que se avisa antes con un mensaje que se entiende.
MIN_CLP = 100
MAX_CLP = 99_999_999

TIEMPO_ESPERA = 25.0

# Credenciales del entorno de integración, las mismas que su plugin oficial de
# WooCommerce rellena solo al ponerlo en modo desarrollo. Son públicas y sirven
# para probar el circuito entero —token, firma, cobro y aviso— sin esperar a
# que Haulmer habilite el comercio. En modo prueba se usan si no hay otras
# guardadas; en modo real no se usan nunca.
RUT_PRUEBA = "12345678-5"
CLAVE_PRUEBA = ("b03b8a125decec19e12f9b8b425343008ce0f214c1e7e7483b15e546ecd"
                "28c30434cee53ffb6c711")

# Cuánto se reutilizan el account_id y el secret_key antes de volver a pedirlos.
# Su API no dice cuánto duran; diez minutos es corto para que una rotación no
# deje cobros rotos mucho tiempo, y largo para no pedir dos llamadas por cobro.
VIDA_CLAVES = 600


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
    # Las claves en memoria son del modo anterior: con ellas se firmaría un
    # cobro de producción con las credenciales del sandbox.
    olvidar_claves()


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


def _ajuste(clave: str, por_defecto: str = "") -> str:
    from models.setting import Setting
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == clave).first()
        return ((row.value if row else "") or por_defecto).strip()
    except Exception:
        return por_defecto
    finally:
        db.close()


def credenciales(modo: str | None = None) -> dict:
    valores = {c: _config(c, modo) for c in CAMPOS}
    if (modo or get_mode()) == "test" and not (valores[CLAVE_ACCOUNT] and valores[CLAVE_SECRET]):
        # Sin nada pegado, las de su entorno de integración: en prueba lo útil
        # es poder cobrar con una tarjeta de mentira desde el primer minuto.
        valores[CLAVE_RUT] = valores[CLAVE_RUT] or RUT_PRUEBA
        valores[CLAVE_API_KEY] = valores[CLAVE_API_KEY] or CLAVE_PRUEBA
    return valores


def is_configured(modo: str | None = None) -> bool:
    """Hay con qué cobrar por uno de los dos caminos.

    O las claves de cobro pegadas a mano, o el RUT y la clave secreta con los
    que pedírselas a Haulmer. Exigir las cuatro dejaría la integración apagada
    a quien tenga solo un juego.
    """
    creds = credenciales(modo)
    directas = creds[CLAVE_ACCOUNT] and creds[CLAVE_SECRET]
    por_rut = creds[CLAVE_RUT] and creds[CLAVE_API_KEY]
    return bool(directas or por_rut)


def es_metodo(metodo: str | None) -> bool:
    return (metodo or "").strip().lower() == METODO


def nombre_comercio() -> str:
    return _ajuste(AJUSTE_COMERCIO, "Ksa Global Evolution") or "Ksa Global Evolution"


def identificador_plataforma() -> str:
    return _ajuste(AJUSTE_PLATAFORMA)


def normaliza_rut(rut: str) -> str:
    """Sin puntos y con guion, que es como lo pide su API.

    El comercio lo escribe como lo tiene a mano —con puntos, en minúscula, con
    espacios— y mandarlo así devuelve un 404 de token que no explica nada.
    """
    limpio = re.sub(r"[^0-9kK]", "", rut or "").upper()
    if len(limpio) < 2:
        return ""
    return f"{limpio[:-1]}-{limpio[-1]}"


# ── Claves de firma (se piden con la API key) ────────────────────────────────

_claves_cache: dict = {}
_candado = threading.Lock()


def olvidar_claves() -> None:
    with _candado:
        _claves_cache.clear()


def claves_de_firma(modo: str | None = None, refrescar: bool = False) -> dict:
    """{'account_id', 'secret_key'} para firmar y cobrar.

    Se piden con la API key y se guardan un rato en memoria: son dos llamadas
    de red y harían falta en cada cobro y en cada aviso.
    """
    modo = modo or get_mode()
    ahora = time.time()

    # Camino corto: si TUU entregó el id de cuenta y la llave secreta —que es
    # como lo documenta su API— no hay nada que pedir.
    directas = credenciales(modo)
    if directas[CLAVE_ACCOUNT] and directas[CLAVE_SECRET]:
        return {"account_id": directas[CLAVE_ACCOUNT], "secret_key": directas[CLAVE_SECRET]}

    if not refrescar:
        with _candado:
            guardado = _claves_cache.get(modo)
        if guardado and guardado["expira"] > ahora:
            return {"account_id": guardado["account_id"], "secret_key": guardado["secret_key"]}

    creds = credenciales(modo)
    rut = normaliza_rut(creds[CLAVE_RUT])
    api_key = creds[CLAVE_API_KEY]
    if not rut or not api_key:
        raise HaulmerError("Faltan el RUT del comercio o la API key de Haulmer")

    base = base_url(modo)
    cabeceras = {"Accept": "application/json", "Authorization": f"Bearer {api_key}"}

    try:
        r = httpx.get(f"{base}/token/{rut}", headers=cabeceras, timeout=TIEMPO_ESPERA)
    except httpx.HTTPError as e:
        raise HaulmerError(f"No se pudo contactar con Haulmer: {e}") from e
    if r.status_code == 401:
        # Pasa con la API key del panel: autentica en TUU Pagos (la de la
        # máquina POS) pero no en la pasarela online, que es otro producto y
        # tiene su propia clave. Sin decirlo, el mensaje sería «no autorizado»
        # y no habría por dónde empezar a mirar.
        raise HaulmerError(
            "Haulmer no reconoce esta clave para Pago Online. La API key que sale en su "
            "panel es la de TUU Pagos (máquina POS); la clave de la pasarela online te la "
            "mandan por correo al habilitar TUU Pago Online para el RUT del comercio.")
    if r.status_code == 404:
        raise HaulmerError(
            f"Haulmer no encuentra el comercio {rut}. Comprueba el RUT, o pide que "
            "habiliten TUU Pago Online para él.")
    if r.status_code != 200:
        raise HaulmerError(_motivo(r, "no entregó el token del comercio"))

    try:
        token = (r.json() or {}).get("token")
    except ValueError:
        token = None
    if not token:
        raise HaulmerError("Haulmer no devolvió token: revisa el RUT y la API key")

    try:
        r2 = httpx.post(f"{base}/validatetoken", json={"token": token},
                        headers={**cabeceras, "Content-Type": "application/json"},
                        timeout=TIEMPO_ESPERA)
    except httpx.HTTPError as e:
        raise HaulmerError(f"No se pudo contactar con Haulmer: {e}") from e
    if r2.status_code != 200:
        raise HaulmerError(_motivo(r2, "no validó el token del comercio"))

    try:
        datos = r2.json() or {}
    except ValueError:
        datos = {}
    account_id = str(datos.get("account_id") or "").strip()
    secret_key = str(datos.get("secret_key") or "").strip()
    if not account_id or not secret_key:
        raise HaulmerError("Haulmer validó el token pero no devolvió las claves de cobro; "
                           "comprueba que el comercio esté activo")

    with _candado:
        _claves_cache[modo] = {
            "account_id": account_id,
            "secret_key": secret_key,
            "expira": ahora + VIDA_CLAVES,
        }
    return {"account_id": account_id, "secret_key": secret_key}


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
    """Si el aviso lo firmó de verdad Haulmer con la clave de nuestro comercio.

    Ante una firma que no cuadra se vuelven a pedir las claves y se comprueba
    otra vez: si rotaron desde que se abrió el cobro, la copia en memoria ya no
    sirve y rechazar sin reintentar dejaría un pago real sin registrar.
    """
    recibida = (campos.get("x_signature") or "").strip().lower()
    if not recibida:
        return False

    for refrescar in (False, True):
        try:
            secreto = claves_de_firma(modo, refrescar=refrescar)["secret_key"]
        except HaulmerError as e:
            log.error("[haulmer] no se pudieron pedir las claves para comprobar la firma: %s", e)
            return False
        if hmac.compare_digest(recibida, firmar(campos, secreto)):
            return True
    return False


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

    Devuelve `{"tipo": "enlace", "url": ...}`: su API contesta con la dirección
    de la pantalla de pago, en texto plano. Si algún día devolviera otra cosa,
    se cae a `{"tipo": "formulario", "campos": {...}}` y el navegador manda los
    mismos campos —ya firmados— por POST, que es como funcionaba antes de que
    existiera la respuesta directa.
    """
    modo = modo or get_mode()
    claves = claves_de_firma(modo)

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
        "x_account_id": claves["account_id"],
        "x_amount": monto,
        "x_currency": MONEDA,
        "x_customer_email": email,
        "x_customer_first_name": nombre_pila,
        "x_customer_last_name": apellido,
        "x_customer_phone": telefono or "",
        "x_description": (descripcion or "")[:120],
        "x_reference": referencia,
        "x_shop_country": "CL",
        "x_shop_name": nombre_comercio(),
        "x_url_callback": url_callback,
        "x_url_cancel": url_cancelado,
        "x_url_complete": url_completo,
    }
    campos["x_signature"] = firmar(campos, claves["secret_key"])

    # Fuera de la firma, como en su plugin: estos no empiezan por `x_`.
    cuerpo = {
        **campos,
        "platform": "ksa-global-evolution",
        "paymentMethod": "webpay",
        "dte_type": DTE_TIPO,
    }
    plataforma = identificador_plataforma()
    if plataforma:
        cuerpo["secret"] = plataforma

    url = base_url(modo)
    try:
        r = httpx.post(url, json=cuerpo, headers={"Content-Type": "application/json"},
                       timeout=TIEMPO_ESPERA, follow_redirects=False)
    except httpx.HTTPError as e:
        raise HaulmerError(f"No se pudo contactar con Haulmer: {e}") from e

    destino = r.headers.get("Location")
    if destino:
        return {"tipo": "enlace", "url": destino, "campos": campos}

    if r.status_code >= 400:
        raise HaulmerError(_motivo(r, "rechazó el cobro"))

    destino = _url_de_respuesta(r)
    if destino:
        return {"tipo": "enlace", "url": destino, "campos": campos}

    # Sin URL que seguir: que el propio navegador mande el formulario. Los
    # campos ya van firmados, así que Haulmer los acepta igual.
    log.warning("[haulmer] su API no devolvió URL de pago (%s): %s — se usa el envío "
                "por formulario", r.status_code, (r.text or "")[:300])
    return {"tipo": "formulario", "url": url, "campos": cuerpo}


def _url_de_respuesta(r: httpx.Response) -> str:
    """Saca la dirección de la pantalla de pago de lo que hayan contestado.

    Normalmente es la URL pelada, en texto. Se aceptan además los nombres de
    campo habituales por si viene envuelta en JSON.
    """
    texto = (r.text or "").strip().strip('"')
    if texto.startswith("http"):
        return texto

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


def _motivo(r: httpx.Response, que_pasaba: str = "respondió con un error") -> str:
    try:
        cuerpo = r.json()
    except ValueError:
        texto = (r.text or "").strip()[:200]
        return f"Haulmer {que_pasaba} ({r.status_code}){': ' + texto if texto else ''}"
    if isinstance(cuerpo, dict):
        for clave in ("message", "error", "detail", "x_message"):
            if cuerpo.get(clave):
                return f"Haulmer: {cuerpo[clave]}"
    return f"Haulmer {que_pasaba} ({r.status_code}): {json.dumps(cuerpo)[:200]}"


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
