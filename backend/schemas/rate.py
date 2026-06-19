from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class RateOut(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConvertResult(BaseModel):
    from_currency: str
    to_currency: str
    amount_sent: float
    rate: float
    amount_received: float
    fee: float
    total_to_pay: float


class ManualRateUpdate(BaseModel):
    from_currency: str
    to_currency: str
    rate: float


class CountryInfo(BaseModel):
    country: str
    currency: str
    flag: Optional[str] = None
