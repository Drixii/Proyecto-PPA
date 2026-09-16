import asyncio
import httpx
from sqlalchemy.orm import Session
from models.exchange_rate import ExchangeRate
from datetime import datetime, timezone

FRANKFURTER_URL = "https://api.frankfurter.app/latest"
EXCHANGERATE_URL = "https://open.er-api.com/v6/latest/USD"

# Monedas que requieren fuente especial (pero YA NO bloqueamos su auto-update)
# VES se fetchea via Binance P2P + fallbacks
MANUAL_CURRENCIES = {"CUP"}   # solo CUP queda manual

SUPPORTED_CURRENCIES = {
    "CLP", "COP", "USD", "EUR", "PEN", "BRL", "MXN", "ARS",
    "BOB", "PYG", "UYU", "CRC", "DOP", "GTQ", "CAD", "GBP",
    "CNY", "JPY", "VES"
}


# ── Mercados paralelos ─────────────────────────────────────────
#
# Hay monedas donde la tasa oficial no es a la que se cambia dinero de verdad.
# En Venezuela la diferencia ronda el 16% y en Argentina el 6%: cotizar al
# oficial ahí no es un redondeo, es regalar o cobrar de más en cada envío.
#
# La referencia que se usa es el precio del USDT en Binance P2P, que es donde
# ocurre el volumen real, con dos respaldos por moneda para no depender de un
# solo sitio.
#
# Ojo con el sentido: cotizar al paralelo solo es correcto si la casa TAMBIÉN
# liquida a esa tasa. Si el dinero se compra al oficial y se promete al
# paralelo, la diferencia la paga la casa en cada orden. Por eso cada moneda
# se activa a mano desde Ajustes y ninguna se enciende sola.


# Volumen minimo para que una oferta cuente. Por debajo, el anuncio se agota
# antes de poder usarlo y su precio no es el precio del mercado.
VOLUMEN_MINIMO_USDT = 500


async def _binance_p2p(fiat: str, lado: str = "SELL") -> float | None:
    """Promedio de las 5 mejores ofertas con volumen real.

    `lado` es el de la casa, no el del cliente: SELL es vender USDT para
    entregar moneda local —lo que se hace en cada envio— y BUY es comprarlo.
    Se cotiza con SELL: para entregarle bolivares al destinatario hay que
    VENDER el USDT, asi que ese es el precio al que se convierte de verdad.
    Cotizando con BUY se prometia algo mas de moneda local por dolar de la que
    se iba a recibir al cambiarlo. La diferencia entre ambos lados es pequena
    (0,05% en VES el 2026-09-15), pero va siempre en contra de la casa. BUY se
    pide solo para ensenar los dos precios en Ajustes, como en la app.

    Endpoint no oficial pero es donde está el volumen. Se promedian cinco y no
    se toma la primera porque la mejor oferta suele ser de monto mínimo y no
    representa el precio al que se puede cambiar de verdad — por la misma razón
    se descartan las que no llegan a VOLUMEN_MINIMO_USDT.
    """
    url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"

    def cuerpo(solo_comercios: bool) -> dict:
        return {
            "asset": "USDT",
            "fiat": fiat,
            "tradeType": lado,
            "page": 1,
            "rows": 10,
            "payTypes": [],
            "merchantCheck": False,
            # Comercios verificados, que es lo que la app muestra por defecto.
            # Sin este filtro salen anuncios de particulares que no aceptan una
            # operacion de tamano normal: en COP daban 3.091 frente a los 3.080
            # que se ven en el telefono, y esa diferencia se prometia al cliente.
            "publisherType": "merchant" if solo_comercios else None,
        }

    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post(url, json=cuerpo(True), headers=headers)
            datos = (r.json().get("data") or []) if r.status_code == 200 else []
            # Mercados finos donde no hay comercios: antes que quedarse sin
            # tasa, se miran todos los anuncios.
            if len(datos) < 3:
                r = await client.post(url, json=cuerpo(False), headers=headers)
                datos = (r.json().get("data") or []) if r.status_code == 200 else []
        if not datos:
            return None

        # Se descartan los anuncios sin volumen. Los primeros de la lista suelen
        # ser de 25 o 50 USDT: dan el mejor precio y se agotan en el primer
        # segundo, asi que promediarlos daba una tasa que no se consigue. En COP
        # eso eran ~3.089 frente a ~3.085 reales, siempre a favor del cliente y
        # en contra de la casa.
        grandes, todos = [], []
        for ad in datos:
            try:
                precio = float(ad["adv"]["price"])
                disponible = float(ad["adv"].get("tradableQuantity") or 0)
            except (KeyError, ValueError, TypeError):
                continue
            todos.append(precio)
            if disponible >= VOLUMEN_MINIMO_USDT:
                grandes.append(precio)

        # Si ningun anuncio llega al minimo —mercado fino, moneda con poco
        # movimiento— se usan todos antes que quedarse sin tasa.
        precios = (grandes or todos)[:5]
        return sum(precios) / len(precios) if precios else None
    except Exception:
        return None


