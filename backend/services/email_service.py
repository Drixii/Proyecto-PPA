"""Verificación del correo con un código de 6 cifras.

Para qué sirve
--------------
Sin esto, cualquiera se registra con un correo inventado. Con esto, crear diez
cuentas exige diez buzones reales — y de paso hay una vía para avisar al
cliente si algo pasa con su envío.

No prueba quién es alguien. Prueba que el correo es suyo, que es una cosa
mucho más pequeña pero que no cuesta nada.

Decisiones que importan
-----------------------
- **Se guarda el hash del código, no el código.** Quien lea la base de datos no
  debe poder verificar la cuenta de otro.
- **Máximo 5 intentos.** Seis cifras son un millón de combinaciones; sin límite
  de intentos, probarlas todas es cuestión de minutos.
- **Caduca a los 15 minutos.** Suficiente para que llegue el correo, poco para
  que un código filtrado siga sirviendo.
- **Sin SMTP configurado el registro NO se rompe.** La cuenta se crea sin
  verificar y un admin puede verificarla a mano desde el panel. Preferible a
  dejar a los clientes fuera porque falte una credencial.
"""
import hashlib
import hmac
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

log = logging.getLogger("ppa")

# Claves en la tabla de ajustes. Cifradas, como las de los proveedores de pago.
CLAVE_HOST = "smtp_host"
CLAVE_PUERTO = "smtp_port"
CLAVE_USUARIO = "smtp_user"
CLAVE_PASSWORD = "smtp_password"
CLAVE_REMITENTE = "smtp_from"

# Proveedor de envío: "smtp", "resend" o "brevo".
#
# DigitalOcean bloquea el tráfico saliente por los puertos 25, 587 y 465 en
# este droplet — comprobado contra Gmail, Resend y Brevo, todos agotan el
# tiempo de espera mientras el 443 va bien. Desbloquearlos es un ticket a
# soporte que puede no aprobarse, así que el envío por API sobre HTTPS es el
# camino que no depende de eso.
#
# El SMTP se deja porque sigue siendo válido en cualquier otro servidor.
CLAVE_PROVEEDOR = "email_provider"
CLAVE_API_KEY = "email_api_key"

PROVEEDORES = ("smtp", "resend", "brevo")

CAMPOS = (
    CLAVE_PROVEEDOR, CLAVE_API_KEY,
    CLAVE_HOST, CLAVE_PUERTO, CLAVE_USUARIO, CLAVE_PASSWORD, CLAVE_REMITENTE,
)

# Tiempo de espera de las llamadas a la API. Corto a propósito: esto corre
# dentro del registro de un cliente y bloquear medio minuto su pantalla porque
# el proveedor va lento es peor que fallar y dejarle reenviar.
ESPERA_API_SEG = 15

VIDA_CODIGO_MIN = 15
MAX_INTENTOS = 5

# Cuánto hay que esperar entre reenvíos. Sin esto, el botón de "reenviar" es un
# medio para inundar el buzón de cualquiera escribiendo su correo.
ESPERA_REENVIO_SEG = 60


def _config(nombre: str) -> str:
    from database import SessionLocal
    from services.secret_store import get_secret
    db = SessionLocal()
    try:
        return (get_secret(db, nombre) or "").strip()
    except Exception as e:
        log.warning("[email] no se pudo leer '%s': %s", nombre, e)
        return ""
    finally:
        db.close()


# Cache corto de "¿hay SMTP?".
#
# La pantalla del cliente pregunta por esto en cada carga y cada respuesta
# significaba tres consultas descifradas. La respuesta solo cambia cuando un
# admin toca los ajustes, así que medio minuto de retraso no molesta a nadie.
_CACHE_CONFIG = {"hasta": 0.0, "valor": False}
VIDA_CACHE_SEG = 30


def proveedor() -> str:
    v = (_config(CLAVE_PROVEEDOR) or "").strip().lower()
    return v if v in PROVEEDORES else "smtp"


