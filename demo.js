// Caelum: fixed scenes for the README screenshots (tools/screenshots.sh).
//   index.html?demo=<scene>            each scene has its own skin
//   index.html?demo=<scene>&skin=dusk  force a skin (indigo, dusk, atlas, glacier, red)
// The night is always 15 January 2027 at 21:00 over Gliwice, and nothing is saved.
const SCENES = {
  sky:     {skin:"indigo",  about:"Orion in the south, finding Betelgeuse"},
  planet:  {skin:"dusk",    about:"the brightest planet that's up, in the middle"},
  north:   {skin:"glacier", about:"the north: Polaris, the Big Dipper and Cassiopeia"},
  star:    {skin:"atlas",   about:"Betelgeuse's details"},
  time:    {skin:"atlas",   about:"four hours later, with the time ruler moved"},
  below:   {skin:"red",     about:"Sirius low in the south-east, stars under the tinted ground"},
  tonight: {skin:"indigo",   about:"the Tonight tab"},
  find:    {skin:"glacier", about:"the Find list"},
  camera:  {skin:"indigo",  about:"a night photo of Orion"},
  styles:  {skin:"dusk",    about:"Profile, with the five skins"},
};

(function(){
  if(!window.DEMO) return;
  const name = SCENES[window.DEMO] ? window.DEMO : (window.DEMO==="profile" ? "styles" : "sky");
  const q = new URLSearchParams(location.search);
  const skin = q.get("skin") in SKINS ? q.get("skin") : SCENES[name].skin;

  $("start").classList.remove("show");
  S.offsetMin = 0; S.place = "Gliwice"; S.lat = 50.294; S.lon = 18.665;
  applySkin(skin);
  $("verLine").textContent = "Caelum 1.1.1 · Android app";

  // a phone status bar and gesture bar, so the pictures look like real screenshots
  document.documentElement.style.setProperty("--sat","44px");
  document.documentElement.style.setProperty("--sab","20px");
  const css = document.createElement("style");
  css.textContent = `.demoBar{position:absolute;top:0;left:0;right:0;height:44px;z-index:90;display:flex;align-items:center;justify-content:space-between;padding:2px 24px 0 30px;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.2px;color:var(--fg);pointer-events:none}
  .demoBar svg{display:block;fill:currentColor}.demoBar .r{display:flex;gap:6px;align-items:center}
  .demoHome{position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:var(--fg);opacity:.5;z-index:90;pointer-events:none}
  .cam .demoBar,.cam~.demoBar{color:#fff}`;
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.className = "demoBar";
  bar.innerHTML = `<span>21:00</span><span class="r">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.2-1.3A10.4 10.4 0 0 0 8 .4C5.2.4 2.6 1.5.6 3.4l1.2 1.3A8.7 8.7 0 0 1 8 2.2zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.1 7.1 0 0 0 8 4c-1.9 0-3.6.7-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4zM8 9.4l1.9-2a2.8 2.8 0 0 0-3.8 0z"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="16" height="9" rx="2"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" opacity=".45"/></svg></span>`;
  const home = document.createElement("div"); home.className = "demoHome";
  $("screen").append(bar, home);

  // looks as if the phone were held up with motion on and a well-calibrated compass
  S.mode = "motion"; S.compassAcc = 6; gyro = null; $("bMotion").classList.add("on"); updateBadge();

  const now = simTime();
  updateBodies(now);
  const where = o => { const t = simTime(); return toHorizon(o.ra, o.dec, lstDeg(t, S.lon), S.lat); };
  const aim = (o, dAlt, fov) => { const [alt, az] = where(o); S.az = az; S.alt = alt + dAlt; S.fov = fov; };

  if(name==="sky"){ aim(BYID.alnilam, 4, 74); S.target = BYID.betelgeuse; S.found = true; updateChip(); }
  if(name==="planet"){
    // whichever planet is highest at this moment, so the picture is always of something that's really there
    const best = BODIES.map(b=>[b, where(b)[0]]).sort((a,b)=>b[1]-a[1])[0][0];
    aim(best, 0, 62);
  }
  if(name==="north"){ S.az = 4; S.alt = 47; S.fov = 104; }
  if(name==="star"){ aim(BYID.alnilam, 4, 74); setTimeout(()=>openInfo(BYID.betelgeuse), 300); }
  if(name==="time"){ S.offsetMin = 240; S.az = 175; S.alt = 38; S.fov = 92; }
  if(name==="below"){ aim(BYID.sirius, -10, 86); }
  if(name==="tonight"||name==="styles"){
    // a still picture: no fade-in, nothing of the sky or its buttons showing through
    const st = document.createElement("style"); st.textContent = ".panel.show{animation:none!important}#sky{visibility:hidden}"; document.head.appendChild(st);
  }
  if(name==="tonight") showTab("pTonight");
  if(name==="styles") showTab("pProfile");
  if(name==="find"){ aim(BYID.alnilam, 4, 74); setTimeout(()=>$("bFind").onclick(), 300); }

  if(name==="camera"){
    // a "stacked" night photo, drawn by the sky itself without lines and names, then trees in front
    aim(BYID.alnilam, 6, 66); S.lines = false; S.labels = false; S.ground = false;
    ["top","rail","time","pointing","tabs"].forEach(id=>$(id).style.visibility="hidden");
    setTimeout(()=>{
      const out = $("camOut"), w = cv.width, h = cv.height, x = out.getContext("2d");
      out.width = w; out.height = h;
      x.drawImage(cv, 0, 0);
      // a little warmth near the horizon, like town light
      const hz = project(altAzVec(0, S.az)).y * DPR;
      const g = x.createLinearGradient(0, hz - h*0.35, 0, hz);
      g.addColorStop(0, "rgba(255,170,110,0)"); g.addColorStop(1, "rgba(255,170,110,.22)");
      x.fillStyle = g; x.fillRect(0, 0, w, hz);
      // treeline
      let s = 5; const r = () => (s = (s*16807) % 2147483647) / 2147483647;
      x.fillStyle = "#040509"; x.beginPath(); x.moveTo(0, h); x.lineTo(0, hz - 20*DPR);
      for(let px = 0; px <= w; px += 6*DPR){ const tall = r() < 0.18 ? 70 : r() < 0.5 ? 38 : 22; x.lineTo(px, hz - (tall*r() + 8)*DPR); }
      x.lineTo(w, h); x.closePath(); x.fill();
      // sensor grain
      const img = x.getImageData(0, 0, w, Math.round(hz)), d = img.data;
      for(let i = 0; i < d.length; i += 4){ const n = (r() - 0.5) * 14; d[i]+=n; d[i+1]+=n; d[i+2]+=n*1.2; }
      x.putImageData(img, 0, 0);
      $("cam").classList.add("show","result");
      $("camLive").style.display = "none"; $("camDone").style.display = "flex";
      $("camMode").textContent = "Night · long exposure";
      $("camHint").textContent = "52 frames stacked over 4 s";
    }, 900);
  }
})();

// app version at the bottom of Profile, so you can see which build is installed
(function(){
  if(window.DEMO) return;
  const v = window.CaelumNative && CaelumNative.version ? CaelumNative.version() : "";
  $("verLine").textContent = v ? `Caelum ${v} · Android app` : "Caelum · web app";
})();
