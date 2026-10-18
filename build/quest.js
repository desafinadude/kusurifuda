// Quest balance: a full-strength bot (seat 0) against each quest.json stop's rival. node build/quest.js [games]
// Prints seat 0's win rate per stop; it should fall from high to around half as the journey goes on.
const path = require("path"), fs = require("fs"), APP = path.join(__dirname, "..");
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
require(path.join(APP, "js/engine.js"));
const KF = window.KF, BASE = JSON.parse(fs.readFileSync(path.join(APP, "rules.json"), "utf8")), Q = JSON.parse(fs.readFileSync(path.join(APP, "quest.json"), "utf8"));
const N = +process.argv[2] || 60;
const swap = (G) => { G.P.reverse(); G.village.forEach((pt) => { if (pt.cursed != null) pt.cursed = 1 - pt.cursed; }); };
KF.configure(BASE);
Q.stops.forEach((s, i) => {
  let w = 0, turns = 0;
  for (let g = 0; g < N; g++) {
    const G = KF.newGame(JSON.parse(JSON.stringify(s.rules)), [{}, { style: s.rival }]); G.P[1].fame += s.rival.headStart || 0;
    let t = 0;
    while (!G.over && t < 300) {
      const seat = G.cur; if (seat === 0) swap(G);
      G.botStage = "buy"; G.botCured = false;
      for (let k = 0; k < 30; k++) { const m = KF.botNext(); if (m.type === "end") break; KF.botDo(m); }
      if (seat === 0) swap(G);
      t++; KF.endTurn();
    }
    turns += t / 2; if (G.winner === "you") w++;
  }
  console.log(String(i + 1).padStart(2), s.id.padEnd(11), "target", String(s.rules.endFame).padStart(2), "win", (100 * w / N).toFixed(0).padStart(3) + "%", "rounds", (turns / N).toFixed(1));
});