def configurado(forzar: bool = False) -> bool:
    import time
    ahora = time.time()
    if not forzar and ahora < _CACHE_CONFIG["hasta"]:
        return _CACHE_CONFIG["valor"]

    prov = proveedor()
    if prov == "smtp":
        valor = bool(_config(CLAVE_HOST) and _config(CLAVE_USUARIO) and _config(CLAVE_PASSWORD))
    else:
        # El remitente no es opcional con la API: los dos proveedores lo exigen
        # y tiene que ser una dirección verificada en su panel.
        valor = bool(_config(CLAVE_API_KEY) and _config(CLAVE_REMITENTE))

    _CACHE_CONFIG.update(hasta=ahora + VIDA_CACHE_SEG, valor=valor)
    return valor


def _hash(codigo: str) -> str:
    return hashlib.sha256(codigo.encode()).hexdigest()


def _enviar_api(destino: str, asunto: str, cuerpo: str) -> bool:
    """Envío por HTTPS. Es lo que funciona con los puertos SMTP cerrados."""
    import httpx

    prov = proveedor()
    clave = _config(CLAVE_API_KEY)
    remitente = _config(CLAVE_REMITENTE)
    if not (clave and remitente):
        return False

    if prov == "resend":
        url = "https://api.resend.com/emails"
        cabeceras = {"Authorization": f"Bearer {clave}"}
        cuerpo_json = {
            "from": remitente,
            "to": [destino],
            "subject": asunto,
            "text": cuerpo,
        }
    else:  # brevo
        url = "https://api.brevo.com/v3/smtp/email"
        cabeceras = {"api-key": clave}
        cuerpo_json = {
            "sender": {"email": remitente},
            "to": [{"email": destino}],
            "subject": asunto,
            "textContent": cuerpo,
        }

    try:
        r = httpx.post(url, json=cuerpo_json, headers=cabeceras, timeout=ESPERA_API_SEG)
        if r.status_code >= 300:
            # El cuerpo entero al log: estos proveedores explican el motivo ahí
            # (dominio sin verificar, clave revocada, remitente ajeno) y sin
            # verlo el fallo es indistinguible de cualquier otro.
            log.error("[email] %s rechazó el envío a %s: %s %s",
                      prov, destino, r.status_code, r.text[:300])
            return False
        return True
    except Exception as e:
        log.error("[email] %s no respondió al enviar a %s: %s", prov, destino, e)
        return False


def _enviar(destino: str, asunto: str, cuerpo: str) -> bool:
    if proveedor() != "smtp":
        return _enviar_api(destino, asunto, cuerpo)

    host = _config(CLAVE_HOST)
    usuario = _config(CLAVE_USUARIO)
    password = _config(CLAVE_PASSWORD)
    remitente = _config(CLAVE_REMITENTE) or usuario
    try:
        puerto = int(_config(CLAVE_PUERTO) or 587)
    except ValueError:
        puerto = 587

    if not (host and usuario and password):
        return False

    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = remitente
    msg["To"] = destino
    msg.set_content(cuerpo)

    try:
        if puerto == 465:
            with smtplib.SMTP_SSL(host, puerto, timeout=20) as s:
                s.login(usuario, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, puerto, timeout=20) as s:
                s.starttls()
                s.login(usuario, password)
                s.send_message(msg)
        return True
    except Exception as e:
        # El motivo entero al log: un fallo de SMTP suele ser credenciales o
        # puerto, y sin el texto exacto no hay forma de saber cuál.
        log.error("[email] no se pudo enviar a %s: %s", destino, e)
        return False


def enviar_codigo(db, email: str) -> tuple[bool, str]:
    """Genera y manda un código. Devuelve (enviado, motivo_si_no)."""
    from sqlalchemy import text

    email = (email or "").strip().lower()
    if not email:
        return False, "Falta el correo"

    ahora = datetime.now(timezone.utc)

    # Freno de reenvío.
    ultimo = db.execute(
        text("SELECT created_at FROM email_codes WHERE email = :e ORDER BY id DESC LIMIT 1"),
        {"e": email},
    ).fetchone()
    if ultimo and ultimo[0]:
        creado = ultimo[0]
        if creado.tzinfo is None:
            creado = creado.replace(tzinfo=timezone.utc)
        espera = ESPERA_REENVIO_SEG - (ahora - creado).total_seconds()
        if espera > 0:
            return False, f"Espera {int(espera)} segundos para pedir otro código"

    codigo = f"{secrets.randbelow(1_000_000):06d}"

    db.execute(
        text("""INSERT INTO email_codes (email, code_hash, intentos, expira_at, created_at)
                VALUES (:e, :h, 0, :exp, :ahora)"""),
        {"e": email, "h": _hash(codigo), "exp": ahora + timedelta(minutes=VIDA_CODIGO_MIN), "ahora": ahora},
    )
    db.commit()

    cuerpo = (
        f"Tu código de verificación es: {codigo}\n\n"
        f"Caduca en {VIDA_CODIGO_MIN} minutos.\n\n"
        "Si no fuiste tú quien lo pidió, ignora este mensaje."
    )
    if not _enviar(email, "Tu código de verificación", cuerpo):
        return False, "No se pudo enviar el correo"
    return True, ""


