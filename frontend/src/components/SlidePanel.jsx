import { useEffect } from 'react'

export default function SlidePanel({ open, onClose, title, subtitle, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background:'rgba(2,6,20,.65)', backdropFilter:'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full ${width} z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background:'#080f28', borderLeft:'1px solid rgba(56,189,248,.12)', boxShadow:'-20px 0 60px rgba(0,6,28,.7)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 shrink-0" style={{ borderBottom:'1px solid rgba(255,255,255,.07)', background:'rgba(6,13,40,.9)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color:'#eaf2ff' }}>{title}</h2>
            {subtitle && <p className="text-sm mt-0.5" style={{ color:'#8aa0cc' }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors ml-4 shrink-0"
            style={{ color:'#8aa0cc' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)'; e.currentTarget.style.color='#eaf2ff' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8aa0cc' }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </>
  )
}
