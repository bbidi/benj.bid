import * as THREE from "three";
import { rng, vnoise } from "./glsl.js";
import { heightAt } from "./terrain.js";

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });

function rockGeo(seed, rx, ry, rz) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 1.8 + seed, v.y * 1.8, v.z * 1.8);
    v.multiplyScalar(0.85 + n * 0.3);
    v.set(v.x * rx, v.y * ry, v.z * rz);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- stepping stones (tobi-ishi) ----------
export function createStones() {
  const group = new THREE.Group();
  const mat = std(0x8a8d86, { roughness: 1 });
  const mossMat = std(0x6f7c55, { roughness: 1 });
  const r = rng(12);
  const spots = [];
  const a = new THREE.Vector2(0.4, 11.5), c = new THREE.Vector2(4.6, 8.2), b = new THREE.Vector2(3.0, 4.4);
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x + (r() - 0.5) * 0.35;
    const z = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y + (r() - 0.5) * 0.2;
    const sx = 0.42 + r() * 0.18, sz = 0.34 + r() * 0.14;
    const m = new THREE.Mesh(rockGeo(r() * 40, sx, 0.13, sz), r() > 0.7 ? mossMat : mat);
    m.position.set(x, heightAt(x, z) + 0.02, z);
    m.rotation.y = r() * Math.PI;
    group.add(m);
    spots.push({ x, z, r: Math.max(sx, sz) + 0.08 });
  }
  return { group, spots };
}

// ---------- stone lantern (ishi-dōrō) ----------
export function createLantern() {
  const g = new THREE.Group();
  const stone = std(0x9a9b94, { roughness: 1 });
  const add = (geo, y, mat = stone) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 6), 0.08);
  add(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 6), 0.21);
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.75, 10), 0.63);
  add(new THREE.CylinderGeometry(0.4, 0.22, 0.16, 6), 1.07);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x2a2116, emissive: 0xffa548, emissiveIntensity: 0, roughness: 1 });
  const glow = add(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 6), 1.32, glowMat);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.07), stone);
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    post.position.set(Math.cos(a) * 0.25, 1.32, Math.sin(a) * 0.25);
    g.add(post);
  }
  const roof = add(new THREE.ConeGeometry(0.64, 0.34, 6), 1.66);
  roof.scale.y = 0.9;
  add(new THREE.CylinderGeometry(0.6, 0.62, 0.05, 6), 1.5);
  add(new THREE.SphereGeometry(0.09, 12, 8), 1.88);
  add(new THREE.ConeGeometry(0.06, 0.12, 8), 1.98);
  const light = new THREE.PointLight(0xffa04a, 0, 9, 1.6);
  light.position.y = 1.32;
  g.add(light);
  return { group: g, glowMat, light, hit: [glow, roof] };
}

// ---------- fūrin (glass wind chime) ----------
export function createFurin() {
  const pivot = new THREE.Group();
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 4), std(0xeeeeee));
  string.position.y = -0.45;
  pivot.add(string);
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xcfe9ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMat);
  bell.position.y = -0.92;
  pivot.add(bell);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.008, 6, 24), std(0xd83a2e, { roughness: 0.5 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = -0.95;
  pivot.add(band);
  const clapperString = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 4), std(0xeeeeee));
  clapperString.position.y = -1.04;
  pivot.add(clapperString);
  const stripPivot = new THREE.Group();
  stripPivot.position.y = -1.14;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.26), std(0xf3ead8, { side: THREE.DoubleSide, roughness: 1 }));
  strip.position.y = -0.13;
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.16), std(0xc0392b, { side: THREE.DoubleSide }));
  ink.position.set(0, -0.12, 0.001);
  stripPivot.add(strip, ink);
  pivot.add(stripPivot);
  return { group: pivot, stripPivot, hit: [bell, strip, band] };
}

// ---------- kitsune ----------
export function createFox() {
  const g = new THREE.Group();
  const orange = std(0xd8742c, { roughness: 0.85 });
  const cream = std(0xf4e9d8);
  const dark = std(0x2a1a14);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), orange);
  body.scale.set(0.95, 1.25, 1.1);
  body.position.set(0, 0.25, 0);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), cream);
  chest.position.set(0, 0.3, 0.12);
  chest.scale.set(0.9, 1.3, 0.7);
  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.06);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), orange);
  skull.scale.set(1.05, 0.92, 1);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), cream);
  cheek.position.set(0, -0.04, 0.07);
  cheek.scale.set(1.2, 0.7, 0.9);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10), cream);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.03, 0.17);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), dark);
  nose.position.set(0, -0.02, 0.25);
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 4), orange);
    ear.position.set(sx * 0.075, 0.13, -0.01);
    ear.rotation.z = -sx * 0.25;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), dark);
    tip.position.y = 0.05;
    ear.add(tip);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), dark);
    eye.position.set(sx * 0.055, 0.015, 0.12);
    head.add(ear, eye);
    ears.push(ear);
  }
  head.add(skull, cheek, snout, nose);
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.1, -0.18);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), orange);
  tail.scale.set(1, 1, 3);
  tail.position.set(0.12, 0.02, -0.18);
  tail.rotation.y = -0.6;
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), cream);
  tailTip.position.set(0.27, 0.03, -0.38);
  tailPivot.add(tail, tailTip);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.24, 6), orange);
    leg.position.set(sx * 0.08, 0.1, 0.1);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 6), dark);
    paw.position.y = -0.12;
    leg.add(paw);
    g.add(leg);
  }
  g.add(body, chest, head, tailPivot);
  return { group: g, head, ears, tailPivot };
}

