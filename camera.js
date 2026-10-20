// Caelum: night camera. Stacks frames for a few seconds to pull faint stars out of the noise,
// and can hand over to the phone's own camera app (with its Night mode) instead.
const cam = $("cam"), vid = $("camVideo"), out = $("camOut");
let stream = null, shooting = false, camSecs = 4;
const native = window.CaelumNative || null;

async function openCam(){
  closeSheet();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext){ phoneCamera(); return; }
  cam.classList.add("show"); cam.classList.remove("result","busy");
  $("camLive").style.display="flex"; $("camDone").style.display="none";
  $("camHint").textContent = "Rest your phone on something steady, then tap the shutter";
  try{
    stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:"environment"}, width:{ideal:1920}, height:{ideal:1440}}});
    vid.srcObject = stream; await vid.play().catch(()=>{});
    $("camMode").textContent = await nightSettings(stream.getVideoTracks()[0]);
  }catch(e){
    closeCam(); toast("Couldn't open the camera. Opening your phone's camera instead"); setTimeout(phoneCamera, 600);
  }
}

// ask the camera for long exposure, high ISO and focus at infinity where the phone allows it
async function nightSettings(track){
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const tries = [];
  if(caps.exposureMode && caps.exposureMode.includes("manual") && caps.exposureTime)
    tries.push({exposureMode:"manual", exposureTime:Math.min(caps.exposureTime.max, 3330)}); // units of 100 µs, so up to 1/3 s
  if(caps.iso) tries.push({iso:Math.min(caps.iso.max, 3200)});
  if(caps.focusMode && caps.focusMode.includes("manual") && caps.focusDistance)
    tries.push({focusMode:"manual", focusDistance:caps.focusDistance.max});
  let longExp = false;
  for(const t of tries){ try{ await track.applyConstraints({advanced:[t]}); if(t.exposureTime) longExp = true; }catch(e){} }
  return longExp ? "Night · long exposure" : "Night · stacking";
}

function closeCam(){
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
  vid.srcObject = null; cam.classList.remove("show","result","busy"); shooting = false;
}

// average every new frame for camSecs, then stretch the result so faint stars show up
async function shoot(){
  if(shooting || !stream) return; shooting = true; cam.classList.add("busy"); tick(.8);
  const vw = vid.videoWidth, vh = vid.videoHeight; if(!vw){ shooting=false; cam.classList.remove("busy"); return; }
  const k = Math.min(1, 1600/Math.max(vw,vh)), w = Math.round(vw*k), h = Math.round(vh*k);
  const c = document.createElement("canvas"); c.width=w; c.height=h; const x = c.getContext("2d", {willReadFrequently:true});
  const sum = new Float32Array(w*h*3); let n = 0, lastT = -1;
  const t0 = performance.now(), dur = camSecs*1000, prog = $("camProg");
  $("camHint").textContent = "Hold still…";
  await new Promise(done=>{
    const grab = ()=>{
      const el = performance.now() - t0;
      prog.style.strokeDashoffset = 226.2*(1 - Math.min(1, el/dur));
      if(vid.currentTime !== lastT){
        lastT = vid.currentTime; x.drawImage(vid,0,0,w,h);
        const d = x.getImageData(0,0,w,h).data;
        for(let i=0,j=0;i<d.length;i+=4,j+=3){ sum[j]+=d[i]; sum[j+1]+=d[i+1]; sum[j+2]+=d[i+2]; }
        n++;
      }
      if(el < dur) (vid.requestVideoFrameCallback ? vid.requestVideoFrameCallback(grab) : requestAnimationFrame(grab)); else done();
    };
    grab();
  });
  if(!n){ shooting=false; cam.classList.remove("busy"); toast("The camera didn't send any frames. Try again"); return; }
  // black and white points from the brightness histogram
  const hist = new Uint32Array(256);
  for(let j=0;j<sum.length;j+=3) hist[Math.min(255, ((sum[j]+sum[j+1]+sum[j+2])/(3*n))|0)]++;
  const total = w*h; let acc=0, bp=0, wp=255;
  for(let v=0;v<256;v++){ acc+=hist[v]; if(acc>total*0.005){ bp=v; break; } }
  acc=0; for(let v=255;v>=0;v--){ acc+=hist[v]; if(acc>total*0.002){ wp=v; break; } }
  wp = Math.max(wp, bp+24);
  const img = x.createImageData(w,h), o = img.data, lut = new Uint8ClampedArray(2560);
  for(let i=0;i<2560;i++){ const v=Math.max(0,Math.min(1,(i/10 - bp)/(wp - bp))); lut[i] = 255*Math.pow(v, 1/1.5); }
  for(let i=0,j=0;i<o.length;i+=4,j+=3){
    o[i]=lut[Math.min(2559,(sum[j]/n*10)|0)]; o[i+1]=lut[Math.min(2559,(sum[j+1]/n*10)|0)]; o[i+2]=lut[Math.min(2559,(sum[j+2]/n*10)|0)]; o[i+3]=255;
  }
  out.width=w; out.height=h; out.getContext("2d").putImageData(img,0,0);
  prog.style.strokeDashoffset = 226.2; showResult(`${n} frames stacked over ${camSecs} s`);
  buzz([20,40,20]); tick(1);
}

