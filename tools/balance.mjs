// バランスの計測：CPU 同士を対戦させ、能力ごとの勝率を表にする
//   node tools/balance.mjs [対局数] [--depth 1|2] [--workers N]
//   例：node tools/balance.mjs 3000 --depth 2
// CPU は ai.js（ゲームの CPU 対戦と同じもの）。depth 2 は minimax で2手先まで読む。
// コアの数だけ並列に対戦させる。結果は tools/balance-report.md に書き出す。
//
// 注意：測れるのは「この CPU が使ったときの強さ」。人が使うと強い能力（読み合いが要るもの）は、
// 低く出ることがある。最後は人が遊んで確かめる。
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const MAX_MOVES = 200;

// ===== 1局（ワーカーの中で動く） =====
function runGames(count, depth) {
  const g = require(join(here, '..', 'script.js'));
  const AI = require(join(here, '..', 'ai.js'));
  const { state, SPECIAL_IDS, newBoard, makePlayer, playMove, costOf, DECK_POINTS, deckAddError } = g;
  const stats = Object.fromEntries(SPECIAL_IDS.map((id) => [id, { games: 0, wins: 0, draws: 0, used: 0 }]));
  const total = { b: 0, w: 0, draw: 0, moves: 0, games: 0 };
  // デッキはランダムに組む（24ポイントまで。半分くらいの確率でただの石を足す）
  const randomDeck = () => {
    const deck = {};
    let pts = 0;
    for (let tries = 0; tries < 200 && pts < DECK_POINTS; tries++) {
      const id = Math.random() < 0.45 ? 'plain' : SPECIAL_IDS[Math.floor(Math.random() * SPECIAL_IDS.length)];
      if (deckAddError(id, deck[id] || 0, DECK_POINTS - pts)) continue;
      deck[id] = (deck[id] || 0) + 1;
      pts += costOf(id);
    }
    return deck;
  };

  for (let n = 0; n < count; n++) {
    const decks = { b: randomDeck(), w: randomDeck() };
    const held = { b: Object.keys(decks.b).filter((id) => id !== 'plain'), w: Object.keys(decks.w).filter((id) => id !== 'plain') };
    Object.assign(state, {
      phase: 'play', board: newBoard(), turn: 'b', selected: 0, sealed: null, chainTurn: null, jammed: null,
      lastMove: null, fx: [], winLine: null, winner: undefined, moveCount: 0, logs: [],
      players: { b: makePlayer('b', decks.b), w: makePlayer('w', decks.w) },
    });
    let moves = 0;
    while (state.phase === 'play' && moves < MAX_MOVES) {
      const color = state.turn;
      const m = AI.chooseMove({ depth });
      if (!m) break;
      state.selected = m.i;
      const res = playMove(m.x, m.y, m.target);
      if (!res.ok) break;
      if (stats[res.ability]) stats[res.ability].used++;
      moves++;
      void color;
    }
    const winner = state.phase === 'end' ? state.winner : null;
    total.games++;
    total.moves += moves;
    if (winner) total[winner]++; else total.draw++;
    for (const c of ['b', 'w']) {
      for (const id of held[c]) {
        stats[id].games++;
        if (winner === c) stats[id].wins++;
        else if (!winner) stats[id].draws++;
      }
    }
    if (parentPort && (n + 1) % 20 === 0) parentPort.postMessage({ progress: 20 });
  }
  return { stats, total };
}

if (!isMainThread) {
  const result = runGames(workerData.count, workerData.depth);
  parentPort.postMessage({ result });
} else {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
  const GAMES = Number(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 1000);
  const DEPTH = opt('--depth', 2);
  const WORKERS = Math.min(opt('--workers', cpus().length), GAMES);
  const started = Date.now();

  const per = Array.from({ length: WORKERS }, (_, i) => Math.floor(GAMES / WORKERS) + (i < GAMES % WORKERS ? 1 : 0));
  let done = 0;
  const results = await Promise.all(per.map((count) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { count, depth: DEPTH } });
    w.on('message', (msg) => {
      if (msg.progress) { done += msg.progress; process.stderr.write(`\r${done}/${GAMES}局`); }
      if (msg.result) resolve(msg.result);
    });
    w.on('error', reject);
  })));
  process.stderr.write('\n');

  // ===== 集計 =====
  const { ABILITIES, SPECIAL_IDS } = require(join(here, '..', 'script.js'));
  const stats = Object.fromEntries(SPECIAL_IDS.map((id) => [id, { games: 0, wins: 0, draws: 0, used: 0 }]));
  const total = { b: 0, w: 0, draw: 0, moves: 0, games: 0 };
  for (const r of results) {
    for (const k of Object.keys(total)) total[k] += r.total[k];
    for (const id of SPECIAL_IDS) for (const k of Object.keys(stats[id])) stats[id][k] += r.stats[id][k];
  }

  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-');
  const rows = SPECIAL_IDS.map((id) => {
    const s = stats[id];
    const rate = s.games ? s.wins / s.games : 0;
    const err = s.games ? 1.96 * Math.sqrt(rate * (1 - rate) / s.games) : 0;
    return { id, name: ABILITIES[id].name, ...s, rate, err };
  }).sort((a, b) => b.rate - a.rate);
  const avgRate = rows.reduce((a, r) => a + r.rate, 0) / rows.length;
  const mark = (r) => (r.rate - r.err > avgRate ? '強い' : r.rate + r.err < avgRate ? '弱い' : '');

  const lines = [
    '# バランスの計測結果',
    '',
    `- 対局数：${total.games}局（CPU の読みの深さ ${DEPTH}、並列 ${WORKERS}、${((Date.now() - started) / 1000).toFixed(0)}秒）`,
    `- 黒の勝ち ${pct(total.b, total.games)}%／白の勝ち ${pct(total.w, total.games)}%／引き分け ${pct(total.draw, total.games)}%`,
    `- 1局の平均手数：${(total.moves / total.games).toFixed(1)}手`,
    `- 能力を取った側の勝率の平均：${(100 * avgRate).toFixed(1)}%（引き分けがあるので50%より低くなる）`,
    '',
    '「判定」は、95%の誤差の幅を引いても平均より高ければ「強い」、足しても低ければ「弱い」。',
    'デッキはランダムに組んでいる（24ポイントまで）。測れるのは CPU が使ったときの強さなので、人が使ったときとはずれることがある。',
    '',
    '| 能力 | id | 取った試合 | 勝率 | 誤差（±） | 1試合で使った回数 | 判定 |',
    '|---|---|---:|---:|---:|---:|---|',
    ...rows.map((r) => `| ${r.name} | ${r.id} | ${r.games} | ${(100 * r.rate).toFixed(1)}% | ${(100 * r.err).toFixed(1)} | ${(r.games ? r.used / r.games : 0).toFixed(2)} | ${mark(r)} |`),
    '',
    'ai.js の PICK_VALUE（CPU が取り合いで使う値）に写すとき：',
    '',
    '```js',
    `const PICK_VALUE = { ${rows.map((r) => `${r.id}: ${Math.round(100 * r.rate)}`).join(', ')} };`,
    '```',
    '',
  ];
  const out = join(here, 'balance-report.md');
  writeFileSync(out, lines.join('\n'));
  console.log(lines.join('\n'));
}
