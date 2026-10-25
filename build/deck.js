// Builds patients.json: the designed patient deck and the royals.
// Usage: node build/deck.js   (writes ../patients.json; same seed, same deck)
// Each card is chosen by hand below (who, element, tier, quirk, gift, ailment); the map is
// generated to suit it: harder and richer up the tiers, always solvable around the oni.
const fs = require("fs"), path = require("path");

// who: name in content.patients · art: portrait to show (another patient's while the card has none of
// its own; placeholder marks those) · el: W F E A · q: quirk · g: gift · ail: index into content.ailments
const CARDS = [
  // tier 1: short, open routes; a few small gifts
  { who: 0, tier: 1, el: "E", g: "plant", ail: 7 },          // Rice Farmer, stiff back
  { who: 1, tier: 1, el: "W", ail: 2 },                      // Inn Mistress, sleeplessness
  { who: 2, tier: 1, el: "W", ail: 1 },                      // Fisherwoman, chills
  { who: 3, tier: 1, el: "A", g: "draw", ail: 4 },           // Falconer, a cough
  { who: 6, tier: 1, el: "W", ail: 15 },                     // Pearl Diver, sore throat
  { who: 7, tier: 1, el: "F", ail: 0 },                      // Bathhouse Keeper, fever
  { who: 10, tier: 1, el: "E", ail: 2 },                     // Clockmaker, sleeplessness
  { who: 11, tier: 1, el: "F", ail: 13 },                    // Street Juggler, stage fright
  { who: 14, tier: 1, el: "F", ail: 11 },                    // Lantern Seller, nightmares
  { who: 18, tier: 1, el: "E", g: "mon", ail: 12 },          // Tanuki, hiccups
  { who: 26, tier: 1, el: "A", ail: 4 },                     // Kite Maker, a cough
  { who: 31, tier: 1, el: "A", ail: 8 },                     // Wandering Poet, lovesickness
  // tier 2: longer routes, some symptoms, some quirks
  { who: 8, tier: 2, el: "F", q: "stubborn", g: "oni", ail: 3 },     // Rōnin, heartache
  { who: 9, tier: 2, el: "E", q: "stubborn", g: "mon", ail: 7 },     // Sumo Wrestler, stiff back
  { who: 12, tier: 2, el: "F", g: "tool", ail: 4 },                  // Swordsmith, a cough
  { who: 15, tier: 2, el: "F", g: "draw", ail: 0 },                  // Firework Maker, fever
  { who: 16, tier: 2, el: "W", g: "plant", ail: 14 },                // Kappa, homesickness
  { who: 17, tier: 2, el: "A", g: "oni", ail: 15 },                  // Mountain Monk, sore throat
  { who: 19, tier: 2, el: "W", q: "frail", ail: 1 },                 // Ferryman, chills
  { who: 22, tier: 2, el: "E", q: "nervous", g: "draw", ail: 2 },    // Tea Master, sleeplessness
  { who: 23, tier: 2, el: "E", g: "mon", ail: 7 },                   // Potter, stiff back
  { who: 24, tier: 2, el: "W", q: "contagious", ail: 4 },            // Harbourmaster, a cough
  { who: 25, tier: 2, el: "A", q: "frail", g: "plant", ail: 8 },     // Silk Weaver, lovesickness
  { who: 27, tier: 2, el: "A", g: "draw", ail: 5 },                  // Fortune Teller, bad luck
  // tier 3: the hardest routes, more quirks, the best gifts
  { who: 4, tier: 3, el: "A", q: "nervous", g: "oni", ail: 11 },     // Ninja, nightmares
  { who: 20, tier: 3, el: "A", q: "stubborn", g: "draw", ail: 9 },   // Court Astrologer, forgetfulness
  { who: 29, tier: 3, el: "W", q: "nervous", g: "plant", ail: 3 },   // Calligrapher, heartache
  { who: 30, tier: 3, el: "E", q: "frail", g: "mon", ail: 15 },      // Bell Ringer, sore throat
  { who: 32, art: 9, tier: 3, el: "E", q: "stubborn", g: "mon", ail: 7 },     // Grand Champion (placeholder: Sumo)
  { who: 33, art: 12, tier: 3, el: "F", q: "frail", g: "tool", ail: 10 },     // Temple Carpenter (placeholder: Swordsmith)
  { who: 34, art: 24, tier: 3, el: "W", q: "contagious", g: "oni", ail: 4 },  // Lighthouse Keeper (placeholder: Harbourmaster)
  { who: 35, art: 11, tier: 3, el: "F", q: "nervous", g: "draw", ail: 0 },    // Festival Dancer (placeholder: Street Juggler)
];
// royals: each healer's private patient, two stages, paid at the end (2x the stages' worth)
const ROYALS = [
  { who: 21, el: "F", ail: 10 },   // The Shōgun, toothache
  { who: 5, el: "A", ail: 14 },    // Princess Kaguya, homesickness
  { who: 13, el: "W", ail: 12 },   // The Dragon King, hiccups
  { who: 28, el: "E", ail: 15 },   // The Emperor, sore throat
];
const TIER = {
  1: { dist: [2, 4], oni: [0, 1], sym: [0, 0], val: [1, 4] },
  2: { dist: [4, 6], oni: [1, 3], sym: [0, 1], val: [4, 7] },
  3: { dist: [5, 7], oni: [2, 4], sym: [1, 2], val: [6, 9] },
  royal: { dist: [4, 6], oni: [1, 3], sym: [0, 1], val: [3, 8] },
};
const ROYAL_STAGES = 2, ROYAL_PAY = 2;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const R = rng(20261025), ri = (a, z) => a + Math.floor(R() * (z - a + 1));
const md = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
// the element's direction must be part of the way to the cure
const WAY = { F: (t) => t[0] > 0, W: (t) => t[0] < 0, A: (t) => t[1] < 0, E: (t) => t[1] > 0 };

