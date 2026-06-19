import { useState, useRef, useEffect } from 'react'

const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const subDays = (d, n) => sod(new Date(+d - n * 86400000))
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth = (d) => eod(new Date(d.getFullYear(), d.getMonth() + 1, 0))
const startOfYear = (d) => new Date(d.getFullYear(), 0, 1)
const prevMonth = (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
const nextMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
const isSameDay = (a, b) => sod(a).getTime() === sod(b).getTime()
const inRange = (d, a, b) => { const x=sod(d),lo=sod(a),hi=sod(b); return x>lo&&x<hi }
const getDays = (y, m) => new Date(y, m+1, 0).getDate()
const getFirstDow = (y, m) => new Date(y, m, 1).getDay()

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS = ['Do','Lu','Ma','Mi','Ju','Vi','Sá']
const TODAY = sod(new Date())

const fmt = (d) => d ? d.toLocaleDateString('es-CL', { day:'numeric', month:'short', year:'numeric' }) : ''

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const PRESETS = [
  { id:'today',     label:'Hoy',             fn: () => ({ from:TODAY, to:eod(TODAY) }) },
  { id:'yesterday', label:'Ayer',            fn: () => { const d=subDays(TODAY,1); return {from:d,to:eod(d)} } },
  { id:'last7',     label:'Últimos 7 días',  fn: () => ({ from:subDays(TODAY,6), to:eod(TODAY) }) },
  { id:'last30',    label:'Últimos 30 días', fn: () => ({ from:subDays(TODAY,29), to:eod(TODAY) }) },
  { id:'month',     label:'Este mes',        fn: () => ({ from:startOfMonth(TODAY), to:eod(TODAY) }) },
  { id:'lastmonth', label:'Mes anterior',    fn: () => { const m=prevMonth(TODAY); return {from:startOfMonth(m),to:endOfMonth(m)} } },
  { id:'year',      label:'Este año',        fn: () => ({ from:startOfYear(TODAY), to:eod(TODAY) }) },
]

function MonthGrid({ base, selFrom, selTo, hover, onDay, onHover }) {
  const y=base.getFullYear(), m=base.getMonth()
  const total=getDays(y,m), first=getFirstDow(y,m)
  const cells=[...Array(first).fill(null), ...Array.from({length:total},(_,i)=>new Date(y,m,i+1))]
  const [hCell, setHCell] = useState(null)

  return (
    <div className="w-[210px]">
      <p className="text-sm font-semibold text-center mb-2" style={{color:'#eaf2ff'}}>{MONTHS[m]} {y}</p>
      <div className="grid grid-cols-7">
        {DAYS.map(d=><div key={d} className="text-center text-[11px] font-medium py-1" style={{color:'#64748b'}}>{d}</div>)}
        {cells.map((date,i) => {
          if(!date) return <div key={`n${i}`}/>
          const isStart = selFrom && isSameDay(date, selFrom)
          const isEnd   = selTo   && isSameDay(date, selTo)
          const mid     = selFrom && (selTo||hover) && inRange(date, selFrom, selTo||hover)
          const isNow   = isSameDay(date, TODAY)
          let cellStyle = { color:'#aebfe2' }
          if (isStart)        cellStyle = { background:'#38bdf8', color:'#060d22', borderRadius:'50% 0 0 50%' }
          else if (isEnd)     cellStyle = { background:'#38bdf8', color:'#060d22', borderRadius:'0 50% 50% 0' }
          else if (mid)       cellStyle = { background:'rgba(56,189,248,.15)', color:'#7dd3fc', borderRadius:0 }
          else if (hCell===i) cellStyle = { color:'#aebfe2', background:'rgba(255,255,255,.06)', borderRadius:'50%' }
          else if (isNow)     cellStyle = { color:'#aebfe2', background:'rgba(255,255,255,.08)', borderRadius:'50%' }
          return (
            <div key={i} onClick={()=>onDay(date)}
              onMouseEnter={()=>{ onHover(date); setHCell(i) }}
              onMouseLeave={()=>setHCell(null)}
              style={cellStyle}
              className={`text-center text-sm py-[5px] cursor-pointer select-none transition-colors relative${isNow&&!isStart&&!isEnd?' font-bold':''}`}>
              {isNow&&!isStart&&!isEnd&&<span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{background:'#38bdf8'}}/>}
              {date.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DateRangePicker({ value, onChange, className='' }) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState('today')
  const [tempFrom, setTempFrom] = useState(null)
  const [tempTo, setTempTo] = useState(null)
  const [hover, setHover] = useState(null)
  const [view, setView] = useState(prevMonth(TODAY))
  const ref = useRef()

  useEffect(()=>{
    const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[])

  const applyPreset = (preset) => {
    setActivePreset(preset.id)
    const range = preset.fn()
    setTempFrom(range.from)
    setTempTo(range.to)
    onChange(range)
    setOpen(false)
  }

  const handleDay = (date) => {
    if(!tempFrom||(tempFrom&&tempTo)){
      setTempFrom(sod(date)); setTempTo(null)
    } else {
      const a=sod(date)<tempFrom?sod(date):tempFrom
      const b=sod(date)<tempFrom?eod(tempFrom):eod(date)
      setTempFrom(a); setTempTo(b)
      setActivePreset('custom')
    }
  }

  const applyCustom = () => {
    if(tempFrom&&tempTo){ onChange({from:tempFrom,to:tempTo}); setOpen(false) }
  }

  const view2 = nextMonth(view)

  // Sync calendar selection when value changes externally
  useEffect(()=>{
    if(value?.from) setTempFrom(value.from)
    if(value?.to) setTempTo(value.to)
  },[value])

  const label = value?.from&&value?.to
    ? `${fmt(value.from)}  →  ${fmt(value.to)}`
    : 'Hoy'

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button onClick={()=>setOpen(!open)}
        className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors shadow-sm"
        style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}>
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        {label}
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{color:'#8aa0cc'}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 rounded-2xl flex overflow-hidden"
          style={GLASS}>
          {/* Left: presets */}
          <div className="w-40 py-3 shrink-0" style={{borderRight:'1px solid rgba(255,255,255,.07)'}}>
            {PRESETS.map(p=>(
              <button key={p.id} onClick={()=>applyPreset(p)}
                className="w-full text-left px-4 py-2 text-sm transition-colors"
                style={activePreset===p.id?{background:'rgba(56,189,248,.15)',color:'#38bdf8',fontWeight:600}:{color:'#aebfe2'}}
                onMouseEnter={e=>{ if(activePreset!==p.id) e.currentTarget.style.background='rgba(56,189,248,.08)' }}
                onMouseLeave={e=>{ if(activePreset!==p.id) e.currentTarget.style.background='transparent' }}>
                {p.label}
              </button>
            ))}
            <div className="mt-2 pt-2" style={{borderTop:'1px solid rgba(255,255,255,.07)'}}>
              <button onClick={()=>setActivePreset('custom')}
                className="w-full text-left px-4 py-2 text-sm transition-colors"
                style={activePreset==='custom'?{background:'rgba(56,189,248,.15)',color:'#38bdf8',fontWeight:600}:{color:'#aebfe2'}}
                onMouseEnter={e=>{ if(activePreset!=='custom') e.currentTarget.style.background='rgba(56,189,248,.08)' }}
                onMouseLeave={e=>{ if(activePreset!=='custom') e.currentTarget.style.background='transparent' }}>
                Personalizado
              </button>
            </div>
          </div>

          {/* Right: calendar (ALWAYS visible) */}
          <div className="p-5">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={()=>setView(prevMonth(view))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xl leading-none transition-colors"
                style={{color:'#8aa0cc'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>‹</button>
              <div className="flex gap-[100px] px-2">
                <span className="text-xs font-medium" style={{color:'#8aa0cc'}}>{MONTHS[view.getMonth()].substring(0,3)} {view.getFullYear()}</span>
                <span className="text-xs font-medium" style={{color:'#8aa0cc'}}>{MONTHS[view2.getMonth()].substring(0,3)} {view2.getFullYear()}</span>
              </div>
              <button onClick={()=>setView(nextMonth(view))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xl leading-none transition-colors"
                style={{color:'#8aa0cc'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>›</button>
            </div>

            <div className="flex gap-6">
              <MonthGrid base={view} selFrom={tempFrom} selTo={tempTo} hover={hover} onDay={handleDay} onHover={setHover}/>
              <MonthGrid base={view2} selFrom={tempFrom} selTo={tempTo} hover={hover} onDay={handleDay} onHover={setHover}/>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-3" style={{borderTop:'1px solid rgba(255,255,255,.07)'}}>
              <div className="flex items-center gap-2">
                <div className="rounded-lg px-3 py-1 text-xs min-w-[100px] text-center"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#aebfe2', background:'rgba(6,13,40,.6)'}}>
                  {tempFrom ? fmt(tempFrom) : 'Inicio'}
                </div>
                <span className="text-sm" style={{color:'#64748b'}}>→</span>
                <div className="rounded-lg px-3 py-1 text-xs min-w-[100px] text-center"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#aebfe2', background:'rgba(6,13,40,.6)'}}>
                  {tempTo ? fmt(tempTo) : 'Fin'}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setOpen(false)}
                  className="px-4 py-1.5 text-xs rounded-lg transition-colors"
                  style={{color:'#8aa0cc', background:'transparent', border:'none'}}>
                  Cancelar
                </button>
                <button onClick={applyCustom} disabled={!tempFrom||!tempTo}
                  className="px-4 py-1.5 text-xs rounded-lg font-semibold disabled:opacity-40 transition-opacity"
                  style={{background:'linear-gradient(135deg,#38bdf8,#818cf8)', color:'#060d22', border:'none'}}>
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
