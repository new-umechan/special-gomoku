// 自動のバランス調整：デッキを作る AI（進化）で強いデッキを探し、強いデッキに入りすぎる碁石は値上げ、
// どこにも入らない碁石は値下げする。これをくり返して、結果を tools/autobalance/ に書き出す。
//   node tools/autobalance.mjs [--hours 8] [--pop 64] [--gens 30] [--games 12] [--workers N]
//   途中で止めても、costs.json から続きができる（--fresh で最初から）
//
// 1ラウンドの流れ
//   1. いまの値段で、デッキを64個作る（前のラウンドの強いデッキを引き継ぐ）
//   2. 30世代、進化させる：各デッキが12局ずつ戦い、勝率の高い半分を残して、残りは少し変えた子どもにする
//   3. 最後に上位16個を、もう一度たくさん戦わせて順位を固める
//   4. 上位16個のうち半分以上に入っている碁石は +1、上位にもデッキ全体にもほとんどない碁石は -1（1ラウンドに上げ下げ2つずつまで）
//      1回の結果はぶれるので、直近3ラウンドの平均で決める。直したばかりの碁石は3ラウンド待つ
//
// 注意：強さは「この CPU（ai.js）が使ったときの強さ」。値段を本当に直すかは、人が結果を見て決める。
// ゲーム本体（script.js）の値段は書き換えない。結果の値段は tools/autobalance/costs.json に出す。
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const MAX_MOVES = 200;

