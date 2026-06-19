import io
from fastapi import HTTPException
from PIL import Image

def to_webp(content: bytes, quality: int = 85) -> bytes:
    img = Image.open(io.BytesIO(content))
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=quality)
    return buf.getvalue()

def validate_and_convert(content: bytes, min_kb: int) -> bytes:
    if len(content) < min_kb * 1024:
        raise HTTPException(status_code=400, detail=f"La imagen debe pesar al menos {min_kb} KB")
    return to_webp(content)
