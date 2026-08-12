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

from database import SessionLocal, engine, Base
from models.user import User
from passlib.context import CryptContext

# Contraseñas que estuvieron en el repo o son triviales: se rechazan.
BLOCKED = {"admin2024!", "admin", "admin123", "password", "123456", "cliente123!"}
MIN_LENGTH = 12

Base.metadata.create_all(bind=engine)

email = os.environ.get("ADMIN_EMAIL") or input("Email del admin: ").strip()
if not email or "@" not in email:
    sys.exit("Email no válido.")

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
    full_name=os.environ.get("ADMIN_NAME", "Admin"),
    password=pwd.hash(password),
    role="admin",
    is_active=True,
))
db.commit()
db.close()
print(f"Admin creado: {email}")
