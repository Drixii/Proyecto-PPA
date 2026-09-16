from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class SuperAdminAccount(Base):
    """Cuenta bancaria propia de un super-admin para cobrar por transferencia.

    Koywe solo emite cuenta en tres monedas (MXN, ARS, CLP). En las otras seis
    desde las que se puede enviar (COP, USD, EUR, PEN, BRL, CAD) al cliente se
    le ofrecia "Transferencia / sube tu comprobante" sin decirle a donde mandar
    el dinero. Aqui cada super-admin registra la suya.

    VARIAS por super-admin y pais: una casa suele tener cuenta en dos o tres
    bancos del mismo pais y el cliente elige a cual transfiere. Antes habia una
    sola por moneda, lo que ademas metia a Ecuador, Estados Unidos y Panama en
    la misma ficha por compartir el dolar, sin poder distinguirlas.

    Los clientes de un super-admin ven solo las cuentas de su dueno, igual que
    la cartera se reparte por `Order.super_admin_id`.

    `datos` es JSON y no columnas fijas a proposito: cada pais pide cosas
    distintas (IBAN+BIC en Espana, clave PIX en Brasil, routing+account en
    EEUU) y con columnas habria una decena siempre vacias. Que campos van en
    cada moneda lo define services/cuentas_propias.py, que tambien valida.
    """
    __tablename__ = "super_admin_accounts"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, index=True)
    currency = Column(String, nullable=False, index=True)

    # El pais, que es lo que manda: tres paises comparten el dolar y cada uno
    # cobra por su lado (en Estados Unidos, por Zelle). Nullable porque las
    # filas que ya existian no lo tenian; la migracion las rellena.
    country = Column(String, nullable=True, index=True)

    # Como la llama el super-admin en su panel: "BCI principal", "Santander".
    # Con varias cuentas del mismo banco, el numero no basta para distinguirlas.
    alias = Column(String, nullable=True)

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

    # Si la transferencia de este pais la cobra la integracion (la cuenta que
    # emite Koywe) o va libre a la cuenta propia del super-admin. Por defecto
    # la integracion, que es como funcionaba antes de existir el interruptor.
    # Apagarlo no quita la transferencia: cambia a donde se transfiere.
    transfer_integracion = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
