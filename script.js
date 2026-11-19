'use strict';

// ===== 定数 =====
const SIZE = 11;
const HAND_SIZE = 3;
// 取り合いには、毎回この数の種類を1つずつ並べる（重なりなし）
// 取る順番（0 = 黒, 1 = 白）。打つのと同じく黒から。3択から1つずつ、交互に取る
// CPU と対戦するときは、人が黒（先手）、CPU が白
const CPU_COLOR = 'w';
const CPU_DELAY_MS = 450;
const BANNER_MS = 750;
const STEP_MS = 420; // 効果 → 重力 → 囲碁、と段階ごとに見せる間
const MAX_ROUNDS = 12; // 重力と罠のくり返しの上限
const COLORS = ['b', 'w'];
const COLOR_NAME = { b: '黒', w: '白' };

const DIRS8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// まわり8マスを時計回りに
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const LINE_DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const other = (c) => (c === 'b' ? 'w' : 'b');

// ===== アイコン（24×24 の SVG。線は石の文字色で描く） =====
const ICONS = {
  nuke: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path fill="currentColor" stroke="none" d="M10.25 8.97 7.25 3.77A9.5 9.5 0 0 1 16.75 3.77L13.75 8.97A3.5 3.5 0 0 0 10.25 8.97ZM15.5 12H21.5A9.5 9.5 0 0 1 16.75 20.23L13.75 15.03A3.5 3.5 0 0 0 15.5 12ZM10.25 15.03 7.25 20.23A9.5 9.5 0 0 1 2.5 12H8.5A3.5 3.5 0 0 0 10.25 15.03Z"/>',
  gravity: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  antigravity: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  spin: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19.5 3.5v4h-4"/>',
  spinBack: '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M4.5 3.5v4h4"/>',
  push: '<path d="M12 8V3M9.5 5.5 12 3l2.5 2.5M12 16v5M9.5 18.5 12 21l2.5-2.5M8 12H3M5.5 9.5 3 12l2.5 2.5M16 12h5M18.5 9.5 21 12l-2.5 2.5"/>',
  suck: '<path d="M12 3v5M9.5 5.5 12 8l2.5-2.5M12 21v-5M9.5 18.5 12 16l2.5 2.5M3 12h5M5.5 9.5 8 12l-2.5 2.5M21 12h-5M18.5 9.5 16 12l2.5 2.5"/>',
  timeBomb: '<circle cx="11" cy="14" r="6.5"/><path d="M15.5 9.5l2-2M17.5 7.5c.5-1.5 1.8-2.6 3.3-2.8"/><path d="M11 11v3l2 1.5"/>',
  bomb: '<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M5.3 18.7l3.5-3.5M15.2 8.8l3.5-3.5"/>',
  rowBomb: '<path d="M2.5 12h19M5.5 8.5v7M18.5 8.5v7"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  colBomb: '<path d="M12 2.5v19M8.5 5.5h7M8.5 18.5h7"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  diagBomb: '<path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  othello: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>',
  go: '<circle cx="12" cy="12" r="3.2" fill="currentColor"/><circle cx="12" cy="4.5" r="2"/><circle cx="12" cy="19.5" r="2"/><circle cx="4.5" cy="12" r="2"/><circle cx="19.5" cy="12" r="2"/>',
  joker: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" stroke="none"/>',
  chain: '<path d="M4.5 6l6 6-6 6M12.5 6l6 6-6 6"/>',
  warp: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/><path d="M10 14l4-4M14 13v-3h-3"/>',
  sniper: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  clone: '<circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4" fill="currentColor"/>',
  cloneH: '<circle cx="6.5" cy="12" r="3.5"/><circle cx="17.5" cy="12" r="3.5" fill="currentColor"/><path d="M12 4v16" stroke-dasharray="2 2.5"/>',
  cloneV: '<circle cx="12" cy="6.5" r="3.5"/><circle cx="12" cy="17.5" r="3.5" fill="currentColor"/><path d="M4 12h16" stroke-dasharray="2 2.5"/>',
  wall: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 12h16M11 6v6M8 12v6M15 12v6"/>',
  takeover: '<path d="M4 19h16M5 16 4 7l5 4 3-6 3 6 5-4-1 9z"/>',
  seal: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  jam: '<path d="M6 6l12 12M18 6 6 18"/>',
  spy: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  mine: '<circle cx="12" cy="13" r="5.5"/><path d="M12 3.5v3.5M12 19v2M3.5 13h3M17.5 13h3M6 7l2 2M18 7l-2 2"/>',
  weight: '<path d="M6.5 20h11l-2-9h-7z"/><path d="M9.5 11V8.5a2.5 2.5 0 0 1 5 0V11"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  flag: '<path d="M6.5 21V3.5M6.5 4.5h11l-2.8 4 2.8 4h-11"/>',
  grow: '<path d="M12 21v-8.5"/><path d="M12 13c0-4.2 3-6.5 7.5-6.5 0 4.2-3 6.5-7.5 6.5zM12 15c0-3.3-2.4-5.3-6-5.3 0 3.3 2.4 5.3 6 5.3z"/>',
};

// ===== 超能力 =====
// 能力を足すときは、ここに1件足す（アイコンは ICONS に同じ id で足す）。
//   onPlace(board, x, y, color, state) … 置いたときの効果。盤を書き換え、演出用の fx 配列を返す
//     fx の kind: placed / moved（fromX, fromY つき）/ flipped / gone
//   extraTurn … 置いたあと、もう1手打てる
//   onEnemy … 相手の石の上に置ける
//   area … 置く前に、効果の届く範囲を盤に薄く出す
// 盤にある間ずっと効くもの（重力・反重力・囲碁・地雷・重し・盾）は、resolve() とその下の関数で扱う。
// 揃いの数え方は countLine() と lineOwner() で扱う（joker / spy）。
// 外したもの：四目・ダブル（時間を縮めても強すぎた）、磁石・寂しがり（動きが分かりにくかった）、裏返し（強すぎた）
const ABILITIES = {
  plain: { name: 'ただの石', desc: '' },
  block: { name: '石垣', desc: '' }, // 石垣が立てる、誰のものでもない石
  joker: { name: 'ジョーカー', desc: '白にも黒にもなる。相手の列にも入る' },
  push: { name: '押し出し', desc: 'まわりの石を1マス外へ押す。盤から落ちた石は消える', onPlace: pushAbility, area: 'ring' },
  suck: { name: '吸い込み', desc: '2マス先の石を1マス手前まで吸い寄せる', onPlace: suckAbility, area: 'ring2' },
  nuke: { name: '核', desc: 'まわり5×5の石を全部消す', onPlace: nukeAbility, area: 'sq5' },
  timeBomb: { name: '時限爆弾', desc: '2手あとに爆発して、まわりの石と一緒に消える', area: 'ring' },
  bomb: { name: '爆弾', desc: 'まわりの石を全部消す', onPlace: bombAbility, area: 'ring' },
  rowBomb: { name: '横爆弾', desc: '左右2マスずつの石を消す', onPlace: (b, x, y) => lineBomb(b, x, y, [[1, 0]]), area: 'row' },
  colBomb: { name: '縦爆弾', desc: '上下2マスずつの石を消す', onPlace: (b, x, y) => lineBomb(b, x, y, [[0, 1]]), area: 'col' },
  diagBomb: { name: 'ななめ爆弾', desc: 'ななめ4方向に2マスずつの石を消す', onPlace: (b, x, y) => lineBomb(b, x, y, [[1, 1], [1, -1]]), area: 'diag' },
  flag: { name: '旗', desc: '上下左右の4マスが全部自分の石になったら勝ち', area: 'cross' },
  grow: { name: '増殖', desc: '盤にある間、自分の番が2回来るたびに、隣の空きマスに石が1つ増える', area: 'cross' },
  othello: { name: 'オセロ', desc: '相手の石をちょうど1個はさんだら、その石を自分の色にする', onPlace: othelloAbility },
  go: { name: '囲碁', desc: '盤にある間、隣の相手の石が囲まれて逃げ場をなくしたら取る', area: 'cross' },
  chain: { name: '連続', desc: 'もう1回置ける。続けて連続は置けない', extraTurn: true },
  gravity: { name: '重力', desc: 'いつでも下へ落ちる。下に続く石も一緒に押して落とす', area: 'down' },
  antigravity: { name: '反重力', desc: 'いつでも上へ昇る。上に続く石も一緒に押して昇らせる', area: 'up' },
  spin: { name: '回転', desc: 'まわりの8マスを、時計回りに1つずらす', onPlace: (b, x, y) => spinRing(b, x, y, 1), area: 'ring' },
  spinBack: { name: '逆回転', desc: 'まわりの8マスを、反時計回りに1つずらす', onPlace: (b, x, y) => spinRing(b, x, y, -1), area: 'ring' },
  warp: { name: 'ワープ', desc: 'まわり3×3の石を、盤の真ん中をはさんだ反対側へ飛ばす。飛んだ先の石は消える', onPlace: warpAbility, area: 'warp' },
  sniper: { name: 'スナイパー', desc: '置いたあと、盤のどこかの石を1つ選んで消す', onPlace: sniperAbility, aim: true },
  clone: { name: '分身', desc: '盤の真ん中をはさんだ反対側にも、自分の石が1つ増える', onPlace: (b, x, y, c, st) => cloneAt(b, SIZE - 1 - x, SIZE - 1 - y, c, st), area: 'mirror' },
  cloneH: { name: '左右分身', desc: '左右に折り返した位置にも、自分の石が1つ増える', onPlace: (b, x, y, c, st) => cloneAt(b, SIZE - 1 - x, y, c, st), area: 'mirrorH' },
  cloneV: { name: '上下分身', desc: '上下に折り返した位置にも、自分の石が1つ増える', onPlace: (b, x, y, c, st) => cloneAt(b, x, SIZE - 1 - y, c, st), area: 'mirrorV' },
  wall: { name: '石垣', desc: '上下左右の空きマスに、誰のものでもない石を置く', onPlace: wallAbility, area: 'cross' },
  takeover: { name: '乗っ取り', desc: '相手の石の上に置ける。下の石は消える', onEnemy: true },
  seal: { name: '封印', desc: '相手は次の番、超能力が使えない', onPlace: sealAbility },
  jam: { name: 'おじゃま', desc: 'まわり8マスの碁石の超能力を消して、ただの石にする', onPlace: jamAbility, area: 'ring' },
  spy: { name: 'スパイ', desc: '相手の色で置く。この石を含む列が揃ったら、こっちの勝ち。相手があと1つで揃う場所には置けない' },
  mine: { name: '地雷', desc: 'まわり8マスに相手が石を置いたら、その石と一緒に消える', area: 'ring' },
  weight: { name: '重し', desc: '押し出し・吸い込み・回転で動かされない' },
  shield: { name: '盾', desc: '爆弾・囲碁・地雷・乗っ取りで消されない' },
};
const HIDDEN_IDS = ['plain', 'block'];
const SPECIAL_IDS = Object.keys(ABILITIES).filter((id) => !HIDDEN_IDS.includes(id));

// ===== 動かす・消すの共通の決まり（重しは動かない、盾は消えない） =====
const isFixed = (cell) => !!cell && cell.ability === 'weight';
const isShielded = (cell) => !!cell && cell.ability === 'shield';

function moveStone(board, fx, fromX, fromY, toX, toY) {
  board[toY][toX] = board[fromY][fromX];
  board[fromY][fromX] = null;
  fx.push({ kind: 'moved', x: toX, y: toY, fromX, fromY });
}

function removeStone(board, fx, x, y) {
  const cell = board[y][x];
  if (!cell || isShielded(cell)) return false;
  board[y][x] = null;
  fx.push({ kind: 'gone', x, y, color: cell.color });
  return true;
}

let uidCounter = 0;
const newPiece = (color, ability, st, extra = {}) => ({ color, ability, placedAt: st ? st.moveCount : 0, uid: ++uidCounter, ...extra });

// ===== 置いたときの効果 =====
function pushAbility(board, x, y) {
  const fx = [];
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx, ny) || !board[ny][nx] || isFixed(board[ny][nx])) continue;
    const tx = nx + dx, ty = ny + dy;
    if (!inside(tx, ty)) removeStone(board, fx, nx, ny);
    else if (!board[ty][tx]) moveStone(board, fx, nx, ny, tx, ty);
    // 押す先がふさがっていたら動かない
  }
  return fx;
}

