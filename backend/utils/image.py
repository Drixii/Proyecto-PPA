import io
from fastapi import HTTPException
from PIL import Image

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
