"""Global66: avisos de dinero recibido en las cuentas bancarias de la empresa.

Qué hace esto y qué NO hace
---------------------------
Global66 avisa por webhook (`MONEY_RECEIVED`) cuando entra plata en una de las
cuentas de la empresa. Aquí ese aviso se guarda y se le sugiere al admin qué
orden podría ser. **Ninguna orden se aprueba ni se marca pagada desde aquí.**

El motivo es concreto, no prudencia genérica:

1. **El aviso no trae glosa ni referencia.** La documentación del evento no
   define ningún campo libre donde meter el número de orden. Lo más parecido a
   una identificación es `thirdPartyClientName` (el nombre de quien transfirió).
   Cruzar por nombre + monto + moneda acierta casi siempre, pero "casi" no es
   suficiente para mover dinero solo.
2. **La autenticación es una clave fija (`x-api-key`), no una firma.** Con
   Stripe, cada evento va firmado con su cuerpo: falsificarlo exige el secreto
   Y recalcular el HMAC. Aquí basta con conocer la clave para inventarse un
   depósito. Si esa clave se filtra y esto aprobara solo, cualquiera podría
   fabricar envíos gratis.
3. **Global66 no reintenta.** Si el endpoint falla, el aviso se pierde para
   siempre. Por eso el webhook responde 200 salvo que la clave esté mal, y todo
   fallo de guardado se registra con el cuerpo entero en el log.

Cuando llevemos un tiempo viendo avisos reales y sepamos que el cruce acierta,
se decide si automatizar. Hasta entonces esto es un ayudante, no un cajero.
"""
import hmac
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from database import SessionLocal
# El modo (prueba/real) es uno solo para toda la plataforma. La clave se llama
# "stripe_mode" por historia: existía antes de que hubiera otros proveedores.
from services.stripe_service import get_mode

CLAVE_WEBHOOK = "global66_webhook_key"    # x-api-key que ellos generan al registrar el endpoint
CLAVE_CLIENT_ID = "global66_client_id"
CLAVE_CLIENT_SECRET = "global66_client_secret"

CAMPOS = (CLAVE_WEBHOOK, CLAVE_CLIENT_ID, CLAVE_CLIENT_SECRET)
# Estos dos identifican la cuenta, no dan acceso: se pueden mostrar enteros.
CAMPOS_PUBLICOS = (CLAVE_CLIENT_ID,)

URLS = {
    "test": "https://api-sandbox.global66.com",
    "live": "https://api.global66.com",
}

# Estados en los que el dinero ya está disponible. En PENDING la transferencia
# todavía puede volverse atrás, así que no cuenta como recibida.
ESTADOS_CONFIRMADOS = ("COMPLETED", "PAID", "RELEASED", "SUCCESS")

# Cuánto hacia atrás se buscan órdenes candidatas. Una transferencia bancaria
# entre países puede tardar días en aparecer.
VENTANA_DIAS = 10

# Tolerancia de monto. Algunos bancos corresponsales descuentan comisión en
# tránsito y llega algo menos de lo que el cliente envió.
TOLERANCIA = 0.02


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
        print(f"[global66] no se pudo leer '{nombre}': {e}")
        valor = None
    finally:
        db.close()
    if not valor:
        valor = os.environ.get(nombre.upper(), "")
    return (valor or "").strip()


def credenciales(modo: str | None = None) -> dict:
    return {c: _config(c, modo) for c in CAMPOS}


def webhook_listo(modo: str | None = None) -> bool:
    """Basta la clave del webhook para empezar a RECIBIR avisos.

    Las credenciales de API hacen falta después, para verificar contra ellos
    antes de dar un depósito por bueno. Se piden aparte para que registrar el
    endpoint no quede bloqueado esperando el resto.
    """
    return bool(_config(CLAVE_WEBHOOK, modo))


def api_lista(modo: str | None = None) -> bool:
    return bool(_config(CLAVE_CLIENT_ID, modo) and _config(CLAVE_CLIENT_SECRET, modo))


def verificar_api_key(recibida: str | None, modo: str | None = None) -> bool:
    """Compara la cabecera x-api-key con la guardada.

    compare_digest y no ==: comparar cadenas normalmente corta en el primer
    carácter distinto, y ese tiempo de más deja adivinar la clave a base de
    intentos. Aquí el coste de usarlo es cero.
    """
    esperada = _config(CLAVE_WEBHOOK, modo)
    if not esperada or not recibida:
        return False
    return hmac.compare_digest(esperada, recibida.strip())


def es_confirmado(status: str | None) -> bool:
    return (status or "").strip().upper() in ESTADOS_CONFIRMADOS