// 押し出しの逆。2マス先の石を、あいだが空いていれば1マス手前へ
function suckAbility(board, x, y) {
  const fx = [];
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy, fx2 = x + dx * 2, fy2 = y + dy * 2;
    if (!inside(fx2, fy2) || !board[fy2][fx2] || isFixed(board[fy2][fx2]) || board[ny][nx]) continue;
    moveStone(board, fx, fx2, fy2, nx, ny);
  }
  return fx;
}

// 爆弾：まわりの石を消す。置いた碁石は残る（自分も消えると、置く得がなかった）
function bombAbility(board, x, y) {
  const fx = [];
  for (const [dx, dy] of DIRS8) if (inside(x + dx, y + dy)) removeStone(board, fx, x + dx, y + dy);
  return fx;
}

// 核：まわり5×5の石を全部消す。置いた碁石は残る
function nukeAbility(board, x, y) {
  const fx = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if ((dx || dy) && inside(x + dx, y + dy)) removeStone(board, fx, x + dx, y + dy);
  }
  return fx;
}

// ワープ：置いた石を真ん中にした3×3の石を、盤の中心について点対称の位置へ飛ばす。
// 飛んだ先にあった石は消える（盾は消えないので、盾の上には飛ばない）。重しは動かない
function warpAbility(board, x, y) {
  const fx = [];
  const moving = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const sx = x + dx, sy = y + dy;
    const p = inside(sx, sy) && board[sy][sx];
    if (!p || isFixed(p)) continue;
    moving.push({ sx, sy, tx: SIZE - 1 - sx, ty: SIZE - 1 - sy, p });
  }
  const srcs = new Set(moving.map((m) => `${m.sx},${m.sy}`));
  // 飛んだ先が、動かない盾なら飛ばない
  const go = moving.filter((m) => { const d = board[m.ty][m.tx]; return !(d && isShielded(d) && !srcs.has(`${m.tx},${m.ty}`)); });
  for (const m of go) board[m.sy][m.sx] = null;
  for (const m of go) {
    const d = board[m.ty][m.tx];
    if (d) fx.push({ kind: 'gone', x: m.tx, y: m.ty, color: d.color });
    board[m.ty][m.tx] = m.p;
    fx.push({ kind: 'moved', x: m.tx, y: m.ty, fromX: m.sx, fromY: m.sy });
  }
  return fx;
}

// スナイパー：選んだ石を1つ消す（盾は消えない）。選んでいなければ何もしない
function sniperAbility(board, x, y, color, st) {
  const fx = [];
  const t = st && st.target;
  if (t && inside(t[0], t[1]) && !(t[0] === x && t[1] === y)) removeStone(board, fx, t[0], t[1]);
  for (const f of fx) f.by = 'sniper';
  return fx;
}
// スナイパーで狙える石か
const canSnipe = (board, x, y, fromX, fromY) => inside(x, y) && !!board[y][x] && !isShielded(board[y][x]) && !(x === fromX && y === fromY);

// 時限爆弾：置いてから2手（相手の1手と自分の1手）たつと爆発する。まわり8マスの石と自分が消える
const FUSE = 2;
function fuseTick(board, skipUid) {
  const fx = [];
  const lit = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const p = board[y][x];
    if (p && p.ability === 'timeBomb' && p.uid !== skipUid) lit.push([x, y, p]);
  }
  for (const [x, y, p] of lit) {
    p.fuse = (p.fuse == null ? FUSE : p.fuse) - 1;
    if (p.fuse > 0) continue;
    if (board[y][x] !== p) continue; // ほかの爆発で、もう消えている
    fx.push({ kind: 'boom', x, y });
    const gone = [];
    for (const [dx, dy] of DIRS8) if (inside(x + dx, y + dy)) removeStone(board, gone, x + dx, y + dy);
    removeStone(board, gone, x, y);
    for (const f of gone) f.by = 'timeBomb';
    fx.push(...gone);
  }
  return fx;
}

// 列の爆弾が届く距離。盤の端まで届くと強すぎたので2マスにした
const LINE_BOMB_RANGE = 2;
function lineBomb(board, x, y, dirs) {
  const fx = [];
  for (const [dx, dy] of dirs) {
    for (let k = -LINE_BOMB_RANGE; k <= LINE_BOMB_RANGE; k++) {
      if (k === 0) continue;
      const cx = x + dx * k, cy = y + dy * k;
      if (inside(cx, cy)) removeStone(board, fx, cx, cy);
    }
  }
  return fx;
}

// ちょうど1個の相手の石をはさんだときだけ、その石を返す（全部返す・何個でも1つ返す、はどちらも強すぎた）。
// 返すのは1つだけ。はさめる向きが2つ以上あれば、DIRS8 の順で先の向き
function othelloAbility(board, x, y, color) {
  for (const [dx, dy] of DIRS8) {
    const mid = inside(x + dx, y + dy) && board[y + dy][x + dx];
    const end = inside(x + dx * 2, y + dy * 2) && board[y + dy * 2][x + dx * 2];
    if (mid && mid.color === other(color) && end && end.color === color) {
      mid.color = color;
      return [{ kind: 'flipped', x: x + dx, y: y + dy }];
    }
  }
  return [];
}

// まわり8マスを、dir = 1 で時計回り、-1 で反時計回りに1つずらす。重しのマスは飛ばす
function spinRing(board, x, y, dir) {
  const fx = [];
  const ring = RING.map(([dx, dy]) => [x + dx, y + dy]).filter(([cx, cy]) => inside(cx, cy) && !isFixed(board[cy][cx]));
  const values = ring.map(([cx, cy]) => board[cy][cx]);
  ring.forEach(([cx, cy], i) => {
    const from = (i - dir + ring.length) % ring.length;
    board[cy][cx] = values[from];
    if (values[from] && from !== i) fx.push({ kind: 'moved', x: cx, y: cy, fromX: ring[from][0], fromY: ring[from][1] });
  });
  return fx;
}

function cloneAt(board, cx, cy, color, st) {
  if (!board[cy][cx]) {
    board[cy][cx] = newPiece(color, 'plain', st);
    return [{ kind: 'placed', x: cx, y: cy }];
  }
  return [];
}

function wallAbility(board, x, y, color, st) {
  const fx = [];
  for (const [dx, dy] of DIRS4) {
    const nx = x + dx, ny = y + dy;
    if (inside(nx, ny) && !board[ny][nx]) {
      board[ny][nx] = newPiece('n', 'block', st);
      fx.push({ kind: 'placed', x: nx, y: ny });
    }
  }
  return fx;
}

function sealAbility(board, x, y, color, st) {
  if (st) st.sealed = other(color);
  return [];
}

// おじゃま：まわり8マスの碁石（白黒どちらも）の超能力を消して、ただの石にする。
// 相手の手札の碁石を1つ消す形は、強すぎた
function jamAbility(board, x, y) {
  const fx = [];
  for (const [dx, dy] of DIRS8) {
    const cell = inside(x + dx, y + dy) && board[y + dy][x + dx];
    if (cell && cell.color !== 'n' && cell.ability !== 'plain') {
      cell.ability = 'plain';
      delete cell.owner;
      fx.push({ kind: 'neutralized', x: x + dx, y: y + dy });
    }
  }
  return fx;
}

// ===== 盤にある間ずっと効くもの =====
// 重力の石は下へ、反重力の石は上へ、止まるまで動かす。重力は下の行から、反重力は上の行から順に動かす
// 連鎖：重力の石は、その下に続く石をまとめて押して、一緒に落ちる（反重力は上へ）。重しは押せない
function settle(board) {
  const fx = [];
  for (let y = SIZE - 2; y >= 0; y--) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] && board[y][x].ability === 'gravity') pushColumn(board, fx, x, y, 1);
    }
  }
  for (let y = 1; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] && board[y][x].ability === 'antigravity') pushColumn(board, fx, x, y, -1);
    }
  }
  return fx;
}

// (x, y) の石と、その先（dy の向き）に続く石を、ひとかたまりで動けるところまで動かす
function pushColumn(board, fx, x, y, dy) {
  let end = y;
  while (inside(x, end + dy) && board[end + dy][x]) end += dy;
  // 重しや、逆向きの重力の石が混ざっていたら動かない（押し合って止まる）
  const against = dy > 0 ? 'antigravity' : 'gravity';
  for (let k = y; k !== end + dy; k += dy) if (isFixed(board[k][x]) || board[k][x].ability === against) return;
  let room = 0;
  while (inside(x, end + dy * (room + 1)) && !board[end + dy * (room + 1)][x]) room++;
  if (!room) return;
  for (let k = end; k !== y - dy; k -= dy) moveStone(board, fx, x, k, x, k + dy * room); // 先の石から動かす
}

function slideStone(board, fx, x, y, dx, dy) {
  let tx = x, ty = y;
  while (inside(tx + dx, ty + dy) && !board[ty + dy][tx + dx]) { tx += dx; ty += dy; }
  if (tx !== x || ty !== y) moveStone(board, fx, x, y, tx, ty);
}

// 囲碁の石の上下左右にある相手のかたまりに、空きマス（逃げ場）がなければ取る
function goTraps(board) {
  const fx = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const go = board[y][x];
      if (!go || go.ability !== 'go' || go.color === 'n') continue;
      const enemy = other(go.color);
      for (const [dx, dy] of DIRS4) {
        const sx = x + dx, sy = y + dy;
        if (!inside(sx, sy) || !board[sy][sx] || board[sy][sx].color !== enemy) continue;
        const group = groupOf(board, sx, sy);
        if (!group.free) {
          const before = fx.length;
          for (const [gx, gy] of group.cells) removeStone(board, fx, gx, gy);
          for (let i = before; i < fx.length; i++) fx[i].by = 'go';
        }
      }
    }
  }
  return fx;
}

function groupOf(board, sx, sy) {
  const color = board[sy][sx].color;
  const seen = new Set([`${sx},${sy}`]);
  const stack = [[sx, sy]];
  const cells = [];
  let free = false;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    cells.push([cx, cy]);
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const cell = board[ny][nx];
      if (!cell) free = true;
      else if (cell.color === color && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
    }
  }
  return { cells, free };
}

// 置いた石のまわり8マスに相手の地雷があれば、置いた石と地雷が一緒に消える
function mineCheck(board, uid) {
  const fx = [];
  const pos = findUid(board, uid);
  if (!pos) return fx;
  const [x, y] = pos;
  const placed = board[y][x];
  if (placed.color === 'n') return fx;
  for (const [dx, dy] of DIRS8) {
    const mx = x + dx, my = y + dy;
    const m = inside(mx, my) && board[my][mx];
    if (m && m.ability === 'mine' && m.color === other(placed.color)) {
      removeStone(board, fx, mx, my);
      removeStone(board, fx, x, y);
      for (const f of fx) f.by = 'mine';
      break;
    }
  }
  return fx;
}

function findUid(board, uid) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (board[y][x] && board[y][x].uid === uid) return [x, y];
  return null;
}

// 増殖：手番の人の増殖の石は、その人の番が来るたびに1つ年をとり、2回に1回、隣の空きマスに石を増やす。
// 増やす向きは、上 → 右 → 下 → 左 の順に回していく
function growth(board, color, st) {
  const fx = [];
  const seeds = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const p = board[y][x];
    if (p && p.ability === 'grow' && p.color === color) seeds.push([x, y, p]);
  }
  for (const [x, y, p] of seeds) {
    p.age = (p.age || 0) + 1;
    if (p.age % 2 !== 0) continue;
    const start = (p.age / 2) % 4;
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS4[(start + k) % 4];
      const nx = x + dx, ny = y + dy;
      if (inside(nx, ny) && !board[ny][nx]) {
        board[ny][nx] = newPiece(color, 'plain', st);
        fx.push({ kind: 'placed', x: nx, y: ny, by: 'grow', fromX: x, fromY: y });
        break;
      }
    }
  }
  return fx;
}

// ===== 勝ち判定 =====
const countsFor = (cell, c) => !!cell && (cell.color === c || cell.ability === 'joker');

