// Caelum: sky rendering, motion and time
const $ = id => document.getElementById(id);
const S = {
  lat:50.294, lon:18.665, place:"Gliwice", country:"Poland",
  offsetMin:0, fov:80, az:160, alt:28, mode:"drag",
  lines:true, labels:true, milky:true, ground:true, sounds:true, haptics:true, grid:false,
  skin:"indigo", target:null, found:false, compassAcc:null, demo:null
};

const SKINS = {
  indigo:{name:"Indigo", top:"#070d26", bot:"#1f3170", ground:"#070b18", fg:"#eef3ff", accent:"#8fd6ff", line:"rgba(160,195,255,.32)", label:"rgba(220,232,255,.72)", ink:false, mw:"190,210,255"},
  dusk:{name:"Dusk", top:"#120c33", bot:"#7a3b62", ground:"#1c1024", fg:"#fff1ea", accent:"#ffb38a", line:"rgba(255,190,170,.30)", label:"rgba(255,226,214,.75)", ink:false, mw:"255,200,210"},
  atlas:{name:"Atlas", top:"#f4ecd9", bot:"#e6d6b4", ground:"#d4c19a", fg:"#2b2418", accent:"#b4532a", line:"rgba(120,82,40,.45)", label:"rgba(70,50,25,.85)", ink:true, mw:"150,110,60", light:true},
  glacier:{name:"Glacier", top:"#dfeaf5", bot:"#a9c3df", ground:"#8aa6c4", fg:"#13243d", accent:"#1f5fa8", line:"rgba(25,60,110,.38)", label:"rgba(20,40,75,.85)", ink:true, mw:"40,80,140", light:true},
  red:{name:"Red night", top:"#080000", bot:"#1d0303", ground:"#050000", fg:"#ff5a48", accent:"#ff3b2f", line:"rgba(255,70,50,.28)", label:"rgba(255,90,70,.7)", ink:false, red:true, mw:"255,60,40"},
};
const STAR_COL = {b:"#cfe0ff", w:"#ffffff", y:"#fff1c9", o:"#ffd2a0", r:"#ffb08a"};
const INK_COL = {b:"#1d3a7a", w:"#1d2230", y:"#5a4310", o:"#7a3d12", r:"#8a2412"};

// ---------- catalogue ----------
const YEARS = (Date.now() - Date.UTC(2000,0,1,12))/31557600000;
const STARS = STARS_RAW.map(([id,name,ra,dec,mag,con,dist,col]) => {
  const [r,d] = precess(ra*15, dec, YEARS);
  return {id,name,ra:r,dec:d,mag,con,dist,col,type:"star"};
});
const BYID = Object.fromEntries(STARS.map(s=>[s.id,s]));
const LINES = []; for(const [k,c] of Object.entries(CONST)) for(const p of c.lines.split(" ").filter(Boolean)){ const [a,b]=p.split("-"); if(BYID[a]&&BYID[b]) LINES.push([BYID[a],BYID[b],k]); }
const MW = makeMilkyWay();
const BODIES = ["mercury","venus","mars","jupiter","saturn"].map(id=>({id,type:"planet",...PLANET_INFO[id]}));
const MOON = {id:"moon",type:"moon",name:"Moon"}, SUN = {id:"sun",type:"sun",name:"Sun"};
const CONSTS = Object.entries(CONST).filter(([k,c])=>c.lines).map(([k,c])=>({id:"c_"+k,key:k,type:"const",name:c.name}));

let lastKey = "";
function simTime(){ return new Date(Date.now() + S.offsetMin*60000); }
function updateBodies(t){
  const key = Math.floor(t.getTime()/60000); if(key===lastKey) return; lastKey = key;
  for(const b of BODIES){ Object.assign(b, planetPos(b.id, t)); }
  const m = moonPos(t); Object.assign(MOON, m, {mag:-12});
  const s = sunPos(t); Object.assign(SUN, s, {mag:-26});
  for(const c of CONSTS){ // centroid of its stars
    const ss = STARS.filter(s=>s.con===c.key); let x=0,y=0,z=0;
    for(const s of ss){ const a=s.ra*D2R,d=s.dec*D2R; x+=Math.cos(d)*Math.cos(a); y+=Math.cos(d)*Math.sin(a); z+=Math.sin(d); }
    const n=Math.hypot(x,y,z); c.ra=norm360(Math.atan2(y,x)*R2D); c.dec=Math.asin(z/n)*R2D;
  }
}

