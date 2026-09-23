// Lee de un texto pegado los datos de quien recibe.
//
// El cliente casi nunca escribe los datos: se los pasan por WhatsApp y él los
// copia. Antes tenía que ir campo por campo, y ahí es donde se cuela un dígito
// de menos en la cuenta y el dinero acaba en otra parte.
//
// Esto NO adivina a lo loco: lo que reconoce se enseña antes de rellenar nada,
// y lo que no reconoce se deja en blanco. Es mejor que falte un campo a que
// aparezca uno equivocado con pinta de correcto.
//
// Dos pasadas. Primero por etiqueta —"Banco:", "Cédula:", "Cuenta:"—, que es
// como la gente escribe de verdad estos mensajes. Después, para lo que quedó
// suelto, por la forma del dato: un RUT no se parece a un número de cuenta, y
// una cuenta venezolana son veinte dígitos exactos.

const ETIQUETAS = {
  banco: ['banco', 'bank', 'entidad', 'banco destino', 'institucion', 'institución'],
  cuenta: ['cuenta', 'nro cuenta', 'n° cuenta', 'numero de cuenta', 'número de cuenta',
    'cta', 'account', 'clabe', 'iban', 'cci', 'no. cuenta', 'nro. cuenta'],
  documento: ['cedula', 'cédula', 'ci', 'c.i', 'cc', 'ce', 'rut', 'dni', 'documento',
    'cpf', 'curp', 'rfc', 'nit', 'cuit', 'cuil', 'identificacion', 'identificación',
    'id', 'pasaporte', 'passport'],
  nombre: ['nombre', 'titular', 'beneficiario', 'a nombre de', 'destinatario', 'name'],
  telefono: ['telefono', 'teléfono', 'celular', 'movil', 'móvil', 'phone', 'pago movil',
    'pago móvil', 'whatsapp'],
  tipoCuenta: ['tipo de cuenta', 'tipo cuenta', 'tipo'],
  llave: ['llave', 'llave bre-b', 'bre-b', 'breb', 'key'],
  correo: ['correo', 'email', 'e-mail', 'mail', 'correo electronico', 'correo electrónico'],
}

// Los primeros cuatro dígitos de una cuenta venezolana dicen el banco. Sirve
// para dos cosas: reconocerlo sin que lo escriban, y avisar cuando el nombre
// escrito no cuadra con el número.
const BANCOS_VE = {
  '0102': 'Banco de Venezuela', '0104': 'Venezolano de Crédito', '0105': 'Mercantil',
  '0108': 'Provincial', '0114': 'Bancaribe', '0115': 'Exterior', '0116': 'Occidental de Descuento',
  '0128': 'Banco Caroní', '0134': 'Banesco', '0137': 'Sofitasa', '0138': 'Banco Plaza',
  '0151': 'BFC Banco Fondo Común', '0156': '100% Banco', '0163': 'Banco del Tesoro',
  '0168': 'Bancrecer', '0169': 'Mi Banco', '0171': 'Banco Activo', '0172': 'Bancamiga',
  '0174': 'Banplus', '0175': 'Banco Bicentenario', '0177': 'Banfanb', '0191': 'BNC Nacional de Crédito',
}

// Cómo se llama el documento según la etiqueta que usaron. Sin esto, un
// "Pasaporte: 5001307641" colombiano se guardaba como cédula solo porque tiene
// diez dígitos.
const TIPO_POR_ETIQUETA = {
  pasaporte: 'Pasaporte', passport: 'Pasaporte',
  cc: 'Cédula de Ciudadanía', ce: 'Cédula de Extranjería',
  nit: 'NIT', rut: 'RUT', dni: 'DNI', cpf: 'CPF', curp: 'CURP', rfc: 'RFC',
  ci: 'Cédula', 'c.i': 'Cédula', cedula: 'Cédula', 'cédula': 'Cédula',
}

// "CA" es caja de ahorro y "CC" cuenta corriente en Bolivia; en Colombia se
// escribe "Ahorros" o "Corriente" a secas, en una línea suelta.
const TIPOS_CUENTA = [
  [/\b(ca|caja de ahorro|ahorros?|savings)\b/i, 'Ahorros'],
  [/\b(cc|cta cte|cuenta corriente|corriente|checking)\b/i, 'Corriente'],
  [/\b(vista|cuenta vista)\b/i, 'Vista'],
]

