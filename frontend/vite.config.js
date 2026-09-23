import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Quita los comentarios del CSS escrito dentro de los componentes
// (<style>{`...`}</style>). El minificador borra los comentarios de JavaScript,
// pero estos van dentro de una cadena de texto y llegaban tal cual al bundle y
// al inspector del navegador: notas internas a la vista de cualquiera.
function sinComentariosCss() {
  return {
    name: 'sin-comentarios-css',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.(jsx|tsx)$/.test(id) || !code.includes('<style>{`')) return null
      return code.replace(/<style>\{`([\s\S]*?)`\}<\/style>/g,
        (_, css) => '<style>{`' + css.replace(/\/\*[\s\S]*?\*\//g, '') + '`}</style>')
    },
  }
}

// globe.js vive en public/ y se copia tal cual, sin pasar por el minificador:
// llegaba con espacios y nombres largos. Se minifica la copia de dist.
function minificarGlobo() {
  return {
    name: 'minificar-globo',
    apply: 'build',
    async closeBundle() {
      const { readFile, writeFile } = await import('node:fs/promises')
      const { minify } = await import('terser')
      const ruta = new URL('./dist/globe.js', import.meta.url)
      const fuente = await readFile(ruta, 'utf8')
      const { code } = await minify(fuente, { compress: true, mangle: true })
      await writeFile(ruta, code)
    },
  }
}

// Un archivo con la versión del build, para saber desde la web si hay una
// versión nueva publicada.
//
// Existe porque el ciclo de vida del service worker es difícil de comprobar:
// el aviso de "hay versión nueva" depende de que el navegador decida que un
// worker está «esperando», y eso no se puede provocar ni verificar con
// fiabilidad. Un archivo pequeño que cambia en cada build sí: se pide, se
// compara y ya está.
// La marca de este build. Se calcula UNA vez y va a dos sitios: dentro del
// código (`__BUILD__`) y a `dist/version.json`. Comparar esos dos es lo que
// permite saber si lo que se está ejecutando es lo último publicado; antes se
// comparaba version.json contra sí mismo, que siempre coincide aunque el
// navegador esté sirviendo una aplicación de hace semanas.
const MARCA_BUILD = String(Date.now())

function archivoDeVersion() {
  return {
    name: 'archivo-de-version',
    apply: 'build',
    async closeBundle() {
      const { writeFile } = await import('node:fs/promises')
      const { execSync } = await import('node:child_process')
      let commit = ''
      try {
        commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
      } catch { /* fuera de un repo; basta con la fecha */ }
      const datos = { build: MARCA_BUILD, commit }
      await writeFile(new URL('./dist/version.json', import.meta.url),
        JSON.stringify(datos), 'utf8')
    },
  }
}

// index.html: las etiquetas Open Graph llevan el dominio escrito a mano
// (WhatsApp y Facebook exigen URLs absolutas). Si el dominio cambia, hay que
// cambiarlo ahí, en sitemap.xml, robots.txt y llms.txt.
export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(MARCA_BUILD),
  },
  plugins: [
    sinComentariosCss(),
    minificarGlobo(),
    archivoDeVersion(),
    react(),
    tailwindcss(),
    VitePWA({
      // 'autoUpdate', y a proposito.
      //
      // Con 'prompt' el service worker nuevo se queda ESPERANDO a que alguien
      // le diga que tome el control, y ese alguien nunca llegaba: en la app
      // instalada la pestana no se cierra jamas, asi que el worker viejo
      // seguia sirviendo la version vieja indefinidamente. Se desplegaba y no
      // pasaba nada. Con autoUpdate el worker nuevo entra en cuanto se
      // instala, avisa por 'controllerchange' y main.jsx recarga.
      //
      // El susto de la recarga a destiempo lo cubre AvisoActualizacion, que
      // espera a que no haya una ventana abierta ni un campo en uso.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'icons/app2-192.png', 'icons/app2-512.png', 'icons/app2-maskable-192.png', 'icons/app2-maskable-512.png'],
      workbox: {
        // El service worker lo genera workbox en cada build, así que el
        // manejador de notificaciones no puede vivir dentro: se importa.
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/ws/],
        // El worker nuevo toma el control sin esperar a que se cierren las
        // pestanas, y se lleva por delante las cachés de los builds
        // anteriores. Sin esto la app instalada se queda anclada a la version
        // con la que se instalo.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Ksa Global',
        short_name: 'KsaGlobal',
        description: 'Transferencias internacionales en minutos',
        start_url: '/',
        display: 'standalone',
        background_color: '#060d22',
        theme_color: '#38bdf8',
        orientation: 'portrait',
        // Iconos con fondo de la marca y el logo con aire alrededor. Los de
        // antes eran el logo transparente llenando todo el cuadro, y el mismo
        // archivo servía de «maskable»: Android lo recortaba al círculo y el
        // globo quedaba cortado y pegado a los bordes. Nombres nuevos a
        // propósito, para que los teléfonos no sigan con los viejos en caché.
        icons: [
          { src: '/icons/app2-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/app2-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/app2-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/app2-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
