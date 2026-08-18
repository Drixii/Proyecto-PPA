from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    # Obligatorios desde ahora: el teléfono es la única vía para contactar a
    # alguien antes de soltar un envío dudoso, y el documento es lo que hace
    # que una persona sea una sola cuenta.
    phone: str
    document_type: str
    document_number: str
    country: Optional[str] = None
    invite_code: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    email_verified: bool = False
    is_trusted: bool = False
    id: int
    email: str
    full_name: str
    role: str
    phone: Optional[str]
    country: Optional[str]
    avatar: Optional[str] = None
    is_active: bool
    timezone: Optional[str] = 'America/Santiago'
    must_change_password: bool = False
    managed_countries: Optional[List[str]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
