from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.exchange_rate import ExchangeRate
from models.country import Country
from schemas.rate import RateOut, ConvertResult, ManualRateUpdate, CountryInfo
from services.exchange_service import (
    get_rate, set_manual_rate, fetch_and_store_rates,
    MONEDAS_PARALELO, SUPPORTED_CURRENCIES, usa_paralelo, clave_paralelo, comparar_fuentes,
    lado_binance,
)
from auth.dependencies import require_admin, get_current_user_optional
from config import settings
from typing import List
from pydantic import BaseModel

router = APIRouter(prefix="/api/rates", tags=["rates"])

# Solo para las banderas emoji de respuestas antiguas. La lista de países vive
# ahora en la tabla `countries` (editable en Ajustes); esto es un mapa de
# adorno que se puede borrar cuando ningún cliente use el campo `flag`.
COUNTRIES_CURRENCIES = {
    "Chile": {"currency": "CLP", "flag": "🇨🇱"},
    "Venezuela": {"currency": "VES", "flag": "🇻🇪"},
    "Colombia": {"currency": "COP", "flag": "🇨🇴"},
    "Estados Unidos": {"currency": "USD", "flag": "🇺🇸"},
    "Argentina": {"currency": "ARS", "flag": "🇦🇷"},
    "Ecuador": {"currency": "USD", "flag": "🇪🇨"},
    "Perú": {"currency": "PEN", "flag": "🇵🇪"},
    "Brasil": {"currency": "BRL", "flag": "🇧🇷"},
    "México": {"currency": "MXN", "flag": "🇲🇽"},
    "EURO": {"currency": "EUR", "flag": "🇪🇺"},
    "Bolivia": {"currency": "BOB", "flag": "🇧🇴"},
    "Paraguay": {"currency": "PYG", "flag": "🇵🇾"},
    "Uruguay": {"currency": "UYU", "flag": "🇺🇾"},
    "Panamá": {"currency": "USD", "flag": "🇵🇦"},
    "Costa Rica": {"currency": "CRC", "flag": "🇨🇷"},
    "República Dominicana": {"currency": "DOP", "flag": "🇩🇴"},
    "Guatemala": {"currency": "GTQ", "flag": "🇬🇹"},
    "Canadá": {"currency": "CAD", "flag": "🇨🇦"},
    "Reino Unido": {"currency": "GBP", "flag": "🇬🇧"},
    "China": {"currency": "CNY", "flag": "🇨🇳"},
    "Japón": {"currency": "JPY", "flag": "🇯🇵"},
}


@router.get("/countries", response_model=dict)
def get_countries(db: Session = Depends(get_db)):
    """Países disponibles. Público: lo usa el calculador del home.

    Sale de la tabla `countries`, editable desde Ajustes. Devuelve los activos
    con sus dos permisos para que cada calculador se quede con lo suyo:
    `can_send` para el desplegable de origen, `can_receive` para el destino.
    `iso2` viaja aquí para que la bandera no dependa de ningún mapa en el
    frontend — antes faltaban Canadá, Reino Unido, China y Japón.
    """
    rows = (
        db.query(Country)
        .filter(Country.active == True)
        .order_by(Country.name)
        .all()
    )
    data = [
        {
            "country": c.name,
            "currency": c.currency,
            "iso2": c.iso2,
            "flag": COUNTRIES_CURRENCIES.get(c.name, {}).get("flag", ""),
            "can_send": c.can_send,
            "can_receive": c.can_receive,
        }
        for c in rows
    ]
    return {"success": True, "data": data, "message": ""}


@router.get("/cinta", response_model=dict)
def cinta_de_tasas(db: Session = Depends(get_db)):
    """Las tasas para la cinta de la portada. Pública: no lleva sesión.

    Una entrada por país que recibe: a cuánto está su moneda contra el dólar y
    cuánto se ha movido en el día. La variación sale de `ref_rate`, que se
    congela cada 24 h; mientras no haya referencia, la entrada va sin flecha en
    vez de inventarse un 0,00%.
    """
    from services.imagen_tasas import abrevia

    paises = (
        db.query(Country)
        .filter(Country.active == True, Country.can_receive == True,
                Country.currency != None, Country.currency != "USD")
        .order_by(Country.name)
        .all()
    )

    filas = []
    for pais in paises:
        fila = db.query(ExchangeRate).filter(
            ExchangeRate.from_currency == "USD",
            ExchangeRate.to_currency == pais.currency,
        ).first()
        if not fila or not fila.rate:
            continue

        variacion = None
        if fila.ref_rate:
            variacion = (fila.rate - fila.ref_rate) / fila.ref_rate * 100

        filas.append({
            "par": f"USD a {abrevia(pais.name).upper()}",
            "country": pais.name,
            "currency": pais.currency,
            "iso2": pais.iso2 or "",
            "rate": fila.rate,
            "variacion": variacion,
        })

    return {"success": True, "data": filas, "message": ""}