// ---------- camera ----------
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const nrm=a=>{const n=Math.hypot(...a)||1;return [a[0]/n,a[1]/n,a[2]/n];};
let cam = null, gyro = null;
function camFromAltAz(alt,az){
  const f = altAzVec(alt,az); let r = cross(f,[0,0,1]);
  if(Math.hypot(...r)<1e-4) r = [Math.cos(az*D2R),-Math.sin(az*D2R),0];
  r = nrm(r); return {f, r, u:cross(r,f)};
}
function camAltAz(c){ const f=c.f; return [Math.asin(Math.max(-1,Math.min(1,f[2])))*R2D, norm360(Math.atan2(f[0],f[1])*R2D)]; }

// ---------- canvas ----------
const cv = $("sky"), ctx = cv.getContext("2d");
let W=0,H=0,DPR=1;
function resize(){ const r = cv.getBoundingClientRect(); DPR = Math.min(2,devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*DPR; cv.height=H*DPR; }
new ResizeObserver(resize).observe(cv);

function scale(){ return (W/2)/(2*Math.tan(S.fov*D2R/4)); }
function project(v){
  const X=dot(v,cam.r), Y=dot(v,cam.u), Z=dot(v,cam.f);
  const k = 2/(1+Math.max(Z,-0.999)), sc = scale();
  return {x:W/2 + X*k*sc, y:H*0.46 - Y*k*sc, z:Z};
}
function horiz(o,t,lst){ const [alt,az] = toHorizon(o.ra,o.dec,lst,S.lat); o.alt=alt; o.az=az; o.v=altAzVec(alt,az); return o; }

function mix(a,b,t){ const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16);
  const c=[16,8,0].map(s=>Math.round(((pa>>s)&255)*(1-t)+((pb>>s)&255)*t)); return `rgb(${c.join(",")})`; }