// 色 c で揃っている列を探す。見つかればマスの座標配列、なければ null
// 速さのため：配列を作らずに数えて、5つ以上で自分の色（ジョーカーだけでない）を含むときだけ座標を返す
function findWin(board, c) {
  for (const [dx, dy] of LINE_DIRS) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cell = board[y][x];
        if (!cell || (cell.color !== c && cell.ability !== 'joker')) continue;
        const px = x - dx, py = y - dy;
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) { const pc = board[py][px]; if (pc && (pc.color === c || pc.ability === 'joker')) continue; } // 列の先頭だけ見る
        let n = 0, own = false, cx = x, cy = y;
        while (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE) {
          const q = board[cy][cx];
          if (!q || (q.color !== c && q.ability !== 'joker')) break;
          if (q.color === c) own = true;
          n++; cx += dx; cy += dy;
        }
        if (n >= 5 && own) return Array.from({ length: n }, (_, k) => [x + dx * k, y + dy * k]);
      }
    }
  }
  return null;
}

function countLine(pieces, c) {
  if (!pieces.some((p) => p.color === c)) return false; // ジョーカーだけの列は数えない
  return pieces.length >= 5;
}

// 特殊勝利：旗の上下左右が全部自分の石／結束を含む2×2が全部自分の石。そろったマスを返す
function specialWin(board, c) {
  const own = (x, y) => inside(x, y) && board[y][x] && board[y][x].color === c;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = board[y][x];
      if (!p || p.color !== c) continue;
      if (p.ability === 'flag' && DIRS4.every(([dx, dy]) => own(x + dx, y + dy))) {
        return [[x, y], ...DIRS4.map(([dx, dy]) => [x + dx, y + dy])];
      }
    }
  }
  return null;
}

// 揃った列の勝ち主。相手のスパイが混ざっていれば、スパイを置いた側の勝ち
function lineOwner(board, cells, c) {
  const spy = cells.map(([x, y]) => board[y][x]).find((p) => p.ability === 'spy' && p.owner && p.owner !== c);
  return spy ? spy.owner : c;
}

// ===== 碁石 =====
let nextId = 1;
const makeCard = (ability) => ({ id: nextId++, ability });

// 乱数：オンライン対戦で両方の画面を同じ流れにするため、種（シード）から決まる乱数を使う。
// 種を決めると、碁石の番号も1から振り直す（両方の画面で同じ番号になる）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = Math.random;
function setSeed(seed) { rng = mulberry32(seed); nextId = 1; }
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== デッキ =====
// 24ポイントまで組める。ただの石は1ポイント。強い碁石ほど高い（数と強さのトレードオフ）
const DECK_POINTS = 24;
const MAX_COPIES = 3; // 同じ超能力は3つまで
const COST = {
  plain: 1,
  gravity: 2, antigravity: 2, mine: 2, jam: 2, go: 2, weight: 2, shield: 2, wall: 2, joker: 2, push: 2,
  timeBomb: 3, warp: 3, rowBomb: 3, colBomb: 3, spin: 3, spinBack: 3, clone: 3, cloneH: 3, cloneV: 3, seal: 3, suck: 3, flag: 3,
  bomb: 4, diagBomb: 4, sniper: 4, takeover: 4, grow: 4, chain: 4,
  othello: 5, nuke: 6,
  spy: 3, // リーチがあると置けないので、安くした
};
const costOf = (id) => COST[id] || 3;
// デッキは { 能力: 数 }。ただの石も含む
const deckPoints = (deck) => Object.entries(deck).reduce((s, [id, n]) => s + costOf(id) * n, 0);
const deckCount = (deck) => Object.values(deck).reduce((s, n) => s + n, 0);
// 名前の順に並べる（オンラインで両方の画面が同じ袋を作れるように）
const deckList = (deck) => Object.keys(deck).sort().flatMap((id) => Array(deck[id]).fill(id));
const STARTERS = [
  { id: 'balance', name: 'バランス', note: 'いろいろ少しずつ', deck: { plain: 7, bomb: 1, spin: 1, grow: 1, seal: 1, clone: 1 } },
  { id: 'mass', name: '物量', note: '数で押す', deck: { plain: 14, gravity: 2, mine: 2, shield: 1 } },
  { id: 'sourspy', name: 'すっぱいスパイ', note: '相手の列にまぎれこむ', deck: { plain: 5, joker: 3, bomb: 1, spy: 3 } },
  { id: 'nuclear', name: '一発逆転', note: '核が2つ', deck: { plain: 12, nuke: 2 } },
];

function makePlayer(color, deck) {
  const list = Array.isArray(deck) ? deck.map((c) => (typeof c === 'string' ? makeCard(c) : c)) : deckList(deck).map(makeCard);
  const p = { color, bag: shuffle(list), hand: [] };
  fillHand(p);
  return p;
}

// 手札が3つになるまで引く。袋が空なら、それ以上は引かない
function fillHand(p) {
  while (p.hand.length < HAND_SIZE && p.bag.length) p.hand.push(p.bag.pop());
}

const piecesLeft = (p) => p.hand.length + p.bag.length;

// ===== 状態 =====
const state = {
  phase: 'title', // title | deck | online | play | end
  mode: 'pvp', // pvp（2人で対戦）| cpu（CPU と対戦）
  board: [],
  decks: { b: null, w: null }, // 対局に使うデッキ（{ 能力: 数 }）
  players: {},
  turn: 'b',
  selected: 0,
  sealed: null, // 次の番に超能力が使えない色
  chainTurn: null, // 連続でもらった手の色（その手では連続を使えない）
  jammed: null,
  lastMove: null,
  fx: [],
  winLine: null,
  moveCount: 0,
  busy: false,
  pending: null, // タッチ操作で、1回目にタップしたマス
  logs: [],
};

// 画面とログに出す名前。CPU 対戦では「あなた」と「CPU」
const nameOf = (c) => (state.mode === 'cpu' ? (c === CPU_COLOR ? 'CPU' : 'あなた')
  : state.mode === 'online' ? (c === state.myColor ? 'あなた' : state.opponentName || NO_NAME) : COLOR_NAME[c]);

// オンライン対戦の名前。名前をつけていない人は「名前はまだない」
const NO_NAME = '名前はまだない';
const NAME_KEY = 'gomoku-name';
function loadMyName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
function saveMyName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* 保存できなくても遊べる */ } }
// 相手から届いた名前：画面を壊す文字を外し、12文字まで
const cleanName = (n) => String(n || '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 12);

function log(text) {
  state.logs.unshift(text);
  if (typeof document !== 'undefined') renderLog();
}

// 封印されているときは、どの碁石もただの石として置く
function effectiveAbility(card, color) {
  return state.sealed === color ? 'plain' : card.ability;
}

function canPlaceAt(x, y, color, ability) {
  if (!inside(x, y)) return false;
  if (ability === 'spy' && spyCompletes(state.board, x, y, color)) return false;
  const cell = state.board[y][x];
  if (!cell) return true;
  return !!ABILITIES[ability].onEnemy && cell.color === other(color) && !isShielded(cell);
}

// リーチ：空きマスのどこかに c の石を1つ置けば、c の列が揃う（そのマスを通る4本の線だけを数える）
function hasReach(board, c) {
  const ok = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE && board[y][x] && (board[y][x].color === c || board[y][x].ability === 'joker');
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (board[y][x]) continue;
    for (const [dx, dy] of LINE_DIRS) {
      let n = 1;
      for (let k = 1; ok(x + dx * k, y + dy * k); k++) n++;
      for (let k = 1; ok(x - dx * k, y - dy * k); k++) n++;
      if (n >= 5) return true; // 置く石が c なので、自分の色は必ず入る
    }
  }
  return false;
}

// 手札の碁石を、いま使えるか（連続でもらった手では、連続は使えない）
function cardBlocked(card, color) {
  return effectiveAbility(card, color) === 'chain' && state.chainTurn === color;
}

// スパイは、相手があと1つで揃う場所（リーチの場所）には置けない。置くと相手の5つ目になって、勝ちを横取りできてしまう
function spyCompletes(board, x, y, color) {
  if (board[y][x]) return false;
  const c = other(color);
  board[y][x] = { color: c, ability: 'plain' };
  const win = findWin(board, c);
  board[y][x] = null;
  return !!win;
}

const snapshot = (board) => board.map((row) => row.map((c) => c && { ...c }));

// ===== 1つ置いたときに起きることを、全部進める =====
// 対局（playMove）と、取り合いのお試し（fx.js のデモ）の両方で使う。どちらも同じ動きになる。
// 順番：能力の効果 → 増殖 → 重力・反重力 → 囲碁と地雷 →（変わらなくなるまで重力と囲碁をくり返す）
// st は対局の状態（封印・おじゃまが相手の手札を見るため）。お試しでは手札のない仮の状態を渡す
function resolvePlacement(board, x, y, color, id, st) {
  const ab = ABILITIES[id];
  const piece = id === 'spy' ? newPiece(other(color), 'spy', st, { owner: color })
    : id === 'timeBomb' ? newPiece(color, id, st, { fuse: FUSE }) : newPiece(color, id, st);
  board[y][x] = piece;
  const before = snapshot(board); // 置いた直後、効果が起きる前（予兆を見せるため）
  const fx0 = ab.onPlace ? ab.onPlace(board, x, y, color, st) : [];
  const steps = [{ board: snapshot(board), fx: [{ kind: 'placed', x, y }, ...fx0] }];
  const allFx = fx0.slice();
  const grown = growth(board, color, st);
  if (grown.length) { steps.push({ board: snapshot(board), fx: grown }); allFx.push(...grown); }
  // 時限爆弾の導火線が1つ縮む。0になったものは爆発する（いま置いた時限爆弾は数えない）
  const boomed = fuseTick(board, piece.uid);
  if (boomed.length) { steps.push({ board: snapshot(board), fx: boomed }); allFx.push(...boomed); }
  // 地雷は、置いた石と、分身・増殖で増えた石の両方に反応する
  const newUids = [piece.uid, ...allFx.filter((f) => f.kind === 'placed').map((f) => board[f.y][f.x] && board[f.y][f.x].uid).filter(Boolean)];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const fx = settle(board);
    if (round === 0) for (const uid of newUids) fx.push(...mineCheck(board, uid));
    fx.push(...goTraps(board));
    if (!fx.length) break;
    steps.push({ board: snapshot(board), fx });
    allFx.push(...fx);
  }
  return { piece, steps, allFx, before };
}