@router.get("", response_model=dict)
def get_all_rates(db: Session = Depends(get_db)):
    rates = db.query(ExchangeRate).all()
    return {
        "success": True,
        "data": [RateOut.model_validate(r).model_dump() for r in rates],
        "message": ""
    }


# Monedas que no se manejan con decimales: nadie transfiere 17.512,34 pesos.
SIN_DECIMALES = {"CLP", "COP", "PYG", "JPY", "VES", "ARS", "CRC", "GTQ", "BOB"}


def _redondea_monto(valor: float, moneda: str) -> float:
    """Un monto que el cliente pueda teclear tal cual en su banco."""
    if moneda in SIN_DECIMALES:
        return float(round(valor))
    return round(valor, 2)


@router.get("/convert", response_model=dict)
def convert(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    # Uno de los dos. `amount` es lo normal: se fija cuanto se envia. Con
    # `amount_received` se fija lo que tiene que llegar y aqui sale cuanto hay
    # que mandar para que llegue eso.
    amount: float | None = Query(None, gt=0),
    amount_received: float | None = Query(None, gt=0),
    # Paises opcionales: varios comparten divisa y pueden tener comisiones
    # distintas. Sin ellos se cobra la de la moneda, que es el nivel anterior.
    from_country: str | None = Query(None),
    to_country: str | None = Query(None),
    db: Session = Depends(get_db),
    quien=Depends(get_current_user_optional),
):
    """Cuanto recibe el destinatario. Lo usan TODAS las calculadoras.

    La comision sale de las reglas por ruta, la misma funcion que cobra la orden
    de verdad. Antes se calculaba con el porcentaje fijo del archivo de
    configuracion, asi que poner 7% a Chile→Venezuela no cambiaba ni la
    calculadora de la portada ni la del panel: el cliente veia un numero y al
    enviar se le cobraba otro.

    `quien` es opcional porque la calculadora de la portada no lleva sesion.
    Identificado, se aplica la regla de SU super-admin; sin sesion, la global.
    """
    from services.order_service import _get_commission

    if amount is None and amount_received is None:
        raise HTTPException(status_code=422, detail="Falta amount o amount_received")

    rate = get_rate(db, from_currency.upper(), to_currency.upper())
    if not rate:
        raise HTTPException(status_code=404, detail=f"Tasa no disponible: {from_currency} → {to_currency}")

    dueno = None
    if quien is not None:
        dueno = quien.id if quien.role == "admin" else quien.super_admin_id
    # Sin sesion, dueno queda en None y se aplican las reglas globales. Desde
    # que las comisiones son globales eso es lo mismo que ve cualquiera, asi
    # que no hay nada que elegir: la portada cotiza lo que cobran todos.
    pct = _get_commission(db, from_currency.upper(), to_currency.upper(), dueno,
                          from_country=from_country, to_country=to_country)
    # Al reves: lo que recibe el destinatario es (enviado - comision) x tasa,
    # asi que enviado = recibido / ((1 - pct) x tasa). El monto que sale se
    # redondea a algo que se pueda teclear —los pesos no llevan decimales— y
    # con ESE monto se rehace la cuenta normal: lo que se enseña arriba y
    # abajo tiene que cuadrar entre si, aunque el recibido quede a un peso de
    # lo que se pidio.
    if amount is None:
        factor = (1 - pct / 100) * rate
        if factor <= 0:
            raise HTTPException(status_code=400, detail="No se puede calcular con esa tasa")
        amount = _redondea_monto(amount_received / factor, from_currency.upper())
        if amount <= 0:
            raise HTTPException(status_code=400, detail="El monto es demasiado pequeño")

    fee = round(amount * pct / 100, 2)
    amount_received = round((amount - fee) * rate, 2)

    # Al cliente no se le enseña la comisión: ni el importe ni la tasa de
    # mercado, porque con las dos cifras y una división sale igual. Ve la tasa
    # a la que se le cambia de verdad —ya con la comisión dentro— y cuánto
    # recibe el destinatario, que es lo que decide si envía o no.
    #
    # Se quita aquí y no en la pantalla: esconderlo con CSS lo deja igual de
    # visible para quien mire la respuesta de la API. Es lo mismo que hace
    # `_sin_comision` con las órdenes.
    es_del_equipo = quien is not None and quien.role in ("admin", "sub_admin")
    datos = ConvertResult(
        from_currency=from_currency.upper(),
        to_currency=to_currency.upper(),
        amount_sent=amount,
        rate=rate if es_del_equipo else (amount_received / amount if amount else rate),
        amount_received=amount_received,
        fee=fee,
        total_to_pay=amount,
    ).model_dump()
    if not es_del_equipo:
        datos.pop("fee", None)

    return {"success": True, "data": datos, "message": ""}