let screenObjs = [], darkness = 1, lastHeading = null;
function frame(ts){
  requestAnimationFrame(frame);
  if(!W) return;
  const sk = SKINS[S.skin];
  if(S.demo) runDemo(ts);
  if(S.mode==="motion" && gyro && !S.demo) cam = gyro; else cam = camFromAltAz(S.alt,S.az);
  const t = simTime(), lst = lstDeg(t,S.lon);
  updateBodies(t);
  horiz(SUN,t,lst); horiz(MOON,t,lst);
  // daylight: 1 = full night, 0 = day
  darkness = Math.max(0,Math.min(1,(-SUN.alt - (-4))/14));
  const dayTop = sk.ink? sk.top : (sk.red? "#2a0606" : "#4f86c6"), dayBot = sk.ink? sk.bot : (sk.red? "#3a0a08" : "#a9cbea");
  ctx.setTransform(DPR,0,0,DPR,0,0);
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, mix(dayTop, sk.top, darkness)); g.addColorStop(1, mix(dayBot, sk.bot, darkness));
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const zf = Math.sqrt(80/S.fov), tw = ts/1000;
  screenObjs = [];

  // Milky Way
  if(S.milky){
    ctx.globalCompositeOperation = sk.ink? "multiply":"lighter";
    for(const p of MW){ horiz(p,t,lst); const s=project(p.v); if(s.z<0||s.x<-20||s.x>W+20||s.y<-20||s.y>H+20) continue;
      const r = p.r*zf*1.6; const a = p.a*0.10*darkness*(sk.ink?1.6:1);
      const rg = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,r); rg.addColorStop(0,`rgba(${sk.mw},${a})`); rg.addColorStop(1,`rgba(${sk.mw},0)`);
      ctx.fillStyle=rg; ctx.fillRect(s.x-r,s.y-r,2*r,2*r); }
    ctx.globalCompositeOperation = "source-over";
  }

  // stars
  const starAlpha = sk.ink ? 1 : 0.18 + 0.82*darkness;
  for(const s of STARS) horiz(s,t,lst);
  if(S.lines){
    ctx.lineWidth = 1; ctx.strokeStyle = sk.line; ctx.beginPath();
    for(const [a,b] of LINES){ const pa=project(a.v), pb=project(b.v); if(pa.z<-0.1||pb.z<-0.1) continue;
      const dx=pb.x-pa.x, dy=pb.y-pa.y, L=Math.hypot(dx,dy); if(L>W*1.5) continue; const gap=Math.min(5,L*0.2)/L;
      ctx.moveTo(pa.x+dx*gap,pa.y+dy*gap); ctx.lineTo(pb.x-dx*gap,pb.y-dy*gap); }
    ctx.stroke();
  }
  STARS.forEach((s,i)=>{
    const p = project(s.v); if(p.z<0||p.x<-10||p.x>W+10||p.y<-10||p.y>H+10) return;
    const below = s.alt<0; let r = Math.max(0.7,(4.6-s.mag)*0.78)*zf;
    let a = starAlpha*(below&&S.ground?0.8:1)*(0.86+0.14*Math.sin(tw*2.3+i*1.7));
    const col = sk.ink? INK_COL[s.col] : (sk.red? "#ff4b3a" : STAR_COL[s.col]);
    ctx.globalAlpha = a;
    if(s.mag<1.6 && !sk.ink){ const gr = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4); gr.addColorStop(0,col); gr.addColorStop(.25,col+"55"); gr.addColorStop(1,col+"00"); ctx.fillStyle=gr; ctx.fillRect(p.x-r*4,p.y-r*4,r*8,r*8); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,7); ctx.fill();
    ctx.globalAlpha = 1;
    screenObjs.push({o:s,x:p.x,y:p.y});
    if(S.labels && (s.mag<1.4 || (S.fov<45 && s.mag<2.6))){ ctx.fillStyle = sk.label; ctx.globalAlpha = below&&S.ground?0.75:1; ctx.font="500 11px -apple-system,sans-serif"; ctx.fillText(s.name, p.x+r+5, p.y+4); ctx.globalAlpha=1; }
  });

  // constellation names
  if(S.lines && S.labels){
    ctx.font = "italic 13px 'Iowan Old Style',Georgia,serif"; ctx.textAlign="center";
    for(const c of CONSTS){ horiz(c,t,lst); const p=project(c.v); if(p.z<0.2) continue;
      ctx.fillStyle = sk.label; ctx.globalAlpha=.75; ctx.fillText(c.name.toUpperCase().split("").join(" "), p.x, p.y+22); ctx.globalAlpha=1; screenObjs.push({o:c,x:p.x,y:p.y+18,weak:true}); }
    ctx.textAlign="left";
  }

  // planets, moon, sun
  for(const b of BODIES){ horiz(b,t,lst); const p=project(b.v); if(p.z<0) continue;
    const below=b.alt<0&&S.ground; const r=Math.max(2.2,(2.2-b.mag)*1.1)*zf;
    ctx.globalAlpha = below?0.8:1;
    const col = sk.ink? sk.accent : (sk.red?"#ff6a55":b.col);
    if(!sk.ink){ const gr=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4.5); gr.addColorStop(0,col); gr.addColorStop(.3,col+"44"); gr.addColorStop(1,col+"00"); ctx.fillStyle=gr; ctx.fillRect(p.x-r*5,p.y-r*5,r*10,r*10); }
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,7); ctx.fill();
    if(sk.ink){ ctx.strokeStyle=sk.accent; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(p.x,p.y,r+3,0,7); ctx.stroke(); }
    if(S.labels){ ctx.fillStyle=sk.ink?sk.accent:(sk.red?"#ff6a55":"#fff"); ctx.font="600 12px -apple-system,sans-serif"; ctx.fillText(b.name, p.x+r+6, p.y+4); }
    ctx.globalAlpha=1; screenObjs.push({o:b,x:p.x,y:p.y});
  }
  drawMoon(sk, zf); drawSun(sk, zf);

  // ground
  if(S.ground) drawGround(sk);
  drawCardinals(sk);
  drawTarget(sk, ts);

  // heading ticks when crossing N/E/S/W
  const [calt, caz] = camAltAz(cam);
  const q = Math.round(caz/90)%4;
  if(lastHeading!==null && q!==lastHeading && Math.abs(((caz+45)%90)-45)<6) tick(0.5);
  lastHeading = q;
  updatePointing(calt, caz);
}

