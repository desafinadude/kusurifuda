/* Kusurifuda — sound. Everything is synthesised with Web Audio (no files),
   so it works offline and adds nothing to the download.
   Voices: koto pluck, rin (temple bowl), hyoshigi (wooden clappers),
   taiko, furin (wind chime), fue (bamboo flute), paper and mon coins.
   Melodies use the miyako-bushi scale (D Eb G A Bb). A second kit, "academy"
   (celesta, harp, bubbles, bell, organ in D harmonic minor), is picked by a theme's
   "sound" setting. Exposes window.SFX. */
(function () {
  "use strict";
  const KEY = "kusurifuda.sound";
  let on = true; try { on = localStorage.getItem(KEY) !== "off"; } catch (e) {}
  let ctx = null, master = null, wet = null, noiseBuf = null;

  // miyako-bushi on D4: D Eb G A Bb, repeating up the octaves
  const SCALE = [293.66, 311.13, 392.0, 440.0, 466.16];
  const note = (k) => SCALE[((k % 5) + 5) % 5] * Math.pow(2, Math.floor(k / 5));

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    // small hall: generated impulse for that temple-courtyard tail
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.22; wet.connect(conv); conv.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { if (!on) return; init(); if (ctx && ctx.state === "suspended" && ctx.resume) ctx.resume().catch(() => {}); }
  ["pointerdown", "touchend", "keydown"].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  function out(g, rev = 1) { g.connect(master); if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(wet); } }
  function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function osc(type, f, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; }
  function noise(t, dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 0.5, dur + 0.05); return s; }

  // ---- voices ----
  function koto(f, t, vel = 1, len = 1.6) {
    // plucked silk: bright partials that die fast, a pitch "oshide" nudge on attack
    [[1, 0.5, len], [2, 0.22, len * 0.55], [3, 0.12, len * 0.35], [4, 0.06, len * 0.25], [5.02, 0.03, len * 0.15]].forEach(([m, a, d]) => {
      const o = osc(m < 1.5 ? "triangle" : "sine", f * m * 1.012, t, d); o.frequency.exponentialRampToValueAtTime(f * m, t + 0.04);
      const g = ctx.createGain(); env(g, t, a * vel, 0.004, d); o.connect(g); out(g, 0.8);
    });
    const n = noise(t, 0.03), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 4; bp.Q.value = 2;
    const g = ctx.createGain(); env(g, t, 0.12 * vel, 0.002, 0.03); n.connect(bp); bp.connect(g); out(g, 0.3);
  }
  function rin(f, t, vel = 1, len = 3.2) {
    // struck bowl: inharmonic partials, the fundamental beating slowly
    [[1, 0.35, len], [1.004, 0.25, len], [2.71, 0.14, len * 0.6], [5.15, 0.07, len * 0.35], [8.4, 0.03, len * 0.2]].forEach(([m, a, d]) => {
      const o = osc("sine", f * m, t, d); const g = ctx.createGain(); env(g, t, a * vel, 0.003, d); o.connect(g); out(g, 1.2);
    });
  }
  function hyoshigi(t, vel = 1, pitch = 1) {
    // two hard woods: tight bandpassed clack plus a short resonant body
    [[2100 * pitch, 9, 0.5], [3300 * pitch, 12, 0.3]].forEach(([fq, q, a]) => {
      const n = noise(t, 0.05), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fq; bp.Q.value = q;
      const g = ctx.createGain(); env(g, t, a * vel * 8, 0.001, 0.06); n.connect(bp); bp.connect(g); out(g, 0.6);
    });
    const o = osc("sine", 980 * pitch, t, 0.06), g = ctx.createGain(); env(g, t, 0.55 * vel, 0.001, 0.05); o.connect(g); out(g, 0.4);
  }
  function mokugyo(t, f = 520, vel = 1) {
    // hollow wooden fish: round "tok"
    const o = osc("sine", f * 1.25, t, 0.2); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const g = ctx.createGain(); env(g, t, 0.85 * vel, 0.002, 0.16); o.connect(g); out(g, 0.5);
    const n = noise(t, 0.02), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 3; bp.Q.value = 4;
    const g2 = ctx.createGain(); env(g2, t, 0.35 * vel, 0.001, 0.02); n.connect(bp); bp.connect(g2); out(g2, 0.2);
  }
  function taiko(t, vel = 1, f = 78) {
    const o = osc("sine", f * 1.6, t, 0.9); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.7);
    const g = ctx.createGain(); env(g, t, 0.9 * vel, 0.004, 0.75); o.connect(g); out(g, 0.7);
    const n = noise(t, 0.12), lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
    const g2 = ctx.createGain(); env(g2, t, 0.5 * vel, 0.002, 0.12); n.connect(lp); lp.connect(g2); out(g2, 0.4);
  }
  function furin(t, vel = 1) {
    // glass wind-bell: high, bright, long ring with a little shimmer
    [2637, 3135.96].forEach((f, i) => {
      const tt = t + i * 0.09;
      [[1, 0.16], [2.76, 0.05], [5.4, 0.02]].forEach(([m, a]) => { const o = osc("sine", f * m, tt, 2.2); const g = ctx.createGain(); env(g, tt, a * vel, 0.002, 2 / m); o.connect(g); out(g, 1.3); });
    });
  }
  function fue(f0, f1, t, dur = 0.9, vel = 1) {
    // breathy bamboo flute with a falling "meri" bend
    const o = osc("triangle", f0, t, dur); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.85);
    const lfo = osc("sine", 5.2, t, dur), lg = ctx.createGain(); lg.gain.value = f0 * 0.012; lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * vel, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); out(g, 1.1);
    const n = noise(t, dur), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f0 * 2; bp.Q.value = 3;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.05 * vel, t + 0.08); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.connect(bp); bp.connect(g2); out(g2, 0.8);
  }
  function paper(t, vel = 1, up = true) {
    const n = noise(t, 0.22), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(up ? 700 : 3200, t); bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 700, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.75 * vel, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); n.connect(bp); bp.connect(g); out(g, 0.3);
  }
  function coin(t, vel = 1) { [[2793, 0.24], [4186, 0.14], [6271, 0.06]].forEach(([f, a]) => { const o = osc("sine", f, t, 0.5); const g = ctx.createGain(); env(g, t, a * vel, 0.001, 0.4); o.connect(g); out(g, 0.6); }); }

  // ---- game events ----
  const now = () => ctx.currentTime + 0.01;
  const S = {
    tap(el) { mokugyo(now(), { W: 600, F: 660, E: 480, A: 540, V: 720 }[el] || 560, 0.7); },
    select() { paper(now(), 0.5); mokugyo(now() + 0.02, 440, 0.35); },
    play() { hyoshigi(now(), 0.8); },
    step(k) { koto(note(k + 2), now(), 1, 1.2); },
    sakura() { furin(now(), 0.7); },
    bad() { const t = now(); taiko(t, 0.55, 64); koto(note(-2), t + 0.02, 0.4, 0.5); koto(note(-1) * 1.06, t + 0.02, 0.3, 0.5); },
    undo() { mokugyo(now(), 380, 0.55); },
    cancel() { mokugyo(now(), 340, 0.45); paper(now(), 0.3, false); },
    toggle() { coin(now(), 0.5); },
    cure() { const t = now(); rin(293.66, t, 0.9); [0, 2, 4, 5, 7].forEach((k, i) => koto(note(k + 2), t + 0.12 + i * 0.09, 0.6, 1.4)); },
    fame() { furin(now(), 0.8); },
    mon() { const t = now(); coin(t, 0.9); coin(t + 0.11, 0.7); coin(t + 0.19, 0.5); },
    curse() { const t = now(); taiko(t, 1); taiko(t + 0.28, 0.7, 70); fue(587.33, 277.18, t + 0.15, 1.2, 0.9); },
    gather() { const t = now(); paper(t, 0.9); paper(t + 0.16, 0.7); },
    blind() { const t = now(); paper(t, 0.7, false); paper(t + 0.14, 0.6, false); mokugyo(t + 0.3, 420, 0.4); },
    buy() { const t = now(); coin(t, 1); coin(t + 0.12, 0.8); hyoshigi(t + 0.32, 0.5, 1.2); },
    plant() { const t = now(); mokugyo(t, 300, 0.7); koto(note(0), t + 0.05, 0.45, 1); },
    open() { paper(now(), 0.4); },
    endTurn() { const t = now(); hyoshigi(t, 0.55); hyoshigi(t + 0.16, 0.55); },
    rival() { const t = now(); hyoshigi(t, 0.9, 0.85); mokugyo(t + 0.18, 330, 0.5); },
    yourTurn() { const t = now(); furin(t, 0.6); koto(note(4), t + 0.05, 0.5, 1.4); },
    win() { const t = now(); [0, 2, 3, 4, 5, 7, 9, 10].forEach((k, i) => koto(note(k), t + i * 0.11, 0.65, 1.6)); rin(293.66, t + 0.95, 1, 4); furin(t + 1.1, 0.7); },
    lose() { const t = now(); [7, 5, 4, 2, 0].forEach((k, i) => koto(note(k), t + i * 0.22, 0.5, 1.6)); taiko(t + 1.15, 0.6, 60); },
    newGame() { const t = now(); hyoshigi(t, 0.8); hyoshigi(t + 0.32, 0.8); hyoshigi(t + 0.52, 0.8); koto(note(2), t + 0.75, 0.6); koto(note(5), t + 0.86, 0.6); },
  };

  // ---- "academy" kit: celesta, harp, cauldron bubbles, chapel bell, organ ----
  // D harmonic minor: D E F G A Bb C#
  const MINOR = [293.66, 329.63, 349.23, 392.0, 440.0, 466.16, 554.37];
  const mnote = (k) => MINOR[((k % 7) + 7) % 7] * Math.pow(2, Math.floor(k / 7));
  function celesta(f, t, vel = 1, len = 1.1) {
    [[1, 0.3, len], [4, 0.07, len * 0.3], [8.1, 0.02, len * 0.12]].forEach(([m, a, d]) => { const o = osc("sine", f * m, t, d); const g = ctx.createGain(); env(g, t, a * vel, 0.002, d); o.connect(g); out(g, 1.1); });
  }
  function harp(f, t, vel = 1, len = 2) {
    [[1, 0.36, len], [2, 0.12, len * 0.6], [3, 0.05, len * 0.4]].forEach(([m, a, d]) => { const o = osc(m === 1 ? "triangle" : "sine", f * m, t, d); const g = ctx.createGain(); env(g, t, a * vel, 0.006, d); o.connect(g); out(g, 1); });
  }
  function bubble(t, vel = 1, f = 300) {
    const o = osc("sine", f, t, 0.12); o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.1);
    const g = ctx.createGain(); env(g, t, 0.4 * vel, 0.005, 0.1); o.connect(g); out(g, 0.5);
  }
  function brew(t, vel = 1, n = 5) { for (let i = 0; i < n; i++) bubble(t + i * 0.07 + Math.random() * 0.04, vel * (0.6 + Math.random() * 0.4), 180 + Math.random() * 260); }
  function sparkle(t, vel = 1, n = 6) { for (let i = 0; i < n; i++) celesta(mnote(14 + ((i * 3) % 9)), t + i * 0.045, vel * 0.45, 0.5); }
  function bell(f, t, vel = 1) { [[0.5, 0.22, 4], [1, 0.3, 3], [1.19, 0.14, 2.4], [1.5, 0.1, 2], [2, 0.08, 1.6], [2.66, 0.04, 1]].forEach(([m, a, d]) => { const o = osc("sine", f * m, t, d); const g = ctx.createGain(); env(g, t, a * vel, 0.003, d); o.connect(g); out(g, 1.3); }); }
  function organ(fs, t, dur = 1.4, vel = 1) {
    fs.forEach((f) => [1, 2].forEach((m) => {
      const o = osc("sawtooth", f * m, t, dur), lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * vel / m, t + 0.15); g.gain.setValueAtTime(0.05 * vel / m, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); out(g, 1.2);
    }));
  }
  function whoosh(t, vel = 1, up = true) {
    const n = noise(t, 0.4), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(up ? 400 : 2400, t); bp.frequency.exponentialRampToValueAtTime(up ? 2400 : 400, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38); n.connect(bp); bp.connect(g); out(g, 0.6);
  }
  function quill(t, vel = 1) { for (let i = 0; i < 3; i++) { const n = noise(t + i * 0.06, 0.04), hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4500; const g = ctx.createGain(); env(g, t + i * 0.06, 0.35 * vel, 0.004, 0.035); n.connect(hp); hp.connect(g); out(g, 0.2); } }
  const A = {
    tap(el) { celesta({ W: mnote(7), F: mnote(9), E: mnote(5), A: mnote(8), V: mnote(11) }[el] || mnote(7), now(), 0.6, 0.6); },
    select() { paper(now(), 0.4); celesta(mnote(9), now() + 0.02, 0.3, 0.4); },
    play() { bubble(now(), 0.9, 260); },
    step(k) { harp(mnote(k + 4), now(), 0.9, 1.4); },
    sakura() { sparkle(now(), 0.8); },
    bad() { const t = now(); organ([mnote(-7), mnote(-6)], t, 0.6, 0.8); },
    undo() { whoosh(now(), 0.4, false); },
    cancel() { whoosh(now(), 0.45, false); paper(now() + 0.05, 0.3, false); },
    toggle() { celesta(mnote(11), now(), 0.5, 0.4); },
    cure() { const t = now(); brew(t, 0.8, 6); [0, 2, 4, 7, 9].forEach((k, i) => harp(mnote(k + 7), t + 0.25 + i * 0.09, 0.6, 1.6)); sparkle(t + 0.75, 0.7); },
    fame() { sparkle(now(), 0.7, 4); },
    mon() { const t = now(); coin(t, 0.8); coin(t + 0.11, 0.6); },
    curse() { const t = now(); organ([mnote(-7), mnote(-4), mnote(-1)], t, 1.6, 1.1); whoosh(t + 0.1, 0.7, false); bell(mnote(-7), t + 0.05, 0.6); },
    gather() { const t = now(); paper(t, 0.8); quill(t + 0.15, 0.7); },
    blind() { const t = now(); whoosh(t, 0.5); paper(t + 0.2, 0.6, false); },
    buy() { const t = now(); coin(t, 0.9); coin(t + 0.12, 0.7); celesta(mnote(14), t + 0.3, 0.5); },
    plant() { const t = now(); bubble(t, 0.5, 200); harp(mnote(0), t + 0.05, 0.5, 1.2); },
    open() { paper(now(), 0.35); },
    endTurn() { quill(now(), 0.7); },
    rival() { const t = now(); whoosh(t, 0.6); celesta(mnote(6), t + 0.18, 0.4); },
    yourTurn() { const t = now(); bell(mnote(7), t, 0.5); },
    win() { const t = now(); [0, 2, 4, 5, 7, 9, 11, 14].forEach((k, i) => celesta(mnote(k + 7), t + i * 0.1, 0.6, 1.2)); organ([mnote(0), mnote(4), mnote(7)].map((f) => f / 2), t + 0.9, 2.2, 0.9); bell(mnote(7), t + 0.9, 0.8); },
    lose() { const t = now(); [7, 5, 4, 2, 0].forEach((k, i) => harp(mnote(k), t + i * 0.22, 0.5, 1.6)); organ([mnote(-7), mnote(-4)], t + 1.1, 1.6, 0.7); },
    newGame() { const t = now(); bell(mnote(0), t, 0.7); bell(mnote(4), t + 0.5, 0.6); sparkle(t + 0.9, 0.6); },
  };
  const KITS = { kusurifuda: S, academy: A };
  let kit = S;

  const SFX = {};
  Object.keys(S).forEach((k) => { SFX[k] = (...a) => { if (!on || !init()) return; if (ctx.state === "suspended" && !(ctx instanceof (window.OfflineAudioContext || Object))) ctx.resume().catch(() => {}); try { (kit[k] || S[k])(...a); } catch (e) { /* audio is optional */ } }; });
  SFX.kit = (name) => { kit = KITS[name] || S; };
  SFX.isOn = () => on;
  SFX.set = (v) => { on = !!v; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {} if (on) { unlock(); SFX.tap("V"); } };
  SFX._ctx = () => ctx;
  window.SFX = SFX;
})();
