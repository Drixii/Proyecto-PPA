import io
import logging
from fastapi import HTTPException
from PIL import Image

log = logging.getLogger("ppa")

# HEIC/HEIF: el formato por defecto de las fotos de iPhone. Pillow no lo lee
# solo. Sin esto, un cliente con iPhone sube su comprobante tal cual sale de la
# camara y recibe "tipo de archivo no permitido" sin entender por que — que es
# justo lo que pasaba.
#
# Si el paquete no esta, se sigue sin HEIC en vez de tumbar el arranque: el
# resto de formatos no tiene por que dejar de funcionar.
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_SOPORTADO = True
except ImportError:  # pragma: no cover
    HEIC_SOPORTADO = False
    log.warning("[imagen] pillow-heif no instalado: no se aceptaran fotos HEIC de iPhone")

MAX_INPUT_BYTES = 10 * 1024 * 1024  # 10 MB

def to_webp(content: bytes, quality: int = 82) -> bytes:
    img = Image.open(io.BytesIO(content))
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=quality)
    return buf.getvalue()

def validate_and_convert(content: bytes, min_kb: int = 0) -> bytes:
    if len(content) > MAX_INPUT_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 10 MB")
    return to_webp(content)
