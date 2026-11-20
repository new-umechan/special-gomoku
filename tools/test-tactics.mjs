import assert from 'node:assert/strict';
import G from '../script.js';
import AI from '../ai.js';
import Tactics from '../tactics.js';

const { state } = G;

function setup(stones, hand = ['plain'], reply = ['plain']) {
  G.setSeed(7);
  Object.assign(state, {
    phase: 'play', board: G.newBoard(), turn: 'b', selected: 0, sealed: null,
    chainTurn: null, jammed: null, lastMove: null, winLine: null, winner: undefined,
    moveCount: 8, logs: [], fx: [], players: {
      b: G.makePlayer('b', [...hand, ...hand, ...hand]),
      w: G.makePlayer('w', [...reply, ...reply, ...reply]),
    },
  });
  for (const [x, y, color, ability = 'plain', owner] of stones) {
    state.board[y][x] = G.newPiece(color, ability, state, owner ? { owner } : {});
  }
}

const row = (length, color = 'w', y = 5) => Array.from({ length }, (_, i) => [i + 3, y, color]);
const rank = () => Tactics.rank(() => 0);

setup(row(3));
let best = rank()[0];
assert.equal(best.threes, 0);
assert.equal(best.move.y, 5);
assert.ok([2, 6].includes(best.move.x));
assert.equal(state.turn, 'b');
assert.equal(state.moveCount, 8);

setup(row(3), ['bomb']);
best = rank()[0];
assert.ok(AI.apply(best.move).ok);
assert.equal(Tactics.threats(state.board, 'w').threes, 0);

setup(row(4), ['bomb']);
best = rank()[0];
assert.equal(best.danger, 0);
assert.ok(AI.apply(best.move).ok);
assert.equal(Tactics.threats(state.board, 'w').finish.length, 0);

setup([...row(4), [2, 5, 'b']]);
best = rank()[0];
assert.deepEqual([best.move.x, best.move.y, best.danger], [7, 5, 0]);

setup([[2, 5, 'w'], [3, 5, 'w'], [5, 5, 'w'], [6, 5, 'w']]);
best = rank()[0];
assert.deepEqual([best.move.x, best.move.y, best.danger], [4, 5, 0]);

setup([[5, 5, 'w', 'flag'], [4, 5, 'w'], [6, 5, 'w'], [5, 4, 'w']]);
best = rank()[0];
assert.deepEqual([best.move.x, best.move.y, best.danger], [5, 6, 0]);

setup([...row(4), [2, 5, 'b'], [7, 4, 'b', 'mine']]);
let candidates = rank();
assert.ok(candidates.some(({ move, danger }) => move.x !== 7 && danger === 0));

setup([...row(4), [2, 5, 'b'], [7, 4, 'b', 'mine']], ['plain'], ['shield']);
candidates = rank();
assert.ok(candidates.some(({ move, danger }) => move.x === 0 && danger > 0));

const spy = row(4);
spy[0] = [3, 5, 'w', 'spy', 'b'];
setup([...spy, [2, 5, 'b']]);
candidates = rank();
assert.ok(candidates.some(({ move, danger }) => move.x !== 7 && danger === 0));

setup([...row(4), ...row(4, 'b', 8)]);
assert.equal(rank()[0].priority, 1e6);

for (const color of ['b', 'w']) {
  const line = row(4);
  line[1] = [4, 5, color, 'joker'];
  setup([...line, [2, 5, 'b']]);
  assert.deepEqual(Tactics.threats(state.board, 'w').finish, [[7, 5]]);
  assert.deepEqual([rank()[0].move.x, rank()[0].move.y], [7, 5]);
}

const poisoned = row(4, 'b');
poisoned[0] = [3, 5, 'b', 'spy', 'w'];
setup([...poisoned, [2, 5, 'w']], ['bomb'], ['joker']);
candidates = Tactics.rank(() => -0.9);
const ignoring = candidates.find(({ move }) => move.x === 0 && move.y === 0);
assert.ok(ignoring.poison > 0 && ignoring.danger > 0);
assert.equal(candidates[0].danger, 0);
assert.equal(candidates[0].poison, 0);
setup([...poisoned, [2, 5, 'w']]);
assert.equal(rank().find(({ move }) => move.x === 7 && move.y === 5).score, -1);
console.log('Passed open-three, blast, straight and gapped four, flag, mine, shield, joker, spy and own-win scenarios.');

const { default: CNN } = await import('../cnn.js');
const { default: Spatial } = await import('../spatial.js');
const { default: modelPayload } = await import('../models/cnn-practice.js');
const model = CNN.evaluator(modelPayload);

function withSearchSeed(run) {
  const random = Math.random;
  let seed = 123;
  Math.random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32);
  try { return run(); } finally { Math.random = random; }
}

setup([[4, 5, 'b'], [6, 4, 'w']], ['mystery', 'plain', 'bomb'], ['plain', 'mine', 'joker']);
const original = AI.save();
const reversed = AI.save();
for (const player of Object.values(reversed.players)) player.bag.reverse();
const draws = original.players.b.bag.map(card => card.ability);
assert.notDeepEqual(draws, reversed.players.b.bag.map(card => card.ability));
for (const choose of [
  () => AI.chooseMove(),
  () => CNN.attentionMove(model),
]) {
  AI.restore(original);
  const first = withSearchSeed(choose);
  assert.deepEqual(AI.save(), original);
  AI.restore(reversed);
  assert.deepEqual(withSearchSeed(choose), first);
  assert.deepEqual(AI.save(), reversed);
}

function simulatedDraw(snapshot) {
  AI.restore(snapshot);
  return withSearchSeed(() => AI.onePlyOutcomes(
    st => st.players.b.hand.at(-1).ability, 0, 2,
    [{ i: 0, x: 5, y: 5 }],
  )[0].outcomes);
}
assert.deepEqual(simulatedDraw(original), simulatedDraw(reversed));

function playMystery(afterSearch) {
  setup([], ['mystery'], ['plain']);
  if (afterSearch) withSearchSeed(() => CNN.attentionMove(model));
  const result = AI.apply({ i: 0, x: 5, y: 5 });
  return [result.rolled, state.players.b.hand.map(card => card.ability)];
}
assert.deepEqual(playMystery(true), playMystery(false));

setup([[5, 5, 'b', 'unseen-ability']], ['plain']);
state.players.b.hand[0].ability = 'unseen-ability';
const unfamiliar = Spatial.encode(state);
const unfamiliarValue = model.score(state);
assert.ok(Number.isFinite(unfamiliarValue));
state.board[5][5].ability = 'plain';
state.players.b.hand[0].ability = 'plain';
assert.deepEqual(Spatial.encode(state), unfamiliar);
assert.equal(model.score(state), unfamiliarValue);
console.log('Passed hidden bag permutation, isolated game RNG and unknown ability fallback scenarios.');
