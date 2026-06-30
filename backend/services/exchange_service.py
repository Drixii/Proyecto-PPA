import httpx
from sqlalchemy.orm import Session
from models.exchange_rate import ExchangeRate
from datetime import datetime, timezone

FRANKFURTER_URL = "https://api.frankfurter.app/latest"
EXCHANGERATE_URL = "https://open.er-api.com/v6/latest/USD"

# Monedas que requieren fuente especial (pero YA NO bloqueamos su auto-update)
# VES se fetchea via Binance P2P + fallbacks
MANUAL_CURRENCIES = {"CUP"}   # solo CUP queda manual

SUPPORTED_CURRENCIES = {
    "CLP", "COP", "USD", "EUR", "PEN", "BRL", "MXN", "ARS",
    "BOB", "PYG", "UYU", "CRC", "DOP", "GTQ", "CAD", "GBP",
    "CNY", "JPY", "VES"
}


# ── VES fetcher ───────────────────────────────────────────────────────────────

async def _fetch_ves_binance_p2p() -> float | None:
    """
    Binance P2P: promedio de top-5 ofertas BUY de USDT/VES.
    Endpoint no oficial pero ampliamente usado — tasa más real del mercado.
    """
    url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
    payload = {
        "asset": "USDT",
        "fiat": "VES",
        "tradeType": "BUY",
        "page": 1,
        "rows": 10,
        "payTypes": [],
        "merchantCheck": False,
        "publisherType": None,
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            return None
        ads = r.json().get("data", [])
        prices = []
        for ad in ads[:5]:
            try:
                prices.append(float(ad["adv"]["price"]))
            except (KeyError, ValueError, TypeError):
                continue
        if not prices:
            return None
        return sum(prices) / len(prices)
    except Exception:
        return None


async def _fetch_ves_yadio() -> float | None:
    """Yadio.io — también basado en P2P, buen fallback."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://api.yadio.io/rate/USD/VES")
        if r.status_code == 200:
            data = r.json()
            rate = data.get("rate")
            if rate:
                return float(rate)
    except Exception:
        pass
    return None


async def _fetch_ves_dolarapi() -> float | None:
    """DolarAPI Venezuela — tasa paralela como segundo fallback."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://ve.dolarapi.com/v1/dolares/paralelo")
        if r.status_code == 200:
            data = r.json()
            rate = data.get("promedio")
            if rate:
                return float(rate)
    except Exception:
        pass
    return None


async def fetch_ves_rate() -> tuple[float | None, str]:
    """
    Intenta Binance P2P → Yadio → DolarAPI.
    Devuelve (rate_usd_to_ves, source_name).
    """
    rate = await _fetch_ves_binance_p2p()
    if rate and rate > 0:
        return rate, "binance_p2p"

    rate = await _fetch_ves_yadio()
    if rate and rate > 0:
        return rate, "yadio"

    rate = await _fetch_ves_dolarapi()
    if rate and rate > 0:
        return rate, "dolarapi"

    return None, "none"


# ── Main fetch ────────────────────────────────────────────────────────────────

async def fetch_and_store_rates(db: Session):
    """Fetch rates from open.er-api (USD base) + VES via Binance P2P."""
    rates_usd = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(EXCHANGERATE_URL)
            if resp.status_code == 200:
                data = resp.json()
                rates_usd = data.get("rates", {})
                rates_usd["USD"] = 1.0
    except Exception:
        pass

    if not rates_usd:
        return False

    # Guardar tasas principales (skip MANUAL = CUP, y skip VES aquí — lo hacemos abajo)
    for currency, rate_vs_usd in rates_usd.items():
        if currency not in SUPPORTED_CURRENCIES:
            continue
        if currency in MANUAL_CURRENCIES:
            continue
        if currency == "VES":
            continue  # VES se maneja aparte
        _upsert_rate(db, "USD", currency, rate_vs_usd, auto=True)

    # Derivar pares entre monedas (excluye VES y manuales — se añaden abajo)
    for base in SUPPORTED_CURRENCIES:
        if base in MANUAL_CURRENCIES or base == "VES" or base not in rates_usd:
            continue
        for target in SUPPORTED_CURRENCIES:
            if target == base or target in MANUAL_CURRENCIES or target == "VES" or target not in rates_usd:
                continue
            cross_rate = rates_usd[target] / rates_usd[base]
            _upsert_rate(db, base, target, cross_rate, auto=True)

    db.commit()

    # ── VES via Binance P2P ──────────────────────────────────────────────────
    ves_record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == "USD",
        ExchangeRate.to_currency == "VES"
    ).first()

    # Respetar override manual del admin
    if ves_record and str(ves_record.is_manual).lower() == "true":
        ves_rate = ves_record.rate
        source = "manual_override"
    else:
        ves_rate, source = await fetch_ves_rate()

    if ves_rate and ves_rate > 0:
        # USD → VES
        _upsert_rate(db, "USD", "VES", ves_rate, auto=(source != "manual_override"))
        # VES → USD
        _upsert_rate(db, "VES", "USD", 1.0 / ves_rate, auto=True)

        # Derivar pares VES ↔ otras monedas
        for cur in SUPPORTED_CURRENCIES:
            if cur in ("VES", "USD") or cur in MANUAL_CURRENCIES or cur not in rates_usd:
                continue
            rate_usd_to_cur = rates_usd[cur]
            # cur → VES
            _upsert_rate(db, cur, "VES", ves_rate / rate_usd_to_cur, auto=True)
            # VES → cur
            _upsert_rate(db, "VES", cur, rate_usd_to_cur / ves_rate, auto=True)

        db.commit()
        print(f"[exchange] VES rate updated: 1 USD = {ves_rate:.2f} VES (source: {source})")
    else:
        print("[exchange] VES rate fetch failed — keeping existing rate")

    return True


def _upsert_rate(db: Session, from_cur: str, to_cur: str, rate: float, auto: bool = True):
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    if existing:
        # No sobreescribir si admin lo puso manual y la actualización es automática
        if auto and str(existing.is_manual).lower() == "true":
            return
        existing.rate = rate
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(ExchangeRate(
            from_currency=from_cur,
            to_currency=to_cur,
            rate=rate,
            is_manual="false" if auto else "true"
        ))


def get_rate(db: Session, from_cur: str, to_cur: str) -> float | None:
    if from_cur == to_cur:
        return 1.0
    record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    return record.rate if record else None


def set_manual_rate(db: Session, from_cur: str, to_cur: str, rate: float):
    _upsert_rate(db, from_cur, to_cur, rate, auto=False)
    record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    if record:
        record.is_manual = "true"
    db.commit()