function drawMoon(sk, zf){
  const p = project(MOON.v); if(p.z<0) return;
  const r = 9*zf, below = MOON.alt<0&&S.ground;
  const s = project(SUN.v); let ang = Math.atan2(s.y-p.y, s.x-p.x); if(s.z<-0.9) ang = 0;
  ctx.save(); ctx.globalAlpha = below?0.8:1; ctx.translate(p.x,p.y);
  if(!sk.ink){ const gr=ctx.createRadialGradient(0,0,r,0,0,r*4); gr.addColorStop(0,`rgba(255,250,235,${.25*MOON.illum})`); gr.addColorStop(1,"rgba(255,250,235,0)"); ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(0,0,r*4,0,7); ctx.fill(); }
  ctx.rotate(ang);
  ctx.fillStyle = sk.ink? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill();
  const lit = sk.ink? sk.fg : (sk.red?"#ff6a55":"#fbf6e8");
  const k = Math.cos(MOON.elong*D2R); // 1 new, -1 full
  ctx.fillStyle = lit; ctx.beginPath();
  ctx.arc(0,0,r,-Math.PI/2,Math.PI/2,false);           // lit half faces the Sun (+x)
  ctx.ellipse(0,0,Math.abs(k)*r,r,0,Math.PI/2,-Math.PI/2,k>0);
  ctx.fill(); ctx.restore();
  if(S.labels){ ctx.globalAlpha=below?.75:1; ctx.fillStyle=sk.label; ctx.font="600 12px -apple-system,sans-serif"; ctx.fillText("Moon",p.x+r+6,p.y+4); ctx.globalAlpha=1; }
  screenObjs.push({o:MOON,x:p.x,y:p.y});
}
function drawSun(sk, zf){
  const p = project(SUN.v); if(p.z<0) return; const r = 11*zf;
  ctx.save(); ctx.globalAlpha = SUN.alt<0&&S.ground?0.8:1;
  const gr=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*5); gr.addColorStop(0,sk.ink?sk.accent:"#fff7d6"); gr.addColorStop(.2,sk.ink?sk.accent+"66":"rgba(255,226,150,.5)"); gr.addColorStop(1,"rgba(255,220,140,0)");
  ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(p.x,p.y,r*5,0,7); ctx.fill(); ctx.restore();
  screenObjs.push({o:SUN,x:p.x,y:p.y});
}

