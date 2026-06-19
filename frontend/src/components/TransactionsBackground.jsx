import { useRef, useEffect } from 'react'

const DEFAULT_COUNTRIES = ['US','ES','PA','CO','MX','PE','AR','BR','GB','AE','CL','VE','EC']

const FLAG_SPECS = {
  US: { dir:'h', bands:[['#b22234',1],['#fff',1],['#b22234',1],['#fff',1],['#b22234',1]], canton:'#3c3b6e' },
  ES: { dir:'h', bands:[['#c60b1e',1],['#ffc400',2],['#c60b1e',1]] },
  CO: { dir:'h', bands:[['#fcd116',2],['#003893',1],['#ce1126',1]] },
  MX: { dir:'v', bands:[['#006847',1],['#fff',1],['#ce1126',1]] },
  PE: { dir:'v', bands:[['#d91023',1],['#fff',1],['#d91023',1]] },
  AR: { dir:'h', bands:[['#74acdf',1],['#fff',1],['#74acdf',1]] },
  BR: { dir:'h', bands:[['#009c3b',1]] },
  GB: { dir:'h', bands:[['#012169',1]] },
  AE: { dir:'h', bands:[['#00732f',1],['#fff',1],['#000',1]], leftBar:'#ce1126' },
  CL: { dir:'h', bands:[['#fff',1],['#d52b1e',1]], canton:'#0039a6' },
  VE: { dir:'h', bands:[['#fcd116',1],['#00247d',1],['#cf142b',1]] },
  EC: { dir:'h', bands:[['#fdd116',2],['#034ea2',1],['#ed1c24',1]] },
}