// ===== 1手を打つ（DOM に依存しない部分） =====
// 1手の中の順番：能力の効果 → 重力・反重力 → 囲碁と地雷 → （変わらなくなるまで重力と囲碁をくり返す）→ 勝ち判定
// 戻り値：{ ok, ability, steps, winner, extraTurn }。steps は段階ごとの盤と演出（画面で順に見せる）
function playMove(x, y, target = null) {
  const color = state.turn;
  state.target = target; // スナイパーで狙う石
  const p = state.players[color];
  const card = p.hand[state.selected];
  if (state.phase !== 'play' || !card) return { ok: false };
  const id = effectiveAbility(card, color);
  if (cardBlocked(card, color) || !canPlaceAt(x, y, color, id)) return { ok: false };

  const wasSealed = state.sealed === color;
  p.hand.splice(state.selected, 1);
  state.selected = 0;
  state.moveCount++;

  const ab = ABILITIES[id];
  if (wasSealed) state.sealed = null;
  state.jammed = null;
  const { piece, steps, allFx, before } = resolvePlacement(state.board, x, y, color, id, state);
  state.lastMove = findUid(state.board, piece.uid);
  state.fx = steps[steps.length - 1].fx;

  let text = `${nameOf(color)}が${ab.name}を${colLabel(x)}${y + 1}に置いた${describeFx(allFx)}`;
  if (wasSealed && card.ability !== 'plain') text = `${nameOf(color)}は封印されていて、${ABILITIES[card.ability].name}がただの石になった`;
  log(text);
  if (id === 'seal') log(`${nameOf(other(color))}は次の番、超能力が使えない`);
  if (id === 'jam') { const n = allFx.filter((f) => f.kind === 'neutralized').length; log(n ? `まわりの碁石${n}個の超能力が消えた` : 'まわりに超能力の碁石がなかった'); }

  fillHand(p);

  // 勝ち判定（置いた場所と関係ないところに列ができることもあるので、盤全体を見る）
  let winner = null;
  for (const c of [color, other(color)]) {
    const normal = findWin(state.board, c);
    const special = normal ? null : specialWin(state.board, c);
    const line = normal || special;
    if (line) {
      winner = lineOwner(state.board, line, c);
      state.winLine = line;
      state.winKind = normal ? 'line' : 'flag';
      break;
    }
  }

  if (winner) {
    state.phase = 'end';
    state.winner = winner;
    log(`${nameOf(winner)}の勝ち`);
    return { ok: true, ability: id, steps, before, winner, extraTurn: false };
  }

  // 次の番。碁石がない人は飛ばし、2人ともなければ引き分け
  let next = ab.extraTurn ? color : other(color);
  state.chainTurn = ab.extraTurn ? color : null; // 連続でもらった手か（その手では連続を使えない）
  if (!piecesLeft(state.players[next])) {
    log(`${nameOf(next)}は碁石を使い切った`);
    next = other(next);
  } else if (state.players[next].hand.every((c) => cardBlocked(c, next))) {
    log(`${nameOf(next)}は置ける碁石がなくて、番を飛ばした`);
    next = other(next);
  }
  if (next !== color) state.chainTurn = null;
  const full = state.board.every((row) => row.every(Boolean));
  if (!piecesLeft(state.players[next]) || full) {
    state.phase = 'end';
    state.winner = null;
    log(full ? '盤が埋まって、引き分け' : '碁石がなくなって、引き分け');
  } else {
    if (ab.extraTurn && next === color) log(`${nameOf(color)}がもう1回`);
    state.turn = next;
  }
  return { ok: true, ability: id, steps, before, winner: null, extraTurn: !!ab.extraTurn };
}

function describeFx(fx) {
  const n = (k) => fx.filter((f) => f.kind === k).length;
  const parts = [];
  if (n('moved')) parts.push(`${n('moved')}個動いた`);
  if (n('flipped')) parts.push(`${n('flipped')}個ひっくり返った`);
  if (n('gone')) parts.push(`${n('gone')}個消えた`);
  if (n('placed')) parts.push(`${n('placed')}個増えた`);
  return parts.length ? `。${parts.join('、')}` : '';
}

const colLabel = (x) => 'ABCDEFGHIJK'[x];

function newBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

// ===== 画面 =====
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function showScreen(name) {
  hideStoneTip();
  for (const s of ['title', 'select', 'deck', 'game', 'online']) $(`${s}-screen`).hidden = s !== name;
  document.body.dataset.screen = name;
  $('log-btn').hidden = name !== 'game';
  $('share-btn').hidden = name !== 'game';
}

function iconHTML(ability) {
  const icon = ICONS[ability];
  return icon ? `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>` : '';
}

// 盤の上の碁石（増殖には、増えるまでのゲージを付ける）
function pieceHTML(p, extraClass = '', attrs = '') {
  const html = stoneHTML(p.color, p.ability, extraClass, attrs);
  if (p.ability === 'timeBomb') {
    const n = p.fuse == null ? FUSE : p.fuse;
    return html.replace(/<\/span>$/, `<span class="fuse-gauge" data-n="${n}" title="あと${n}手で爆発"><i></i><i></i></span></span>`);
  }
  if (p.ability !== 'grow') return html;
  const n = (p.age || 0) % 2;
  const gauge = `<span class="grow-gauge" data-n="${n}" title="${n ? '次の自分の番で増える' : 'あと2回の自分の番で増える'}"><i></i><i></i></span>`;
  return html.replace(/<\/span>$/, `${gauge}</span>`);
}

function stoneHTML(color, ability, extraClass = '', attrs = '') {
  return `<span class="stone stone-${color} ${extraClass}" ${attrs}>${iconHTML(ability)}</span>`;
}

// --- デッキ ---
// 対局の前に「デッキをえらぶ」画面で、スターターデッキか自分のデッキを選ぶ。
// 変えたくなったら「デッキを作る」画面（構築）へ。保存すると、選ぶ画面に戻る
const isCpu = (color) => state.mode === 'cpu' && color === CPU_COLOR;
const isRemote = (color) => state.mode === 'online' && color !== state.myColor;
const notMine = (color) => isCpu(color) || isRemote(color); // この画面の人が操作できない番
const playerName = nameOf;
const DECKS_KEY = 'gomoku-decks';
const ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const escapeHTML = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHOICE_KEY = 'gomoku-choice';
const TIER = { 1: 't1', 2: 't2', 3: 't3', 4: 't4', 5: 't5', 6: 't6' }; // ポイントの色分け
const CATALOG = ['plain', ...SPECIAL_IDS].sort((x, y) => costOf(x) - costOf(y));

// 旧コストで組んだデッキは、先にただの石を減らして予算に収める
function adjustBombCost(deck) {
  const excess = deckPoints(deck) - DECK_POINTS;
  if (excess <= 0 || !deck.bomb) return deck;
  const adjusted = { ...deck };
  const plain = Math.min(adjusted.plain || 0, excess);
  if (plain) adjusted.plain -= plain;
  if (excess > plain) adjusted.bomb -= Math.min(adjusted.bomb, Math.ceil((excess - plain) / costOf('bomb')));
  return Object.fromEntries(Object.entries(adjusted).filter(([, count]) => count > 0));
}

// 自分のデッキ：[{ id, name, deck }]。ブラウザに保存する
function loadMyDecks() {
  try {
    const list = JSON.parse(localStorage.getItem(DECKS_KEY));
    if (Array.isArray(list)) return list.filter((d) => d && d.id && d.deck).map((d) => ({ ...d, deck: adjustBombCost(Object.fromEntries(Object.entries(d.deck).filter(([id]) => id === 'plain' || ABILITIES[id]))) })).filter((d) => deckCount(d.deck));
    const old = JSON.parse(localStorage.getItem('gomoku-deck')); // 前の版で1つだけ保存していたもの
    if (old && typeof old === 'object' && deckCount(old)) return [{ id: 'd1', name: 'じぶんのデッキ', deck: adjustBombCost(old) }];
  } catch (e) { /* 読めなければ空 */ }
  return [];
}
function saveMyDecks(list) { try { localStorage.setItem(DECKS_KEY, JSON.stringify(list)); } catch (e) { /* 保存できなくても遊べる */ } }
function loadChoice() { try { return JSON.parse(localStorage.getItem(CHOICE_KEY)) || {}; } catch (e) { return {}; } }
function saveChoice(c) { try { localStorage.setItem(CHOICE_KEY, JSON.stringify(c)); } catch (e) { /* 保存できなくても遊べる */ } }

// デッキの参照：'preset:balance' か 'my:d3'
function deckByRef(ref) {
  if (!ref) return null;
  if (ref.startsWith('preset:')) {
    const st = STARTERS.find((x) => `preset:${x.id}` === ref);
    return st && { ref, name: st.name, note: st.note, deck: st.deck, preset: true };
  }
  const d = loadMyDecks().find((x) => `my:${x.id}` === ref);
  return d && { ref, name: d.name, note: '', deck: d.deck, id: d.id };
}
const allRefs = () => [...STARTERS.map((s) => `preset:${s.id}`), ...loadMyDecks().map((d) => `my:${d.id}`)];
function deckIcons(deck, color, max) {
  const stones = deckList(deck).filter((x) => x !== 'plain').sort((x, y) => costOf(y) - costOf(x));
  return stones.slice(0, max).map((x) => stoneHTML(color, x)).join('') + (stones.length > max ? `<span class="more">+${stones.length - max}</span>` : '');
}

// ===== デッキをえらぶ =====
// mode：pvp は黒と白が横に並んで選ぶ。cpu と online は自分だけ。manage はタイトルの「デッキ」（作る・直すだけ）
function startSelect(mode = state.mode) {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  state.mode = mode;
  state.phase = 'select';
  state.remoteQueue = [];
  state.logs = [];
  const saved = loadChoice();
  const ok = (r) => (deckByRef(r) ? r : null);
  state.choice = {
    b: ok(state.choice && state.choice.b) || ok(saved.b) || 'preset:balance',
    w: ok(state.choice && state.choice.w) || ok(saved.w) || 'preset:mass',
  };
  showScreen('select');
  renderSelect();
}

const selectCols = () => (state.mode === 'pvp' ? ['b', 'w'] : ['b']);

function renderSelect() {
  const pvp = state.mode === 'pvp', manage = state.mode === 'manage';
  $('select-screen').dataset.mode = state.mode;
  $('select-title').textContent = manage ? 'デッキ' : 'デッキをえらぼう！';
  const refs = allRefs();
  $('select-cols').innerHTML = selectCols().map((color) => {
    const head = pvp ? `<p class="sel-head"><span class="who-stone stone-${color}"></span>${COLOR_NAME[color]}のデッキ</p>` : '';
    const cards = refs.map((ref) => {
      const d = deckByRef(ref);
      const on = !manage && state.choice[color] === ref;
      return `<div class="sel-card ${on ? 'is-on' : ''} ${d.preset ? 'is-preset' : 'is-mine'}" data-ref="${ref}" data-color="${color}" role="button" tabindex="0" aria-pressed="${on}">
        <span class="sel-name">${escapeHTML(d.name)}${d.preset ? '<span class="sel-tag">スターター</span>' : ''}</span>
        <span class="sel-stones">${deckIcons(d.deck, color, pvp ? 6 : 9)}</span>
        <span class="sel-meta"><b>${deckCount(d.deck)}</b>個${d.note ? `<span class="sel-note">・${d.note}</span>` : ''}</span>
        <button type="button" class="sel-edit" aria-label="${escapeHTML(d.name)}を${d.preset ? 'もとに作る' : '直す'}" title="${d.preset ? 'これをもとに作る' : '直す'}">${d.preset ? ICON_COPY : ICON_EDIT}</button>
      </div>`;
    }).join('');
    const add = `<button type="button" class="sel-card sel-new" data-color="${color}"><span class="sel-plus">＋</span>新しいデッキを作る</button>`;
    return `<div class="sel-col" data-color="${color}">${head}<div class="sel-list">${cards}${add}</div></div>`;
  }).join('');
  const nameField = $('name-field');
  nameField.hidden = state.mode !== 'online';
  if (state.mode === 'online') $('my-name').value = loadMyName();
  const go = $('select-go');
  go.hidden = manage;
  go.textContent = pvp ? 'この2つで対戦' : state.mode === 'online' ? 'このデッキで相手をさがす' : 'このデッキで対戦';
}

function onSelectClick(e) {
  const newBtn = e.target.closest('.sel-new');
  if (newBtn) { openBuilder(null, newBtn.dataset.color); return; }
  const card = e.target.closest('.sel-card');
  if (!card) return;
  const { ref, color } = card.dataset;
  if (e.target.closest('.sel-edit') || state.mode === 'manage') { openBuilder(ref, color); return; }
  if (state.choice[color] === ref) return;
  state.choice[color] = ref;
  saveChoice(state.choice);
  Sound.select();
  renderSelect();
  const on = $('select-cols').querySelector(`.sel-card[data-ref="${ref}"][data-color="${color}"]`);
  if (on) { on.classList.add('is-picked'); }
}

// 決定：2人で対戦なら黒と白、CPU は自分だけ（CPU はスターターデッキからくじ）、オンラインは相手をさがす
function confirmSelect() {
  const mine = deckByRef(state.choice.b);
  if (!mine) return;
  saveChoice(state.choice);
  if (state.mode === 'pvp') {
    const theirs = deckByRef(state.choice.w);
    state.decks = { b: mine.deck, w: theirs.deck };
    state.deckNames = { b: mine.name, w: theirs.name };
    startGame();
    return;
  }
  if (state.mode === 'cpu') {
    const cpu = STARTERS[Math.floor(Math.random() * STARTERS.length)];
    state.decks = { b: mine.deck, w: cpu.deck };
    state.deckNames = { b: mine.name, w: cpu.name };
    startGame();
    return;
  }
  state.myDeck = mine.deck;
  state.myDeckName = mine.name;
  startOnline();
}

