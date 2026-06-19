from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from database import engine
import models  # noqa: F401 — registra todos los modelos en Base
from database import Base
from routers import auth, rates, orders, admin, chat, notifications, sub_admin, points
import os
os.makedirs("uploads/proofs", exist_ok=True)
os.makedirs("uploads/completions", exist_ok=True)
os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/rewards", exist_ok=True)
from services.scheduler import start_scheduler, stop_scheduler
from services.exchange_service import fetch_and_store_rates
from database import SessionLocal


def _run_migrations():
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE orders ADD COLUMN sub_admin_id INTEGER REFERENCES users(id)",
        "ALTER TABLE orders ADD COLUMN completion_proof VARCHAR",
        "ALTER TABLE users ADD COLUMN avatar VARCHAR",
        "ALTER TABLE point_rewards ADD COLUMN image_filename VARCHAR",
        "ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN timezone VARCHAR DEFAULT 'America/Santiago'",
        "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE",
        "ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP",
    ]
    for sql in migrations:
        with engine.connect() as conn:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()

    status_map = {
        "pagado": "en_proceso",
        "enviando": "completado",
        "exitoso": "completado",
    }
    with engine.connect() as conn:
        try:
            for old, new in status_map.items():
                conn.execute(text(f"UPDATE orders SET status = '{new}' WHERE status = '{old}'"))
            conn.commit()
        except Exception:
            conn.rollback()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas
    Base.metadata.create_all(bind=engine)
    # Migrate schema and data
    _run_migrations()
    # Cargar tasas al inicio
    db = SessionLocal()
    try:
        await fetch_and_store_rates(db)
    finally:
        db.close()
    # Iniciar scheduler (actualiza cada 30 min)
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Casa de Cambios API",
    version="1.0.0",
    lifespan=lifespan,
)

_cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if os.environ.get("FRONTEND_URL"):
    _cors_origins.append(os.environ["FRONTEND_URL"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(rates.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(sub_admin.router)
app.include_router(chat.router)
app.include_router(notifications.router)
app.include_router(points.router)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok", "service": "Casa de Cambios API"}
