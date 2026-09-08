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
from typing import Optional

from sqlalchemy.orm import Session

from models.super_admin_account import SuperAdminAccount

# Monedas que Koywe ya cubre con cuenta virtual propia. No se ofrecen aqui:
# tener dos cuentas para la misma moneda solo genera dudas sobre cual usar.
CUBIERTAS_POR_KOYWE = ("MXN", "ARS", "CLP")


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
        "pais": "Espana",
        "bandera": "es",
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
    "COP": "numero",
    "USD": "numero",
    "EUR": "iban",
    "PEN": "numero",
    "BRL": "chave",
    "CAD": "numero",
}

MONEDAS = tuple(PAISES.keys())


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


def validar(moneda: str, datos: dict) -> dict:
    """Devuelve los datos limpios o levanta ValueError con el motivo.

    Se descartan las claves que no pertenecen a la moneda: sin esto, cambiar un
    pais por otro en el panel dejaba enganchados los campos del anterior y el
    cliente veia un IBAN al lado de una clave PIX.
    """
    moneda = (moneda or "").upper()
    if moneda not in PAISES:
        raise ValueError(f"No se pueden cargar cuentas en {moneda or 'esa moneda'}")

    campos = PAISES[moneda]["campos"]
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
    info = PAISES.get(fila.currency, {})
    return {
        "moneda": fila.currency,
        "pais": info.get("pais", fila.currency),
        "bandera": info.get("bandera", ""),
        "datos": datos,
        "activa": bool(fila.active),
        "tarjeta": bool(fila.card_enabled),
        "actualizada": fila.updated_at.isoformat() if fila.updated_at else None,
    }


def listar(db: Session, super_admin_id: int) -> list:
    filas = (
        db.query(SuperAdminAccount)
        .filter(SuperAdminAccount.super_admin_id == super_admin_id)
        .all()
    )
    return [_a_dict(f) for f in filas]


def guardar(db: Session, super_admin_id: int, moneda: str, datos: dict, activa: bool = True) -> dict:
    moneda = (moneda or "").upper()
    limpios = validar(moneda, datos)

    fila = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.super_admin_id == super_admin_id,
            SuperAdminAccount.currency == moneda,
        )
        .first()
    )
    if not fila:
        fila = SuperAdminAccount(super_admin_id=super_admin_id, currency=moneda)
        db.add(fila)

    fila.datos = json.dumps(limpios, ensure_ascii=False)
    fila.active = bool(activa)
    db.commit()
    db.refresh(fila)
    return _a_dict(fila)


def set_tarjeta(db: Session, super_admin_id: int, moneda: str, activa: bool) -> dict:
    """Enciende o apaga el pago con tarjeta en un pais.

    No valida los datos bancarios ni los exige: apagar la tarjeta en un pais
    donde todavia no has cargado cuenta es un caso legitimo, y obligar a
    rellenar un IBAN para poder quitar un boton no tiene sentido.
    """
    moneda = (moneda or "").upper()
    if moneda not in PAISES:
        raise ValueError(f"No se puede configurar {moneda or 'esa moneda'}")

    fila = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.super_admin_id == super_admin_id,
            SuperAdminAccount.currency == moneda,
        )
        .first()
    )
    if not fila:
        fila = SuperAdminAccount(super_admin_id=super_admin_id, currency=moneda, datos="{}")
        db.add(fila)

    fila.card_enabled = bool(activa)
    db.commit()
    db.refresh(fila)
    return _a_dict(fila)


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


def para_cliente(db: Session, super_admin_id: Optional[int], moneda: str) -> Optional[dict]:
    """La cuenta que hay que ensenarle a quien va a transferir.

    Devuelve None si ese super-admin no tiene cuenta en esa moneda, si la tiene
    apagada, o si no se sabe de quien es el cliente. Quien llama decide que
    hacer con el None; hoy significa que no se ofrece transferencia.
    """
    if not super_admin_id:
        return None
    moneda = (moneda or "").upper()
    if moneda not in PAISES:
        return None

    fila = (
        db.query(SuperAdminAccount)
        .filter(
            SuperAdminAccount.super_admin_id == super_admin_id,
            SuperAdminAccount.currency == moneda,
            SuperAdminAccount.active == True,
        )
        .first()
    )
    if not fila:
        return None

    d = _a_dict(fila)
    if not d["datos"]:
        return None

    # Se manda tambien la etiqueta de cada campo para que el cliente vea
    # "Numero de documento: 12345" y no "documento: 12345".
    etiquetas = {c["clave"]: c["etiqueta"] for c in PAISES[moneda]["campos"]}
    return {
        "moneda": moneda,
        "pais": d["pais"],
        "bandera": d["bandera"],
        "origen": "propia",
        "campos": [
            {
                "etiqueta": etiquetas.get(k, k),
                "valor": v,
                "principal": k == PRINCIPAL.get(moneda),
            }
            for k, v in d["datos"].items()
        ],
    }
