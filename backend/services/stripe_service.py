"""Cobro con tarjeta vía Stripe, con Stripe Connect.

Cada super-admin conecta su propia cuenta y el dinero de SUS clientes entra
directamente ahí (cargo directo), sin pasar por la cuenta de la plataforma.
Quien no la haya conectado todavía cobra en la cuenta de la plataforma, la
del `.env`.

Toda la integración pasa por `get_stripe_context()`: es el único sitio que
decide con qué cuenta se cobra una orden, y la orden ya sabe de quién es
(`super_admin_id`).

Aquí no se guarda la clave de nadie. El admin se da de alta en un formulario
alojado por Stripe y lo único que vuelve es su `acct_...`.
"""
import os
from dataclasses import dataclass

import stripe

from database import SessionLocal

# Claves guardadas desde Ajustes → Integraciones de pago (cifradas, ver
# services/secret_store.py). Las variables de entorno siguen funcionando como
# respaldo para no romper una instalación ya configurada por .env.
CLAVE_SECRETA = "stripe_secret_key"
CLAVE_PUBLICA = "stripe_publishable_key"
CLAVE_WEBHOOK = "stripe_webhook_secret"
CLAVE_WEBHOOK_CONNECT = "stripe_connect_webhook_secret"


def _config(nombre: str, env: str) -> str:
    """Valor guardado en la base; si no hay, el del .env."""
    from services.secret_store import get_secret
    db = SessionLocal()
    try:
        valor = get_secret(db, nombre)
    except Exception as e:
        print(f"[stripe] no se pudo leer '{nombre}' de la base: {e}")
        valor = None
    finally:
        db.close()
    return (valor or os.environ.get(env, "")).strip()


def secret_key() -> str:
    return _config(CLAVE_SECRETA, "STRIPE_SECRET_KEY")

# Monedas que Stripe cuenta en unidades enteras, sin céntimos. Para el resto
# hay que multiplicar por 100. Equivocarse aquí cobra 100 veces de más o de
# menos: 200.000 CLP son 200000, no 20000000.
# https://docs.stripe.com/currencies#zero-decimal
ZERO_DECIMAL_CURRENCIES = {
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
}


class StripeNotConfigured(RuntimeError):
    pass


@dataclass
class StripeContext:
    secret_key: str
    # Cuenta conectada a la que va el dinero. None = la cuenta de la
    # plataforma (el modo de hoy).
    connected_account_id: str | None = None


def get_stripe_context(db=None, super_admin_id: int | None = None) -> StripeContext:
    """Con qué cuenta de Stripe se cobra esta orden.

    Si el super-admin dueño tiene su cuenta conectada y ya puede cobrar, el
    cargo se hace SOBRE su cuenta (cargo directo): el dinero entra
    directamente ahí, no pasa por la cuenta de la plataforma.

    Si no la tiene, se cobra en la cuenta de la plataforma, que es el modo con
    el que arrancó esto.
    """
    key = secret_key()
    if not key:
        raise StripeNotConfigured(
            "Stripe no está configurado — añade las claves en Ajustes → Integraciones de pago"
        )

    connected = None
    if db is not None and super_admin_id:
        from models.stripe_account import StripeAccount
        acc = db.query(StripeAccount).filter(
            StripeAccount.super_admin_id == super_admin_id
        ).first()
        # charges_enabled: Stripe no deja cobrar hasta que el admin termina de
        # verificarse. Sin esta comprobación el cliente vería un error del
        # cobro en vez de que se use la cuenta de la plataforma.
        if acc and acc.charges_enabled:
            connected = acc.account_id

    return StripeContext(secret_key=key, connected_account_id=connected)


# ── Connect: alta de cuentas de los super-admins ──────────────────────────────

def _api():
    key = secret_key()
    if not key:
        raise StripeNotConfigured(
            "Stripe no está configurado — añade las claves en Ajustes → Integraciones de pago"
        )
    stripe.api_key = key


def create_connected_account(email: str, country: str = "CL") -> str:
    """Crea la cuenta conectada vacía. Devuelve el acct_..."""
    _api()
    acct = stripe.Account.create(
        type="express",
        email=email,
        capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
        country=country,
    )
    return acct.id


def onboarding_link(account_id: str, return_url: str, refresh_url: str) -> str:
    """Enlace al formulario de alta de Stripe.

    Caduca en minutos y es de un solo uso: por eso se genera cada vez que el
    admin pulsa el botón, en vez de guardarlo.
    """
    _api()
    link = stripe.AccountLink.create(
        account=account_id,
        return_url=return_url,
        refresh_url=refresh_url,
        type="account_onboarding",
    )
    return link.url


