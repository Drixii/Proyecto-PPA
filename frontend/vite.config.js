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

// index.html: las etiquetas Open Graph llevan el dominio escrito a mano
// (WhatsApp y Facebook exigen URLs absolutas). Si el dominio cambia, hay que
// cambiarlo ahí, en sitemap.xml, robots.txt y llms.txt.
export default defineConfig({
  plugins: [
    sinComentariosCss(),
    minificarGlobo(),
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', no 'autoUpdate': con autoUpdate el service worker llama a
      // location.reload() por su cuenta en cuanto hay un despliegue nuevo, y
      // la web se recargaba sola en mitad de lo que estuvieras haciendo. Ahora
      // la version nueva espera y AvisoActualizacion ofrece tomarla.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'icons/app-192.png', 'icons/app-512.png', 'icons/app-maskable-192.png', 'icons/app-maskable-512.png'],
      workbox: {
        // El service worker lo genera workbox en cada build, así que el
        // manejador de notificaciones no puede vivir dentro: se importa.
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/ws/],
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
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/app-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
