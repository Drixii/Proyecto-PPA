"""Catálogo de bancos por país.

La tabla estaba vacía, así que el banco del destinatario se escribía a mano:
cada cliente lo ponía a su manera —"bancolombia", "BANCOLOMBIA S.A.", "banco
colombia"— y quien paga tenía que interpretarlo. Con una lista fija se elige de
un desplegable, y además el texto pegado desde WhatsApp se puede reconocer
contra ella.

En Venezuela y Colombia va el código del banco, que es lo que permite deducirlo
del número de cuenta: en Venezuela los cuatro primeros dígitos, en Colombia
los tres primeros de la entidad.

Esto siembra, no manda: el super-admin puede añadir o quitar desde su panel y
no se vuelve a tocar lo que ya existe.
"""
import logging

log = logging.getLogger("ppa")

# (nombre, código). El código es None donde no aporta nada.
BANCOS = {
    "Venezuela": [
        ("Banco de Venezuela", "0102"), ("Venezolano de Crédito", "0104"),
        ("Mercantil", "0105"), ("Provincial", "0108"), ("Bancaribe", "0114"),
        ("Exterior", "0115"), ("Banco Occidental de Descuento", "0116"),
        ("Banco Caroní", "0128"), ("Banesco", "0134"), ("Sofitasa", "0137"),
        ("Banco Plaza", "0138"), ("BFC Banco Fondo Común", "0151"),
        ("100% Banco", "0156"), ("DelSur", "0157"), ("Banco del Tesoro", "0163"),
        ("Banco Agrícola de Venezuela", "0166"), ("Bancrecer", "0168"),
        ("Mi Banco", "0169"), ("Banco Activo", "0171"), ("Bancamiga", "0172"),
        ("Banplus", "0174"), ("Banco Bicentenario", "0175"), ("Banfanb", "0177"),
        ("BNC Nacional de Crédito", "0191"), ("Pago móvil", None),
    ],
    "Colombia": [
        ("Bancolombia", "007"), ("Banco de Bogotá", "001"), ("Davivienda", "051"),
        ("BBVA Colombia", "013"), ("Banco de Occidente", "023"),
        ("Banco Popular", "002"), ("Banco Caja Social", "032"),
        ("Banco Agrario", "040"), ("Banco AV Villas", "052"),
        ("Itaú", "006"), ("Scotiabank Colpatria", "019"), ("Banco Falabella", "062"),
        ("Banco Pichincha", "060"), ("Bancoomeva", "061"), ("Banco Serfinanza", "065"),
        ("Nequi", "1507"), ("Daviplata", "1551"), ("Lulo Bank", "1070"),
        ("Nu Colombia", "1063"), ("Movii", "1801"), ("Rappipay", "1151"),
        ("Banco W", "1053"), ("Bancamía", "1059"), ("Coltefinanciera", "1370"),
    ],
    "Chile": [
        ("Banco Estado", "012"), ("Banco de Chile", "001"), ("Banco Santander", "037"),
        ("BCI", "016"), ("Scotiabank Chile", "014"), ("Itaú Chile", "039"),
        ("Banco Falabella", "051"), ("Banco Security", "049"), ("Banco Bice", "028"),
        ("Banco Consorcio", "055"), ("Banco Internacional", "009"),
        ("Banco Ripley", "053"), ("Coopeuch", "672"), ("Tenpo", None),
        ("Mercado Pago", None), ("Banco BTG Pactual", "059"),
    ],
    "Bolivia": [
        ("Banco Ganadero", None), ("Banco Nacional de Bolivia", None),
        ("Banco Mercantil Santa Cruz", None), ("Banco Unión", None),
        ("Banco BISA", None), ("Banco Económico", None), ("Banco Sol", None),
        ("Banco Fassil", None), ("Banco Fortaleza", None), ("Banco Fie", None),
        ("Banco Prodem", None),
    ],
    "Perú": [
        ("BCP Banco de Crédito", "002"), ("Interbank", "003"), ("BBVA Perú", "011"),
        ("Scotiabank Perú", "009"), ("Banco de la Nación", "018"),
        ("BanBif", "038"), ("Banco Pichincha", "023"), ("Mibanco", "049"),
        ("Yape", None), ("Plin", None),
    ],
    "Ecuador": [
        ("Banco Pichincha", None), ("Banco Guayaquil", None), ("Produbanco", None),
        ("Banco del Pacífico", None), ("Banco Bolivariano", None),
        ("Banco Internacional", None), ("Banco Machala", None), ("DeUna", None),
    ],
    "Brasil": [
        ("Banco do Brasil", "001"), ("Itaú Unibanco", "341"), ("Bradesco", "237"),
        ("Caixa Econômica Federal", "104"), ("Santander Brasil", "033"),
        ("Nubank", "260"), ("Inter", "077"), ("C6 Bank", "336"),
        ("PicPay", "380"), ("Mercado Pago", "323"), ("PIX", None),
    ],
    "México": [
        ("BBVA México", "012"), ("Banorte", "072"), ("Santander México", "014"),
        ("Banamex", "002"), ("HSBC México", "021"), ("Scotiabank México", "044"),
        ("Banco Azteca", "127"), ("Inbursa", "036"), ("Nu México", "638"),
        ("Klar", "661"), ("Mercado Pago", "722"), ("Spin by Oxxo", "728"),
    ],
    "Argentina": [
        ("Banco Nación", "011"), ("Banco Provincia", "014"), ("Banco Galicia", "007"),
        ("Santander Argentina", "072"), ("BBVA Argentina", "017"),
        ("Banco Macro", "285"), ("Brubank", "384"), ("Banco Ciudad", "029"),
        ("Mercado Pago", None), ("Ualá", None), ("Naranja X", None),
    ],
    "República Dominicana": [
        ("Banreservas", None), ("Banco Popular Dominicano", None),
        ("BHD", None), ("Scotiabank RD", None), ("Banco Santa Cruz", None),
        ("Banco Caribe", None), ("Banco Promerica", None),
    ],
    "Panamá": [
        ("Banco General", None), ("Banistmo", None), ("Banco Nacional de Panamá", None),
        ("Global Bank", None), ("Multibank", None), ("BAC Panamá", None), ("Yappy", None),
    ],
    "Costa Rica": [
        ("Banco Nacional", None), ("Banco de Costa Rica", None), ("BAC Credomatic", None),
        ("Banco Popular", None), ("Davivienda Costa Rica", None), ("Sinpe Móvil", None),
    ],
    "Paraguay": [
        ("Banco Itaú Paraguay", None), ("Banco Continental", None),
        ("Banco Familiar", None), ("Banco Atlas", None), ("Ueno Bank", None),
        ("Tigo Money", None),
    ],
    "Uruguay": [
        ("BROU", None), ("Itaú Uruguay", None), ("Santander Uruguay", None),
        ("Scotiabank Uruguay", None), ("BBVA Uruguay", None), ("Prex", None),
        ("Mi Dinero", None),
    ],
    "Estados Unidos": [
        ("Bank of America", None), ("Chase", None), ("Wells Fargo", None),
        ("Citibank", None), ("Zelle", None), ("Capital One", None),
        ("PNC Bank", None), ("US Bank", None), ("TD Bank", None),
    ],
    "España": [
        ("Santander", None), ("BBVA", None), ("CaixaBank", None), ("Sabadell", None),
        ("Bankinter", None), ("ING España", None), ("Unicaja", None), ("Revolut", None),
        ("N26", None),
    ],
    "Canadá": [
        ("RBC Royal Bank", None), ("TD Canada Trust", None), ("Scotiabank", None),
        ("BMO", None), ("CIBC", None), ("Desjardins", None), ("Tangerine", None),
    ],
}


def sembrar_si_falta(db) -> int:
    """Carga los bancos de los países que aún no tengan ninguno.

    Por país y no de golpe: así añadir un país nuevo aquí lo siembra en el
    siguiente arranque sin tocar los que el super-admin ya haya ajustado a
    mano.
    """
    from models.bank import Bank

    creados = 0
    for pais, lista in BANCOS.items():
        if db.query(Bank).filter(Bank.country == pais).first():
            continue
        for nombre, codigo in lista:
            db.add(Bank(country=pais, name=nombre, code=codigo, active=True))
            creados += 1

    if creados:
        db.commit()
        log.info("[bancos] sembrados %s bancos", creados)
    return creados