// ===== デッキを作る（構築） =====
// ref：直す自分のデッキ、またはもとにするスターター。null なら空から。color：作り終えたら、その色に選ぶ
function openBuilder(ref, color = 'b') {
  const d = deckByRef(ref);
  const mine = loadMyDecks();
  state.build = {
    id: d && !d.preset ? d.id : null,
    name: d ? (d.preset ? `${d.name}のコピー` : d.name) : `デッキ${mine.length + 1}`,
    color,
    returnMode: state.mode,
    dirty: !d || !!d.preset,
  };
  state.edit = { ...(d ? d.deck : {}) };
  state.deckSource = d && d.preset ? d.ref.slice(7) : null;
  state.deckFocus = null;
  state.phase = 'build';
  showScreen('deck');
  $('deck-name').value = state.build.name;
  $('deck-delete').hidden = !state.build.id;
  renderDeck(true);
}

function leaveBuilder(saved) {
  if (!saved && state.build.dirty && deckCount(state.edit) && !window.confirm('保存せずにもどりますか？')) return;
  startSelect(state.build.returnMode);
}

function saveBuilder() {
  const deck = { ...state.edit };
  if (!deckCount(deck)) return;
  const list = loadMyDecks();
  const name = ($('deck-name').value || '').trim().slice(0, 16) || `デッキ${list.length + 1}`;
  let id = state.build.id;
  if (id) { const d = list.find((x) => x.id === id); if (d) { d.name = name; d.deck = deck; } } else {
    id = `d${Date.now().toString(36)}`;
    list.push({ id, name, deck });
  }
  saveMyDecks(list);
  if (state.build.returnMode !== 'manage') {
    state.choice = state.choice || {};
    state.choice[state.build.color] = `my:${id}`;
    saveChoice(state.choice);
  }
  Sound.pick();
  leaveBuilder(true);
}

function deleteBuilder() {
  if (!state.build.id || !window.confirm(`「${$('deck-name').value}」を消しますか？`)) return;
  saveMyDecks(loadMyDecks().filter((d) => d.id !== state.build.id));
  state.build.dirty = false;
  leaveBuilder(true);
}

function loadTemplate(id) {
  const st = STARTERS.find((x) => x.id === id);
  if (!st) return;
  state.edit = { ...st.deck };
  state.deckSource = id;
  state.build.dirty = true;
  Sound.select();
  renderDeck();
}

const deckColor = () => (state.build ? state.build.color : 'b');

function renderDeck(full = false) {
  const color = deckColor();
  const deck = state.edit;
  const pts = deckPoints(deck), left = DECK_POINTS - pts, count = deckCount(deck);
  $('deck-screen').dataset.turn = color;

  // ひな形（スターターデッキ）：押すと、その中身から始める
  $('deck-starters').innerHTML = STARTERS.map((st) => `<button type="button" class="starter ${state.deckSource === st.id ? 'is-on' : ''}" data-id="${st.id}">
      <span class="starter-name">${st.name}</span>
      <span class="starter-stones">${deckIcons(st.deck, color, 6)}</span>
      <span class="starter-note">${st.note}・${deckCount(st.deck)}個</span>
    </button>`).join('');

  // 碁石の一覧（ポイントの安い順）
  if (full || !$('deck-catalog').children.length || $('deck-catalog').dataset.color !== color) {
    $('deck-catalog').dataset.color = color;
    let lastCost = 0;
    $('deck-catalog').innerHTML = CATALOG.map((id) => {
      const c = costOf(id);
      const head = c !== lastCost ? `<p class="dk-head ${TIER[c]}"><span class="dk-coin">${c}</span>ポイント</p>` : '';
      lastCost = c;
      const desc = id === 'plain' ? '超能力のない、ふつうの碁石' : ABILITIES[id].desc;
      return `${head}<div class="dk-tile ${TIER[c]}" data-id="${id}" role="button" tabindex="0" aria-label="${ABILITIES[id].name}（${c}ポイント）">
        <span class="dk-visual">${stoneHTML(color, id)}</span>
        <span class="dk-body"><span class="dk-name">${ABILITIES[id].name}</span><span class="dk-desc">${desc}</span></span>
        <span class="dk-step">
          <button type="button" class="dk-minus" aria-label="${ABILITIES[id].name}を1つへらす">−</button>
          <b class="dk-n">0</b>
          <span class="dk-plus" aria-hidden="true">＋</span>
        </span>
      </div>`;
    }).join('');
    $('deck-catalog').querySelectorAll('.dk-tile').forEach((el) => {
      const id = el.dataset.id;
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') focusDeck(id); });
      el.addEventListener('click', (e) => {
        if (e.target.closest('.dk-minus')) { changeDeck(id, -1); return; }
        focusDeck(id);
        changeDeck(id, 1, el);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === '+') { e.preventDefault(); changeDeck(id, 1, el); }
        if (e.key === 'Backspace' || e.key === '-') { e.preventDefault(); changeDeck(id, -1); }
      });
      el.addEventListener('focus', () => focusDeck(id));
    });
  }
  $('deck-catalog').querySelectorAll('.dk-tile').forEach((el) => {
    const id = el.dataset.id, n = deck[id] || 0;
    const max = id === 'plain' ? Infinity : MAX_COPIES;
    el.classList.toggle('is-in', n > 0);
    el.classList.toggle('is-off', n >= max || costOf(id) > left);
    el.querySelector('.dk-n').textContent = n;
  });

  // ポイントのメーター：1ポイントが1マス。碁石ごとに、その色でマスが埋まる
  const cells = [];
  for (const id of CATALOG) for (let k = 0; k < (deck[id] || 0); k++) {
    for (let j = 0; j < costOf(id); j++) cells.push(`<i class="${TIER[costOf(id)]} ${j === 0 ? 'is-first' : ''}" data-id="${id}"></i>`);
  }
  while (cells.length < DECK_POINTS) cells.push('<i class="is-empty"></i>');
  $('deck-meter').innerHTML = `
    <div class="meter-nums">
      <span class="meter-num"><b>${left}</b><small>のこりポイント</small></span>
      <span class="meter-num"><b>${count}</b><small>置ける碁石</small></span>
      <button type="button" class="btn-text meter-clear" ${count ? '' : 'disabled'}>空にする</button>
    </div>
    <div class="meter-bar" style="--n:${DECK_POINTS}">${cells.join('')}</div>`;

  // デッキの中身：置ける碁石を全部並べる（数と強さが見てわかる）
  $('deck-bag').innerHTML = deckList(deck).sort((x, y) => CATALOG.indexOf(y) - CATALOG.indexOf(x))
    .map((id) => stoneHTML(color, id, '', `data-id="${id}"`)).join('');

  $('deck-meter').querySelector('.meter-clear').onclick = () => {
    state.edit = {};
    state.deckSource = null;
    state.build.dirty = true;
    Sound.select();
    renderDeck();
  };
  renderDeckInfo();
  $('deck-go').disabled = count === 0;
}

function focusDeck(id) {
  if (state.deckFocus === id) return;
  state.deckFocus = id;
  $('deck-catalog').querySelectorAll('.dk-tile').forEach((el) => el.classList.toggle('is-focus', el.dataset.id === id));
  renderDeckInfo();
}

function renderDeckInfo() {
  const el = $('deck-info');
  const old = el.querySelector('.mini');
  if (old) Demo.stop(old);
  const id = state.deckFocus;
  if (!id) { el.innerHTML = '<p class="deck-hint">碁石を押すとデッキに入る。<br>強い碁石ほどポイントが高い。</p>'; return; }
  const ab = ABILITIES[id];
  const desc = id === 'plain' ? '超能力のない、ふつうの碁石' : ab.desc;
  el.innerHTML = `<span class="deck-demo mini"></span><span class="deck-text"><b>${ab.name}<span class="dk-coin ${TIER[costOf(id)]}">${costOf(id)}</span></b>${desc}</span>`;
  if (Demo.has(id)) Demo.start(el.querySelector('.mini'), id);
}

// デッキに足す・へらす。ポイントが足りないときや3つを超えるときは、揺れて知らせる
function changeDeck(id, d, tileEl) {
  const deck = state.edit;
  const n = deck[id] || 0;
  if (d > 0) {
    const max = id === 'plain' ? Infinity : MAX_COPIES;
    if (n >= max || deckPoints(deck) + costOf(id) > DECK_POINTS) {
      const why = n >= max ? '同じ碁石は3つまで' : 'ポイントが足りない';
      bump(tileEl, why);
      return;
    }
    deck[id] = n + 1;
    Sound.pick();
  } else {
    if (!n) return;
    if (n === 1) delete deck[id]; else deck[id] = n - 1;
    Sound.select();
  }
  state.deckSource = null;
  state.build.dirty = true;
  renderDeck();
  if (d > 0) {
    // 足した碁石が、一覧からデッキへ飛んでいく
    const from = tileEl && tileEl.querySelector('.dk-visual > .stone');
    if (tileEl) { const v = tileEl.querySelector('.dk-visual'); v.classList.remove('is-pop'); void v.offsetWidth; v.classList.add('is-pop'); }
    const to = [...$('deck-bag').querySelectorAll(`.stone[data-id="${id}"]`)].pop();
    if (from && to) flyTo(from.getBoundingClientRect(), to, stoneHTML(deckColor(), id));
    $('deck-meter').querySelectorAll(`.meter-bar i[data-id="${id}"]`).forEach((c) => { c.classList.remove('is-pop'); void c.offsetWidth; c.classList.add('is-pop'); });
  }
}

function bump(el, why) {
  Sound.deny();
  for (const t of [el, $('deck-meter')]) {
    if (!t) continue;
    t.classList.remove('is-bump'); void t.offsetWidth; t.classList.add('is-bump');
  }
  const tip = $('deck-toast');
  tip.textContent = why;
  tip.classList.remove('is-show'); void tip.offsetWidth; tip.classList.add('is-show');
}

