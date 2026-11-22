import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { NOISE, COMMON, OUT, rng, vnoise } from "./glsl.js";
import { heightAt, bayMask } from "./terrain.js";

// Shared foliage shading: toon-ish ramp, warm sunlit tops, cool shade, sakura blend.
const FOLIAGE = /* glsl */ `
uniform float uBloom;
vec3 foliage(vec3 nIn, vec3 wp, float ao, float leaf, float tint){
  vec3 n = normalize(nIn + vec3(leaf*0.35));
  float wrap = clamp((dot(n, uSunDir) + 0.4)/1.4, 0.0, 1.0);
  float lit = smoothstep(0.3, 0.85, wrap) * mix(0.25, 1.0, ao);
  vec3 shadeC = vec3(0.022,0.068,0.05);
  vec3 midC   = vec3(0.045,0.150,0.035);
  vec3 lightC = mix(vec3(0.19,0.36,0.045), vec3(0.34,0.42,0.06), tint);
  vec3 albedo = mix(shadeC, midC, smoothstep(0.0, 0.4, lit));
  albedo = mix(albedo, lightC, smoothstep(0.42, 1.0, lit));
  vec3 pink = mix(vec3(0.42,0.17,0.30), mix(vec3(0.78,0.26,0.40), vec3(0.88,0.48,0.58), tint), smoothstep(0.05, 0.9, lit));
  float bl = clamp(uBloom*1.15 - (1.0-tint)*0.15*uBloom, 0.0, 1.0);
  albedo = mix(albedo, pink*0.62, bl);
  vec3 V = normalize(cameraPosition - wp);
  float back = pow(max(dot(-V, uSunDir), 0.0), 4.0);
  float rim = pow(1.0 - abs(dot(normalize(nIn), V)), 2.5);
  vec3 col = albedo*(uSkyColor*0.8 + uSunColor*(0.2 + 0.95*lit));
  col += uSunColor*mix(vec3(0.42,0.55,0.12), vec3(0.8,0.4,0.45), bl)*back*rim*ao*0.7;
  return applyFog(col, wp);
}
`;

const SWAY = /* glsl */ `
vec3 sway(vec3 wp){
  float s = snoise(vec3(wp.xz*0.08, uTime*0.35))*0.12*uWind;
  float f = sin(uTime*3.0 + wp.x*2.1 + wp.y*1.7)*0.025*uWind;
  float k = clamp((wp.y - 2.0)/5.0, 0.0, 1.0);
  wp.xz += vec2(s + f, s*0.4)*k;
  return wp;
}
`;

export function canopyMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      ${SWAY}
      attribute float aAO;
      varying vec3 vWP; varying vec3 vN; varying float vAO;
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.0);
        wp.xyz = sway(wp.xyz);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix)*normal);
        vAO = aAO;
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      ${FOLIAGE}
      varying vec3 vWP; varying vec3 vN; varying float vAO;
      void main(){
        float leaf = snoise(vWP*2.4)*0.6 + snoise(vWP*7.0)*0.3;
        // the inner mass sits a little darker so leaf cards read on top of it
        vec3 col = foliage(vN, vWP, vAO*0.8, leaf, 0.3);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
}

