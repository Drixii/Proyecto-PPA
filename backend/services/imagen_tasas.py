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
from datetime import datetime

import httpx
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
FUENTES = os.path.join(ASSETS, "fonts")
LOGO = os.path.join(ASSETS, "logo.png")
CACHE_FONDOS = os.path.join(ASSETS, "fondos_cache")

# Montserrat va con el logo. Si faltara el fichero se cae a DejaVu, que es lo
# unico que trae el sistema: fea pero legible, mejor que no generar la imagen.
DEJAVU = "/usr/share/fonts/truetype/dejavu"
PESOS = {
    "medium": (os.path.join(FUENTES, "Montserrat-Medium.ttf"), os.path.join(DEJAVU, "DejaVuSans.ttf")),
    "semi": (os.path.join(FUENTES, "Montserrat-SemiBold.ttf"), os.path.join(DEJAVU, "DejaVuSans-Bold.ttf")),
    "bold": (os.path.join(FUENTES, "Montserrat-Bold.ttf"), os.path.join(DEJAVU, "DejaVuSans-Bold.ttf")),
    "extra": (os.path.join(FUENTES, "Montserrat-ExtraBold.ttf"), os.path.join(DEJAVU, "DejaVuSans-Bold.ttf")),
    "black": (os.path.join(FUENTES, "Montserrat-Black.ttf"), os.path.join(DEJAVU, "DejaVuSans-Bold.ttf")),
}

AZUL = (10, 30, 88)            # azul de la marca, el de las pastillas oscuras
AZUL_HONDO = (5, 16, 52)
PILDORA = (255, 255, 255)
TEXTO_PAIS = (10, 30, 88)
TEXTO_TITULO = (255, 255, 255)
TEXTO_SUAVE = (186, 209, 245)

# Tamano final, siempre el mismo: las dos vias —dibujada y por IA— terminan
# aqui, asi que las imagenes son intercambiables y encajan donde se publiquen.
ANCHO_FINAL, ALTO_FINAL = 560, 827

# Se dibuja al doble y se reduce al final: a 560 px de ancho el texto directo
# sale con los bordes sucios, y reducir desde el doble lo deja limpio.
ESCALA = 2
ANCHO = ANCHO_FINAL * ESCALA
ALTO = ALTO_FINAL * ESCALA
MARGEN = 24 * ESCALA
ESPACIO = 5 * ESCALA

_banderas: dict[str, Image.Image] = {}
_fondos: dict[str, Image.Image] = {}


def _fuente(peso: str, tam: int) -> ImageFont.FreeTypeFont:
    """Montserrat del peso pedido; DejaVu si no esta; la de Pillow si tampoco."""
    for ruta in PESOS.get(peso, PESOS["bold"]):
        try:
            return ImageFont.truetype(ruta, tam)
        except OSError:
            continue
    return ImageFont.load_default()


def _ancho(texto: str, fuente: ImageFont.FreeTypeFont, espaciado: int = 0) -> int:
    base = fuente.getlength(texto)
    return int(base + espaciado * max(len(texto) - 1, 0))


def _encaja(peso: str, texto: str, tam: int, maximo: int, espaciado: int = 0):
    """Baja el cuerpo hasta que el texto quepa. 'REPÚBLICA DOMINICANA' es largo."""
    while tam > 8:
        f = _fuente(peso, tam)
        if _ancho(texto, f, espaciado) <= maximo:
            return f
        tam -= 1
    return _fuente(peso, 8)


SOMBRA = (6, 16, 46)


