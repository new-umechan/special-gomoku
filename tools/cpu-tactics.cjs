const assert = require('node:assert/strict');
const g = require('../script.js');
const ai = require('../ai.js');
const { state } = g;
function setup(hand, enemy = ['plain']) {
    g.setSeed(123456);
    Object.assign(state, {
        phase: 'play', mode: 'pvp', board: g.newBoard(), turn: 'b', selected: null, sealed: null, chainTurn: null,
        jammed: null, lastMove: null, fx: [], winLine: null, winner: undefined, moveCount: 12,
        logs: ['実際のログ'], players: { b: g.makePlayer('b', hand), w: g.makePlayer('w', enemy) },
    });
}
function put(color, x, y, id = 'plain') { state.board[y][x] = g.newPiece(color, id, state); }
function move(opts) {
    const board = state.board, players = state.players, logs = state.logs;
    const before = JSON.stringify(state);
    const uid = g.newPiece('b', 'plain', state).uid;
    const m = ai.chooseMove(opts);
    assert(m);
    assert.equal(g.newPiece('b', 'plain', state).uid, uid + 1);
    assert.equal(JSON.stringify(state), before);
    assert.strictEqual(state.board, board);
    assert.strictEqual(state.players, players);
    assert.strictEqual(state.logs, logs);
    state.selected = m.i;
    assert(g.playMove(m.x, m.y, m.target).ok);
    return m;
}
setup(['plain', 'bomb']);
for (const x of [2, 3, 5, 6]) put('b', x, 5);
for (const [x, y] of [[7,0],[8,0],[9,0],[7,1],[8,1],[9,1],[7,2],[8,2],[10,2]]) put('w', x, y);
assert.equal(move({ cells: 2 }).x, 4);
assert.equal(state.winner, 'b');

setup(['plain']);
put('b', 2, 3, 'flag');
for (const [x,y] of [[1,3],[3,3],[2,2]]) put('b', x, y);
assert.deepEqual([move({ cells: 1 }).x, state.lastMove[1]], [2,4]);
assert.equal(state.winner, 'b');
assert.equal(state.winKind, 'flag');

setup(['plain','warp']);
for (const x of [4, 5, 6, 7]) put('b', x, 8);
put('w',3,8);
const warpResult = move({ cells: 1 });
assert([2, 8].includes(warpResult.x));
assert.equal(state.winner, 'b');

setup(['plain', 'plain']);
for (const x of [0, 1, 3, 4]) put('w', x, 1);
for (const [x, y] of [[7, 8], [8, 8], [9, 8], [8, 9], [9, 9]]) put('b', x, y);
const block = move({ cells: 1, replyCells: 1 });
assert.deepEqual([block.x, block.y], [2, 1]);

setup(['plain', 'sniper'], ['plain','plain']);
for (const x of [2, 3, 4, 5]) put('w', x, 7);
const defense = move();
assert(defense.target && defense.target[1] === 7 && defense.target[0] >= 2 && defense.target[0] <= 5);
assert.equal(state.turn, 'w');
for (const x of [1, 2, 3, 4, 5, 6]) {
    if (state.board[7][x]) continue;
    const after = ai.save();
    state.selected = 0;
    assert(!g.playMove(x, 7, null, true).winner);
    ai.restore(after);
}
setup(['mystery','plain']);
put('w', 5, 5);
const plain = state.players.b.hand.findIndex(card => card.ability === 'mystery');
const before = g.snapshot(state.board);
ai.chooseMove();
assert.deepEqual(state.board, before);
state.selected = plain;
const rolled = g.playMove(4, 4).rolled;
setup(['mystery','plain']);
put('w', 5, 5);
state.selected = state.players.b.hand.findIndex(card => card.ability === 'mystery');
assert.equal(g.playMove(4, 4).rolled, rolled);
console.log('Broken four, flag, remote warp, sniper defense, simulation state, and mystery RNG verified.');

setup(['plain', 'plain'], ['plain', 'plain']);
for (const x of [3, 4, 5, 6]) put('b', x, 5);
const ordinary = ai.lineScore(state.board, 'b');
state.board[5][4] = g.newPiece('b', 'spy', state, { owner: 'w' });
assert(ai.lineScore(state.board, 'b') < ordinary);
const poisoned = JSON.stringify(state);
const safe = ai.chooseDeepMove({ budgetMs: 25 });
assert.equal(JSON.stringify(state), poisoned);
state.selected = safe.i;
assert.notEqual(g.playMove(safe.x, safe.y).winner, 'w');

