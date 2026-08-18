import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'
import { flagUrl } from '../../utils/flags'
import { fmtDate, userTz } from '../../utils/timezone'
import { useStore } from '../../store/useStore'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

// Envíos detenidos esperando revisión.
//
// El dinero ya entró: lo que está detenido es el pago al destinatario, que es
// el único momento en que todavía se puede deshacer. Por eso la pantalla
// muestra al cliente y al receptor juntos — la decisión no es sobre el monto,
// es sobre si esas dos personas encajan.
export default function Retenciones() {
  const { user } = useStore()
  const tz = userTz(user)
  const qc = useQueryClient()
  const [rechazando, setRechazando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [confiable, setConfiable] = useState({})
  const [error, setError] = useState('')

  const { data: retenciones = [], isLoading } = useQuery({
    queryKey: ['retenciones'],
    queryFn: () => api.get('/admin/holds').then(r => r.data.data),
    refetchInterval: 30000,
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['retenciones'] })
    qc.invalidateQueries({ queryKey: ['pipeline-orders'] })
    qc.invalidateQueries({ queryKey: ['admin-orders-filtered'] })
  }

  const liberar = useMutation({
    mutationFn: ({ id, confiable }) => api.post(`/admin/holds/${id}/release`, { confiable }),
    onSuccess: () => { setError(''); refrescar() },
    onError: (e) => setError(e.response?.data?.detail || 'No se pudo liberar'),
  })

  const rechazar = useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/admin/holds/${id}/reject`, { motivo }),
    onSuccess: () => { setError(''); setRechazando(null); setMotivo(''); refrescar() },
    onError: (e) => setError(e.response?.data?.detail || 'No se pudo rechazar'),
  })

  const Dato = ({ label, valor }) => (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>{label}</p>
      <p className="text-xs font-semibold mt-0.5" style={{ color: '#eaf2ff' }}>{valor || '—'}</p>
    </div>
  )

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1100px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#eaf2ff' }}>Retenciones</h1>
          <p className="text-sm mt-1" style={{ color: '#8aa0cc' }}>
            Envíos detenidos esperando tu revisión. El cliente ya pagó — lo que está
            retenido es la entrega al destinatario.
          </p>
        </div>

        {error && (
          <p className="text-sm mb-4 px-4 py-3 rounded-xl" style={{ color: '#fca5a5', background: 'rgba(239,68,68,.08)' }}>{error}</p>
        )}

        {isLoading && <p className="text-sm" style={{ color: '#8aa0cc' }}>Cargando...</p>}

        {!isLoading && retenciones.length === 0 && (
          <div className="rounded-2xl py-16 text-center" style={GLASS}>
            <p className="text-sm" style={{ color: '#8aa0cc' }}>No hay envíos retenidos.</p>
            <p className="text-xs mt-1" style={{ color: '#475569' }}>
              Aparecen aquí cuando un cliente nuevo hace un envío sobre el límite.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {retenciones.map(r => (
            <div key={r.id} className="rounded-2xl overflow-hidden" style={{ ...GLASS, border: '1px solid rgba(168,85,247,.25)' }}>
              {/* Por qué se detuvo — lo primero, para no aprobar a ciegas */}
              <div className="px-6 py-3 flex items-start gap-2" style={{ background: 'rgba(168,85,247,.08)', borderBottom: '1px solid rgba(168,85,247,.15)' }}>
                <span className="text-sm shrink-0">🔍</span>
                <p className="text-xs leading-relaxed" style={{ color: '#d8b4fe' }}>{r.hold_reason}</p>
              </div>

              <div className="px-6 py-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <span className="font-mono text-xs" style={{ color: '#8aa0cc' }}>{r.order_number}</span>
                    <p className="text-xl font-bold mt-0.5" style={{ color: '#eaf2ff' }}>
                      {Number(r.amount_sent).toLocaleString('es-CL')} <span className="text-sm font-normal" style={{ color: '#8aa0cc' }}>{r.currency_from}</span>
                    </p>
                    <p className="text-xs" style={{ color: '#4ade80' }}>
                      el receptor recibiría {Number(r.amount_received).toLocaleString('es-CL')} {r.currency_to}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px]" style={{ color: '#8aa0cc' }}>pagado {r.paid_at ? fmtDate(r.paid_at, tz) : '—'}</p>
                    <p className="text-[11px]" style={{ color: '#64748b' }}>método: {r.payment_method}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="rounded-xl p-4" style={{ background: 'rgba(6,13,40,.5)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>Quien envía</p>
                    <div className="space-y-2.5">
                      <Dato label="Nombre" valor={r.cliente?.full_name} />
                      <Dato label="Documento" valor={r.cliente?.document_number
                        ? `${r.cliente.document_type || ''} ${r.cliente.document_number}`.trim()
                        : null} />
                      <Dato label="Teléfono" valor={r.cliente?.phone} />
                      <Dato label="Correo" valor={r.cliente?.email} />
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                          background: r.cliente?.email_verified ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)',
                          color: r.cliente?.email_verified ? '#4ade80' : '#fcd34d',
                        }}>
                          {r.cliente?.email_verified ? 'correo verificado' : 'correo sin verificar'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl p-4" style={{ background: 'rgba(6,13,40,.5)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>Quien recibe</p>
                    <div className="space-y-2.5">
                      <Dato label="Nombre" valor={r.receiver_name} />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>País</p>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold mt-0.5" style={{ color: '#eaf2ff' }}>
                          {flagUrl(r.receiver_country) && <img src={flagUrl(r.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />}
                          {r.receiver_country}
                        </span>
                      </div>
                      <Dato label="Documento" valor={r.receiver_id_num} />
                    </div>
                  </div>
                </div>

                {rechazando === r.id ? (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      rows={2}
                      placeholder="Motivo del rechazo — lo verá el cliente"
                      className="w-full rounded-xl px-3 py-2.5 text-sm"
                      style={{ background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff' }}
                    />
                    <p className="text-[11px]" style={{ color: '#fcd34d' }}>
                      Rechazar no devuelve el dinero: eso se hace fuera, por el mismo medio por el
                      que entró.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => { setRechazando(null); setMotivo('') }}
                        className="flex-1 text-xs font-semibold py-2.5 rounded-lg"
                        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc' }}>
                        Volver
                      </button>
                      <button
                        onClick={() => rechazar.mutate({ id: r.id, motivo })}
                        disabled={!motivo.trim() || rechazar.isPending}
                        className="flex-1 text-xs font-semibold py-2.5 rounded-lg disabled:opacity-40"
                        style={{ background: 'rgba(239,68,68,.16)', border: '1px solid rgba(239,68,68,.4)', color: '#f87171' }}>
                        {rechazar.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!confiable[r.id]}
                        onChange={e => setConfiable(c => ({ ...c, [r.id]: e.target.checked }))}
                        style={{ marginTop: 2, width: 15, height: 15, accentColor: '#4ade80', cursor: 'pointer' }}
                      />
                      <span className="text-xs" style={{ color: '#aebfe2' }}>
                        <strong>Marcar como cliente confiable</strong>
                        <span className="block text-[11px]" style={{ color: '#64748b' }}>
                          Sus próximos envíos no se retendrán, sea cual sea el monto.
                        </span>
                      </span>
                    </label>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setRechazando(r.id)}
                        className="text-xs font-semibold px-5 py-2.5 rounded-lg"
                        style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)', color: '#f87171' }}>
                        Rechazar
                      </button>
                      <button
                        onClick={() => liberar.mutate({ id: r.id, confiable: !!confiable[r.id] })}
                        disabled={liberar.isPending}
                        className="flex-1 text-xs font-bold py-2.5 rounded-lg disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg,#22c55e,#15803d)', border: 'none', color: '#fff' }}>
                        {liberar.isPending ? 'Liberando...' : 'Liberar envío'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </FinexyLayout>
  )
}
