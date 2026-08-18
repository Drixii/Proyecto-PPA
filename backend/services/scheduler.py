from apscheduler.schedulers.asyncio import AsyncIOScheduler
from database import SessionLocal
from services.exchange_service import fetch_and_store_rates

scheduler = AsyncIOScheduler()


async def _update_job():
    db = SessionLocal()
    try:
        await fetch_and_store_rates(db)
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
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown()
