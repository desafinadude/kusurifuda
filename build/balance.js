// Bot-vs-bot balance runs against rules.json.
// Usage: node build/balance.js [games-per-matchup] [path/to/rules.json]
// Both seats use the app's bot; one seat can be told not to buy tools or not to claim patients.
const path = require("path");
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
require(path.join(__dirname, "../js/engine.js"));
const KF = window.KF;
const rulesFile = process.argv[3] || path.join(__dirname, "../rules.json");
KF.configure(JSON.parse(require("fs").readFileSync(rulesFile, "utf8")));

const swap = (G) => { G.P.reverse(); G.cur = 1 - G.cur; G.village.forEach((pt) => { if (pt.claim) pt.claim.p = 1 - pt.claim.p; }); };
function playTurn(G) {
  const seat = G.cur; if (seat === 0) swap(G);
  G.botStage = "buy"; G.botCured = false;
  for (let i = 0; i < 30; i++) { const m = KF.botNext(); if (m.type === "end") break; KF.botDo(m); }
  if (seat === 0) swap(G);
}
function game(styles, settings) {
  const G = KF.newGame(settings); G.P[0].style = styles[0]; G.P[1].style = styles[1];
  let turns = 0; while (!G.over && turns < 200) { playTurn(G); turns++; KF.endTurn(); }
  return { winner: G.winner, turns, fame: G.P.map((p) => p.fame) };
}
function match(name, styles, settings, n) {
  let a = 0, b = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    const flip = i % 2, r = game(flip ? [styles[1], styles[0]] : styles, settings); turns += r.turns;
    if (r.winner === (flip ? "rival" : "you")) a++; else if (r.winner === (flip ? "you" : "rival")) b++;
  }
  console.log(`${name.padEnd(44)} A ${(100 * a / n).toFixed(0)}%  B ${(100 * b / n).toFixed(0)}%  turns each ${(turns / n / 2).toFixed(1)}`);
}
const N = +process.argv[2] || 200;
const FULL = {}, PLAIN = { tools: false, curse: false }, NOTOOLS = { tools: false }, NOCURSE = { curse: false };
for (const open of [true, false]) {
  console.log(`— ${open ? "open" : "hidden"} hands —`);
  match("A full bot     vs B plain (no tools/claims)", [FULL, PLAIN], { openHands: open }, N);
  match("A tools only   vs B plain", [NOCURSE, PLAIN], { openHands: open }, N);
  match("A claims only  vs B plain", [NOTOOLS, PLAIN], { openHands: open }, N);
}
