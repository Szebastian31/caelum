// Caelum: tabs, sheets, Tonight and Profile
translateStatic();
const sheet=$("sheet"), scrim=$("scrim"), body=$("sheetBody");
function openSheet(html){ body.innerHTML=html; sheet.scrollTop=0; sheet.classList.add("show"); scrim.classList.add("show"); }
function closeSheet(){ sheet.classList.remove("show"); scrim.classList.remove("show"); }
scrim.onclick=closeSheet;
let sy=null; sheet.addEventListener("pointerdown",e=>{ if(e.target.classList.contains("grab")) sy=e.clientY; });
sheet.addEventListener("pointerup",e=>{ if(sy!=null && e.clientY-sy>40) closeSheet(); sy=null; });
sheet.querySelector(".grab").onclick=closeSheet;

// ---------- tabs ----------
let tab="sky";
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showTab(t.dataset.p));
function showTab(p){
  tab=p; tick(.4);
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.p===p));
  document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("show",x.id===p));
  const sky = p==="sky"; ["top","rail","time","pointing"].forEach(id=>$(id).style.visibility = sky? "visible":"hidden");
  if(p==="pTonight") buildTonight();
}

// ---------- current position of anything ----------
function nowPos(o, t=simTime()){
  const lst=lstDeg(t,S.lon);
  let ra=o.ra, dec=o.dec;
  if(o.type==="planet"){ const p=planetPos(o.id,t); ra=p.ra; dec=p.dec; }
  if(o.type==="moon"){ const p=moonPos(t); ra=p.ra; dec=p.dec; }
  if(o.type==="sun"){ const p=sunPos(t); ra=p.ra; dec=p.dec; }
  const [alt,az]=toHorizon(ra,dec,lst,S.lat); return {alt,az,ra,dec};
}
function raDecFn(o){
  if(o.type==="planet") return t=>{const p=planetPos(o.id,t);return [p.ra,p.dec];};
  if(o.type==="moon") return t=>{const p=moonPos(t);return [p.ra,p.dec];};
  if(o.type==="sun") return t=>{const p=sunPos(t);return [p.ra,p.dec];};
  return ()=>[o.ra,o.dec];
}
function visLine(o){
  const now=simTime(), p=nowPos(o,now);
  if(o.dec!=null && o.type!=="planet" && o.type!=="moon" && o.type!=="sun"){
    if(o.dec > 90-S.lat) return t("Never sets from here");
    if(o.dec < -(90-S.lat)) return t("Never rises from here");
  }
  const rs=riseSet(raDecFn(o), now, S.lat, S.lon);
  if(p.alt>=0) return rs.set? t("Up now · sets {time}",{time:fmtTime(rs.set)}) : t("Up now");
  return rs.rise? t("Below horizon · rises {time}",{time:fmtTime(rs.rise)}) : t("Stays below the horizon");
}
function lightYear(d){ const y=Math.round(new Date().getFullYear()-d); return y>0? int(y) : t("{y} BC",{y:Math.abs(y)}); }
function accLine(){
  if(S.mode!=="motion") return t("In drag mode the view itself is exact. When you hold the phone up, the compass adds its own error, usually 5 to 15°.");
  if(S.compassAcc>=0) return t("Your compass reports ±{n}°, so the overlay can sit about that far from the real star.",{n:Math.round(S.compassAcc)});
  return t("Your phone doesn't report compass accuracy. If things look shifted sideways, move the phone in a figure 8.");
}
// the place is saved in English ("Your location"), so it's translated when shown
const placeName = () => S.place==="Your location"? t("Your location") : S.place;
// "38° up in the SE"
const upIn = (alt, az) => t("{deg}° up in the {dir}",{deg:Math.round(alt),dir:compass(az)});
const num = (v, d) => v.toLocaleString(LOCALE,{minimumFractionDigits:d,maximumFractionDigits:d});
const magText = m => t("mag {m}",{m:num(m,1)});
const coords = (lat, lon) => `${num(Math.abs(lat),2)}° ${lat>=0?"N":"S"} · ${num(Math.abs(lon),2)}° ${lon>=0?"E":"W"}`;

