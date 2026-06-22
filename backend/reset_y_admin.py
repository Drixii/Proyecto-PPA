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
    # Borrar en orden correcto (respetar FK)
    db.execute(text("DELETE FROM notifications"))
    db.execute(text("DELETE FROM messages"))
    db.execute(text("DELETE FROM sub_admin_country"))
    db.execute(text("DELETE FROM orders"))
    db.execute(text("DELETE FROM invite_codes"))
    db.execute(text("DELETE FROM admin_sub_admin"))
    n_usr = db.execute(text("DELETE FROM users")).rowcount
    db.commit()
    print(f"Base limpia: {n_usr} usuarios borrados")

    # Super-admin 1
    admin1 = User(
        email="admin@casacambios.com",
        full_name="Admin Principal",
        password=pwd.hash("Admin2024!"),
        role="admin",
        is_active=True,
    )
    db.add(admin1)
    db.flush()

    # Super-admin 2
    admin2 = User(
        email="admin2@casacambios.com",
        full_name="Admin Secundario",
        password=pwd.hash("Admin2024!"),
        role="admin",
        is_active=True,
    )
    db.add(admin2)
    db.commit()

    print("Admins creados OK:")
    print("  1. admin@casacambios.com  / Admin2024!")
    print("  2. admin2@casacambios.com / Admin2024!")

except Exception as e:
    db.rollback()
    print(f"ERROR: {e}")
    raise
finally:
    db.close()
