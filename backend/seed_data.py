"""
Ejecutar UNA sola vez: python seed_data.py
Crea usuarios de prueba y bancos en la base de datos.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine, SessionLocal, Base
import models  # noqa — registrar modelos
from models.user import User
from models.bank import Bank
from models.exchange_rate import ExchangeRate
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Base.metadata.create_all(bind=engine)

USERS = [
    {"email": "admin@casacambios.com", "password": "Admin2024!", "full_name": "Admin Principal", "role": "admin"},
    {"email": "admin2@casacambios.com", "password": "Admin2024!", "full_name": "Operador Soporte", "role": "admin"},
    {"email": "cliente1@test.com", "password": "Cliente123!", "full_name": "Juan García Pérez", "role": "client", "phone": "+56 9 1234 5678", "country": "Chile"},
    {"email": "cliente2@test.com", "password": "Cliente123!", "full_name": "María López Torres", "role": "client", "phone": "+57 300 123 4567", "country": "Colombia"},
]

BANKS = {
    "Venezuela": ["Banco de Venezuela", "Banesco", "Mercantil", "BBVA Provincial", "Banco Exterior", "BOD", "Bancaribe", "Bancamiga", "Bicentenario"],
    "Colombia": ["Bancolombia", "Davivienda", "BBVA Colombia", "Banco de Bogotá", "Nequi", "Daviplata", "Banco Popular", "Colpatria"],
    "Chile": ["Banco Estado", "BancoChile", "Santander Chile", "BCI", "Itaú", "Scotiabank", "Falabella"],
    "Estados Unidos": ["Bank of America", "Wells Fargo", "Chase", "Citibank", "Zelle (cualquier banco)"],
    "Argentina": ["Banco Nación", "Banco Provincia", "Galicia", "BBVA Argentina", "Mercado Pago"],
    "Ecuador": ["Banco Pichincha", "Banco Guayaquil", "Produbanco", "Banco del Pacífico"],
    "Perú": ["BCP", "Interbank", "BBVA Perú", "Scotiabank Perú", "Yape"],
    "Brasil": ["Banco do Brasil", "Itaú", "Bradesco", "Santander Brasil", "Nubank"],
    "México": ["BBVA México", "Banamex", "Santander México", "Banorte", "HSBC México"],
    "Bolivia": ["Banco Nacional de Bolivia", "Banco Mercantil Santa Cruz", "BancoSol"],
    "Paraguay": ["Banco Continental", "Banco Itaú Paraguay", "Banco GNB Paraguay"],
    "Uruguay": ["Banco República", "Santander Uruguay", "BBVA Uruguay"],
}

# Tasas manuales para monedas no disponibles en API
MANUAL_RATES = [
    # VES: tasa aproximada de mercado paralelo (actualizar manualmente)
    {"from_currency": "USD", "to_currency": "VES", "rate": 36.50},
    {"from_currency": "VES", "to_currency": "USD", "rate": 0.0274},
    {"from_currency": "CLP", "to_currency": "VES", "rate": 0.0389},
    {"from_currency": "COP", "to_currency": "VES", "rate": 0.0089},
]


def seed():
    db = SessionLocal()
    try:
        # Usuarios
        for u in USERS:
            if not db.query(User).filter(User.email == u["email"]).first():
                user = User(
                    email=u["email"],
                    full_name=u["full_name"],
                    password=pwd_context.hash(u["password"]),
                    role=u.get("role", "client"),
                    phone=u.get("phone"),
                    country=u.get("country"),
                )
                db.add(user)
                print(f"  + Usuario: {u['email']}")

        # Bancos
        for country, banks in BANKS.items():
            for bank_name in banks:
                if not db.query(Bank).filter(Bank.name == bank_name, Bank.country == country).first():
                    db.add(Bank(country=country, name=bank_name))
                    print(f"  + Banco: {bank_name} ({country})")

        # Tasas manuales (VES y otros)
        for r in MANUAL_RATES:
            existing = db.query(ExchangeRate).filter(
                ExchangeRate.from_currency == r["from_currency"],
                ExchangeRate.to_currency == r["to_currency"]
            ).first()
            if not existing:
                db.add(ExchangeRate(
                    from_currency=r["from_currency"],
                    to_currency=r["to_currency"],
                    rate=r["rate"],
                    is_manual="true"
                ))
                print(f"  + Tasa manual: {r['from_currency']} -> {r['to_currency']} = {r['rate']}")

        db.commit()
        print("\nSeed completado.")
        print("\nCredenciales de prueba:")
        print("  Admin:   admin@casacambios.com / Admin2024!")
        print("  Cliente: cliente1@test.com / Cliente123!")
    finally:
        db.close()


if __name__ == "__main__":
    print("Ejecutando seed data...")
    seed()