async def _yadio(moneda: str) -> float | None:
    """Yadio.io, también basado en P2P.

    OJO: devuelve la tasa INVERTIDA respecto a lo que sugiere la URL. Con
    /rate/USD/VES responde {"rate": 0.001150677948}, que son dólares por
    bolívar; aquí hacen falta bolívares por dólar. Comprobado contra DolarAPI
    el 2026-08-12: 1/0.00115068 = 869.06 frente a 869.01. Antes se guardaba tal
    cual, así que si Binance fallaba la app cotizaba 1 USD = 0.00115 VES y un
    envío mostraba céntimos de bolívar.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"https://api.yadio.io/rate/USD/{moneda}")
        if r.status_code == 200:
            rate = r.json().get("rate")
            if rate and float(rate) > 0:
                return 1.0 / float(rate)
    except Exception:
        pass
    return None


async def _dolarapi(url: str, campo: str) -> float | None:
    """DolarAPI. `campo` es 'promedio' (Venezuela) o 'venta' (Argentina)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
        if r.status_code == 200:
            valor = r.json().get(campo)
            if valor:
                return float(valor)
    except Exception:
        pass
    return None


# Config por moneda: de dónde sacarla, en qué orden, y entre qué valores es
# creíble. El rango no está para acertar, está para que un número absurdo no
# llegue nunca a una cotización: una fuente devolvió la tasa invertida (0.00115
# en vez de 869) y se guardó como buena.
PARALELO = {
    "VES": {
        "minimo": 1.0,
        "maximo": 10_000_000.0,
        # Encendido desde siempre: en Venezuela nadie cambia al oficial, así
        # que aquí el paralelo no es una opción sino la única tasa real.
        "por_defecto": True,
        "fuentes": [
            ("binance_p2p", lambda: _binance_p2p("VES")),
            ("yadio", lambda: _yadio("VES")),
            ("dolarapi", lambda: _dolarapi("https://ve.dolarapi.com/v1/dolares/paralelo", "promedio")),
        ],
    },
    "ARS": {
        "minimo": 100.0,
        "maximo": 1_000_000.0,
        # Apagado hasta que alguien confirme a qué tasa se liquidan los pesos.
        "por_defecto": False,
        "fuentes": [
            ("binance_p2p", lambda: _binance_p2p("ARS")),
            # "cripto" y no "blue": es el precio del USDT, el mismo mercado que
            # mide Binance. El blue va unos 30 pesos por debajo y mezclarlos
            # daría un salto al cambiar de fuente.
            ("dolarapi_cripto", lambda: _dolarapi("https://dolarapi.com/v1/dolares/cripto", "venta")),
            ("yadio", lambda: _yadio("ARS")),
        ],
    },
}

MONEDAS_PARALELO = tuple(PARALELO.keys())


def config_paralelo(moneda: str) -> dict:
    """Como cotizar el paralelo de una moneda cualquiera.

    Las declaradas arriba traen varias fuentes que se contrastan entre si y un
    rango de valores creibles. El resto se apoya solo en Binance P2P, que es el
    precio del USDT en ese pais y responde para casi todas: sin segunda fuente
    no hay con que comparar, asi que la cordura del numero se comprueba contra
    la tasa oficial al guardarlo, en _guardar_paralelo.
    """
    moneda = (moneda or "").upper()
    if moneda in PARALELO:
        return PARALELO[moneda]
    return {
        "minimo": 0.0,
        "maximo": float("inf"),
        "por_defecto": False,
        "unica_fuente": True,
        "fuentes": [("binance_p2p", lambda m=moneda: _binance_p2p(m))],
    }

