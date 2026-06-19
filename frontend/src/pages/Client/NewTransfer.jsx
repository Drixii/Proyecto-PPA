import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FinexyLayout from '../../components/FinexyLayout'
import api from '../../services/api'
import { useStore } from '../../store/useStore'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

const ID_TYPES = ['RUT', 'Cédula', 'DNI', 'Pasaporte', 'Otro']
const INTEGER_CURRENCIES = ['CLP', 'COP', 'VES', 'ARS', 'PYG']

const SEND_CURRENCIES = [
  { code: 'CLP', iso2: 'cl', name: 'Peso Chileno' },
  { code: 'COP', iso2: 'co', name: 'Peso Colombiano' },
  { code: 'USD', iso2: 'us', name: 'Dólar Americano' },
  { code: 'EUR', iso2: 'eu', name: 'Euro' },
  { code: 'PEN', iso2: 'pe', name: 'Sol Peruano' },
  { code: 'BRL', iso2: 'br', name: 'Real Brasileño' },
  { code: 'MXN', iso2: 'mx', name: 'Peso Mexicano' },
]

const COUNTRY_CODE = {
  'Venezuela': 've', 'Colombia': 'co', 'Argentina': 'ar', 'Perú': 'pe',
  'Chile': 'cl', 'Ecuador': 'ec', 'Bolivia': 'bo', 'Paraguay': 'py',
  'Uruguay': 'uy', 'México': 'mx', 'Brasil': 'br', 'Panamá': 'pa',
  'Costa Rica': 'cr', 'Guatemala': 'gt', 'Honduras': 'hn',
  'Nicaragua': 'ni', 'El Salvador': 'sv', 'Cuba': 'cu',
  'República Dominicana': 'do', 'Estados Unidos': 'us', 'España': 'es',
  'Peru': 'pe',
}

function flagUrl(country) {
  const code = COUNTRY_CODE[country]
  return code ? `https://flagcdn.com/20x15/${code}.png` : null
}

function currencyFlagUrl(iso2) {
  return `https://flagcdn.com/20x15/${iso2}.png`
}

function formatDisplay(num, currency) {
  if (!num && num !== 0) return ''
  const isInt = INTEGER_CURRENCIES.includes(currency)
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: isInt ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(num)
}

function parseRaw(str) {
  return parseInt((str || '').replace(/\D/g, '')) || 0
}

