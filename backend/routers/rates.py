from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.exchange_rate import ExchangeRate
from schemas.rate import RateOut, ConvertResult, ManualRateUpdate, CountryInfo
from services.exchange_service import get_rate, set_manual_rate, fetch_and_store_rates
from auth.dependencies import require_admin
from config import settings
from typing import List

router = APIRouter(prefix="/api/rates", tags=["rates"])

COUNTRIES_CURRENCIES = {
    "Chile": {"currency": "CLP", "flag": "🇨🇱"},
    "Venezuela": {"currency": "VES", "flag": "🇻🇪"},
    "Colombia": {"currency": "COP", "flag": "🇨🇴"},
    "Estados Unidos": {"currency": "USD", "flag": "🇺🇸"},
    "Argentina": {"currency": "ARS", "flag": "🇦🇷"},
    "Ecuador": {"currency": "USD", "flag": "🇪🇨"},
    "Perú": {"currency": "PEN", "flag": "🇵🇪"},
    "Brasil": {"currency": "BRL", "flag": "🇧🇷"},
    "México": {"currency": "MXN", "flag": "🇲🇽"},
    "España": {"currency": "EUR", "flag": "🇪🇸"},
    "Bolivia": {"currency": "BOB", "flag": "🇧🇴"},
    "Paraguay": {"currency": "PYG", "flag": "🇵🇾"},
    "Uruguay": {"currency": "UYU", "flag": "🇺🇾"},
    "Panamá": {"currency": "USD", "flag": "🇵🇦"},
    "Costa Rica": {"currency": "CRC", "flag": "🇨🇷"},
    "República Dominicana": {"currency": "DOP", "flag": "🇩🇴"},
    "Guatemala": {"currency": "GTQ", "flag": "🇬🇹"},
    "Canadá": {"currency": "CAD", "flag": "🇨🇦"},
    "Reino Unido": {"currency": "GBP", "flag": "🇬🇧"},
    "China": {"currency": "CNY", "flag": "🇨🇳"},
    "Japón": {"currency": "JPY", "flag": "🇯🇵"},
}


@router.get("/countries", response_model=dict)
def get_countries():
    countries = [
        CountryInfo(country=k, currency=v["currency"], flag=v["flag"])
        for k, v in COUNTRIES_CURRENCIES.items()
    ]
    return {"success": True, "data": [c.model_dump() for c in countries], "message": ""}


@router.get("", response_model=dict)
def get_all_rates(db: Session = Depends(get_db)):
    rates = db.query(ExchangeRate).all()
    return {
        "success": True,
        "data": [RateOut.model_validate(r).model_dump() for r in rates],
        "message": ""
    }


@router.get("/convert", response_model=dict)
def convert(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    amount: float = Query(..., gt=0),
    db: Session = Depends(get_db)
):
    rate = get_rate(db, from_currency.upper(), to_currency.upper())
    if not rate:
        raise HTTPException(status_code=404, detail=f"Tasa no disponible: {from_currency} → {to_currency}")
    fee = round(amount * settings.FEE_PERCENTAGE / 100, 2)
    amount_received = round((amount - fee) * rate, 2)
    return {
        "success": True,
        "data": ConvertResult(
            from_currency=from_currency.upper(),
            to_currency=to_currency.upper(),
            amount_sent=amount,
            rate=rate,
            amount_received=amount_received,
            fee=fee,
            total_to_pay=amount,
        ).model_dump(),
        "message": ""
    }


@router.post("/manual", response_model=dict)
def update_manual_rate(
    data: ManualRateUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin)
):
    set_manual_rate(db, data.from_currency.upper(), data.to_currency.upper(), data.rate)
    return {"success": True, "data": None, "message": "Tasa actualizada"}


@router.post("/refresh", response_model=dict)
async def refresh_rates(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    success = await fetch_and_store_rates(db)
    return {
        "success": success,
        "data": None,
        "message": "Tasas actualizadas" if success else "Error al actualizar tasas"
    }
