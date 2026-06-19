# Handoff: Fondo animado del Panel de Admin (transacciones con banderas)

## Overview
Fondo animado tipo "neón 3D" para el panel de administración de la casa de cambios.
Representa visualmente las **transacciones/envíos**: desde un punto de fuga en la
parte inferior central salen líneas en perspectiva que se abren hacia arriba; cada
cierto tiempo viaja un **pulso azul** (una transacción) con estela y, en la punta,
la **bandera real del país destino**. Las tarjetas de estadísticas van encima con
efecto *liquid glass* (vidrio translúcido) para que el fondo se aprecie a través de ellas.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML/Canvas** —
un prototipo que muestra el look y el comportamiento deseados, **no código de
producción para copiar tal cual**. La tarea es **recrear este diseño dentro de la app
React existente** (`frontend/`), respetando sus patrones y librerías.

Para facilitarlo se incluye además un **componente React listo para usar**
(`TransactionsBackground.jsx`) que ya implementa toda la animación; puede integrarse
directamente o usarse como referencia.

## Fidelity
**Alta fidelidad (hifi).** Colores, comportamiento, tiempos y efecto de vidrio son
los finales aprobados por el cliente. El fondo debe verse igual; las tarjetas del
dashboard deben mantener su contenido real de la app (datos, rutas, etc.) y solo
adoptar el tratamiento visual translúcido que se describe abajo.

## Qué integrar (resumen)
1. Añadir el componente `TransactionsBackground` como **capa de fondo** del área de
   contenido del `AdminDashboard`.
2. Hacer que las tarjetas existentes sean **translúcidas (liquid glass)** para que el
   fondo se vea a través de ellas.

No es necesario reescribir el dashboard: solo agregar la capa de fondo y ajustar el
estilo de los contenedores.

---

## Componente: TransactionsBackground

Archivo: `TransactionsBackground.jsx` (React, sin dependencias externas).

### Integración
El contenedor padre debe tener `position: relative` y un tamaño definido. El canvas
se autoajusta al tamaño del padre y se redibuja en `resize`.

```jsx
import TransactionsBackground from './TransactionsBackground'

function AdminDashboard() {
  return (
    <main style={{ position: 'relative', overflow: 'auto' }}>
      {/* Capa de fondo animada */}
      <TransactionsBackground />

      {/* Contenido del dashboard, por encima del fondo */}
      <div style={{ position: 'relative', zIndex: 2, padding: 24 }}>
        {/* ...tarjetas, tablas, etc... */}
      </div>
    </main>
  )
}
```

### Props
| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `countries` | `string[]` | `['US','ES','PA','CO','MX','PE','AR','BR','GB','AE','CL','VE','EC']` | Códigos ISO-3166 alfa-2 de los países destino. Cada pulso elige uno al azar. |
| `maxActive` | `number` | `2` | Máximo de transacciones (pulsos) simultáneas en pantalla. Subir = más movimiento. |
| `className` / `style` | — | — | Se aplican al `<canvas>`. |

### Banderas
Las banderas reales se cargan como imágenes desde **flagcdn**
(`https://flagcdn.com/w160/<code>.png`, p. ej. `us.png`, `cl.png`). Mientras cargan
se dibuja un *fallback* de franjas con los colores del país. Si el entorno de producción
no debe depender de un CDN externo, descargar los PNG de las banderas usadas y servirlos
localmente, cambiando la URL en `TransactionsBackground.jsx` (constante `img.src`).
`crossOrigin = 'anonymous'` ya está configurado.

### Ritmo de la animación (ajustable en el componente)
- `speed: 0.00028 + Math.random() * 0.00012` — velocidad de cada pulso (más bajo = más lento).
- `line.waitUntil = ts + 2500 + Math.random() * 4000` — pausa entre transacciones de una misma línea (ms).
- `maxActive` (prop) — cuántas a la vez.

---

## Tratamiento de las tarjetas (liquid glass)
Aplicar a cada contenedor de estadística/tabla del dashboard:

```css
background: rgba(255, 255, 255, 0.0);      /* casi nada de relleno */
border: 1px solid rgba(255, 255, 255, 0.05);
border-radius: 22px;
backdrop-filter: blur(10px);
box-shadow: 0 4px 24px rgba(0,0,0,0.35),
            inset 0 1.5px 0 rgba(255,255,255,0.18);
```

- Texto principal: `#e2e8f0` / `#f1f5f9`.
- Texto secundario: `rgba(148,163,184,0.6)`.
- La tarjeta "destacada" (p. ej. Órdenes Hoy) usa `background: rgba(59,130,246,0.03)`.

El objetivo es que el fondo animado se vea claramente a través de las tarjetas.

## Design Tokens
**Colores**
- Azul de marca (logo CC / pulsos): `#1d4ed8`
- Azul claro (punta del pulso / acentos): `#3b82f6`
- Azul muy claro (highlights): `#60a5fa` / `#93c5fd`
- Fondo base del canvas: `#020818`
- Sidebar / header: `rgba(8,22,60,*)`
- Texto: `#e2e8f0`, `#f1f5f9`; secundario `#94a3b8` (~`rgba(148,163,184,.6)`)
- Estados: ámbar `#fbbf24` (pendiente), azul `#60a5fa` (en proceso), verde `#4ade80` (completado), naranja `#fb923c` (en aprobación)

**Radios**: tarjetas 22px · botones/items 12px · pills 100px
**Blur de vidrio**: `blur(10px)`
**Tipografía del prototipo**: *Space Grotesk* (la app puede usar su tipografía propia)

## Comportamiento / detalles de la animación
- **Perspectiva 3D**: el pulso nace grande y cerca en el punto de fuga (abajo, centro) y
  se **achica al alejarse** hacia los bordes superiores (`persp = (1 - t)^2.2`).
- **Estela** azul degradada detrás de la punta (`steleLen = 0.34` del largo de la línea).
- **Punta** = bandera del país destino, con un *glow* azul detrás; tamaño ~35px cerca → ~15px lejos.
- **Líneas guía**: todas las líneas se dibujan muy tenues (no "prenden"); solo las
  activas muestran el pulso.
- Fondo con *glows* radiales azules (punto de fuga inferior + laterales) y viñeta en los bordes.
- 60fps vía `requestAnimationFrame`; `dt` clampeado a 50ms para evitar saltos al cambiar de pestaña.
- Se limpia correctamente en `unmount` (cancela rAF y listener de resize).

## Assets
- **Banderas**: PNG desde `https://flagcdn.com/w160/<iso2>.png` (CC0). Opcional servirlas localmente.
- No hay otras imágenes; todo lo demás es Canvas 2D.

## Files
- `TransactionsBackground.jsx` — componente React listo para integrar (la implementación final).
- `AdminDashboard.dc.html` — prototipo de referencia completo (dashboard + fondo). Abrir en navegador para ver el comportamiento exacto.

## Nota
En el prototipo, las banderas se inicializan al montar; si se edita en caliente la lista
de países conviene recargar. En el componente React esto está resuelto vía `useEffect`
(se reinicializa al cambiar las props `countries`/`maxActive`).
