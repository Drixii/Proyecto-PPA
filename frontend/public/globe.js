(function(){
  if (window.__ksaStop) window.__ksaStop();
  var stopped=false, raf=0, anim=0;
  var cv,ctx,hero,gridTitle,pin,hint,W=0,H=0,rot=0,progress=0;
  // Rendimiento. El globo se llevaba ~10 s de procesador en un móvil medio y
  // retrasaba el título de la portada: dibujaba cada uno de sus ~1.000 puntos
  // y ~500 tramos de arco con su propio color y su propio fill(). Ahora los
  // puntos y los tramos se agrupan por nivel de transparencia y cada grupo se
  // pinta de una vez (unas 40 llamadas en vez de 1.500), la geometría fija se
  // calcula al arrancar, el móvil va a 30 fotogramas y, fuera de pantalla, no
  // se dibuja nada. A la vista es el mismo globo.
  var NIV_P=16,NIV_A=8,cubF=[],cubB=[],cubL=[],ultimoDibujo=0;
  for(var _n=0;_n<NIV_P;_n++){cubF.push([]);cubB.push([]);}
  for(_n=0;_n<NIV_A;_n++)cubL.push([]);
  function estilo(el,prop,val){ if(el['__'+prop]!==val){ el['__'+prop]=val; el.style[prop]=val; } }

  // Las posiciones son a ojo, no las capitales reales. Con las de verdad casi
  // todas caen en la misma franja del Atlántico sur y las banderas se montan
  // unas sobre otras; separadas así se leen todas. Cada una sigue estando en
  // su país, solo que descentrada.
  var countries=[
    { iso:'ca', name:'Canadá',    lat:58.0,  lon:-108.0 },
    { iso:'us', name:'EE.UU.',    lat:39.0,  lon:-98.0  },
    { iso:'mx', name:'México',    lat:22.0,  lon:-103.0 },
    { iso:'co', name:'Colombia',  lat:5.0,   lon:-75.0  },
    { iso:'ve', name:'Venezuela', lat:13.0,  lon:-62.0  },
    { iso:'pe', name:'Perú',      lat:-10.0, lon:-79.0  },
    { iso:'br', name:'Brasil',    lat:-11.0, lon:-50.0  },
    { iso:'ar', name:'Argentina', lat:-38.0, lon:-60.0  },
    { iso:'cl', name:'Chile',     lat:-31.0, lon:-73.0  },
    { iso:'es', name:'España',    lat:40.4,  lon:-3.7   }
  ];

  // La bandera del globo y la fila que manda el servidor no siempre llevan el
  // mismo código: en la tabla de países el euro está dado de alta como EURO
  // (eu), no como España, así que sin esto la bandera española se quedaba sin
  // badge.
  var ALIAS={ es:'eu' };

  // Precio de cada moneda contra el dólar y cuánto se movió hoy. Si la
  // petición falla el globo sigue igual, solo sin los badges.
  function cargarPrecios(){
    fetch('/api/rates/cinta').then(function(r){return r.json();}).then(function(j){
      var porIso={};
      (j.data||[]).forEach(function(f){ if(f.iso2) porIso[f.iso2.toLowerCase()]=f; });
      countries.forEach(function(c){
        var f=porIso[ALIAS[c.iso]||c.iso];
        if(f){ c.precio=f.rate; c.variacion=f.variacion; }
      });
    }).catch(function(){});
  }

  function precioCorto(v){
    if(v==null)return null;
    if(v>=1000)return Math.round(v).toLocaleString('es-CL');
    if(v>=1)return v.toLocaleString('es-CL',{maximumFractionDigits:2});
    return v.toLocaleString('es-CL',{maximumFractionDigits:4});
  }

  // Badge bajo la bandera: el precio y la flecha del día. `fs` es el cuerpo de
  // letra, que en la esfera va más pequeño que en la cuadrícula.
  function badgePrecio(c,px,py,alpha,fs){
    if(alpha<0.05)return;
    // El dólar es la base de todas las tasas: "USD contra USD" es 1 y no dice
    // nada, así que el servidor no lo manda. En vez de dejar a EE.UU. sin
    // badge, ahí se dice justo eso.
    var base=c.iso==='us';
    var txt=base?'USD base':precioCorto(c.precio);
    if(txt==null)return;
    var sube=(c.variacion||0)>=0;
    var pct=(base||c.variacion==null)?'':(sube?'▲ ':'▼ ')+Math.abs(c.variacion).toFixed(2)+'%';

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.font='700 '+fs+'px \'Space Grotesk\',system-ui,sans-serif';
    var wTxt=ctx.measureText(txt).width;
    var wPct=pct?ctx.measureText(pct).width:0;
    var hueco=pct?fs*0.6:0;
    var w=wTxt+wPct+hueco+fs*1.5, h=fs*1.8, x=px-w/2, y=py;

    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,y,w,h,h/2);
    else ctx.rect(x,y,w,h);
    ctx.fillStyle='rgba(8,16,44,.82)';ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1;ctx.stroke();

    ctx.textAlign='left';
    ctx.textBaseline='middle';
    ctx.fillStyle='#eaf2ff';
    ctx.fillText(txt,x+fs*0.75,y+h/2+0.5);
    if(pct){
      ctx.fillStyle=sube?'#4ade80':'#f87171';
      ctx.fillText(pct,x+fs*0.75+wTxt+hueco,y+h/2+0.5);
    }
    ctx.restore();
  }

  // Los países que se atienden caben todos en el mismo rincón del mundo, así
  // que en el globo las banderas se pisan unas a otras. Aquí se reparten por
  // toda la esfera en vez de respetar el mapa:
  //
  // - Las longitudes, a la misma distancia una de otra alrededor del globo,
  //   así que girando van apareciendo de una en una y siempre hay unas cuantas
  //   de cara.
  // - Las latitudes, dentro de una banda de ±38°. Más arriba o más abajo la
  //   esfera las escorza contra el borde y quedan escondidas, que es justo lo
  //   que se quería evitar; el ángulo áureo las va alternando para que no
  //   salga un collar de banderas todas a la misma altura.
  //
  // Se conserva el orden de oeste a este, que es lo único del mapa que sigue
  // significando algo aquí.
  var BANDA=38, AUREO=2.39996;
  function repartir(){
    var orden=countries.slice().sort(function(a,b){return a.lon-b.lon;});
    var n=orden.length;
    orden.forEach(function(c,i){
      var lon=-180+(i+0.5)*(360/n);
      var lat=BANDA*Math.sin(i*AUREO);
      c.vecGlobo=toVec(lat,lon);
    });
  }
  var dots=[], arcs=[];

  function toVec(la,lo){var a=la*Math.PI/180,b=lo*Math.PI/180;return [Math.cos(a)*Math.sin(b),Math.sin(a),Math.cos(a)*Math.cos(b)];}
  function slerp(a,b,t){var d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2];d=Math.max(-1,Math.min(1,d));var om=Math.acos(d),so=Math.sin(om)||1e-6;var s0=Math.sin((1-t)*om)/so,s1=Math.sin(t*om)/so;return [a[0]*s0+b[0]*s1,a[1]*s0+b[1]*s1,a[2]*s0+b[2]*s1];}
  function ease(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

  var lastCv=null;
  function refresh(){
    var nc=document.getElementById('globe-cv');
    pin=document.getElementById('pin-wrap');
    hero=document.getElementById('hero-content');
    gridTitle=document.getElementById('grid-title');
    hint=document.getElementById('scroll-hint');
    if(nc&&nc!==lastCv){ lastCv=nc; cv=nc; ctx=cv.getContext('2d'); resize(); }
  }

  function resize(){
    if(!cv||!ctx)return;
    var dpr=Math.min(window.devicePixelRatio||1,(window.innerWidth<768)?1.5:2);
    var r=cv.getBoundingClientRect();
    W=r.width;H=r.height;
    cv.width=Math.max(1,r.width*dpr);cv.height=Math.max(1,r.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  var _rawP=0;
  function updateProgress(){
    if(!pin)return;
    if(window.__heroProgress!=null){
      _rawP=window.__heroProgress;
      progress=_rawP; // sin lerp durante animacion automatica
    } else {
      var vh=window.innerHeight;
      var total=pin.offsetHeight-vh;
      _rawP=total>0?clamp(-pin.getBoundingClientRect().top/total,0,1):0;
      if(W<768){ progress+=(_rawP-progress)*(1-Math.pow(1-0.035,(window.__ksaDt||16.7)/16.7)); }
      else { progress=_rawP; }
    }
    window.__heroVisualProgress=progress;
    var p=progress;
    var heroDeadZone=W<768?0.35:0;
    var heroOut=clamp((p-heroDeadZone)/0.22,0,1);
    if(hero){
      var deadP=W<768?clamp(p/heroDeadZone,0,1):0;
      var scrollMove=deadP*200;
      var fadeMove=heroOut*40;
      estilo(hero,'opacity',(1-heroOut).toFixed(3));
      estilo(hero,'transform','translateY('+(-(scrollMove+fadeMove)).toFixed(1)+'px)');
      estilo(hero,'pointerEvents',heroOut>0.4?'none':'auto');
    }
    if(gridTitle)estilo(gridTitle,'opacity',clamp((p-0.46)/0.22,0,1).toFixed(3));
    if(hint)estilo(hint,'opacity',(1-clamp(p/0.1,0,1)).toFixed(3));
  }

  function grid(){
    var n=countries.length;
    if(W>=720){
      var cols=5,fr=33,cellW=fr*2+78,cellH=fr*2+50,rows=Math.ceil(n/cols);
      return {fr:fr,cols:cols,rows:rows,n:n,cellW:cellW,cellH:cellH,
        startX:W*0.5-(cols*cellW)/2+cellW/2,
        startY:H*0.57-(rows*cellH)/2+cellH/2,fs:14,fsBadge:12};
    }

    // Móvil: tres columnas y hacia abajo. Con dos, las diez banderas eran
    // cinco filas que no cabían bajo el título, y la primera fila —Canadá y
    // EE.UU.— se pintaba encima del texto. Ahora la cuadrícula empieza donde
    // acaba el título, medido del DOM y no supuesto, y reparte el alto que
    // queda entre las filas.
    var cols=3,rows=Math.ceil(n/cols);
    var arriba=gridTitle?(gridTitle.offsetTop+gridTitle.offsetHeight+14):H*0.3;
    var abajo=H-12;
    var cellW=Math.min(128,(W-16)/cols);
    var cellH=clamp((abajo-arriba)/rows,76,120);
    // Lo que ocupa una celda por encima y por debajo del centro de la
    // bandera: el nombre arriba y el badge abajo. La bandera se ajusta para
    // que las dos mitades quepan en media celda.
    var fs=13,fsBadge=11;
    var fr=clamp(Math.floor((cellH/2-fsBadge*1.8-8)/0.736),14,22);
    return {fr:fr,cols:cols,rows:rows,n:n,cellW:cellW,cellH:cellH,
      startX:W*0.5-(cols*cellW)/2+cellW/2,
      startY:arriba+cellH/2,fs:fs,fsBadge:fsBadge};
  }

  function cityFlag(c,sx,sy,fr,alpha,haloAlpha){
    if(haloAlpha>0.01){
      var hh=ctx.createRadialGradient(sx,sy,fr*0.4,sx,sy,fr*2.8);
      hh.addColorStop(0,'rgba(255,220,0,'+(haloAlpha*0.52)+')');
      hh.addColorStop(0.45,'rgba(255,160,0,'+(haloAlpha*0.26)+')');
      hh.addColorStop(1,'rgba(255,100,0,0)');
      ctx.fillStyle=hh;ctx.beginPath();ctx.arc(sx,sy,fr*2.8,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='rgba(10,18,46,'+(alpha*0.9)+')';
    ctx.beginPath();ctx.arc(sx,sy,fr,0,Math.PI*2);ctx.fill();
    var img=c.img;
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.save();ctx.globalAlpha=alpha;
      ctx.beginPath();ctx.arc(sx,sy,fr-0.5,0,Math.PI*2);ctx.clip();
      var asp=img.naturalWidth/(img.naturalHeight||1),dw=fr*2,dh=dw/asp;
      ctx.drawImage(img,sx-fr,sy-dh/2,dw,dh);ctx.restore();
    }
    ctx.strokeStyle='rgba(125,211,252,'+(alpha*0.7)+')';ctx.lineWidth=1.8;
    ctx.beginPath();ctx.arc(sx,sy,fr,0,Math.PI*2);ctx.stroke();
  }

  function wavingFlag(c,cx,cy,w,alpha,t,phase){
    var img=c.img;
    if(!img||!img.complete||!img.naturalWidth){return;}
    var h=w*0.64;
    var cols=64;                       // muchas tiras de alta resolución = ondeo nítido
    var amp=h*0.07;
    var freq=1.9;
    var iw=img.naturalWidth, ih=img.naturalHeight;
    var srcSlice=iw/cols;
    var sliceW=w/cols;
    // sombra suave detrás
    ctx.save();
    ctx.globalAlpha=alpha*0.9;
    ctx.shadowColor='rgba(0,0,0,0.4)';ctx.shadowBlur=12;ctx.shadowOffsetY=5;
    ctx.fillStyle='#0a1a3a';
    ctx.fillRect(cx-w/2, cy-h/2, w, h);
    ctx.restore();
    // tiras con desplazamiento sinusoidal (más al borde derecho), suavizado alto
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    for(var i=0;i<cols;i++){
      var f=i/cols;
      var dx=cx - w/2 + f*w;
      var off=Math.sin(f*freq*Math.PI*2 + phase + t*2.2)*amp*(0.3+f*0.95);
      ctx.drawImage(img, i*srcSlice,0, srcSlice+0.8, ih, dx, cy - h/2 + off, sliceW+0.8, h);
    }
    ctx.restore();
    // filo superior tenue que sigue la onda
    ctx.save();
    ctx.globalAlpha=alpha*0.45;
    ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1;
    ctx.beginPath();
    for(var k=0;k<=cols;k++){
      var fk=k/cols, dxk=cx-w/2+fk*w;
      var offk=Math.sin(fk*freq*Math.PI*2 + phase + t*2.2)*amp*(0.3+fk*0.95);
      if(k===0)ctx.moveTo(dxk,cy-h/2+offk); else ctx.lineTo(dxk,cy-h/2+offk);
    }
    ctx.stroke();
    ctx.restore();
  }

  function frame(ts){
    if(stopped)return;
    if(W&&W<768&&ultimoDibujo&&ts-ultimoDibujo<30){anim=requestAnimationFrame(frame);return;}
    var dt=ultimoDibujo?Math.min(100,ts-ultimoDibujo):16.7;
    ultimoDibujo=ts;
    window.__ksaDt=dt;
    refresh();
    updateProgress();
    if((frame._t=(frame._t||0)+1)%10===0)revealCheck();
    if(!ctx||!W||!H){anim=requestAnimationFrame(frame);return;}
    if(pin&&window.__heroProgress==null&&pin.getBoundingClientRect().bottom<=0){anim=requestAnimationFrame(frame);return;}
    var p=progress;
    var morphStart=W<768?0.10+0.35:0.10;
    var morph=ease(clamp((p-morphStart)/0.62,0,1));
    var inv=1-morph;
    var cx=W*0.5,cy=W<768?H*0.38:H*0.5;
    var R=W<768?Math.min(W*0.64,H*0.58):Math.min(W*0.40,H*0.62);
    rot+=0.0018*inv*(dt/16.7);
    var cosR=Math.cos(rot),sinR=Math.sin(rot);
    function rotY(x,y,z){return [x*cosR-z*sinR,y,x*sinR+z*cosR];}

    ctx.clearRect(0,0,W,H);

    if(inv>0.01){
      var g=ctx.createRadialGradient(cx,cy,R*0.1,cx,cy,R*1.55);
      g.addColorStop(0,'rgba(56,189,248,'+(0.10*inv)+')');g.addColorStop(1,'rgba(56,189,248,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R*1.55,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(120,180,255,'+(0.18*inv)+')';ctx.lineWidth=1.2;
      ctx.beginPath();ctx.arc(cx,cy,R*(1+morph*0.5),0,Math.PI*2);ctx.stroke();
    }

    var scatter=1+morph*1.4,TAU=Math.PI*2,nb;
    for(nb=0;nb<NIV_P;nb++){cubF[nb].length=0;cubB[nb].length=0;}
    for(var di=0;di<dots.length;di++){
      var d=dots[di],x0=d[2],y0=d[3],z0=d[4];
      var x=x0*cosR-z0*sinR,y=y0,z=x0*sinR+z0*cosR;
      var depth=(z+1)/2;
      var a=(0.12+depth*0.68)*inv;
      if(a<0.01)continue;
      var px=cx+x*R*scatter,py=cy-y*R*scatter,pr=depth*1.5+0.3;
      if(z>0){ nb=Math.min(NIV_P-1,Math.floor(a/0.8*NIV_P)); cubF[nb].push(px,py,pr); }
      else { nb=Math.min(NIV_P-1,Math.floor(a*0.45/0.36*NIV_P)); cubB[nb].push(px,py,pr); }
    }
    for(nb=0;nb<NIV_P;nb++){
      var lotes=[[cubF[nb],'rgba(125,211,252,'+((nb+0.5)/NIV_P*0.8).toFixed(3)+')'],[cubB[nb],'rgba(90,130,210,'+((nb+0.5)/NIV_P*0.36).toFixed(3)+')']];
      for(var li=0;li<2;li++){
        var c0=lotes[li][0]; if(!c0.length)continue;
        ctx.fillStyle=lotes[li][1]; ctx.beginPath();
        for(var q=0;q<c0.length;q+=3){ ctx.moveTo(c0[q]+c0[q+2],c0[q+1]); ctx.arc(c0[q],c0[q+1],c0[q+2],0,TAU); }
        ctx.fill();
      }
    }

    if(inv>0.02){
      var now=ts/1000;
      for(nb=0;nb<NIV_A;nb++)cubL[nb].length=0;
      for(var ai=0;ai<arcs.length;ai++){
        var pts=arcs[ai].pts,hayPrev=false,psx0=0,psy0=0,pz0=0;
        for(var i=0;i<=44;i++){
          var v=pts[i];
          var sx=cx+(v[0]*cosR-v[2]*sinR)*R,sy=cy-v[1]*R,z2=v[0]*sinR+v[2]*cosR;
          if(hayPrev&&pz0>-0.1&&z2>-0.1){
            var al=(0.18+Math.max(0,z2)*0.42)*inv;
            nb=Math.min(NIV_A-1,Math.floor(al/0.6*NIV_A));
            cubL[nb].push(psx0,psy0,sx,sy);
          }
          hayPrev=true;psx0=sx;psy0=sy;pz0=z2;
        }
      }
      ctx.lineWidth=1.1;
      for(nb=0;nb<NIV_A;nb++){
        var cl=cubL[nb]; if(!cl.length)continue;
        ctx.strokeStyle='rgba(255,20,150,'+((nb+0.5)/NIV_A*0.6).toFixed(3)+')';
        ctx.beginPath();
        for(var q2=0;q2<cl.length;q2+=4){ ctx.moveTo(cl[q2],cl[q2+1]); ctx.lineTo(cl[q2+2],cl[q2+3]); }
        ctx.stroke();
      }
      for(ai=0;ai<arcs.length;ai++){
        var arc=arcs[ai];
        var tp=(now*arc.spd+arc.off)%1;
        var pv=slerp(arc.a,arc.b,tp);var pl=1+Math.sin(tp*Math.PI)*0.22;
        pv=[pv[0]*pl,pv[1]*pl,pv[2]*pl];
        var rv3=rotY(pv[0],pv[1],pv[2]),px=rv3[0],py=rv3[1],pz=rv3[2];
        if(pz>-0.1){
          var psx=cx+px*R,psy=cy-py*R;
          var gg=ctx.createRadialGradient(psx,psy,0,psx,psy,11);
          gg.addColorStop(0,'rgba(255,220,0,'+(0.95*inv)+')');gg.addColorStop(0.35,'rgba(255,180,0,'+(0.65*inv)+')');gg.addColorStop(1,'rgba(255,120,0,0)');
          ctx.fillStyle=gg;ctx.beginPath();ctx.arc(psx,psy,11,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(255,248,160,'+inv+')';ctx.beginPath();ctx.arc(psx,psy,2.4,0,Math.PI*2);ctx.fill();
        }
      }
    }

    var gr=grid();
    for(var ci=0;ci<countries.length;ci++){
      var c=countries[ci];
      var vg=c.vecGlobo||c.vec;
      var rvc=rotY(vg[0],vg[1],vg[2]),cxr=rvc[0],cyr=rvc[1],czr=rvc[2];
      var gx=cx+cxr*R,gy=cy-cyr*R;
      var a2=clamp((czr+0.08)/1.08,0,1);
      var frG=Math.max(11,Math.round(R*0.048*(0.55+a2*0.45)));
      var col=ci%gr.cols,row=Math.floor(ci/gr.cols);
      var enFila=row===gr.rows-1?(gr.n-row*gr.cols):gr.cols;
      var tx=gr.startX+col*gr.cellW+(gr.cols-enFila)*gr.cellW/2;
      var ty=gr.startY+row*gr.cellH;
      var ppx=gx+(tx-gx)*morph;
      var ppy=gy+(ty-gy)*morph;
      var fr=frG*inv+gr.fr*morph;
      var alpha=clamp(a2*inv+morph,0,1);
      var shapeT=clamp((morph-0.45)/0.48,0,1);
      if(shapeT<1) cityFlag(c,ppx,ppy,fr,alpha*(1-shapeT),a2*inv);
      if(shapeT>0) wavingFlag(c,ppx,ppy,fr*2.3,alpha*shapeT,ts/1000,c.phase);
      if(morph>0.45){
        ctx.save();
        ctx.globalAlpha=clamp((morph-0.45)/0.52,0,1);
        ctx.fillStyle='#dbe6ff';
        var fs=gr.fs;
        ctx.font='600 '+fs+'px \'Space Grotesk\',system-ui,sans-serif';
        ctx.textAlign='center';
        var flagHalf=fr*2.3*0.32;
        ctx.fillText(c.name,ppx,ppy-flagHalf-14);
        ctx.restore();
      }

      // Debajo de la bandera, tanto en la esfera como en la cuadrícula. En la
      // esfera se desvanece con la cara del globo, igual que la bandera.
      var mediaBandera=(morph>0.45?fr*2.3*0.32:fr);
      badgePrecio(c,ppx,ppy+mediaBandera+6,alpha,morph>0.45?gr.fsBadge:Math.max(9,fr*0.62));
    }

    anim=requestAnimationFrame(frame);
  }

  function onResize(){resize();}
  window.addEventListener('resize',onResize);

  function revealCheck(){
    var els=document.querySelectorAll('[data-reveal]');
    var vh=window.innerHeight;
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.__shown)continue;
      var r=el.getBoundingClientRect();
      if(r.top < vh*0.88){ el.style.opacity='1'; el.style.transform='none'; el.__shown=true; }
    }
  }

  window.__ksaStop=function(){stopped=true;cancelAnimationFrame(raf);cancelAnimationFrame(anim);window.removeEventListener('resize',onResize);};
  window.__ksaForce=function(t){var k=stopped;stopped=false;frame(t||performance.now());stopped=k;};

  function init(){
    if(stopped)return;
    for(var ci=0;ci<countries.length;ci++){
      var c=countries[ci];
      c.vec=toVec(c.lat,c.lon);
      c.phase=ci*1.7;
      var img=new Image();img.crossOrigin='anonymous';
      img.src='https://flagcdn.com/w640/'+c.iso+'.png';
      c.img=img;
    }
    repartir();
    cargarPrecios();
    dots=[];
    for(var lat=-82;lat<=82;lat+=5){
      var rr=Math.cos(lat*Math.PI/180);
      var nn=Math.max(1,Math.round(48*rr));
      for(var k=0;k<nn;k++){
        var la=lat*Math.PI/180,lo=(k/nn)*Math.PI*2;
        dots.push([la,lo,Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)]);
      }
    }
    var defs=[[0,1],[1,2],[1,3],[2,3],[3,4],[3,9],[4,9],[5,8],[5,6],[6,7],[7,8],[8,9]];
    arcs=defs.map(function(d,i){
      var arc={a:countries[d[0]].vecGlobo,b:countries[d[1]].vecGlobo,off:i/12,spd:0.055+((i*2)%6)*0.009,pts:[]};
      for(var j=0;j<=44;j++){var t=j/44,v=slerp(arc.a,arc.b,t),l=1+Math.sin(t*Math.PI)*0.22;arc.pts.push([v[0]*l,v[1]*l,v[2]*l]);}
      return arc;
    });
    anim=requestAnimationFrame(frame);
  }
  init();
  setTimeout(revealCheck,300);
  setTimeout(revealCheck,1200);
  window.addEventListener('scroll',revealCheck,{passive:true});
})();
