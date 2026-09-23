from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from database import engine
import models  # noqa: F401 — registra todos los modelos en Base
from database import Base
from routers import auth, rates, orders, admin, chat, notifications, sub_admin, points, flights, payments, reviews
import logging
import os

log = logging.getLogger("ppa")
os.makedirs("uploads/proofs", exist_ok=True)
os.makedirs("uploads/completions", exist_ok=True)
os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/rewards", exist_ok=True)
# Fondos de la imagen de tasas, uno por pais. Van en uploads/ para que un
# deploy no se los lleve: ahi solo hay ficheros subidos, nada de git.
os.makedirs("uploads/fondos", exist_ok=True)
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
        "ALTER TABLE super_admin_accounts ADD COLUMN card_enabled BOOLEAN DEFAULT TRUE",
        "ALTER TABLE super_admin_accounts ADD COLUMN transfer_integracion BOOLEAN DEFAULT TRUE",
        "ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE",
        # Contra qué tasa se compara para decir si subió o bajó (la cinta de la
        # portada). Se congela y se renueva cada 24 h.
        "ALTER TABLE exchange_rates ADD COLUMN ref_rate DOUBLE PRECISION",
        "ALTER TABLE exchange_rates ADD COLUMN ref_at TIMESTAMP WITH TIME ZONE",
        # Navegadores suscritos a las notificaciones del sistema.
        """CREATE TABLE IF NOT EXISTS push_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            endpoint VARCHAR NOT NULL UNIQUE,
            p256dh VARCHAR NOT NULL,
            auth VARCHAR NOT NULL,
            user_agent VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user_id ON push_subscriptions(user_id)",
        # Varias cuentas de cobro por pais, no una por moneda.
        "ALTER TABLE super_admin_accounts ADD COLUMN country VARCHAR",
        "ALTER TABLE super_admin_accounts ADD COLUMN alias VARCHAR",
        "CREATE INDEX IF NOT EXISTS ix_cuentas_pais ON super_admin_accounts (super_admin_id, country)",
        # El unico por moneda impedia tener dos cuentas en el mismo pais.
        "ALTER TABLE super_admin_accounts DROP CONSTRAINT IF EXISTS uq_cuenta_propia_admin_moneda",
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
        # Contacto del cliente en Koywe. Su API rechaza crear dos con el mismo
        # correo o teléfono, y no deja buscarlos: solo devuelve los 100 más
        # recientes, sin paginar. Guardarlo aquí es la única forma de que el
        # segundo cobro de un mismo cliente no choque con el primero.
        "ALTER TABLE users ADD COLUMN koywe_contact_id VARCHAR",
        # Documento del titular y verificación de correo.
        "ALTER TABLE users ADD COLUMN document_type VARCHAR",
        "ALTER TABLE users ADD COLUMN document_number VARCHAR",
        "ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE",
        # Único entre cuentas vivas. Parcial a propósito: una cuenta borrada no
        # debe impedir que esa misma persona vuelva a registrarse, y los NULL
        # de las cuentas antiguas no chocan entre sí.
        """CREATE UNIQUE INDEX IF NOT EXISTS ux_users_document
           ON users (document_number)
           WHERE document_number IS NOT NULL AND deleted_at IS NULL""",
        # Códigos de verificación de correo. Se guarda el hash, no el código:
        # quien lea la base no debe poder verificar la cuenta de otro.
        """CREATE TABLE IF NOT EXISTS email_codes (
            id SERIAL PRIMARY KEY,
            email VARCHAR NOT NULL,
            code_hash VARCHAR NOT NULL,
            intentos INTEGER NOT NULL DEFAULT 0,
            expira_at TIMESTAMP WITH TIME ZONE NOT NULL,
            usado_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_email_codes_email ON email_codes (email)",
        # Retención del primer envío grande.
        "ALTER TABLE users ADD COLUMN is_trusted BOOLEAN DEFAULT FALSE",
        "ALTER TABLE orders ADD COLUMN hold_reason VARCHAR",
        "ALTER TABLE orders ADD COLUMN released_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE orders ADD COLUMN released_by_id INTEGER",
        # Datos del destinatario que pide Colombia y que antes no cabían en el
        # formulario: si es persona o empresa, el apellido aparte del nombre,
        # el correo, el tipo de cuenta y la llave Bre-B para quien cobra por
        # ahí en vez de por número de cuenta.
        "ALTER TABLE orders ADD COLUMN receiver_type VARCHAR",
        "ALTER TABLE orders ADD COLUMN receiver_last_name VARCHAR",
        "ALTER TABLE orders ADD COLUMN receiver_email VARCHAR",
        "ALTER TABLE orders ADD COLUMN receiver_account_type VARCHAR",
        "ALTER TABLE orders ADD COLUMN receiver_key VARCHAR",
        "ALTER TABLE invite_codes ADD COLUMN trusted BOOLEAN DEFAULT FALSE",
        "ALTER TABLE commission_rules ADD COLUMN from_country VARCHAR",
        "ALTER TABLE commission_rules ADD COLUMN to_country VARCHAR",
        "CREATE INDEX IF NOT EXISTS ix_commission_rules_paises ON commission_rules (from_country, to_country)",
        "ALTER TABLE invite_codes ALTER COLUMN email DROP NOT NULL",
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

        # Bancos del destinatario. Sin catálogo, el banco se escribía a mano y
        # cada cliente lo ponía a su manera; quien paga tenía que interpretarlo.
        from services.bancos_seed import sembrar_si_falta
        sembrar_si_falta(db)

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

# FRONTEND_URL admite varios origenes separados por coma. Al cambiar de dominio
# hay dias en que los dos tienen que responder: el DNS tarda en propagarse y hay
# clientes con el enlace viejo abierto. Con un solo valor, mover la variable
# dejaba al dominio anterior fuera de CORS de golpe.
#
# El PRIMERO es el canonico: es el que se usa para construir las URLs de vuelta
# de los pagos (ver routers/payments.py). Los demas solo se admiten en CORS.
_cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_cors_origins += [
    o.strip().rstrip("/")
    for o in os.environ.get("FRONTEND_URL", "").split(",")
    if o.strip()
]

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
app.include_router(reviews.router)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok", "service": "Casa de Cambios API"}
