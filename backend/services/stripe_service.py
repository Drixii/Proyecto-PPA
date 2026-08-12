"""Cobro con tarjeta vía Stripe.

Hoy todos los cobros van a una única cuenta, la del `.env`. Más adelante cada
super-admin conectará la suya y el dinero de sus clientes caerá directamente
en su cuenta.

Toda la integración pasa por `get_stripe_context()`: es el único sitio que
decide con qué cuenta se cobra una orden. Cuando toque migrar a Stripe
Connect, se cambia esa función para que mire la cuenta conectada del
super-admin dueño (la orden ya lleva `super_admin_id`) y el resto del código
sigue igual. No se guardan claves de nadie: en Connect el admin se da de alta
en un formulario alojado por Stripe y aquí solo queda su `acct_...`.
"""
import os
from dataclasses import dataclass

import stripe

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

    Hoy siempre la del .env. El día que exista el panel de integraciones,
    aquí se busca la cuenta conectada de `super_admin_id` y se devuelve su
    `acct_...` en `connected_account_id`; los cobros pasan a ir a esa cuenta
    sin tocar nada más.
    """
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise StripeNotConfigured(
            "Falta STRIPE_SECRET_KEY en el .env — el pago con tarjeta está desactivado"
        )
    return StripeContext(secret_key=key)


def is_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY", "").strip())


def publishable_key() -> str:
    return os.environ.get("STRIPE_PUBLISHABLE_KEY", "").strip()


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

    # Sobre la cuenta conectada cuando exista; hoy siempre vacío.
    extra = {}
    if ctx.connected_account_id:
        extra["stripe_account"] = ctx.connected_account_id

    # Reutilizar el intento si la orden ya tiene uno vivo: si el cliente
    # recarga la página no se crean cobros sueltos en el panel de Stripe.
    if order.payment_intent_id:
        try:
            intent = stripe.PaymentIntent.retrieve(order.payment_intent_id, **extra)
            if intent.status not in ("canceled", "succeeded"):
                return {"client_secret": intent.client_secret, "payment_intent_id": intent.id}
        except stripe.error.StripeError:
            pass  # se crea uno nuevo

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
    return {"client_secret": intent.client_secret, "payment_intent_id": intent.id}


def verify_webhook(payload: bytes, signature: str):
    """Comprueba que el evento viene de Stripe de verdad.

    Sin esto el endpoint sería un botón público para marcar órdenes como
    pagadas: cualquiera podría enviar un JSON diciendo que la orden 5 se pagó.
    """
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise StripeNotConfigured("Falta STRIPE_WEBHOOK_SECRET en el .env")
    return stripe.Webhook.construct_event(payload, signature, secret)
