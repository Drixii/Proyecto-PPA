"""Koywe: cobro con métodos locales de cada país (PAYIN).

Cómo funciona
-------------
Koywe no da una cuenta bancaria a la que el cliente transfiere a ciegas. Se
crea una orden PAYIN y ellos devuelven una URL de checkout (`providedAction`);
el cliente paga ahí con el método de su país (Khipu en Chile, PSE en
Colombia...) y Koywe avisa por webhook cuando el dinero entró.

Por qué el aviso se comprueba contra su API y no por firma
-----------------------------------------------------------
Koywe documenta una cabecera `Koywe-Signature` (HMAC-SHA256 del cuerpo), pero
NO entrega el secreto con el que firmarla: ni al crear el endpoint en su panel,
ni por API, ni lo dice su documentación. Sin ese secreto la firma no se puede
verificar, y aceptar un aviso sin verificar sería dejar que cualquiera marque
órdenes como pagadas mandando un POST.

La salida es preguntarle a Koywe. Cuando llega un aviso no se cree nada de lo
que dice: se busca la orden nuestra, y si existe y está sin pagar, se consulta
su API con nuestras credenciales para ver si esa orden está realmente pagada y
por el monto correcto. Es más fuerte que la firma — la firma demuestra quién
mandó el mensaje, la consulta demuestra que el pago existe — y no depende de un
secreto que no tenemos.

Si algún día Koywe entrega el secreto, se guarda y la firma pasa a comprobarse
además de la consulta. Ver `verificar_firma` y `confirmar_pago`.

De dónde salen los métodos de pago
-----------------------------------
De su API, no de una lista escrita a mano. La primera versión llevaba la tabla
copiada de la documentación y no coincidía con la realidad del merchant: Nequi
no existía, México no tenía ningún método, el de Perú se llamaba LIGO y no QRI,
y Argentina —que la documentación no mencionaba— sí funcionaba con Khipu. Una
tabla fija se desincroniza en silencio y el cliente se entera al no poder pagar.

Dónde cae el dinero
-------------------
Cada merchant tiene una cuenta virtual por moneda, creadas solas. Un cobro en
CLP suma al saldo CLP, uno en COP al saldo COP: no se mezclan ni se convierten
sin pedirlo. Sacarlo a una cuenta bancaria real de ese país es aparte, y se
hace desde su panel — aquí no se mueve saldo.
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

CLAVE_API = "koywe_api_key"
CLAVE_SECRET = "koywe_secret"
CLAVE_ORG = "koywe_org_id"
CLAVE_MERCHANT = "koywe_merchant_id"
CLAVE_WEBHOOK = "koywe_webhook_secret"

CAMPOS = (CLAVE_API, CLAVE_SECRET, CLAVE_ORG, CLAVE_MERCHANT, CLAVE_WEBHOOK)

# Lo que hace falta para cobrar. El secreto del webhook queda fuera a propósito:
# Koywe no lo entrega, y exigirlo dejaría la integración apagada para siempre.
# Los avisos se validan consultando su API (ver el encabezado del módulo).
CAMPOS_OBLIGATORIOS = (CLAVE_API, CLAVE_SECRET, CLAVE_ORG, CLAVE_MERCHANT)

URLS = {
    "test": "https://api-sandbox.koywe.com",
    "live": "https://api.koywe.com",
}

MODOS = ("test", "live")

# Koywe tiene su propio interruptor de modo, separado del de Stripe.
#
# El de Stripe (`stripe_mode`) manda sobre toda la plataforma, y mientras esté
# en prueba Koywe tampoco podría cobrar de verdad. Como el sandbox de Koywe se
# pide por correo y tarda, se separan: Koywe puede estar en real mientras el
# resto sigue en prueba, o al revés, sin que activar uno active el otro sin
# querer.
AJUSTE_MODO = "koywe_mode"

# Moneda -> país donde se paga. La moneda decide el país: nadie paga en pesos
# chilenos desde un banco brasileño. Qué métodos hay en cada uno lo dice su API.
PAISES = {
    "CLP": "CL",
    "ARS": "AR",
    "COP": "CO",
    "BRL": "BR",
    "MXN": "MX",
    "PEN": "PE",
}

KOYWE_CURRENCIES = tuple(PAISES.keys())

# Nombre, descripción e icono para el cliente. Su API devuelve el nombre
# técnico ("PIX Estatico", "QR") y ningún logo, así que esto es lo que ve
# alguien que solo quiere pagar. Lo que no esté aquí se muestra con el nombre
# que mande Koywe.
#
# El icono dice de qué tipo de pago se trata —banco, tarjeta, móvil, QR— en vez
# del mismo símbolo para todos: elegir entre dos botones idénticos salvo por el
# texto es más lento de leer.
NOMBRES = {
    "KHIPU": ("Khipu", "Transferencia desde tu banco", "🏦"),
    "CARD_PAYMENT": ("Tarjeta", "Crédito o débito", "💳"),
    "PSE": ("PSE", "Débito desde tu banco", "🏦"),
    "NEQUI": ("Nequi", "Pago instantáneo", "📱"),
    "PIX_STATIC": ("PIX", "Instantáneo, 24/7", "⚡"),
    "PIX_DYNAMIC": ("PIX", "Instantáneo, 24/7", "⚡"),
    "SPEI": ("SPEI", "Transferencia instantánea", "🏦"),
    "CARD": ("Tarjeta", "Crédito o débito", "💳"),
    "LIGO": ("Ligo", "Pago con QR", "🔳"),
    "QRI": ("QRI", "Pago con QR", "🔳"),
}

# Los códigos tal y como se guardan en `orders.payment_method`, en minúscula.
# Sirve para distinguir una orden de Koywe de una de tarjeta o de una
# transferencia con comprobante, que tienen ciclos de vida distintos.
#
# Es una lista fija y a propósito más larga que la que ofrece el merchant hoy:
# clasificar una orden vieja no puede depender de que Koywe responda, ni de que
# el método siga estando disponible cuando se consulte.
CODIGOS = {c.lower() for c in NOMBRES}

# De momento solo se ofrecen los métodos que devuelven un enlace al que
# redirigir. Los de tipo QR (PIX en Brasil, Ligo en Perú) devuelven un código
# para escanear, que necesita una pantalla propia; ofrecerlos sin ella mandaría
# al cliente a una página en blanco. Se activan cuando esa pantalla exista y se
# haya visto una respuesta real en sandbox.
RESPUESTAS_SOPORTADAS = ("PAYMENT_LINK",)

# Estados en los que el dinero ya es nuestro. PAID es "pago confirmado" y
# COMPLETED "fondos liquidados"; a efectos del cliente ambos significan que
# pagó y la orden puede avanzar.
ESTADOS_PAGADOS = ("PAID", "COMPLETED")

# El token dura ~1h según su documentación. Se renueva antes para no jugarse
# un cobro a que caduque a mitad de la petición.
VIDA_TOKEN = 45 * 60

# Cuánto se reutiliza el catálogo de métodos antes de volver a preguntarlo. Es
# una lista que cambia cada meses, y se consulta en cada carga del formulario
# de envío: pedirla cada vez añadiría medio segundo a algo que no cambia.
VIDA_CATALOGO = 10 * 60

TIMEOUT = 20.0


class KoyweError(Exception):
    """Algo falló hablando con Koywe. El router lo convierte en 400."""


class KoyweNotConfigured(KoyweError):
    pass


# ── Modo y credenciales ──────────────────────────────────────────────────────

def get_mode() -> str:
    """Modo activo de Koywe: 'test' o 'live'."""
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
    # El catálogo y el token son de un modo concreto: al cambiar de modo dejan
    # de valer, y reutilizarlos mostraría los métodos del sandbox en producción.
    _olvidar_cache()


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
    """Listo para cobrar: credenciales de API e identificadores de la cuenta."""
    creds = credenciales(modo)
    return all(creds[c] for c in CAMPOS_OBLIGATORIOS)


def firma_disponible(modo: str | None = None) -> bool:
    """Si además se puede comprobar la firma del webhook.

    Hoy es False: Koywe no entrega el secreto. Se consulta para poder decirlo
    en el panel en vez de que parezca que falta algo por rellenar.
    """
    return bool(_config(CLAVE_WEBHOOK, modo))


# ── Cliente de la API ────────────────────────────────────────────────────────

# El token se guarda en memoria del proceso, no en la base: es de usar y tirar
# y el backend corre con --workers 1, así que hay un único proceso que lo
# comparte. Si se reinicia, se pide otro y ya.
_token_cache: dict = {"token": None, "expira": 0.0, "modo": None}
_catalogo_cache: dict = {"datos": None, "expira": 0.0, "modo": None}


def _olvidar_cache() -> None:
    _token_cache.update({"token": None, "expira": 0.0, "modo": None})
    _catalogo_cache.update({"datos": None, "expira": 0.0, "modo": None})
    _cuentas_cache.update({"datos": None, "expira": 0.0, "modo": None})


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


def _ruta_merchant(modo: str | None = None) -> str:
    org, merchant = _ids(modo)
    return f"/api/v1/organizations/{org}/merchants/{merchant}"


# ── Catálogo de métodos ──────────────────────────────────────────────────────

def _traer_catalogo(modo: str) -> dict:
    """Pregunta a Koywe qué se puede cobrar en cada moneda."""
    salida = {}
    for moneda, pais in PAISES.items():
        try:
            r = _pedir("GET", "/api/v1/payment-method", modo=modo,
                       params={"countrySymbol": pais, "currencySymbol": moneda})
        except KoyweError as e:
            # Una moneda que falla no puede tumbar el resto del formulario: se
            # deja vacía y las demás siguen ofreciéndose.
            log.warning("[koywe] no se pudieron leer los métodos de %s: %s", moneda, e)
            continue

        metodos = []
        for m in (r.get("paymentMethods") or []) if isinstance(r, dict) else []:
            codigo = (m.get("method") or "").strip()
            if not codigo:
                continue
            nombre, desc, icono = NOMBRES.get(
                codigo.upper(), (m.get("name") or codigo, "", "💸"))
            requeridos = (m.get("requiredFields") or {}).get("contact") or []
            metodos.append({
                "codigo": codigo,
                "nombre": nombre,
                "desc": desc,
                "icono": icono,
                "minimo": m.get("minAmount"),
                "maximo": m.get("maxAmount"),
                "respuesta": m.get("responseType"),
                "requiere": list(requeridos),
                # Lo que se le puede ofrecer hoy al cliente. Los QR se listan
                # igual para que el panel de admin muestre que existen y por
                # qué no están.
                "soportado": (m.get("responseType") in RESPUESTAS_SOPORTADAS),
            })
        if metodos:
            salida[moneda] = metodos
    return salida


def catalogo(modo: str | None = None, refrescar: bool = False) -> dict:
    """{moneda: [métodos]} según Koywe, cacheado. {} si no está configurado."""
    modo = modo or get_mode()
    ahora = time.time()
    if (not refrescar and _catalogo_cache["datos"] is not None
            and _catalogo_cache["modo"] == modo and _catalogo_cache["expira"] > ahora):
        return _catalogo_cache["datos"]

    if not is_configured(modo):
        return {}

    datos = _traer_catalogo(modo)
    _catalogo_cache.update({"datos": datos, "expira": ahora + VIDA_CATALOGO, "modo": modo})
    return datos


def metodos_publicos(modo: str | None = None) -> dict:
    """Lo que se le ofrece al cliente: {moneda: [métodos ofrecibles]}.

    Nunca levanta: se llama desde /config, que carga en cada pantalla de envío.
    Si Koywe no responde, el cliente ve el resto de métodos de pago y no una
    página rota.
    """
    try:
        todo = catalogo(modo)
    except KoyweError as e:
        log.warning("[koywe] catálogo no disponible: %s", e)
        return {}
    salida = {}
    for moneda, metodos in todo.items():
        ofrecibles = [m for m in metodos if m["soportado"]]
        if ofrecibles:
            salida[moneda] = ofrecibles
    return salida


def metodos_de(moneda: str | None, modo: str | None = None) -> list:
    """Métodos ofrecibles para esa moneda. Vacío si Koywe no la cubre."""
    try:
        todo = catalogo(modo)
    except KoyweError as e:
        log.warning("[koywe] catálogo no disponible: %s", e)
        return []
    return [m for m in todo.get((moneda or "").upper(), []) if m["soportado"]]


def es_metodo(payment_method: str | None) -> bool:
    return (payment_method or "").strip().lower() in CODIGOS


def _metodo_valido(moneda: str, codigo: str, modo: str | None = None) -> dict | None:
    for m in metodos_de(moneda, modo):
        if m["codigo"].lower() == (codigo or "").lower():
            return m
    return None


# ── Cuentas para recibir transferencias ──────────────────────────────────────
#
# Koywe emite cuentas bancarias reales (CBU en Argentina, CLABE en México...)
# a nombre del comercio. El cliente transfiere ahí desde su banco y el dinero
# cae directo en el saldo de esa moneda, sin pasar por una cuenta nuestra.
#
# Dos cosas que conviene tener claras:
#
# 1. NO son las mismas que devuelve /accounts. Allí también hay una "cuenta"
#    por moneda con número `VIRTUAL_FIAT-mrc_...-CLP`, pero eso es un saldo
#    interno, no algo a lo que un banco pueda transferir. Las transferibles
#    son solo las de /virtual-accounts.
# 2. Son por moneda, no por cliente. Se comprobó contra su API: crear una solo
#    admite `country` y `currency`, no acepta contacto. Así que todos los
#    clientes de un país transfieren al mismo número y el aviso de dinero
#    recibido no puede traer el número de orden. Por eso `bank_income.received`
#    se guarda como sugerencia para el admin y no aprueba nada solo — el mismo
#    criterio que con Global66.

# El número de cuenta lo da su API; el titular y el banco no. Sin esos datos
# nadie puede completar una transferencia, así que se rellenan a mano en
# Ajustes y se guardan aquí, uno por moneda.
AJUSTE_BENEFICIARIO = "koywe_beneficiario"

# Lo mínimo para que un cliente pueda transferir. Sin esto la cuenta no se le
# muestra: media instrucción de pago es peor que ninguna.
#
# Solo el titular. La primera versión exigía también el banco y eso era pedir
# de más: a un CBU argentino o una CLABE mexicana se transfiere con el número y
# el nombre de quien recibe, el banco va implícito en el propio número. Donde
# sí hace falta —una cuenta corriente chilena— viene ya relleno desde su API.
# Exigirlo dejaba bloqueadas justo las cuentas que no lo necesitan.
BENEFICIARIO_MINIMO = ("titular",)

CAMPOS_BENEFICIARIO = ("titular", "banco", "documento", "tipo_cuenta", "nota")

# Interruptor explícito por moneda. No basta con que los datos estén completos:
# la cuenta compartida de Koywe llega con titular y banco ya rellenos desde su
# API, así que sin esto se publicaría sola en cuanto apareciera — y todavía no
# sabemos cómo atribuyen un depósito hecho a esa cuenta al comercio correcto.
# Publicar una cuenta de cobro es de las cosas que no se deshacen: el cliente
# ya transfirió.
CAMPO_HABILITADA = "habilitada"

VIDA_CUENTAS = 10 * 60

_cuentas_cache: dict = {"datos": None, "expira": 0.0, "modo": None}


def _clave_beneficiario(moneda: str) -> str:
    return f"{AJUSTE_BENEFICIARIO}_{(moneda or '').upper()}"


def beneficiario(moneda: str) -> dict:
    """Titular, banco y demás de la cuenta de esa moneda. {} si no se rellenó."""
    from models.setting import Setting
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == _clave_beneficiario(moneda)).first()
        crudo = row.value if row else ""
    except Exception as e:
        log.warning("[koywe] no se pudo leer el beneficiario de %s: %s", moneda, e)
        crudo = ""
    finally:
        db.close()
    if not crudo:
        return {}
    try:
        datos = json.loads(crudo)
    except ValueError:
        return {}
    return datos if isinstance(datos, dict) else {}


def guardar_beneficiario(db, moneda: str, datos: dict) -> dict:
    """Guarda los datos del titular de esa moneda. Devuelve lo que quedó."""
    from models.setting import Setting
    moneda = (moneda or "").upper()
    if moneda not in PAISES:
        raise ValueError(f"Koywe no opera en {moneda or '(vacío)'}")

    limpio = {}
    for campo in CAMPOS_BENEFICIARIO:
        valor = (datos.get(campo) or "").strip()
        if valor:
            limpio[campo] = valor
    if datos.get(CAMPO_HABILITADA):
        limpio[CAMPO_HABILITADA] = True

    clave = _clave_beneficiario(moneda)
    row = db.query(Setting).filter(Setting.key == clave).first()
    valor = json.dumps(limpio, ensure_ascii=False) if limpio else ""
    if row:
        row.value = valor
    else:
        db.add(Setting(key=clave, value=valor))
    db.commit()
    return limpio


def _traer_cuentas(modo: str) -> dict:
    """{MONEDA: datos de la cuenta} según su API. Solo las transferibles.

    Hay dos clases y no se comportan igual:

    - **Propia** (`/virtual-accounts`): cuenta emitida a nombre del comercio.
      Lo que entre ahí es nuestro sin ambigüedad.
    - **Compartida** (`/bankIncome/accounts`): la cuenta del propio Koywe, la
      misma para todos sus comercios. Devuelve titular y banco ya rellenos,
      pero cómo se atribuye un depósito al comercio correcto no está
      documentado en ninguna parte. Por eso se marca y no se publica sola.
    """
    salida = {}

    datos = _pedir("GET", f"{_ruta_merchant(modo)}/virtual-accounts", modo=modo)
    for c in datos if isinstance(datos, list) else []:
        if not isinstance(c, dict) or not c.get("isActive"):
            continue
        moneda = (c.get("currency") or "").upper()
        numero = (c.get("virtualBankAccountNumber") or "").strip()
        if not moneda or not numero:
            continue
        salida[moneda] = {
            "moneda": moneda,
            "pais": c.get("country"),
            "numero": numero,
            "proveedor": c.get("provider"),
            "alias": c.get("alias"),
            "clase": "propia",
        }

    # La cuenta de depósito de Koywe. Se pide sin parámetros a propósito: el
    # endpoint los ignora y devuelve siempre la misma, así que preguntar por
    # país solo daría la ilusión de que hay una por cada uno. Vale únicamente
    # para el país y la moneda que ella misma declara — nadie transfiere pesos
    # colombianos a una cuenta corriente chilena.
    try:
        fija = _pedir("GET", f"{_ruta_merchant(modo)}/bankIncome/accounts", modo=modo)
    except KoyweError as e:
        log.warning("[koywe] no se pudo leer la cuenta de depósito: %s", e)
        fija = None

    if isinstance(fija, dict):
        det = fija.get("accountDetails")
        det = det if isinstance(det, dict) else {}
        moneda = (fija.get("currency") or "").upper()
        numero = (det.get("accountNumber") or "").strip()
        # Si ya hay una cuenta propia en esa moneda, manda la propia: el dinero
        # entra a nombre del comercio y no hay nada que atribuir.
        if moneda and numero and moneda not in salida:
            salida[moneda] = {
                "moneda": moneda,
                "pais": fija.get("country"),
                "numero": numero,
                "proveedor": det.get("bankName"),
                "clase": "compartida",
                # Estos vienen ya rellenos, al revés que en las propias.
                "titular": det.get("accountHolderName"),
                "banco": det.get("bankName"),
                "documento": det.get("documentNumber"),
                "tipo_cuenta": det.get("accountType"),
            }

    return salida


def cuentas_transferencia(modo: str | None = None, refrescar: bool = False) -> dict:
    """Cuentas que Koywe tiene emitidas hoy, cacheadas. {} si no hay o falla."""
    modo = modo or get_mode()
    ahora = time.time()
    if (not refrescar and _cuentas_cache["datos"] is not None
            and _cuentas_cache["modo"] == modo and _cuentas_cache["expira"] > ahora):
        return _cuentas_cache["datos"]

    if not is_configured(modo):
        return {}

    try:
        datos = _traer_cuentas(modo)
    except KoyweError as e:
        log.warning("[koywe] no se pudieron leer las cuentas de transferencia: %s", e)
        return _cuentas_cache["datos"] or {}

    _cuentas_cache.update({"datos": datos, "expira": ahora + VIDA_CUENTAS, "modo": modo})
    return datos


def _fundida(cuenta: dict) -> dict:
    """Cuenta de su API + lo que haya escrito el admin, que manda.

    Lo escrito a mano pisa a lo que devuelve Koywe: si el titular que mandan no
    es exactamente el que aparece en el banco, la transferencia rebota, y quien
    puede corregirlo es el admin.
    """
    datos = beneficiario(cuenta["moneda"])
    return {**cuenta, **{k: v for k, v in datos.items() if v}}


def cuentas_completas(modo: str | None = None) -> dict:
    """Las que ya se le pueden enseñar a un cliente.

    Hacen falta dos cosas: los datos mínimos para poder transferir, y que un
    admin la haya habilitado a mano. Lo segundo no sobra — la cuenta compartida
    de Koywe llega con titular y banco ya rellenos desde su API y si no, se
    publicaría sola.

    Deliberadamente sin lista fija de países: si Koywe habilita mañana una
    cuenta en otra moneda, aparece en el panel para habilitarla. Nunca levanta,
    porque esto se pinta en la pantalla de envío.
    """
    salida = {}
    for moneda, cuenta in cuentas_transferencia(modo).items():
        fundida = _fundida(cuenta)
        if not fundida.get(CAMPO_HABILITADA):
            continue
        if not all(fundida.get(c) for c in BENEFICIARIO_MINIMO):
            continue
        salida[moneda] = fundida
    return salida


def estado_cuentas(modo: str | None = None) -> list:
    """Para el panel: toda cuenta emitida, con lo que le falta para publicarse."""
    salida = []
    for moneda, cuenta in sorted(cuentas_transferencia(modo).items()):
        fundida = _fundida(cuenta)
        faltan = [c for c in BENEFICIARIO_MINIMO if not fundida.get(c)]
        habilitada = bool(fundida.get(CAMPO_HABILITADA))
        salida.append({
            **fundida,
            "faltan": faltan,
            "habilitada": habilitada,
            "publicada": habilitada and not faltan,
        })
    return salida


def saldos(modo: str | None = None) -> list:
    """Saldo por moneda en Koywe. Solo lee."""
    modo = modo or get_mode()
    datos = _pedir("GET", f"{_ruta_merchant(modo)}/accounts/balances", modo=modo)
    salida = []
    for s in datos if isinstance(datos, list) else []:
        if not isinstance(s, dict):
            continue
        try:
            monto = float(s.get("balance") or 0)
        except (TypeError, ValueError):
            monto = 0.0
        salida.append({
            "cuenta_id": s.get("id"),
            "moneda": (s.get("currency") or "").upper(),
            "saldo": monto,
            "fecha": s.get("balanceDate"),
        })
    return salida


def movimientos(moneda: str, dias: int = 15, limite: int = 50, modo: str | None = None) -> dict:
    """Entradas de dinero en la cuenta de esa moneda, según Koywe.

    Esto es lo que deja aprobar una transferencia con criterio: el comprobante
    lo hace el cliente y se puede falsificar o corresponder a otra cosa; esto
    es el movimiento real en la cuenta. Ver los dos juntos es la diferencia
    entre creerle a una imagen y comprobar que el dinero está.

    Solo abonos: los cargos son pagos que salen y no tienen nada que ver con
    aprobar un envío entrante.
    """
    import datetime

    modo = modo or get_mode()
    moneda = (moneda or "").upper()

    cuenta = next((s for s in saldos(modo) if s["moneda"] == moneda), None)
    if not cuenta or not cuenta["cuenta_id"]:
        raise KoyweError(f"Koywe no tiene cuenta en {moneda or '(vacío)'}")

    hoy = datetime.date.today()
    desde = hoy - datetime.timedelta(days=max(1, min(dias, 120)))
    datos = _pedir(
        "GET",
        f"{_ruta_merchant(modo)}/accounts/{cuenta['cuenta_id']}/reports/ledger-statement",
        modo=modo,
        params={"from": str(desde), "to": str(hoy), "limit": max(1, min(limite, 100))},
    )

    entradas = []
    for m in (datos.get("movements") or []) if isinstance(datos, dict) else []:
        if not isinstance(m, dict) or (m.get("type") or "").lower() != "credit":
            continue
        try:
            monto = float(m.get("amount") or 0)
        except (TypeError, ValueError):
            monto = 0.0
        entradas.append({
            "id": m.get("ledgerEntryId"),
            "fecha": m.get("postedAt"),
            "monto": monto,
            "moneda": (m.get("currency") or moneda).upper(),
            "descripcion": m.get("description"),
            "categoria": m.get("category"),
        })

    entradas.sort(key=lambda e: e["fecha"] or "", reverse=True)
    return {
        "moneda": moneda,
        "saldo": cuenta["saldo"],
        "desde": str(desde),
        "hasta": str(hoy),
        "entradas": entradas,
    }


def datos_de_bank_income(evento: dict) -> dict:
    """Saca lo que se pueda del aviso de dinero recibido.

    Su formato no está documentado y todavía no hemos visto uno real, así que
    se leen varios nombres posibles para cada dato y el cuerpo entero se guarda
    aparte: si algo no se reconoce, no se pierde y se puede reconstruir.
    """
    if not isinstance(evento, dict):
        return {}

    datos = evento.get("data")
    datos = datos if isinstance(datos, dict) else {}
    rel = evento.get("relationships")
    rel = rel if isinstance(rel, dict) else {}
    propia = rel.get("self")
    propia = propia if isinstance(propia, dict) else {}

    def primero(*nombres):
        for n in nombres:
            if datos.get(n) not in (None, ""):
                return datos[n]
        return None

    def numero(valor):
        try:
            return float(valor)
        except (TypeError, ValueError):
            return None

    ident = (propia.get("id") or primero("id", "bank_income_id", "transaction_id")
             or evento.get("id") or "")

    return {
        "id": str(ident).strip(),
        "monto": numero(primero("amount", "amount_in", "originAmount")),
        "moneda": (primero("currency", "currency_symbol", "currencySymbol") or "").upper() or None,
        "pais": primero("country", "country_symbol", "countrySymbol"),
        "remitente": primero("sender_name", "senderName", "third_party_name", "payer_name"),
        "banco": primero("sender_bank", "senderBank", "bank_name"),
        "referencia": primero("reference", "description", "concept", "external_id"),
        "estado": (primero("status") or "").upper() or None,
    }


def probar_conexion(modo: str | None = None) -> dict:
    """Inicia sesión, comprueba el comercio y lista los métodos. Solo lee.

    Existe para poder comprobar unas credenciales recién pegadas sin crear
    ninguna orden: si esto pasa, el cobro va a funcionar; si falla, dice
    exactamente en qué paso.
    """
    modo = modo or get_mode()
    _token(modo)                       # falla aquí si la key o el secreto están mal
    org, merchant = _ids(modo)

    salida = {"modo": modo, "base_url": base_url(modo), "org_id": org,
              "merchant_id": merchant, "firma_disponible": firma_disponible(modo)}

    # Que el merchant exista y sea nuestro: es el error silencioso más probable
    # cuando la organización tiene más de uno, y equivocarse manda el dinero a
    # la cuenta virtual de la otra unidad de negocio.
    try:
        datos = _pedir("GET", _ruta_merchant(modo), modo=modo)
        perfil = datos.get("profile") or {}
        salida["merchant_nombre"] = perfil.get("name") or datos.get("name") or datos.get("slug")
    except KoyweError as e:
        raise KoyweError(f"la sesión funciona pero el comercio no responde — {e}") from e

    salida["metodos"] = catalogo(modo, refrescar=True)
    cuentas_transferencia(modo, refrescar=True)
    salida["cuentas"] = estado_cuentas(modo)
    return salida


# ── Cobro ────────────────────────────────────────────────────────────────────

# Tipos de documento que acepta su API, por país de pago. La lista completa la
# devuelve su propia validación: RUT, DNI, CUIL, CPF, CURP, CED_CIU, CED_EXT,
# NIT, NOP, RC, PP, DIE, EIN, SSN, RFC, RUC, VAT, HKID, CNID, NRIC, FIN, BN,
# OTHER, CUIT, CNPJ, TXID. Aquí solo van los que tienen sentido en cada país,
# porque esto se convierte en un desplegable para el cliente.
DOCUMENTOS = {
    "CL": [("RUT", "RUT"), ("PP", "Pasaporte")],
    "CO": [("CED_CIU", "Cédula de ciudadanía"), ("CED_EXT", "Cédula de extranjería"),
           ("NIT", "NIT"), ("PP", "Pasaporte")],
    "AR": [("DNI", "DNI"), ("CUIL", "CUIL"), ("CUIT", "CUIT"), ("PP", "Pasaporte")],
    "BR": [("CPF", "CPF"), ("CNPJ", "CNPJ"), ("PP", "Pasaporte")],
    "MX": [("CURP", "CURP"), ("RFC", "RFC"), ("PP", "Pasaporte")],
    "PE": [("DNI", "DNI"), ("RUC", "RUC"), ("PP", "Pasaporte")],
}

# Cómo se llamaban antes en nuestro formulario. Las órdenes viejas guardaron el
# nombre en castellano, y mandárselo a Koywe tal cual daba "documentType must
# be one of the following values".
EQUIVALENCIAS_DOC = {
    "RUT": "RUT",
    "CEDULA": "CED_CIU",
    "CEDULA DE CIUDADANIA": "CED_CIU",
    "CÉDULA": "CED_CIU",
    "CÉDULA DE CIUDADANÍA": "CED_CIU",
    "CEDULA DE EXTRANJERIA": "CED_EXT",
    "CÉDULA DE EXTRANJERÍA": "CED_EXT",
    "DNI": "DNI",
    "PASAPORTE": "PP",
    "PASSPORT": "PP",
    "NIT": "NIT",
    "CPF": "CPF",
    "CURP": "CURP",
    "RFC": "RFC",
    "RUC": "RUC",
    "CUIL": "CUIL",
    "CUIT": "CUIT",
    "CNPJ": "CNPJ",
}

CODIGOS_DOC = {c for lista in DOCUMENTOS.values() for c, _ in lista}


def documentos_de(moneda: str | None) -> list:
    """Tipos de documento que se le pueden ofrecer a quien paga en esa moneda."""
    pais = PAISES.get((moneda or "").upper(), "")
    return [{"codigo": c, "nombre": n} for c, n in DOCUMENTOS.get(pais, [])]


def tipo_documento(valor: str | None) -> str:
    """Traduce lo guardado en la orden al código que espera Koywe.

    Devuelve "" si no se reconoce, para que el campo se omita en vez de
    mandar algo que su API rechace entero.
    """
    crudo = (valor or "").strip().upper()
    if not crudo:
        return ""
    if crudo in CODIGOS_DOC:
        return crudo
    return EQUIVALENCIAS_DOC.get(crudo, "")


def _nombre_partido(nombre: str | None) -> tuple[str, str]:
    partes = (nombre or "").strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], partes[0]
    # Dos apellidos es lo normal en la región: la primera palabra es el nombre
    # y el resto el apellido. Partir por la mitad daría "Juan Carlos" / "Pérez
    # Gómez" en unos casos y basura en otros.
    return partes[0], " ".join(partes[1:])


# Prefijo telefónico de cada país donde se cobra. Koywe rechaza el contacto con
# "Invalid phone number" si el número no lleva código internacional, y el
# formulario de envío pide el teléfono tal y como lo marca la gente en su país
# ("959595959" en Chile). Sin esta traducción, ningún cobro con Khipu llegaba a
# crearse.
PREFIJOS = {"CL": "56", "AR": "54", "CO": "57", "MX": "52", "PE": "51", "BR": "55"}


def _telefono(telefono: str | None, pais: str) -> str:
    """Número en formato internacional, o "" si no se puede construir.

    Devolver "" y no un número dudoso es deliberado: el campo se omite del
    contacto, y para los métodos que no piden teléfono —Khipu, Clink— el cobro
    sigue adelante. Mandar algo inventado lo tumbaría entero.
    """
    crudo = (telefono or "").strip()
    if not crudo:
        return ""

    if crudo.startswith("+"):
        digitos = "".join(c for c in crudo[1:] if c.isdigit())
        return f"+{digitos}" if digitos else ""

    digitos = "".join(c for c in crudo if c.isdigit())
    if not digitos:
        return ""

    prefijo = PREFIJOS.get((pais or "").upper())
    if not prefijo:
        return ""

    # Puede venir ya con el código delante, sin el "+". Se distingue por el
    # largo: un móvil nacional no llega a los 11 dígitos en estos países, así
    # que si empieza por el prefijo y es largo, ya lo lleva.
    if digitos.startswith(prefijo) and len(digitos) >= len(prefijo) + 9:
        return f"+{digitos}"

    # Algunos los escriben con el cero de larga distancia delante.
    digitos = digitos.lstrip("0")
    if len(digitos) < 8:
        return ""

    return f"+{prefijo}{digitos}"


def _contacto_guardado(client_id) -> str:
    from models.user import User
    if not client_id:
        return ""
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == client_id).first()
        return (u.koywe_contact_id or "").strip() if u else ""
    except Exception as e:
        log.warning("[koywe] no se pudo leer el contacto guardado: %s", e)
        return ""
    finally:
        db.close()


def _guardar_contacto(client_id, contacto: str) -> None:
    from models.user import User
    if not client_id or not contacto:
        return
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == client_id).first()
        if u:
            u.koywe_contact_id = contacto
            db.commit()
    except Exception as e:
        db.rollback()
        # No es fatal: el cobro puede seguir. Solo significa que el próximo
        # intento volverá a buscarlo.
        log.warning("[koywe] no se pudo guardar el contacto %s: %s", contacto, e)
    finally:
        db.close()


def _buscar_contacto(email: str, telefono: str, modo: str) -> str:
    """Busca entre los contactos existentes por correo o teléfono.

    Su API no permite filtrar —ni `email`, ni `search`, ni paginar— y solo
    devuelve los 100 más recientes. Por eso esto es un último recurso para
    contactos que no creamos nosotros, y el camino normal es el id guardado en
    el cliente.
    """
    try:
        datos = _pedir("GET", f"{_ruta_merchant(modo)}/contacts", modo=modo,
                       params={"pageSize": 100})
    except KoyweError as e:
        log.warning("[koywe] no se pudo listar contactos: %s", e)
        return ""

    email = (email or "").strip().lower()
    telefono = (telefono or "").strip()
    for c in (datos.get("contacts") or []) if isinstance(datos, dict) else []:
        if not isinstance(c, dict):
            continue
        if email and (c.get("email") or "").strip().lower() == email:
            return c.get("id") or ""
        if telefono and (c.get("phone") or "").strip() == telefono:
            return c.get("id") or ""
    return ""


def _crear_contacto(order, email: str, pais: str, modo: str) -> str:
    """Devuelve el contacto del pagador en Koywe, creándolo si hace falta.

    Algunos métodos (PSE en Colombia) no funcionan sin documento, teléfono y
    correo del pagador. Koywe los quiere como contacto aparte, creado antes de
    la orden, y la orden solo lleva el `contactId`.

    Reutilizarlo no es una optimización: su API responde 409 «Contact with same
    email or phone already exists», así que crear uno nuevo en cada cobro haría
    que el segundo envío de cualquier cliente fallara. El id se guarda en el
    cliente; el rastreo por correo queda para los contactos que ya existían
    antes de esto o que se crearon desde el panel de Koywe.
    """
    telefono = _telefono(order.sender_phone, pais)

    guardado = _contacto_guardado(getattr(order, "client_id", None))
    if guardado:
        return guardado

    nombre, apellido = _nombre_partido(order.sender_name)
    cuerpo = {
        "firstName": nombre,
        "lastName": apellido,
        "email": email,
        "phone": telefono,
        "countrySymbol": pais,
        "documentType": tipo_documento(order.sender_id_type) or None,
        "documentNumber": order.sender_id_num or None,
        "businessType": "PERSON",
        "type": "PERSON",
    }
    cuerpo = {k: v for k, v in cuerpo.items() if v not in (None, "")}

    try:
        datos = _pedir("POST", f"{_ruta_merchant(modo)}/contacts", modo=modo, json=cuerpo)
    except KoyweError as e:
        # 409: ya existe uno con ese correo o ese teléfono. Es el caso normal
        # cuando el contacto se creó antes de que guardáramos su id.
        if "409" not in str(e) and "already exists" not in str(e):
            raise
        existente = _buscar_contacto(email, telefono, modo)
        if not existente:
            raise KoyweError(
                "Koywe dice que ya existe un contacto con ese correo o teléfono, "
                "pero no aparece entre los últimos 100. Búscalo en su panel y "
                "cambia el correo del cliente, o pídeles que lo borren."
            ) from e
        log.info("[koywe] contacto ya existente reutilizado: %s", existente)
        _guardar_contacto(getattr(order, "client_id", None), existente)
        return existente

    contacto = datos.get("id")
    if not contacto:
        raise KoyweError(f"Koywe no devolvió el contacto: {json.dumps(datos)[:300]}")

    _guardar_contacto(getattr(order, "client_id", None), contacto)
    return contacto


def _faltan_datos(order, email: str, requeridos: list, pais: str = "") -> list:
    """Qué exige el método que no tengamos. Se avisa antes de llamar a Koywe.

    El teléfono cuenta como ausente si no se puede poner en formato
    internacional: Koywe lo rechazaría igual, y es mejor decirlo aquí con
    nombre y apellido que devolver su "Invalid phone number".
    """
    tiene = {
        "email": bool(email),
        "phone": bool(_telefono(order.sender_phone, pais)),
        "firstname": bool(order.sender_name),
        "first_name": bool(order.sender_name),
        "lastname": bool(order.sender_name and len(order.sender_name.split()) > 1),
        "last_name": bool(order.sender_name and len(order.sender_name.split()) > 1),
        "documentnumber": bool(order.sender_id_num),
        "document_number": bool(order.sender_id_num),
        # No basta con que haya algo escrito: si no se traduce a un código que
        # Koywe conozca, el campo se omite y su API lo dará por ausente.
        "documenttype": bool(tipo_documento(order.sender_id_type)),
        "document_type": bool(tipo_documento(order.sender_id_type)),
    }
    etiquetas = {
        "email": "correo", "phone": "teléfono",
        "documentnumber": "número de documento", "document_number": "número de documento",
        "documenttype": "tipo de documento", "document_type": "tipo de documento",
        "lastname": "apellido", "last_name": "apellido",
    }
    faltan = []
    for campo in requeridos:
        clave = campo.strip().lower()
        if clave in tiene and not tiene[clave]:
            etiqueta = etiquetas.get(clave, campo)
            if etiqueta not in faltan:
                faltan.append(etiqueta)
    return faltan


def crear_cobro(order, metodo: str, volver_a: str, email: str = "") -> dict:
    """Crea la orden PAYIN y devuelve a dónde mandar al cliente a pagar.

    No toca la orden nuestra: quien decide si está pagada es el webhook, y solo
    después de preguntárselo a Koywe.
    """
    modo = get_mode()
    if not is_configured(modo):
        raise KoyweNotConfigured("Falta configurar las credenciales de Koywe")

    moneda = (order.currency_from or "").upper()
    elegido = _metodo_valido(moneda, metodo, modo)
    if not elegido:
        raise KoyweError(f"«{metodo}» no es un método de pago válido para {moneda}")

    # Los límites los pone el método, no nosotros. Comprobarlos aquí convierte
    # un rechazo críptico de su API en algo que el cliente entiende.
    monto = float(order.amount_sent or 0)
    minimo, maximo = elegido.get("minimo"), elegido.get("maximo")
    if minimo is not None and monto < float(minimo):
        raise KoyweError(f"{elegido['nombre']} no acepta menos de {minimo:,.0f} {moneda}")
    if maximo is not None and monto > float(maximo):
        raise KoyweError(f"{elegido['nombre']} no acepta más de {maximo:,.0f} {moneda}")

    pais = PAISES.get(moneda, "")

    # Toda orden PAYIN necesita contacto, diga lo que diga el método. Clink
    # declara `requiredFields.contact` vacío y aun así Koywe responde "Contact
    # is required for PAYIN orders" (CT00036). Así que se pide siempre, con el
    # correo y el nombre como mínimo para poder crearlo; lo que el método
    # exija además se suma a eso.
    requeridos = list(dict.fromkeys(
        list(elegido.get("requiere") or []) + ["email", "first_name"]))

    faltan = _faltan_datos(order, email, requeridos, pais)
    if faltan:
        raise KoyweError(f"{elegido['nombre']} exige {', '.join(faltan)} del remitente")

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

    cuerpo["contactId"] = _crear_contacto(order, email, pais, modo)

    datos = _pedir("POST", f"{_ruta_merchant(modo)}/orders", modo=modo, json=cuerpo)

    url = datos.get("providedAction")
    koywe_id = datos.get("id")
    if not url or not koywe_id:
        raise KoyweError(f"Koywe creó la orden pero sin URL de pago: {json.dumps(datos)[:300]}")

    log.info("[koywe] %s -> %s (%s %s por %s)",
             order.order_number, koywe_id, moneda, order.amount_sent, elegido["codigo"])
    return {"url": url, "koywe_order_id": koywe_id, "external_id": external_id,
            "metodo": elegido["nombre"]}


def consultar_orden(koywe_order_id: str, modo: str | None = None) -> dict:
    """Estado de una orden según Koywe. Fuente de verdad."""
    modo = modo or get_mode()
    return _pedir("GET", f"{_ruta_merchant(modo)}/orders/{koywe_order_id}", modo=modo)


# ── Webhook ──────────────────────────────────────────────────────────────────

def verificar_firma(cuerpo: bytes, firma: str | None, modo: str | None = None) -> bool:
    """HMAC-SHA256 del cuerpo exacto con el secreto del endpoint.

    Sobre los bytes tal y como llegaron, no sobre el JSON re-serializado: un
    espacio de más o un orden de claves distinto cambia el hash y tiraría
    avisos legítimos.

    Hoy no se usa como única defensa porque Koywe no entrega el secreto; si
    algún día lo entrega, esto empieza a comprobarse ADEMÁS de la consulta a su
    API, no en su lugar.
    """
    secreto = _config(CLAVE_WEBHOOK, modo)
    if not secreto or not firma:
        return False
    esperada = hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    # La cabecera puede venir como "sha256=abc..." según cómo la emitan.
    recibida = firma.strip().split("=")[-1].strip()
    return hmac.compare_digest(esperada, recibida)


def datos_de_evento(evento: dict) -> dict:
    """Saca lo que importa del aviso, que viene en snake_case.

    Su formato real, comprobado contra eventos de la cuenta:

        {"type": "order.paid",
         "data": {"status": "PAID", "external_id": "CC-2026-0011-1699…"},
         "relationships": {"self": {"type": "order", "id": "ord_…"}}}

    El id de la orden NO está en `data`, sino en `relationships.self.id`. La
    primera versión lo buscaba en `data.orderId` y no encontraba ninguna orden.
    """
    if not isinstance(evento, dict):
        return {"tipo": "", "koywe_id": "", "external_id": None, "estado": ""}

    datos = evento.get("data")
    datos = datos if isinstance(datos, dict) else {}
    rel = evento.get("relationships")
    rel = rel if isinstance(rel, dict) else {}
    propia = rel.get("self")
    propia = propia if isinstance(propia, dict) else {}

    koywe_id = propia.get("id") or datos.get("order_id") or datos.get("orderId") or ""
    external = datos.get("external_id") or datos.get("externalId")

    return {
        "tipo": (evento.get("type") or "").strip(),
        "koywe_id": str(koywe_id).strip(),
        "external_id": external,
        "estado": (datos.get("status") or "").strip().upper(),
    }


def confirmar_pago(koywe_order_id: str, modo: str | None = None) -> dict:
    """Le pregunta a Koywe si esa orden está pagada de verdad.

    Esto es lo que sustituye a la firma. Devuelve lo necesario para cotejar el
    aviso con nuestra orden: estado, monto, moneda y nuestro externalId.
    """
    datos = consultar_orden(koywe_order_id, modo)
    if not isinstance(datos, dict):
        raise KoyweError("Koywe devolvió una orden con formato inesperado")

    estado = (datos.get("status") or datos.get("state") or "").strip().upper()
    monto = datos.get("amountIn")
    if monto is None:
        monto = datos.get("amount_in")
    moneda = (datos.get("originCurrencySymbol") or datos.get("origin_currency_symbol") or "")

    return {
        "estado": estado,
        "pagada": estado in ESTADOS_PAGADOS,
        "monto": monto,
        "moneda": moneda.upper(),
        "external_id": datos.get("externalId") or datos.get("external_id"),
    }


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
