// CPU の頭脳。ブラウザ（CPU 対戦）と Node（tools/balance.mjs）の両方から使う。
//   AI.chooseMove({ depth })  … 今の手番の手を選ぶ。{ i: 手札の番号, x, y } を返す
//   AI.draftPick(pool)        … 取り合いで取る碁石を選ぶ
// 読み方：depth 1 は自分の手だけを見る。depth 2 は minimax で、自分の手のうち良さそうな上位を、
// 相手（または連続で自分）のいちばん良い返し手まで読んで比べる。手札は公開なので、相手の次の手札も分かる。
(function () {
  const G = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('./script.js')
    // ブラウザでは script.js のトップレベルの名前がそのまま見える
    : { state, SPECIAL_IDS, LINE_DIRS, SIZE, inside, other, countsFor, playMove, effectiveAbility, canPlaceAt, cardBlocked, findWin, specialWin };

  // 5マス窓ごとに脅威を採点する。相手石を含む窓は作れない。
  const WINDOW_SCORE = [0, 1, 12, 180, 9000, 1000000];
  function lineScore(board, c) {
    let s = 0;
    for (const [dx, dy] of G.LINE_DIRS) {
      for (let y = 0; y < G.SIZE; y++) {
        for (let x = 0; x < G.SIZE; x++) {
          const ex = x + 4 * dx, ey = y + 4 * dy;
          if (!G.inside(ex, ey)) continue;
          let own = 0, empty = 0;
          for (let k = 0; k < 5; k++) {
            const p = board[y + k * dy][x + k * dx];
            if (!p) empty++;
            else if (G.countsFor(p, c)) own++;
            else { own = -99; break; }
          }
          if (own >= 2) s += WINDOW_SCORE[own] * (own === 3 && empty === 2 ? 1.4 : 1);
        }
      }
    }
    return s;
  }

  // 開いた勝ちマスと複数の脅威を数える。四や両側の三を、単一の窓の点数より重く扱う。
  function threatStats(board, c) {
    const wins = new Set();
    let openThrees = 0;
    for (const [dx, dy] of G.LINE_DIRS) {
      for (let y = 0; y < G.SIZE; y++) for (let x = 0; x < G.SIZE; x++) {
        const ex = x + 4 * dx, ey = y + 4 * dy;
        if (!G.inside(ex, ey)) continue;
        let own = 0, empty = 0, hole = null, blocked = false;
        for (let k = 0; k < 5; k++) {
          const px = x + k * dx, py = y + k * dy, p = board[py][px];
          if (!p) { empty++; hole = [px, py]; }
          else if (G.countsFor(p, c)) own++;
          else { blocked = true; break; }
        }
        if (!blocked && own === 4 && empty === 1) wins.add(`${hole[0]},${hole[1]}`);
        if (!blocked && own === 3 && empty === 2) openThrees++;
      }
    }
    return { wins: wins.size, openThrees };
  }

  // 特殊勝利（旗・結束）に近い形も評価する。あと1つでそろう形は、4つ並びと同じくらい高い
  const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function specialScore(board, c) {
    let s = 0;
    const at = (x, y) => (G.inside(x, y) ? board[y][x] : undefined);
    for (let y = 0; y < G.SIZE; y++) {
      for (let x = 0; x < G.SIZE; x++) {
        const p = board[y][x];
        if (!p || p.color !== c) continue;
        if (p.ability === 'flag') {
          const cells = D4.map(([dx, dy]) => at(x + dx, y + dy));
          if (cells.some((q) => q === undefined)) continue; // 端の旗はそろわない
          const own = cells.filter((q) => q && q.color === c).length;
          const empty = cells.filter((q) => !q).length;
          if (own + empty === 4) s += own === 3 ? 1500 : own === 2 ? 60 : 5;
        }
      }
    }
    return s;
  }

  function evaluate(me) {
    const st = G.state;
    if (st.phase === 'end') {
      if (st.winner === me) return 1e9;
      if (st.winner === G.other(me)) return -1e9;
      return 0;
    }
    const mine = lineScore(st.board, me) + specialScore(st.board, me);
    const theirs = lineScore(st.board, G.other(me)) + specialScore(st.board, G.other(me));
    const mt = threatStats(st.board, me), ot = threatStats(st.board, G.other(me));
    return mine - 1.3 * theirs + mt.wins * 18000 - ot.wins * 24000
      + mt.openThrees * 45 - ot.openThrees * 65;
  }

  // ===== 状態の保存と復元（手を試すため） =====
  const KEYS = ['board', 'players', 'turn', 'selected', 'sealed', 'chainTurn', 'jammed', 'moveCount', 'phase', 'winner', 'winLine', 'lastMove'];
  // 状態のコピー。structuredClone より速いように、形の分かっているものだけを手で写す
  const copyPlayer = (p) => ({ ...p, bag: p.bag.map((c) => ({ ...c })), hand: p.hand.map((c) => ({ ...c })) });
  function clone(s) {
    const o = {};
    for (const k of KEYS) o[k] = s[k];
    o.board = s.board.map((row) => row.map((c) => c && { ...c }));
    o.players = { b: copyPlayer(s.players.b), w: copyPlayer(s.players.w) };
    o.winLine = s.winLine && s.winLine.map((q) => q.slice());
    o.lastMove = s.lastMove && s.lastMove.slice();
    return o;
  }
  function save() { return clone(G.state); }
  function restore(s) {
    Object.assign(G.state, clone(s));
    G.state.logs = [];
    G.state.fx = [];
  }

  // ===== 試すマス：石の近くを、まわりの石の多さで順位づけして上から取る =====
  function candidateCells(id, limit) {
    const st = G.state;
    const board = st.board;
    const near = [];
    const enemies = [];
    for (let y = 0; y < G.SIZE; y++) {
      for (let x = 0; x < G.SIZE; x++) {
        if (board[y][x]) {
          if (G.canPlaceAt(x, y, st.turn, id)) enemies.push([x, y]);
          continue;
        }
        let score = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if ((dx || dy) && G.inside(x + dx, y + dy) && board[y + dy][x + dx]) score += Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 3 : 1;
          }
        }
        if (score) near.push({ x, y, score: score + Math.random() });
      }
    }
    if (!near.length && !enemies.length) return [[5, 5], [4, 5], [5, 4], [6, 6]];
    near.sort((a, b) => b.score - a.score);
    return near.slice(0, limit).map((c) => [c.x, c.y]).concat(enemies.slice(0, 5));
  }

  function genMoves(limit) {
    const st = G.state;
    const moves = [];
    st.players[st.turn].hand.forEach((card, i) => {
      if (G.cardBlocked(card, st.turn)) return; // 連続のあとの連続は置けない
      const id = G.effectiveAbility(card, st.turn);
      const cells = candidateCells(id, limit);
      if (id === 'sniper') {
        // スナイパー：置くマスは上位3つ、撃つ石は、相手の石のうち仲間の多いもの上位6つ
        const me = st.turn, b = st.board, targets = [];
        for (let y = 0; y < G.SIZE; y++) for (let x = 0; x < G.SIZE; x++) {
          const p = b[y][x];
          if (!p || p.color === me || p.color === 'n' || p.ability === 'shield') continue;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = G.inside(x + dx, y + dy) && b[y + dy][x + dx]; if (q && q.color === p.color) n++; }
          targets.push({ x, y, n });
        }
        targets.sort((a, c) => c.n - a.n);
        for (const [x, y] of cells.slice(0, 3)) {
          if (!targets.length) moves.push({ i, x, y });
          for (const t of targets.slice(0, 6)) moves.push({ i, x, y, target: [t.x, t.y] });
        }
        return;
      }
      for (const [x, y] of cells) moves.push({ i, x, y });
    });
    return moves;
  }

  // 四の穴・旗の完成マス・石の近傍を playMove で試し、次の手の勝ちを確かめる。
  // 爆発・分身・スナイパーなども実際の能力解決後の勝敗で判定する。
  function hasImmediateWin(color, base) {
    const st = G.state;
    if (st.turn !== color || st.phase !== 'play') return false;
    for (let i = 0; i < st.players[color].hand.length; i++) {
      restore(base);
      st.selected = i;
      const card = st.players[color].hand[i];
      if (G.cardBlocked(card, color)) continue;
      const id = G.effectiveAbility(card, color);
      const cells = candidateCells(id, 18);
      const seen = new Set(cells.map(([x, y]) => `${x},${y}`));
      // 盤上の四の穴と、旗の最後の隣接マスは近傍順位に関係なく必ず含める。
      for (const [dx, dy] of G.LINE_DIRS) for (let y = 0; y < G.SIZE; y++) for (let x = 0; x < G.SIZE; x++) {
        const ex = x + 4 * dx, ey = y + 4 * dy;
        if (!G.inside(ex, ey)) continue;
        let own = 0, empty = 0, hole = null, blocked = false;
        for (let k = 0; k < 5; k++) {
          const px = x + k * dx, py = y + k * dy, p = st.board[py][px];
          if (!p) { empty++; hole = [px, py]; }
          else if (G.countsFor(p, color)) own++;
          else { blocked = true; break; }
        }
        if (!blocked && own === 4 && empty === 1) seen.add(`${hole[0]},${hole[1]}`);
      }
      for (let y = 0; y < G.SIZE; y++) for (let x = 0; x < G.SIZE; x++) {
        const p = st.board[y][x];
        if (!p || p.color !== color || p.ability !== 'flag') continue;
        for (const [dx, dy] of D4) if (G.inside(x + dx, y + dy) && !st.board[y + dy][x + dx]) seen.add(`${x + dx},${y + dy}`);
      }
      for (const key of seen) {
        const [x, y] = key.split(',').map(Number);
        if (!G.canPlaceAt(x, y, color, id)) seen.delete(key);
      }
      let targets = [null];
      if (id === 'sniper') {
        targets = [];
        for (let ty = 0; ty < G.SIZE; ty++) for (let tx = 0; tx < G.SIZE; tx++) {
          const p = st.board[ty][tx];
          if (p && p.color !== color && p.color !== 'n' && p.ability !== 'shield') targets.push([tx, ty]);
        }
        if (!targets.length) targets = [null];
      }
      for (const key of seen) {
        const [x, y] = key.split(',').map(Number);
        for (const target of targets) {
          restore(base);
          st.selected = i;
          if (G.playMove(x, y, target).winner === color) { restore(base); return true; }
          if (id !== 'sniper') break;
        }
      }
    }
    restore(base);
    return false;
  }

  // 四をつないで勝つ手順だけを調べる。ノード数と時間に上限を設ける。
  function findVCF(color, depth, budget) {
    const started = Date.now();
    function search(attacker, plies) {
      if (plies <= 0 || budget.nodes <= 0 || Date.now() - started >= budget.ms) return null;
      const node = save();
      const choices = [];
      for (const m of genMoves(10)) {
        if (--budget.nodes <= 0 || Date.now() - started >= budget.ms) break;
        restore(node);
        if (!apply(m).ok) continue;
        if (G.state.phase === 'end' && G.state.winner === attacker) return m;
        const threats = threatStats(G.state.board, attacker).wins;
        if (threats) choices.push({ m, score: evaluate(attacker), threats });
      }
      choices.sort((a, b) => b.threats - a.threats || b.score - a.score);
      for (const q of choices.slice(0, 4)) {
        restore(node);
        if (!apply(q.m).ok) continue;
        const after = save(), defender = G.state.turn;
        if (defender === attacker) return q.m;
        let forced = true;
        for (const reply of genMoves(8)) {
          if (--budget.nodes <= 0 || Date.now() - started >= budget.ms) { forced = false; break; }
          restore(after);
          if (!apply(reply).ok) continue;
          if (G.state.phase === 'end' && G.state.winner === defender) { forced = false; break; }
          if (threatStats(G.state.board, attacker).wins) continue;
          if (!search(attacker, plies - 2)) { forced = false; break; }
        }
        if (forced) return q.m;
      }
      restore(node);
      return null;
    }
    let best = null;
    for (let plies = 1; plies <= depth; plies += 2) {
      if (budget.nodes <= 0 || Date.now() - started >= budget.ms) break;
      const move = search(color, plies);
      if (move) best = move;
    }
    return best;
  }

  function apply(m) {
    G.state.selected = m.i;
    return G.playMove(m.x, m.y, m.target || null);
  }

  function chooseMove(opts = {}) {
    const { depth = 2, cells = 28, topK = 24, replyCells = 22, noise = 0 } = opts;
    const st = G.state;
    const me = st.turn;
    const base = save();

    // 1手目：全部試して評価する
    let first = [];
    for (const m of genMoves(cells)) {
      restore(base);
      if (!apply(m).ok) continue;
      first.push({ m, score: evaluate(me), end: G.state.phase === 'end' });
    }
    restore(base);
    if (!first.length) return null;
    first.sort((a, b) => b.score - a.score);
    // 即勝ちがあれば必ず取る。
    for (const f of first) if (f.end && f.score >= 1e9) { restore(base); return f.m; }

    // 相手が次の手で勝てるかを上位候補で実戦シミュレーションし、勝ちを許す手を落とす。
    // 読み時間を抑えつつ、少なくとも評価上位の防御候補はすべて検査する。
    let safe = [];
    for (let n = 0; n < first.length; n++) {
      if (n >= 8 && safe.length) break;
      const f = first[n];
      restore(base);
      if (!apply(f.m).ok) continue;
      if (G.state.phase === 'end' && G.state.winner === me) { restore(base); return f.m; }
      const next = save();
      const enemy = G.state.turn;
      const danger = enemy !== me && hasImmediateWin(enemy, next);
      if (!danger) safe.push(f);
    }
    if (safe.length) first = safe.concat(first.filter((f) => !safe.includes(f)));
    restore(base);
    const ownThreats = threatStats(base.board, me);
    if (ownThreats.wins || ownThreats.openThrees) {
      const vcf = findVCF(me, 5, { nodes: 60, ms: 14 });
      restore(base);
      if (vcf) return vcf;
    }
    if (depth < 2 || first[0].score >= 1e9) {
      const top = first.filter((f) => f.score >= first[0].score - noise);
      return top[Math.floor(Math.random() * top.length)].m;
    }

    // 2手目：上位の手について、次に打つ人のいちばん良い返し手まで読む（minimax）
    let best = null;
    for (const f of first.slice(0, topK)) {
      let value = f.score;
      if (!f.end) {
        restore(base);
        apply(f.m);
        const after = save();
        const mover = G.state.turn; // 連続なら自分のまま
        const replies = genMoves(replyCells);
        let reply = null;
        for (const r of replies) {
          restore(after);
          if (!apply(r).ok) continue;
          const v = evaluate(me);
          if (reply === null || (mover === me ? v > reply : v < reply)) reply = v;
        }
        if (reply !== null) value = reply;
      }
      value += Math.random() * noise;
      if (!best || value > best.value) best = { m: f.m, value };
    }
    restore(base);
    return best.m;
  }

  // ===== 取り合い：計測で勝率が高かった順に取る（少しぶれる） =====
  // tools/balance.mjs の結果（取った側の勝率、%。depth 2・3000局）。計測をやり直したら更新する
  const PICK_VALUE = { othello: 47, spy: 45, takeover: 38, grow: 37, diagBomb: 36, spin: 35, bomb: 35, colBomb: 35, chain: 35, spinBack: 34, cloneV: 33, cloneH: 33, seal: 33, clone: 32, rowBomb: 32, suck: 32, flag: 31, push: 30, jam: 30, go: 30, weight: 29, shield: 29, antigravity: 29, wall: 28, joker: 27, mine: 26, gravity: 26 };
  function draftPick(pool) {
    let best = null;
    for (const card of pool) {
      const v = (PICK_VALUE[card.ability] || 40) + Math.random() * 4;
      if (!best || v > best.v) best = { card, v };
    }
    return best.card;
  }

  const AI = { chooseMove, draftPick, evaluate, lineScore, save, restore, PICK_VALUE };
  if (typeof module !== 'undefined') module.exports = AI;
  else window.AI = AI;
})();