// ---------- info sheet ----------
function openInfo(o){
  if(!o) return;
  const p=nowPos(o); const dir=`${compass(p.az)} · ${int(Math.round(p.az))}°`, h=`${int(Math.round(p.alt))}°`;
  let kind="", facts=[], story="";
  if(o.type==="star"){
    kind=t("Star in {con}",{con:CONST[o.con].name});
    facts=[[t("Height now"),h],[t("Direction"),dir],[t("Brightness"),magText(o.mag)],[t("Distance"),o.dist?t("{n} ly",{n:o.dist.toLocaleString(LOCALE)}):"—"]];
    story = STORIES[o.id] || (o.dist? t("The light you're seeing left {name} around {year}.",{name:o.name,year:lightYear(o.dist)}) : "");
    if(STORIES[o.id] && o.dist) story += ` <span style="opacity:.7">${t("The light reaching you left it around {year}.",{year:lightYear(o.dist)})}</span>`;
  } else if(o.type==="planet"){
    const pp=planetPos(o.id,simTime()); kind=t("Planet");
    facts=[[t("Height now"),h],[t("Direction"),dir],[t("Brightness"),magText(pp.mag)],[t("Distance"),t("{au} AU · {min} light-min",{au:pp.dist.toLocaleString(LOCALE,{minimumFractionDigits:2,maximumFractionDigits:2}),min:Math.round(pp.dist*8.317)})]];
    story=o.story;
  } else if(o.type==="moon"){
    const m=moonPos(simTime()); kind=moonPhaseName(m.elong);
    facts=[[t("Height now"),h],[t("Direction"),dir],[t("Lit"),new Intl.NumberFormat(LOCALE,{style:"percent"}).format(Math.round(m.illum*100)/100)],[t("Age"),t("{n} days",{n:(norm360(m.elong)/12.19).toLocaleString(LOCALE,{minimumFractionDigits:1,maximumFractionDigits:1})})]];
    story = m.illum>0.8? t("A bright Moon washes out faint stars. Planets and bright stars still show well.") : t("A thin Moon means darker skies. Good night for the Milky Way, away from city lights.");
  } else if(o.type==="sun"){
    kind=t("Our star"); facts=[[t("Height now"),h],[t("Direction"),dir]]; story=t("Never look at it directly, and never through binoculars or a telescope.");
  } else if(o.type==="const"){
    const c=CONST[o.key]; kind=t("Constellation");
    const stars=STARS.filter(s=>s.con===o.key).sort((a,b)=>a.mag-b.mag).slice(0,4);
    facts=[[t("Height now"),h],[t("Direction"),dir],[t("Best seen"),c.best],[t("Brightest"),stars[0]?.name||"—"]];
    story=c.easy;
  }
  openSheet(`
    <h2>${o.name}</h2><div class="kind">${kind} · ${visLine(o)}</div>
    <div class="facts">${facts.map(([a,b])=>`<div class="fact"><span>${a}</span><b>${b}</b></div>`).join("")}</div>
    ${story?`<p class="story">${story}</p>`:""}
    <div class="honest">${t("Position calculated for {when} in {place}, good to about 0.3°.",{when:fmtDay(simTime()),place:placeName()})} ${accLine()}</div>
    <div class="acts">${S.target===o? `<button class="btn" id="aFind">${t("Stop finding")}</button>` : `<button class="btn" id="aFind">${t("Find it")}</button>`}<button class="btn ghost" id="aCentre">${t("Centre in view")}</button></div>`);
  $("aFind").onclick=()=>{ if(S.target===o){ clearTarget(); closeSheet(); return; } setTarget(o); closeSheet(); };
  $("aCentre").onclick=()=>{ if(S.mode==="motion"){ toast(t("Turn off motion to centre")); return; } const q=nowPos(o); S.az=q.az; S.alt=q.alt; closeSheet(); tick(); };
}
function setTarget(o){ S.target=o; S.found=false; updateChip(); showTab("sky"); toast(t("Follow the arrow to {name}",{name:o.name})); tick(.8); }
$("pointing").onclick=()=> S.pointing? openInfo(S.pointing) : toast(t("Point at a star, planet or constellation"));