def fetch_account_status(account_id: str) -> dict:
    _api()
    acct = stripe.Account.retrieve(account_id)
    return {
        "charges_enabled": bool(acct.charges_enabled),
        "details_submitted": bool(acct.details_submitted),
    }


def login_link(account_id: str) -> str:
    """Acceso al panel de Stripe del propio admin (Express dashboard)."""
    _api()
    return stripe.Account.create_login_link(account_id).url


def is_configured() -> bool:
    return bool(secret_key())


def publishable_key() -> str:
    return _config(CLAVE_PUBLICA, "STRIPE_PUBLISHABLE_KEY")


def to_stripe_amount(amount: float, currency: str) -> int:
    """Monto en la unidad mínima que espera Stripe."""
    currency = currency.upper()
    if currency in ZERO_DECIMAL_CURRENCIES:
        return int(round(amount))
    return int(round(amount * 100))


def create_payment_intent(order, db=None) -> dict:
    """Crea (o recupera) el intento de pago de una orden.

    Devuelve el client_secret que el navegador necesita para mostrar el
    formulario de tarjeta. La confirmación NO se hace aquí: llega por webhook
    firmado desde Stripe. El navegador puede mentir; el webhook no.
    """
    ctx = get_stripe_context(db, getattr(order, "super_admin_id", None))
    stripe.api_key = ctx.secret_key

    # Cargo directo sobre la cuenta del admin cuando la tiene conectada.
    extra = {}
    if ctx.connected_account_id:
        extra["stripe_account"] = ctx.connected_account_id

    # Reutilizar el intento si la orden ya tiene uno vivo: si el cliente
    # recarga la página no se crean cobros sueltos en el panel de Stripe.
    if order.payment_intent_id:
        try:
            intent = stripe.PaymentIntent.retrieve(order.payment_intent_id, **extra)
            if intent.status not in ("canceled", "succeeded"):
                return {
                    "client_secret": intent.client_secret,
                    "payment_intent_id": intent.id,
                    "connected_account_id": ctx.connected_account_id,
                }
        except stripe.error.StripeError:
            pass  # se crea uno nuevo

    # NOTA para el frontend: cuando hay cuenta conectada, Stripe.js debe
    # inicializarse con {stripeAccount: acct_...} o el client_secret no se
    # puede confirmar. Por eso se devuelve abajo.
    intent = stripe.PaymentIntent.create(
        amount=to_stripe_amount(order.amount_sent, order.currency_from),
        currency=order.currency_from.lower(),
        automatic_payment_methods={"enabled": True},
        # metadata viaja de vuelta en el webhook: es como se sabe qué orden
        # pagar sin fiarse de lo que diga el navegador.
        metadata={
            "order_id": str(order.id),
            "order_number": order.order_number,
            "super_admin_id": str(order.super_admin_id or ""),
        },
        description=f"{order.order_number} · {order.sender_name} → {order.receiver_name} ({order.receiver_country})",
        **extra,
    )
    return {
        "client_secret": intent.client_secret,
        "payment_intent_id": intent.id,
        "connected_account_id": ctx.connected_account_id,
    }


def verify_webhook(payload: bytes, signature: str):
    """Comprueba que el evento viene de Stripe de verdad.

    Sin esto el endpoint sería un botón público para marcar órdenes como
    pagadas: cualquiera podría enviar un JSON diciendo que la orden 5 se pagó.

    Se prueban dos secretos porque en Stripe cada endpoint tiene el suyo y los
    pagos llegan por dos vías: los de la cuenta de la plataforma y los de las
    cuentas conectadas (webhook de Connect). Con un solo secreto configurado
    funciona igual; el segundo es opcional.
    """
    secretos = [
        _config(CLAVE_WEBHOOK, "STRIPE_WEBHOOK_SECRET"),
        _config(CLAVE_WEBHOOK_CONNECT, "STRIPE_CONNECT_WEBHOOK_SECRET"),
    ]
    secretos = [s for s in secretos if s]
    if not secretos:
        raise StripeNotConfigured(
            "Falta el secreto del webhook — añádelo en Ajustes → Integraciones de pago"
        )

    ultimo_error = None
    for secret in secretos:
        try:
            return stripe.Webhook.construct_event(payload, signature, secret)
        except Exception as e:
            ultimo_error = e
    raise ultimo_error