function map(T, el, quirk) {
  const S = 8, key = (c) => c[0] + "," + c[1];
  for (let tries = 0; tries < 20000; tries++) {
    const st = [ri(0, 1), ri(0, 1)], lo = -(S / 2 - 1), hi = S / 2, b = [lo - st[0], hi - st[0], lo - st[1], hi - st[1]];
    const inP = (x, y) => x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3];
    const t = [ri(b[0], b[1]), ri(b[2], b[3])], dist = md(t, [0, 0]);
    if (dist < T.dist[0] || dist > T.dist[1] || !WAY[el](t)) continue;
    const used = new Set(["0,0", key(t)]), free = (c) => inP(c[0], c[1]) && !used.has(key(c));
    const box = [Math.min(0, t[0]) - 1, Math.max(0, t[0]) + 1, Math.min(0, t[1]) - 1, Math.max(0, t[1]) + 1];
    const inBox = () => [ri(box[0], box[1]), ri(box[2], box[3])];
    const sym = [], ns = ri(T.sym[0], T.sym[1]);
    for (let k = 0; sym.length < ns && k < 200; k++) { const c = inBox(); if (!free(c) || md(c, [0, 0]) < 2 || md(c, t) < 1) continue; sym.push(c); used.add(key(c)); }
    if (sym.length < ns) continue;
    const haz = [], no = ri(T.oni[0], T.oni[1]);
    for (let k = 0; haz.length < no && k < 300; k++) { const c = R() < 0.8 ? inBox() : [ri(b[0], b[1]), ri(b[2], b[3])]; if (!free(c)) continue; haz.push(c); used.add(key(c)); }
    if (haz.length < no) continue;
    let bonus = null; if (R() < 0.3) for (let k = 0; !bonus && k < 100; k++) { const c = inBox(); if (free(c)) { bonus = c; used.add(key(c)); } }
    const isHaz = (x, y) => haz.some((h) => h[0] === x && h[1] === y);
    const bfs = (a, z) => { const q = [a], seen = new Set([key(a)]); while (q.length) { const [x, y] = q.shift(); if (x === z[0] && y === z[1]) return true; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [x + dx, y + dy]; if (!inP(n[0], n[1]) || isHaz(n[0], n[1]) || seen.has(key(n))) continue; seen.add(key(n)); q.push(n); } } return false; };
    const stops = [[0, 0], ...sym, t]; let ok = true; for (let i = 0; i + 1 < stops.length; i++) if (!bfs(stops[i], stops[i + 1])) ok = false;
    if (!ok) continue;
    const val = dist - 1 + sym.length + (haz.length >= 3 ? 1 : 0) + (quirk && quirk !== "contagious" ? 1 : 0);
    if (val < T.val[0] || val > T.val[1]) continue;
    return { t, haz, bonus, sym, b, s: st, val };
  }
  throw new Error("could not design a map");
}

const deck = CARDS.map((c, i) => {
  const m = map(TIER[c.tier], c.el, c.q);
  const card = { card: i + 1, who: c.who, art: c.art != null ? c.art : c.who, tier: c.tier, el: c.el, val: m.val, quirk: c.q || null, gift: c.g || null, ail: c.ail, t: m.t, haz: m.haz, bonus: m.bonus, sym: m.sym, b: m.b, s: m.s };
  if (c.art != null) card.placeholder = true;
  return card;
});
// every royal is worth the same (its stages add up to ROYAL_WORTH), so the one you're dealt is fair
const ROYAL_WORTH = 10;
const royals = ROYALS.map((r) => {
  let stages;
  do stages = Array.from({ length: ROYAL_STAGES }, () => { const m = map(TIER.royal, r.el, null); return { el: r.el, val: m.val, t: m.t, haz: m.haz, bonus: m.bonus, sym: m.sym, b: m.b, s: m.s }; });
  while (stages.reduce((a, s) => a + s.val, 0) !== ROYAL_WORTH);
  return { who: r.who, art: r.who, el: r.el, ail: r.ail, pay: ROYAL_PAY * stages.reduce((a, s) => a + s.val, 0), stages };
});
const out = {
  _about: "The patient deck, made by build/deck.js. Coordinates are relative to the start square (0,0); b is the map's bounds [xmin,xmax,ymin,ymax], t the cure, haz the oni, bonus the sakura, sym the symptoms a route must pass through. who names the patient (content.patients), art is the portrait shown; placeholder cards borrow another patient's portrait until they get their own. Royals are the healers' private two-stage patients, paid on completion.",
  deck, royals,
};
fs.writeFileSync(path.join(__dirname, "..", "patients.json"), JSON.stringify(out, null, 1).replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, "[$1,$2]").replace(/\[\s+(-?\d+),\s+(-?\d+),\s+(-?\d+),\s+(-?\d+)\s+\]/g, "[$1,$2,$3,$4]") + "\n");
const byT = {}; deck.forEach((c) => { (byT[c.tier] = byT[c.tier] || []).push(c.val); });
console.log("deck", deck.length, JSON.stringify(byT), "symptoms", deck.reduce((a, c) => a + c.sym.length, 0), "quirks", deck.filter((c) => c.quirk).length, "gifts", deck.filter((c) => c.gift).length);
console.log("royals", royals.map((r) => `${r.who}: ${r.stages.map((s) => s.val).join("+")} -> ${r.pay}`).join(" | "));
