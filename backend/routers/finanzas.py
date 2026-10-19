"""El cuaderno de finanzas del super-admin.

Capital, lo generado cada día y el acumulado. Lo escribe él: no se alimenta de
los envíos de la web a propósito, porque también entra por aquí lo que se movió
fuera de la plataforma.

Cada super-admin ve solo lo suyo, y eso se comprueba en cada operación contra
el dueño guardado en la fila, nunca contra lo que venga en la petición.
"""
import json
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.dependencies import require_super_admin
from database import get_db
from models.country import Country
from models.finance_entry import (
    FinanceEntry, FinanceRate, FinancePref, FinanceBank, FinanceExpense,
)
from models.user import User
from services.exchange_service import get_rate

# Todo lo que se suma se suma en pesos chilenos. La casa lleva la caja en una
# moneda: con un total por cada una no hay forma de responder "cuánto llevamos".
MONEDA_CAJA = "CLP"

# Las filas del arqueo que no son un pais —un pago suelto, una caja chica, un
# saldo en USDT— no tienen moneda que heredar. Van en dolares, que es la
# moneda en la que se lee el arqueo entero; en pesos salian cifras de menos de
# un dolar donde se habian escrito miles.
MONEDA_FILA_SUELTA = "USD"

router = APIRouter(prefix="/api/finanzas", tags=["finanzas"])
log = logging.getLogger("ppa")


class ApunteIn(BaseModel):
    fecha: date
    origen: str
    destino: str
    monto: float = 0.0
    orden: int = 0
    nota: Optional[str] = None


class ApuntePatch(BaseModel):
    destino: Optional[str] = None
    monto: Optional[float] = None
    nota: Optional[str] = None


class PorcentajeIn(BaseModel):
    origen: str
    destino: str
    porcentaje: float = Field(ge=0, le=100)


class PreferenciasIn(BaseModel):
    ocultos: Optional[list[str]] = None
    orden: Optional[list[str]] = None


class BancoIn(BaseModel):
    fecha: date
    pais: str
    monto: float = 0.0
    orden: int = 0
    nombre: Optional[str] = None


class BancoPatch(BaseModel):
    monto: Optional[float] = None
    nombre: Optional[str] = None
    pais: Optional[str] = None


class GastoIn(BaseModel):
    fecha: date
    monto: float = 0.0
    concepto: Optional[str] = None
    moneda: Optional[str] = None
    orden: int = 0


class GastoPatch(BaseModel):
    monto: Optional[float] = None
    concepto: Optional[str] = None
    moneda: Optional[str] = None


class CapitalIn(BaseModel):
    capital_usd: float = Field(ge=0)
    # Desde qué día vale. Si no viene, desde hoy: cuando alguien corrige el
    # capital está diciendo lo que hay AHORA, no lo que había en enero.
    desde: Optional[date] = None


def _prefs(db: Session, dueno_id: int) -> FinancePref:
    fila = db.query(FinancePref).filter(FinancePref.super_admin_id == dueno_id).first()
    if not fila:
        fila = FinancePref(super_admin_id=dueno_id, ocultos="[]", orden="[]")
        db.add(fila)
        db.commit()
        db.refresh(fila)
    return fila


def _lista(texto: str) -> list[str]:
    try:
        valor = json.loads(texto or "[]")
        return [str(x) for x in valor] if isinstance(valor, list) else []
    except (ValueError, TypeError):
        return []


def _moneda_de(db: Session, pais: str) -> str:
    fila = db.query(Country).filter(Country.name == pais).first()
    return fila.currency if fila else ""


def _tasa_a_caja(db: Session, moneda: str) -> float:
    """Cuántos pesos chilenos vale una unidad de esa moneda, hoy.

    Cero si no hay tasa: se guarda así a propósito y la pantalla lo avisa, en
    vez de dar por bueno un total al que le falta dinero.
    """
    if not moneda:
        return 0.0
    if moneda == MONEDA_CAJA:
        return 1.0
    return get_rate(db, moneda, MONEDA_CAJA) or 0.0


