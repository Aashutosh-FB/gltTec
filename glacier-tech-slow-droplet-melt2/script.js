const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', open);
});

document.querySelectorAll('.nav a').forEach(link => {
  link.addEventListener('click', () => nav.classList.remove('open'));
});

const sections = [...document.querySelectorAll('main section[id]')];
const links = [...document.querySelectorAll('.nav a')];

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
  });
}, { rootMargin: '-35% 0px -55% 0px' });

sections.forEach(section => observer.observe(section));

/* Glacier-only animation. All geometry is in the original 1919 × 820 artwork.
   The background and existing page styling remain the stationary base layer. */
(() => {
  const hero = document.querySelector('.hero');
  const background = hero?.querySelector('.hero-bg');
  const canvas = hero?.querySelector('.melt-canvas');
  if (!hero || !background || !canvas) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const image = new Image();
  image.decoding = 'async';
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
  const TAU = Math.PI * 2;
  const GRAVITY = 420; // Source pixels / second², shared by drops and spray.
  const CYCLE = 36;

  // Trace the individual ice silhouettes, including their existing icicles.
  // The gaps between shards, distant mountains and ocean are outside this mask.
  const outlines = [
    [[1178,145],[1192,148],[1208,174],[1220,194],[1255,239],[1286,283],[1313,329],[1319,348],[1311,370],[1306,382],[1307,360],[1285,377],[1273,393],[1265,411],[1266,434],[1257,415],[1247,413],[1229,425],[1217,441],[1212,478],[1206,447],[1198,399],[1191,350],[1188,298],[1185,247],[1184,207],[1179,188],[1171,200],[1167,251],[1161,281],[1158,325],[1151,361],[1163,392],[1161,402],[1152,406],[1146,397],[1150,368],[1145,341],[1138,335],[1128,350],[1112,411],[1105,475],[1110,493],[1104,506],[1094,508],[1085,545],[1083,574],[1094,622],[1095,645],[1083,658],[1077,682],[1057,690],[1000,687],[1001,678],[981,651],[973,644],[968,663],[960,648],[958,632],[944,627],[935,610],[945,573],[970,477],[991,406],[1003,368],[1002,337],[1013,309],[1038,283],[1058,265],[1093,248],[1126,213],[1150,179],[1166,157]],
    [[638,689],[650,678],[666,662],[690,649],[720,632],[744,607],[763,581],[783,561],[816,537],[832,517],[850,491],[883,462],[912,431],[947,405],[965,391],[972,387],[976,392],[969,419],[958,446],[947,479],[934,517],[925,548],[913,557],[910,585],[906,618],[906,644],[909,658],[905,666],[899,665],[896,660],[900,641],[898,616],[895,588],[889,569],[877,574],[865,588],[858,601],[849,606],[842,624],[842,646],[848,665],[857,677],[881,685],[898,691],[817,704],[738,703],[674,700]],
    [[1170,521],[1191,501],[1224,479],[1265,452],[1295,415],[1321,381],[1345,365],[1358,366],[1376,385],[1401,421],[1434,461],[1479,504],[1527,548],[1569,594],[1604,646],[1633,681],[1655,699],[1632,706],[1588,707],[1558,693],[1539,676],[1514,664],[1510,671],[1505,674],[1500,657],[1492,649],[1486,653],[1486,676],[1480,685],[1477,679],[1479,656],[1473,645],[1464,619],[1455,623],[1447,606],[1419,575],[1395,542],[1374,516],[1357,508],[1348,515],[1342,541],[1337,543],[1335,520],[1328,511],[1315,517],[1290,516],[1276,522],[1269,535],[1263,527],[1260,522],[1236,529],[1217,539],[1206,544],[1199,537],[1185,541],[1183,574],[1186,594],[1182,602],[1176,599],[1174,592],[1178,575],[1173,546],[1169,534]],
    [[1096,696],[1115,680],[1151,660],[1191,634],[1228,601],[1253,578],[1290,550],[1302,548],[1323,553],[1348,543],[1362,555],[1382,576],[1397,600],[1406,613],[1403,626],[1399,636],[1400,665],[1401,677],[1397,683],[1393,679],[1394,659],[1393,636],[1389,626],[1377,632],[1350,640],[1330,658],[1323,657],[1314,647],[1298,653],[1271,671],[1251,683],[1240,692],[1218,700],[1200,703],[1158,703],[1124,702]]
  ];

  const tips = [
    [1155,399,1.2], [1101,502,2.3], [1211,474,1.7], [1266,431,2.9],
    [1307,376,3.5], [902,660,1.6], [852,602,2.8], [968,658,3.7],
    [1180,597,1.5], [1268,532,3.1], [1340,540,2.4], [1397,679,1.9],
    [1483,679,2.7], [1507,669,3.3]
  ].map(([x, y, period], i) => ({ x, y, period, radius: [7.8,6,2.8,2.2,1.8,5.4,2.8,2.2,4.2,1.8,3.2,3,3.2,2][i], phase: (i * .381) % 1, count: 0 }));

  let gl, program, particleCanvas, ctx, maskPixels, maskCanvas, airCanvas;
  let width = 1, height = 1, scale = 1, offsetX = 0, offsetY = 0, dpr = 1;
  let ready = false, initialized = false, visible = true, failed = false, raf = 0, last = 0;
  let time = 0, accumulator = 0, melt = 0, front = 140;
  const drops = [], impacts = [], spray = [], chips = [], trailing = [];
  const locations = {};
  const impactUniform = new Float32Array(12 * 4);
  let chipClock = 0;

  function displacement(x, y) {
    if (!gl) return 0;
    return melt * (20 + 10 * Math.sin(x * .027) + 4 * Math.sin(x * .071)) *
      (1 - smooth(front - 45, front + 55, y)) * (1 - smooth(610, 699, y));
  }
  function anchor(tip) { return { x: tip.x, y: tip.y - (gl ? tip.radius * .85 + 1.5 : 0) + displacement(tip.x, tip.y) }; }
  function wetness(y) { return .13 + .87 * melt * (1 - smooth(front - 35, front + 65, y)); }
  function waterline(x) { return 700 + 3 * Math.sin(x * .021); }
  function iceAt(x, y) {
    // Invert the same local deformation used in the shader.
    let sy = y;
    for (let i = 0; i < 3; i++) sy = y - displacement(x, sy);
    const ix = Math.round(x), iy = Math.round(sy);
    const index = (iy * 1919 + ix) * 4;
    return ix >= 0 && ix < 1919 && iy >= 0 && iy < 820 && maskPixels[index] * maskPixels[index + 3] > 40800;
  }

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() { v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5); gl_Position = vec4(a_position, 0., 1.); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D u_image;
    uniform sampler2D u_mask;
    uniform sampler2D u_air;
    uniform vec2 u_resolution;
    uniform vec2 u_offset;
    uniform float u_scale;
    uniform float u_melt;
    uniform float u_front;
    uniform float u_time;
    uniform vec4 u_impacts[12];
    varying vec2 v_uv;
    const vec2 imageSize = vec2(1919., 820.);
    vec3 sampleImage(vec2 p) { return texture2D(u_image, p / imageSize).rgb; }
    float mask(vec2 p) { vec4 m = texture2D(u_mask, p / imageSize); return m.r * m.a; }
    float shift(vec2 p) {
      return u_melt * (20. + 10. * sin(p.x * .027) + 4. * sin(p.x * .071)) *
        (1. - smoothstep(u_front - 45., u_front + 55., p.y)) * (1. - smoothstep(610., 699., p.y));
    }
    void main() {
      vec2 p = (v_uv * u_resolution - u_offset) / u_scale;
      if (p.x < 625. || p.x > 1705. || p.y < 140. || p.y > 788.) discard;
      vec3 original = sampleImage(p);
      vec3 color = original;
      vec4 originalMask = texture2D(u_mask, p / imageSize);
      float oldMask = originalMask.a;
      float originalBulb = max(0., oldMask - originalMask.r);
      vec2 source = p;
      // Inverse mapping erodes the upper silhouette; the base stays anchored.
      for (int i = 0; i < 4; i++) source.y = p.y - shift(source);
      float newMask = mask(source);
      float activity = u_melt * (1. - smoothstep(u_front - 45., u_front + 55., p.y));
      float coverage = max(originalBulb, max(oldMask, newMask) * smoothstep(0., .012, u_melt));
      if (coverage > .001) {
        // Reveal adjacent dark air only inside pixels vacated by the ice.
        // This is a local texture deformation, never a second glacier image.
        vec3 clearAir = texture2D(u_air, p / imageSize).rgb;
        color = mix(original, clearAir, oldMask);
        float edge = newMask * (1. - mask(source + vec2(0., -2.5)));
        vec2 refractUV = source + vec2(sin(source.y * .085 + u_time * .8), cos(source.x * .07 + u_time * .6)) * activity * .65;
        vec3 ice = sampleImage(refractUV);
        float facets = smoothstep(.18, .5, ice.g - ice.r);
        ice += vec3(.012, .035, .045) * facets * activity * sin(source.y * .16 + source.x * .08 + u_time * .65);
        ice = mix(ice, clearAir, edge * activity * .18);
        ice += vec3(.15, .32, .4) * edge * activity * .3;
        color = mix(color, ice, newMask);
      }
      // Each refracted wave starts at a real particle's water collision.
      if (p.y > 687. && p.y < 788.) {
        vec2 bend = vec2(0.);
        float waveLight = 0.;
        float waterMask = smoothstep(688., 701., p.y) * (1. - smoothstep(767., 788., p.y));
        for (int i = 0; i < 12; i++) {
          vec4 hit = u_impacts[i];
          vec2 delta = (p - hit.xy) * vec2(1., 4.5);
          float distance = length(delta);
          float radius = hit.z * 31.;
          float ring = exp(-pow((distance - radius) / 4., 2.)) * exp(-hit.z * 1.35) * hit.w;
          float oscillation = sin((distance - radius) * .65);
          bend += vec2(delta.x / max(distance, 1.), oscillation) * ring * .95;
          waveLight += oscillation * ring * .055;
        }
        float amount = clamp(length(bend) + abs(waveLight), 0., 1.) * waterMask;
        color = mix(color, sampleImage(p + bend) + vec3(.2,.65,.9) * waveLight, amount);
        coverage = max(coverage, amount);
      }
      if (coverage < .001) discard;
      // Reproduce the existing hero-bg gradient under the untouched overlays.
      float cssX = ((v_uv.x * u_resolution.x - u_resolution.x * .5) / 1.01 + u_resolution.x * .5) / u_resolution.x;
      float shade = .16 * (1. - clamp(cssX / .55, 0., 1.));
      color = mix(color, vec3(1.,8.,18.) / 255., shade);
      gl_FragColor = vec4(color, coverage);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Glacier animation:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  function uploadTexture(unit, source) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  function setupGL() {
    const vs = compile(gl.VERTEX_SHADER, vertexSource), fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uploadTexture(0, image); uploadTexture(1, maskCanvas); uploadTexture(2, airCanvas);
    for (const key of ['image','mask','air','resolution','offset','scale','melt','front','time','impacts[0]']) locations[key] = gl.getUniformLocation(program, 'u_' + key);
    gl.uniform1i(locations.image, 0); gl.uniform1i(locations.mask, 1); gl.uniform1i(locations.air, 2);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width; height = rect.height;
    // Bound raster work to ~2M pixels, including on very wide/retina screens.
    dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2000000 / (width * height)));
    const cover = Math.max(width / 1919, height / 820);
    const position = getComputedStyle(background).backgroundPosition.split(' ');
    const px = parseFloat(position[0]) / 100, py = parseFloat(position[1]) / 100;
    scale = cover * 1.01;
    offsetX = (width - 1919 * cover) * px * 1.01 - width * .005;
    offsetY = (height - 820 * cover) * py * 1.01 - height * .005;
    for (const layer of [canvas, particleCanvas]) {
      layer.width = Math.max(1, Math.round(width * dpr));
      layer.height = Math.max(1, Math.round(height * dpr));
    }
    if (gl && !gl.isContextLost()) gl.viewport(0, 0, canvas.width, canvas.height);
    if (ready) render();
  }

  function impact(drop) {
    const y = waterline(drop.x), strength = clamp(drop.r / 2.3, .45, 1.8);
    if (impacts.length >= 12) impacts.shift();
    impacts.push({ x: drop.x, y, age: 0, strength });
    for (let i = 0; i < 5; i++) {
      if (spray.length >= 80) break;
      const angle = (i / 4) * Math.PI;
      spray.push({ x: drop.x, y, vx: Math.cos(angle) * (19 + i * 4) * strength, vy: -Math.sin(angle) * 42 * strength - 13, age: 0, life: .48, r: .65 + (i % 2) * .3, water: y });
    }
  }
  function emit(tip, a, size) {
    if (drops.length >= 64) return;
    const flow = wetness(tip.y);
    drops.push({ x: a.x, y: a.y + size + 4 + flow * 10, vx: Math.sin(tip.count * 2.4) * 1.5, vy: 8, r: size, age: 0, runoff: false });
    // An occasional small trailing bead catches and merges into the main drop.
    if (tip.count % 3 === 0 && trailing.length < 14) trailing.push({ x: a.x + .35, y: a.y + size * .5 + 4 + flow * 10, r: size * .52, delay: .15 });
    tip.count++;
  }
  function step(dt) {
    time += dt;
    const phase = time % CYCLE;
    melt = phase < 24 ? ease(phase / 24) : 1 - ease((phase - 24) / 12);
    front = 142 + 566 * (phase < 24 ? smooth(0, 24, phase) : 1 - smooth(24, 36, phase));
    for (const tip of tips) {
      tip.phase += dt * (.36 + wetness(tip.y) * .8) / tip.period;
      if (tip.phase >= 1) { tip.phase %= 1; emit(tip, anchor(tip), 1.65 + wetness(tip.y) * 1.1 + tip.radius * .12); }
    }
    for (let i = trailing.length - 1; i >= 0; i--) {
      const p = trailing[i];
      if ((p.delay -= dt) <= 0) {
        if (drops.length < 64) drops.push({ x: p.x, y: p.y, vx: 0, vy: 110, r: p.r, age: 0, runoff: false });
        trailing.splice(i, 1);
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i];
      p.age += dt;
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // A drop intercepted by another shard becomes surface runoff, then
      // detaches again at that shard's edge instead of falling through ice.
      if (p.age > .09 && iceAt(p.x, p.y)) {
        p.runoff = true; p.vy = 29;
        p.x += (p.x < 1150 ? -1 : 1) * 18 * dt;
      } else if (p.runoff) { p.runoff = false; p.vy = 12; }
      if (p.y >= waterline(p.x)) { impact(p); drops.splice(i, 1); }
      else if (p.age > 12) drops.splice(i, 1);
    }
    // Volume and momentum are conserved when nearby airborne droplets merge.
    for (let i = 0; i < drops.length; i++) for (let j = drops.length - 1; j > i; j--) {
      const a = drops[i], b = drops[j];
      if (a.runoff || b.runoff || Math.hypot(a.x - b.x, a.y - b.y) > (a.r + b.r) * .85) continue;
      const va = a.r ** 3, vb = b.r ** 3, volume = va + vb;
      a.x = (a.x * va + b.x * vb) / volume; a.y = (a.y * va + b.y * vb) / volume;
      a.vx = (a.vx * va + b.vx * vb) / volume; a.vy = (a.vy * va + b.vy * vb) / volume;
      a.r = Math.cbrt(volume); drops.splice(j, 1);
    }
    for (let i = impacts.length - 1; i >= 0; i--) if ((impacts[i].age += dt) > 2.8) impacts.splice(i, 1);
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i]; p.age += dt; p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > p.life || p.y > p.water + .6) spray.splice(i, 1);
    }
    chipClock += dt;
    if (chipClock > 3.6 && melt > .25) {
      chipClock = 0;
      const activeTips = tips.filter(tip => wetness(tip.y) > .28);
      const tip = activeTips[Math.floor(time * .7) % activeTips.length];
      const a = tip && anchor(tip);
      if (a && chips.length < 8) chips.push({ x: a.x, y: a.y + 6, vx: Math.sin(time) * 8, vy: 4, age: 0, r: 2.4, angle: time });
    }
    for (let i = chips.length - 1; i >= 0; i--) {
      const p = chips[i]; p.age += dt; p.angle += dt * 1.2;
      if (p.floating) { p.x += Math.sin(time + i) * dt * 2; p.y = waterline(p.x) + Math.sin(time * 1.2 + i) * .6; }
      else {
        p.vy += GRAVITY * .55 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (iceAt(p.x, p.y)) { p.vy = 22; p.x += dt * 20; }
        if (p.y >= waterline(p.x)) { impact(p); p.floating = true; p.age = 0; }
      }
      if (p.age > (p.floating ? 4 : 10)) chips.splice(i, 1);
    }
  }

  // Cached translucent sprites keep mist and refractive beads inexpensive.
  function makeSprite(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const c2 = c.getContext('2d'), g = c2.createRadialGradient(size * .38, size * .3, 0, size * .5, size * .5, size * .5);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    c2.fillStyle = g; c2.fillRect(0, 0, size, size); return c;
  }
  const bead = makeSprite(32, [[0,'rgba(245,254,255,.98)'],[.16,'rgba(218,249,255,.86)'],[.34,'rgba(47,163,210,.28)'],[.63,'rgba(9,64,96,.24)'],[.82,'rgba(154,228,255,.72)'],[1,'rgba(32,136,184,0)']]);
  const mist = makeSprite(128, [[0,'rgba(154,211,233,.11)'],[.35,'rgba(113,191,221,.055)'],[1,'rgba(82,165,205,0)']]);

  function drawBead(x, y, r, stretch, opacity = 1) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(bead, x - r, y - r * stretch, r * 2, r * stretch * 2);
  }
  function paintParticles() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.save(); ctx.beginPath(); ctx.rect(625, 140, 1080, 648); ctx.clip();
    // Cold mist is confined to the ice base and the nearby impact surface.
    for (let i = 0; i < 9; i++) {
      const phase = time * .13 + i * 1.7;
      const x = 895 + i * 75 + Math.sin(phase) * 16, y = 674 + Math.cos(phase * .7) * 7;
      ctx.globalAlpha = .18 + .3 * melt;
      ctx.drawImage(mist, x - 51, y - 15, 102, 30);
    }
    for (const hit of impacts) {
      const fade = Math.exp(-hit.age * 1.45) * Math.min(1, hit.age * 18) * hit.strength;
      for (let ring = 0; ring < 3; ring++) {
        const age = hit.age - ring * .12;
        if (age <= 0) continue;
        const radius = 2 + age * (28 - ring * 2);
        ctx.globalAlpha = fade * (.38 - ring * .075);
        ctx.strokeStyle = '#91dff5'; ctx.lineWidth = .75;
        ctx.beginPath(); ctx.ellipse(hit.x, hit.y + ring * .8, radius, radius * .17, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade * .13; ctx.strokeStyle = '#04354b';
        ctx.beginPath(); ctx.ellipse(hit.x, hit.y + 1.2 + ring * .8, radius + 1.1, radius * .18, 0, 0, TAU); ctx.stroke();
      }
      // The central crown collapses into the same water plane in ~250 ms.
      if (hit.age < .28) {
        const h = Math.sin(hit.age / .28 * Math.PI) * 4.8 * hit.strength;
        const r = 1.5 + hit.age * 19;
        ctx.globalAlpha = (1 - hit.age / .28) * .48;
        ctx.strokeStyle = '#c4f3ff'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(hit.x - r, hit.y); ctx.quadraticCurveTo(hit.x - r * .7, hit.y - h, hit.x - r * .4, hit.y - h * .55);
        ctx.quadraticCurveTo(hit.x, hit.y + 1, hit.x + r * .4, hit.y - h * .55); ctx.quadraticCurveTo(hit.x + r * .7, hit.y - h, hit.x + r, hit.y); ctx.stroke();
      }
    }
    for (const tip of tips) {
      const a = anchor(tip), wet = wetness(tip.y), grow = smooth(.12, .94, tip.phase);
      const neck = 4 + wet * 10, y = a.y + neck * grow;
      const size = .35 + grow * (1.3 + wet * 1.1 + tip.radius * .12);
      // A tapered extension joins the original icicle to the growing bead.
      ctx.globalAlpha = .22 + wet * .35; ctx.fillStyle = '#9de7ff';
      ctx.beginPath(); ctx.moveTo(a.x - 1.8, a.y - 3); ctx.quadraticCurveTo(a.x - .7, y - 3, a.x - .4, y);
      ctx.lineTo(a.x + .4, y); ctx.quadraticCurveTo(a.x + .7, y - 3, a.x + 1.8, a.y - 3); ctx.fill();
      drawBead(a.x, y + size, size, 1 + grow * .8, .7);
    }
    for (const p of drops) {
      const stretch = p.runoff ? 2.4 : 1 + clamp(p.vy / 320, 0, 1.5);
      // Reflections flatten and brighten as a falling bead approaches water.
      const distance = waterline(p.x) - p.y;
      if (distance < 85) drawBead(p.x, waterline(p.x) + distance * .1 + 2, p.r * (1.1 + distance * .016), .24, (1 - distance / 85) * .24);
      drawBead(p.x, p.y, p.r / Math.sqrt(stretch), stretch, p.runoff ? .42 : .9);
    }
    for (const p of spray) drawBead(p.x, p.y, p.r, 1.4, (1 - p.age / p.life) * .7);
    for (const p of chips) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.globalAlpha = p.floating ? .6 * (1 - p.age / 4) : .68;
      ctx.fillStyle = '#b9eeff'; ctx.strokeStyle = '#f0fcff'; ctx.lineWidth = .5;
      ctx.beginPath(); ctx.moveTo(-p.r, -p.r * .5); ctx.lineTo(p.r * .6, -p.r); ctx.lineTo(p.r, p.r * .7); ctx.lineTo(-p.r * .4, p.r); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // Fine fissures follow existing facets and open only behind the melt front.
    const cracks = [[1167,239,1145,278,1149,290,1128,321],[1053,410,1045,434,1050,443,1035,467],[1357,438,1370,456,1364,461,1387,487]];
    for (let i = 0; i < cracks.length; i++) {
      const points = cracks[i], wet = wetness(points[1]) - .13;
      ctx.globalAlpha = wet * (.14 + .08 * Math.sin(time * .8 + i)); ctx.strokeStyle = '#e3faff'; ctx.lineWidth = .65;
      ctx.beginPath(); points.forEach((_, j) => { if (j % 2) return; const x = points[j], y = points[j + 1] + displacement(x, points[j + 1]); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function render() {
    if (gl && !gl.isContextLost()) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(locations.resolution, width, height); gl.uniform2f(locations.offset, offsetX, offsetY);
      gl.uniform1f(locations.scale, scale); gl.uniform1f(locations.melt, melt); gl.uniform1f(locations.front, front); gl.uniform1f(locations.time, time);
      impactUniform.fill(0);
      impacts.forEach((hit, i) => impactUniform.set([hit.x, hit.y, hit.age, hit.strength], i * 4));
      gl.uniform4fv(locations['impacts[0]'], impactUniform);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    paintParticles();
  }
  function running() { return ready && visible && !document.hidden && !motion.matches && !failed; }
  function frame(now) {
    raf = 0;
    if (!running()) return;
    accumulator += last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    while (accumulator >= 1 / 120) { step(1 / 120); accumulator -= 1 / 120; }
    render(); raf = requestAnimationFrame(frame);
  }
  function syncPlayback() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (running()) raf = requestAnimationFrame(frame);
    if (motion.matches && ready) {
      if (gl && !gl.isContextLost()) gl.clear(gl.COLOR_BUFFER_BIT);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    }
  }
  function buildAirTexture() {
    // Extend the nearest visible air behind the ice once at startup. Sampling
    // local sky preserves its blue glow as the silhouette recedes, without
    // introducing a dark cutout or touching any surrounding background pixel.
    const plate = document.createElement('canvas'); plate.width = 1919; plate.height = 820;
    const context = plate.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 1919, 820), count = 1919 * 820;
    // Include luminous edge fragments that protrude beyond the traced contour.
    // The broad guide only admits ice-colored pixels immediately beside a shard.
    const guide = document.createElement('canvas'); guide.width = 1919; guide.height = 820;
    const edge = guide.getContext('2d'); edge.strokeStyle = '#fff'; edge.lineWidth = 64; edge.lineJoin = 'round';
    for (const polygon of outlines) {
      edge.beginPath(); polygon.forEach(([x,y], i) => i ? edge.lineTo(x,y) : edge.moveTo(x,y)); edge.closePath(); edge.stroke();
    }
    const guidePixels = edge.getImageData(0, 0, 1919, 820).data;
    for (let i = 0; i < 1919 * 630; i++) {
      const at = i * 4;
      if (guidePixels[at + 3] && maskPixels[at + 3] < 254) {
        const ice = smooth(38, 85, pixels.data[at + 1]) * smooth(75, 150, pixels.data[at + 2]);
        const alpha = Math.round(ice * guidePixels[at + 3]);
        if (alpha > maskPixels[at + 3]) {
          maskPixels[at] = maskPixels[at + 1] = maskPixels[at + 2] = 255;
          maskPixels[at + 3] = alpha;
        }
      }
    }
    maskCanvas.getContext('2d').putImageData(new ImageData(maskPixels, 1919, 820), 0, 0);
    const nearest = new Int32Array(count), distance = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const at = i * 4;
      // Reject bright ice just beyond the hand-traced outline as an air seed.
      const brightIce = i < 1919 * 695 && pixels.data[at + 1] > 58 && pixels.data[at + 2] > 95;
      nearest[i] = i; distance[i] = maskPixels[at + 3] > 1 || brightIce ? 100000 : 0;
    }
    // Two linear distance passes find a nearby pixel outside every ice shard.
    for (let i = 0; i < count; i++) {
      if (i % 1919 && distance[i - 1] + 1 < distance[i]) { distance[i] = distance[i - 1] + 1; nearest[i] = nearest[i - 1]; }
      if (i >= 1919 && distance[i - 1919] + 1 < distance[i]) { distance[i] = distance[i - 1919] + 1; nearest[i] = nearest[i - 1919]; }
    }
    for (let i = count - 1; i >= 0; i--) {
      if (i % 1919 < 1918 && distance[i + 1] + 1 < distance[i]) { distance[i] = distance[i + 1] + 1; nearest[i] = nearest[i + 1]; }
      if (i + 1919 < count && distance[i + 1919] + 1 < distance[i]) { distance[i] = distance[i + 1919] + 1; nearest[i] = nearest[i + 1919]; }
    }
    for (let i = 0; i < count; i++) if (distance[i]) {
      const target = i * 4, source = nearest[i] * 4;
      for (let c = 0; c < 3; c++) pixels.data[target + c] = pixels.data[source + c];
    }
    context.putImageData(pixels, 0, 0);
    const softened = document.createElement('canvas'); softened.width = 1919; softened.height = 820;
    const blend = softened.getContext('2d'); blend.filter = 'blur(3px)'; blend.drawImage(plate, 0, 0);
    return softened;
  }
  function initialize() {
    if (initialized || failed) return;
    initialized = true;
    maskCanvas = document.createElement('canvas'); maskCanvas.width = 1919; maskCanvas.height = 820;
    const mask = maskCanvas.getContext('2d');
    mask.fillStyle = mask.strokeStyle = '#fff';
    mask.lineWidth = 12; mask.lineJoin = 'round'; mask.filter = 'blur(.7px)';
    for (const polygon of outlines) {
      mask.beginPath(); polygon.forEach(([x,y], i) => i ? mask.lineTo(x,y) : mask.moveTo(x,y)); mask.closePath(); mask.fill(); mask.stroke();
    }
    mask.filter = 'none';
    // Preserve the small open-water/air pocket inside the left shard.
    mask.globalCompositeOperation = 'destination-out';
    mask.beginPath();
    [[838,611],[824,630],[807,645],[796,660],[798,672],[815,682],[839,680],[834,663],[832,645]].forEach(([x,y], i) => i ? mask.lineTo(x,y) : mask.moveTo(x,y));
    mask.closePath(); mask.fill();
    // Keep alpha as the original silhouette; red removes the photographed
    // bulbs so their replacements can genuinely grow and detach.
    mask.globalCompositeOperation = 'source-atop';
    mask.fillStyle = '#000';
    for (const tip of tips) {
      mask.beginPath(); mask.ellipse(tip.x, tip.y, tip.radius + 2.5, tip.radius * .85 + 2.5, 0, 0, TAU); mask.fill();
    }
    maskPixels = mask.getImageData(0, 0, 1919, 820).data;
    try { airCanvas = buildAirTexture(); } catch { airCanvas = image; }
    particleCanvas = document.createElement('canvas'); particleCanvas.className = 'melt-canvas melt-particles';
    particleCanvas.setAttribute('aria-hidden', 'true'); canvas.after(particleCanvas);
    ctx = particleCanvas.getContext('2d');
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, depth: false, stencil: false, powerPreference: 'low-power' });
    try {
      if (gl && !setupGL()) { failed = true; particleCanvas.remove(); return; }
    } catch {
      // Local-file/security restrictions can disallow image textures.
      gl = null; canvas.style.display = 'none';
    }
    // Canvas particles still work when WebGL is unavailable; the photo remains.
    ready = true; resize();
    new ResizeObserver(resize).observe(hero);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; syncPlayback(); }).observe(hero);
    syncPlayback();
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); ready = false; syncPlayback(); });
  canvas.addEventListener('webglcontextrestored', () => { failed = !setupGL(); ready = !failed; resize(); syncPlayback(); });
  document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', () => { if (!motion.matches && image.complete && image.naturalWidth) initialize(); syncPlayback(); });
  image.addEventListener('load', () => { if (!motion.matches) initialize(); }, { once: true });
  image.src = 'justWebsiteBG.png';
})();
