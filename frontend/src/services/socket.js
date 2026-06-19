// WebSocket nativo (FastAPI no usa Socket.io, usa WS nativo)
export function createChatSocket(orderId, token, onMessage, onOpen, onClose) {
  const apiUrl = import.meta.env.VITE_API_URL
  const protocol = (apiUrl ? apiUrl.startsWith('https') : window.location.protocol === 'https:') ? 'wss' : 'ws'
  const host = apiUrl ? apiUrl.replace(/^https?:\/\//, '') : (window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host)
  const url = `${protocol}://${host}/ws/chat/${orderId}?token=${token}`
  const ws = new WebSocket(url)

  ws.onopen = () => onOpen?.()
  ws.onmessage = (e) => onMessage?.(JSON.parse(e.data))
  ws.onclose = () => onClose?.()

  return {
    send: (content) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ content })),
    close: () => ws.close(),
  }
}
