import { useState, useRef } from 'react'
import Portal from './Portal'
import { flagUrl } from '../utils/flags'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function FilterDropdown({ subAdmins, filterMode, onChange }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef()

  const toggle = () => {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect())
    }
    setOpen(v => !v)
  }

  const isActive = filterMode.type !== 'none'
  const label = filterMode.type === 'none' ? 'Filtro'
    : filterMode.type === 'all' ? 'Todos los países'
    : filterMode.name

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium shadow-sm transition-colors"
        style={isActive
          ? {background:'#2563eb', border:'1px solid #2563eb', color:'#fff'}
          : {background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zM9 16a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" />
        </svg>
        <span className="max-w-[120px] truncate">{label}</span>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="shrink-0" style={{color:'#8aa0cc', opacity:.7}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && rect && (
        <Portal>
          <div className="fixed inset-0 z-[600]" onClick={() => setOpen(false)} />
          <div
            className="z-[601] rounded-2xl overflow-hidden w-64"
            style={{ position: 'fixed', top: rect.bottom + 6, left: rect.left, ...GLASS }}
            onClick={e => e.stopPropagation()}
          >
            {/* All countries option */}
            <button
              onClick={() => { onChange({ type: 'all' }); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors font-medium"
              style={filterMode.type === 'all'
                ? {background:'rgba(56,189,248,.15)', color:'#38bdf8', borderBottom:'1px solid rgba(255,255,255,.06)'}
                : {color:'#aebfe2', borderBottom:'1px solid rgba(255,255,255,.06)'}}
              onMouseEnter={e=>{ if(filterMode.type!=='all') e.currentTarget.style.background='rgba(56,189,248,.08)' }}
              onMouseLeave={e=>{ if(filterMode.type!=='all') e.currentTarget.style.background='transparent' }}
            >
              <span className="text-base">🌎</span>
              Todos los países
              {filterMode.type === 'all' && <span className="ml-auto" style={{color:'#38bdf8'}}>✓</span>}
            </button>

            {/* Sub-admins (encargados) section */}
            {subAdmins.length > 0 && (
              <>
                <div className="px-4 pt-2.5 pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{color:'#64748b'}}>Por encargado</p>
                </div>
                {subAdmins.map(sa => {
                  const isSelected = filterMode.type === 'subadmin' && filterMode.id === sa.id
                  return (
                    <button
                      key={sa.id}
                      onClick={() => { onChange({ type: 'subadmin', id: sa.id, name: sa.full_name }); setOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
                      style={isSelected
                        ? {background:'rgba(56,189,248,.15)', color:'#38bdf8', fontWeight:600}
                        : {color:'#aebfe2'}}
                      onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background='rgba(56,189,248,.08)' }}
                      onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background='transparent' }}
                    >
                      <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {sa.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-medium truncate">{sa.full_name}</p>
                        <div className="flex gap-0.5 mt-0.5 flex-wrap">
                          {(sa.managed_countries || []).slice(0, 3).map(c => {
                            const url = flagUrl(c)
                            return url ? <img key={c} src={url} alt={c} title={c} className="w-4 h-[11px] rounded-sm object-cover" /> : null
                          })}
                          {(sa.managed_countries || []).length > 3 && (
                            <span className="text-[9px]" style={{color:'#64748b'}}>+{sa.managed_countries.length - 3}</span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="shrink-0" style={{color:'#38bdf8'}}>✓</span>
                      )}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </Portal>
      )}
    </>
  )
}