function ChevronDown() {
  return (
    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="shrink-0" style={{color:'#8aa0cc'}}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function FromDropdown({ value, onChange, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-[400] min-w-[210px] overflow-hidden"
      style={{background:'rgba(8,16,44,.95)', border:'1px solid rgba(255,255,255,.08)'}}>
      {SEND_CURRENCIES.map(c => (
        <button key={c.code} type="button"
          onClick={() => { onChange(c.code); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
          style={{background: value === c.code ? 'rgba(56,189,248,.12)' : 'transparent', color:'#eaf2ff'}}>
          <img src={currencyFlagUrl(c.iso2)} alt="" className="w-5 h-[14px] rounded-sm object-cover shrink-0"
            onError={e => { e.target.style.display = 'none' }} />
          <span className="text-sm font-bold">{c.code}</span>
          <span className="text-xs flex-1 text-right truncate" style={{color:'#8aa0cc'}}>{c.name}</span>
        </button>
      ))}
    </div>
  )
}

function ToDropdown({ countries, value, onChange, onClose }) {
  const [search, setSearch] = useState('')
  const ref = useRef()
  const inputRef = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])
  const filtered = search
    ? countries.filter(c => c.country.toLowerCase().includes(search.toLowerCase()))
    : countries
  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-[400] w-56 overflow-hidden"
      style={{background:'rgba(8,16,44,.95)', border:'1px solid rgba(255,255,255,.08)'}}>
      <div className="p-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
        <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{background:'rgba(6,13,40,.8)'}}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="shrink-0" style={{color:'#8aa0cc'}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar país..."
            className="flex-1 text-xs outline-none bg-transparent"
            style={{color:'#eaf2ff'}} />
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-center py-4" style={{color:'#8aa0cc'}}>Sin resultados</p>
        )}
        {filtered.map(c => (
          <button key={c.country} type="button"
            onClick={() => { onChange(c); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
            style={{background: value === c.country ? 'rgba(56,189,248,.1)' : 'transparent'}}>
            {flagUrl(c.country)
              ? <img src={flagUrl(c.country)} alt="" className="w-5 h-[14px] rounded-sm object-cover shrink-0" />
              : <span className="w-5 h-[14px] rounded-sm shrink-0" style={{background:'rgba(255,255,255,.06)'}} />
            }
            <span className="flex-1 text-sm font-medium" style={{color:'#eaf2ff'}}>{c.country}</span>
            <span className="text-xs font-mono shrink-0" style={{color:'#8aa0cc'}}>{c.currency}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Steps per path
const NUEVO_STEPS = ['Destino', 'Receptor', 'Calcular', 'Pago', 'Confirmar']
const ANTERIOR_STEPS = ['Destino', 'Calcular', 'Pago', 'Confirmar']

export default function NewTransfer() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useStore()
  const prefill = location.state || {}
  const prefillReceiver = prefill.prefillReceiver || null

  // Internal steps: 0=Destino, 1=Receptor, 2=Calcular, 3=Pago, 4=Confirmar
  // "Enviar nuevamente" (prefillReceiver) jumps directly to Calcular (step 2)
  const [step, setStep] = useState(prefillReceiver ? 2 : 0)
  const [destinatarioType, setDestinatarioType] = useState(prefillReceiver ? 'anterior' : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [proofFile, setProofFile] = useState(null)
  const [proofPreview, setProofPreview] = useState(null)
  const [editingContact, setEditingContact] = useState(false)

  const [calc, setCalc] = useState({
    amount: prefill.amount || '',
    fromCurrency: prefill.fromCurrency || 'CLP',
    toCountry: prefill.toCountry || prefillReceiver?.receiver_country || 'Venezuela',
    toCurrency: prefill.toCurrency || 'VES',
    result: prefill.result || null,
  })

  const [receiver, setReceiver] = useState({
    receiver_name: prefillReceiver?.receiver_name || '',
    receiver_phone: prefillReceiver?.receiver_phone || '',
    receiver_country: prefillReceiver?.receiver_country || prefill.toCountry || 'Venezuela',
    receiver_bank_id: prefillReceiver?.receiver_bank_id || '',
    receiver_account: prefillReceiver?.receiver_account || '',
    receiver_id_type: prefillReceiver?.receiver_id_type || 'Cédula',
    receiver_id_num: prefillReceiver?.receiver_id_num || '',
  })

  const [payment, setPayment] = useState({ payment_method: 'transferencia', payment_bank: '' })

  const PAYMENT_BANKS = [
    'BancoEstado', 'Banco de Chile', 'Santander', 'BCI', 'BBVA',
    'Itaú', 'Scotiabank', 'Security', 'Falabella', 'Ripley',
  ]

  const handleProofChange = (file) => {
    if (!file) { setProofFile(null); setProofPreview(null); return }
    setProofFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setProofPreview(e.target.result)
      reader.readAsDataURL(file)
    } else {
      setProofPreview(null)
    }
  }

  const [displayAmount, setDisplayAmount] = useState(
    calc.amount ? formatDisplay(parseRaw(String(calc.amount)), calc.fromCurrency) : ''
  )
  const [liveResult, setLiveResult] = useState(calc.result || null)
  const [liveLoading, setLiveLoading] = useState(false)

  const rawAmount = parseRaw(displayAmount)
  const selectedFrom = SEND_CURRENCIES.find(c => c.code === calc.fromCurrency)

  useEffect(() => {
    if (!rawAmount) { setLiveResult(null); return }
    setLiveLoading(true)
    setLiveResult(null)
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/rates/convert', {
          params: { from: calc.fromCurrency, to: calc.toCurrency, amount: rawAmount }
        })
        setLiveResult(res.data.data)
      } catch {
        setLiveResult(null)
      } finally {
        setLiveLoading(false)
      }
    }, 600)
    return () => { clearTimeout(t); setLiveLoading(false) }
  }, [displayAmount, calc.fromCurrency, calc.toCurrency])

  const handleAmountChange = (e) => {
    const num = parseRaw(e.target.value)
    if (!e.target.value.replace(/\D/g, '')) { setDisplayAmount(''); return }
    setDisplayAmount(formatDisplay(num, calc.fromCurrency))
  }

  const handleFromCurrencyChange = (code) => {
    setCalc(prev => ({ ...prev, fromCurrency: code }))
    if (displayAmount) {
      const num = parseRaw(displayAmount)
      if (num) setDisplayAmount(formatDisplay(num, code))
    }
    setLiveResult(null)
  }

  const handleCountryChange = (c) => {
    setCalc(prev => ({ ...prev, toCountry: c.country, toCurrency: c.currency }))
    setReceiver(r => ({ ...r, receiver_country: c.country }))
    setLiveResult(null)
  }

  const { data: countriesData } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/rates/countries').then(r => r.data.data),
  })

  const { data: banksData } = useQuery({
    queryKey: ['banks', receiver.receiver_country],
    queryFn: () => api.get('/admin/banks', { params: { country: receiver.receiver_country } }).then(r => r.data.data).catch(() => []),
  })

  const { data: prevOrdersData } = useQuery({
    queryKey: ['my-orders-contacts'],
    queryFn: () => api.get('/orders', { params: { page_size: 50 } }).then(r => r.data.data.items || []),
  })

  const previousContacts = (() => {
    if (!prevOrdersData?.length) return []
    const seen = new Set()
    return prevOrdersData
      .filter(o => {
        const key = `${o.receiver_name}|${o.receiver_account || ''}|${o.receiver_country}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 6)
  })()

  const selectContact = (order) => {
    setReceiver({
      receiver_name: order.receiver_name || '',
      receiver_phone: order.receiver_phone || '',
      receiver_country: order.receiver_country || '',
      receiver_bank_id: order.receiver_bank_id || '',
      receiver_account: order.receiver_account || '',
      receiver_id_type: order.receiver_id_type || 'Cédula',
      receiver_id_num: order.receiver_id_num || '',
    })
    const found = (countriesData || []).find(c => c.country === order.receiver_country)
    if (found) setCalc(prev => ({ ...prev, toCurrency: found.currency, toCountry: order.receiver_country }))
  }

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const payload = {
        sender_name: user.full_name,
        sender_phone: user.phone || '',
        sender_country: user.country || 'Chile',
        ...receiver,
        receiver_bank_id: receiver.receiver_bank_id ? parseInt(receiver.receiver_bank_id) : null,
        amount_sent: rawAmount || parseFloat(calc.amount),
        currency_from: calc.fromCurrency,
        currency_to: calc.toCurrency,
        ...payment,
      }
      const res = await api.post('/orders', payload)
      const orderId = res.data.data.id
      let orderData = res.data.data

      if (proofFile) {
        const formData = new FormData()
        formData.append('file', proofFile)
        const proofRes = await api.post(`/orders/${orderId}/upload-proof`, formData)
        orderData = proofRes.data.data ?? { ...orderData, status: 'en_aprobacion' }
      }

      navigate('/dashboard', { state: { newOrder: orderData } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear la orden')
      setLoading(false)
    }
  }

  const rateDisplay = liveResult?.rate != null
    ? `Tasa: ${liveResult.rate.toLocaleString('es-CL', { maximumFractionDigits: 4, minimumFractionDigits: 4 })}`
    : null

  const receivedDisplay = liveResult ? formatDisplay(liveResult.amount_received, calc.toCurrency) : null

  // Stepper: anterior path skips step 1 (Receptor), maps step 2→1, 3→2, 4→3
  const displaySteps = destinatarioType === 'anterior' ? ANTERIOR_STEPS : NUEVO_STEPS
  const displayStep = destinatarioType === 'anterior' && step >= 2 ? step - 1 : step

  return (
    <FinexyLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{color:'#eaf2ff'}}>Nueva transferencia</h1>
          <p className="text-sm mt-1" style={{color:'#8aa0cc'}}>Envía dinero de forma rápida y segura</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center mb-8">
          {displaySteps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all" style={
                i === displayStep
                  ? {background:'rgba(56,189,248,.15)', border:'2px solid #38bdf8', color:'#38bdf8'}
                  : i < displayStep
                    ? {background:'#38bdf8', color:'#060d22'}
                    : {background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#64748b'}
              }>
                {i < displayStep ? '✓' : i + 1}
              </div>
              <span className="hidden sm:block ml-1 text-xs" style={
                i === displayStep ? {color:'#38bdf8'} : i < displayStep ? {color:'#aebfe2'} : {color:'#64748b'}
              }>{s}</span>
              {i < displaySteps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 rounded-full" style={
                  i < displayStep ? {background:'#38bdf8'} : {background:'rgba(255,255,255,.08)'}
                } />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6" style={GLASS}>

          {/* ── Paso 0: Destino ── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="font-semibold" style={{color:'#eaf2ff'}}>¿A quién quieres enviar?</h2>

              {/* Choice cards */}
              <div className={`grid gap-3 ${previousContacts.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {[
                  { value: 'nuevo', label: 'Nuevo destinatario', icon: '👤', desc: 'Ingresa datos manualmente' },
                  ...(previousContacts.length > 0 ? [{ value: 'anterior', label: 'Destinatario anterior', icon: '👥', desc: 'Usa un contacto previo' }] : []),
                ].map(({ value, label, icon, desc }) => (
                  <button key={value} type="button"
                    onClick={() => {
                      setDestinatarioType(value)
                      setEditingContact(false)
                      if (value === 'nuevo') {
                        setReceiver(r => ({ ...r, receiver_name: '', receiver_phone: '', receiver_account: '', receiver_bank_id: '', receiver_id_num: '' }))
                      }
                    }}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all text-center"
                    style={destinatarioType === value
                      ? {background:'rgba(56,189,248,.1)', border:'2px solid #38bdf8'}
                      : {background:'rgba(255,255,255,.04)', border:'2px solid rgba(255,255,255,.08)'}
                    }>
                    <span className="text-2xl">{icon}</span>
                    <p className="font-semibold text-sm" style={{color:'#eaf2ff'}}>{label}</p>
                    <p className="text-xs" style={{color:'#8aa0cc'}}>{desc}</p>
                  </button>
                ))}
              </div>

              {/* Anterior: contacts list */}
              {destinatarioType === 'anterior' && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#aebfe2'}}>Contactos anteriores</p>
                  <div className="rounded-xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,.08)'}}>
                    {previousContacts.map((order, i) => {
                      const isSelected = receiver.receiver_name === order.receiver_name
                        && (receiver.receiver_account || '') === (order.receiver_account || '')
                        && receiver.receiver_country === order.receiver_country
                      return (
                        <div key={i}>
                          <button onClick={() => { selectContact(order); setEditingContact(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
                            style={{background: isSelected ? 'rgba(56,189,248,.1)' : 'transparent', borderBottom: isSelected && editingContact ? 'none' : '1px solid rgba(255,255,255,.06)'}}>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{background: isSelected ? '#38bdf8' : 'linear-gradient(135deg,#38bdf8,#818cf8)', color: isSelected ? '#060d22' : '#fff'}}>
                              {isSelected ? '✓' : order.receiver_name?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold" style={{color:'#eaf2ff'}}>{order.receiver_name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {flagUrl(order.receiver_country) && (
                                  <img src={flagUrl(order.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />
                                )}
                                <p className="text-xs truncate" style={{color:'#8aa0cc'}}>
                                  {order.receiver_country}{order.receiver_account && ` · ${order.receiver_account}`}
                                </p>
                              </div>
                            </div>
                            {isSelected && !editingContact && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setEditingContact(true) }}
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 transition-colors"
                                style={{background:'rgba(56,189,248,.12)', color:'#38bdf8', border:'1px solid rgba(56,189,248,.2)'}}>
                                Editar
                              </button>
                            )}
                          </button>
                          {isSelected && editingContact && (
                            <div className="px-4 py-4 space-y-3" style={{background:'rgba(4,10,30,.6)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:'#aebfe2'}}>Editar contacto</p>
                              {[
                                { label: 'Nombre', field: 'receiver_name', type: 'text' },
                                { label: 'Teléfono', field: 'receiver_phone', type: 'text' },
                                { label: 'N° de cuenta', field: 'receiver_account', type: 'text' },
                                { label: 'N° de documento', field: 'receiver_id_num', type: 'text' },
                              ].map(({ label, field, type }) => (
                                <div key={field}>
                                  <label className="text-xs block mb-1" style={{color:'#8aa0cc'}}>{label}</label>
                                  <input
                                    type={type}
                                    value={receiver[field] || ''}
                                    onChange={e => setReceiver(r => ({ ...r, [field]: e.target.value }))}
                                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}
                                  />
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => setEditingContact(false)}
                                className="w-full text-sm font-semibold py-2 rounded-xl transition-colors"
                                style={{background:'rgba(56,189,248,.12)', color:'#38bdf8', border:'1px solid rgba(56,189,248,.2)'}}>
                                Guardar cambios
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (destinatarioType === 'nuevo') setStep(1)
                  else if (destinatarioType === 'anterior' && receiver.receiver_name) setStep(2)
                }}
                disabled={
                  !destinatarioType ||
                  (destinatarioType === 'anterior' && !receiver.receiver_name)
                }
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-40 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm shadow-blue-200"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* ── Paso 1: Receptor (solo nuevo) ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setStep(0)} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                    style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                    ←
                  </button>
                  <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Datos del receptor</h2>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'receiver_name', label: 'Nombre completo', type: 'text' },
                  { key: 'receiver_phone', label: 'Teléfono', type: 'tel' },
                  { key: 'receiver_account', label: 'N° de cuenta / CBU / Clabe', type: 'text' },
                ].map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>{label}</label>
                    <input type={type} value={receiver[key]} onChange={e => setReceiver({ ...receiver, [key]: e.target.value })}
                      className="w-full rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                  </div>
                ))}

                {banksData?.length > 0 && (
                  <div>
                    <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Banco destino</label>
                    <select value={receiver.receiver_bank_id} onChange={e => setReceiver({ ...receiver, receiver_bank_id: e.target.value })}
                      className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}>
                      <option value="" style={{background:'#0f172a', color:'#fff'}}>Seleccionar banco...</option>
                      {banksData.map(b => <option key={b.id} value={b.id} style={{background:'#0f172a', color:'#fff'}}>{b.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Tipo de ID</label>
                    <select value={receiver.receiver_id_type} onChange={e => setReceiver({ ...receiver, receiver_id_type: e.target.value })}
                      className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}}>
                      {ID_TYPES.map(t => <option key={t} style={{background:'#0f172a', color:'#fff'}}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm block mb-1.5" style={{color:'#aebfe2'}}>Número de ID</label>
                    <input value={receiver.receiver_id_num} onChange={e => setReceiver({ ...receiver, receiver_id_num: e.target.value })}
                      className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{background:'rgba(6,13,40,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff'}} />
                  </div>
                </div>
              </div>

              <button onClick={() => { if (receiver.receiver_name) setStep(2) }} disabled={!receiver.receiver_name}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl">
                Continuar →
              </button>
            </div>
          )}

          {/* ── Paso 2: Calcular ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(destinatarioType === 'anterior' ? 0 : 1)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                  ←
                </button>
                <h2 className="font-semibold" style={{color:'#eaf2ff'}}>¿Cuánto quieres enviar?</h2>
              </div>

              <div className="rounded-2xl overflow-visible" style={{border:'1px solid rgba(255,255,255,.1)'}}>

                {/* TOP ROW: Tu envías */}
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{color:'#8aa0cc'}}>Tu envías</p>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <button type="button"
                        onClick={() => { setFromOpen(v => !v); setToOpen(false) }}
                        className="flex items-center gap-2 rounded-full px-3 py-2 transition-colors"
                        style={{border:'1px solid rgba(255,255,255,.1)', background:'rgba(6,13,40,.8)'}}>
                        <img src={currencyFlagUrl(selectedFrom?.iso2)} alt=""
                          className="w-[22px] h-[15px] rounded-sm object-cover shrink-0"
                          onError={e => { e.target.style.display = 'none' }} />
                        <span className="text-sm font-bold" style={{color:'#eaf2ff'}}>{calc.fromCurrency}</span>
                        <ChevronDown />
                      </button>
                      {fromOpen && (
                        <FromDropdown value={calc.fromCurrency} onChange={handleFromCurrencyChange} onClose={() => setFromOpen(false)} />
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={displayAmount}
                      onChange={handleAmountChange}
                      placeholder="0"
                      className="flex-1 text-3xl font-bold text-right outline-none bg-transparent min-w-0"
                      style={{color: displayAmount ? '#eaf2ff' : '#64748b'}}
                    />
                  </div>
                </div>

                {/* DIVIDER with rate */}
                <div className="flex items-center gap-2 px-4 py-2.5" style={{background:'rgba(6,13,40,.5)', borderTop:'1px solid rgba(255,255,255,.06)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  {liveLoading
                    ? <div className="w-2 h-2 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                    : <div className="w-2 h-2 rounded-full shrink-0" style={{background: liveResult ? '#4ade80' : '#64748b'}} />
                  }
                  <span className="text-xs font-medium truncate" style={{color:'#8aa0cc'}}>
                    {liveLoading
                      ? 'Calculando...'
                      : rateDisplay || 'Ingresa un monto para ver la tasa'}
                  </span>
                </div>

                {/* BOTTOM ROW: Destinatario recibe */}
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{color:'#8aa0cc'}}>Destinatario recibe</p>
                  <div className="flex items-center gap-3">
                    {destinatarioType === 'anterior' ? (
                      <div className="flex items-center gap-2 rounded-full px-3 py-2 shrink-0"
                        style={{border:'1px solid rgba(255,255,255,.08)', background:'rgba(6,13,40,.6)'}}>
                        {flagUrl(calc.toCountry)
                          ? <img src={flagUrl(calc.toCountry)} alt="" className="w-[22px] h-[15px] rounded-sm object-cover shrink-0" />
                          : <span className="text-sm shrink-0">🌍</span>
                        }
                        <span className="text-sm font-bold" style={{color:'#eaf2ff'}}>{calc.toCurrency}</span>
                      </div>
                    ) : (
                      <div className="relative shrink-0">
                        <button type="button"
                          onClick={() => { setToOpen(v => !v); setFromOpen(false) }}
                          className="flex items-center gap-2 rounded-full px-3 py-2 transition-colors"
                          style={{border:'1px solid rgba(255,255,255,.1)', background:'rgba(6,13,40,.8)'}}>
                          {flagUrl(calc.toCountry)
                            ? <img src={flagUrl(calc.toCountry)} alt="" className="w-[22px] h-[15px] rounded-sm object-cover shrink-0" />
                            : <span className="text-sm shrink-0">🌍</span>
                          }
                          <span className="text-sm font-bold" style={{color:'#eaf2ff'}}>{calc.toCurrency}</span>
                          <ChevronDown />
                        </button>
                        {toOpen && (
                          <ToDropdown countries={countriesData || []} value={calc.toCountry} onChange={handleCountryChange} onClose={() => setToOpen(false)} />
                        )}
                      </div>
                    )}
                    <p className="flex-1 text-3xl font-bold text-right" style={{color: receivedDisplay ? '#38bdf8' : '#64748b'}}>
                      {receivedDisplay || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm" style={{color:'#f87171'}}>{error}</p>}

              <button
                onClick={() => {
                  setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult }))
                  setStep(3)
                }}
                disabled={!liveResult || !rawAmount}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-40 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm shadow-blue-200"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* ── Paso 3: Pago ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                  ←
                </button>
                <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Método de pago</h2>
              </div>

              {/* Method selector */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'transferencia', label: 'Transferencia', icon: '🏦', desc: 'Sube tu comprobante' },
                  { value: 'tarjeta', label: 'Pago con tarjeta', icon: '💳', desc: 'Portal de pago' },
                ].map(({ value, label, icon, desc }) => (
                  <button key={value} type="button"
                    onClick={() => { setPayment(p => ({ ...p, payment_method: value, payment_bank: '' })); setProofFile(null); setProofPreview(null) }}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all text-center"
                    style={payment.payment_method === value
                      ? {background:'rgba(56,189,248,.1)', border:'2px solid #38bdf8'}
                      : {background:'rgba(255,255,255,.04)', border:'2px solid rgba(255,255,255,.08)'}
                    }>
                    <span className="text-2xl">{icon}</span>
                    <p className="font-semibold text-sm" style={{color:'#eaf2ff'}}>{label}</p>
                    <p className="text-xs" style={{color:'#8aa0cc'}}>{desc}</p>
                  </button>
                ))}
              </div>

              {/* Transferencia: file upload */}
              {payment.payment_method === 'transferencia' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#aebfe2'}}>Comprobante de transferencia</p>
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors"
                    style={proofFile
                      ? {borderColor:'rgba(74,222,128,.3)', background:'rgba(74,222,128,.06)'}
                      : {borderColor:'rgba(255,255,255,.1)', background:'rgba(6,13,40,.4)'}
                    }>
                    <input type="file" accept="image/*,.pdf" className="sr-only"
                      onChange={e => handleProofChange(e.target.files?.[0] || null)} />
                    {proofFile ? (
                      <>
                        {proofPreview ? (
                          <img src={proofPreview} alt="preview" className="max-h-32 rounded-xl object-contain" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:'rgba(74,222,128,.12)'}}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        <p className="text-sm font-semibold" style={{color:'#4ade80'}}>{proofFile.name}</p>
                        <p className="text-xs" style={{color:'#4ade80', opacity:0.7}}>Toca para cambiar</p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:'rgba(255,255,255,.06)'}}>
                          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#8aa0cc" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold" style={{color:'#aebfe2'}}>Adjuntar comprobante</p>
                        <p className="text-xs" style={{color:'#8aa0cc'}}>JPG, PNG o PDF — requerido</p>
                      </>
                    )}
                  </label>

                  <button
                    onClick={() => setStep(4)}
                    disabled={!proofFile}
                    className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all">
                    Continuar →
                  </button>
                </div>
              )}

              {/* Tarjeta: payment portal */}
              {payment.payment_method === 'tarjeta' && (
                <div className="rounded-2xl overflow-hidden" style={GLASS}>
                  {/* Portal header */}
                  <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-white text-sm font-semibold">Pago seguro</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-white bg-blue-900/50 px-1.5 py-0.5 rounded tracking-wider">VISA</span>
                      <span className="text-[10px] font-black text-white bg-blue-900/50 px-1.5 py-0.5 rounded tracking-wider">MC</span>
                      <span className="text-[10px] font-black text-white bg-blue-900/50 px-1.5 py-0.5 rounded tracking-wider">AMEX</span>
                    </div>
                  </div>

                  {/* Amount summary */}
                  <div className="px-5 pt-5 pb-3">
                    <p className="text-xs mb-1" style={{color:'#8aa0cc'}}>Total a pagar</p>
                    <p className="text-3xl font-bold" style={{color:'#eaf2ff'}}>
                      {(rawAmount || parseFloat(calc.amount || '0')).toLocaleString('es-CL')}
                      <span className="text-base ml-1.5" style={{color:'#8aa0cc'}}>{calc.fromCurrency}</span>
                    </p>
                    {calc.result && (
                      <p className="text-xs mt-1" style={{color:'#8aa0cc'}}>
                        Destinatario recibirá{' '}
                        <span className="font-semibold" style={{color:'#aebfe2'}}>
                          {calc.result.amount_received?.toLocaleString()} {calc.toCurrency}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Pay button */}
                  <div className="px-5 pb-5 space-y-3">
                    <button
                      onClick={() => {
                        setCalc(prev => ({ ...prev, amount: String(rawAmount), result: liveResult || calc.result }))
                        submit()
                      }}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all text-base shadow-md shadow-green-200 flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                          Pagar ahora
                        </>
                      )}
                    </button>
                    <p className="text-xs text-center" style={{color:'#8aa0cc'}}>
                      🔒 Tu pago está protegido con cifrado SSL
                    </p>
                  </div>
                </div>
              )}

              {error && <p className="text-sm" style={{color:'#f87171'}}>{error}</p>}
            </div>
          )}

          {/* ── Paso 4: Confirmar ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(3)} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                  style={{border:'1px solid rgba(255,255,255,.1)', color:'#8aa0cc', background:'rgba(255,255,255,.04)'}}>
                  ←
                </button>
                <h2 className="font-semibold" style={{color:'#eaf2ff'}}>Confirmar transferencia</h2>
              </div>

              {calc.result && (
                <div className="rounded-2xl p-5" style={{ ...GLASS, border: '1px solid rgba(56,189,248,.15)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs mb-0.5" style={{color:'#8aa0cc'}}>Envías</p>
                      <p className="text-2xl font-bold" style={{color:'#eaf2ff'}}>
                        {formatDisplay(rawAmount || parseFloat(calc.amount), calc.fromCurrency)}
                        <span className="text-base ml-1" style={{color:'#8aa0cc'}}>{calc.fromCurrency}</span>
                      </p>
                    </div>
                    <span className="text-3xl" style={{color:'#38bdf8'}}>→</span>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5 mb-0.5">
                        <p className="text-xs" style={{color:'#8aa0cc'}}>Recibe</p>
                        {flagUrl(calc.toCountry) && <img src={flagUrl(calc.toCountry)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />}
                      </div>
                      <p className="text-2xl font-bold" style={{color:'#4ade80'}}>
                        {formatDisplay(calc.result.amount_received, calc.toCurrency)}
                        <span className="text-base ml-1" style={{color:'#4ade80', opacity:0.7}}>{calc.toCurrency}</span>
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center mt-3 pt-3 text-xs" style={{borderTop:'1px solid rgba(56,189,248,.15)', color:'#8aa0cc'}}>
                    <div>Tasa: <span className="font-semibold" style={{color:'#aebfe2'}}>{calc.result.rate?.toFixed(4)}</span></div>
                    <div>Comisión: <span className="font-semibold" style={{color:'#aebfe2'}}>{formatDisplay(calc.result.fee, calc.fromCurrency)} {calc.fromCurrency}</span></div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'#8aa0cc'}}>Receptor</span>
                  <span className="font-semibold" style={{color:'#eaf2ff'}}>{receiver.receiver_name}</span>
                </div>
                <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'#8aa0cc'}}>País</span>
                  <div className="flex items-center gap-1.5">
                    {flagUrl(receiver.receiver_country) && <img src={flagUrl(receiver.receiver_country)} alt="" className="w-4 h-[11px] rounded-sm object-cover" />}
                    <span className="font-medium" style={{color:'#aebfe2'}}>{receiver.receiver_country}</span>
                  </div>
                </div>
                {receiver.receiver_account && (
                  <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                    <span style={{color:'#8aa0cc'}}>Cuenta</span>
                    <span className="font-medium" style={{color:'#aebfe2'}}>{receiver.receiver_account}</span>
                  </div>
                )}
                <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'#8aa0cc'}}>Método pago</span>
                  <span className="font-medium capitalize" style={{color:'#aebfe2'}}>{payment.payment_method}</span>
                </div>
                {payment.payment_bank && (
                  <div className="flex justify-between py-2" style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                    <span style={{color:'#8aa0cc'}}>Banco</span>
                    <span className="font-medium" style={{color:'#aebfe2'}}>{payment.payment_bank}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span style={{color:'#8aa0cc'}}>Comprobante</span>
                  {proofFile ? (
                    <span className="font-medium text-sm flex items-center gap-1" style={{color:'#4ade80'}}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Adjunto
                    </span>
                  ) : (
                    <span className="text-sm" style={{color:'#8aa0cc'}}>Sin adjuntar</span>
                  )}
                </div>
              </div>

              {error && <p className="text-sm" style={{color:'#f87171'}}>{error}</p>}

              <button onClick={submit} disabled={loading}
                className="w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-md shadow-blue-200">
                {loading ? 'Procesando...' : '✓ Confirmar envío'}
              </button>
            </div>
          )}
        </div>
      </div>
    </FinexyLayout>
  )
}
