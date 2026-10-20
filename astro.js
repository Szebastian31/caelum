// Astronomy: everything calculated on-device for the given minute.
const D2R = Math.PI/180, R2D = 180/Math.PI;
const norm360 = a => ((a%360)+360)%360;

function jd(date){ return date.getTime()/86400000 + 2440587.5; }
function daysJ2000(date){ return jd(date) - 2451545.0; }
function lstDeg(date, lon){ const d = daysJ2000(date); return norm360(280.46061837 + 360.98564736629*d + lon); }
function obliq(d){ return (23.439 - 0.0000004*d)*D2R; }

// Approximate precession from J2000 to date (good to a few arcsec for our purposes)
function precess(raDeg, decDeg, years){
  const a = raDeg*D2R, dd = decDeg*D2R;
  const dRa = (3.075 + 1.336*Math.sin(a)*Math.tan(dd))*15/3600*years;
  const dDec = 20.04*Math.cos(a)/3600*years;
  return [norm360(raDeg + dRa), decDeg + dDec];
}

// RA/Dec (deg) -> Alt/Az (deg, az from north clockwise)
function toHorizon(raDeg, decDeg, lst, lat){
  const H = (lst - raDeg)*D2R, d = decDeg*D2R, p = lat*D2R;
  const sinAlt = Math.sin(p)*Math.sin(d) + Math.cos(p)*Math.cos(d)*Math.cos(H);
  const alt = Math.asin(Math.max(-1,Math.min(1,sinAlt)));
  const az = Math.atan2(-Math.sin(H)*Math.cos(d), Math.cos(p)*Math.sin(d) - Math.sin(p)*Math.cos(d)*Math.cos(H));
  return [alt*R2D, norm360(az*R2D)];
}

// world vector: x east, y north, z up
function altAzVec(alt, az){
  const a = alt*D2R, z = az*D2R;
  return [Math.cos(a)*Math.sin(z), Math.cos(a)*Math.cos(z), Math.sin(a)];
}

function eclToEq(lon, lat, eps){
  const l = lon*D2R, b = lat*D2R;
  const x = Math.cos(b)*Math.cos(l);
  const y = Math.cos(eps)*Math.cos(b)*Math.sin(l) - Math.sin(eps)*Math.sin(b);
  const z = Math.sin(eps)*Math.cos(b)*Math.sin(l) + Math.cos(eps)*Math.sin(b);
  return [norm360(Math.atan2(y,x)*R2D), Math.asin(z)*R2D];
}

function sunPos(date){
  const d = daysJ2000(date);
  const g = norm360(357.529 + 0.98560028*d)*D2R;
  const q = norm360(280.459 + 0.98564736*d);
  const L = q + 1.915*Math.sin(g) + 0.020*Math.sin(2*g);
  const [ra,dec] = eclToEq(L, 0, obliq(d));
  return {ra, dec, lon:L};
}

function moonPos(date){
  const d = daysJ2000(date);
  const L = norm360(218.316 + 13.176396*d);
  const M = norm360(134.963 + 13.064993*d)*D2R;
  const F = norm360(93.272 + 13.229350*d)*D2R;
  const D = norm360(297.850 + 12.190749*d)*D2R;
  const Ms = norm360(357.529 + 0.98560028*d)*D2R;
  const lon = L + 6.289*Math.sin(M) + 1.274*Math.sin(2*D - M) + 0.658*Math.sin(2*D) + 0.214*Math.sin(2*M) - 0.186*Math.sin(Ms);
  const lat = 5.128*Math.sin(F);
  const [ra,dec] = eclToEq(lon, lat, obliq(d));
  const sun = sunPos(date);
  const elong = norm360(lon - sun.lon);            // 0 new, 180 full
  const illum = (1 - Math.cos(elong*D2R))/2;
  return {ra, dec, elong, illum};
}

