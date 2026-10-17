// Each ability against no ability, both seats the same bot. node build/abilities.js [games]
const path = require("path");
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
require(path.join(__dirname, "../js/engine.js"));
const KF = window.KF, rules = JSON.parse(require("fs").readFileSync(path.join(__dirname, "../rules.json"), "utf8"));
KF.configure(rules);
const swap = (G) => { G.P.reverse(); G.village.forEach((pt) => { if (pt.cursed != null) pt.cursed = 1 - pt.cursed; }); };
function playTurn(G) { const seat = G.cur; if (seat === 0) swap(G); G.botStage = "buy"; G.botCured = false; for (let i = 0; i < 30; i++) { const m = KF.botNext(); if (m.type === "end") break; KF.botDo(m); } if (seat === 0) swap(G); }
const N = +process.argv[2] || 200;
for (const ab of Object.keys(rules.abilities).filter((k) => !k.startsWith("_"))) {
  let a = 0, b = 0;
  for (let i = 0; i < N; i++) {
    const flip = i % 2, who = flip ? [{}, { ability: ab }] : [{ ability: ab }, {}];
    const G = KF.newGame({}, who); let t = 0; while (!G.over && t < 200) { playTurn(G); t++; KF.endTurn(); }
    const w = G.winner, abWon = flip ? w === "rival" : w === "you", plainWon = flip ? w === "you" : w === "rival";
    if (abWon) a++; else if (plainWon) b++;
  }
  console.log(ab.padEnd(10), `ability ${(100 * a / N).toFixed(0)}%  plain ${(100 * b / N).toFixed(0)}%`);
}