def _porcentajes(db: Session, dueno_id: int) -> dict[tuple[str, str], float]:
    filas = db.query(FinanceRate).filter(FinanceRate.super_admin_id == dueno_id).all()
    return {(f.origen, f.destino): f.porcentaje for f in filas}


def _pct_de_ruta(db: Session, dueno_id: int, origen: str, destino: str) -> float:
    f = db.query(FinanceRate).filter(
        FinanceRate.super_admin_id == dueno_id,
        FinanceRate.origen == origen,
        FinanceRate.destino == destino,
    ).first()
    return f.porcentaje if f else 0.0


def _sale(a: FinanceEntry) -> dict:
    ganancia = round(a.monto * a.porcentaje / 100, 2)
    return {
        "id": a.id,
        "fecha": a.fecha.isoformat(),
        "origen": a.origen,
        "destino": a.destino,
        "moneda": a.moneda,
        "monto": a.monto,
        "porcentaje": a.porcentaje,
        "ganancia": ganancia,
        "monto_clp": round(a.monto_clp or 0, 2),
        "ganancia_clp": round((a.monto_clp or 0) * a.porcentaje / 100, 2),
        "tasa_clp": a.tasa_clp or 0,
        "orden": a.orden,
        "nota": a.nota,
    }


def _rellena_en_pesos(db: Session, filas) -> int:
    """Pone el valor en pesos a los apuntes que aún no lo tengan.

    Los anotados antes de que la caja se llevara en pesos no guardaron su
    equivalente, y sumaban cero: el dinero estaba anotado pero no aparecía en
    ningún total. Se les calcula la primera vez que se leen y se guarda, con lo
    que el arreglo se hace solo y una sola vez.

    Se usa la tasa de hoy porque la de aquel día ya no está guardada. Es una
    aproximación, y por eso solo se aplica a lo que está sin convertir: a partir
    de ahí cada apunte conserva la suya.
    """
    tocados = 0
    for a in filas:
        if a.monto_clp or not a.monto:
            continue
        tasa = _tasa_a_caja(db, a.moneda)
        if not tasa:
            continue
        a.tasa_clp = tasa
        a.monto_clp = a.monto * tasa
        tocados += 1
    if tocados:
        db.commit()
    return tocados


def _suma_en_caja(filas) -> tuple[list[dict], dict, int]:
    """Lo movido y lo ganado por país, en pesos chilenos.

    Devuelve también cuántos apuntes no se pudieron convertir, para poder
    decirlo en pantalla en vez de callarlo.
    """
    por_origen: dict[str, dict] = {}
    total = {"moneda": MONEDA_CAJA, "movido": 0.0, "ganado": 0.0}
    sin_tasa = 0

    for a in filas:
        clp = a.monto_clp or 0
        if not clp and a.monto:
            sin_tasa += 1
        ganancia = clp * a.porcentaje / 100
        o = por_origen.setdefault(a.origen, {
            "origen": a.origen, "moneda": MONEDA_CAJA, "movido": 0.0, "ganado": 0.0,
        })
        o["movido"] += clp
        o["ganado"] += ganancia
        total["movido"] += clp
        total["ganado"] += ganancia

    for d in [*por_origen.values(), total]:
        d["movido"] = round(d["movido"], 2)
        d["ganado"] = round(d["ganado"], 2)

    return sorted(por_origen.values(), key=lambda o: o["origen"]), total, sin_tasa


def _no_a_si_mismo(origen: str, destino: str) -> None:
    """Nadie se envía dinero a sí mismo.

    Se comprueba aquí y no solo escondiendo la fila: una fila que no se pinta
    pero cuyo apunte existe sigue sumando en los totales, y no habría forma de
    verlo ni de corregirlo desde la pantalla.
    """
    if origen == destino:
        raise HTTPException(
            status_code=400,
            detail=f"{origen} no puede enviarse a sí mismo",
        )


