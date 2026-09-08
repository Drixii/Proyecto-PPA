from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class SuperAdminAccount(Base):
    """Cuenta bancaria propia de un super-admin para cobrar por transferencia.

    Koywe solo emite cuenta en tres monedas (MXN, ARS, CLP). En las otras seis
    desde las que se puede enviar (COP, USD, EUR, PEN, BRL, CAD) al cliente se
    le ofrecia "Transferencia / sube tu comprobante" sin decirle a donde mandar
    el dinero. Aqui cada super-admin registra la suya.

    Es UNA por super-admin y moneda: `super_admin_id` no es opcional y el indice
    unico lo garantiza. Los clientes de un super-admin ven solo las cuentas de
    su dueno, igual que la cartera se reparte por `Order.super_admin_id`.

    `datos` es JSON y no columnas fijas a proposito: cada pais pide cosas
    distintas (IBAN+BIC en Espana, clave PIX en Brasil, routing+account en
    EEUU) y con columnas habria una decena siempre vacias. Que campos van en
    cada moneda lo define services/cuentas_propias.py, que tambien valida.
    """
    __tablename__ = "super_admin_accounts"
    __table_args__ = (
        UniqueConstraint("super_admin_id", "currency", name="uq_cuenta_propia_admin_moneda"),
    )

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, index=True)
    currency = Column(String, nullable=False, index=True)

    # {"banco": "...", "titular": "...", ...} segun la moneda.
    datos = Column(Text, nullable=False, default="{}")

    # Apagarla sin borrar los datos: al volver a activarla no hay que teclear
    # todo otra vez. Una cuenta inactiva no se le muestra a nadie.
    active = Column(Boolean, nullable=False, default=True)

    # Si en este pais se ofrece pagar con tarjeta. Se apaga por pais porque
    # Stripe no cobra igual en todos: donde no hay integracion real, el boton
    # llevaba a un cobro que fallaba y el cliente creia que la culpa era suya.
    # Por defecto encendido, que es como se comportaba antes de existir esto.
    card_enabled = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