// Billeteras donde el "número de cuenta" ES el celular: diez dígitos junto a
// Nequi no son un teléfono de contacto, son la cuenta.
const CUENTA_ES_CELULAR = ['nequi', 'daviplata', 'movii', 'rappipay', 'yape', 'plin',
  'tigo money', 'mercado pago', 'uala', 'yappy', 'sinpe', 'pago movil', 'deuna',
  'tenpo', 'prex']

const limpia = t => String(t || '').replace(/\s+/g, ' ').trim()
const soloDigitos = t => String(t || '').replace(/\D/g, '')

function sinAcentos(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// ¿Esta línea empieza por alguna etiqueta conocida?
//
// Con dos puntos o sin ellos: mucha gente escribe "ci 18965321" o "cuenta
// 0102…" a secas, y exigir el separador dejaba fuera justo esos casos.
function partePorEtiqueta(linea) {
  const bruto = linea.replace(/^[-•*\s]+/, '')
  const corte = bruto.search(/[:=]/)

  if (corte === -1) {
    const sinSigno = sinAcentos(bruto)
    for (const [campo, nombres] of Object.entries(ETIQUETAS)) {
      for (const n of nombres) {
        const etiqueta = sinAcentos(n)
        if (sinSigno.startsWith(etiqueta + ' ')) {
          const valor = limpia(bruto.slice(etiqueta.length))
          if (valor) return { campo, valor, etiqueta }
        }
      }
    }
    return null
  }

  const izquierda = sinAcentos(bruto.slice(0, corte)).replace(/[^a-z0-9°. ]/g, '').trim()
  const derecha = limpia(bruto.slice(corte + 1))
  if (!derecha) return null

  for (const [campo, nombres] of Object.entries(ETIQUETAS)) {
    const usada = nombres.find(n => izquierda === sinAcentos(n) || izquierda.startsWith(sinAcentos(n) + ' ') || izquierda.endsWith(' ' + sinAcentos(n)))
    if (usada) return { campo, valor: derecha, etiqueta: sinAcentos(usada) }
  }
  return null
}

// Un documento suelto, según el país de destino.
function pareceDocumento(texto, pais) {
  const t = limpia(texto).toUpperCase()

  // Venezuela: V-12345678, E-, J-, G-
  const ve = t.match(/\b([VEJGP])[-\s.]?(\d[\d.\s]{5,10}\d)\b/)
  if (ve) return { valor: `${ve[1]}-${soloDigitos(ve[2])}`, tipo: 'Cédula' }

  // Chile: RUT con dígito verificador
  const rut = t.match(/\b(\d{1,3}(?:\.\d{3}){2}|\d{7,8})[-\s]?([\dK])\b/)
  if (rut && (pais === 'Chile' || /RUT/.test(t))) {
    return { valor: `${soloDigitos(rut[1])}-${rut[2]}`, tipo: 'RUT' }
  }

  // Brasil: CPF
  const cpf = t.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/)
  if (cpf) return { valor: cpf[1], tipo: 'CPF' }

  // Cédulas que son solo dígitos. Hace falta el país para no confundirlas con
  // un número de cuenta: los largos se solapan y sin saber a dónde va el envío
  // no hay forma de distinguirlas.
  const sueltos = soloDigitos(t)
  const porPais = {
    'Venezuela': [6, 9, 'Cédula'],
    'Colombia': [6, 10, 'Cédula de Ciudadanía'],
    'Perú': [8, 8, 'DNI'],
    'Ecuador': [10, 10, 'Cédula'],
    'Bolivia': [5, 10, 'Cédula'],
    'Argentina': [7, 8, 'DNI'],
  }[pais]
  if (porPais && sueltos.length >= porPais[0] && sueltos.length <= porPais[1]) {
    return { valor: sueltos, tipo: porPais[2] }
  }

  return null
}

