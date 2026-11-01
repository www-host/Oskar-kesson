/* Osxr Beats: desktop WebGL scene.
   A procedural aurora, a field of "aurora dust" particles and an iridescent glass speaker that kicks to a beat
   and sends sound waves through the dust. Everything here (geometry, shaders, palette, choreography) is original.
   Loaded on desktop only. Phones get the lightweight CSS version instead. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BAR = 1.6;
const PATTERN = [[0, 1], [0.27, 0.55], [0.8, 0.9], [1.07, 0.5]];
/* three palettes (low / mid / high of the aurora). state.hue 0..2 blends between them. */
const PALETTES = [
  [0x5ff0c0, 0x8ddcff, 0x8f86ff],
  [0x8ddcff, 0x8f86ff, 0xd58bff],
  [0x2fe6d3, 0x4f8bff, 0xb28bff],
].map((p) => p.map((h) => new THREE.Color(h)));

const NOISE = /* glsl */ `
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
`;

const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BG_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uBeat, uAur, uAspect, uScroll;
  uniform vec3 uC1, uC2, uC3;
  uniform vec2 uMouse;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    float t = uTime;
    vec3 base = mix(vec3(0.0006, 0.0016, 0.0042), vec3(0.0022, 0.0075, 0.0185), pow(uv.y, 0.8));
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float x = (uv.x * uAspect + uMouse.x * 0.04) * (1.1 + fi * 0.55) + fi * 3.7 + uScroll * 0.00035;
      float warp = fbm(vec2(x * 0.7, t * 0.05 + fi * 4.0)) * 1.8;
      float ribbon = fbm(vec2(x * 1.8 + warp * 1.6, t * 0.07 + fi * 2.3));
      float edge = 0.30 + fi * 0.10 + 0.14 * sin(x * 0.8 + t * 0.12 + warp * 2.0);
      float y = uv.y - edge;
      float up = smoothstep(-0.015, 0.03, y) * exp(-max(y, 0.0) * (3.4 - fi * 0.5));
      float k = up * smoothstep(0.28, 0.78, ribbon);
      float hgt = clamp(y * 2.2, 0.0, 1.0);
      vec3 c = mix(uC1, uC2, hgt);
      c = mix(c, uC3, clamp(y * 3.0 - 0.35, 0.0, 1.0) * 0.7);
      acc += c * k * (0.9 - fi * 0.2);
    }
    vec3 col = base + acc * (0.4 * uAur) * (1.0 + uBeat * 0.5);
    vec2 sg = floor(uv * vec2(uAspect, 1.0) * 380.0);
    float sh = hash(sg);
    float star = step(0.9965, sh) * (0.55 + 0.45 * sin(t * 1.7 + sh * 60.0));
    col += vec3(0.7, 0.85, 1.0) * star * 0.25 * (1.0 - clamp(length(acc) * 3.0, 0.0, 1.0));
    float v = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(uAspect * 0.75, 1.0)));
    col *= mix(0.55, 1.0, v);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const DUST_VERT = /* glsl */ `
  uniform float uTime, uBeat, uShock, uScroll, uDust, uPx;
  uniform vec3 uObj, uC1, uC2;
  uniform vec2 uMouse;
  attribute vec4 aSeed;
  varying float vA;
  varying vec3 vC;
  void main() {
    vec3 p = position;
    float sp = 0.12 + aSeed.x * 0.32;
    p.y = mod(p.y + uTime * sp + uScroll * 0.0009 * (0.4 + aSeed.y) + 5.5, 11.0) - 5.5;
    p.x += sin(uTime * 0.25 * (0.5 + aSeed.z) + p.y * 0.6 + aSeed.w * 6.28) * 0.35;
    p.z += cos(uTime * 0.2 + p.x * 0.4 + aSeed.w * 6.28) * 0.3;
    vec3 d = p - uObj;
    float dist = length(d);
    float w = (dist - uShock) * 1.3;
    float wave = exp(-w * w) * uBeat;
    p += normalize(d + 1e-4) * wave * 0.7;
    vec2 md = p.xy - uMouse;
    float mr = length(md);
    p.xy += normalize(md + 1e-4) * smoothstep(1.7, 0.0, mr) * 0.55;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (1.0 + aSeed.y * 2.2) * (1.0 + wave * 1.6);
    gl_PointSize = size * uPx * (16.0 / -mv.z);
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.z * 1.4) + aSeed.w * 30.0);
    vA = (0.25 + aSeed.x * 0.75) * tw * (0.7 + wave * 1.4) * uDust;
    vC = mix(uC1, uC2, aSeed.w);
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vC * (0.9 + vA * 1.4), a * clamp(vA, 0.0, 1.0));
  }
`;