def _mio(db: Session, apunte_id: int, dueno: User) -> FinanceEntry:
    """El apunte, si es de quien pregunta. Si no, no existe.

    404 y no 403: decir "existe pero no es tuyo" ya cuenta cuántos apuntes
    tienen los demás.
    """
    a = db.query(FinanceEntry).filter(
        FinanceEntry.id == apunte_id,
        FinanceEntry.super_admin_id == dueno.id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Apunte no encontrado")
    return a


def _comision_desde(filas, base: Optional[date], desde: date, hasta: date) -> float:
    """Lo comisionado entre el día del capital y el que se está mirando.

    Sin día de capital se cuenta solo el rango que se ve: es lo único que se
    puede afirmar sin saber desde cuándo vale esa cifra.

    Mirando un día ANTERIOR al del capital no se cuenta nada: aquel día el
    capital todavía no era ese, y arrastrar comisiones hacia atrás daría un
    "debería haber" que nunca fue cierto.
    """
    if not base:
        return sum((a.monto_clp or 0) * a.porcentaje / 100 for a in filas if desde <= a.fecha <= hasta)
    if hasta < base:
        return 0.0
    return sum((a.monto_clp or 0) * a.porcentaje / 100 for a in filas if base <= a.fecha <= hasta)


def _sale_banco(b: FinanceBank) -> dict:
    return {
        "id": b.id,
        "fecha": b.fecha.isoformat(),
        "pais": b.pais,
        "nombre": b.nombre,
        "moneda": b.moneda,
        "monto": b.monto,
        "monto_clp": round(b.monto_clp or 0, 2),
        "tasa_clp": b.tasa_clp or 0,
        "orden": b.orden,
    }


def _sale_gasto(g: FinanceExpense) -> dict:
    return {
        "id": g.id,
        "fecha": g.fecha.isoformat(),
        "concepto": g.concepto,
        "moneda": g.moneda,
        "monto": g.monto,
        "monto_clp": round(g.monto_clp or 0, 2),
        "tasa_clp": g.tasa_clp or 0,
        "orden": g.orden,
    }


def _bancos_del_dia(db: Session, dueno_id: int, hasta: date):
    """Lo contado ESE día, y nada más.

    El arqueo es un conteo, no un saldo que se hereda: cada día se abre en
    blanco y se vuelve a contar. Hubo una versión que arrastraba el último
    conteo de cada país para no reescribir cifras que no habían cambiado, y lo
    que hacía era dar por contado lo que nadie había mirado hoy.

    Cada día guarda el suyo, así que volver a una fecha pasada enseña lo que
    se contó entonces, tal cual.
    """
    return db.query(FinanceBank).filter(
        FinanceBank.super_admin_id == dueno_id,
        FinanceBank.fecha == hasta,
    ).order_by(FinanceBank.orden, FinanceBank.id).all()


def _gastos_del_mes(db: Session, dueno_id: int, hasta: date):
    """TODOS los gastos del mes al que pertenece el día que se mira.

    Del mes y no del día porque un gasto no es cosa de una jornada: el
    arriendo o una comisión bancaria pesan todo el mes, y verlos solo el día
    que se anotaron los dejaba escritos pero invisibles al día siguiente.

    Y del mes entero, no hasta el día que se mira. Hubo una versión que
    cortaba en esa fecha para que un arqueo de ayer no cargara gastos de
    mañana; lo pedido es lo contrario, que la lista de gastos sea siempre la
    misma mientras dure el mes, se mire el día que se mire. Los saldos de los
    bancos sí son de cada día; los gastos, del mes.
    """
    primero = hasta.replace(day=1)
    # El primero del mes siguiente, para no tener que saber cuántos días tiene
    # este: el 28, el 30, el 31 o el 29 de un bisiesto.
    siguiente = (primero + timedelta(days=32)).replace(day=1)
    return db.query(FinanceExpense).filter(
        FinanceExpense.super_admin_id == dueno_id,
        FinanceExpense.fecha >= primero,
        FinanceExpense.fecha < siguiente,
    ).order_by(FinanceExpense.fecha, FinanceExpense.orden, FinanceExpense.id).all()


def _mi_banco(db: Session, fila_id: int, dueno: User) -> FinanceBank:
    """La cuenta contada, si es de quien pregunta. Si no, no existe."""
    b = db.query(FinanceBank).filter(
        FinanceBank.id == fila_id,
        FinanceBank.super_admin_id == dueno.id,
    ).first()
    if not b:
        raise HTTPException(status_code=404, detail="Esa cuenta no existe")
    return b


def _mi_gasto(db: Session, fila_id: int, dueno: User) -> FinanceExpense:
    g = db.query(FinanceExpense).filter(
        FinanceExpense.id == fila_id,
        FinanceExpense.super_admin_id == dueno.id,
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Ese gasto no existe")
    return g


@router.get("", response_model=dict)
def listar(
    desde: date = Query(...),
    hasta: date = Query(...),
    mes: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Los apuntes de un rango, con los totales ya sumados.

    Los totales van por moneda y sin convertir nada: mezclar pesos con soles a
    la tasa de hoy daría una cifra que mañana es otra, y esto es un registro de
    lo que pasó, no una estimación.
    """
    if hasta < desde:
        raise HTTPException(status_code=400, detail="El rango de fechas está al revés")

    filas = db.query(FinanceEntry).filter(
        FinanceEntry.super_admin_id == admin.id,
        FinanceEntry.fecha >= desde,
        FinanceEntry.fecha <= hasta,
    ).order_by(FinanceEntry.fecha, FinanceEntry.orden, FinanceEntry.id).all()

    prefs = _prefs(db, admin.id)

    todo = db.query(FinanceEntry).filter(FinanceEntry.super_admin_id == admin.id).all()
    _rellena_en_pesos(db, todo)

    apuntes = [_sale(a) for a in filas]

    por_origen, total_dia, sin_tasa_dia = _suma_en_caja(filas)

    # Y el acumulado del mes en curso, que es lo que va sumando día tras día.
    #
    # No mira el filtro de fechas a propósito: al lado tiene la suma del día
    # que se esté viendo, y si los dos cambiaran a la vez serían el mismo dato
    # dos veces. El mes se toma del calendario chileno, no del reloj del
    # servidor, que va en UTC y el primer día del mes cambiaría de mes a las
    # nueve de la noche.
    hoy_chile = datetime.now(ZoneInfo("America/Santiago")).date()
    if mes:
        anio, num = (int(x) for x in mes.split("-"))
        primero = date(anio, num, 1)
    else:
        primero = hoy_chile.replace(day=1)

    # Hasta el final del mes, o hasta hoy si es el mes en curso: un mes ya
    # cerrado se enseña entero, y del actual no hay nada más allá de hoy.
    ultimo = date(primero.year + (primero.month == 12), primero.month % 12 + 1, 1) - timedelta(days=1)
    if primero <= hoy_chile <= ultimo:
        ultimo = hoy_chile

    del_mes = [a for a in todo if primero <= a.fecha <= ultimo]
    acum_origen, total_acum, sin_tasa_acum = _suma_en_caja(del_mes)

    return {
        "data": apuntes,
        "moneda": MONEDA_CAJA,
        # Cuántos pesos vale un dólar HOY, para poder enseñar los totales
        # también en dólares.
        #
        # Va la tasa y no las cifras ya convertidas a propósito: lo que se
        # guarda son pesos congelados el día del apunte, y el dólar es una
        # lectura de hoy sobre ese total. Mandar la tasa deja claro que es una
        # equivalencia de hoy y no otra cifra guardada.
        #
        # Cero si no hay tasa; la pantalla entonces no enseña dólares en vez de
        # inventar una conversión.
        "usd_clp": _tasa_a_caja(db, "USD"),
        "totales": [total_dia],
        "por_origen": por_origen,
        "sin_tasa": sin_tasa_dia,
        "acumulado": {
            "por_origen": acum_origen,
            "totales": [total_acum],
            "sin_tasa": sin_tasa_acum,
            "desde": primero.isoformat(),
            "hasta": ultimo.isoformat(),
            "mes_actual": hoy_chile.strftime("%Y-%m"),
        },
        # Todas las rutas con porcentaje puesto, no solo las que tienen apuntes
        # en este rango: el badge del país tiene que verse aunque ese día no se
        # haya movido nada por ahí.
        "preferencias": {
            "ocultos": _lista(prefs.ocultos),
            "orden": _lista(prefs.orden),
            # Con lo que arranca el arqueo. Lo que el cuaderno dice que debería
            # haber es esto más lo movido; los bancos dicen lo que hay.
            "capital_usd": prefs.capital_usd or 0,
            "capital_desde": prefs.capital_desde.isoformat() if prefs.capital_desde else None,
        },
        # Lo comisionado desde el día del capital hasta el que se está mirando.
        #
        # Es lo que hace que el capital crezca solo: hoy es el capital más la
        # comisión de hoy, mañana eso más la de mañana. La cuenta se hace aquí
        # y no en la pantalla porque necesita TODOS los apuntes, no solo los
        # del rango que se esté viendo.
        "comision_desde_capital": round(_comision_desde(todo, prefs.capital_desde, desde, hasta), 2),
        # El arqueo del rango que se está viendo: lo contado en los bancos y lo
        # que salió en gastos. Va aquí y no en otra llamada porque es la misma
        # pantalla y el mismo rango de fechas: dos peticiones podrían contestar
        # de días distintos.
        "bancos": [_sale_banco(b) for b in _bancos_del_dia(db, admin.id, hasta)],
        "gastos": [_sale_gasto(g) for g in _gastos_del_mes(db, admin.id, hasta)],
        "porcentajes": [
            {"origen": o, "destino": d, "porcentaje": p}
            for (o, d), p in _porcentajes(db, admin.id).items()
        ],
    }


@router.post("", response_model=dict)
def crear(
    datos: ApunteIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    _no_a_si_mismo(datos.origen, datos.destino)
    moneda = _moneda_de(db, datos.origen)
    tasa = _tasa_a_caja(db, moneda)
    a = FinanceEntry(
        super_admin_id=admin.id,
        fecha=datos.fecha,
        origen=datos.origen,
        destino=datos.destino,
        moneda=moneda,
        monto=datos.monto,
        tasa_clp=tasa,
        monto_clp=datos.monto * tasa,
        porcentaje=_pct_de_ruta(db, admin.id, datos.origen, datos.destino),
        orden=datos.orden,
        nota=datos.nota,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"data": _sale(a)}


@router.patch("/{apunte_id}", response_model=dict)
def editar(
    apunte_id: int,
    datos: ApuntePatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    a = _mio(db, apunte_id, admin)
    cambios = datos.model_dump(exclude_unset=True)
    if "destino" in cambios:
        _no_a_si_mismo(a.origen, cambios["destino"])
    for campo, valor in cambios.items():
        setattr(a, campo, valor)
    # Cambiar de columna es cambiar de ruta, y cada ruta cobra lo suyo.
    if "destino" in cambios:
        a.porcentaje = _pct_de_ruta(db, admin.id, a.origen, a.destino)
    # Corregir la cifra rehace su valor en pesos con la MISMA tasa del apunte,
    # no con la de hoy: se está arreglando lo que se anotó ese día.
    if "monto" in cambios:
        if not a.tasa_clp:
            a.tasa_clp = _tasa_a_caja(db, a.moneda)
        a.monto_clp = a.monto * a.tasa_clp
    db.commit()
    db.refresh(a)
    return {"data": _sale(a)}


@router.put("/porcentaje", response_model=dict)
def poner_porcentaje(
    datos: PorcentajeIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """El porcentaje de una ruta, el badge de la columna.

    Recalcula lo ya anotado de esa ruta, incluido lo de fechas que ahora mismo
    no se estén viendo: es lo que se cobra ahí, no una nota de un día. Si
    hiciera falta conservar lo viejo con el porcentaje antiguo, habría que
    guardar desde cuándo rige cada uno, y eso es otra cosa.
    """
    _no_a_si_mismo(datos.origen, datos.destino)

    fila = db.query(FinanceRate).filter(
        FinanceRate.super_admin_id == admin.id,
        FinanceRate.origen == datos.origen,
        FinanceRate.destino == datos.destino,
    ).first()

    if fila:
        fila.porcentaje = datos.porcentaje
    else:
        db.add(FinanceRate(
            super_admin_id=admin.id,
            origen=datos.origen,
            destino=datos.destino,
            porcentaje=datos.porcentaje,
        ))

    tocados = db.query(FinanceEntry).filter(
        FinanceEntry.super_admin_id == admin.id,
        FinanceEntry.origen == datos.origen,
        FinanceEntry.destino == datos.destino,
    ).update({"porcentaje": datos.porcentaje}, synchronize_session=False)

    db.commit()
    return {"ok": True, "apuntes_recalculados": tocados}


class PorcentajeGeneralIn(BaseModel):
    origen: str
    destinos: list[str]
    porcentaje: float = Field(ge=0, le=100)


@router.put("/porcentaje-general", response_model=dict)
def porcentaje_general(
    datos: PorcentajeGeneralIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """El mismo porcentaje para todos los destinos de un país, de una vez.

    Solo toca los que no tengan uno puesto. Lo que se ajustó a mano en una ruta
    concreta se respeta: se pone a mano justamente porque ahí se cobra distinto,
    y un "para todos" que lo borrara obligaría a volver a ponerlos todos.
    """
    ya = {
        f.destino for f in db.query(FinanceRate).filter(
            FinanceRate.super_admin_id == admin.id,
            FinanceRate.origen == datos.origen,
            FinanceRate.porcentaje > 0,
        ).all()
    }

    puestos = 0
    for destino in datos.destinos:
        if destino in ya or destino == datos.origen:
            continue
        fila = db.query(FinanceRate).filter(
            FinanceRate.super_admin_id == admin.id,
            FinanceRate.origen == datos.origen,
            FinanceRate.destino == destino,
        ).first()
        if fila:
            fila.porcentaje = datos.porcentaje
        else:
            db.add(FinanceRate(
                super_admin_id=admin.id,
                origen=datos.origen,
                destino=destino,
                porcentaje=datos.porcentaje,
            ))
        db.query(FinanceEntry).filter(
            FinanceEntry.super_admin_id == admin.id,
            FinanceEntry.origen == datos.origen,
            FinanceEntry.destino == destino,
        ).update({"porcentaje": datos.porcentaje}, synchronize_session=False)
        puestos += 1

    db.commit()
    return {"ok": True, "puestos": puestos, "respetados": len(ya)}


@router.put("/preferencias", response_model=dict)
def guardar_preferencias(
    datos: PreferenciasIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Qué países no quiere ver y en qué orden.

    Ocultar un país es cosa de esta pantalla: ni se borra el país de la web ni
    se toca lo que ya esté anotado de él, que sigue contando en los totales.
    Por eso se guarda aquí y no en el catálogo de países.
    """
    fila = _prefs(db, admin.id)
    if datos.ocultos is not None:
        fila.ocultos = json.dumps(datos.ocultos, ensure_ascii=False)
    if datos.orden is not None:
        fila.orden = json.dumps(datos.orden, ensure_ascii=False)
    db.commit()
    db.refresh(fila)
    return {"data": {"ocultos": _lista(fila.ocultos), "orden": _lista(fila.orden)}}


@router.delete("/{apunte_id}", response_model=dict)
def borrar(
    apunte_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    db.delete(_mio(db, apunte_id, admin))
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# El arqueo: lo que hay en los bancos, los gastos y el capital.
#
# El cuaderno dice lo que debería haber; esto dice lo que hay. La pantalla
# compara las dos cifras y avisa cuando no cuadran, que es para lo que existe.
# ---------------------------------------------------------------------------

@router.post("/bancos", response_model=dict)
def crear_banco(
    datos: BancoIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Lo contado en una cuenta de un país.

    La moneda y el cambio se congelan al anotar, igual que en los apuntes: lo
    contado el lunes tiene que seguir valiendo lo mismo cuando se lea el
    viernes.
    """
    moneda = _moneda_de(db, datos.pais) or MONEDA_FILA_SUELTA
    tasa = _tasa_a_caja(db, moneda)
    b = FinanceBank(
        super_admin_id=admin.id,
        fecha=datos.fecha,
        pais=datos.pais,
        nombre=datos.nombre,
        moneda=moneda,
        monto=datos.monto,
        tasa_clp=tasa,
        monto_clp=datos.monto * tasa,
        orden=datos.orden,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return {"data": _sale_banco(b)}


@router.patch("/bancos/{fila_id}", response_model=dict)
def editar_banco(
    fila_id: int,
    datos: BancoPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    b = _mi_banco(db, fila_id, admin)
    if datos.nombre is not None:
        b.nombre = datos.nombre
    if datos.pais is not None and datos.pais != b.pais:
        # Cambiar de país cambia la moneda, así que el valor en pesos se rehace
        # con el cambio de la moneda nueva.
        b.pais = datos.pais
        b.moneda = _moneda_de(db, datos.pais) or MONEDA_FILA_SUELTA
        b.tasa_clp = _tasa_a_caja(db, b.moneda)
        b.monto_clp = b.monto * b.tasa_clp
    if datos.monto is not None:
        # Corregir la cifra la rehace con la MISMA tasa con la que se anotó: el
        # cambio de hoy daría otro valor y esto es un conteo de un día.
        b.monto = datos.monto
        if not b.tasa_clp:
            b.tasa_clp = _tasa_a_caja(db, b.moneda)
        b.monto_clp = b.monto * b.tasa_clp
    db.commit()
    db.refresh(b)
    return {"data": _sale_banco(b)}


@router.delete("/bancos/{fila_id}", response_model=dict)
def borrar_banco(
    fila_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    db.delete(_mi_banco(db, fila_id, admin))
    db.commit()
    return {"ok": True}


@router.post("/gastos", response_model=dict)
def crear_gasto(
    datos: GastoIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    moneda = (datos.moneda or MONEDA_CAJA).upper()
    tasa = _tasa_a_caja(db, moneda)
    g = FinanceExpense(
        super_admin_id=admin.id,
        fecha=datos.fecha,
        concepto=datos.concepto,
        moneda=moneda,
        monto=datos.monto,
        tasa_clp=tasa,
        monto_clp=datos.monto * tasa,
        orden=datos.orden,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"data": _sale_gasto(g)}


@router.patch("/gastos/{fila_id}", response_model=dict)
def editar_gasto(
    fila_id: int,
    datos: GastoPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    g = _mi_gasto(db, fila_id, admin)
    if datos.concepto is not None:
        g.concepto = datos.concepto
    if datos.moneda is not None and datos.moneda.upper() != g.moneda:
        g.moneda = datos.moneda.upper()
        g.tasa_clp = _tasa_a_caja(db, g.moneda)
        g.monto_clp = g.monto * g.tasa_clp
    if datos.monto is not None:
        g.monto = datos.monto
        if not g.tasa_clp:
            g.tasa_clp = _tasa_a_caja(db, g.moneda)
        g.monto_clp = g.monto * g.tasa_clp
    db.commit()
    db.refresh(g)
    return {"data": _sale_gasto(g)}


@router.delete("/gastos/{fila_id}", response_model=dict)
def borrar_gasto(
    fila_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    db.delete(_mi_gasto(db, fila_id, admin))
    db.commit()
    return {"ok": True}


@router.put("/capital", response_model=dict)
def guardar_capital(
    datos: CapitalIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """El capital con el que arranca el arqueo, en dólares."""
    fila = _prefs(db, admin.id)
    fila.capital_usd = datos.capital_usd
    # El calendario chileno, no el reloj del servidor, que va en UTC y a las
    # nueve de la noche ya estaría poniendo la fecha de mañana.
    fila.capital_desde = datos.desde or datetime.now(ZoneInfo("America/Santiago")).date()
    db.commit()
    db.refresh(fila)
    return {"data": {
        "capital_usd": fila.capital_usd,
        "capital_desde": fila.capital_desde.isoformat() if fila.capital_desde else None,
    }}