// Keplerian elements (JPL approx, J2000 + rate per century): a, e, I, L, varpi, Omega
const ELEM = {
  mercury:[[0.38709927,0.20563593,7.00497902,252.25032350,77.45779628,48.33076593],[0.00000037,0.00001906,-0.00594749,149472.67411175,0.16047689,-0.12534081]],
  venus:[[0.72333566,0.00677672,3.39467605,181.97909950,131.60246718,76.67984255],[0.00000390,-0.00004107,-0.00078890,58517.81538729,0.00268329,-0.27769418]],
  earth:[[1.00000261,0.01671123,-0.00001531,100.46457166,102.93768193,0],[0.00000562,-0.00004392,-0.01294668,35999.37244981,0.32327364,0]],
  mars:[[1.52371034,0.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],[0.00001847,0.00007882,-0.00813131,19140.30268499,0.44441088,-0.29257343]],
  jupiter:[[5.20288700,0.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-0.00011607,-0.00013253,-0.00183714,3034.74612775,0.21252668,0.20469106]],
  saturn:[[9.53667594,0.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-0.00125060,-0.00050991,0.00193609,1222.49362201,-0.41897216,-0.28867794]],
};
function helio(name, T){
  const [e0, r] = ELEM[name];
  const [a,e,I,L,w,O] = e0.map((v,i)=>v + r[i]*T);
  const M = norm360(L - w)*D2R, om = (w - O)*D2R, Ir = I*D2R, Or = O*D2R;
  let E = M + e*Math.sin(M);
  for(let i=0;i<6;i++) E = E - (E - e*Math.sin(E) - M)/(1 - e*Math.cos(E));
  const xp = a*(Math.cos(E) - e), yp = a*Math.sqrt(1-e*e)*Math.sin(E);
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Or), sO = Math.sin(Or), cI = Math.cos(Ir), sI = Math.sin(Ir);
  return [
    (co*cO - so*sO*cI)*xp + (-so*cO - co*sO*cI)*yp,
    (co*sO + so*cO*cI)*xp + (-so*sO + co*cO*cI)*yp,
    (so*sI)*xp + (co*sI)*yp
  ];
}
function planetPos(name, date){
  const d = daysJ2000(date), T = d/36525;
  const p = helio(name,T), e = helio("earth",T);
  const x = p[0]-e[0], y = p[1]-e[1], z = p[2]-e[2];
  const dist = Math.hypot(x,y,z);
  const lon = norm360(Math.atan2(y,x)*R2D), lat = Math.asin(z/dist)*R2D;
  const [ra,dec] = eclToEq(lon, lat, obliq(d));
  // rough apparent magnitude (ignores phase and rings, so ±0.5)
  const r = Math.hypot(...p);
  const H = {mercury:-0.4,venus:-4.4,mars:-1.52,jupiter:-9.4,saturn:-8.9}[name];
  const mag = H + 5*Math.log10(r*dist);
  return {ra, dec, dist, mag};
}

// Milky Way: points along the galactic plane, real geometry, brighter toward the centre
function galToEq(l, b){
  const aN = 192.85948*D2R, dN = 27.12825*D2R, lN = 122.93192*D2R;
  const lr = l*D2R, br = b*D2R;
  const sd = Math.sin(dN)*Math.sin(br) + Math.cos(dN)*Math.cos(br)*Math.cos(lN - lr);
  const ra = aN + Math.atan2(Math.cos(br)*Math.sin(lN - lr), Math.cos(dN)*Math.sin(br) - Math.sin(dN)*Math.cos(br)*Math.cos(lN - lr));
  return [norm360(ra*R2D), Math.asin(sd)*R2D];
}
function makeMilkyWay(){
  let s = 7; const rnd = ()=> (s = (s*16807)%2147483647)/2147483647;
  const pts = [];
  for(let i=0;i<900;i++){
    const l = rnd()*360;
    const g = (rnd()+rnd()+rnd()-1.5)*2;               // ~gaussian
    const width = 6 + 6*Math.cos(l*D2R)**2;             // wider near centre/anticentre
    const b = g*width*0.6;
    const bright = 0.35 + 0.65*Math.max(0,Math.cos(l*D2R))**2 + (Math.abs(l-80)<20?0.25:0);
    const [ra,dec] = galToEq(l,b);
    pts.push({ra,dec,r:2+rnd()*5,a:bright*(0.4+rnd()*0.6)});
  }
  return pts;
}

// Sample altitude over the next 24h to find rise/set times
function riseSet(getRaDec, start, lat, lon){
  let prev = null, rise = null, set = null, maxAlt = -90, maxT = null;
  for(let m=0;m<=1440;m+=10){
    const t = new Date(start.getTime() + m*60000);
    const [ra,dec] = getRaDec(t);
    const [alt] = toHorizon(ra, dec, lstDeg(t,lon), lat);
    if(alt > maxAlt){ maxAlt = alt; maxT = t; }
    if(prev !== null){
      if(prev < 0 && alt >= 0 && !rise) rise = t;
      if(prev >= 0 && alt < 0 && !set) set = t;
    }
    prev = alt;
  }
  return {rise, set, maxAlt, maxT};
}

function compass(az){
  return ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(az/22.5)%16];
}
