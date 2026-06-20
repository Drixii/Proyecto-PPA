(function(){
  if (window.__ksaStop) window.__ksaStop();
  var stopped=false, raf=0, anim=0;
  var cv,ctx,hero,gridTitle,pin,hint,W=0,H=0,rot=0,progress=0;

  var countries=[
    { iso:'us', name:'EE.UU.',    lat:40.7,  lon:-74.0 },
    { iso:'ve', name:'Venezuela', lat:10.5,  lon:-66.9 },
    { iso:'co', name:'Colombia',  lat:4.7,   lon:-74.1 },
    { iso:'cl', name:'Chile',     lat:-33.4, lon:-70.6 },
    { iso:'mx', name:'México',    lat:19.4,  lon:-99.1 },
    { iso:'br', name:'Brasil',    lat:-23.5, lon:-46.6 },
    { iso:'es', name:'España',    lat:40.4,  lon:-3.7  },
    { iso:'gb', name:'R. Unido',  lat:51.5,  lon:-0.1  },
    { iso:'ng', name:'Nigeria',   lat:6.5,   lon:3.4   },
    { iso:'ke', name:'Kenia',     lat:-1.3,  lon:36.8  },
    { iso:'in', name:'India',     lat:19.1,  lon:72.9  },
    { iso:'au', name:'Australia', lat:-33.9, lon:151.2 }
  ];
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
    var dpr=Math.min(window.devicePixelRatio||1,2);
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
      if(W<768){ progress+=(_rawP-progress)*0.035; }
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
      hero.style.opacity=(1-heroOut).toFixed(3);
      hero.style.transform='translateY('+(-(scrollMove+fadeMove)).toFixed(1)+'px)';
      hero.style.pointerEvents=heroOut>0.4?'none':'auto';
    }
    if(gridTitle)gridTitle.style.opacity=clamp((p-0.46)/0.22,0,1).toFixed(3);
    if(hint)hint.style.opacity=(1-clamp(p/0.1,0,1)).toFixed(3);
  }

  function grid(){
    var n=countries.length;
    var cols=W<720?3:4;
    var fr=W<720?26:33;
    var cellW=fr*2+(W<720?36:78);
    var cellH=fr*2+50;
    var rows=Math.ceil(n/cols);
    var startX=W*0.5-(cols*cellW)/2+cellW/2;
    var startY=(W<720?H*0.65:H*0.57)-(rows*cellH)/2+cellH/2;
    return {fr:fr,cols:cols,cellW:cellW,cellH:cellH,startX:startX,startY:startY};
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
    refresh();
    updateProgress();
    if((frame._t=(frame._t||0)+1)%10===0)revealCheck();
    if(!ctx||!W||!H){anim=requestAnimationFrame(frame);return;}
    var p=progress;
    var morphStart=W<768?0.10+0.35:0.10;
    var morph=ease(clamp((p-morphStart)/0.62,0,1));
    var inv=1-morph;
    var cx=W*0.5,cy=W<768?H*0.38:H*0.5;
    var R=W<768?Math.min(W*0.64,H*0.58):Math.min(W*0.40,H*0.62);
    rot+=0.0018*inv;
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

    var scatter=1+morph*1.4;
    for(var di=0;di<dots.length;di++){
      var d=dots[di];
      var x0=Math.cos(d[0])*Math.sin(d[1]),y0=Math.sin(d[0]),z0=Math.cos(d[0])*Math.cos(d[1]);
      var rv=rotY(x0,y0,z0),x=rv[0],y=rv[1],z=rv[2];
      var depth=(z+1)/2;
      var a=(0.12+depth*0.68)*inv;
      if(a<0.01)continue;
      ctx.fillStyle=z>0?'rgba(125,211,252,'+a+')':'rgba(90,130,210,'+(a*0.45)+')';
      ctx.beginPath();ctx.arc(cx+x*R*scatter,cy-y*R*scatter,depth*1.5+0.3,0,Math.PI*2);ctx.fill();
    }

    if(inv>0.02){
      var now=ts/1000;
      for(var ai=0;ai<arcs.length;ai++){
        var arc=arcs[ai],prev=null;
        for(var i=0;i<=44;i++){
          var t=i/44;
          var v=slerp(arc.a,arc.b,t);
          var lift=1+Math.sin(t*Math.PI)*0.22;v=[v[0]*lift,v[1]*lift,v[2]*lift];
          var rv2=rotY(v[0],v[1],v[2]),sx=cx+rv2[0]*R,sy=cy-rv2[1]*R,z2=rv2[2];
          if(prev&&prev.z>-0.1&&z2>-0.1){
            ctx.strokeStyle='rgba(255,20,150,'+((0.18+Math.max(0,z2)*0.42)*inv)+')';ctx.lineWidth=1.1;
            ctx.beginPath();ctx.moveTo(prev.sx,prev.sy);ctx.lineTo(sx,sy);ctx.stroke();
          }
          prev={sx:sx,sy:sy,z:z2};
        }
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
      var rvc=rotY(c.vec[0],c.vec[1],c.vec[2]),cxr=rvc[0],cyr=rvc[1],czr=rvc[2];
      var gx=cx+cxr*R,gy=cy-cyr*R;
      var a2=clamp((czr+0.08)/1.08,0,1);
      var frG=Math.max(11,Math.round(R*0.048*(0.55+a2*0.45)));
      var col=ci%gr.cols,row=Math.floor(ci/gr.cols);
      var tx=gr.startX+col*gr.cellW;
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
        var fs=W<768?15:14;
        ctx.font='600 '+fs+'px \'Space Grotesk\',system-ui,sans-serif';
        ctx.textAlign='center';
        var flagHalf=fr*2.3*0.32;
        ctx.fillText(c.name,ppx,ppy-flagHalf-14);
        ctx.restore();
      }
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
    dots=[];
    for(var lat=-82;lat<=82;lat+=5){
      var rr=Math.cos(lat*Math.PI/180);
      var nn=Math.max(1,Math.round(48*rr));
      for(var k=0;k<nn;k++)dots.push([lat*Math.PI/180,(k/nn)*Math.PI*2]);
    }
    var defs=[[0,1],[0,2],[4,6],[3,6],[5,7],[5,10],[7,8],[6,1],[10,11],[8,9],[0,7],[2,10]];
    arcs=defs.map(function(d,i){return {a:countries[d[0]].vec,b:countries[d[1]].vec,off:i/12,spd:0.055+((i*2)%6)*0.009};});
    anim=requestAnimationFrame(frame);
  }
  init();
  setTimeout(revealCheck,300);
  setTimeout(revealCheck,1200);
  window.addEventListener('scroll',revealCheck,{passive:true});
})();