@router.post("/manual", response_model=dict)
def update_manual_rate(
    data: ManualRateUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin)
):
    set_manual_rate(db, data.from_currency.upper(), data.to_currency.upper(), data.rate)
    return {"success": True, "data": None, "message": "Tasa actualizada"}


@router.post("/refresh", response_model=dict)
async def refresh_rates(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    success = await fetch_and_store_rates(db)
    return {
        "success": success,
        "data": None,
        "message": "Tasas actualizadas" if success else "Error al actualizar tasas"
    }


# ── Mercado paralelo ──────────────────────────────────────────

class ParaleloIn(BaseModel):
    moneda: str
    activo: bool


class LadoIn(BaseModel):
    moneda: str
    lado: str          # SELL (venta) o BUY (compra)


@router.get("/parallel", response_model=dict)
async def estado_paralelo(_admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Qué dice cada fuente ahora mismo, junto a la tasa oficial.

    Existe para poder mirar la diferencia antes de encender una moneda: cotizar
    al paralelo solo es correcto si la casa también liquida a esa tasa.
    """
    salida = []
    for moneda in MONEDAS_PARALELO:
        datos = await comparar_fuentes(moneda)
        datos["activo"] = usa_paralelo(db, moneda)
        salida.append(datos)
    return {"success": True, "data": salida, "message": ""}


@router.get("/parallel/{moneda}", response_model=dict)
async def paralelo_de_moneda(moneda: str, _admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Oficial y paralelo de una sola moneda, la que se elige en el desplegable.

    Una a una y no todas de golpe: cada moneda consulta fuentes externas, y
    pedir las veinte a la vez tardaría decenas de segundos en abrir Ajustes.
    """
    from services.exchange_service import comparar_moneda

    moneda = moneda.upper()
    if moneda == "USD":
        raise HTTPException(status_code=400, detail="El dólar es la base: no tiene paralelo contra sí mismo")
    datos = await comparar_moneda(moneda)
    datos["activo"] = usa_paralelo(db, moneda)
    datos["lado"] = lado_binance(db, moneda)
    return {"success": True, "data": datos, "message": ""}


@router.post("/parallel/lado", response_model=dict)
def cambiar_lado(
    data: LadoIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Con qué lado de Binance se cotiza esa moneda: venta o compra.

    Venta es el lado que hace la casa —para entregar moneda local hay que
    vender el USDT— y es lo que viene puesto. Cambiarlo a compra promete algo
    más de moneda local por dólar de la que se recibe al cambiarlo, así que la
    diferencia la pone la casa en cada orden.
    """
    from services.exchange_service import set_lado_binance

    moneda = data.moneda.upper()
    if moneda == "USD" or moneda not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"{moneda} no se cotiza contra Binance")
    try:
        lado = set_lado_binance(db, moneda, data.lado)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "success": True,
        "data": {"moneda": moneda, "lado": lado},
        "message": f"{moneda} se cotiza al precio de {'venta' if lado == 'SELL' else 'compra'}",
    }


@router.post("/parallel", response_model=dict)
async def cambiar_paralelo(
    data: ParaleloIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Enciende o apaga el mercado paralelo para una moneda."""
    from models.setting import Setting

    moneda = data.moneda.upper()
    # Cualquier moneda del sistema, no solo las que traen fuentes declaradas a
    # mano: el resto se cotiza contra Binance P2P. El dolar se queda fuera
    # porque es la base de todas las tasas.
    if moneda == "USD" or moneda not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"{moneda} no se puede cotizar al paralelo")

    clave = clave_paralelo(moneda)
    row = db.query(Setting).filter(Setting.key == clave).first()
    valor = "true" if data.activo else "false"
    if row:
        row.value = valor
    else:
        db.add(Setting(key=clave, value=valor))
    db.commit()

    # Se recalcula en el momento: si no, la moneda se queda con la tasa del
    # otro mercado hasta la siguiente pasada del programador.
    await fetch_and_store_rates(db)

    return {
        "success": True,
        "data": {"moneda": moneda, "activo": data.activo},
        "message": f"{moneda} cotiza al {'mercado paralelo' if data.activo else 'cambio oficial'}",
    }