export default function TransactionsBackground({
  countries = DEFAULT_COUNTRIES,
  maxActive = 2,
  className,
  style,
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')

    let W = 0, H = 0
    let lines = []
    let prevTs = 0
    let raf = 0
    let dead = false

    const flagImgs = {}
    countries.forEach(code => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = 'https://flagcdn.com/w160/' + code.toLowerCase() + '.png'
      flagImgs[code] = img
    })

    function buildLines() {
      const p = cv.parentElement
      if (!p) return
      cv.width  = p.offsetWidth
      cv.height = p.offsetHeight
      W = cv.width; H = cv.height

      const vx = W * 0.5, vy = H
      const edgePoints = [
        { x: W*0.00, y: 0 }, { x: W*0.08, y: 0 }, { x: W*0.18, y: 0 },
        { x: W*0.28, y: 0 }, { x: W*0.38, y: 0 }, { x: W*0.50, y: 0 },
        { x: W*0.62, y: 0 }, { x: W*0.72, y: 0 }, { x: W*0.82, y: 0 },
        { x: W*0.92, y: 0 }, { x: W*1.00, y: 0 },
        { x: 0, y: H*0.00 }, { x: 0, y: H*0.20 }, { x: 0, y: H*0.40 },
        { x: W, y: H*0.00 }, { x: W, y: H*0.20 }, { x: W, y: H*0.40 },
      ]
      lines = edgePoints.map((ep, i) => ({
        vx, vy, ex: ep.x, ey: ep.y,
        t: -1, active: false,
        waitUntil: i * 900,
        speed: 0.00028 + Math.random() * 0.00012,
        flag: countries[0],
      }))
    }

    function drawFlag(code, cx, cy, w) {
      const h = w * 0.66
      const x0 = cx - w/2, y0 = cy - h/2
      const rad = Math.max(1, w * 0.09)
      const roundPath = () => {
        ctx.beginPath()
        ctx.moveTo(x0+rad, y0)
        ctx.arcTo(x0+w, y0,   x0+w, y0+h, rad)
        ctx.arcTo(x0+w, y0+h, x0,   y0+h, rad)
        ctx.arcTo(x0,   y0+h, x0,   y0,   rad)
        ctx.arcTo(x0,   y0,   x0+w, y0,   rad)
        ctx.closePath()
      }
      const img = flagImgs[code]
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save(); roundPath(); ctx.clip()
        ctx.drawImage(img, x0, y0, w, h)
        ctx.restore()
      } else {
        const spec = FLAG_SPECS[code]
        if (!spec) return
        ctx.save(); roundPath(); ctx.clip()
        const total = spec.bands.reduce((s,b)=>s+b[1], 0)
        if (spec.dir === 'h') {
          let yy = y0
          spec.bands.forEach(([col,wt]) => { const bh=h*wt/total; ctx.fillStyle=col; ctx.fillRect(x0,yy,w,bh+0.5); yy+=bh })
        } else {
          let xx = x0
          spec.bands.forEach(([col,wt]) => { const bw=w*wt/total; ctx.fillStyle=col; ctx.fillRect(xx,y0,bw+0.5,h); xx+=bw })
        }
        if (spec.canton)  { ctx.fillStyle = spec.canton;  ctx.fillRect(x0,y0,w*0.42,h*0.5) }
        if (spec.leftBar) { ctx.fillStyle = spec.leftBar; ctx.fillRect(x0,y0,w*0.28,h) }
        ctx.restore()
      }
      ctx.save(); roundPath()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore()
    }

    function drawLine(line, t) {
      const { vx, vy, ex, ey } = line
      const dx = ex - vx, dy = ey - vy
      const len = Math.sqrt(dx*dx + dy*dy) || 1
      const px = -dy/len, py = dx/len

      ctx.save()
      ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(ex, ey)
      const guide = ctx.createLinearGradient(vx, vy, ex, ey)
      guide.addColorStop(0,   'rgba(40,70,150,0.10)')
      guide.addColorStop(0.6, 'rgba(40,70,150,0.04)')
      guide.addColorStop(1,   'rgba(40,70,150,0)')
      ctx.strokeStyle = guide; ctx.lineWidth = 1; ctx.stroke()
      ctx.restore()

      if (t < 0) return

      const steleLen = 0.34
      const head = t
      const tail = Math.max(0, head - steleLen)
      const hx = vx + dx*head, hy = vy + dy*head
      const tx = vx + dx*tail, ty = vy + dy*tail
      const persp = hh => Math.pow(1 - hh, 2.2)
      const wHead = persp(head) * 2.0 + 0.6
      const wTail = persp(tail) * 2.0 + 0.6
      const p1x=hx+px*wHead, p1y=hy+py*wHead
      const p2x=hx-px*wHead, p2y=hy-py*wHead
      const p3x=tx-px*wTail, p3y=ty-py*wTail
      const p4x=tx+px*wTail, p4y=ty+py*wTail
      const sg = ctx.createLinearGradient(tx, ty, hx, hy)
      sg.addColorStop(0,   'rgba(29,78,216,0)')
      sg.addColorStop(0.5, 'rgba(29,78,216,0.45)')
      sg.addColorStop(1,   'rgba(59,130,246,0.95)')
      ctx.save()
      ctx.shadowBlur = 14; ctx.shadowColor = 'rgba(29,78,216,0.8)'
      ctx.beginPath()
      ctx.moveTo(p1x,p1y); ctx.lineTo(p2x,p2y); ctx.lineTo(p3x,p3y); ctx.lineTo(p4x,p4y)
      ctx.closePath(); ctx.fillStyle = sg; ctx.fill()
      ctx.restore()

      const tipR = persp(head) * 6.0 + 1.2
      const bloom = ctx.createRadialGradient(hx, hy, 0, hx, hy, tipR*4.5)
      bloom.addColorStop(0,   'rgba(59,130,246,0.55)')
      bloom.addColorStop(0.5, 'rgba(29,78,216,0.20)')
      bloom.addColorStop(1,   'rgba(29,78,216,0)')
      ctx.beginPath(); ctx.arc(hx, hy, tipR*4.5, 0, Math.PI*2)
      ctx.fillStyle = bloom; ctx.fill()

      const flagW = (1 - head * 0.5) * 20 + 15
      ctx.save()
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.5)'
      drawFlag(line.flag, hx, hy, flagW)
      ctx.restore()
    }

    function frame(ts) {
      if (dead) return
      if (!W || !H) { raf = requestAnimationFrame(frame); return }
      const dt = Math.min(ts - (prevTs || ts), 50)
      prevTs = ts

      ctx.fillStyle = '#020818'; ctx.fillRect(0, 0, W, H)
      const bg1 = ctx.createRadialGradient(W*.5, H, 0, W*.5, H, H*1.1)
      bg1.addColorStop(0, 'rgba(29,78,216,0.55)')
      bg1.addColorStop(0.4, 'rgba(17,47,135,0.28)')
      bg1.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg1; ctx.fillRect(0, 0, W, H)
      const bg2 = ctx.createRadialGradient(0, H*.80, 0, 0, H*.80, W*.60)
      bg2.addColorStop(0, 'rgba(29,78,216,0.32)'); bg2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg2; ctx.fillRect(0, 0, W, H)
      const bg3 = ctx.createRadialGradient(W, H*.80, 0, W, H*.80, W*.60)
      bg3.addColorStop(0, 'rgba(29,78,216,0.32)'); bg3.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg3; ctx.fillRect(0, 0, W, H)

      lines.forEach(line => {
        if (!line.active && ts > line.waitUntil) {
          const activeCount = lines.filter(l => l.active).length
          if (activeCount < maxActive) {
            line.active = true
            line.t = 0
            line.flag = countries[Math.floor(Math.random() * countries.length)]
          } else {
            line.waitUntil = ts + 400 + Math.random() * 600
          }
        }
        drawLine(line, line.active ? line.t : -1)
        if (line.active) {
          line.t += line.speed * dt
          if (line.t >= 1) {
            line.active = false
            line.t = -1
            line.waitUntil = ts + 2500 + Math.random() * 4000
          }
        }
      })

      if (lines[0]) {
        const vg = ctx.createRadialGradient(lines[0].vx, lines[0].vy, 0, lines[0].vx, lines[0].vy, 120)
        vg.addColorStop(0, 'rgba(59,130,246,0.45)')
        vg.addColorStop(0.4, 'rgba(29,78,216,0.18)')
        vg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = vg
        ctx.beginPath(); ctx.arc(lines[0].vx, lines[0].vy, 120, 0, Math.PI*2); ctx.fill()
      }
      const ev = ctx.createRadialGradient(W*.5, H*.5, H*.30, W*.5, H*.5, H*.95)
      ev.addColorStop(0, 'rgba(0,0,0,0)'); ev.addColorStop(1, 'rgba(0,2,12,0.70)')
      ctx.fillStyle = ev; ctx.fillRect(0, 0, W, H)

      raf = requestAnimationFrame(frame)
    }

    buildLines()
    let resizeTimer
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(buildLines, 150) }
    window.addEventListener('resize', onResize)
    raf = requestAnimationFrame(frame)

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    }
  }, [countries, maxActive])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    />
  )
}