function flyTo(fromRect, toEl, html) {
  return new Promise((resolve) => {
    const to = toEl.getBoundingClientRect();
    const flyer = document.createElement('div');
    flyer.className = 'flyer';
    flyer.innerHTML = html;
    Object.assign(flyer.style, { left: `${fromRect.left}px`, top: `${fromRect.top}px`, width: `${fromRect.width}px`, height: `${fromRect.height}px` });
    document.body.appendChild(flyer);
    toEl.classList.add('is-landing');
    const dx = to.left + to.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = to.top + to.height / 2 - (fromRect.top + fromRect.height / 2);
    const scale = to.width / fromRect.width;
    const anim = flyer.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + scale) / 2 * 1.15})`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    ], { duration: 250, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
    anim.onfinish = () => { flyer.remove(); toEl.classList.remove('is-landing'); resolve(); };
  });
}

// --- 対局 ---
function startGame(seed = newSeed()) {
  Demo.stopAll();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  setSeed(seed);
  state.phase = 'play';
  state.board = newBoard();
  state.players = { b: makePlayer('b', state.decks.b), w: makePlayer('w', state.decks.w) };
  state.turn = 'b';
  state.selected = 0;
  state.sealed = null;
  state.chainTurn = null;
  state.jammed = null;
  state.lastMove = null;
  state.fx = [];
  state.winLine = null;
  state.winner = undefined;
  state.moveCount = 0;
  state.pending = null;
  state.aim = null;
  $('board').classList.remove('is-aiming');
  state.busy = false;
  state.lastActive = null;
  log('黒から');
  showScreen('game');
  buildBoard();
  renderGame();
  maybeCpuMove();
}

// CPU の番なら、少し考えるふりをしてから打つ（選んだ碁石を持ち上げ、置く場所に影を出してから置く）
async function maybeCpuMove() {
  if (state.phase !== 'play' || !isCpu(state.turn) || state.busy) return;
  state.busy = true;
  state.cpuThinking = true;
  $(`panel-${state.turn}`).classList.add('is-thinking');
  await sleep(CPU_DELAY_MS);
  const move = AI.chooseMove({ depth: 2 });
  $(`panel-${state.turn}`).classList.remove('is-thinking');
  state.busy = false;
  state.cpuThinking = false;
  if (!move) return;
  state.selected = move.i;
  renderPanel(state.turn);
  renderStatus();
  renderBoard();
  state.busy = true;
  showPreview(move.x, move.y, true);
  await sleep(500);
  clearPreview();
  state.busy = false;
  place(move.x, move.y, false, move.target || null);
}

function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      if (x === 0) cell.classList.add('edge-l');
      if (x === SIZE - 1) cell.classList.add('edge-r');
      if (y === 0) cell.classList.add('edge-t');
      if (y === SIZE - 1) cell.classList.add('edge-b');
      if ((x === 5 && y === 5) || ([2, 8].includes(x) && [2, 8].includes(y))) cell.classList.add('star');
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.setAttribute('aria-label', `${colLabel(x)}${y + 1}`);
      cell.addEventListener('pointerup', (e) => onCellTap(x, y, e.pointerType));
      cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellTap(x, y, 'key'); } });
      cell.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { showPreview(x, y); hoverStone(x, y); } });
      cell.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { clearPreview(); hideStoneTip(); } });
      board.appendChild(cell);
    }
  }
  // 演出の粒を描くキャンバス。盤より少し大きくして、粒がはみ出せるようにする
  const wrap = board.parentElement;
  if (!wrap.querySelector('.board-fx')) wrap.insertAdjacentHTML('beforeend', '<canvas class="board-fx" aria-hidden="true"></canvas>');
}

// 盤の座標 → 演出のキャンバスの位置
const FX_MARGIN = 60;
function boardTarget() {
  const board = $('board');
  const w = board.getBoundingClientRect().width;
  const pad = w * 0.025, cell = (w * 0.95) / SIZE;
  return {
    canvas: board.parentElement.querySelector('.board-fx'),
    cell,
    shakeEl: board.parentElement,
    dimEl: board,
    dimOffset: FX_MARGIN,
    map: (x, y) => [FX_MARGIN + pad + (x + 0.5) * cell, FX_MARGIN + pad + (y + 0.5) * cell],
  };
}

const cellEl = (x, y) => $('board').children[y * SIZE + x];
const selectedCard = () => state.players[state.turn] && state.players[state.turn].hand[state.selected];

// board と fx を渡すと、その段階の盤を描く（1手の途中の段階を順に見せるため）
function renderBoard(board = state.board, fxList = state.fx, final = true) {
  const fxMap = new Map(fxList.map((f) => [`${f.x},${f.y}`, f]));
  const winSet = new Set((final && state.winLine || []).map(([x, y]) => `${x},${y}`));
  const card = selectedCard();
  const id = card ? effectiveAbility(card, state.turn) : 'plain';
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const el = cellEl(x, y);
      const p = board[y][x];
      const key = `${x},${y}`;
      const fx = fxMap.get(key);
      const classes = [];
      let style = '';
      if (fx) classes.push(`fx-${fx.kind}`);
      if (fx && fx.el) classes.push(`fx-el-${fx.el}`);
      if (fx && fx.kind === 'moved') style = `style="--from-x:${fx.fromX - x};--from-y:${fx.fromY - y}"`;
      if (winSet.has(key)) classes.push('is-win');
      el.classList.toggle('is-last', final && !!state.lastMove && state.lastMove[0] === x && state.lastMove[1] === y);
      el.innerHTML = p ? pieceHTML(p, classes.join(' '), style) : '';
      const playable = final && state.phase === 'play' && canPlaceAt(x, y, state.turn, id);
      el.disabled = !state.aim && !playable;
      el.classList.toggle('is-target', playable && !!p);
    }
  }
  $('board').dataset.turn = state.turn;
}

// 能力の効果が届くマス（置く場所そのものは含めない）。プレビューと演出の両方で使う
function areaCells(id, x, y, b) {
  const out = [];
  const mark = (cx, cy) => { if (inside(cx, cy) && (cx !== x || cy !== y)) out.push([cx, cy]); };
  const area = ABILITIES[id] && ABILITIES[id].area;
  if (area === 'ring') for (const [dx, dy] of DIRS8) mark(x + dx, y + dy);
  if (area === 'ring2') for (const [dx, dy] of DIRS8) mark(x + dx * 2, y + dy * 2);
  if (area === 'cross') for (const [dx, dy] of DIRS4) mark(x + dx, y + dy);
  if (area === 'mirror') mark(SIZE - 1 - x, SIZE - 1 - y);
  if (area === 'mirrorH') mark(SIZE - 1 - x, y);
  if (area === 'mirrorV') mark(x, SIZE - 1 - y);
  const R = LINE_BOMB_RANGE;
  if (area === 'row') for (let k = -R; k <= R; k++) mark(x + k, y);
  if (area === 'col') for (let k = -R; k <= R; k++) mark(x, y + k);
  if (area === 'diag') for (let k = -R; k <= R; k++) { mark(x + k, y + k); mark(x + k, y - k); }
  if (area === 'warp') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { mark(x + dx, y + dy); mark(SIZE - 1 - x - dx, SIZE - 1 - y - dy); }
  if (area === 'sq5') for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(x + dx, y + dy);
  if (area === 'square') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(x + dx, y + dy);
  if (area === 'down') for (let cy = y + 1; inside(x, cy) && !b[cy][x]; cy++) mark(x, cy);
  if (area === 'up') for (let cy = y - 1; inside(x, cy) && !b[cy][x]; cy--) mark(x, cy);
  return out;
}

// ===== 盤の上の碁石の説明 =====
// マウスを1秒乗せるか、押すと出る。手札の吹き出しと同じ形（お試しの盤＋名前＋説明）
let stoneTipTimer = null;
let stoneTipAt = null;
function hoverStone(x, y) {
  if (state.aim) return;
  clearTimeout(stoneTipTimer);
  if (!state.board[y] || !state.board[y][x]) return;
  stoneTipTimer = setTimeout(() => showStoneTip(x, y), 1000);
}
function toggleStoneTip(x, y) {
  if (stoneTipAt && stoneTipAt[0] === x && stoneTipAt[1] === y) { hideStoneTip(); return; }
  showStoneTip(x, y);
}
function hideStoneTip() {
  clearTimeout(stoneTipTimer);
  stoneTipAt = null;
  const tip = $('stone-tip');
  if (!tip || tip.hidden) return;
  const demo = tip.querySelector('.mini');
  if (demo) Demo.stop(demo);
  tip.hidden = true;
}
function showStoneTip(x, y) {
  const p = state.board[y] && state.board[y][x];
  const cellEl = $('board').querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!p || !cellEl) return;
  let tip = $('stone-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'stone-tip';
    tip.className = 'stone-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  const old = tip.querySelector('.mini');
  if (old) Demo.stop(old);
  const ab = ABILITIES[p.ability] || ABILITIES.plain;
  const owner = p.color === 'n' ? '誰のものでもない' : `${nameOf(p.owner || p.color)}の碁石`;
  const fuseNote = p.ability === 'timeBomb' ? `（あと${p.fuse == null ? FUSE : p.fuse}手で爆発）` : '';
  const desc = p.ability === 'plain' ? '超能力のない、ふつうの碁石'
    : p.ability === 'block' ? '石垣が立てた、誰のものでもない石。どの列にも入らない'
    : ab.desc;
  const showDemo = Demo.has(p.ability);
  tip.innerHTML = `${showDemo ? '<span class="tip-demo mini"></span>' : ''}<b>${ab.name}</b><span class="tip-owner">${owner}${fuseNote}</span>${desc}`;
  tip.hidden = false;
  // 碁石の上に出す。上に場所がなければ下に。左右は画面からはみ出さないように
  const r = cellEl.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
  let top = r.top - t.height - 8;
  if (top < 8) top = r.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  stoneTipAt = [x, y];
  if (showDemo) Demo.start(tip.querySelector('.mini'), p.ability);
}

// 置く前の見た目：置く石の影と、効果の届く範囲
function showPreview(x, y, force = false) {
  if (state.aim) return;
  clearPreview();
  const card = selectedCard();
  if (state.phase !== 'play' || (state.busy && !force) || !card) return;
  if (!force && notMine(state.turn)) return;
  const id = effectiveAbility(card, state.turn);
  if (!canPlaceAt(x, y, state.turn, id)) return;
  const ab = ABILITIES[id];
  const el = cellEl(x, y);
  const pending = state.pending && state.pending[0] === x && state.pending[1] === y;
  el.insertAdjacentHTML('beforeend', stoneHTML(id === 'spy' ? other(state.turn) : state.turn, id, `is-ghost ${pending ? 'is-pending' : ''}`));
  for (const [cx, cy] of areaCells(id, x, y, state.board)) cellEl(cx, cy).classList.add('in-area');
}

function clearPreview() {
  $('board').querySelectorAll('.is-ghost').forEach((g) => { if (!state.aim || !g.classList.contains('is-pending')) g.remove(); });
  $('board').querySelectorAll('.in-area').forEach((c) => c.classList.remove('in-area'));
}

function renderPanel(color) {
  const p = state.players[color];
  const myTurn = state.phase === 'play' && state.turn === color;
  const active = myTurn && !notMine(color); // この画面の人が手札を選べるか
  const sealed = state.sealed === color;
  const el = $(`panel-${color}`);
  el.classList.toggle('is-active', myTurn);
  el.classList.toggle('is-cpu', notMine(color));
  // 手番が来たときだけ、手札を一度弾ませる
  const turnKey = `${color}${state.moveCount}`;
  const turnStart = myTurn && state.lastActive !== turnKey;
  if (myTurn) state.lastActive = turnKey;
  el.innerHTML = `
    <div class="player-head">
      <span class="turn-dot turn-${color}"></span>
      <span class="player-name">${playerName(color)}</span>
      <span class="thinking" aria-hidden="true"><i></i><i></i><i></i></span>
      ${sealed ? '<span class="tag">封印中</span>' : ''}
      <span class="bag-info">のこり${piecesLeft(p)}個</span>
      ${state.deckNames && state.deckNames[color] ? `<span class="player-deck">${escapeHTML(state.deckNames[color])}</span>` : ''}
    </div>

    <div class="hand ${turnStart ? 'is-turn-start' : ''}" role="radiogroup" aria-label="${COLOR_NAME[color]}の手札">
      ${p.hand.map((c, i) => {
        const ab = ABILITIES[c.ability];
        const cls = ['hand-piece'];
        const selected = myTurn && i === state.selected;
        if (selected) cls.push('is-selected');
        if (sealed && c.ability !== 'plain') cls.push('is-sealed');
        const blocked = myTurn && cardBlocked(c, color);
        if (blocked) cls.push('is-blocked');
        const tipText = sealed && c.ability !== 'plain' ? '封印されていて、ただの石になる' : blocked ? '連続のあとは、連続を置けない' : ab.desc;
        const tip = tipText ? `<span class="hand-tip" role="tooltip"><span class="tip-demo mini"></span><b>${ab.name}</b>${tipText}</span>` : '';
        return `<button type="button" class="${cls.join(' ')}" data-index="${i}" ${active ? '' : 'disabled'} role="radio" aria-checked="${selected}" aria-label="${ab.name}${ab.desc ? `：${ab.desc}` : ''}">
          ${stoneHTML(color, c.ability)}<span class="hand-name">${ab.name}</span>${active ? `<span class="hand-key">${i + 1}</span>` : ''}${tip}
        </button>`;
      }).join('')}
    </div>`;
  el.querySelectorAll('.hand-piece').forEach((c) => {
    c.addEventListener('click', () => selectCard(Number(c.dataset.index)));
    const demo = c.querySelector('.tip-demo');
    const ability = p.hand[Number(c.dataset.index)].ability;
    if (demo && Demo.has(ability) && state.sealed !== color) {
      c.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') Demo.start(demo, ability); });
      c.addEventListener('pointerleave', () => { Demo.stop(demo); demo.innerHTML = ''; });
    }
  });
}

function selectCard(i) {
  // 演出の途中でも選べる（先行入力）。CPU の番は選べない
  if (state.phase !== 'play' || notMine(state.turn) || state.cpuThinking) return;
  if (i < 0 || i >= state.players[state.turn].hand.length) return;
  const card = state.players[state.turn].hand[i];
  if (cardBlocked(card, state.turn)) { Sound.deny(); const el = $(`panel-${state.turn}`).querySelectorAll('.hand-piece')[i]; if (el) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); } return; }
  if (state.selected !== i) Sound.select();
  endAim();
  state.selected = i;
  renderPanel(state.turn);
  if (!state.busy) renderBoard();
  renderStatus();
  if (state.pending) showPreview(...state.pending);
  drawQueued();
}

function renderStatus() {
  const status = $('game-status');
  if (state.phase === 'end') {
    status.innerHTML = `<span class="status-text">${state.winner ? `${playerName(state.winner)}の勝ち` : '引き分け'}</span>`
      + '<button type="button" class="btn-primary btn-small" id="again-inline">もう一局</button>';
    $('again-inline').addEventListener('click', () => (state.mode === 'online' ? backToTitle(true) : startGame()));
  } else {
    status.innerHTML = `<span class="turn-dot turn-${state.turn}"></span><span class="status-text">${playerName(state.turn)}の番</span>`;
  }
}

// 選んでいる碁石が使えないとき（スパイとリーチ）は、使える碁石を選び直す
function fixSelection() {
  if (state.phase !== 'play') return;
  const hand = state.players[state.turn].hand;
  if (hand[state.selected] && !cardBlocked(hand[state.selected], state.turn)) return;
  const i = hand.findIndex((c) => !cardBlocked(c, state.turn));
  state.selected = i >= 0 ? i : 0;
}

function renderGame() {
  fixSelection();
  renderBoard();
  renderPanel('w');
  renderPanel('b');
  renderStatus();
}

function renderLog() {
  const el = $('log');
  if (el) el.innerHTML = state.logs.map((t) => `<li>${t}</li>`).join('');
}

// タッチでは、1回目のタップで場所を選び、同じマスをもう一度タップして置く
// ===== スナイパーで狙う =====
// 置くマスを決めたら「狙う」状態になる。盤の石を押すと、そこを撃って置く。空きマスや同じマスを押すとやめる
function startAim(x, y) {
  state.aim = [x, y];
  clearPreview();
  renderBoard();
  const b = $('board');
  b.classList.add('is-aiming');
  const ghost = b.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (ghost) ghost.insertAdjacentHTML('beforeend', stoneHTML(state.turn, 'sniper', 'is-ghost is-pending'));
  for (let yy = 0; yy < SIZE; yy++) for (let xx = 0; xx < SIZE; xx++) {
    if (canSnipe(state.board, xx, yy, x, y)) b.querySelector(`.cell[data-x="${xx}"][data-y="${yy}"]`).classList.add('is-target');
  }
  $('game-status').querySelector('.status-text').textContent = '撃つ石を選ぶ（空きマスでやめる）';
}
function endAim() {
  if (!state.aim) return;
  state.aim = null;
  $('board').classList.remove('is-aiming');
  renderBoard();
  renderStatus();
}

function onCellTap(x, y, pointerType) {
  const card = selectedCard();
  const cell = state.board[y] && state.board[y][x];
  // 狙っているとき：石を押したら撃つ。それ以外はやめる
  if (state.aim) {
    const [ax, ay] = state.aim;
    if (canSnipe(state.board, x, y, ax, ay)) { place(ax, ay, false, [x, y]); return; }
    endAim();
    return;
  }
  const canPlace = state.phase === 'play' && card && !notMine(state.turn) && !state.cpuThinking && canPlaceAt(x, y, state.turn, effectiveAbility(card, state.turn));
  // 置けない碁石の上を押したら、その碁石の説明を出す（もう一度押すと閉じる）
  if (cell && !canPlace) { toggleStoneTip(x, y); return; }
  hideStoneTip();
  if (!canPlace) return;
  // 演出の途中なら予約する（先行入力）。同じマスをもう一度押すと取り消し。スナイパーは狙う手順があるので予約しない
  if (state.busy && ABILITIES[effectiveAbility(card, state.turn)].aim) return;
  if (state.busy) {
    const same = state.queued && state.queued[0] === x && state.queued[1] === y;
    state.queued = same ? null : [x, y];
    drawQueued();
    return;
  }
  if (pointerType === 'touch' || pointerType === 'pen') {
    const same = state.pending && state.pending[0] === x && state.pending[1] === y;
    if (!same) {
      state.pending = [x, y];
      showPreview(x, y);
      return;
    }
  }
  state.pending = null;
  clearPreview();
  // スナイパー：撃てる石があれば、置くマスを決めてから狙う
  if (ABILITIES[effectiveAbility(card, state.turn)].aim) {
    let any = false;
    for (let yy = 0; yy < SIZE && !any; yy++) for (let xx = 0; xx < SIZE; xx++) if (canSnipe(state.board, xx, yy, x, y)) { any = true; break; }
    if (any) { startAim(x, y); return; }
  }
  place(x, y);
}

async function place(x, y, remote = false, target = null) {
  hideStoneTip(); // 盤が変わるので、碁石の説明は閉じる
  endAim();
  const color = state.turn;
  const sent = selectedCard();
  if (state.mode === 'online' && !remote && sent) Net.send('move', { id: sent.id, x, y, target });
  const res = playMove(x, y, target);
  if (!res.ok) return;
  state.busy = true;
  renderPanel('w');
  renderPanel('b');
  renderStatus();
  const special = !HIDDEN_IDS.includes(res.ability);
  const banner = special ? showBanner(res.ability, color) : null;
  const t = boardTarget();
  const area = special ? areaCells(res.ability, x, y, res.before) : [];
  Sound.place();
  if (!special) res.steps[0].fx[0].el = 'plain'; // ただの石も、着いて少し震える
  // 予兆：置いただけの盤を見せ、石をためる（届く範囲に点線の枠）
  if (special) {
    renderBoard(res.before, [{ kind: 'placed', x, y }], false);
    const st = cellEl(x, y).querySelector('.stone');
    if (st) st.classList.add('is-charging');
    FX.anticipate(t, res.ability, x, y, { area, target });
    Sound.charge(FX.elementOf(res.ability), FX.anticipationOf(res.ability), res.ability);
    await sleep(FX.anticipationOf(res.ability) * 1000);
    Sound.ability(res.ability);
  }
  // 衝撃 → 重力 → 囲碁・地雷、と段階ごとに盤を描き、音を鳴らす
  for (let i = 0; i < res.steps.length; i++) {
    const last = i === res.steps.length - 1;
    // 予兆で見せた石は、もう一度落とさない
    renderBoard(res.steps[i].board, i === 0 && special ? res.steps[0].fx.slice(1) : res.steps[i].fx, last);
    if (i === 0 && special) FX.burst(t, res.ability, x, y, { fx: res.steps[0].fx, area });
    else if (i === 0) { FX.plain(t, x, y, color); FX.after(t, res.steps[0].fx.slice(1), res.steps[0].board, { origin: [x, y] }); }
    else FX.after(t, res.steps[i].fx, res.steps[i].board);
    drawQueued();
    Sound.fx(i === 0 ? res.steps[0].fx.slice(1) : res.steps[i].fx, i === 0 ? 0.1 : 0);
    // 予約があれば、段階の間を短くして早く返す
    if (!last) await sleep(state.queued ? 160 : STEP_MS);
  }
  if (banner && !state.queued) await banner;
  if (res.extraTurn && !res.winner && state.phase === 'play' && state.turn === color && !state.queued) await showBanner(null, color, 'もう1回');
  state.busy = false;
  state.fx = [];
  renderGame();
  if (state.phase === 'end') { state.queued = null; showResult(color); return; }
  // 予約した手を置く（盤が変わって置けなくなっていたら取り消す）
  const q = state.queued;
  state.queued = null;
  const card = selectedCard();
  if (q && card && !notMine(state.turn) && canPlaceAt(q[0], q[1], state.turn, effectiveAbility(card, state.turn))) { place(q[0], q[1]); return; }
  if (runRemoteQueue()) return;
  maybeCpuMove();
}

// ===== オンライン対戦：相手から届いた手 =====
// 演出の途中に届いた手は、ためておいて、手が空いてから順に進める
function onRemote(type, data) {
  state.remoteQueue = state.remoteQueue || [];
  state.remoteQueue.push({ type, data });
  if (!state.busy) runRemoteQueue();
}
function runRemoteQueue() {
  const q = state.remoteQueue;
  if (!q || !q.length || state.busy) return false;
  const { type, data } = q.shift();
  if (type === 'move' && state.phase === 'play' && isRemote(state.turn)) {
    const i = state.players[state.turn].hand.findIndex((c) => c.id === data.id);
    const t = Array.isArray(data.target) && data.target.length === 2 ? data.target.map(Number) : null;
    if (i >= 0) { state.selected = i; place(data.x, data.y, true, t); return true; }
  }
  return runRemoteQueue();
}

// 予約したマスに、脈打つ影を出す
function drawQueued() {
  $('board').querySelectorAll('.is-queued').forEach((g) => g.remove());
  const q = state.queued;
  const card = selectedCard();
  if (!q || !card) return;
  const id = effectiveAbility(card, state.turn);
  cellEl(q[0], q[1]).insertAdjacentHTML('beforeend', stoneHTML(id === 'spy' ? other(state.turn) : state.turn, id, 'is-ghost is-pending is-queued'));
}

function showBanner(ability, color, text) {
  return new Promise((resolve) => {
    const b = $('banner');
    b.innerHTML = ability ? `${iconHTML(ability)}${ABILITIES[ability].name}` : text;
    b.className = `banner banner-${color}`;
    b.hidden = false;
    void b.offsetWidth; // アニメーションを毎回かけ直す
    b.classList.add('is-show');
    setTimeout(() => { b.hidden = true; b.classList.remove('is-show'); resolve(); }, BANNER_MS);
  });
}

function showResult(mover) {
  let text, sub;
  if (!state.winner) {
    text = '引き分け';
    sub = state.board.every((row) => row.every(Boolean)) ? '盤が埋まった' : '碁石を使い切った';
  } else {
    text = `${playerName(state.winner)}の勝ち`;
    const line = state.winLine.map(([x, y]) => state.board[y][x]);
    if (line.some((p) => p.ability === 'spy' && p.owner === state.winner && p.color !== state.winner)) sub = 'スパイが効いた';
    else if (state.winner !== mover) sub = `${playerName(mover)}が${playerName(state.winner)}の列をつくってしまった`;
    else if (state.winKind === 'flag') sub = '旗のまわりを囲んだ';
    else if (line.some((p) => p.ability === 'joker' && p.color !== state.winner)) sub = '相手のジョーカーで揃った';
    else sub = `${state.moveCount}手目で決着`;
  }
  $('result-text').textContent = text;
  $('result-sub').textContent = sub;
  $('deck-again').hidden = state.mode === 'online';
  const happy = state.winner && !notMine(state.winner);
  if (happy) Sound.win(); else Sound.lose();
  $('result-dialog').showModal();
}

function renderRules() {
  $('rules-types').textContent = `超能力の碁石は${SPECIAL_IDS.length}種類。${DECK_POINTS}ポイントの中で、好きな碁石を組み合わせてデッキにする。`;
  $('ability-list').innerHTML = SPECIAL_IDS.map((id) => {
    const ab = ABILITIES[id];
    return `<dt>${stoneHTML('b', id)}${ab.name}<span class="dk-coin ${TIER[costOf(id)]}">${costOf(id)}</span></dt><dd>${ab.desc}</dd>`;
  }).join('');
}

// ===== オンライン対戦：相手をさがして、始める =====
// 知らない人と当たる。ロビーで相手が見つかったら、ホスト（誘った側）が種と色を決めて送る
async function startOnline() {
  state.phase = 'online';
  state.mode = 'online';
  showScreen('online');
  $('online-title').textContent = '対戦相手をさがしています';
  $('online-sub').textContent = 'つないでいます…';
  try {
    const { isHost } = await Net.find((n) => {
      $('online-sub').textContent = n > 0 ? `いま、ほかに ${n}人がさがしています` : 'ほかにさがしている人を待っています';
    });
    if (state.phase !== 'online') return; // やめるが押された
    $('online-title').textContent = '見つかりました！';
    $('online-sub').textContent = '';
    if (isHost) {
      const seed = newSeed();
      const myColor = Math.random() < 0.5 ? 'b' : 'w';
      Net.send('start', { seed, guestColor: other(myColor) });
      Net.send('deck', { deck: state.myDeck, name: state.myDeckName, player: loadMyName() });
      beginOnline(seed, myColor);
    } else {
      Net.send('deck', { deck: state.myDeck, name: state.myDeckName, player: loadMyName() });
      Net.once('start', (d) => beginOnline(d.seed, d.guestColor));
    }
  } catch (err) {
    if (state.phase !== 'online') return;
    $('online-title').textContent = 'つながりませんでした';
    $('online-sub').textContent = 'もう一度、タイトルからためしてください';
  }
}

// 相手のデッキが届いたら始める（両方の画面で、同じ種から同じ袋を作る）
function beginOnline(seed, myColor) {
  if (state.phase !== 'online') return;
  state.myColor = myColor;
  Net.once('deck', (d) => {
    if (state.phase !== 'online') return;
    state.mode = 'online';
    state.decks = { [myColor]: state.myDeck, [other(myColor)]: sanitizeDeck(d.deck) };
    state.deckNames = { [myColor]: state.myDeckName, [other(myColor)]: cleanName(d.name) || '相手のデッキ' };
    state.opponentName = cleanName(d.player) || NO_NAME;
    $('online-sub').textContent = `相手：${state.opponentName}`;
    setTimeout(() => startGame(seed), 900);
  });
}

// 相手から届いたデッキを、決まりの中に収める（知らない碁石・多すぎる数・ポイントの超過を落とす）
function sanitizeDeck(deck) {
  const out = {};
  let pts = 0;
  for (const id of CATALOG) {
    let n = Math.max(0, Math.floor(Number(deck && deck[id]) || 0));
    if (id !== 'plain') n = Math.min(n, MAX_COPIES);
    while (n > 0 && pts + costOf(id) * n > DECK_POINTS) n--;
    if (n) { out[id] = n; pts += costOf(id) * n; }
  }
  return deckCount(out) ? out : { plain: DECK_POINTS };
}

// 左上の名前を押すと、タイトルに戻る。対局の途中なら、確かめてから
function backToTitle(force = false) {
  if (state.phase === 'title') return;
  if (!force && state.phase === 'play' && !window.confirm('対局の途中です。タイトルに戻りますか？')) return;
  if (state.mode === 'online' || state.phase === 'online') Net.leave();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  Demo.stopAll();
  state.phase = 'title';
  state.busy = false;
  state.queued = null;
  state.pending = null;
  showScreen('title');
}

// 押したボタンが画面いっぱいに広がり、そのあいだに次の画面へ切り替えて、色が抜けていく
function expandThen(btn, next) {
  if (state.expanding) return;
  // OS の「視差効果を減らす」がオンでも見せる（ほかの演出と同じ扱い。短い1回きりの動き）
  state.expanding = true;
  const r = btn.getBoundingClientRect();
  const cover = document.createElement('div');
  cover.className = 'expander';
  const colors = getComputedStyle(btn);
  cover.style.background = colors.backgroundColor;
  cover.style.color = colors.color;
  cover.innerHTML = `<span>${(btn.querySelector('.mode-label') || btn).textContent.trim()}</span>`;
  document.body.appendChild(cover);
  Sound.whoosh();
  const from = { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${r.height / 2}px` };
  const to = { left: '0px', top: '0px', width: `${innerWidth}px`, height: `${innerHeight}px`, borderRadius: '0px' };
  cover.querySelector('span').animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
  cover.animate([from, to], { duration: 280, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'forwards' }).onfinish = () => {
    next();
    cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
      cover.remove();
      state.expanding = false;
    };
  };
}

