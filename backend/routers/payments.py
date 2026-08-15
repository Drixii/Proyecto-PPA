"""Cobro con tarjeta (Stripe).

Regla de oro: el navegador no decide si una orden está pagada. El cliente
puede editar la respuesta de JavaScript, cerrar la pestaña a mitad o abrir la
URL de éxito a mano. La única señal que mueve una orden a en_proceso es el
webhook firmado que manda Stripe.
"""
import json
import logging
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
from services import stripe_service, koywe_service, global66_service
from services.order_service import find_sub_admin_for_country

router = APIRouter(prefix="/api/payments", tags=["payments"])
log = logging.getLogger("ppa")

# Los errores de Stripe se devuelven como 400, no como 502/503. El sitio está
# detrás de Cloudflare, que reemplaza cualquier 5xx del origen por su propia
# pantalla ("The origin web server returned an invalid or incomplete
# response"): el admin veía un error de infraestructura en vez del motivo
# real, que era una casilla sin rellenar en su panel de Stripe.


@router.get("/config", response_model=dict)
def payment_config():
    """Lo que el navegador necesita saber para pintar el formulario."""
    koywe_listo = koywe_service.is_configured()
    return {
        "success": True,
        "data": {
            "enabled": stripe_service.is_configured(),
            "publishable_key": stripe_service.publishable_key(),
            "currencies": list(stripe_service.CARD_CURRENCIES),
            "koywe": {
                "enabled": koywe_listo,
                "currencies": list(koywe_service.KOYWE_CURRENCIES),
                # El catálogo entero de una vez: el selector cambia de moneda
                # sin volver a preguntar, y sin métodos si Koywe no está
                # configurado, para que nadie elija uno que no puede cobrar.
                "methods": (
                    {moneda: metodos for moneda, (_, metodos) in koywe_service.METODOS.items()}
                    if koywe_listo else {}
                ),
            },
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
    if (order.currency_from or "").upper() not in stripe_service.CARD_CURRENCIES:
        raise HTTPException(
            status_code=400,
            detail=f"El pago con tarjeta solo está disponible en {' y '.join(stripe_service.CARD_CURRENCIES)}",
        )

    try:
        result = stripe_service.create_payment_intent(order, db)
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe rechazó la operación: {e}")

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

    modo = stripe_service.get_mode()
    k = stripe_service.clave_de

    def leer(nombre, m):
        return ss.get_secret(db, k(nombre, m))

    secreta = leer(stripe_service.CLAVE_SECRETA, modo)
    webhook = leer(stripe_service.CLAVE_WEBHOOK, modo)
    connect = leer(stripe_service.CLAVE_WEBHOOK_CONNECT, modo)

    # Qué hay guardado en el OTRO modo, para que el interruptor avise antes de
    # cambiar en vez de dejar el cobro apagado sin explicación.
    otro = "live" if modo == "test" else "test"
    otro_listo = bool(leer(stripe_service.CLAVE_SECRETA, otro) and leer(stripe_service.CLAVE_WEBHOOK, otro))

    return {
        "success": True,
        "data": {
            "modo": modo,
            "secret_key": ss.mask(secreta),
            "publishable_key": stripe_service.publishable_key(),
            "webhook_secret": ss.mask(webhook),
            "connect_webhook_secret": ss.mask(connect),
            "listo": bool(secreta and webhook),
            "otro_modo_listo": otro_listo,
            # Si la clave viene del .env no se puede editar desde aquí: se
            # sobrescribiría la de la base y seguiría mandando la del entorno.
            "desde_env": bool(not secreta and modo == "live" and os.environ.get("STRIPE_SECRET_KEY")),
        },
        "message": "",
    }


class ModoIn(BaseModel):
    modo: str


@router.put("/stripe/mode", response_model=dict)
def cambiar_modo(
    data: ModoIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Cambia entre claves de prueba y reales.

    No borra nada: cada juego de claves se queda en su sitio y esto solo
    decide cuál se usa. Cambiar a un modo sin claves apaga el pago con
    tarjeta, que es lo correcto — mejor oculto que cobrando con las claves
    equivocadas.
    """
    if data.modo not in stripe_service.MODOS:
        raise HTTPException(status_code=400, detail="Modo inválido")
    stripe_service.set_mode(db, data.modo)
    return {
        "success": True,
        "data": {"modo": data.modo, "listo": stripe_service.is_configured()},
        "message": "Modo de prueba activado" if data.modo == "test" else "Modo real activado",
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

    modo = stripe_service.get_mode()

    guardadas = []
    for valor, clave, prefijos, etiqueta in campos:
        if valor is None:
            continue
        valor = valor.strip()
        if not valor:
            continue
        if valor == "BORRAR":
            ss.set_secret(db, stripe_service.clave_de(clave, modo), "")
            guardadas.append(f"{etiqueta} borrada")
            continue
        if not valor.startswith(prefijos):
            raise HTTPException(
                status_code=400,
                detail=f"La {etiqueta} debería empezar por {' o '.join(prefijos)}",
            )
        # Pegar una clave real teniendo puesto el modo prueba (o al revés) es
        # el error que acaba cobrando de verdad a un cliente sin querer. El
        # prefijo lo delata, así que se rechaza en vez de guardarlo.
        if "_test_" in valor and modo == "live":
            raise HTTPException(
                status_code=400,
                detail=f"Esa {etiqueta} es de prueba y estás en modo real. Cambia el interruptor a «Prueba» y vuelve a pegarla.",
            )
        if "_live_" in valor and modo == "test":
            raise HTTPException(
                status_code=400,
                detail=f"Esa {etiqueta} es real y estás en modo prueba. Cambia el interruptor a «Real» y vuelve a pegarla.",
            )
        ss.set_secret(db, stripe_service.clave_de(clave, modo), valor)
        guardadas.append(etiqueta)

    if not guardadas:
        return {"success": True, "data": {}, "message": "No había nada que guardar"}

    return {"success": True, "data": {}, "message": "Guardado: " + ", ".join(guardadas)}


# ── Koywe (cobros en Chile) ───────────────────────────────────────────────────


class KoyweKeysIn(BaseModel):
    koywe_api_key: Optional[str] = None
    koywe_secret: Optional[str] = None
    koywe_org_id: Optional[str] = None
    koywe_merchant_id: Optional[str] = None
    koywe_webhook_secret: Optional[str] = None


@router.get("/koywe/keys", response_model=dict)
def get_koywe_keys(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Estado de las credenciales de Koywe, enmascaradas.

    El id de organización y el de comercio van enteros: no son secretos, solo
    identifican la cuenta, y verlos completos ayuda a comprobar que son los
    que mandó Koywe.
    """
    from services import secret_store as ss

    modo = stripe_service.get_mode()
    creds = koywe_service.credenciales(modo)
    publicos = (koywe_service.CLAVE_ORG, koywe_service.CLAVE_MERCHANT)
    base = os.environ.get("FRONTEND_URL", "").rstrip("/") or "https://cambios.ksatokio.com"

    return {
        "success": True,
        "data": {
            "modo": modo,
            "base_url": koywe_service.base_url(modo),
            # La URL que hay que registrar en su panel para recibir los avisos.
            "webhook_url": f"{base}/api/payments/koywe/webhook",
            "listo": koywe_service.is_configured(modo),
            "currencies": list(koywe_service.KOYWE_CURRENCIES),
            "methods": {
                moneda: metodos for moneda, (_, metodos) in koywe_service.METODOS.items()
            },
            **{c: (creds[c] if c in publicos else ss.mask(creds[c])) for c in koywe_service.CAMPOS},
        },
        "message": "",
    }


@router.put("/koywe/keys", response_model=dict)
def save_koywe_keys(
    data: KoyweKeysIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Guarda las credenciales cifradas, en el modo activo.

    Un campo vacío no borra lo guardado: el formulario nunca recibe los
    secretos, así que mandarlos vacíos es lo normal al cambiar solo uno. Para
    borrar se manda BORRAR, igual que en Stripe.
    """
    from services import secret_store as ss

    modo = stripe_service.get_mode()
    guardados = []
    for campo in koywe_service.CAMPOS:
        valor = getattr(data, campo, None)
        if valor is None:
            continue
        valor = valor.strip()
        if not valor:
            continue
        if valor == "BORRAR":
            ss.set_secret(db, koywe_service.clave_de(campo, modo), "")
            guardados.append(f"{campo} borrado")
            continue
        ss.set_secret(db, koywe_service.clave_de(campo, modo), valor)
        guardados.append(campo)

    if not guardados:
        return {"success": True, "data": {}, "message": "No había nada que guardar"}

    return {
        "success": True,
        "data": {"listo": koywe_service.is_configured(modo)},
        "message": f"Guardado ({len(guardados)})",
    }


@router.get("/koywe/test", response_model=dict)
def probar_koywe(_admin: User = Depends(require_super_admin)):
    """Comprueba las credenciales contra su API sin cobrar nada.

    Sirve para saber si lo que se acaba de pegar funciona. Sin esto, el primer
    aviso de que una credencial está mal lo daría un cliente intentando pagar.
    """
    try:
        return {"success": True, "data": koywe_service.probar_conexion(), "message": "Conexión correcta"}
    except koywe_service.KoyweError as e:
        raise HTTPException(status_code=400, detail=str(e))


# def y no async def: httpx sale a la red de forma síncrona y bloquearía el
# event loop, y con él el chat de todos los demás.
@router.post("/orders/{order_id}/koywe/checkout", response_model=dict)
def crear_checkout_koywe(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Abre el cobro en Koywe y devuelve la URL donde el cliente paga.

    El método ya se eligió al crear la orden y se guardó en `payment_method`,
    así que reintentar un pago abandonado no obliga a rellenar el envío otra
    vez. Esto NO marca nada como pagado: eso lo hace el webhook firmado.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.client_id == current_user.id,
        Order.deleted_at == None,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if not koywe_service.es_metodo(order.payment_method):
        raise HTTPException(status_code=400, detail="Esta orden no se paga por Koywe")
    if order.paid_at:
        raise HTTPException(status_code=400, detail="Esta orden ya está pagada")

    base = os.environ.get("FRONTEND_URL", "").rstrip("/") or "https://cambios.ksatokio.com"

    try:
        cobro = koywe_service.crear_cobro(order, order.payment_method, f"{base}/orders/{order.id}")
    except koywe_service.KoyweError as e:
        # 400 y no 5xx: Cloudflare sustituye cualquier 5xx del origen por su
        # propia pantalla de error y el motivo real no llegaría al cliente.
        raise HTTPException(status_code=400, detail=f"Koywe rechazó el cobro: {e}")

    order.payment_intent_id = cobro["koywe_order_id"]
    db.commit()

    return {
        "success": True,
        "data": {"url": cobro["url"], "metodo": cobro["metodo"]},
        "message": "",
    }


def _koywe_pagada(datos: dict, tipo: str):
    """Traduce el aviso de Koywe a nuestra orden y la marca pagada.

    Solo se llega aquí con la firma ya verificada. El monto se comprueba si el
    aviso lo trae: no protege contra un tercero — la firma ya lo hace — sino
    contra un desajuste nuestro, como haber mandado un importe y cobrado otro.
    """
    koywe_id = str(datos.get("orderId") or datos.get("id") or "").strip()
    external = datos.get("externalId")
    numero = koywe_service.orden_de_externo(external)

    db = SessionLocal()
    try:
        orden = None
        if koywe_id:
            orden = db.query(Order).filter(Order.payment_intent_id == koywe_id).first()
        if not orden and numero:
            orden = db.query(Order).filter(Order.order_number == numero).first()

        if not orden:
            # Normal: una organización de Koywe manda todos sus eventos a todos
            # sus endpoints, así que aquí caen también los de otros sistemas.
            log.info("[koywe] %s de %s (externalId=%s) sin orden nuestra — se ignora",
                     tipo, koywe_id, external)
            return

        monto = datos.get("amountIn")
        moneda = (datos.get("originCurrencySymbol") or "").upper()
        if monto is not None and abs(float(monto) - float(orden.amount_sent)) > 0.01:
            log.error("[koywe] %s: el aviso dice %s y la orden %s — NO se marca pagada",
                      orden.order_number, monto, orden.amount_sent)
            return
        if moneda and moneda != (orden.currency_from or "").upper():
            log.error("[koywe] %s: el aviso viene en %s y la orden en %s — NO se marca pagada",
                      orden.order_number, moneda, orden.currency_from)
            return

        orden_id = orden.id
    finally:
        db.close()

    _mark_paid(koywe_id, order_id=orden_id, order_number=numero, proveedor="koywe")


@router.post("/koywe/webhook")
async def koywe_webhook(request: Request):
    """Recibe los eventos de Koywe.

    async def porque hace falta el cuerpo crudo para validar la firma; el
    trabajo con la base y con su API, que sí bloquea, va al threadpool.
    """
    payload = await request.body()

    if not koywe_service.verificar_firma(payload, request.headers.get("Koywe-Signature")):
        # O el secreto del panel no coincide con el guardado, o alguien está
        # intentando marcar órdenes como pagadas a mano.
        raise HTTPException(status_code=400, detail="Firma inválida")

    try:
        evento = json.loads(payload)
    except ValueError:
        log.error("[koywe] cuerpo firmado pero no era JSON: %r", payload[:1000])
        return {"received": True}

    tipo = (evento.get("type") or "") if isinstance(evento, dict) else ""
    if tipo in ("order.paid", "order.completed"):
        datos = evento.get("data") or {}
        if isinstance(datos, dict):
            await run_in_threadpool(_koywe_pagada, datos, tipo)

    # 200 a todo lo demás: reintentar un evento que no nos interesa (o que ya
    # procesamos) solo lo trae otra vez.
    return {"received": True}


# ── Global66 (transferencias bancarias a nuestras cuentas) ────────────────────


class Global66KeysIn(BaseModel):
    global66_webhook_key: Optional[str] = None
    global66_client_id: Optional[str] = None
    global66_client_secret: Optional[str] = None


@router.get("/global66/keys", response_model=dict)
def get_global66_keys(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Estado de las credenciales de Global66, enmascaradas."""
    from services import secret_store as ss

    modo = stripe_service.get_mode()
    creds = global66_service.credenciales(modo)

    base = os.environ.get("FRONTEND_URL", "").rstrip("/") or "https://cambios.ksatokio.com"

    return {
        "success": True,
        "data": {
            "modo": modo,
            "base_url": global66_service.base_url(modo),
            # La URL que hay que pegar en su panel al registrar el endpoint.
            "webhook_url": f"{base}/api/payments/global66/webhook",
            "webhook_listo": global66_service.webhook_listo(modo),
            "api_lista": global66_service.api_lista(modo),
            **{
                c: (creds[c] if c in global66_service.CAMPOS_PUBLICOS else ss.mask(creds[c]))
                for c in global66_service.CAMPOS
            },
        },
        "message": "",
    }


@router.put("/global66/keys", response_model=dict)
def save_global66_keys(
    data: Global66KeysIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Guarda las credenciales cifradas, en el modo activo.

    Un campo vacío no borra lo guardado. Para borrar se manda BORRAR, igual
    que en Stripe y en Koywe.
    """
    from services import secret_store as ss

    modo = stripe_service.get_mode()
    guardados = []
    for campo in global66_service.CAMPOS:
        valor = getattr(data, campo, None)
        if valor is None:
            continue
        valor = valor.strip()
        if not valor:
            continue
        if valor == "BORRAR":
            ss.set_secret(db, global66_service.clave_de(campo, modo), "")
            guardados.append(f"{campo} borrado")
            continue
        ss.set_secret(db, global66_service.clave_de(campo, modo), valor)
        guardados.append(campo)

    if not guardados:
        return {"success": True, "data": {}, "message": "No había nada que guardar"}

    return {
        "success": True,
        "data": {"webhook_listo": global66_service.webhook_listo(modo)},
        "message": f"Guardado ({len(guardados)})",
    }


@router.get("/global66/deposits", response_model=dict)
def list_global66_deposits(
    limit: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Últimos avisos recibidos, con la orden que probablemente les corresponde.

    El movimiento bancario en sí es de la empresa y lo ve cualquier
    super-admin. La orden sugerida NO: si pertenece a los clientes de otro
    super-admin, solo se dice que la hay, sin número ni nombres.
    """
    from models.bank_deposit import BankDeposit

    filas = (
        db.query(BankDeposit)
        .order_by(BankDeposit.received_at.desc())
        .limit(min(max(limit, 1), 100))
        .all()
    )

    salida = []
    for d in filas:
        orden = None
        if d.match_order_id:
            o = db.query(Order).filter(Order.id == d.match_order_id).first()
            if o and o.super_admin_id == admin.id:
                orden = {
                    "id": o.id,
                    "order_number": o.order_number,
                    "sender_name": o.sender_name,
                    "amount_sent": o.amount_sent,
                    "currency_from": o.currency_from,
                    "status": o.status,
                }
            elif o:
                orden = {"id": None, "order_number": "(de otro super-admin)"}

        salida.append({
            "id": d.id,
            "transaction_id": d.transaction_id,
            "tipo": d.tipo,
            "amount": d.amount,
            "currency": d.currency,
            "country_code": d.country_code,
            "account_branch": d.account_branch,
            "remitter_name": d.remitter_name,
            "remitter_bank": d.remitter_bank,
            "status": d.status,
            "confirmado": global66_service.es_confirmado(d.status),
            "match_note": d.match_note,
            "orden": orden,
            "received_at": d.received_at.isoformat() if d.received_at else None,
        })

    return {"success": True, "data": salida, "message": ""}


def _guardar_deposito(cuerpo: dict):
    """Guarda el aviso y calcula la orden sugerida. No aprueba nada.

    Idempotente por `transaction_id`: Global66 manda el mismo depósito otra vez
    cuando cambia de estado (PENDING → COMPLETED). En ese caso se actualiza la
    fila existente en vez de crear una segunda, que haría parecer que entró el
    dinero dos veces.
    """
    from models.bank_deposit import BankDeposit

    datos = cuerpo.get("data") or cuerpo
    tx = str(datos.get("transactionId") or "").strip()
    if not tx:
        log.warning("[global66] aviso sin transactionId: %s", json.dumps(cuerpo)[:2000])
        return

    def _num(valor):
        try:
            return float(valor)
        except (TypeError, ValueError):
            return None

    db = SessionLocal()
    try:
        dep = db.query(BankDeposit).filter(BankDeposit.transaction_id == tx).first()
        nuevo = dep is None
        if nuevo:
            dep = BankDeposit(provider="global66", transaction_id=tx)
            db.add(dep)

        dep.tipo = datos.get("type")
        dep.amount = _num(datos.get("originAmount"))
        dep.currency = (datos.get("originCurrencyCode") or "").upper() or None
        dep.amount_usd = _num(datos.get("originAmountUSD"))
        dep.country_code = datos.get("originCountryCode")
        dep.account_branch = datos.get("accountBranch")
        dep.remitter_name = datos.get("thirdPartyClientName")
        dep.remitter_bank = datos.get("remitterBankName")
        dep.customer_id = str(datos.get("customerId") or "") or None
        dep.status = datos.get("status")
        dep.raw = json.dumps(cuerpo)[:20000]

        # El cruce se recalcula mientras nadie lo haya usado todavía: entre el
        # PENDING y el COMPLETED puede haber aparecido la orden.
        if not dep.applied:
            try:
                dep.match_order_id, dep.match_note = global66_service.sugerir_orden(db, dep)
            except Exception as e:
                dep.match_order_id, dep.match_note = None, "No se pudo calcular el cruce"
                log.warning("[global66] fallo al cruzar %s: %s", tx, e)

        db.commit()
        log.info(
            "[global66] %s %s %s %s -> %s",
            "nuevo" if nuevo else "actualizado",
            tx, dep.amount, dep.currency, dep.match_note,
        )
    except Exception as e:
        db.rollback()
        # Global66 no reintenta: si esto falla, el aviso solo existe en este
        # log. Se escribe entero a propósito para poder rehacerlo a mano.
        log.error("[global66] NO SE PUDO GUARDAR el aviso: %s | cuerpo=%s", e, json.dumps(cuerpo)[:4000])
    finally:
        db.close()


@router.post("/global66/webhook")
async def global66_webhook(request: Request):
    """Recibe los avisos de dinero recibido.

    Global66 no reintenta si respondemos con error, así que la única respuesta
    distinta de 200 es 401 por clave mala. Cualquier otro problema se registra
    y se contesta 200: reintentar no va a pasar, y devolver 500 solo añadiría
    ruido sin recuperar el aviso.
    """
    if not global66_service.verificar_api_key(request.headers.get("x-api-key")):
        raise HTTPException(status_code=401, detail="Clave inválida")

    try:
        cuerpo = await request.json()
    except Exception:
        crudo = (await request.body())[:2000]
        log.error("[global66] cuerpo no era JSON: %r", crudo)
        return {"received": True}

    if not isinstance(cuerpo, dict):
        log.error("[global66] cuerpo con forma inesperada: %r", str(cuerpo)[:1000])
        return {"received": True}

    await run_in_threadpool(_guardar_deposito, cuerpo)
    return {"received": True}


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
        raise HTTPException(status_code=400, detail="Falta configurar las claves de Stripe")

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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe rechazó la operación: {e}")

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
        raise HTTPException(status_code=400, detail=f"Stripe rechazó la operación: {e}")


def _mark_paid(
    payment_intent_id: str,
    order_id: int | None = None,
    order_number: str | None = None,
    proveedor: str = "stripe",
):
    """Marca la orden como pagada y la deriva al encargado del país.

    Se ejecuta desde el webhook de Stripe o el de Koywe: la mecánica es la
    misma y lo único que cambia es de dónde sale la referencia del cobro.

    Idempotente: los dos proveedores reintentan los eventos y pueden entregar
    el mismo varias veces; si ya está pagada no se hace nada, porque volver a
    notificar al encargado le haría creer que hay dos envíos.

    `order_number` es la vía de Koywe: su aviso trae el `externalId` que le
    pusimos, así que la orden se encuentra aunque se haya perdido el id que
    guardamos al abrir el checkout.
    """
    db = SessionLocal()
    try:
        order = None
        if order_id:
            order = db.query(Order).filter(Order.id == order_id).first()
        if not order and payment_intent_id:
            order = db.query(Order).filter(Order.payment_intent_id == payment_intent_id).first()
        if not order and order_number:
            order = db.query(Order).filter(Order.order_number == order_number).first()
        if not order:
            log.warning("[%s] pago %s sin orden asociada — se ignora", proveedor, payment_intent_id)
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
            log.error("[%s] pago registrado pero fallaron las notificaciones: %s", proveedor, e)

        log.info("[%s] %s pagada (%s)", proveedor, order.order_number, payment_intent_id)
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
        raise HTTPException(status_code=400, detail=str(e))
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