function drawGround(sk){
  const P = [0,120,240].map(az=>project(altAzVec(0,az)));
  const nad = dot([0,0,-1],cam.f), np = project([0,0,-1]);
  ctx.fillStyle = sk.ground; ctx.globalAlpha = sk.ink? .42 : .66;
  const [a,b,c] = P, d = 2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
  ctx.beginPath();
  if(Math.abs(d) < 1e-3 || [a,b,c].some(p=>Math.abs(p.x)>1e6||Math.abs(p.y)>1e6)){
    // horizon is (almost) a straight line on screen
    const f=[a,b,c].filter(p=>Math.abs(p.x)<1e6&&Math.abs(p.y)<1e6);
    const p1=f[0], p2=f[1]||{x:f[0].x+1,y:f[0].y}; let dx=p2.x-p1.x, dy=p2.y-p1.y; const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
    let nx=-dy, ny=dx; if((np.x-p1.x)*nx+(np.y-p1.y)*ny<0){nx=-nx;ny=-ny;}
    const B=1e4; ctx.moveTo(p1.x-dx*B,p1.y-dy*B); ctx.lineTo(p1.x+dx*B,p1.y+dy*B); ctx.lineTo(p1.x+dx*B+nx*B,p1.y+dy*B+ny*B); ctx.lineTo(p1.x-dx*B+nx*B,p1.y-dy*B+ny*B);
    ctx.fill(); ctx.globalAlpha=1; return;
  }
  const ux=((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/d;
  const uy=((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/d;
  const R = Math.hypot(a.x-ux,a.y-uy);
  const inside = nad > -0.98 && Math.hypot(np.x-ux,np.y-uy) < R;
  if(inside){ ctx.arc(ux,uy,R,0,7); ctx.fill(); }
  else { ctx.rect(-10,-10,W+20,H+20); ctx.moveTo(ux+R,uy); ctx.arc(ux,uy,R,0,7); ctx.fill("evenodd"); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = sk.ink? sk.accent : `rgba(255,255,255,${.38+.3*darkness})`; ctx.lineWidth=1.6; ctx.beginPath(); ctx.arc(ux,uy,R,0,7); ctx.stroke();
}

function drawCardinals(sk){
  ctx.textAlign="center";
  for(let az=0; az<360; az+=45){ const p=project(altAzVec(0,az)); if(p.z<0.05||p.x<0||p.x>W) continue;
    const main = az%90===0; ctx.fillStyle = main? sk.accent : sk.label; ctx.font = main? "600 15px -apple-system,sans-serif":"500 11px -apple-system,sans-serif";
    ctx.fillText(compass(az), p.x, p.y + (main?20:17)); }
  ctx.textAlign="left";
}

function drawTarget(sk, ts){
  if(!S.target) return; const o=S.target; if(!o.v) return;
  const X=dot(o.v,cam.r), Y=dot(o.v,cam.u), Z=dot(o.v,cam.f);
  const p = project(o.v), m = 46;
  const ang = Math.acos(Math.max(-1,Math.min(1,Z)))*R2D;
  if(Z>0 && p.x>m && p.x<W-m && p.y>110 && p.y<H-210){
    const pulse = 18 + 4*Math.sin(ts/220);
    ctx.strokeStyle = sk.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x,p.y,pulse,0,7); ctx.stroke();
    ctx.globalAlpha=.35; ctx.beginPath(); ctx.arc(p.x,p.y,pulse+9,0,7); ctx.stroke(); ctx.globalAlpha=1;
  } else {
    const a = Math.atan2(-Y, X); const cx=W/2, cy=H*0.46, rx=W/2-38, ry=H*0.30;
    const x = cx + Math.cos(a)*rx, y = cy + Math.sin(a)*ry;
    ctx.save(); ctx.translate(x,y); ctx.rotate(a); ctx.fillStyle=sk.accent;
    ctx.beginPath(); ctx.moveTo(16,0); ctx.lineTo(-8,-11); ctx.lineTo(-3,0); ctx.lineTo(-8,11); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle=sk.accent; ctx.font="600 11px -apple-system,sans-serif"; ctx.textAlign="center";
    ctx.fillText(`${o.name} · ${Math.round(ang)}°`, x - Math.cos(a)*30, y - Math.sin(a)*30 + 4); ctx.textAlign="left";
  }
  if(ang < 4 && !S.found){ S.found = true; tick(1); buzz([18,40,18]); toast(`Found ${o.name} · tap it to stop`); }
  if(ang > 9) S.found = false;
}

// ---------- pointing bar ----------
let pointLast = 0;
function updatePointing(alt, az){
  const now = performance.now(); if(now - pointLast < 120) return; pointLast = now;
  let best=null, bd=1e9;
  for(const so of screenObjs){ if(so.weak) continue; const d=Math.hypot(so.x-W/2, so.y-H*0.46); const lim = so.o.type==="star"? 40 : 55; if(d<lim && d<bd){bd=d;best=so.o;} }
  let con=null, cd=1e9; for(const c of CONSTS){ if(!c.v) continue; const d=Math.acos(Math.max(-1,Math.min(1,dot(c.v,cam.f))))*R2D; if(d<cd){cd=d;con=c;} }
  $("pDir").innerHTML = `${compass(az)} ${Math.round(az)}°<br>${alt>=0?"▲":"▼"} ${Math.abs(Math.round(alt))}°`;
  if(best){ S.pointing = best;
    $("pDot").textContent = best.type==="planet"? best.glyph : best.type==="moon"? "☾" : best.type==="sun"?"☀":"✦";
    $("pName").textContent = best.name;
    $("pSub").textContent = (best.type==="star"? `Star in ${CONST[best.con].name} · tap for more` : best.type==="planet"? "Planet · tap for more" : best.type==="moon"? `${moonPhaseName(MOON.elong)} · tap for more` : "Don't look at it directly") + (best.alt<0? " · below the horizon" : "");
  } else if(con && cd<16){ S.pointing = con; $("pDot").textContent="✧"; $("pName").textContent=con.name; $("pSub").textContent="Constellation · tap for more"; }
  else { S.pointing = null; $("pDot").textContent="·"; $("pName").textContent = alt<-5? "The ground" : "Empty sky"; $("pSub").textContent = alt<-5? "Tilt up to see the sky above you" : "Faint stars only. Keep looking around"; }
  const isNight = darkness>0.6;
  $("clock").textContent = `${fmtTime(simTime())} · ${isNight? "Night" : darkness>0.05? "Twilight" : "Daytime, stars hidden by sunlight"}`;
}

// ---------- input: drag, zoom, tap ----------
let drag=null, pinch=null, vel={x:0,y:0};
const ptrs = new Map();
cv.addEventListener("pointerdown", e=>{ cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),fov:S.fov}; drag=null; }
  else drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now()}; S.demo=null; });
