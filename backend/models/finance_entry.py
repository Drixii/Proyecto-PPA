from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Index, Text
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

    # El mismo monto en pesos chilenos, con la tasa del día en que se anotó.
    #
    # Se congela, no se convierte al leer: si se recalculara con la tasa de hoy,
    # lo anotado el mes pasado cambiaría de valor cada mañana y el acumulado
    # dejaría de cuadrar con lo que se vio ese día. `tasa_clp` queda guardada
    # para poder explicar de dónde sale cada cifra.
    #
    # En cero cuando no había tasa para esa moneda; eso se avisa en pantalla en
    # vez de dar el total por bueno.
    monto_clp = Column(Float, nullable=False, default=0.0)
    tasa_clp = Column(Float, nullable=False, default=0.0)

    # El orden en que se ven las filas. Se guarda porque el cuaderno se lee de
    # arriba abajo y reordenarlo por id daría un orden distinto al escrito.
    orden = Column(Integer, nullable=False, default=0)

    nota = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# Lo que se pide siempre: el cuaderno de un super-admin en un rango de fechas.
Index("ix_finance_entries_dueno_fecha", FinanceEntry.super_admin_id, FinanceEntry.fecha)


class FinanceRate(Base):
    """El porcentaje que se gana en una ruta: de un país a otro.

    Vive aparte del apunte porque es del par origen→destino, no de cada línea:
    en la pantalla es el badge que hay sobre cada columna, y vale para todo lo
    anotado en esa columna. Tenerlo por fila obligaba a reescribirlo en cada
    movimiento y a que dos líneas de la misma ruta pudieran contradecirse.

    Cambiarlo recalcula lo ya anotado de esa ruta: es el porcentaje que se
    cobra ahí, no el de un día suelto.
    """
    __tablename__ = "finance_rates"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, index=True)
    origen = Column(String, nullable=False)
    destino = Column(String, nullable=False)
    porcentaje = Column(Float, nullable=False, default=0.0)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


Index("ix_finance_rates_ruta", FinanceRate.super_admin_id, FinanceRate.origen, FinanceRate.destino, unique=True)


class FinancePref(Base):
    """Cómo quiere ver el cuaderno cada super-admin.

    Qué países no le interesan y en qué orden quiere las filas. Son gustos de
    esta pantalla, no datos del negocio, y por eso viven aquí y no en el
    catálogo de países: ocultar un país en su cuaderno no puede quitárselo a
    los clientes de la web.

    Las dos listas van como JSON en una columna de texto porque solo se leen y
    se escriben enteras; una tabla con una fila por país sería más máquina para
    lo mismo.
    """
    __tablename__ = "finance_prefs"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, unique=True, index=True)

    ocultos = Column(Text, nullable=False, default="[]")   # países que no quiere ver
    orden = Column(Text, nullable=False, default="[]")     # los destinos, en su orden

    # El capital con el que se arranca el arqueo, en dólares.
    #
    # Va en dólares y no en pesos porque es como se cuenta el capital de la
    # casa, y porque en pesos tendría que reconvertirse cada día: el capital no
    # cambia de tamaño porque el dólar suba.
    capital_usd = Column(Float, nullable=False, default=0.0)

    # Desde qué día vale ese capital.
    #
    # Hace falta para que el capital se sume solo: lo que debería haber hoy es
    # el capital más las comisiones ganadas desde este día. Sin la fecha habría
    # que reescribir el capital cada mañana, y el día que se olvide la cifra
    # queda mal sin que nada lo avise.
    capital_desde = Column(Date, nullable=True)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FinanceBank(Base):
    """Lo que de verdad hay en los bancos, contado a mano.

    Es la otra mitad del arqueo: el cuaderno dice lo que debería haber, esto
    dice lo que hay. Cuadran o no cuadran, y eso es justo lo que se quiere ver.

    Un país puede tener varias cuentas, así que una fila es una cuenta de un
    país en un día: `orden` es la columna en la pantalla y `nombre` el banco,
    si se quiere apuntar cuál.

    El monto va en la moneda del país y se congela igual que en los apuntes:
    lo contado el lunes tiene que seguir significando lo mismo el viernes.
    """
    __tablename__ = "finance_banks"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, index=True)

    fecha = Column(Date, nullable=False, index=True)
    pais = Column(String, nullable=False)
    nombre = Column(String, nullable=True)      # el banco, si se quiere apuntar
    moneda = Column(String, nullable=False)     # la del país, congelada

    monto = Column(Float, nullable=False, default=0.0)
    monto_clp = Column(Float, nullable=False, default=0.0)
    tasa_clp = Column(Float, nullable=False, default=0.0)

    orden = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


Index("ix_finance_banks_dueno_fecha", FinanceBank.super_admin_id, FinanceBank.fecha)


class FinanceExpense(Base):
    """Un gasto: lo que sale de la caja y no es un envío.

    Se resta de lo que el arqueo dice que hay. Lleva concepto porque un gasto
    sin concepto, a la semana, no se sabe qué fue.
    """
    __tablename__ = "finance_expenses"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, index=True)

    fecha = Column(Date, nullable=False, index=True)
    concepto = Column(String, nullable=True)
    moneda = Column(String, nullable=False, default="CLP")

    monto = Column(Float, nullable=False, default=0.0)
    monto_clp = Column(Float, nullable=False, default=0.0)
    tasa_clp = Column(Float, nullable=False, default=0.0)

    orden = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


Index("ix_finance_expenses_dueno_fecha", FinanceExpense.super_admin_id, FinanceExpense.fecha)
