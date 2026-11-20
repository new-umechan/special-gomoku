// Tactical checks use the same placement and victory rules as the game.
(function () {
  const node = typeof module !== 'undefined' && typeof require === 'function';
  const G = node ? require('./script.js') : {
    state, SIZE, LINE_DIRS, inside, other, countsFor, effectiveAbility, cardBlocked, canPlaceAt, canSnipe,
  };
  const AI = node ? require('./ai.js') : window.AI;
  const adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cell = (b, x, y) => G.inside(x, y) ? b[y][x] : undefined;
  const key = (x, y) => y * G.SIZE + x;
  const allCells = Array.from({ length: G.SIZE ** 2 }, (_, i) => [i % G.SIZE, Math.floor(i / G.SIZE)]);

  function threats(board, color) {
    const finish = new Map();
    const stones = new Map();
    const threes = new Set();
    const poisonedFinish = new Map();
    let poison = 0;
    for (const [x, y] of allCells) {
      const first = board[y][x];
      if (first?.ability === 'flag' && first.color === color) {
        const ring = adjacent.map(([dx, dy]) => [x + dx, y + dy]);
        const empty = ring.filter(([px, py]) => cell(board, px, py) === null);
        if (empty.length === 1 && ring.filter(([px, py]) => cell(board, px, py)?.color === color).length === 3) {
          finish.set(key(...empty[0]), empty[0]);
          for (const p of [[x, y], ...ring]) if (cell(board, ...p)) stones.set(key(...p), p);
        }
      }
      if (first && !G.countsFor(first, color)) continue;
      for (const [dx, dy] of G.LINE_DIRS) {
        if (G.inside(x + 4 * dx, y + 4 * dy)) {
          let empty = null;
          let count = 0;
          let blanks = 0;
          let enemySpy = false;
          for (let i = 0; i < 5; i++) {
            const p = board[y + i * dy][x + i * dx];
            if (!p) {
              empty = [x + i * dx, y + i * dy];
              blanks++;
            } else if (G.countsFor(p, color)) {
              count++;
              enemySpy ||= p.ability === 'spy' && !!p.owner && p.owner !== color;
            }
          }
          const poisonedThree = enemySpy && count === 3 && blanks === 2;
          if (poisonedThree) poison++;
          if (count === 4 && empty) {
            finish.set(key(...empty), empty);
            if (enemySpy) poisonedFinish.set(key(...empty), empty);
          }
          if ((count === 4 && empty) || poisonedThree) {
            for (let i = 0; i < 5; i++) {
              const px = x + i * dx, py = y + i * dy;
              if (board[py][px]) stones.set(key(px, py), [px, py]);
            }
          }
        }
        if (!G.countsFor(first, color)
            || !G.countsFor(cell(board, x + dx, y + dy), color)
            || !G.countsFor(cell(board, x + 2 * dx, y + 2 * dy), color)
            || cell(board, x - dx, y - dy) !== null
            || cell(board, x + 3 * dx, y + 3 * dy) !== null) continue;
        // A three can become an open four only if at least one side has room.
        if (cell(board, x - 2 * dx, y - 2 * dy) !== null
            && cell(board, x + 4 * dx, y + 4 * dy) !== null) continue;
        // Completing the apparent line rewards the embedded enemy spy.
        if ([0, 1, 2].some(i => {
          const p = board[y + i * dy][x + i * dx];
          return p.ability === 'spy' && p.owner && p.owner !== color;
        })) continue;
        threes.add(`${x},${y},${dx},${dy}`);
        for (let i = 0; i < 3; i++) {
          const px = x + i * dx, py = y + i * dy;
          stones.set(key(px, py), [px, py]);
        }
      }
    }
    return {
      finish: [...finish.values()], stones: [...stones.values()], threes: threes.size,
      poisonedFinish: [...poisonedFinish.values()], poison: poison + 3 * poisonedFinish.size,
    };
  }

  function addMoves(moves, locations, targets, includeUntargeted = true) {
    const st = G.state;
    st.players[st.turn].hand.forEach((card, i) => {
      if (G.cardBlocked(card, st.turn)) return;
      const id = G.effectiveAbility(card, st.turn);
      for (const [x, y] of locations) {
        if (!G.canPlaceAt(x, y, st.turn, id)) continue;
        if (id === 'sniper') {
          for (const target of targets) {
            if (G.canSnipe(st.board, ...target, x, y)) moves.push({ i, x, y, target });
          }
        } else if (includeUntargeted) moves.push({ i, x, y });
      }
    });
  }

  function candidates(ours, theirs, cells) {
    const moves = AI.genMoves(cells);
    if (!moves.length || theirs.finish.length || theirs.threes || ours.finish.length || ours.poison) {
      // Any empty cell can be a useful blast, rotation or warp origin.
      addMoves(moves, allCells, []);
      const aimOrigins = [...ours.finish, ...theirs.finish,
        ...moves.filter(m => m.target).map(m => [m.x, m.y])];
      if (!aimOrigins.length) aimOrigins.push(...moves.slice(0, 3).map(m => [m.x, m.y]));
      addMoves(moves, aimOrigins, [...theirs.stones, ...(ours.poison ? ours.stones : [])], false);
    }
    return [...new Map(moves.map(m => [[m.i, m.x, m.y, ...(m.target ?? [])].join(','), m])).values()];
  }

  function immediateWins(attack) {
    if (!attack.finish.length) return 0;
    const st = G.state;
    const mover = st.turn;
    const replies = [];
    addMoves(replies, attack.finish, attack.stones);
    return AI.onePlyOutcomes(s => s.phase === 'end' && s.winner === mover, 0, 4, replies)
      .filter(({ outcomes }) => outcomes.some(Boolean)).length;
  }

  function priority(score, danger, threes, poison = 0) {
    return score === 1 ? 1e6 : score === -1 ? -1e6
      : score - 100 * Number(danger > 0) - 0.1 * danger - 2 * threes - 2 * poison;
  }

  function rank(evaluate, cells = 14) {
    const me = G.state.turn;
    const enemy = G.other(me);
    const ours = threats(G.state.board, me);
    const theirs = threats(G.state.board, enemy);
    const moves = candidates(ours, theirs, cells);
    const tried = AI.onePlyOutcomes((st) => {
      if (st.phase === 'end') return { score: st.winner === me ? 1 : st.winner ? -1 : 0, danger: st.winner === enemy ? 100 : 0, threes: 0, poison: 0 };
      const attack = threats(st.board, enemy);
      const defense = threats(st.board, me);
      const finish = defense.poisonedFinish.length
        ? [...new Map([...attack.finish, ...defense.poisonedFinish].map(p => [key(...p), p])).values()]
        : attack.finish;
      const danger = st.turn === enemy ? immediateWins({ ...attack, finish }) : 0;
      return { score: evaluate(st) * (st.turn === me ? 1 : -1), danger, threes: attack.threes, poison: defense.poison };
    }, cells, 4, moves);
    return tried.map(({ move, outcomes }) => {
      const average = field => outcomes.reduce((sum, o) => sum + o[field], 0) / outcomes.length;
      const score = average('score');
      const danger = average('danger');
      const threes = average('threes');
      const poison = average('poison');
      return { move, score, danger, threes, poison, priority: priority(score, danger, threes, poison) };
    }).sort((a, b) => b.priority - a.priority);
  }

  const tactics = { threats, rank, priority };
  if (node) module.exports = tactics;
  else window.Tactics = tactics;
})();
