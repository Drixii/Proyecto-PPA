// Modo claro y modo oscuro.
//
// El oscuro es el de siempre y sigue siendo el que se ve por defecto. El claro
// se pinta desde `temaClaro.css`, que cuelga todo de `html[data-tema="claro"]`.
//
// La elección se guarda en el navegador y se aplica antes de que React monte
// (ver el script de index.html), para que no haya un parpadeo oscuro al abrir
// la web con el modo claro puesto.

export const CLAVE = 'ksa-tema'

export function temaActual() {
  if (typeof document === 'undefined') return 'oscuro'
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro'
}

export function ponerTema(tema) {
  const valor = tema === 'claro' ? 'claro' : 'oscuro'
  document.documentElement.dataset.tema = valor
  try { localStorage.setItem(CLAVE, valor) } catch { /* modo privado */ }
  // El globo se dibuja en un canvas y no lo alcanza el CSS: se le avisa.
  window.dispatchEvent(new CustomEvent('ksa-tema', { detail: valor }))
  return valor
}

export function alternarTema() {
  return ponerTema(temaActual() === 'claro' ? 'oscuro' : 'claro')
}
