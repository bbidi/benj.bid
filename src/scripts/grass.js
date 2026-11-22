import * as THREE from "three";
import { NOISE, COMMON, OUT, rng, vnoise } from "./glsl.js";
import { heightAt } from "./terrain.js";

// Wind + pointer bending shared by grass and flowers.
const WIND = /* glsl */ `
uniform vec3 uPointer;
uniform float uPush;
vec2 windBend(vec3 base, float rnd, float h){
  vec2 wdir = normalize(vec2(1.0, 0.35));
  float n = snoise(vec3(base.xz*0.055 - wdir*uTime*0.45, uTime*0.12));
  float n2 = snoise(vec3(base.xz*0.45, uTime*0.8 + rnd*3.0));
  float sway = (0.25 + 0.75*(n*0.5+0.5))*uWind + n2*0.1;
  vec2 bend = wdir*sway*0.75;
  vec2 tp = base.xz - uPointer.xz;
  float pd = length(tp);
  float push = (1.0 - smoothstep(0.0, 1.7, pd))*uPush;
  bend += (tp/(pd+0.001))*push*1.4;
  return bend;
}
`;

function bladeGeometry() {
  const segs = 5;
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) {
    const y = i / segs;
    pos.push(-0.5, y, 0, 0.5, y, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const t = (segs - 1) * 2;
  idx.push(t, t + 1, segs * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function createGrass(U, Q, excluded) {
  const g = bladeGeometry();
  const total = Q.grassInner + Q.grassMid + Q.grassOuter;
  const off = new Float32Array(total * 3);
  const par = new Float32Array(total * 4);
  const r = rng(7);
  let n = 0;

  function scatter(count, rMin, rMax, wMul, hMul) {
    for (let i = 0; i < count; i++) {
      let x, z, rr, ok = false;
      for (let k = 0; k < 8 && !ok; k++) {
        rr = Math.sqrt(rMin * rMin + r() * (rMax * rMax - rMin * rMin));
        const a = r() * Math.PI * 2;
        x = Math.cos(a) * rr;
        z = Math.sin(a) * rr;
        ok = !excluded(x, z);
      }
      if (!ok) continue;
      const patch = vnoise(x * 0.11, 0, z * 0.11);
      const hgt = (0.24 + 0.46 * patch * patch + r() * 0.16) * hMul;
      off[n * 3] = x;
      off[n * 3 + 1] = heightAt(x, z) - 0.03;
      off[n * 3 + 2] = z;
      par[n * 4] = r() * Math.PI * 2;
      par[n * 4 + 1] = (0.045 + r() * 0.04) * wMul;
      par[n * 4 + 2] = hgt;
      par[n * 4 + 3] = r();
      n++;
    }
  }
  scatter(Q.grassInner, 0, 14, 1, 1);
  scatter(Q.grassMid, 14, 26, 1.55, 1.05);
  scatter(Q.grassOuter, 26, 46, 2.6, 1.15);

  // shuffle so that lowering instanceCount thins every ring evenly (adaptive quality)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    for (let k = 0; k < 3; k++) [off[i * 3 + k], off[j * 3 + k]] = [off[j * 3 + k], off[i * 3 + k]];
    for (let k = 0; k < 4; k++) [par[i * 4 + k], par[j * 4 + k]] = [par[j * 4 + k], par[i * 4 + k]];
  }

  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute("aParams", new THREE.InstancedBufferAttribute(par, 4));
  g.instanceCount = n;

  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      ${WIND}
      attribute vec3 aOffset; attribute vec4 aParams;
      varying float vH; varying vec3 vWP; varying float vRand; varying vec3 vNrm;
      void main(){
        float h = position.y;
        float rot = aParams.x, wdt = aParams.y, hgt = aParams.z, rnd = aParams.w;
        float c = cos(rot), s = sin(rot);
        vec3 p = vec3(position.x*wdt*(1.0 - h*0.75), h*hgt, 0.0);
        p = vec3(p.x*c, p.y, p.x*s);
        vec2 bend = windBend(aOffset, rnd, h) + vec2(-s, c)*(rnd-0.5)*0.5;
        float k = h*h;
        p.xz += bend*k*hgt;
        p.y -= dot(bend,bend)*k*hgt*0.28;
        vec3 wp = aOffset + p;
        vWP = wp; vH = h; vRand = rnd;
        vNrm = normalize(vec3(-s, 0.9, c));
        gl_Position = projectionMatrix*viewMatrix*vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      uniform float uNight;
      varying float vH; varying vec3 vWP; varying float vRand; varying vec3 vNrm;
      void main(){
        float pch = snoise(vec3(vWP.xz*0.045, 5.0))*0.5+0.5;
        float warm = snoise(vec3(vWP.xz*0.11, 9.0))*0.5+0.5;
        vec3 baseC = vec3(0.008,0.03,0.008);
        vec3 tipC = mix(vec3(0.085,0.26,0.05), vec3(0.15,0.32,0.035), vRand);
        tipC = mix(tipC, vec3(0.05,0.20,0.07), pch*0.7);                 // emerald drifts
        tipC = mix(tipC, vec3(0.34,0.36,0.08), smoothstep(0.6, 0.95, warm)*vRand); // golden seedheads
        vec3 albedo = mix(baseC, tipC, smoothstep(0.0, 0.95, vH));
        float L = dapple(vWP);
        vec3 n = normalize(vNrm);
        if (!gl_FrontFacing) n.xz = -n.xz;
        float diff = max(dot(n, uSunDir), 0.0)*0.65 + 0.35;
        vec3 V = normalize(cameraPosition - vWP);
        float trans = pow(max(dot(-V, uSunDir), 0.0), 5.0)*vH*vH;
        float ao = mix(0.3, 1.0, vH);
        vec3 col = albedo*(uSkyColor*0.55*ao + uSunColor*diff*L*1.25*ao);
        col += uSunColor*vec3(0.62,0.7,0.22)*trans*L*0.45;
        col += albedo*lampLight(vWP)*2.2*ao;
        col = applyFog(col, vWP);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// Little meadow flowers bobbing among the grass.
export function createFlowers(U, Q, excluded) {
  const base = new THREE.CircleGeometry(1, 20);
  const bp = base.attributes.position;
  for (let i = 1; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i);
    const a = Math.atan2(y, x);
    const rr = 0.45 + 0.55 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.7);
    bp.setXY(i, Math.cos(a) * rr, Math.sin(a) * rr);
  }
  base.rotateX(-Math.PI / 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);

  const N = Q.flowers;
  const off = new Float32Array(N * 3), par = new Float32Array(N * 4);
  const r = rng(99);
  let n = 0;
  for (let i = 0; i < N; i++) {
    const rr = Math.sqrt(r()) * 34, a = r() * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (excluded(x, z)) continue;
    // clump flowers into drifts
    if (vnoise(x * 0.15, 4, z * 0.15) < 0.5 && r() > 0.08) continue;
    off.set([x, heightAt(x, z) + 0.38 + r() * 0.3, z], n * 3);
    par.set([0.07 + r() * 0.04, r() * 6.28, Math.floor(r() * 4), r()], n * 4);
    n++;
  }
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute("aParams", new THREE.InstancedBufferAttribute(par, 4));
  g.instanceCount = n;

  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      ${WIND}
      attribute vec3 aOffset; attribute vec4 aParams;
      varying vec3 vWP; varying float vR; varying float vKind;
      void main(){
        float size = aParams.x, rot = aParams.y;
        float c = cos(rot), s = sin(rot);
        vec3 p = position*size;
        p = vec3(p.x*c - p.z*s, p.y, p.x*s + p.z*c);
        p.y += p.x*0.35;
        vec2 bend = windBend(aOffset, aParams.w, 1.0);
        vec3 wp = aOffset + p;
        float hh = aOffset.y;
        wp.xz += bend*0.32;
        wp.y -= dot(bend,bend)*0.08;
        vWP = wp; vR = length(position.xz); vKind = aParams.z;
        gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      varying vec3 vWP; varying float vR; varying float vKind;
      void main(){
        vec3 petal = vKind < 0.5 ? vec3(0.95,0.95,0.9) : vKind < 1.5 ? vec3(1.0,0.82,0.3) : vKind < 2.5 ? vec3(0.62,0.52,0.95) : vec3(1.0,0.62,0.72);
        vec3 albedo = mix(vec3(1.0,0.7,0.12), petal, smoothstep(0.22, 0.32, vR));
        float L = dapple(vWP);
        vec3 col = albedo*(uSkyColor*0.5 + uSunColor*L*0.85 + lampLight(vWP)*1.5);
        col = applyFog(col, vWP);
        gl_FragColor = vec4(col,1.0);
        ${OUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}
