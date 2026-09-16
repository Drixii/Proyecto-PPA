"""Cuentas bancarias propias del super-admin, por pais.

Koywe emite cuenta virtual en MXN, ARS y CLP. En las otras seis monedas de
origen (COP, USD, EUR, PEN, BRL, CAD) no hay a donde transferir, asi que cada
super-admin registra aqui la suya.

Los campos NO son los mismos en todos los paises, y esa es la razon de que este
modulo exista en vez de media docena de columnas: un IBAN espanol y una clave
PIX brasilena no se parecen en nada, y pedir "numero de cuenta" a secas hace
que el cliente teclee lo que no es y la transferencia rebote. Cada moneda
declara sus campos, cuales son obligatorios y que aspecto tienen.

El mismo catalogo lo consume el panel (para pintar el formulario) y el
validador (para no guardar basura), asi que no pueden desincronizarse.
"""
import json

from sqlalchemy import or_
from typing import Optional

from sqlalchemy.orm import Session

from models.super_admin_account import SuperAdminAccount

# Monedas que Koywe ya cubre con cuenta virtual propia. No se pide cuenta
# bancaria para ellas: tener dos cuentas para la misma moneda solo genera dudas
# sobre cual usar. Si aparecen en el panel, es solo por el interruptor de
# tarjeta, que tambien les aplica.
CUBIERTAS_POR_KOYWE = ("MXN", "ARS", "CLP")

# Como se llaman esos tres, para poder pintarlos junto a los demas.
INFO_KOYWE = {
    "CLP": {"pais": "Chile", "bandera": "cl"},
    "MXN": {"pais": "Mexico", "bandera": "mx"},
    "ARS": {"pais": "Argentina", "bandera": "ar"},
}


def _campo(clave, etiqueta, requerido=True, tipo="text", ayuda="", opciones=None):
    return {
        "clave": clave,
        "etiqueta": etiqueta,
        "requerido": requerido,
        "tipo": tipo,
        "ayuda": ayuda,
        "opciones": opciones or [],
    }


# Titular y documento se repiten en casi todos: quien recibe y con que
# identificacion, que es lo que pide el banco para no rechazar el abono.
_TITULAR = _campo("titular", "Titular de la cuenta", ayuda="Nombre tal como figura en el banco")

