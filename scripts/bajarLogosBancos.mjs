// Baja el logo de cada banco a `frontend/public/bancos/`.
//
// Se ejecuta a mano, no en cada build: los logos de los bancos cambian cada
// muchos años y bajarlos al desplegar añadiría una dependencia de red a algo
// que hoy no la tiene.
//
// Por qué guardarlos en vez de pedirlos al vuelo a un servicio de iconos:
// hacerlo al vuelo le contaría a un tercero a qué banco va cada transferencia,
// y dejaría la lista sin logos en la aplicación instalada cuando no hay
// conexión.
//
// Deja además `logosBancosArchivos.json` con los que consiguió, para que el
// front pida solo los que existen de verdad y sepa de qué formato es cada uno
// —hay bancos cuyo logo solo aparece en SVG—. Los que no salen se dibujan con
// su monograma, que es una respuesta perfectamente válida y no un error.
//
//   node scripts/bajarLogosBancos.mjs
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const front = join(aqui, '..', 'frontend')
const destino = join(front, 'public', 'bancos')

// Los dominios salen del propio mapa del front, para que no haya dos listas
// que mantener en paralelo.
const fuente = await readFile(join(front, 'src', 'utils', 'logosBancos.js'), 'utf8')
const dominios = [...new Set([...fuente.matchAll(/'([a-z0-9.%-]+\.[a-z]{2,}(?:\.[a-z]{2})?)'/g)].map(m => m[1]))]

await mkdir(destino, { recursive: true })

// Varias fuentes, porque ninguna las tiene todas: Google no conoce la mitad de
// los bancos venezolanos y bolivianos, y unavatar sí, pero a veces solo en SVG
// o en ICO.
const FUENTES = [
  // El propio banco, primero: el icono que se pone para la pantalla de inicio
  // del iPhone es el logo grande y limpio, mejor que cualquier miniatura.
  d => `https://${d}/apple-touch-icon.png`,
  d => `https://www.${d}/apple-touch-icon.png`,
  d => `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
  d => `https://unavatar.io/${d}?fallback=false`,
  d => `https://icons.duckduckgo.com/ip3/${d}.ico`,
]

// Qué es lo que llegó, mirando los primeros bytes y no el nombre del archivo:
// todas estas fuentes mienten sobre la extensión.
function formato(b) {
  if (b.length < 12) return null
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'webp'
  const cabeza = b.slice(0, 300).toString('utf8').trimStart().toLowerCase()
  if (cabeza.startsWith('<?xml') || cabeza.startsWith('<svg')) return 'svg'
  return null   // ICO y demás: no se puede servir tal cual, mejor el monograma
}

// Un .ico moderno suele llevar un PNG dentro; si está, se rescata.
function pngDentroDelIco(b) {
  const i = b.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  return i > 0 ? b.slice(i) : null
}

const archivos = {}
const mal = []

for (const d of dominios) {
  let guardado = false
  for (const url of FUENTES) {
    try {
      // Sin navegador declarado, unos cuantos bancos responden con un
      // bloqueo antibot en vez del icono.
      const r = await fetch(url(d), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36' },
        redirect: 'follow',
        // Varios bancos dejan la conexión abierta sin responder nunca. Sin
        // este corte, el script se queda colgado en uno solo.
        signal: AbortSignal.timeout(7000),
      })
      if (!r.ok) continue        // un 404 devuelve igualmente un icono genérico
      let buf = Buffer.from(await r.arrayBuffer())
      // El icono de "no encontrado" son unos cientos de bytes.
      if (buf.length < 500) continue

      let tipo = formato(buf)
      if (!tipo) {
        const dentro = pngDentroDelIco(buf)
        if (!dentro) continue
        buf = dentro
        tipo = 'png'
      }

      await writeFile(join(destino, `${d}.${tipo}`), buf)
      archivos[d] = `${d}.${tipo}`
      guardado = true
      break
    } catch { /* se prueba la siguiente fuente */ }
  }
  if (!guardado) mal.push(d)
}

await writeFile(
  join(front, 'src', 'utils', 'logosBancosArchivos.json'),
  JSON.stringify(Object.fromEntries(Object.entries(archivos).sort()), null, 2) + '\n',
  'utf8',
)

console.log(`logos guardados: ${Object.keys(archivos).length} de ${dominios.length}`)
if (mal.length) console.log('sin logo (saldrá el monograma):', mal.join(', '))
