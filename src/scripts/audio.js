// Everything here is synthesized with WebAudio: no audio files.
export function createSound() {
  let ctx = null, master = null, enabled = false, night = 0, noiseBuf = null;

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(3);
    startWind();
    scheduleCritters();
  }

  function makeNoise(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    return b;
  }

  function startWind() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.045;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 180;
    lfo2.connect(lfo2g).connect(lp.frequency);
    src.connect(lp).connect(g).connect(master);
    src.start();
    lfo.start();
    lfo2.start();
  }

  function env(g, t0, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function pan(x) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = x;
    p.connect(master);
    return p;
  }

  function chirp() {
    const t0 = ctx.currentTime + 0.05;
    const base = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    const out = pan(Math.random() * 1.6 - 0.8);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = t0 + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.04);
      o.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.08);
      env(g, t, 0.035, 0.01, 0.08);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.12);
    }
  }
  function cricket() {
    const t0 = ctx.currentTime + 0.05;
    const out = pan(Math.random() * 1.6 - 0.8);
    const f = 4300 + Math.random() * 600;
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 5; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const t = t0 + k * 0.32 + i * 0.03;
        o.frequency.value = f;
        env(g, t, 0.012, 0.004, 0.02);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.03);
      }
    }
  }
  function scheduleCritters() {
    const next = 1500 + Math.random() * 4000;
    setTimeout(() => {
      if (enabled && ctx.state === "running") {
        if (night < 0.5) chirp();
        else cricket();
      }
      scheduleCritters();
    }, next);
  }

  const ok = () => ctx && enabled;

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      if (!ctx) init();
      enabled = !enabled;
      ctx.resume();
      master.gain.setTargetAtTime(enabled ? 0.85 : 0, ctx.currentTime, 0.25);
      return enabled;
    },
    setNight(n) {
      night = n;
    },
    chime(vol = 1) {
      if (!ok()) return;
      const t0 = ctx.currentTime;
      const base = [1318.5, 1567.98, 1174.66][Math.floor(Math.random() * 3)];
      const out = pan(-0.3);
      [1, 2.76, 5.4, 8.93].forEach((m, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = base * m;
        env(g, t0, (0.09 / (i + 1)) * vol, 0.004, 2.8 / (i * 0.6 + 1));
        o.connect(g).connect(out);
        o.start(t0);
        o.stop(t0 + 3.2);
      });
    },
    sparkle(shift = 0) {
      if (!ok()) return;
      // yo-scale arpeggio
      const notes = [62, 64, 67, 69, 71, 74].map((n) => 440 * Math.pow(2, (n + shift - 69) / 12));
      notes.forEach((f, i) => {
        const t = ctx.currentTime + i * 0.08;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = f * 2;
        env(g, t, 0.05, 0.005, 0.7);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.8);
      });
    },
    pop(pitch = 1) {
      if (!ok()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(500 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.06);
      env(g, t, 0.08, 0.005, 0.12);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.2);
    },
    thud() {
      if (!ok()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      env(g, t, 0.25, 0.004, 0.18);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.25);
    },
    boing(pitch = 1, vol = 1) {
      if (!ok()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 18;
      lg.gain.value = 30 * pitch;
      lfo.connect(lg).connect(o.frequency);
      o.frequency.setValueAtTime(180 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.4);
      env(g, t, 0.12 * vol, 0.01, 0.4);
      o.connect(g).connect(master);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.5);
      lfo.stop(t + 0.5);
    },
    gavel() {
      if (!ok()) return;
      [0, 0.32, 0.64].forEach((dt, i) => {
        const t = ctx.currentTime + dt;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 900;
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        env(g, t, i === 2 ? 0.9 : 0.55, 0.002, 0.07);
        src.connect(bp).connect(g).connect(master);
        src.start(t, Math.random());
        src.stop(t + 0.1);
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
        env(og, t, i === 2 ? 0.35 : 0.2, 0.002, 0.12);
        o.connect(og).connect(master);
        o.start(t);
        o.stop(t + 0.15);
      });
    },
    bellow() {
      if (!ok()) return;
      // a red stag's roar: a growling sawtooth through a throaty formant
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(95, t);
      o.frequency.linearRampToValueAtTime(130, t + 0.35);
      o.frequency.exponentialRampToValueAtTime(70, t + 1.7);
      const vib = ctx.createOscillator();
      const vg = ctx.createGain();
      vib.frequency.value = 23;
      vg.gain.value = 6;
      vib.connect(vg).connect(o.frequency);
      const f1 = ctx.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.value = 520;
      f1.Q.value = 2.5;
      const f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
      g.gain.setValueAtTime(0.5, t + 1.0);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      const out = pan(0.2);
      o.connect(f1).connect(f2).connect(g).connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 2);
      vib.stop(t + 2);
    },
    tock(pitch = 1) {
      if (!ok()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(1100 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.05);
      env(g, t, 0.28, 0.002, 0.09);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.12);
    },
    whoosh() {
      if (!ok()) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(200, t);
      bp.frequency.exponentialRampToValueAtTime(1200, t + 0.8);
      bp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
      const g = ctx.createGain();
      env(g, t, 0.6, 0.6, 1.8);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 2.6);
    },
  };
}