// ---------- find ----------
function findList(q=""){
  q=q.trim().toLowerCase();
  const items=[...BODIES, MOON, ...CONSTS, ...STARS.filter(s=>s.mag<2.6)];
  // matches the name in your language and the English one, so "Orion" and "Jupiter" always work
  const rows = items.filter(o=>!q||o.name.toLowerCase().includes(q)||(o.en||"").toLowerCase().includes(q)).slice(0,40).map(o=>{
    const p=nowPos(o); const up=p.alt>=0;
    const ic = o.type==="planet"? planetIcon(o.id): o.type==="moon"?"☾": o.type==="const"?"✧":"✦";
    const sub = o.type==="star"? t("Star · {con}",{con:CONST[o.con].name}) : o.type==="const"? t("Constellation") : o.type==="moon"? moonPhaseName(MOON.elong) : t("Planet");
    return `<div class="row" data-id="${o.id}"><div class="ic" style="background:rgba(255,255,255,.07)">${ic}</div><div class="tx"><b>${o.name}</b><span>${sub}</span></div><div class="rt">${up?`<span class="pill">${t("Up · {deg}°",{deg:Math.round(p.alt)})}</span>`:`<span class="pill dim">${t("Below")}</span>`}</div></div>`;
  }).join("");
  return rows || `<div class="sub">${t("Nothing called that in this first catalogue.")}</div>`;
}
$("bFind").onclick=()=>{
  openSheet(`<h2>${t("Find")}</h2><div class="kind">${t("An arrow leads you there. You'll feel a tick when it's centred.")}</div><input class="search" id="q" placeholder="${t("Jupiter, Vega, Orion…")}" autocomplete="off"><div id="fl">${findList()}</div>`);
  const bind=()=>$("fl").querySelectorAll(".row").forEach(r=>r.onclick=()=>{ const id=r.dataset.id; const o=[...BODIES,MOON,...CONSTS,...STARS].find(x=>x.id===id); setTarget(o); closeSheet(); });
  bind(); $("q").oninput=e=>{ $("fl").innerHTML=findList(e.target.value); bind(); };
};
$("acc").onclick=()=>openSheet(`<h2>${t("How accurate is this?")}</h2><div class="kind">${$("accTxt").textContent}</div>
  <div class="facts"><div class="fact"><span>${t("Star positions")}</span><b>±${num(0.3,1)}°</b></div><div class="fact"><span>${t("Phone compass")}</span><b>${S.mode==="motion"&&S.compassAcc>=0?`±${int(Math.round(S.compassAcc))}°`:`±${int(5)}–${int(15)}°`}</b></div></div>
  <p class="story">${t("The maths is the easy part. The real limit is your phone's compass, which gets thrown off by metal, magnets and cars.")}</p>
  <div class="honest">${accLine()} ${t("To recalibrate, wave the phone in a slow figure 8 for a few seconds. For comparison, the Moon is about 0.5° wide and your fist at arm's length covers about 10°.")}</div>`);

