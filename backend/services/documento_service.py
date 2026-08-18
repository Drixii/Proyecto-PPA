"""Validación de documentos de identidad, sin depender de nadie.

Qué comprueba esto y qué no
----------------------------
Varios países calculan el último carácter del documento a partir de los
anteriores. Si no cuadra, el número no existe — y eso se sabe con aritmética,
gratis y al instante, sin llamar a ningún servicio.

Lo que SÍ detecta: números inventados y, sobre todo, **erratas**. Las erratas
importan más de lo que parece: si alguien escribe mal un dígito, el sistema
cree que es otra persona, y las comprobaciones que dependen del documento
—una cuenta por persona, detectar quién recibe de mucha gente— dejan de
funcionar en silencio.

Lo que NO detecta: un documento real que pertenece a otra persona. Para eso
hace falta verificación de identidad con el registro civil, que es un servicio
externo y de pago. Esto es un filtro barato, no una prueba de identidad.

Donde no hay dígito verificador (cédula colombiana, DNI argentino o peruano)
solo se comprueba el formato: largo y que sean dígitos. Es poco, pero atrapa
el "123" y el teléfono escrito en la casilla equivocada.
"""
import re


def _solo_digitos(valor: str) -> str:
    return re.sub(r"\D", "", valor or "")


# ── Chile: RUT ───────────────────────────────────────────────────────────────

def _dv_rut(numero: str) -> str:
    """Dígito verificador del RUT (módulo 11, multiplicadores 2..7 cíclicos)."""
    suma, factor = 0, 2
    for d in reversed(numero):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    if resto == 11:
        return "0"
    if resto == 10:
        return "K"
    return str(resto)


def valida_rut(valor: str) -> bool:
    limpio = re.sub(r"[.\s-]", "", valor or "").upper()
    if not re.fullmatch(r"\d{7,8}[0-9K]", limpio):
        return False
    return _dv_rut(limpio[:-1]) == limpio[-1]


def formatea_rut(valor: str) -> str:
    """12345678K → 12.345.678-K. Se guarda así para que dos escrituras del
    mismo RUT no parezcan documentos distintos."""
    limpio = re.sub(r"[.\s-]", "", valor or "").upper()
    cuerpo, dv = limpio[:-1], limpio[-1]
    partes = []
    while len(cuerpo) > 3:
        partes.insert(0, cuerpo[-3:])
        cuerpo = cuerpo[:-3]
    partes.insert(0, cuerpo)
    return ".".join(partes) + "-" + dv


# ── Brasil: CPF ──────────────────────────────────────────────────────────────

def valida_cpf(valor: str) -> bool:
    n = _solo_digitos(valor)
    if len(n) != 11 or n == n[0] * 11:
        return False
    for largo in (9, 10):
        suma = sum(int(n[i]) * (largo + 1 - i) for i in range(largo))
        dv = (suma * 10) % 11
        dv = 0 if dv == 10 else dv
        if dv != int(n[largo]):
            return False
    return True


# ── Argentina: CUIT / CUIL ───────────────────────────────────────────────────

def valida_cuit(valor: str) -> bool:
    n = _solo_digitos(valor)
    if len(n) != 11:
        return False
    pesos = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    suma = sum(int(n[i]) * pesos[i] for i in range(10))
    resto = 11 - (suma % 11)
    dv = 0 if resto == 11 else (9 if resto == 10 else resto)
    return dv == int(n[10])


# ── Colombia: NIT ────────────────────────────────────────────────────────────

def valida_nit(valor: str) -> bool:
    n = _solo_digitos(valor)
    if not 8 <= len(n) <= 16:
        return False
    pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    cuerpo, dv = n[:-1], int(n[-1])
    suma = sum(int(d) * pesos[i] for i, d in enumerate(reversed(cuerpo)))
    resto = suma % 11
    esperado = 0 if resto in (0, 1) else 11 - resto
    return esperado == dv


# ── Solo formato ─────────────────────────────────────────────────────────────

def _solo_largo(minimo: int, maximo: int):
    def comprobar(valor: str) -> bool:
        n = _solo_digitos(valor)
        return minimo <= len(n) <= maximo
    return comprobar