cv.addEventListener("pointermove", e=>{ if(!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && ptrs.size===2){ const [a,b]=[...ptrs.values()]; S.fov=Math.max(20,Math.min(120,pinch.fov*pinch.d/Math.hypot(a.x-b.x,a.y-b.y))); return; }
  if(!drag || S.mode==="motion") return;
  const k = S.fov/W*1.1, dx=e.clientX-drag.x, dy=e.clientY-drag.y;
  S.az = norm360(S.az - dx*k); S.alt = Math.max(-85,Math.min(89,S.alt + dy*k)); vel={x:dx*k,y:dy*k};
  drag.x=e.clientX; drag.y=e.clientY; });
cv.addEventListener("pointerup", e=>{ ptrs.delete(e.pointerId);
  if(drag && Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<6){ const r=cv.getBoundingClientRect(); tapAt(e.clientX-r.left,e.clientY-r.top); vel={x:0,y:0}; }
  if(ptrs.size<2) pinch=null; drag=null; });
cv.addEventListener("wheel", e=>{ e.preventDefault(); S.fov=Math.max(20,Math.min(120,S.fov*(1+e.deltaY*0.0012))); },{passive:false});
(function inertia(){ requestAnimationFrame(inertia); if(drag||S.mode==="motion"||S.demo) return; if(Math.abs(vel.x)+Math.abs(vel.y)<0.002) return;
  S.az=norm360(S.az-vel.x); S.alt=Math.max(-85,Math.min(89,S.alt+vel.y)); vel.x*=0.93; vel.y*=0.93; })();

function tapAt(x,y){
  // tapping the thing you're finding (or its ring) stops finding it
  if(S.target && S.target.v){ const p=project(S.target.v); if(p.z>0 && Math.hypot(p.x-x,p.y-y)<38){ clearTarget(); return; } }
  let best=null, bd=28; for(const so of screenObjs){ const d=Math.hypot(so.x-x,so.y-y)+(so.weak?10:0); if(d<bd){bd=d;best=so.o;} }
  if(best){ tick(0.6); openInfo(best); }
}
function clearTarget(){
  if(!S.target) return; const n=S.target.name; S.target=null; S.found=false; updateChip(); tick(.5); toast(`Stopped finding ${n}`);
}
function updateChip(){
  const c=$("findChip"); if(!c) return;
  if(S.target){ $("findName").textContent=S.target.name; c.classList.add("show"); } else c.classList.remove("show");
}

// ---------- motion ----------
let motionSeen = false, listening = false, iosOffset = null;
function onOrient(e){
  if(e.alpha==null) return; motionSeen = true;
  let alpha = e.alpha;
  if(e.webkitCompassHeading!=null){
    // iOS: alpha is relative to where the phone started, so learn the offset to true north from the compass
    // while the phone isn't pointing straight up or down, then smooth it so the sky doesn't jitter
    S.compassAcc = e.webkitCompassAccuracy;
    if(Math.abs(e.beta) < 70 || iosOffset===null){
      const off = norm360(360 - e.webkitCompassHeading - e.alpha);
      if(iosOffset===null) iosOffset = off;
      else { let d = ((off - iosOffset + 540) % 360) - 180; iosOffset = norm360(iosOffset + d*0.05); }
    }
    alpha = norm360(e.alpha + iosOffset);
  }
  else if(e.absolute) S.compassAcc = -1; else S.compassAcc = -2;
  const a=alpha*D2R, b=e.beta*D2R, g=e.gamma*D2R;
  const cA=Math.cos(a),sA=Math.sin(a),cB=Math.cos(b),sB=Math.sin(b),cG=Math.cos(g),sG=Math.sin(g);
  const r=[cA*cG-sA*sB*sG, cG*sA+cA*sB*sG, -cB*sG];
  const u=[-cB*sA, cA*cB, sB];
  const f=[-(cG*sA*sB+cA*sG), -(sA*sG-cA*cG*sB), -(cB*cG)];
  if(!gyro) gyro={r,u,f};
  const k=0.35; const lerp=(p,q)=>nrm(p.map((v,i)=>v+(q[i]-v)*k));
  const nf=lerp(gyro.f,f); let nr=lerp(gyro.r,r); nr=nrm(cross(cross(nf,nr),nf)); // keep orthogonal
  gyro={f:nf, r:nr, u:cross(nr,nf)};
  updateBadge();
}
async function enableMotion(){
  if(S.mode==="motion"){ S.mode="drag"; const [al,az]=camAltAz(cam); S.alt=al; S.az=az; $("bMotion").classList.remove("on"); updateBadge(); return; }
  try{ if(typeof DeviceOrientationEvent!=="undefined" && DeviceOrientationEvent.requestPermission){ const p=await DeviceOrientationEvent.requestPermission(); if(p!=="granted"){ toast("Motion access was declined"); return; } } }catch(err){}
  motionSeen=false;
  if(!listening){ window.addEventListener("ondeviceorientationabsolute" in window? "deviceorientationabsolute":"deviceorientation", onOrient); listening=true; }
  S.mode="motion"; $("bMotion").classList.add("on"); S.demo=null; gyro=null;
  setTimeout(()=>{ if(!motionSeen){ S.mode="drag"; $("bMotion").classList.remove("on"); toast(window.isSecureContext? "No motion sensor here. On a phone it follows your hand" : "Motion needs an https address, e.g. GitHub Pages"); updateBadge(); } }, 1400);
  updateBadge();
}
function updateBadge(){
  const el=$("acc"), tx=$("accTxt"); el.className="badge";
  if(S.mode!=="motion"){ el.classList.add("idle"); tx.textContent = "Drag mode"; return; }
  const a=S.compassAcc;
  if(a==null){ el.classList.add("idle"); tx.textContent="Waiting for compass"; }
  else if(a>=0){ tx.textContent=`Compass ±${Math.round(a)}°`; if(a>12) el.classList.add("warn"); }
  else { el.classList.add("warn"); tx.textContent="Compass · accuracy not reported"; }
}