def _escribe(d: ImageDraw.ImageDraw, xy, texto, fuente, fill, espaciado=0,
             anchor="lm", sombra=False):
    """Como draw.text, pero con espaciado entre letras (el 'D E S D E').

    `sombra` dibuja una copia oscura desplazada: el texto de la cabecera va en
    blanco encima de una foto, y sobre un cielo claro se perderia.
    """
    if sombra:
        salto = max(int(fuente.size * 0.05), ESCALA)
        _escribe(d, (xy[0] + salto, xy[1] + salto), texto, fuente, SOMBRA, espaciado, anchor)

    if not espaciado:
        d.text(xy, texto, font=fuente, fill=fill, anchor=anchor)
        return
    x, y = xy
    total = _ancho(texto, fuente, espaciado)
    if anchor[0] == "m":
        x -= total // 2
    elif anchor[0] == "r":
        x -= total
    for letra in texto:
        d.text((x, y), letra, font=fuente, fill=fill, anchor="l" + anchor[1])
        x += fuente.getlength(letra) + espaciado


def _bandera(iso2: str, alto: int) -> Image.Image | None:
    """Bandera redondeada, descargada una vez y guardada en memoria."""
    if not iso2:
        return None
    clave = f"{iso2}:{alto}"
    if clave in _banderas:
        return _banderas[clave]
    try:
        r = httpx.get(f"https://flagcdn.com/w320/{iso2.lower()}.png", timeout=10)
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

    # El circulo se dibuja a 4x y se reduce: si no, el borde sale escalonado.
    mascara = Image.new("L", (alto * 4, alto * 4), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, alto * 4 - 1, alto * 4 - 1), fill=255)
    img.putalpha(mascara.resize((alto, alto), Image.LANCZOS))

    _banderas[clave] = img
    return img


# Que foto lleva de fondo cada pais. Van articulos de un monumento o un barrio
# concreto, no del pais ni de la capital: esos suelen llevar de portada un mapa,
# la bandera o un collage de seis fotos, y de fondo eso queda fatal.
FOTOS = {
    "CL": "Costanera Center", "CO": "Cartagena de Indias",
    "AR": "Obelisco de Buenos Aires", "VE": "Salto Ángel",
    "PE": "Machu Picchu", "MX": "Paseo de la Reforma",
    "BR": "Cristo Redentor", "EC": "Quito", "PA": "Ciudad de Panamá",
    "US": "Puente de Brooklyn", "CA": "Torre CN",
    "UY": "Rambla de Montevideo", "PY": "Asunción", "BO": "La Paz",
    "CR": "Volcán Arenal", "DO": "Santo Domingo",
    "EU": "Grand Place", "ES": "Gran Vía (Madrid)", "IT": "Coliseo",
    "PT": "Torre de Belém", "FR": "Torre Eiffel", "DE": "Puerta de Brandeburgo",
    "GB": "Tower Bridge",
}

# Wikipedia devuelve 403 a los agentes anonimos; su politica pide identificarse
# con algo por donde contactar. Va el dominio, no un correo de nadie.
AGENTE = {"User-Agent": "KSAGlobalEvolution/1.0 (https://ksaglobal-evolution.com)"}


def _cubre(img: Image.Image, ancho: int, alto: int) -> Image.Image:
    """Recorta y escala la foto para llenar el lienzo sin deformarla."""
    escala = max(ancho / img.width, alto / img.height)
    nueva = img.resize(
        (max(round(img.width * escala), ancho), max(round(img.height * escala), alto)),
        Image.LANCZOS,
    )
    izq = (nueva.width - ancho) // 2
    arr = (nueva.height - alto) // 3      # un poco por encima del centro: el cielo manda
    return nueva.crop((izq, arr, izq + ancho, arr + alto))