# Clave del interruptor en la tabla de ajustes, una por moneda.
def clave_paralelo(moneda: str) -> str:
    return f"tasa_paralela_{moneda.upper()}"


def usa_paralelo(db: Session, moneda: str) -> bool:
    """Si esa moneda debe cotizarse al mercado paralelo."""
    from models.setting import Setting
    cfg = config_paralelo(moneda)
    try:
        row = db.query(Setting).filter(Setting.key == clave_paralelo(moneda)).first()
    except Exception:
        return cfg["por_defecto"]
    if not row or row.value in (None, ""):
        return cfg["por_defecto"]
    return str(row.value).strip().lower() == "true"


def _creible(moneda: str, rate: float | None) -> bool:
    cfg = config_paralelo(moneda)
    return bool(rate) and cfg["minimo"] <= rate <= cfg["maximo"]


async def fetch_parallel_rate(moneda: str) -> tuple[float | None, str]:
    """Tasa de mercado paralelo. Devuelve (unidades por USD, fuente)."""
    moneda = moneda.upper()
    cfg = config_paralelo(moneda)

    for nombre, fetcher in cfg["fuentes"]:
        rate = await fetcher()
        if rate is None:
            continue
        if not _creible(moneda, rate):
            print(f"[exchange] {nombre} devolvió {rate} para {moneda}, fuera del rango creíble — se descarta")
            continue
        return rate, nombre

    return None, "none"


async def comparar_fuentes(moneda: str) -> dict:
    """Qué dice cada fuente ahora mismo. Solo para el panel de Ajustes.

    No decide nada: existe para poder mirar oficial y paralelo lado a lado
    antes de encender una moneda.
    """
    moneda = moneda.upper()
    cfg = PARALELO.get(moneda)
    if not cfg:
        return {"moneda": moneda, "soportada": False, "fuentes": []}

    fuentes = []
    for nombre, fetcher in cfg["fuentes"]:
        valor = await fetcher()
        fuentes.append({
            "nombre": nombre,
            "valor": valor,
            "creible": _creible(moneda, valor),
        })

    oficial = None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(EXCHANGERATE_URL)
        if r.status_code == 200:
            oficial = (r.json().get("rates") or {}).get(moneda)
    except Exception:
        pass

    usable = next((f["valor"] for f in fuentes if f["creible"]), None)
    # Los dos lados de Binance, para ensenarlos junto a las fuentes propias
    # de esta moneda. Aqui no deciden nada: la tasa sigue saliendo de sus
    # fuentes configuradas.
    venta, compra = await asyncio.gather(
        _binance_p2p(moneda, "SELL"),
        _binance_p2p(moneda, "BUY"),
    )
    return {
        "moneda": moneda,
        "soportada": True,
        "compra": compra,
        "venta": venta,
        "oficial": oficial,
        "paralelo": usable,
        "diferencia_pct": ((usable / oficial - 1) * 100) if (usable and oficial) else None,
        "fuentes": fuentes,
    }


async def comparar_moneda(moneda: str) -> dict:
    """Oficial y paralelo de CUALQUIER moneda, para mirarla desde Ajustes.

    Las monedas con configuración propia (VES, ARS) usan sus fuentes y su rango
    creíble. El resto se mira solo contra Binance P2P —el precio del USDT en
    ese país—, que responde para casi todas: sirve para ver cuánto se separa el
    mercado real del oficial antes de plantearse cotizar a esa tasa.

    Solo lectura. Que una moneda salga aquí no la enciende: para cotizar al
    paralelo hace falta darla de alta en PARALELO, con fuentes y rango.
    """
    moneda = moneda.upper()
    if moneda in PARALELO:
        datos = await comparar_fuentes(moneda)
        datos["configurable"] = True
        return datos

    # Los dos lados a la vez: uno detras de otro son dos viajes a Binance
    # cada vez que se abre el desplegable de Ajustes.
    venta, compra = await asyncio.gather(
        _binance_p2p(moneda, "SELL"),
        _binance_p2p(moneda, "BUY"),
    )
    valor = venta
    oficial = None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(EXCHANGERATE_URL)
        if r.status_code == 200:
            oficial = (r.json().get("rates") or {}).get(moneda)
    except Exception:
        pass

    # Sin rango configurado, lo único que se puede exigir es que sea positivo
    # y que no esté a más de 10 veces del oficial: una respuesta invertida o en
    # otra unidad se descarta en vez de enseñarse como buena.
    creible = bool(valor) and valor > 0 and (not oficial or 0.1 <= valor / oficial <= 10)
    return {
        "moneda": moneda,
        "soportada": True,
        "configurable": False,
        "oficial": oficial,
        "paralelo": valor if creible else None,
        # Los dos precios de Binance, que es lo que se ensena en Ajustes.
        # La casa cobra al de venta: es el lado que hace de verdad.
        "compra": compra,
        "venta": venta,
        "diferencia_pct": ((valor / oficial - 1) * 100) if (creible and oficial) else None,
        "fuentes": [{"nombre": "binance_p2p", "valor": valor, "creible": creible}],
    }