# Un tipo de documento por país. La clave es el código que ya usa Koywe, para
# no tener dos vocabularios distintos para lo mismo.
DOCUMENTOS = {
    "RUT":     {"nombre": "RUT",                     "paises": ["CL"], "valida": valida_rut,          "ejemplo": "12.345.678-5"},
    "CPF":     {"nombre": "CPF",                     "paises": ["BR"], "valida": valida_cpf,          "ejemplo": "111.444.777-35"},
    "CUIT":    {"nombre": "CUIT",                    "paises": ["AR"], "valida": valida_cuit,         "ejemplo": "20-12345678-6"},
    "CUIL":    {"nombre": "CUIL",                    "paises": ["AR"], "valida": valida_cuit,         "ejemplo": "20-12345678-6"},
    "NIT":     {"nombre": "NIT",                     "paises": ["CO"], "valida": valida_nit,          "ejemplo": "900123456-8"},
    "CED_CIU": {"nombre": "Cédula de ciudadanía",    "paises": ["CO", "BO", "EC"], "valida": _solo_largo(6, 12),  "ejemplo": "1023456789"},
    "CED_EXT": {"nombre": "Cédula de extranjería",   "paises": ["CO"], "valida": _solo_largo(6, 12),  "ejemplo": "123456"},
    "DNI":     {"nombre": "DNI",                     "paises": ["AR", "PE"], "valida": _solo_largo(7, 9), "ejemplo": "12345678"},
    "CURP":    {"nombre": "CURP",                    "paises": ["MX"], "valida": lambda v: bool(re.fullmatch(r"[A-Z0-9]{18}", (v or "").upper().replace(" ", ""))), "ejemplo": "ABCD123456HDFXYZ01"},
    "RFC":     {"nombre": "RFC",                     "paises": ["MX"], "valida": lambda v: bool(re.fullmatch(r"[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}", (v or "").upper().replace(" ", ""))), "ejemplo": "ABC123456XYZ"},
    "PP":      {"nombre": "Pasaporte",               "paises": ["*"],  "valida": lambda v: bool(re.fullmatch(r"[A-Z0-9]{5,12}", (v or "").upper().replace(" ", ""))), "ejemplo": "AB123456"},
}

# Los que además de formato comprueban aritmética. Se distingue para poder
# decirle al cliente "ese RUT no existe" con certeza, y no decírselo cuando
# solo se ha mirado el largo.
CON_VERIFICADOR = {"RUT", "CPF", "CUIT", "CUIL", "NIT"}


def tipos_de_pais(iso2: str) -> list:
    """Documentos que se le ofrecen a alguien de ese país."""
    iso2 = (iso2 or "").upper()
    salida = []
    for codigo, cfg in DOCUMENTOS.items():
        if iso2 in cfg["paises"] or cfg["paises"] == ["*"]:
            salida.append({
                "codigo": codigo,
                "nombre": cfg["nombre"],
                "ejemplo": cfg["ejemplo"],
                "verificado": codigo in CON_VERIFICADOR,
            })
    return salida


def normaliza(tipo: str, numero: str) -> str:
    """Forma canónica en la que se guarda.

    Sin esto "12345678-5", "12.345.678-5" y "123456785" serían tres documentos
    distintos, y la regla de una cuenta por persona se esquivaría escribiendo
    el mismo número con otros puntos.
    """
    tipo = (tipo or "").upper()
    if tipo == "RUT":
        limpio = re.sub(r"[.\s-]", "", numero or "").upper()
        return formatea_rut(limpio) if len(limpio) >= 8 else limpio
    if tipo in ("CURP", "RFC", "PP"):
        return re.sub(r"[\s-]", "", numero or "").upper()
    return _solo_digitos(numero)


def valida(tipo: str, numero: str) -> tuple[bool, str]:
    """(es_válido, motivo). El motivo va vacío si todo está bien."""
    tipo = (tipo or "").upper().strip()
    cfg = DOCUMENTOS.get(tipo)
    if not cfg:
        return False, "Tipo de documento no reconocido"

    numero = (numero or "").strip()
    if not numero:
        return False, "Falta el número de documento"

    if not cfg["valida"](numero):
        if tipo in CON_VERIFICADOR:
            return False, f"Ese {cfg['nombre']} no es válido — revisa el número"
        return False, f"El formato del {cfg['nombre']} no parece correcto (ej: {cfg['ejemplo']})"

    return True, ""