// Un número de cuenta suelto. Cada país tiene su forma, y eso es justo lo que
// permite no confundirlo con un documento o un teléfono.
function pareceCuenta(texto, pais) {
  const t = limpia(texto).toUpperCase()

  const iban = t.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,26})\b/)
  if (iban) return iban[1]

  const digitos = soloDigitos(t)
  if (!digitos) return null

  if (pais === 'Venezuela') return digitos.length === 20 ? digitos : null
  if (pais === 'México') return digitos.length === 18 ? digitos : null
  if (pais === 'Perú') return digitos.length === 20 || digitos.length === 14 ? digitos : null
  if (pais === 'Colombia') return digitos.length >= 9 && digitos.length <= 12 ? digitos : null
  if (pais === 'Chile') return digitos.length >= 8 && digitos.length <= 12 ? digitos : null

  return digitos.length >= 8 && digitos.length <= 26 ? digitos : null
}

function pareceTelefono(texto) {
  const t = limpia(texto)
  const m = t.match(/(\+?\d[\d\s().-]{7,16}\d)/)
  if (!m) return null
  const d = soloDigitos(m[1])
  return d.length >= 8 && d.length <= 13 ? m[1].trim() : null
}

function pareceNombre(linea) {
  const t = limpia(linea)
  if (!t || /\d/.test(t)) return null
  const palabras = t.split(' ').filter(Boolean)
  if (palabras.length < 2 || palabras.length > 5) return null
  if (t.length > 60) return null
  // Que parezca un nombre y no una frase: todas las palabras con letras.
  if (!palabras.every(p => /^[a-záéíóúñü'.-]+$/i.test(p))) return null
  return t
}

/** Busca el banco en el catálogo del país, tolerando cómo lo escribe la gente. */
export function buscaBanco(texto, bancos) {
  const t = sinAcentos(texto).replace(/\b(banco|bco|bank|banc)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').trim()
  if (!t || !bancos?.length) return null

  for (const b of bancos) {
    const n = sinAcentos(b.name).replace(/\b(banco|bco|bank|banc)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').trim()
    if (!n) continue
    if (t === n || t.includes(n) || n.includes(t)) return b
  }

  // Última pasada: por palabra suelta con al menos cuatro letras, que evita que
  // "banco de" cuadre con cualquier cosa.
  const palabras = t.split(' ').filter(p => p.length >= 4)
  for (const b of bancos) {
    const n = sinAcentos(b.name)
    if (palabras.some(p => n.includes(p))) return b
  }
  return null
}

/** Lo que se pudo entender del texto pegado. Lo que no, viene vacío. */
export function leeDatosBancarios(texto, { pais, bancos = [] } = {}) {
  const lineas = String(texto || '').split(/[\n\r]+/).map(limpia).filter(Boolean)
  if (!lineas.length) return null

  const out = {
    nombre: '', banco: null, bancoTexto: '', cuenta: '', documento: '',
    tipoDocumento: '', tipoCuenta: '', telefono: '', llave: '', correo: '', aviso: '',
  }
  const sueltas = []

  for (const linea of lineas) {
    const p = partePorEtiqueta(linea)
    if (!p) { sueltas.push(linea); continue }

    if (p.campo === 'banco' && !out.bancoTexto) out.bancoTexto = p.valor
    else if (p.campo === 'cuenta') {
      // "Cuenta Corriente" empieza por la palabra "cuenta", pero lo que sigue
      // no es un número: es el tipo. Se guardaba "Corriente" como número de
      // cuenta y el número de verdad, que venía en la línea siguiente, ya no
      // entraba porque el campo estaba ocupado.
      const tipo = TIPOS_CUENTA.find(([re]) => re.test(p.valor))
      if (tipo && !out.tipoCuenta) out.tipoCuenta = tipo[1]

      const hayNumero = soloDigitos(p.valor).length >= 6
      if (!out.cuenta && (hayNumero || !tipo)) {
        out.cuenta = pareceCuenta(p.valor, pais) || soloDigitos(p.valor) || p.valor
      }
    }
    else if (p.campo === 'nombre' && !out.nombre) out.nombre = p.valor
    else if (p.campo === 'llave' && !out.llave) out.llave = p.valor
    else if (p.campo === 'tipoCuenta' && !out.tipoCuenta) {
      const t = TIPOS_CUENTA.find(([re]) => re.test(p.valor))
      out.tipoCuenta = t ? t[1] : p.valor
    }
    else if (p.campo === 'correo' && !out.correo) out.correo = p.valor.trim()
    else if (p.campo === 'telefono' && !out.telefono) out.telefono = pareceTelefono(p.valor) || p.valor
    else if (p.campo === 'documento' && !out.documento) {
      const d = pareceDocumento(p.valor, pais) || pareceDocumento(linea, pais)
      out.documento = d ? d.valor : limpia(p.valor)
      // El tipo lo dice la etiqueta, no el largo del número: un "Pasaporte:
      // 5001307641" colombiano tiene diez dígitos igual que una cédula, y
      // guardarlo como cédula manda el pago con el documento equivocado.
      out.tipoDocumento = TIPO_POR_ETIQUETA[p.etiqueta] || d?.tipo || ''
    }
  }

  // El banco antes que nada del resto: si es una billetera, un número de diez
  // dígitos deja de ser un teléfono y pasa a ser la cuenta.
  if (!out.bancoTexto) {
    for (const linea of sueltas) {
      const b = buscaBanco(linea, bancos)
      if (b) { out.bancoTexto = linea; out.banco = b; break }
    }
  }
  const esBilletera = CUENTA_ES_CELULAR.some(w => sinAcentos(out.banco?.name || out.bancoTexto || '').includes(w))

  // Segunda pasada: lo que quedó sin etiqueta, por su forma.
  for (const linea of sueltas) {
    if (linea === out.bancoTexto) continue

    if (!out.correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linea)) {
      out.correo = linea
      continue
    }

    // Una línea que solo dice "Ahorros" o "CA": es el tipo de cuenta.
    if (!out.tipoCuenta) {
      const soloTipo = TIPOS_CUENTA.find(([re]) => re.test(limpia(linea)))
      if (soloTipo && limpia(linea).replace(/[^a-záéíóúñ ]/gi, '').trim().length <= 20) {
        out.tipoCuenta = soloTipo[1]
        // "CA 1311450370" lleva el tipo Y el número en la misma línea.
        const resto = soloDigitos(linea)
        if (!out.cuenta && resto.length >= 6) out.cuenta = resto
        continue
      }
    }

    // En Nequi o Daviplata el celular ES la cuenta.
    if (esBilletera && !out.cuenta) {
      const d = soloDigitos(linea)
      if (d.length === 10 && limpia(linea).length <= 14) { out.cuenta = d; continue }
    }

    if (!out.documento) {
      const d = pareceDocumento(linea, pais)
      if (d) { out.documento = d.valor; out.tipoDocumento = d.tipo; continue }
    }
    if (!out.cuenta) {
      const c = pareceCuenta(linea, pais)
      // Un número de 8 dígitos podría ser un teléfono: si la línea lo dice, se
      // respeta esa lectura.
      if (c && !/tel|cel|movil|móvil|whats/i.test(linea)) { out.cuenta = c; continue }
    }
    if (!out.telefono) {
      const t = pareceTelefono(linea)
      if (t && /tel|cel|movil|móvil|whats|^\+/i.test(linea)) { out.telefono = t; continue }
    }
    if (!out.bancoTexto) {
      const b = buscaBanco(linea, bancos)
      if (b) { out.bancoTexto = linea; out.banco = b; continue }
    }
    if (!out.nombre) {
      const n = pareceNombre(linea)
      if (n) { out.nombre = n; continue }
    }
  }

  if (!out.banco && out.bancoTexto) out.banco = buscaBanco(out.bancoTexto, bancos)

  // Venezuela: los cuatro primeros dígitos de la cuenta dicen el banco. Si no
  // cuadra con lo escrito, se avisa en vez de elegir uno por nuestra cuenta.
  if (pais === 'Venezuela' && out.cuenta?.length === 20) {
    const porNumero = BANCOS_VE[out.cuenta.slice(0, 4)]
    if (porNumero) {
      const delNumero = buscaBanco(porNumero, bancos)
      if (!out.banco) out.banco = delNumero
      else if (delNumero && delNumero.id !== out.banco.id) {
        out.aviso = `La cuenta empieza por ${out.cuenta.slice(0, 4)}, que es de ${porNumero}. Comprueba el banco.`
      }
    }
  }

  const encontrados = ['nombre', 'cuenta', 'documento', 'telefono'].filter(k => out[k]).length + (out.banco ? 1 : 0)
  return encontrados >= 2 ? out : null
}
