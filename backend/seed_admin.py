"""Run once on Railway console: python seed_admin.py"""
from database import SessionLocal, engine, Base
from models.user import User
from passlib.context import CryptContext

Base.metadata.create_all(bind=engine)

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

if db.query(User).filter(User.email == "admin@casacambios.com").first():
    print("Admin already exists")
else:
    admin = User(
        email="admin@casacambios.com",
        full_name="Admin",
        hashed_password=pwd.hash("Admin2024!"),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    print("Admin created OK")

db.close()
