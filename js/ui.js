/* Kusurifuda — UI.
   Everything you see comes from four files loaded at start:
     config.json          which theme and language
     rules.json           the numbers (handed to the engine)
     i18n/<lang>.json     every word
     themes/<id>/theme.json  colours, fonts, glyphs and art (with a sprite sheet)
   Three layouts from the design canvas (phone portrait, phone landscape,
   tablet) are laid out in design pixels and scaled to the screen. */
(function () {
  "use strict";
  const KF = window.KF;
  const SFX = window.SFX || new Proxy({}, { get: () => () => {} });
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "");
  const attr = (s) => esc(stripTags(s));
  const G = () => KF.G;
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- configuration (filled in by boot) ----------
  let CFG = null, T = null, STR = {}, LANG = "en", PLURAL = null;
  const ASSET = {}, SPR = {}, PCOL = {};   // asset name -> url ; asset name -> {id, vb} when it is in the sprite sheet
  // the beta (served under /beta/) keeps its own settings and quest progress
  const PKEY = (/\/beta\//.test(location.pathname) ? "kusurifuda-beta" : "kusurifuda") + ".prefs";
  let PREFS = { hints: false, steam: true };
  try { PREFS = Object.assign(PREFS, JSON.parse(localStorage.getItem(PKEY) || "{}")); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(PREFS)); } catch (e) {} };

  // ---------- text ----------
  function lookup(key) { return key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), STR); }
  // t("menu.sound") · t("x", {n: 2}) picks {one, other, ...} by the language's plural rules · {name} is filled from vars
  function t(key, vars) {
    let v = lookup(key);
    if (v === undefined) { if (window.KF_DEBUG) console.warn("missing text", key); return key; }
    if (v && typeof v === "object" && !Array.isArray(v)) { const n = vars && (vars.n != null ? vars.n : vars.count); v = v[PLURAL ? PLURAL.select(n == null ? 0 : n) : "other"] ?? v.other ?? ""; }
    // {{term}}: a word the theme can rename everywhere (terms.mon = "mon", "gold"...); {var}: filled from vars
    return String(v).replace(/\{\{(\w+)\}\}/g, (m, k) => { if (/^rival$/i.test(k) && rivalNm()) return rivalNm(); const w = lookup("terms." + k); return typeof w === "string" ? w : k; }).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  }
  const list = (k) => { const v = lookup(k); return Array.isArray(v) ? v : []; };
  const pick = (k, i) => { const l = list(k); return l.length ? l[((i % l.length) + l.length) % l.length] : ""; };
  const whoOf = (pt, short) => { const e = pick("content.patients", pt.who); return typeof e === "string" ? e : e ? (short ? e.short || e.full : e.full) : ""; };
  const ailOf = (pt) => pick("content.ailments", pt.ail);
  const elName = (el) => t("content.elements." + el);
  const toolName = (id) => lookup("content.tools." + id + ".name") || id.charAt(0).toUpperCase() + id.slice(1);
  function toolText(id, short) {
    const own = lookup("content.tools." + id + (short ? ".short" : ".text"));
    if (own) return own;
    const d = KF.rules.toolDefs[id]; if (!d) return "";
    return t("toolEffects." + d.effect + (short ? "Short" : ""), { turns: (d.turns || []).map((k) => t("turns." + k)).join(" / "), amount: d.amount, min: d.min, by: (d.by || []).map((k) => (k > 0 ? "+" : "−") + Math.abs(k)).join(" / ") });
  }
  function cardName(c) {
    if (c.step) return toolName(c.step);
    if (c.ward) return whoOf({ who: c.who }, true);
    if (c.el === "V") { const v = lookup("content.ingredients.V"); return Array.isArray(v) ? v[0] : v || ""; }
    return pick("content.ingredients." + c.el + (c.el2 || ""), c.n);
  }
  const DIAG = { "→↑": "↗", "→↓": "↘", "←↑": "↖", "←↓": "↙" };
  const arrows = (steps) => (steps || []).map(([x, y]) => { const h = x > 0 ? "→" : x < 0 ? "←" : "", v = y < 0 ? "↑" : y > 0 ? "↓" : ""; return (h && v ? DIAG[h + v] : h || v).repeat(Math.max(Math.abs(x), Math.abs(y))); }).join("");
  const cardLabel = (c) => (c.el === "V" ? cardName(c) : `${cardName(c)} (${arrows(c.steps)})`);
  // glyphs: plain text for labels and screen readers (gl), an SVG icon on screen when the theme draws one (ic)
  const gl = (k) => (T && T.glyphs && T.glyphs[k]) || "";
  const ic = (k) => (ASSET["icon." + k] ? art("icon." + k, "gi") : esc(gl(k)));
  const withGl = (text, k) => (gl(k) || ASSET["icon." + k] ? `${text} · ${ic(k)}` : text);

  // ---------- theme ----------
  const EL = (el) => (T.elements && T.elements[el]) || { glyph: el, color: "#888", ink: "#555" };
  // text and signs drawn on an element's colour: dark on a pale colour like sky-blue air, else white
  const onEl = (el) => EL(el).on || "#fff";
  const MC = (k) => PCOL[k] || (T.map && T.map[k]) || "#000";
  const toolGlyph = (id) => (T.tools && T.tools[id] && T.tools[id].glyph) || "";
  const elIc = (e) => (ASSET["icon.el." + e] ? art("icon.el." + e, "gi") : esc(EL(e).glyph));
  // ---------- people: characters, guilds, colours ----------
  const CHARS = () => (T.characters || []).filter((c) => KF.rules.abilities && KF.rules.abilities[c.ability]);
  const GUILDS = () => T.guilds || [];
  // the theme's character for a player's ability (a theme switch mid-game keeps the ability, changes the face)
  function charOf(pi) { const p = G() && G().P[pi]; if (!p || !p.ability) return null; return CHARS().find((c) => c.ability === p.ability) || { id: null, ability: p.ability }; }
  const charName = (c) => (c && c.id && lookup("content.characters." + c.id + ".name")) || (c ? abilityName(c.ability) : "");
  // the opponent by their character's name during a game ({{rival}} in the text), else the plain word
  const rivalNm = () => { const c = G() && charOf(1); return c && c.id ? charName(c) : ""; };
  const rivalLabel = () => esc(rivalNm()) || t("who.rival");
  const charTitle = (c) => (c && c.id && lookup("content.characters." + c.id + ".title")) || "";
  const abilityName = (a) => lookup("abilities." + a + ".name") || a;
  const abilityText = (a) => (lookup("abilities." + a + ".text") ? t("abilities." + a + ".text") : "");
  function guildOf(pi) { const p = G() && G().P[pi], gs = GUILDS(); if (!p || p.guild == null || !gs.length) return null; return gs[p.guild % gs.length]; }
  const guildName = (g) => (g && lookup("content.guilds." + g.id + ".name")) || "";
  const crest = (pi, cls = "crest") => { const g = guildOf(pi); return g && g.art ? art(g.art, cls) : ""; };
  // a guild's colour is its element's: the colour itself, or its deeper ink when the colour is too pale for white text (air)
  const guildColor = (g) => { if (!g) return null; if (!g.element) return g.color || null; const e = EL(g.element); return e.on ? e.ink || e.color : e.color; };
  // a player's own oni: their guild's (by its element) when the theme has one, else the plain oni
  const oniKey = (pi) => { const g = guildOf(pi), k = g && g.element ? "oni." + g.element : null; return k && (ASSET[k] || SPR[k]) ? k : "oni"; };
  const oniArt = (pi, cls) => art(oniKey(pi), cls);
  const portrait = (pi, cls = "por") => { const c = charOf(pi); return c && c.art ? art(c.art, cls) : ""; };
  // hex colour arithmetic for the player's colour
  const hx = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)) : null; };
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); if (!A || !B) return a; return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  function applyPlayerColor() {
    Object.keys(PCOL).forEach((k) => delete PCOL[k]);
    const gs = GUILDS(), me0 = G() && G().P[0];
    const c = U.screen ? guildColor(gs[(PREFS.who || {}).guild]) : me0 && (me0.guild != null && gs.length ? guildColor(gs[me0.guild % gs.length]) : me0.color), st = document.getElementById("player-style") || Object.assign(document.head.appendChild(document.createElement("style")), { id: "player-style" });
    if (!c || !hx(c)) { st.textContent = ""; HC.clear(); return; }
    const C = T.colors || {}, white = "#FFFFFF", black = "#000000";
    const v = { shu: c, "shu-hi": mix(c, white, 0.12), "shu-line": mix(c, white, 0.4), you: mix(c, white, 0.45), "shu-deep": mix(c, black, 0.25), "shu-dim": mix(c, C.lacquer || black, 0.5), "shu-shadow": mix(c, black, 0.55) };
    st.textContent = `:root{${Object.entries(v).map(([k, x]) => `--${k}:${x}`).join(";")}}`;
    Object.assign(PCOL, { route: c, marker: v["shu-hi"], trail: mix(c, (T.map && T.map.cell && hx(T.map.cell) ? T.map.cell : C.parch) || white, 0.68) });
  }
  const toolIc = (id) => (ASSET["icon.tl." + id] ? art("icon.tl." + id, "gi") : esc(toolGlyph(id)));
  const toolArt = (id) => (T.tools && T.tools[id] && T.tools[id].art) || null;
  // a tool's picture, or its glyph on a tile while it has none
  const toolPic = (id) => art(toolArt(id)) || `<span class="tglyph" aria-hidden="true">${esc(toolGlyph(id) || toolName(id).slice(0, 1))}</span>`;
  // an asset as HTML: <svg><use> from the sprite sheet when possible, otherwise its own file
  function art(name, cls = "", o = {}) {
    if (!name) return "";
    const s = SPR[name];
    if (s) { const [x, y, w, h] = s.vb.split(/[\s,]+/); const wd = cls === "gi" ? ` style="width:${(w / h).toFixed(3)}em"` : ""; return `<svg class="${cls === "gi" ? "gi" : "ai" + (cls ? " " + cls : "")}" viewBox="${s.vb}"${wd}${o.slice ? ' preserveAspectRatio="xMidYMid slice"' : ""} aria-hidden="true"><use href="#${s.id}" x="${x}" y="${y}" width="${w}" height="${h}"/></svg>`; }
    return ASSET[name] ? `<img class="${cls === "gi" ? "gi" : "ai" + (cls ? " " + cls : "")}" src="${ASSET[name]}" alt=""${o.slice ? ' style="object-fit:cover"' : ""}>` : "";
  }
  // an asset inside an SVG drawing
  function artIn(name, x, y, w, h) {
    const s = SPR[name];
    if (s) return `<use href="#${s.id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    return ASSET[name] ? `<image href="${ASSET[name]}" x="${x}" y="${y}" width="${w}" height="${h}"/>` : "";
  }

  const sv = (d, w = 18, c = "currentColor") => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = {
    menu: () => sv("M4 7h16M4 12h16M4 17h10", 20, "var(--gold)"),
    gather: (w = 20) => sv("M12 4v10M7 9l5 5 5-5M4 19h16", w, "var(--gold)"),
    plant: (w = 20) => sv("M12 21v-9M12 12c0-4-3-6.5-7-6.5 0 4 3 6.5 7 6.5zM12 11c0-3 2.5-5.5 6.5-5.5 0 3.5-2.5 5.5-6.5 5.5zM6 21h12", w, "var(--gold)"),
    tools: (w = 20) => sv("M3.5 11h17a8.5 8.5 0 0 1-17 0zM14 11l5-7M9 21h6", w, "var(--gold)"),
    log: (w = 20) => sv("M6 4h12v16H6zM9 8h6M9 12h6M9 16h4", w, "var(--gold)"),
    back: () => sv("M15 5l-7 7 7 7", 20, "var(--gold)"),
    undo: () => sv("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"),
    x: () => sv("M6 6l12 12M18 6L6 18", 16),
    ok: () => sv("M5 12.5l4.5 4.5L19 7.5", 18),
    clear: () => sv("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", 16),
    sound: () => sv("M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11", 18, "var(--gold)"),
    mute: () => sv("M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6", 18, "var(--gold)"),
    hint: () => sv("M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z", 18, "var(--gold)"),
    check: (w = 10) => sv("M5 12.5l4.5 4.5L19 7.5", w),
    blind: () => '<span class="cbk"></span>',
    turn: () => sv("M20 12a8 8 0 1 0-2.4 5.7M20 5v7h-7", 22),
  };
  // a mon coin (a theme can draw its own as icon.mon) and a value next to one
  const monIc = (cls = "") => (ASSET["icon.mon"] ? art("icon.mon", "mon" + (cls ? " " + cls : "")) : `<svg class="mon${cls ? " " + cls : ""}" viewBox="0 0 26 26" aria-hidden="true"><path fill-rule="evenodd" d="M13 1.5a11.5 11.5 0 1 0 0 23 11.5 11.5 0 1 0 0-23zM10 10h6v6h-6z"/><circle cx="13" cy="13" r="8.5" fill="none"/></svg>`);
  const monVal = (n, cls = "") => `<span class="monv${cls ? " " + cls : ""}">${monIc()}<b>${n}</b></span>`;

  // ---------- UI state ----------
  const U = {
    layout: null, sw: 390, sh: 844, scale: 1,
    sel: 0, route: [], pend: null, turnSel: {}, msg: null, msgBad: false,
    tab: "hand", mkt: [], sheet: null, busy: false, anim: false, seen: new Set(), lastFame: [0, 0], shake: false,
    bo: null,      // board override while animating: {pt, trail, pos, rival}
    rv: null,      // rival narration: {say, sub, chips, pop}
    taking: null,  // market card ids the rival is about to take
    botLines: [], speed: 1, enter: 0,
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 250) : ms * U.speed));

  // ---------- derived state ----------
  const RU = () => KF.rules;
  const me = () => G().P[0], bot = () => G().P[1];
  const openHands = () => !!RU().openHands;
  // the patient on the board: a bench patient by index, or your royal's current stage (U.sel = -1)
  const ROYAL = -1;
  const curPt = () => {
    if (U.sel === ROYAL) { const r = KF.royalStage(0); if (r) return r; U.sel = 0; }
    const v = G().village; if (!v.length) return KF.royalStage(0) ? ((U.sel = ROYAL), KF.royalStage(0)) : null;
    if (U.sel == null || U.sel >= v.length) U.sel = Math.min(U.sel || 0, v.length - 1); return v[U.sel];
  };
  const selKey = () => (U.sel === ROYAL ? "royal" : U.sel);
  const myTurn = () => { const g = G(); return g && !g.over && g.cur === 0 && !U.busy && !U.anim && g.phase === "main"; };
  const canAct = () => myTurn() && !G().turn.acted;
  const canPlan = () => myTurn() && !U.busy; // route previews: still allowed once the move is spent, for planning
  const nTake = () => KF.gatherCount(me());
  const usedIn = (g, i) => U.route.some((r) => r.g === g && r.i === i);
  const usedFlags = () => U.route.reduce((a, r) => a | (r.f || 0), 0);
  const cardAt = (g, i, p = me()) => (g === "w" ? (p.ward[i] ? KF.wardCard(p.ward[i]) : null) : i < 0 ? KF.stepCard(-1 - i) : g ? p.garden[i] : p.hand[i]);
  const moveName = (mv) => lookup("moves." + mv + ".name") || mv;
  const moveText = (mv, el) => t("moves." + mv + ".text", { dir: t("dir." + (KF.rules.deck.elements[el] || "up")).toLowerCase(), el: elName(el) });
  // a garden card may go in twice when it is your guild's element (any card, with the kettle) and nothing has echoed yet this brew
  function canEcho(i) {
    const c = me().garden[i]; if (!KF.echoes(c, KF.echoEl(me()))) return false;
    const n = U.route.filter((r) => r.g === true && r.i === i).length;
    const echoed = U.route.some((r, j) => r.g === true && r.i >= 0 && U.route.findIndex((q) => q.g === true && q.i === r.i) !== j);
    return n === 1 && !echoed;
  }
  // cards whose way you choose as you play them: the kitsune, and a ward patient's leap. Their ways, clockwise from up
  const isPick = (c) => !!c && (KF.isAny(c) || !!c.knight);
  const clock = ([x, y]) => (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
  const pickWays = (c) => KF.variants(c, []).map((v) => v.steps[0]).sort((a, b) => clock(a) - clock(b));
  const selTurns = () => Object.keys(U.turnSel).filter((k) => U.turnSel[k] != null && RU().toolDefs[k]);
  function pendSteps() {
    const p = U.pend; if (!p) return null; const c = cardAt(p.g, p.i); if (!c) return null;
    if (isPick(c)) return p.dir ? [p.dir] : null;
    return selTurns().reduce((st, k) => (st ? KF.applyTool(k, st, KF.toolOpts(k)[U.turnSel[k]]) : st), c.steps);
  }
  const pendFlags = () => { const p = U.pend; if (!p) return 0; const c = cardAt(p.g, p.i); if (!c || isPick(c)) return 0; return selTurns().reduce((a, k) => a | KF.bit(k), 0); };
  function routeState() {
    const pt = curPt(); if (!pt) return null;
    const rp = KF.replay(pt, U.route); const d = KF.md(rp.pos, pt.t);
    const handUsed = U.route.filter((r) => !r.g).length;
    let prev = null; const st = pendSteps();
    if (st) { const s = KF.stepCells(pt, rp.pos, st); prev = { trail: [rp.pos, ...s.trail], fail: s.fail, pos: s.pos, d: s.fail ? null : KF.md(s.pos, pt.t), bonus: s.bonus }; }
    const em = U.route.reduce((a, r) => { const c = cardAt(r.g, r.i); return c ? a | KF.cardBits(c) : a; }, 0);
    const need = KF.needEl(pt), elOK = !need || !!(em & (KF.elBit(need) | KF.elBit("V")));
    // on the cure: let the engine say what's still missing (ingredients, symptoms, a quirk), so the button never lies
    const err = d === 0 && U.route.length ? KF.checkRoute(0, selKey(), U.route.map(({ g, i, opt, f }) => ({ g, i, opt, f }))) : null;
    const symN = pt.sym ? pt.sym.length : 0, symGot = symN ? [...Array(symN).keys()].filter((i) => rp.sym & (1 << i)).length : 0;
    return { pt, rp, d, on: d === 0 && U.route.length > 0, handUsed, prev, elOK, need, err, symN, symGot, ready: d === 0 && U.route.length > 0 && !err };
  }
  function resetRoute() { U.route = []; U.pend = null; U.turnSel = {}; U.msg = null; }

  // hint mode: can this player cure this patient with the cards they hold now? (cached)
  const HC = new Map();
  function curableBy(pi, pt) {
    const p = G().P[pi];
    const key = [pi, pt.id, pt.t, pt.haz.length, pt.rot, p.hand.map((c) => c.id).join("."), p.garden.map((c) => c.id).join("."), Object.keys(p.tools).sort().join("."), (p.ward || []).map((w) => w.id + ":" + w.uses).join(".")].join("|");
    if (KF.barred(pi, pt)) return false;
    if (!HC.has(key)) { if (HC.size > 500) HC.clear(); const k = G().village.indexOf(pt); HC.set(key, (k >= 0 && KF.knownFor(pi, k) >= 0) || !!KF.solveFor(pi, pt, 6).best); }
    return HC.get(key);
  }
  function hintBadges(pt, cls = "") {
    if (!PREFS.hints || !pt) return "";
    const a = curableBy(0, pt), b = openHands() && curableBy(1, pt);
    if (!a && !b) return "";
    return `<span class="hints${cls ? " " + cls : ""}">${a ? `<i class="hb you" title="${attr(t("hints.you"))}" aria-label="${attr(t("hints.you"))}">${ICON.check()}</i>` : ""}${b ? `<i class="hb rv" title="${attr(t("hints.rival"))}" aria-label="${attr(t("hints.rival"))}">${ICON.check()}</i>` : ""}</span>`;
  }

  // ---------- svg ----------
  // the element glyphs for the directions a path actually takes (an up-and-right path is water AND fire)
  function dirEls(c, steps) { if (c.el === "V") return ["V"]; if (c.ward) return [c.el]; const els = KF.dirsOf(steps || c.steps).map(KF.elOfDir).filter(Boolean); return els.length ? els : [c.el]; }
  function pathSVG(c, steps, px) {
    const s = EL(c.el).ink, ring = T.colors.parch, ink = T.colors.ink;
    if (c.knight && !steps) {
      const ks = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];
      return `<svg width="${px}" height="${px}" viewBox="-2.6 -2.6 5.2 5.2" aria-hidden="true">${ks.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".26" fill="${s}"/>`).join("")}<circle cx="0" cy="0" r=".3" fill="${ring}" stroke="${ink}" stroke-width=".12"/></svg>`;
    }
    if (c.el === "V" || !steps) {
      const ks = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
      return `<svg width="${px}" height="${px}" viewBox="-2 -2 4 4" aria-hidden="true">${ks.map(([x, y]) => `<line x1="0" y1="0" x2="${x * 0.8}" y2="${y * 0.8}" stroke="${s}" stroke-width=".16" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r=".17" fill="${s}"/>`).join("")}<circle cx="0" cy="0" r=".22" fill="${ring}" stroke="${ink}" stroke-width=".1"/></svg>`;
    }
    let x = 0, y = 0; const pts = [[0, 0]];
    steps.forEach(([dx, dy]) => { x += dx; y += dy; pts.push([x, y]); });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const line = c.knight ? `<path d="M0 0Q${x / 2 + (y ? 0.9 : 0)} ${y / 2 + (x ? -0.9 : 0)} ${x} ${y}" fill="none" stroke="${s}" stroke-width=".2" stroke-dasharray=".28 .18" stroke-linecap="round"/>` : `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${s}" stroke-width=".22" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<svg width="${px}" height="${px}" viewBox="${cx - 2} ${cy - 2} 4 4" aria-hidden="true">${line}<circle cx="0" cy="0" r=".22" fill="${ring}" stroke="${ink}" stroke-width=".1"/><path d="M${x - 0.24} ${y - 0.24}L${x + 0.24} ${y + 0.24}M${x + 0.24} ${y - 0.24}L${x - 0.24} ${y + 0.24}" stroke="${s}" stroke-width=".2" stroke-linecap="round"/></svg>`;
  }
  // a patient map. o: {px, icons, trail, pos, prev:{trail, fail}, label, rival}
  function mapSVG(pt, o = {}) {
    const B = pt.b, N = B[1] - B[0] + 1, CX = 0.5 - B[0], CY = 0.5 - B[2];
    const ctr = (v) => `${(v[0] + CX).toFixed(3)},${(v[1] + CY).toFixed(3)}`;
    const onTrail = new Set((o.trail || []).slice(1).map((p) => p.join(",")));
    const routeCol = MC(o.rival ? "route-rival" : "route"), hiCol = MC(o.rival ? "trail-rival" : "trail"), ink = MC("ink");
    let g = "";
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x = c + B[0], y = r + B[2], k = x + "," + y;
      const oni = KF.isHaz(pt, x, y), cure = pt.t[0] === x && pt.t[1] === y, sak = pt.bonus && pt.bonus[0] === x && pt.bonus[1] === y;
      const bg = oni ? MC("oni") : cure ? MC("cure") : sak ? MC("sakura") : onTrail.has(k) ? hiCol : (r + c) % 2 ? MC("cell-alt") : MC("cell");
      g += `<rect x="${c}" y="${r}" width="1" height="1" fill="${bg}" stroke="${MC("grid")}" stroke-width=".025"/>`;
      if (oni && o.icons) g += artIn("oni", c + 0.12, r + 0.12, 0.76, 0.76);
      if (sak) g += artIn("sakura", c + 0.14, r + 0.14, 0.72, 0.72);
      const si = pt.sym ? pt.sym.findIndex((q) => q[0] === x && q[1] === y) : -1;
      if (si >= 0 && (ASSET.symptom || SPR.symptom)) { const hit = onTrail.has(k); g += `<g class="symp${hit ? " hit" : ""}"${hit ? "" : ' opacity=".72"'}>${hit ? `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".46" fill="${MC("route")}"/>` : ""}${artIn("symptom", c + 0.12, r + 0.12, 0.76, 0.76)}</g>`; }
      else if (si >= 0) { const hit = onTrail.has(k); g += `<g class="symp"><circle cx="${c + 0.5}" cy="${r + 0.5}" r=".3" fill="${hit ? MC("route") : "none"}" stroke="${MC("route")}" stroke-width=".07" stroke-dasharray="${hit ? "none" : ".12 .07"}"/><circle cx="${c + 0.5}" cy="${r + 0.5}" r=".08" fill="${hit ? MC("marker-ring") : MC("route")}"/></g>`; }
      if (cure && (ASSET.cure || SPR.cure)) g += artIn("cure", c + 0.1, r + 0.08, 0.8, 0.8);
      else if (cure && ASSET["icon.cure"]) g += `<g style="color:${ink}">${artIn("icon.cure", c + 0.17, r + 0.17, 0.66, 0.66)}</g>`;
      else if (cure) g += `<text x="${c + 0.5}" y="${r + 0.53}" text-anchor="middle" dominant-baseline="central" style="font-family:var(--serif)" font-weight="800" font-size=".56" fill="${ink}">${esc(gl("cure"))}</text>`;
    }
    g += `<circle cx="${CX}" cy="${CY}" r=".22" fill="none" stroke="${ink}" stroke-width=".07"/>`;
    g += `<rect x="0" y="0" width="${N}" height="${N}" fill="none" stroke="${ink}" stroke-width="${o.px && o.px < 90 ? 0.12 : 0.06}"/>`;
    if (o.trail && o.trail.length > 1) g += `<polyline points="${o.trail.map(ctr).join(" ")}" fill="none" stroke="${routeCol}" stroke-width=".13" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (o.prev && o.prev.trail && o.prev.trail.length > 1) {
      const pc = o.prev.fail ? ink : MC("route");
      g += `<polyline points="${o.prev.trail.map(ctr).join(" ")}" fill="none" stroke="${pc}" stroke-width=".09" stroke-dasharray=".14 .12" stroke-linecap="round"/>`;
      const e = o.prev.trail[o.prev.trail.length - 1];
      if (o.prev.fail) g += `<path d="M${e[0] + CX - 0.25} ${e[1] + CY - 0.25}l.5 .5m0 -.5l-.5 .5" stroke="${MC("route")}" stroke-width=".11" stroke-linecap="round"/>`;
      else g += `<circle cx="${e[0] + CX}" cy="${e[1] + CY}" r=".4" fill="none" stroke="${MC("route")}" stroke-width=".06" stroke-dasharray=".12 .08"/>`;
    }
    if (o.pos) g += `<g class="mkr" transform="translate(${ctr(o.pos).replace(",", " ")})"><circle r=".27" fill="${MC(o.rival ? "marker-rival" : "marker")}" stroke="${MC("marker-ring")}" stroke-width=".07"/><circle r=".09" fill="${MC("marker-ring")}"/></g>`;
    const size = o.px ? `width="${o.px}" height="${o.px}"` : "";
    return `<svg class="map" ${size} viewBox="-.05 -.05 ${N + 0.1} ${N + 0.1}" ${o.label ? `role="img" aria-label="${attr(o.label)}"` : 'aria-hidden="true"'}>${g}</svg>`;
  }

  // ---------- card builders ----------
  function fresh(key) { if (U.seen.has(key)) return ""; U.seen.add(key); return " enter"; }
  // an ingredient's own artwork: ing.<element(s)>.<distance> (ing.F.2, ing.AF.1), ing.V for the kitsune
  const ingKey = (c) => (c.el === "V" ? "ing.V" : "ing." + c.el + (c.el2 || "") + "." + (c.n + 1));
  // a card is one picture with a label in its lower middle: the ingredient's name, and how far and which way
  function ingCard(c, o = {}) {
    const steps = o.steps || c.steps;
    const u = o.u || 1;
    const stepTxt = KF.isAny(c) ? t("card.anyStep") : c.ward ? moveName(c.mv) : t("card.steps", { n: Math.round(KF.reach({ steps })) });
    const els = dirEls(c, steps);
    const elsTxt = els.map(elName).join(" + ");
    const tag = o.tag ? `<span class="tag">${esc(o.tag)}</span>` : "";
    const tagName = o.static ? "div" : "button";
    const themed = T.cards && T.cards.ingredient && (T.cards.ingredient.image || T.cards.ingredient[c.el]);
    const bg = c.el2 ? `linear-gradient(135deg,${EL(c.el).color} 50%,${EL(c.el2).color} 50%)` : EL(c.el).color;
    // the picture: the ingredient's own art; else the ward patient's portrait; else the theme's card face or the element's art
    let pic;
    if (c.ward) { const pk = "patient." + (c.art != null ? c.art : c.who); pic = ASSET[pk] || SPR[pk] ? art(pk, "", { slice: true }) : `<span class="fig">${ptPortrait({ who: c.who, art: c.art, el: c.el })}</span>`; }
    else if (ASSET[ingKey(c)] || SPR[ingKey(c)]) pic = art(ingKey(c), "", { slice: true });
    else pic = themed ? "" : `<span class="ela">${art(EL(c.el).art, "", { slice: true })}</span>`;
    const own = !!(ASSET[ingKey(c)] || SPR[ingKey(c)]) && !c.ward;
    // the label: "2 火" (two towards fire), "2 火土" for a diagonal; the kitsune and the leap show their ways
    const way = !c.ward && c.el !== "V" && steps
      ? `<span class="lv${els.length > 1 ? " two" : ""}"><b>${Math.round(KF.reach({ steps }))}</b>${els.map((e) => `<i style="color:${EL(e).ink}">${elIc(e)}</i>`).join("")}</span>`
      : `<span class="lv pic">${pathSVG(c, steps, Math.round(13 * u))}</span>`;
    return `<${tagName} class="ic paper el-${c.el}${c.el2 ? " el2-" + c.el2 : ""}${c.ward ? " wd" : ""}${own ? " own" : ""}${o.cls ? " " + o.cls : ""}${o.noAnim ? "" : fresh("c" + c.id + (o.zone || ""))}" style="--u:${u.toFixed(3)}" ${o.act ? `data-a="${o.act}"` : ""} ${o.i != null ? `data-i="${o.i}"` : ""} aria-label="${attr(`${elsTxt}: ${cardName(c)}, ${stepTxt}${o.tag ? ", " + o.tag : ""}`)}" ${o.disabled ? "disabled" : ""} ${o.pressed != null ? `aria-pressed="${o.pressed}"` : ""}>
      <div class="face"${own || (themed && !c.ward) ? "" : ` style="background:${bg}"`}>${pic}</div>
      <div class="lab">${way}<span class="nm">${esc(cardName(c))}</span></div>${tag}</${tagName}>`;
  }
  // a claimed patient: the claimer's oni tucked under the card
  const claimKey = (pt) => (pt.claim ? (pt.claim.p === 0 ? "patient.claimedByYou" : "patient.claimedByRival") : null);
  const claimTuck = (pt) => (pt.claim ? `<span class="tuck${pt.claim.p === 0 ? " mine" : ""}" title="${attr(t(claimKey(pt)))}">${oniArt(pt.claim.p)}</span>` : "");
  const ptLabel = (pt) => t("patient.label", { name: whoOf(pt), ailment: ailOf(pt), value: pt.val }) + (pt.claim ? ", " + t(claimKey(pt)) : "");
  // ---------- bench, quirks, gifts, royals: what a patient asks and gives ----------
  const payNow = (pt) => pt.val + KF.spotBonus(pt);
  const benchIdx = (pt) => (pt.royal ? -1 : G().village.indexOf(pt));
  function giftIcon(g) { return g === "mon" ? monIc() : g === "plant" ? ICON.plant(14) : g === "oni" ? oniArt(0) : g === "tool" ? ICON.tools(14) : g === "draw" ? '<span class="cbk sm"></span>' : ""; }
  // each pill is a button: tap it for a reminder of what it means
  const pill = (cls, k, tip, body) => `<button class="trait ${cls}" data-a="trait" data-i="${k}" title="${attr(tip)}" aria-label="${attr(tip)}">${body}</button>`;
  const giftN = (g) => (g === "mon" ? RU().gifts.mon : RU().gifts.draw);
  const quirkArt = (q) => (ASSET["quirk." + q] || SPR["quirk." + q] ? `<span class="qi">${art("quirk." + q)}</span>` : "");
  function traits(pt) {
    const out = [], r = RU(), q = KF.quirk(pt), k = benchIdx(pt);
    if (pt.royal) { const ro = me().royal; out.push(pill("ry", "royal", t("rules.royal.h"), (ASSET.royal || SPR.royal ? `<span class="qi">${art("royal")}</span>` : "") + t("royal.tag", { n: ro.stage + 1, of: ro.stages.length }))); }
    else if (r.bench.enabled && k >= 0 && r.bench.spots[k]) { const sp = r.bench.spots[k]; out.push(pill("bn" + (k === 0 ? " last" : ""), "bench", t("bench.tip", { n: sp.min, b: sp.bonus }), `${t("bench.spot" + Math.min(k, 3))}${sp.bonus ? ` +${sp.bonus}` : ""} · ${t("bench.needs", { n: KF.needCards(pt) })}`)); }
    if (q) out.push(pill("q", "q." + q, t("quirks." + q + ".text", { n: r.quirks.contagious }), quirkArt(q) + t("quirks." + q + ".name")));
    if (r.gifts.enabled && pt.gift) out.push(pill("g", "g." + pt.gift, t("gifts." + pt.gift + ".text", { n: giftN(pt.gift) }), giftIcon(pt.gift) + t("gifts." + pt.gift + ".short", { n: giftN(pt.gift) })));
    if (pt.sym && pt.sym.length) out.push(pill("sy", "sym", t("symptoms.tip"), (ASSET.symptom || SPR.symptom ? `<span class="qi">${art("symptom")}</span>` : "") + t("symptoms.count", { n: pt.sym.length })));
    return out.length ? `<div class="traits">${out.join("")}</div>` : "";
  }
  // the foot of a small village chip: with the bench on, what a cure takes and pays extra; otherwise the ailment
  function chipFoot(pt) {
    if (pt.royal) return `<span class="ail ry">${t("royal.short", { n: me().royal.stage + 1, of: me().royal.stages.length })}</span>`;
    const n = KF.needCards(pt), b = KF.spotBonus(pt);
    if (!n) return `<span class="ail">${esc(ailOf(pt))}</span>`;
    return `<span class="ail ft${benchIdx(pt) === 0 ? " last" : ""}" title="${attr(t("bench.needs", { n }))}"><span class="nd">${n}</span>${b ? `<b>+${b}</b>` : ""}${KF.quirk(pt) ? `<i class="qd" title="${attr(t("quirks." + KF.quirk(pt) + ".name"))}"></i>` : ""}${pt.sym && pt.sym.length ? `<i class="sd"></i>` : ""}</span>`;
  }
  // a patient's looks: greyed while the rival's claim holds, worn when frail, jittery when nervous
  const ptCls = (pt) => (!pt.royal && KF.barred(0, pt) ? " barred" : "") + (KF.quirk(pt) === "frail" || KF.quirk(pt) === "nervous" ? " q-" + KF.quirk(pt) : "");
  function patCard(pt, k, o = {}) {
    const tuck = claimTuck(pt);
    const show = o.preview || pt;
    const aria = attr(ptLabel(pt));
    if (ptCls(pt)) o = Object.assign({}, o, { cls: (o.cls || "") + ptCls(pt) });
    if (o.chip) return `<button class="pc vc paper${o.cls ? " " + o.cls : ""}${fresh("p" + pt.id + (o.zone || ""))}" data-a="sel" data-i="${k}" aria-label="${aria}">
      <div class="ph">${ptAvatar(pt)}${monVal(pt.royal ? me().royal.pay : payNow(pt))}</div>${chipFoot(pt)}${tuck}${hintBadges(pt)}</button>`;
    return `<button class="pc paper${o.cls ? " " + o.cls : ""}${fresh("p" + pt.id + (o.zone || ""))}" data-a="${o.act || "sel"}" data-i="${k}" aria-label="${aria}" ${o.pressed != null ? `aria-pressed="${o.pressed}"` : ""}>
      <div class="ph">${monVal(pt.val)}<span class="nm">${esc(whoOf(pt, !o.full))}</span>${o.full ? ptChip(pt) : ptChip(pt, false, true)}</div>
      ${mapSVG(show, { px: o.px || 63, icons: !!o.icons })}
      ${o.ail ? `<span class="ail">${esc(ailOf(pt))}</span>` : ""}${tuck}${hintBadges(show)}${o.extra || ""}</button>`;
  }
  // a patient's element and the move it gives once cured
  function ptChip(pt, big, mini) {
    if (!pt.el) return "";
    if (mini) return `<span class="pel mini" style="background:${EL(pt.el).color};color:${onEl(pt.el)}" title="${attr(t("patient.moveAria", { el: elName(pt.el), move: moveName(pt.mv) }))}">${elIc(pt.el)}</span>`;
    const c = KF.wardCard({ id: pt.id, el: pt.el, mv: pt.mv || "step", who: pt.who });
    return `<span class="pel${big ? " big" : ""}" style="background:${EL(pt.el).color};color:${onEl(pt.el)}" title="${attr(t("patient.moveAria", { el: elName(pt.el), move: moveName(c.mv) }))}">${elIc(pt.el)}${pathSVG(c, c.steps, big ? 18 : 13)}</span>`;
  }
  // a patient's portrait: art named patient.<n> (n = their place in content.patients), else a figure on their element's colour
  function ptPortrait(pt, cls = "") {
    const a = "patient." + (pt.art != null ? pt.art : pt.who), bg = pt.el ? EL(pt.el).color : "var(--brown)";
    return `<span class="ppor${cls ? " " + cls : ""}" style="background:${bg}" aria-hidden="true">${ASSET[a] || SPR[a] ? art(a, "", { slice: true }) : '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4.2"/><path d="M4 23c0-5 3.6-8.2 8-8.2s8 3.2 8 8.2z"/></svg>'}</span>`;
  }
  // the portrait with the patient's element as a badge on its corner, like an oni tucked on a card
  function ptAvatar(pt, cls = "") {
    if (!pt.el) return ptPortrait(pt, cls);
    const need = KF.needEl(pt), tip = attr(need ? t("patient.needsAria", { el: elName(pt.el) }) : t("patient.becomes", { move: moveName(pt.mv) }));
    return `<span class="pav${cls ? " " + cls : ""}">${ptPortrait(pt, cls)}<span class="pelc${need ? " need" : ""}" role="img" style="background:${EL(pt.el).color};color:${onEl(pt.el)}" aria-label="${tip}" title="${tip}">${elIc(pt.el)}</span></span>`;
  }
  // a numbered chip for a played card; its colour is split between the elements its path used
  function chipFor(c, steps, n, o = {}) {
    const els = dirEls(c, steps), cols = els.map((e) => EL(e).color);
    const bg = cols.length === 1 ? cols[0] : `linear-gradient(135deg,${cols.map((col, i) => `${col} ${(i * 100) / cols.length}% ${((i + 1) * 100) / cols.length}%`).join(",")})`;
    const tl = o.f ? `<span class="tl">${KF.toolsOfBits(o.f).map(toolIc).join("")}</span>` : "";
    const pend = (o.cls || "").includes("pend");
    const inner = `${els.map((e) => (pend ? elIc(e) : `<i class="eo" style="color:${onEl(e)}">${elIc(e)}</i>`)).join("")}<span class="n">${n}</span>${tl}${o.x ? '<span class="xx">×</span>' : ""}`;
    return o.btn ? `<button class="sq${els.length > 1 ? " w2" : ""}${o.cls ? " " + o.cls : ""}" data-a="${o.btn}" data-i="${n - 1}" aria-label="${attr(o.aria || "")}" style="background:${bg}">${inner}</button>`
      : `<span class="sq${els.length > 1 ? " w2" : ""}${o.cls ? " " + o.cls : ""}" style="background:${bg}">${inner}</span>`;
  }

  // ---------- layout fitting ----------
  const BASE = { port: [390, 740, 1.6], land: [800, 370, 1.7], tabl: [1120, 760, 1.6] };
  // the game is at most MAX_W wide; on a wider screen it sits in the middle of an empty table
  // (a very tall screen gets a little more, so it keeps the tablet layout rather than the phone's)
  const MAX_W = 1200;
  function fit() {
    const app = $("#app"), cs = getComputedStyle(app);
    const full = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const vh = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const vw = Math.min(full, Math.max(MAX_W, Math.ceil(vh * 0.9))), side = Math.floor((full - vw) / 2);
    app.classList.toggle("wide", side > 0); app.style.setProperty("--side", side + "px");
    const layout = vw / vh < 0.85 ? "port" : vh < 600 ? "land" : "tabl";
    const [bw, bh, mx] = BASE[layout];
    const scale = Math.min(vw / bw, vh / bh, mx);
    const sw = Math.round(vw / scale), sh = Math.round(vh / scale);
    const st = $("#stage");
    st.style.width = sw + "px"; st.style.height = sh + "px";
    st.style.left = parseFloat(cs.paddingLeft) + side + "px"; st.style.top = cs.paddingTop;
    st.style.transform = `scale(${scale})`;
    const changed = layout !== U.layout || sw !== U.sw || sh !== U.sh;
    Object.assign(U, { layout, sw, sh, scale });
    if (changed && G()) { render(); renderSheet(); }
  }

  // ---------- top bars ----------
  // a player's name on the dark header in their guild's element colour, lifted a little so dark colours stay readable
  function nameColor(pi) { const g = guildOf(pi); if (!g || !g.element) return null; const e = EL(g.element); return e.on ? e.color : mix(e.color, "#FFFFFF", 0.3); }
  function fameBars() {
    const g = G(), E = RU().endFame;
    const row = (p, cls, label, pi) => `<div class="row${g.cur === pi && !g.over ? " cur" : ""}"><span class="who ${cls}"${nameColor(pi) ? ` style="color:${nameColor(pi)}"` : ""}>${crest(pi)}${esc(label)}</span><div class="bar ${cls}" style="grid-template-columns:repeat(${E},minmax(0,1fr))">${Array.from({ length: E }, (_, i) => `<i class="${i < p.fame ? "on" : ""}${(i + 1) % 5 === 0 ? " five" : ""}"></i>`).join("")}</div><span class="num" data-fame="${pi}">${p.fame}</span></div>`;
    return `<button class="fame" data-a="rival" aria-label="${attr(t("top.fameAria", { you: me().fame, rival: bot().fame }))}">${row(me(), "y", t("who.you"), 0)}${row(bot(), "r", rivalLabel(), 1)}</button>`;
  }
  const goal = () => `<div class="goal mong" role="img" aria-label="${attr(t("top.goal", { n: RU().endFame }))}">${monIc()}<span>${RU().endFame}</span></div>`;
  const menuBtn = () => `<button class="iconbtn" data-a="menu" aria-label="${attr(t("menu.title"))}">${ICON.menu()}</button>`;
  function turnLabel() { const g = G(); if (g.over) return t("status.gameOver"); return t(g.cur === 0 ? "top.roundYou" : "top.roundRival", { n: g.round }); }

  // ---------- board panel ----------
  function boardPanel() {
    const g = G(), rivalTurn = g.cur === 1 && !g.over;
    const pt = U.bo ? U.bo.pt : curPt();
    if (!pt) return `<section class="boardp paper"><div class="frame"></div><div class="motif">${art("boardMotif")}</div><div class="bwrap"><span class="nobody">${t("board.nobody")}</span></div></section>`;
    let svg, rs = null;
    if (U.bo) svg = mapSVG(pt, { icons: true, trail: U.bo.trail, pos: U.bo.pos, rival: U.bo.rival, label: t("board.mapOf", { name: whoOf(pt) }) });
    else {
      rs = routeState();
      const showPos = !rivalTurn && (U.route.length > 0 || U.pend);
      svg = mapSVG(pt, { icons: true, trail: rivalTurn ? null : rs.rp.trail, pos: showPos ? rs.rp.pos : null, prev: rivalTurn ? null : rs.prev, label: t("board.mapAria", { name: whoOf(pt), cure: gl("cure") }) });
    }
    const port = true; // every layout uses the compact head now: icons by the mon, the name and pills beside the portrait
    const ck = claimKey(pt), cursedChip = !ck ? "" : port ? `<span class="chip cur${pt.claim.p === 0 ? " mine" : ""} icon" role="img" aria-label="${attr(t(ck))}" title="${attr(t(ck))}">${oniArt(pt.claim.p)}</span>` : `<span class="chip cur${pt.claim.p === 0 ? " mine" : ""}">${oniArt(pt.claim.p)}${t(ck)}</span>`;
    const sakChip = pt.bonus && port ? `<span class="sakic" role="img" aria-label="${attr(t("status.sakura"))}">${art("sakura")}</span>` : pt.bonus ? `<span class="chip sak">${art("sakura")}+${KF.limit(G().cur, "sakuraBonus")}</span>` : "";
    const elChip = pt.el ? `<span class="chip elc" title="${attr(KF.needEl(pt) ? t("patient.needsAria", { el: elName(pt.el) }) : t("patient.becomes", { move: moveName(pt.mv) }))}" style="--ec:${EL(pt.el).color}">${ptChip(pt, true)}${KF.needEl(pt) ? `<span>${t("patient.needs", { el: elName(pt.el) })}</span>` : ""}</span>` : "";
    const rvChip = rivalTurn ? `<span class="chip rvc">${gl("rival") || ASSET["icon.rival"] ? ic("rival") + " " : ""}${t("board.rivalTurn")}</span>` : "";
    const n = g.village.length, dots = n > 1 && !rivalTurn && !U.bo ? `<div class="dots" aria-hidden="true">${g.village.map((_, i) => `<i class="${i === U.sel ? "on" : ""}"></i>`).join("")}</div>` : "";
    const off = !rivalTurn && !U.bo && KF.barred(0, pt), done = !rivalTurn && !U.bo && !U.anim && myTurn() && G().turn.acted;
    return `<section class="boardp paper${rivalTurn ? " rv" : ""}${off ? " barred" : ""}${KF.quirk(pt) === "frail" || KF.quirk(pt) === "nervous" ? " q-" + KF.quirk(pt) : ""}"><div class="frame"></div><div class="motif">${art("boardMotif")}</div>
      ${port ? phoneHead(pt, rivalTurn, rvChip, cursedChip + sakChip) : `<div class="bhead"><span class="badge ring">${pt.royal ? me().royal.pay : payNow(pt)}</span><div class="t"><b>${esc(whoOf(pt))}</b><small>${esc(ailOf(pt))}</small>${traits(pt)}</div>${rvChip}${rivalTurn ? "" : hintBadges(pt, "inhead") + elChip + cursedChip + sakChip}</div>`}
      ${done && !off ? `<div class="donerib" role="status">${ICON.check(14)}<b>${t("status.actionDone")}</b><span>${U.route.length || U.pend ? t("status.planningOnly") : doneLine()}</span></div>` : ""}<div class="bwrap" ${n > 1 ? `aria-roledescription="${attr(t("board.swipe"))}"` : ""}><div class="board${U.shake ? " shake" : ""}${U.enter ? (U.enter > 0 ? " from-r" : " from-l") : ""}"><div class="bsvg">${svg}</div>
        ${["up", "right", "down", "left"].map((d, i) => { const e = KF.elOfDir(d); return e ? `<span class="cmp ${"nesw"[i]}" aria-hidden="true" style="color:${EL(e).ink};--ec:${EL(e).color};--eo:${onEl(e)}">${elIc(e)}</span>` : ""; }).join("")}
        ${rivalTurn && U.rv && U.rv.pop ? `<div class="rvpop paper">${U.rv.pop}</div>` : ""}${off ? `<div class="barstamp"><span class="bo">${oniArt(1)}</span><b>${t("status.claimedByRival")}</b><small>${t("status.claimedByRivalSub")}</small></div>` : ""}</div>${dots}</div>
      ${rivalTurn ? rivalStrip() : strip(rs)}</section>`;
  }
  // the phone's board head: name and ailment on the left; the element, sakura and curable marks as small icons by the mon
  function phoneHead(pt, rivalTurn, rvChip, chips) {
    const icons = rivalTurn ? rvChip : hintBadges(pt, "inhead") + chips;
    return `<div class="bhead"><button class="pvbtn" data-a="pview" aria-label="${attr(t("patient.viewPortrait", { name: whoOf(pt) }))}">${ptAvatar(pt, "big")}</button><div class="t"><b>${esc(whoOf(pt))}</b><small>${esc(ailOf(pt))}</small>${traits(pt)}</div><div class="bside">${icons ? `<div class="bic">${icons}</div>` : ""}${monVal(pt.royal ? me().royal.pay : payNow(pt), "big")}</div></div>`;
  }
  function rivalStrip() {
    const r = U.rv || { say: t("rival.thinking"), sub: "" };
    const chips = (r.chips || []).join("");
    return `<div class="strip rvs"><div class="srow">${portrait(1, "rvsf")}${chips ? `<div class="seqs">${chips}</div>` : ""}<span class="stxt" aria-live="polite">${r.say}${r.think ? '<span class="think"><i></i><i></i><i></i></span>' : ""}${r.sub ? `<small>${r.sub}</small>` : ""}</span>${U.busy ? `<button class="cbtn ghost" data-a="fast" aria-label="${attr(t("rival.speedUp"))}">${U.speed < 1 ? t("rival.fast") : t("rival.skip")}</button>` : ""}</div></div>`;
  }
  function strip(rs) {
    const chips = U.route.map((r, j) => chipFor(cardAt(r.g, r.i), r.opt, j + 1, { f: r.f, btn: canPlan() ? "chip" : null, aria: t("brew.backTo", { n: j + 1 }) }));
    if (U.pend) { const c = cardAt(U.pend.g, U.pend.i); if (c) chips.push(chipFor(c, pendSteps() || c.steps, U.route.length + 1, { btn: "pcancel", cls: "pend", x: true, aria: t("brew.cancelPreview") })); }
    const s = statusText(rs);
    const kw = rs && canAct() && !U.route.length && !U.pend ? KF.knownFor(0, U.sel) : -1;
    const known = kw >= 0 ? `<button class="cbtn known" data-a="known">${ic("cured")}<span><b>${t("act.known")}</b><small>${t("act.knownSub", { n: KF.knownPay(rs.pt), name: esc(whoOf({ who: me().ward[kw].who }, true)) })}</small></span></button>` : "";
    const pt = curPt(), cl = myTurn() && !U.anim && !U.route.length && !U.pend && pt && KF.canClaim(0, U.sel) ? `<button class="cbtn claim" data-a="claim">${oniArt(0)}<span><b>${t("act.claim")}</b><small>${t("act.claimSub", { n: KF.claimBonus(0) })}</small></span></button>` : "";
    return `<div class="strip"><div class="srow">${known}${cl}${chips.length ? `<div class="seqs">${chips.join("")}</div>` : ""}<span class="stxt${s.bad ? " bad" : ""}" aria-live="polite">${s.t}${s.s ? `<small>${s.s}</small>` : ""}</span></div>${controls(rs)}</div>`;
  }
  function controls(rs) {
    if (!canPlan() || !rs || (G().turn.acted && !U.route.length && !U.pend)) return "";
    const left = [], right = [];
    const pc = U.pend && cardAt(U.pend.g, U.pend.i);
    if (pc && isPick(pc)) left.push(`<button class="sbtn turn" data-a="dturn" aria-label="${attr(t("brew.turnAny"))}">${ICON.turn()}</button>`);
    else left.push(toolToggles());
    if (U.pend) {
      const ok = rs.prev && !rs.prev.fail;
      if (U.layout === "land") right.push(`<button class="cbtn" data-a="pcancel">${ICON.x()}${t("brew.cancel")}</button>`);
      right.push(`<button class="cbtn go" data-a="pplay" ${ok ? "" : "disabled"}>${ICON.ok()}${t("brew.play")}</button>`);
    } else if (U.route.length) {
      right.push(`<button class="cbtn" data-a="clear" aria-label="${attr(t("brew.clearAria"))}">${ICON.clear()}${t("brew.clear")}</button>`);
      right.push(`<button class="cbtn" data-a="undo">${ICON.undo()}${t("brew.undo")}</button>`);
    }
    if (!left.join("") && !right.length) return "";
    return `<div class="ctrls"><div class="cl">${left.join("")}</div><div class="cr">${right.join("")}</div></div>`;
  }
  function toolToggles() {
    const p = me(), uf = usedFlags(), on = canPlan() && curPt(), r = RU(), out = [];
    r.turnTools.forEach((id) => {
      if (!p.tools[id]) return;
      const used = uf & KF.bit(id), idx = U.turnSel[id], sel = idx != null;
      const turn = sel ? KF.toolOpts(id)[idx] : null, mk = r.toolDefs[id].effect === "stretch" ? `<b>${turn > 0 ? "+" : "−"}${Math.abs(turn)}</b>` : ic("turn." + turn);
      out.push(`<button class="sbtn tool${sel ? " on" : ""}" data-a="ttool" data-i="${id}" ${!on || used ? "disabled" : ""} aria-pressed="${sel}" aria-label="${attr(`${toolName(id)}: ${toolText(id, true)}${used ? " " + t("brew.usedThisBrew") : ""}`)}">${toolPic(id)}${sel ? `<span class="mk">${mk}</span>` : ""}</button>`);
    });
    r.stepTools.forEach((id, idx) => {
      if (!p.tools[id]) return;
      const used = usedIn(true, -1 - idx), sel = U.pend && U.pend.i === -1 - idx;
      out.push(`<button class="sbtn tool${sel ? " on" : ""}" data-a="stool" data-i="${idx}" ${!on || used ? "disabled" : ""} aria-label="${attr(`${toolName(id)}: ${toolText(id, true)}${used ? " " + t("brew.usedThisBrew") : ""}`)}">${toolPic(id)}</button>`);
    });
    return out.join("");
  }
  // after the action: what's still free this turn, then the end of it
  function doneLine() {
    const g = G(), free = [!g.turn.planted ? t("status.freePlant") : null, !g.turn.claimed && me().oni > 0 ? t("status.freeClaim") : null, !g.turn.bought ? t("status.freeBuy") : null].filter(Boolean);
    return free.length ? t("status.thenFree", { list: free.join(", ") }) : t("status.thenEnd");
  }
  function statusText(rs) {
    const g = G(), cure = ic("cure");
    if (g.over) return { t: t("status.gameOver") };
    if (U.anim) return { t: "…" };
    if (U.msg) return { t: U.msg, bad: U.msgBad };
    const cp = curPt();
    if (!g.turn.acted && cp && KF.barred(0, cp)) return { t: "" }; // the stamp on the board says it
    if (g.turn.acted && !U.route.length && !U.pend) return { t: "" }; // the ribbon on the board says it
    if (U.mkt.length) { const n = nTake(), left = n - U.mkt.length; return left > 0 ? { t: t("status.pickMore", { n: left }) } : { t: t("status.takeThese", { n }), s: t("status.thenDone") }; }
    if (!rs) return { t: "" };
    if (U.pend) {
      const c = cardAt(U.pend.g, U.pend.i);
      if (isPick(c) && !U.pend.dir) return { t: t("status.pickDirection") };
      const p = rs.prev; if (!p) return { t: "" };
      if (p.fail === "oni") return { t: t("status.hitsOni", { oni: ic("oni") }), s: t("status.cancelOrTool"), bad: true };
      if (p.fail === "off") return { t: t("status.offMap"), s: t("status.cancelOrTool"), bad: true };
      if (p.d === 0) return { t: t("status.landsOnCure", { cure }), s: t("status.playToCure") + (p.bonus || rs.rp.bonus ? " · " + t("status.sakura") : "") };
      return { t: t("status.stepsFrom", { n: p.d, cure }), s: isPick(c) ? t("status.pickThenPlay") : t("status.playOrTap") };
    }
    if (!U.route.length) { const kw = KF.knownFor(0, U.sel); return { t: t("status.tapToPreview"), s: kw >= 0 ? t("status.knownHint", { n: KF.knownPay(rs.pt) }) : G().village.length > 1 ? t("status.spentStaySwipe") : t("status.spentStay") }; }
    const sak = rs.rp.bonus ? " · " + t("status.sakura") : "";
    if (rs.on && !rs.handUsed) return { t: t("status.needHand", { cure }), s: t("status.needHandWhy", { n: RU().minHandCards }), bad: true };
    if (rs.on && !rs.elOK) return { t: t("status.needEl", { el: elName(rs.need), glyph: elIc(rs.need) }), s: t("status.needElWhy"), bad: true };
    if (rs.on && rs.err === "needCards") return { t: t("status.needCards", { n: KF.needCards(rs.pt) }), s: t("status.needCardsWhy"), bad: true };
    if (rs.on && rs.err === "needSymptoms") return { t: t("status.needSymptoms", { n: rs.symN - rs.symGot }), s: t("status.needSymptomsWhy"), bad: true };
    if (rs.on && rs.err && t("status.quirk." + rs.err) !== "status.quirk." + rs.err) return { t: t("status.quirk." + rs.err), s: t("quirks." + rs.err + ".text"), bad: true };
    if (rs.on) return { t: t("status.onCure", { cure }), s: t("status.cardsPlayed", { n: U.route.length }) + sak };
    const symS = rs.symN ? " · " + t("status.symptoms", { got: rs.symGot, n: rs.symN }) : "";
    return { t: t("status.stepsFrom", { n: rs.d, cure }), s: t("status.cardsPlayed", { n: U.route.length }) + symS + sak + " · " + t("status.tapNumber") };
  }

  // ---------- trays ----------
  function rowU(n, avail, w, max) { if (!n) return max; return Math.max(0.55, Math.min(max, (avail - (n - 1) * 6) / (n * 66 * (w || 1)))); }
  // what the patient on the board won't take: garden cards when nervous, leaps and diagonals when frail
  function banOf(g, c) {
    const pt = curPt(), q = pt && c ? KF.quirk(pt) : null;
    if (q === "nervous" && g === true) return "nervous";
    if (q === "frail" && (c.knight || c.diag)) return "frail";
    return null;
  }
  const offPt = () => { const pt = curPt(); return !!(pt && myTurn() && KF.barred(0, pt)); };
  function handCards(u, zone) {
    const h = me().hand;
    if (!h.length) return `<span class="empty">${t("hand.empty")}</span>`;
    return h.map((c, i) => {
      const used = usedIn(false, i), pend = U.pend && !U.pend.g && U.pend.i === i;
      const steps = pend && !isPick(c) ? pendSteps() : null;
      const ban = !used && !pend && banOf(false, c), off = offPt();
      return ingCard(c, { u, act: "hand", i, zone, steps, cls: used ? "used" : pend ? "lift" : ban || off ? "banned" : "", tag: used ? t("card.tagUsed") : pend ? t("card.tagNext") : ban ? t("quirks." + ban + ".name") : null, disabled: used });
    }).join("");
  }
  function gardenCards(u, zone, withPlots) {
    const gd = me().garden;
    let s = gd.map((c, i) => {
      const again = usedIn(true, i) && canEcho(i), used = usedIn(true, i) && !again, pend = U.pend && U.pend.g === true && U.pend.i === i;
      const steps = pend && !isPick(c) ? pendSteps() : null;
      const ban = !used && !pend && banOf(true, c), off = offPt();
      return ingCard(c, { u, act: "garden", i, zone, steps, cls: (used ? "used" : pend ? "lift" : ban || off ? "banned" : again ? "again" : "") + (u < 0.75 ? " tiny" : ""), tag: used ? t("card.tagUsed") : pend ? t("card.tagNext") : ban ? t("quirks." + ban + ".name") : again ? t("card.tagAgain") : null, disabled: used });
    }).join("");
    if (withPlots) for (let k = gd.length; k < KF.limit(0, "gardenMax"); k++) s += withPlots(k);
    return s || `<span class="empty">${t("garden.empty")}</span>`;
  }
  function wardCards(u, zone) {
    const wd = me().ward || [];
    if (!wd.length) return `<span class="empty">${t("ward.empty")}</span>`;
    return wd.map((w, i) => {
      const c = KF.wardCard(w), spent = !KF.wardLeft(w) || w.spent, used = usedIn("w", i), pend = U.pend && U.pend.g === "w" && U.pend.i === i;
      const steps = pend && !isPick(c) ? pendSteps() : null;
      const ban = !spent && !used && !pend && banOf("w", c), off = offPt();
      return ingCard(c, { u, act: "ward", i, zone, steps, cls: (spent ? "spent" : used ? "used" : pend ? "lift" : ban || off ? "banned" : "") + (u < 0.75 ? " tiny" : ""), tag: spent ? t("card.tagSpent") : used ? t("card.tagUsed") : pend ? t("card.tagNext") : ban ? t("quirks." + ban + ".name") : moveName(c.mv), disabled: spent || used });
    }).reverse().join("");
  }
  const wardReady = (p = me()) => (p.ward || []).filter((w) => KF.wardLeft(w) && !w.spent).length;
  function marketCards(u, zone) {
    const canPick = canAct();
    return G().market.map((c, i) => {
      const p = U.mkt.includes(i), tk = U.taking && U.taking.includes(c.id);
      return ingCard(c, { u, act: "mkt", i, zone, cls: (p ? "pick" : "") + (tk ? " rvpick" : ""), tag: p ? t("card.tagTake") : tk ? t("card.tagRival") : null, pressed: canPick ? p : null });
    }).join("");
  }

  // the trader's swap: a hand card for a market card, once a turn, on top of the action
  const canTrade = () => KF.limit(0, "swap") > 0;
  const tradeLabel = () => { const left = KF.limit(0, "swap") - (G().turn.swaps || 0); return !KF.canSwap(0) ? t("trade.done") : left > 1 && G().cur === 0 ? t("trade.left", { n: left }) : t("trade.btn"); };
  const tradeBtn = (u) => (canTrade() ? `<button class="ic plotc trd" style="--u:${u}" data-a="trade" ${KF.canSwap(0) && !U.anim ? "" : "disabled"} aria-label="${attr(t("trade.aria"))}"><b class="sw">⇄</b>${tradeLabel()}</button>` : "");

  // ---------- actions bar (phone) ----------
  // the phone's reminder of what you carry: oni left to lay and the tools you own; tap for your table
  function kitBtn() {
    const tl = RU().toolIds.filter((id) => me().tools[id]);
    return `<button class="kit" data-a="mytable" aria-label="${attr(t("kit.aria", { n: me().oni, tools: tl.map(toolName).join(", ") || t("stash.noneYet") }))}"><span class="ko${me().oni ? "" : " none"}">${oniArt(0)}<b>×${me().oni}</b></span>${tl.length ? `<span class="kt">${tl.slice(0, 3).map((id) => `<i>${toolPic(id)}</i>`).join("")}${tl.length > 3 ? `<b>+${tl.length - 3}</b>` : ""}</span>` : ""}</button>`;
  }
  function phoneActs() {
    const g = G(), mine = myTurn(), rs = routeState();
    const ab = (a, icon, label, o = {}) => `<button class="ab${o.cls ? " " + o.cls : ""}" data-a="${a}" ${o.dis ? "disabled" : ""}>${icon}${label}</button>`;
    const plantDis = !mine || g.turn.planted || !me().hand.length;
    const k = (g2) => (gl(g2) || ASSET["icon." + g2] ? `<span class="k">${ic(g2)}</span>` : "");
    // on the phone and tablet the market tab can swap its cards for the tools
    const tl = U.layout !== "land" && U.tab === "market" ? ab("mtools", U.mview === "tools" ? ICON.back() : ICON.tools(), U.mview === "tools" ? t("act.back") : t("act.tools")) : "";
    if (mine && !g.turn.acted && U.tab === "market") {
      const n = nTake();
      return `<div class="acts" style="grid-template-columns:${tl ? "0.8fr " : ""}1fr 1.2fr">${tl}${ab("blind", ICON.blind(), t("act.drawBlind", { n }), { cls: "row" })}${ab("take", "", `${k("market")}${t("act.takeN", { n, have: U.mkt.length })}`, { cls: "primary", dis: U.mkt.length !== n })}</div>`;
    }
    if (U.layout !== "land") {
      const kit = U.layout === "port" && !tl ? kitBtn() : "";
      if (mine && g.turn.acted) return `<div class="acts${tl ? "" : " one"}${kit ? " withkit" : ""}"${tl ? ' style="grid-template-columns:0.8fr 2.2fr"' : ""}>${tl}${kit}${ab("end", "", `${k("endTurn")}${t("act.endTurn")}`, { cls: "primary glow" + (tl ? " row" : "") })}</div>`;
      const go = rs && rs.ready && mine;
      return `<div class="acts one${kit ? " withkit" : ""}">${kit}${ab("brew", "", `${k("cure")}${t("act.brew")}`, { cls: "primary" + (go ? " glow" : ""), dis: !go })}</div>`;
    }
    if (mine && g.turn.acted) {
      return `<div class="acts">${ab("plant", ICON.plant(), t("act.plant"), { dis: plantDis })}${ab("tools", ICON.tools(), t("act.tools"))}${ab("log", ICON.log(), t("act.log"))}${ab("end", "", `${k("endTurn")}${t("act.endTurn")}`, { cls: "primary glow" })}</div>`;
    }
    const ready = rs && rs.ready && mine;
    return `<div class="acts">${ab("gather", ICON.gather(), t("act.gather"), { dis: !mine })}${ab("plant", ICON.plant(), t("act.plant"), { dis: plantDis })}${ab("tools", ICON.tools(), t("act.tools"), { dis: g.cur !== 0 || U.busy })}${ab("brew", "", `${k("cure")}${t("act.brew")}`, { cls: "primary" + (ready ? " glow" : ""), dis: !ready })}</div>`;
  }

  function toolCards() {
    const g = G(), b = bot();
    return RU().toolIds.map((id) => {
      const mine = me().tools[id], riv = b.tools[id], can = myTurn() && !g.turn.bought && KF.canBuy(0, id);
      const st = mine ? t("tools.yours") : riv ? t("tools.rivalOwns") : RU().toolShop === false ? t("tools.closed") : can ? t("tools.tapToBuy") : g.turn.bought ? t("tools.onePerTurn") : t("tools.need", { n: KF.cost(id) });
      return `<button class="tbig ${mine ? "mine" : riv ? "rival" : "buy"}" data-a="buy" data-i="${id}" ${can ? "" : "disabled"} aria-label="${attr(`${toolName(id)}: ${toolText(id, true)}. ${st}`)}"><span class="ti">${toolPic(id)}</span><span class="tb"><span class="th"><b>${esc(toolName(id))}</b>${mine ? "" : monVal(KF.cost(id))}</span><small>${toolText(id, true)}</small><span class="st">${mine ? ICON.check(11) + " " : ""}${st}</span></span></button>`;
    }).join("");
  }

  // ---------- screens ----------
  const tabBtn = (k, label) => `<button data-a="tab" data-i="${k}" aria-pressed="${U.tab === k}">${label}</button>`;
  function portScreen() {
    const g = G(), tb = U.tab, avail = U.sw - 28;
    let tray;
    if (tb === "hand") tray = `<div class="crow${me().hand.length >= 5 ? " spread" : ""}">${handCards(rowU(me().hand.length, avail, 1, 1), "h")}</div>`;
    else if (tb === "ward") tray = `<div class="crow${me().ward.length >= 5 ? " spread" : ""}">${wardCards(rowU(Math.max(1, me().ward.length), avail, 1, 1), "w")}</div>`;
    else if (tb === "garden") tray = `<div class="crow">${gardenCards(1, "g", () => `<button class="ic plotc" style="--u:1" data-a="plant" ${!myTurn() || g.turn.planted ? "disabled" : ""} aria-label="${attr(t("garden.plantAria"))}">${ICON.plant(22)}${t("garden.plant")}</button>`)}</div>`;
    else if (U.mview === "tools") tray = `<div class="tgrid2">${toolCards()}</div>`;
    else { const u = rowU(g.market.length + (canTrade() ? 1 : 0), avail, 1, 1); tray = `<div class="crow spread">${tradeBtn(u)}${marketCards(u, "m")}</div>`; }
    return `<div class="scr port lacquer">
      <header class="top">${menuBtn()}${fameBars()}${goal()}</header>
      <section class="vill" aria-label="${attr(t("label.village"))}">
        <div class="vrow">${g.village.map((pt, k) => patCard(pt, k, { cls: k === U.sel ? "sel" : "", chip: true })).join("") || `<span class="empty">${t("label.villageEmpty")}</span>`}${KF.royalStage(0) ? patCard(KF.royalStage(0), ROYAL, { cls: "royal" + (U.sel === ROYAL ? " sel" : ""), chip: true }) : ""}</div></section>
      ${boardPanel()}
      <nav class="tabs" aria-label="${attr(t("label.yourCards"))}">${tabBtn("hand", t("tabs.hand", { n: me().hand.length, max: KF.limit(0, "handLimit") }))}${tabBtn("garden", t("tabs.garden", { n: me().garden.length, max: KF.limit(0, "gardenMax") }))}${RU().ward.enabled ? tabBtn("ward", t("tabs.ward", { n: wardReady() })) : ""}${tabBtn("market", t("tabs.market", { n: g.market.length }))}</nav>
      <div class="tray${tb === "market" ? " mk" : ""}">${tray}</div>
      ${phoneActs()}
    </div>`;
  }
  function landScreen() {
    const g = G(), b = bot();
    const rcolW = U.sw - 20 - 190 - 296 - 20;
    const mkt = U.tab === "market";
    const row = mkt ? marketCards(rowU(g.market.length, rcolW, 1, 0.91), "m") : handCards(rowU(me().hand.length, rcolW, 1, 0.91), "h");
    const plots = () => `<button class="plot" data-a="plant" ${!myTurn() || g.turn.planted ? "disabled" : ""} aria-label="${attr(t("garden.plantAria"))}">+</button>`;
    const owned = RU().toolIds.filter((k) => me().tools[k]).map(toolName).join(" · ");
    return `<div class="scr land lacquer">
      <header class="top">${menuBtn()}${gl("brand") || ASSET["icon.brand"] ? `<span class="brandk">${ic("brand")}</span>` : ""}${fameBars()}
        <button class="rivbtn" data-a="rival" aria-label="${attr(t("rival.showTable"))}"><b>${rivalLabel()}</b><span>${t("rival.handN", { n: b.hand.length })}</span><span>${t("rival.gardenN", { n: b.garden.length })}</span>${RU().toolIds.filter((k) => b.tools[k]).map((k) => art(toolArt(k))).join("")}<span class="oniN">${oniArt(1)}${b.oni}</span></button>
        ${goal()}</header>
      <div class="mid">
        <section class="vcol"><div class="lbl"><span>${withGl(t("label.village"), "village")}</span><span>${t("label.deck", { n: g.pats.length })}</span></div>
          <div class="vgrid">${g.village.map((pt, k) => patCard(pt, k, { cls: k === U.sel ? "sel" : "", px: Math.max(50, Math.min(70, Math.floor((U.sh - 160) / 2))) })).join("")}${KF.royalStage(0) ? patCard(KF.royalStage(0), ROYAL, { cls: "royal" + (U.sel === ROYAL ? " sel" : ""), px: Math.max(50, Math.min(70, Math.floor((U.sh - 160) / 2))) }) : ""}</div></section>
        ${boardPanel()}
        <section class="rcol">
          <div class="lbl"><span>${mkt ? t("label.marketDeck", { n: g.deck.length }) : t("label.handN", { n: me().hand.length, max: KF.limit(0, "handLimit") })}</span>${mkt && canTrade() ? `<button class="linkbtn" data-a="trade" ${KF.canSwap(0) && !U.anim ? "" : "disabled"}>⇄ ${tradeLabel()}</button>` : ""}<button class="linkbtn" data-a="tab" data-i="${mkt ? "hand" : "market"}">${mkt ? t("label.toHand") : t("label.toMarket")}</button></div>
          <div class="hrow"><div class="crow${(mkt ? g.market.length : me().hand.length) >= 5 ? " spread" : ""}">${row}</div></div>
          <div class="lbl">${gardTabs(RU().ward.enabled ? "" : esc(owned))}</div>
          <div class="grow${U.gview === "ward" ? " wardrow" : ""}">${U.gview === "ward" ? wardCards(0.667, "w") : gardenCards(0.667, "g", plots)}</div>
          ${phoneActs()}
        </section>
      </div></div>`;
  }
  // garden and ward share one spot: two tabs, the one showing lit, each with its count
  function gardTabs(alt) {
    const w = U.gview === "ward", ready = wardReady();
    if (!RU().ward.enabled) return `<span>${withGl(t("label.garden"), "garden")} ${me().garden.length}/${KF.limit(0, "gardenMax")}</span>${alt ? `<span class="n">${alt}</span>` : ""}`;
    const tab = (k, on, label, n, dot) => `<button class="gtab" role="tab" data-a="gview" data-i="${k}" aria-selected="${on}">${label}<b>${n}</b>${dot ? '<i class="dot"></i>' : ""}</button>`;
    return `<div class="gtabs" role="tablist">${tab("garden", !w, t("label.garden"), `${me().garden.length}/${KF.limit(0, "gardenMax")}`)}${tab("ward", w, t("label.ward"), ready, !w && ready > 0)}</div>`;
  }
  // oni left to lay: one oni and a count
  const oniCount = () => `<span class="onic${me().oni ? "" : " none"}" role="img" aria-label="${attr(t("stash.oniLeft", { n: me().oni }))}">${oniArt(0)}<b>×${me().oni}</b></span>`;
  // the tablet: the village as a column of named patients, the board as big as it fits, and a side column with
  // the hand always showing above the phone's tabs (garden, ward, market with its tools) and action bar
  function patRow(pt, k) {
    const tuck = claimTuck(pt);
    const rows = G().village.length + (KF.royalStage(0) ? 1 : 0), px = Math.max(44, Math.min(74, Math.floor((U.sh - 330) / Math.max(4, rows)) - 26));
    const sub = pt.royal ? t("royal.tag", { n: me().royal.stage + 1, of: me().royal.stages.length }) : esc(ailOf(pt)) + (KF.needCards(pt) ? ` · ${t("bench.needs", { n: KF.needCards(pt) })}` : "");
    return `<button class="pc vr paper${k === U.sel ? " sel" : ""}${pt.royal ? " royal" : ""}${ptCls(pt)}${fresh("p" + pt.id)}" data-a="sel" data-i="${k}" aria-label="${attr(ptLabel(pt))}">
      <span class="vt"><span class="vh">${ptAvatar(pt, "big")}${hintBadges(pt, "inhead")}${monVal(pt.royal ? me().royal.pay : payNow(pt))}</span><b>${esc(whoOf(pt))}</b><small>${sub}</small></span>${mapSVG(pt, { px, icons: true })}${tuck}</button>`;
  }
  function tablScreen() {
    const g = G(), b = bot(), mine = myTurn(), rs = routeState(), n = nTake(), mu = (300 - 2 * 8) / (3 * 66);
    const handW = U.sw - 36 - 32 - 4 * 13 - 300 - 112 - 170;
    const k = (g2) => (gl(g2) || ASSET["icon." + g2] ? `<span class="k">${ic(g2)}</span>` : "");
    // the market and the tools share the right column: Tools swaps the market cards for the tools, and reads Back there
    const tools = U.mview === "tools";
    const ab = (a, icon, label, o = {}) => `<button class="ab${o.cls ? " " + o.cls : ""}" data-a="${a}" ${o.dis ? "disabled" : ""}>${icon}${label}</button>`;
    const macts = `<div class="acts">${ab("mtools", tools ? ICON.back() : ICON.tools(), tools ? t("act.back") : t("act.tools"))}${ab("blind", ICON.blind(), t("act.drawBlind", { n }), { dis: !canAct() })}${ab("take", "", `${k("market")}${t("act.takeN", { n, have: U.mkt.length })}`, { cls: "primary", dis: !canAct() || U.mkt.length !== n })}</div>`;
    const plot = () => `<button class="tplot" data-a="plant" ${!mine || g.turn.planted || !me().hand.length ? "disabled" : ""} aria-label="${attr(t("garden.plantAria"))}">${ICON.plant(22)}${t("garden.plantHere")}</button>`;
    let brew;
    if (mine && g.turn.acted) brew = `<button class="brew glow" data-a="end">${k("endTurn")}<span class="bt"><b>${t("act.endTurn")}</b><small>${t("act.endTurnSub")}</small></span></button>`;
    else brew = `<button class="brew${rs && rs.ready && mine ? " glow" : ""}" data-a="brew" ${rs && rs.ready && mine ? "" : "disabled"}>${k("cure")}<span class="bt"><b>${t("act.brew")}</b><small>${rs ? t("act.brewSub", { name: esc(whoOf(rs.pt)) }) : t("board.nobody")}</small></span></button>`;
    const rivHand = openHands() ? `<span class="g">${t("rival.hand")} ${b.hand.map((c) => `<span class="mc" style="background:${EL(c.el).color}" title="${attr(cardName(c))}">${pathSVG(c, c.steps, 18)}</span>`).join("")}</span>` : `<span>${t("rival.handN", { n: b.hand.length })}</span>`;
    return `<div class="scr tabl lacquer">
      <header class="top">${menuBtn()}<div class="brand"><div class="b1">${gl("brand") || ASSET["icon.brand"] ? `<span>${ic("brand")}</span>` : ""}<span>${t("app.name")}</span></div><small>${turnLabel()}</small></div>${fameBars()}${goal()}</header>
      <button class="rivstrip${g.cur === 1 ? " live" : ""}" data-a="rival" aria-label="${attr(t("rival.showTable"))}">${portrait(1)}<b>${rivalLabel()}</b>${charOf(1) ? `<span class="rch">${esc(abilityName(charOf(1).ability))}</span>` : ""}${rivHand}<span class="g">${t("rival.garden")} ${b.garden.map((c) => `<span class="ga" style="background:${EL(c.el).color}">${art(EL(c.el).art, "", { slice: true })}</span>`).join("") || "—"}</span>
        ${RU().toolIds.filter((id) => b.tools[id]).map((id) => `<span class="g">${toolPic(id)}${esc(toolName(id))}</span>`).join("")}
        <span class="g">${Array.from({ length: b.oni }, () => oniArt(1)).join("") || t("rival.noOni")}</span>
        <span class="last">${g.cur === 1 && U.rv ? esc(stripTags(U.rv.say)) : esc(g.lastBot || "")}</span></button>
      <div class="mid">
        <section class="vcol" aria-label="${attr(t("label.village"))}"><div class="lbl"><span>${withGl(t("label.village"), "village")}</span><span>${t("label.patientDeck", { n: g.pats.length })}</span></div>
          <div class="vlist">${g.village.map((pt, k2) => patRow(pt, k2)).join("")}${KF.royalStage(0) ? patRow(KF.royalStage(0), ROYAL) : ""}${g.village.length ? "" : `<span class="empty">${t("label.villageEmpty")}</span>`}</div></section>
        ${boardPanel()}
        <section class="side"><div class="lbl"><span>${tools ? withGl(t("label.tools"), "tools") : withGl(t("label.market"), "market")}</span><span>${tools ? t("tools.paidWithFame") : t("label.deckDiscard", { n: g.deck.length, d: g.discard.length })}</span></div>
          <div class="tray">${tools ? `<div class="tgrid2">${toolCards()}</div>` : `<div class="hgrid">${marketCards(mu, "m")}${tradeBtn(mu)}</div>`}</div>
          ${macts}</section>
      </div>
      <div class="traybar">
        <div class="hand"><div class="lbl"><span>${withGl(t("label.yourHand"), "hand")} ${me().hand.length}/${KF.limit(0, "handLimit")}</span><span class="n">${t("hand.tapToPreview")}</span></div><div class="crow${me().hand.length >= 6 ? " spread" : ""}">${handCards(rowU(me().hand.length, handW, 1, 1), "h")}</div></div>
        <div class="gard"><div class="lbl">${gardTabs(U.gview === "ward" ? "" : t("garden.neverUsedUp"))}</div><div class="crow${U.gview === "ward" ? " wardrow" : ""}">${U.gview === "ward" ? wardCards(Math.min(1, rowU(Math.max(4, me().ward.length), 300, 1, 1)), "w") : gardenCards(1, "g", plot)}</div></div>
        <div class="stash">
          <div class="s"><span>${t("stash.oni")}</span>${oniCount()}</div>
          <div class="s tls"><span>${t("label.tools")}</span>${RU().toolIds.filter((id) => me().tools[id]).map((id) => `<span class="tpill">${toolPic(id)}${esc(toolName(id))}</span>`).join("") || `<span class="none">${t("stash.noneYet")}</span>`}</div>
        </div>
        <div class="tacts">${brew}</div>
      </div></div>`;
  }

  // who you play: character, guild and colour (part of the quick-game sheet)
  function whoPicker(w) {
    const chars = CHARS(), guilds = GUILDS(), pc = guildColor(guilds[w.guild]);
      const ch = chars.map((c) => `<button class="chr${w.char === c.id ? " on" : ""}" data-a="pickc" data-i="${attr(c.id)}" aria-pressed="${w.char === c.id}" style="--pc:${attr(pc || "var(--shu)")}">${art(c.art, "por")}<span class="tx"><b>${esc(charName(c))}</b><small>${esc(charTitle(c))}</small><i>${esc(abilityName(c.ability))}</i><span>${esc(abilityText(c.ability))}</span></span></button>`).join("");
      const gs = guilds.map((g, i) => `<button class="gld${w.guild === i ? " on" : ""}" data-a="pickg" data-i="${i}" aria-pressed="${w.guild === i}">${art(g.art, "crest")}<b>${esc(guildName(g))}</b><small>${esc(lookup("content.guilds." + g.id + ".motto") || "")}</small>${g.element && RU().guilds.echo ? `<span class="gel" style="background:${EL(g.element).color};color:${onEl(g.element)}">${elIc(g.element)} ${esc(elName(g.element))}</span>` : ""}</button>`).join("");
      const gpick = guilds[w.guild], craft = gpick && gpick.element && RU().guilds.echo ? `<p class="muted gcraft"><b>${t("guildAbility.name")}</b> · ${t("guildAbility.text", { el: elName(gpick.element) })}</p>` : "";
    return `${chars.length ? `<span class="cap">${t("setup.character")}</span><div class="chrs">${ch}</div>` : ""}
        ${guilds.length ? `<span class="cap">${t("setup.guild")} <small>${t("setup.guildSub")}</small></span><div class="glds">${gs}</div>${craft}` : ""}`;
  }

  // ---------- splash and title menu ----------
  const brandMark = () => (gl("brand") || ASSET["icon.brand"] ? `<span class="tbrand">${ic("brand")}</span>` : "");
  function splashScreen() {
    return `<div class="scr splash lacquer" data-a="splash" role="button" aria-label="${attr(t("title.tap"))}"><div class="spl">
      <div class="emb">${art("emblem")}</div>${brandMark()}<h1>${t("app.name")}</h1><p>${t("title.tagline")}</p><span class="tap">${t("title.tap")}</span></div></div>`;
  }
  // a game you can go back to: saved, not over, not the empty table set up behind the menu
  const canContinue = () => { const g = G(); return !!(g && !g.over && !g.unplayed); };
  function titleScreen() {
    const g = G(), cont = canContinue();
    const where = cont ? (g.quest && QUEST ? t("quest.toast", { n: g.quest.n + 1, place: esc(stopName(g.quest.n)) }) : t("title.quickGame")) + " · " + t("title.score", { you: g.P[0].fame, rival: g.P[1].fame, n: g.rules.endFame }) : "";
    const c = CHARS().find((x) => x.id === (PREFS.who || {}).char);
    const inst = isStandalone() ? "" : `<button class="tlink" data-a="installq">${t("menu.install")}</button>`;
    return `<div class="scr title ${U.layout} lacquer"><div class="tcol">
      <div class="thead"><div class="emb">${art("emblem")}</div><div>${brandMark()}<h1>${t("app.name")}</h1></div></div>
      <div class="tbtns">
        ${cont ? `<button class="mb primary" data-a="continue"><b>${t("title.continue")}</b><small>${where}</small></button>` : ""}
        <button class="mb${cont ? "" : " primary"}" data-a="quick"><b>${t("title.quick")}</b><small>${t("title.quickSub")}</small></button>
        ${QUEST ? `<button class="mb" data-a="quest"><b>${t("quest.menu")}</b><small>${questDone() ? t("quest.menuAt", { n: questDone(), total: QUEST.stops.length }) : t("quest.menuNew")}</small></button>` : ""}
      </div>
      ${titleThemes()}
      <div class="tlinks"><button class="tlink" data-a="rules">${t("menu.howToPlay")}</button>${inst}</div>
    </div></div>`;
  }
  // the themes on the title screen: each one's emblem and name, the current one lit; a tap switches
  function titleThemes() {
    const ks = Object.keys(CFG.themes || {}); if (CFG.themePicker === false || ks.length < 2) return "";
    return `<div class="tthemes" role="group" aria-label="${attr(t("themes.title"))}">${ks.map((k) => { const em = THEMES[k] && THEMES[k].assets && THEMES[k].assets.emblem;
      return `<button class="tth${k === CUR_THEME ? " on" : ""}" data-a="theme" data-i="${attr(k)}" aria-pressed="${k === CUR_THEME}"><span class="te">${em ? `<img src="${attr(em)}" alt="">` : ""}</span><span>${esc(themeName(k))}</span></button>`; }).join("")}</div>`;
  }
  function toTitle() { U.screen = "title"; closeSheet(); applyPlayerColor(); render(); }
  // back to the table: the sheet or the rival's move the saved game was waiting on
  function resume() {
    const g = G(); U.screen = null; closeSheet();
    applyPlayerColor();
    U.lastFame = g.P.map((p) => p.fame);
    g.market.concat(g.P[0].hand, g.P[0].garden).forEach((c) => ["h", "g", "m"].forEach((z) => U.seen.add("c" + c.id + z)));
    g.village.forEach((p) => U.seen.add("p" + p.id));
    render();
    if (g.over) openSheet({ type: "over", modal: true, quiet: true });
    else if (g.phase === "reward" && g.pending) openSheet({ type: "reward", modal: true, quiet: true });
    else if (g.cur === 1 && !U.busy) runBot();
  }
  // quick-game options: the knobs the quest turns stop by stop
  const ONI = { few: [0, 2], some: null, many: [2, 5] };
  function quickOpts() {
    const o = Object.assign({ endFame: PREFS.endFame || BASE_END, depth: 5, tools: true, curse: true, oni: "some", open: PREFS.openHands != null ? !!PREFS.openHands : BASE_OPEN, head: 0,
      bench: true, quirks: true, gifts: true, royal: true }, PREFS.opts || {});
    return o;
  }
  function startQuick() {
    const o = quickOpts(), settings = { endFame: o.endFame, openHands: !!o.open };
    if (ONI[o.oni]) settings.patients = { oniMin: ONI[o.oni][0], oniMax: ONI[o.oni][1] };
    // the patient rules that can be switched off for a simpler game
    ["bench", "quirks", "gifts", "royal"].forEach((k) => { settings[k] = { enabled: !!o[k] }; });
    const players = pickPlayers(); players[1].style = { depth: o.depth, tools: o.tools, curse: o.curse };
    U.screen = null; closeSheet(); startNew(false, { settings, players, headStart: o.head });
  }

  // ---------- render ----------
  function render() {
    if (U.screen) { $("#scr").innerHTML = U.screen === "splash" ? splashScreen() : titleScreen(); return; }
    const g = G(); if (!g) return;
    curPt();
    const html = U.layout === "port" ? portScreen() : U.layout === "land" ? landScreen() : tablScreen();
    $("#scr").innerHTML = html;
    U.shake = false;
    if (U.enter) { U.enter = 0; requestAnimationFrame(() => requestAnimationFrame(() => { const b = $(".board"); if (b) b.classList.remove("from-r", "from-l"); })); }
    g.P.forEach((p, i) => {
      if (p.fame !== U.lastFame[i]) { const el = document.querySelector(`[data-fame="${i}"]`); const d = p.fame - U.lastFame[i]; if (el) floatGain(el, (d > 0 ? "+" : "−") + Math.abs(d), i, d < 0); }
      U.lastFame[i] = p.fame;
    });
    const seqs = $(".strip .seqs"); if (seqs) seqs.scrollLeft = seqs.scrollWidth;
    KF.save();
  }
  function floatGain(el, txt, who, neg) {
    const st = $("#stage").getBoundingClientRect(), r = el.getBoundingClientRect(), s = U.scale;
    const d = document.createElement("span"); d.className = "gain" + (who ? " r" : "") + (neg ? " neg" : ""); d.textContent = txt;
    d.style.left = (r.left - st.left) / s - 6 + "px"; d.style.top = (r.top - st.top) / s + 8 + "px";
    $("#stage").appendChild(d); setTimeout(() => d.remove(), 1700);
  }

  // ---------- board animation ----------
  function paintBoard(pt, o) { const b = $(".board .bsvg"); if (b) b.innerHTML = mapSVG(pt, Object.assign({ icons: true }, o)); }
  // walk the marker cell by cell from the end of `base` through `cells`
  function walk(pt, base, cells, o = {}) {
    return new Promise((done) => {
      const drawn = base.slice(); let from = drawn[drawn.length - 1], i = 0;
      const per = (o.per || 190) * (reduced() ? 0 : U.speed);
      const next = () => {
        if (i >= cells.length) return done(drawn);
        const to = cells[i], t0 = performance.now();
        const frame = (now) => {
          const k = per ? Math.min(1, (now - t0) / per) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const p = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
          paintBoard(pt, { trail: drawn.concat([p]), pos: p, rival: o.rival });
          if (k < 1) return requestAnimationFrame(frame);
          drawn.push(to); from = to;
          SFX.step((o.stepBase || 0) + i);
          if (pt.bonus && to[0] === pt.bonus[0] && to[1] === pt.bonus[1]) SFX.sakura();
          i++; setTimeout(next, per ? 50 * U.speed : 0);
        };
        requestAnimationFrame(frame);
      };
      next();
    });
  }

  function stampBoard(key, rival) {
    const pic = key === "oni" ? oniArt(rival ? 1 : 0) : key === "cured" && (ASSET.seal || SPR.seal) ? art("seal") : "";
    const b = $(".board"), html = pic || ic(key); if (!b || !html) return;
    const d = document.createElement("div"); d.className = "bstamp" + (rival ? " r" : "") + (pic ? " pic" : ""); d.innerHTML = html;
    b.appendChild(d); setTimeout(() => d.remove(), 1600);
    if (key === "cured") brewFX(b, rival);
  }
  // ---------- atmosphere ----------
  // faint steam drifting up over the whole table; never clickable, off in settings or with reduced motion
  function steamLayer() {
    const r = (a, z) => (a + Math.random() * (z - a)).toFixed(1);
    return `<div id="steam" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i style="--x:${r(i * 11 - 4, i * 11 + 8)}%;--w:${r(34, 58)}vmin;--d:${r(18, 28)}s;--dl:-${r(0, 28)}s;--sw:${r(-8, 8)}vmin;--o:${r(0.22, 0.36)}"></i>`).join("")}</div>`;
  }
  const setSteam = () => { const el = $("#steam"); if (el) el.hidden = !PREFS.steam || reduced(); };
  // a little burst of sparks where the marker lands as an ingredient goes in, in that ingredient's colour
  function sparkAt(el) {
    const m = $(".board .mkr"); if (!m || reduced() || !PREFS.steam) return;
    const r = m.getBoundingClientRect(), fx = document.createElement("div"), rnd = (a, z) => a + Math.random() * (z - a);
    fx.className = "sparkfx"; fx.style.left = r.left + r.width / 2 + "px"; fx.style.top = r.top + r.height / 2 + "px";
    if (el) fx.style.setProperty("--tint", `var(--${el})`);
    fx.innerHTML = `<b></b>` + Array.from({ length: 18 }, () => { const a = rnd(0, Math.PI * 2), d = rnd(22, 52); return `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 12).toFixed(0)}px;--t:${rnd(0.45, 0.8).toFixed(2)}s;--s:${rnd(3.5, 6.5).toFixed(1)}px"></i>`; }).join("");
    document.body.appendChild(fx); setTimeout(() => fx.remove(), 900);
  }
  // a cure goes off like a chemistry bench: a flash, a burst of sparks, bubbles and a puff of smoke
  function brewFX(b, rival) {
    if (reduced()) return;
    const fx = document.createElement("div"), pt = G() && (U.bo ? U.bo.pt : curPt()); fx.className = "brewfx" + (rival ? " r" : "");
    if (pt && pt.el) fx.style.setProperty("--tint", `var(--${pt.el})`);
    const W = b.clientWidth || 300, rnd = (a, z) => a + Math.random() * (z - a), pc = (v) => v.toFixed(1) + "%", px = (v) => (v * W / 100).toFixed(0) + "px";
    let h = `<i class="flash"></i><i class="ring"></i>`;
    for (let i = 0; i < 34; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(20, 52);
      h += `<i class="spark" style="--dx:${px(Math.cos(a) * r)};--dy:${px(Math.sin(a) * r - 8)};--d:${rnd(0, 0.18).toFixed(2)}s;--t:${rnd(0.6, 1.1).toFixed(2)}s;--s:${rnd(4, 9).toFixed(1)}px"></i>`;
    }
    for (let i = 0; i < 12; i++)
      h += `<i class="bub" style="--x:${pc(rnd(32, 68))};--dx:${px(rnd(-6, 6))};--dy:${px(-rnd(25, 40))};--d:${rnd(0.05, 0.5).toFixed(2)}s;--s:${rnd(6, 14).toFixed(0)}px"></i>`;
    for (let i = 0; i < 13; i++)
      h += `<i class="smoke" style="--x:${pc(rnd(28, 72))};--dx:${px(rnd(-20, 20))};--dy:${px(-rnd(30, 55))};--d:${rnd(0.05, 0.6).toFixed(2)}s;--t:${rnd(1.5, 2.3).toFixed(2)}s;--s:${rnd(20, 34).toFixed(0)}%"></i>`;
    // pinned over the board on the page, so it keeps going when the board redraws and the reward sheet opens
    const r = b.getBoundingClientRect();
    Object.assign(fx.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    fx.innerHTML = h; document.body.appendChild(fx); setTimeout(() => fx.remove(), 3000);
  }

  // ---------- swiping between patients ----------
  let SW = null;
  const canSwipe = () => !U.screen && G() && G().village.length > 1 && !U.anim && !U.busy && !U.bo && G().cur === 0 && !U.sheet;
  function goPatient(dir) {
    const n = G().village.length; if (n < 2) return;
    const b = $(".board");
    const finish = () => { U.sel = (U.sel + dir + n) % n; resetRoute(); U.enter = dir; SFX.select(); render(); };
    if (!b || reduced()) return finish();
    b.style.transition = "transform .17s ease-in, opacity .17s ease-in";
    b.style.transform = `translateX(${-dir * 70}%)`; b.style.opacity = "0";
    setTimeout(finish, 170);
  }
  function swipeDown(e) {
    const bw = e.target.closest(".bwrap"); if (!bw || !canSwipe() || e.button > 0) return;
    SW = { x: e.clientX, y: e.clientY, id: e.pointerId, bw, b: bw.querySelector(".board"), drag: false, dx: 0 };
  }
  function swipeMove(e) {
    if (!SW || e.pointerId !== SW.id) return;
    const dx = (e.clientX - SW.x) / U.scale, dy = (e.clientY - SW.y) / U.scale;
    if (!SW.drag) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { SW.drag = true; try { SW.bw.setPointerCapture(e.pointerId); } catch (er) {} }
      else if (Math.abs(dy) > 14) { SW = null; return; } else return;
    }
    SW.dx = dx; e.preventDefault();
    if (SW.b) { SW.b.style.transition = "none"; SW.b.style.transform = `translateX(${dx * 0.85}px)`; SW.b.style.opacity = String(1 - Math.min(0.55, Math.abs(dx) / 420)); }
  }
  function swipeUp(e) {
    if (!SW || e.pointerId !== SW.id) return;
    const s = SW; SW = null;
    if (!s.drag) return;
    if (Math.abs(s.dx) > 46) goPatient(s.dx < 0 ? 1 : -1);
    else if (s.b) { s.b.style.transition = "transform .2s, opacity .2s"; s.b.style.transform = ""; s.b.style.opacity = ""; }
  }

  // ---------- sheets ----------
  function openSheet(s) { U.sheet = s; if (!s.quiet) SFX.open(); renderSheet(); }
  function closeSheet() { U.sheet = null; renderSheet(); }
  function renderSheet() {
    const el = $("#shl"); if (!el) return;
    const s = U.sheet; if (!s) { el.innerHTML = ""; return; }
    const body = SHEETS[s.type](s);
    const st = el.querySelector(".sheet"), top = st ? st.scrollTop : 0, same = st && st.dataset.t === s.type;
    el.innerHTML = `<div class="scrim${same ? " still" : ""}" data-a="${s.modal ? "" : "scrim"}"><div class="sheet paper" data-t="${s.type}" role="dialog" aria-modal="true" aria-label="${attr(t("sheets." + s.type))}"><span class="grab" aria-hidden="true"></span>${body}</div></div>`;
    if (same) el.querySelector(".sheet").scrollTop = top;
    else { const f = el.querySelector(".sheet .btn.primary:not(:disabled)") || el.querySelector(".sheet button"); if (f) f.focus({ preventScroll: true }); }
  }
  const stampStyle = (col) => `style="color:${col};border-color:${col};box-shadow:inset 0 0 0 2px var(--parch),inset 0 0 0 3px ${col}"`;
  const toggleRow = (a, i, on, title, sub) => `<button class="tg" data-a="${a}" data-i="${i}" aria-pressed="${!!on}"><span class="sw"></span><span><b>${title}</b><small>${sub}</small></span></button>`;
  const SHEETS = {
    reward(s) {
      const g = G(), res = g.pending, pt = res.pt, p = me(), sak = res.sak || 0, gain = res.gain != null ? res.gain : pt.val + sak;
      const btns = `<div class="btns"><button class="btn primary" data-a="rdone">${t("reward.continue")}</button></div>`;
      const kept = res.kept || 0, ro = res.royal;
      if (ro) {
        // a royal stage: progress, and the payout once it's all done
        const head = `<div class="sh"><div class="stamp por">${ptPortrait(pt)}<span class="cst${ASSET.seal || SPR.seal ? " pic" : ""}">${ASSET.seal || SPR.seal ? art("seal") : ic("cured")}</span></div><div><h2>${ro.done ? t("royal.doneTitle", { name: esc(whoOf(pt)) }) : t("royal.stageTitle", { name: esc(whoOf(pt)), n: ro.stage, of: ro.of })}</h2><div class="sub">${esc(ailOf(pt))}</div></div></div>`;
        const pips = `<div class="rpips">${Array.from({ length: ro.of }, (_, i) => `<i class="${i < ro.stage ? "on" : ""}"></i>`).join("")}</div>`;
        const row = ro.done
          ? `<div class="gainrow">${monIc("em")}<div><b>${t("reward.fame", { n: gain })}</b><small>${t("reward.track", { from: p.fame - gain, to: p.fame })}</small></div></div>`
          : `<div class="gainrow royal">${pips}<div><b>${t("royal.stageDone", { n: ro.stage, of: ro.of })}</b><small>${t("royal.stageSub", { n: ro.pay })}</small></div></div>`;
        return `${head}${row}${btns}`;
      }
      const subs = [res.known ? t("reward.known", { name: esc(whoOf({ who: res.known }, true)) }) : "", res.spot ? t("reward.bench", { n: res.spot }) : "", res.fee ? t("reward.fee", { n: res.fee }) : "", sak ? `${art("sakura")}${t("reward.sakura", { n: sak })}` : "", kept ? `${oniArt(0)}${t("reward.kept", { n: kept })}` : ""].filter(Boolean);
      const gift = res.gift ? `<div class="gainrow gift"><span class="gico">${giftIcon(res.gift)}</span><div><b>${t("gifts." + res.gift + ".got", { n: res.gift === "mon" ? RU().gifts.mon : RU().gifts.draw })}</b><small>${t("reward.giftFrom", { name: esc(whoOf(pt, true)) })}</small></div></div>` : "";
      const joins = RU().ward.enabled && pt.el ? `<div class="gainrow joins">${ptChip(pt, true)}<div><b>${t("reward.joins", { name: esc(whoOf(pt, true)) })}</b><small>${t("reward.joinsSub", { move: moveName(pt.mv), text: moveText(pt.mv, pt.el) })}</small></div></div>` : "";
      return `<div class="sh"><div class="stamp por">${ptPortrait(pt)}<span class="cst${ASSET.seal || SPR.seal ? " pic" : ""}">${ASSET.seal || SPR.seal ? art("seal") : ic("cured")}</span></div><div><h2>${t("reward.title", { name: esc(whoOf(pt)) })}</h2><div class="sub">${subs.length ? subs.join(" · ") : esc(ailOf(pt))}</div></div></div>
        <div class="gainrow">${monIc("em")}<div><b>${t("reward.fame", { n: gain })}</b><small>${t("reward.track", { from: p.fame - gain, to: p.fame })}</small></div></div>${gift}${joins}
        ${btns}`;
    },
    // a patient's portrait, large
    pview(s) {
      const pt = s.pt;
      return `<div class="pvbig">${ptPortrait(pt, "pvimg")}</div>
        <div class="sh"><div><h2>${esc(whoOf(pt))}</h2><div class="sub">${esc(ailOf(pt))}</div>${traits(pt)}</div></div>
        <div class="btns"><button class="btn primary" data-a="close">${t("common.close")}</button></div>`;
    },
    // a reminder of what a patient's pill means: their quirk, gift, symptoms, place on the bench or royal stages
    trait(s) {
      const r = RU(), pt = s.pt, [kind, id] = s.k.split(".");
      let head, title, text, more = "";
      if (kind === "q") {
        head = quirkArt(id) || `<span class="qbig">${esc(t("quirks." + id + ".name").slice(0, 1))}</span>`;
        title = t("quirks." + id + ".name"); text = t("quirks." + id + ".text", { n: r.quirks.contagious }); more = t("quirks." + id + ".how", { n: r.quirks.contagious });
      } else if (kind === "g") {
        head = `<span class="gico big">${giftIcon(id)}</span>`; title = t("gifts.title"); text = t("gifts." + id + ".text", { n: giftN(id) }); more = t("gifts.how");
      } else if (kind === "sym") {
        head = ASSET.symptom || SPR.symptom ? art("symptom") : `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="1.4 .8"/><circle cx="5" cy="5" r="1" fill="currentColor"/></svg>`;
        title = t("symptoms.title"); text = t("symptoms.tip"); more = pt && pt.sym ? t("symptoms.how", { n: pt.sym.length }) : "";
      } else if (kind === "bench") {
        const k = pt ? benchIdx(pt) : -1, sp = r.bench.spots[k] || r.bench.spots[0];
        head = `<span class="qbig">${KF.needCards(pt) || sp.min}</span>`; title = t("bench.spot" + Math.min(Math.max(k, 0), 3)); text = t("bench.tip", { n: sp.min, b: sp.bonus }); more = t("bench.how");
      } else {
        head = ASSET.royal || SPR.royal ? art("royal") : `<span class="qbig">♛</span>`; title = t("rules.royal.h"); text = t("royal.how", { pay: me().royal.pay });
      }
      return `<div class="sh trh"><div class="stamp tri">${head}</div><div><h2>${title}</h2>${pt ? `<div class="sub">${esc(whoOf(pt))}</div>` : ""}</div></div>
        <p class="trt">${text}</p>${more && more.indexOf(".how") < 0 ? `<p class="muted">${more}</p>` : ""}
        <div class="btns"><button class="btn primary" data-a="close">${t("rules.gotIt")}</button></div>`;
    },
    trade(s) {
      const p = me(), g = G();
      return `<div class="sh"><div class="stamp" ${stampStyle("var(--gold)")}>⇄</div><div><h2>${t("trade.title")}</h2><div class="sub">${t("trade.sub", { n: KF.limit(0, "swap") })}</div></div></div>
        <span class="cap">${t("trade.give")}</span><div class="crow">${p.hand.map((c, i) => ingCard(c, { act: "trh", i, cls: s.h === i ? "pick" : "", noAnim: true, pressed: s.h === i, tag: s.h === i ? t("trade.tagGive") : null })).join("")}</div>
        <span class="cap">${t("trade.get")}</span><div class="crow">${g.market.map((c, i) => ingCard(c, { act: "trm", i, cls: s.m === i ? "pick" : "", noAnim: true, pressed: s.m === i, tag: s.m === i ? t("trade.tagGet") : null })).join("")}</div>
        ${U.route.length ? `<p class="muted">${t("plant.clearsRoute")}</p>` : ""}
        <div class="btns"><button class="btn" data-a="close">${t("common.cancel")}</button><button class="btn primary" data-a="trdo" ${s.h != null && s.m != null ? "" : "disabled"}>${t("trade.do")}</button></div>`;
    },
    plant(s) {
      const p = me(), full = p.garden.length >= KF.limit(0, "gardenMax");
      return `<div class="sh"><div class="stamp" ${stampStyle("var(--Ai)")}>${ic("garden")}</div><div><h2>${t("plant.title")}</h2><div class="sub">${t("plant.sub")}</div></div></div>
        <span class="cap">${t("plant.fromHand")}</span><div class="crow">${p.hand.map((c, i) => ingCard(c, { act: "pl", i, cls: s.h === i ? "pick" : "", noAnim: true, pressed: s.h === i })).join("")}</div>
        ${full ? `<span class="cap">${t("plant.full")}</span><div class="crow">${p.garden.map((c, i) => ingCard(c, { act: "pr", i, cls: s.r === i ? "pick" : "", noAnim: true, pressed: s.r === i, tag: s.r === i ? t("card.tagDiscard") : null })).join("")}</div>` : ""}
        ${U.route.length ? `<p class="muted">${t("plant.clearsRoute")}</p>` : ""}
        <div class="btns"><button class="btn" data-a="close">${t("common.cancel")}</button><button class="btn primary" data-a="pldo" ${s.h != null && (!full || s.r != null) ? "" : "disabled"}>${t("plant.do")}</button></div>`;
    },
    tools() {
      const g = G(), p = me(), b = bot();
      const rows = RU().toolIds.map((id) => {
        let st;
        if (p.tools[id]) st = `<span class="mine">${t("tools.yours")}</span>`;
        else if (b.tools[id]) st = `<span class="rv">${t("tools.rivalOwns")}</span>`;
        else if (RU().toolShop === false) st = `<span class="rv">${t("tools.closed")}</span>`;
        else { const can = myTurn() && !g.turn.bought && KF.canBuy(0, id); st = `<button class="btn primary" data-a="buy" data-i="${id}" ${can ? "" : "disabled"}>${t("tools.buy")}</button>`; }
        return `<div class="trow"><span class="ti paper">${toolPic(id)}</span><span class="tb"><b>${toolIc(id)} ${esc(toolName(id))}</b><span class="c">${t("tools.cost", { n: KF.cost(id) })}</span><small>${toolText(id)}</small></span><span class="st">${st}</span></div>`;
      }).join("");
      const why = g.cur !== 0 ? t("tools.onYourTurn") : g.turn.bought ? t("tools.boughtThisTurn") : t("tools.how", { n: p.fame });
      return `<div class="sh"><div><h2>${withGl(t("label.tools"), "tools")}</h2><div class="sub">${why}</div></div></div>
        <div class="tlist">${rows}</div><div class="btns"><button class="btn" data-a="close">${t("common.close")}</button></div>`;
    },
    discard(s) {
      const p = me(), need = p.hand.length - KF.limit(0, "handLimit"); s.sel = s.sel || [];
      return `<div class="sh"><div><h2>${t("discard.title")}</h2><div class="sub">${t("discard.sub", { max: KF.limit(0, "handLimit"), n: need })}</div></div></div>
        <div class="crow">${p.hand.map((c, i) => ingCard(c, { act: "dc", i, cls: s.sel.includes(i) ? "pick" : "", noAnim: true, pressed: s.sel.includes(i), tag: s.sel.includes(i) ? t("card.tagDiscard") : null })).join("")}</div>
        <div class="btns"><button class="btn primary" data-a="dcdo" ${s.sel.length === need ? "" : "disabled"}>${t("discard.do", { n: need })}</button></div>`;
    },
    menu() {
      const inst = isStandalone() ? "" : `<button class="btn" data-a="installq">${t("menu.install")}<small>${t("menu.installSub")}</small></button>`;
      const themes = Object.keys(CFG.themes || {}), langs = Object.keys(CFG.languages || {});
      const sel = (a, cur, opts) => `<div class="seg wrap" role="group">${opts.map(([v, l]) => `<button data-a="${a}" data-i="${attr(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join("")}</div>`;
      return `<div class="sh"><div><h2>${gl("brand") || ASSET["icon.brand"] ? ic("brand") + " " : ""}${t("app.name")}</h2><div class="sub">${G().quest && QUEST ? `${t("quest.toast", { n: G().quest.n + 1, place: esc(stopName(G().quest.n)) })} · ` : ""}${turnLabel()}</div></div></div>
        <div class="menu"><button class="btn" data-a="rules">${t("menu.howToPlay")}<small>${ic("rules")}</small></button><button class="btn" data-a="log">${t("menu.log")}</button><button class="btn" data-a="rival">${t("menu.rivalTable")}</button><button class="btn" data-a="mytable">${t("table.you")}</button><button class="btn" data-a="title" ${U.busy ? "disabled" : ""}>${t("menu.main")}<small>${t("menu.mainSub")}</small></button>${themes.length > 1 && CFG.themePicker !== false ? `<button class="btn" data-a="themes">${t("menu.theme")}<small>${esc(themeName(CUR_THEME))}</small></button>` : ""}${inst}</div>
        <div class="sect"><div class="hd"><b>${t("settings.title")}</b></div>
          ${toggleRow("sound", "", SFX.isOn(), t("settings.sound"), t("settings.soundSub"))}
          ${toggleRow("hints", "", PREFS.hints, t("settings.hints"), openHands() ? t("settings.hintsSubOpen") : t("settings.hintsSub"))}
          ${toggleRow("steam", "", PREFS.steam, t("settings.steam"), t("settings.steamSub"))}
          ${langs.length > 1 ? `<span class="cap">${t("settings.language")}</span>${sel("lang", LANG, langs.map((k) => [k, CFG.languages[k].name || k]))}` : ""}
        </div>
        <div class="btns"><button class="btn" data-a="close">${t("common.close")}</button></div>`;
    },
    themes() {
      const cur = CUR_THEME;
      const tiles = Object.keys(CFG.themes).map((k) => {
        const th = THEMES[k] || {}, c = th.colors || {}, els = th.elements || {}, f = th.fonts || {};
        const fam = (x, d) => (x ? `&quot;${attr(x.family)}&quot;,${attr(x.fallback || d)}` : d);
        const em = th.assets && th.assets.emblem ? `<img class="em" src="${attr(th.assets.emblem)}" alt="">` : "";
        const chips = ["W", "F", "E", "A", "V"].filter((e) => els[e]).map((e) => { const u = th.assets && th.assets["icon.el." + e]; return `<b style="background:${attr(els[e].color)}">${u ? `<i class="mi" style="--m:url('${attr(u)}')"></i>` : esc(els[e].glyph)}</b>`; }).join("");
        const on = k === cur;
        return `<button class="thm${on ? " on" : ""}" data-a="theme" data-i="${attr(k)}" aria-pressed="${on}" style="--tb:${attr(c.lacquer || "#222")};--tb2:${attr(c["lacquer-2"] || c.lacquer || "#333")};--tp:${attr(c.parch || "#eee")};--ti:${attr(c.ink || "#111")};--tg:${attr(c.gold || "#ca5")};--ts:${attr(c.shu || "#b33")};--tr:${attr(c.rival || "#77c")}">
          <span class="pv">${em}<span class="card"><span class="nm" style="font-family:${fam(f.display, "serif")}">${esc(themeName(k))}</span><span class="ds" style="font-family:${fam(f.body, "sans-serif")}">${esc(lookup("themeDesc." + k) || "")}</span><span class="ch" style="font-family:${fam(f.display, "serif")}">${chips}</span></span></span>
          <span class="ft"><i class="dot you"></i><i class="dot rv"></i><span>${on ? t("themes.current") : t("themes.use")}</span></span></button>`;
      }).join("");
      return `<div class="sh"><div><h2>${t("themes.title")}</h2><div class="sub">${t("themes.sub")}</div></div></div>
        <div class="thms">${tiles}</div>
        <div class="btns"><button class="btn" data-a="menu">${t("common.back")}</button><button class="btn primary" data-a="close">${t("common.done")}</button></div>`;
    },
    quick(s) {
      const o = quickOpts();
      const seg = (k, opts) => `<div class="seg wrap" role="group">${opts.map(([v, l]) => `<button data-a="opt" data-k="${k}" data-i="${attr(String(v))}" aria-pressed="${String(o[k]) === String(v)}">${esc(String(l))}</button>`).join("")}</div>`;
      const tg = (k, title, sub) => `<button class="tg" data-a="optt" data-k="${k}" aria-pressed="${!!o[k]}"><span class="sw"></span><span><b>${title}</b><small>${sub}</small></span></button>`;
      return `<div class="sh"><div><h2>${t("title.quick")}</h2><div class="sub">${t("opts.sub")}</div></div></div>
        <div class="sect qyou"><div class="hd"><b>${t("opts.you")}</b></div>${whoPicker(s.who || PREFS.who || {})}</div>
        <div class="sect"><div class="hd"><b>${t("opts.rules")}</b></div></div>
        <span class="cap">${t("settings.target")} <small>${t("settings.targetSub")}</small></span>${seg("endFame", [15, 20, 30, 40].map((v) => [v, v]))}
        <span class="cap">${t("opts.skill")} <small>${t("opts.skillSub")}</small></span>${seg("depth", [2, 3, 4, 5].map((v) => [v, t("opts.skill" + v)]))}
        ${tg("tools", t("opts.tools"), t("opts.toolsSub"))}
        ${tg("curse", t("opts.curse"), t("opts.curseSub"))}
        <span class="cap">${t("opts.head")} <small>${t("opts.headSub")}</small></span>${seg("head", [0, 1, 2, 3].map((v) => [v, v]))}
        <span class="cap">${t("opts.oni")} <small>${t("opts.oniSub")}</small></span>${seg("oni", ["few", "some", "many"].map((v) => [v, t("opts.oni" + v[0].toUpperCase() + v.slice(1))]))}
        ${tg("open", t("settings.open"), t("settings.openSub"))}
        <div class="sect"><div class="hd"><b>${t("opts.patients")}</b></div></div>
        ${tg("bench", t("opts.bench"), t("opts.benchSub"))}
        ${tg("quirks", t("opts.quirks"), t("opts.quirksSub"))}
        ${tg("gifts", t("opts.gifts"), t("opts.giftsSub"))}
        ${tg("royal", t("opts.royal"), t("opts.royalSub"))}
        ${canContinue() ? `<p class="muted">${t("quest.abandon")}</p>` : ""}
        <div class="btns"><button class="btn" data-a="close">${t("common.back")}</button><button class="btn primary" data-a="quickgo">${t("opts.start")}</button></div>`;
    },
    rules() {
      const r = RU(), v = { end: r.endFame, gather: r.gather, garden: r.gardenMax, hand: r.handLimit, oni: r.oniPerPlayer, sak: r.sakuraBonus, min: r.minHandCards, cure: ic("cure"), oniG: ic("oni"), sakura: ic("sakura") };
      const dirs = Object.keys(r.deck.elements).map((el) => t("rules.dirOne", { el: elName(el), glyph: elIc(el), dir: t("dir." + r.deck.elements[el]).toLowerCase() })).join(", ");
      const tools = r.toolIds.map((id) => `<li><b>${esc(toolName(id))}</b> ${toolIc(id)} (${t("tools.cost", { n: KF.cost(id) })}): ${toolText(id)}</li>`).join("");
      const sp = r.bench.spots || [], ro = G() && G().P[0].royal;
      Object.assign(v, { b0: sp[0] ? sp[0].min : 0, x0: sp[0] ? sp[0].bonus : 0, b3: sp.length ? sp[sp.length - 1].min : 0, cont: `${r.quirks.contagious} ${t("terms.mon") !== "terms.mon" ? lookup("terms.mon") : "mon"}`, stages: ro ? ro.stages.length : 2, rmin: r.royal.min, rpay: ro ? ro.pay : 20 });
      const anySym = G() && [...G().village, ...G().pats].some((p) => p.sym && p.sym.length);
      const secs = ["goal", "turn", "brew", "fame", ...(r.bench.enabled ? ["bench"] : []), ...(anySym ? ["symptoms"] : []), ...(r.ward.enabled ? ["patients"] : []), ...(r.quirks.enabled || r.gifts.enabled ? ["quirks"] : []), ...(r.knownCure.enabled ? ["known"] : []), ...(r.guilds.echo ? ["guild"] : []), "tools", "curse", ...(r.royal.enabled && ro ? ["royal"] : []), "end"];
      return `<div class="sh"><div><h2>${withGl(t("rules.title"), "rules")}</h2><div class="sub">${t("rules.sub", { n: r.endFame })}${openHands() ? " · " + t("rules.openHands") : ""}</div></div></div><div class="rules">
        ${secs.map((k) => `<h3>${t("rules." + k + ".h")}</h3><p>${t("rules." + k + ".p", Object.assign({ dirs, kitsune: elIc("V") }, v))}</p>${k === "tools" ? `<ul>${tools}</ul>` : ""}${k === "brew" && r.patients.requireElement ? `<p>${t("rules.needEl", { kitsune: elIc("V") })}</p>` : ""}`).join("")}
      </div><div class="btns"><button class="btn primary" data-a="close">${t("rules.gotIt")}</button></div>`;
    },
    log() {
      const g = G();
      return `<div class="sh"><div><h2>${t("menu.log")}</h2><div class="sub">${turnLabel()}</div></div></div><div class="log">${g.log.map((l) => `<p class="${l.p === 1 ? "b" : l.p === 0 ? "y" : ""}"><span>${t("log.round", { n: l.r })}</span>${logLine(l)}</p>`).join("")}</div><div class="btns"><button class="btn" data-a="close">${t("common.close")}</button></div>`;
    },
    rival(s) {
      const pi = s.p == null ? 1 : s.p, g = G(), p = g.P[pi], c = charOf(pi), gd = guildOf(pi), mine = pi === 0;
      const small = (list, f) => (list.length ? `<div class="crow tc">${list.map(f).join("")}</div>` : `<span class="muted tnone">${t("table.none")}</span>`);
      const card = (o) => (x) => ingCard(x, Object.assign({ u: 0.6, noAnim: true, static: true }, o || {}));
      const tabs = `<div class="seg ttabs" role="tablist">${[1, 0].map((k) => `<button role="tab" data-a="tview" data-i="${k}" aria-pressed="${pi === k}">${t(k ? "who.rival" : "who.you")}</button>`).join("")}</div>`;
      const head = `<div class="tp">${portrait(pi) || `<span class="por"></span>`}<div class="tn"><b>${c ? esc(charName(c)) : t(mine ? "who.you" : "who.rival")}</b>${c && charTitle(c) ? `<small>${esc(charTitle(c))}</small>` : ""}</div>
        <div class="ts">${monVal(p.fame, "big")}<small>${t("table.cures", { n: p.cures })}</small></div></div>`;
      const ability = c ? `<div class="tbx"><span class="cap">${t("table.ability")}</span><b>${esc(abilityName(c.ability))}</b><small>${esc(abilityText(c.ability))}</small></div>` : "";
      const guild = gd ? `<div class="tbx gb">${crest(pi, "gcr")}<span class="cap">${t("table.guild")}</span><b>${esc(guildName(gd))}</b><small>${esc(lookup("content.guilds." + gd.id + ".motto") || "")}</small>${p.gel && RU().guilds.echo ? `<small class="craft">${elIc(p.gel)} ${t("guildAbility.text", { el: elName(p.gel) })}</small>` : ""}</div>` : "";
      const hand = mine || openHands() ? small(p.hand, card()) : `<span class="muted tnone">${t("table.hidden", { n: p.hand.length })}</span>`;
      const ward = RU().ward.enabled ? `<div class="tsec"><span class="cap">${t("table.ward")} <small>${p.ward.filter((w) => KF.wardLeft(w) && !w.spent).length}</small></span>${small(p.ward || [], (w) => ingCard(KF.wardCard(w), { u: 0.6, noAnim: true, static: true, cls: !KF.wardLeft(w) || w.spent ? "spent" : "", tag: !KF.wardLeft(w) || w.spent ? t("card.tagSpent") : null }))}</div>` : "";
      const tools = RU().toolIds.filter((id) => p.tools[id]).map((id) => `<span class="tpill${mine ? "" : " rv"}">${toolPic(id)}${esc(toolName(id))}</span>`).join("") || `<span class="muted tnone">${t("table.none")}</span>`;
      const oni = Array.from({ length: KF.limit(pi, "oniPerPlayer") }, (_, i) => `<span class="oc${i >= p.oni ? " gone" : ""}">${oniArt(pi)}</span>`).join("");
      return `<div class="sh"><div><h2>${t(mine ? "table.you" : "menu.rivalTable")}</h2></div></div>${tabs}
        ${head}
        ${ability || guild ? `<div class="tinfo">${ability}${guild}</div>` : ""}
        <div class="tsec"><span class="cap">${t("table.hand")} <small>${p.hand.length}/${KF.limit(pi, "handLimit")}</small></span>${hand}</div>
        <div class="tsec"><span class="cap">${t("table.garden")} <small>${p.garden.length}/${KF.limit(pi, "gardenMax")}</small></span>${small(p.garden, card())}</div>
        ${ward}
        ${p.royal ? `<div class="tsec"><span class="cap">${t("table.royal")} <small>${t("royal.progress", { n: Math.min(p.royal.stage, p.royal.stages.length), of: p.royal.stages.length })} · ${t("royal.pays", { n: p.royal.pay })}</small></span><div class="crow tc">${p.royal.stages.map((st, i) => `<span class="rstage${i < p.royal.stage ? " done" : i === p.royal.stage ? " now" : ""}">${mapSVG(st, { px: 64, icons: true })}</span>`).join("")}<span class="rname">${ptPortrait(p.royal.stages[0], "rtp")}<b>${esc(whoOf({ who: p.royal.who }))}</b></span></div></div>` : ""}
        <div class="tfoot"><div class="tsec"><span class="cap">${t("table.tools")}</span><div class="purse">${tools}</div></div><div class="tsec"><span class="cap">${t("table.oni")} <small>${p.oni}</small></span><div class="purse onis">${oni}</div></div></div>
        ${!mine && g.lastBot ? `<p class="muted tlast">${t("rival.lastTurn", { what: esc(g.lastBot) })}</p>` : ""}
        <div class="btns"><button class="btn" data-a="close">${t("common.close")}</button></div>`;
    },
    // arriving in a town: the last leg of the road, the town, and what's new here
    arrive(s) {
      const i = s.i, st = QUEST.stops[i], tx = stopText(i), townArt = "town." + st.id, pic = ASSET[townArt] || SPR[townArt];
      const news = (st.intro || []).map((k) => `<li>${t("quest.intro." + k)}</li>`).join("");
      return `<div class="arr">
        <div class="arrhero${pic ? " pic" : ""}">${pic ? art(townArt, "", { slice: true }) : ""}<div class="arrmap">${questMap(i, { focus: 1.6 })}</div>
          <span class="arrcap">${t("quest.stop", { n: i + 1, total: QUEST.stops.length })}${st.boss ? ` · <b>${t("quest.boss")}</b>` : ""}</span></div>
        <h2 class="arrname">${esc(stopName(i))}</h2>
        ${tx.story ? `<p class="arrstory">${esc(tx.story)}</p>` : ""}
        ${news ? `<div class="arrnew${st.boss ? " boss" : ""}"><b>${t("quest.arrive.new", { place: esc(stopName(i)) })}</b><ul>${news}</ul></div>` : ""}
        <span class="cap">${t("quest.arrive.expect")}</span><ul class="qtags arrtags">${questTags(st).map((x) => `<li>${x}</li>`).join("")}</ul>
        <div class="btns"><button class="btn" data-a="questmap" data-i="${i}">${t("quest.map")}</button><button class="btn primary" data-a="qbegin" data-i="${i}">${t("quest.arrive.begin")}</button></div></div>`;
    },
    quest(s) {
      const stops = QUEST.stops, done = questDone(), i = s.sel, st = stops[i], all = done >= stops.length;
      const g = G(), mid = g && !g.over && (g.round > 1 || g.quest == null);
      return `<div class="sh"><div><h2>${t("quest.title")}</h2><div class="sub">${all ? t("quest.done") : t("quest.menuAt", { n: done, total: stops.length })}</div></div></div>
        ${all ? `<p class="muted">${t("quest.doneSub")}</p>` : ""}
        <div class="qwrap">${questMap(i)}
          <div class="qinfo"><span class="cap">${t("quest.stop", { n: i + 1, total: stops.length })}${st.boss ? ` · <b class="qboss">${t("quest.boss")}</b>` : ""}${i < done ? ` · ${ICON.check(11)} ${t("quest.cleared")}` : ""}</span>
            <h3>${esc(stopName(i))}</h3><p class="muted">${esc(stopText(i).line || "")}</p>
            ${(st.intro || []).map((k) => `<p class="qnew"><b>${t("quest.new")}</b> ${t("quest.intro." + k)}</p>`).join("")}
            <ul class="qtags">${questTags(st).map((x) => `<li>${x}</li>`).join("")}</ul>
            <div class="qnav"><button class="btn" data-a="qstep" data-i="-1" aria-label="${attr(t("quest.prev"))}" ${i > 0 ? "" : "disabled"}>‹</button><button class="btn" data-a="qstep" data-i="1" aria-label="${attr(t("quest.next"))}" ${i < Math.min(done, stops.length - 1) ? "" : "disabled"}>›</button></div>
          </div></div>
        ${(PREFS.chest || []).length ? `<div class="sect"><div class="hd"><b>${t("chest.title")}</b><span>${t("chest.sub")}</span></div><div class="chests own">${PREFS.chest.map((id) => `<span class="chest on"><b>${t("chest." + id + ".name")}</b><small>${t("chest." + id + ".text")}</small></span>`).join("")}</div></div>` : ""}
        ${toggleRow("qhard", "", PREFS.questHard, t("quest.hard.name"), t("quest.hard.sub"))}
        ${mid ? `<p class="muted">${t("quest.abandon")}</p>` : ""}
        <div class="btns">${all ? `<button class="btn" data-a="qrestart">${t("quest.restart")}</button>` : `<button class="btn" data-a="qclose">${t("common.close")}</button>`}${PREFS.questHard && i < done && !all ? `<button class="btn primary" data-a="qsel" data-i="${done}">${t("quest.hard.onward", { place: esc(stopName(done)) })}</button>` : `<button class="btn primary" data-a="qgo" data-i="${i}">${i < done ? t("quest.playAgain") : t("quest.setOut")}</button>`}</div>`;
    },
    over() {
      const g = G(), [a, b] = g.P, w = g.winner;
      const q = g.quest && QUEST ? g.quest.n : null, nxt = q != null && q + 1 < QUEST.stops.length ? q + 1 : null;
      // a first win at a stop earns a reward for the medicine chest; travel on once it's chosen
      const offer = q != null && w === "you" && g.quest.reward !== false ? (g.quest.offer || (g.quest.offer = chestOffer(q))) : [];
      // a full chest: the new reward waits until you choose what to leave behind
      const full = offer.length && g.quest.picked && !g.quest.kept, picking = offer.length && (!g.quest.picked || full);
      const dropRow = full ? `<div class="sect chestsel"><div class="hd"><b>${t("chest.full", { n: chestSlots() })}</b><span>${t("chest.fullSub")}</span></div><div class="chests">${(PREFS.chest || []).map((id) => `<button class="chest" data-a="qdrop" data-i="${id}"><b>${t("chest." + id + ".name")}</b><small>${t("chest." + id + ".text")}</small></button>`).join("")}<button class="chest" data-a="qdrop" data-i=""><b>${t("chest.keepAll")}</b><small>${t("chest.keepAllSub", { name: t("chest." + g.quest.picked + ".name") })}</small></button></div></div>` : "";
      const chest = offer.length ? `<div class="sect chestsel"><div class="hd"><b>${t("chest.choose")}</b><span>${t("chest.chooseSub")}</span></div><div class="chests">${offer.map((id) => chestItem(id, g.quest.picked === id)).join("")}</div></div>${dropRow}` : "";
      const qbtns = q == null ? "" : w === "you"
        ? `${chest}<div class="btns"><button class="btn" data-a="questmap" data-i="${nxt != null ? nxt : q}">${t("quest.map")}</button>${nxt != null ? `<button class="btn primary" data-a="qgo" data-i="${nxt}" ${picking ? "disabled" : ""}>${picking ? t("chest.pickFirst") : t("quest.onTo", { place: esc(stopName(nxt)) })}</button>` : ""}</div>`
        : g.quest.lost ? `<div class="btns"><button class="btn" data-a="questmap" data-i="0">${t("quest.map")}</button><button class="btn primary" data-a="qgo" data-i="0">${t("quest.hard.again", { place: esc(stopName(0)) })}</button></div>`
        : `<div class="btns"><button class="btn" data-a="questmap" data-i="${q}">${t("quest.map")}</button><button class="btn primary" data-a="qgo" data-i="${q}">${t("quest.retry")}</button></div>`;
      const names = (p) => RU().toolIds.filter((id) => p.tools[id]).map(toolName).join(", ") || t("rival.none");
      return `<div class="sh end" style="flex-direction:column"><div class="big">${ic(w === "tie" ? "tie" : w === "you" ? "win" : "lose")}</div><h2>${t("over." + w)}</h2></div>
        <div class="end sc"><div><b>${a.fame}</b>${t("over.cures", { who: t("who.you"), n: a.cures })}</div><div><b>${b.fame}</b>${t("over.cures", { who: rivalLabel(), n: b.cures })}</div></div>
        <p class="muted" style="text-align:center">${t("over.tools", { you: esc(names(a)), rival: esc(names(b)) })}</p>
        ${isStandalone() ? "" : `<button class="btn" data-a="installq" style="flex:none;min-height:44px">${t("install.offer")}</button>`}
        ${q != null ? `<p class="qres">${t(w === "you" ? "quest.won" : g.quest.lost ? "quest.hard.lost" : "quest.lost", { place: esc(stopName(q)), n: q })}</p>${qbtns}` : `<div class="btns"><button class="btn" data-a="title">${t("menu.main")}</button><button class="btn" data-a="log">${t("act.log")}</button><button class="btn primary" data-a="quickgo">${t("over.again")}</button></div>`}`;
    },
    install() {
      const pl = platform();
      const share = '<span class="ik" aria-hidden="true">' + sv("M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12v8h14v-8", 16) + "</span>";
      const dots = '<span class="ik" aria-hidden="true">⋮</span>';
      const keys = ["ios", "android", "macsafari", "desktop", "firefox"];
      const order = [pl, ...keys.filter((k) => k !== pl)];
      const block = (k, first) => `<div class="ig${first ? " first" : ""}"><b>${t("install." + k + ".h")}</b><ol>${list("install." + k + ".steps").map((x) => `<li>${x.replace("{share}", share).replace("{menu}", dots)}</li>`).join("")}</ol>${lookup("install." + k + ".note") ? `<small>${t("install." + k + ".note")}</small>` : ""}</div>`;
      return `<div class="sh"><img class="appic" src="icons/icon-192.png" alt=""><div><h2>${t("install.title")}</h2><div class="sub">${t("install.sub")}</div></div></div>
        ${installed ? `<p class="okmsg">${t("install.done")}</p>` : deferredInstall ? `<button class="btn primary" data-a="install" style="flex:none">${t("install.now")}</button>` : ""}
        ${block(order[0], true)}
        <details class="more"><summary>${t("install.other")}</summary>${order.slice(1).map((k) => block(k)).join("")}</details>
        <div class="btns"><button class="btn" data-a="close">${t("common.close")}</button></div>`;
    },
  };
  function logLine(l) {
    const a = l.a || {}, who = l.p === 1 ? "rival" : "you";
    const pt = { who: a.who, ail: a.ail };
    switch (l.k) {
      case "new": return t(a.first ? "log.newRival" : "log.newYou");
      case "end": return t("over." + a.winner);
      case "buy": return t("log.buy." + who, { tool: esc(toolName(a.tool)), n: a.cost });
      case "cure": return t("log.cure." + who, { name: esc(whoOf(pt)), ailment: esc(ailOf(pt).toLowerCase()), n: a.v }) + (a.sak ? " " + t("log.sakura", { n: a.sak }) : "") + (a.kept ? " " + t("log.kept", { n: a.kept }) : "");
      case "known": return t("log.known." + who, { name: esc(whoOf(pt)), ailment: esc(ailOf(pt).toLowerCase()), n: a.v });
      case "gather": return t("log.gather." + who, { cards: (a.cards || []).map((c) => esc(cardLabel(c))).join(", ") });
      case "blind": return t("log.blind." + who, { n: a.n });
      case "plant": return t("log.plant." + who, { card: esc(cardLabel(a.card)) });
      case "swap": return t("log.swap." + who, { gave: esc(cardLabel(a.gave)), got: esc(cardLabel(a.got)) });
      case "claim": return t("log.claim." + who, { name: esc(whoOf(pt)) });
      case "leave": return t(a.contagious ? "bench.leftContagious" : "bench.left", { name: esc(whoOf(pt)), n: RU().quirks.contagious });
      case "royal": return t(a.pay ? "log.royalDone." + who : "log.royal." + who, { name: esc(whoOf(pt)), n: a.stage, of: a.of, pay: a.pay });
      case "lapse": return t("log.lapse." + who, { name: esc(whoOf(pt)), n: a.n });
    }
    return l.k;
  }

  // ---------- toasts ----------
  let toastTimer = null;
  function announce(html, ms, cb) {
    const el = $("#tsl");
    el.innerHTML = `<div class="toastl"><div class="toast paper" role="status">${html}<div class="bar" style="animation-duration:${ms}ms"></div></div></div>`;
    const w = el.firstChild; requestAnimationFrame(() => w.classList.add("show"));
    let gone = false;
    const close = () => { if (gone) return; gone = true; clearTimeout(toastTimer); w.classList.remove("show"); setTimeout(() => { if (el.firstChild === w) el.innerHTML = ""; cb && cb(); }, 230); };
    w.onclick = close; toastTimer = setTimeout(close, ms);
  }

  // ---------- the rival's turn, played out on the board ----------
  function rvLine(k, text) { U.botLines.push({ k, text }); }
  // the rival's popup over the board: their face and name, what they do, then the cards or tool
  function pop(title, body) { return `<div class="rvh">${portrait(1, "rvpf") || (gl("rival") || ASSET["icon.rival"] ? ic("rival") : "")}<span><b>${rivalLabel()}</b> ${title}</span></div>${body || ""}`; }
  // cards in the popup shrink with how many there are, so they always fit
  const popU = (n) => Math.min(1.6, 3.4 / Math.max(1, n));
  const toolChip = (id) => `<div class="rvrow"><span class="ti paper">${toolPic(id)}</span><small>${toolText(id)}</small></div>`;
  async function runBot() {
    const g = G(); if (!g || g.over || g.cur !== 1) return;
    U.busy = true; U.speed = 1; U.botLines = []; resetRoute(); U.mkt = []; U.tab = U.tab === "market" ? "hand" : U.tab;
    U.rv = { say: t("rival.turn"), sub: t("rival.thinking"), think: true };
    SFX.rival(); render();
    await sleep(800);
    for (let guard = 0; guard < 20; guard++) {
      const m = KF.botNext(); const b = bot();
      if (m.type === "end") break;
      if (m.type === "buy") {
        const nm = esc(toolName(m.tool)), c = KF.cost(m.tool);
        U.rv = { say: t("rival.buys", { tool: nm }), sub: t("rival.pays", { n: c, what: toolText(m.tool, true) }), tool: m.tool, pop: pop(t("rival.popBuys", { tool: nm }), toolChip(m.tool)) };
        render(); SFX.buy(); await sleep(1600);
        KF.botDo(m); rvLine("buy", t("rival.lineBuy", { tool: nm, n: c })); g.lastBot = stripTags(t("rival.lineBuy", { tool: nm, n: c }));
      } else if (m.type === "cure") {
        const isRoyal = m.k === "royal", pt = isRoyal ? KF.royalStage(1) : g.village[m.k]; if (!isRoyal) U.sel = m.k;
        const pay0 = isRoyal ? 0 : payNow(pt), gift0 = !isRoyal && RU().gifts.enabled ? pt.gift : null;
        const cards = m.seq.map((r) => cardAt(r.g, r.i, b));
        U.rv = { say: t(isRoyal ? "rival.brewsRoyal" : "rival.brewsFor", { name: esc(whoOf(pt)) }), sub: isRoyal ? t("royal.tag", { n: b.royal.stage + 1, of: b.royal.stages.length }) : t("rival.worth", { ailment: esc(ailOf(pt)), n: pay0 }), chips: [] };
        U.bo = { pt, trail: [[0, 0]], pos: [0, 0], rival: true };
        render(); SFX.select(); await sleep(800);
        let pos = [0, 0], trail = [[0, 0]], n = 0;
        for (let j = 0; j < m.seq.length; j++) {
          const r = m.seq[j], c = cards[j];
          U.rv.chips.push(chipFor(c, r.opt, j + 1, { f: r.f, cls: "rv" + (r.g ? " gd" : "") }));
          const extras = [r.g === "w" ? t("rival.fromWard") : r.g && r.i >= 0 ? t("rival.fromGarden") : "", r.echo ? t("rival.echo") : "", ...KF.toolsOfBits(r.f || 0).map(toolName)].filter(Boolean);
          U.rv.sub = esc(cardName(c)) + (extras.length ? " · " + extras.map(esc).join(" · ") : "");
          U.bo.trail = trail; U.bo.pos = pos; render(); SFX.play();
          await sleep(320);
          const s = KF.stepCells(pt, pos, r.opt);
          trail = await walk(pt, trail, s.trail, { rival: true, stepBase: n }); n += s.trail.length; pos = s.pos;
          await sleep(140);
        }
        const bonus = (KF.replay(pt, m.seq).bonus ? KF.limit(1, "sakuraBonus") : 0) + (pt.claim && pt.claim.p === 1 ? KF.claimBonus(1) : 0);
        U.bo.trail = trail; U.bo.pos = pos;
        if (isRoyal) {
          const last = b.royal.stage + 1 >= b.royal.stages.length, pay = b.royal.pay, n = b.royal.stage + 1, of = b.royal.stages.length;
          U.rv.say = t(last ? "rival.royalDone" : "rival.royalStage", { name: esc(whoOf(pt)), n, of }); U.rv.sub = last ? t("rival.gains", { n: pay }) : t("royal.stageSub", { n: pay });
          render(); stampBoard("cured", true); SFX.cure(); await sleep(1500);
          KF.botDo(m); U.bo = null;
          const line = t(last ? "rival.lineRoyalDone" : "rival.lineRoyal", { name: esc(whoOf(pt)), n, of, pay });
          rvLine("cure", line); g.lastBot = stripTags(line);
        } else {
        U.rv.say = t("rival.cures", { name: esc(whoOf(pt)) }); U.rv.sub = t("rival.gains", { n: pay0 }) + (bonus ? " · " + t("rival.sakura", { n: bonus }) : "") + (gift0 ? " · " + t("gifts." + gift0 + ".short", { n: gift0 === "mon" ? RU().gifts.mon : RU().gifts.draw }) : "");
        render(); stampBoard("cured", true); SFX.cure();
        await sleep(1500);
        KF.botDo(m); U.bo = null;
        rvLine("cure", t("rival.lineCure", { name: esc(whoOf(pt)), n: pay0 + bonus }));
        g.lastBot = stripTags(t("rival.lineCure", { name: whoOf(pt), n: pay0 + bonus }));
        }
        if (U.sel >= g.village.length) U.sel = 0;
      } else if (m.type === "known") {
        const pt = g.village[m.k], wi = KF.knownFor(1, m.k), via = b.ward[wi], pay = KF.knownPay(pt); U.sel = m.k;
        U.rv = { say: t("rival.knows", { ailment: esc(ailOf(pt).toLowerCase()) }), sub: t("rival.knowsSub", { name: esc(whoOf({ who: via.who }, true)) }), pop: pop(t("rival.popKnows", { name: esc(whoOf(pt, true)) }), `<div class="rvcards">${ptPortrait(pt, "rvpt")}</div>`) };
        render(); SFX.select(); await sleep(1100);
        U.rv.say = t("rival.cures", { name: esc(whoOf(pt)) }); U.rv.sub = t("rival.gains", { n: pay });
        render(); stampBoard("cured", true); SFX.cure(); await sleep(1300);
        KF.botDo(m);
        rvLine("cure", t("rival.lineKnown", { name: esc(whoOf(pt)), n: pay })); g.lastBot = stripTags(t("rival.lineKnown", { name: whoOf(pt), n: pay }));
        if (U.sel >= g.village.length) U.sel = 0;
      } else if (m.type === "gather") {
        const cs = m.idx.map((i) => g.market[i]);
        U.taking = m.ids;
        U.rv = { say: t("rival.takes", { n: cs.length }), sub: cs.map((c) => esc(cardName(c))).join(", "), pop: pop(t("rival.popTakes", { n: cs.length }), `<div class="rvcards">${cs.map((c) => ingCard(c, { u: popU(cs.length), noAnim: true, static: true })).join("")}</div>`) };
        render(); SFX.gather(); await sleep(1700);
        KF.botDo(m); U.taking = null;
        const names = cs.map((c) => cardName(c)).join(", ");
        rvLine("gather", t("rival.lineTake", { cards: esc(names) })); g.lastBot = stripTags(t("rival.lineTake", { cards: names }));
      } else if (m.type === "blind") {
        U.rv = { say: t("rival.drawsBlind", { n: m.n }), sub: t("rival.fromDeck"), pop: pop(t("rival.popBlind", { n: m.n }), `<div class="rvcards">${Array.from({ length: m.n }, () => `<span class="cback">${art("emblem")}</span>`).join("")}</div>`) };
        render(); SFX.blind(); await sleep(1300);
        KF.botDo(m); rvLine("blind", t("rival.lineBlind", { n: m.n })); g.lastBot = stripTags(t("rival.lineBlind", { n: m.n }));
      } else if (m.type === "claim") {
        const pt = g.village[m.k]; U.sel = m.k;
        U.rv = { say: t("rival.claims", { name: esc(whoOf(pt)), oni: ic("oni") }), sub: t("rival.claimsSub"), pop: pop(t("rival.popClaims", { name: esc(whoOf(pt, true)) }), `<div class="rvcards">${ptPortrait(pt, "rvpt")}<span class="rvoni">${oniArt(1)}</span></div>`) };
        render(); await sleep(500); SFX.curse(); stampBoard("oni", true);
        KF.botDo(m); render(); await sleep(1300);
        rvLine("curse", t("rival.lineClaim", { name: esc(whoOf(pt)) })); g.lastBot = stripTags(t("rival.lineClaim", { name: whoOf(pt) }));
      } else if (m.type === "swap") {
        const gave = b.hand[m.hi], got = g.market[m.mi];
        U.rv = { say: t("rival.trades"), sub: t("rival.tradesSub", { gave: esc(cardName(gave)), got: esc(cardName(got)) }), pop: pop(t("rival.popTrades"), `<div class="rvcards">${ingCard(gave, { u: popU(2.4), noAnim: true, static: true })}<b class="sw">⇄</b>${ingCard(got, { u: popU(2.4), noAnim: true, static: true })}</div>`) };
        render(); SFX.gather(); await sleep(1400);
        KF.botDo(m); rvLine("gather", t("rival.lineTrade", { gave: esc(cardName(gave)), got: esc(cardName(got)) }));
      } else if (m.type === "plant") {
        const c = b.hand[m.hi];
        U.rv = { say: t("rival.plants"), sub: t("rival.plantsSub", { card: esc(cardName(c)) }), pop: pop(t("rival.popPlants"), `<div class="rvcards">${ingCard(c, { u: 1.6, noAnim: true, static: true })}</div>`) };
        render(); SFX.plant(); await sleep(1300);
        KF.botDo(m); rvLine("plant", t("rival.linePlant", { card: esc(cardName(c)) }));
      }
      U.rv = { say: t("rival.turn"), sub: t("rival.thinking"), think: true };
      render(); await sleep(450);
    }
    const r = KF.endTurn(); U.busy = false; U.rv = null; U.bo = null; U.taking = null; U.speed = 1;
    (G().lapsed || []).forEach((x) => rvLine("curse", t("rival.lineLapse", { name: esc(whoOf({ who: x.who })), n: x.n })));
    if (G().left) rvLine("leave", leftLine(G().left));
    if (r === "over") return showOver();
    render();
    SFX.yourTurn();
    const lines0 = U.botLines.length;
    const lines = U.botLines.length ? U.botLines.map((l) => `<li><i>${ic("log." + l.k) || "·"}</i>${l.text}</li>`).join("") : `<li><i>…</i>${t("rival.passed")}</li>`;
    announce(`<div class="rvhead">${portrait(1, "rvface")}<div><div class="who">${t("rival.whatItDid")}</div>${guildOf(1) ? `<small class="rvg">${crest(1, "rvcr")}${esc(guildName(guildOf(1)))}</small>` : ""}</div></div><ul class="rvlist">${lines}</ul>${rivalRecap()}<h3 class="yt">${t("status.yourTurn")}</h3>`, 5200 + lines0 * 700, null);
  }
  // after their turn: what they now hold, so you don't have to open their table
  function rivalRecap() {
    const b = bot(), g = G(), mini = (cs) => cs.map((c) => ingCard(c, { u: 0.42, noAnim: true, static: true })).join("");
    const row = (label, body) => `<div class="rr"><span class="cap">${label}</span><div class="rc">${body}</div></div>`;
    const hand = openHands() ? mini(b.hand) || `<span class="none">${t("table.none")}</span>` : `<span class="none">${t("table.hidden", { n: b.hand.length })}</span>`;
    const ward = (b.ward || []).filter((w) => KF.wardLeft(w) && !w.spent);
    const tools = RU().toolIds.filter((id) => b.tools[id]).map((id) => `<span class="rt">${toolPic(id)}${esc(toolName(id))}</span>`).join("");
    const claims = g.village.filter((pt) => pt.claim && pt.claim.p === 1).map((pt) => `<span class="rt">${ptPortrait(pt, "rtp")}${esc(whoOf(pt, true))}</span>`).join("");
    return `<div class="recap">
      ${row(t("table.hand"), hand)}
      ${row(t("table.garden"), mini(b.garden) || `<span class="none">${t("table.none")}</span>`)}
      ${RU().ward.enabled ? row(t("table.ward"), ward.length ? mini(ward.map(KF.wardCard)) : `<span class="none">${t("table.none")}</span>`) : ""}
      ${row(t("table.tools"), tools || `<span class="none">${t("table.none")}</span>`)}
      ${row(t("table.oni"), `<span class="ro">${Array.from({ length: b.oni }, () => oniArt(1)).join("") || `<span class="none">${t("table.none")}</span>`}</span>`)}
      ${claims ? row(t("table.claims"), claims) : ""}
      ${b.royal ? row(t("table.royal"), `<span class="rt">${ptPortrait(b.royal.stages[0], "rtp")}${esc(whoOf({ who: b.royal.who }, true))} · ${t("royal.progress", { n: Math.min(b.royal.stage, b.royal.stages.length), of: b.royal.stages.length })}</span>`) : ""}</div>`;
  }
  // a patient who waited too long went home at the end of the round
  const leftLine = (pt) => t(KF.quirk(pt) === "contagious" ? "bench.leftContagious" : "bench.left", { name: esc(whoOf(pt)), n: RU().quirks.contagious });
  function showOver() {
    U.busy = false; U.rv = null; U.bo = null; render();
    const w = G().winner; if (w === "you") SFX.win(); else if (w === "rival") SFX.lose(); else SFX.cure();
    const q = G().quest;
    // hardcore: a lost stop ends the journey; back to the first town with an empty chest
    if (q && w !== "you" && PREFS.questHard && !q.lost) { q.lost = true; PREFS.questDone = 0; PREFS.chest = []; savePrefs(); KF.save(); }
    if (q && w === "you" && !q.won) { q.won = true; if (q.n < (PREFS.questDone || 0)) q.reward = false; PREFS.questDone = Math.max(PREFS.questDone || 0, q.n + 1); savePrefs(); KF.save(); }
    openSheet({ type: "over", modal: true, quiet: true });
  }
  function endMyTurn() {
    if (me().hand.length > KF.limit(0, "handLimit")) return openSheet({ type: "discard", modal: true, sel: [] });
    finishMyTurn();
  }
  function finishMyTurn() {
    resetRoute(); U.mkt = []; U.tab = "hand"; closeSheet();
    SFX.endTurn();
    const r = KF.endTurn();
    if (r === "over") return showOver();
    render();
    const lp = G().lapsed || [], gone = G().left;
    const msg = lp.map((x) => `<h3>${t("toast.lapse", { name: esc(whoOf({ who: x.who })) })}</h3><p>${t("toast.lapseSub", { n: x.n })}</p>`).join("") + (gone ? `<h3>${leftLine(gone)}</h3>` : "");
    if (msg) { SFX.bad(); return announce(msg, 2600, runBot); }
    runBot();
  }

  // ---------- my moves ----------
  // a passing word in the brew row; a warning clears itself after a few seconds
  let sayT = 0;
  function say(msg, bad) { U.msg = msg; U.msgBad = !!bad; render(); clearTimeout(sayT); if (bad) sayT = setTimeout(() => { if (U.msg === msg) { U.msg = null; render(); } }, 3500); }
  function shakeBoard(msg) { U.shake = true; SFX.bad(); say(msg, true); if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {} }
  function tapIngredient(g, i) {
    if (G().cur !== 0 || U.busy) return say(t("msg.waitTurn"), true);
    if (!curPt()) return;
    if (KF.barred(0, curPt())) return shakeBoard(t("status.claimedByRival"));
    const ban = banOf(g, cardAt(g, i)); if (ban) return shakeBoard(t("status.quirk." + ban));
    if (U.mkt.length) U.mkt = [];
    U.msg = null;
    const p = U.pend;
    if (p && p.g === g && p.i === i) return isPick(cardAt(g, i)) ? turnAny() : commitPend();
    if (U.pend && U.pend.g === "w" && g !== "w") U.pend = null;
    U.pend = { g, i, dir: null };
    const c = cardAt(g, i);
    SFX.tap(c.el);
    // a kitsune or a leap starts on the way that gets closest to the cure
    if (isPick(c)) { const rs = routeState(); let best = null; for (const d of pickWays(c)) { const s = KF.stepCells(rs.pt, rs.rp.pos, [d]); if (s.fail) continue; const dd = KF.md(s.pos, rs.pt.t); if (!best || dd < best.dd) best = { d, dd }; } U.pend.dir = best ? best.d : null; }
    render();
  }
  // turn a kitsune's step or a leap to its next way, clockwise
  function turnAny() {
    const p = U.pend; if (!p) return;
    const order = pickWays(cardAt(p.g, p.i));
    const k = p.dir ? order.findIndex((v) => v[0] === p.dir[0] && v[1] === p.dir[1]) : -1;
    p.dir = order[(k + 1) % order.length].slice(); U.msg = null; SFX.tap("V"); render();
  }
  async function commitPend() {
    const steps = pendSteps(); if (!steps) return say(t("msg.pickDirFirst"), true);
    const pt = curPt(), rs = routeState(), s = KF.stepCells(pt, rs.rp.pos, steps);
    if (s.fail) return shakeBoard(s.fail === "oni" ? t("status.hitsOni", { oni: ic("oni") }) : t("status.offMap"));
    const before = rs.rp.trail, stepBase = before.length - 1;
    U.route.push({ g: U.pend.g, i: U.pend.i, opt: steps, f: pendFlags() });
    U.pend = null; U.turnSel = {}; U.msg = null;
    U.anim = true; U.bo = { pt, trail: before, pos: rs.rp.pos };
    render(); SFX.play();
    await walk(pt, before, s.trail, { stepBase });
    const played = cardAt(U.route[U.route.length - 1].g, U.route[U.route.length - 1].i); sparkAt(played && played.el !== "V" ? played.el : "V");
    U.bo = null; U.anim = false;
    if (routeState().ready) SFX.sakura();
    render();
  }
  async function doBrew() {
    const rs = routeState(); if (!rs || !rs.ready || !canAct()) return;
    const route = U.route.map(({ g, i, opt, f }) => ({ g, i, opt, f }));
    const err = KF.checkRoute(0, selKey(), route); if (err) return say(t("errors." + err), true);
    U.anim = true; stampBoard("cured"); SFX.cure();
    if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch (e) {}
    await sleep(1200);
    if (U.sel === ROYAL) {
      // a royal stage: progress now, the payout only once every stage is done
      const res = KF.doRoyal(0, route), ro = me().royal;
      G().pending = { pt: res.pt, royal: { stage: ro.stage, of: ro.stages.length, done: res.done, pay: ro.pay }, gain: res.pay, sak: 0, kept: 0 }; G().phase = "reward";
      if (res.done) U.sel = 0;
    } else {
      const res = KF.doCure(0, U.sel, route);
      G().pending = { pt: res.pt, sak: res.sak, kept: res.kept, spot: res.spot || 0, fee: res.fee || 0, gift: res.gift, gain: res.pt.val + res.sak + res.kept + (res.spot || 0) + (res.fee || 0) + (res.gift === "mon" ? RU().gifts.mon : 0), arrived: res.arrived }; G().phase = "reward";
    }
    resetRoute(); U.mkt = []; U.anim = false;
    render(); SFX.fame(); openSheet({ type: "reward", modal: true, quiet: true });
  }
  async function doKnown() {
    if (!canAct() || KF.knownFor(0, U.sel) < 0) return;
    U.anim = true; stampBoard("cured"); SFX.cure(); await sleep(1200);
    const res = KF.doKnownCure(0, U.sel);
    G().pending = { pt: res.pt, sak: 0, kept: res.kept, gain: res.pay + res.kept, known: res.via.who, arrived: res.arrived }; G().phase = "reward";
    resetRoute(); U.mkt = []; U.anim = false;
    render(); SFX.fame(); openSheet({ type: "reward", modal: true, quiet: true });
  }
  function resolveReward() { const g = G(); g.pending = null; g.phase = "main"; closeSheet(); render(); }
  // lay one of your oni on the patient on the board
  async function doClaim() {
    const pt = curPt(); if (!pt || !KF.canClaim(0, U.sel)) return;
    U.anim = true; SFX.curse(); stampBoard("oni"); await sleep(500);
    KF.claim(0, U.sel); U.anim = false; render();
    announce(`<div class="who y">${t("status.yourTurn")}</div><h3>${t("toast.youClaim", { name: esc(whoOf(pt)) })}</h3><p>${t("toast.youClaimSub", { n: KF.claimBonus(0) })}</p>`, 2600, null);
  }

  function onClick(e) {
    const tg = e.target.closest("[data-a]");
    // during the rival's turn a tap anywhere on the table speeds it up
    if (U.busy && G() && G().cur === 1 && !e.target.closest("#shl") && !(tg && /^(menu|rules|log|rival|sound|close|scrim)$/.test(tg.dataset.a))) { if (U.speed === 1) { U.speed = 0.35; render(); } return; }
    if (!tg || tg.disabled) return;
    if (U.anim && !tg.closest("#shl")) return;
    const a = tg.dataset.a, i = tg.dataset.i, g = G(), s = U.sheet;
    switch (a) {
      case "scrim": if (e.target === tg) closeSheet(); return;
      case "close": closeSheet(); return;
      case "menu": openSheet({ type: "menu" }); return;
      case "themes": openSheet({ type: "themes" }); return;
      case "rules": openSheet({ type: "rules" }); return;
      case "log": openSheet({ type: "log" }); return;
      case "rival": openSheet({ type: "rival", p: 1 }); return;
      case "mytable": openSheet({ type: "rival", p: 0 }); return;
      case "tview": s.p = +i; SFX.tap("E"); renderSheet(); return;
      case "splash": U.screen = "title"; SFX.open(); render(); return;
      case "title": toTitle(); return;
      case "continue": resume(); return;
      case "quick": openQuick(); return;
      case "quickgo": if (s && s.who) { PREFS.who = Object.assign({}, s.who); savePrefs(); } startQuick(); return;
      case "opt": { const o = quickOpts(), k = tg.dataset.k; o[k] = k === "oni" ? i : +i; PREFS.opts = o; savePrefs(); SFX.toggle(); renderSheet(); return; }
      case "optt": { const o = quickOpts(), k = tg.dataset.k; o[k] = !o[k]; PREFS.opts = o; savePrefs(); SFX.toggle(); renderSheet(); return; }
      case "pickc": U.sheet.who.char = i; SFX.tap("V"); renderSheet(); return;
      case "pickg": { U.sheet.who.guild = +i; SFX.tap("E"); renderSheet(); return; }
      case "quest": openSheet({ type: "quest", sel: Math.min(questDone(), QUEST.stops.length - 1) }); return;
      case "questmap": openSheet({ type: "quest", sel: +i }); return;
      case "qsel": s.sel = +i; SFX.tap("E"); renderSheet(); return;
      case "qstep": s.sel = Math.max(0, Math.min(Math.min(questDone(), QUEST.stops.length - 1), s.sel + +i)); SFX.tap("E"); renderSheet(); return;
      case "qgo": openSheet({ type: "arrive", i: +i, modal: true }); return;
      case "qbegin": startQuest(+i); return;
      case "qclose": if (!U.screen && g.over) openSheet({ type: "over", modal: true, quiet: true }); else closeSheet(); return;
      case "qhard": PREFS.questHard = !PREFS.questHard; savePrefs(); SFX.toggle(); renderSheet(); return;
      case "qrestart": PREFS.questDone = 0; PREFS.chest = []; savePrefs(); s.sel = 0; SFX.toggle(); renderSheet(); return;
      case "qchest": { const q = g && g.quest; if (!q || q.picked) return; q.picked = i; if ((PREFS.chest || []).length < chestSlots()) { q.kept = true; PREFS.chest = [...(PREFS.chest || []), i]; savePrefs(); } KF.save(); SFX.fame(); renderSheet(); return; }
      case "qdrop": { const q = g && g.quest; if (!q || !q.picked || q.kept) return; q.kept = true; if (i) PREFS.chest = [...(PREFS.chest || []).filter((x) => x !== i), q.picked]; savePrefs(); KF.save(); SFX.toggle(); renderSheet(); return; }
      case "hints": PREFS.hints = !PREFS.hints; savePrefs(); SFX.toggle(); render(); renderSheet(); return;
      case "steam": PREFS.steam = !PREFS.steam; savePrefs(); SFX.toggle(); setSteam(); renderSheet(); return;
      case "sound": SFX.set(!SFX.isOn()); if (U.sheet) renderSheet(); render(); return;
      case "theme": if (i === (CUR_THEME)) return; PREFS.theme = i; savePrefs(); loadTheme(i).then(() => { applyPlayerColor(); render(); renderSheet(); SFX.toggle(); }); return;
      case "lang": PREFS.lang = i; savePrefs(); loadLang(i).then(() => { render(); renderSheet(); }); return;
      case "installq": openSheet({ type: "install" }); return;
      case "install": if (deferredInstall) { const ev = deferredInstall; deferredInstall = null; ev.prompt(); (ev.userChoice || Promise.resolve({})).then((c) => { if (c.outcome === "accepted") installed = true; if (U.sheet && U.sheet.type === "install") renderSheet(); }); } return;
      case "fast": return;
      case "sel": { const k = +i; if (k !== U.sel) { U.sel = k; resetRoute(); SFX.select(); } render(); return; }
      case "mtools": U.mview = U.mview === "tools" ? null : "tools"; SFX.open(); render(); return;
      case "tab": U.tab = i; U.mview = null; if (i !== "market") U.mkt = []; U.msg = null; SFX.open(); render(); return;
      case "hand": tapIngredient(false, +i); return;
      case "garden": tapIngredient(true, +i); return;
      case "ward": tapIngredient("w", +i); return;
      case "known": doKnown(); return;
      case "claim": doClaim(); return;
      case "gview": { const v = i || (U.gview === "ward" ? "garden" : "ward"); if (v !== U.gview) { U.gview = v; SFX.open(); render(); } return; }
      case "dturn": turnAny(); return;
      case "pplay": if (U.pend) commitPend(); return;
      case "pcancel": U.pend = null; U.turnSel = {}; U.msg = null; SFX.cancel(); render(); return;
      case "chip": { U.route.length = +i; U.pend = null; U.msg = null; SFX.undo(); render(); return; }
      case "undo": U.route.pop(); U.msg = null; SFX.undo(); render(); return;
      case "clear": resetRoute(); SFX.cancel(); render(); return;
      case "ttool": { const n = KF.toolOpts(i).length, c = U.turnSel[i]; U.turnSel[i] = c == null ? 0 : c + 1 < n ? c + 1 : null; SFX.toggle(); render(); return; }
      case "stool": { const idx = +i; if (U.pend && U.pend.i === -1 - idx) { U.pend = null; SFX.cancel(); render(); return; } tapIngredient(true, -1 - idx); return; }
      case "brew": doBrew(); return;
      case "gather": U.tab = "market"; U.msg = null; resetRoute(); SFX.open(); render(); return;
      case "back": U.tab = "hand"; U.mkt = []; render(); return;
      case "mkt": {
        if (!canAct()) return say(G().cur !== 0 ? t("msg.waitTurn") : t("msg.actionUsed"), true);
        const k = +i, n = nTake(); resetRoute();
        if (U.mkt.includes(k)) U.mkt = U.mkt.filter((x) => x !== k); else if (U.mkt.length < n) U.mkt.push(k); else { U.mkt.shift(); U.mkt.push(k); }
        SFX.tap(g.market[k].el); render(); return;
      }
      case "take": { if (!canAct() || U.mkt.length !== nTake()) return; const taken = KF.gather(0, U.mkt); U.mkt = []; U.tab = "hand"; resetRoute(); SFX.gather(); render(); announce(`<div class="who y">${t("status.yourTurn")}</div><h3>${t("toast.youTake", { n: taken.length })}</h3><div class="mini">${taken.map((c) => ingCard(c, { u: 0.8, noAnim: true, static: true })).join("")}</div>`, 1300, null); return; }
      case "blind": { if (!canAct()) return; const got = KF.drawBlind(0); U.mkt = []; U.tab = "hand"; resetRoute(); SFX.blind(); render(); announce(`<div class="who y">${t("status.yourTurn")}</div><h3>${t("toast.youDraw", { n: got.length })}</h3><div class="mini">${got.map((c) => ingCard(c, { u: 0.8, noAnim: true, static: true })).join("")}</div>`, 1600, null); return; }
      case "plant": if (!myTurn() || g.turn.planted) return; if (!me().hand.length) return say(t("msg.nothingToPlant"), true); openSheet({ type: "plant", h: null, r: null }); return;
      case "trade": if (!KF.canSwap(0)) return; if (!me().hand.length) return say(t("trade.noHand"), true); openSheet({ type: "trade", h: null, m: null }); return;
      case "trh": s.h = +i; SFX.tap(me().hand[+i].el); renderSheet(); return;
      case "trm": s.m = +i; SFX.tap(g.market[+i].el); renderSheet(); return;
      case "trdo": { const got = g.market[s.m]; if (!KF.swapCard(0, s.h, s.m)) return; resetRoute(); U.mkt = []; closeSheet(); SFX.gather(); render(); announce(`<div class="who y">${t("status.yourTurn")}</div><h3>${t("trade.toast")}</h3><div class="mini">${ingCard(got, { u: 0.8, noAnim: true, static: true })}</div>`, 1300, null); return; }
      case "pl": s.h = +i; SFX.tap(me().hand[+i].el); renderSheet(); return;
      case "pr": s.r = +i; SFX.tap(me().garden[+i].el); renderSheet(); return;
      case "pldo": KF.plantCard(0, s.h, s.r); resetRoute(); closeSheet(); SFX.plant(); render(); return;
      case "tools": openSheet({ type: "tools" }); return;
      case "pview": { const pt = curPt(); if (pt) openSheet({ type: "pview", pt }); return; }
      case "trait": openSheet({ type: "trait", k: i, pt: curPt() }); return;
      case "buy": {
        if (!myTurn() || g.turn.bought) return;
        if (KF.buyTool(0, i)) { closeSheet(); SFX.buy(); render(); const eff = RU().toolDefs[i].effect; announce(`<div class="who y">${t("status.yourTurn")}</div><h3>${t("toast.bought", { tool: esc(toolName(i)) })}</h3><div class="row"><span class="ti paper">${toolPic(i)}</span><div class="res">${t("toast.paid", { n: KF.cost(i) })} ${toolText(i)}${eff === "turn" || eff === "stretch" || eff === "step" ? " " + t("toast.buttonUnderMap") : ""}</div></div>`, 2400, null); }
        return;
      }
      case "end": if (!myTurn() || !g.turn.acted) return; endMyTurn(); return;
      case "dc": { const k = +i, need = me().hand.length - KF.limit(0, "handLimit"); if (s.sel.includes(k)) s.sel = s.sel.filter((x) => x !== k); else if (s.sel.length < need) s.sel.push(k); SFX.tap(me().hand[k].el); renderSheet(); return; }
      case "dcdo": KF.discardFromHand(0, s.sel); finishMyTurn(); return;
      case "rdone": resolveReward(false); return;
    }
  }

  // ---------- install ----------
  // keep the browser's own install UI (no preventDefault) and also offer the saved prompt from the menu
  let deferredInstall = null, installed = false;
  const UA = navigator.userAgent;
  const isIOS = () => /iphone|ipad|ipod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => ["standalone", "fullscreen", "minimal-ui"].some((m) => window.matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
  function platform() {
    if (isIOS()) return "ios";
    if (/android/i.test(UA)) return "android";
    if (/firefox/i.test(UA)) return "firefox";
    if (/macintosh/i.test(UA) && /safari/i.test(UA) && !/chrome|chromium|edg/i.test(UA)) return "macsafari";
    return "desktop";
  }
  window.addEventListener("beforeinstallprompt", (e) => { deferredInstall = e; if (U.sheet && U.sheet.type === "install") renderSheet(); });
  window.addEventListener("appinstalled", () => { installed = true; deferredInstall = null; if (U.sheet && U.sheet.type === "install") renderSheet(); });

  // ---------- loading theme, language and rules ----------
  async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }
  const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
  function merge(a, b) { const out = Object.assign({}, a); Object.keys(b || {}).forEach((k) => { out[k] = isObj(a && a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; }); return out; }
  // read a theme and whatever it extends; every path is made relative to the page
  async function readTheme(url) {
    const abs = new URL(url, location.href);
    const th = await getJSON(abs.href);
    const fix = (p) => (p ? new URL(p, abs).href : p);
    const own = Object.assign({}, th);
    if (th.assets) { own.assets = {}; Object.keys(th.assets).forEach((k) => { if (!k.startsWith("_")) own.assets[k] = fix(th.assets[k]); }); }
    if (th.sprites) own.sprites = fix(th.sprites);
    if (th.stylesheet) own.stylesheet = fix(th.stylesheet);
    // textures and card faces: {"image": path, ...} objects, or element overrides given as a bare path
    ["textures", "cards"].forEach((grp) => {
      if (!th[grp]) return;
      own[grp] = JSON.parse(JSON.stringify(th[grp]));
      Object.values(own[grp]).forEach((o) => { if (!isObj(o)) return; Object.keys(o).forEach((k) => { if (k === "image" || /^[A-Z]$/.test(k)) o[k] = fix(o[k]); }); });
    });
    if (th.fonts) { own.fonts = JSON.parse(JSON.stringify(th.fonts)); Object.values(own.fonts).forEach((f) => { if (f.faces) Object.keys(f.faces).forEach((w) => { f.faces[w] = fix(f.faces[w]); }); }); }
    if (!th.extends) return own;
    const base = await readTheme(new URL(th.extends, abs).href);
    const out = merge(base, own); delete out.extends;
    // a child that brings its own art but no sprite sheet must not pick the parent's up
    if (th.assets && !th.sprites) out.sprites = base.sprites && Object.keys(th.assets).length ? null : base.sprites;
    return out;
  }
  let THEME_NAMES = {}, THEMES = {};
  // a theme's textures (page, paper, panel, sheet) and card faces (patient, board, ingredient, back) as CSS
  const SURF = { page: ".lacquer", paper: ".paper", panel: ".traybar,.tabs,.rivstrip", sheet: ".sheet.paper" };
  const CARDS = { patient: ".pc.paper", board: ".boardp.paper", ingredient: ".ic.paper", back: ".cback" };
  function surfaceCSS(th) {
    const one = (sel, o, img) => {
      const tile = o.size && o.size !== "cover" && o.size !== "contain";
      const under = o.tint ? `,linear-gradient(${o.tint},${o.tint})` : "";
      return `${sel}{background-image:url("${img}")${under};background-size:${o.size || "100% 100%"};background-repeat:${tile ? "repeat" : "no-repeat"};background-position:${o.position || "center"}${o.color ? `;background-color:${o.color}` : ""}}`;
    };
    const out = [];
    Object.entries(SURF).forEach(([k, sel]) => { const o = th.textures && th.textures[k]; if (isObj(o) && o.image) out.push(one(sel, o, o.image)); });
    Object.entries(CARDS).forEach(([k, sel]) => {
      const o = th.cards && th.cards[k]; if (!isObj(o)) return;
      if (o.image) out.push(one(sel, o, o.image));
      Object.keys(o).filter((e) => /^[A-Z]$/.test(e)).forEach((e) => out.push(one(`${sel}.el-${e}`, o, o[e])));
    });
    return out.join("\n");
  }
  const themeName = (k) => lookup("themeNames." + k) || THEME_NAMES[k] || k;
  const fontFaces = (th) => Object.values(th.fonts || {}).flatMap((f) => Object.entries(f.faces || {}).map(([w, src]) => `@font-face{font-family:"${f.family}";font-weight:${w};font-display:swap;src:url("${src}") format("woff2")}`)).join("\n");
  let CUR_THEME = null;
  async function loadTheme(id) {
    CUR_THEME = CFG.themes[id] ? id : CFG.theme;
    const url = CFG.themes[id] || CFG.themes[CFG.theme];
    const th = await readTheme(url);
    T = th;
    Object.keys(ASSET).forEach((k) => delete ASSET[k]); Object.keys(SPR).forEach((k) => delete SPR[k]);
    Object.assign(ASSET, th.assets || {});
    // sprite sheet: inline once so <use href="#id"> works everywhere
    let host = $("#sprites"); if (!host) { host = document.createElement("div"); host.id = "sprites"; host.setAttribute("aria-hidden", "true"); host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.prepend(host); }
    host.innerHTML = "";
    if (th.sprites) {
      try {
        const txt = await (await fetch(th.sprites)).text();
        host.innerHTML = txt;
        host.querySelectorAll("symbol[id]").forEach((sy) => {
          const name = Object.keys(ASSET).find((k) => "s-" + k.replace(/[^A-Za-z0-9_-]/g, "-") === sy.id);
          // only for assets that are SVGs: a theme that borrows a sheet but swaps in its own pictures keeps them
          if (name && /\.svg($|[?#])/.test(ASSET[name] || "")) SPR[name] = { id: sy.id, vb: sy.getAttribute("viewBox") };
        });
      } catch (e) { /* fall back to individual files */ }
    }
    // colours, fonts and element colours become CSS custom properties
    const vars = Object.entries(th.colors || {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `--${k}:${v}`);
    Object.entries(th.elements || {}).forEach(([k, v]) => { if (k.startsWith("_")) return; vars.push(`--${k}:${v.color}`, `--${k}i:${v.ink || v.color}`); if (k === "V") vars.push(`--Vs:${v.ink}`); });
    const fam = (f) => `"${f.family}",${f.fallback || "serif"}`;
    if (th.fonts && th.fonts.display) vars.push(`--serif:${fam(th.fonts.display)}`);
    if (th.fonts && th.fonts.body) vars.push(`--sans:${fam(th.fonts.body)}`);
    let st = $("#theme-style"); if (!st) { st = document.createElement("style"); st.id = "theme-style"; document.head.appendChild(st); }
    st.textContent = `${fontFaces(th)}\n:root{${vars.join(";")};color-scheme:${th.colorScheme || "dark"}}\n${surfaceCSS(th)}`;
    // an optional extra stylesheet for things colours alone can't change (backgrounds, spacing)
    let ln = $("#theme-css");
    if (th.stylesheet) {
      if (!ln) { ln = document.createElement("link"); ln.rel = "stylesheet"; ln.id = "theme-css"; st.after(ln); }
      if (ln.href !== th.stylesheet) await new Promise((ok) => { ln.onload = ln.onerror = ok; ln.href = th.stylesheet; });
    } else if (ln) ln.remove();
    if (SFX.kit) SFX.kit(th.sound);
    applyText();
    const meta = $('meta[name="theme-color"]'); if (meta && th.colors && th.colors.lacquer) meta.content = th.colors.lacquer;
    HC.clear();
  }
  async function loadLang(code) {
    const l = CFG.languages[code] ? code : CFG.language;
    let s = await getJSON(CFG.languages[l].file);
    // missing keys fall back to the default language
    if (l !== CFG.language) { try { s = merge(await getJSON(CFG.languages[CFG.language].file), s); } catch (e) {} }
    LANG_STR = s; LANG = l; document.documentElement.lang = l;
    try { PLURAL = new Intl.PluralRules(l); } catch (e) { PLURAL = null; }
    applyText();
  }
  // a theme may rename things for a language ("text": {"en": {...}}); it never needs every key
  let LANG_STR = null;
  function applyText() {
    if (!LANG_STR) return;
    const over = T && T.text && T.text[LANG];
    STR = over ? merge(LANG_STR, over) : LANG_STR;
    document.title = stripTags(t("app.title"));
  }
  let BASE_OPEN = true, BASE_END = 25, BASE_RULES = null, QUEST = null, QMAP = null;
  async function loadAll() {
    CFG = await getJSON("config.json");
    const langs = Object.keys(CFG.languages || {});
    const nav = (navigator.languages || [navigator.language || ""]).map((x) => x.toLowerCase().split("-")[0]);
    const lang = PREFS.lang && CFG.languages[PREFS.lang] ? PREFS.lang : nav.find((x) => langs.includes(x)) || CFG.language;
    // ?theme=<id> shows a theme without changing the saved choice (handy for screenshots and theme work)
    const qTheme = new URLSearchParams(location.search).get("theme");
    const themeId = qTheme && CFG.themes[qTheme] ? qTheme : PREFS.theme && CFG.themes[PREFS.theme] ? PREFS.theme : CFG.theme;
    const [rules] = await Promise.all([getJSON(CFG.rules || "rules.json"), loadLang(lang), loadTheme(themeId)]);
    // every theme, for the picker's previews (their fonts load only when a preview shows them)
    await Promise.all(Object.entries(CFG.themes).map(async ([k, u]) => { try { THEMES[k] = await readTheme(u); THEME_NAMES[k] = THEMES[k].name || k; } catch (e) { THEME_NAMES[k] = k; } }));
    let pf = $("#theme-faces"); if (!pf) { pf = document.createElement("style"); pf.id = "theme-faces"; document.head.appendChild(pf); }
    pf.textContent = Object.values(THEMES).map(fontFaces).join("\n");
    const counts = { names: list("content.patients").length || 1, ailments: list("content.ailments").length || 1, ingredientNames: Math.max(1, ...Object.keys(rules.deck.elements).map((el) => list("content.ingredients." + el).length)) };
    // the designed patient deck and the royals
    let pdata = null; if (CFG.patients) try { pdata = await getJSON(CFG.patients); } catch (e) { console.warn(e); }
    KF.configure(rules, counts, pdata && pdata.deck, pdata && pdata.royals);
    BASE_OPEN = !!rules.openHands; BASE_END = rules.endFame; BASE_RULES = rules;
    QUEST = null; if (CFG.quest && CFG.questOn !== false) try { QUEST = await getJSON(CFG.quest); } catch (e) { console.warn(e); }
    QMAP = null; if (QUEST && QUEST.map && QUEST.map.svg) try { QMAP = await readQuestMap(new URL(QUEST.map.svg, new URL(CFG.quest, location.href)).href); } catch (e) { console.warn(e); }
  }

  // ---------- boot ----------
  // you: the remembered choice (or a random one); rival: a different character and guild, the theme's rival colour
  function pickPlayers() {
    const chars = CHARS(), gs = GUILDS(), w = PREFS.who || {};
    const rnd = (n) => Math.floor(Math.random() * n);
    const mine = chars.find((c) => c.id === w.char) || (chars.length ? chars[rnd(chars.length)] : null);
    const others = chars.filter((c) => !mine || c.ability !== mine.ability);
    const theirs = others.length ? others[rnd(others.length)] : null;
    const myG = w.guild != null && w.guild < gs.length ? w.guild : gs.length ? rnd(gs.length) : null;
    const gOther = gs.map((_, i) => i).filter((i) => i !== myG);
    const rg = gOther.length ? gOther[rnd(gOther.length)] : null;
    return [{ ability: mine ? mine.ability : null, guild: myG, gel: myG != null && gs[myG] ? gs[myG].element || null : null, color: myG != null ? guildColor(gs[myG]) : null },
            { ability: theirs ? theirs.ability : null, guild: rg, gel: rg != null && gs[rg] ? gs[rg].element || null : null, color: null }];
  }
  function openQuick() {
    const chars = CHARS(), gs = GUILDS(), w = Object.assign({}, PREFS.who || {});
    if (!chars.find((c) => c.id === w.char)) w.char = chars.length ? chars[0].id : null;
    if (w.guild == null || w.guild >= gs.length) w.guild = gs.length ? 0 : null;
    openSheet({ type: "quick", who: w });
  }
  // quiet: set the table up behind the first-run setup sheet, without the "you go first" toast or the rival moving
  // q: a quest stop to play ({ settings, players, quest }) instead of a free game with the house rules
  function startNew(quiet, q) {
    const settings = {}; if (PREFS.openHands != null) settings.openHands = !!PREFS.openHands; if (PREFS.endFame) settings.endFame = PREFS.endFame;
    KF.newGame(q ? q.settings : settings, q ? q.players : pickPlayers()); if (q) { G().quest = q.quest; G().P[1].fame += q.headStart || 0; } applyPlayerColor(); HC.clear(); U.seen.clear(); U.lastFame = [0, 0]; U.sel = 0; U.tab = "hand"; U.mkt = []; resetRoute(); U.busy = false; U.anim = false; U.bo = null; U.rv = null;
    if (quiet) G().unplayed = true;
    render(); if (quiet) return; SFX.newGame();
    const first = G().first === 0;
    const qn = G().quest ? G().quest.n : null;
    announce(`<div class="who${first ? " y" : ""}">${qn != null ? t("quest.toast", { n: qn + 1, place: esc(stopName(qn)) }) : t("toast.newGame")}</div><h3>${t(first ? "toast.youFirst" : "toast.rivalFirst")}</h3><div class="res">${t("toast.goal", { n: RU().endFame })}</div>`, 1800, () => { if (!first) runBot(); });
  }
  // ---------- quest: the journey to Edo ----------
  const questDone = () => Math.min(PREFS.questDone || 0, QUEST ? QUEST.stops.length : 0);
  const stopText = (i) => (list("quest.stops")[i] || {});
  const stopName = (i) => stopText(i).name || (QUEST && QUEST.stops[i] ? QUEST.stops[i].id : "");
  function startQuest(i) {
    const st = QUEST && QUEST.stops[i]; if (!st) return;
    const players = pickPlayers(); players[1].style = Object.assign({}, st.rival || {});
    const ch = chestBoosts(); players[0].mods = ch.mods; players[0].tools = ch.tools;
    if (st.rival && st.rival.mods) players[1].mods = Object.assign({}, st.rival.mods);
    U.screen = null; closeSheet(); startNew(false, { settings: JSON.parse(JSON.stringify(st.rules || {})), players, quest: { n: i }, headStart: (st.rival && st.rival.headStart) || 0 });
  }
  // what is different at a stop, in words, from its rules and how the rival plays
  function questTags(st) {
    const r = merge(BASE_RULES, st.rules || {}), rv = st.rival || {}, p = r.patients || {};
    const out = [t("quest.tags.goal", { n: r.endFame }), t("quest.tags.depth" + Math.max(2, Math.min(5, rv.depth || 5)))];
    if (r.toolShop === false) out.push(t("quest.tags.noShop"));
    if (r.claims === false) out.push(t("quest.tags.noClaims"));
    if (p.tiers && p.tiers.length < 3) out.push(t("quest.tags.tiers" + Math.max(...p.tiers)));
    if (rv.greedy) out.push(t("quest.tags.greedy"));
    if (rv.headStart) out.push(t("quest.tags.headStart", { n: rv.headStart }));
    if (rv.mods) out.push(t("quest.tags.rivalChest", { n: Object.values(rv.mods).reduce((x, v) => x + v, 0) }));
    if (!r.openHands) out.push(t("quest.tags.hidden"));
    return out;
  }
  // ---------- the medicine chest: one reward per stop won, kept for the whole journey ----------
  const chestSlots = () => (QUEST && QUEST.chest && QUEST.chest._slots) || 3;
  const chestIds = () => (QUEST && QUEST.chest ? Object.keys(QUEST.chest).filter((k) => !k.startsWith("_")) : []);
  function chestBoosts() {
    const mods = {}, tools = [];
    (PREFS.chest || []).forEach((id) => { const c = QUEST && QUEST.chest && QUEST.chest[id]; if (!c) return; Object.entries(c.mods || {}).forEach(([k, v]) => { mods[k] = (mods[k] || 0) + v; }); if (c.tool) tools.push(c.tool); });
    return { mods, tools };
  }
  // three rewards you don't have yet, the same every time you look (seeded by the stop)
  function chestOffer(n) {
    const own = new Set(PREFS.chest || []), pool = chestIds().filter((id) => !own.has(id) && !id.startsWith("_"));
    let x = (n + 1) * 2654435761 >>> 0; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  }
  const chestItem = (id, on) => `<button class="chest${on ? " on" : ""}" data-a="qchest" data-i="${id}" aria-pressed="${!!on}"><b>${t("chest." + id + ".name")}</b><small>${t("chest." + id + ".text")}</small></button>`;
  // the map's land: only the viewBox and the land/border path data are taken from the file
  async function readQuestMap(url) {
    const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const doc = new DOMParser().parseFromString(await r.text(), "image/svg+xml"), svg = doc.querySelector("svg");
    const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    const paths = [...doc.querySelectorAll("path.land,path.border")].map((p) => ({ cls: p.getAttribute("class"), d: p.getAttribute("d") || "" })).filter((p) => /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/.test(p.d));
    return vb.length === 4 && vb.every(isFinite) ? { vb, paths } : null;
  }
  // the road on the map: travelled stops filled, the next one ringed, the chosen one marked
  // o.focus: zoom in on the last leg of the road, from the stop before to this one, walked as you watch
  // where a stop sits on the map: [longitude, latitude]; a theme can lay its own road (questAt, one per stop)
  const AT = (st) => { const i = QUEST.stops.indexOf(st); return (T.questAt && T.questAt[i]) || st.at; };
  function questMap(sel, o = {}) {
    const P = QUEST.map.project, stops = QUEST.stops, done = questDone();
    const X = (a) => P.x[0] * a[0] + P.x[1] * a[1] + P.x[2], Y = (a) => P.y[0] * a[0] + P.y[1] * a[1] + P.y[2];
    const pt = (a) => `${X(a).toFixed(1)},${Y(a).toFixed(1)}`;
    let vb = QMAP && QMAP.vb;
    if (!vb) { const xs = stops.map((st) => X(AT(st))), ys = stops.map((st) => Y(AT(st))), pad = 0.12 * (Math.max(...ys) - Math.min(...ys)); vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad]; }
    // a road that runs off the drawing (a theme's own stops) widens the view to take it in
    { const xs = stops.map((st) => X(AT(st))), ys = stops.map((st) => Y(AT(st))), pad = 0.06 * vb[3];
      const x0 = Math.min(vb[0], Math.min(...xs) - pad), y0 = Math.min(vb[1], Math.min(...ys) - pad), x1 = Math.max(vb[0] + vb[2], Math.max(...xs) + pad), y1 = Math.max(vb[1] + vb[3], Math.max(...ys) + pad);
      vb = [x0, y0, x1 - x0, y1 - y0]; }
    const full = vb;
    if (o.focus) {
      const a = AT(stops[Math.max(0, sel - 1)]), b = AT(stops[sel]), cx = (X(a) + X(b)) / 2, cy = (Y(a) + Y(b)) / 2;
      const h = Math.max(Math.abs(Y(a) - Y(b)) * 2.4, Math.abs(X(a) - X(b)) * 2.4 / (o.focus || 2), full[3] * 0.3), w = h * (o.focus || 2);
      vb = [cx - w / 2, cy - h / 2, w, h];
    }
    const u = o.focus ? vb[3] / 90 : vb[2] / 170;
    const road = stops.map((st) => pt(AT(st))).join(" "), walked = stops.slice(0, Math.min(done + 1, stops.length)).map((st) => pt(AT(st))).join(" ");
    const dots = stops.map((st, i) => {
      const [x, y] = [X(AT(st)), Y(AT(st))], open = i <= done, cls = i < done ? "done" : i === done ? "next" : "ahead";
      const dot = `<circle class="qd ${cls}${i === sel ? " sel" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${((i === stops.length - 1 ? 5 : 3.4) * u).toFixed(2)}"/>`;
      return open ? `<g data-a="qsel" data-i="${i}"><title>${esc(stopName(i))}</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(9 * u).toFixed(1)}" fill="transparent"/>${dot}</g>` : dot;
    }).join("");
    const label = (i, dx, anchor) => { const st = stops[i]; return `<text class="ql" x="${(X(AT(st)) + dx * u).toFixed(1)}" y="${(Y(AT(st)) + 3.5 * u).toFixed(1)}" font-size="${(10 * u).toFixed(1)}" text-anchor="${anchor}">${esc(stopName(i))}</text>`; };
    if (o.focus) {
      const from = Math.max(0, sel - 1), leg = sel > 0 ? `<polyline class="leg" pathLength="1" points="${pt(AT(stops[from]))} ${pt(AT(stops[sel]))}"/>` : "";
      const back = stops.slice(0, from + 1).map((st) => pt(AT(st))).join(" ");
      const lab = (i, cls) => { const st = stops[i], right = X(AT(st)) < vb[0] + vb[2] * 0.5; return `<text class="ql ${cls}" x="${(X(AT(st)) + (right ? 7 : -7) * u).toFixed(1)}" y="${(Y(AT(st)) + 3.5 * u).toFixed(1)}" font-size="${(9 * u).toFixed(1)}" text-anchor="${right ? "start" : "end"}">${esc(stopName(i))}</text>`; };
      const dot = (i, cls) => `<circle class="qd ${cls}" cx="${X(AT(stops[i])).toFixed(1)}" cy="${Y(AT(stops[i])).toFixed(1)}" r="${((cls === "here" ? 4.6 : 3.2) * u).toFixed(2)}"/>`;
      return `<svg class="qmap focus" viewBox="${vb.map((v) => v.toFixed(1)).join(" ")}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${attr(t("quest.arrive.mapAria", { from: stopName(from), place: stopName(sel) }))}">
        ${QMAP ? QMAP.paths.map((p) => `<path class="${p.cls === "border" ? "border" : "land"}" d="${attr(p.d)}"/>`).join("") : ""}
        <polyline class="road" points="${road}"/>${sel > 0 ? `<polyline class="walked" points="${back}"/>` : ""}${leg}
        ${stops.map((_, i) => (i === sel ? "" : dot(i, i < sel ? "done" : "ahead"))).join("")}${dot(sel, "here")}
        ${sel > 0 ? lab(from, "from") : ""}</svg>`;
    }
    return `<svg class="qmap" viewBox="${vb.join(" ")}" role="img" aria-label="${attr(t("quest.map"))}">
      ${QMAP ? QMAP.paths.map((p) => `<path class="${p.cls === "border" ? "border" : "land"}" d="${attr(p.d)}"/>`).join("") : ""}
      <polyline class="road" points="${road}"/>${done ? `<polyline class="walked" points="${walked}"/>` : ""}
      ${dots}${label(0, -7, "end")}${label(stops.length - 1, 8, "start")}</svg>`;
  }
  async function boot() {
    $("#app").classList.add("lacquer"); // the table under the game, seen at the sides of a wide screen
    $("#stage").innerHTML = '<div id="scr"></div><div id="shl"></div><div id="tsl"></div>';
    // the steam drifts over the whole window, table edges included, not just the game in the middle
    $("#app").insertAdjacentHTML("beforeend", steamLayer());
    setSteam();
    try { await loadAll(); }
    catch (e) { $("#scr").innerHTML = `<div class="loadfail"><b>Kusurifuda could not load its files.</b><small>${esc(e.message)}</small></div>`; console.error(e); return; }
    const stage = $("#stage");
    stage.addEventListener("click", onClick);
    stage.addEventListener("pointerdown", swipeDown);
    stage.addEventListener("pointermove", swipeMove, { passive: false });
    stage.addEventListener("pointerup", swipeUp); stage.addEventListener("pointercancel", swipeUp);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && U.sheet && !U.sheet.modal) closeSheet();
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && canSwipe() && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) goPatient(e.key === "ArrowRight" ? 1 : -1);
    });
    window.addEventListener("resize", fit); window.addEventListener("orientationchange", () => setTimeout(fit, 150));
    const go = new URLSearchParams(location.search).get("go");
    if (go) try { history.replaceState(null, "", location.pathname); } catch (e) {}
    const g = KF.load();
    U.screen = go ? "title" : "splash";
    if (!g) startNew(true);
    applyPlayerColor(); fit(); render();
    if (go === "new") openQuick();
    else if (go === "rules") openSheet({ type: "rules" });
    else setTimeout(() => { if (U.screen === "splash") { U.screen = "title"; render(); } }, 2600);
  }
  window.KFUI = { U, render, boot, fit, t, resume, get T() { return T; }, get PREFS() { return PREFS; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
