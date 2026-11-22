import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { heightAt, createGround } from "./terrain.js";
import { createOcean, createGranite, createPines, createPalms, createDescentClouds } from "./scenery.js";
import { createSky } from "./sky.js";
import { createGrass, createFlowers } from "./grass.js";
import { buildTree, canopyMaterial, createLeaves, createFarTrees } from "./trees.js";
import { createStones, createLantern, createFurin, createFox, createMochi, createButterflies, createPlantedFlower, createStag, createCroquet } from "./props.js";
import { createMotes, createPetals } from "./particles.js";
import { rng, smoothstep, clamp, easeOutCubic, easeInOutCubic } from "./glsl.js";

const TARGET = new THREE.Vector3(0, 1.5, 0);
const START = new THREE.Vector3(0, 2.3, 13.5);
const ARRIVE_H = 175; // the descent from orbit picks up here, straight above the meadow
const FINAL_PITCH = Math.atan2(TARGET.y - START.y, START.z - TARGET.z);

// Sky palettes keyed by sin(sun elevation).
const PALETTE = [
  { s: -0.3, zenith: 0x060e26, horizon: 0x223660, key: 0x9db2f0, keyI: 0.55, amb: 0x3a5590, fog: 0x1c2b4a, cloud: 0x2a3a5e },
  { s: -0.02, zenith: 0x29386b, horizon: 0xe68a6e, key: 0xff8c5c, keyI: 0.55, amb: 0x6c6a98, fog: 0xbe8b8a, cloud: 0xd99a8c },
  { s: 0.16, zenith: 0x4a74c2, horizon: 0xffb27a, key: 0xffa052, keyI: 1.1, amb: 0x7d90c8, fog: 0xeab48e, cloud: 0xffd2b0 },
  { s: 0.7, zenith: 0x3f8ee0, horizon: 0xd3ebf8, key: 0xfff0d6, keyI: 1.3, amb: 0xb5d2ee, fog: 0xcfe6f3, cloud: 0xffffff },
].map((p) => ({ ...p, zenith: new THREE.Color(p.zenith), horizon: new THREE.Color(p.horizon), key: new THREE.Color(p.key), amb: new THREE.Color(p.amb), fog: new THREE.Color(p.fog), cloud: new THREE.Color(p.cloud) }));

function samplePalette(s, out) {
  let i = 0;
  while (i < PALETTE.length - 2 && s > PALETTE[i + 1].s) i++;
  const a = PALETTE[i], b = PALETTE[i + 1];
  const t = clamp((s - a.s) / (b.s - a.s), 0, 1);
  for (const k of ["zenith", "horizon", "key", "amb", "fog", "cloud"]) out[k].copy(a[k]).lerp(b[k], t);
  out.keyI = a.keyI + (b.keyI - a.keyI) * t;
  return out;
}

const TREES = [
  { x: -7.2, z: -2.2, s: 1.25, seed: 3 },
  { x: 8.8, z: -7.5, s: 1.0, seed: 11 },
  { x: -12, z: 8, s: 0.95, seed: 23 },
  { x: 13.2, z: 7.6, s: 1.08, seed: 5 },
  { x: 1.5, z: -17.5, s: 1.15, seed: 41 },
  { x: -18.5, z: -12, s: 1.05, seed: 17 },
];

// sun elevations (radians) for day → golden hour → night
const TOD = [0.78, 0.13, -0.42];
// by day the sun sits behind-right of the starting view; it swings round to set in front of you
const AZ_DAY = Math.atan2(0.75, 0.55);
const AZ_GOLD = Math.atan2(-1, 0.1); // sets into the Pacific