setup(['plain', 'plain'], ['plain', 'plain']);
for (const x of [3, 4, 6]) put('b', x, 5);
const fork = ai.chooseDeepMove({ budgetMs: 25 });
assert.deepEqual([fork.x, fork.y], [5, 5]);
console.log('Spy owner, broken-three fork, and deep-search state restoration verified.');

function deepTrial() {
    const before = JSON.stringify(state);
    const move = ai.chooseDeepMove({ budgetMs: 35 });
    assert(move);
    assert.equal(JSON.stringify(state), before);
    state.selected = move.i;
    const result = g.playMove(move.x, move.y, move.target);
    assert(result.ok);
    return { move, result };
}

setup(['takeover']);
for (const x of [2, 3, 5, 6]) put('b', x, 5);
put('w', 4, 5);
assert.equal(deepTrial().result.winner, 'b');

setup(['flipAround']);
for (const x of [1, 2, 3]) put('b', x, 5);
for (const x of [4, 5]) put('w', x, 5);
assert.equal(deepTrial().result.winner, 'b');

setup(['fastForward']);
for (const x of [3, 4, 5, 6]) put('w', x, 5);
state.board[4][5] = g.newPiece('b', 'timeBomb', state, { fuse: 2 });
assert.equal(deepTrial().result.ability, 'fastForward');
assert.equal(g.hasReach(state.board, 'w'), false);
console.log('Takeover win, color-flip win, and accelerated bomb defense verified.');

function probeHiddenDraw(choose, reverse, search) {
    setup(['mystery', 'plain', 'plain'], ['plain', 'plain', 'plain']);
    state.players.b.bag = ['shield', 'spy', 'bomb'].map(g.makeCard);
    state.players.w.bag = ['nuke', 'wall', 'mine'].map(g.makeCard);
    if (reverse) for (const player of Object.values(state.players)) player.bag.reverse();
    const actualDraw = state.players.b.bag.at(-1).ability;
    const before = JSON.stringify(state), trace = [];
    const originalRandom = Math.random, originalPlay = g.playMove;
    const originalClock = globalThis.performance;
    let seed = 7, ticks = 0, move;
    if (search) {
        try {
            Math.random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32);
            globalThis.performance = { now: () => ticks++ };
            g.playMove = (...args) => {
                trace.push(Object.values(state.players).map(player => player.bag.at(-1)?.ability));
                return originalPlay(...args);
            };
            move = choose({ budgetMs: 80 });
        } finally {
            Math.random = originalRandom;
            g.playMove = originalPlay;
            globalThis.performance = originalClock;
        }
        assert.equal(JSON.stringify(state), before);
        assert(move);
        assert(trace.length > 0);
    }
    state.selected = state.players.b.hand.findIndex(card => card.ability === 'mystery');
    const result = g.playMove(0, 0);
    assert.equal(state.players.b.hand.at(-1).ability, actualDraw);
    return { move, trace, result: result.rolled };
}

for (const choose of [ai.chooseMove, ai.chooseDeepMove]) {
    const forward = probeHiddenDraw(choose, false, true);
    const reversed = probeHiddenDraw(choose, true, true);
    assert.deepEqual(forward, reversed);
    assert.equal(forward.result, probeHiddenDraw(choose, false, false).result);
}
console.log('Both CPU searches are independent of hidden bag order and preserve actual draws and mystery RNG.');

function probeGrowth(seed) {
    g.setSeed(seed);
    const position = { moveCount: 13 };
    const board = g.newBoard();
    board[5][5] = g.newPiece('b', 'grow', position, { age: 1 });
    const coordinates = () => g.growth(g.snapshot(board), 'b', position).map(({ x, y }) => [x, y]);
    const expected = coordinates();
    const random = Math.random;
    let simulated;
    try {
        Math.random = () => 0.25;
        simulated = g.withMoveTrials(coordinates);
    } finally {
        Math.random = random;
    }
    assert.equal(simulated.length, 1);
    assert.deepEqual(coordinates(), expected);
    return { expected, simulated };
}

const firstGrowth = probeGrowth(1), secondGrowth = probeGrowth(3);
assert.notDeepEqual(firstGrowth.expected, secondGrowth.expected);
assert.deepEqual(firstGrowth.simulated, secondGrowth.simulated);
console.log('Growth trials are independent of the real game seed and preserve the real growth result.');
