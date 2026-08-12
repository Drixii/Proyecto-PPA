"""Cobro con tarjeta (Stripe).

Regla de oro: el navegador no decide si una orden está pagada. El cliente
puede editar la respuesta de JavaScript, cerrar la pestaña a mitad o abrir la
URL de éxito a mano. La única señal que mueve una orden a en_proceso es el
webhook firmado que manda Stripe.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models.order import Order
from models.user import User
from auth.dependencies import get_current_user
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
        },
        "message": "",
    }


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
