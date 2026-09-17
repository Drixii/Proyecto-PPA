import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from database import SessionLocal
from services.exchange_service import fetch_and_store_rates
from services import caducidad

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _update_job():
    db = SessionLocal()
    try:
        await fetch_and_store_rates(db)
    finally:
        db.close()


def _caducar_job():
    """Barre las órdenes sin pagar que ya cumplieron su plazo."""
    db = SessionLocal()
    try:
        caidas = caducidad.barrer(db)
        if caidas:
            logger.info("caducidad: %s órdenes sin pagar a la papelera", caidas)
    except Exception:
        # Que falle el barrido no puede tumbar el scheduler y con él las tasas.
        logger.exception("caducidad: el barrido falló")
    finally:
        db.close()


def start_scheduler():
    # Cinco minutos, no treinta.
    #
    # El oficial se mueve despacio y treinta minutos le sobraban, pero el
    # paralelo de Venezuela y Argentina puede correr un 1-2% en media hora. A
    # media hora de retraso, cada envío en esas monedas se cotiza con una tasa
    # que ya no existe, y la diferencia la paga la casa o el cliente.
    #
    # Cinco minutos son ~288 consultas al día por fuente: nada para las APIs
    # que se usan, y deja el desfase por debajo de lo que se mueve el mercado.
    scheduler.add_job(_update_job, "interval", minutes=5, id="update_rates")

    # Cada hora, no una vez al día: el plazo es de tres días, así que una hora
    # de margen no se nota, y a cambio no hay que acertar con la hora del
    # barrido ni esperar un día entero si el servidor se reinicia justo antes.
    scheduler.add_job(_caducar_job, "interval", hours=1, id="caducar_sin_pagar")
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown()