// ---------- Tonight ----------
function tonightAt(){ const n=simTime(), at=new Date(n); at.setHours(22,0,0,0); if(n.getHours()>=22||n.getHours()<5) return n; return at; }
function buildTonight(){
  const at=tonightAt(), lst=lstDeg(at,S.lon);
  $("tonSub").textContent=`${placeName()} · ${at.toLocaleDateString(LOCALE,{weekday:"long",day:"numeric",month:"long"})}, ${fmtTime(at)}`;
  $("starHead").textContent=t("Brightest stars up at {time}",{time:fmtTime(at)});
  const m=moonPos(at); $("moonName").textContent=moonPhaseName(m.elong);
  const [malt,maz]=toHorizon(m.ra,m.dec,lst,S.lat);
  const where = malt>0? t("{deg}° up in the {dir} at {time}",{deg:Math.round(malt),dir:compass(maz),time:fmtTime(at)}) : t("below the horizon at {time}",{time:fmtTime(at)});
  const sky = m.illum>0.75? t("Bright enough to hide faint stars tonight.") : m.illum<0.3? t("Dark skies tonight. Good for the Milky Way.") : t("Faint stars partly washed out.");
  $("moonInfo").innerHTML=`${t("{n}% lit",{n:Math.round(m.illum*100)})} · ${where}<br>${sky}`;
  drawMoonIcon($("moonC"), m);
  $("planetList").innerHTML = BODIES.map(b=>{
    const p=planetPos(b.id,at), [alt,az]=toHorizon(p.ra,p.dec,lst,S.lat);
    const rs=riseSet(raDecFn(b), new Date(at.getTime()-6*3600000), S.lat, S.lon);
    const sub = alt>5? upIn(alt,az) : alt>0? t("Very low in the {dir}",{dir:compass(az)}) : rs.rise? t("Rises {time}",{time:fmtTime(rs.rise)}) : t("Not up tonight");
    const pill = alt>10? `<span class="pill">${t("Easy")}</span>` : alt>0? `<span class="pill amber">${t("Low")}</span>` : `<span class="pill dim">${t("Below")}</span>`;
    return `<div class="row" data-id="${b.id}"><div class="ic" style="background:${b.col}26">${planetIcon(b.id)}</div><div class="tx"><b>${b.name}</b><span>${sub} · ${magText(p.mag)}</span></div><div class="rt">${pill}</div></div>`;
  }).join("");
  const up = STARS.map(s=>({s,alt:toHorizon(s.ra,s.dec,lst,S.lat)})).filter(x=>x.alt[0]>15).sort((a,b)=>a.s.mag-b.s.mag).slice(0,5);
  $("starList").innerHTML = up.map(({s,alt})=>`<div class="row" data-id="${s.id}"><div class="ic" style="background:rgba(255,255,255,.07)">✦</div><div class="tx"><b>${s.name}</b><span>${CONST[s.con].name} · ${upIn(alt[0],alt[1])}</span></div><div class="rt">${magText(s.mag)}</div></div>`).join("");
  const cs = CONSTS.map(c=>{ const [alt,az]=toHorizon(c.ra,c.dec,lst,S.lat); return {c,alt,az}; }).filter(x=>x.alt>25).sort((a,b)=>b.alt-a.alt).slice(0,4);
  $("constList").innerHTML = cs.map(({c,alt,az})=>`<div class="row" data-id="${c.id}"><div class="ic" style="background:rgba(255,255,255,.07)">✧</div><div class="tx"><b>${c.name}</b><span>${CONST[c.key].easy}</span></div><div class="rt">${compass(az)}<br>${int(Math.round(alt))}°</div></div>`).join("");
  document.querySelectorAll("#pTonight .row").forEach(r=>r.onclick=()=>{ const o=[...BODIES,...CONSTS,...STARS].find(x=>x.id===r.dataset.id); openInfo(o); });
}
function drawMoonIcon(c, m){
  const x=c.getContext("2d"), s=c.width, r=s*0.42; x.clearRect(0,0,s,s); x.save(); x.translate(s/2,s/2);
  const sk=SKINS[S.skin]; x.fillStyle = sk.ink?"rgba(0,0,0,.08)":"rgba(255,255,255,.08)"; x.beginPath(); x.arc(0,0,r,0,7); x.fill();
  const waxing = norm360(m.elong)<180; if(!waxing) x.scale(-1,1);           // from the north, waxing is lit on the right
  const k=Math.cos(m.elong*D2R); x.fillStyle = sk.ink? sk.fg : (sk.red?"#ff6a55":"#fbf6e8");
  x.beginPath(); x.arc(0,0,r,-Math.PI/2,Math.PI/2,false); x.ellipse(0,0,Math.abs(k)*r,r,0,Math.PI/2,-Math.PI/2,k>0); x.fill(); x.restore();
}

// ---------- Profile ----------
function applySkin(k){
  S.skin=k; const sk=SKINS[k], sc=$("screen");
  sc.style.setProperty("--sky-top",sk.top); sc.style.setProperty("--sky-bot",sk.bot); sc.style.setProperty("--fg",sk.fg); sc.style.setProperty("--accent",sk.accent);
  sc.style.setProperty("--fg2", sk.light? "rgba(30,25,15,.58)" : sk.red? "rgba(255,90,72,.6)" : "rgba(238,243,255,.62)");
  sc.classList.toggle("light",!!sk.light); sc.classList.toggle("redskin",!!sk.red);
  document.querySelectorAll(".skin").forEach(s=>s.classList.toggle("on",s.dataset.k===k));
  // dark status and navigation bar icons on the light skins (Android app)
  try{ if(window.CaelumNative && CaelumNative.setBars) CaelumNative.setBars(!!sk.light); }catch(e){}
}
$("skins").innerHTML = Object.entries(SKINS).map(([k,s])=>`<div class="skin" data-k="${k}"><div class="sw" style="background:linear-gradient(${s.top},${s.bot})"><svg viewBox="0 0 52 52" style="position:absolute;inset:0"><path d="M26 15l1.6 7.4L35 24l-7.4 1.6L26 33l-1.6-7.4L17 24l7.4-1.6z" fill="${s.ink?s.fg:s.red?'#ff4b3a':'#fff'}"/><circle cx="14" cy="13" r="1" fill="${s.ink?s.fg:'#fff'}" opacity=".7"/><circle cx="38" cy="38" r="1.2" fill="${s.accent}"/><rect x="0" y="40" width="52" height="12" fill="${s.ground}" opacity=".9"/></svg></div>${t(s.name)}</div>`).join("");
document.querySelectorAll(".skin").forEach(s=>s.onclick=()=>{ applySkin(s.dataset.k); tick(.7); });