def verificar_codigo(db, email: str, codigo: str) -> tuple[bool, str]:
    """Comprueba el código. Devuelve (correcto, motivo_si_no)."""
    from sqlalchemy import text

    email = (email or "").strip().lower()
    codigo = (codigo or "").strip()
    if not codigo:
        return False, "Falta el código"

    fila = db.execute(
        text("""SELECT id, code_hash, intentos, expira_at, usado_at
                FROM email_codes WHERE email = :e ORDER BY id DESC LIMIT 1"""),
        {"e": email},
    ).fetchone()
    if not fila:
        return False, "Pide un código primero"

    id_, code_hash, intentos, expira_at, usado_at = fila
    if usado_at:
        return False, "Ese código ya se usó"
    if intentos >= MAX_INTENTOS:
        return False, "Demasiados intentos — pide un código nuevo"

    if expira_at.tzinfo is None:
        expira_at = expira_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expira_at:
        return False, "El código caducó — pide uno nuevo"

    # El intento se cuenta antes de comparar: si se contara después, un fallo a
    # mitad dejaría el contador sin subir y el límite no serviría.
    db.execute(text("UPDATE email_codes SET intentos = intentos + 1 WHERE id = :id"), {"id": id_})
    db.commit()

    # compare_digest y no ==: comparar cadenas normalmente corta en el primer
    # carácter distinto, y ese tiempo de más deja adivinar el código.
    if not hmac.compare_digest(code_hash, _hash(codigo)):
        return False, "Código incorrecto"

    db.execute(
        text("UPDATE email_codes SET usado_at = :ahora WHERE id = :id"),
        {"ahora": datetime.now(timezone.utc), "id": id_},
    )
    db.commit()
    return True, ""


def probar_conexion() -> tuple[bool, str]:
    """Comprueba las credenciales sin mandar nada a nadie."""
    prov = proveedor()
    if prov != "smtp":
        import httpx

        clave = _config(CLAVE_API_KEY)
        if not clave:
            return False, "Falta la clave de API"

        if prov == "resend":
            url, cabeceras = "https://api.resend.com/domains", {"Authorization": f"Bearer {clave}"}
        else:
            url, cabeceras = "https://api.brevo.com/v3/account", {"api-key": clave}

        try:
            r = httpx.get(url, headers=cabeceras, timeout=ESPERA_API_SEG)
        except Exception as e:
            return False, f"No se pudo conectar con {prov}: {e}"
        if r.status_code in (401, 403):
            return False, "La clave de API no es válida"
        if r.status_code >= 300:
            return False, f"{prov} respondió {r.status_code}: {r.text[:200]}"
        if not _config(CLAVE_REMITENTE):
            return True, "La clave es válida, pero falta el remitente"
        return True, f"Clave de {prov} correcta"

    host = _config(CLAVE_HOST)
    usuario = _config(CLAVE_USUARIO)
    password = _config(CLAVE_PASSWORD)
    try:
        puerto = int(_config(CLAVE_PUERTO) or 587)
    except ValueError:
        puerto = 587

    if not (host and usuario and password):
        return False, "Faltan credenciales SMTP"

    try:
        if puerto == 465:
            with smtplib.SMTP_SSL(host, puerto, timeout=15) as s:
                s.login(usuario, password)
        else:
            with smtplib.SMTP(host, puerto, timeout=15) as s:
                s.starttls()
                s.login(usuario, password)
        return True, f"Conexión correcta con {host}:{puerto}"
    except Exception as e:
        return False, f"No se pudo conectar: {e}"
