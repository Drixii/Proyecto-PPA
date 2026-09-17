import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

// Moderación de reseñas para el super-admin.
//
// Lo que dejan los clientes entra como pendiente y aquí se decide si sale en
// la portada. Solo aprobar o rechazar: el texto no se edita, porque una
// reseña retocada por la casa deja de ser la opinión del cliente.

const FILTROS = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'aprobada', label: 'Publicadas' },
  { key: 'rechazada', label: 'Rechazadas' },
  { key: '', label: 'Todas' },
]

const COLOR_ESTADO = {
  pendiente: { c: '#fcd34d', bg: 'rgba(252,211,77,.1)', t: 'Pendiente' },
  aprobada: { c: '#4ade80', bg: 'rgba(74,222,128,.1)', t: 'Publicada' },
  rechazada: { c: '#f87171', bg: 'rgba(248,113,113,.1)', t: 'Rechazada' },
}

function Estrellas({ n, tam = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} aria-label={`${n} de 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={tam} height={tam} viewBox="0 0 24 24" fill={i <= n ? '#fbbf24' : 'rgba(255,255,255,.12)'}>
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
        </svg>
      ))}
    </span>
  )
}

export default function ModeracionResenas({ glass = {} }) {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('pendiente')
  const [aviso, setAviso] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', filtro],
    queryFn: () => api.get('/admin/reviews', { params: filtro ? { status: filtro } : {} }).then(r => r.data.data),
    refetchInterval: 60000,
  })

  const moderar = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/admin/reviews/${id}`, { status }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin-reviews'] })
      setAviso(r.data.message)
      setTimeout(() => setAviso(''), 3000)
    },
  })

  const items = data?.items || []

  return (
    <div style={{ ...glass, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaf2ff' }}>Reseñas de clientes</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8aa0cc' }}>
            Solo las publicadas aparecen en la portada. El texto no se puede editar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: filtro === f.key ? 'rgba(56,189,248,.16)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${filtro === f.key ? 'rgba(56,189,248,.45)' : 'rgba(255,255,255,.1)'}`,
                color: filtro === f.key ? '#eaf2ff' : '#8aa0cc',
              }}>
              {f.label}{f.key === 'pendiente' && data?.pendientes ? ` · ${data.pendientes}` : ''}
            </button>
          ))}
        </div>
      </div>

      {aviso && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#4ade80' }}>{aviso}</p>}
      {isLoading && <p style={{ fontSize: 13, color: '#64748b' }}>Cargando…</p>}
      {!isLoading && !items.length && (
        <p style={{ margin: 0, padding: '26px 0', textAlign: 'center', fontSize: 13, color: '#64748b' }}>
          {filtro === 'pendiente' ? 'No hay reseñas esperando revisión.' : 'Nada por aquí todavía.'}
        </p>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map(r => {
          const e = COLOR_ESTADO[r.status]
          return (
            <div key={r.id} style={{ borderRadius: 14, padding: '14px 16px', background: 'rgba(4,10,30,.5)', border: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <Estrellas n={r.rating} />
                <b style={{ fontSize: 13.5, color: '#eaf2ff' }}>{r.nombre}</b>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {r.pais_origen} → {r.pais_destino} · orden #{r.order_id} · {r.fecha ? new Date(r.fecha).toLocaleDateString('es-CL') : ''}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: e.c, background: e.bg }}>{e.t}</span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.6, color: '#c3d2ee' }}>“{r.comentario}”</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {r.status !== 'aprobada' && (
                  <button onClick={() => moderar.mutate({ id: r.id, status: 'aprobada' })} disabled={moderar.isPending}
                    style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', color: '#052e16', background: '#4ade80' }}>
                    Publicar
                  </button>
                )}
                {r.status !== 'rechazada' && (
                  <button onClick={() => moderar.mutate({ id: r.id, status: 'rechazada' })} disabled={moderar.isPending}
                    style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(248,113,113,.35)', color: '#f87171' }}>
                    {r.status === 'aprobada' ? 'Quitar de la portada' : 'Rechazar'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