# Se mantiene el nombre viejo: lo usan los scripts de diagnóstico.
async def fetch_ves_rate() -> tuple[float | None, str]:
    return await fetch_parallel_rate("VES")


# ── Main fetch ───────────────────────────────────────────────────

async def fetch_and_store_rates(db: Session):
    """Tasas oficiales de open.er-api (base USD) + mercados paralelos."""
    rates_usd = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(EXCHANGERATE_URL)
            if resp.status_code == 200:
                data = resp.json()
                rates_usd = data.get("rates", {})
                rates_usd["USD"] = 1.0
    except Exception:
        pass

    if not rates_usd:
        return False

    # Qué monedas se cotizan al paralelo en esta pasada. Las demás siguen el
    # camino normal, incluidas las que tienen mercado paralelo pero están
    # apagadas: mientras el interruptor esté en off, ARS es una moneda normal.
    al_paralelo = {m for m in SUPPORTED_CURRENCIES if m != "USD" and usa_paralelo(db, m)}

    for currency, rate_vs_usd in rates_usd.items():
        if currency not in SUPPORTED_CURRENCIES:
            continue
        if currency in MANUAL_CURRENCIES or currency in al_paralelo:
            continue
        _upsert_rate(db, "USD", currency, rate_vs_usd, auto=True)

    # Cruces entre monedas que no van al paralelo.
    def normal(c):
        return c not in MANUAL_CURRENCIES and c not in al_paralelo and c in rates_usd

    for base in SUPPORTED_CURRENCIES:
        if not normal(base):
            continue
        for target in SUPPORTED_CURRENCIES:
            if target == base or not normal(target):
                continue
            _upsert_rate(db, base, target, rates_usd[target] / rates_usd[base], auto=True)

    db.commit()

    # Se piden UNA vez por moneda y se reutilizan para todos los cruces. Antes
    # cada par de monedas paralelas volvia a consultar la fuente: con todas las
    # monedas en paralelo eran cientos de llamadas por pasada, y el arranque
    # tardaba mas de un minuto — el despliegue se daba por fallido y revertia.
    monedas = sorted(al_paralelo)
    # A la vez y no una tras otra: cada consulta tarda un segundo o dos, y en
    # serie el arranque del servicio se iba a mas de un minuto.
    resultados = await asyncio.gather(
        *(fetch_parallel_rate(m) for m in monedas), return_exceptions=True
    )
    paralelas = {}
    for moneda, res in zip(monedas, resultados):
        if isinstance(res, Exception):
            print(f"[exchange] {moneda}: fallo al consultar el paralelo — {res}")
            continue
        rate, fuente = res
        if rate and rate > 0:
            paralelas[moneda] = (rate, fuente)

    for moneda in sorted(al_paralelo):
        await _guardar_paralelo(db, moneda, rates_usd, al_paralelo, paralelas)

    return True


