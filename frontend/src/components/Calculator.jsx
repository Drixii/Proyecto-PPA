import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { flagUrl } from '../utils/flags'

const SEND_CURRENCIES = [
  { code: 'CLP', iso2: 'cl', name: 'Peso Chileno' },
  { code: 'COP', iso2: 'co', name: 'Peso Colombiano' },
  { code: 'USD', iso2: 'us', name: 'Dólar Americano' },
  { code: 'EUR', iso2: 'eu', name: 'Euro' },
  { code: 'PEN', iso2: 'pe', name: 'Sol Peruano' },
  { code: 'BRL', iso2: 'br', name: 'Real Brasileño' },
  { code: 'MXN', iso2: 'mx', name: 'Peso Mexicano' },
]

const INTEGER_CURRENCIES = ['CLP', 'COP', 'VES', 'ARS', 'PYG']

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
  return parseInt((str || '').replace(/\D/g, ''), 10) || 0
}

function ChevronDown() {
  return (
    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 shrink-0">
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
    <div ref={ref} className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-[400] min-w-[210px] overflow-hidden">
      {SEND_CURRENCIES.map(c => (
        <button key={c.code} type="button"
          onClick={() => { onChange(c.code); onClose() }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left ${value === c.code ? 'bg-blue-50/70' : ''}`}>
          <img src={currencyFlagUrl(c.iso2)} alt="" className="w-5 h-[14px] rounded-sm object-cover shrink-0"
            onError={e => { e.target.style.display = 'none' }} />
          <span className="text-sm font-bold text-gray-800">{c.code}</span>
          <span className="text-xs text-gray-400 flex-1 text-right truncate">{c.name}</span>
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
    <div ref={ref} className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-[400] w-56 overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar país..."
            className="flex-1 text-xs outline-none bg-transparent text-gray-700 placeholder-gray-400" />
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>
        )}
        {filtered.map(c => (
          <button key={c.country} type="button"
            onClick={() => { onChange(c); onClose() }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left ${value === c.country ? 'bg-blue-50/60' : ''}`}>
            {flagUrl(c.country)
              ? <img src={flagUrl(c.country)} alt="" className="w-5 h-[14px] rounded-sm object-cover shrink-0" />
              : <span className="w-5 h-[14px] bg-gray-100 rounded-sm shrink-0" />
            }
            <span className="flex-1 text-sm font-medium text-gray-800">{c.country}</span>
            <span className="text-xs font-mono text-gray-400 shrink-0">{c.currency}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Calculator({ onSend }) {
  const [fromCurrency, setFromCurrency] = useState('CLP')
  const [toCountry, setToCountry] = useState('Venezuela')
  const [toCurrency, setToCurrency] = useState('VES')
  const [displayAmount, setDisplayAmount] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [rateError, setRateError] = useState(null)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  const { data: countriesData } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/rates/countries').then(r => r.data.data),
  })

  const countries = countriesData || []
  const selectedFrom = SEND_CURRENCIES.find(c => c.code === fromCurrency)
  const rawAmount = parseRaw(displayAmount)

  useEffect(() => {
    const found = countries.find(c => c.country === toCountry)
    if (found) setToCurrency(found.currency)
  }, [toCountry, countries])

  useEffect(() => {
    if (!rawAmount || rawAmount <= 0) { setResult(null); setRateError(null); return }
    if (fromCurrency === toCurrency) { setResult(null); setRateError('Misma moneda en ambos lados'); return }
    const timer = setTimeout(() => fetchRate(), 600)
    return () => clearTimeout(timer)
  }, [displayAmount, fromCurrency, toCurrency])

  useEffect(() => {
    if (!result) return
    const interval = setInterval(() => fetchRate(), 60000)
    return () => clearInterval(interval)
  }, [result, fromCurrency, toCurrency, displayAmount])

  const fetchRate = async () => {
    if (!rawAmount || rawAmount <= 0) return
    setLoading(true)
    setRateError(null)
    try {
      const res = await api.get('/rates/convert', {
        params: { from: fromCurrency, to: toCurrency, amount: rawAmount },
      })
      setResult(res.data.data)
    } catch (err) {
      setResult(null)
      const detail = err.response?.data?.detail || ''
      if (detail.toLowerCase().includes('tasa') || detail.toLowerCase().includes('rate') || err.response?.status === 404) {
        setRateError(`Conversión ${fromCurrency} → ${toCurrency} no disponible`)
      } else {
        setRateError('Error al obtener la tasa. Intenta nuevamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAmountChange = (e) => {
    const num = parseRaw(e.target.value)
    if (!e.target.value.replace(/\D/g, '')) { setDisplayAmount(''); return }
    setDisplayAmount(formatDisplay(num, fromCurrency))
  }

  const handleFromCurrencyChange = (code) => {
    setFromCurrency(code)
    setResult(null)
    setRateError(null)
    if (displayAmount) {
      const num = parseRaw(displayAmount)
      if (num) setDisplayAmount(formatDisplay(num, code))
    }
  }

  const handleCountryChange = (c) => {
    setToCountry(c.country)
    setToCurrency(c.currency)
    setResult(null)
    setRateError(null)
  }

  const receivedAmount = result ? formatDisplay(result.amount_received, toCurrency) : null
  const rateDisplay = result?.rate != null
    ? `Tasa: ${result.rate.toLocaleString('es-CL', { maximumFractionDigits: 4, minimumFractionDigits: 4 })}`
    : null

  const closeFrom = () => setFromOpen(false)
  const closeTo = () => setToOpen(false)

  return (
    <div className="w-full max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Calcula tu envío</h2>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">

        {/* TOP ROW: Tu envías */}
        <div className="p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tu envías</p>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <button type="button"
                onClick={() => { setFromOpen(v => !v); setToOpen(false) }}
                className="flex items-center gap-2 border border-gray-200 hover:border-blue-300 bg-gray-50 hover:bg-blue-50 rounded-full px-3 py-2 transition-colors">
                <img src={currencyFlagUrl(selectedFrom?.iso2)} alt=""
                  className="w-[22px] h-[15px] rounded-sm object-cover shrink-0"
                  onError={e => { e.target.style.display = 'none' }} />
                <span className="text-sm font-bold text-gray-800">{fromCurrency}</span>
                <ChevronDown />
              </button>
              {fromOpen && <FromDropdown value={fromCurrency} onChange={handleFromCurrencyChange} onClose={closeFrom} />}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={displayAmount}
              onChange={handleAmountChange}
              placeholder="0"
              className="flex-1 text-3xl font-bold text-right text-gray-900 outline-none bg-transparent placeholder-gray-200 min-w-0"
            />
          </div>
        </div>

        {/* DIVIDER with rate badge */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-y border-gray-100">
          {loading
            ? <div className="w-2 h-2 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
            : <div className={`w-2 h-2 rounded-full shrink-0 ${rateError ? 'bg-amber-400' : result ? 'bg-green-400' : 'bg-gray-300'}`} />
          }
          <span className="text-xs font-medium text-gray-500 truncate">
            {loading
              ? 'Calculando...'
              : rateError
                ? rateError
                : rateDisplay || 'Ingresa un monto para ver la tasa'}
          </span>
        </div>

        {/* BOTTOM ROW: Destinatario recibe */}
        <div className="p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Destinatario recibe</p>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <button type="button"
                onClick={() => { setToOpen(v => !v); setFromOpen(false) }}
                className="flex items-center gap-2 border border-gray-200 hover:border-blue-300 bg-gray-50 hover:bg-blue-50 rounded-full px-3 py-2 transition-colors">
                {flagUrl(toCountry)
                  ? <img src={flagUrl(toCountry)} alt="" className="w-[22px] h-[15px] rounded-sm object-cover shrink-0" />
                  : <span className="text-sm shrink-0">🌍</span>
                }
                <span className="text-sm font-bold text-gray-800">{toCurrency}</span>
                <ChevronDown />
              </button>
              {toOpen && <ToDropdown countries={countries} value={toCountry} onChange={handleCountryChange} onClose={closeTo} />}
            </div>
            <p className={`flex-1 text-3xl font-bold text-right ${receivedAmount ? 'text-gray-900' : 'text-gray-200'}`}>
              {receivedAmount || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => onSend?.({ amount: rawAmount, fromCurrency, toCountry, toCurrency, result })}
        className="mt-4 w-full bg-gradient-to-r from-blue-400 to-blue-700 hover:from-blue-500 hover:to-blue-800 text-white font-bold py-4 rounded-2xl transition-all text-base shadow-lg shadow-blue-200/60">
        ¡Comienza tu envío ahora!
      </button>
    </div>
  )
}
