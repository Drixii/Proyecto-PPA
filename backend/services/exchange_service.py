import httpx
from sqlalchemy.orm import Session
from models.exchange_rate import ExchangeRate
from datetime import datetime, timezone

FRANKFURTER_URL = "https://api.frankfurter.app/latest"
EXCHANGERATE_URL = "https://open.er-api.com/v6/latest/USD"

# Monedas no disponibles en APIs públicas — requieren tasa manual
MANUAL_CURRENCIES = {"VES", "CUP", "ARS"}

SUPPORTED_CURRENCIES = {
    "CLP", "COP", "USD", "EUR", "PEN", "BRL", "MXN", "ARS",
    "BOB", "PYG", "UYU", "CRC", "DOP", "GTQ", "CAD", "GBP",
    "CNY", "JPY", "VES"
}


async def fetch_and_store_rates(db: Session):
    """Fetch rates from Frankfurter (base EUR) y convertir todo a USD base."""
    rates_usd = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{EXCHANGERATE_URL}")
            if resp.status_code == 200:
                data = resp.json()
                rates_usd = data.get("rates", {})
                rates_usd["USD"] = 1.0
    except Exception:
        pass

    if not rates_usd:
        return False

    for currency, rate_vs_usd in rates_usd.items():
        if currency not in SUPPORTED_CURRENCIES:
            continue
        if currency in MANUAL_CURRENCIES:
            continue
        _upsert_rate(db, "USD", currency, rate_vs_usd)

    # Derivar pares entre monedas soportadas desde USD
    for base in SUPPORTED_CURRENCIES:
        if base in MANUAL_CURRENCIES or base not in rates_usd:
            continue
        for target in SUPPORTED_CURRENCIES:
            if target == base or target in MANUAL_CURRENCIES or target not in rates_usd:
                continue
            cross_rate = rates_usd[target] / rates_usd[base]
            _upsert_rate(db, base, target, cross_rate)

    db.commit()
    return True


def _upsert_rate(db: Session, from_cur: str, to_cur: str, rate: float):
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    if existing:
        existing.rate = rate
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(ExchangeRate(from_currency=from_cur, to_currency=to_cur, rate=rate))


def get_rate(db: Session, from_cur: str, to_cur: str) -> float | None:
    if from_cur == to_cur:
        return 1.0
    record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    return record.rate if record else None


def set_manual_rate(db: Session, from_cur: str, to_cur: str, rate: float):
    _upsert_rate(db, from_cur, to_cur, rate)
    record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    if record:
        record.is_manual = "true"
    db.commit()
