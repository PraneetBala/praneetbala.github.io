// Interactive room hero — baked room (unlit + specular layer) with a live-lit animated character.
// Usage: import { mountRoom } from './room/room.js'; mountRoom(document.getElementById('roomHero'));
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const ASSET_VER = '20261112211518';   // bump on every re-export so browsers fetch fresh files
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/';

export function mountRoom(container, opts = {}) {
  const stage = x => { window.__roomStage = x; };
  stage('init');
  const base = opts.base ?? 'room/';
  const Q = opts.params ?? new URLSearchParams(location.search);
  const hud = opts.hud ?? null;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mobile = Q.has('mobile') || (!Q.has('desktop') && (coarse || small));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('still');
  const interactive = opts.interactive ?? !coarse;          // touch: keep page scrolling, no orbit

  RectAreaLightUniformsLib.init();
  const canvas = document.createElement('canvas');
  canvas.className = 'room-canvas';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;            // only the character is tone mapped
  renderer.shadowMap.enabled = !mobile && !Q.has('noshadow');
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1d1a3e');

  // Blender (x, y, z) → three (x, z, -y)
  const B = (x, y, z) => new THREE.Vector3(x, z, -y);
  const D = B;
  const LAMP = B(-3.0, -3.75, 4.6), PC = B(1.3, 2.3, 0.74);

  // ── Blender lights rebuilt for the live character: intensity = K · watts (point: W/4π, area: W/(area·π)).
  const K = 0.16;
  const area = (col, W, w, h, pos, dir, boost = 1) => {
    const l = new THREE.RectAreaLight(col, K * W / (w * h * Math.PI) * boost, w, h);
    l.position.copy(pos); l.lookAt(pos.clone().add(dir)); scene.add(l); return l;
  };
  scene.add(new THREE.HemisphereLight('#6f66c8', '#2a1a10', 0.12));
  const lampPt = new THREE.PointLight('#ff9a4d', K * 1100 / (4 * Math.PI), 14, 2); lampPt.position.copy(LAMP); scene.add(lampPt);
  const key = new THREE.DirectionalLight('#ffb070', 0.45);
  key.position.copy(LAMP); key.castShadow = renderer.shadowMap.enabled;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  scene.add(key, key.target);
  const MON_BASE = new THREE.Color(0.55, 0.42, 1.0);
  const monMain = area(MON_BASE, 90, 2.6, 1.4, B(0.02, 2.05, 3.35), D(0, -1, 0), 2.2);
  area(MON_BASE, 60, 2.2, 1.2, B(-2.33, 1.35, 3.2), D(0.71, -0.71, 0), 2.0);
  area(new THREE.Color(0.55, 0.8, 1.0), 700, 4, 4, B(-6.5, 6.5, 9.0), D(0.56, -0.56, -0.61));          // cool rim
  area(new THREE.Color(1.0, 0.82, 0.62), 80, 4, 3, B(2.2, -0.5, 5.4), D(0.04, 0.9, -0.43));            // right fill
  area(new THREE.Color(1.0, 0.86, 0.72), 70, 9, 9, B(0, 0, 7.5), D(0, 0, -1), 3);                      // room fill
  area(new THREE.Color(0.55, 0.8, 1.0), 220, 14, 8, B(9.61, -9.61, 3.86), D(-0.69, 0.69, -0.24), 3);   // front fill
  area(new THREE.Color(1.0, 0.55, 0.25), 420, 1, 6, B(-2.6, -0.9, 5.5), D(-0.6, 0, -0.8));             // wall wash
  const pcPt = new THREE.PointLight('#8c4dff', K * 60 / (4 * Math.PI) * 4, 3.5, 2);
  pcPt.position.copy(PC).add(new THREE.Vector3(0, 0.25, 0.3)); scene.add(pcPt);
  const PC_I = pcPt.intensity;

  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO));
  const load = url => new Promise((res, rej) => loader.load(url + '?v=' + ASSET_VER, res, undefined, rej));

  // ── Main monitor: video + taskbar composited on a canvas.
  const video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'auto' });
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  video.src = base + 'screen.mp4';
  video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(20, video.duration - 1); if (!reduced) video.play().catch(() => {}); });
  const taskbar = new Image(); taskbar.src = base + 'taskbar.png';
  const scr = Object.assign(document.createElement('canvas'), { width: mobile ? 640 : 1280, height: mobile ? 325 : 650 });
  const sctx = scr.getContext('2d');
  const screenTex = new THREE.CanvasTexture(scr); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.flipY = false;
  const V0 = 0.049, V1 = 0.951, BAR = 0.06;
  const drawScreen = () => {
    const W = scr.width, H = scr.height;
    if (video.readyState >= 2) sctx.drawImage(video, 0, 0, W, H); else { sctx.fillStyle = '#0b0b10'; sctx.fillRect(0, 0, W, H); }
    if (taskbar.complete && taskbar.naturalWidth) { const bh = (V1 - V0) * BAR * H; sctx.drawImage(taskbar, 0, H * (1 - V0) - bh, W, bh); }
    screenTex.needsUpdate = true;
  };

  // ── Materials. Baked atlases go in as emission (exact Blender colours); a black dielectric base adds specular.
  const SPEC = { WEB_Floor: [0.38, 0.55], WEB_Props: [0.45, 0.45], WEB_Chair: [0.5, 0.35], WEB_Shell: [0.7, 0.25] };
  const rgbMats = [];
  const charGlow = new THREE.TextureLoader().load(base + 'char_emissive.png', t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; });
  const roomMaterial = (m, mesh) => {
    const n = m.name || '';
    if (n === 'WEBIMG_main_screen') return new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, side: THREE.DoubleSide });
    if (n.startsWith('WEB_')) {
      const [rough, env] = SPEC[n] || [0.6, 0.3];
      m.map.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshPhysicalMaterial({ name: n, color: 0x000000, emissive: 0xffffff, emissiveMap: m.map,
        roughness: rough, metalness: 0, envMapIntensity: env, specularIntensity: 0.4, toneMapped: false });
    }
    if (n.startsWith('WEBIMG_')) {
      const b = new THREE.MeshBasicMaterial({ map: m.map, toneMapped: false, side: THREE.DoubleSide });
      b.map.colorSpace = THREE.SRGBColorSpace;
      if (n !== 'WEBIMG_city') b.color.setScalar(n === 'WEBIMG_whiteboard' ? 0.68 : 0.8);
      return b;
    }
    if (n.startsWith('WEBX_rgb')) {
      const b = new THREE.MeshBasicMaterial({ color: m.color.clone().multiplyScalar(2.6), toneMapped: false });
      b.userData.base = b.color.clone(); rgbMats.push(b); return b;
    }
    if (n === 'WEBX_lamp_shade') return new THREE.MeshBasicMaterial({ color: '#ffe9cf', toneMapped: false, side: THREE.DoubleSide });
    if (n === 'WEBX_lamp_glow')  return new THREE.MeshBasicMaterial({ color: '#fff6e6', toneMapped: false, side: THREE.DoubleSide });
    if (n === 'WEBX_pc_glass')   return new THREE.MeshPhysicalMaterial({ color: '#0d0d14', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, envMapIntensity: 0.8, depthWrite: false });
    if (mesh.name === 'window-glass' || n.startsWith('Window_Glass'))
      return new THREE.MeshPhysicalMaterial({ color: '#a9b8ff', transparent: true, opacity: 0.08, roughness: 0.04, metalness: 0, envMapIntensity: 1.0, depthWrite: false });
    return m;
  };
  const glowSprite = (color, size, opacity) => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(size); return s;
  };

  // ── Camera fit: Blender sensor-fit AUTO (keep the horizontal FOV when narrower than 16:9).
  let camera, controls, mixer, envTex, captureEnv;
  let baseVFov = 22.9;
  const BASE_ASPECT = 16 / 9;
  const fit = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1, a = w / h;
    renderer.setSize(w, h, false);
    if (!camera) return;
    camera.aspect = a;
    camera.fov = a >= BASE_ASPECT ? baseVFov
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseVFov) / 2) * BASE_ASPECT / a));
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit); ro.observe(container);

  stage('loading');
  const ready = Promise.all([load(base + (mobile ? 'room_m.glb' : 'room.glb')), load(base + 'character.glb')]).then(([room, char]) => {
    stage('loaded');
    const catchers = [];
    room.scene.traverse(o => {
      if (o.isCamera && !camera) {
        camera = new THREE.PerspectiveCamera(o.fov, BASE_ASPECT, 0.1, 200);
        o.getWorldPosition(camera.position); o.getWorldQuaternion(camera.quaternion);
        baseVFov = o.fov;
      }
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(m => roomMaterial(m, o)) : roomMaterial(o.material, o);
      if (/^web_(floor|chair|props)/.test(o.name) || /^web_(floor|chair|props)/.test(o.parent?.name || '')) catchers.push(o);
    });
    if (renderer.shadowMap.enabled) for (const o of catchers) {   // shadow-only overlay for the character's shadow
      const sh = new THREE.Mesh(o.geometry, new THREE.ShadowMaterial({ opacity: 0.38, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      sh.receiveShadow = true; sh.matrixAutoUpdate = false; o.updateWorldMatrix(true, false); sh.matrix.copy(o.matrixWorld);
      scene.add(sh);
    }
    scene.add(room.scene);

    char.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = renderer.shadowMap.enabled;
      for (const m of [].concat(o.material)) {
        if (m.name === 'CH_Atlas') { m.emissive.setRGB(1, 1, 1); m.emissiveMap = charGlow; m.emissiveIntensity = 1.5; }
        else if (m.emissive) { m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 0; m.emissiveMap = null; }
        m.envMapIntensity = 1.0; m.needsUpdate = true;
      }
    });
    scene.add(char.scene);
    key.target.position.copy(new THREE.Box3().setFromObject(char.scene).getCenter(new THREE.Vector3()));

    const glow = glowSprite('#ffcf94', 2.4, 0.55); glow.position.copy(LAMP).add(new THREE.Vector3(0, 0.15, 0)); scene.add(glow);

    // Ambient/bounce: capture the baked room (and lit screens) from the character's head.
    const rt = new THREE.WebGLCubeRenderTarget(mobile ? 128 : 256, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.05, 50, rt); cubeCam.position.copy(B(0.0, 0.3, 3.0)); scene.add(cubeCam);
    const pmrem = new THREE.PMREMGenerator(renderer);
    captureEnv = () => {
      char.scene.visible = false; drawScreen(); cubeCam.update(renderer, scene); char.scene.visible = true;
      const old = envTex; envTex = pmrem.fromCubemap(rt.texture).texture; scene.environment = envTex; old?.dispose();
    };
    captureEnv();
    video.addEventListener('playing', () => setTimeout(captureEnv, 600), { once: true });

    if (char.animations.length) {
      mixer = new THREE.AnimationMixer(char.scene);
      char.animations.forEach(a => mixer.clipAction(a).play());
      const tFix = Q.has('t') ? +Q.get('t') : (reduced ? 2 : null);
      if (tFix !== null) { mixer.setTime(tFix); mixer.timeScale = 0; }
    }

    const target = new THREE.Vector3(0, 2.4, 0);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const along = dir.dot(target.clone().sub(camera.position));
    target.copy(camera.position).addScaledVector(dir, along);
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableDamping = true; controls.enablePan = false;
    controls.enableZoom = !!opts.zoom;                       // never hijack page scrolling by default
    controls.enabled = interactive;
    controls.update();
    const az = controls.getAzimuthalAngle(), po = controls.getPolarAngle(), R = THREE.MathUtils.degToRad;
    controls.minAzimuthAngle = az - R(25); controls.maxAzimuthAngle = az + R(25);
    controls.minPolarAngle = po - R(10);   controls.maxPolarAngle = po + R(8);
    const dist = camera.position.distanceTo(target);
    controls.minDistance = dist * 0.8; controls.maxDistance = dist * 1.1;
    fit();
    renderer.compile(scene, camera);
    container.classList.add('room-ready'); stage('ready');
  });
  ready.catch(e => { stage('error ' + (e && e.message || e)); console.error('[room]', e); container.classList.add('room-failed'); });

  // ── Render loop: only while visible on screen and the tab is in front.
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.01 });
  io.observe(container);
  const sync = () => {
    const on = visible && !document.hidden;
    renderer.setAnimationLoop(on ? loop : null);
    if (on && !reduced) video.play().catch(() => {}); else video.pause();
  };
  document.addEventListener('visibilitychange', sync);

  const clock = new THREE.Clock(); let t = 0, frameNo = 0, frames = 0, acc = 0;
  const avgCanvas = Object.assign(document.createElement('canvas'), { width: 8, height: 4 });
  const actx = avgCanvas.getContext('2d', { willReadFrequently: true }); const avg = new THREE.Color();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1); t += dt;
    if (!camera) return;
    drawScreen();
    mixer?.update(dt);
    if (!reduced) {
      for (const [i, m] of rgbMats.entries()) m.color.copy(m.userData.base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 1.6 + i * 2.1));
      pcPt.intensity = PC_I * (0.85 + 0.15 * Math.sin(t * 1.6));
    }
    if ((frameNo++ % 6) === 0) {
      actx.drawImage(scr, 0, 0, 8, 4);
      const d = actx.getImageData(0, 0, 8, 4).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4; avg.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
      monMain.color.copy(MON_BASE).lerp(avg, 0.75);
    }
    controls.update();
    renderer.render(scene, camera);
    if (hud) {
      frames++; acc += dt;
      if (acc > 1) { hud.textContent = `${Math.round(frames / acc)} fps · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} tris${mobile ? ' · mobile' : ''}`; frames = 0; acc = 0; }
    }
  }
  sync();

  return {
    ready,
    dispose() {
      renderer.setAnimationLoop(null); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
      video.pause(); video.removeAttribute('src'); video.load();
      controls?.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