const TOGS=[["lines","Constellation lines","The stick figures between stars"],["labels","Names","Star, planet and constellation names"],["milky","Milky Way","Drawn along the real galactic plane"],["ground","Ground","Tinted so you can still see stars below the horizon. Off removes it"],["sounds","Tactile sounds","Soft ticks on taps, N/E/S/W and finds"],["haptics","Haptics","Vibration on phones that support it"]].map(([k,a,b])=>[k,t(a),t(b)]);
$("toggles").innerHTML = TOGS.map(([k,a,b])=>`<div class="tog"><div>${a}<small>${b}</small></div><div class="sw-t ${S[k]?"on":""}" data-k="${k}"></div></div>`).join("");
document.querySelectorAll(".sw-t").forEach(t=>t.onclick=()=>{ const k=t.dataset.k; S[k]=!S[k]; t.classList.toggle("on",S[k]); if(k==="lines") $("bLines").classList.toggle("on",!S.lines); tick(.5); });

$("bLocate").onclick=()=>{
  if(!navigator.geolocation){ toast(t("Location isn't available here")); return; }
  navigator.geolocation.getCurrentPosition(p=>{ S.lat=p.coords.latitude; S.lon=p.coords.longitude; S.place="Your location"; lastKey="";
    $("locName").textContent=t("Here"); $("locLine").textContent=t("Your location");
    $("locCoords").textContent=`${coords(S.lat,S.lon)} · ±${Math.round(p.coords.accuracy)} m`; toast(t("Sky recalculated for where you are")); },
    ()=>toast(t("Couldn't get your location. Still using {place}",{place:placeName()})), {timeout:8000});
};

// ---------- remember settings on this device ----------
const SAVE_KEYS=["skin","lines","labels","milky","ground","sounds","haptics","lat","lon","place"];
function saveSettings(){ try{ localStorage.setItem("caelum",JSON.stringify(Object.fromEntries(SAVE_KEYS.map(k=>[k,S[k]])))); }catch(e){} }
try{ const saved=JSON.parse(localStorage.getItem("caelum")||"{}"); for(const k of SAVE_KEYS) if(saved[k]!==undefined) S[k]=saved[k]; }catch(e){}
document.querySelectorAll(".sw-t").forEach(t=>{ t.classList.toggle("on",!!S[t.dataset.k]); t.addEventListener("click",saveSettings); });
document.querySelectorAll(".skin").forEach(s=>s.addEventListener("click",saveSettings));
$("bLines").classList.toggle("on",!S.lines); $("bLines").addEventListener("click",saveSettings);
if(S.place!=="Gliwice"){ $("locName").textContent=t("Here"); $("locLine").textContent=placeName(); $("locCoords").textContent=coords(S.lat,S.lon); }
new MutationObserver(saveSettings).observe($("locCoords"),{childList:true,characterData:true,subtree:true});

applySkin(S.skin in SKINS? S.skin : "indigo");
// Daytime on open: offer tonight
setTimeout(()=>{ updateBodies(simTime()); const p=nowPos(SUN); if(p.alt>-4){ toast(t("It's daytime, so stars are faded. Tap See tonight")); } }, 900);

// ---------- language ----------
$("langSel").innerHTML = Object.entries(LANGS).map(([k,[name]])=>`<option value="${k}"${k===LANG?" selected":""}>${name}</option>`).join("");
$("langSel").setAttribute("aria-label", t("Language"));
$("langSel").onchange = e => setLanguage(e.target.value);
// "Gliwice, Poland" with the country in your language
if(S.place==="Gliwice"){ $("locCoords").textContent=coords(S.lat,S.lon); try{ $("locLine").textContent = `Gliwice, ${new Intl.DisplayNames([LOCALE],{type:"region"}).of("PL")}`; }catch(e){} }
