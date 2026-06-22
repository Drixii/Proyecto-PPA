import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'

const _visitedRoutes = new Set()
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStore } from '../store/useStore'
import api from '../services/api'
import { fmtDateMini, userTz } from '../utils/timezone'
import Portal from './Portal'
import { queryClient } from '../queryClient'

const ADMIN_TABS = [
  { label: 'Mi panel', path: '/admin' },
  { label: 'Pipeline', path: '/admin/pipeline' },
  { label: 'Órdenes', path: '/admin/orders' },
  { label: 'Usuarios', path: '/admin/users' },
  { label: 'Puntos', path: '/admin/points' },
  { label: 'Ajustes', path: '/admin/settings' },
  { label: 'Perfil', path: '/admin/profile' },
]

const CLIENT_TABS = [
  { label: 'Mi panel', path: '/dashboard' },
  { label: 'Transferir', path: '/new-transfer' },
  { label: 'Historial', path: '/historial' },
  { label: 'Mis puntos', path: '/mis-puntos' },
  { label: 'Perfil', path: '/perfil' },
]

const ADMIN_SIDEBAR = [
  { icon: <IcoHome />, path: '/admin', label: 'Inicio', exact: true },
  { icon: <IcoPipeline />, path: '/admin/pipeline', label: 'Pipeline' },
  { icon: <IcoOrders />, path: '/admin/orders', label: 'Órdenes' },
  { icon: <IcoUsers />, path: '/admin/users', label: 'Usuarios' },
  { icon: <IcoGift />, path: '/admin/points', label: 'Puntos' },
  { icon: <IcoSettings />, path: '/admin/settings', label: 'Ajustes' },
  { icon: <IcoProfile />, path: '/admin/profile', label: 'Perfil' },
]

const CLIENT_SIDEBAR = [
  { icon: <IcoHome />, path: '/dashboard', label: 'Inicio', exact: true },
  { icon: <IcoTransfer />, path: '/new-transfer', label: 'Nuevo envío' },
  { icon: <IcoHistory />, path: '/historial', label: 'Historial' },
  { icon: <IcoGift />, path: '/mis-puntos', label: 'Mis puntos' },
  { icon: <IcoProfile />, path: '/perfil', label: 'Perfil' },
]

const SUB_ADMIN_TABS = [
  { label: 'Inicio', path: '/sub-admin' },
  { label: 'Pipeline', path: '/sub-admin/pipeline' },
  { label: 'Órdenes', path: '/sub-admin/orders' },
  { label: 'Perfil', path: '/sub-admin/profile' },
]

const SUB_ADMIN_SIDEBAR = [
  { icon: <IcoHome />, path: '/sub-admin', label: 'Inicio', exact: true },
  { icon: <IcoPipeline />, path: '/sub-admin/pipeline', label: 'Pipeline' },
  { icon: <IcoOrders />, path: '/sub-admin/orders', label: 'Órdenes' },
  { icon: <IcoProfile />, path: '/sub-admin/profile', label: 'Perfil' },
]

function StatusDot({ status }) {
  const colors = { en_aprobacion:'bg-orange-400', en_proceso:'bg-blue-500', completado:'bg-green-500' }
  return <div className={`w-2 h-2 rounded-full shrink-0 ${colors[status]||'bg-[#8aa0cc]'}`} />
}

const STATUS_LABEL = { en_aprobacion:'En Aprobación', en_proceso:'En Proceso', completado:'Completado' }

