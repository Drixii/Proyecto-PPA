import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'

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

  const { data: countries = [], isLoading } = useQuery({
    queryKey: ['admin-countries'],
    queryFn: () => api.get('/admin/countries').then(r => r.data.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-countries'] })
    // El calculador del home y el del cliente leen la misma lista.
    qc.invalidateQueries({ queryKey: ['countries'] })
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

  const activos = countries.filter(c => c.active)
  const inactivos = countries.filter(c => !c.active)

  const Row = ({ c }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
      borderBottom: '1px solid rgba(255,255,255,.04)', opacity: c.active ? 1 : .45,
    }}>
      <Flag iso2={c.iso2} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#eaf2ff' }}>{c.name}</p>
        <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{c.currency}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 92 }}>
        <Toggle on={c.can_send} title="Se puede enviar desde este país"
          onClick={() => patchMut.mutate({ id: c.id, can_send: !c.can_send })} />
        <span style={{ fontSize: 11, color: '#8aa0cc' }}>Envía</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 92 }}>
        <Toggle on={c.can_receive} title="Se puede recibir en este país"
          onClick={() => patchMut.mutate({ id: c.id, can_receive: !c.can_receive })} />
        <span style={{ fontSize: 11, color: '#8aa0cc' }}>Recibe</span>
      </div>

      <button
        onClick={() => patchMut.mutate({ id: c.id, active: !c.active })}
        style={{
          fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
          background: c.active ? 'rgba(239,68,68,.1)' : 'rgba(74,222,128,.1)',
          border: '1px solid ' + (c.active ? 'rgba(239,68,68,.25)' : 'rgba(74,222,128,.25)'),
          color: c.active ? '#f87171' : '#4ade80',
        }}
      >
        {c.active ? 'Quitar' : 'Restaurar'}
      </button>
    </div>
  )

  return (
    <div style={GLASS}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Países disponibles</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            Cambia al instante el calculador del inicio y el de nueva transferencia
          </p>
        </div>
        <button
          onClick={() => { setAdding(a => !a); setError('') }}
          style={{
            fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
            background: adding ? 'rgba(255,255,255,.06)' : '#2563eb',
            border: '1px solid ' + (adding ? 'rgba(255,255,255,.12)' : '#2563eb'),
            color: '#fff', whiteSpace: 'nowrap',
          }}
        >
          {adding ? 'Cancelar' : '+ Añadir país'}
        </button>
      </div>

      {adding && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(56,189,248,.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8aa0cc', display: 'block', marginBottom: 4 }}>País</label>
              <input style={{ ...INP, width: '100%' }} value={form.name} placeholder="Honduras"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8aa0cc', display: 'block', marginBottom: 4 }}>Moneda</label>
              <input style={{ ...INP, width: '100%' }} value={form.currency} placeholder="HNL" maxLength={3}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8aa0cc', display: 'block', marginBottom: 4 }}>Bandera</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input style={{ ...INP, width: '100%' }} value={form.iso2} placeholder="hn" maxLength={2}
                  onChange={e => setForm(f => ({ ...f, iso2: e.target.value.toLowerCase() }))} />
                <Flag iso2={form.iso2.length === 2 ? form.iso2 : null} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 12 }}>
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
            La bandera son las 2 letras del país (cl, co, hn). Hace falta que exista una tasa
            de cambio para esa moneda, si no, el envío mostrará «tasa no disponible».
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
            {createMut.isPending ? 'Guardando...' : 'Añadir país'}
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
