// CPU の頭脳。ブラウザと Node の自動対戦で、同じ能力解決を使って手を読む。
(function () {
  const G = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('./script.js')
    : { state, LINE_DIRS, SIZE, inside, other, playMove, withMoveTrials, effectiveAbility, canPlaceAt, cardBlocked, canSnipe };

  const BOARD_SIZE = G.SIZE;
  const CELLS = BOARD_SIZE * BOARD_SIZE;
  const CENTER = (BOARD_SIZE - 1) / 2;
  const WIN = 1e9;
  const BOARD_KEYS = Array.from({ length: CELLS }, (_, key) => key);
  const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const WINDOW_SCORE = [0, 0, 13, 145, 2800, 0];
  const PRIORITY = [0, 2, 17, 105, 650];
  const WINDOWS = [];
  const OPEN_FOUR_WINDOWS = [];
  for (const [dx, dy] of G.LINE_DIRS) {
    for (const key of BOARD_KEYS) {
      const x = key % BOARD_SIZE, y = Math.floor(key / BOARD_SIZE);
      if (!G.inside(x + 4 * dx, y + 4 * dy)) continue;
      WINDOWS.push(Array.from({ length: 5 }, (_, n) => key + n * (dx + dy * BOARD_SIZE)));
      if (G.inside(x + 5 * dx, y + 5 * dy)) {
        OPEN_FOUR_WINDOWS.push(Array.from({ length: 6 }, (_, n) => key + n * (dx + dy * BOARD_SIZE)));
      }
    }
  }
  const ADJACENT = BOARD_KEYS.map((key) => {
    const x = key % BOARD_SIZE, y = Math.floor(key / BOARD_SIZE);
    return D4.map(([dx, dy]) => G.inside(x + dx, y + dy) ? key + dx + dy * BOARD_SIZE : -1);
  });
  const CENTER_BIAS = BOARD_KEYS.map((key) => BOARD_SIZE - Math.abs(key % BOARD_SIZE - CENTER) - Math.abs(Math.floor(key / BOARD_SIZE) - CENTER));
  const MIRROR = {
    clone: (x, y) => CELLS - 1 - (y * BOARD_SIZE + x),
    cloneH: (x, y) => y * BOARD_SIZE + BOARD_SIZE - 1 - x,
    cloneV: (x, y) => (BOARD_SIZE - 1 - y) * BOARD_SIZE + x,
    warp: (x, y) => CELLS - 1 - (y * BOARD_SIZE + x),
  };

  // 5マス窓を白黒まとめて数え、離れた四の穴も脅威として拾う。
  function analyze(board, candidates = false) {
    const cells = board.flat();
    const owners = cells.map((p) => !p ? 0 : p.ability === 'joker' ? 3 : p.color === 'b' ? 1 : p.color === 'w' ? 2 : 4);
    const scores = [0, 0];
    const wins = new Uint8Array(CELLS);
    const openings = candidates ? [new Float32Array(CELLS), new Float32Array(CELLS)] : null;
    const exposed = candidates ? new Float32Array(CELLS) : null;

    for (const window of WINDOWS) {
      let black = 0, white = 0, empty = 0, hole = 0, wall = false, poisoned = 0;
      for (const key of window) {
        const owner = owners[key];
        if (!owner) { empty++; hole = key; }
        else if (owner === 4) { wall = true; break; }
        else {
          black += owner & 1;
          white += owner >> 1;
          const stone = cells[key];
          if (stone.ability === 'spy' && stone.owner && stone.owner !== stone.color) poisoned |= owner;
        }
      }
      if (wall) continue;
      const shared = black + white + empty - 5; // ジョーカーは両方の色に数える
      for (let color = 0; color < 2; color++) {
        const own = color === 0 ? black : white;
        const opponent = color === 0 ? white : black;
        const open = opponent === shared;
        if (open) {
          if (poisoned & (1 << color)) continue;
          scores[color] += WINDOW_SCORE[own];
          if (own === 4 && empty === 1) wins[hole] |= 1 << color;
        }
        if (!candidates) continue;
        if (open && own) {
          for (const key of window) {
            if (!owners[key]) openings[color][key] += PRIORITY[own] || 0;
            else if (own >= 3) exposed[key] += own === 4 ? 190 : 28;
          }
        } else if (own === 4 && !empty) {
          // 乗っ取りで、相手の石がそのまま5つ目に変わる場合。
          const blocker = 2 - color;
          for (const key of window) if (owners[key] === blocker) exposed[key] += 900;
        }
      }
    }

    for (const [before, a, b, c, d, after] of OPEN_FOUR_WINDOWS) {
      if (owners[before] || owners[after]) continue;
      let sameColor = 3, hole = -1, count = 0;
      for (const key of [a, b, c, d]) {
        const owner = owners[key];
        if (!owner) { hole = key; continue; }
        if (cells[key].ability === 'spy' && cells[key].owner !== cells[key].color) { sameColor = 0; break; }
        sameColor &= owner;
        count++;
      }
      if (count !== 3 || !sameColor) continue;
      for (let color = 0; color < 2; color++) {
        if (!(sameColor & (1 << color))) continue;
        scores[color] += 480;
        if (candidates) openings[color][hole] += 190;
      }
    }

    for (const [key, p] of cells.entries()) {
      if (!p || (p.color !== 'b' && p.color !== 'w')) continue;
      const color = p.color === 'b' ? 0 : 1;
      scores[color] += 7 + CENTER_BIAS[key] * 0.55;
      if (p.ability === 'mine' || p.ability === 'shield') scores[color] += 12;
      if (p.ability !== 'flag' || ADJACENT[key].includes(-1)) continue;
      let own = 0, empty = 0, hole = 0;
      for (const neighbor of ADJACENT[key]) {
        const q = cells[neighbor];
        if (!q) { empty++; hole = neighbor; }
        else if (q.color === p.color) own++;
      }
      if (own + empty !== 4) continue;
      scores[color] += [4, 18, 110, 2800, 0][own];
      if (own === 3) {
        wins[hole] |= 1 << color;
        if (candidates) exposed[key] += 240;
      }
    }

    const threats = [0, 0];
    for (const mark of wins) {
      threats[0] += mark & 1;
      threats[1] += mark >> 1;
    }
    for (let color = 0; color < 2; color++) {
      scores[color] += threats[color] * 6200 + Math.max(0, threats[color] - 1) * 3600;
    }
    return { cells, scores, wins, openings, exposed };
  }

  function lineScore(board, color) {
    return analyze(board).scores[color === 'b' ? 0 : 1];
  }

  function evaluate(me) {
    const st = G.state;
    if (st.phase === 'end') {
      if (st.winner === me) return WIN;
      if (st.winner === G.other(me)) return -WIN;
      return 0;
    }
    const { scores } = analyze(st.board);
    const color = me === 'b' ? 0 : 1;
    return scores[color] - 1.18 * scores[1 - color];
  }

  // 手札のカードは変更しないため、並びだけコピーする。盤上の石は能力や色が変わるので個別に写す。
  const KEYS = ['board', 'players', 'turn', 'selected', 'sealed', 'chainTurn', 'jammed', 'moveCount', 'phase', 'winner', 'winLine', 'winKind', 'lastMove', 'target'];
  const copyPlayer = (p) => ({ ...p, bag: p.bag.slice(), hand: p.hand.slice() });
  function clone(s) {
    const copy = {};
    for (const key of KEYS) copy[key] = s[key];
    copy.board = s.board.map((row) => row.map((p) => p && { ...p }));
    copy.players = { b: copyPlayer(s.players.b), w: copyPlayer(s.players.w) };
    return copy;
  }
  function save() { return clone(G.state); }
  function restore(s) { Object.assign(G.state, clone(s)); }

  function sampleTrialWorld(position) {
    const world = clone(position);
    // 残りの内訳は使うが、実戦の並びを探索に渡さない。
    for (const { bag } of Object.values(world.players)) {
      bag.sort((a, b) => a.ability.localeCompare(b.ability) || a.id - b.id);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return world;
  }

  function genMoves(limit) {
    const st = G.state;
    const { cells, wins, openings, exposed } = analyze(st.board, true);
    const color = st.turn === 'b' ? 0 : 1;
    const positions = BOARD_KEYS.map((key) => {
      const x = key % BOARD_SIZE, y = Math.floor(key / BOARD_SIZE);
      let nearby = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && G.inside(x + dx, y + dy) && cells[key + dx + dy * BOARD_SIZE]) nearby += 5;
      }
      const priority = openings[color][key] + openings[1 - color][key] * 1.1;
      return { key, x, y, score: priority + CENTER_BIAS[key] + nearby };
    });
    const moves = [];
    const seen = new Set();
    st.players[st.turn].hand.forEach((card, i) => {
      if (G.cardBlocked(card, st.turn)) return;
      const id = G.effectiveAbility(card, st.turn);
      if (seen.has(id)) return;
      seen.add(id);
      const reflect = MIRROR[id];
      const places = positions.map((p) => {
        const mirrored = reflect?.(p.x, p.y);
        const critical = !!wins[p.key] || (mirrored !== undefined && !!wins[mirrored]);
        const reach = mirrored === undefined ? 0 : openings[color][mirrored] * 0.7 + openings[1 - color][mirrored] * 0.65;
        const priority = p.score + reach + (cells[p.key] ? exposed[p.key] * 2 : 0) + (critical ? 4000 : 0);
        return { ...p, critical, priority };
      }).sort((a, b) => b.priority - a.priority || a.key - b.key);
      let considered = 0;
      const targets = id === 'sniper' ? positions.filter(({ x, y }) => G.canSnipe(st.board, x, y, -1, -1))
        .sort((a, b) => {
          const target = ({ key, score }) => (cells[key].color === G.other(st.turn) ? 1000 + exposed[key] * 8 : 0) + score;
          return target(b) - target(a);
        }).slice(0, 8) : [];
      const cap = id === 'sniper' && targets.length ? Math.max(3, Math.ceil(limit / 3)) : limit;
      for (const { x, y, key, critical } of places) {
        // 上位の枠とは別に、四の穴と旗の完成マス、乗っ取り先も試す。
        if (considered >= cap && !critical && !(id === 'takeover' && cells[key] && exposed[key] >= 900)) continue;
        if (!G.canPlaceAt(x, y, st.turn, id)) continue;
        considered++;
        if (targets.length) {
          for (const t of targets) moves.push({ i, x, y, target: [t.x, t.y] });
        } else moves.push({ i, x, y });
      }
    });
    return moves;
  }

  function apply(move) {
    G.state.selected = move.i;
    return G.playMove(move.x, move.y, move.target || null, true).ok;
  }

  function chooseMove(opts = {}) {
    const { depth = 2, cells = 23, topK = 16, replyCells = 15, noise = 0, budgetMs = 120 } = opts;
    const st = G.state;
    if (st.phase !== 'play') return null;
    const me = st.turn;
    const deadline = performance.now() + budgetMs;
    const original = Object.fromEntries(KEYS.filter((key) => Object.hasOwn(st, key)).map((key) => [key, st[key]]));
    try {
      return G.withMoveTrials(() => {
        const root = sampleTrialWorld(original);
        restore(root);
        const first = [];
        for (const move of genMoves(cells)) {
          restore(root);
          if (!apply(move)) continue;
          const score = evaluate(me);
          if (score === WIN) return move;
          first.push({ move, score, end: st.phase === 'end' });
        }
        if (!first.length) return null;
        first.sort((a, b) => b.score - a.score);
        if (depth < 2) {
          const tied = first.filter(({ score }) => score >= first[0].score - noise);
          return noise ? tied[Math.floor(Math.random() * tied.length)].move : first[0].move;
        }

        let best = null;
        let bestValue = -Infinity;
        for (const [index, entry] of first.entries()) {
          // 上位がすべて即負けなら、防げる手を下位候補にも探す。
          if (index && (performance.now() >= deadline || (index >= topK && bestValue > -WIN))) break;
          let value = entry.score;
          if (!entry.end) {
            restore(root);
            apply(entry.move);
            const after = save();
            const maximize = st.turn === me;
            let result = maximize ? -Infinity : Infinity;
            for (const reply of genMoves(replyCells)) {
              restore(after);
              if (!apply(reply)) continue;
              const score = evaluate(me);
              result = maximize ? Math.max(result, score) : Math.min(result, score);
              if (result === (maximize ? WIN : -WIN) || (!maximize && result < bestValue - noise)) break;
            }
            if (Number.isFinite(result)) value = result;
          }
          if (noise && Math.abs(value) < WIN) value += Math.random() * noise;
          if (value > bestValue) { bestValue = value; best = entry.move; }
        }
        return best || first[0].move;
      });
    } finally {
      for (const key of KEYS) {
        if (Object.hasOwn(original, key)) st[key] = original[key];
        else delete st[key];
      }
    }
  }

  function chooseDeepMove({ budgetMs = 100 } = {}) {
    const st = G.state;
    if (st.phase !== 'play') return null;
    const me = st.turn;
    const deadline = performance.now() + budgetMs;
    const original = Object.fromEntries(KEYS.filter((key) => Object.hasOwn(st, key)).map((key) => [key, st[key]]));

    function visit(depth, alpha, beta) {
      if (performance.now() >= deadline) return null;
      if (!depth || st.phase === 'end') return evaluate(me);
      const position = save();
      const maximize = st.turn === me;
      let best = maximize ? -Infinity : Infinity;
      for (const move of genMoves(depth > 1 ? 6 : 5)) {
        restore(position);
        if (!apply(move)) continue;
        const value = visit(depth - 1, alpha, beta);
        if (value === null) return null;
        best = maximize ? Math.max(best, value) : Math.min(best, value);
        if (maximize) alpha = Math.max(alpha, best);
        else beta = Math.min(beta, best);
        if (alpha >= beta || best === (maximize ? WIN : -WIN)) break;
      }
      return Number.isFinite(best) ? best : evaluate(me);
    }

    try {
      return G.withMoveTrials(() => {
        const root = sampleTrialWorld(original);
        restore(root);
        const candidates = [];
        for (const move of genMoves(23)) {
          if (candidates.length && performance.now() >= deadline) break;
          restore(root);
          if (!apply(move)) continue;
          const score = evaluate(me);
          if (score === WIN) return move;
          candidates.push({ move, score });
        }
        if (!candidates.length) return null;
        candidates.sort((a, b) => b.score - a.score);
        let best = candidates[0].move;
        for (let depth = 2; performance.now() < deadline; depth++) {
          let alpha = -Infinity;
          let next = best;
          const ranked = candidates.slice().sort((a, b) => Number(b.move === best) - Number(a.move === best));
          for (const [index, candidate] of ranked.entries()) {
            if (index >= 10 && alpha > -WIN) break;
            restore(root);
            apply(candidate.move);
            const value = visit(depth - 1, alpha, Infinity);
            if (value === null) return best;
            if (value > alpha) {
              alpha = value;
              next = candidate.move;
            }
            if (alpha === WIN) return next;
          }
          best = next;
          if (depth >= root.players.b.hand.length + root.players.b.bag.length
            + root.players.w.hand.length + root.players.w.bag.length) break;
        }
        return best;
      });
    } finally {
      for (const key of KEYS) {
        if (Object.hasOwn(original, key)) st[key] = original[key];
        else delete st[key];
      }
    }
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

  const AI = { chooseMove, chooseDeepMove, draftPick, evaluate, lineScore, save, restore, PICK_VALUE };
  if (typeof module !== 'undefined') module.exports = AI;
  else globalThis.AI = AI;
})();
