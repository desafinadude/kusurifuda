// Bot-vs-bot playtests of rules variants. node build/playtest.js [games]
// Each variant is rules.json with some keys changed; both seats are the same full bot,
// with random characters and guilds (each guild has an element).
const path = require("path"), fs = require("fs");
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
require(path.join(__dirname, "../js/engine.js"));
const KF = window.KF, BASE = JSON.parse(fs.readFileSync(path.join(__dirname, "../rules.json"), "utf8"));
const N = +process.argv[2] || 120, ONLY = process.argv[3];
const set = (o, k, v) => { const ks = k.split("."); let x = o; ks.slice(0, -1).forEach((p) => (x = x[p])); x[ks[ks.length - 1]] = v; };
const swap = (G) => { G.P.reverse(); G.village.forEach((pt) => { if (pt.cursed != null) pt.cursed = 1 - pt.cursed; }); };
const ABIL = Object.keys(BASE.abilities).filter((k) => !k.startsWith("_")), ELS = ["W", "F", "E", "A"];
function run(name, changes) {
  if (ONLY && !name.includes(ONLY)) return;
  const R = JSON.parse(JSON.stringify(BASE)); Object.entries(changes).forEach(([k, v]) => set(R, k, v)); KF.configure(R);
  const st = { cards: 0, opts: 0, optTurns: 0, turns: 0, cures: 0, known: 0, wardMoves: 0, stuck: 0, acts: 0, villageOut: 0, firstWins: 0, behindWins: 0, behindGames: 0, margin: 0, fameSpread: 0, uncured: 0 };
  for (let g = 0; g < N; g++) {
    const a = ABIL.slice().sort(() => Math.random() - 0.5);
    const G = KF.newGame({}, [{ ability: a[0], gel: ELS[Math.floor(Math.random() * 4)] }, { ability: a[1], gel: ELS[Math.floor(Math.random() * 4)] }]);
    let t = 0, mid = null;
    while (!G.over && t < 300) {
      const seat = G.cur; if (seat === 0) swap(G);
      G.botStage = "buy"; G.botCured = false;
      // how many village patients this seat could cure at the start of its turn
      st.opts += G.village.filter((pt) => KF.solveFor(1, pt, 5).best).length; st.optTurns++;
      for (let i = 0; i < 30; i++) {
        const m = KF.botNext(); if (m.type === "end") break;
        if (m.type === "cure") { st.cards += m.seq.length; st.cures++; st.wardMoves += m.seq.filter((q) => q.g === "w").length; st.acts++; }
        if (m.type === "known") { st.known++; st.acts++; }
        if (m.type === "gather" || m.type === "blind") { st.stuck++; st.acts++; }
        KF.botDo(m);
      }
      if (seat === 0) swap(G);
      t++; KF.endTurn();
      if (t === 16) mid = G.P.map((p) => p.fame);
    }
    st.turns += t / 2;
    if (!G.village.length || G.P.every((p) => p.fame < G.rules.endFame)) st.villageOut++;
    const w = G.winner === "you" ? 0 : G.winner === "rival" ? 1 : -1;
    if (w === G.first) st.firstWins++;
    if (mid && mid[0] !== mid[1] && w >= 0) { st.behindGames++; if (mid[w] < mid[1 - w]) st.behindWins++; }
    st.margin += Math.abs(G.P[0].fame - G.P[1].fame);
  }
  const f = (x, d = 1) => (x / N).toFixed(d);
  console.log(`${name.padEnd(34)} curable/turn ${(st.opts / st.optTurns).toFixed(2)}  cards/cure ${(st.cards / Math.max(1, st.cures)).toFixed(1)}  turns ${f(st.turns)}  cures/g ${f(st.cures + st.known)} (known ${f(st.known)})  wardMoves/cure ${(st.wardMoves / Math.max(1, st.cures)).toFixed(2)}  gather% ${(100 * st.stuck / st.acts).toFixed(0)}  1st-wins ${(100 * st.firstWins / N).toFixed(0)}%  comeback ${(100 * st.behindWins / Math.max(1, st.behindGames)).toFixed(0)}%  margin ${f(st.margin)}  village-out ${(100 * st.villageOut / N).toFixed(0)}%`);
}
const OFF = { "ward.enabled": false, "knownCure.enabled": false, "guilds.echo": false, "patients.requireElement": false, "patients.ailmentKinds": null };
run("A  old rules", OFF);
run("B  ward once", { ...OFF, "ward.enabled": true, "ward.uses": 1 });
run("C  ward twice", { ...OFF, "ward.enabled": true, "ward.uses": 2 });
run("D  ward every brew", { ...OFF, "ward.enabled": true, "ward.uses": null });
run("E  ward once + known(8)", { ...OFF, "ward.enabled": true, "ward.uses": 1, "knownCure.enabled": true, "patients.ailmentKinds": 8 });
run("F  E + echo", { ...OFF, "ward.enabled": true, "ward.uses": 1, "knownCure.enabled": true, "patients.ailmentKinds": 8, "guilds.echo": true });
run("G  F + element required", { "ward.enabled": true, "ward.uses": 1, "knownCure.enabled": true, "patients.ailmentKinds": 8, "guilds.echo": true, "patients.requireElement": true });
run("H  G but ward twice", { "ward.enabled": true, "ward.uses": 2, "knownCure.enabled": true, "patients.ailmentKinds": 8, "guilds.echo": true, "patients.requireElement": true });
run("I  G but known(6)", { "ward.enabled": true, "ward.uses": 1, "knownCure.enabled": true, "patients.ailmentKinds": 6, "guilds.echo": true, "patients.requireElement": true });
run("NOW rules.json as shipped", {});

// straight moves: elements go straight 1-3 squares, pairs go diagonally, the ward leaps like a knight, 8 x 8 boards
const ST = { "board.size": 8, "deck.mode": "straight", "deck.straight": { 1: 3, 2: 2, 3: 1 }, "deck.diagonal": { 1: 1, 2: 1 }, "ward.move": "knight", "patients.maxDistance": 7, openHands: true };
run("S0 straight 3/2/1 + diag 1/1", ST);
run("S1 S0, more oni (2-5)", { ...ST, "patients.oniMin": 2, "patients.oniMax": 5 });
run("S2 S0, more 1s (4/2/1)", { ...ST, "deck.straight": { 1: 4, 2: 2, 3: 1 } });
run("S3 S0, diagonals 1 only (x2)", { ...ST, "deck.diagonal": { 1: 2 } });
run("S4 S0, cures nearer (max 6)", { ...ST, "patients.maxDistance": 6 });
run("S5 S0, no diagonals", { ...ST, "deck.diagonal": {} });
