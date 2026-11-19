const g = require(process.argv[2] || require('path').join(__dirname, '..', 'script.js'));
const assert = require('assert');
const { ABILITIES, findWin, lineOwner, newBoard, state, makePlayer, makeCard, settle, goTraps } = g;
let uid = 1000;
const P = (c, a = 'plain', owner) => ({ color: c, ability: a, placedAt: 0, owner, uid: uid++ });
let b, fx;

// 種類
assert.equal(g.SPECIAL_IDS.length, 31, 'count');
for (const id of ['four', 'double', 'magnet', 'lonely', 'flip']) assert(!(id in ABILITIES), 'removed ' + id);
for (const id of g.SPECIAL_IDS) assert(g.ICONS[id], 'icon for ' + id);
for (const id of g.SPECIAL_IDS) assert(g.COST[id], 'cost for ' + id);
// スターターデッキはどれも24ポイント、同じ超能力は3つまで
for (const st of g.STARTERS) {
  assert.equal(g.deckPoints(st.deck), g.DECK_POINTS, 'starter points ' + st.id);
  for (const [id, n] of Object.entries(st.deck)) assert(id === 'plain' || n <= g.MAX_COPIES, 'copies ' + id);
}
assert.equal(g.makePlayer('b', { plain: 3, nuke: 2 }).bag.length + 3, 5, 'deck to bag');

// 揃い
b = newBoard(); for (let i = 0; i < 5; i++) b[3][i] = P('b'); assert(findWin(b, 'b')); assert(!findWin(b, 'w'));
b = newBoard(); for (let i = 0; i < 4; i++) b[5][i] = P('b'); b[5][4] = P('w', 'joker'); assert(findWin(b, 'b'), 'joker');
b = newBoard(); for (let i = 0; i < 5; i++) b[2][i] = P('b'); b[2][2] = P('n', 'block'); assert(!findWin(b, 'b'), 'block cuts');
b = newBoard(); for (let i = 0; i < 5; i++) b[1][i] = P('w'); b[1][2] = P('w', 'spy', 'b');
assert.equal(lineOwner(b, findWin(b, 'w'), 'w'), 'b', 'spy');

// 置いたときの効果
b = newBoard(); b[5][6] = P('w'); b[5][5] = P('b', 'push'); ABILITIES.push.onPlace(b, 5, 5, 'b'); assert(b[5][7] && !b[5][6], 'push');
b = newBoard(); b[0][0] = P('w'); b[1][1] = P('b', 'push'); ABILITIES.push.onPlace(b, 1, 1, 'b'); assert(!b[0][0], 'push off');
b = newBoard(); b[5][7] = P('w'); b[5][5] = P('b', 'suck'); ABILITIES.suck.onPlace(b, 5, 5, 'b'); assert(b[5][6] && !b[5][7], 'suck');
b = newBoard(); b[4][4] = P('w'); b[5][5] = P('b', 'bomb'); ABILITIES.bomb.onPlace(b, 5, 5, 'b'); assert(!b[4][4] && b[5][5], 'bomb keeps itself');
b = newBoard(); b[4][2] = P('w'); b[4][1] = P('w'); b[4][6] = P('w'); b[3][4] = P('w'); b[4][4] = P('b', 'rowBomb'); ABILITIES.rowBomb.onPlace(b, 4, 4, 'b'); assert(!b[4][2] && b[4][1] && !b[4][6] && b[4][4] && b[3][4], 'rowBomb range 2');
b = newBoard(); b[0][4] = P('w'); b[2][4] = P('w'); b[4][4] = P('b', 'colBomb'); ABILITIES.colBomb.onPlace(b, 4, 4, 'b'); assert(b[0][4] && !b[2][4] && b[4][4], 'colBomb range 2');
b = newBoard(); b[0][0] = P('w'); b[2][2] = P('w'); b[6][2] = P('w'); b[4][5] = P('w'); b[4][4] = P('b', 'diagBomb'); ABILITIES.diagBomb.onPlace(b, 4, 4, 'b');
assert(b[0][0] && !b[2][2] && !b[6][2] && b[4][5] && b[4][4], 'diagBomb range 2');
b = newBoard(); b[5][6] = P('w'); b[5][7] = P('w'); b[5][8] = P('b'); b[5][5] = P('b', 'othello');
ABILITIES.othello.onPlace(b, 5, 5, 'b'); assert(b[5][6].color === 'w' && b[5][7].color === 'w', 'othello: two sandwiched -> none');
b = newBoard(); b[5][6] = P('w'); b[5][7] = P('b'); b[5][5] = P('b', 'othello'); ABILITIES.othello.onPlace(b, 5, 5, 'b'); assert(b[5][6].color === 'b', 'othello: exactly one');
b = newBoard(); b[5][6] = P('w'); b[5][7] = P('b'); b[4][5] = P('w'); b[3][5] = P('b'); b[5][5] = P('b', 'othello'); ABILITIES.othello.onPlace(b, 5, 5, 'b');
assert([b[5][6].color, b[4][5].color].filter((c) => c === 'b').length === 1, 'othello: only one flip');
b = newBoard(); b[5][6] = P('w'); b[5][5] = P('b', 'othello'); assert.equal(ABILITIES.othello.onPlace(b, 5, 5, 'b').length, 0, 'othello needs sandwich');
b = newBoard(); b[4][6] = P('w'); b[5][5] = P('b', 'spin'); ABILITIES.spin.onPlace(b, 5, 5, 'b'); assert(b[5][6] && !b[4][6], 'spin');
b = newBoard(); b[4][6] = P('w'); b[5][5] = P('b', 'spinBack'); ABILITIES.spinBack.onPlace(b, 5, 5, 'b'); assert(b[4][5] && !b[4][6], 'spinBack');
b = newBoard(); ABILITIES.clone.onPlace(b, 2, 1, 'b'); assert(b[9][8], 'clone');
b = newBoard(); ABILITIES.cloneH.onPlace(b, 2, 1, 'b'); assert(b[1][8] && b[1][8].color === 'b', 'cloneH');
b = newBoard(); ABILITIES.cloneV.onPlace(b, 2, 1, 'b'); assert(b[9][2], 'cloneV');
b = newBoard(); b[5][6] = P('w'); b[5][5] = P('b', 'wall'); ABILITIES.wall.onPlace(b, 5, 5, 'b');
assert(b[4][5].color === 'n' && b[5][6].color === 'w', 'wall');

