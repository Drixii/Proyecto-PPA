<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { overflow: hidden; background: #000; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(100,180,255,.12); border-radius: 4px; }
  </style>
</helmet>

<div style="display:flex; height:100vh; overflow:hidden; background:#000; font-family:'Space Grotesk',system-ui,sans-serif; position:relative">

  <!-- SIDEBAR -->
  <aside style="width:68px; background:rgba(8,20,50,.92); border-right:1px solid rgba(80,120,255,.1); display:flex; flex-direction:column; align-items:center; padding:20px 0; flex-shrink:0; z-index:20; position:relative">
    <div style="width:40px; height:40px; border-radius:14px; background:linear-gradient(135deg,#3b82f6,#1d4ed8); display:flex; align-items:center; justify-content:center; color:white; font-size:11px; font-weight:900; margin-bottom:28px; box-shadow:0 6px 24px rgba(59,130,246,.45); letter-spacing:-.5px">CC</div>
    <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1">
      <div style="width:44px; height:44px; border-radius:14px; background:rgba(59,130,246,.14); border:1px solid rgba(59,130,246,.25); display:flex; align-items:center; justify-content:center; color:#60a5fa; box-shadow:0 0 18px rgba(59,130,246,.18)">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
      </div>
      <div style="width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center; color:rgba(148,163,184,.4)">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
      </div>
      <div style="width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center; color:rgba(148,163,184,.4)">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
      </div>
      <div style="width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center; color:rgba(148,163,184,.4)">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </div>
      <div style="width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center; color:rgba(148,163,184,.4)">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </div>
    </div>
    <div style="color:rgba(148,163,184,.4); cursor:pointer; padding:8px">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
    </div>
  </aside>

  <!-- MAIN -->
  <div style="flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; position:relative">

    <!-- Header -->
    <header style="height:60px; background:rgba(8,20,50,.72); border-bottom:1px solid rgba(80,120,255,.12); display:flex; align-items:center; padding:0 24px; gap:10px; flex-shrink:0; z-index:15; position:relative; backdrop-filter:blur(40px)">
      <nav style="display:flex; align-items:center; border-radius:100px; padding:3px; gap:2px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08)">
        <div style="padding:6px 16px; border-radius:100px; background:rgba(59,130,246,.2); border:1px solid rgba(59,130,246,.35); color:#93c5fd; font-size:13px; font-weight:600; white-space:nowrap; box-shadow:0 0 20px rgba(59,130,246,.2)">Mi panel</div>
        <div style="padding:6px 16px; border-radius:100px; color:rgba(148,163,184,.6); font-size:13px; font-weight:500; white-space:nowrap; cursor:pointer">Pipeline</div>
        <div style="padding:6px 16px; border-radius:100px; color:rgba(148,163,184,.6); font-size:13px; font-weight:500; white-space:nowrap; cursor:pointer">Órdenes</div>
        <div style="padding:6px 16px; border-radius:100px; color:rgba(148,163,184,.6); font-size:13px; font-weight:500; white-space:nowrap; cursor:pointer">Usuarios</div>
        <div style="padding:6px 16px; border-radius:100px; color:rgba(148,163,184,.6); font-size:13px; font-weight:500; white-space:nowrap; cursor:pointer">Ajustes</div>
      </nav>
      <div style="flex:1"></div>
      <div style="width:36px; height:36px; border-radius:100px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; color:rgba(148,163,184,.6); cursor:pointer">
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>
      <div style="display:flex; align-items:center; gap:8px; border-radius:100px; padding:3px 12px 3px 3px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); cursor:pointer">
        <div style="width:32px; height:32px; border-radius:100px; background:linear-gradient(135deg,#60a5fa,#1d4ed8); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700; box-shadow:0 0 12px rgba(59,130,246,.4)">A</div>
        <div>
          <div style="font-size:12px; font-weight:600; color:#e2e8f0; line-height:1.3">Admin</div>
          <div style="font-size:10px; color:rgba(148,163,184,.6); line-height:1.3">admin@ksa.cl</div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main style="flex:1; overflow:auto; position:relative; min-height:0">

      <!-- WebGL CANVAS — liquid chromatic reflections -->
      <canvas ref="{{ canvasRef }}" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0; display:block"></canvas>

      <!-- Dashboard content -->
      <div style="position:relative; z-index:2; padding:28px; max-width:1400px; margin:0 auto">

        <div style="margin-bottom:26px">
          <h1 style="font-size:30px; font-weight:700; color:#f1f5f9; letter-spacing:-.04em; line-height:1.1">Buenos días, Admin.</h1>
          <p style="font-size:13px; color:rgba(148,163,184,.7); margin-top:5px">Tienes <strong style="color:#fbbf24">3 órdenes</strong> pendientes de procesar.</p>
        </div>

        <!-- 3-column grid -->
        <div style="display:grid; grid-template-columns:260px 1fr 280px; gap:16px; margin-bottom:16px; align-items:start">

          <!-- LEFT -->
          <div style="display:flex; flex-direction:column; gap:16px">
            <div style="border-radius:22px; padding:22px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3), inset 0 -1px 0 rgba(0,0,0,.12); backdrop-filter:blur(10px)">
              <p style="font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:rgba(148,163,184,.6); margin-bottom:8px">Volumen hoy</p>
              <div style="display:flex; align-items:flex-end; justify-content:space-between">
                <div>
                  <p style="font-size:22px; font-weight:700; color:#f1f5f9; letter-spacing:-.02em">24.580.000</p>
                  <p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:2px">CLP procesados</p>
                </div>
                <span style="font-size:10px; color:#60a5fa; font-weight:600; padding:3px 10px; border-radius:100px; background:rgba(59,130,246,.12); border:1px solid rgba(59,130,246,.22)">↑ activo</span>
              </div>
              <div style="display:flex; gap:8px; margin-top:20px">
                <button style="flex:1; background:rgba(59,130,246,.7); color:white; font-size:11px; font-weight:700; padding:9px; border-radius:12px; border:1px solid rgba(59,130,246,.4); cursor:pointer; box-shadow:0 4px 16px rgba(59,130,246,.3)">Pipeline</button>
                <button style="flex:1; font-size:11px; font-weight:600; padding:9px; border-radius:12px; border:1px solid rgba(255,255,255,.12); color:rgba(148,163,184,.7); background:rgba(255,255,255,.04); cursor:pointer">Ajustes</button>
              </div>
            </div>

            <div style="border-radius:22px; padding:22px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3), inset 0 -1px 0 rgba(0,0,0,.12); backdrop-filter:blur(10px)">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px">
                <p style="font-size:13px; font-weight:700; color:#e2e8f0">Por estado</p>
                <p style="font-size:11px; color:rgba(148,163,184,.55)">14 total</p>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; border:1px solid rgba(251,146,60,.14); background:rgba(251,146,60,.07); cursor:pointer">
                  <div style="display:flex; align-items:center; gap:9px"><div style="width:8px; height:8px; border-radius:100px; background:#fb923c; box-shadow:0 0 8px rgba(251,146,60,.7)"></div><span style="font-size:12px; font-weight:500; color:#e2e8f0">En Aprobación</span></div>
                  <span style="font-size:15px; font-weight:700; color:#f1f5f9">3</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; border:1px solid rgba(59,130,246,.14); background:rgba(59,130,246,.07); cursor:pointer">
                  <div style="display:flex; align-items:center; gap:9px"><div style="width:8px; height:8px; border-radius:100px; background:#60a5fa; box-shadow:0 0 8px rgba(96,165,250,.7)"></div><span style="font-size:12px; font-weight:500; color:#e2e8f0">En Proceso</span></div>
                  <span style="font-size:15px; font-weight:700; color:#f1f5f9">5</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; border:1px solid rgba(74,222,128,.14); background:rgba(74,222,128,.07); cursor:pointer">
                  <div style="display:flex; align-items:center; gap:9px"><div style="width:8px; height:8px; border-radius:100px; background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,.7)"></div><span style="font-size:12px; font-weight:500; color:#e2e8f0">Completado</span></div>
                  <span style="font-size:15px; font-weight:700; color:#f1f5f9">6</span>
                </div>
              </div>
            </div>
          </div>

          <!-- MIDDLE 2x2 -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
            <div style="border-radius:22px; padding:24px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); display:flex; flex-direction:column; justify-content:space-between; min-height:172px; cursor:pointer; backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3)">
              <div style="display:flex; align-items:flex-start; justify-content:space-between">
                <p style="font-size:13px; font-weight:600; color:rgba(226,232,240,.9)">Órdenes Hoy</p>
                <div style="width:34px; height:34px; background:rgba(59,130,246,.18); border-radius:12px; border:1px solid rgba(59,130,246,.3); display:flex; align-items:center; justify-content:center">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#93c5fd" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </div>
              </div>
              <div>
                <p style="font-size:56px; font-weight:700; color:#f1f5f9; line-height:1; letter-spacing:-.05em">14</p>
                <p style="font-size:11px; color:rgba(148,163,184,.6); margin-top:5px">ver todas →</p>
              </div>
            </div>
            <div style="border-radius:22px; padding:24px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); display:flex; flex-direction:column; justify-content:space-between; min-height:172px; cursor:pointer; backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3)">
              <div style="display:flex; align-items:flex-start; justify-content:space-between">
                <p style="font-size:13px; font-weight:600; color:rgba(226,232,240,.7)">Pendientes</p>
                <div style="width:34px; height:34px; background:rgba(251,191,36,.1); border-radius:12px; border:1px solid rgba(251,191,36,.18); display:flex; align-items:center; justify-content:center"><div style="width:10px; height:10px; background:#fbbf24; border-radius:100px; box-shadow:0 0 10px rgba(251,191,36,.7)"></div></div>
              </div>
              <div>
                <p style="font-size:56px; font-weight:700; color:#f1f5f9; line-height:1; letter-spacing:-.05em">3</p>
                <p style="font-size:11px; color:rgba(148,163,184,.5); margin-top:5px">sin procesar →</p>
              </div>
            </div>
            <div style="border-radius:22px; padding:24px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); display:flex; flex-direction:column; justify-content:space-between; min-height:172px; cursor:pointer; backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3)">
              <div style="display:flex; align-items:flex-start; justify-content:space-between">
                <p style="font-size:13px; font-weight:600; color:rgba(226,232,240,.7)">En Proceso</p>
                <div style="width:34px; height:34px; background:rgba(99,102,241,.1); border-radius:12px; border:1px solid rgba(99,102,241,.18); display:flex; align-items:center; justify-content:center"><div style="width:10px; height:10px; background:#818cf8; border-radius:100px; box-shadow:0 0 10px rgba(129,140,248,.7)"></div></div>
              </div>
              <div>
                <p style="font-size:56px; font-weight:700; color:#f1f5f9; line-height:1; letter-spacing:-.05em">5</p>
                <p style="font-size:11px; color:rgba(148,163,184,.5); margin-top:5px">procesando →</p>
              </div>
            </div>
            <div style="border-radius:22px; padding:24px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); display:flex; flex-direction:column; justify-content:space-between; min-height:172px; cursor:pointer; backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3)">
              <div style="display:flex; align-items:flex-start; justify-content:space-between">
                <p style="font-size:13px; font-weight:600; color:rgba(226,232,240,.7)">Completadas</p>
                <div style="width:34px; height:34px; background:rgba(74,222,128,.1); border-radius:12px; border:1px solid rgba(74,222,128,.18); display:flex; align-items:center; justify-content:center"><div style="width:10px; height:10px; background:#4ade80; border-radius:100px; box-shadow:0 0 10px rgba(74,222,128,.7)"></div></div>
              </div>
              <div>
                <p style="font-size:56px; font-weight:700; color:#f1f5f9; line-height:1; letter-spacing:-.05em">6</p>
                <p style="font-size:11px; color:rgba(148,163,184,.5); margin-top:5px">completadas →</p>
              </div>
            </div>
          </div>

          <!-- RIGHT -->
          <div style="border-radius:22px; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); display:flex; flex-direction:column; overflow:hidden; backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3); max-height:392px">
            <div style="padding:16px 20px; border-bottom:1px solid rgba(255,255,255,.08)">
              <h2 style="font-size:13px; font-weight:700; color:#e2e8f0">Actividad reciente</h2>
              <p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:2px">Últimas órdenes ingresadas</p>
            </div>
            <div style="flex:1; overflow-y:auto">
              <div style="display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,.05); cursor:pointer">
                <div style="width:36px; height:36px; border-radius:100px; background:linear-gradient(135deg,#60a5fa,#1d4ed8); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700; flex-shrink:0">J</div>
                <div style="flex:1; min-width:0"><p style="font-size:12px; font-weight:600; color:#e2e8f0">Juan García</p><p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:1px">500.000 CLP → 🇺🇸 MIA</p></div>
                <div style="width:7px; height:7px; border-radius:100px; background:#fb923c; box-shadow:0 0 7px rgba(251,146,60,.7)"></div>
              </div>
              <div style="display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,.05); cursor:pointer">
                <div style="width:36px; height:36px; border-radius:100px; background:linear-gradient(135deg,#a78bfa,#4338ca); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700; flex-shrink:0">M</div>
                <div style="flex:1; min-width:0"><p style="font-size:12px; font-weight:600; color:#e2e8f0">María López</p><p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:1px">1.200.000 CLP → 🇪🇸 MAD</p></div>
                <div style="width:7px; height:7px; border-radius:100px; background:#60a5fa; box-shadow:0 0 7px rgba(96,165,250,.7)"></div>
              </div>
              <div style="display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,.05); cursor:pointer">
                <div style="width:36px; height:36px; border-radius:100px; background:linear-gradient(135deg,#4ade80,#16a34a); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700; flex-shrink:0">C</div>
                <div style="flex:1; min-width:0"><p style="font-size:12px; font-weight:600; color:#e2e8f0">Carlos Rodríguez</p><p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:1px">800.000 CLP → 🇵🇦 PAN</p></div>
                <div style="width:7px; height:7px; border-radius:100px; background:#4ade80; box-shadow:0 0 7px rgba(74,222,128,.7)"></div>
              </div>
              <div style="display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,.05); cursor:pointer">
                <div style="width:36px; height:36px; border-radius:100px; background:linear-gradient(135deg,#60a5fa,#1d4ed8); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700; flex-shrink:0">A</div>
                <div style="flex:1; min-width:0"><p style="font-size:12px; font-weight:600; color:#e2e8f0">Ana Martínez</p><p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:1px">350.000 CLP → 🇨🇴 BOG</p></div>
                <div style="width:7px; height:7px; border-radius:100px; background:#60a5fa; box-shadow:0 0 7px rgba(96,165,250,.7)"></div>
              </div>
              <div style="display:flex; align-items:center; gap:12px; padding:12px 20px; cursor:pointer">
                <div style="width:36px; height:36px; border-radius:100px; background:linear-gradient(135deg,#fb923c,#c2410c); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700; flex-shrink:0">P</div>
                <div style="flex:1; min-width:0"><p style="font-size:12px; font-weight:600; color:#e2e8f0">Pedro Valenzuela</p><p style="font-size:11px; color:rgba(148,163,184,.55); margin-top:1px">2.100.000 CLP → 🇺🇸 NYC</p></div>
                <div style="width:7px; height:7px; border-radius:100px; background:#fb923c; box-shadow:0 0 7px rgba(251,146,60,.7)"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Table -->
        <div style="border-radius:22px; overflow:hidden; background:rgba(255,255,255,.0); border:1px solid rgba(255,255,255,.05); backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,.35), inset 0 1.5px 0 rgba(255,255,255,.3)">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 24px; border-bottom:1px solid rgba(255,255,255,.08)">
            <h2 style="font-size:13px; font-weight:700; color:#e2e8f0">Órdenes recientes</h2>
            <span style="font-size:12px; color:#60a5fa; cursor:pointer; font-weight:500">Ver pipeline →</span>
          </div>
          <table style="width:100%; border-collapse:collapse">
            <thead>
              <tr style="background:rgba(0,0,0,.15)">
                <th style="text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:rgba(148,163,184,.55); padding:10px 24px">Order ID</th>
                <th style="text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:rgba(148,163,184,.55); padding:10px 16px">Cliente</th>
                <th style="text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:rgba(148,163,184,.55); padding:10px 16px">Monto</th>
                <th style="text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:rgba(148,163,184,.55); padding:10px 16px">Estado</th>
                <th style="text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:rgba(148,163,184,.55); padding:10px 16px">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
                <td style="padding:14px 24px"><span style="font-family:monospace; font-size:11px; color:rgba(148,163,184,.5)">ORD-2026-0123</span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:8px"><div style="width:28px; height:28px; border-radius:100px; background:linear-gradient(135deg,#60a5fa,#1d4ed8); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:700">J</div><span style="font-size:13px; font-weight:500; color:#e2e8f0">Juan García</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:13px; font-weight:600; color:#f1f5f9">500.000 <span style="font-weight:400; font-size:11px; color:rgba(148,163,184,.5)">CLP</span></span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:6px"><div style="width:6px; height:6px; border-radius:100px; background:#fb923c; box-shadow:0 0 6px rgba(251,146,60,.6)"></div><span style="font-size:11px; color:rgba(226,232,240,.7)">en aprobación</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:11px; color:rgba(148,163,184,.5)">17 jun, 09:14</span></td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
                <td style="padding:14px 24px"><span style="font-family:monospace; font-size:11px; color:rgba(148,163,184,.5)">ORD-2026-0122</span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:8px"><div style="width:28px; height:28px; border-radius:100px; background:linear-gradient(135deg,#a78bfa,#4338ca); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:700">M</div><span style="font-size:13px; font-weight:500; color:#e2e8f0">María López</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:13px; font-weight:600; color:#f1f5f9">1.200.000 <span style="font-weight:400; font-size:11px; color:rgba(148,163,184,.5)">CLP</span></span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:6px"><div style="width:6px; height:6px; border-radius:100px; background:#60a5fa; box-shadow:0 0 6px rgba(96,165,250,.6)"></div><span style="font-size:11px; color:rgba(226,232,240,.7)">en proceso</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:11px; color:rgba(148,163,184,.5)">17 jun, 08:52</span></td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
                <td style="padding:14px 24px"><span style="font-family:monospace; font-size:11px; color:rgba(148,163,184,.5)">ORD-2026-0121</span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:8px"><div style="width:28px; height:28px; border-radius:100px; background:linear-gradient(135deg,#4ade80,#16a34a); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:700">C</div><span style="font-size:13px; font-weight:500; color:#e2e8f0">Carlos Rodríguez</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:13px; font-weight:600; color:#f1f5f9">800.000 <span style="font-weight:400; font-size:11px; color:rgba(148,163,184,.5)">CLP</span></span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:6px"><div style="width:6px; height:6px; border-radius:100px; background:#4ade80; box-shadow:0 0 6px rgba(74,222,128,.6)"></div><span style="font-size:11px; color:rgba(226,232,240,.7)">completado</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:11px; color:rgba(148,163,184,.5)">17 jun, 08:30</span></td>
              </tr>
              <tr>
                <td style="padding:14px 24px"><span style="font-family:monospace; font-size:11px; color:rgba(148,163,184,.5)">ORD-2026-0120</span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:8px"><div style="width:28px; height:28px; border-radius:100px; background:linear-gradient(135deg,#fb923c,#c2410c); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:700">P</div><span style="font-size:13px; font-weight:500; color:#e2e8f0">Pedro Valenzuela</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:13px; font-weight:600; color:#f1f5f9">2.100.000 <span style="font-weight:400; font-size:11px; color:rgba(148,163,184,.5)">CLP</span></span></td>
                <td style="padding:14px 16px"><div style="display:flex; align-items:center; gap:6px"><div style="width:6px; height:6px; border-radius:100px; background:#fb923c; box-shadow:0 0 6px rgba(251,146,60,.6)"></div><span style="font-size:11px; color:rgba(226,232,240,.7)">en aprobación</span></div></td>
                <td style="padding:14px 16px"><span style="font-size:11px; color:rgba(148,163,184,.5)">17 jun, 07:45</span></td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </main>
  </div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{
  &quot;$preview&quot;: { &quot;width&quot;: 1440, &quot;height&quot;: 900 }
}">
class Component extends DCLogic {
  canvasRef = React.createRef()

  componentDidMount() {
    setTimeout(() => this._init(), 80)
    this._onResize = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this._resize(), 150) }
    window.addEventListener('resize', this._onResize)
  }

  componentWillUnmount() {
    this._dead = true
    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._onResize)
  }

  _init() {
    const cv = this.canvasRef.current
    if (!cv) return
    this._cv  = cv
    this._ctx = cv.getContext('2d')
    this._resize()
    this._lastSpark = 0
    const loop = ts => {
      if (this._dead) return
      this._frame(ts)
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  _resize() {
    const cv = this._cv
    if (!cv) return
    const p = cv.parentElement
    if (!p) return
    cv.width  = p.offsetWidth
    cv.height = p.offsetHeight
    this._W = cv.width
    this._H = cv.height
    this._buildLines()
  }

  _buildLines() {
    const W = this._W, H = this._H
    if (!W || !H) return
    // Vanishing point — bottom center
    const vx = W * 0.5, vy = H

    // Lines fan outward from bottom center → top edge (full width)
    const lines = []
    const edgePoints = [
      // Top edge — full width
      { x: W * 0.00, y: 0 },
      { x: W * 0.08, y: 0 },
      { x: W * 0.18, y: 0 },
      { x: W * 0.28, y: 0 },
      { x: W * 0.38, y: 0 },
      { x: W * 0.50, y: 0 },
      { x: W * 0.62, y: 0 },
      { x: W * 0.72, y: 0 },
      { x: W * 0.82, y: 0 },
      { x: W * 0.92, y: 0 },
      { x: W * 1.00, y: 0 },
      // Left edge top portion
      { x: 0, y: H * 0.00 },
      { x: 0, y: H * 0.20 },
      { x: 0, y: H * 0.40 },
      // Right edge top portion
      { x: W, y: H * 0.00 },
      { x: W, y: H * 0.20 },
      { x: W, y: H * 0.40 },
    ]

    edgePoints.forEach((ep, i) => {
      lines.push({
        vx, vy,
        ex: ep.x, ey: ep.y,
        t:       -1,          // -1 = inactivo, esperando
        active:  false,
        waitUntil: i * 900,   // arrancan escalonados
        speed:   0.00028 + Math.random() * 0.00012,  // muy lento
        flag:    'US',
      })
    })
    this._lines = lines

    // Países destino — código + especificación de bandera (dibujada en canvas)
    this._flagSpecs = {
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
    this._flags = Object.keys(this._flagSpecs)

    // Imágenes reales de banderas (flagcdn) — con todos los detalles
    if (!this._flagImgs) {
      this._flagImgs = {}
      this._flags.forEach(code => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = 'https://flagcdn.com/w160/' + code.toLowerCase() + '.png'
        this._flagImgs[code] = img
      })
    }
  }

  _drawFlag(ctx, code, cx, cy, w) {
    const h  = w * 0.66
    const x0 = cx - w/2, y0 = cy - h/2
    const rad = Math.max(1, w * 0.09)

    // Path redondeado reutilizable
    const roundPath = () => {
      ctx.beginPath()
      ctx.moveTo(x0+rad, y0)
      ctx.arcTo(x0+w, y0,   x0+w, y0+h, rad)
      ctx.arcTo(x0+w, y0+h, x0,   y0+h, rad)
      ctx.arcTo(x0,   y0+h, x0,   y0,   rad)
      ctx.arcTo(x0,   y0,   x0+w, y0,   rad)
      ctx.closePath()
    }

    const img = this._flagImgs && this._flagImgs[code]
    if (img && img.complete && img.naturalWidth > 0) {
      // ── Bandera REAL (imagen con todos los detalles) ──
      ctx.save()
      roundPath(); ctx.clip()
      ctx.drawImage(img, x0, y0, w, h)
      ctx.restore()
    } else {
      // ── Fallback: franjas mientras carga la imagen ──
      const spec = this._flagSpecs[code]
      if (!spec) return
      ctx.save(); roundPath(); ctx.clip()
      const total = spec.bands.reduce((s,b)=>s+b[1], 0)
      if (spec.dir === 'h') {
        let yy = y0
        spec.bands.forEach(([col,wt]) => { const bh = h*wt/total; ctx.fillStyle = col; ctx.fillRect(x0, yy, w, bh+0.5); yy += bh })
      } else {
        let xx = x0
        spec.bands.forEach(([col,wt]) => { const bw = w*wt/total; ctx.fillStyle = col; ctx.fillRect(xx, y0, bw+0.5, h); xx += bw })
      }
      if (spec.canton)  { ctx.fillStyle = spec.canton;  ctx.fillRect(x0, y0, w*0.42, h*0.5) }
      if (spec.leftBar) { ctx.fillStyle = spec.leftBar; ctx.fillRect(x0, y0, w*0.28, h) }
      ctx.restore()
    }

    // borde sutil
    ctx.save()
    roundPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.restore()
  }



  _drawLine(ctx, line, t) {
    const { vx, vy, ex, ey } = line
    const dx  = ex - vx, dy = ey - vy
    const len = Math.sqrt(dx*dx + dy*dy) || 1
    const px  = -dy / len, py = dx / len   // perpendicular unit

    // ── 1. Línea guía — MUY tenue, NO prende (solo referencia) ─
    ctx.save()
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(ex, ey)
    const guide = ctx.createLinearGradient(vx, vy, ex, ey)
    guide.addColorStop(0,   'rgba(40,70,150,0.10)')
    guide.addColorStop(0.6, 'rgba(40,70,150,0.04)')
    guide.addColorStop(1,   'rgba(40,70,150,0)')
    ctx.strokeStyle = guide
    ctx.lineWidth   = 1
    ctx.stroke()
    ctx.restore()

    // ── 2. Pulso viajero — solo si está activo ─────────────────
    if (t < 0) return

    const steleLen = 0.34          // largo de la estela
    const head = t
    const tail = Math.max(0, head - steleLen)

    const hx  = vx + dx * head, hy  = vy + dy * head
    const tx2 = vx + dx * tail, ty2 = vy + dy * tail

    // Perspectiva 3D fuerte: GRANDE y cerca al inicio (abajo) →
    // se ACHICA y aleja rápido hacia el frente (arriba/lejos)
    const persp = h => Math.pow(1 - h, 2.2)   // caída marcada = sensación 3D
    const wHead = persp(head) * 2.0 + 0.6
    const wTail = persp(tail) * 2.0 + 0.6

    const p1x = hx  + px * wHead, p1y = hy  + py * wHead
    const p2x = hx  - px * wHead, p2y = hy  - py * wHead
    const p3x = tx2 - px * wTail, p3y = ty2 - py * wTail
    const p4x = tx2 + px * wTail, p4y = ty2 + py * wTail

    const sg = ctx.createLinearGradient(tx2, ty2, hx, hy)
    sg.addColorStop(0,   'rgba(29,78,216,0)')
    sg.addColorStop(0.5, 'rgba(29,78,216,0.45)')
    sg.addColorStop(1,   'rgba(59,130,246,0.95)')
    ctx.save()
    ctx.shadowBlur  = 14
    ctx.shadowColor = 'rgba(29,78,216,0.8)'
    ctx.beginPath()
    ctx.moveTo(p1x,p1y); ctx.lineTo(p2x,p2y)
    ctx.lineTo(p3x,p3y); ctx.lineTo(p4x,p4y)
    ctx.closePath()
    ctx.fillStyle = sg; ctx.fill()
    ctx.restore()

    // ── 3. Punta = banderita del país destino (escala 3D) ──────
    const tipR  = persp(head) * 6.0 + 1.2

    // Glow suave detrás de la bandera para que resalte
    const bloom = ctx.createRadialGradient(hx, hy, 0, hx, hy, tipR * 4.5)
    bloom.addColorStop(0,   'rgba(59,130,246,0.55)')
    bloom.addColorStop(0.5, 'rgba(29,78,216,0.20)')
    bloom.addColorStop(1,   'rgba(29,78,216,0)')
    ctx.beginPath(); ctx.arc(hx, hy, tipR * 4.5, 0, Math.PI*2)
    ctx.fillStyle = bloom; ctx.fill()

    // Banderita real — más pequeña, escala suave con la perspectiva
    const flagW = (1 - head * 0.5) * 20 + 15   // ~35px cerca → ~15px lejos
    // sombra suave para contraste
    ctx.save()
    ctx.shadowBlur  = 10
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    this._drawFlag(ctx, line.flag, hx, hy, flagW)
    ctx.restore()
  }

  _frame(ts) {
    const ctx = this._ctx, W = this._W, H = this._H
    if (!ctx || !W || !H || !this._lines) return

    const t  = ts * 0.001
    const dt = Math.min(ts - (this._prevTs || ts), 50)
    this._prevTs = ts

    // ── 1. Background ─────────────────────────────────────────
    ctx.fillStyle = '#020818'
    ctx.fillRect(0, 0, W, H)

    // Glow desde el punto de fuga abajo
    const bg1 = ctx.createRadialGradient(W*.5, H, 0, W*.5, H, H*1.1)
    bg1.addColorStop(0,   'rgba(29,78,216,0.55)')
    bg1.addColorStop(0.4, 'rgba(17,47,135,0.28)')
    bg1.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = bg1; ctx.fillRect(0, 0, W, H)

    // Glow lateral izquierdo
    const bg2 = ctx.createRadialGradient(0, H*.80, 0, 0, H*.80, W*.60)
    bg2.addColorStop(0,   'rgba(29,78,216,0.32)')
    bg2.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = bg2; ctx.fillRect(0, 0, W, H)

    // Glow lateral derecho
    const bg3 = ctx.createRadialGradient(W, H*.80, 0, W, H*.80, W*.60)
    bg3.addColorStop(0,   'rgba(29,78,216,0.32)')
    bg3.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = bg3; ctx.fillRect(0, 0, W, H)

    // ── 2. Activar líneas de a poco y avanzar pulsos ──────────
    const MAX_ACTIVE = 2   // pulsos simultáneos

    this._lines.forEach(line => {
      // Activar si llegó su turno y hay cupo
      if (!line.active && ts > line.waitUntil) {
        const activeCount = this._lines.filter(l => l.active).length
        if (activeCount < MAX_ACTIVE) {
          line.active = true
          line.t = 0
          line.flag = this._flags[Math.floor(Math.random() * this._flags.length)]
        } else {
          line.waitUntil = ts + 400 + Math.random() * 600
        }
      }

      // Dibujar línea base siempre (sin pulso)
      this._drawLine(ctx, line, line.active ? line.t : -1)

      // Avanzar pulso
      if (line.active) {
        line.t += line.speed * dt
        if (line.t >= 1) {
          line.active   = false
          line.t        = -1
          // Esperar un rato antes de volver a pulsar
          line.waitUntil = ts + 2500 + Math.random() * 4000
        }
      }
    })

    // ── 3. Glow en punto de fuga (abajo centro) ───────────────
    const vx2 = this._lines[0].vx, vy2 = this._lines[0].vy
    const vg = ctx.createRadialGradient(vx2, vy2, 0, vx2, vy2, 120)
    vg.addColorStop(0,   'rgba(59,130,246,0.45)')
    vg.addColorStop(0.4, 'rgba(29,78,216,0.18)')
    vg.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = vg
    ctx.beginPath(); ctx.arc(vx2, vy2, 120, 0, Math.PI*2); ctx.fill()

    // Edge vignette
    const ev = ctx.createRadialGradient(W*.5, H*.5, H*.30, W*.5, H*.5, H*.95)
    ev.addColorStop(0, 'rgba(0,0,0,0)')
    ev.addColorStop(1, 'rgba(0,2,12,0.70)')
    ctx.fillStyle = ev; ctx.fillRect(0, 0, W, H)
  }

  renderVals() {
    return { canvasRef: this.canvasRef }
  }
}
</script>
</body>
</html>