PAISES = {
    "COP": {
        "pais": "Colombia",
        "bandera": "co",
        "campos": [
            _campo("banco", "Banco", ayuda="Bancolombia, Davivienda, Nequi..."),
            _TITULAR,
            _campo("tipo_documento", "Tipo de documento", tipo="select",
                   opciones=["CC", "CE", "NIT", "PEP"]),
            _campo("documento", "Numero de documento"),
            _campo("tipo_cuenta", "Tipo de cuenta", tipo="select",
                   opciones=["Ahorros", "Corriente"]),
            _campo("numero", "Numero de cuenta"),
        ],
    },
    "USD": {
        "pais": "Estados Unidos",
        "bandera": "us",
        "campos": [
            _campo("banco", "Banco"),
            _TITULAR,
            _campo("routing", "Routing number (ABA)", ayuda="9 digitos"),
            _campo("numero", "Account number"),
            _campo("tipo_cuenta", "Tipo de cuenta", tipo="select",
                   opciones=["Checking", "Savings"]),
            _campo("zelle", "Zelle (opcional)", requerido=False,
                   ayuda="Correo o telefono, si tambien recibes por Zelle"),
            _campo("direccion", "Direccion del titular", requerido=False,
                   ayuda="Algunos bancos la exigen para transferencias internacionales"),
        ],
    },
    "EUR": {
        "pais": "EURO",
        "bandera": "eu",
        "campos": [
            _campo("banco", "Banco"),
            _TITULAR,
            _campo("iban", "IBAN", ayuda="ES + 22 digitos"),
            _campo("bic", "BIC / SWIFT", requerido=False,
                   ayuda="Solo hace falta para transferencias desde fuera de la zona SEPA"),
        ],
    },
    "PEN": {
        "pais": "Peru",
        "bandera": "pe",
        "campos": [
            _campo("banco", "Banco", ayuda="BCP, Interbank, BBVA..."),
            _TITULAR,
            _campo("tipo_documento", "Tipo de documento", tipo="select",
                   opciones=["DNI", "CE", "RUC"]),
            _campo("documento", "Numero de documento"),
            _campo("tipo_cuenta", "Tipo de cuenta", tipo="select",
                   opciones=["Ahorros", "Corriente"]),
            _campo("numero", "Numero de cuenta"),
            _campo("cci", "CCI (codigo interbancario)", requerido=False,
                   ayuda="20 digitos. Hace falta si te transfieren desde otro banco"),
        ],
    },
    "BRL": {
        "pais": "Brasil",
        "bandera": "br",
        "campos": [
            _campo("tipo_chave", "Tipo de chave PIX", tipo="select",
                   opciones=["CPF", "CNPJ", "E-mail", "Telefone", "Aleatoria"]),
            _campo("chave", "Chave PIX"),
            _TITULAR,
            _campo("documento", "CPF / CNPJ"),
            _campo("banco", "Banco", requerido=False),
            _campo("agencia", "Agencia", requerido=False),
            _campo("conta", "Conta", requerido=False),
        ],
    },
    "CLP": {
        "pais": "Chile",
        "bandera": "cl",
        "campos": [
            _campo("banco", "Banco", ayuda="Banco de Chile, BancoEstado, BCI, Santander..."),
            _TITULAR,
            _campo("documento", "RUT del titular", ayuda="12.345.678-5"),
            _campo("tipo_cuenta", "Tipo de cuenta", tipo="select",
                   opciones=["Cuenta Corriente", "Cuenta Vista", "Cuenta de Ahorro", "Chequera Electronica"]),
            _campo("numero", "Numero de cuenta"),
            _campo("correo", "Correo para el comprobante", requerido=False,
                   ayuda="Muchos bancos chilenos lo piden al transferir"),
        ],
    },
    "MXN": {
        "pais": "Mexico",
        "bandera": "mx",
        "campos": [
            _campo("banco", "Banco", ayuda="BBVA, Banorte, Santander..."),
            _TITULAR,
            _campo("numero", "CLABE interbancaria", ayuda="18 digitos"),
            _campo("tarjeta", "Numero de tarjeta (opcional)", requerido=False,
                   ayuda="16 digitos, si tambien recibes por tarjeta"),
        ],
    },
    "ARS": {
        "pais": "Argentina",
        "bandera": "ar",
        "campos": [
            _campo("banco", "Banco o billetera", ayuda="Galicia, Santander, Mercado Pago..."),
            _TITULAR,
            _campo("documento", "CUIT / CUIL"),
            _campo("numero", "CBU / CVU", ayuda="22 digitos"),
            _campo("alias", "Alias", requerido=False, ayuda="Mas facil de teclear que el CBU"),
        ],
    },
    "CAD": {
        "pais": "Canada",
        "bandera": "ca",
        "campos": [
            _campo("banco", "Banco"),
            _TITULAR,
            _campo("institution", "Institution number", ayuda="3 digitos"),
            _campo("transit", "Transit number", ayuda="5 digitos"),
            _campo("numero", "Account number"),
            _campo("interac", "Interac e-Transfer (opcional)", requerido=False,
                   ayuda="Correo al que te mandan el Interac, si lo usas"),
        ],
    },
}

# El dato que el cliente copia y pega en su banco. Cambia por pais: en Espana
# es el IBAN, en Brasil la clave PIX, en EEUU el account number. Se marca aqui
# y no se adivina por el orden del formulario, que se ordena para quien rellena.
PRINCIPAL = {
    "CLP": "numero",
    "MXN": "numero",
    "ARS": "numero",
    "COP": "numero",
    "USD": "numero",
    "EUR": "iban",
    "PEN": "numero",
    "BRL": "chave",
    "CAD": "numero",
}

MONEDAS = tuple(PAISES.keys())


# Paises que no cobran como su moneda sugiere.
#
# El dolar lo usan Ecuador, Estados Unidos y Panama, pero en Estados Unidos
# nadie pide un numero de cuenta para recibir de un particular: se usa Zelle, y
# lo unico que hace falta es el correo (o el telefono) y el nombre del titular.
# Pedir routing y account ahi era pedir datos que nadie iba a usar.
POR_PAIS = {
    "Estados Unidos": {
        "pais": "Estados Unidos",
        "bandera": "us",
        "metodo": "Zelle",
        "principal": "correo",
        "campos": [
            _TITULAR,
            _campo("correo", "Correo de Zelle",
                   ayuda="El correo o telefono con el que recibes el Zelle"),
        ],
    },
}


