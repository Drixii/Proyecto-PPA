import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import Portal from './Portal'
import { useStore } from '../store/useStore'

// Verificación del correo del cliente.
//
// Es lo que impide registrarse con un buzón inventado: para enviar dinero hay
// que escribir un código que solo llega al correo puesto en el registro. Diez
// cuentas falsas pasan a exigir diez buzones reales.
//
// Va en el layout y no en una pantalla concreta porque el aviso tiene que
// aparecer entre por donde entre. Solo se muestra si hay servidor de correo
// configurado: sin él nadie podría verificarse y el aviso sería una pared.
//
// Se pide el usuario al servidor y no se lee del almacenamiento local: el que
// hay guardado es del momento del login y diría "sin verificar" para siempre.
export default function VerificarCorreo() {
  const { user, setUser } = useStore()
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [espera, setEspera] = useState(0)
  const campo = useRef(null)

  const esCliente = user?.role === 'client'

  const { data: yo } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data.data),
    enabled: esCliente,
    staleTime: 60000,
  })

  // El usuario guardado se queda atrás: al verificar hay que actualizarlo o el
  // resto de la aplicación sigue creyendo que falta.
  useEffect(() => {
    if (yo && esCliente && yo.email_verified !== user?.email_verified) {
      setUser({ ...user, ...yo })
    }
  }, [yo?.email_verified]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuenta atrás del reenvío. El servidor exige 60 segundos entre códigos;
  // sin mostrarlo, el botón parece roto.
  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera(e => e - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  useEffect(() => {
    if (abierto) setTimeout(() => campo.current?.focus(), 50)
  }, [abierto])

  const enviar = useMutation({
    mutationFn: () => api.post('/auth/verify-email/send'),
    onSuccess: (r) => { setMsg(r.data.message); setError(''); setEspera(60) },
    onError: (e) => { setError(e.response?.data?.detail || 'No se pudo enviar el código'); setMsg('') },
  })

  const comprobar = useMutation({
    mutationFn: () => api.post('/auth/verify-email', { code: codigo.trim() }),
    onSuccess: () => {
      setError(''); setMsg('')
      setAbierto(false)
      setUser({ ...user, email_verified: true })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => { setError(e.response?.data?.detail || 'Código incorrecto'); setMsg('') },
  })

  const abrir = () => {
    setAbierto(true); setCodigo(''); setError(''); setMsg('')
    if (espera <= 0) enviar.mutate()
  }

  if (!esCliente || !yo) return null
  if (!yo.email_verification_required || yo.email_verified) return null

  return (
    <>
      {/* Va en el flujo, arriba del contenido: fija se comería la cabecera y
          el menú, que ya ocupan esa franja. */}
      <div
        className="shrink-0"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          flexWrap: 'wrap', padding: '10px 16px',
          background: 'linear-gradient(90deg,#7c2d12,#9a3412)',
          borderBottom: '1px solid rgba(251,146,60,.35)',
          fontSize: 12.5, color: '#ffedd5', textAlign: 'center',
        }}
      >
        <span>Verifica tu correo para poder enviar dinero.</span>
        <button
          onClick={abrir}
          style={{
            fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 999,
            border: 'none', cursor: 'pointer', background: '#fff7ed', color: '#7c2d12',
          }}
        >
          Verificar ahora
        </button>
      </div>

      {abierto && (
        <Portal>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 16,
              background: 'rgba(2,6,23,.8)',
            }}
            onClick={() => setAbierto(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 400, borderRadius: 22, padding: '26px 24px',
                background: 'rgba(8,16,44,.99)', border: '1px solid rgba(255,255,255,.12)',
              }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#eaf2ff' }}>
                Verifica tu correo
              </h3>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8aa0cc', lineHeight: 1.6 }}>
                Te enviamos un código de 6 cifras a <strong style={{ color: '#bfe4ff' }}>{yo.email}</strong>.
                Caduca a los 15 minutos. Mira también en spam.
              </p>

              <input
                ref={campo}
                value={codigo}
                // Solo cifras y como mucho seis: el código no tiene otra forma,
                // y así no se manda algo que va a fallar seguro.
                onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter' && codigo.length === 6) comprobar.mutate() }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                style={{
                  width: '100%', padding: '14px 12px', borderRadius: 12, textAlign: 'center',
                  fontSize: 26, letterSpacing: 10, fontWeight: 700, fontFamily: 'monospace',
                  background: 'rgba(6,13,40,.7)', border: '1px solid rgba(255,255,255,.12)', color: '#eaf2ff',
                }}
              />

              {msg && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#4ade80' }}>{msg}</p>}
              {error && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#f87171' }}>{error}</p>}

              <button
                onClick={() => comprobar.mutate()}
                disabled={codigo.length !== 6 || comprobar.isPending}
                style={{
                  width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none',
                  fontSize: 14, fontWeight: 700, color: '#060d22',
                  cursor: codigo.length === 6 ? 'pointer' : 'not-allowed',
                  opacity: codigo.length === 6 ? 1 : .4,
                  background: 'linear-gradient(135deg,#38bdf8,#818cf8)',
                }}
              >
                {comprobar.isPending ? 'Comprobando...' : 'Verificar'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button
                  onClick={() => enviar.mutate()}
                  disabled={espera > 0 || enviar.isPending}
                  style={{
                    background: 'none', border: 'none', padding: 0, fontSize: 12.5,
                    color: espera > 0 ? '#475569' : '#38bdf8',
                    cursor: espera > 0 ? 'default' : 'pointer',
                  }}
                >
                  {espera > 0 ? `Reenviar en ${espera}s` : 'Reenviar código'}
                </button>
                <button
                  onClick={() => setAbierto(false)}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: '#8aa0cc', cursor: 'pointer' }}
                >
                  Más tarde
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}