// demo sweep: what it feels like to move the phone around
function runDemo(ts){
  const d=S.demo; if(!d.t0) d.t0=ts; const p=(ts-d.t0)/9000;
  if(p>=1){ S.demo=null; toast(S.mode==="motion"? "Back to following your phone" : "On your phone, this follows your hand"); return; }
  const e = p<.5? 2*p*p : 1-Math.pow(-2*p+2,2)/2;
  S.az = norm360(d.az + e*300 + Math.sin(p*20)*1.2); S.alt = d.alt + Math.sin(p*Math.PI*2)*22 + Math.sin(p*31)*0.8;
}

// ---------- time ruler ----------
const rc=$("rulerC"), rctx=rc.getContext("2d"); let rv=0, rdrag=null, lastHr=null;
const PX_PER_MIN = 1/3;
function drawRuler(){
  requestAnimationFrame(drawRuler);
  if(!rdrag && Math.abs(rv)>0.05){ S.offsetMin += rv; rv*=0.92; if(Math.abs(rv)<0.05) rv=0; }
  const w=rc.clientWidth,h=rc.clientHeight; if(rc.width!==w*DPR){rc.width=w*DPR;rc.height=h*DPR;}
  rctx.setTransform(DPR,0,0,DPR,0,0); rctx.clearRect(0,0,w,h);
  const sk=SKINS[S.skin]; rctx.fillStyle = sk.ink? "rgba(40,30,10,.07)":"rgba(255,255,255,.07)"; rctx.fillRect(0,0,w,h);
  const t=simTime(), m0=t.getHours()*60+t.getMinutes()+t.getSeconds()/60;
  rctx.fillStyle=sk.fg; rctx.font="500 9px -apple-system,sans-serif"; rctx.textAlign="center";
  const span = w/2/PX_PER_MIN;
  for(let m=Math.floor((m0-span)/15)*15; m<=m0+span; m+=15){
    const x=w/2+(m-m0)*PX_PER_MIN, hr=((Math.round(m/60)%24)+24)%24, isH = ((m%60)+60)%60===0;
    rctx.globalAlpha = isH? .8 : .35; rctx.fillRect(x-.5, isH? 5:10, 1, isH? 9:5);
    if(isH && ((hr%3)===0)) { rctx.globalAlpha=.7; rctx.fillText(String(hr).padStart(2,"0"), x, 25); }
  }
  rctx.globalAlpha=1;
  const off=Math.round(S.offsetMin);
  $("tLabel").textContent = off===0? "Now" : fmtDay(t);
  $("tDelta").textContent = off===0? "drag to move through the night" : `${off>0?"+":"−"}${fmtDur(Math.abs(off))}`;
  const dayNow = off===0 && darkness<0.5; $("tNow").textContent = dayNow? "See tonight" : "Back to now"; $("tNow").style.display = (Math.abs(off)>0||dayNow)? "inline-block":"none"; if(dayNow) $("tDelta").textContent="";
}
const ruler=$("ruler");
ruler.addEventListener("pointerdown",e=>{ ruler.setPointerCapture(e.pointerId); rdrag={x:e.clientX,t:performance.now()}; rv=0; });
ruler.addEventListener("pointermove",e=>{ if(!rdrag) return; const dx=e.clientX-rdrag.x; const dm=-dx/PX_PER_MIN; S.offsetMin+=dm; const now=performance.now(); rv = dm/Math.max(1,(now-rdrag.t)/16); rdrag={x:e.clientX,t:now};
  const hr=Math.floor((Date.now()/60000+S.offsetMin)/60); if(hr!==lastHr){ if(lastHr!=null) tick(.25); lastHr=hr; } });