def ficha(pais: str, moneda: str) -> dict:
    """Que campos pide un pais. El pais manda sobre la moneda."""
    if pais in POR_PAIS:
        return POR_PAIS[pais]
    moneda = (moneda or "").upper()
    if moneda in PAISES:
        return PAISES[moneda]
    info = INFO_KOYWE.get(moneda, {"pais": pais or moneda, "bandera": ""})
    return {**info, "campos": []}


def campo_principal(pais: str, moneda: str) -> str:
    """El dato que el cliente copia y pega: IBAN, clave PIX, correo de Zelle."""
    f = ficha(pais, moneda)
    return f.get("principal") or PRINCIPAL.get((moneda or "").upper(), "numero")


def catalogo_por_pais(db) -> list:
    """Una ficha por pais que puede enviar, con los campos que pide cada uno.

    Sale de la tabla de paises y no de una lista escrita aqui: si manana se da
    de alta uno nuevo, aparece solo en el panel con su formulario.
    """
    from models.country import Country

    salida = []
    for c in (db.query(Country)
              .filter(Country.active == True, Country.can_send == True)
              .order_by(Country.name).all()):
        f = ficha(c.name, c.currency)
        salida.append({
            "pais": c.name,
            "moneda": c.currency,
            "bandera": (c.iso2 or f.get("bandera") or "").lower(),
            "metodo": f.get("metodo"),
            "campos": f.get("campos") or [],
            "koywe": c.currency in CUBIERTAS_POR_KOYWE,
        })
    return salida


def catalogo() -> dict:
    """Que campos pide cada moneda. Lo consume el panel para pintar el form."""
    return PAISES


def _limpiar(datos: dict) -> dict:
    """Deja solo texto, sin espacios sobrantes y sin claves vacias."""
    salida = {}
    for k, v in (datos or {}).items():
        if v is None:
            continue
        v = str(v).strip()
        if v:
            salida[str(k)] = v
    return salida


def validar(pais: str, moneda: str, datos: dict) -> dict:
    """Devuelve los datos limpios o levanta ValueError con el motivo.

    Se descartan las claves que no pertenecen a la moneda: sin esto, cambiar un
    pais por otro en el panel dejaba enganchados los campos del anterior y el
    cliente veia un IBAN al lado de una clave PIX.
    """
    moneda = (moneda or "").upper()
    campos = ficha(pais, moneda).get("campos") or []
    if not campos:
        raise ValueError(f"No se pueden cargar cuentas en {pais or moneda or 'ese pais'}")
    permitidas = {c["clave"] for c in campos}
    limpios = {k: v for k, v in _limpiar(datos).items() if k in permitidas}

    faltan = [c["etiqueta"] for c in campos if c["requerido"] and not limpios.get(c["clave"])]
    if faltan:
        raise ValueError("Falta rellenar: " + ", ".join(faltan))

    for c in campos:
        if c["tipo"] == "select" and limpios.get(c["clave"]):
            if limpios[c["clave"]] not in c["opciones"]:
                raise ValueError(f"{c['etiqueta']}: valor no valido")

    return limpios


def _a_dict(fila: SuperAdminAccount) -> dict:
    try:
        datos = json.loads(fila.datos or "{}")
    except ValueError:
        datos = {}
    info = info_de(fila.currency)
    pais = fila.country or info["pais"]
    f = ficha(pais, fila.currency)
    return {
        "id": fila.id,
        "moneda": fila.currency,
        "pais": pais,
        "bandera": f.get("bandera") or info["bandera"],
        "metodo": f.get("metodo"),
        "alias": fila.alias or "",
        "principal": campo_principal(pais, fila.currency),
        "datos": datos,
        "activa": bool(fila.active),
        "tarjeta": bool(fila.card_enabled),
        "integracion": bool(fila.transfer_integracion),
        "actualizada": fila.updated_at.isoformat() if fila.updated_at else None,
    }


def listar(db: Session, super_admin_id: int) -> list:
    filas = (
        db.query(SuperAdminAccount)
        .filter(SuperAdminAccount.super_admin_id == super_admin_id)
        .all()
    )
    return [_a_dict(f) for f in filas]