// 重し・盾
b = newBoard(); b[5][6] = P('w', 'weight'); b[5][5] = P('b', 'push'); ABILITIES.push.onPlace(b, 5, 5, 'b'); assert(b[5][6] && !b[5][7], 'weight not pushed');
b = newBoard(); b[4][6] = P('w', 'weight'); b[4][5] = P('w'); b[5][5] = P('b', 'spin'); ABILITIES.spin.onPlace(b, 5, 5, 'b');
assert(b[4][6] && b[4][6].ability === 'weight', 'weight not spun');
b = newBoard(); b[4][4] = P('w', 'shield'); b[5][5] = P('b', 'bomb'); ABILITIES.bomb.onPlace(b, 5, 5, 'b'); assert(b[4][4], 'shield survives bomb');

// 重力はいつでも効く：回転で動かされたあと落ちる
b = newBoard(); b[4][6] = P('w', 'gravity'); b[5][5] = P('b', 'spin'); ABILITIES.spin.onPlace(b, 5, 5, 'b');
assert(b[5][6] && b[5][6].ability === 'gravity');
settle(b); assert(b[10][6] && b[10][6].ability === 'gravity' && !b[5][6], 'gravity after spin');
b = newBoard(); b[9][3] = P('b', 'gravity'); settle(b); assert(b[10][3] && b[10][3].ability === 'gravity', 'gravity to edge');
b = newBoard(); b[2][3] = P('b', 'gravity'); b[5][3] = P('w', 'gravity'); settle(b);
assert(b[10][3].color === 'w' && b[9][3].color === 'b', 'gravity stack order');
b = newBoard(); b[8][3] = P('b', 'antigravity'); b[2][3] = P('w'); settle(b); assert(b[3][3] && b[3][3].ability === 'antigravity', 'antigravity');
// 向かい合うと押し合って止まる。背中合わせなら離れていく
b = newBoard(); b[5][3] = P('b', 'gravity'); b[6][3] = P('w', 'antigravity'); settle(b);
assert(b[5][3].ability === 'gravity' && b[6][3].ability === 'antigravity', 'gravity vs antigravity facing');
b = newBoard(); b[6][3] = P('b', 'gravity'); b[5][3] = P('w', 'antigravity'); settle(b);
assert(b[10][3].ability === 'gravity' && b[0][3].ability === 'antigravity', 'gravity vs antigravity apart');

