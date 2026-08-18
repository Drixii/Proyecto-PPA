from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="client")  # 'client' | 'admin'
    phone = Column(String, nullable=True)
    country = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    timezone = Column(String, default='America/Santiago', nullable=True)
    must_change_password = Column(Boolean, default=False)
    # Momento del último cambio de contraseña. Los tokens emitidos antes dejan
    # de valer: cambiar la clave de alguien tiene que echarlo de las sesiones
    # abiertas, o cambiarla porque le robaron la cuenta no sirve de nada.
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    super_admin_id = Column(Integer, nullable=True)
    invite_code_used = Column(String, nullable=True)
    # Documento del titular de la cuenta. Único: una persona, una cuenta.
    # Sin esa unicidad, cualquier límite por cliente se esquiva abriendo otra.
    # Se guarda normalizado (services/documento_service.normaliza) para que
    # "12345678-5" y "12.345.678-5" no pasen por documentos distintos.
    document_type = Column(String, nullable=True)
    document_number = Column(String, nullable=True, index=True)
    # Correo verificado con un código de 6 cifras. Sin esto no se puede enviar
    # dinero: es lo que impide crear cuentas con correos inventados.
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    # Marcado a mano por un super-admin: se salta la retención del primer
    # envío grande. Para clientes que ya se conocen fuera de la web.
    is_trusted = Column(Boolean, default=False)
    # Identificador de este cliente como contacto en Koywe. Su API no permite
    # crear dos contactos con el mismo correo o teléfono, ni buscar entre los
    # existentes, así que sin guardarlo aquí el segundo cobro de un cliente
    # fallaría contra el contacto que creó el primero.
    koywe_contact_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime, nullable=True)
