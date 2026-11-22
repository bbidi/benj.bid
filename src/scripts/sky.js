import * as THREE from "three";
import { NOISE, OUT } from "./glsl.js";

export function createSky(U) {
  const uniforms = {
    uTime: U.uTime,
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uMoon: { value: new THREE.Vector3(0.4, 0.5, -0.8).normalize() },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uCloud: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() },
    uNight: U.uNight,
    uSunset: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vD;
      void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime; uniform vec3 uSun; uniform vec3 uMoon;
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uCloud; uniform vec3 uSunCol;
      uniform float uNight; uniform float uSunset;
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.75, h), 0.55));
        col = mix(col, uHorizon*0.85, smoothstep(0.0, -0.25, h));

        float sd = dot(d, uSun);
        float day = 1.0 - uNight;
        // warm haze around the sun
        col += uSunCol*(pow(max(sd,0.0), 6.0)*(0.22 + uSunset*0.35) + pow(max(sd,0.0), 48.0)*0.5 + pow(max(sd,0.0), 2.0)*uSunset*0.18)*day;
        // sunset band hugging the horizon
        col += vec3(1.0,0.42,0.18)*uSunset*pow(1.0-abs(h), 8.0)*(0.35+0.65*pow(max(sd*0.5+0.5,0.0),3.0))*0.7;

        // soft, slow cumulus
        if (h > -0.02) {
          vec2 uv = d.xz/(h+0.16);
          vec3 q = vec3(uv*0.7 + vec2(uTime*0.004, uTime*0.0015), uTime*0.002);
          float c = fbm3(q) + 0.4*fbm3(q*2.7+5.0);
          float cov = smoothstep(0.12, 0.7, c);
          float edge = smoothstep(0.12, 0.45, c);
          vec3 cc = mix(uCloud*0.78, uCloud, smoothstep(0.2, 0.9, c));
          cc += uSunCol*pow(max(sd,0.0), 5.0)*0.45*(1.0-edge*0.5)*day;   // silver lining
          float fadeH = smoothstep(-0.02, 0.18, h);
          col = mix(col, cc, cov*fadeH*0.9);
        }

        // sun disc
        col += uSunCol*smoothstep(0.99935, 0.99965, sd)*6.0*day;

        // stars
        vec3 p = d*190.0; vec3 cell = floor(p); vec3 f = fract(p)-0.5;
        vec3 o = (vec3(hash13(cell+1.3), hash13(cell+2.7), hash13(cell+5.1))-0.5)*0.6;
        float rr = hash13(cell);
        float star = smoothstep(0.11, 0.0, length(f-o))*step(0.982, rr);
        star *= 0.6 + 0.4*sin(uTime*(2.0+rr*5.0) + rr*40.0);
        col += vec3(0.9,0.93,1.0)*star*uNight*smoothstep(0.02, 0.25, h)*1.4;

        // moon
        float md = dot(d, uMoon);
        float disc = smoothstep(0.99905, 0.9993, md);
        float craters = 0.85 + 0.15*snoise(d*120.0);
        col = mix(col, vec3(0.95,0.96,1.0)*craters*1.4, disc*uNight);
        col += vec3(0.6,0.7,1.0)*pow(max(md,0.0), 300.0)*0.35*uNight;

        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 64, 40), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