async def _guardar_paralelo(db: Session, moneda: str, rates_usd: dict, al_paralelo: set,
                            paralelas: dict | None = None):
    """Guarda una moneda de mercado paralelo y sus cruces.

    `paralelas` trae {moneda: (tasa, fuente)} ya consultado en esta pasada, para
    no volver a salir a la red en cada cruce.
    """
    paralelas = paralelas or {}
    registro = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == "USD",
        ExchangeRate.to_currency == moneda,
    ).first()

    # Un valor puesto a mano por el admin manda sobre cualquier fuente.
    if registro and str(registro.is_manual).lower() == "true":
        rate, fuente = registro.rate, "manual_override"
    elif moneda in paralelas:
        rate, fuente = paralelas[moneda]
    else:
        rate, fuente = await fetch_parallel_rate(moneda)

    if not rate or rate <= 0:
        print(f"[exchange] no se pudo actualizar {moneda} — se mantiene la tasa anterior")
        return

    # Monedas con una sola fuente: no hay con que contrastarla, asi que se
    # compara contra la oficial. Una respuesta invertida o en otra unidad sale
    # ordenes de magnitud fuera, y guardarla convertiria cada envio a ese pais
    # en un regalo o en un imposible. Ante la duda se deja la tasa anterior.
    cfg = config_paralelo(moneda)
    oficial = rates_usd.get(moneda)
    if cfg.get("unica_fuente") and oficial and fuente != "manual_override":
        proporcion = rate / oficial
        if not 0.1 <= proporcion <= 10:
            print(f"[exchange] {moneda}: el paralelo ({rate:,.4f}) esta {proporcion:.1f}x "
                  f"respecto al oficial ({oficial:,.4f}) — se descarta y se mantiene la anterior")
            return

    _upsert_rate(db, "USD", moneda, rate, auto=(fuente != "manual_override"))
    _upsert_rate(db, moneda, "USD", 1.0 / rate, auto=True)

    for cur in SUPPORTED_CURRENCIES:
        if cur in (moneda, "USD") or cur in MANUAL_CURRENCIES or cur not in rates_usd:
            continue
        if cur in al_paralelo:
            # Cruce entre dos monedas paralelas (VES↔ARS): se pasa por el
            # dólar de cada una, no por el oficial de ninguna.
            otra = paralelas.get(cur, (None, None))[0]
            if not otra:
                otra, _ = await fetch_parallel_rate(cur)
            if not otra or otra <= 0:
                continue
            _upsert_rate(db, cur, moneda, rate / otra, auto=True)
            _upsert_rate(db, moneda, cur, otra / rate, auto=True)
            continue
        usd_a_cur = rates_usd[cur]
        _upsert_rate(db, cur, moneda, rate / usd_a_cur, auto=True)
        _upsert_rate(db, moneda, cur, usd_a_cur / rate, auto=True)

    db.commit()
    print(f"[exchange] {moneda}: 1 USD = {rate:,.2f} (fuente: {fuente})")


def _upsert_rate(db: Session, from_cur: str, to_cur: str, rate: float, auto: bool = True):
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    if existing:
        # No sobreescribir si admin lo puso manual y la actualización es automática
        if auto and str(existing.is_manual).lower() == "true":
            return
        ahora = datetime.now(timezone.utc)
        # La referencia con la que se compara se renueva una vez al dia: guarda
        # la tasa que habia justo antes de pisarla.
        if existing.ref_at is None or (ahora - existing.ref_at).total_seconds() >= 86400:
            existing.ref_rate = existing.rate
            existing.ref_at = ahora
        existing.rate = rate
        existing.updated_at = ahora
    else:
        db.add(ExchangeRate(
            from_currency=from_cur,
            to_currency=to_cur,
            rate=rate,
            is_manual="false" if auto else "true"
        ))
        # El flush es imprescindible, no una optimización. La sesión se crea
        # con autoflush=False (database.py), así que sin él la consulta de
        # arriba no ve las filas recién añadidas en este mismo ciclo: los
        # pares USD→X se escriben dos veces (una en el bucle principal y otra
        # al derivar los cruces) y acababan duplicados en la tabla. Con 17
        # pares duplicados, get_rate() leía con .first() y Postgres podía
        # devolver la copia congelada, cotizando con una tasa vieja.
        db.flush()


def get_rate(db: Session, from_cur: str, to_cur: str) -> float | None:
    if from_cur == to_cur:
        return 1.0
    record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    return record.rate if record else None


def set_manual_rate(db: Session, from_cur: str, to_cur: str, rate: float):
    _upsert_rate(db, from_cur, to_cur, rate, auto=False)
    record = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur
    ).first()
    if record:
        record.is_manual = "true"
    db.commit()