def _fondo_pais(iso2: str, nombre: str) -> Image.Image | None:
    """Foto de fondo del pais, ya recortada al tamano del lienzo.

    Primero un fichero propio en assets/fondos/<iso2>.jpg —asi se puede poner
    la que uno quiera—; si no lo hay, la foto de portada que Wikipedia tiene
    para el monumento de FOTOS.

    Se guarda recortada, no original: las de Wikipedia llegan a 8000x6000 y
    tener varias enteras en memoria son cientos de megas para nada.
    """
    if not iso2:
        return None
    if iso2 in _fondos:
        return _fondos[iso2]

    propia = os.path.join(ASSETS, "fondos", f"{iso2.lower()}.jpg")
    cacheada = os.path.join(CACHE_FONDOS, f"{iso2.lower()}.jpg")
    if os.path.exists(cacheada):
        try:
            img = Image.open(cacheada).convert("RGB")
            _fondos[iso2] = img
            return img
        except Exception:
            pass

    try:
        if os.path.exists(propia):
            img = Image.open(propia).convert("RGB")
        else:
            articulo = FOTOS.get(iso2.upper(), nombre)
            url = "https://es.wikipedia.org/api/rest_v1/page/summary/" + articulo.replace(" ", "_")
            datos = httpx.get(url, timeout=15, headers=AGENTE, follow_redirects=True).json()
            fuente = (datos.get("originalimage") or datos.get("thumbnail") or {}).get("source")
            if not fuente:
                return None
            crudo = httpx.get(fuente, timeout=30, headers=AGENTE, follow_redirects=True).content
            img = Image.open(io.BytesIO(crudo)).convert("RGB")
        img = _cubre(img, ANCHO, ALTO)
        # Muchas fotos de Wikipedia son de atardecer o van subexpuestas, y bajo
        # el velo azul quedan en un gris sucio. Se suben un punto para que se
        # note que hay una ciudad detras.
        img = ImageEnhance.Brightness(img).enhance(1.18)
        img = ImageEnhance.Color(img).enhance(1.15)
        img = ImageEnhance.Contrast(img).enhance(1.06)
    except Exception:
        return None

    try:
        os.makedirs(CACHE_FONDOS, exist_ok=True)
        img.save(cacheada, "JPEG", quality=88)
    except Exception:
        pass  # sin cache se vuelve a pedir, no es grave
    _fondos[iso2] = img
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


def formatea_monto(valor) -> str:
    """Importe como se escribe aqui: 923.220 / 4.973,70 / 0,85.

    Sin decimales a partir de mil —a nadie le importan los centimos de un
    importe de seis cifras y ocupan sitio— y con dos por debajo.
    """
    if valor is None:
        return "—"
    if valor >= 1000:
        return f"{valor:,.0f}".replace(",", ".")
    return f"{valor:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def _a_tamano_final(img: Image.Image) -> bytes:
    """Deja la imagen exactamente en 560x827 y la devuelve como PNG."""
    if img.size != (ANCHO_FINAL, ALTO_FINAL):
        img = img.convert("RGB").resize((ANCHO_FINAL, ALTO_FINAL), Image.LANCZOS)
    salida = io.BytesIO()
    img.save(salida, "PNG", optimize=True)
    return salida.getvalue()


def _lienzo_de_fondo(origen: dict) -> Image.Image:
    """Foto del pais a toda pagina, con el velo azul que deja leer encima.

    El velo es casi transparente arriba —ahi se ve la ciudad— y se cierra
    hacia abajo, que es donde van las pastillas: sin eso, una foto clara deja
    el texto blanco del titulo ilegible y una oscura apaga las banderas.
    """
    fondo = _fondo_pais(origen.get("iso2", ""), origen.get("name", ""))
    if fondo is None:
        # Sin foto, degradado liso: la imagen sale igual, solo mas sobria.
        fondo = Image.new("RGB", (ANCHO, ALTO))
        dd = ImageDraw.Draw(fondo)
        for y in range(ALTO):
            p = y / max(ALTO - 1, 1)
            dd.line([(0, y), (ANCHO, y)],
                    fill=tuple(int(a + (b - a) * p) for a, b in zip(AZUL, AZUL_HONDO)))
        return fondo

    velo = Image.new("RGBA", (ANCHO, ALTO))
    dv = ImageDraw.Draw(velo)
    for y in range(ALTO):
        p = y / max(ALTO - 1, 1)
        # Arriba casi no tapa —ahi se ve la ciudad— y abajo cierra del todo,
        # que es donde van las pastillas y no puede competir nada con ellas.
        alfa = int(255 * (0.14 + 0.72 * (p ** 1.7)))
        color = tuple(int(a + (b - a) * p) for a, b in zip(AZUL, AZUL_HONDO))
        dv.line([(0, y), (ANCHO, y)], fill=color + (alfa,))

    # Sombra suave en la franja de arriba: el titulo va en blanco y ahi la foto
    # suele ser cielo claro, donde el blanco sobre blanco no se lee. Va en su
    # propia capa porque draw.line pisa el alfa en vez de sumarlo.
    sombra = Image.new("RGBA", (ANCHO, ALTO))
    ds = ImageDraw.Draw(sombra)
    banda = int(ALTO * 0.46)
    for y in range(banda):
        alfa = int(255 * 0.34 * (1 - y / banda) ** 1.4)
        ds.line([(0, y), (ANCHO, y)], fill=AZUL_HONDO + (alfa,))

    fondo = Image.alpha_composite(fondo.convert("RGBA"), velo)
    return Image.alpha_composite(fondo, sombra).convert("RGB")


