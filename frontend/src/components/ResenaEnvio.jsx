import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

// «¿Cómo fue tu envío?», en la ficha de una orden completada.
//
// Aparece solo cuando el dinero ya llegó: es el momento en que el cliente
// sabe de verdad cómo le fue. Una vez enviada se queda como agradecimiento con
// su estado, y no se puede volver a escribir para esa misma orden.

export default function ResenaEnvio({ order }) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [sobre, setSobre] = useState(0)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')

  const { data: existente, isLoading } = useQuery({
    queryKey: ['mi-resena', order.id],
    queryFn: () => api.get(`/reviews/order/${order.id}`).then(r => r.data.data),
    enabled: order.status === 'completado',
  })

  const enviar = useMutation({
    mutationFn: () => api.post('/reviews', { order_id: order.id, rating, comment: texto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mi-resena', order.id] }),
    onError: (e) => setError(e.response?.data?.detail || 'No se pudo enviar'),
  })

  if (order.status !== 'completado' || isLoading) return null

  const caja = {
    padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.08)',
    background: 'linear-gradient(135deg,rgba(251,191,36,.07),rgba(56,189,248,.05))',
  }

  if (existente) {
    const texto = {
      pendiente: 'La revisaremos y, si la publicamos, aparecerá en nuestra web.',
      aprobada: 'Ya está publicada en nuestra web. ¡Gracias por recomendarnos!',
      rechazada: 'La leímos con atención. Nos ayuda a mejorar.',
    }[existente.status]
    return (
      <div style={caja} className="shrink-0">
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#fde68a' }}>
          {'★'.repeat(existente.rating)}<span style={{ color: 'rgba(255,255,255,.15)' }}>{'★'.repeat(5 - existente.rating)}</span>
          <span style={{ marginLeft: 8, color: '#eaf2ff' }}>Gracias por tu opinión</span>
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8aa0cc' }}>{texto}</p>
      </div>
    )
  }

  const activa = sobre || rating
  const etiquetas = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente']

  return (
    <div style={caja} className="shrink-0">
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#eaf2ff' }}>¿Cómo fue tu envío?</p>
      <p style={{ margin: '3px 0 10px', fontSize: 12, color: '#8aa0cc' }}>Tu opinión ayuda a otras personas a decidir.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }} onMouseLeave={() => setSobre(0)}>
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" aria-label={`${i} estrellas`}
            onMouseEnter={() => setSobre(i)} onClick={() => { setRating(i); setError('') }}
            style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', transform: i <= activa ? 'scale(1.08)' : 'none', transition: 'transform .15s' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill={i <= activa ? '#fbbf24' : 'rgba(255,255,255,.12)'}>
              <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
            </svg>
          </button>
        ))}
        {activa > 0 && <span style={{ marginLeft: 6, fontSize: 12.5, fontWeight: 700, color: '#fde68a' }}>{etiquetas[activa]}</span>}
      </div>

      {rating > 0 && (
        <>
          <textarea value={texto} onChange={e => setTexto(e.target.value.slice(0, 600))} rows={3}
            placeholder="Cuéntanos cómo te fue: rapidez, atención, la tasa…"
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 12, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', background: 'rgba(6,13,40,.8)', color: '#eaf2ff', border: '1px solid rgba(255,255,255,.12)', outline: 'none' }} />
          <p style={{ margin: '6px 0 10px', fontSize: 11, color: '#64748b' }}>
            Si la publicamos, se verá con tu nombre y la inicial de tu apellido.
          </p>
          {error && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#f87171' }}>{error}</p>}
          <button type="button" onClick={() => enviar.mutate()}
            disabled={enviar.isPending || texto.trim().length < 10}
            style={{ padding: '9px 18px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#061027', background: 'linear-gradient(135deg,#fde68a,#fbbf24)', opacity: texto.trim().length < 10 ? .5 : 1 }}>
            {enviar.isPending ? 'Enviando…' : 'Enviar opinión'}
          </button>
        </>
      )}
    </div>
  )
}
