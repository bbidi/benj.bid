import * as THREE from "three";
import { NOISE, OUT, rng, smoothstep, easeInOutCubic } from "./glsl.js";

// Timeline (seconds)
export const INTRO = { warpEnd: 4.6, approachEnd: 9.6, diveEnd: 11.2 };

const R = 10; // Earth radius

export function createSpace() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01020a);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.02, 8000);
  scene.add(camera);

  const L = new THREE.Vector3(-0.85, 0.32, 0.42).normalize(); // sunlight from the side → visible terminator
  const D = new THREE.Vector3(0.24, 0.44, 1.0).normalize(); // landing site
  const r = rng(2026);

  // ---- distant stars (follow camera, so they behave like a skybox) ----
  const SN = 5000;
  const sp = new Float32Array(SN * 3), ss = new Float32Array(SN), sc = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    sp.set([q * Math.cos(a) * 3000, u * 3000, q * Math.sin(a) * 3000], i * 3);
    ss[i] = Math.pow(r(), 6) * 7 + 1.2;
    const t = r();
    sc.set(t < 0.15 ? [1, 0.8, 0.65] : t < 0.4 ? [0.75, 0.85, 1] : [1, 1, 1], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute("aCol", new THREE.BufferAttribute(sc, 3));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute vec3 aCol; varying vec3 vCol; varying float vTw;
      uniform float uTime; uniform float uPR;
      void main(){
        vCol = aCol;
        vTw = 0.65 + 0.35*sin(uTime*(1.5+fract(position.x*0.37)*3.0) + position.y);
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = aSize*uPR;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vTw;
      void main(){
        float d = length(gl_PointCoord-0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vCol*a*a*vTw*1.6, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // ---- soft nebula backdrop ----
  const nebMat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: L } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      varying vec3 vD; uniform vec3 uL;
      void main(){
        vec3 d = normalize(vD);
        float n = fbm3(d*2.2);
        float m = fbm3(d*4.5 + 11.0);
        float band = exp(-pow(dot(d, normalize(vec3(0.3,1.0,-0.2)))*2.4, 2.0));
        vec3 c = vec3(0.10,0.05,0.22)*smoothstep(-0.1,0.6,n) + vec3(0.02,0.10,0.20)*smoothstep(0.0,0.7,m);
        c *= 0.35 + band*0.9;
        float sun = pow(max(dot(d,uL),0.0), 300.0)*4.0 + pow(max(dot(d,uL),0.0), 12.0)*0.12;
        c += vec3(1.0,0.9,0.75)*sun;
        gl_FragColor = vec4(c*0.55,1.0);
        ${OUT}
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 32), nebMat);
  scene.add(nebula);

  // ---- Earth ----
  const Dloc = D.clone();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: L }, uD: { value: Dloc }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying vec3 vWP;
      void main(){
        vP = normalize(position);
        vN = normalize(mat3(modelMatrix)*normal);
        vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz;
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 uL; uniform vec3 uD; uniform float uTime;
      varying vec3 vP; varying vec3 vN; varying vec3 vWP;
      void main(){
        float n = fbm3(vP*1.7) + 0.18*fbm3(vP*6.0);
        float near = dot(vP, uD);
        n += 0.32*smoothstep(0.82, 0.97, near);
        float home = smoothstep(0.86, 0.97, near);
        vec3 north = normalize(vec3(0.0,1.0,0.0) - uD*uD.y);
        float side = dot(vP - uD, north);
        n -= 0.75*smoothstep(-0.004, 0.02, side)*smoothstep(0.93, 0.995, near);
        float land = smoothstep(0.07, 0.11, n);
        float lat = abs(vP.y);
        float m = fbm3(vP*4.0 + 7.0);
        vec3 ocean = mix(vec3(0.003,0.025,0.10), vec3(0.015,0.15,0.30), smoothstep(-0.35, 0.09, n));
        vec3 green = mix(vec3(0.04,0.17,0.035), vec3(0.17,0.26,0.06), smoothstep(-0.3,0.4,m));
        vec3 desert = vec3(0.42,0.31,0.16);
        vec3 landC = mix(green, desert, smoothstep(0.18,0.5,m)*smoothstep(0.55,0.15,lat)*(1.0-smoothstep(0.85,0.95,near)));
        landC = mix(landC, vec3(0.28,0.25,0.20), smoothstep(0.38,0.65,n)*(1.0-home));
        landC = mix(landC, vec3(0.10,0.26,0.05), home*0.8);
        // fine detail for the dive: forests, fields, rivers of light
        float camD = length(cameraPosition);
        float detail = smoothstep(16.0, 11.0, camD);
        float forest = smoothstep(0.1, 0.5, snoise(vP*38.0) + 0.5*snoise(vP*110.0));
        float field = snoise(vP*260.0)*0.5+0.5;
        vec3 fine = mix(landC*(0.85+0.3*field), vec3(0.03,0.11,0.025), forest*0.75);
        landC = mix(landC, fine, detail);
        vec3 albedo = mix(ocean, landC, land);
        float ice = smoothstep(0.80, 0.88, lat + m*0.07);
        albedo = mix(albedo, vec3(0.88,0.92,0.97), ice);

        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWP);
        float ndl = dot(N,uL);
        float diff = max(ndl,0.0);
        vec3 H = normalize(uL+V);
        float spec = pow(max(dot(N,H),0.0), 70.0)*(1.0-land)*(1.0-ice);
        vec3 col = albedo*(diff*1.6 + 0.015) + vec3(1.0,0.88,0.7)*spec*diff*0.9;

        float night = smoothstep(0.05, -0.2, ndl);
        float city = step(0.88, hash13(floor(vP*220.0))) * land * (1.0-ice) * smoothstep(0.05,0.45,fbm3(vP*9.0));
        col += vec3(1.0,0.62,0.28)*city*night*1.2;

        float fr = pow(1.0 - max(dot(N,V),0.0), 3.0);
        col += vec3(0.22,0.48,1.0)*fr*(0.08 + max(ndl+0.2,0.0)*1.1);
        // golden terminator
        col += vec3(1.0,0.45,0.15)*0.05*exp(-pow(ndl*7.0,2.0))*(1.0-fr);
        gl_FragColor = vec4(col,1.0);
        ${OUT}
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), earthMat);
  scene.add(earth);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: L }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: earthMat.vertexShader,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 uL; uniform float uTime; uniform float uFade;
      varying vec3 vP; varying vec3 vN; varying vec3 vWP;
      void main(){
        vec3 p = vP*3.0 + vec3(uTime*0.012, 0.0, uTime*0.004);
        float c = fbm3(p) + 0.35*fbm3(p*3.1);
        float a = smoothstep(0.08, 0.55, c);
        float diff = max(dot(normalize(vN), uL), 0.0);
        vec3 col = vec3(1.0)*(diff*1.5 + 0.02);
        gl_FragColor = vec4(col, a*0.92*uFade);
        ${OUT}
      }`,
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 128, 96), cloudMat);
  scene.add(clouds);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: L }, uFade: { value: 1 }, uLimb: { value: Math.sqrt(1 - 1 / (1.07 * 1.07)) } },
    vertexShader: /* glsl */ `
      varying vec3 vNW; varying vec3 vWP;
      void main(){
        vNW = normalize(mat3(modelMatrix)*normal);
        vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz;
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uL; uniform float uFade; uniform float uLimb;
      varying vec3 vNW; varying vec3 vWP;
      void main(){
        vec3 V = normalize(cameraPosition - vWP);
        // back faces: 0 at the outer silhouette → 1 at Earth's limb
        float k = clamp(-dot(vNW, V)/uLimb, 0.0, 1.0);
        float i = pow(k, 2.2);
        float lit = clamp(dot(vNW, uL)*0.8 + 0.45, 0.0, 1.0);
        vec3 c = mix(vec3(1.0,0.6,0.35), vec3(0.32,0.6,1.0), smoothstep(0.1, 0.6, lit));
        gl_FragColor = vec4(c*i*lit*1.3*uFade, 1.0);
        ${OUT}
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 64), atmoMat);
  scene.add(atmo);

  // ---- warp streaks (live in camera space) ----
  const WN = 1400;
  const wp = new Float32Array(WN * 2 * 3), we = new Float32Array(WN * 2), wc = new Float32Array(WN * 2);
  for (let i = 0; i < WN; i++) {
    const a = r() * Math.PI * 2, rad = 3 + Math.pow(r(), 0.7) * 60, z = -r() * 400;
    const tint = r();
    for (let k = 0; k < 2; k++) {
      wp.set([Math.cos(a) * rad, Math.sin(a) * rad, z], (i * 2 + k) * 3);
      we[i * 2 + k] = k;
      wc[i * 2 + k] = tint;
    }
  }
  const warpGeo = new THREE.BufferGeometry();
  warpGeo.setAttribute("position", new THREE.BufferAttribute(wp, 3));
  warpGeo.setAttribute("aEnd", new THREE.BufferAttribute(we, 1));
  warpGeo.setAttribute("aTint", new THREE.BufferAttribute(wc, 1));
  const warpMat = new THREE.ShaderMaterial({
    uniforms: { uTravel: { value: 0 }, uStretch: { value: 1 }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aEnd; attribute float aTint;
      uniform float uTravel; uniform float uStretch;
      varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position;
        p.z = mod(p.z + uTravel, 400.0) - 400.0;
        float head = p.z;
        p.z -= aEnd*uStretch;
        vA = (1.0 - aEnd*0.9) * smoothstep(-400.0, -250.0, head) * smoothstep(0.0, -15.0, head);
        vC = mix(vec3(0.7,0.82,1.0), vec3(1.0,0.85,0.95), aTint);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying float vA; varying vec3 vC;
      void main(){ gl_FragColor = vec4(vC*vA*uOpacity, 1.0); }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const warp = new THREE.LineSegments(warpGeo, warpMat);
  warp.frustumCulled = false;
  camera.add(warp);

  // ---- camera path ----
  const Z = new THREE.Vector3(0, 0.06, 1).normalize();
  const tmpQ = new THREE.Quaternion();
  const qFrom = new THREE.Quaternion();
  const qTo = new THREE.Quaternion().setFromUnitVectors(Z, D);

  function dist(t) {
    const { warpEnd, approachEnd, diveEnd } = INTRO;
    if (t < warpEnd) {
      const u = t / warpEnd;
      return 62 + 2600 * Math.pow(1 - u, 3.4);
    }
    if (t < approachEnd) {
      const u = (t - warpEnd) / (approachEnd - warpEnd);
      return 62 + (17 - 62) * easeInOutCubic(u);
    }
    const u = Math.min((t - approachEnd) / (diveEnd - approachEnd), 1);
    return 17 + (R * 1.006 - 17) * (u * u * (1.6 - 0.6 * u));
  }
  function dirAt(t, out) {
    const { warpEnd, approachEnd } = INTRO;
    const u = smoothstep(warpEnd - 1.2, approachEnd + 0.6, t);
    tmpQ.slerpQuaternions(qFrom, qTo, u);
    return out.copy(Z).applyQuaternion(tmpQ);
  }

  const dir = new THREE.Vector3();
  let travel = 0;

  function update(t, dt) {
    starMat.uniforms.uTime.value = t;
    cloudMat.uniforms.uTime.value = t;

    const d = dist(t);
    const speed = Math.max((dist(Math.max(t - 0.016, 0)) - d) / 0.016, 0);
    dirAt(t, dir);
    camera.position.copy(dir).multiplyScalar(d);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    // gentle roll + shake in warp
    const warpAmt = 1 - smoothstep(INTRO.warpEnd - 1.0, INTRO.warpEnd + 0.2, t);
    camera.rotateZ(Math.sin(t * 0.7) * 0.05 * warpAmt + (Math.random() - 0.5) * 0.004 * warpAmt * Math.min(speed / 400, 1));

    camera.fov = 55 + Math.min(speed * 0.012, 28);
    camera.updateProjectionMatrix();

    travel += Math.min(speed, 1500) * dt * 0.35 + dt * 4;
    warpMat.uniforms.uTravel.value = travel;
    warpMat.uniforms.uStretch.value = Math.min(Math.max(speed * 0.05, 0.4), 70);
    warpMat.uniforms.uOpacity.value = smoothstep(0.0, 0.5, t) * warpAmt;

    stars.position.copy(camera.position);
    nebula.position.copy(camera.position);

    // fade the outer atmosphere glow as we pass through it
    const alt = d - R;
    atmoMat.uniforms.uFade.value = smoothstep(0.25, 2.5, alt);
    cloudMat.uniforms.uFade.value = 1.0;

    return {
      flash: smoothstep(INTRO.diveEnd - 0.7, INTRO.diveEnd, t) * 0.55,
      title: smoothstep(0.5, 1.4, t) * (1 - smoothstep(3.3, 4.4, t)),
      done: t >= INTRO.diveEnd,
    };
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  return { scene, camera, update, resize, dispose };
}