ruler.addEventListener("pointerup",()=>{ rdrag=null; });
$("tNow").onclick=()=>{ rv=0; tick(.5); if(Math.round(S.offsetMin)===0){ const n=new Date(), t=new Date(n); t.setHours(22,0,0,0); if(t<n) t.setDate(t.getDate()+1); S.offsetMin=Math.round((t-n)/60000); toast("Tonight at 22:00"); } else S.offsetMin=0; };

// ---------- helpers ----------
const fmtTime = t => t.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
const fmtDay = t => t.toLocaleDateString("en-GB",{weekday:"short"})+" "+fmtTime(t);
const fmtDur = m => m>=1440? `${Math.floor(m/1440)}d ${Math.floor(m%1440/60)}h` : m>=60? `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m` : `${m}m`;
function moonPhaseName(e){ e=norm360(e);
  if(e<10||e>350) return "New Moon"; if(e<80) return "Waxing crescent"; if(e<100) return "First quarter"; if(e<170) return "Waxing gibbous";
  if(e<190) return "Full Moon"; if(e<260) return "Waning gibbous"; if(e<280) return "Last quarter"; return "Waning crescent"; }
let actx=null;
function tick(v=.5){ if(!S.sounds) return; try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); const o=actx.createOscillator(), g=actx.createGain();
  o.type="triangle"; o.frequency.value=1800+v*900; g.gain.setValueAtTime(.05*v,actx.currentTime); g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+.05);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime+.06); buzz(8); }catch(e){} }
function buzz(p){ if(!S.haptics) return; if(window.CaelumNative && CaelumNative.vibrate) CaelumNative.vibrate(String(p)); else if(navigator.vibrate) navigator.vibrate(p); }
let toastT; function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2200); }

$("bMotion").onclick = enableMotion;
$("bLines").onclick = ()=>{ S.lines=!S.lines; $("bLines").classList.toggle("on",!S.lines); tick(); toast(S.lines?"Constellations on":"Constellations off"); };
$("bDemo").onclick = ()=>{ if(S.demo){ S.demo=null; tick(.4); return; } const [al,az]=camAltAz(cam); S.alt=Math.max(-20,Math.min(60,al)); S.az=az; S.demo={az:S.az,alt:S.alt}; tick(); };

// ---------- start in motion mode on phones ----------
const isPhone = matchMedia("(pointer:coarse)").matches && typeof DeviceOrientationEvent!=="undefined";
const needsTap = isPhone && typeof DeviceOrientationEvent.requestPermission==="function"; // iPhone asks every visit
$("startGo").onclick = async ()=>{ $("start").classList.remove("show"); try{ localStorage.setItem("caelum-motion","on"); }catch(e){} if(S.mode!=="motion") await enableMotion(); };
$("startSkip").onclick = ()=>{ $("start").classList.remove("show"); try{ localStorage.setItem("caelum-motion","off"); }catch(e){} };
if(isPhone && window.isSecureContext){
  let pref=null; try{ pref=localStorage.getItem("caelum-motion"); }catch(e){}
  if(pref==="on" && !needsTap) enableMotion();           // Android: straight into motion
  else if(pref!=="off") $("start").classList.add("show"); // first visit, or iPhone needing a tap
}

requestAnimationFrame(frame); requestAnimationFrame(drawRuler);
