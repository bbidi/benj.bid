// Shared GLSL chunks + small JS math helpers.

// Simplex noise by Ashima Arts / Stefan Gustavson (MIT).
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm3(vec3 p){
  float a=0.5, s=0.0;
  for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; }
  return s;
}
float hash13(vec3 p){
  p=fract(p*0.1031);
  p+=dot(p,p.zyx+31.32);
  return fract((p.x+p.y)*p.z);
}
`;

// Meadow lighting: key light, dappled canopy shade, drifting cloud shadows, fog.
export const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uTrees[6];
uniform float uWind;
uniform vec4 uLamp;

vec3 lampLight(vec3 wp){
  float d = distance(wp, uLamp.xyz);
  return vec3(1.0, 0.52, 0.18) * uLamp.w / (1.0 + d*d*0.9);
}

// 1.0 = full sun, lower = in the shade of a canopy (with sun flecks dancing through).
float dapple(vec3 wp){
  vec2 off = -uSunDir.xz / max(uSunDir.y, 0.2);
  float shade = 0.0;
  for(int i=0;i<6;i++){
    vec4 t = uTrees[i];
    vec2 c = t.xy + off * max(t.w - wp.y, 0.0);
    float d = length(wp.xz - c);
    float wob = snoise(vec3(wp.xz*0.3, float(i)*7.13)) * t.z * 0.22;
    shade = max(shade, 1.0 - smoothstep(t.z*0.5, t.z*1.05, d + wob));
  }
  float fl = snoise(vec3(wp.xz*1.5 + vec2(uTime*0.12, 0.0), uTime*0.3));
  fl += 0.55*snoise(vec3(wp.xz*3.7, uTime*0.55 + 3.0));
  float holes = smoothstep(0.3, 0.8, fl);
  float tree = 1.0 - shade*(1.0 - holes*0.95);
  float cl = snoise(vec3(wp.xz*0.022 + vec2(uTime*0.018, uTime*0.007), 1.7));
  float cloud = 1.0 - smoothstep(0.2, 0.7, cl)*0.3;
  return tree*cloud;
}

vec3 applyFog(vec3 col, vec3 wp){
  float d = distance(wp, cameraPosition);
  float f = smoothstep(uFogNear, uFogFar, d);
  return mix(col, uFogColor, f*f*(3.0-2.0*f));
}
`;

export const OUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

// ---------- JS helpers ----------

export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function h3(x, y, z) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Smooth value noise in [0,1].
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx, dy, dz) => h3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf
  );
}

export function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
