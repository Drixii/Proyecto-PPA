import { useState, useEffect, useRef } from 'react'
import { createChatSocket } from '../services/socket'
import api from '../services/api'
import { useStore } from '../store/useStore'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '22px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.18)' }

export default function ChatBox({ orderId }) {
  const { token, user } = useStore()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    api.get(`/chat/${orderId}/history`).then((res) => {
      if (res.data.success) setMessages(res.data.data)
    })

    socketRef.current = createChatSocket(
      orderId,
      token,
      (msg) => setMessages((prev) => [...prev, msg]),
      () => setConnected(true),
      () => setConnected(false),
    )

    return () => socketRef.current?.close()
  }, [orderId, token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    if (!input.trim()) return
    socketRef.current?.send(input.trim())
    setInput('')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'22rem', overflow:'hidden', ...GLASS, border:'1px solid rgba(56,189,248,.15)' }}>
      {/* Header */}
      <div style={{ padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,.07)', background:'rgba(4,10,30,.6)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: connected ? '#4ade80' : '#475569', boxShadow: connected ? '0 0 6px rgba(74,222,128,.6)' : 'none' }} />
          <span style={{ fontSize:13, fontWeight:600, color:'#eaf2ff' }}>Chat de soporte</span>
        </div>
        <span style={{ fontSize:11, color: connected ? '#4ade80' : '#64748b' }}>
          {connected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 12px', display:'flex', flexDirection:'column', gap:10 }}>
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id
          return (
            <div key={msg.id || msg.created_at} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'72%', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                padding:'9px 14px',
                background: isMe ? 'linear-gradient(135deg,#1e40af,#38bdf8)' : 'rgba(255,255,255,.07)',
                border: isMe ? 'none' : '1px solid rgba(255,255,255,.08)',
              }}>
                {!isMe && <p style={{ fontSize:10, fontWeight:700, marginBottom:3, color:'#38bdf8', letterSpacing:'.04em', textTransform:'uppercase' }}>{msg.sender_name || msg.sender_role}</p>}
                <p style={{ fontSize:13, color:'#eaf2ff', lineHeight:1.45, margin:0 }}>{msg.content}</p>
                <p style={{ fontSize:10, marginTop:4, color: isMe ? 'rgba(255,255,255,.55)' : '#64748b', textAlign:'right' }}>
                  {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        {messages.length === 0 && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <p style={{ fontSize:12, color:'#475569', textAlign:'center' }}>Sin mensajes aún.<br/>Escribe para iniciar.</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.07)', background:'rgba(4,10,30,.4)', display:'flex', gap:8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribe un mensaje..."
          style={{ flex:1, fontSize:13, padding:'9px 14px', borderRadius:12, background:'rgba(8,16,44,.8)', border:'1px solid rgba(255,255,255,.1)', color:'#eaf2ff', outline:'none', fontFamily:'inherit' }}
        />
        <button
          onClick={send}
          disabled={!connected}
          style={{ padding:'9px 16px', borderRadius:12, fontSize:13, fontWeight:600, border:'none', cursor: connected ? 'pointer' : 'not-allowed', background: connected ? 'linear-gradient(135deg,#38bdf8,#818cf8)' : 'rgba(255,255,255,.06)', color: connected ? '#060d22' : '#475569', transition:'all .2s' }}>
          Enviar
        </button>
      </div>
    </div>
  )
}
