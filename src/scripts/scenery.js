import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NOISE, COMMON, OUT, rng, vnoise } from "./glsl.js";
import { heightAt, bayMask, SEA_LEVEL, SHORE_R } from "./terrain.js";

// ---------------------------------------------------------------- ocean
export function createOcean(U, skyU) {
  const g = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uZenith: skyU.uZenith, uHorizon: skyU.uHorizon },
    vertexShader: /* glsl */ `
      varying vec3 vWP;
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.0);
        vWP = wp.xyz;
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uNight;
      varying vec3 vWP;
      float waves(vec2 p, float t){
        return snoise(vec3(p*0.045 + vec2(0.0, t*0.05), t*0.06))*0.9
             + snoise(vec3(p*0.16 + vec2(t*0.07, t*0.11), t*0.2))*0.35
             + snoise(vec3(p*0.6 + vec2(t*0.2, -t*0.15), t*0.5))*0.12;
      }
      void main(){
        vec2 p = vWP.xz;
        float t = uTime;
        float dist = distance(vWP, cameraPosition);
        float e = 0.35;
        float h0 = waves(p, t);
        float hx = waves(p + vec2(e, 0.0), t);
        float hz = waves(p + vec2(0.0, e), t);
        float k = mix(0.9, 0.12, smoothstep(30.0, 400.0, dist)); // calmer looking far away
        vec3 N = normalize(vec3(-(hx-h0)/e*k, 1.0, -(hz-h0)/e*k));
        vec3 V = normalize(cameraPosition - vWP);
        float fres = 0.02 + 0.98*pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, clamp(R.y*1.6, 0.0, 1.0));

        float d = length(p) - ${SHORE_R.toFixed(1)};
        float depth = smoothstep(0.0, 40.0, d);
        vec3 shallow = vec3(0.03, 0.30, 0.30);
        vec3 deep = vec3(0.004, 0.06, 0.16);
        vec3 body = mix(shallow, deep, depth)*(uSkyColor*0.55 + uSunColor*0.3);
        // cap the grazing reflection so the far Pacific stays a deep blue band, not more sky
        vec3 col = mix(body, sky, clamp(fres, 0.0, mix(0.85, 0.3, smoothstep(60.0, 300.0, dist))));

        // sun / moon glitter path
        vec3 Rs = reflect(-uSunDir, N);
        float sp = max(dot(Rs, V), 0.0);
        col += uSunColor*(pow(sp, 220.0)*3.0 + pow(sp, 40.0)*0.18)*(1.0 - uNight*0.4);

        // breakers rolling in, and foam where the water licks the sand
        float wave = sin(d*0.5 + t*1.25 + snoise(vec3(p*0.05, 1.0))*1.5);
        float crest = smoothstep(0.86, 1.0, wave)*(1.0 - smoothstep(6.0, 30.0, d))*smoothstep(-0.5, 1.5, d);
        float brk = smoothstep(-0.15, 0.55, snoise(vec3(p*0.3, t*0.35)));
        float swash = 1.0 - smoothstep(0.0, 1.8 + sin(t*0.9)*0.9, d);
        float foam = max(crest*brk, swash*(0.55 + 0.45*brk));
        vec3 foamC = vec3(0.92)*(uSkyColor*0.6 + uSunColor*0.75);
        col = mix(col, foamC, foam*0.85);

        // sea haze: much lighter than the land fog so the Pacific reads all the way out
        float f = smoothstep(150.0, 2000.0, dist);
        col = mix(col, uHorizon, f*0.75);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.y = SEA_LEVEL;
  m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- granite
function granite(seed, { sx, sy, sz, cutX = null, cutZ = null, flatTop = null }) {
  const g = new THREE.SphereGeometry(1, 96, 64);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y < 0) v.y *= 0.5; // base runs down below the waterline / hills
    if (cutX !== null && v.x > cutX) v.x = cutX + (v.x - cutX) * 0.04; // sheer face
    if (cutZ !== null && v.z > cutZ) v.z = cutZ + (v.z - cutZ) * 0.05;
    if (flatTop !== null && v.y > flatTop) v.y = flatTop + (v.y - flatTop) * 0.35;
    const n0 = vnoise(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3) - 0.5;
    const n = vnoise(v.x * 3 + seed, v.y * 3, v.z * 3) - 0.5;
    const n2 = vnoise(v.x * 9, v.y * 9 + seed, v.z * 9) - 0.5;
    v.multiplyScalar(1 + n0 * 0.22 + n * 0.1 + n2 * 0.03);
    v.set(v.x * sx, v.y * sy, v.z * sz);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createGranite(U) {
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vWP; varying vec3 vN;
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.0);
        vWP = wp.xyz; vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      uniform float uNight;
      varying vec3 vWP; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN);
        float streak = snoise(vec3(vWP.x*0.05, vWP.y*0.008, vWP.z*0.05))*0.5+0.5;
        float stain = smoothstep(0.55, 0.85, snoise(vec3(vWP.x*0.12, vWP.y*0.015, vWP.z*0.12))*0.5+0.5);
        float fine = snoise(vWP*0.45)*0.5+0.5;
        vec3 albedo = mix(vec3(0.07,0.068,0.066), vec3(0.24,0.225,0.2), streak);
        albedo *= 0.75 + 0.45*fine;
        // exfoliation sheets: broad curved bands of lighter and darker rock
        float sheets = sin(vWP.y*0.09 + snoise(vec3(vWP.xz*0.012, 0.0))*4.0);
        albedo *= 0.85 + 0.25*smoothstep(-0.4, 0.8, sheets);
        float ao = smoothstep(-10.0, 60.0, vWP.y);
        albedo *= mix(0.45, 1.0, ao);
        float drip = smoothstep(0.35, 0.9, snoise(vec3(vWP.x*0.35, vWP.y*0.02, vWP.z*0.35))*0.5+0.5);
        albedo = mix(albedo, vec3(0.035,0.032,0.03), max(stain*0.7, drip*0.55)); // dark water streaks down the walls
        float ledge = smoothstep(0.5, 0.8, n.y)*smoothstep(0.45, 0.6, snoise(vWP*0.25)*0.5+0.5);
        albedo = mix(albedo, vec3(0.03,0.08,0.045), ledge*0.9); // pines clinging to ledges
        float diff = max(dot(n, uSunDir), 0.0);
        float wrap = clamp(dot(n, uSunDir)*0.5 + 0.5, 0.0, 1.0);
        vec3 col = albedo*(uSkyColor*0.35*wrap + uSkyColor*0.12 + uSunColor*diff*0.95);
        float dist = distance(vWP, cameraPosition);
        col = mix(col, uFogColor, clamp(0.04 + dist/900.0, 0.0, 0.42));
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const group = new THREE.Group();
  const add = (geo, x, z, ry) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 8, z);
    m.rotation.y = ry;
    group.add(m);
  };
  // Half Dome: rounded back, sheer face (left of the cove)
  add(granite(1, { sx: 48, sy: 78, sz: 40, cutX: 0.3 }), -135, -215, -0.45);
  // El Capitan: a vast flat-topped wall (right of the cove)
  add(granite(2, { sx: 66, sy: 64, sz: 32, cutZ: 0.15, flatTop: 0.7 }), 150, -205, -0.62);
  // softer domes ringing the valley
  add(granite(3, { sx: 60, sy: 48, sz: 55 }), -215, -60, 0.3);
  add(granite(4, { sx: 55, sy: 62, sz: 45, cutX: 0.45 }), 210, 60, 2.6);
  add(granite(5, { sx: 70, sy: 55, sz: 60 }), -70, 225, 1.0);
  add(granite(6, { sx: 50, sy: 70, sz: 40, cutZ: 0.3, flatTop: 0.75 }), 100, 215, 3.6);
  add(granite(7, { sx: 45, sy: 40, sz: 45 }), -200, 120, 0.0);
  return group;
}

// ---------------------------------------------------------------- pines
export function createPines(U) {
  const r = rng(1906);
  const geos = [];
  let placed = 0, guard = 0;
  while (placed < 320 && guard++ < 4000) {
    const a = r() * Math.PI * 2;
    const rr = 44 + Math.pow(r(), 0.8) * 95;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (bayMask(x, z) > 0.01 || -z / rr > 0.62 && rr < 75) continue;
    // stands of pines, not a lawn of them
    if (vnoise(x * 0.04, 3, z * 0.04) < 0.45) continue;
    const H = 7 + r() * 9;
    const y = heightAt(x, z);
    for (let k = 0; k < 3; k++) {
      const rad = H * (0.26 - k * 0.06);
      const c = new THREE.ConeGeometry(rad, H * 0.55, 9, 3);
      const cp = c.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const n = vnoise(cp.getX(i) * 1.3 + x, cp.getY(i) * 1.3, cp.getZ(i) * 1.3 + z) - 0.5;
        cp.setX(i, cp.getX(i) * (1 + n * 0.5));
        cp.setZ(i, cp.getZ(i) * (1 + n * 0.5));
      }
      c.translate(x, y + H * (0.35 + k * 0.22), z);
      geos.push(c);
    }
    const trunk = new THREE.CylinderGeometry(H * 0.025, H * 0.04, H * 0.4, 5);
    trunk.translate(x, y + H * 0.15, z);
    geos.push(trunk);
    placed++;
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vWP; varying vec3 vN;
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.0);
        vWP = wp.xyz; vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      varying vec3 vWP; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN);
        float nz = snoise(vWP*0.9)*0.5+0.5;
        float wrap = clamp((dot(n, uSunDir) + 0.35)/1.35, 0.0, 1.0);
        vec3 albedo = mix(vec3(0.010,0.032,0.028), vec3(0.05,0.12,0.065), wrap)*(0.75 + 0.5*nz);
        vec3 col = albedo*(uSkyColor*0.75 + uSunColor*(0.2 + 0.8*wrap));
        col = applyFog(col, vWP);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  return new THREE.Mesh(mergeGeometries(geos), mat);
}

// ---------------------------------------------------------------- palms
function frond(top, az, len, droop, r) {
  const pos = [];
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const rib = (t) =>
    top.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.55) * len * 0.35 - t * t * droop, 0));
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a = rib(t0), b = rib(t1);
    const tan = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
    const L = (0.12 + 0.75 * Math.sin(Math.PI * Math.min(t0 * 1.1, 1))) * len * 0.28;
    for (const s of [-1, 1]) {
      const tip = a.clone().addScaledVector(side, s * L).add(new THREE.Vector3(0, -L * 0.45, 0)).addScaledVector(tan, L * 0.3);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function createPalms() {
  const r = rng(92101);
  const trunks = [], fronds = [], skirts = [];
  // tall, skinny skyline palms along the bluff above the cove
  const spots = [
    [-19, 38], [-13, 40.5], [-7, 37.5], [8, 39], [13.5, 41], [19, 38], [-24, 41],
    [-4, 70], [3, 72], [11, 69],
  ];
  for (const [deg, rr] of spots) {
    const a = (-90 + deg) * (Math.PI / 180);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const y = heightAt(x, z);
    const H = 11 + r() * 5;
    const lean = new THREE.Vector3((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y - 0.3, z),
      new THREE.Vector3(x + lean.x * 0.2, y + H * 0.4, z + lean.z * 0.2),
      new THREE.Vector3(x + lean.x * 0.6, y + H * 0.8, z + lean.z * 0.6),
      new THREE.Vector3(x + lean.x, y + H, z + lean.z),
    ]);
    const tg = new THREE.TubeGeometry(curve, 24, 0.22, 7, false);
    const tp = tg.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < tp.count; i++) {
      const t = Math.floor(i / 8) / 24;
      curve.getPointAt(t, c);
      v.fromBufferAttribute(tp, i).sub(c);
      v.multiplyScalar((1.25 - t * 0.5) * (1 + 0.06 * Math.sin(t * 160)));
      v.add(c);
      tp.setXYZ(i, v.x, v.y, v.z);
    }
    tg.computeVertexNormals();
    trunks.push(tg);
    const top = curve.getPointAt(1);
    const skirt = new THREE.CylinderGeometry(0.42, 0.24, 1.3, 9, 2);
    skirt.translate(top.x, top.y - 0.7, top.z);
    skirts.push(skirt);
    const nf = 13;
    for (let i = 0; i < nf; i++) {
      fronds.push(frond(top, (i / nf) * Math.PI * 2 + r() * 0.4, 2.6 + r() * 0.8, 1.6 + r() * 1.0, r));
    }
  }
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ color: 0x8c7b66, roughness: 1 })),
    new THREE.Mesh(mergeGeometries(skirts), new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 1 })),
    new THREE.Mesh(mergeGeometries(fronds), new THREE.MeshStandardMaterial({ color: 0x4f7d2c, roughness: 0.85, side: THREE.DoubleSide }))
  );
  return group;
}

// ---------------------------------------------------------------- descent clouds
// Puffy billboards the camera falls through on the way down from orbit.
export function createDescentClouds(U) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.attributes.position);
  g.setAttribute("uv", quad.attributes.uv);
  const N = 64;
  const C = new Float32Array(N * 3), S = new Float32Array(N * 2);
  const r = rng(77);
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 65;
    C.set([Math.cos(a) * rr, 100 + r() * 70, 13 + Math.sin(a) * rr], i * 3);
    S.set([28 + r() * 46, r()], i * 2);
  }
  g.setAttribute("aCenter", new THREE.InstancedBufferAttribute(C, 3));
  g.setAttribute("aSize", new THREE.InstancedBufferAttribute(S, 2));
  g.instanceCount = N;
  const uniforms = { uOpacity: { value: 0 }, uSunColor: U.uSunColor, uSkyColor: U.uSkyColor };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aCenter; attribute vec2 aSize;
      varying vec2 vUv; varying float vSeed; varying float vDist;
      void main(){
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = aCenter + (right*position.x + up*position.y)*aSize.x;
        vUv = uv; vSeed = aSize.y; vDist = distance(aCenter, cameraPosition);
        gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uOpacity; uniform vec3 uSunColor; uniform vec3 uSkyColor;
      varying vec2 vUv; varying float vSeed; varying float vDist;
      void main(){
        vec2 q = vUv - 0.5;
        float rr = length(q)*2.0;
        float n = snoise(vec3(q*3.0, vSeed*10.0))*0.5 + snoise(vec3(q*7.0, vSeed*20.0))*0.25;
        float a = smoothstep(1.0, 0.2, rr + n*0.5);
        float near = smoothstep(6.0, 40.0, vDist);
        vec3 c = mix(uSkyColor, vec3(1.0), 0.7 + 0.3*(q.y + 0.5))*(0.85 + 0.25*uSunColor.g);
        gl_FragColor = vec4(c, a*uOpacity*near*0.92);
        ${OUT}
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, uniforms };
}
