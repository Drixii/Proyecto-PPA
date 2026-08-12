"""Crea el administrador inicial. Ejecutar una sola vez tras desplegar:

    cd /opt/ppa/backend && sudo -u ppa venv/bin/python seed_admin.py

Pide la contraseña por teclado y no la deja escrita en ningún sitio. Antes
estaba fijada en este archivo ("Admin2024!"), que vive en un repo público:
cualquiera podía entrar como admin. También acepta ADMIN_EMAIL y
ADMIN_PASSWORD por variable de entorno para automatizarlo.
"""
import getpass
import os
import sys

# El .env se carga ANTES de importar database, que lee DATABASE_URL en tiempo
# de import. systemd se lo pasa al servicio, pero una shell normal no: sin
# esto el script caía al SQLite por defecto y creaba el admin en una base que
# la aplicación no usa — decía "Admin creado" y no aparecía en ningún sitio.
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from database import SessionLocal, engine, Base  # noqa: E402
from models.user import User  # noqa: E402
from passlib.context import CryptContext  # noqa: E402

# Contraseñas que estuvieron en el repo o son triviales: se rechazan.
BLOCKED = {"admin2024!", "admin", "admin123", "password", "123456", "cliente123!"}
MIN_LENGTH = 12

# Decirlo en voz alta: si por lo que sea acaba en SQLite, se ve al instante
# en vez de descubrirlo cuando el login falla.
print(f"Base de datos: {engine.url.render_as_string(hide_password=True)}")
if engine.url.get_backend_name() == "sqlite":
    print("  AVISO: es SQLite, no la base de producción. Revisa el .env.")

Base.metadata.create_all(bind=engine)

email = os.environ.get("ADMIN_EMAIL") or input("Email del admin: ").strip()
if not email or "@" not in email:
    sys.exit("Email no válido.")

# Se pregunta el nombre en vez de dejarlo en ADMIN_NAME con "Admin" por
# defecto: es lo que ven los sub-admins en su panel ("Cliente de X"), y al no
# pedirlo se creó un admin llamado literalmente "Nombre Apellido".
full_name = os.environ.get("ADMIN_NAME") or input("Nombre del admin (lo verán los sub-admins): ").strip()
if not full_name:
    sys.exit("El nombre no puede quedar vacío.")

db = SessionLocal()
if db.query(User).filter(User.email == email).first():
    db.close()
    sys.exit(f"Ya existe un usuario con {email}. Nada que hacer.")

password = os.environ.get("ADMIN_PASSWORD")
if not password:
    password = getpass.getpass("Contraseña (mínimo 12 caracteres): ")
    if password != getpass.getpass("Repetir contraseña: "):
        db.close()
        sys.exit("Las contraseñas no coinciden.")

if len(password) < MIN_LENGTH:
    db.close()
    sys.exit(f"Demasiado corta: mínimo {MIN_LENGTH} caracteres.")
if password.lower() in BLOCKED:
    db.close()
    sys.exit("Esa contraseña es pública o trivial. Usa otra.")

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
db.add(User(
    email=email,
    full_name=full_name,
    password=pwd.hash(password),
    role="admin",
    is_active=True,
))
db.commit()
db.close()
print(f"Admin creado: {email}")