// タイトルの背景：アイソメトリック（斜め上から見た）の五目並べの盤。画面からはみ出す大きさで置く
function renderTitleArt() {
  const W = 64, H = 32, T = 26; // マスの幅・高さ（2:1）、盤の厚み
  const P = (i, j) => [(i - j) * W / 2, (i + j) * H / 2];
  const pt = (i, j) => P(i, j).join(',');
  const e = -0.7, f = SIZE - 1 + 0.7;
  const parts = [];
  // 盤の側面と上面
  const [rx, ry] = P(f, e), [bx, by] = P(f, f), [lx, ly] = P(e, f);
  parts.push(`<polygon class="art-side-r" points="${rx},${ry} ${bx},${by} ${bx},${by + T} ${rx},${ry + T}"/>`);
  parts.push(`<polygon class="art-side-l" points="${lx},${ly} ${bx},${by} ${bx},${by + T} ${lx},${ly + T}"/>`);
  parts.push(`<polygon class="art-top" points="${pt(e, e)} ${pt(f, e)} ${pt(f, f)} ${pt(e, f)}"/>`);
  // 線
  for (let k = 0; k < SIZE; k++) {
    parts.push(`<line class="art-line" x1="${P(k, 0)[0]}" y1="${P(k, 0)[1]}" x2="${P(k, SIZE - 1)[0]}" y2="${P(k, SIZE - 1)[1]}"/>`);
    parts.push(`<line class="art-line" x1="${P(0, k)[0]}" y1="${P(0, k)[1]}" x2="${P(SIZE - 1, k)[0]}" y2="${P(SIZE - 1, k)[1]}"/>`);
  }
  // 石（奥から手前の順に描く）。いくつかには超能力のアイコンを、盤に寝かせて描く
  const stones = [
    [1, 2, 'w'], [2, 1, 'b'], [2, 3, 'b', 'gravity'], [3, 2, 'w'], [3, 3, 'b'], [1, 5, 'w', 'spin'], [4, 2, 'b'],
    [4, 4, 'b'], [5, 1, 'w', 'bomb'], [3, 5, 'w'], [5, 5, 'b'], [4, 6, 'w'], [6, 3, 'w', 'joker'], [6, 6, 'b', 'go'],
    [2, 6, 'b'], [7, 2, 'b', 'push'], [5, 7, 'w'], [7, 5, 'w'], [8, 4, 'b', 'shield'], [3, 8, 'w', 'antigravity'],
  ].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  // 碁石は上下がふくらんだ回転楕円体。斜め上から見ると、少し厚みのある楕円に見える。
  // 平たい円柱（オセロの石）に見えないよう、側面は描かず、光の当たり方（グラデーション）で丸みを出し、盤に影を落とす
  const R = W * 0.37;
  for (const [i, j, c, icon] of stones) {
    const [x, y] = P(i, j);
    const lift = R * 0.2; // ふくらんだぶん、中心が盤より少し上にある
    parts.push(`<ellipse class="art-shadow" cx="${x + 3}" cy="${y + 3}" rx="${R * 1.02}" ry="${R * 0.5}"/>`);
    parts.push(`<ellipse fill="url(#art-stone-${c})" class="art-stone-${c}" cx="${x}" cy="${y - lift}" rx="${R}" ry="${R * 0.64}"/>`);
    if (icon) parts.push(`<g class="art-icon-${c}" transform="translate(${x},${y - lift * 1.4}) scale(1,0.5) rotate(45) scale(1.1) translate(-12,-12)">${ICONS[icon]}</g>`);
  }
  const defs = `<defs>
    <radialGradient id="art-stone-b" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="#6a6560"/><stop offset="0.45" stop-color="#2a2724"/><stop offset="1" stop-color="#0d0c0b"/></radialGradient>
    <radialGradient id="art-stone-w" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f4f0e8"/><stop offset="1" stop-color="#c9c1b2"/></radialGradient>
  </defs>`;
  const [, maxY] = P(f, f);
  $('title-art').innerHTML = `<svg viewBox="${P(e, f)[0] - 8} ${P(e, e)[1] - 40} ${P(f, e)[0] - P(e, f)[0] + 16} ${maxY + T + 50}" aria-hidden="true">${defs}${parts.join('')}</svg>`;
}

