"""
Borra TODOS los usuarios, órdenes, notificaciones y mensajes.
Luego crea 2 super-admins. Ejecutar en el servidor:
    python reset_y_admin.py
"""
from sqlalchemy import text
from database import SessionLocal, engine, Base
import models  # noqa: registra todos los modelos
from models.user import User
from passlib.context import CryptContext

Base.metadata.create_all(bind=engine)
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

# Orden respeta FK: hijos primero, luego padres
TABLES = [
    "point_redemptions",
    "point_transactions",
    "point_accounts",
    "point_rewards",
    "notifications",
    "messages",
    "sub_admin_countries",
    "orders",
    "invite_codes",
    "admin_sub_admin",
    "users",
]

try:
    n_usr = 0
    for t in TABLES:
        try:
            result = db.execute(text(f"DELETE FROM {t}"))
            if t == "users":
                n_usr = result.rowcount
            print(f"  ✓ {t}: {result.rowcount} filas borradas")
        except Exception as e:
            db.rollback()
            print(f"  (omitida '{t}': {e})")
    db.commit()
    print(f"\nBase limpia — {n_usr} usuarios borrados")

    admin1 = User(
        email="Freizer@gmail.com",
        full_name="Freizer",
        password=pwd.hash("123456"),
        role="admin",
        is_active=True,
    )
    db.add(admin1)
    db.flush()

    admin2 = User(
        email="Ender@gmail.com",
        full_name="Ender",
        password=pwd.hash("123456"),
        role="admin",
        is_active=True,
    )
    db.add(admin2)
    db.commit()

    print("Admins creados OK:")
    print("  1. Freizer@gmail.com / 123456")
    print("  2. Ender@gmail.com   / 123456")

except Exception as e:
    db.rollback()
    print(f"ERROR: {e}")
    raise
finally:
    db.close()
