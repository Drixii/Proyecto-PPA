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
    scheduler.add_job(_update_job, "interval", minutes=30, id="update_rates")
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown()
