/* Kusurifuda — rules engine.
   Pure game logic, no DOM and no text: every number comes from rules.json,
   and cards, patients and the log only hold ids that the UI translates.
   Exposes window.KF. */
(function () {
  "use strict";

  // ---------- rules ----------
  const DIRV = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const DEFAULT_COUNTS = { names: 32, ailments: 16, ingredientNames: 3 };
  let BASE = null, COUNTS = Object.assign({}, DEFAULT_COUNTS), DECK = null, ROYALS = null;
  let G = null; // current game; G.rules is the rules snapshot it was started with

  function normalise(r) {
    const t = (r.tools && r.tools.list) || {};
    const ids = Object.keys(t).filter((k) => !k.startsWith("_"));
    const tools = {};
    ids.forEach((id) => { tools[id] = Object.assign({ cost: 0, effect: "turn", turns: [1], amount: 3 }, t[id]); });
    const out = JSON.parse(JSON.stringify(r));
    out.toolIds = ids; out.toolDefs = tools;
    // tools that change how one card moves (flagged on that step): turn it, or stretch it a square longer or shorter
    out.turnTools = ids.filter((id) => tools[id].effect === "turn" || tools[id].effect === "stretch");
    out.stepTools = ids.filter((id) => tools[id].effect === "step");
    out.gatherTools = ids.filter((id) => tools[id].effect === "gather");
    out.copies = (r.tools && r.tools.copies != null) ? r.tools.copies : 1; // players - 1 with 2 players
    // board.size (even): the start is one of the four middle squares, fixed per patient
    out.S = (r.board && r.board.size) || 8;
    fillDefaults(out);
    out.players = 2;
    return out;
  }
  // settings added in later versions; also applied to games saved before they existed
  function fillDefaults(out) {
    out.patients = Object.assign({ ailmentKinds: null, requireElement: false }, out.patients);
    // the waiting bench: spots[0] is "last chance", the last spot "just arrived". min = ingredients needed, bonus = extra mon
    out.bench = Object.assign({ enabled: false, spots: [] }, out.bench);
    out.royal = Object.assign({ enabled: false, min: 3 }, out.royal);
    out.gifts = Object.assign({ enabled: false, mon: 2, draw: 2 }, out.gifts);
    out.quirks = Object.assign({ enabled: false, contagious: 2, force: null }, out.quirks);
    if (out.toolShop == null) out.toolShop = true;
    if (out.claims == null) out.claims = true;
    out.ward = Object.assign({ enabled: false, uses: 1 }, out.ward);
    out.knownCure = Object.assign({ enabled: false, payout: 0.5 }, out.knownCure);
    out.guilds = Object.assign({ echo: false }, out.guilds);
    out.abilities = out.abilities || {};
    return out;
  }
  // deck: a designed patient deck (patient objects with maps); royals: private multi-stage patients
  function configure(rules, counts, deck, royals) { BASE = normalise(rules); if (counts) COUNTS = Object.assign({}, DEFAULT_COUNTS, counts); DECK = deck || null; ROYALS = royals || null; }
  const RU = () => (G && G.rules) || BASE;
  // a player's own value for a rule: the rule plus whatever their character's ability adds
  // (rules.abilities.<id> = { gardenMax: 1, toolCost: -1, ... })
  const MODS = ["gardenMax", "handLimit", "startHand", "oniPerPlayer", "gather", "sakuraBonus", "toolCost", "startFame", "startGarden", "swap"];
  const ZERO_BASE = ["toolCost", "startFame", "startGarden", "swap"]; // abilities that add to nothing in the base rules
  function abilityOf(pi) { const p = G && G.P && G.P[pi]; const a = p && p.ability && RU().abilities && RU().abilities[p.ability]; return a || null; }
  function limit(pi, key, a) { const ab = a !== undefined ? a : abilityOf(pi), p = G && G.P && G.P[pi], m = (p && p.mods && p.mods[key]) || 0; return (ZERO_BASE.includes(key) ? 0 : RU()[key]) + ((ab && ab[key]) || 0) + m; }

  // ---------- helpers ----------
  const rnd = () => Math.random();
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rotR = ([x, y]) => [-y, x];
  const rotK = (v, k) => { let w = v; for (let i = 0; i < ((k % 4) + 4) % 4; i++) w = rotR(w); return w; };
  const md = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  // a patient's own board: pt.b = [xmin, xmax, ymin, ymax] around its start
  const inP = (pt, x, y) => x >= pt.b[0] && x <= pt.b[1] && y >= pt.b[2] && y <= pt.b[3];
  // how far a card reaches, for the bot's choices
  const reach = (c) => (c.steps ? c.steps.reduce((a, v) => a + Math.max(Math.abs(v[0]), Math.abs(v[1])), 0) : c.el === "V" ? 1.5 : 1);
  // which board directions a path uses, in the order it first uses them
  function dirsOf(steps) { const out = [], add = (d) => { if (!out.includes(d)) out.push(d); }; (steps || []).forEach(([x, y]) => { if (x) add(x > 0 ? "right" : "left"); if (y) add(y < 0 ? "up" : "down"); }); return out; }
  // element whose main direction is d
  const elOfDir = (d) => { const e = RU().deck.elements; return Object.keys(e).find((k) => e[k] === d) || null; };

  // ---------- cards & patients ----------
  function makeDeck() {
    // each element goes its own way, exactly 1, 2 or 3 squares; a pair of neighbouring elements goes diagonally
    const r = RU(), d = [], els = Object.keys(r.deck.elements), lens = (o) => Object.entries(o || {}).filter(([k]) => !k.startsWith("_"));
    els.forEach((el) => { const D = DIRV[r.deck.elements[el]]; lens(r.deck.straight).forEach(([n, copies]) => { for (let i = 0; i < copies; i++) d.push({ id: G.uid++, el, steps: Array.from({ length: +n }, () => D), n: +n - 1 }); }); });
    els.forEach((a, ai) => els.slice(ai + 1).forEach((b) => {
      const A = DIRV[r.deck.elements[a]], B = DIRV[r.deck.elements[b]], V = [A[0] + B[0], A[1] + B[1]]; if (!V[0] && !V[1]) return;
      lens(r.deck.diagonal).forEach(([n, copies]) => { for (let i = 0; i < copies; i++) d.push({ id: G.uid++, el: a, el2: b, diag: true, steps: [[V[0] * n, V[1] * n]], n: +n - 1 }); });
    }));
    for (let i = 0; i < r.deck.kitsune; i++) d.push({ id: G.uid++, el: "V", steps: null, n: 0 });
    return shuffle(d);
  }
  const isHaz = (pt, x, y) => pt.haz.some((h) => h[0] === x && h[1] === y);
  function bfsOK(pt) {
    const q = [[0, 0]], seen = new Set(["0,0"]);
    while (q.length) {
      const [x, y] = q.shift(); if (x === pt.t[0] && y === pt.t[1]) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + "," + ny; if (!inP(pt, nx, ny) || seen.has(k) || isHaz(pt, nx, ny)) continue; seen.add(k); q.push([nx, ny]); }
    }
    return false;
  }
  function makePatient(names) {
    const P = RU().patients, S = RU().S;
    for (;;) {
      // the start square: one of the four middle squares (coordinates are kept relative to it)
      const st = [Math.floor(rnd() * 2), Math.floor(rnd() * 2)], lo = -(S / 2 - 1), hi = S / 2;
      const b = [lo - st[0], hi - st[0], lo - st[1], hi - st[1]];
      const cellX = () => b[0] + Math.floor(rnd() * (b[1] - b[0] + 1)), cellY = () => b[2] + Math.floor(rnd() * (b[3] - b[2] + 1));
      let t; do { t = [cellX(), cellY()]; } while (md(t, [0, 0]) < P.minDistance || md(t, [0, 0]) > P.maxDistance);
      const h = P.oniMin + Math.floor(rnd() * (P.oniMax - P.oniMin + 0.6)), pt = { t, haz: [], bonus: null, b, s: st };
      const free = (x, y) => !(x === 0 && y === 0) && !(x === t[0] && y === t[1]) && !isHaz(pt, x, y) && !(pt.bonus && pt.bonus[0] === x && pt.bonus[1] === y);
      const x0 = Math.min(0, t[0]), x1 = Math.max(0, t[0]), y0 = Math.min(0, t[1]), y1 = Math.max(0, t[1]);
      let tries = 0;
      while (pt.haz.length < h && tries++ < 300) {
        let x, y;
        if (rnd() < 0.75) { x = x0 + Math.floor(rnd() * (x1 - x0 + 1)); y = y0 + Math.floor(rnd() * (y1 - y0 + 1)); } else { x = cellX(); y = cellY(); }
        if (free(x, y)) pt.haz.push([x, y]);
      }
      if (rnd() < P.sakuraChance) { let k = 0; while (!pt.bonus && k++ < 200) { const x = x0 - 1 + Math.floor(rnd() * (x1 - x0 + 3)), y = y0 - 1 + Math.floor(rnd() * (y1 - y0 + 3)); if (inP(pt, x, y) && free(x, y)) pt.bonus = [x, y]; } }
      if (!bfsOK(pt)) continue;
      pt.val = md(t, [0, 0]) - 1 + (pt.haz.length >= P.bonusAtOni ? P.bonusValue : 0);
      pt.who = names.length ? names.pop() : Math.floor(rnd() * COUNTS.names);
      pt.ail = G.ails && G.ails.length ? G.ails[Math.floor(rnd() * G.ails.length)] : Math.floor(rnd() * COUNTS.ailments);
      pt.id = G.uid++; pt.claim = null; pt.rot = 0;
      // element: one of the directions the cure lies in, weighted by how far; move: weighted from rules
      const cand = [[t[0] > 0 ? "right" : "left", Math.abs(t[0])], [t[1] < 0 ? "up" : "down", Math.abs(t[1])]].filter((c) => c[1] > 0);
      let roll = rnd() * cand.reduce((a, c) => a + c[1], 0), dir = cand[0][0];
      for (const [d, w] of cand) { if (roll < w) { dir = d; break; } roll -= w; }
      pt.el = elOfDir(dir) || "W";
      pt.mv = "knight";
      return pt;
    }
  }
  function rotatePatient(pt, k) {
    const f = (v) => rotK(v, k); pt.t = f(pt.t); pt.haz = pt.haz.map(f); if (pt.bonus) pt.bonus = f(pt.bonus); pt.rot = ((pt.rot || 0) + k) % 4;
    const cs = [[pt.b[0], pt.b[2]], [pt.b[1], pt.b[3]]].map(f);
    pt.b = [Math.min(cs[0][0], cs[1][0]), Math.max(cs[0][0], cs[1][0]), Math.min(cs[0][1], cs[1][1]), Math.max(cs[0][1], cs[1][1])];
    const c = rotK([2 * pt.s[0] - 1, 2 * pt.s[1] - 1], k); pt.s = [(c[0] + 1) / 2, (c[1] + 1) / 2];
  }
  function rotatedCopy(pt, k) { const c = JSON.parse(JSON.stringify(pt)); rotatePatient(c, k); return c; }

  // ---------- the ward: cured patients played as moves ----------
  // every ward patient leaps like a knight: 2 squares one way and 1 to the side, any way, landing only
  const wardCard = (w) => ({ id: "w" + w.id, el: w.el, ward: true, mv: "knight", who: w.who, art: w.art, steps: null, knight: true });
  const wardLeft = (w) => w.uses == null || w.uses < 0 || w.uses > 0;
  const EL4 = ["W", "F", "E", "A"], WILD = 16;
  const elBit = (el) => (el === "V" ? WILD : 1 << Math.max(0, EL4.indexOf(el)));
  const isAny = (c) => !!c && (c.el === "V" || !!c.any);
  const cardBits = (c) => elBit(c.el) | (c.el2 ? elBit(c.el2) : 0);
  const hasEl = (c, el) => c.el === el || c.el2 === el;
  // does this brew need an ingredient of the patient's element, and is it met?
  const needEl = (pt) => (RU().patients.requireElement && pt.el ? pt.el : null);
  const elMet = (pt, em) => { const n = needEl(pt); return !n || !!(em & (elBit(n) | WILD)); };
  const ECHO = 1 << 20;
  const echoEl = (p) => (RU().guilds.echo && p && p.gel ? p.gel : null);

  // ---------- claims ----------
  // an oni laid on a patient: the other player can't cure them until the claimer's next turn is over.
  // Cure them in time for a sakura bonus; let the claim lapse and the other player gets it instead
  const barred = (pi, pt) => !!(pt && pt.claim && pt.claim.p !== pi);
  const claimBonus = (pi) => limit(pi, "sakuraBonus");
  function canClaim(pi, k) { if (RU().claims === false) return false; const p = G.P[pi], pt = G.village[k]; return !!pt && !pt.claim && p.oni > 0 && G.cur === pi && !G.turn.claimed && (pi !== 0 || G.turn.acted); }
  function claim(pi, k) {
    if (!canClaim(pi, k)) return false;
    const pt = G.village[k]; pt.claim = { p: pi, exp: G.tn + 2 }; G.P[pi].oni--; G.turn.claimed = true;
    log("claim", pi, { who: pt.who, n: claimBonus(pi) }); return true;
  }
  // at the end of the claimer's next turn an unkept claim lapses and the other player takes the bonus
  function lapseClaims(pi) {
    const out = [];
    G.village.forEach((pt) => { if (!pt.claim || pt.claim.p !== pi || pt.claim.exp > G.tn) return; const o = 1 - pi, n = claimBonus(o); G.P[o].fame += n; pt.claim = null; out.push({ who: pt.who, p: pi, n }); log("lapse", pi, { who: pt.who, n }); });
    return out;
  }

  // ---------- tools ----------
  const bit = (t) => 1 << RU().turnTools.indexOf(t);
  const toolsOfBits = (f) => RU().turnTools.filter((t) => f & bit(t));
  // a modifier tool's choices (quarter turns, or squares longer/shorter) and what one does to a card's steps
  const toolOpts = (t) => { const d = RU().toolDefs[t]; return (d.effect === "stretch" ? d.by : d.turns) || []; };
  function applyTool(t, steps, o) {
    if (RU().toolDefs[t].effect !== "stretch") return steps.map((v) => rotK(v, o));
    const tot = steps.reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]), n = Math.max(Math.abs(tot[0]), Math.abs(tot[1])), m = n + o;
    if (!n || m < 1) return null;
    const u = [tot[0] / n, tot[1] / n];
    return u[0] && u[1] ? [[u[0] * m, u[1] * m]] : Array.from({ length: m }, () => u);
  }
  const stepCard = (idx) => ({ id: -1 - idx, el: "V", steps: null, step: RU().stepTools[idx] });
  const toolsLeft = (t) => RU().copies - G.P.filter((p) => p.tools[t]).length;
  const gatherCount = (p) => { const pi = G.P.indexOf(p), extra = limit(pi, "gather") - RU().gather; return Math.max(RU().gather, ...RU().gatherTools.filter((t) => p.tools[t]).map((t) => RU().toolDefs[t].amount)) + extra; };
  const cost = (t, pi = 0) => Math.max(1, RU().toolDefs[t].cost + limit(pi, "toolCost") - ((G && G.P && G.P[pi] && G.P[pi].toolOff) ? 1 : 0));

  // ---------- movement & solver ----------
  function stepCells(pt, pos, steps) {
    let [x, y] = pos; const trail = []; let bonus = false, sym = 0;
    for (const [dx, dy] of steps) {
      x += dx; y += dy; trail.push([x, y]);
      if (!inP(pt, x, y)) return { fail: "off", trail, pos: [x, y] };
      if (isHaz(pt, x, y)) return { fail: "oni", trail, pos: [x, y] };
      if (pt.bonus && x === pt.bonus[0] && y === pt.bonus[1]) bonus = true;
      if (pt.sym) pt.sym.forEach((c, i) => { if (c[0] === x && c[1] === y) sym |= 1 << i; });
    }
    return { pos: [x, y], trail, bonus, sym };
  }
  // ---------- patient demands: symptoms, the bench, quirks ----------
  const symAll = (pt) => (pt.sym && pt.sym.length ? (1 << pt.sym.length) - 1 : 0);
  const quirk = (pt) => (RU().quirks.enabled && (pt.royal ? null : RU().quirks.force || pt.quirk)) || null;
  // ingredients a patient needs: from their spot on the bench (or a royal's stage minimum)
  function needCards(pt) {
    const r = RU(); if (pt.royal) return r.royal.min;
    if (!r.bench.enabled || !G) return 0;
    const k = G.village.indexOf(pt), sp = r.bench.spots[k]; return sp ? sp.min || 0 : 0;
  }
  function spotBonus(pt) { const r = RU(); if (!r.bench.enabled || !G || pt.royal) return 0; const sp = r.bench.spots[G.village.indexOf(pt)]; return sp ? sp.bonus || 0 : 0; }
  const isDiag = (steps) => steps.some(([a, b]) => a && b);
  const isJump = (c, steps) => !!c.knight || isDiag(steps);
  // the kitsune steps one square any way, diagonals too
  const KING = [[[0, -1]], [[1, 0]], [[0, 1]], [[-1, 0]], [[1, -1]], [[1, 1]], [[-1, 1]], [[-1, -1]]];
  const KNIGHT = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]].map((v) => [v]);
  // every way a card can be played; avail = turn tools still unused this brew. f = bits of the tools used
  function variants(c, avail) {
    if (c.knight) return KNIGHT.map((s) => ({ steps: s, f: 0 }));
    if (isAny(c)) return KING.map((s) => ({ steps: s, f: 0 }));
    const out = [{ steps: c.steps, f: 0 }];
    (avail || []).forEach((t) => toolOpts(t).forEach((k) => { const s = applyTool(t, c.steps, k); if (s) out.push({ steps: s, f: bit(t) }); }));
    return out;
  }
  const ckey = (c) => (c.ward ? "w" + c.el + c.mv : c.el === "V" ? "V" : c.el + (c.el2 || "") + c.steps.map((s) => s.join(",")).join(";"));
  function replay(pt, route) {
    let pos = [0, 0]; const trail = [[0, 0]]; let bonus = false;
    let sym = 0;
    for (const r of route) { const s = stepCells(pt, pos, r.opt); trail.push(...s.trail); pos = s.pos; bonus = bonus || s.bonus; sym |= s.sym || 0; }
    return { pos, trail, bonus, sym };
  }
  // x: { ward: [ward entries], echo: element whose garden cards may be played twice }
  function solve(pt, garden, hand, maxD, tools = {}, sakB, x = {}) {
    const r = RU(), sakV = sakB != null ? sakB : r.sakuraBonus;
    const qk = quirk(pt), need = x.need != null ? x.need : needCards(pt), full = symAll(pt), extra = x.extra != null ? x.extra : spotBonus(pt);
    const pool = [...(qk === "nervous" ? [] : garden.map((c, i) => ({ c, g: true, i, k: "g" + ckey(c) }))), ...hand.map((c, i) => ({ c, g: false, i, k: "h" + ckey(c) }))];
    r.stepTools.forEach((t, idx) => { if (tools[t]) pool.push({ c: stepCard(idx), g: true, i: -1 - idx, k: "z" + t }); });
    if (x.ward && r.ward.enabled) {
      const seenW = new Set();
      x.ward.forEach((w, i) => { if (!wardLeft(w)) return; const c = wardCard(w), k = "w" + ckey(c); if (seenW.has(k) || seenW.size >= 10) return; seenW.add(k); pool.push({ c, g: "w", i, k }); });
    }
    if (x.echo && qk !== "nervous") garden.forEach((c, i) => { if (hasEl(c, x.echo)) pool.push({ c, g: true, i, k: "e" + ckey(c), echo: true }); });
    pool.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    const owned = r.turnTools.filter((t) => tools[t]);
    let best = null, minD = md([0, 0], pt.t); const seen = new Set(), seq = [];
    const better = (a, b) => !b || a.fame > b.fame || (a.fame === b.fame && (a.handUsed < b.handUsed || (a.handUsed === b.handUsed && a.seq.length < b.seq.length)));
    (function dfs(pos, mask, bonus, hu, ab, em, sm, ing, ec) {
      const d = md(pos, pt.t); if (seq.length && d < minD) minD = d;
      if (d === 0 && hu >= r.minHandCards && elMet(pt, em) && sm === full && ing >= need && (qk !== "stubborn" || ec >= 2)) { const c = { fame: pt.val + extra + (bonus ? sakV : 0), bonus, handUsed: hu, seq: seq.slice(), ward: seq.filter((q) => q.g === "w").length }; if (better(c, best)) best = c; }
      if (seq.length >= maxD) return;
      const key = pos[0] + "," + pos[1] + "|" + mask + "|" + (bonus ? 1 : 0) + "|" + ab + "|" + em + "|" + sm + "|" + Math.min(ing, need) + "|" + Math.min(ec, 2); if (seen.has(key)) return; seen.add(key);
      const avail = owned.filter((t) => !(ab & bit(t)));
      for (let j = 0; j < pool.length; j++) {
        if (mask & (1 << j)) continue; if (j > 0 && pool[j].k === pool[j - 1].k && !(mask & (1 << (j - 1)))) continue;
        if (pool[j].echo && (ab & ECHO)) continue;
        const pc = pool[j].c, isIng = pool[j].g === false || (pool[j].g === true && pool[j].i >= 0), hasE = pt.el && (pc.el === "V" || hasEl(pc, pt.el));
        for (const v of variants(pc, avail)) {
          if (qk === "frail" && isJump(pc, v.steps)) continue;
          const s = stepCells(pt, pos, v.steps); if (s.fail) continue;
          const q = { g: pool[j].g, i: pool[j].i, opt: v.steps, f: v.f }; if (pool[j].echo) q.echo = true;
          seq.push(q); dfs(s.pos, mask | (1 << j), bonus || s.bonus, hu + (pool[j].g ? 0 : 1), ab | v.f | (pool[j].echo ? ECHO : 0), em | cardBits(pc), sm | s.sym, ing + (isIng ? 1 : 0), ec + (hasE && !pc.ward ? 1 : 0)); seq.pop();
        }
      }
    })([0, 0], 0, false, 0, 0, 0, 0, 0, 0);
    return { best, minD };
  }

  // everything a player could cure this patient with right now
  function solveFor(pi, pt, maxD) {
    const p = G.P[pi];
    return solve(pt, p.garden, p.hand, maxD, p.tools, limit(pi, "sakuraBonus"), { ward: p.ward, echo: echoEl(p) });
  }
  // a known cure: an unspent ward patient with the same ailment
  function knownFor(pi, k) {
    const r = RU(), p = G.P[pi], pt = G.village[k];
    if (!r.knownCure.enabled || !pt || !p.ward || barred(pi, pt)) return -1;
    return p.ward.findIndex((w) => w.ail === pt.ail && wardLeft(w) && !w.spent);
  }
  const knownPay = (pt) => Math.max(1, Math.floor(pt.val * RU().knownCure.payout));
  function wardEntry(pt) { const u = RU().ward.uses; return { id: pt.id, who: pt.who, art: pt.art, ail: pt.ail, el: pt.el, mv: pt.mv, val: pt.val, uses: u == null ? -1 : u }; }

  // ---------- game ----------
  // who: { ability, guild, color, style } chosen at the start (all optional); style = how a bot plays the seat: { depth, tools, curse }
  function mkP(who) {
    const w = who || {}, ab = (w.ability && RU().abilities && RU().abilities[w.ability]) || null;
    // mods: boosts carried in from outside the game (the quest's medicine chest); tools: tools owned from the start
    const m = w.mods || {}, tools = {}; (w.tools || []).forEach((t) => { if (RU().toolDefs[t]) tools[t] = true; });
    return { hand: [], garden: [], ward: [], fame: limit(0, "startFame", ab) + (m.startFame || 0), oni: limit(0, "oniPerPlayer", ab) + (m.oniPerPlayer || 0), tools, cures: 0, ability: ab ? w.ability : null, guild: w.guild != null ? w.guild : null, gel: w.gel || null, color: w.color || null, style: w.style || null, mods: Object.keys(m).length ? m : null };
  }
  function draw() { if (!G.deck.length) { G.deck = shuffle(G.discard); G.discard = []; } return G.deck.pop() || null; }
  const snap = (c) => ({ el: c.el, el2: c.el2, n: c.n, steps: c.steps });
  function log(k, p, a) { G.log.unshift({ k, p, a: a || {}, r: G.round }); if (G.log.length > 200) G.log.length = 200; }

  function canBuy(pi, t) { if (RU().toolShop === false) return false; const p = G.P[pi]; return !!RU().toolDefs[t] && !p.tools[t] && toolsLeft(t) > 0 && p.fame >= cost(t, pi); }
  function buyTool(pi, t) {
    if (!canBuy(pi, t)) return false;
    const p = G.P[pi]; const c = cost(t, pi); p.fame -= c; p.tools[t] = true; if (p.toolOff) p.toolOff--; if (pi === 0) G.turn.bought = true;
    log("buy", pi, { tool: t, cost: c }); return true;
  }

  // nested settings change only the keys they name (a quest stop can set patients.oniMax alone)
  function deepAssign(a, b) { Object.keys(b).forEach((k) => { const v = b[k]; if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) deepAssign(a[k], v); else a[k] = v; }); return a; }
  // settings: { openHands } overrides from the player's house rules; players: [you, rival] as { ability, guild, color }
  function newGame(settings, players) {
    if (!BASE) throw new Error("KF.configure(rules) first");
    G = { v: 2, uid: 1, rules: JSON.parse(JSON.stringify(BASE)) };
    deepAssign(G.rules, settings || {});
    G.rules.S = (G.rules.board && G.rules.board.size) || 8;
    players = players || [];
    const names = shuffle(Array.from({ length: COUNTS.names }, (_, i) => i));
    const ak = G.rules.patients.ailmentKinds; G.ails = shuffle(Array.from({ length: COUNTS.ailments }, (_, i) => i)).slice(0, ak ? Math.min(ak, COUNTS.ailments) : COUNTS.ailments);
    Object.assign(G, { deck: [], discard: [], market: [], village: [], pats: [], log: [], over: false, trigger: false, round: 1, phase: "main", pending: null, winner: null });
    G.P = [mkP(players[0]), mkP(players[1])];
    G.deck = makeDeck();
    const tiers = G.rules.patients.tiers;
    if (DECK && G.rules.patients.designed !== false) G.pats = shuffle(DECK.filter((d) => !tiers || tiers.includes(d.tier)).map((d) => Object.assign({ mv: "knight", art: d.who }, JSON.parse(JSON.stringify(d)), { id: G.uid++, claim: null, rot: 0 })));
    else for (let i = 0; i < G.rules.patients.count; i++) G.pats.push(makePatient(names));
    for (let i = 0; i < G.rules.marketSize; i++) G.market.push(draw());
    for (let i = 0; i < G.rules.villageSize; i++) G.village.push(G.pats.shift());
    if (G.rules.royal.enabled && ROYALS && ROYALS.length) {
      const rs = shuffle(ROYALS.slice()), mineR = G.rules.royal.you;
      if (mineR != null) { const i = rs.findIndex((r) => r.who === mineR); if (i > 0) rs.unshift(rs.splice(i, 1)[0]); }
      G.P.forEach((p, pi) => {
        const ro = JSON.parse(JSON.stringify(rs[pi % rs.length])); ro.stage = 0;
        ro.stages.forEach((st, i) => Object.assign(st, { royal: true, id: G.uid++, claim: null, rot: 0, who: ro.who, art: ro.art != null ? ro.art : ro.who, ail: ro.ail, el: st.el || ro.el, mv: "knight", n: i }));
        p.royal = ro;
      });
    }
    G.P.forEach((p, pi) => { for (let i = 0; i < limit(pi, "startHand"); i++) p.hand.push(draw()); for (let i = 0; i < limit(pi, "startGarden"); i++) p.garden.push(draw()); });
    G.botPlan = shuffle(G.rules.toolIds.slice());
    G.first = rnd() < 0.5 ? 0 : 1; G.cur = G.first; G.tn = 1; G.lapsed = [];
    resetTurn();
    log("new", null, { first: G.first });
    return G;
  }
  function resetTurn() { G.turn = { acted: false, planted: false, bought: false, claimed: false }; G.botStage = G.cur === 1 ? "buy" : null; G.botCured = false; }
  function refillMarket() { while (G.market.length < RU().marketSize) { const c = draw(); if (!c) break; G.market.push(c); } }

  function gather(pi, idxs) {
    const p = G.P[pi]; const taken = idxs.slice().sort((a, b) => b - a).map((i) => G.market.splice(i, 1)[0]).reverse();
    p.hand.push(...taken); refillMarket(); if (pi === 0) G.turn.acted = true;
    log("gather", pi, { cards: taken.map(snap) });
    return taken;
  }
  function drawBlind(pi) {
    const p = G.P[pi], n = gatherCount(p); const got = Array.from({ length: n }, draw).filter(Boolean);
    p.hand.push(...got); if (pi === 0) G.turn.acted = true;
    log("blind", pi, { n: got.length });
    return got;
  }
  // validate a route built by the UI (or bot) before curing. Returns an error code or null.
  function checkRoute(pi, k, route) { const pt = k === "royal" ? royalStage(pi) : G.village[k]; return checkPt(pi, pt, route); }
  function checkPt(pi, pt, route) {
    const p = G.P[pi], r = RU(); if (!pt) return "noPatient"; if (barred(pi, pt)) return "claimed";
    const qk = quirk(pt);
    let pos = [0, 0], flags = 0, hu = 0, em = 0, echoed = false, sym = 0, ing = 0, ec = 0; const seenH = new Set(), seenG = new Set(), seenW = new Set();
    for (const s of route) {
      if (s.g === "w") { const w = p.ward && p.ward[s.i]; if (!r.ward.enabled || !w || !wardLeft(w) || w.spent || seenW.has(s.i)) return "cardMisuse"; seenW.add(s.i); em |= elBit(w.el); }
      else if (s.i < 0) { const t = r.stepTools[-1 - s.i]; if (!t || !p.tools[t] || seenG.has(s.i)) return "toolMisuse"; seenG.add(s.i); }
      else if (s.g) {
        const c = p.garden[s.i]; if (!c) return "cardMisuse";
        if (seenG.has(s.i)) { if (echoed || !echoEl(p) || !hasEl(c, echoEl(p))) return "cardMisuse"; echoed = true; }
        if (qk === "nervous") return "nervous";
        seenG.add(s.i); em |= cardBits(c); ing++; if (pt.el && (c.el === "V" || hasEl(c, pt.el))) ec++;
      }
      else { const c = p.hand[s.i]; if (!c || seenH.has(s.i)) return "cardMisuse"; seenH.add(s.i); hu++; em |= cardBits(c); ing++; if (pt.el && (c.el === "V" || hasEl(c, pt.el))) ec++; }
      const card = s.g === "w" ? wardCard(p.ward[s.i]) : s.i < 0 ? null : s.g ? p.garden[s.i] : p.hand[s.i];
      if (qk === "frail" && card && isJump(card, s.opt)) return "frail";
      if ((s.f || 0) & flags) return "toolTwice"; flags |= s.f || 0;
      if (toolsOfBits(s.f || 0).some((t) => !p.tools[t])) return "toolMisuse";
      const c = stepCells(pt, pos, s.opt); if (c.fail) return "blocked"; pos = c.pos; sym |= c.sym;
    }
    if (hu < r.minHandCards) return "needHand";
    if (ing < needCards(pt)) return "needCards";
    if (sym !== symAll(pt)) return "needSymptoms";
    if (qk === "stubborn" && ec < 2) return "stubborn";
    if (!elMet(pt, em)) return "needElement";
    if (pos[0] !== pt.t[0] || pos[1] !== pt.t[1]) return "notOnCure";
    return null;
  }
  // cure: the patient's value and any sakura bonus go straight onto the fame track
  function doCure(pi, k, route) {
    const p = G.P[pi], pt = G.village[k], rp = replay(pt, route);
    const hIdx = route.filter((r) => !r.g).map((r) => r.i).sort((a, b) => b - a);
    const gUsed = route.filter((r) => r.g === true && r.i >= 0).length, tl = route.filter((r) => r.f || r.i < 0).length;
    const wUsed = route.filter((r) => r.g === "w").map((r) => p.ward[r.i]);
    wUsed.forEach((w) => { if (w.uses > 0) w.uses--; });
    const used = hIdx.map((i) => p.hand.splice(i, 1)[0]); G.discard.push(...used);
    const spot = spotBonus(pt);
    G.village.splice(k, 1); const arrived = G.pats.length ? G.pats.shift() : null; if (arrived) G.village.push(arrived);
    const sak = rp.bonus ? limit(pi, "sakuraBonus") : 0, kept = keptClaim(pi, pt);
    p.cures++; p.fame += pt.val + sak + kept + spot;
    if (r_ward()) p.ward.push(wardEntry(pt));
    const gift = giveGift(pi, pt);
    if (pi === 0) G.turn.acted = true;
    log("cure", pi, { who: pt.who, ail: pt.ail, v: pt.val, sak, kept, spot, gift });
    return { pt, rp, sak, kept, spot, gift, hand: used.length, used, gUsed, wUsed: wUsed.length, tl, arrived: arrived ? arrived.id : null };
  }
  // ---------- gifts: some patients give something when cured ----------
  // mon: extra mon · plant: a market card into your garden · oni: an oni back · draw: cards from the deck · tool: your next tool costs 1 less
  function giveGift(pi, pt) {
    const r = RU(), p = G.P[pi], g = r.gifts.enabled && pt.gift; if (!g) return null;
    if (g === "mon") p.fame += r.gifts.mon;
    else if (g === "oni") p.oni++;
    else if (g === "draw") for (let i = 0; i < r.gifts.draw; i++) { const c = draw(); if (c) p.hand.push(c); }
    else if (g === "tool") p.toolOff = (p.toolOff || 0) + 1;
    else if (g === "plant" && G.market.length) {
      // the market card that reaches furthest, planted in place of the weakest if the garden is full
      let bi = 0; G.market.forEach((c, i) => { if (reach(c) > reach(G.market[bi])) bi = i; });
      const c = G.market.splice(bi, 1)[0]; refillMarket();
      if (p.garden.length >= limit(pi, "gardenMax")) { let wi = 0; p.garden.forEach((x, i) => { if (reach(x) < reach(p.garden[wi])) wi = i; }); G.discard.push(p.garden.splice(wi, 1)[0]); }
      p.garden.push(c);
    }
    return g;
  }
  // ---------- royals: each healer's private patient, cured stage by stage, paid at the end ----------
  const royalStage = (pi) => { const ro = G.P[pi].royal; return ro && ro.stage < ro.stages.length ? ro.stages[ro.stage] : null; };
  function doRoyal(pi, route) {
    const p = G.P[pi], ro = p.royal, pt = royalStage(pi); if (!pt) return null;
    route.filter((r) => r.g === "w").forEach((r) => { const w = p.ward[r.i]; if (w && w.uses > 0) w.uses--; });
    const used = route.filter((r) => !r.g).map((r) => r.i).sort((a, b) => b - a).map((i) => p.hand.splice(i, 1)[0]); G.discard.push(...used);
    ro.stage++; const done = ro.stage >= ro.stages.length;
    if (done) { p.fame += ro.pay; p.cures++; }
    if (pi === 0) G.turn.acted = true;
    log("royal", pi, { who: ro.who, stage: ro.stage, of: ro.stages.length, pay: done ? ro.pay : 0 });
    return { pt, done, pay: done ? ro.pay : 0, used };
  }
  const r_ward = () => RU().ward.enabled;
  const keptClaim = (pi, pt) => (pt.claim && pt.claim.p === pi ? claimBonus(pi) : 0);
  // cure with a known remedy: no ingredients, a reduced payout, and the ward patient's move is spent
  function doKnownCure(pi, k) {
    const wi = knownFor(pi, k); if (wi < 0) return null;
    const p = G.P[pi], pt = G.village[k], w = p.ward[wi], pay = knownPay(pt);
    const kept = keptClaim(pi, pt);
    w.spent = true; w.uses = 0;
    G.village.splice(k, 1); const arrived = G.pats.length ? G.pats.shift() : null; if (arrived) G.village.push(arrived);
    p.cures++; p.fame += pay + kept;
    if (r_ward()) p.ward.push(wardEntry(pt));
    if (pi === 0) G.turn.acted = true;
    log("known", pi, { who: pt.who, ail: pt.ail, v: pay, via: w.who, kept });
    return { pt, pay, via: w, kept, arrived: arrived ? arrived.id : null };
  }
  // the trader's ability: swap a hand card for a market card, a set number of times a turn, as well as the action
  const canSwap = (pi) => G.cur === pi && !G.over && (G.turn.swaps || 0) < limit(pi, "swap");
  function swapCard(pi, hi, mi) {
    const p = G.P[pi], h = p.hand[hi], m = G.market[mi]; if (!canSwap(pi) || !h || !m) return false;
    p.hand[hi] = m; G.market[mi] = h; G.turn.swaps = (G.turn.swaps || 0) + 1;
    log("swap", pi, { gave: snap(h), got: snap(m) }); return true;
  }
  function plantCard(pi, hi, replace) {
    const p = G.P[pi]; const c = p.hand.splice(hi, 1)[0];
    if (p.garden.length >= limit(pi, "gardenMax")) { const old = p.garden.splice(replace == null ? 0 : replace, 1)[0]; G.discard.push(old); }
    p.garden.push(c); if (pi === 0) G.turn.planted = true;
    log("plant", pi, { card: snap(c) });
    return c;
  }
  function discardFromHand(pi, idxs) { const p = G.P[pi]; idxs.slice().sort((a, b) => b - a).forEach((i) => G.discard.push(p.hand.splice(i, 1)[0])); }

  // end the current player's turn. Returns "over" | "next"
  function endTurn() {
    const pi = G.cur; G.left = null;
    G.lapsed = lapseClaims(pi);
    if (G.P.some((p) => p.fame >= RU().endFame)) G.trigger = true;
    const last = pi !== G.first;
    if (last && (G.trigger || !G.village.length)) { gameOver(); return "over"; }
    G.cur = 1 - pi; if (G.cur === G.first) { G.round++; benchTurn(); }
    G.tn++; resetTurn();
    return "next";
  }
  // end of a round on the bench: the patient on "last chance" goes home, everyone moves up, a new patient arrives
  function benchTurn() {
    const r = RU(); G.left = null; if (!r.bench.enabled || !G.village.length) return;
    const gone = G.village.shift(); G.left = gone;
    if (quirk(gone) === "contagious") G.P.forEach((p) => { p.fame = Math.max(0, p.fame - r.quirks.contagious); });
    log("leave", null, { who: gone.who, contagious: quirk(gone) === "contagious" });
    const arrived = G.pats.length ? G.pats.shift() : null; if (arrived) G.village.push(arrived);
  }
  function gameOver() {
    G.over = true; G.phase = "over"; const [me, bot] = G.P;
    const tie = me.fame === bot.fame && me.cures === bot.cures;
    const won = me.fame > bot.fame || (me.fame === bot.fame && me.cures > bot.cures);
    G.winner = tie ? "tie" : won ? "you" : "rival";
    log("end", null, { winner: G.winner });
  }

  // ---------- bot ----------
  // what a royal stage is worth to the bot right now: its share of the payout, weighted by style (royal: 0 ignores it)
  const royalWorth = (p) => { const ro = p.royal, st = p.style || {}; return ro ? (ro.pay / ro.stages.length) * (st.royal != null ? st.royal : 1) : 0; };
  function evalHand(p, hand, depth = 4) {
    let v = -99;
    const rs = p.royal && p.royal.stage < p.royal.stages.length ? p.royal.stages[p.royal.stage] : null;
    if (rs && royalWorth(p) > 0) { const s = solve(rs, p.garden, hand, depth, p.tools, undefined, { ward: p.ward, echo: echoEl(p), need: RU().royal.min, extra: 0 }); const x = s.best ? 20 + royalWorth(p) - 0.5 * s.best.handUsed : royalWorth(p) * 0.25 - s.minD; if (x > v) v = x; }
    for (const pt of G.village) { if (barred(1, pt)) continue; const s = solve(pt, p.garden, hand, depth, p.tools, undefined, { ward: p.ward, echo: echoEl(p) }); const x = s.best ? 20 + s.best.fame - 0.5 * s.best.handUsed : pt.val * 0.25 - s.minD; if (x > v) v = x; }
    return v;
  }
  function botWants() { const p = G.P[1]; return G.botPlan.filter((t) => RU().toolDefs[t] && !p.tools[t] && toolsLeft(t) > 0); }
  // The bot works in two halves so the UI can show each move before it lands:
  // botNext() decides the next move without changing the table; botDo(move) carries it out.
  function botNext() {
    const p = G.P[1], st = p.style || {}, r = RU();
    for (;;) {
      switch (G.botStage) {
        case "buy": {
          if (st.tools !== false && p.fame < r.endFame - r.bot.stopBuyingWithin) { const w = botWants(); if (w.length && canBuy(1, w[0])) return { type: "buy", tool: w[0] }; }
          G.botStage = "swap"; continue;
        }
        case "swap": {
          // a trader swaps when one hand card for one market card makes its hand clearly better
          if (canSwap(1)) {
            const base = evalHand(p, p.hand); let best = null;
            p.hand.forEach((h, hi) => G.market.forEach((m, mi) => { const hand = p.hand.slice(); hand[hi] = m; const v = evalHand(p, hand); if (v > base + 0.01 && (!best || v > best.v)) best = { hi, mi, v }; }));
            if (best) return { type: "swap", hi: best.hi, mi: best.mi };
          }
          G.botStage = "act"; continue;
        }
        case "act": {
          let best = null;
          const score = (s) => s.fame - 0.3 * s.handUsed - (r.ward.uses > 0 ? 0.6 * (s.ward || 0) : 0);
          G.village.forEach((pt, k) => { if (barred(1, pt)) return; const s = solveFor(1, pt, st.depth || 5).best; const v = s && score(s) + keptClaim(1, pt); if (s && (!best || v > best.v)) best = { k, s, v }; });
          G.village.forEach((pt, k) => { if (knownFor(1, k) < 0) return; const v = knownPay(pt) + keptClaim(1, pt) - 0.4; if (!best || v > best.v) best = { k, known: true, v }; });
          const rs = royalStage(1);
          if (rs && royalWorth(p) > 0) { const s = solve(rs, p.garden, p.hand, st.depth || 5, p.tools, undefined, { ward: p.ward, echo: echoEl(p), need: r.royal.min, extra: 0 }).best; if (s) { const v = royalWorth(p) - 0.3 * s.handUsed; if (!best || v > best.v) best = { k: "royal", s, v }; } }
          if (best && best.known) return { type: "known", k: best.k };
          if (best) return { type: "cure", k: best.k, seq: best.s.seq };
          const n = gatherCount(p), m = G.market; let bp = null;
          for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) { const v = evalHand(p, [...p.hand, m[a], m[b]]); if (!bp || v > bp.v) bp = { v, idx: [a, b] }; }
          while (bp && bp.idx.length < n && bp.idx.length < m.length) { let b3 = null; m.forEach((c, i) => { if (bp.idx.includes(i)) return; const v = evalHand(p, [...p.hand, ...bp.idx.map((j) => m[j]), c]); if (!b3 || v > b3.v) b3 = { v, i }; }); if (!b3) break; bp.idx.push(b3.i); }
          const blind = evalHand(p, p.hand) + 0.6;
          if (!bp || blind > bp.v) return { type: "blind", n };
          return { type: "gather", idx: bp.idx, ids: bp.idx.map((i) => m[i].id) };
        }
        case "claim": {
          // claim the patient it is closest to curing (or, with open hands, one the player could cure next)
          if (st.curse !== false && p.oni > 0 && !G.turn.claimed) {
            let pick = null; const o = G.P[0];
            G.village.forEach((pt, k) => {
              if (pt.claim) return;
              const s = solveFor(1, pt, 4); let v = s.best ? 6 + pt.val : s.minD <= 1 ? pt.val - 1 : -9;
              if (r.openHands && solve(pt, o.garden, o.hand, 4, o.tools, undefined, { ward: o.ward, echo: echoEl(o) }).best) v += 3;
              v += rnd() * 0.5; if (!pick || v > pick.v) pick = { k, v };
            });
            if (pick && pick.v >= 4 + (3 - p.oni) - (st.greedy || 0)) return { type: "claim", k: pick.k };
          }
          G.botStage = "plant"; continue;
        }
        case "plant": {
          if (p.hand.length >= 3 && p.garden.length < limit(1, "gardenMax")) {
            let bi = 0, bs = -1; p.hand.forEach((c, i) => { const s = (c.el === "V" ? 1.5 : 1) + reach(c) * 0.3 + rnd() * 0.5; if (s > bs) { bs = s; bi = i; } });
            return { type: "plant", hi: bi };
          }
          G.botStage = "discard"; continue;
        }
        case "discard": {
          while (p.hand.length > limit(1, "handLimit")) { let w = 0; p.hand.forEach((c, i) => { if ((c.steps ? reach(c) : 9) < (p.hand[w].steps ? reach(p.hand[w]) : 9)) w = i; }); G.discard.push(p.hand.splice(w, 1)[0]); }
          G.botStage = "end"; continue;
        }
        default: return { type: "end" };
      }
    }
  }
  function botDo(m) {
    switch (m.type) {
      case "buy": buyTool(1, m.tool); G.botStage = "swap"; return {};
      case "swap": { const gave = G.P[1].hand[m.hi], got = G.market[m.mi]; swapCard(1, m.hi, m.mi); return { gave, got }; }
      case "cure": { const res = m.k === "royal" ? doRoyal(1, m.seq) : doCure(1, m.k, m.seq); G.botCured = true; G.botStage = "claim"; return { res }; }
      case "known": { const res = doKnownCure(1, m.k); G.botCured = true; G.botStage = "claim"; return { res }; }
      case "gather": { const cards = gather(1, m.idx); G.botStage = "claim"; return { cards }; }
      case "blind": { const cards = drawBlind(1); G.botStage = "claim"; return { cards }; }
      case "claim": claim(1, m.k); G.botStage = "plant"; return {};
      case "plant": { const card = plantCard(1, m.hi, null); G.botStage = "discard"; return { card }; }
    }
    return {};
  }
  function botStep() { const m = botNext(); if (m.type === "end") return m; return Object.assign(m, botDo(m)); }

  // ---------- save / load ----------
  // the beta (served under /beta/) keeps its own save, so it never overwrites the live game's
  const KEY = (/\/beta\//.test(location.pathname) ? "kusurifuda-beta" : "kusurifuda") + ".save.v2";
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ } }
  function load() {
    try { const s = localStorage.getItem(KEY); if (!s) return null; const g = JSON.parse(s); if (!g || g.v !== 2 || !g.P || !g.rules || !g.rules.deck || !g.rules.deck.straight) return null;
      // an older save: keep its rules, add what newer versions expect
      fillDefaults(g.rules); g.P.forEach((p) => { p.ward = p.ward || []; });
      if (g.tn == null) { g.tn = 1; g.lapsed = []; }
      G = g; return G; } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) {} }

  window.KF = {
    configure, get G() { return G; }, get rules() { return RU(); },
    DIRV, rotK, md, dirsOf, elOfDir, isHaz, stepCells, variants, replay, solve, rotatedCopy,
    bit, toolsOfBits, toolOpts, applyTool, stepCard, toolsLeft, gatherCount, cost, canBuy, buyTool, limit, abilityOf, MODS,
    wardCard, wardLeft, isAny, needEl, elBit, cardBits, hasEl, inP, reach, solveFor, knownFor, knownPay, doKnownCure, echoEl,
    newGame, gather, drawBlind, checkRoute, doCure, plantCard, canClaim, claim, barred, claimBonus, canSwap, swapCard, royalStage, doRoyal, needCards, spotBonus, symAll, quirk, checkPt, discardFromHand, endTurn,
    botStep, botNext, botDo, save, load, clearSave,
  };
})();