// ── Client search ─────────────────────────────────────────
function ClientSearch() {
  const [showInput, setShowInput] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const ref = useRef()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setShowInput(false); setQuery('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const { data: allOrders } = useQuery({
    queryKey: ['client-orders-search'],
    queryFn: () => api.get('/orders', { params: { page_size: 200 } }).then(r => r.data.data.items || []),
    staleTime: 60000,
  })

  const filtered = query.length >= 1
    ? (allOrders || []).filter(o =>
        o.receiver_name?.toLowerCase().includes(query.toLowerCase()) ||
        o.order_number?.toLowerCase().includes(query.toLowerCase()) ||
        o.receiver_country?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : []

  if (!showInput) return (
    <button onClick={() => setShowInput(true)}
      className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
      style={{ background: 'rgba(255,255,255,.06)', color: '#8aa0cc', border: '1px solid rgba(255,255,255,.08)' }}>
      <IcoSearch />
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center rounded-xl px-3 py-1.5 gap-2 w-64"
        style={{ background: 'rgba(8,16,44,.9)', border: '1.5px solid rgba(56,189,248,.35)' }}>
        <span style={{ color: '#38bdf8' }}><IcoSearch /></span>
        <input autoFocus value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setShowInput(false); setQuery('') } }}
          placeholder="Buscar receptor, orden, país..."
          className="flex-1 text-sm outline-none"
          style={{ background: 'transparent', color: '#eaf2ff' }}
        />
      </div>
      {query.length >= 1 && (
        <div className="absolute top-full left-0 mt-1.5 min-w-full rounded-xl overflow-hidden z-[300]"
          style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 20px 50px rgba(0,6,28,.7)' }}>
          {filtered.length === 0
            ? <p className="text-xs text-center py-3" style={{ color: '#8aa0cc' }}>Sin resultados</p>
            : filtered.map(order => (
              <button key={order.id}
                onClick={() => { navigate('/dashboard', { state: { openOrderId: order.id } }); setShowInput(false); setQuery('') }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(56,189,248,.08)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-800 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {order.receiver_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: '#eaf2ff' }}>{order.receiver_name}</p>
                  <p className="text-[11px] truncate" style={{ color: '#8aa0cc' }}>{order.order_number} · {order.receiver_country}</p>
                </div>
                <StatusDot status={order.status} />
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ── Admin global search ───────────────────────────────────
function AdminSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const navigate = useNavigate()
  const ref = useRef()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowInput(false); setQuery('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const { data: results, isFetching } = useQuery({
    queryKey: ['admin-search', query],
    queryFn: () => api.get('/admin/orders', { params: { q: query, page_size: 8 } }).then(r => r.data.data.items),
    enabled: query.length >= 2,
    staleTime: 10000,
  })

  const handleKey = (e) => {
    if (e.key === 'Escape') { setShowInput(false); setQuery('') }
    if (e.key === 'Enter' && query.length >= 1) {
      navigate(`/admin/orders?q=${encodeURIComponent(query)}`)
      setShowInput(false); setQuery(''); setOpen(false)
    }
  }

  const goToResult = (order) => {
    navigate(`/admin/orders?q=${encodeURIComponent(order.sender_name)}`)
    setOpen(false); setShowInput(false); setQuery('')
  }

  if (!showInput) {
    return (
      <button onClick={() => setShowInput(true)}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{ background: 'rgba(255,255,255,.06)', color: '#8aa0cc', border: '1px solid rgba(255,255,255,.08)' }}>
        <IcoSearch />
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center rounded-xl px-3 py-1.5 gap-2 w-72"
        style={{ background: 'rgba(8,16,44,.9)', border: '1.5px solid rgba(56,189,248,.35)' }}>
        <span style={{ color: '#38bdf8' }}><IcoSearch /></span>
        <input autoFocus value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={handleKey}
          placeholder="Nombre, orden, RUT, teléfono..."
          className="flex-1 text-sm outline-none"
          style={{ background: 'transparent', color: '#eaf2ff' }}
        />
        {isFetching
          ? <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#38bdf8', borderTopColor: 'transparent' }} />
          : <span className="text-[10px] shrink-0" style={{ color: '#8aa0cc' }}>Enter ↵</span>
        }
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full left-0 mt-1.5 w-full rounded-xl overflow-hidden z-[300]"
          style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 20px 50px rgba(0,6,28,.7)' }}>
          {(!results || results.length === 0) && !isFetching && (
            <p className="text-xs px-4 py-3 text-center" style={{ color: '#8aa0cc' }}>Sin resultados para "{query}"</p>
          )}
          {results?.map(order => (
            <button key={order.id} onClick={() => goToResult(order)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(56,189,248,.08)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-800 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                {order.sender_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: '#eaf2ff' }}>{order.sender_name}</p>
                <p className="text-[11px] truncate" style={{ color: '#8aa0cc' }}>{order.order_number} · {order.receiver_name} · {order.receiver_country}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusDot status={order.status} />
                <span className="text-[10px]" style={{ color: '#8aa0cc' }}>{STATUS_LABEL[order.status]}</span>
              </div>
            </button>
          ))}
          {results && results.length > 0 && (
            <button onClick={() => { navigate(`/admin/orders?q=${encodeURIComponent(query)}`); setOpen(false); setShowInput(false); setQuery('') }}
              className="w-full text-xs py-2.5 text-center font-medium transition-colors"
              style={{ color: '#38bdf8', borderTop: '1px solid rgba(255,255,255,.07)' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(56,189,248,.08)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              Ver todos los resultados para "{query}" →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-admin search ──────────────────────────────────────
function SubAdminSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const navigate = useNavigate()
  const ref = useRef()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowInput(false); setQuery('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const { data: results, isFetching } = useQuery({
    queryKey: ['sub-admin-search', query],
    queryFn: () => api.get('/sub-admin/orders', { params: { q: query, page_size: 8 } }).then(r => r.data.data.items),
    enabled: query.length >= 2,
    staleTime: 10000,
  })

  if (!showInput) return (
    <button onClick={() => setShowInput(true)}
      className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
      style={{ background: 'rgba(255,255,255,.06)', color: '#8aa0cc', border: '1px solid rgba(255,255,255,.08)' }}>
      <IcoSearch />
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center rounded-xl px-3 py-1.5 gap-2 w-64"
        style={{ background: 'rgba(8,16,44,.9)', border: '1.5px solid rgba(56,189,248,.35)' }}>
        <span style={{ color: '#38bdf8' }}><IcoSearch /></span>
        <input autoFocus value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={e => { if (e.key === 'Escape') { setShowInput(false); setQuery('') } }}
          placeholder="Orden, receptor, código..."
          className="flex-1 text-sm outline-none"
          style={{ background: 'transparent', color: '#eaf2ff' }}
        />
        {isFetching && <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#38bdf8', borderTopColor: 'transparent' }} />}
      </div>
      {open && query.length >= 2 && (
        <div className="absolute top-full left-0 mt-1.5 w-full rounded-xl overflow-hidden z-[300]"
          style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 20px 50px rgba(0,6,28,.7)' }}>
          {(!results || results.length === 0) && !isFetching && (
            <p className="text-xs px-4 py-3 text-center" style={{ color: '#8aa0cc' }}>Sin resultados</p>
          )}
          {results?.map(order => (
            <button key={order.id}
              onClick={() => { navigate('/sub-admin/pipeline', { state: { openOrderId: order.id } }); setShowInput(false); setQuery(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(56,189,248,.08)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div className="w-7 h-7 bg-gradient-to-br from-teal-400 to-teal-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                {order.receiver_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: '#eaf2ff' }}>{order.receiver_name}</p>
                <p className="text-[11px] truncate" style={{ color: '#8aa0cc' }}>{order.order_number} · {order.receiver_country}</p>
              </div>
              <StatusDot status={order.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const t = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination)
    osc1.type = 'sine'; osc2.type = 'sine'
    osc1.frequency.setValueAtTime(880, t)
    osc1.frequency.exponentialRampToValueAtTime(1100, t + 0.12)
    osc2.frequency.setValueAtTime(1320, t + 0.12)
    osc2.frequency.exponentialRampToValueAtTime(1760, t + 0.24)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
    gain.gain.setValueAtTime(0.18, t + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
    osc1.start(t); osc1.stop(t + 0.14)
    osc2.start(t + 0.12); osc2.stop(t + 0.38)
  } catch {}
}

// ── Notification status helpers ───────────────────────────
const STATUS_NOTIF = {
  en_aprobacion: { bg: 'rgba(251,146,60,.12)', dot: '#fb923c', label: '#fb923c' },
  en_proceso:    { bg: 'rgba(96,165,250,.12)',  dot: '#60a5fa', label: '#60a5fa' },
  completado:    { bg: 'rgba(74,222,128,.12)',  dot: '#4ade80', label: '#4ade80' },
}
function getNotifStatus(item) {
  const title = item.title || item._label || ''
  const kind  = item.kind  || item._type  || ''
  if (kind === 'message') return null
  if (kind === 'new_order') return 'en_aprobacion'
  if (kind === 'order_assigned') return 'en_proceso'
  if (title.includes(' a Completado') || title.toLowerCase().includes('completada')) return 'completado'
  if (title.includes(' a En Proceso')  || title.includes('→ En Proceso'))  return 'en_proceso'
  if (title.includes(' a En Aprobación')) return 'en_aprobacion'
  return null
}
function isAprobToProc(item) {
  const title = item.title || item._label || ''
  const kind  = item.kind  || item._type  || ''
  return kind === 'order_assigned' || (title.includes('Aprobación') && title.includes('En Proceso'))
}

// ── Floating notification widget ──────────────────────────
function FloatingNotifications({ role }) {
  const { user: _notifUser } = useStore()
  const _notifTz = userTz(_notifUser)
  const [open, setOpen] = useState(false)
  const [cleared, setCleared] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const prevBadgeRef = useRef(0)
  const reopenTimerRef = useRef(null)
  const soundTimerRef = useRef(null)

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data.data),
    refetchInterval: 5000,
    staleTime: 0,
    retry: 1,
  })

  const { data: adminDirect } = useQuery({
    queryKey: ['admin-unread'],
    queryFn: () => api.get('/admin/notifications').then(r => r.data.data),
    enabled: role === 'admin',
    refetchInterval: 5000,
    staleTime: 0,
  })

  const { data: clientDirect } = useQuery({
    queryKey: ['client-unread'],
    queryFn: () => api.get('/orders/notifications').then(r => r.data.data),
    enabled: role === 'client',
    refetchInterval: 5000,
    staleTime: 0,
  })

  const notifUnread = notifData?.unread_count || 0
  const badgeCount = notifUnread
  const hasNotif = badgeCount > 0

  const notifItems = (notifData?.items || []).map(n => ({
    ...n,
    _uid: `n_${n.id}`,
    _type: n.kind,
    _label: n.title,
    _time: new Date(n.created_at).getTime(),
    _unseen: !n.is_read,
  }))

  const directItems = notifItems.length === 0 ? (() => {
    if (role === 'admin') {
      return [
        ...(adminDirect?.pending_orders || []).map(o => ({
          ...o, _uid: `order_${o.id}`, _type: 'new_order', _label: 'Nueva orden',
          _time: new Date(o.created_at).getTime(), _unseen: true, order_id: o.id,
          client_name: o.sender_name, receiver_name: o.receiver_name,
        })),
        ...(adminDirect?.unread_messages || []).map(o => ({
          ...o, _uid: `msg_${o.id}_${o.unread_count}`, _type: 'message',
          _label: `${o.unread_count} mensaje${o.unread_count > 1 ? 's' : ''} de cliente`,
          _time: new Date(o.updated_at || o.created_at).getTime(), _unseen: true, order_id: o.id,
          client_name: o.sender_name, receiver_name: o.receiver_name,
        })),
      ].sort((a, b) => b._time - a._time)
    }
    return [
      ...(clientDirect?.unread_messages || []).map(o => ({
        ...o, _uid: `msg_${o.id}_${o.unread_count}`, _type: 'message',
        _label: `${o.unread_count} mensaje${o.unread_count > 1 ? 's' : ''} del operador`,
        _time: new Date(o.updated_at || o.created_at).getTime(), _unseen: true, order_id: o.id,
        client_name: o.sender_name, receiver_name: o.receiver_name,
      })),
    ].sort((a, b) => b._time - a._time)
  })() : []

  useEffect(() => {
    if (notifItems.length > 0 && cleared) setCleared(false)
  }, [notifItems.length])

  const items = cleared ? [] : (notifItems.length > 0 ? notifItems : directItems)

  useEffect(() => {
    if (badgeCount > prevBadgeRef.current && badgeCount > 0) {
      setOpen(true)
      playNotifSound()
    }
    prevBadgeRef.current = badgeCount
  }, [badgeCount])

  useEffect(() => {
    clearTimeout(reopenTimerRef.current)
    clearInterval(soundTimerRef.current)
    if (hasNotif) {
      reopenTimerRef.current = setTimeout(() => { if (!open) setOpen(true) }, 60000)
      soundTimerRef.current = setInterval(() => playNotifSound(), 60000)
    }
    return () => {
      clearTimeout(reopenTimerRef.current)
      clearInterval(soundTimerRef.current)
    }
  }, [open, hasNotif])

  const markSeen = () => {
    qc.setQueryData(['notifications'], old => old ? { ...old, unread_count: 0, items: (old.items || []).map(i => ({ ...i, is_read: true })) } : old)
    api.post('/notifications/mark-seen').catch(() => {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['admin-unread'] })
    qc.invalidateQueries({ queryKey: ['client-unread'] })
  }

  const handleOpen = () => {
    if (!open) markSeen()
    setOpen(!open)
  }

  const deleteAll = () => {
    setCleared(true)
    qc.setQueryData(['notifications'], { items: [], unread_count: 0 })
    api.delete('/notifications').catch(() => {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['admin-unread'] })
    qc.invalidateQueries({ queryKey: ['client-unread'] })
    setOpen(false)
  }

  const goToOrder = (item) => {
    setOpen(false)
    const tab = item._type === 'message' ? 'chat' : (item._type === 'status_change' ? 'estado' : 'resumen')
    if (role === 'admin') navigate('/admin/pipeline', { state: { openOrderId: item.order_id, openTab: tab } })
    else if (role === 'sub_admin') navigate('/sub-admin/pipeline', { state: { openOrderId: item.order_id, openTab: tab } })
    else navigate('/dashboard', { state: { openOrderId: item.order_id, openTab: tab } })
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[800] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${
          hasNotif ? 'bg-red-500 text-white shadow-red-300' : ''
        }`}
        style={!hasNotif ? { background: 'rgba(8,16,44,.95)', color: '#8aa0cc', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 8px 28px rgba(0,6,28,.5)' } : {}}
        onMouseEnter={e => { if (!hasNotif) e.currentTarget.style.background='rgba(56,189,248,.12)' }}
        onMouseLeave={e => { if (!hasNotif) e.currentTarget.style.background='rgba(8,16,44,.95)' }}
      >
        <IcoBell />
        {hasNotif && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-white text-red-500 text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-red-500 shadow-sm pointer-events-none">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[799]" onClick={() => setOpen(false)} />
          <div className="fixed bottom-36 md:bottom-24 right-6 z-[800] w-80 rounded-2xl overflow-hidden"
            style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 60px rgba(0,6,28,.8)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold" style={{ color: '#eaf2ff' }}>Notificaciones</p>
                {hasNotif && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badgeCount}</span>
                )}
              </div>
              <button onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-sm transition-colors"
                style={{ color: '#8aa0cc' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)'; e.currentTarget.style.color='#eaf2ff' }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8aa0cc' }}>
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-2xl mb-2">🔔</p>
                  <p className="text-xs" style={{ color: '#8aa0cc' }}>Sin notificaciones pendientes</p>
                </div>
              )}
              {items.map((item) => {
                const unseen    = item._unseen ?? !item.is_read
                const isMsg     = item._type === 'message'
                const isStatus  = item._type === 'status_change' || item._type === 'order_assigned'
                const nStatus   = getNotifStatus(item)
                const nCol      = nStatus ? STATUS_NOTIF[nStatus] : null
                const aprobProc = isAprobToProc(item)
                const itemBg    = unseen && nCol ? nCol.bg : (unseen ? 'rgba(74,222,128,.06)' : 'transparent')
                const labelColor = unseen && nCol ? nCol.label : '#8aa0cc'
                const labelWeight = aprobProc ? 'font-bold' : 'font-semibold'
                const dotColor  = unseen && nCol ? nCol.dot : (unseen ? '#4ade80' : 'rgba(255,255,255,.15)')
                return (
                  <button key={item._uid}
                    onClick={() => goToOrder(item)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,.04)', background: itemBg }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(56,189,248,.08)'}
                    onMouseLeave={e => e.currentTarget.style.background=itemBg}>
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {(role === 'admin' ? item.client_name : item.receiver_name)?.[0]?.toUpperCase()}
                      </div>
                      {isMsg  && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white border-2 text-[8px]" style={{ borderColor: '#0a1628' }}>💬</div>}
                      {isStatus && !isMsg && nCol && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-white text-[8px]" style={{ background: nCol.dot, borderColor: '#0a1628' }}>↑</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: '#eaf2ff' }}>
                        {(role === 'admin' || role === 'sub_admin') ? `Cliente: ${item.client_name || ''}` : item.receiver_name || ''}
                      </p>
                      {role === 'sub_admin' && item.super_admin_name && (
                        <p className="text-[10px] truncate font-medium" style={{ color: '#38bdf8' }}>Derivado de {item.super_admin_name}</p>
                      )}
                      <p className={`text-[11px] ${labelWeight} line-clamp-2`} style={{ color: labelColor }}>{item._label}</p>
                      <p className="text-[10px] line-clamp-2" style={{ color: '#64748b' }}>{item.order_number}{item.body ? ` · ${item.body}` : ''}</p>
                      {item.created_at && (
                        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                          {fmtDateMini(item.created_at, _notifTz)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />
                    </div>
                  </button>
                )
              })}
            </div>

            {items.length > 0 && (
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,.07)', background: 'rgba(4,10,30,.6)' }}>
                <p className="text-[10px]" style={{ color: '#64748b' }}>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#fb923c' }} />Aprobación</span>
                  <span className="inline-flex items-center gap-1 ml-2"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#60a5fa' }} />Proceso</span>
                  <span className="inline-flex items-center gap-1 ml-2"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#4ade80' }} />Completado</span>
                </p>
                <button onClick={deleteAll} className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">
                  Eliminar todas
                </button>
              </div>
            )}
          </div>
        </Portal>
      )}
    </>
  )
}

export default function FinexyLayout({ children, fullHeight = false }) {
  const { user, logout } = useStore()
  const location = useLocation()
  const navigate = useNavigate()

  const [welcomeData, setWelcomeData] = useState(null)
  const [welcomeVisible, setWelcomeVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('ksa_welcome_pending')
    if (!raw) return
    try { setWelcomeData(JSON.parse(raw)); setWelcomeVisible(true) } catch {}
    localStorage.removeItem('ksa_welcome_pending')
    return () => {}
  }, [])

  const pathname = location.pathname
  const isFirstVisit = !_visitedRoutes.has(pathname)
  if (isFirstVisit) _visitedRoutes.add(pathname)
  const contentDelay = (welcomeVisible && isFirstVisit) ? '1.85s' : '0s'

  const isAdmin = user?.role === 'admin'
  const isSubAdmin = user?.role === 'sub_admin'
  const tabs = isAdmin ? ADMIN_TABS : (isSubAdmin ? SUB_ADMIN_TABS : CLIENT_TABS)
  const sidebar = isAdmin ? ADMIN_SIDEBAR : (isSubAdmin ? SUB_ADMIN_SIDEBAR : CLIENT_SIDEBAR)

  const mobileBottomNav = isAdmin
    ? [
        { icon: <IcoHome />, path: '/admin', label: 'Inicio', exact: true },
        { icon: <IcoPipeline />, path: '/admin/pipeline', label: 'Pipeline' },
        { icon: <IcoOrders />, path: '/admin/orders', label: 'Órdenes' },
      ]
    : isSubAdmin
      ? [
          { icon: <IcoHome />, path: '/sub-admin', label: 'Inicio', exact: true },
          { icon: <IcoPipeline />, path: '/sub-admin/pipeline', label: 'Pipeline' },
          { icon: <IcoOrders />, path: '/sub-admin/orders', label: 'Órdenes' },
          { icon: <IcoProfile />, path: '/sub-admin/profile', label: 'Perfil' },
        ]
      : [
          { icon: <IcoHome />, path: '/dashboard', label: 'Inicio', exact: true },
          { icon: <IcoTransfer />, path: '/new-transfer', label: 'Transferir' },
          { icon: <IcoHistory />, path: '/historial', label: 'Historial' },
          { icon: <IcoGift />, path: '/mis-puntos', label: 'Mis puntos' },
        ]

  const slideMenuItems = isAdmin
    ? [
        { icon: <IcoUsers />, path: '/admin/users', label: 'Usuarios' },
        { icon: <IcoGift />, path: '/admin/points', label: 'Puntos' },
        { icon: <IcoSettings />, path: '/admin/settings', label: 'Ajustes' },
        { icon: <IcoProfile />, path: '/admin/profile', label: 'Perfil' },
      ]
    : isSubAdmin
      ? [
          { icon: <IcoProfile />, path: '/sub-admin/profile', label: 'Perfil' },
        ]
      : [{ icon: <IcoProfile />, path: '/perfil', label: 'Perfil' }]

  const isTabActive = (path) => {
    if (path === '/admin' || path === '/dashboard' || path === '/sub-admin') return location.pathname === path
    return location.pathname.startsWith(path)
  }

  return (
    <>
    <div className="flex h-screen" style={{ background: '#060d22', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes notif-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}}
        @keyframes welcomeFade{0%{opacity:0;transform:translateY(10px)}18%{opacity:1;transform:none}82%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-8px)}}
        @keyframes pageEnter{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
        .slide-panel{animation:slideInRight .26s cubic-bezier(.16,1,.3,1) both;}
        .finexy-scrollbar::-webkit-scrollbar{width:4px}
        .finexy-scrollbar::-webkit-scrollbar-track{background:transparent}
        .finexy-scrollbar::-webkit-scrollbar-thumb{background:rgba(56,189,248,.2);border-radius:4px}
        .finexy-tab-active{background:linear-gradient(135deg,#1e3a6e,#1e40af)!important;color:#fff!important;box-shadow:0 4px 14px rgba(37,99,235,.35)!important;}
        .finexy-page-enter{animation:pageEnter .65s cubic-bezier(.16,1,.3,1) both;}
        h1,h2,h3,h4,h5,h6{color:#eaf2ff}
      `}</style>

      {/* Ambient glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(600px 500px at 0% 50%,rgba(37,99,235,.14),transparent 60%),radial-gradient(500px 400px at 100% 0%,rgba(56,189,248,.08),transparent 60%)' }} />

      {/* ── Icon Sidebar (desktop only) ─────────── */}
      <aside className="hidden md:flex w-[68px] flex-col items-center py-5 shrink-0 z-10"
        style={{ background: 'rgba(8,16,44,.92)', borderRight: '1px solid rgba(255,255,255,.06)', position: 'relative' }}>

        {/* Logo */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-800 flex items-center justify-center text-white text-[10px] font-black tracking-tight mb-6 shadow-lg"
          style={{ boxShadow: '0 8px 20px rgba(56,189,248,.3)' }}>
          CC
        </div>

        {/* Nav icons */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          {sidebar.map(({ icon, path, label, exact }) => {
            const active = exact ? location.pathname === path : location.pathname.startsWith(path)
            return (
              <Link key={path} to={path} title={label}
                className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200"
                style={active
                  ? { background: 'linear-gradient(135deg,#1e3a6e,#1e40af)', color: '#fff', boxShadow: '0 6px 18px rgba(37,99,235,.4)' }
                  : { color: '#8aa0cc' }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background='rgba(56,189,248,.1)'; e.currentTarget.style.color='#7dd3fc' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8aa0cc' } }}>
                {icon}
              </Link>
            )
          })}
        </div>

        {/* Logout */}
        <div className="flex flex-col items-center gap-1.5 mt-2">
          <button title="Cerrar sesión" onClick={() => { queryClient.clear(); logout(); navigate('/') }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors"
            style={{ color: '#8aa0cc' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,.12)'; e.currentTarget.style.color='#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8aa0cc' }}>
            <IcoLogout />
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ position: 'relative', zIndex: 1 }}>

        {/* Top navbar */}
        <header className="h-[60px] flex items-center px-3 md:px-6 gap-2 md:gap-4 shrink-0"
          style={{ background: 'rgba(8,16,44,.92)', borderBottom: '1px solid rgba(255,255,255,.06)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 30 }}>

          {/* Mobile logo */}
          <div className="flex md:hidden items-center gap-2 mr-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-800 flex items-center justify-center text-white text-[9px] font-black shrink-0">
              CC
            </div>
          </div>

          {/* Tabs pill (desktop) */}
          <nav className="hidden md:flex items-center rounded-full p-[3px] gap-0.5"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)' }}>
            {tabs.map(({ label, path }) => {
              const active = isTabActive(path)
              return (
                <Link key={path} to={path}
                  className={`px-4 py-[6px] rounded-full text-sm font-medium transition-all duration-200${active ? ' finexy-tab-active' : ''}`}
                  style={!active ? { color: '#8aa0cc' } : {}}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color='#7dd3fc' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color='#8aa0cc' }}>
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Mobile: current page title */}
          <p className="flex md:hidden text-sm font-semibold truncate" style={{ color: '#eaf2ff' }}>
            {tabs.find(t => isTabActive(t.path))?.label || ''}
          </p>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-1.5 md:gap-2">
            {isAdmin ? <AdminSearch /> : isSubAdmin ? <SubAdminSearch /> : <ClientSearch />}

            {/* User bubble (desktop) */}
            <div className="hidden md:flex items-center gap-2 rounded-full pl-[3px] pr-3 py-[3px] ml-1"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                {user?.avatar
                  ? <img src={`/uploads/avatars/${user.avatar}`} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-800 flex items-center justify-center text-white text-xs font-bold">{user?.full_name?.[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="leading-tight">
                <p className="text-xs font-semibold max-w-[110px] truncate" style={{ color: '#eaf2ff' }}>{user?.full_name}</p>
                <p className="text-[10px] truncate" style={{ color: '#8aa0cc' }}>{user?.email}</p>
              </div>
            </div>

            {/* Mobile hamburger menu */}
            <button onClick={() => setMenuOpen(true)}
              className="flex md:hidden w-8 h-8 rounded-full items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,.05)', color: '#8aa0cc', border: '1px solid rgba(255,255,255,.08)' }}>
              <IcoMenu />
            </button>
          </div>
        </header>

        {/* Content area */}
        <main
          key={pathname}
          className={`flex-1 min-h-0 finexy-scrollbar ${fullHeight ? 'overflow-hidden flex flex-col' : 'overflow-auto'} pb-16 md:pb-0${isFirstVisit ? ' finexy-page-enter' : ''}`}
          style={isFirstVisit ? { animationDelay: contentDelay } : {}}
        >
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around z-50"
        style={{ background: 'rgba(8,16,44,.96)', borderTop: '1px solid rgba(255,255,255,.07)', backdropFilter: 'blur(20px)' }}>
        {mobileBottomNav.map(({ icon, path, label, exact }) => {
          const active = exact ? location.pathname === path : location.pathname.startsWith(path)
          return (
            <Link key={path} to={path}
              className="flex flex-col items-center gap-0.5 py-2 px-4 transition-colors"
              style={{ color: active ? '#38bdf8' : '#8aa0cc' }}>
              <div className="p-1 rounded-xl" style={{ background: active ? 'rgba(56,189,248,.12)' : 'transparent' }}>
                {icon}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>

    {/* ── Mobile slide menu ────────────────────────── */}
    {menuOpen && (
      <>
        <div className="md:hidden fixed inset-0 z-[200]"
          style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMenuOpen(false)} />
        <div className="md:hidden fixed top-0 right-0 h-full w-72 z-[201] flex flex-col slide-panel"
          style={{ background: '#080f28', borderLeft: '1px solid rgba(255,255,255,.08)', boxShadow: '-20px 0 60px rgba(0,6,28,.6)' }}>

          {/* Panel header — user info */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,.07)', background: 'rgba(8,16,44,.6)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                {user?.avatar
                  ? <img src={`/uploads/avatars/${user.avatar}`} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-800 flex items-center justify-center text-white text-sm font-bold">{user?.full_name?.[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="leading-tight min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#eaf2ff' }}>{user?.full_name}</p>
                <p className="text-xs truncate" style={{ color: '#8aa0cc' }}>{user?.email}</p>
              </div>
            </div>
            <button onClick={() => setMenuOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 ml-2 transition-colors"
              style={{ color: '#8aa0cc' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)'; e.currentTarget.style.color='#eaf2ff' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8aa0cc' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {slideMenuItems.map(({ icon, path, label }) => {
              const active = location.pathname.startsWith(path)
              return (
                <Link key={path} to={path} onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={active
                    ? { background: 'linear-gradient(135deg,#1e3a6e,#1e40af)', color: '#fff' }
                    : { color: '#8aa0cc' }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background='rgba(56,189,248,.08)'; e.currentTarget.style.color='#7dd3fc' } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8aa0cc' } }}>
                  {icon}
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Logout */}
          <div className="px-3 pb-8 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
            <button onClick={() => { queryClient.clear(); logout(); navigate('/'); setMenuOpen(false) }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium w-full transition-colors"
              style={{ color: '#f87171' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,.1)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <IcoLogout />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </>
    )}

    {welcomeData && welcomeVisible && (
      <div
        style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', animation:'welcomeFade 2.2s ease-in-out both' }}
        onAnimationEnd={() => setWelcomeVisible(false)}
      >
        <div style={{ textAlign:'center' }}>
          <p style={{ margin:'0 0 10px', fontSize:'clamp(13px,1.4vw,17px)', fontWeight:600, letterSpacing:'.16em', textTransform:'uppercase', color:'#38bdf8' }}>
            {welcomeData.returning ? 'Bienvenido de vuelta' : 'Bienvenido'}
          </p>
          <h1 style={{ margin:0, fontSize:'clamp(52px,7vw,88px)', fontWeight:700, color:'#fff', letterSpacing:'-.03em', lineHeight:1, textShadow:'0 0 60px rgba(56,189,248,.55), 0 0 120px rgba(129,140,248,.3)', fontFamily:"'Space Grotesk',system-ui,sans-serif" }}>
            {welcomeData.name}
          </h1>
        </div>
      </div>
    )}

    <FloatingNotifications role={user?.role} />
    </>
  )
}

// ── Inline SVG icons (no dependency) ──────────────

function IcoHome() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function IcoPipeline() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  )
}

function IcoSettings() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IcoOrders() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function IcoHistory() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IcoTransfer() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  )
}

function IcoLogout() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

function IcoSearch() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function IcoProfile() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function IcoUsers() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IcoBell() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function IcoMenu() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function IcoGift() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  )
}