// ---------- mochi ----------
export function createMochi() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 28, 20), std(0xfbf7f0, { roughness: 0.55 }));
  body.scale.set(1.15, 0.8, 1.05);
  body.position.y = 0.22;
  const dark = std(0x1d1d1d, { roughness: 0.3 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 1, transparent: true, opacity: 0.7 });
  const face = new THREE.Group();
  face.position.set(0, 0.24, 0.27);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), dark);
    eye.position.set(sx * 0.09, 0.02, 0);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), blushMat);
    blush.position.set(sx * 0.15, -0.03, -0.01);
    blush.rotation.y = sx * 0.4;
    face.add(eye, blush);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), dark);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.02, 0.005);
  face.add(mouth);
  const squish = new THREE.Group();
  squish.add(body, face);
  g.add(squish);
  g.visible = false;
  return { group: g, squish, hit: [body] };
}

// ---------- butterflies ----------
export function createButterflies(count = 6) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.03, 0.14, 0.2, 0.17, 0.19, 0.04);
  shape.bezierCurveTo(0.2, -0.02, 0.12, -0.03, 0.06, -0.02);
  shape.bezierCurveTo(0.14, -0.06, 0.12, -0.15, 0.04, -0.1);
  shape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(shape, 8);
  wingGeo.rotateX(-Math.PI / 2);
  const cols = [0xfff1a8, 0xffffff, 0xbfe0ff, 0xffd0a0, 0xfff1a8, 0xe9d5ff];
  const r = rng(77);
  const list = [];
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.7, emissive: cols[i % cols.length], emissiveIntensity: 0.15 });
    const L = new THREE.Mesh(wingGeo, mat), Rw = new THREE.Mesh(wingGeo, mat);
    L.scale.x = -1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.12, 5), std(0x2b2b2b));
    body.rotation.x = Math.PI / 2;
    b.add(L, Rw, body);
    b.scale.setScalar(0.85 + r() * 0.4);
    group.add(b);
    list.push({ obj: b, L, R: Rw, seed: r() * 100, speed: 0.6 + r() * 0.5, pos: new THREE.Vector3(), prev: new THREE.Vector3() });
  }
  return { group, list };
}

// ---------- planted flower ----------
const PLANT_COLORS = [0xff8fb1, 0xffd166, 0xffffff, 0xb79cff, 0xff6b5b, 0x8fd3ff];
export function createPlantedFlower(seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  const h = 0.45 + r() * 0.35;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 5), std(0x3f7a2a));
  stem.position.y = h / 2;
  const head = new THREE.Group();
  head.position.y = h;
  const color = PLANT_COLORS[Math.floor(r() * PLANT_COLORS.length)];
  const petalMat = std(color, { roughness: 0.6, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.12 });
  const np = 5 + Math.floor(r() * 4);
  for (let i = 0; i < np; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), petalMat);
    p.scale.set(1, 0.25, 0.55);
    const a = (i / np) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.065, 0, Math.sin(a) * 0.065);
    p.rotation.y = -a;
    head.add(p);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(0xffb703, { roughness: 0.8 }));
  center.scale.y = 0.6;
  head.add(center);
  head.rotation.x = 0.35;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std(0x4c8a2f, { side: THREE.DoubleSide }));
  leaf.scale.set(1, 0.15, 0.4);
  leaf.position.set(0.05, h * 0.35, 0);
  g.add(stem, head, leaf);
  g.scale.setScalar(0.001);
  return g;
}

// ---------- red stag ----------
function antlerBeam(side, size) {
  const s = size;
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * 0.12 * s, 0.25 * s, -0.06 * s),
    new THREE.Vector3(side * 0.28 * s, 0.52 * s, -0.16 * s),
    new THREE.Vector3(side * 0.34 * s, 0.8 * s, -0.08 * s),
    new THREE.Vector3(side * 0.3 * s, 0.98 * s, 0.04 * s),
  ];
  const beam = new THREE.CatmullRomCurve3(pts);
  const geos = [new THREE.TubeGeometry(beam, 16, 0.036 * s, 6, false)];
  // tines reach forward and up off the beam
  [0.18, 0.42, 0.68, 0.86].forEach((t, i) => {
    const p = beam.getPointAt(t);
    const dir = new THREE.Vector3(side * (0.05 + i * 0.03), 0.6, 0.8 - i * 0.15).normalize();
    const len = (0.22 - i * 0.03) * s;
    const end = p.clone().addScaledVector(dir, len);
    const mid = p.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.03 * s, 0));
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p, mid, end]), 6, 0.022 * s, 5, false));
  });
  return geos;
}