export async function createScene({ canvas, reduce = false, onProgress = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  onProgress(0.1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(0, 0, 9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  onProgress(0.4);

  /* ---- animated state: GSAP tweens these from the page, the scene only reads them ---- */
  const S = { x: 2.4, y: 0.1, z: 0, s: 1, ry: -0.25, aur: 1, hue: 0, dust: 1, dim: 1, glow: 1 };

  const U = {
    uTime: { value: 0 }, uBeat: { value: 0 }, uShock: { value: 0 }, uAur: { value: 1 }, uAspect: { value: 1 },
    uScroll: { value: 0 }, uDust: { value: 1 }, uPx: { value: dpr },
    uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() },
    uMouse: { value: new THREE.Vector2() }, uObj: { value: new THREE.Vector3() },
  };
  const tmp = new THREE.Color();
  const applyPalette = (h) => {
    const i = h <= 1 ? 0 : 1;
    const f = h <= 1 ? Math.max(0, h) : Math.min(1, h - 1);
    [U.uC1, U.uC2, U.uC3].forEach((u, k) => u.value.copy(PALETTES[i][k]).lerp(tmp.copy(PALETTES[i + 1][k]), f));
  };
  applyPalette(0);

  /* ---- background aurora (a full-screen shader quad) ---- */
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: U, depthTest: false, depthWrite: false }),
  );
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  /* ---- aurora dust ---- */
  const COUNT = 5200;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    pos.set([(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 11, (Math.random() - 0.5) * 7 - 1], i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: U,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  dust.frustumCulled = false;
  scene.add(dust);
  onProgress(0.6);

  /* ---- the speaker: a glossy iridescent cone, a chrome surround, glowing grooves, a dust cap, ripples ---- */
  const speaker = new THREE.Group();
  scene.add(speaker);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b1a2e, metalness: 0.55, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06,
    iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 640], envMapIntensity: 0.9,
  });
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xc6ecff, metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.9,
    iridescenceThicknessRange: [200, 820], envMapIntensity: 1.1,
  });
  const glowCol = new THREE.Color(0x8ddcff).multiplyScalar(1.5);
  const glowMat = new THREE.MeshBasicMaterial({ color: glowCol, toneMapped: false, transparent: true, opacity: 0.9 });

  const cone = new THREE.Mesh(new THREE.SphereGeometry(1.05, 128, 96), glass);
  cone.scale.set(1, 1, 0.42);
  const surround = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.075, 64, 220), chrome);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.014, 16, 240), glowMat);
  const grooves = [0.3, 0.5, 0.7, 0.9].map((r) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 8, 160), glowMat.clone());
    m.material.opacity = 0.35;
    m.position.z = 0.42 * Math.sqrt(Math.max(0, 1 - (r / 1.05) ** 2)) + 0.012;
    return m;
  });
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 64, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0x10304a, emissive: 0x8ddcff, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.12,
      clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, envMapIntensity: 1.6,
    }),
  );
  cap.scale.set(1, 1, 0.65);
  cap.position.z = 0.43;
  speaker.add(cone, surround, halo, cap, ...grooves);

  const ripples = Array.from({ length: 7 }, () => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x8ddcff).multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.99, 1.012, 160), mat);
    mesh.visible = false;
    mesh.position.z = 0.1;
    speaker.add(mesh);
    return { mesh, t: 0, amp: 0, on: false };
  });

  const lights = [
    new THREE.PointLight(0x8ddcff, 26, 0, 2), new THREE.PointLight(0x5ff0c0, 20, 0, 2), new THREE.PointLight(0x8f86ff, 16, 0, 2),
  ];
  lights[0].position.set(4, 3, 5);
  lights[1].position.set(-4, -1, 3);
  lights[2].position.set(0, -3, 2);
  scene.add(new THREE.AmbientLight(0x4466aa, 0.25), ...lights);
  onProgress(0.75);

  /* ---- post: bloom gives the glow ---- */
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.4, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---- input ---- */
  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = -((e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });

  /* ---- beat ---- */
  let beat = 0, shock = 99, spring = 0, springV = 0, barT = 0, lastBarT = 0;
  const spawnRipple = (amp) => {
    const r = ripples.find((x) => !x.on) || ripples[0];
    Object.assign(r, { t: 0, amp, on: true });
    r.mesh.visible = true;
  };
  const kick = (amp = 1) => {
    beat = Math.max(beat, amp);
    shock = 0;
    springV += amp * 7;
    spawnRipple(amp);
  };

  let running = false, raf = 0;
  const clock = new THREE.Clock();
  let slow = 0, frames = 0;
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    U.uAspect.value = camera.aspect;
    U.uPx.value = dpr;
    if (reduce) requestRender();
  }

  function update(dt, time) {
    const fit = Math.min(1, camera.aspect / 1.6);
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dt * 4));
    mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dt * 4));

    if (!reduce) {
      barT += dt;
      const phase = barT % BAR;
      const lastPhase = lastBarT % BAR;
      PATTERN.forEach(([t, amp]) => {
        const crossed = phase >= lastPhase ? (t > lastPhase && t <= phase) : (t > lastPhase || t <= phase);
        if (crossed) kick(amp);
      });
      lastBarT = barT;
      springV += (-140 * spring - 11 * springV) * dt;
      spring += springV * dt;
      beat *= Math.exp(-dt * 3.2);
      shock = Math.min(shock + dt * 5.5, 9);
    }

    applyPalette(S.hue);
    U.uTime.value = reduce ? 18 : time;
    U.uBeat.value = beat;
    U.uShock.value = shock;
    U.uAur.value = S.aur;
    U.uDust.value = S.dust;
    U.uMouse.value.set(mouse.x * halfH * camera.aspect, mouse.y * halfH);

    const sc = S.s * (0.82 + 0.18 * fit);
    speaker.position.set(S.x * fit, S.y + (reduce ? 0 : Math.sin(time * 0.8) * 0.06), S.z);
    speaker.rotation.set(-mouse.y * 0.18, S.ry + mouse.x * 0.28, reduce ? 0 : Math.sin(time * 0.3) * 0.02);
    speaker.scale.setScalar(sc * (1 + spring * 0.045));
    U.uObj.value.copy(speaker.position);
    cap.scale.set(1 + spring * 0.2, 1 + spring * 0.2, 0.65);
    grooves.forEach((g, i) => g.scale.setScalar(1 + spring * 0.05 * (i + 1) * 0.5));

    const dim = S.dim;
    glass.envMapIntensity = 0.9 * dim;
    chrome.envMapIntensity = 1.1 * dim;
    cap.material.emissiveIntensity = (0.55 + beat * 0.9) * dim;
    glowMat.opacity = 0.9 * dim;
    grooves.forEach((g) => { g.material.opacity = (0.3 + beat * 0.35) * dim; });
    lights[0].color.copy(U.uC2.value); lights[1].color.copy(U.uC1.value); lights[2].color.copy(U.uC3.value);
    lights.forEach((l, i) => { l.intensity = [26, 20, 16][i] * dim; });
    ripples.forEach((r) => {
      r.mesh.material.color.copy(U.uC2.value).multiplyScalar(1.1);
      if (!r.on) return;
      r.t += dt;
      const k = r.t / 2.4;
      if (k >= 1) { r.on = false; r.mesh.visible = false; return; }
      r.mesh.scale.setScalar(1.25 + k * (2.6 + r.amp * 0.8));
      r.mesh.material.opacity = (1 - k) * (1 - k) * 0.38 * r.amp * dim;
    });
    bloom.strength = 0.4 + S.glow * 0.15 + beat * 0.2;

    camera.position.x = mouse.x * 0.25;
    camera.position.y = mouse.y * 0.15;
    camera.lookAt(0, 0, 0);
  }

  function frame() {
    raf = 0;
    const dt = Math.min(0.05, clock.getDelta());
    update(dt, clock.elapsedTime);
    composer.render(dt);

    /* adaptive quality: if frames run long, drop resolution, then bloom, then half the dust */
    if (!reduce) {
      frames++;
      slow += dt * 1000 > 26 ? 1 : 0;
      if (frames === 90) {
        if (slow > 40) {
          if (dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); }
          else if (bloom.enabled) bloom.enabled = false;
          else dustGeo.setDrawRange(0, COUNT / 2);
        }
        frames = 0; slow = 0;
      }
    }
    if (running && !reduce) raf = requestAnimationFrame(frame);
  }
  function requestRender() { if (!raf && (reduce || !running)) raf = requestAnimationFrame(frame); }

  addEventListener('resize', resize);
  resize();

  /* build the first frame now (so the page can reveal onto a ready scene), then wait for start() */
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  onProgress(0.92);
  clock.getDelta();
  update(0.016, 0);
  composer.render(0.016);
  onProgress(1);

  return {
    state: S,
    kick,
    setScroll(y) { U.uScroll.value = y; if (reduce) requestRender(); },
    requestRender,
    start() {
      if (reduce) { requestRender(); return; }
      if (running) return;
      running = true;
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    },
  };
}
