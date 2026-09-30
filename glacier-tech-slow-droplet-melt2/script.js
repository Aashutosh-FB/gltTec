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

const hero = document.querySelector('.hero');
let raf;
hero?.addEventListener('mousemove', (e) => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const x = (e.clientX / window.innerWidth - .5) * 8;
    const y = (e.clientY / window.innerHeight - .5) * 4;
    document.querySelector('.hero-bg').style.transform = `scale(1.025) translate(${x}px, ${y}px)`;
  });
});
hero?.addEventListener('mouseleave', () => {
  document.querySelector('.hero-bg').style.transform = 'scale(1.01)';
});


/* =========================================================
   GLACIER MELT ENGINE — SLOW DROPLET MELT
   The supplied artwork stays locked to the CSS background.

   The glacier does NOT slide downward as one block. Instead:
   - the lower ice edge slowly recedes upward;
   - sparse hanging droplets form at the active melt edge;
   - droplets stretch, detach and fall into the water;
   - the cycle gently reforms the glacier for a seamless loop.
   ========================================================= */

(() => {
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('.melt-canvas');
  if (!hero || !canvas) return;

  const img = new Image();
  img.src = 'justWebsiteBG.png';
  img.decoding = 'async';

  // Slower, eye-friendly cinematic rhythm: 0.3s intact hold, ~11.2s melt,
  // a short watery settle, then a gentle reform. The loop is infinite.
  const cycleLength = 16800;
  const holdTime = 300;
  const meltTime = 11200;
  const waterTime = 900;
  const resetTime = cycleLength - holdTime - meltTime - waterTime;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  const smootherstep = (x) => {
    const t = clamp01(x);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  };

  function meltProgress(now) {
    const t = now % cycleLength;

    if (t < holdTime) return 0.0;

    if (t < holdTime + meltTime) {
      const raw = (t - holdTime) / meltTime;
      // Starts softly, moves steadily through the middle, then slows down.
      return smootherstep(raw);
    }

    if (t < holdTime + meltTime + waterTime) return 1.0;

    // Re-form from the inside of the loop with the same smooth easing.
    const raw = (t - holdTime - meltTime - waterTime) / resetTime;
    return 1.0 - smootherstep(raw);
  }

  function initWebGL() {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    }) || canvas.getContext('experimental-webgl');

    if (!gl) {
      canvas.style.display = 'none';
      return;
    }

    const vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      varying vec2 v_uv;

      void main() {
        v_uv = a_uv;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision highp float;

      uniform sampler2D u_texture;
      uniform float u_time;
      uniform float u_melt;
      uniform vec2 u_resolution;
      uniform vec2 u_imageResolution;
      varying vec2 v_uv;

      float hash21(vec2 p){
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);

        float a = hash21(i);
        float b = hash21(i + vec2(1.0,0.0));
        float c = hash21(i + vec2(0.0,1.0));
        float d = hash21(i + vec2(1.0,1.0));

        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
      }

      vec4 safeSample(vec2 uv){
        return texture2D(u_texture, clamp(uv, 0.001, 0.999));
      }

      // Match CSS background-size: cover exactly. This is what keeps the
      // animated glacier sitting precisely over the supplied hero artwork.
      vec2 coverUV(vec2 screenUV){
        vec2 rendered = u_imageResolution * max(
          u_resolution.x / u_imageResolution.x,
          u_resolution.y / u_imageResolution.y
        );
        vec2 crop = (rendered - u_resolution) * 0.5;
        return clamp((screenUV * u_resolution + crop) / rendered, 0.0, 1.0);
      }

      float iceMask(vec3 c, vec2 uv){
        float mx = max(c.r, max(c.g, c.b));
        float mn = min(c.r, min(c.g, c.b));
        float sat = (mx - mn) / max(mx, 0.001);

        // Only the luminous central glacier is eligible. The surrounding
        // mountain walls, dark sky and ocean stay locked in place.
        float region =
          smoothstep(0.25,0.30,uv.x) *
          (1.0 - smoothstep(0.84,0.90,uv.x)) *
          smoothstep(0.10,0.16,uv.y) *
          (1.0 - smoothstep(0.84,0.89,uv.y));

        float blue = smoothstep(0.22, 0.43, c.b);
        float cyan = smoothstep(0.08, 0.30, c.g - c.r);
        float bright = smoothstep(0.20, 0.58, mx);
        float chroma = smoothstep(0.12, 0.34, sat);

        return region * blue * cyan * bright * chroma;
      }

      float segmentDistance(vec2 p, vec2 a, vec2 b){
        vec2 pa = p - a;
        vec2 ba = b - a;
        float denom = max(dot(ba, ba), 0.00001);
        float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
        return length(pa - ba * h);
      }

      void main(){
        vec2 screenUV = v_uv;
        vec2 uv = coverUV(screenUV);
        vec4 base = safeSample(uv);
        float baseIce = iceMask(base.rgb, uv);

        // ===============================================================
        // 1. SLOW NATURAL RECESSION OF THE LOWER GLACIER
        // ===============================================================
        // A moving melt front rises through the ice, but its height varies
        // per column so the glacier breaks down in an irregular, organic way.
        float broadNoise = noise(vec2(uv.x * 10.0, 2.7));
        float fineNoise  = noise(vec2(uv.x * 31.0, uv.y * 7.0));
        float driftNoise = noise(vec2(uv.x * 6.0, uv.y * 2.0 + u_time * 0.025));

        float meltCurve = smootherstep(u_melt);
        float activeMelt = smoothstep(0.05, 0.30, u_melt);

        float front = 0.145 + 0.565 * meltCurve;
        front += (broadNoise - 0.50) * 0.13;
        front += (fineNoise - 0.50) * 0.055;
        front += sin(uv.x * 24.0 + driftNoise * 6.0) * 0.012 * meltCurve;

        // Only remove ice that has reached the moving front. This avoids the
        // old "whole glacier slides into the water" look.
        float meltEdge = 1.0 - smoothstep(front - 0.035, front + 0.040, uv.y);
        float textureBreakup = smoothstep(0.18, 0.68, noise(vec2(uv.x * 48.0, uv.y * 18.0)));
        textureBreakup = mix(0.76, 1.0, textureBreakup);

        float removeMask = baseIce * meltEdge * activeMelt * textureBreakup;
        removeMask = clamp(removeMask, 0.0, 0.94);

        // Pick nearby non-ice pixels to reveal underneath the disappearing ice.
        // This means the original background, not a second full image, shows
        // through as the glacier recedes.
        vec2 upUV    = uv + vec2(0.0, 0.095);
        vec2 leftUV  = uv + vec2(-0.105, 0.012);
        vec2 rightUV = uv + vec2( 0.105, 0.012);

        vec4 upBg    = safeSample(upUV);
        vec4 leftBg  = safeSample(leftUV);
        vec4 rightBg = safeSample(rightUV);

        float upGood    = 1.0 - iceMask(upBg.rgb, upUV);
        float leftGood  = 1.0 - iceMask(leftBg.rgb, leftUV);
        float rightGood = 1.0 - iceMask(rightBg.rgb, rightUV);
        float bgWeight = max(upGood + leftGood + rightGood, 0.001);

        vec3 revealedBg = (
          upBg.rgb * upGood +
          leftBg.rgb * leftGood +
          rightBg.rgb * rightGood
        ) / bgWeight;

        // ===============================================================
        // 2. SPARSE MELT DROPLETS — THE MAIN VISUAL DETAIL
        // ===============================================================
        // Work in narrow vertical columns. Only a fraction of columns get a
        // droplet, which makes the melt feel like real ice drip rather than
        // a broad stream of blue pixels.
        float cellCount = 52.0;
        float cell = floor(uv.x * cellCount);
        float seedA = hash21(vec2(cell, 17.31));
        float seedB = hash21(vec2(cell, 41.77));
        float seedC = hash21(vec2(cell, 83.19));

        float selected = smoothstep(0.62, 0.82, seedA);
        float cellCenter = (cell + 0.5) / cellCount;
        float centerX = cellCenter + (seedB - 0.5) * (0.42 / cellCount);

        // The drop attaches just beneath the local melt front.
        float anchorY = front - 0.006 - seedC * 0.012;
        vec2 anchorUV = vec2(centerX, anchorY + 0.025);
        float anchorIce = iceMask(safeSample(anchorUV).rgb, anchorUV);

        // Five slow droplet events happen across one melt cycle. Each column
        // has its own phase, so the drips never look synchronized.
        float phase = fract(u_melt * 5.0 + seedB * 1.73 + seedC * 0.19);
        float appear = smoothstep(0.02, 0.13, phase);
        float vanish = 1.0 - smoothstep(0.74, 0.96, phase);
        float dropLife = appear * vanish * selected * anchorIce * activeMelt;

        float fall = smoothstep(0.11, 0.77, phase);
        float dropLength = mix(0.028, 0.105, seedA);
        float tipRise = mix(0.005, 0.012, seedC);
        float tipY = anchorY - dropLength * fall;
        float sway = sin(u_time * (0.75 + seedC * 0.45) + cell * 2.8) * 0.0045 * fall;
        vec2 tip = vec2(centerX + sway, tipY);

        float threadWidth = mix(0.0018, 0.0044, seedB);
        float threadDist = segmentDistance(uv, vec2(centerX, anchorY), tip);
        float thread = 1.0 - smoothstep(threadWidth, threadWidth + 0.0025, threadDist);

        float bulbRadius = mix(0.0055, 0.0115, seedA);
        float bulbDist = length(uv - tip);
        float bulb = 1.0 - smoothstep(bulbRadius, bulbRadius + 0.0028, bulbDist);

        // Make the hanging water drop end in a slightly heavier teardrop.
        float teardrop = bulb;
        teardrop *= smoothstep(anchorY - 0.003, anchorY - 0.012, uv.y);

        float belowAnchor = 1.0 - smoothstep(anchorY - 0.004, anchorY + 0.006, uv.y);
        float dropletMask = clamp((thread * 0.76 + teardrop * 0.96) * belowAnchor * dropLife, 0.0, 1.0);

        // Pull a little real ice colour from the artwork at the attachment
        // point, then add a tiny amount of bright wet-glass light.
        vec4 dropSource = safeSample(vec2(centerX, anchorY + 0.018));
        vec3 dropColor = dropSource.rgb;
        dropColor = mix(dropColor, vec3(0.10, 0.72, 1.0), 0.28);
        float dropGlint = 0.5 + 0.5 * sin(u_time * 1.9 + cell * 1.7);
        dropColor += vec3(0.06, 0.20, 0.32) * dropGlint * 0.16;

        // Let droplets disappear as they meet the water surface rather than
        // turning into a continuous blue stream.
        float waterLine = 0.205;
        float waterFade = smoothstep(waterLine - 0.045, waterLine + 0.008, uv.y);
        dropletMask *= waterFade;

        // Tiny impact shimmer, deliberately subtle so the ocean artwork stays
        // dominant. It follows the droplet's x position and only appears late.
        float impactPhase = smoothstep(0.62, 0.86, phase) *
                            (1.0 - smoothstep(0.84, 0.99, phase)) *
                            selected * anchorIce * activeMelt;
        float impactX = exp(-pow((uv.x - tip.x) / 0.026, 2.0));
        float impactY = exp(-pow((uv.y - waterLine) / 0.009, 2.0));
        float impact = impactPhase * impactX * impactY * 0.23;

        // ===============================================================
        // 3. COMPOSITE ONLY THE CHANGED PIXELS
        // ===============================================================
        // Alpha stays near zero everywhere else, so the underlying CSS
        // background is never visibly duplicated or popped back in.
        float alpha = max(removeMask, dropletMask);
        vec3 changedColor = mix(revealedBg, dropColor, dropletMask / max(alpha, 0.001));
        changedColor += vec3(0.015, 0.12, 0.22) * impact;

        gl_FragColor = vec4(changedColor, clamp(alpha + impact, 0.0, 1.0));
      }
    `;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Glacier shader error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = compile(gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) {
      canvas.style.display = 'none';
      return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Unable to link glacier melt shader.');
      canvas.style.display = 'none';
      return;
    }

    gl.useProgram(program);

    const positions = new Float32Array([
      -1,-1,  1,-1,  -1,1,
      -1,1,   1,-1,   1,1
    ]);

    // With UNPACK_FLIP_Y_WEBGL enabled, this mapping keeps the supplied image
    // upright and makes "down" in the shader correspond to down in the page.
    const uvs = new Float32Array([
      0,0,  1,0,  0,1,
      0,1,  1,0,   1,1
    ]);

    function bufferData(attributeName, data, size) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, attributeName);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    bufferData('a_position', positions, 2);
    bufferData('a_uv', uvs, 2);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
      gl.UNSIGNED_BYTE, img
    );

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const meltLoc = gl.getUniformLocation(program, 'u_melt');
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const imageResolutionLoc = gl.getUniformLocation(program, 'u_imageResolution');

    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform2f(
      imageResolutionLoc,
      img.naturalWidth || 1919,
      img.naturalHeight || 820
    );

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = hero.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      gl.uniform2f(resolutionLoc, width, height);
    }

    function frame(now) {
      resize();

      const seconds = now * 0.001;
      const progress = meltProgress(now);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(timeLoc, seconds);
      gl.uniform1f(meltLoc, progress);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

    // Keep the background and melt layer perfectly locked to one another.
    hero.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 8;
      const y = (e.clientY / window.innerHeight - 0.5) * 4;
      const transform = `scale(1.025) translate(${x}px, ${y}px)`;
      document.querySelector('.hero-bg').style.transform = transform;
      canvas.style.transform = transform;
    });

    hero.addEventListener('mouseleave', () => {
      document.querySelector('.hero-bg').style.transform = 'scale(1.01)';
      canvas.style.transform = 'scale(1.01)';
    });
  }

  if (img.complete) {
    initWebGL();
  } else {
    img.addEventListener('load', initWebGL, { once: true });
  }
})();
