"""Notificaciones del navegador (Web Push).

Se usa Web Push con claves VAPID, que es el estandar del navegador, y no
Firebase: no hace falta cuenta de Google ni SDK, el aviso va cifrado de extremo
a extremo —el servicio de push lo transporta pero no lo lee— y funciona igual
en Chrome, Firefox, Edge y Safari.

Donde SI hay una limitacion, y conviene saberla: en iPhone solo llegan si la
web esta instalada en la pantalla de inicio. Safari no permite notificaciones a
una pestana suelta. En Android y en escritorio funciona sin instalar nada.

El envio es siempre lo ultimo y nunca decide nada: si el push falla, el aviso
ya esta guardado en la base y se ve igual al entrar. Por eso aqui no se
propaga ninguna excepcion.
"""
import json
import logging
import os
import threading

log = logging.getLogger(__name__)

# Correo de contacto que exige el estandar VAPID: es a donde escribe el
# servicio de push si algo va mal con nuestros envios.
VAPID_SUB = os.getenv("VAPID_SUBJECT", "mailto:soporte@ksaglobal-evolution.com")


def clave_publica() -> str:
    """La que necesita el navegador para suscribirse. Vacia = push apagado."""
    return os.getenv("VAPID_PUBLIC_KEY", "").strip()


def _clave_privada() -> str:
    return os.getenv("VAPID_PRIVATE_KEY", "").strip()


def activo() -> bool:
    return bool(clave_publica() and _clave_privada())


def _enviar_uno(subscripcion: dict, carga: dict) -> int | None:
    """Manda el aviso. Devuelve el codigo HTTP del servicio de push."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=subscripcion,
            data=json.dumps(carga),
            vapid_private_key=_clave_privada(),
            vapid_claims={"sub": VAPID_SUB},
            timeout=10,
        )
        return 201
    except WebPushException as e:
        return getattr(e.response, "status_code", None)
    except Exception:
        log.exception("Fallo enviando push")
        return None


def _reparto(destinatario_id: int, carga: dict) -> None:
    """Manda el aviso a todos los navegadores de esa persona.

    Va en su propio hilo y con su propia sesion de base: la del endpoint que lo
    disparo ya se cerro, y de todas formas no se puede tener a un cliente
    esperando a que respondan tres servidores de push.
    """
    from database import SessionLocal
    from models.push_subscription import PushSubscription

    db = SessionLocal()
    try:
        suscripciones = db.query(PushSubscription).filter(
            PushSubscription.user_id == destinatario_id
        ).all()
        caducadas = []
        for s in suscripciones:
            codigo = _enviar_uno(
                {"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                carga,
            )
            # 404 y 410: el navegador se desinstalo o retiro el permiso. Esa
            # suscripcion ya no vale para nada y si se deja, cada aviso vuelve a
            # intentarla y a esperar su tiempo de espera.
            if codigo in (404, 410):
                caducadas.append(s.id)

        if caducadas:
            db.query(PushSubscription).filter(
                PushSubscription.id.in_(caducadas)
            ).delete(synchronize_session=False)
            db.commit()
    except Exception:
        log.exception("Fallo repartiendo push a %s", destinatario_id)
    finally:
        db.close()


def enviar(destinatario_id: int, titulo: str, cuerpo: str | None = None,
           url: str = "/", etiqueta: str | None = None) -> None:
    """Encola el aviso. No espera, no lanza: avisar nunca puede romper nada."""
    if not activo() or not destinatario_id:
        return

    carga = {"title": titulo, "body": cuerpo or "", "url": url}
    if etiqueta:
        # Con la misma etiqueta, un aviso nuevo de la misma orden reemplaza al
        # anterior en vez de apilarse. Cinco cambios de estado seguidos no
        # dejan cinco notificaciones.
        carga["tag"] = etiqueta

    threading.Thread(
        target=_reparto, args=(destinatario_id, carga), daemon=True
    ).start()