// 囲碁は罠として残る
b = newBoard(); b[5][5] = P('w'); b[5][6] = P('b', 'go'); b[4][5] = P('b'); b[6][5] = P('b');
goTraps(b); assert(b[5][5], 'go: still free');
b[5][4] = P('b'); goTraps(b); assert(!b[5][5], 'go: captured later');
b = newBoard(); b[0][0] = P('w'); b[0][1] = P('w'); b[1][0] = P('b'); b[1][1] = P('b'); b[0][2] = P('b', 'go'); goTraps(b); assert(!b[0][0] && !b[0][1], 'go group corner');
b = newBoard(); b[5][5] = P('w', 'shield'); b[5][6] = P('b', 'go'); b[4][5] = P('b'); b[6][5] = P('b'); b[5][4] = P('b'); goTraps(b); assert(b[5][5], 'shield vs go');

// 対局の流れ
function setup() {
  state.phase = 'play'; state.board = newBoard(); state.logs = []; state.moveCount = 0; state.sealed = null; state.winLine = null;
  state.players = { b: makePlayer('b', []), w: makePlayer('w', []) };
  state.turn = 'b';
}
const forceHand = (c, ids) => { state.players[c].hand = ids.map(makeCard); };
const pick = (id) => { state.selected = state.players[state.turn].hand.findIndex((c) => c.ability === id); assert(state.selected >= 0, 'has ' + id); };

setup(); state.board[5][5] = P('w', 'mine'); forceHand('b', ['plain', 'plain', 'plain']);
state.selected = 0; let r = g.playMove(6, 6); assert(r.ok && !state.board[5][5] && !state.board[6][6], 'mine');
setup(); state.board[5][5] = P('b', 'mine'); forceHand('b', ['plain', 'plain', 'plain']); state.selected = 0; g.playMove(6, 6); assert(state.board[5][5] && state.board[6][6], 'own mine');
setup(); forceHand('b', ['gravity', 'plain', 'plain']); pick('gravity'); r = g.playMove(4, 2);
assert(state.board[10][4] && r.steps.length === 2 && state.lastMove[1] === 10, 'gravity placed falls');
setup(); state.board[10][4] = P('w'); state.board[9][4] = P('w', 'gravity'); forceHand('b', ['rowBomb', 'plain', 'plain']); pick('rowBomb'); g.playMove(2, 10);
assert(state.board[10][4] && state.board[10][4].ability === 'gravity', 'bomb removes support -> falls');
setup(); state.board[3][3] = P('w', 'shield'); forceHand('b', ['takeover', 'plain', 'plain']); pick('takeover'); assert(!g.playMove(3, 3).ok, 'takeover vs shield');
// スパイを先に置いておき、相手が自分で5つ目を置くと、スパイの持ち主の勝ち
setup(); for (let i = 0; i < 3; i++) state.board[0][i] = P('w'); state.board[0][4] = P('w', 'spy', 'b'); state.turn = 'w'; forceHand('w', ['plain', 'plain', 'plain']); state.selected = 0;
assert.equal(g.playMove(3, 0).winner, 'b', 'spy');
setup(); forceHand('b', ['seal', 'plain', 'plain']); forceHand('w', ['push', 'plain', 'plain']); pick('seal'); g.playMove(0, 0);
state.selected = 0; g.playMove(5, 5); assert.equal(state.board[5][5].ability, 'plain', 'sealed');

