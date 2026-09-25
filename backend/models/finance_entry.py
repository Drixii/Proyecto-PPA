from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Index
from sqlalchemy.sql import func
from database import Base


class FinanceEntry(Base):
    """Un apunte del cuaderno de finanzas del super-admin.

    Es un cuaderno, no un informe: lo escribe él a mano y no se rellena con los
    envíos de la web. Por eso vive aparte de `orders` y no se cruza con nada —
    aquí entra también lo que se movió fuera de la plataforma, que es justo lo
    que ningún listado de envíos puede saber.

    Una fila = un movimiento: un origen, un destino y un monto. En la pantalla
    escribir en una columna bloquea el resto de la fila, y esto es el reflejo
    de esa regla.

    El monto va en la moneda del país de origen y esa moneda se guarda AQUÍ, no
    se mira en la tabla de países al leer: si mañana se le cambia la moneda a
    un país, lo apuntado el mes pasado tiene que seguir significando lo mismo.
    """
    __tablename__ = "finance_entries"

    id = Column(Integer, primary_key=True, index=True)
    # De quién es el cuaderno. Cada super-admin ve solo el suyo.
    super_admin_id = Column(Integer, nullable=False, index=True)

    fecha = Column(Date, nullable=False, index=True)
    origen = Column(String, nullable=False)     # país que envía
    destino = Column(String, nullable=False)    # país que recibe
    moneda = Column(String, nullable=False)     # la del origen, congelada

    monto = Column(Float, nullable=False, default=0.0)
    porcentaje = Column(Float, nullable=False, default=0.0)

    # El orden en que se ven las filas. Se guarda porque el cuaderno se lee de
    # arriba abajo y reordenarlo por id daría un orden distinto al escrito.
    orden = Column(Integer, nullable=False, default=0)

    nota = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# Lo que se pide siempre: el cuaderno de un super-admin en un rango de fechas.
Index("ix_finance_entries_dueno_fecha", FinanceEntry.super_admin_id, FinanceEntry.fecha)