def guardar(db: Session, super_admin_id: int, pais: str, moneda: str, datos: dict,
            activa: bool = True, alias: str = "", cuenta_id: int = None) -> dict:
    """Crea una cuenta o actualiza la que se le diga por `cuenta_id`.

    Sin `cuenta_id` siempre crea: un pais puede tener todas las que haga falta,
    y guardar una nueva no debe pisar la que ya estaba.
    """
    moneda = (moneda or "").upper()
    limpios = validar(pais, moneda, datos)

    fila = None
    if cuenta_id:
        fila = (
            db.query(SuperAdminAccount)
            .filter(
                SuperAdminAccount.id == cuenta_id,
                SuperAdminAccount.super_admin_id == super_admin_id,
            )
            .first()
        )
        if not fila:
            raise ValueError("Esa cuenta no existe")

    if not fila:
        fila = SuperAdminAccount(super_admin_id=super_admin_id, currency=moneda, country=pais)
        db.add(fila)

    fila.country = pais
    fila.currency = moneda
    fila.alias = (alias or "").strip()[:80]
    fila.datos = json.dumps(limpios, ensure_ascii=False)
    fila.active = bool(activa)
    db.commit()
    db.refresh(fila)
    return _a_dict(fila)


def borrar_una(db: Session, super_admin_id: int, cuenta_id: int) -> bool:
    """Borra una cuenta concreta. Las demas del pais se quedan."""
    n = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.id == cuenta_id,
            SuperAdminAccount.super_admin_id == super_admin_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return bool(n)


# Toda moneda desde la que se puede enviar. Ahora las nueve tienen ficha
# bancaria: las que cubre Koywe tambien, porque hace falta para poder cobrar la
# transferencia fuera de la integracion.
MONEDAS_ORIGEN = tuple(PAISES.keys())


def info_de(moneda: str) -> dict:
    """Nombre y bandera de una moneda de origen, tenga ficha bancaria o no."""
    moneda = (moneda or "").upper()
    if moneda in PAISES:
        return {"pais": PAISES[moneda]["pais"], "bandera": PAISES[moneda]["bandera"]}
    return INFO_KOYWE.get(moneda, {"pais": moneda, "bandera": ""})


def _filas_del_pais(db: Session, super_admin_id: int, moneda: str, pais: str = None) -> list:
    """Las cuentas de ese pais. Si no hay ninguna, crea una vacia.

    Los dos interruptores —tarjeta e integracion— son del PAIS, no de una
    cuenta: se pueden tener tres bancos en Chile y la tarjeta esta encendida o
    apagada para Chile entero. Por eso se aplican a todas sus filas, y hace
    falta una aunque no haya datos bancarios todavia: apagar la tarjeta en un
    pais donde aun no has cargado cuenta es un caso legitimo.
    """
    q = db.query(SuperAdminAccount).filter(
        SuperAdminAccount.super_admin_id == super_admin_id,
        SuperAdminAccount.currency == moneda,
    )
    if pais:
        q = q.filter(or_(SuperAdminAccount.country == pais,
                         SuperAdminAccount.country == None))
    filas = q.all()
    if not filas:
        fila = SuperAdminAccount(super_admin_id=super_admin_id, currency=moneda,
                                 country=pais, datos="{}")
        db.add(fila)
        db.flush()
        filas = [fila]
    return filas


def set_tarjeta(db: Session, super_admin_id: int, moneda: str, activa: bool,
                pais: str = None) -> dict:
    """Enciende o apaga el pago con tarjeta en un pais.

    No valida los datos bancarios ni los exige: apagar la tarjeta en un pais
    donde todavia no has cargado cuenta es un caso legitimo, y obligar a
    rellenar un IBAN para poder quitar un boton no tiene sentido.
    """
    moneda = (moneda or "").upper()
    if moneda not in MONEDAS_ORIGEN:
        raise ValueError(f"No se puede configurar {moneda or 'esa moneda'}")

    filas = _filas_del_pais(db, super_admin_id, moneda, pais)
    for fila in filas:
        fila.card_enabled = bool(activa)
    db.commit()
    return _a_dict(filas[0])


