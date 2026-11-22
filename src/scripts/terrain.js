import * as THREE from "three";
import { NOISE, COMMON, OUT, smoothstep } from "./glsl.js";

// The world: a meadow on a bluff. Straight ahead (−z) it rolls down to a sandy cove and the
// Pacific; everywhere else rolling hills climb toward granite domes. Yosemite meets San Diego.
export const SEA_LEVEL = -17;
export const SHORE_R = 79; // where sand meets water in the middle of the cove

// 1 inside the cove's sector (centered on −z), 0 on the landward sides.
export function bayMask(x, z) {
  const r = Math.hypot(x, z) || 1;
  return smoothstep(0.8, 0.95, -z / r);
}

function beachProfile(r) {
  return -15.6 - smoothstep(66, 86, r) * 1.9 - Math.max(0, r - 86) * 0.14;
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h =
    0.45 * Math.sin(x * 0.09 + 0.5) * Math.cos(z * 0.075 + 0.2) +
    0.25 * Math.sin(x * 0.21 + z * 0.16) +
    0.12 * Math.cos(z * 0.33 - x * 0.11);
  h *= 0.45 + 0.55 * smoothstep(4, 18, r);
  const a = Math.atan2(z, x);
  const bay = bayMask(x, z);
  const wide = smoothstep(0.55, 0.92, -z / (r || 1)); // hills ease down well before the cove
  const rise = smoothstep(34, 125, r);
  h += rise * rise * (20 + 8 * Math.sin(a * 3 + 1) + 4 * Math.sin(a * 7 + 2)) * (1 - wide);
  // the long grassy slope down to the dunes and the sand
  // a Torrey Pines bluff: gentle lip, steep sandstone face, then the beach
  const coast = smoothstep(37, 58, r) * bay;
  const dunes = 0.5 * Math.sin(x * 0.35) * Math.sin(z * 0.27) * smoothstep(58, 64, r) * (1 - smoothstep(68, 74, r));
  h = h * (1 - coast) + (beachProfile(r) + dunes) * coast;
  return h;
}

export function createGround(U) {
  const size = 440, seg = 260;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();

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
        float a = snoise(vec3(vWP.xz*0.07, 0.0))*0.5+0.5;
        float b = snoise(vec3(vWP.xz*0.5, 3.0))*0.5+0.5;
        vec3 base = mix(vec3(0.035,0.085,0.012), vec3(0.075,0.14,0.02), a);
        base *= 0.8 + 0.3*b;
        // far hills read as sunlit grassland
        float far = smoothstep(30.0, 70.0, length(vWP.xz));
        float wood = smoothstep(0.1, 0.45, snoise(vec3(vWP.xz*0.025, 11.0)) + snoise(vec3(vWP.xz*0.09, 4.0))*0.25);
        float sunny = smoothstep(0.2, 0.7, snoise(vec3(vWP.xz*0.018, 2.0)));
        vec3 farC = mix(vec3(0.13,0.24,0.045), vec3(0.24,0.30,0.06), sunny);
        farC = mix(farC, vec3(0.025,0.075,0.03), wood*0.85);
        farC *= 0.92 + 0.08*sin(vWP.y*1.4 + snoise(vec3(vWP.xz*0.05, 1.0))*3.0);
        base = mix(base, farC*(0.9+0.2*a), far);

        // golden dunes, warm sand, darker wet sand at the waterline
        float y = vWP.y + snoise(vec3(vWP.xz*0.18, 7.0))*0.45;
        // sandstone bluff faces
        float steep = 1.0 - smoothstep(0.55, 0.85, n.y);
        float strata = 0.85 + 0.15*sin(vWP.y*2.2 + snoise(vec3(vWP.xz*0.08, 3.0))*2.0);
        vec3 stone = mix(vec3(0.42,0.26,0.13), vec3(0.62,0.44,0.26), b)*strata;
        base = mix(base, stone, steep*smoothstep(-1.5, -3.0, vWP.y));
        float sand = smoothstep(-13.4, -14.6, y);
        vec3 sandC = mix(vec3(0.50,0.40,0.25), vec3(0.62,0.52,0.34), b);
        sandC *= 0.94 + 0.08*sin(vWP.x*2.3 + snoise(vec3(vWP.xz*0.6, 2.0))*2.0); // wind ripples
        float wet = smoothstep(-16.45, -16.95, vWP.y);
        sandC = mix(sandC, sandC*vec3(0.55,0.55,0.6), wet);
        float duneGrass = smoothstep(-14.0, -13.0, y)*(1.0-smoothstep(-13.0,-12.0,y));
        base = mix(base, sandC, sand);
        base = mix(base, vec3(0.12,0.16,0.05), duneGrass*0.5*step(0.5, b));

        float L = dapple(vWP);
        float diff = max(dot(n, uSunDir), 0.0);
        vec3 col = base*(uSkyColor*0.6 + uSunColor*diff*L*1.15 + lampLight(vWP)*2.0);
        col = applyFog(col, vWP);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = "ground";
  return mesh;
}
