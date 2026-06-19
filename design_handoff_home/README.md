# Handoff: Animación scroll-storytelling del Home (Globe → Banderas)

## Overview
Esta animación convierte el hero del Home en un **scroll-storytelling** de 2 fases:

1. **Globo giratorio** (fase inicial) — idéntico al `initGlobe` actual del proyecto: puntos de latitud/longitud, arcos rosados, pulsos amarillos, banderas circulares en las ciudades.
2. **Morph al hacer scroll** — al bajar, el globo se "desarma" (puntos se dispersan, arcos se desvanecen, rotación se frena) mientras las banderas vuelan hacia una **grilla de países** ordenada. Cada bandera pasa de circular a rectangular ondeante.

Todo está en **`globe.js`** — un IIFE autocontenido que reemplaza la función `initGlobe` de Home.jsx.

---

## About the Design Files
Archivos de referencia creados en HTML/Canvas. La tarea es **integrar `globe.js` en la app React existente** (`frontend/`), adaptando la estructura JSX de `Home.jsx` para que coincida con los IDs que globe.js busca.

---

## Fidelity
**Alta fidelidad.** El comportamiento del globo, los tiempos de morph, y el sistema de reveal son los finales aprobados. Las secciones nuevas (ticker, features, pasos, stats, CTA) deben incorporarse en la estructura real; el contenido puede ajustarse, el diseño visual (colores, estilos) es el definitivo.

---

## 1. globe.js — Cómo carga

`globe.js` es un IIFE de JavaScript puro (sin dependencias, sin imports). Busca los elementos por ID en el DOM y arranca automáticamente.

### Opción A — `useEffect` en Home.jsx (recomendado para React)

```jsx
useEffect(() => {
  const script = document.createElement('script')
  script.src = '/globe.js'          // globe.js en public/
  script.async = true
  document.body.appendChild(script)
  return () => {
    if (window.__ksaStop) window.__ksaStop()
    document.body.removeChild(script)
  }
}, [])
```

Pon `globe.js` en `frontend/public/globe.js` para que esté en `/globe.js`.

### Opción B — Import directo (Vite)
```js
// en Home.jsx, al montar
import('/globe.js')   // globe.js en public/ o como módulo en src/
```

---

## 2. Estructura JSX requerida

`globe.js` busca estos IDs en el DOM. Debes reestructurar el JSX de `Home.jsx` así:

```jsx
{/* Eliminar el <canvas ref={canvasRef}> del hero actual */}
{/* Eliminar el useEffect que llama initGlobe */}

<div id="pin-wrap" style={{ height: '340vh', position: 'relative', zIndex: 1 }}>
  <div id="sticky" style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
    {/* Canvas gestionado por globe.js */}
    <canvas id="globe-cv" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />

    {/* Hero original — globe.js lo desvanece al hacer scroll */}
    <div id="hero-content" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center' }}>
      {/* ... tu contenido hero actual (título, CTA, CalculatorDark) ... */}
    </div>

    {/* Título que aparece en la fase de grilla */}
    <div id="grid-title" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, textAlign: 'center', paddingTop: '12vh', opacity: 0, pointerEvents: 'none' }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#38bdf8' }}>Cobertura global</p>
      <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(30px,4vw,52px)', fontWeight: 700, color: '#fff' }}>Operamos en estos países</h2>
      <p style={{ margin: 0, fontSize: 16, color: '#9fb0d4' }}>Conectados a los principales destinos de América Latina y el mundo.</p>
    </div>

    {/* Hint de scroll — desaparece al bajar */}
    <div id="scroll-hint" style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8aa0cc' }}>Scroll</span>
      {/* ↓ icono */}
    </div>
  </div>
</div>
```

### IDs que globe.js necesita (no renombrar)

| ID | Elemento | Qué hace globe.js |
|---|---|---|
| `globe-cv` | `<canvas>` | Dibuja el globo / morph / banderas |
| `pin-wrap` | `div` alto 340vh | Mide progreso de scroll |
| `hero-content` | `div` del hero | Aplica opacity + translateY al desvanecerse |
| `grid-title` | `div` título países | Aplica opacity al aparecer |
| `scroll-hint` | `div` hint scroll | Aplica opacity (desaparece al bajar) |

---

## 3. Sistema de reveal al scroll

Los elementos con `data-reveal` se revelan (fade in + slide up) al entrar en el viewport. `globe.js` los maneja automáticamente (scroll listener + timeouts).

