from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from database import engine
import models  # noqa: F401 — registra todos los modelos en Base
from database import Base
from routers import auth, rates, orders, admin, chat, notifications, sub_admin, points, flights, payments
import logging
import os

log = logging.getLogger("ppa")
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
        "ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN super_admin_id INTEGER",
        "ALTER TABLE users ADD COLUMN invite_code_used VARCHAR",
        "ALTER TABLE orders ADD COLUMN super_admin_id INTEGER",
        "ALTER TABLE orders ADD COLUMN rejection_reason VARCHAR",
        "ALTER TABLE orders ADD COLUMN payment_intent_id VARCHAR",
        "ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE",
        # Tarjetas creadas antes de que existiera pendiente_pago: estaban en
        # en_aprobacion, esperando una aprobación que el admin no podía dar.
        """UPDATE orders SET status = 'pendiente_pago'
           WHERE lower(coalesce(payment_method,'')) = 'tarjeta'
             AND paid_at IS NULL
             AND status = 'en_aprobacion'""",
        # Deja una sola fila por par de monedas y luego impide que vuelvan a
        # duplicarse. El orden importa: el índice único no se puede crear
        # mientras existan duplicados. Se prefiere la fila manual (la puso un
        # admin a mano) y, entre automáticas, la más reciente.
        """DELETE FROM exchange_rates WHERE id NOT IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY from_currency, to_currency
                    ORDER BY CASE WHEN lower(coalesce(is_manual,'')) = 'true' THEN 0 ELSE 1 END,
                             updated_at DESC, id DESC
                ) AS rn
                FROM exchange_rates
            ) t WHERE t.rn = 1
        )""",
        """CREATE UNIQUE INDEX IF NOT EXISTS ux_exchange_rates_pair
           ON exchange_rates (from_currency, to_currency)""",
        """CREATE TABLE IF NOT EXISTS commission_rules (
            id SERIAL PRIMARY KEY,
            super_admin_id INTEGER,
            from_currency VARCHAR NOT NULL,
            to_currency VARCHAR NOT NULL,
            commission_pct FLOAT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
    ]
    # Estas migraciones se reejecutan en cada arranque, así que "la columna ya
    # existe" es el caso normal y se ignora. Cualquier otro fallo sí se registra:
    # antes se tragaban todos por igual y un error real de esquema pasaba
    # invisible hasta que reventaba un endpoint en producción.
    already_applied = ("already exists", "duplicate column", "duplicate_column")

    for sql in migrations:
        with engine.connect() as conn:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                if not any(marker in str(exc).lower() for marker in already_applied):
                    log.warning("Migración falló: %s | %s", sql.split("\n")[0].strip(), exc)

    status_map = {
        "pagado": "en_proceso",
        "enviando": "completado",
        "exitoso": "completado",
    }
    with engine.connect() as conn:
        try:
            for old, new in status_map.items():
                conn.execute(
                    text("UPDATE orders SET status = :new WHERE status = :old"),
                    {"new": new, "old": old},
                )
            conn.commit()
        except Exception as exc:
            conn.rollback()
            log.warning("Normalización de estados falló: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas
    Base.metadata.create_all(bind=engine)
    # Migrate schema and data
    _run_migrations()
    # Países por defecto (solo si la tabla está vacía) y tasas iniciales
    db = SessionLocal()
    try:
        from services.country_service import seed_countries_if_empty
        creados = seed_countries_if_empty(db)
        if creados:
            log.info("Países sembrados: %s", creados)

        # Las claves de Stripe pasaron a guardarse por modo (prueba/real). Las
        # que ya estaban puestas son las reales: se mueven a su sitio para que
        # el cobro no se apague al desplegar esto.
        from models.setting import Setting
        for base in ("stripe_secret_key", "stripe_publishable_key",
                     "stripe_webhook_secret", "stripe_connect_webhook_secret"):
            vieja = db.query(Setting).filter(Setting.key == base).first()
            if not vieja:
                continue
            if not db.query(Setting).filter(Setting.key == f"{base}_live").first():
                db.add(Setting(key=f"{base}_live", value=vieja.value))
                log.info("Clave '%s' movida al modo real", base)
            db.delete(vieja)
        db.commit()
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
app.include_router(flights.router)
app.include_router(payments.router)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok", "service": "Casa de Cambios API"}