function showResult(msg){
  shooting = false; cam.classList.remove("busy"); cam.classList.add("show","result");
  $("camLive").style.display="none"; $("camDone").style.display="flex"; $("camHint").textContent = msg;
}

async function savePhoto(){
  const name = `Caelum_${new Date().toISOString().slice(0,16).replace(/[-:T]/g,"")}.jpg`;
  const data = out.toDataURL("image/jpeg", 0.93);
  if(native && native.savePhoto){ const ok = native.savePhoto(data.split(",")[1], name); toast(ok ? "Saved to Pictures/Caelum" : "Couldn't save the photo"); return; }
  const blob = await (await fetch(data)).blob(), file = new File([blob], name, {type:"image/jpeg"});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file], title:"Caelum"}); return; }catch(e){ if(e.name==="AbortError") return; } }
  const a = document.createElement("a"); a.href = data; a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast("Photo downloaded");
}

// the phone's own camera app. Only the Android app can open it fully, with all its modes including Night
function phoneCamera(){
  if(native && native.openCamera){ closeCam(); native.openCamera(); return; }
  $("camInput").click();
}
$("camInput").onchange = e=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const im = new Image(); im.onload = ()=>{ out.width=im.naturalWidth; out.height=im.naturalHeight; out.getContext("2d").drawImage(im,0,0); URL.revokeObjectURL(im.src); showResult("Photo from your camera"); };
  im.src = URL.createObjectURL(f); e.target.value = "";
};

$("bCam").onclick = openCam;
$("camClose").onclick = ()=>{ closeCam(); tick(.4); };
$("camShoot").onclick = shoot;
$("camPhone").onclick = phoneCamera;
$("camRetake").onclick = ()=>{ if(stream){ cam.classList.remove("result"); $("camLive").style.display="flex"; $("camDone").style.display="none"; $("camHint").textContent="Rest your phone on something steady, then tap the shutter"; } else openCam(); };
$("camSave").onclick = savePhoto;
$("camLen").onclick = ()=>{ camSecs = camSecs===2? 4 : camSecs===4? 8 : 2; $("camLen").textContent = camSecs+" s"; tick(.4); };
document.addEventListener("visibilitychange", ()=>{ if(document.hidden && stream && !shooting) closeCam(); });

// "Finding …" chip: tap to stop
$("findChip").onclick = ()=> clearTarget();

// Android back button (used by the app): close the top-most thing first
window.caelumBack = ()=>{
  if(cam.classList.contains("show")){ closeCam(); return true; }
  if($("sheet").classList.contains("show")){ closeSheet(); return true; }
  if($("start").classList.contains("show")){ $("start").classList.remove("show"); return true; }
  if(tab!=="sky"){ showTab("sky"); return true; }
  if(S.target){ clearTarget(); return true; }
  return false;
};
