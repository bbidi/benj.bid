import * as THREE from "three";
import { rng } from "./glsl.js";
import { heightAt } from "./terrain.js";

// Pollen motes by day, fireflies by night.
export function createMotes(U, count = 420) {
  const r = rng(31);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const rr = Math.sqrt(r()) * 22, a = r() * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    pos.set([x, heightAt(x, z) + 0.3 + r() * 3.2, z], i * 3);
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uNight: U.uNight, uPR: { value: Math.min(devicePixelRatio, 2) }, uSunColor: U.uSunColor },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uNight; uniform float uPR;
      varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        float t = uTime*(0.15 + aSeed*0.2);
        p += vec3(sin(t*1.3 + aSeed*20.0)*0.9, sin(t*0.9 + aSeed*11.0)*0.45, cos(t*1.1 + aSeed*7.0)*0.9);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        float blink = smoothstep(0.2, 0.9, sin(uTime*(0.8+aSeed*1.6) + aSeed*30.0)*0.5+0.5);
        vA = mix(0.55, blink, uNight);
        vS = aSeed;
        gl_PointSize = mix(5.0, 11.0, uNight)*(0.6+aSeed*0.6)*uPR*(10.0/-mv.z);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight; uniform vec3 uSunColor; varying float vA; varying float vS;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a*a;
        vec3 dayC = vec3(1.0,0.95,0.8)*0.9;
        vec3 nightC = vec3(0.75,1.0,0.35)*2.2;
        vec3 c = mix(dayC, nightC, uNight);
        gl_FragColor = vec4(c*a*vA*mix(0.45, 1.0, uNight), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// Drifting petals. A few always; a storm in sakura mode.
export function createPetals(sources, max = 700) {
  const geo = new THREE.PlaneGeometry(0.075, 0.055);
  geo.translate(0.02, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffb3c6, emissive: 0xff8fab, emissiveIntensity: 0.3, side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  const r = rng(55);
  const P = [];
  const spawn = (p, anywhere) => {
    const s = sources[Math.floor(r() * sources.length)];
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * s.r;
    p.pos.set(s.x + Math.cos(a) * rr, anywhere ? s.y - r() * s.y : s.y + (r() - 0.5) * 1.5, s.z + Math.sin(a) * rr);
    p.vy = 0.35 + r() * 0.35;
    p.phase = r() * 100;
    p.spin = 1 + r() * 3;
    p.life = 0;
  };
  for (let i = 0; i < max; i++) {
    const p = { pos: new THREE.Vector3(), rot: new THREE.Euler(), vy: 0, phase: 0, spin: 0, life: 0 };
    spawn(p, true);
    P.push(p);
  }
  const dummy = new THREE.Object3D();
  let active = 40;
  mesh.count = active;
  return {
    mesh,
    set target(n) { this._target = n; },
    _target: 40,
    burst(n) { this._target = Math.min(max, this._target + n); this._burstDecay = true; },
    update(dt, t, wind) {
      active += (this._target - active) * Math.min(dt * 1.5, 1);
      const n = Math.max(0, Math.min(max, Math.round(active)));
      mesh.count = n;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        p.life += dt;
        p.pos.y -= p.vy * dt;
        p.pos.x += (Math.sin(t * 1.3 + p.phase) * 0.35 + 0.55 * wind) * dt;
        p.pos.z += (Math.cos(t * 0.9 + p.phase) * 0.3 + 0.2 * wind) * dt;
        if (p.pos.y < heightAt(p.pos.x, p.pos.z) + 0.05) spawn(p, false);
        dummy.position.copy(p.pos);
        dummy.rotation.set(t * p.spin + p.phase, t * p.spin * 0.7, Math.sin(t * 2 + p.phase));
        const s = Math.min(p.life * 2, 1);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
