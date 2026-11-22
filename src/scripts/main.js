import * as THREE from "three";
import { createSpace } from "./space.js";
import { createMeadow } from "./meadow.js";
import { createSound } from "./audio.js";
import { createEggs } from "./eggs.js";

const $ = (s) => document.querySelector(s);

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// ---------------- UI ----------------
const card = $("#card");
const hud = $("#hud");
const hint = $("#hint");
const flash = $("#flash");
const intro = $("#intro");
const skipBtn = $("#skip");
const toasts = $("#toasts");

function toast(kanji, html, ms = 4200) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="seal">${kanji}</span><span>${html}</span>`;
  toasts.appendChild(el);
  while (toasts.children.length > 3) toasts.firstChild.remove();
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 600);
  }, ms);
}

function stamp() {
  const s = $("#stamp");
  s.classList.remove("go");
  void s.offsetWidth;
  s.classList.add("go");
}

const eggCount = $("#egg-count");
const eggsBtn = $("#eggs-btn");
const panel = $("#eggs-panel");
function renderEggs() {
  eggCount.textContent = eggs.count;
  $("#egg-total").textContent = "/" + eggs.total;
  $("#egg-list").innerHTML = eggs
    .list()
    .map(
      (e) =>
        `<li class="${e.found ? "found" : ""}"><span class="k">${e.found ? e.kanji : "？"}</span><span>${
          e.found ? `<span class="n">${e.name}</span>` : `<span class="h">${e.hint}</span>`
        }</span></li>`
    )
    .join("");
}

const sound = createSound();
const eggs = createEggs({
  onFound(egg, n, total) {
    toast(egg.kanji, `<b>${egg.name}</b> · secret ${n} of ${total} found`);
    sound.sparkle();
    renderEggs();
    eggsBtn.classList.remove("bump");
    void eggsBtn.offsetWidth;
    eggsBtn.classList.add("bump");
  },
  onAll() {
    toast("全部", "<b>Every secret found.</b> You are officially a meadow person.", 7000);
    meadow && meadow.celebrate();
    sound.sparkle(7);
  },
});
renderEggs();

eggsBtn.addEventListener("click", () => {
  const open = panel.hidden;
  panel.hidden = !open;
  eggsBtn.setAttribute("aria-expanded", String(open));
});
document.addEventListener("pointerdown", (e) => {
  if (!panel.hidden && !panel.contains(e.target) && !eggsBtn.contains(e.target)) {
    panel.hidden = true;
    eggsBtn.setAttribute("aria-expanded", "false");
  }
});

const soundBtn = $("#sound-btn");
soundBtn.addEventListener("click", () => {
  const on = sound.toggle();
  soundBtn.setAttribute("aria-pressed", String(on));
  if (on) sound.chime(0.6);
});

$("#hanko").addEventListener("click", () => {
  const folded = card.classList.toggle("folded");
  $("#hanko").setAttribute("aria-expanded", String(!folded));
  sound.pop(folded ? 0.8 : 1.1);
});

// ---------------- secrets ----------------
function words(w) {
  if (!meadow || !meadow.ready) return false;
  if (w === "bid") {
    sound.gavel();
    stamp();
    setTimeout(() => {
      if (!eggs.find("sold")) toast("落札", "Sold! Again. To the curious visitor in the meadow.");
    }, 900);
    return true;
  }
  if (w === "mochi") {
    meadow.spawnMochi();
    sound.boing(1.2);
    eggs.find("mochi");
    return true;
  }
  if (w === "sakura" || w === "hanami") {
    sakura();
    return true;
  }
  return false;
}
function sakura() {
  if (!meadow || !meadow.ready) return;
  const on = meadow.toggleSakura();
  sound.sparkle(5);
  if (!eggs.find("sakura")) toast("花見", on ? "Spring comes back to the meadow." : "Back to summer.");
}

const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
let kpos = 0;
let typed = "";
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (mode === "space" && (k === " " || k === "enter" || k === "escape")) {
    e.preventDefault();
    skip();
    return;
  }
  if (k === KONAMI[kpos]) {
    kpos++;
    if (kpos === KONAMI.length) {
      kpos = 0;
      sakura();
    }
  } else kpos = k === KONAMI[0] ? 1 : 0;

  if (k.length === 1) {
    typed = (typed + k).slice(-12);
    for (const w of ["bid", "mochi", "sakura", "hanami"]) if (typed.endsWith(w) && words(w)) typed = "";
    if (k === "g" && meadow && meadow.ready) meadow.gust();
  }
});

$("#whisper").addEventListener("submit", (e) => {
  e.preventDefault();
  const inp = $("#whisper-in");
  const w = inp.value.trim().toLowerCase();
  inp.value = "";
  inp.blur();
  if (!words(w)) {
    if (w === "g" || w === "wind") meadow.gust();
    else toast("風", "The wind carries your word away.", 2600);
  }
});

// touch-friendly alternates: tap the 名刺 label five times, knock on the domain three times
function multiTap(el, n, fn) {
  let count = 0, last = 0;
  el.addEventListener("click", () => {
    const now = performance.now();
    count = now - last < 450 ? count + 1 : 1;
    last = now;
    if (count >= n) {
      count = 0;
      fn();
    }
  });
}
multiTap($("#vlabel"), 5, sakura);
multiTap($("#domain"), 3, () => words("bid"));

// a little note for the curious
console.log(
  "%c benj.bid %c\n\nHello, fellow tinkerer.\nThere are twelve secrets in the meadow.\nHere's one for free: type the word  mochi  anywhere.\n(The wind also answers to the letter g.)\n",
  "background:#c8372d;color:#f6f1e6;font:700 14px serif;padding:4px 8px;border-radius:3px",
  "color:#6d655b;font:13px/1.5 sans-serif"
);

// ---------------- 3D ----------------
let meadow = null;
let mode = "loading";

function revealUI() {
  card.classList.add("show");
  hud.classList.add("show");
  hint.classList.add("show");
  setTimeout(() => hint.classList.remove("show"), 9000);
  renderer.domElement.addEventListener("pointerdown", () => hint.classList.remove("show"), { once: true });
}

if (!webglOK()) {
  document.body.classList.add("no-webgl");
  $("#loader").style.display = "none";
  skipBtn.classList.add("gone");
  card.classList.add("show");
}

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const small = Math.min(innerWidth, innerHeight) < 700;
const Q =
  coarse || small
    ? { grassInner: 34000, grassMid: 26000, grassOuter: 14000, flowers: 1500, motes: 220, leaves: 3000, farLeaves: 5000, dpr: 1.6 }
    : { grassInner: 90000, grassMid: 72000, grassOuter: 40000, flowers: 3000, motes: 420, leaves: 7500, farLeaves: 14000, dpr: 1.75 };

let renderer;
if (webglOK()) {
  renderer = new THREE.WebGLRenderer({ canvas: $("#scene"), antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  meadow = createMeadow(renderer, Q, { sound, eggs, toast });
  let space = reduce ? null : createSpace();

  renderer.compile(meadow.scene, meadow.camera);
  if (space) renderer.compile(space.scene, space.camera);

  const params = new URLSearchParams(location.search);
  if (params.has("debug")) window.__meadow = meadow;
  if (params.has("reset")) {
    eggs.reset();
    renderEggs();
  }
  if (params.has("skip") || params.has("meadow")) {
    space && space.dispose();
    space = null;
  }

  let introT = 0;
  let t = 0;
  if (params.has("debug")) window.__setIntro = (v) => (introT = v);
  const clock = new THREE.Clock();

  function startMeadow() {
    if (mode === "meadow") return;
    mode = "meadow";
    skipBtn.classList.add("gone");
    intro.style.opacity = 0;
    // the cloud layers on either side of the swap hide the seam; a soft veil smooths it
    flash.style.transition = "none";
    flash.style.opacity = space ? 0.55 : 1;
    meadow.arrive(reduce ? 2.5 : 6.2, revealUI);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        flash.style.transition = `opacity ${space ? 0.9 : 2.2}s cubic-bezier(.4,0,.2,1)`;
        flash.style.opacity = 0;
      })
    );
    if (space) {
      const s = space;
      space = null;
      setTimeout(() => s.dispose(), 100);
    }
  }

  window.skip = function skip() {
    if (mode === "space") startMeadow();
    else meadow.skipArrival();
  };
  skipBtn.addEventListener("click", () => window.skip());

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight, false);
    meadow.resize();
    space && space.resize();
  });

  // adaptive quality: if frames are slow, drop resolution first, then thin the grass
  let dpr = Math.min(devicePixelRatio, Q.dpr);
  let acc = 0, frames = 0, strikes = 0;
  function watchdog(dt) {
    if (document.hidden || !meadow.ready || strikes > 5) return;
    acc += dt;
    frames++;
    if (frames < 90) return;
    const avg = acc / frames;
    acc = 0;
    frames = 0;
    if (avg > 1 / 45) {
      strikes++;
      if (dpr > 1.05) {
        dpr = Math.max(1, dpr - 0.3);
        renderer.setPixelRatio(dpr);
        renderer.setSize(innerWidth, innerHeight, false);
      } else meadow.thinGrass(0.7);
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    if (mode === "space" && space) {
      introT += dt;
      const s = space.update(introT, dt);
      flash.style.opacity = s.flash;
      intro.style.opacity = s.title;
      renderer.render(space.scene, space.camera);
      if (s.done) startMeadow();
    } else if (mode === "meadow") {
      meadow.update(dt, t);
      renderer.render(meadow.scene, meadow.camera);
      watchdog(dt);
    }
  }

  const loader = $("#loader");
  loader.style.opacity = 0;
  setTimeout(() => loader.remove(), 900);
  if (space) {
    mode = "space";
  } else {
    skipBtn.classList.add("gone");
    startMeadow();
  }
  clock.getDelta();
  frame();
}

function skip() {
  window.skip && window.skip();
}
