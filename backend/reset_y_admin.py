"""
Borra TODOS los usuarios, órdenes, notificaciones y mensajes.
Luego crea 2 super-admins. Ejecutar en el servidor:
    python reset_y_admin.py
"""
from sqlalchemy import text
from database import SessionLocal, engine, Base
from models.user import User
from models.order import Order
from models.notification import Notification
from models.message import Message
from models.sub_admin_country import SubAdminCountry
from passlib.context import CryptContext

Base.metadata.create_all(bind=engine)
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

try:
    # Borrar en orden correcto (respetar FK), ignorar tablas inexistentes
    tables = [
        "notifications", "messages", "sub_admin_country",
        "orders", "invite_codes", "admin_sub_admin", "users"
    ]
    n_usr = 0
    for t in tables:
        try:
            result = db.execute(text(f"DELETE FROM {t}"))
            if t == "users":
                n_usr = result.rowcount
        except Exception:
            db.rollback()
            print(f"  (tabla '{t}' no existe, se omite)")
    db.commit()
    print(f"Base limpia: {n_usr} usuarios borrados")

    # Super-admin 1
    admin1 = User(
        email="Freizer@gmail.com",
        full_name="Freizer",
        password=pwd.hash("123456"),
        role="admin",
        is_active=True,
    )
    db.add(admin1)
    db.flush()

    # Super-admin 2
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
