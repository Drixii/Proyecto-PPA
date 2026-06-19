import { useState, useEffect, useRef } from 'react'
import { fmtDateShort } from '../../utils/timezone'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'

const TABS = ['Configuración', 'Canjeables', 'Clientes', 'Canjes']

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }
const inputStyle = { background: 'rgba(6,13,40,.8)', border: '1px solid rgba(255,255,255,.1)', color: '#eaf2ff' }

function IcoGift() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  )
}

// ── Reward form modal ─────────────────────────────────────
function RewardModal({ reward, clpRate, onClose, onSaved }) {
  const qc = useQueryClient()
  const [name, setName] = useState(reward?.name || '')
  const [desc, setDesc] = useState(reward?.description || '')
  const [cost, setCost] = useState(reward ? String(reward.points_cost) : '')
  const [active, setActive] = useState(reward ? reward.active : true)
  const [imgPreview, setImgPreview] = useState(reward?.image_url || null)
  const [imgFile, setImgFile] = useState(null)
  const fileRef = useRef()

  const saveMutation = useMutation({
    mutationFn: async (body) => {
      let res
      if (reward?.id) {
        res = await api.put(`/admin/rewards/${reward.id}`, body)
      } else {
        res = await api.post('/admin/rewards', body)
      }
      const newId = res.data.data.id || reward?.id
      if (imgFile && newId) {
        const fd = new FormData()
        fd.append('file', imgFile)
        await api.post(`/admin/rewards/${newId}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      return newId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-rewards'] })
      onSaved()
    },
  })

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImgFile(f)
    setImgPreview(URL.createObjectURL(f))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const c = parseInt(cost)
    if (!name || isNaN(c) || c <= 0) return
    saveMutation.mutate({ name, description: desc || null, points_cost: c, active })
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 60px rgba(0,6,28,.9)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <h3 className="font-bold" style={{ color: '#eaf2ff' }}>{reward?.id ? 'Editar canjeable' : 'Nuevo canjeable'}</h3>
          <button onClick={onClose} className="text-xl" style={{ color: '#8aa0cc' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Image upload */}
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: '#aebfe2' }}>Imagen del canjeable</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-full h-36 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden transition-colors"
              style={{ border: '2px dashed rgba(253,211,77,.3)', background: 'rgba(253,211,77,.04)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(253,211,77,.6)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(253,211,77,.3)'}
            >
              {imgPreview
                ? <img src={imgPreview} alt="" className="w-full h-full object-cover rounded-xl" />
                : (
                  <div className="text-center">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="1.5" className="mx-auto mb-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-xs" style={{ color: '#fcd34d' }}>Click para subir imagen</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8aa0cc' }}>JPG, PNG, WEBP o GIF</p>
                  </div>
                )
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#aebfe2' }}>Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={inputStyle} placeholder="Ej: Descuento 5% en próxima transferencia" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#aebfe2' }}>Descripción</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
              style={inputStyle} placeholder="Descripción opcional del beneficio" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#aebfe2' }}>Costo en puntos *</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} min="1"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={inputStyle} placeholder="500" />
            {cost && !isNaN(parseInt(cost)) && clpRate && (
              <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>
                Equivale a <strong style={{ color: '#4ade80' }}>${(parseInt(cost) * clpRate).toLocaleString('es-CL')} CLP</strong>
              </p>
            )}
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              onClick={() => setActive(a => !a)}
              className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
              style={{ background: active ? '#22c55e' : 'rgba(255,255,255,.12)' }}
            >
              <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm" style={{ left: active ? '22px' : '2px' }} />
            </div>
            <span className="text-sm" style={{ color: '#aebfe2' }}>Visible para clientes</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 text-sm font-semibold py-2.5 rounded-xl"
              style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: 'rgba(255,255,255,.04)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saveMutation.isPending}
              className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)' }}>
              {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Section: Config ───────────────────────────────────────
function ConfigSection() {
  const qc = useQueryClient()
  const [feePct, setFeePct] = useState('')
  const [clpRate, setClpRate] = useState('')
  const [saved, setSaved] = useState(false)

  const { data } = useQuery({
    queryKey: ['points-config'],
    queryFn: () => api.get('/admin/points/config').then(r => r.data.data),
  })
  useEffect(() => {
    if (data) { setFeePct(String(data.points_fee_pct)); setClpRate(String(data.points_clp_rate)) }
  }, [data])

  const mut = useMutation({
    mutationFn: (body) => api.put('/admin/points/config', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['points-config'] }); setSaved(true); setTimeout(() => setSaved(false), 3000) },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const fp = parseFloat(feePct), cr = parseFloat(clpRate)
    if (isNaN(fp) || isNaN(cr)) return
    mut.mutate({ points_fee_pct: fp, points_clp_rate: cr })
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl p-6" style={GLASS}>
        <h3 className="font-semibold mb-1" style={{ color: '#eaf2ff' }}>Conversión de puntos</h3>
        <p className="text-xs mb-5" style={{ color: '#8aa0cc' }}>Define cómo se calculan los puntos y su valor en pesos</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#aebfe2' }}>% del fee → puntos</label>
              <div className="relative">
                <input type="number" value={feePct} onChange={e => setFeePct(e.target.value)} min="0" max="100" step="1"
                  className="w-full rounded-xl px-4 py-3 pr-10 text-2xl font-bold focus:outline-none"
                  style={inputStyle} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: '#8aa0cc' }}>%</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: '#8aa0cc' }}>Del fee cobrado al cliente</p>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#aebfe2' }}>1 punto = ? CLP</label>
              <div className="relative">
                <input type="number" value={clpRate} onChange={e => setClpRate(e.target.value)} min="1" step="1"
                  className="w-full rounded-xl px-4 py-3 pr-14 text-2xl font-bold focus:outline-none"
                  style={inputStyle} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: '#8aa0cc' }}>CLP</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: '#8aa0cc' }}>Valor del punto al canjear</p>
            </div>
          </div>

          {feePct && clpRate && !isNaN(parseFloat(feePct)) && !isNaN(parseFloat(clpRate)) && (
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(253,211,77,.06)', border: '1px solid rgba(253,211,77,.15)' }}>
              <p className="text-sm" style={{ color: '#fcd34d' }}>
                Ejemplo: comisión de <strong>$1.500 CLP</strong> →{' '}
                <strong>{Math.floor(1500 * parseFloat(feePct) / 100)} pts</strong> →{' '}
                equivale a <strong>${(Math.floor(1500 * parseFloat(feePct) / 100) * parseFloat(clpRate)).toLocaleString('es-CL')} CLP</strong>
              </p>
            </div>
          )}

          <button type="submit" disabled={mut.isPending}
            className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white disabled:opacity-60 transition-all"
            style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)' }}>
            {mut.isPending ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', color: '#4ade80' }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Guardado correctamente
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// ── Section: Rewards ──────────────────────────────────────
function RewardsSection() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: () => api.get('/admin/rewards').then(r => r.data.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/rewards/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-rewards'] }); showToast('Canjeable eliminado') },
  })

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const rewards = data?.rewards || []
  const clpRate = data?.clp_rate || 50

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: '#8aa0cc' }}>{rewards.length} canjeable{rewards.length !== 1 ? 's' : ''} creado{rewards.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal({})}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl text-white"
          style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nuevo canjeable
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-52 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,.06)' }} />)}
        </div>
      ) : rewards.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-20" style={GLASS}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(253,211,77,.08)' }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <p className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>Sin canjeables aún</p>
          <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>Crea beneficios para tus clientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map(r => (
            <div key={r.id} className="rounded-2xl overflow-hidden flex flex-col" style={GLASS}>
              <div className="h-36 relative overflow-hidden" style={{ background: 'rgba(4,10,30,.8)' }}>
                {r.image_url
                  ? <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                  : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="rgba(253,211,77,.3)" strokeWidth="1.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                    </div>
                  )
                }
                <div className="absolute top-2 right-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={r.active ? { background: 'rgba(74,222,128,.9)', color: '#052e16' } : { background: 'rgba(0,0,0,.7)', color: '#8aa0cc' }}>
                    {r.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="font-semibold text-sm mb-0.5" style={{ color: '#eaf2ff' }}>{r.name}</p>
                {r.description && <p className="text-xs mb-2" style={{ color: '#8aa0cc' }}>{r.description}</p>}
                <div className="mt-auto pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
                  <div>
                    <span className="text-lg font-bold" style={{ color: '#fcd34d' }}>{r.points_cost.toLocaleString()} pts</span>
                    <p className="text-[11px]" style={{ color: '#4ade80' }}>${(r.points_cost * clpRate).toLocaleString('es-CL')} CLP</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal(r)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'rgba(255,255,255,.07)', color: '#aebfe2' }}>
                      Editar
                    </button>
                    <button onClick={() => { if (window.confirm('¿Eliminar?')) deleteMut.mutate(r.id) }}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'rgba(239,68,68,.1)', color: '#f87171' }}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <RewardModal
          reward={modal?.id ? modal : null}
          clpRate={clpRate}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); showToast('Canjeable guardado') }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[700] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${toast.ok ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

// ── Section: Clients ──────────────────────────────────────
function ClientsSection() {
  const [awardModal, setAwardModal] = useState(null)
  const [pts, setPts] = useState('')
  const [ptsDesc, setPtsDesc] = useState('')
  const [expandedClient, setExpandedClient] = useState(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-points-all'],
    queryFn: () => api.get('/admin/points').then(r => r.data.data),
    staleTime: 0,
  })

  const awardMut = useMutation({
    mutationFn: ({ id, points, description }) => api.post(`/admin/points/${id}/award`, { points, description }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-points-all'] }); setAwardModal(null); setPts(''); setPtsDesc('') },
  })

  const accounts = data?.accounts || []
  const clpRate = data?.clp_rate || 50

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={GLASS}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div>
            <p className="font-semibold" style={{ color: '#eaf2ff' }}>Puntos por cliente</p>
            <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>1 punto = ${clpRate} CLP · Clic en cliente para ver transacciones</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(4,10,30,.6)' }}>
              <th className="text-left text-xs font-semibold px-6 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Cliente</th>
              <th className="text-left text-xs font-semibold px-4 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Puntos</th>
              <th className="text-left text-xs font-semibold px-4 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Equiv. CLP</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && [1, 2, 3].map(i => (
              <tr key={i}>{[1, 2, 3, 4].map(j => (
                <td key={j} className="px-6 py-4"><div className="h-3 rounded animate-pulse w-20" style={{ background: 'rgba(255,255,255,.06)' }} /></td>
              ))}</tr>
            ))}
            {!isLoading && accounts.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-sm" style={{ color: '#475569' }}>Sin clientes con puntos aún</td></tr>
            )}
            {!isLoading && accounts.map(a => {
              const isExpanded = expandedClient === a.user_id
              const txns = a.transactions || []
              return (
                <>
                  <tr
                    key={a.user_id}
                    onClick={() => setExpandedClient(isExpanded ? null : a.user_id)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,.04)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs w-4 text-center select-none" style={{ color: '#8aa0cc' }}>{isExpanded ? '▾' : '▸'}</span>
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {a.full_name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>{a.full_name}</p>
                          <p className="text-xs" style={{ color: '#8aa0cc' }}>{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-lg" style={{ color: '#fcd34d' }}>{a.total_points.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#4ade80' }}>${a.clp_equivalent.toLocaleString('es-CL')}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); setAwardModal(a) }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: 'rgba(253,211,77,.1)', color: '#fcd34d' }}>
                        + Puntos
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${a.user_id}-txns`} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                      <td colSpan={4} className="px-0 pb-3" style={{ background: 'rgba(4,10,30,.5)' }}>
                        {txns.length === 0 ? (
                          <p className="text-xs px-10 py-3" style={{ color: '#475569' }}>Sin transacciones de puntos aún</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                                <th className="text-left font-semibold px-10 py-2 uppercase tracking-wider" style={{ color: '#475569' }}>ID transacción</th>
                                <th className="text-left font-semibold px-4 py-2 uppercase tracking-wider" style={{ color: '#475569' }}>Monto enviado</th>
                                <th className="text-left font-semibold px-4 py-2 uppercase tracking-wider" style={{ color: '#475569' }}>Puntos</th>
                                <th className="text-left font-semibold px-4 py-2 uppercase tracking-wider" style={{ color: '#475569' }}>Fecha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {txns.map(t => (
                                <tr key={t.txn_id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                  <td className="px-10 py-2 font-mono" style={{ color: '#7dd3fc' }}>
                                    {t.order_number || `#${t.txn_id}`}
                                  </td>
                                  <td className="px-4 py-2" style={{ color: '#aebfe2' }}>
                                    {t.amount_sent != null
                                      ? <>{t.amount_sent.toLocaleString('es-CL')} {t.currency_from} → {t.receiver_country}</>
                                      : <span style={{ color: '#475569' }}>—</span>
                                    }
                                  </td>
                                  <td className="px-4 py-2 font-bold" style={{ color: '#fcd34d' }}>⭐ {t.points}</td>
                                  <td className="px-4 py-2" style={{ color: '#64748b' }}>
                                    {t.created_at ? fmtDateShort(t.created_at) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {awardModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 60px rgba(0,6,28,.9)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <h3 className="font-bold" style={{ color: '#eaf2ff' }}>Otorgar puntos — {awardModal.full_name}</h3>
              <button onClick={() => setAwardModal(null)} className="text-xl" style={{ color: '#8aa0cc' }}>✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#aebfe2' }}>Cantidad de puntos</label>
                <input type="number" value={pts} onChange={e => setPts(e.target.value)} min="1" autoFocus
                  className="w-full rounded-xl px-3 py-2.5 text-xl font-bold focus:outline-none"
                  style={inputStyle} placeholder="100" />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#aebfe2' }}>Motivo (opcional)</label>
                <input value={ptsDesc} onChange={e => setPtsDesc(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle} placeholder="Ej: Bono de bienvenida" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAwardModal(null)}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl"
                  style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: 'rgba(255,255,255,.04)' }}>
                  Cancelar
                </button>
                <button
                  disabled={!pts || parseInt(pts) <= 0 || awardMut.isPending}
                  onClick={() => awardMut.mutate({ id: awardModal.user_id, points: parseInt(pts), description: ptsDesc || undefined })}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)' }}>
                  {awardMut.isPending ? 'Guardando...' : 'Otorgar puntos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Section: Redemptions ──────────────────────────────────
function RedemptionsSection() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-redemptions'],
    queryFn: () => api.get('/admin/points/redemptions').then(r => r.data.data),
    staleTime: 0,
  })

  const useMut = useMutation({
    mutationFn: (id) => api.post(`/admin/points/redemptions/${id}/use`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-redemptions'] }),
  })

  const items = data || []

  return (
    <div className="rounded-2xl overflow-hidden" style={GLASS}>
      <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <p className="font-semibold" style={{ color: '#eaf2ff' }}>Historial de canjes</p>
        <p className="text-xs mt-0.5" style={{ color: '#8aa0cc' }}>Codes generados por clientes al canjear puntos</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'rgba(4,10,30,.6)' }}>
            <th className="text-left text-xs font-semibold px-6 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Código</th>
            <th className="text-left text-xs font-semibold px-4 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Cliente</th>
            <th className="text-left text-xs font-semibold px-4 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Canjeable</th>
            <th className="text-left text-xs font-semibold px-4 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Pts usados</th>
            <th className="text-left text-xs font-semibold px-4 py-3 uppercase tracking-wider" style={{ color: '#64748b' }}>Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading && [1, 2, 3].map(i => (
            <tr key={i}>{[1, 2, 3, 4, 5, 6].map(j => (
              <td key={j} className="px-6 py-4"><div className="h-3 rounded animate-pulse w-16" style={{ background: 'rgba(255,255,255,.06)' }} /></td>
            ))}</tr>
          ))}
          {!isLoading && items.length === 0 && (
            <tr><td colSpan={6} className="px-6 py-12 text-center text-sm" style={{ color: '#475569' }}>Sin canjes realizados aún</td></tr>
          )}
          {!isLoading && items.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
              <td className="px-6 py-3">
                <span className="font-mono text-sm font-bold" style={{ color: '#fcd34d' }}>{r.code}</span>
              </td>
              <td className="px-4 py-3">
                <p className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>{r.user_name}</p>
                <p className="text-xs" style={{ color: '#8aa0cc' }}>{r.user_email}</p>
              </td>
              <td className="px-4 py-3 text-sm" style={{ color: '#aebfe2' }}>{r.reward_name}</td>
              <td className="px-4 py-3 font-bold" style={{ color: '#fcd34d' }}>{r.points_used.toLocaleString()}</td>
              <td className="px-4 py-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={r.status === 'used'
                    ? { background: 'rgba(74,222,128,.1)', color: '#4ade80' }
                    : { background: 'rgba(253,211,77,.1)', color: '#fcd34d' }}>
                  {r.status === 'used' ? 'Usado' : 'Pendiente'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {r.status === 'pending' && (
                  <button onClick={() => useMut.mutate(r.id)} disabled={useMut.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                    style={{ background: 'rgba(74,222,128,.1)', color: '#4ade80' }}>
                    Marcar usado
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function AdminPoints() {
  const [tab, setTab] = useState('Configuración')

  return (
    <FinexyLayout>
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(253,211,77,.1)', color: '#fcd34d' }}>
            <IcoGift />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#eaf2ff' }}>Sistema de Puntos</h1>
            <p className="text-sm" style={{ color: '#8aa0cc' }}>Gestión completa del programa de fidelización</p>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex items-center rounded-full p-[3px] gap-0.5 w-fit mb-6" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-2 rounded-full text-sm font-medium transition-all"
              style={tab === t
                ? { background: 'linear-gradient(135deg,#78350f,#ca8a04)', color: '#fef9c3' }
                : { color: '#8aa0cc' }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Configuración' && <ConfigSection />}
        {tab === 'Canjeables' && <RewardsSection />}
        {tab === 'Clientes' && <ClientsSection />}
        {tab === 'Canjes' && <RedemptionsSection />}
      </div>
    </FinexyLayout>
  )
}