# ── Cruce con órdenes ────────────────────────────────────────────────────────

_LIMPIA = re.compile(r"[^A-Za-z0-9 ]")


def _tokens(nombre: str | None) -> set:
    """Nombre → conjunto de palabras comparables.

    Se quitan tildes y puntuación porque el banco y el formulario casi nunca
    escriben igual: "José Pérez-Gómez" contra "JOSE PEREZ GOMEZ". Se descartan
    las palabras de 2 letras o menos (de, la, y) que casarían con cualquiera.
    """
    s = unicodedata.normalize("NFKD", nombre or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = _LIMPIA.sub(" ", s).upper()
    return {t for t in s.split() if len(t) > 2}


def parecido_nombre(a: str | None, b: str | None) -> float:
    """0..1. Cuánto se parecen dos nombres de persona.

    Se divide por el más corto, no por la unión: el banco suele mandar el
    nombre completo con dos apellidos y el formulario solo uno. "JUAN PEREZ"
    contra "JUAN CARLOS PEREZ GOMEZ" es la misma persona y debe dar 1.
    """
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def sugerir_orden(db: Session, deposito) -> tuple[int | None, str]:
    """Qué orden podría ser este depósito. Devuelve (order_id, explicación).

    Nunca modifica nada. Si hay más de una candidata igual de buena, no elige:
    dos órdenes del mismo cliente por el mismo monto el mismo día son
    indistinguibles con los datos que manda Global66, y adivinar sería peor
    que decir que no se sabe.
    """
    from models.order import Order

    if not deposito.amount or not deposito.currency:
        return None, "El aviso llegó sin monto o sin moneda"

    desde = datetime.now(timezone.utc) - timedelta(days=VENTANA_DIAS)
    margen = abs(deposito.amount) * TOLERANCIA

    from sqlalchemy import or_
    from services.koywe_service import CODIGOS as CODIGOS_KOYWE

    # Fuera las que se cobran en un portal externo: quien eligió Khipu o
    # tarjeta no nos transfiere al banco, así que cruzarlas con un depósito
    # solo añade candidatas falsas que compiten con la de verdad.
    #
    # El OR con NULL no sobra: en SQL, `NULL NOT IN (...)` no es cierto sino
    # desconocido, y sin esto las órdenes antiguas sin método se caerían del
    # cruce sin que nadie lo notara.
    externos = tuple(CODIGOS_KOYWE) + ("tarjeta",)

    candidatas = db.query(Order).filter(
        Order.deleted_at == None,
        Order.paid_at == None,
        Order.status.in_(("en_aprobacion", "pendiente_pago")),
        or_(Order.payment_method == None, Order.payment_method.notin_(externos)),
        Order.currency_from == deposito.currency.upper(),
        Order.created_at >= desde,
        Order.amount_sent >= deposito.amount - margen,
        Order.amount_sent <= deposito.amount + margen,
    ).all()

    if not candidatas:
        return None, "Ninguna orden pendiente coincide en monto y moneda"

    if len(candidatas) == 1 and not deposito.remitter_name:
        o = candidatas[0]
        return o.id, f"Única orden pendiente con ese monto ({o.order_number}). Sin nombre del remitente para confirmar"

    puntuadas = sorted(
        ((parecido_nombre(deposito.remitter_name, o.sender_name), o) for o in candidatas),
        key=lambda p: p[0],
        reverse=True,
    )
    mejor, orden = puntuadas[0]

    if mejor < 0.5:
        nums = ", ".join(o.order_number for _, o in puntuadas[:3])
        return None, f"El monto cuadra con {len(candidatas)} orden(es) ({nums}) pero el nombre del remitente no coincide"

    # Empate real: dos órdenes con el mismo nombre y el mismo monto.
    if len(puntuadas) > 1 and puntuadas[1][0] >= mejor:
        nums = ", ".join(o.order_number for _, o in puntuadas[:3])
        return None, f"Coinciden varias por igual ({nums}) — hay que elegir a mano"

    exacto = abs(orden.amount_sent - deposito.amount) < 0.01
    detalle = "monto exacto" if exacto else f"monto con diferencia de {abs(orden.amount_sent - deposito.amount):.2f}"

    # Una sola palabra en común suele ser el nombre de pila, y de esos hay
    # muchos. Se sugiere igual, pero diciendo que la prueba es floja.
    comunes = _tokens(deposito.remitter_name) & _tokens(orden.sender_name)
    fuerza = "el nombre del remitente coincide" if len(comunes) > 1 else \
        f"solo coincide «{next(iter(comunes))}» del nombre — revísalo"

    return orden.id, f"{orden.order_number}: {detalle} y {fuerza}"