setup(); state.players = { b: makePlayer('b', ['chain', 'chain', 'chain', 'chain', 'chain', 'chain'].map(makeCard)), w: makePlayer('w', ['bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'].map(makeCard)) };
let moves = 0;
for (let n = 0; n < 200 && state.phase === 'play'; n++) {
  const empties = [];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (!state.board[y][x]) empties.push([x, y]);
  const [x, y] = empties[(n * 53) % empties.length];
  state.selected = 0;
  assert(g.playMove(x, y).ok); moves++;
}
assert.equal(moves, 12, '12 pieces');
// AI：勝てる手があれば打つ
const AI = require(require('path').join(__dirname, '..', 'ai.js'));
setup(); for (let i = 0; i < 4; i++) state.board[3][i + 2] = P('b'); forceHand('b', ['plain', 'plain', 'plain']);
let m = AI.chooseMove({ depth: 2 }); assert(m && m.y === 3 && (m.x === 1 || m.x === 6), 'ai wins');
// AI：相手の4つを止める
setup(); for (let i = 0; i < 4; i++) state.board[7][i + 2] = P('w'); state.board[0][0] = P('b'); forceHand('b', ['plain', 'plain', 'plain']); forceHand('w', ['plain', 'plain', 'plain']);
m = AI.chooseMove({ depth: 2 }); assert(m && m.y === 7 && (m.x === 1 || m.x === 6), 'ai blocks');
// 特殊勝利
b = newBoard(); b[5][5] = P('b', 'flag'); b[4][5] = P('b'); b[6][5] = P('b'); b[5][4] = P('b'); assert(!g.specialWin(b, 'b'), 'flag 3');
b[5][6] = P('b'); assert.equal(g.specialWin(b, 'b').length, 5, 'flag win');
b = newBoard(); b[0][5] = P('b', 'flag'); b[0][4] = P('b'); b[0][6] = P('b'); b[1][5] = P('b'); assert(!g.specialWin(b, 'b'), 'flag on edge');
// 増殖：2回に1回、上から時計回りに増える
setup(); forceHand('b', ['grow', 'plain', 'plain', 'plain']); forceHand('w', ['plain', 'plain', 'plain']);
pick('grow'); g.playMove(5, 5); assert(!state.board[4][5], 'grow: not on first move');
state.selected = 0; g.playMove(0, 0); // 白
state.selected = 0; g.playMove(10, 10); // 黒の2回目 → 増える
assert(state.board[5][6] || state.board[4][5] || state.board[6][5] || state.board[5][4], 'grow: grows on 2nd turn');
const grownCount = [[5, 4], [6, 5], [5, 6], [4, 5]].filter(([x, y]) => state.board[y][x]).length; assert.equal(grownCount, 1, 'grow: one stone');
// おじゃま：まわりの碁石の超能力を消す（白黒どちらも）。離れた碁石と石垣はそのまま
b = newBoard(); b[4][4] = P('w', 'bomb'); b[5][6] = P('b', 'grow'); b[6][6] = P('w', 'spy', 'b'); b[3][3] = P('w', 'shield'); b[4][5] = P('n', 'block');
fx = ABILITIES.jam.onPlace(b, 5, 5, 'b');
assert(b[4][4].ability === 'plain' && b[5][6].ability === 'plain' && b[6][6].ability === 'plain' && !b[6][6].owner, 'jam neutralizes neighbors');
assert(b[3][3].ability === 'shield' && b[4][5].ability === 'block' && fx.length === 3, 'jam only 8 neighbors, not blocks');
// 重力の連鎖：下に続く石をまとめて押して落ちる
b = newBoard(); b[3][2] = P('b', 'gravity'); b[4][2] = P('w'); b[5][2] = P('b'); settle(b);
assert(b[10][2] && b[10][2].color === 'b' && b[9][2].color === 'w' && b[8][2].ability === 'gravity' && !b[3][2], 'gravity chain');
b = newBoard(); b[3][2] = P('b', 'gravity'); b[4][2] = P('w', 'weight'); settle(b); assert(b[3][2] && b[4][2], 'weight stops chain');
b = newBoard(); b[7][2] = P('b', 'antigravity'); b[6][2] = P('w'); settle(b); assert(b[0][2].color === 'w' && b[1][2].ability === 'antigravity', 'antigravity chain');
// 核：5×5を消す。自分は残る。盾は残る
b = newBoard(); b[3][3] = P('w'); b[7][7] = P('w'); b[8][8] = P('w'); b[5][3] = P('w', 'shield'); b[5][5] = P('b', 'nuke');
ABILITIES.nuke.onPlace(b, 5, 5, 'b'); assert(!b[3][3] && !b[7][7] && b[8][8] && b[5][3] && b[5][5], 'nuke');
// 分身で増えた石でも、地雷が起爆する
setup(); state.board[5][0] = P('w', 'mine'); forceHand('b', ['cloneH', 'plain', 'plain']); pick('cloneH'); r = g.playMove(9, 5);
assert(!state.board[5][1] && !state.board[5][0] && state.board[5][9], 'mine on clone');
// スパイ：相手があと1つで揃う場所（リーチの場所）には置けない。ほかの場所には置ける
setup(); for (let i = 0; i < 4; i++) state.board[2][i] = P('w'); forceHand('b', ['spy', 'plain', 'plain']); pick('spy');
assert(!g.cardBlocked(state.players.b.hand[state.selected], 'b'), 'spy card usable');
assert(!g.playMove(4, 2).ok, 'spy not on reach cell');
assert(g.playMove(8, 8).ok, 'spy elsewhere ok');
// 連続：連続でもらった手では、連続は置けない
setup(); forceHand('b', ['chain', 'chain', 'plain']); forceHand('w', ['plain', 'plain', 'plain']); pick('chain'); g.playMove(1, 1);
assert.equal(state.turn, 'b', 'chain extra turn'); assert.equal(state.chainTurn, 'b');
pick('chain'); assert(g.cardBlocked(state.players.b.hand[state.selected], 'b'), 'chain blocked after chain'); assert(!g.playMove(3, 3).ok, 'chain cannot follow chain');
state.selected = state.players.b.hand.findIndex((c) => c.ability === 'plain'); assert(g.playMove(3, 3).ok); assert.equal(state.turn, 'w'); assert.equal(state.chainTurn, null);
// 時限爆弾：置いた手では爆発しない。相手の1手のあと、自分の次の手で爆発して、まわりと自分が消える
setup(); forceHand('b', ['timeBomb', 'plain', 'plain']); forceHand('w', ['plain', 'plain', 'plain']);
state.board[4][4] = P('w'); state.board[6][6] = P('b'); state.board[5][3] = P('w', 'shield');
pick('timeBomb'); g.playMove(5, 5);
assert(state.board[5][5] && state.board[5][5].fuse === 2 && state.board[4][4], 'time bomb placed, not yet');
state.selected = 0; g.playMove(0, 0);
assert(state.board[5][5].fuse === 1 && state.board[4][4], 'after opponent move');
state.selected = 0; r = g.playMove(10, 10);
assert(!state.board[5][5] && !state.board[4][4] && !state.board[6][6] && state.board[5][3] && state.board[10][10], 'time bomb exploded');
assert(r.steps.some((st) => st.fx.some((f) => f.kind === 'boom')), 'boom fx');
// ワープ：3×3を点対称の位置へ。飛んだ先は上書き。盾の上には飛ばない。重しは動かない
b = newBoard(); b[2][2] = P('b', 'warp'); b[1][1] = P('w'); b[2][3] = P('b'); b[3][1] = P('w', 'weight');
b[9][9] = P('w'); b[8][7] = P('w', 'shield');
fx = ABILITIES.warp.onPlace(b, 2, 2, 'b');
assert(!b[2][2] && b[8][8] && b[8][8].ability === 'warp', 'warp moves itself');
assert(b[9][9] && b[9][9].color === 'w' && !b[1][1], 'warp overwrites');
assert(b[2][3] && b[8][7].ability === 'shield', 'warp blocked by shield');
assert(b[3][1] && b[3][1].ability === 'weight', 'weight stays');
assert(fx.some((f) => f.kind === 'gone'), 'warp gone fx');
// スナイパー：選んだ石を消す。盾は消えない
setup(); state.board[7][7] = P('w'); state.board[1][1] = P('w', 'shield'); forceHand('b', ['sniper', 'plain', 'plain']); forceHand('w', ['plain', 'plain', 'plain']);
pick('sniper'); assert(g.playMove(5, 5, [7, 7]).ok && !state.board[7][7] && state.board[5][5].ability === 'sniper', 'sniper shoots');
setup(); state.board[1][1] = P('w', 'shield'); forceHand('b', ['sniper', 'plain', 'plain']); pick('sniper'); g.playMove(5, 5, [1, 1]); assert(state.board[1][1], 'sniper vs shield');
// AI：スナイパーで、相手の4つ並びを撃って止める
setup(); for (let i = 0; i < 4; i++) state.board[7][i + 2] = P('w'); state.board[7][1] = P('b'); state.board[0][0] = P('b'); forceHand('b', ['sniper', 'plain', 'plain']); forceHand('w', ['plain', 'plain', 'plain']);
m = AI.chooseMove({ depth: 2 }); assert(m, 'ai move');
console.log('all ok');
