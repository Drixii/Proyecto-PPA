import os
import httpx
from datetime import date as date_type
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/flights", tags=["flights"])

DUFFEL_BASE = "https://api.duffel.com"


def _headers():
    key = os.getenv("DUFFEL_API_KEY", "")
    if not key:
        raise HTTPException(500, "DUFFEL_API_KEY no configurada")
    return {
        "Authorization": f"Bearer {key}",
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


class Slice(BaseModel):
    origin: str
    destination: str
    departure_date: str


class SearchRequest(BaseModel):
    slices: list[Slice]
    passengers: int = 1
    cabin_class: str = "economy"


class PassengerDetail(BaseModel):
    id: str
    title: str
    given_name: str
    family_name: str
    born_on: str
    gender: str
    email: str
    phone_number: str


class BookRequest(BaseModel):
    offer_id: str
    passengers: list[PassengerDetail]
    currency: str = "USD"
    amount: str


@router.post("/search")
async def search_flights(body: SearchRequest):
    payload = {
        "data": {
            "slices": [s.model_dump() for s in body.slices],
            "passengers": [{"type": "adult"} for _ in range(body.passengers)],
            "cabin_class": body.cabin_class,
            "return_offers": True,
        }
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{DUFFEL_BASE}/air/offer_requests", json=payload, headers=_headers())
    if r.status_code >= 400:
        try:
            errs = r.json().get("errors", [])
            msg = errs[0].get("message", r.text) if errs else r.text
        except Exception:
            msg = r.text
        raise HTTPException(r.status_code, msg)
    data = r.json()["data"]
    return {
        "offer_request_id": data["id"],
        "offers": _slim_offers(data.get("offers", [])),
    }


@router.get("/offers/{offer_id}")
async def get_offer(offer_id: str):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{DUFFEL_BASE}/air/offers/{offer_id}", headers=_headers())
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.json().get("errors", r.text))
    return {"data": r.json()["data"]}


@router.post("/book")
async def book_flight(body: BookRequest):
    # Validate all passengers are 18+ (offer type=adult)
    today = date_type.today()
    for i, p in enumerate(body.passengers):
        try:
            born = date_type.fromisoformat(p.born_on)
        except ValueError:
            raise HTTPException(422, f"Pasajero {i+1}: fecha de nacimiento inválida")
        age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
        if age < 18:
            raise HTTPException(422, f"Pasajero {i+1} ({p.given_name}): debe tener al menos 18 años (adulto). Ingresa tu fecha de nacimiento real.")

    # Strip `id` if empty — Duffel rejects extra fields; include only fields Duffel expects
    pax_payload = []
    for p in body.passengers:
        d = p.model_dump()
        if not d.get("id"):
            d.pop("id", None)
        pax_payload.append(d)

    payload = {
        "data": {
            "selected_offers": [body.offer_id],
            "payments": [{"type": "balance", "currency": body.currency, "amount": body.amount}],
            "passengers": pax_payload,
        }
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{DUFFEL_BASE}/air/orders", json=payload, headers=_headers())
    if r.status_code >= 400:
        try:
            errs = r.json().get("errors", [])
            msg = errs[0].get("message", r.text) if errs else r.text
        except Exception:
            msg = r.text
        raise HTTPException(r.status_code, msg)
    data = r.json()["data"]
    return {
        "order_id": data["id"],
        "booking_reference": data.get("booking_reference"),
        "total_amount": data.get("total_amount"),
        "total_currency": data.get("total_currency"),
    }


def _slim_offers(offers: list) -> list:
    result = []
    for o in offers:
        slices = []
        for sl in o.get("slices", []):
            segs = sl.get("segments", [])
            first = segs[0] if segs else {}
            last = segs[-1] if segs else {}
            slices.append({
                "origin": sl.get("origin", {}).get("iata_code"),
                "destination": sl.get("destination", {}).get("iata_code"),
                "departure_at": first.get("departing_at"),
                "arriving_at": last.get("arriving_at"),
                "duration": sl.get("duration"),
                "stops": len(segs) - 1,
                "airline": first.get("marketing_carrier", {}).get("name"),
                "airline_logo": first.get("marketing_carrier", {}).get("logo_symbol_url"),
                "flight_number": first.get("marketing_carrier_flight_number"),
            })
        result.append({
            "id": o["id"],
            "total_amount": o.get("total_amount"),
            "total_currency": o.get("total_currency"),
            "base_amount": o.get("base_amount"),
            "tax_amount": o.get("tax_amount"),
            "slices": slices,
            "passengers": o.get("passengers", []),
            "expires_at": o.get("expires_at"),
        })
    return sorted(result, key=lambda x: float(x["total_amount"] or 0))