export function createMeadow(renderer, Q, hooks) {
  const { sound, eggs, toast } = hooks;
  const scene = new THREE.Scene();
  // tall phone screens get a wider lens so the meadow doesn't feel cramped
  const fovFor = (a) => (a < 1 ? 50 + (1 - a) * 32 : 50);
  const camera = new THREE.PerspectiveCamera(fovFor(innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 1200);
  camera.position.copy(START);

  const U = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSkyColor: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 28 },
    uFogFar: { value: 230 },
    uTrees: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -99)) },
    uWind: { value: 1 },
    uPointer: { value: new THREE.Vector3(999, 0, 999) },
    uPush: { value: 0 },
    uBloom: { value: 0 },
    uNight: { value: 0 },
    uLamp: { value: new THREE.Vector4(0, -99, 0, 0) },
  };

  // ---------- environment ----------
  const sky = createSky(U);
  scene.add(sky.mesh);
  const ground = createGround(U);
  scene.add(ground);
  scene.add(createOcean(U, sky.uniforms));
  scene.add(createGranite(U));
  scene.add(createPines(U));
  scene.add(createPalms());
  const descent = createDescentClouds(U);
  scene.add(descent.mesh);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3d5520, 1.2);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(hemi, sunLight, sunLight.target);
  scene.fog = new THREE.Fog(0xcfe6f3, 28, 230);

  // ---------- trees ----------
  const canopyMat = canopyMaterial(U);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c45, roughness: 1 });
  const trees = TREES.map((spec, i) => {
    const t = buildTree(spec, canopyMat, barkMat);
    t.group.position.set(spec.x, heightAt(spec.x, spec.z) - 0.05, spec.z);
    t.group.rotation.y = spec.seed;
    scene.add(t.group);
    t.group.updateMatrixWorld(true);
    const cc = t.canopyCenter.clone().applyMatrix4(t.group.matrixWorld);
    U.uTrees.value[i].set(cc.x, cc.z, t.canopyR * 1.08, cc.y);
    return { ...t, spec, cc };
  });
  scene.add(createLeaves(U, trees, Q.leaves));
  const far = createFarTrees(canopyMat, barkMat);
  scene.add(far.group);
  far.group.updateMatrixWorld(true);
  scene.add(createLeaves(U, [far.asTree], Q.farLeaves));

  // ---------- stones + lantern ----------
  const stones = createStones();
  scene.add(stones.group);
  const lantern = createLantern();
  const LX = 3.9, LZ = 3.2;
  lantern.group.position.set(LX, heightAt(LX, LZ) - 0.02, LZ);
  lantern.group.rotation.y = 0.3;
  scene.add(lantern.group);

  // ---------- croquet set, leaning against the big tree ----------
  const croquet = createCroquet();
  const croquetSpots = [];
  {
    const t0 = trees[0];
    const P0 = t0.group.position;
    const trunkAt = t0.trunkCurve.getPointAt(0.27).clone().applyMatrix4(t0.group.matrixWorld);
    const toCam = new THREE.Vector3(START.x - P0.x, 0, START.z - P0.z).normalize();
    const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
    const Y = new THREE.Vector3(0, 1, 0);
    croquet.mallets.forEach((m, i) => {
      const off = (i - 1.5) * 0.17;
      const top = trunkAt.clone().addScaledVector(toCam, 0.45).addScaledVector(side, off);
      const base = trunkAt.clone().addScaledVector(toCam, 1.0).addScaledVector(side, off * 1.5);
      base.y = heightAt(base.x, base.z);
      const dir = top.clone().sub(base).normalize();
      const spin = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(-side.z, side.x) + (i % 2) * 0.3);
      m.quaternion.setFromUnitVectors(Y, dir).multiply(spin);
      m.position.copy(base);
    });
    const ballSpots = [[1.25, -0.5], [1.5, 0.15], [1.2, 0.55], [1.75, -0.1]];
    croquet.balls.forEach((b, i) => {
      const p = trunkAt.clone().addScaledVector(toCam, ballSpots[i][0]).addScaledVector(side, ballSpots[i][1]);
      b.position.set(p.x, heightAt(p.x, p.z) + 0.075, p.z);
    });
    const place = (obj, a, s, ry = 0) => {
      const p = P0.clone().addScaledVector(toCam, a).addScaledVector(side, s);
      obj.position.set(p.x, heightAt(p.x, p.z), p.z);
      obj.rotation.y = Math.atan2(toCam.x, toCam.z) + ry;
      croquetSpots.push({ x: p.x, z: p.z, r: 0.3 });
    };
    place(croquet.hoops[0], 3.4, -0.9);
    place(croquet.hoops[1], 4.9, 0.7, 0.4);
    place(croquet.stake, 2.4, 1.6);
    const c = trunkAt.clone().addScaledVector(toCam, 1.2);
    croquetSpots.push({ x: c.x, z: c.z, r: 1.15 });
    scene.add(croquet.group);
    croquet.balls.forEach((b) => scene.add(b));
  }

  const excluded = (x, z) => {
    if (heightAt(x, z) < -3.2) return true; // no meadow grass on the beach
    for (const s of croquetSpots) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return true;
    for (const s of stones.spots) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return true;
    for (const t of TREES) if ((x - t.x) ** 2 + (z - t.z) ** 2 < (0.42 * t.s) ** 2) return true;
    if ((x - LX) ** 2 + (z - LZ) ** 2 < 0.3) return true;
    return false;
  };

  // ---------- grass + flowers ----------
  const grass = createGrass(U, Q, excluded);
  scene.add(grass);
  scene.add(createFlowers(U, Q, excluded));

  // ---------- apples ----------
  const appleGeo = new THREE.SphereGeometry(0.12, 16, 12);
  {
    const p = appleGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rr = Math.hypot(x, z);
      p.setY(i, y * 0.92 - (y > 0 ? 0.035 * Math.exp(-rr * 30) : -0.02 * Math.exp(-rr * 30)));
    }
    appleGeo.computeVertexNormals();
  }
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.07, 4);
  stemGeo.translate(0, 0.12, 0);
  const appleMats = [0xc3222b, 0xd8342a, 0xb01e33].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38 }));
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 });
  const apples = [];
  const clickables = [];
  const ar = rng(8);
  trees.forEach((t) => {
    for (const lp of t.apples) {
      const wp = lp.clone().applyMatrix4(t.group.matrixWorld);
      const m = new THREE.Mesh(appleGeo, appleMats[Math.floor(ar() * 3)]);
      m.add(new THREE.Mesh(stemGeo, stemMat));
      m.position.copy(wp);
      m.rotation.set((ar() - 0.5) * 0.6, ar() * 6, (ar() - 0.5) * 0.6);
      scene.add(m);
      const a = { mesh: m, home: wp.clone(), state: "tree", vel: new THREE.Vector3(), timer: 0, bounced: false };
      m.userData.onClick = () => dropApple(a);
      apples.push(a);
      clickables.push(m);
    }
  });
  let applesDropped = 0;
  function dropApple(a) {
    if (a.state !== "tree") return;
    a.state = "falling";
    a.vel.set((Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8);
    a.bounced = false;
    sound.pop(0.6);
    applesDropped++;
    if (applesDropped === 3) eggs.find("newton");
  }

  // ---------- fūrin ----------
  const furin = createFurin();
  {
    const t0 = trees[0];
    furin.group.position.set(t0.cc.x + 1.9, t0.cc.y - 1.05, t0.cc.z + 1.7);
    scene.add(furin.group);
  }
  const furinState = { ang: 0, vel: 0, angZ: 0, velZ: 0 };
  furin.hit.forEach((m) => {
    m.userData.onClick = () => {
      furinState.vel += 2.6;
      furinState.velZ += 1.2;
      sound.chime();
      eggs.find("furin");
    };
    clickables.push(m);
  });

  // ---------- lantern ----------
  let lanternLit = false;
  lantern.hit.forEach((m) => {
    m.userData.onClick = () => {
      lanternLit = !lanternLit;
      sound.pop(lanternLit ? 1.2 : 0.7);
      if (lanternLit) eggs.find("lantern");
    };
    clickables.push(m);
  });

  // ---------- fox ----------
  const fox = createFox();
  const FOX_SPOTS = [
    { x: -13.4, z: 9.7 },
    { x: 14.9, z: 9.4 },
    { x: 2.9, z: -19.4 },
    { x: -20.2, z: -10.6 },
  ];
  let foxSpot = 0;
  const foxState = { mode: "idle", t: 0 };
  function placeFox(i) {
    const s = FOX_SPOTS[i];
    fox.group.position.set(s.x, heightAt(s.x, s.z) - 0.05, s.z);
    fox.group.rotation.y = Math.atan2(-s.x, -s.z);
  }
  placeFox(0);
  fox.group.scale.setScalar(1.15);
  scene.add(fox.group);
  fox.group.traverse((o) => {
    if (o.isMesh) {
      o.userData.onClick = () => {
        if (foxState.mode !== "idle") return;
        const first = eggs.find("kitsune");
        if (!first) toast("狐", "The kitsune darts off to hide somewhere else.");
        foxState.mode = "leap";
        foxState.t = 0;
        sound.boing(1.6);
      };
      clickables.push(o);
    }
  });

  // ---------- mochi ----------
  const mochi = createMochi();
  scene.add(mochi.group);
  const mochiState = { active: false, vel: new THREE.Vector3(), target: new THREE.Vector3(), timer: 0, squash: 0, spin: 0 };
  mochi.hit.forEach((m) => {
    m.userData.onClick = () => {
      if (!mochiState.active) return;
      mochiState.vel.y = 5.5;
      mochiState.spin = Math.PI * 2;
      sound.boing(1.0);
    };
    clickables.push(m);
  });

  // ---------- red stags ----------
  const stags = [
    { x: -9, z: -11, antler: 1.15, s: 1.05 },
    { x: 15, z: -3, antler: 0.85, s: 0.95 },
    { x: -17, z: 3.5, antler: 1.0, s: 1.0 },
  ].map((spec, i) => {
    const m = createStag(spec.antler);
    m.group.scale.setScalar(spec.s);
    m.group.position.set(spec.x, heightAt(spec.x, spec.z), spec.z);
    scene.add(m.group);
    const st = {
      m, heading: Math.random() * 6.28, mode: "graze", timer: 2 + Math.random() * 5, target: new THREE.Vector3(),
      speed: 0, neck: 2.4, neckTarget: 2.4, phase: Math.random() * 6, look: 0, earT: 0,
    };
    m.group.traverse((o) => {
      if (o.isMesh) {
        o.userData.onClick = () => alertStag(st);
        clickables.push(o);
      }
    });
    return st;
  });
  function okForStag(x, z) {
    const r = Math.hypot(x, z);
    if (r < 8 || r > 27 || heightAt(x, z) < -1.2) return false;
    for (const t of TREES) if ((x - t.x) ** 2 + (z - t.z) ** 2 < 2.8 * 2.8) return false;
    if ((x - LX) ** 2 + (z - LZ) ** 2 < 4) return false;
    for (const s of croquetSpots) if ((x - s.x) ** 2 + (z - s.z) ** 2 < 4) return false;
    return true;
  }
  function alertStag(st) {
    if (st.mode === "alert" || st.mode === "trot") return;
    st.mode = "alert";
    st.timer = 1.5;
    sound.bellow();
    if (!eggs.find("stag")) toast("鹿", "The stag bellows across the meadow.");
  }
  function updateStags(dt, t) {
    for (const st of stags) {
      const g = st.m.group;
      st.timer -= dt;
      if (st.mode === "graze") {
        st.neckTarget = 2.55;
        st.speed = Math.max(0, st.speed - dt * 2);
        if (st.timer <= 0) { st.mode = "look"; st.timer = 2 + Math.random() * 2.5; }
      } else if (st.mode === "look") {
        st.neckTarget = 0.35;
        st.look = Math.sin(t * 0.8 + st.phase) * 0.6;
        if (st.timer <= 0) {
          if (Math.random() < 0.55) {
            for (let k = 0; k < 20; k++) {
              const a = Math.random() * 6.28, d = 3 + Math.random() * 6;
              const x = g.position.x + Math.cos(a) * d, z = g.position.z + Math.sin(a) * d;
              if (okForStag(x, z)) { st.target.set(x, 0, z); st.mode = "walk"; st.timer = 10; break; }
            }
            if (st.mode !== "walk") { st.mode = "graze"; st.timer = 4 + Math.random() * 5; }
          } else { st.mode = "graze"; st.timer = 4 + Math.random() * 5; }
        }
      } else if (st.mode === "walk" || st.mode === "trot") {
        const fast = st.mode === "trot";
        st.neckTarget = fast ? 0.25 : 0.7;
        st.speed += ((fast ? 2.8 : 0.75) - st.speed) * Math.min(dt * 3, 1);
        const dx = st.target.x - g.position.x, dz = st.target.z - g.position.z;
        const d = Math.hypot(dx, dz);
        let want = Math.atan2(dx, dz);
        let diff = ((want - st.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        st.heading += diff * Math.min(dt * (fast ? 5 : 2), 1);
        if (Math.abs(diff) < 1.2) {
          g.position.x += Math.sin(st.heading) * st.speed * dt;
          g.position.z += Math.cos(st.heading) * st.speed * dt;
        }
        if (d < 0.4 || st.timer <= 0) { st.mode = fast ? "look" : "graze"; st.timer = fast ? 3 : 5 + Math.random() * 5; }
      } else if (st.mode === "alert") {
        st.neckTarget = 0.05;
        st.speed = 0;
        st.look = 0;
        if (st.timer <= 0) {
          // bound away from the viewer
          const away = tmpV.copy(g.position).sub(camera.position).setY(0).normalize();
          for (let k = 0; k < 20; k++) {
            const a = Math.atan2(away.z, away.x) + (Math.random() - 0.5) * 1.6, d = 6 + Math.random() * 5;
            const x = g.position.x + Math.cos(a) * d, z = g.position.z + Math.sin(a) * d;
            if (okForStag(x, z)) { st.target.set(x, 0, z); break; }
          }
          st.mode = "trot";
          st.timer = 4;
        }
      }
      g.position.y = heightAt(g.position.x, g.position.z);
      g.rotation.y = st.heading;
      st.neck += (st.neckTarget - st.neck) * Math.min(dt * 2.2, 1);
      const k = (st.neck - 0.35) / 2.2;
      st.m.neck.rotation.x = st.neck + Math.sin(t * 1.3 + st.phase) * 0.03;
      st.m.head.rotation.x = -0.1 - 0.88 * k + (st.mode === "graze" ? Math.sin(t * 6 + st.phase) * 0.06 : 0);
      st.m.head.rotation.y = st.look * (1 - k);
      st.phase += dt * st.speed * 5.5;
      const swing = Math.sin(st.phase) * Math.min(st.speed / 0.75, 1.6) * 0.42;
      st.m.legs[0].rotation.x = swing;
      st.m.legs[3].rotation.x = swing;
      st.m.legs[1].rotation.x = -swing;
      st.m.legs[2].rotation.x = -swing;
      st.m.ears.forEach((e, i) => (e.rotation.x = Math.max(0, Math.sin(t * 1.1 + st.phase * 0.1 + i * 2) - 0.95) * 8));
      st.m.tail.rotation.z = Math.max(0, Math.sin(t * 2.3 + st.phase) - 0.9) * 6;
    }
  }

  // ---------- croquet balls ----------
  const balls = croquet.balls.map((b) => {
    const st = { mesh: b, vel: new THREE.Vector3() };
    b.userData.onClick = () => {
      const dir = tmpV.copy(b.position).sub(camera.position).setY(0).normalize();
      st.vel.copy(dir).multiplyScalar(5 + Math.random() * 2.5);
      sound.tock();
      eggs.find("croquet");
    };
    clickables.push(b);
    return st;
  });
  croquet.mallets.forEach((m) =>
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.onClick = () => toast("球", "Fancy a game? Give one of the balls a whack.", 3000);
      clickables.push(o);
    })
  );
  const axis = new THREE.Vector3();
  function updateBalls(dt) {
    for (const b of balls) {
      const sp = b.vel.length();
      if (sp < 0.03) { b.vel.set(0, 0, 0); continue; }
      const p = b.mesh.position;
      // roll downhill a little, lose speed to the grass
      const e = 0.3;
      b.vel.x -= ((heightAt(p.x + e, p.z) - heightAt(p.x - e, p.z)) / (2 * e)) * 6 * dt;
      b.vel.z -= ((heightAt(p.x, p.z + e) - heightAt(p.x, p.z - e)) / (2 * e)) * 6 * dt;
      b.vel.multiplyScalar(Math.max(0, 1 - 1.0 * dt));
      p.x += b.vel.x * dt;
      p.z += b.vel.z * dt;
      for (const t of TREES) {
        const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), rr = 0.42 * t.s + 0.08;
        if (d < rr) {
          const nx = dx / d, nz = dz / d, vn = b.vel.x * nx + b.vel.z * nz;
          if (vn < 0) { b.vel.x -= 1.7 * vn * nx; b.vel.z -= 1.7 * vn * nz; sound.tock(0.7); }
          p.x = t.x + nx * rr; p.z = t.z + nz * rr;
        }
      }
      for (const o of balls) {
        if (o === b) continue;
        const q = o.mesh.position, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d > 0 && d < 0.15) {
          const nx = dx / d, nz = dz / d;
          const rel = (b.vel.x - o.vel.x) * nx + (b.vel.z - o.vel.z) * nz;
          if (rel > 0) {
            b.vel.x -= rel * nx; b.vel.z -= rel * nz;
            o.vel.x += rel * nx; o.vel.z += rel * nz;
            sound.tock(1.3);
          }
        }
      }
      const r = Math.hypot(p.x, p.z);
      if (r > 32 || heightAt(p.x, p.z) < -2) { b.vel.x *= -0.5; b.vel.z *= -0.5; }
      p.y = heightAt(p.x, p.z) + 0.075;
      axis.set(b.vel.z, 0, -b.vel.x).normalize();
      b.mesh.rotateOnWorldAxis(axis, (sp * dt) / 0.075);
    }
  }

  // ---------- butterflies, motes, petals ----------
  const butterflies = createButterflies(3);
  scene.add(butterflies.group);
  const motes = createMotes(U, Q.motes);
  scene.add(motes);
  const petals = createPetals(trees.map((t) => ({ x: t.cc.x, y: t.cc.y, z: t.cc.z, r: t.canopyR })));
  scene.add(petals.mesh);

  // ---------- sun / moon click proxies ----------
  const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const sunProxy = new THREE.Mesh(new THREE.SphereGeometry(16, 8, 6), proxyMat);
  const moonProxy = new THREE.Mesh(new THREE.SphereGeometry(16, 8, 6), proxyMat);
  scene.add(sunProxy, moonProxy);
  let tod = 0;
  sunProxy.userData.onClick = () => {
    if (tod >= 2) return;
    tod++;
    sound.sparkle(tod === 1 ? 0 : -3);
    eggs.find("golden");
    if (tod === 2) toast("夜", "Night falls. Click the moon to bring the morning back.");
  };
  moonProxy.userData.onClick = () => {
    if (tod !== 2) return;
    tod = 0;
    sound.sparkle(2);
    toast("朝", "Good morning.");
  };
  clickables.push(sunProxy, moonProxy);

  // ---------- planted flowers ----------
  const planted = [];
  function plant(point) {
    const f = createPlantedFlower(Math.floor(Math.random() * 1e9));
    f.position.set(point.x, heightAt(point.x, point.z) - 0.02, point.z);
    f.rotation.y = Math.random() * 6.28;
    scene.add(f);
    planted.push({ g: f, t: 0 });
    if (planted.length > 80) {
      const old = planted.shift();
      scene.remove(old.g);
    }
    sound.pop(1.5);
    eggs.find("gardener");
  }

  // ---------- controls ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.enablePan = false;
  controls.minDistance = 4.5;
  controls.maxDistance = 21;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.autoRotateSpeed = 0.35;
  controls.enabled = false;

  // ---------- pointer / picking ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerDirty = false, pointerInside = false;
  let lastInput = performance.now();
  let down = null, lastTap = null;
  const dom = renderer.domElement;

  function setNDC(e) {
    const rect = dom.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }
  function pick() {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(clickables, false);
    return hits.find((h) => h.object.visible !== false && (h.object !== sunProxy || tod < 2) && (h.object !== moonProxy || tod === 2)) || null;
  }
  function groundPoint() {
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(ground, false)[0];
    return h ? h.point : null;
  }
  dom.addEventListener("pointermove", (e) => {
    setNDC(e);
    pointerDirty = true;
    pointerInside = true;
    poke();
  });
  dom.addEventListener("pointerleave", () => (pointerInside = false));
  dom.addEventListener("pointerdown", (e) => {
    setNDC(e);
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    poke();
  });
  dom.addEventListener("pointerup", (e) => {
    if (!down || !api.ready) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 7 || dt > 450) return;
    setNDC(e);
    const hit = pick();
    if (hit) {
      hit.object.userData.onClick(hit);
      lastTap = null;
      return;
    }
    const now = performance.now();
    if (lastTap && now - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      const gp = groundPoint();
      if (gp && Math.hypot(gp.x, gp.z) < 40) plant(gp);
      lastTap = null;
    } else {
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  });

  let daydreamed = false;
  function poke() {
    lastInput = performance.now();
    if (controls.autoRotate) controls.autoRotate = false;
  }

  // ---------- state ----------
  let sunEl = TOD[0];
  const pal = { zenith: new THREE.Color(), horizon: new THREE.Color(), key: new THREE.Color(), amb: new THREE.Color(), fog: new THREE.Color(), cloud: new THREE.Color(), keyI: 1 };
  const trueSun = new THREE.Vector3();
  const moonDir = sky.uniforms.uMoon.value;
  let gust = 0, bloomTarget = 0;
  let arrival = null;
  const tmpV = new THREE.Vector3();

  function applyTimeOfDay(dt) {
    sunEl += (TOD[tod] - sunEl) * Math.min(dt * 0.7, 1);
    const swing = smoothstep(TOD[0], TOD[1] + 0.02, sunEl);
    const az = AZ_DAY + (AZ_GOLD - AZ_DAY) * swing;
    trueSun.set(Math.cos(az) * Math.cos(sunEl), Math.sin(sunEl), Math.sin(az) * Math.cos(sunEl));
    const s = Math.sin(sunEl);
    samplePalette(s, pal);
    const night = 1 - smoothstep(-0.16, 0.06, s);
    U.uNight.value = night;
    const sunset = (1 - smoothstep(0.1, 0.5, s)) * smoothstep(-0.25, 0.02, s);
    sky.uniforms.uSunset.value = sunset;
    sky.uniforms.uSun.value.copy(trueSun);
    sky.uniforms.uZenith.value.copy(pal.zenith);
    sky.uniforms.uHorizon.value.copy(pal.horizon);
    sky.uniforms.uCloud.value.copy(pal.cloud);
    sky.uniforms.uSunCol.value.copy(pal.key).multiplyScalar(1.2);

    // key light: sun by day, moon by night (never below the horizon)
    const key = U.uSunDir.value;
    const sunKey = tmpV.copy(trueSun);
    sunKey.y = Math.max(sunKey.y, 0.06);
    sunKey.normalize();
    key.copy(sunKey).lerp(moonDir, night).normalize();
    U.uSunColor.value.copy(pal.key).multiplyScalar(pal.keyI);
    U.uSkyColor.value.copy(pal.amb).multiplyScalar(1 - night * 0.25);
    U.uFogColor.value.copy(pal.fog);
    scene.fog.color.copy(pal.fog);

    hemi.color.copy(pal.amb);
    hemi.groundColor.setRGB(0.24, 0.33, 0.12).multiplyScalar(1 - night * 0.8);
    hemi.intensity = 1.25 * (1 - night * 0.55);
    sunLight.color.copy(pal.key);
    sunLight.intensity = 2.6 * pal.keyI;
    sunLight.position.copy(key).multiplyScalar(60);

    sunProxy.position.copy(camera.position).addScaledVector(trueSun, 380);
    moonProxy.position.copy(camera.position).addScaledVector(moonDir, 380);
    return night;
  }

  function updateApples(dt) {
    for (const a of apples) {
      const m = a.mesh;
      if (a.state === "falling") {
        a.vel.y -= 9.8 * dt;
        m.position.addScaledVector(a.vel, dt);
        m.rotation.x += a.vel.z * dt * 3;
        m.rotation.z -= a.vel.x * dt * 3;
        const gy = heightAt(m.position.x, m.position.z) + 0.11;
        if (m.position.y < gy) {
          m.position.y = gy;
          if (!a.bounced) sound.thud();
          a.bounced = true;
          a.vel.y *= -0.32;
          a.vel.x *= 0.7;
          a.vel.z *= 0.7;
          if (Math.abs(a.vel.y) < 0.5) {
            a.state = "ground";
            a.timer = 0;
          }
        }
      } else if (a.state === "ground") {
        a.timer += dt;
        if (a.timer > 35) {
          const s = Math.max(0, 1 - (a.timer - 35));
          m.scale.setScalar(Math.max(s, 0.001));
          if (s <= 0) {
            a.state = "regrow";
            a.timer = 0;
            m.position.copy(a.home);
          }
        }
      } else if (a.state === "regrow") {
        a.timer += dt;
        const s = Math.min(a.timer / 2, 1);
        m.scale.setScalar(Math.max(s * (1 - bloomTarget), 0.001));
        if (s >= 1) a.state = "tree";
      } else {
        // hanging: sway slightly; hide in sakura season
        const target = 1 - U.uBloom.value;
        m.scale.setScalar(Math.max(target, 0.001));
        m.visible = target > 0.02;
        m.position.x = a.home.x + Math.sin(U.uTime.value * 1.4 + a.home.z) * 0.015 * U.uWind.value;
      }
    }
  }

  function updateFox(dt, t) {
    const g = fox.group;
    fox.tailPivot.rotation.y = Math.sin(t * 1.6) * 0.35;
    fox.ears.forEach((e, i) => (e.rotation.x = Math.max(0, Math.sin(t * 0.9 + i * 2.2) - 0.92) * 4));
    fox.head.rotation.y = Math.sin(t * 0.35) * 0.4;
    if (foxState.mode === "leap") {
      foxState.t += dt;
      const u = foxState.t / 0.55;
      const s = FOX_SPOTS[foxSpot];
      g.position.y = heightAt(s.x, s.z) - 0.05 + Math.sin(Math.min(u, 1) * Math.PI) * 1.4;
      g.rotation.y += dt * 9;
      g.scale.setScalar(1.15 * Math.max(1 - u, 0.001));
      if (u >= 1) {
        foxSpot = (foxSpot + 1) % FOX_SPOTS.length;
        placeFox(foxSpot);
        foxState.mode = "appear";
        foxState.t = 0;
      }
    } else if (foxState.mode === "appear") {
      foxState.t += dt;
      const u = Math.min(foxState.t / 0.6, 1);
      g.scale.setScalar(1.15 * Math.max(easeOutCubic(u), 0.001));
      if (u >= 1) foxState.mode = "idle";
    }
  }

  function updateFurin(dt, t) {
    const windPush = (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.12 * U.uWind.value;
    furinState.vel += (-furinState.ang * 9 - furinState.vel * 0.9 + windPush) * dt;
    furinState.ang += furinState.vel * dt;
    furinState.velZ += (-furinState.angZ * 7 - furinState.velZ * 0.9) * dt;
    furinState.angZ += furinState.velZ * dt;
    furin.group.rotation.x = furinState.ang * 0.25;
    furin.group.rotation.z = furinState.angZ * 0.2;
    furin.stripPivot.rotation.x = Math.sin(t * 2.3) * 0.25 * U.uWind.value + furinState.ang * 0.5;
    if (gust > 0.6 && Math.random() < dt * 2) {
      furinState.vel += 1.2;
      sound.chime(0.5);
    }
  }

  function updateMochi(dt, t) {
    if (!mochiState.active) return;
    const g = mochi.group;
    const st = mochiState;
    st.vel.y -= 14 * dt;
    g.position.addScaledVector(st.vel, dt);
    const gy = heightAt(g.position.x, g.position.z);
    if (g.position.y <= gy) {
      if (st.vel.y < -2) {
        st.squash = 1;
        sound.boing(0.6 + Math.random() * 0.3, 0.25);
      }
      g.position.y = gy;
      st.vel.set(0, 0, 0);
      st.timer += dt;
      if (st.timer > 1.1 + Math.random() * 0.6) {
        st.timer = 0;
        const a = Math.random() * Math.PI * 2, rr = 2 + Math.random() * 6;
        st.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr + 2);
        const dir = st.target.clone().sub(g.position).setY(0);
        const d = Math.min(dir.length(), 1.6);
        dir.normalize().multiplyScalar(d * 1.4);
        st.vel.set(dir.x, 4.2, dir.z);
        g.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }
    st.squash = Math.max(0, st.squash - dt * 3.5);
    const sq = Math.sin(st.squash * Math.PI) * 0.35;
    const air = g.position.y - gy > 0.05 ? 0.12 : 0;
    mochi.squish.scale.set(1 + sq, 1 - sq + air, 1 + sq);
    if (st.spin > 0) {
      const step = Math.min(st.spin, dt * 10);
      st.spin -= step;
      mochi.squish.rotation.y += step;
    }
  }

  function updateButterflies(dt, t, night) {
    const vis = 1 - night;
    for (const b of butterflies.list) {
      const s = b.seed, k = t * b.speed;
      b.prev.copy(b.pos);
      b.pos.set(
        Math.sin(k * 0.23 + s) * 9 + Math.sin(k * 0.71 + s * 2) * 2.5,
        0,
        Math.cos(k * 0.19 + s * 1.3) * 8 + Math.sin(k * 0.53 + s) * 2.5 + 1
      );
      b.pos.y = heightAt(b.pos.x, b.pos.z) + 0.9 + Math.sin(k * 1.7 + s) * 0.45 + Math.sin(k * 4.1 + s) * 0.12;
      b.obj.position.copy(b.pos);
      tmpV.copy(b.pos).sub(b.prev);
      if (tmpV.lengthSq() > 1e-8) b.obj.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      const flap = Math.sin(t * 17 + s * 10) * 1.05;
      b.L.rotation.z = -flap;
      b.R.rotation.z = flap;
      b.obj.visible = vis > 0.05;
      b.obj.scale.setScalar((0.85 + (s % 0.4)) * Math.max(vis, 0.001));
    }
  }

  // Continuous fall from orbit: straight down through the clouds, spinning gently,
  // then pitching up to the horizon as the meadow rushes in.
  function arrivalCam(u) {
    const e = 1 - Math.pow(1 - u, 3.2);
    camera.position.set(START.x, ARRIVE_H + (START.y - ARRIVE_H) * e, START.z);
    const pT = easeInOutCubic(smoothstep(0.28, 1.0, u));
    const pitch = -Math.PI / 2 + 0.0005 + (FINAL_PITCH + Math.PI / 2) * pT;
    const yaw = (1 - easeOutCubic(u)) * 0.22;
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    descent.uniforms.uOpacity.value = 1 - smoothstep(0.12, 0.42, u);
  }

  // ---------- public API ----------
  const api = {
    scene,
    camera,
    ready: false,
    arrive(duration = 5.6, onDone) {
      arrival = { t: 0, d: duration, onDone };
      descent.mesh.visible = true;
      arrivalCam(0);
    },
    skipArrival() {
      if (arrival) arrival.t = arrival.d;
    },
    update(dt, t) {
      U.uTime.value = t;
      const night = applyTimeOfDay(dt);
      sound.setNight(night);

      gust = Math.max(0, gust - dt * 0.35);
      U.uWind.value = 1 + Math.sin(t * 0.21) * 0.15 + gust * 2.2;
      U.uBloom.value += (bloomTarget - U.uBloom.value) * Math.min(dt * 0.8, 1);
      petals.target = bloomTarget > 0.5 ? 650 : 26;

      // camera
      if (arrival) {
        arrival.t += dt;
        const u = Math.min(arrival.t / arrival.d, 1);
        arrivalCam(u);
        if (u >= 1) {
          const cb = arrival.onDone;
          arrival = null;
          descent.mesh.visible = false;
          controls.enabled = true;
          controls.update();
          api.ready = true;
          lastInput = performance.now();
          cb && cb();
        }
      } else if (api.ready) {
        const idle = (performance.now() - lastInput) / 1000;
        if (idle > 22 && !controls.autoRotate) controls.autoRotate = true;
        if (idle > 30 && !daydreamed) {
          daydreamed = true;
          eggs.find("daydream");
        }
        controls.update();
        // keep out of canopies and above the grass
        for (const tr of trees) {
          tmpV.copy(camera.position).sub(tr.cc);
          const rr = tr.canopyR * 1.15;
          if (tmpV.lengthSq() < rr * rr) camera.position.copy(tr.cc).addScaledVector(tmpV.normalize(), rr);
        }
        const gy = heightAt(camera.position.x, camera.position.z) + 0.7;
        if (camera.position.y < gy) camera.position.y = gy;
      }

      sky.mesh.position.copy(camera.position);
      // thin the haze while we're high up on the way down
      const ch = Math.max(0, camera.position.y - 3);
      U.uFogNear.value = scene.fog.near = 28 + ch * 0.9;
      U.uFogFar.value = scene.fog.far = 230 + ch * 3.2;

      // pointer → grass
      if (pointerDirty && api.ready) {
        pointerDirty = false;
        const gp = groundPoint();
        if (gp) U.uPointer.value.copy(gp);
        ray.setFromCamera(ndc, camera);
        dom.style.cursor = pick() ? "pointer" : "grab";
      }
      U.uPush.value += ((pointerInside && api.ready ? 1 : 0) - U.uPush.value) * Math.min(dt * 4, 1);

      // lantern
      const glow = lanternLit ? 0.5 + night * 1.8 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03 : 0;
      lantern.glowMat.emissiveIntensity = glow * 2.2;
      lantern.light.intensity = glow * 5;
      U.uLamp.value.set(lantern.group.position.x, lantern.group.position.y + 1.3, lantern.group.position.z, glow);

      updateApples(dt);
      updateFox(dt, t);
      updateFurin(dt, t);
      updateMochi(dt, t);
      updateButterflies(dt, t, night);
      updateStags(dt, t);
      updateBalls(dt);
      petals.update(dt, t, U.uWind.value);

      for (const p of planted) {
        if (p.t < 1.4) {
          p.t += dt;
          const u = Math.min(p.t / 1.1, 1);
          const back = 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);
          p.g.scale.setScalar(Math.max(back, 0.001));
        }
      }
    },
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.fov = fovFor(camera.aspect);
      camera.updateProjectionMatrix();
    },
    // ----- easter egg actions -----
    toggleSakura() {
      bloomTarget = bloomTarget > 0.5 ? 0 : 1;
      return bloomTarget > 0.5;
    },
    gust() {
      gust = 1;
      sound.whoosh();
    },
    spawnMochi() {
      const g = mochi.group;
      if (!mochiState.active) {
        mochiState.active = true;
        g.visible = true;
        const fwd = tmpV.copy(controls.target).sub(camera.position).setY(0).normalize();
        const x = camera.position.x + fwd.x * 5, z = camera.position.z + fwd.z * 5;
        g.position.set(x, heightAt(x, z) + 6, z);
        mochiState.vel.set(0, 0, 0);
      } else {
        mochiState.vel.y = 6;
        mochiState.spin = Math.PI * 4;
      }
    },
    celebrate() {
      petals.target = 700;
      bloomTarget = 1;
    },
    debugView(x, y, z, tx = TARGET.x, ty = TARGET.y, tz = TARGET.z) {
      arrival = null;
      descent.mesh.visible = false;
      api.ready = true;
      controls.enabled = true;
      controls.maxDistance = Math.max(21, Math.hypot(x - tx, y - ty, z - tz) + 1);
      controls.target.set(tx, ty, tz);
      camera.position.set(x, y, z);
      controls.update();
    },
    // called by the frame-rate watchdog when the device is struggling
    thinGrass(f = 0.7) {
      const g = grass.geometry;
      g.instanceCount = Math.max(15000, Math.floor(g.instanceCount * f));
    },
    setTod(i) {
      tod = i;
      sunEl = TOD[i];
    },
    get night() {
      return U.uNight.value;
    },
  };

  return api;
}
