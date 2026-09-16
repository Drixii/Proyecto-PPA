"""Comprobante del envio, en imagen, para que el cliente lo comparta.

Se dibuja aqui y no en el navegador por dos razones: sale igual en todos los
telefonos, y lo que se comparte es un PNG de verdad —no una captura— que
WhatsApp, Instagram o quien sea trata como imagen.

Lo que NO lleva, a proposito: el numero de cuenta completo del destinatario y
su telefono. Esto se manda por WhatsApp y acaba reenviado; el numero va
enmascarado y el telefono no aparece. El comprobante existe para demostrar que
el envio se hizo, no para repartir los datos bancarios de nadie.
"""
import io
from datetime import datetime

from PIL import Image, ImageDraw

from services.imagen_tasas import (
    AZUL, AZUL_HONDO, PILDORA, TEXTO_SUAVE, TEXTO_TITULO,
    LOGO, _escribe, _fuente, _bandera,
)

# El alto se ajusta al contenido al final: con uno fijo quedaba medio cartel
# vacio debajo de la ultima fila.
ANCHO_FINAL = 620
ALTO_MAXIMO = 1100
ESCALA = 2
ANCHO, ALTO = ANCHO_FINAL * ESCALA, ALTO_MAXIMO * ESCALA
MARGEN = 34 * ESCALA

VERDE = (74, 222, 128)
TEXTO_DATO = (234, 242, 255)

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre")


def _fecha(d) -> str:
    if not d:
        d = datetime.now()
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def _monto(valor, moneda: str) -> str:
    if valor is None:
        return "—"
    texto = f"{float(valor):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")
    if texto.endswith(",00"):
        texto = texto[:-3]
    return f"{texto} {moneda or ''}".strip()


def _oculta_cuenta(cuenta: str | None) -> str | None:
    """Deja solo los ultimos cuatro digitos: ****4321."""
    limpio = "".join(c for c in (cuenta or "") if c.isalnum())
    if len(limpio) <= 4:
        return None
    return "••••" + limpio[-4:]


def generar(orden, cliente=None) -> bytes:
    img = Image.new("RGB", (ANCHO, ALTO), AZUL_HONDO)
    d = ImageDraw.Draw(img)

    for y in range(ALTO):
        p = y / max(ALTO - 1, 1)
        d.line([(0, y), (ANCHO, y)],
               fill=tuple(int(a + (b - a) * p) for a, b in zip(AZUL, AZUL_HONDO)))

    centro = ANCHO // 2
    y = MARGEN

    # Marca
    try:
        globo = Image.open(LOGO).convert("RGBA")
        lado = int(30 * ESCALA)
        globo = globo.resize((lado, int(globo.height * lado / globo.width)), Image.LANCZOS)
        img.paste(globo, (centro - int(62 * ESCALA), y), globo)
    except Exception:
        lado = 0
    d.text((centro - int(26 * ESCALA), y + int(3 * ESCALA)), "KSA",
           font=_fuente("extra", int(23 * ESCALA)), fill=TEXTO_TITULO, anchor="la")
    _escribe(d, (centro - int(25 * ESCALA), y + int(29 * ESCALA)), "GLOBAL EVOLUTION",
             _fuente("semi", int(6.5 * ESCALA)), TEXTO_SUAVE, int(2.4 * ESCALA), anchor="la")
    y += int(58 * ESCALA)

    # Estado
    completado = (orden.status or "") == "completado"
    _escribe(d, (centro, y), "COMPROBANTE DE ENVÍO", _fuente("semi", int(11 * ESCALA)),
             TEXTO_SUAVE, int(4 * ESCALA), anchor="ma")
    y += int(26 * ESCALA)

    titulo = "Envío completado" if completado else "Envío en curso"
    d.text((centro, y), titulo, font=_fuente("black", int(30 * ESCALA)),
           fill=VERDE if completado else TEXTO_TITULO, anchor="ma")
    y += int(42 * ESCALA)

    d.text((centro, y), orden.order_number or "", font=_fuente("bold", int(13 * ESCALA)),
           fill=TEXTO_SUAVE, anchor="ma")
    y += int(34 * ESCALA)

    # Lo que recibe, que es el dato que a nadie se le olvida mirar.
    alto_caja = int(112 * ESCALA)
    d.rounded_rectangle([(MARGEN, y), (ANCHO - MARGEN, y + alto_caja)],
                        radius=int(20 * ESCALA), fill=PILDORA)
    _escribe(d, (centro, y + int(24 * ESCALA)), "RECIBE",
             _fuente("bold", int(10 * ESCALA)), (100, 116, 139), int(3 * ESCALA), anchor="ma")
    d.text((centro, y + int(62 * ESCALA)),
           _monto(orden.amount_received, orden.currency_to),
           font=_fuente("black", int(30 * ESCALA)), fill=AZUL, anchor="mm")
    d.text((centro, y + int(92 * ESCALA)),
           f"enviaste {_monto(orden.amount_sent, orden.currency_from)}",
           font=_fuente("medium", int(11 * ESCALA)), fill=(100, 116, 139), anchor="mm")
    y += alto_caja + int(26 * ESCALA)

    # Detalle
    bandera = None
    filas = [
        ("Destinatario", orden.receiver_name),
        ("País", orden.receiver_country),
        ("Cuenta", _oculta_cuenta(getattr(orden, "receiver_account", None))),
        ("Fecha", _fecha(getattr(orden, "created_at", None))),
    ]
    if cliente is not None:
        filas.insert(0, ("Enviado por", getattr(cliente, "full_name", None)))

    f_etq = _fuente("semi", int(10 * ESCALA))
    f_val = _fuente("bold", int(13 * ESCALA))
    for etiqueta, valor in filas:
        if not valor:
            continue
        _escribe(d, (MARGEN, y), etiqueta.upper(), f_etq, TEXTO_SUAVE, int(2 * ESCALA), anchor="la")
        d.text((ANCHO - MARGEN, y - int(1 * ESCALA)), str(valor), font=f_val,
               fill=TEXTO_DATO, anchor="ra")
        y += int(19 * ESCALA)
        d.line([(MARGEN, y), (ANCHO - MARGEN, y)], fill=(255, 255, 255, 20), width=1)
        y += int(15 * ESCALA)

    # Pie, justo debajo de la ultima fila, y ahi se corta la imagen.
    alto_b = int(30 * ESCALA)
    yb = y + int(12 * ESCALA)
    d.rounded_rectangle([(MARGEN, yb), (ANCHO - MARGEN, yb + alto_b)],
                        radius=alto_b // 2, fill=AZUL)
    _escribe(d, (centro, yb + alto_b // 2), "ksaglobal-evolution.com",
             _fuente("semi", int(10 * ESCALA)), TEXTO_SUAVE, int(2 * ESCALA), anchor="mm")

    alto_real = min(yb + alto_b + MARGEN, ALTO)
    img = img.crop((0, 0, ANCHO, alto_real))
    img = img.resize((ANCHO_FINAL, max(int(alto_real / ESCALA), 1)), Image.LANCZOS)
    salida = io.BytesIO()
    img.save(salida, "PNG", optimize=True)
    return salida.getvalue()
