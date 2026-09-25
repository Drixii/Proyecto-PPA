"""El cuaderno de finanzas del super-admin.

Capital, lo generado cada día y el acumulado. Lo escribe él: no se alimenta de
los envíos de la web a propósito, porque también entra por aquí lo que se movió
fuera de la plataforma.

Cada super-admin ve solo lo suyo, y eso se comprueba en cada operación contra
el dueño guardado en la fila, nunca contra lo que venga en la petición.
"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.dependencies import require_super_admin
from database import get_db
from models.country import Country
from models.finance_entry import FinanceEntry, FinanceRate
from models.user import User

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


def _moneda_de(db: Session, pais: str) -> str:
    fila = db.query(Country).filter(Country.name == pais).first()
    return fila.currency if fila else ""


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
        "orden": a.orden,
        "nota": a.nota,
    }


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


@router.get("", response_model=dict)
def listar(
    desde: date = Query(...),
    hasta: date = Query(...),
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

    apuntes = [_sale(a) for a in filas]

    por_moneda: dict[str, dict] = {}
    for a in apuntes:
        m = por_moneda.setdefault(a["moneda"] or "—", {"moneda": a["moneda"] or "—", "movido": 0.0, "ganado": 0.0})
        m["movido"] += a["monto"]
        m["ganado"] += a["ganancia"]
    for m in por_moneda.values():
        m["movido"] = round(m["movido"], 2)
        m["ganado"] = round(m["ganado"], 2)

    # Lo de cada país que envía, para el cuadro de abajo. Va aparte de los
    # apuntes porque ese cuadro no cambia al moverse de país: es el resumen de
    # todos.
    por_origen: dict[str, dict] = {}
    for a in apuntes:
        o = por_origen.setdefault(a["origen"], {
            "origen": a["origen"], "moneda": a["moneda"], "movido": 0.0, "ganado": 0.0,
        })
        o["movido"] += a["monto"]
        o["ganado"] += a["ganancia"]
    for o in por_origen.values():
        o["movido"] = round(o["movido"], 2)
        o["ganado"] = round(o["ganado"], 2)

    # Y lo mismo sin mirar las fechas: el acumulado de todo lo anotado, que es
    # lo que va sumando día tras día. Se calcula aquí y no en otra llamada
    # porque siempre se piden juntos —el día al lado del acumulado— y son dos
    # sumas sobre la misma tabla.
    acum_origen: dict[str, dict] = {}
    acum_moneda: dict[str, dict] = {}
    for a in db.query(FinanceEntry).filter(FinanceEntry.super_admin_id == admin.id).all():
        ganancia = a.monto * a.porcentaje / 100
        o = acum_origen.setdefault(a.origen, {
            "origen": a.origen, "moneda": a.moneda, "movido": 0.0, "ganado": 0.0,
        })
        o["movido"] += a.monto
        o["ganado"] += ganancia
        m = acum_moneda.setdefault(a.moneda or "—", {
            "moneda": a.moneda or "—", "movido": 0.0, "ganado": 0.0,
        })
        m["movido"] += a.monto
        m["ganado"] += ganancia
    for d in list(acum_origen.values()) + list(acum_moneda.values()):
        d["movido"] = round(d["movido"], 2)
        d["ganado"] = round(d["ganado"], 2)

    return {
        "data": apuntes,
        "totales": sorted(por_moneda.values(), key=lambda m: m["moneda"]),
        "por_origen": sorted(por_origen.values(), key=lambda o: o["origen"]),
        "acumulado": {
            "por_origen": sorted(acum_origen.values(), key=lambda o: o["origen"]),
            "totales": sorted(acum_moneda.values(), key=lambda m: m["moneda"]),
        },
        # Todas las rutas con porcentaje puesto, no solo las que tienen apuntes
        # en este rango: el badge de la columna tiene que verse aunque ese día
        # no se haya movido nada por ahí.
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
    a = FinanceEntry(
        super_admin_id=admin.id,
        fecha=datos.fecha,
        origen=datos.origen,
        destino=datos.destino,
        moneda=_moneda_de(db, datos.origen),
        monto=datos.monto,
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
    for campo, valor in cambios.items():
        setattr(a, campo, valor)
    # Cambiar de columna es cambiar de ruta, y cada ruta cobra lo suyo.
    if "destino" in cambios:
        a.porcentaje = _pct_de_ruta(db, admin.id, a.origen, a.destino)
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
        if destino in ya:
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


@router.delete("/{apunte_id}", response_model=dict)
def borrar(
    apunte_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    db.delete(_mio(db, apunte_id, admin))
    db.commit()
    return {"ok": True}