export function createStag(antlerSize = 1) {
  const g = new THREE.Group();
  const coat = std(0x8a4426, { roughness: 0.95 });
  const mane = std(0x55301c, { roughness: 1 });
  const pale = std(0xd9b88d, { roughness: 1 });
  const dark = std(0x1d1511, { roughness: 0.6 });
  const antlerMat = std(0xd6c19c, { roughness: 0.8 });
  const sph = (rx, ry, rz, mat) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
    m.scale.set(rx, ry, rz);
    return m;
  };
  const body = sph(0.3, 0.34, 0.68, coat);
  body.position.set(0, 1.12, 0);
  const chest = sph(0.27, 0.33, 0.3, mane);
  chest.position.set(0, 1.15, 0.45);
  const rump = sph(0.15, 0.17, 0.08, pale);
  rump.position.set(0, 1.17, -0.62);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), dark);
  tail.position.set(0, 1.25, -0.7);
  tail.rotation.x = 2.6;
  g.add(body, chest, rump, tail);

  const legs = [];
  for (const [x, z] of [[-0.15, 0.45], [0.15, 0.45], [-0.15, -0.46], [0.15, -0.46]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.0, z);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.45, 7), coat);
    upper.position.y = -0.2;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.52, 6), coat);
    lower.position.y = -0.68;
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.07, 6), dark);
    hoof.position.y = -0.96;
    pivot.add(upper, lower, hoof);
    g.add(pivot);
    legs.push(pivot);
  }

  const neck = new THREE.Group();
  neck.position.set(0, 1.3, 0.5);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.72, 10), mane);
  neckMesh.position.y = 0.32;
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.02);
  const skull = sph(0.12, 0.13, 0.27, coat);
  skull.position.set(0, 0, 0.12);
  const muzzle = sph(0.075, 0.08, 0.1, dark);
  muzzle.position.set(0, -0.04, 0.36);
  head.add(skull, muzzle);
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = sph(0.035, 0.1, 0.02, coat);
    ear.position.set(sx * 0.11, 0.1, -0.03);
    ear.rotation.z = -sx * 0.7;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), dark);
    eye.position.set(sx * 0.09, 0.03, 0.17);
    head.add(ear, eye);
    ears.push(ear);
    if (antlerSize > 0) {
      const a = new THREE.Mesh(mergeAntler(antlerBeam(sx, antlerSize)), antlerMat);
      a.position.set(sx * 0.06, 0.1, -0.02);
      head.add(a);
    }
  }
  neck.add(head);
  g.add(neck);
  return { group: g, neck, head, legs, ears, tail };
}

function mergeAntler(geos) {
  // tiny local merge to avoid importing BufferGeometryUtils here
  const parts = geos.map((g) => g.toNonIndexed());
  let n = 0;
  parts.forEach((p) => (n += p.attributes.position.count));
  const pos = new Float32Array(n * 3);
  let o = 0;
  parts.forEach((p) => {
    pos.set(p.attributes.position.array, o);
    o += p.attributes.position.array.length;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

// ---------- croquet set ----------
const CROQUET_COLORS = [0x2f5fb3, 0xc0392b, 0x1f1f1f, 0xe2b31f];
export function createCroquet() {
  const group = new THREE.Group();
  const wood = std(0xc8a06a, { roughness: 0.7 });
  const mallets = [];
  CROQUET_COLORS.forEach((c) => {
    const m = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.92, 8), wood);
    shaft.position.y = 0.46 + 0.05;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.24, 14), wood);
    head.rotation.z = Math.PI / 2;
    head.position.y = 0.05;
    const bandMat = std(c, { roughness: 0.5 });
    for (const x of [-0.07, 0.07]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), bandMat);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, 0.05, 0);
      m.add(band);
    }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), bandMat);
    grip.position.y = 0.88;
    m.add(shaft, head, grip);
    mallets.push(m);
    group.add(m);
  });
  const balls = CROQUET_COLORS.map((c) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), std(c, { roughness: 0.35 }));
    return b;
  });
  // white wire hoops and a striped stake
  const hoopGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * Math.PI;
      return new THREE.Vector3(Math.cos(a) * 0.14, Math.sin(a) * 0.34 - 0.05, 0);
    })),
    20, 0.008, 5, false
  );
  const hoopMat = std(0xf2f2ee, { roughness: 0.4, metalness: 0.2 });
  const hoops = [0, 1].map(() => {
    const h = new THREE.Mesh(hoopGeo, hoopMat);
    group.add(h);
    return h;
  });
  const stake = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 10), std(0xf2ede0));
  post.position.y = 0.3;
  stake.add(post);
  CROQUET_COLORS.forEach((c, i) => {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.06, 10), std(c));
    band.position.y = 0.6 - i * 0.08;
    stake.add(band);
  });
  group.add(stake);
  return { group, mallets, balls, hoops, stake };
}
