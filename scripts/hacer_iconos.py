# -*- coding: utf-8 -*-
"""Genera los iconos de la app desde el logo: python scripts/hacer_iconos.py

El logo trae una sombra suelta debajo (una elipse gris separada del dibujo).
Entraba dentro del recuadro al encuadrar, asi que el globo quedaba empujado
hacia arriba, y encima esa mancha gris se veia sobre el fondo oscuro. Se
recorta.

Centrado: el dibujo es diagonal —la esfera pesa abajo a la izquierda y la
flecha es fina y se va arriba a la derecha—, asi que centrar por el recuadro
deja la masa descolgada. Se centra en el punto medio entre el centro del
recuadro y el centro de masa.

Tamano: el icono «maskable» lo recorta Android en circulo y solo se puede
contar con el 80% central. La tanda anterior se paso de prudente y el dibujo
ocupaba el 44% del cuadro: en la pantalla de inicio se veia un globo chico
perdido. Aqui se calcula el circulo real que envuelve al dibujo y se estira
hasta llenar ese 80%.
"""
import os

import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLICA = os.path.join(RAIZ, "frontend", "public")
LOGO = os.path.join(RAIZ, "frontend", "src", "assets", "logo.png")
SALIDA = os.path.join(PUBLICA, "icons")

# Fondo: degradado vertical mas un resplandor suave en el centro, los mismos
# tonos que traia el icono anterior.
ARRIBA = (10, 24, 62)
ABAJO = (4, 9, 26)
BRILLO = (56, 189, 248)      # el azul de la marca, a muy poca fuerza


def fondo(n):
    y = np.linspace(0, 1, n)[:, None]
    cap = (np.array(ARRIBA)[None, None, :] * (1 - y[:, :, None])
           + np.array(ABAJO)[None, None, :] * y[:, :, None])
    cap = np.repeat(cap, n, axis=1)
    ejes = np.linspace(-1, 1, n)
    dx, dy = np.meshgrid(ejes, ejes)
    d = np.sqrt(dx ** 2 + dy ** 2)
    g = np.clip(1 - d / 1.15, 0, 1) ** 2.2
    cap = cap + g[:, :, None] * np.array(BRILLO)[None, None, :] * 0.075
    return Image.fromarray(np.clip(cap, 0, 255).astype(np.uint8), "RGB")


def logo_limpio():
    """El logo sin la sombra de abajo, recortado a lo que se ve."""
    im = Image.open(LOGO).convert("RGBA")
    alfa = np.asarray(im)[:, :, 3]
    filas = (alfa > 10).sum(1)

    # La sombra es un trozo aparte: hay filas vacias entre el dibujo y ella.
    # Se corta en el primer hueco que venga despues de la mitad.
    corte = im.height
    vacia = False
    for y in range(im.height // 2, im.height):
        if filas[y] == 0:
            vacia = True
        elif vacia:
            corte = y - 1
            break
    im = im.crop((0, 0, im.width, corte))

    alfa = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(alfa > 10)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def encuadra(logo, lienzo, parte, circular):
    """Pega el logo sobre el fondo, centrado a ojo y al tamano pedido.

    `parte` es cuanto del lado ocupa el dibujo. Con `circular` el limite es el
    circulo que lo envuelve —la zona segura de los iconos «maskable»— y no el
    recuadro.
    """
    alfa = np.asarray(logo)[:, :, 3].astype(float)
    al, an = alfa.shape

    ys, xs = np.nonzero(alfa > 10)
    peso = alfa[alfa > 10]
    cx = ((xs * peso).sum() / peso.sum() + (an - 1) / 2) / 2
    cy = ((ys * peso).sum() / peso.sum() + (al - 1) / 2) / 2

    if circular:
        r = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max()
    else:
        r = max(max(cx, an - 1 - cx), max(cy, al - 1 - cy))
    escala = (parte * lienzo / 2) / r

    chico = logo.resize((max(1, round(an * escala)), max(1, round(al * escala))), Image.LANCZOS)
    lienzo_im = fondo(lienzo)
    lienzo_im.paste(chico, (round(lienzo / 2 - cx * escala), round(lienzo / 2 - cy * escala)), chico)
    return lienzo_im


def guarda(im, ruta):
    im.save(ruta, "PNG", optimize=True)
    print(os.path.basename(ruta), im.size, os.path.getsize(ruta) // 1024, "KB")


if __name__ == "__main__":
    logo = logo_limpio()
    print("logo sin sombra:", logo.size)

    # «any»: se ve entero, sin recortes.
    for n in (192, 512):
        guarda(encuadra(logo, n, 0.80, circular=False), os.path.join(SALIDA, "app3-%d.png" % n))

    # «maskable»: Android recorta en circulo; la zona segura es el 80% central.
    for n in (192, 512):
        guarda(encuadra(logo, n, 0.78, circular=True), os.path.join(SALIDA, "app3-maskable-%d.png" % n))

    # iPhone: pone el icono tal cual y le redondea las esquinas. Vive en la
    # raiz de public, no en icons/, porque asi lo pide index.html.
    guarda(encuadra(logo, 180, 0.80, circular=False), os.path.join(PUBLICA, "apple-touch-icon.png"))