def set_integracion(db: Session, super_admin_id: int, moneda: str, activa: bool,
                    pais: str = None) -> dict:
    """Cobrar la transferencia por la integracion o a la cuenta propia.

    Apagarla no quita la transferencia: cambia a donde se transfiere. Con la
    integracion, el dinero cae en la cuenta que emite Koywe y el aviso de cobro
    llega solo; libre, el cliente transfiere a tu banco y sube el comprobante,
    que alguien tiene que aprobar a mano.
    """
    moneda = (moneda or "").upper()
    if moneda not in MONEDAS_ORIGEN:
        raise ValueError(f"No se puede configurar {moneda or 'esa moneda'}")

    filas = _filas_del_pais(db, super_admin_id, moneda, pais)
    for fila in filas:
        fila.transfer_integracion = bool(activa)
    db.commit()
    return _a_dict(filas[0])


def usa_integracion(db: Session, super_admin_id: Optional[int], moneda: str) -> bool:
    """Si la transferencia de este pais la cobra la integracion.

    Sin fila, encendida: es como se comportaba antes del interruptor, y
    apagarla por omision dejaria sin cuenta a quien nunca entro a esta pantalla.
    """
    if not super_admin_id:
        return True
    fila = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.super_admin_id == super_admin_id,
            SuperAdminAccount.currency == (moneda or "").upper(),
        )
        .first()
    )
    return True if fila is None else bool(fila.transfer_integracion)


def tarjeta_activa(db: Session, super_admin_id: Optional[int], moneda: str) -> bool:
    """Si a los clientes de este super-admin se les ofrece tarjeta aqui.

    Sin fila, encendido: es como se comportaba antes de que el interruptor
    existiera, y apagar por omision dejaria sin tarjeta a quien nunca entro a
    esta pantalla.
    """
    if not super_admin_id:
        return True
    fila = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.super_admin_id == super_admin_id,
            SuperAdminAccount.currency == (moneda or "").upper(),
        )
        .first()
    )
    return True if fila is None else bool(fila.card_enabled)


def borrar(db: Session, super_admin_id: int, moneda: str) -> bool:
    fila = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.super_admin_id == super_admin_id,
            SuperAdminAccount.currency == (moneda or "").upper(),
        )
        .first()
    )
    if not fila:
        return False
    db.delete(fila)
    db.commit()
    return True


def para_cliente(db: Session, super_admin_id: Optional[int], moneda: str,
                 pais: Optional[str] = None) -> list:
    """Las cuentas que hay que ensenarle a quien va a transferir.

    Devuelve una LISTA: una casa puede tener varias en el mismo pais y el
    cliente elige a cual manda. Vacia si ese super-admin no tiene ninguna, si
    estan apagadas, si les faltan los datos, o si no se sabe de quien es el
    cliente. Quien llama decide que hacer con la lista vacia; hoy significa que
    no se ofrece transferencia.

    `pais` afina cuando varios comparten moneda: quien envia desde Estados
    Unidos tiene que ver el Zelle, no la cuenta de Ecuador.
    """
    if not super_admin_id:
        return []
    moneda = (moneda or "").upper()

    q = db.query(SuperAdminAccount).filter(
        SuperAdminAccount.super_admin_id == super_admin_id,
        SuperAdminAccount.currency == moneda,
        SuperAdminAccount.active == True,
    )
    if pais:
        # Las filas de antes de que existiera la columna no tienen pais: se
        # dejan pasar en vez de esconderlas, que es peor que ensenar una de mas.
        q = q.filter(or_(SuperAdminAccount.country == pais,
                         SuperAdminAccount.country == None))

    salida = []
    for fila in q.order_by(SuperAdminAccount.id).all():
        d = _a_dict(fila)
        if not d["datos"]:
            continue

        # Se manda tambien la etiqueta de cada campo para que el cliente vea
        # "Numero de documento: 12345" y no "documento: 12345".
        campos = ficha(d["pais"], moneda).get("campos") or []
        etiquetas = {c["clave"]: c["etiqueta"] for c in campos}
        salida.append({
            "id": d["id"],
            "moneda": moneda,
            "pais": d["pais"],
            "bandera": d["bandera"],
            "metodo": d["metodo"],
            "alias": d["alias"],
            "origen": "propia",
            "campos": [
                {
                    "etiqueta": etiquetas.get(k, k),
                    "valor": v,
                    "principal": k == d["principal"],
                }
                for k, v in d["datos"].items()
            ],
        })
    return salida