def _cabecera(img: Image.Image, d: ImageDraw.ImageDraw, origen: dict) -> int:
    """Logo, DESDE <PAIS>, la pastilla de 'TASAS DE CAMBIO' y la fecha.

    Devuelve la y donde puede empezar la lista.
    """
    centro = ANCHO // 2
    y = MARGEN

    # Logo: el globo a la izquierda y la marca a su derecha, todo centrado.
    marca = _fuente("extra", int(26 * ESCALA))
    bajo_marca = _fuente("semi", int(7 * ESCALA))
    esp_bajo = int(2.6 * ESCALA)
    try:
        globo = Image.open(LOGO).convert("RGBA")
        lado = int(34 * ESCALA)
        globo = globo.resize((lado, int(globo.height * lado / globo.width)), Image.LANCZOS)
    except Exception:
        globo, lado = None, 0

    ancho_texto = max(marca.getlength("KSA"), _ancho("GLOBAL EVOLUTION", bajo_marca, esp_bajo))
    hueco = int(8 * ESCALA) if globo else 0
    total = lado + hueco + ancho_texto
    x = centro - total / 2
    if globo:
        img.paste(globo, (int(x), y), globo)
        x += lado + hueco
    _escribe(d, (x, y + int(4 * ESCALA)), "KSA", marca, TEXTO_TITULO, anchor="la", sombra=True)
    _escribe(d, (x + int(1 * ESCALA), y + int(32 * ESCALA)), "GLOBAL EVOLUTION",
             bajo_marca, TEXTO_SUAVE, esp_bajo, anchor="la", sombra=True)
    y += int(52 * ESCALA)

    # DESDE / PAIS
    f_desde = _fuente("semi", int(20 * ESCALA))
    _escribe(d, (centro, y), "DESDE", f_desde, TEXTO_TITULO, int(9 * ESCALA), anchor="ma", sombra=True)
    y += int(28 * ESCALA)

    nombre = origen["name"].upper()
    f_pais = _encaja("black", nombre, int(54 * ESCALA), ANCHO - MARGEN * 2)
    _escribe(d, (centro, y), nombre, f_pais, TEXTO_TITULO, anchor="ma", sombra=True)
    y += int(f_pais.size * 1.02)

    # Pastilla azul con la bandera del origen y 'TASAS DE CAMBIO'.
    alto_p = int(30 * ESCALA)
    f_tc = _fuente("bold", int(13 * ESCALA))
    esp_tc = int(2 * ESCALA)
    lado_b = int(alto_p * 0.86)
    ancho_p = int(lado_b + 10 * ESCALA + _ancho("TASAS DE CAMBIO", f_tc, esp_tc) + 22 * ESCALA)
    x0 = centro - ancho_p // 2
    d.rounded_rectangle([(x0, y), (x0 + ancho_p, y + alto_p)], radius=alto_p // 2, fill=AZUL)
    bandera = _bandera(origen.get("iso2", ""), lado_b)
    if bandera:
        img.paste(bandera, (x0 + (alto_p - lado_b) // 2, y + (alto_p - lado_b) // 2), bandera)
    _escribe(d, (x0 + lado_b + int(12 * ESCALA), y + alto_p // 2), "TASAS DE CAMBIO",
             f_tc, TEXTO_TITULO, esp_tc, anchor="lm")
    y += alto_p + int(9 * ESCALA)

    # Con que importe estan hechas las cuentas. Sin esta linea la columna de la
    # derecha son numeros sueltos que no se pueden comprobar contra nada.
    monto = origen.get("monto")
    if monto:
        _escribe(d, (centro, y), f"POR CADA {formatea_monto(monto)} {origen.get('currency', '')}".strip(),
                 _fuente("bold", int(12 * ESCALA)), TEXTO_TITULO, int(1 * ESCALA),
                 anchor="ma", sombra=True)
        y += int(18 * ESCALA)

    _escribe(d, (centro, y), "ACTUALIZADAS HOY", _fuente("semi", int(9 * ESCALA)),
             TEXTO_SUAVE, int(3 * ESCALA), anchor="ma", sombra=True)
    return y + int(19 * ESCALA)


def _pie(d: ImageDraw.ImageDraw) -> int:
    """Barra de abajo. Devuelve la y en la que empieza, para no pisarla."""
    alto_b = int(26 * ESCALA)
    y = ALTO - MARGEN - alto_b
    d.rounded_rectangle([(MARGEN, y), (ANCHO - MARGEN, y + alto_b)],
                        radius=alto_b // 2, fill=AZUL)
    _escribe(d, (ANCHO // 2, y + alto_b // 2), "SEGURIDAD  •  CONFIANZA  •  MEJORES TASAS",
             _fuente("semi", int(9 * ESCALA)), TEXTO_SUAVE, int(2 * ESCALA), anchor="mm")
    return y


def generar(origen: dict, filas: list[dict]) -> bytes:
    """PNG con una fila por destino: bandera, pais y a cuanto se cambia.

    `origen` es {name, iso2, currency}; cada fila, {name, iso2, currency, tasa}.
    """
    img = _lienzo_de_fondo(origen).convert("RGB")
    d = ImageDraw.Draw(img)

    arriba = _cabecera(img, d, origen)
    abajo = _pie(d) - int(12 * ESCALA)

    # El alto es fijo, asi que las filas se reparten lo que queda entre la
    # cabecera y el pie. Con muchos destinos salen mas juntas, pero entran
    # todas: preferible a cortar la lista o a que la imagen cambie de tamano.
    n = max(len(filas), 1)
    alto_fila = max(int((abajo - arriba) / n) - ESPACIO, 16 * ESCALA)
    # Con pocos destinos no tiene sentido estirarlas hasta parecer botones;
    # entonces sobra sitio y la lista se centra, que si no queda coja.
    alto_fila = min(alto_fila, int(42 * ESCALA))
    sobra = (abajo - arriba) - (alto_fila + ESPACIO) * n + ESPACIO

    y = arriba + max(sobra, 0) // 2
    for fila in filas:
        d.rounded_rectangle([(MARGEN, y), (ANCHO - MARGEN, y + alto_fila)],
                            radius=alto_fila // 2, fill=PILDORA)

        lado = int(alto_fila * 0.80)
        bandera = _bandera(fila.get("iso2", ""), lado)
        if bandera:
            img.paste(bandera, (MARGEN + (alto_fila - lado) // 2, y + (alto_fila - lado) // 2), bandera)

        # La tasa manda: se dibuja primero y el nombre usa lo que sobre.
        f_tasa = _fuente("extra", max(int(alto_fila * 0.42), 10 * ESCALA))
        texto_tasa = formatea_monto(fila.get("recibe"))
        borde_tasa = ANCHO - MARGEN - int(alto_fila * 0.45)
        d.text((borde_tasa, y + alto_fila // 2), texto_tasa,
               font=f_tasa, fill=TEXTO_PAIS, anchor="rm")

        x_nombre = MARGEN + lado + int(alto_fila * 0.40)
        hueco = borde_tasa - _ancho(texto_tasa, f_tasa) - int(10 * ESCALA) - x_nombre
        f_nombre = _encaja("bold", fila["name"].upper(), max(int(alto_fila * 0.33), 9 * ESCALA), hueco)
        d.text((x_nombre, y + alto_fila // 2), fila["name"].upper(),
               font=f_nombre, fill=TEXTO_PAIS, anchor="lm")

        y += alto_fila + ESPACIO

    return _a_tamano_final(img)


def _rellena(texto: str, **valores) -> str:
    """Sustituye {pais}, {moneda}, {fecha}... sin usar str.format.

    La instruccion la escribe el super admin a mano y puede llevar llaves
    sueltas; con format eso revienta, con un replace simple no.
    """
    for clave, valor in valores.items():
        texto = texto.replace("{" + clave + "}", str(valor))
    return texto


def _hoy() -> str:
    meses = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre")
    d = datetime.now()
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


# Lo que se le pide a la IA cuando nadie ha escrito una instruccion propia.
# Es editable desde Ajustes -> IA; esto es solo el punto de partida.
INSTRUCCION_POR_DEFECTO = (
    "Cartel vertical de tasas de cambio.\n\n"
    "FONDO: una foto real y reconocible de {pais} ocupando TODO el fondo, de "
    "borde a borde —un paisaje, la ciudad o un monumento del país—, con un velo "
    "azul marino por encima: suave arriba, donde se ve la foto, y cerrado abajo.\n\n"
    "CABECERA, centrada y en blanco, de arriba abajo:\n"
    "  · el logo: un globo terráqueo azul con una flecha gris, y al lado «KSA» "
    "en mayúsculas muy gruesas con «GLOBAL EVOLUTION» debajo en letra pequeña "
    "y espaciada\n"
    "  · «DESDE» en letras separadas\n"
    "  · «{PAIS}» enorme, en negrita muy gruesa\n"
    "  · una pastilla azul oscuro con la bandera circular de {pais} y el texto "
    "«TASAS DE CAMBIO»\n"
    "  · «POR CADA {monto} {moneda}» en negrita\n"
    "  · «ACTUALIZADAS HOY» en letra pequeña y espaciada\n\n"
    "LISTA, debajo: una fila por país, cada una en una píldora blanca de "
    "esquinas totalmente redondeadas. En cada fila, a la IZQUIERDA la bandera "
    "circular del país y su nombre en mayúsculas en azul oscuro; a la DERECHA, "
    "pegado al borde, el importe que recibe, en negrita gruesa y azul oscuro.\n\n"
    "PIE: una barra azul oscuro redondeada con «SEGURIDAD • CONFIANZA • "
    "MEJORES TASAS».\n\n"
    "Diseño limpio, moderno, mucho contraste. Sin marcas de agua y sin ningún "
    "texto que no esté aquí."
)


def generar_con_ia(
    origen: dict,
    filas: list[dict],
    api_key: str,
    instruccion: str | None = None,
) -> bytes:
    """La misma tabla, pero dibujada por OpenAI.

    `instruccion` es el texto que el super admin escribe en Ajustes -> IA; se
    le pega debajo la lista de paises y cifras, que no es negociable.

    Aviso que conviene tener presente: el modelo redibuja los numeros a mano
    alzada y suele equivocarse en alguno. Sirve para ver el estilo, no para
    mandarle la tasa a un cliente sin mirarla.
    """
    lineas = "\n".join(
        f"{f['name']}: {formatea_monto(f.get('recibe'))} {f.get('currency', '')}".strip()
        for f in filas
    )
    texto = (instruccion or "").strip() or INSTRUCCION_POR_DEFECTO
    texto = _rellena(
        texto,
        pais=origen["name"],
        PAIS=origen["name"].upper(),
        moneda=origen.get("currency", ""),
        monto=formatea_monto(origen.get("monto")),
        fecha=_hoy(),
    )
    prompt = (
        f"{texto}\n\n"
        "Las filas, en este orden exacto y con estas cifras exactas, sin "
        f"cambiar ni un dígito y sin saltarte ninguna:\n{lineas}"
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
