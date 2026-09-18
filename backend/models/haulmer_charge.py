from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func

from database import Base


class HaulmerCharge(Base):
    """Un intento de cobro con tarjeta a través de Haulmer (TUU Pago Online).

    Existe por una razón concreta: Haulmer solo cobra en pesos chilenos, y la
    orden puede estar en otra moneda. El monto en CLP que se le pidió al
    cliente se decide al abrir el cobro, con la tasa de ese momento, y hay que
    guardarlo para poder comprobar después —cuando llegue el aviso— que
    pagaron exactamente eso. Recalcularlo con la tasa del día siguiente no
    serviría: habría cambiado.

    Cada intento es una fila. El cliente que abandona el formulario y vuelve a
    empezar genera una referencia nueva, porque Haulmer rechaza una repetida.
    """

    __tablename__ = "haulmer_charges"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)

    # Lo que va en x_reference. Es lo que devuelve el aviso, así que por aquí
    # se encuentra la orden.
    reference = Column(String, unique=True, nullable=False, index=True)

    amount_clp = Column(Float, nullable=False)
    # De qué se convirtió, para poder explicar el cobro en el panel.
    amount_from = Column(Float, nullable=True)
    currency_from = Column(String, nullable=True)
    rate = Column(Float, nullable=True)

    # creado | pagado | fallido
    status = Column(String, default="creado", index=True)
    mode = Column(String, nullable=True)
    # Lo último que dijo Haulmer de este cobro, para poder mirarlo sin entrar
    # a su panel.
    last_message = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
