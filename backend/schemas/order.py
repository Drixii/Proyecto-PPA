from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class OrderCreate(BaseModel):
    # Remitente
    sender_name: str
    sender_id_type: Optional[str] = None
    sender_id_num: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_country: Optional[str] = None
    # Receptor
    receiver_name: str
    receiver_phone: Optional[str] = None
    receiver_country: str
    receiver_bank_id: Optional[int] = None
    receiver_account: Optional[str] = None
    receiver_id_type: Optional[str] = None
    receiver_id_num: Optional[str] = None
    # Montos
    amount_sent: float
    currency_from: str
    currency_to: str
    # Pago
    payment_method: Optional[str] = None
    payment_bank: Optional[str] = None


class OrderOut(BaseModel):
    id: int
    order_number: str
    client_id: int
    sender_name: str
    sender_id_type: Optional[str]
    sender_id_num: Optional[str]
    sender_phone: Optional[str]
    sender_country: Optional[str]
    receiver_name: str
    receiver_phone: Optional[str]
    receiver_country: str
    receiver_bank_id: Optional[int]
    receiver_account: Optional[str]
    receiver_id_type: Optional[str]
    receiver_id_num: Optional[str]
    amount_sent: float
    currency_from: str
    currency_to: str
    exchange_rate: float
    amount_received: float
    fee: float
    status: str
    sub_admin_id: Optional[int]
    super_admin_id: Optional[int] = None
    payment_method: Optional[str]
    payment_bank: Optional[str]
    payment_proof: Optional[str]
    completion_proof: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class OrderStatusUpdate(BaseModel):
    status: str  # en_aprobacion | en_proceso | completado


class MessageOut(BaseModel):
    id: int
    order_id: int
    sender_id: int
    content: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
