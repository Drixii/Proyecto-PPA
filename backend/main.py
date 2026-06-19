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
    with engine.connect() as conn:
        # Add sub_admin_id column if missing
        try:
            conn.execute(text("ALTER TABLE orders ADD COLUMN sub_admin_id INTEGER REFERENCES users(id)"))
            conn.commit()
        except Exception:
            pass  # column already exists

        # Migrate old status values to new 3-status model
        # Add completion_proof column if missing
        try:
            conn.execute(text("ALTER TABLE orders ADD COLUMN completion_proof VARCHAR"))
            conn.commit()
        except Exception:
            pass

        # Add avatar column to users if missing
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar VARCHAR"))
            conn.commit()
        except Exception:
            pass

        # Add image_filename to point_rewards if missing
        try:
            conn.execute(text("ALTER TABLE point_rewards ADD COLUMN image_filename VARCHAR"))
            conn.commit()
        except Exception:
            pass

        # Add deleted_at to users if missing
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN deleted_at DATETIME"))
            conn.commit()
        except Exception:
            pass

        # Add timezone to users if missing
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN timezone VARCHAR DEFAULT 'America/Santiago'"))
            conn.commit()
        except Exception:
            pass

        # Add must_change_password to users if missing
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0"))
            conn.commit()
        except Exception:
            pass

        status_map = {
            "pagado": "en_proceso",
            "enviando": "completado",
            "exitoso": "completado",
        }
        for old, new in status_map.items():
            conn.execute(text(f"UPDATE orders SET status = '{new}' WHERE status = '{old}'"))
        conn.commit()


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