// Thousands of little leaf cards scattered over each canopy skin.
export function createLeaves(U, trees, perTree) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.attributes.position);
  g.setAttribute("uv", quad.attributes.uv);
  const total = trees.length * perTree;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), R = new Float32Array(total * 4);
  const r = rng(321);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  let k = 0;
  for (const t of trees) {
    const geo = t.canopy.geometry;
    const pos = geo.attributes.position, nrm = geo.attributes.normal, ao = geo.attributes.aAO;
    const m = t.group.matrixWorld;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < perTree; i++) {
      const j = Math.floor(r() * pos.count);
      v.fromBufferAttribute(pos, j);
      n.fromBufferAttribute(nrm, j);
      // skip deep interior points
      if (ao.getX(j) < 0.25 && r() < 0.8) { i--; continue; }
      v.addScaledVector(n, -0.08 + r() * 0.2).applyMatrix4(m);
      n.applyMatrix3(nm).normalize();
      P.set([v.x, v.y, v.z], k * 3);
      N.set([n.x, n.y, n.z], k * 3);
      R.set([r() * Math.PI * 2, (0.2 + r() * 0.17) * t.spec.s, r(), ao.getX(j)], k * 4);
      k++;
    }
  }
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute("aNrm", new THREE.InstancedBufferAttribute(N, 3));
  g.setAttribute("aRnd", new THREE.InstancedBufferAttribute(R, 4));
  g.instanceCount = k;

  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      ${SWAY}
      attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aRnd;
      varying vec2 vUv; varying vec3 vWP; varying vec3 vN; varying float vAO; varying float vTint;
      void main(){
        vec3 n = normalize(aNrm);
        vec3 up = abs(n.y) > 0.9 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
        vec3 t = normalize(cross(up, n));
        vec3 b = cross(n, t);
        float c = cos(aRnd.x), s = sin(aRnd.x);
        vec3 tt = t*c + b*s, bb = -t*s + b*c;
        // tilt the card off the surface so it catches light at different angles
        tt = normalize(tt + n*(aRnd.z-0.5)*1.2);
        float flutter = sin(uTime*(4.0+aRnd.z*3.0) + aRnd.x*10.0)*0.12*uWind;
        vec3 p = aPos + (tt*position.x + bb*position.y*1.0)*aRnd.y;
        p += n*position.y*flutter*aRnd.y;
        p = sway(p);
        vUv = uv; vWP = p; vN = normalize(n + bb*(aRnd.z-0.5)*0.6); vAO = aRnd.w; vTint = aRnd.z;
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${COMMON}
      ${FOLIAGE}
      varying vec2 vUv; varying vec3 vWP; varying vec3 vN; varying float vAO; varying float vTint;
      void main(){
        vec2 q = vUv - 0.5;
        float w = 0.32*pow(sin(3.14159*(q.y+0.5)), 0.75);
        if (abs(q.x) > w) discard;
        float rib = 1.0 - smoothstep(0.0, 0.03, abs(q.x))*0.0;
        float leaf = snoise(vWP*2.4)*0.6;
        vec3 col = foliage(vN, vWP, vAO, leaf, vTint);
        col *= 0.92 + 0.16*smoothstep(0.0, w, abs(q.x));
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function blob(radius, detail, seed, center, canopyCenter, canopyR) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const len = v.length();
    const n = vnoise(v.x * 1.1 + seed, v.y * 1.1, v.z * 1.1) * 0.55 + vnoise(v.x * 2.6, v.y * 2.6 + seed, v.z * 2.6) * 0.25;
    v.multiplyScalar(1 + (n - 0.4) * 0.38);
    if (v.y < -radius * 0.35) v.y = -radius * 0.35 + (v.y + radius * 0.35) * 0.45; // flatter undersides
    v.add(center);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const ao = new Float32Array(p.count);
  const tmp = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i).sub(canopyCenter);
    const outward = tmp.length() / canopyR;
    nn.fromBufferAttribute(nrm, i);
    const facing = nn.dot(tmp.normalize()) * 0.5 + 0.5;
    const vert = (p.getY(i) - (canopyCenter.y - canopyR)) / (canopyR * 2);
    ao[i] = Math.min(1, Math.max(0, facing * 0.55 + Math.min(outward, 1) * 0.25 + vert * 0.4));
  }
  g.setAttribute("aAO", new THREE.BufferAttribute(ao, 1));
  return g;
}

