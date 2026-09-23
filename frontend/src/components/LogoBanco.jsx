import { useState } from 'react'
import { logoDeBanco, inicialesDeBanco } from '../utils/logosBancos'
import { colorDeBanco } from './MarcaPago'

/**
 * El logo del banco, o sus iniciales si no hay logo.
 *
 * En la lista de bancos salía un planeta 🌍 para todos —es el icono que pone
 * el selector cuando una opción no trae bandera—, así que elegir banco era
 * leer veinte líneas idénticas.
 *
 * No todos los bancos tienen logo guardado y eso no es un fallo: el monograma
 * con el color de la marca distingue igual de bien de un vistazo, y es mejor
 * que un hueco o un icono de "falta la imagen".
 */
export default function LogoBanco({ nombre, tam = 22 }) {
  const [falló, setFalló] = useState(false)
  const archivo = logoDeBanco(nombre)

  if (archivo && !falló) {
    return (
      <img
        src={archivo}
        alt=""
        width={tam}
        height={tam}
        loading="lazy"
        onError={() => setFalló(true)}
        style={{
          width: tam, height: tam, borderRadius: tam * .27, flexShrink: 0,
          objectFit: 'contain', background: '#fff', padding: 1,
        }}
      />
    )
  }

  const color = colorDeBanco(nombre)
  return (
    <span
      aria-hidden="true"
      style={{
        width: tam, height: tam, borderRadius: tam * .27, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}22`, border: `1px solid ${color}55`, color,
        fontSize: tam * .42, fontWeight: 800, letterSpacing: '-.02em',
      }}>
      {inicialesDeBanco(nombre)}
    </span>
  )
}
