import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import SelectorBusqueda from '../../components/SelectorBusqueda'
import { paisesDelMundo, normaliza } from '../../utils/paisesMundo'

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: '22px',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.08)',
}
const INP = {
  background: 'rgba(6,13,40,.8)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 10,
  color: '#eaf2ff',
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

// La bandera sale del iso2 guardado en la base, no de un mapa en el frontend:
// así un país nuevo la tiene desde el momento en que se crea.
export function Flag({ iso2, size = 22 }) {
  if (!iso2) return null
  return (
    <img
      src={`https://flagcdn.com/40x30/${iso2}.png`}
      alt=""
      style={{ width: size, height: Math.round(size * 0.75), borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
      onError={e => { e.target.style.visibility = 'hidden' }}
    />
  )
}

function Toggle({ on, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 40, height: 22, borderRadius: 999, position: 'relative', cursor: 'pointer',
        background: on ? '#2563eb' : 'rgba(255,255,255,.12)',
        border: '1px solid ' + (on ? '#2563eb' : 'rgba(255,255,255,.14)'),
        transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left .15s',
      }} />
    </button>
  )
}

export default function CountriesManager() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', currency: '', iso2: '', can_send: false, can_receive: true })
  const [error, setError] = useState('')
  const [buscando, setBuscando] = useState(false)

  const { data: countries = [], isLoading } = useQuery({
    queryKey: ['admin-countries'],
    queryFn: () => api.get('/admin/countries').then(r => r.data.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-countries'] })
    // El calculador del home y el del cliente leen la misma lista.
    qc.invalidateQueries({ queryKey: ['countries'] })
    // Y las pantallas que arman sus listas con los países: las pestañas de
    // origen de comisiones, el simulador y el mercado paralelo. Sin esto,
    // marcar "envía" tardaba hasta un ciclo de refresco entero en verse
    // arriba, y parecía que no se había guardado.
    qc.invalidateQueries({ queryKey: ['admin-commissions'] })
    qc.invalidateQueries({ queryKey: ['tasa-paralelo'] })
  }

  const patchMut = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/admin/countries/${id}`, body),
    onSuccess: invalidate,
  })

  const createMut = useMutation({
    mutationFn: (body) => api.post('/admin/countries', body),
    onSuccess: () => {
      invalidate()
      setAdding(false)
      setForm({ name: '', currency: '', iso2: '', can_send: false, can_receive: true })
      setError('')
    },
    onError: (err) => setError(err.response?.data?.detail || 'No se pudo añadir'),
  })

  // Países que se pueden añadir: los del mundo que todavía no están en la
  // lista, ni activos ni quitados (los quitados se recuperan con ↺). Se compara
  // por bandera y por nombre, porque «Perú» y «Peru» o el euro como «EURO»
  // tienen que contar como ya añadidos.
  const disponibles = useMemo(() => {
    const isos = new Set(countries.map(c => (c.iso2 || '').toLowerCase()))
    const nombres = new Set(countries.map(c => normaliza(c.name)))
    return paisesDelMundo().filter(p => !isos.has(p.iso2) && !nombres.has(normaliza(p.guardarComo || p.nombre)))
  }, [countries])

  const elegirPais = (iso2) => {
    const p = paisesDelMundo().find(x => x.iso2 === iso2)
    if (p) setForm(f => ({ ...f, name: p.guardarComo || p.nombre, currency: p.moneda, iso2: p.iso2 }))
    setBuscando(false)
    setError('')
  }

  const activos = countries.filter(c => c.active)
  const inactivos = countries.filter(c => !c.active)

  const Row = ({ c }) => (
    <div style={{
      padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.04)',
      opacity: c.active ? 1 : .45,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Flag iso2={c.iso2} size={20} />
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#eaf2ff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name}
        </p>
        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{c.currency}</span>
        <button
          onClick={() => patchMut.mutate({ id: c.id, active: !c.active })}
          title={c.active ? 'Quitar de los calculadores' : 'Volver a ofrecerlo'}
          style={{
            fontSize: 15, lineHeight: 1, padding: '2px 6px', borderRadius: 7, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
            color: c.active ? '#f87171' : '#4ade80',
          }}
        >
          {c.active ? '\u00d7' : '\u21ba'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, paddingLeft: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Toggle on={c.can_send} title="Se puede enviar desde este pais"
            onClick={() => patchMut.mutate({ id: c.id, can_send: !c.can_send })} />
          <span style={{ fontSize: 11, color: c.can_send ? '#aebfe2' : '#64748b' }}>Envia</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Toggle on={c.can_receive} title="Se puede recibir en este pais"
            onClick={() => patchMut.mutate({ id: c.id, can_receive: !c.can_receive })} />
          <span style={{ fontSize: 11, color: c.can_receive ? '#aebfe2' : '#64748b' }}>Recibe</span>
        </div>
      </div>
    </div>
  )

  return (
    <div style={GLASS}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Países disponibles</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8aa0cc', lineHeight: 1.5 }}>
            Los que reciben son los destinos de la tabla de comisiones
          </p>
        </div>
        <button
          onClick={() => { setAdding(a => !a); setError(''); setBuscando(false); setForm({ name: '', currency: '', iso2: '', can_send: false, can_receive: true }) }}
          style={{
            fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
            background: adding ? 'rgba(255,255,255,.06)' : '#2563eb',
            border: '1px solid ' + (adding ? 'rgba(255,255,255,.12)' : '#2563eb'),
            color: '#fff', whiteSpace: 'nowrap',
          }}
        >
          {adding ? 'Cancelar' : '+ Añadir'}
        </button>
      </div>

      {adding && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(56,189,248,.04)' }}>
          {/* Se elige de la lista de países del mundo que aún no están: el
              nombre, la moneda y la bandera vienen ya puestos. Antes había que
              escribirlos a mano, con el código de bandera de dos letras. */}
          <label style={{ fontSize: 11, color: '#8aa0cc', display: 'block', marginBottom: 4 }}>País</label>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <button type="button" onClick={() => setBuscando(b => !b)}
              style={{ ...INP, width: '100%', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
              {form.iso2 ? <Flag iso2={form.iso2} size={22} /> : <span style={{ fontSize: 16 }}>🌎</span>}
              <span style={{ flex: 1, color: form.name ? '#eaf2ff' : '#64748b' }}>
                {form.name || `Elegir entre ${disponibles.length} países`}
              </span>
              {form.currency && <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#8aa0cc' }}>{form.currency}</span>}
              <span style={{ color: '#8aa0cc', fontSize: 11 }}>▾</span>
            </button>
            {buscando && (
              <SelectorBusqueda
                titulo="Añadir país"
                placeholder="Buscar país o moneda..."
                valor={form.iso2}
                opciones={disponibles.map(p => ({ clave: p.iso2, titulo: p.nombre, subtitulo: p.moneda, iso2: p.iso2 }))}
                onElegir={o => elegirPais(o.clave)}
                onCerrar={() => setBuscando(false)} />
            )}
          </div>

          {form.iso2 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#8aa0cc', display: 'block', marginBottom: 4 }}>
                Moneda <span style={{ color: '#475569' }}>(cámbiala solo si en ese país se opera en otra, como dólares)</span>
              </label>
              <input style={{ ...INP, width: 110 }} value={form.currency} maxLength={3}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle on={form.can_send} onClick={() => setForm(f => ({ ...f, can_send: !f.can_send }))} />
              <span style={{ fontSize: 12.5, color: '#aebfe2' }}>Se puede enviar desde aquí</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle on={form.can_receive} onClick={() => setForm(f => ({ ...f, can_receive: !f.can_receive }))} />
              <span style={{ fontSize: 12.5, color: '#aebfe2' }}>Se puede recibir aquí</span>
            </div>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#64748b' }}>
            Hace falta que exista una tasa de cambio para esa moneda; si no, el envío mostrará
            «tasa no disponible».
          </p>

          {error && (
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#f87171', background: 'rgba(239,68,68,.08)', padding: '7px 10px', borderRadius: 8 }}>
              {error}
            </p>
          )}

          <button
            onClick={() => createMut.mutate(form)}
            disabled={createMut.isPending || !form.name.trim() || form.currency.length !== 3 || form.iso2.length !== 2}
            style={{
              fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 10,
              background: 'linear-gradient(90deg,#22c55e,#15803d)', border: 'none', color: '#fff',
              cursor: 'pointer', opacity: (!form.name.trim() || form.currency.length !== 3 || form.iso2.length !== 2) ? .4 : 1,
            }}
          >
            {createMut.isPending ? 'Añadiendo...' : form.name ? `Añadir ${form.name}` : 'Añadir'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#64748b' }}>Cargando...</div>
      ) : (
        <>
          {activos.map(c => <Row key={c.id} c={c} />)}
          {inactivos.length > 0 && (
            <>
              <div style={{ padding: '10px 16px', background: 'rgba(4,10,30,.4)' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#475569' }}>
                  Quitados — no aparecen en los calculadores
                </p>
              </div>
              {inactivos.map(c => <Row key={c.id} c={c} />)}
            </>
          )}
        </>
      )}
    </div>
  )
}
