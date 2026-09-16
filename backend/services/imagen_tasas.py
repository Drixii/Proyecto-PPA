"""Imagen con las tasas de un pais de origen hacia todos sus destinos.

Se dibuja aqui con los datos reales en vez de pedirsela a un modelo: los
generadores de imagen no escriben digitos de forma fiable —cambian un 3 por un
8, se saltan una coma— y esto es una tabla de cambio que se le manda a un
cliente. Dibujada, sale identica cada vez y en menos de un segundo.

La via con IA existe igual, detras de un interruptor en Ajustes, para poder
compararlas. Ver `generar_con_ia`.
"""
import io
import os

import httpx
from PIL import Image, ImageDraw, ImageFont

FUENTES = "/usr/share/fonts/truetype/dejavu"
NEGRITA = os.path.join(FUENTES, "DejaVuSans-Bold.ttf")
NORMAL = os.path.join(FUENTES, "DejaVuSans.ttf")

# Fondo azul de la marca, de arriba a abajo.
FONDO_ARRIBA = (11, 31, 74)
FONDO_ABAJO = (6, 13, 40)
PILDORA = (255, 255, 255)
TEXTO_PAIS = (11, 31, 74)
TEXTO_TITULO = (234, 242, 255)
TEXTO_SUAVE = (138, 160, 204)

ANCHO = 900
MARGEN = 40
ALTO_FILA = 96
ESPACIO = 14

_banderas: dict[str, Image.Image] = {}


def _fuente(ruta: str, tam: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(ruta, tam)
    except OSError:
        return ImageFont.load_default()


def _bandera(iso2: str, alto: int) -> Image.Image | None:
    """Bandera redondeada, descargada una vez y guardada en memoria."""
    if not iso2:
        return None
    clave = f"{iso2}:{alto}"
    if clave in _banderas:
        return _banderas[clave]
    try:
        r = httpx.get(f"https://flagcdn.com/w160/{iso2.lower()}.png", timeout=10)
        if r.status_code != 200:
            return None
        img = Image.open(io.BytesIO(r.content)).convert("RGBA")
    except Exception:
        return None

    # Cuadrada y recortada en circulo, como en la referencia.
    lado = min(img.size)
    izq = (img.width - lado) // 2
    arr = (img.height - lado) // 2
    img = img.crop((izq, arr, izq + lado, arr + lado)).resize((alto, alto), Image.LANCZOS)

    mascara = Image.new("L", (alto, alto), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, alto - 1, alto - 1), fill=255)
    img.putalpha(mascara)

    _banderas[clave] = img
    return img


def formatea_tasa(valor: float) -> str:
    """Numero legible sin perder precision en monedas muy pequenas.

    Un peso chileno vale 0,00483 reales: con dos decimales saldria 0,00 y la
    imagen no diria nada. Se conservan cuatro cifras significativas y se usa
    coma decimal, que es como se lee en la region.
    """
    if valor is None:
        return "—"
    if valor >= 1000:
        texto = f"{valor:,.0f}".replace(",", ".")
    elif valor >= 1:
        texto = f"{valor:,.3f}".replace(",", "@").replace(".", ",").replace("@", ".")
    else:
        # Cuatro cifras significativas: 0,00483 en vez de 0,00.
        decimales = 4
        v = valor
        while v < 1 and decimales < 8:
            v *= 10
            decimales += 1
        texto = f"{valor:.{decimales}f}".rstrip("0").rstrip(".").replace(".", ",")
    return texto


def generar(origen: dict, filas: list[dict]) -> bytes:
    """PNG con una fila por destino: bandera, pais y a cuanto se cambia.

    `origen` es {name, iso2, currency}; cada fila, {name, iso2, currency, tasa}.
    """
    alto = MARGEN * 2 + 120 + len(filas) * (ALTO_FILA + ESPACIO)
    img = Image.new("RGB", (ANCHO, alto), FONDO_ABAJO)
    d = ImageDraw.Draw(img)

    for y in range(alto):
        p = y / max(alto - 1, 1)
        d.line(
            [(0, y), (ANCHO, y)],
            fill=tuple(int(a + (b - a) * p) for a, b in zip(FONDO_ARRIBA, FONDO_ABAJO)),
        )

    titulo = _fuente(NEGRITA, 44)
    subtitulo = _fuente(NORMAL, 22)
    f_pais = _fuente(NEGRITA, 30)
    f_tasa = _fuente(NEGRITA, 36)

    d.text((MARGEN, MARGEN), f"ENVÍOS DESDE {origen['name'].upper()}", font=titulo, fill=TEXTO_TITULO)
    d.text(
        (MARGEN, MARGEN + 56),
        f"Cuánto recibe el destinatario por cada 1 {origen['currency']}",
        font=subtitulo, fill=TEXTO_SUAVE,
    )

    y = MARGEN + 120
    for fila in filas:
        d.rounded_rectangle(
            [(MARGEN, y), (ANCHO - MARGEN, y + ALTO_FILA)],
            radius=ALTO_FILA // 2, fill=PILDORA,
        )

        bandera = _bandera(fila.get("iso2", ""), ALTO_FILA - 24)
        if bandera:
            img.paste(bandera, (MARGEN + 14, y + 12), bandera)

        d.text(
            (MARGEN + 14 + (ALTO_FILA - 24) + 22, y + ALTO_FILA // 2),
            fila["name"].upper(), font=f_pais, fill=TEXTO_PAIS, anchor="lm",
        )

        texto = formatea_tasa(fila.get("tasa"))
        d.text(
            (ANCHO - MARGEN - 28, y + ALTO_FILA // 2),
            texto, font=f_tasa, fill=TEXTO_PAIS, anchor="rm",
        )
        y += ALTO_FILA + ESPACIO

    salida = io.BytesIO()
    img.save(salida, "PNG", optimize=True)
    return salida.getvalue()


def generar_con_ia(origen: dict, filas: list[dict], api_key: str) -> bytes:
    """La misma tabla, pero dibujada por OpenAI.

    Aviso que conviene tener presente: el modelo redibuja los numeros a mano
    alzada y suele equivocarse en alguno. Sirve para ver el estilo, no para
    mandarle la tasa a un cliente sin mirarla.
    """
    lineas = "\n".join(
        f"{f['name']}: {formatea_tasa(f.get('tasa'))}" for f in filas
    )
    prompt = (
        "Vertical exchange-rate board, dark blue gradient background. "
        "A stacked list of white rounded pill rows. Each row: a circular country "
        "flag on the left, the country name in bold dark blue uppercase next to it, "
        "and the number on the right in large bold dark blue. "
        "Clean, modern, high contrast, no extra text or watermarks. "
        f"Header: 'ENVÍOS DESDE {origen['name'].upper()}'. Rows, in this exact order "
        f"and with these exact numbers:\n{lineas}"
    )

    r = httpx.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": "gpt-image-1", "prompt": prompt, "size": "1024x1536", "n": 1},
        timeout=180,
    )
    if r.status_code != 200:
        raise RuntimeError(f"OpenAI respondió {r.status_code}: {r.text[:300]}")

    datos = r.json().get("data") or []
    if not datos:
        raise RuntimeError("OpenAI no devolvió ninguna imagen")

    import base64
    b64 = datos[0].get("b64_json")
    if b64:
        return base64.b64decode(b64)

    url = datos[0].get("url")
    if not url:
        raise RuntimeError("OpenAI no devolvió ni imagen ni enlace")
    return httpx.get(url, timeout=60).content