### Cómo usarlo en React
```jsx
// Estilos iniciales (oculto)
const revealStyle = {
  opacity: 0,
  transform: 'translateY(34px)',
  transition: 'opacity .8s cubic-bezier(.22,.61,.36,1), transform .8s cubic-bezier(.22,.61,.36,1)',
}

// Stagger: agregar transition-delay por índice
const revealDelay = (i) => ({
  ...revealStyle,
  transitionDelay: `${i * 0.1}s, ${i * 0.1}s`,
})

// En el JSX:
<div data-reveal style={revealStyle}>
  {/* contenido */}
</div>
```

> **Nota React:** globe.js aplica `el.style.opacity = '1'` y `el.style.transform = 'none'` directamente en el DOM. React puede sobrescribir inline styles en re-renders; para evitar conflictos, aplica los estilos iniciales vía una clase CSS en lugar de inline style. Ver sección 5.

---

## 4. Nuevas secciones del Home

Después del `#pin-wrap`, añadir en orden:

```
Ticker de divisas     → animación marquee CSS
Por qué Ksa Global   → 4 tarjetas glass + data-reveal
Cómo funciona        → 4 pasos + data-reveal
Banda de confianza   → stats + data-reveal
CTA                  → existente
Footer               → existente
```

Consultar `Home.dc.html` para el markup completo de cada sección.

---

## 5. CSS / @keyframes requeridos

Añadir en el CSS global del proyecto (o en `App.css`/`index.css`):

```css
/* Banderas en globo — badge pulsante */
@keyframes pulseDot {
  0%   { box-shadow: 0 0 0 0 rgba(56,225,255,.55); }
  70%  { box-shadow: 0 0 0 9px rgba(56,225,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(56,225,255,0); }
}

/* Calculadora flotante en hero */
@keyframes floaty {
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-9px); }
}

/* Hint scroll */
@keyframes hintBob {
  0%,100% { transform: translateY(0); opacity: .55; }
  50%     { transform: translateY(7px); opacity: 1; }
}

/* Ticker de tasas */
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

/* Reveal al scroll — clases (en lugar de inline, evita conflictos React) */
.reveal-hidden {
  opacity: 0;
  transform: translateY(34px);
  transition: opacity .8s cubic-bezier(.22,.61,.36,1),
              transform .8s cubic-bezier(.22,.61,.36,1);
}
/* globe.js aplica style.opacity='1' + style.transform='none'
   que sobreescribe el estado inicial de .reveal-hidden */
```

---

## 6. Comportamiento / timeline del morph

El scroll del `#pin-wrap` (340vh) se mapea a un progreso `p` (0→1):

| p | Estado |
|---|---|
| 0 → 0.10 | Globo girando, hero visible |
| 0.10 → 0.22 | Hero se desvanece (fade out + translateY -40px) |
| 0.10 → 0.72 | Morph globo→grilla (ease in-out cúbico) |
| 0.46 → 0.68 | Título "Operamos en estos países" fade in |
| 0.50 → 0.78 | Banderas circulares → rectangulares ondeantes |
| 0.80 → 1.0  | Estado final: grilla estable, scrolling sigue |

### Ajustar velocidades (en globe.js)
```js
// Velocidad de morph (más grande = empieza antes)
var morph = ease(clamp((p - 0.10) / 0.62, 0, 1))
//                          ↑ inicio    ↑ duración (1/velocidad)

// Amplitud del ondeo de banderas
var amp = h * 0.07;   // más alto = ondea más

// Velocidad del ondeo
var off = Math.sin(f*freq*Math.PI*2 + phase + t*2.2) * ...
//                                              ↑ velocidad de ondeo
```

---

## 7. Países / ciudades del globo

Los 12 países del globo están definidos al inicio de `globe.js` en el array `countries`. Para agregar/quitar países, editar ese array:

```js
var countries = [
  { iso:'us', name:'EE.UU.',    lat:40.7,  lon:-74.0 },
  { iso:'cl', name:'Chile',     lat:-33.4, lon:-70.6 },
  // ... agregar { iso: 'CODE', name: 'Nombre', lat: X, lon: Y }
]
```

Los códigos ISO deben existir en `https://flagcdn.com/w640/CODE.png`. Los arcos de la red se definen en `defs` (pares de índices del array) — actualizar si se reordenan países.

---

## 8. Banderas (flagcdn)

Las imágenes se cargan desde `https://flagcdn.com/w640/CODE.png` con `crossOrigin='anonymous'`. Si el entorno de producción bloquea CDN externos:

1. Descargar los 12 PNG de `https://flagcdn.com/w640/`
2. Ponerlos en `frontend/public/flags/`
3. Cambiar en globe.js: `img.src = '/flags/' + c.iso + '.png'`

---

## Files
- `globe.js` — Script de animación (poner en `frontend/public/globe.js`)
- `README.md` — Este archivo
- `reference/Home.dc.html` — Prototipo completo de referencia (abrir en navegador)
