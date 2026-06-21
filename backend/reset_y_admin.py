"""
Borra TODOS los usuarios, órdenes, notificaciones y mensajes.
Luego crea el admin. Ejecutar en el servidor:
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
    n_notif = db.execute(text("DELETE FROM notifications")).rowcount
    n_msg   = db.execute(text("DELETE FROM messages")).rowcount
    n_sac   = db.execute(text("DELETE FROM sub_admin_country")).rowcount
    n_ord   = db.execute(text("DELETE FROM orders")).rowcount
    n_usr   = db.execute(text("DELETE FROM users")).rowcount
    db.commit()

    print(f"Borrados: {n_notif} notificaciones, {n_msg} mensajes, "
          f"{n_sac} países sub-admin, {n_ord} órdenes, {n_usr} usuarios")

    # Crear admin con columna correcta (password, no hashed_password)
    admin = User(
        email="admin@casacambios.com",
        full_name="Admin",
        password=pwd.hash("Admin2024!"),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    print("Admin creado OK:")
    print("  Email:    admin@casacambios.com")
    print("  Password: Admin2024!")

except Exception as e:
    db.rollback()
    print(f"ERROR: {e}")
    raise
finally:
    db.close()