// ===== ワーカー：渡された対戦を順に指して、結果を返す =====
if (!isMainThread) {
  const g = require(join(here, '..', 'script.js'));
  const AI = require(join(here, '..', 'ai.js'));
  const { state, newBoard, makePlayer, playMove } = g;
  parentPort.on('message', ({ jobs }) => {
    const out = jobs.map(({ b, w }) => {
      Object.assign(state, {
        phase: 'play', board: newBoard(), turn: 'b', selected: 0, sealed: null, chainTurn: null, jammed: null,
        lastMove: null, fx: [], winLine: null, winner: undefined, moveCount: 0, logs: [],
        players: { b: makePlayer('b', b), w: makePlayer('w', w) },
      });
      for (let k = 0; k < MAX_MOVES && state.phase === 'play'; k++) {
        const m = AI.chooseMove({ depth: 2 });
        if (!m) break;
        state.selected = m.i;
        if (!playMove(m.x, m.y, m.target).ok) break;
      }
      return state.phase === 'end' ? state.winner : null;
    });
    parentPort.postMessage({ out });
  });
} else {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
  const HOURS = opt('--hours', 8), POP = opt('--pop', 64), GENS = opt('--gens', 30), GAMES = opt('--games', 12);
  const WORKERS = opt('--workers', cpus().length);
  const OUT = join(here, 'autobalance');
  mkdirSync(OUT, { recursive: true });
  const g = require(join(here, '..', 'script.js'));
  const { SPECIAL_IDS, ABILITIES, DECK_POINTS, MAX_COPIES } = g;
  const ALL = ['plain', ...SPECIAL_IDS];
  const name = (id) => (id === 'plain' ? 'ただの石' : ABILITIES[id].name);

  // 値段：前回の続きがあれば読む
  const costFile = join(OUT, 'costs.json');
  let costs = { ...g.COST };
  let round = 0;
  if (!args.includes('--fresh') && existsSync(costFile)) {
    const saved = JSON.parse(readFileSync(costFile, 'utf8'));
    costs = { ...costs, ...saved.costs };
    round = saved.round || 0;
  }
  const start = { ...g.COST };
  const cost = (id) => (id === 'plain' ? 1 : costs[id] || 3);
  const points = (d) => Object.entries(d).reduce((s, [id, n]) => s + cost(id) * n, 0);
  const count = (d) => Object.values(d).reduce((s, n) => s + n, 0);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ===== デッキの作り方と変え方 =====
  function canAdd(d, id) {
    return (id === 'plain' || (d[id] || 0) < MAX_COPIES) && points(d) + cost(id) <= DECK_POINTS;
  }
  function add(d, id) { d[id] = (d[id] || 0) + 1; }
  function remove(d, id) { if (!d[id]) return; if (--d[id] === 0) delete d[id]; }
  function fill(d) { // 余ったポイントは、ただの石で埋める
    while (points(d) < DECK_POINTS) add(d, 'plain');
    return d;
  }
  function repair(d) { // 値段が変わって超えたら、ランダムに抜いて収める
    while (points(d) > DECK_POINTS) remove(d, pick(Object.keys(d).filter((id) => d[id])));
    if (!count(d)) d.plain = DECK_POINTS;
    return fill(d);
  }
  function randomDeck() {
    const d = {};
    for (let t = 0; t < 300; t++) {
      const id = Math.random() < 0.35 ? 'plain' : pick(SPECIAL_IDS);
      if (canAdd(d, id)) add(d, id);
      if (points(d) >= DECK_POINTS) break;
    }
    return repair(d);
  }
  // 少し変える：超能力を1つ抜いて別のを入れる／ただの石と入れ替える、など
  function mutate(src) {
    const d = { ...src };
    const steps = 1 + Math.floor(Math.random() * 2);
    for (let s = 0; s < steps; s++) {
      const specials = Object.keys(d).filter((id) => id !== 'plain');
      const r = Math.random();
      if (r < 0.4 && specials.length) remove(d, pick(specials));
      else if (r < 0.6 && d.plain) { for (let k = 0; k < 1 + Math.floor(Math.random() * 3); k++) remove(d, 'plain'); }
      // 空いたところに超能力を入れてみる（入らなければ、ただの石を抜いて場所を作る）
      const id = pick(SPECIAL_IDS);
      while (!canAdd(d, id) && d.plain) remove(d, 'plain');
      if (canAdd(d, id)) add(d, id);
    }
    return repair(d);
  }
  const key = (d) => Object.keys(d).sort().map((id) => `${id}${d[id]}`).join(',');

  // ===== 対戦を並列で回す =====
  const workers = Array.from({ length: WORKERS }, () => new Worker(fileURLToPath(import.meta.url)));
  function runJobs(jobs) {
    const per = Math.ceil(jobs.length / WORKERS);
    return Promise.all(workers.map((w, i) => new Promise((resolve) => {
      const part = jobs.slice(i * per, (i + 1) * per);
      if (!part.length) { resolve([]); return; }
      w.once('message', ({ out }) => resolve(out));
      w.postMessage({ jobs: part });
    }))).then((r) => r.flat());
  }
  // 各デッキが games 局ずつ、ほかのデッキと戦う（黒白は交互）。勝ち1、引き分け0.5
  async function evaluate(pop, games) {
    const jobs = [], meta = [];
    for (let i = 0; i < pop.length; i++) {
      for (let k = 0; k < games / 2; k++) {
        let j = Math.floor(Math.random() * (pop.length - 1));
        if (j >= i) j++;
        const black = k % 2 === 0;
        jobs.push(black ? { b: pop[i].deck, w: pop[j].deck } : { b: pop[j].deck, w: pop[i].deck });
        meta.push([i, j, black]);
      }
    }
    const res = await runJobs(jobs);
    const score = pop.map(() => ({ s: 0, n: 0 }));
    res.forEach((winner, k) => {
      const [i, j, black] = meta[k];
      const si = winner === null ? 0.5 : (winner === 'b') === black ? 1 : 0;
      score[i].s += si; score[i].n++;
      score[j].s += 1 - si; score[j].n++;
    });
    pop.forEach((p, i) => { p.fit = score[i].n ? score[i].s / score[i].n : 0; });
    return res.length;
  }

  // ===== ラウンドをくり返す =====
  const started = Date.now();
  const summaryFile = join(OUT, 'summary.md');
  if (!existsSync(summaryFile) || args.includes('--fresh')) {
    writeFileSync(summaryFile, `# 自動のバランス調整\n\nはじめの値段：${JSON.stringify(start)}\n\n| ラウンド | 時刻 | 値上げ | 値下げ | 1位のデッキ（勝率） |\n|---|---|---|---|---|\n`);
  }
  let carry = [];
  const history = {}; // 碁石ごとの上げ下げの記録（行ったり来たりを見つける）
  const recent = {}, lastChange = {};
  while ((Date.now() - started) / 3.6e6 < HOURS) {
    round++;
    const t0 = Date.now();
    let pop = carry.map((d) => ({ deck: repair({ ...d }) }));
    while (pop.length < POP) pop.push({ deck: pop.length < POP / 2 && carry.length ? mutate(pick(carry)) : randomDeck() });
    let games = 0;
    for (let gen = 0; gen < GENS; gen++) {
      games += await evaluate(pop, GAMES);
      pop.sort((a, b) => b.fit - a.fit);
      const elite = pop.slice(0, POP / 2);
      const next = elite.map((p) => ({ deck: p.deck }));
      const seen = new Set(next.map((p) => key(p.deck)));
      while (next.length < POP) {
        const child = Math.random() < 0.1 ? randomDeck() : mutate(pick(elite).deck);
        if (seen.has(key(child))) continue;
        seen.add(key(child));
        next.push({ deck: child });
      }
      pop = next;
    }
    // 上位16個の順位を、多めに戦わせて固める
    await evaluate(pop, GAMES);
    pop.sort((a, b) => b.fit - a.fit);
    const top = pop.slice(0, 16);
    games += await evaluate(top, 40);
    top.sort((a, b) => b.fit - a.fit);

    // 採用率：上位16個のうち、その碁石が入っているデッキの割合。全体の中の割合も見る
    const adopt = {}, share = {}, copies = {};
    for (const id of ALL) {
      adopt[id] = top.filter((p) => p.deck[id]).length / top.length;
      share[id] = pop.filter((p) => p.deck[id]).length / pop.length;
      copies[id] = top.reduce((s, p) => s + (p.deck[id] || 0), 0) / top.length;
    }
    // 値段を直す：入りすぎは値上げ、どこにもないものは値下げ（2つずつまで）。
    // 1回の結果はぶれるので、直近3ラウンドの平均で決め、直したばかりの碁石は3ラウンド待つ
    for (const id of ALL) { (recent[id] = recent[id] || []).push([adopt[id], share[id]]); if (recent[id].length > 3) recent[id].shift(); }
    const avg = (id, k) => recent[id].reduce((s, r) => s + r[k], 0) / recent[id].length;
    const cool = (id) => !lastChange[id] || round - lastChange[id] >= 3;
    const ready = (id) => recent[id].length >= 3 && cool(id);
    const up = SPECIAL_IDS.filter((id) => ready(id) && avg(id, 0) >= 0.5 && costs[id] < 8).sort((a, b) => avg(b, 0) - avg(a, 0)).slice(0, 2);
    const down = SPECIAL_IDS.filter((id) => ready(id) && avg(id, 0) === 0 && avg(id, 1) < 0.05 && costs[id] > 2).sort((a, b) => avg(a, 1) - avg(b, 1)).slice(0, 2);
    for (const id of up) { costs[id]++; lastChange[id] = round; (history[id] = history[id] || []).push(`R${round}+`); }
    for (const id of down) { costs[id]--; lastChange[id] = round; (history[id] = history[id] || []).push(`R${round}-`); }
    carry = top.slice(0, 16).map((p) => p.deck);

    // ===== 書き出す =====
    const deckText = (d) => Object.keys(d).sort((a, b) => cost(b) - cost(a)).map((id) => `${name(id)}×${d[id]}`).join('、');
    const minutes = ((Date.now() - t0) / 60000).toFixed(1);
    const lines = [
      `# ラウンド ${round}`,
      '',
      `- ${new Date().toLocaleString('ja-JP')}／${games}局／${minutes}分`,
      `- 値上げ：${up.map((id) => `${name(id)} → ${costs[id]}`).join('、') || 'なし'}`,
      `- 値下げ：${down.map((id) => `${name(id)} → ${costs[id]}`).join('、') || 'なし'}`,
      '',
      '## 強いデッキ（上位10）',
      '',
      '| 順位 | 勝率 | 個数 | 中身 |',
      '|---|---|---|---|',
      ...top.slice(0, 10).map((p, i) => `| ${i + 1} | ${(100 * p.fit).toFixed(0)}% | ${count(p.deck)} | ${deckText(p.deck)} |`),
      '',
      '## 碁石ごとの採用（上位16デッキに入っている割合）',
      '',
      '| 碁石 | 値段（はじめ → いま） | 上位での採用 | 上位での平均の数 | 全体での採用 | 上げ下げの記録 |',
      '|---|---|---|---|---|---|',
      ...ALL.slice().sort((a, b) => adopt[b] - adopt[a]).map((id) => `| ${name(id)} | ${start[id] || 1} → ${cost(id)} | ${(100 * adopt[id]).toFixed(0)}% | ${copies[id].toFixed(1)} | ${(100 * share[id]).toFixed(0)}% | ${(history[id] || []).slice(-6).join(' ')} |`),
      '',
    ];
    writeFileSync(join(OUT, `round-${String(round).padStart(3, '0')}.md`), lines.join('\n'));
    writeFileSync(join(OUT, 'latest.md'), lines.join('\n'));
    writeFileSync(costFile, JSON.stringify({ round, costs, updated: new Date().toISOString() }, null, 2));
    appendFileSync(summaryFile, `| ${round} | ${new Date().toLocaleTimeString('ja-JP')} | ${up.map((id) => `${name(id)}→${costs[id]}`).join(' ') || '-'} | ${down.map((id) => `${name(id)}→${costs[id]}`).join(' ') || '-'} | ${deckText(top[0].deck)}（${(100 * top[0].fit).toFixed(0)}%） |\n`);
    console.log(`ラウンド${round}：${minutes}分、値上げ ${up.join(',') || '-'}、値下げ ${down.join(',') || '-'}`);
  }
  for (const w of workers) w.terminate();
}