function taperedTube(curve, radius, tubular, radial, taperEnd, flare = 0) {
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const seg = Math.floor(i / (radial + 1));
    const t = seg / tubular;
    curve.getPointAt(t, c);
    v.fromBufferAttribute(p, i).sub(c);
    const taper = 1 + (taperEnd - 1) * t + flare * Math.pow(1 - Math.min(t / 0.14, 1), 2);
    v.multiplyScalar(taper).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildTree(spec, canopyMat, barkMat) {
  const { s, seed } = spec;
  const r = rng(seed);
  const group = new THREE.Group();

  const trunkTop = new THREE.Vector3((r() - 0.5) * 0.6, 3.0, (r() - 0.5) * 0.6).multiplyScalar(s);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0),
    new THREE.Vector3((r() - 0.5) * 0.4 * s, 1.1 * s, (r() - 0.5) * 0.4 * s),
    new THREE.Vector3((r() - 0.5) * 0.5 * s, 2.2 * s, (r() - 0.5) * 0.5 * s),
    trunkTop,
  ]);
  const woods = [taperedTube(trunkCurve, 0.32 * s, 20, 10, 0.5, 0.9)];

  const canopyCenter = new THREE.Vector3(trunkTop.x, 4.5 * s, trunkTop.z);
  const canopyR = 3.1 * s;
  const blobs = [];
  blobs.push(blob(2.0 * s, 3, r() * 50, canopyCenter.clone(), canopyCenter, canopyR));
  const NB = 10;
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * Math.PI * 2 + r() * 0.5;
    const up = i % 3 === 0 ? 0.75 : (r() - 0.3) * 0.7;
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const c = canopyCenter.clone().addScaledVector(dir, (1.55 + r() * 0.5) * s);
    const br = (1.05 + r() * 0.55) * s;
    blobs.push(blob(br, 3, r() * 50, c, canopyCenter, canopyR));
    // branch reaching toward the lower/outer blobs
    if (up < 0.45 && woods.length < 7) {
      const start = trunkCurve.getPointAt(0.6 + r() * 0.35);
      const end = c.clone().lerp(canopyCenter, 0.25);
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.35 * s, 0));
      woods.push(taperedTube(new THREE.CatmullRomCurve3([start, mid, end]), 0.13 * s, 10, 6, 0.35));
    }
  }
  const canopyGeo = mergeGeometries(blobs);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  const bark = new THREE.Mesh(mergeGeometries(woods), barkMat);
  group.add(bark, canopy);

  // apple spots on the outer skin of the canopy
  const apples = [];
  const cp = canopyGeo.attributes.position, cn = canopyGeo.attributes.normal;
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  let guard = 0;
  while (apples.length < 11 && guard++ < 4000) {
    const i = Math.floor(r() * cp.count);
    P.fromBufferAttribute(cp, i);
    N.fromBufferAttribute(cn, i);
    const out = P.clone().sub(canopyCenter);
    if (N.y > 0.25 || N.y < -0.85) continue;
    if (out.length() < canopyR * 0.75) continue;
    if (P.y > canopyCenter.y + 0.6 * s) continue;
    if (apples.some((a) => a.distanceTo(P) < 0.7)) continue;
    apples.push(P.clone().addScaledVector(N, 0.2));
  }

  return { group, canopy, bark, canopyCenter, canopyR, apples, trunkCurve };
}

// Hazy treeline on the far hills.
export function createFarTrees(canopyMat, barkMat) {
  const r = rng(404);
  const geos = [];
  const trunks = [];
  for (let i = 0; i < 130; i++) {
    const a = r() * Math.PI * 2;
    const rr = 40 + Math.pow(r(), 0.7) * 45;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // leave a few gaps so the far hills breathe, and keep the cove open
    if (Math.sin(a * 5 + 1.3) > 0.55) continue;
    if (bayMask(x, z) > 0.0 || (-z / rr > 0.55 && rr > 34)) continue;
    const y = heightAt(x, z);
    const sc = 1.8 + r() * 2.0;
    const c = new THREE.Vector3(x, y + sc * 1.25, z);
    const tg = new THREE.CylinderGeometry(sc * 0.07, sc * 0.11, sc * 1.3, 5);
    tg.translate(x, y + sc * 0.5, z);
    trunks.push(tg);
    for (let k = 0; k < 4; k++) {
      const off = new THREE.Vector3((r() - 0.5) * sc * 1.2, (r() - 0.25) * sc * 0.7, (r() - 0.5) * sc * 1.2);
      geos.push(blob(sc * (0.6 + r() * 0.35), 2, r() * 50, c.clone().add(off), c, sc * 1.3));
    }
  }
  const canopy = new THREE.Mesh(mergeGeometries(geos), canopyMat);
  const group = new THREE.Group();
  group.add(canopy, new THREE.Mesh(mergeGeometries(trunks), barkMat));
  // looks like a tree to createLeaves()
  const asTree = { canopy, group, spec: { s: 2.0 } };
  return { group, asTree };
}
