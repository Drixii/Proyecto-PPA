"""Cobro con tarjeta (Stripe).

Regla de oro: el navegador no decide si una orden está pagada. El cliente
puede editar la respuesta de JavaScript, cerrar la pestaña a mitad o abrir la
URL de éxito a mano. La única señal que mueve una orden a en_proceso es el
webhook firmado que manda Stripe.
"""
import os
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models.order import Order
from models.user import User
from models.stripe_account import StripeAccount
from auth.dependencies import get_current_user, require_super_admin
from services import stripe_service
from services.order_service import find_sub_admin_for_country

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("/config", response_model=dict)
def payment_config():
    """Lo que el navegador necesita saber para pintar el formulario."""
    return {
        "success": True,
        "data": {
            "enabled": stripe_service.is_configured(),
            "publishable_key": stripe_service.publishable_key(),
        },
        "message": "",
    }


# def y no async def: la librería de Stripe es síncrona y sale a la red. En
# async def bloquearía el event loop y con él el chat y todo lo demás.
@router.post("/orders/{order_id}/intent", response_model=dict)
def create_intent(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.client_id == current_user.id,
        Order.deleted_at == None,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if (order.payment_method or "").lower() != "tarjeta":
        raise HTTPException(status_code=400, detail="Esta orden no es de pago con tarjeta")
    if order.paid_at:
        raise HTTPException(status_code=400, detail="Esta orden ya está pagada")

    try:
        result = stripe_service.create_payment_intent(order, db)
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe rechazó la operación: {e}")

    order.payment_intent_id = result["payment_intent_id"]
    db.commit()

    return {
        "success": True,
        "data": {
            "client_secret": result["client_secret"],
            "publishable_key": stripe_service.publishable_key(),
            # Si la orden se cobra en la cuenta de un admin, Stripe.js tiene
            # que inicializarse apuntando a esa cuenta o el client_secret no
            # se puede confirmar.
            "connected_account_id": result.get("connected_account_id"),
        },
        "message": "",
    }


# ── Claves de la plataforma ───────────────────────────────────────────────────


class StripeKeysIn(BaseModel):
    secret_key: Optional[str] = None
    publishable_key: Optional[str] = None
    webhook_secret: Optional[str] = None
    connect_webhook_secret: Optional[str] = None


@router.get("/stripe/keys", response_model=dict)
def get_stripe_keys(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Estado de las claves. Nunca devuelve los secretos completos.

    La clave pública sí va entera: es la que el navegador usa de todos modos.
    Las secretas salen enmascaradas (sk_live_••••4242), lo justo para saber
    cuál está puesta sin poder copiarla desde aquí.
    """
    from services import secret_store as ss

    secreta = ss.get_secret(db, stripe_service.CLAVE_SECRETA)
    webhook = ss.get_secret(db, stripe_service.CLAVE_WEBHOOK)
    connect = ss.get_secret(db, stripe_service.CLAVE_WEBHOOK_CONNECT)

    return {
        "success": True,
        "data": {
            "secret_key": ss.mask(secreta),
            "publishable_key": stripe_service.publishable_key(),
            "webhook_secret": ss.mask(webhook),
            "connect_webhook_secret": ss.mask(connect),
            "modo_prueba": bool(secreta and secreta.startswith("sk_test")),
            # Si la clave viene del .env no se puede editar desde aquí: se
            # sobrescribiría la de la base y seguiría mandando la del entorno.
            "desde_env": bool(not secreta and os.environ.get("STRIPE_SECRET_KEY")),
        },
        "message": "",
    }


@router.put("/stripe/keys", response_model=dict)
def save_stripe_keys(
    data: StripeKeysIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Guarda las claves cifradas.

    Un campo vacío o ausente NO borra la clave existente: el formulario nunca
    recibe los secretos, así que enviarlos vacíos es lo normal cuando el admin
    solo quiere cambiar uno. Para borrar se manda la palabra BORRAR.
    """
    from services import secret_store as ss

    campos = [
        # rk_ son las claves restringidas. Se aceptan, pero tienen que llevar
        # permisos de PaymentIntents y de Connect (cuentas y enlaces de alta);
        # si les falta alguno, Stripe responde con un error de permisos al
        # usarla, no al guardarla.
        (data.secret_key, stripe_service.CLAVE_SECRETA,
         ("sk_test_", "sk_live_", "rk_test_", "rk_live_"), "clave secreta"),
        (data.publishable_key, stripe_service.CLAVE_PUBLICA, ("pk_test_", "pk_live_"), "clave publicable"),
        (data.webhook_secret, stripe_service.CLAVE_WEBHOOK, ("whsec_",), "secreto del webhook"),
        (data.connect_webhook_secret, stripe_service.CLAVE_WEBHOOK_CONNECT, ("whsec_",), "secreto del webhook de Connect"),
    ]

    guardadas = []
    for valor, clave, prefijos, etiqueta in campos:
        if valor is None:
            continue
        valor = valor.strip()
        if not valor:
            continue
        if valor == "BORRAR":
            ss.set_secret(db, clave, "")
            guardadas.append(f"{etiqueta} borrada")
            continue
        if not valor.startswith(prefijos):
            raise HTTPException(
                status_code=400,
                detail=f"La {etiqueta} debería empezar por {' o '.join(prefijos)}",
            )
        ss.set_secret(db, clave, valor)
        guardadas.append(etiqueta)

    if not guardadas:
        return {"success": True, "data": {}, "message": "No había nada que guardar"}

    return {"success": True, "data": {}, "message": "Guardado: " + ", ".join(guardadas)}


# ── Stripe Connect: cada super-admin conecta su cuenta ────────────────────────

def _account_state(acc) -> dict:
    if not acc:
        return {"connected": False, "charges_enabled": False, "details_submitted": False, "account_id": None}
    return {
        "connected": True,
        "charges_enabled": acc.charges_enabled,
        "details_submitted": acc.details_submitted,
        "account_id": acc.account_id,
    }


@router.get("/stripe/account", response_model=dict)
def my_stripe_account(
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Estado de la cuenta conectada del admin que pregunta.

    Refresca contra Stripe: el admin puede haber terminado su verificación
    hace un minuto en otra pestaña, y hasta entonces `charges_enabled` sigue
    en false aquí y sus clientes cobrarían en la cuenta de la plataforma.
    """
    acc = db.query(StripeAccount).filter(StripeAccount.super_admin_id == admin.id).first()
    if acc and stripe_service.is_configured():
        try:
            estado = stripe_service.fetch_account_status(acc.account_id)
            acc.charges_enabled = estado["charges_enabled"]
            acc.details_submitted = estado["details_submitted"]
            db.commit()
        except Exception as e:
            print(f"[stripe] no se pudo refrescar {acc.account_id}: {e}")

    return {
        "success": True,
        "data": {
            **_account_state(acc),
            "platform_configured": stripe_service.is_configured(),
        },
        "message": "",
    }


@router.post("/stripe/account/onboard", response_model=dict)
def start_onboarding(
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Devuelve la URL del formulario de alta de Stripe."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Falta configurar Stripe en el servidor")

    acc = db.query(StripeAccount).filter(StripeAccount.super_admin_id == admin.id).first()
    try:
        if not acc:
            account_id = stripe_service.create_connected_account(admin.email)
            acc = StripeAccount(super_admin_id=admin.id, account_id=account_id)
            db.add(acc)
            db.commit()
            db.refresh(acc)

        base = os.environ.get("FRONTEND_URL", "").rstrip("/") or "https://cambios.ksatokio.com"
        url = stripe_service.onboarding_link(
            acc.account_id,
            return_url=f"{base}/admin/settings",
            refresh_url=f"{base}/admin/settings",
        )
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe rechazó la operación: {e}")

    return {"success": True, "data": {"url": url}, "message": ""}


@router.get("/stripe/account/dashboard", response_model=dict)
def stripe_dashboard_link(
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Enlace al panel de Stripe del propio admin, para ver sus cobros."""
    acc = db.query(StripeAccount).filter(StripeAccount.super_admin_id == admin.id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="No tienes cuenta conectada")
    try:
        return {"success": True, "data": {"url": stripe_service.login_link(acc.account_id)}, "message": ""}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe rechazó la operación: {e}")


def _mark_paid(payment_intent_id: str, order_id: int | None):
    """Marca la orden como pagada y la deriva al encargado del país.

    Se ejecuta desde el webhook. Idempotente: Stripe reintenta los eventos y
    puede entregar el mismo varias veces; si ya está pagada no se hace nada,
    porque volver a notificar al encargado le haría creer que hay dos envíos.
    """
    db = SessionLocal()
    try:
        order = None
        if order_id:
            order = db.query(Order).filter(Order.id == order_id).first()
        if not order and payment_intent_id:
            order = db.query(Order).filter(Order.payment_intent_id == payment_intent_id).first()
        if not order:
            print(f"[stripe] pago {payment_intent_id} sin orden asociada — se ignora")
            return
        if order.paid_at:
            return  # ya procesado

        order.paid_at = datetime.now(timezone.utc)
        order.payment_intent_id = payment_intent_id
        old_status = order.status
        order.status = "en_proceso"
        order.sub_admin_id = find_sub_admin_for_country(
            db, order.receiver_country, order.super_admin_id
        )
        db.commit()
        db.refresh(order)

        try:
            from services.notification_service import notify_status_change, notify_sub_admin
            notify_status_change(db, order, old_status, "en_proceso")
            if order.sub_admin_id:
                notify_sub_admin(db, order, order.sub_admin_id)
        except Exception as e:
            print(f"[stripe] pago registrado pero fallaron las notificaciones: {e}")

        print(f"[stripe] {order.order_number} pagada ({payment_intent_id})")
    finally:
        db.close()


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Recibe los eventos de Stripe.

    async def porque hace falta el cuerpo crudo de la petición para validar la
    firma (`await request.body()`); el trabajo con la base, que sí bloquea, se
    manda al threadpool.
    """
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.verify_webhook(payload, signature)
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        # Firma inválida: o es un intento de marcar órdenes como pagadas a
        # mano, o el secreto del .env no coincide con el del panel de Stripe.
        raise HTTPException(status_code=400, detail="Firma inválida")

    if event["type"] == "payment_intent.succeeded":
        intent = event["data"]["object"]
        raw_order_id = (intent.get("metadata") or {}).get("order_id")
        try:
            order_id = int(raw_order_id) if raw_order_id else None
        except ValueError:
            order_id = None
        await run_in_threadpool(_mark_paid, intent["id"], order_id)

    # 200 siempre que la firma sea válida: un error aquí hace que Stripe
    # reintente el evento en bucle.
    return {"received": True}
