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

# Tamano final, siempre el mismo: las dos vias —dibujada y por IA— terminan
# aqui, asi que las imagenes son intercambiables y encajan donde se publiquen.
ANCHO_FINAL, ALTO_FINAL = 560, 827

# Se dibuja al doble y se reduce al final: a 560 px de ancho el texto directo
# sale con los bordes sucios, y reducir desde el doble lo deja limpio.
ESCALA = 2
ANCHO = ANCHO_FINAL * ESCALA
ALTO = ALTO_FINAL * ESCALA
MARGEN = 28 * ESCALA
ESPACIO = 7 * ESCALA

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


def _a_tamano_final(img: Image.Image) -> bytes:
    """Deja la imagen exactamente en 560x827 y la devuelve como PNG."""
    if img.size != (ANCHO_FINAL, ALTO_FINAL):
        img = img.convert("RGB").resize((ANCHO_FINAL, ALTO_FINAL), Image.LANCZOS)
    salida = io.BytesIO()
    img.save(salida, "PNG", optimize=True)
    return salida.getvalue()


def generar(origen: dict, filas: list[dict]) -> bytes:
    """PNG con una fila por destino: bandera, pais y a cuanto se cambia.

    `origen` es {name, iso2, currency}; cada fila, {name, iso2, currency, tasa}.
    """
    alto = ALTO
    # El alto es fijo, asi que las filas se reparten el espacio que queda bajo
    # la cabecera. Con muchos destinos salen mas juntas, pero entran todas: es
    # preferible a cortar la lista o a que la imagen cambie de tamano.
    cabecera = 62 * ESCALA
    disponible = alto - MARGEN * 2 - cabecera
    n = max(len(filas), 1)
    alto_fila = max(int(disponible / n) - ESPACIO, 18 * ESCALA)

    img = Image.new("RGB", (ANCHO, alto), FONDO_ABAJO)
    d = ImageDraw.Draw(img)

    for y in range(alto):
        p = y / max(alto - 1, 1)
        d.line(
            [(0, y), (ANCHO, y)],
            fill=tuple(int(a + (b - a) * p) for a, b in zip(FONDO_ARRIBA, FONDO_ABAJO)),
        )

    titulo = _fuente(NEGRITA, int(26 * ESCALA))
    subtitulo = _fuente(NORMAL, int(12 * ESCALA))
    f_pais = _fuente(NEGRITA, max(int(alto_fila * 0.34), 9 * ESCALA))
    f_tasa = _fuente(NEGRITA, max(int(alto_fila * 0.40), 10 * ESCALA))

    d.text((MARGEN, MARGEN), f"ENVÍOS DESDE {origen['name'].upper()}", font=titulo, fill=TEXTO_TITULO)
    d.text(
        (MARGEN, MARGEN + int(32 * ESCALA)),
        f"Cuánto recibe el destinatario por cada 1 {origen['currency']}",
        font=subtitulo, fill=TEXTO_SUAVE,
    )

    y = MARGEN + cabecera
    for fila in filas:
        d.rounded_rectangle(
            [(MARGEN, y), (ANCHO - MARGEN, y + alto_fila)],
            radius=alto_fila // 2, fill=PILDORA,
        )

        lado = int(alto_fila * 0.78)
        bandera = _bandera(fila.get("iso2", ""), lado)
        if bandera:
            img.paste(bandera, (MARGEN + (alto_fila - lado) // 2, y + (alto_fila - lado) // 2), bandera)

        d.text(
            (MARGEN + lado + int(alto_fila * 0.35), y + alto_fila // 2),
            fila["name"].upper(), font=f_pais, fill=TEXTO_PAIS, anchor="lm",
        )

        d.text(
            (ANCHO - MARGEN - int(alto_fila * 0.3), y + alto_fila // 2),
            formatea_tasa(fila.get("tasa")), font=f_tasa, fill=TEXTO_PAIS, anchor="rm",
        )
        y += alto_fila + ESPACIO

    return _a_tamano_final(img)


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
        # OpenAI solo acepta unos pocos tamanos; 1024x1536 es el de proporcion
        # mas parecida a 560x827 (0,667 frente a 0,677), asi que al reducir casi
        # no se deforma.
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
        crudo = base64.b64decode(b64)
    else:
        url = datos[0].get("url")
        if not url:
            raise RuntimeError("OpenAI no devolvió ni imagen ni enlace")
        crudo = httpx.get(url, timeout=60).content

    # Al mismo tamano que la dibujada, para que las dos sean intercambiables.
    return _a_tamano_final(Image.open(io.BytesIO(crudo)))
