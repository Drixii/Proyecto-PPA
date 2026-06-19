import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'
import { useStore } from '../../store/useStore'
import { fmtDateOnly, userTz } from '../../utils/timezone'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

function ParticlesBg() {
  const floaters = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      size: [1.5, 2, 3, 2.5, 1, 4][i % 6],
      x: (i * 4.3 + 1.7) % 100,
      dur: 9 + (i % 8) * 1.4,
      delay: -(i * 0.75),
      glow: [6, 10, 14, 8][i % 4],
      driftX: [12, -8, 20, -15, 6, -10][i % 6],
    }))
  , [])

  const twinklers = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      size: [1, 1.5, 2, 1, 2.5][i % 5],
      x: (i * 5.1 + 3.3) % 100,
      y: (i * 6.7 + 8) % 88,
      dur: 2.2 + (i % 6) * 0.7,
      delay: -(i * 0.38),
    }))
  , [])

  const orbs = useMemo(() => [
    { x: 10, y: 20, size: 120, dur: 14, delay: 0 },
    { x: 75, y: 55, size: 90, dur: 11, delay: -5 },
    { x: 45, y: 70, size: 150, dur: 18, delay: -9 },
  ], [])

  return (
    <>
      <style>{`
        @keyframes floatGold {
          0%   { transform: translateY(0px) translateX(0px) scale(1); opacity: 0; }
          12%  { opacity: 0.85; }
          50%  { transform: translateY(-90px) translateX(var(--dx, 12px)) scale(1.15); opacity: 0.9; }
          88%  { opacity: 0.4; }
          100% { transform: translateY(-200px) translateX(calc(var(--dx, 12px) * -0.3)) scale(0.5); opacity: 0; }
        }
        @keyframes twinkleGold {
          0%, 100% { opacity: 0.1; transform: scale(0.6); box-shadow: 0 0 3px rgba(253,211,77,.2); }
          50%       { opacity: 1;   transform: scale(1.6); box-shadow: 0 0 12px rgba(253,211,77,.9), 0 0 24px rgba(253,211,77,.3); }
        }
        @keyframes driftOrb {
          0%,100% { transform: translate(0,0) scale(1);    opacity: 0.06; }
          33%     { transform: translate(25px,-18px) scale(1.08); opacity: 0.11; }
          66%     { transform: translate(-18px,10px) scale(0.94); opacity: 0.05; }
        }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {orbs.map((o, i) => (
          <div key={`orb${i}`} style={{
            position: 'absolute',
            width: o.size + 'px',
            height: o.size + 'px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(253,211,77,.35) 0%, rgba(253,211,77,0) 70%)',
            left: o.x + '%',
            top: o.y + '%',
            transform: 'translate(-50%,-50%)',
            animation: `driftOrb ${o.dur}s ${o.delay}s infinite ease-in-out`,
          }} />
        ))}
        {twinklers.map(p => (
          <div key={`t${p.id}`} style={{
            position: 'absolute',
            width: p.size + 'px',
            height: p.size + 'px',
            borderRadius: '50%',
            background: 'rgba(253,211,77,.9)',
            left: p.x + '%',
            top: p.y + '%',
            animation: `twinkleGold ${p.dur}s ${p.delay}s infinite ease-in-out`,
          }} />
        ))}
        {floaters.map(p => (
          <div key={`f${p.id}`} style={{
            position: 'absolute',
            width: p.size + 'px',
            height: p.size + 'px',
            borderRadius: '50%',
            background: 'rgba(253,211,77,.95)',
            left: p.x + '%',
            bottom: '-4px',
            boxShadow: `0 0 ${p.glow}px rgba(253,211,77,.65)`,
            '--dx': p.driftX + 'px',
            animation: `floatGold ${p.dur}s ${p.delay}s infinite linear`,
          }} />
        ))}
      </div>
    </>
  )
}

function RedeemModal({ reward, currentPoints, onClose, onSuccess }) {
  const qc = useQueryClient()
  const [result, setResult] = useState(null)

  const mut = useMutation({
    mutationFn: () => api.post('/points/redeem', { reward_id: reward.id }).then(r => r.data.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['my-points'] })
      qc.invalidateQueries({ queryKey: ['my-redemptions'] })
      setResult(data)
    },
  })

  const canRedeem = currentPoints >= reward.points_cost

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 60px rgba(0,6,28,.9)' }}>
        {result ? (
          // Success: show code
          <>
            <div className="px-6 pt-8 pb-4 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.2)' }}>
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-bold mb-1" style={{ color: '#eaf2ff' }}>¡Canje exitoso!</p>
              <p className="text-sm mb-5" style={{ color: '#8aa0cc' }}>Usa este código para reclamar tu beneficio</p>

              <div className="rounded-xl py-4 px-6 mb-4" style={{ background: 'rgba(253,211,77,.08)', border: '1px solid rgba(253,211,77,.25)' }}>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#8aa0cc' }}>Tu código de canje</p>
                <p className="text-3xl font-black font-mono tracking-widest" style={{ color: '#fcd34d' }}>{result.code}</p>
                <p className="text-xs mt-2" style={{ color: '#8aa0cc' }}>{result.reward_name}</p>
              </div>

              <p className="text-xs mb-5" style={{ color: '#475569' }}>
                Guarda este código. Puedes encontrarlo también en "Mis canjes".
              </p>

              <button onClick={() => { onSuccess(); onClose() }}
                className="w-full text-sm font-semibold py-3 rounded-xl text-white"
                style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)' }}>
                Perfecto, gracias
              </button>
            </div>
          </>
        ) : (
          // Confirm dialog
          <>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <h3 className="font-bold" style={{ color: '#eaf2ff' }}>Confirmar canje</h3>
              <button onClick={onClose} className="text-xl" style={{ color: '#8aa0cc' }}>✕</button>
            </div>
            <div className="px-6 py-5">
              {reward.image_url && (
                <img src={reward.image_url} alt={reward.name}
                  className="w-full h-32 object-cover rounded-xl mb-4" />
              )}
              <p className="font-semibold text-base mb-1" style={{ color: '#eaf2ff' }}>{reward.name}</p>
              {reward.description && <p className="text-sm mb-4" style={{ color: '#8aa0cc' }}>{reward.description}</p>}

              <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(253,211,77,.06)', border: '1px solid rgba(253,211,77,.15)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: '#8aa0cc' }}>Costo del canje</span>
                  <span className="font-bold" style={{ color: '#fcd34d' }}>–{reward.points_cost.toLocaleString()} pts</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm" style={{ color: '#8aa0cc' }}>Tus puntos actuales</span>
                  <span className="font-semibold" style={{ color: '#eaf2ff' }}>{currentPoints.toLocaleString()} pts</span>
                </div>
                <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                  <span className="text-sm font-medium" style={{ color: '#aebfe2' }}>Quedarás con</span>
                  <span className="font-bold text-lg" style={{ color: '#fcd34d' }}>{(currentPoints - reward.points_cost).toLocaleString()} pts</span>
                </div>
              </div>

              {!canRedeem && (
                <p className="text-sm text-center mb-4 py-2 px-4 rounded-xl" style={{ background: 'rgba(239,68,68,.08)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)' }}>
                  Puntos insuficientes. Necesitas {(reward.points_cost - currentPoints).toLocaleString()} pts más.
                </p>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl"
                  style={{ border: '1px solid rgba(255,255,255,.1)', color: '#8aa0cc', background: 'rgba(255,255,255,.04)' }}>
                  Cancelar
                </button>
                <button
                  onClick={() => mut.mutate()}
                  disabled={!canRedeem || mut.isPending}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)' }}>
                  {mut.isPending ? 'Canjeando...' : 'Confirmar canje'}
                </button>
              </div>
              {mut.isError && (
                <p className="text-xs text-center mt-3" style={{ color: '#f87171' }}>
                  {mut.error?.response?.data?.detail || 'Error al canjear'}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ClientPoints() {
  const { user } = useStore()
  const tz = userTz(user)
  const qc = useQueryClient()
  const [redeemModal, setRedeemModal] = useState(null)
  const [section, setSection] = useState('catalog') // 'catalog' | 'history'

  const { data: pointsData } = useQuery({
    queryKey: ['my-points'],
    queryFn: () => api.get('/points/my').then(r => r.data.data),
    refetchInterval: 60000,
  })

  const { data: rewards = [] } = useQuery({
    queryKey: ['rewards-public'],
    queryFn: () => api.get('/points/rewards').then(r => r.data.data),
    staleTime: 60000,
  })

  const { data: redemptions = [] } = useQuery({
    queryKey: ['my-redemptions'],
    queryFn: () => api.get('/points/my-redemptions').then(r => r.data.data),
    staleTime: 0,
  })

  const totalPoints = pointsData?.total_points || 0
  const transactions = pointsData?.transactions || []

  return (
    <FinexyLayout>
      <div style={{ minHeight: '100%', paddingBottom: 40 }}>

        {/* ── Hero banner ───────────────────────────── */}
        <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(120,53,15,.9),rgba(92,40,4,.95),rgba(8,16,44,.98))', borderBottom: '1px solid rgba(253,211,77,.12)', minHeight: 200 }}>
          <ParticlesBg />
          <div className="relative z-10 px-6 py-10 max-w-[1100px] mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(253,211,77,.7)' }}>
                Hola, {user?.full_name?.split(' ')[0]} ·
              </p>
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <p className="text-[72px] font-black leading-none" style={{ color: '#fcd34d', textShadow: '0 0 40px rgba(253,211,77,.4)' }}>
                    {totalPoints.toLocaleString()}
                  </p>
                  <p className="text-lg font-semibold mt-1" style={{ color: 'rgba(253,211,77,.7)' }}>puntos acumulados</p>
                </div>
              </div>
              <p className="text-sm mt-3" style={{ color: 'rgba(255,255,255,.45)' }}>
                Canjea tus puntos por beneficios exclusivos en cada transferencia
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <div className="rounded-2xl px-5 py-3 text-center min-w-[140px]" style={{ background: 'rgba(253,211,77,.08)', border: '1px solid rgba(253,211,77,.2)' }}>
                <p className="text-xs mb-0.5" style={{ color: 'rgba(253,211,77,.6)' }}>Canjeables disponibles</p>
                <p className="text-3xl font-black" style={{ color: '#fcd34d' }}>
                  {rewards.filter(r => totalPoints >= r.points_cost).length}
                </p>
              </div>
              <div className="rounded-2xl px-5 py-3 text-center min-w-[140px]" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                <p className="text-xs mb-0.5" style={{ color: '#8aa0cc' }}>Canjes realizados</p>
                <p className="text-3xl font-black" style={{ color: '#eaf2ff' }}>{redemptions.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section nav ──────────────────────────── */}
        <div className="px-6 pt-6 max-w-[1100px] mx-auto">
          <div className="flex items-center rounded-full p-[3px] gap-0.5 w-fit mb-6" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)' }}>
            {[['catalog', 'Catálogo de canjeables'], ['history', 'Mis canjes']].map(([key, label]) => (
              <button key={key} onClick={() => setSection(key)}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all"
                style={section === key
                  ? { background: 'linear-gradient(135deg,#78350f,#ca8a04)', color: '#fef9c3' }
                  : { color: '#8aa0cc' }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Catalog ───────────────────────────── */}
          {section === 'catalog' && (
            <div>
              {rewards.length === 0 ? (
                <div className="rounded-2xl flex flex-col items-center justify-center py-20" style={GLASS}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(253,211,77,.08)' }}>
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#fcd34d" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>Sin canjeables disponibles</p>
                  <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>Próximamente habrá beneficios para canjear</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rewards.map(r => {
                    const canRedeem = totalPoints >= r.points_cost
                    return (
                      <div key={r.id} className="rounded-2xl overflow-hidden flex flex-col transition-all"
                        style={{ ...GLASS, border: `1px solid ${canRedeem ? 'rgba(253,211,77,.2)' : 'rgba(255,255,255,.07)'}`, boxShadow: canRedeem ? '0 4px 24px rgba(253,211,77,.08)' : 'none' }}>
                        {/* Image */}
                        <div className="h-44 relative overflow-hidden" style={{ background: 'rgba(4,10,30,.9)' }}>
                          {r.image_url
                            ? <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                            : (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke={canRedeem ? 'rgba(253,211,77,.4)' : 'rgba(255,255,255,.12)'} strokeWidth="1.2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                                </svg>
                              </div>
                            )
                          }
                          {canRedeem && (
                            <div className="absolute top-3 right-3">
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(253,211,77,.9)', color: '#1c1400' }}>
                                ¡Disponible!
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-5 flex-1 flex flex-col">
                          <p className="font-bold text-base mb-1" style={{ color: '#eaf2ff' }}>{r.name}</p>
                          {r.description && <p className="text-sm mb-3 flex-1" style={{ color: '#8aa0cc' }}>{r.description}</p>}

                          <div className="mt-auto">
                            <div className="flex items-end justify-between mb-4">
                              <div>
                                <p className="text-2xl font-black" style={{ color: canRedeem ? '#fcd34d' : '#8aa0cc' }}>
                                  {r.points_cost.toLocaleString()}
                                </p>
                                <p className="text-xs" style={{ color: '#8aa0cc' }}>puntos necesarios</p>
                              </div>
                              {!canRedeem && (
                                <p className="text-xs text-right" style={{ color: '#475569' }}>
                                  Faltan<br />
                                  <strong style={{ color: '#64748b' }}>{(r.points_cost - totalPoints).toLocaleString()} pts</strong>
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => canRedeem && setRedeemModal(r)}
                              className="w-full py-3 rounded-xl text-sm font-bold transition-all"
                              style={canRedeem
                                ? { background: 'linear-gradient(135deg,#ca8a04,#eab308)', color: '#1c1400', boxShadow: '0 8px 24px rgba(202,138,4,.3)' }
                                : { background: 'rgba(255,255,255,.05)', color: '#475569', cursor: 'not-allowed' }}>
                              {canRedeem ? 'Canjear ahora →' : 'Puntos insuficientes'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Points activity */}
              {transactions.length > 0 && (
                <div className="mt-6 rounded-2xl overflow-hidden" style={GLASS}>
                  <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    <p className="font-semibold text-sm" style={{ color: '#eaf2ff' }}>Actividad reciente de puntos</p>
                  </div>
                  <div>
                    {transactions.slice(0, 6).map(t => {
                      const isPos = t.points > 0
                      return (
                        <div key={t.id} className="flex items-center justify-between px-6 py-3.5"
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,.04)',
                            borderLeft: `3px solid ${isPos ? 'rgba(74,222,128,.6)' : 'rgba(239,68,68,.6)'}`,
                            background: isPos ? 'rgba(74,222,128,.04)' : 'rgba(239,68,68,.04)',
                          }}>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{
                                background: isPos ? 'rgba(74,222,128,.18)' : 'rgba(239,68,68,.18)',
                                border: `1px solid ${isPos ? 'rgba(74,222,128,.35)' : 'rgba(239,68,68,.35)'}`,
                              }}>
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24"
                                stroke={isPos ? '#4ade80' : '#f87171'} strokeWidth="2.5">
                                {isPos
                                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                                  : <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l7-7m-7 7l-7-7" />
                                }
                              </svg>
                            </div>
                            <p className="text-sm font-medium" style={{ color: isPos ? '#d1fae5' : '#fee2e2' }}>{t.description}</p>
                          </div>
                          <span className="text-sm font-bold px-3 py-1 rounded-full shrink-0"
                            style={{
                              background: isPos ? 'rgba(74,222,128,.15)' : 'rgba(239,68,68,.15)',
                              color: isPos ? '#4ade80' : '#f87171',
                              border: `1px solid ${isPos ? 'rgba(74,222,128,.3)' : 'rgba(239,68,68,.3)'}`,
                            }}>
                            {isPos ? '+' : ''}{t.points} pts
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── My redemptions ───────────────────── */}
          {section === 'history' && (
            <div>
              {redemptions.length === 0 ? (
                <div className="rounded-2xl flex flex-col items-center justify-center py-20" style={GLASS}>
                  <p className="text-sm font-semibold" style={{ color: '#eaf2ff' }}>Sin canjes realizados</p>
                  <p className="text-xs mt-1" style={{ color: '#8aa0cc' }}>Tus códigos de canje aparecerán aquí</p>
                  <button onClick={() => setSection('catalog')}
                    className="mt-4 text-sm font-semibold px-5 py-2 rounded-xl"
                    style={{ background: 'linear-gradient(135deg,#ca8a04,#eab308)', color: '#1c1400' }}>
                    Ver catálogo →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {redemptions.map(r => (
                    <div key={r.id} className="rounded-2xl p-5" style={{ ...GLASS, border: `1px solid ${r.status === 'used' ? 'rgba(74,222,128,.15)' : 'rgba(253,211,77,.15)'}` }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold mb-1" style={{ color: '#eaf2ff' }}>{r.reward_name}</p>
                          <div className="rounded-xl inline-block px-4 py-2 mt-1" style={{ background: 'rgba(253,211,77,.08)', border: '1px solid rgba(253,211,77,.2)' }}>
                            <p className="text-xs font-semibold mb-0.5 uppercase tracking-wider" style={{ color: 'rgba(253,211,77,.6)' }}>Código de canje</p>
                            <p className="text-2xl font-black font-mono tracking-widest" style={{ color: '#fcd34d' }}>{r.code}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full"
                            style={r.status === 'used'
                              ? { background: 'rgba(74,222,128,.1)', color: '#4ade80' }
                              : { background: 'rgba(253,211,77,.1)', color: '#fcd34d' }}>
                            {r.status === 'used' ? '✓ Usado' : '⏳ Pendiente'}
                          </span>
                          <p className="text-xs mt-2" style={{ color: '#475569' }}>
                            {r.points_used.toLocaleString()} pts · {r.created_at ? fmtDateOnly(r.created_at, tz) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {redeemModal && (
        <RedeemModal
          reward={redeemModal}
          currentPoints={totalPoints}
          onClose={() => setRedeemModal(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['my-points'] })}
        />
      )}
    </FinexyLayout>
  )
}