function onKey(e) {
  if (document.querySelector('dialog[open]')) return;
  if (state.phase === 'play' && ['1', '2', '3'].includes(e.key)) selectCard(Number(e.key) - 1);
  if (e.key === 'Escape' && state.pending) { state.pending = null; clearPreview(); }
  if (e.key === 'Escape') endAim();
}

function init() {
  if (!$('start-pvp')) return; // ゲームの画面がないページ（比較ページなど）では、初期化しない
  renderRules();
  $('logo-btn').addEventListener('click', backToTitle);
  $('start-pvp').addEventListener('click', (e) => expandThen(e.currentTarget, () => startSelect('pvp')));
  $('start-cpu').addEventListener('click', (e) => expandThen(e.currentTarget, () => startSelect('cpu')));
  $('start-online').addEventListener('click', (e) => expandThen(e.currentTarget, () => startSelect('online')));
  $('decks-btn').addEventListener('click', () => { if (state.phase === 'play' && !window.confirm('対局の途中です。デッキの画面に行きますか？')) return; startSelect('manage'); });
  $('select-cols').addEventListener('click', onSelectClick);
  $('select-cols').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sel-card')) { e.preventDefault(); onSelectClick(e); } });
  $('select-go').addEventListener('click', confirmSelect);
  $('my-name').addEventListener('input', (e) => saveMyName(cleanName(e.target.value)));
  $('deck-go').addEventListener('click', saveBuilder);
  $('deck-back').addEventListener('click', () => leaveBuilder(false));
  $('deck-delete').addEventListener('click', deleteBuilder);
  $('deck-name').addEventListener('input', () => { state.build.dirty = true; });
  $('deck-starters').addEventListener('click', (e) => { const b = e.target.closest('.starter'); if (b) loadTemplate(b.dataset.id); });
  $('online-cancel').addEventListener('click', () => { Net.leave(); startSelect('online'); });
  Net.on('move', (d) => onRemote('move', d));
  Net.onLeave(() => {
    if (state.mode !== 'online' || state.phase !== 'play') return;
    state.phase = 'end';
    state.busy = false;
    $('result-text').textContent = '接続が切れました';
    $('result-sub').textContent = '相手との接続が切れました';
    $('result-dialog').showModal();
  });
  $('again-btn').addEventListener('click', () => (state.mode === 'online' ? backToTitle(true) : startGame()));
  renderTitleArt();
  $('look-btn').addEventListener('click', () => $('result-dialog').close());
  $('deck-again').addEventListener('click', () => startSelect(state.mode));
  $('rules-btn').addEventListener('click', () => $('rules-dialog').showModal());
  $('log-btn').addEventListener('click', () => $('log-dialog').showModal());
  initBoardShare();
  const soundBtn = $('sound-btn');
  const renderSoundBtn = () => { soundBtn.classList.toggle('is-muted', Sound.muted); soundBtn.setAttribute('aria-pressed', String(!Sound.muted)); };
  soundBtn.addEventListener('click', () => { Sound.setMuted(!Sound.muted); renderSoundBtn(); });
  renderSoundBtn();
  // ダイアログの外側（中身の枠より外）を押したら閉じる
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  }
  document.addEventListener('keydown', onKey);
  // 最初に触ったときに、録音の素材を読み込んでおく（ブラウザは触る前に音を鳴らせない）
  document.addEventListener('pointerdown', () => Sound.preload(), { once: true });
  // 盤の外をタップしたら、碁石の説明を閉じる
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.board')) hideStoneTip(); });
  window.addEventListener('scroll', hideStoneTip, { passive: true });
  // 盤の外をタップしたら、選んでいたマスを取り消す
  document.addEventListener('pointerdown', (e) => {
    if (state.pending && !e.target.closest('.board') && !e.target.closest('.hand')) {
      state.pending = null; clearPreview();
    }
  });
  showScreen('title');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
if (typeof module !== 'undefined') {
  module.exports = {
    setSeed, SIZE, ABILITIES, ICONS, SPECIAL_IDS, LINE_DIRS,
    findWin, specialWin, lineOwner, countsFor, growth, newBoard, newPiece, playMove, resolvePlacement, snapshot, areaCells, settle, goTraps, mineCheck,
    state, makePlayer, STARTERS, COST, DECK_POINTS, MAX_COPIES, costOf, deckPoints, deckCount, deckList, hasReach, cardBlocked, spyCompletes, canSnipe, pushColumn, makeCard, effectiveAbility, canPlaceAt, inside, other, shuffle,
  };
}
