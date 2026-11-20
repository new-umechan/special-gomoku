// 棋譜のシェア：盤面の PNG と、決着手を繰り返す GIF を共有・保存する。
// 比べた型（縦長のポスターなど）も残してある。tools/share-compare.html で見比べられる。
// 画像には、結果・2人の名前とデッキ・最後の盤（揃った列を光らせる）・最後の手・使われた超能力・手数・URL を載せる。
(function () {
  const W = 1080, H = 1350;
  const C = { bg: '#f7f4ee', ink: '#1f1d1a', muted: '#8b857b', board: '#efd6a3', line: '#8a6a3a', accent: '#e5533d', win: '#f5c518', card: '#ebe6dc', neutral: '#a8a296' };
  const URL_TEXT = 'new-umechan.github.io/special-gomoku';
  const $ = (id) => document.getElementById(id);

  // 碁石のアイコン（SVG）を画像にする。色を指定して、同じものは使い回す
  const iconCache = {};
  function iconImage(id, color) {
    const key = `${id}|${color}`;
    if (iconCache[key]) return iconCache[key];
    const body = (ICONS[id] || '').replace(/currentColor/g, color);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    iconCache[key] = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    return iconCache[key];
  }

  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function fitText(c, text, max) {
    let t = text;
    while (c.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + '…';
    return t;
  }

  async function stone(c, x, y, r, p) {
    const color = p.color === 'b' ? C.ink : p.color === 'w' ? '#ffffff' : C.neutral;
    c.fillStyle = color;
    if (p.color === 'n') { roundRect(c, x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5, r * 0.35); c.fill(); return; }
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    if (p.color === 'w') { c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke(); }
    if (p.ability && p.ability !== 'plain' && ICONS[p.ability]) {
      const img = await iconImage(p.ability, p.color === 'b' ? '#ffffff' : C.ink);
      if (img) c.drawImage(img, x - r * 0.62, y - r * 0.62, r * 1.24, r * 1.24);
    }
  }

  async function makeImage() {
    await fonts();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const body = '"Zen Maru Gothic", system-ui, sans-serif';
    const display = '"Dela Gothic One", "Zen Maru Gothic", sans-serif';
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);

    // 見出し：ゲームの名前と、結果
    c.fillStyle = C.ink; c.textBaseline = 'alphabetic';
    c.font = `44px ${display}`; c.fillText('超能力五目並べ', 64, 104);
    c.font = `76px ${display}`;
    c.fillStyle = state.winner ? C.accent : C.ink;
    c.fillText(fitText(c, state.resultText || '対局', W - 128), 64, 200);
    c.fillStyle = C.muted; c.font = `700 30px ${body}`;
    const sub = state.resultSub || '';
    c.fillText(fitText(c, /手目/.test(sub) ? sub : `${sub}　${state.moveCount}手`, W - 128), 64, 252);

    // 2人：名前とデッキ
    const players = ['b', 'w'].map((col) => ({ col, name: playerName(col), deck: (state.deckNames && state.deckNames[col]) || '' }));
    players.forEach((pl, i) => {
      const x = 64 + i * 484, y = 290;
      c.fillStyle = C.card; roundRect(c, x, y, 468, 104, 24); c.fill();
      if (state.winner === pl.col) { c.lineWidth = 5; c.strokeStyle = C.accent; roundRect(c, x + 2.5, y + 2.5, 463, 99, 22); c.stroke(); }
      c.beginPath(); c.arc(x + 52, y + 52, 26, 0, Math.PI * 2);
      c.fillStyle = pl.col === 'b' ? C.ink : '#ffffff'; c.fill();
      if (pl.col === 'w') { c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke(); }
      c.fillStyle = C.ink; c.font = `700 34px ${body}`; c.fillText(fitText(c, pl.name, 360), x + 96, y + 50);
      c.fillStyle = C.muted; c.font = `700 24px ${body}`; c.fillText(fitText(c, pl.deck, 360), x + 96, y + 84);
    });

    // 盤：最後の形。揃った列は黄色、最後の手は赤い輪
    const bs = 720, bx = (W - bs) / 2, by = 424, pad = 30, cell = (bs - pad * 2) / (SIZE - 1);
    c.fillStyle = C.board; roundRect(c, bx, by, bs, bs, 18); c.fill();
    c.strokeStyle = C.line; c.lineWidth = 2;
    for (let k = 0; k < SIZE; k++) {
      c.beginPath(); c.moveTo(bx + pad, by + pad + k * cell); c.lineTo(bx + pad + (SIZE - 1) * cell, by + pad + k * cell); c.stroke();
      c.beginPath(); c.moveTo(bx + pad + k * cell, by + pad); c.lineTo(bx + pad + k * cell, by + pad + (SIZE - 1) * cell); c.stroke();
    }
    c.fillStyle = C.line;
    for (const [sx, sy] of [[5, 5], [2, 2], [8, 2], [2, 8], [8, 8]]) { c.beginPath(); c.arc(bx + pad + sx * cell, by + pad + sy * cell, 5, 0, Math.PI * 2); c.fill(); }
    const win = new Set((state.winLine || []).map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const p = state.board[y][x];
      if (!p) continue;
      const px = bx + pad + x * cell, py = by + pad + y * cell;
      if (win.has(`${x},${y}`)) { c.fillStyle = C.win; c.beginPath(); c.arc(px, py, cell * 0.5, 0, Math.PI * 2); c.fill(); }
      await stone(c, px, py, cell * 0.4, p);
    }
    if (state.lastMove) {
      const [lx, ly] = state.lastMove;
      c.strokeStyle = C.accent; c.lineWidth = 5;
      c.beginPath(); c.arc(bx + pad + lx * cell, by + pad + ly * cell, cell * 0.48, 0, Math.PI * 2); c.stroke();
    }

    // 使われた超能力（多い順に8つまで）
    const used = {};
    for (const h of state.history || []) if (h.id !== 'plain') used[h.id] = (used[h.id] || 0) + 1;
    const top = Object.entries(used).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const uy = by + bs + 44;
    c.fillStyle = C.muted; c.font = `700 24px ${body}`;
    c.fillText(top.length ? '使われた超能力' : '超能力は使われなかった', 64, uy + 6);
    let ux = 64;
    for (const [id, n] of top) {
      await stone(c, ux + 26, uy + 52, 26, { color: 'b', ability: id });
      c.fillStyle = C.ink; c.font = `700 20px ${body}`;
      c.fillText(`×${n}`, ux + 58, uy + 62);
      ux += 118;
    }

    // いちばん下：URL
    c.fillStyle = C.muted; c.font = `700 24px ${body}`;
    c.textAlign = 'right'; c.fillText(URL_TEXT, W - 64, H - 40); c.textAlign = 'left';
    return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  }

  // ===== 比べるための別の型 =====
  const BODY = '"Zen Maru Gothic", system-ui, sans-serif';
  const DISPLAY = '"Dela Gothic One", "Zen Maru Gothic", sans-serif';
  async function fonts(extra = '') {
    const text = ['超能力五目並べ', 'VS 勝ち 引き分け 手・超能力回 使われた超能力は使われなかった 黒白 0123456789×', state.resultNote, state.resultText, state.resultSub,
      playerName('b'), playerName('w'), state.deckNames && state.deckNames.b, state.deckNames && state.deckNames.w, URL_TEXT, extra].filter(Boolean).join('');
    try {
      await Promise.all([
        document.fonts.load('80px "Dela Gothic One"', text),
        document.fonts.load('700 40px "Zen Maru Gothic"', text),
        document.fonts.load('500 40px "Zen Maru Gothic"', text),
      ]);
    } catch (e) { /* 字が読めなくても続ける */ }
  }
  function canvas(w, h, bg = C.bg, options) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d', options); c.fillStyle = bg; c.fillRect(0, 0, w, h); return [cv, c]; }
  const toBlob = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));
  const center = (c, text, x, y) => { c.textAlign = 'center'; c.fillText(text, x, y); c.textAlign = 'left'; };
  const BOARD_PADDING = 0.035;
  // 盤を描く（揃った列は黄色、最後の手は赤い輪）
  async function drawBoard(c, bx, by, bs, { pad = bs * BOARD_PADDING, frame = true, position = state } = {}) {
    const cell = (bs - pad * 2) / (SIZE - 1);
    if (frame) { c.fillStyle = C.board; roundRect(c, bx, by, bs, bs, bs * 0.025); c.fill(); }
    c.strokeStyle = C.line; c.lineWidth = Math.max(1.5, bs / 450);
    for (let k = 0; k < SIZE; k++) {
      c.beginPath(); c.moveTo(bx + pad, by + pad + k * cell); c.lineTo(bx + pad + (SIZE - 1) * cell, by + pad + k * cell); c.stroke();
      c.beginPath(); c.moveTo(bx + pad + k * cell, by + pad); c.lineTo(bx + pad + k * cell, by + pad + (SIZE - 1) * cell); c.stroke();
    }
    c.fillStyle = C.line;
    for (const [sx, sy] of [[5, 5], [2, 2], [8, 2], [2, 8], [8, 8]]) { c.beginPath(); c.arc(bx + pad + sx * cell, by + pad + sy * cell, cell * 0.08, 0, Math.PI * 2); c.fill(); }
    const win = new Set((position.winLine || []).map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const p = position.board[y][x];
      if (!p) continue;
      const px = bx + pad + x * cell, py = by + pad + y * cell;
      if (win.has(`${x},${y}`)) { c.fillStyle = C.win; c.beginPath(); c.arc(px, py, cell * 0.52, 0, Math.PI * 2); c.fill(); }
      await stone(c, px, py, cell * 0.41, p);
    }
    if (position.lastMove) {
      const [lx, ly] = position.lastMove;
      c.strokeStyle = C.accent; c.lineWidth = cell * 0.08;
      c.beginPath(); c.arc(bx + pad + lx * cell, by + pad + ly * cell, cell * 0.5, 0, Math.PI * 2); c.stroke();
    }
  }
  const usedList = () => {
    const used = {};
    for (const h of state.history || []) if (h.id && h.id !== 'plain') used[h.id] = (used[h.id] || 0) + 1;
    return Object.entries(used).sort((a, b) => b[1] - a[1]);
  };
  const playerInfo = (col) => ({ col, name: playerName(col), deck: (state.deckNames && state.deckNames[col]) || '' });
  async function smallStone(c, x, y, r, col, onDark = false) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = col === 'b' ? C.ink : '#fff'; c.fill();
    if (col === 'w' && !onDark) { c.lineWidth = r * 0.12; c.strokeStyle = C.ink; c.stroke(); }
    if (col === 'b' && onDark) { c.lineWidth = r * 0.14; c.strokeStyle = '#fff'; c.stroke(); }
  }

  // B：中央よせのポスター。結果を大きく、盤を真ん中に、下に「黒 VS 白」と使った超能力（A の形）
  async function poster() {
    await fonts();
    const [cv, c] = canvas(W, H);
    c.fillStyle = C.muted; c.font = `34px ${DISPLAY}`; center(c, '超能力五目並べ', W / 2, 88);
    c.fillStyle = state.winner ? C.accent : C.ink; c.font = `92px ${DISPLAY}`; center(c, fitText(c, state.resultText || '', W - 120), W / 2, 192);
    // ひとこと：決まり手に名前があればそれ、なければ手数と超能力の回数
    const used = usedList();
    const times = used.reduce((n, [, k]) => n + k, 0);
    const stat = `${state.moveCount}手・超能力${times}回`;
    const note = state.resultNote ? `${state.resultNote}　${stat}` : stat;
    c.fillStyle = C.muted; c.font = `700 32px ${BODY}`; center(c, fitText(c, note, W - 120), W / 2, 246);
    const bs = 720; await drawBoard(c, (W - bs) / 2, 280, bs);
    // 黒 VS 白
    const y = 1072;
    for (const [i, col] of ['b', 'w'].entries()) {
      const p = playerInfo(col), x = i === 0 ? W / 2 - 60 : W / 2 + 60;
      await smallStone(c, i === 0 ? x - 20 : x + 20, y - 12, 18, p.col);
      c.textAlign = i === 0 ? 'right' : 'left'; c.fillStyle = state.winner === p.col ? C.accent : C.ink; c.font = `700 36px ${BODY}`;
      c.fillText(fitText(c, p.name, 330), i === 0 ? x - 52 : x + 52, y);
      c.fillStyle = C.muted; c.font = `700 24px ${BODY}`; c.fillText(fitText(c, p.deck, 330), i === 0 ? x - 52 : x + 52, y + 36);
      c.textAlign = 'left';
    }
    c.fillStyle = C.muted; c.font = `30px ${DISPLAY}`; center(c, 'VS', W / 2, y);
    // 使われた超能力（A の形：ラベルと、アイコン ×回数。真ん中にそろえる）
    const top = used.slice(0, 7);
    c.fillStyle = C.muted; c.font = `700 24px ${BODY}`;
    center(c, top.length ? '使われた超能力' : '超能力は使われなかった', W / 2, 1170);
    const r = 26, item = r * 2 + 64;
    let ux = W / 2 - (top.length * item - 18) / 2;
    for (const [id, n] of top) {
      await stone(c, ux + r, 1222, r, { color: 'b', ability: id });
      c.fillStyle = C.ink; c.font = `700 22px ${BODY}`; c.fillText(`×${n}`, ux + r * 2 + 8, 1231);
      ux += item;
    }
    c.fillStyle = C.muted; c.font = `700 22px ${BODY}`; center(c, URL_TEXT, W / 2, H - 30);
    return toBlob(cv);
  }

  // C：対局カード（chess.com のように、盤の上下に2人）。盤を大きく
  async function versus() {
    await fonts();
    const [cv, c] = canvas(W, H, C.ink);
    const bar = async (pl, y) => {
      const won = state.winner === pl.col;
      await smallStone(c, 92, y, 30, pl.col, true);
      c.fillStyle = '#fff'; c.font = `700 40px ${BODY}`; c.fillText(fitText(c, pl.name, 560), 140, y + 2);
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = `700 26px ${BODY}`; c.fillText(fitText(c, pl.deck, 560), 140, y + 38);
      if (won) { c.fillStyle = C.accent; roundRect(c, W - 260, y - 34, 196, 64, 32); c.fill(); c.fillStyle = '#fff'; c.font = `36px ${DISPLAY}`; center(c, '勝ち', W - 162, y + 12); }
    };
    const bs = 952, bx = (W - bs) / 2, by = 196;
    await bar(playerInfo('w'), 120);
    await drawBoard(c, bx, by, bs);
    await bar(playerInfo('b'), by + bs + 70);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = `700 24px ${BODY}`;
    c.fillText(`${state.resultSub || ''}`, 64, H - 34);
    c.textAlign = 'right'; c.font = `28px ${DISPLAY}`; c.fillStyle = '#fff'; c.fillText('超能力五目並べ', W - 64, H - 34); c.textAlign = 'left';
    return toBlob(cv);
  }

  // D：Wordle 型。盤は見せず、手の流れを碁石の列で見せる（ネタばれしない）。正方形
  async function journey() {
    await fonts();
    const S = 1080;
    const [cv, c] = canvas(S, S);
    c.fillStyle = C.muted; c.font = `34px ${DISPLAY}`; center(c, '超能力五目並べ', S / 2, 100);
    c.fillStyle = state.winner ? C.accent : C.ink; c.font = `96px ${DISPLAY}`; center(c, fitText(c, state.resultText || '', S - 120), S / 2, 220);
    c.fillStyle = C.muted; c.font = `700 30px ${BODY}`; center(c, `${playerName('b')}（黒） vs ${playerName('w')}（白）`, S / 2, 280);
    // 1手ずつ、置いた碁石を左から並べる（10個で折り返す）
    const moves = (state.history || []).slice(0, 40);
    const per = 10, r = 34, gap = 16, rows = Math.ceil(moves.length / per);
    const top = 360 + Math.max(0, (4 - rows)) * (r + gap / 2);
    for (let i = 0; i < moves.length; i++) {
      const row = Math.floor(i / per), col = i % per;
      const inRow = Math.min(per, moves.length - row * per);
      const w = inRow * r * 2 + (inRow - 1) * gap;
      const x = S / 2 - w / 2 + r + col * (r * 2 + gap), y = top + row * (r * 2 + gap) + r;
      await stone(c, x, y, r, { color: moves[i].color, ability: moves[i].id });
    }
    c.fillStyle = C.ink; c.font = `700 40px ${BODY}`;
    center(c, `${state.moveCount}手　超能力 ${usedList().reduce((s, [, n]) => s + n, 0)}回`, S / 2, S - 150);
    c.fillStyle = C.muted; c.font = `700 24px ${BODY}`; center(c, URL_TEXT, S / 2, S - 60);
    return toBlob(cv);
  }

  // ===== B をもとにした型（横の余白を減らす） =====
  // 下の2段（黒 VS 白、使われた超能力）を描く。y は「黒 VS 白」の文字の高さ
  async function posterFoot(c, w, y, { compact = false } = {}) {
    for (const [i, col] of ['b', 'w'].entries()) {
      const p = playerInfo(col), x = i === 0 ? w / 2 - 60 : w / 2 + 60;
      await smallStone(c, i === 0 ? x - 20 : x + 20, y - 12, 18, p.col);
      c.textAlign = i === 0 ? 'right' : 'left'; c.fillStyle = state.winner === p.col ? C.accent : C.ink; c.font = `700 ${compact ? 32 : 36}px ${BODY}`;
      c.fillText(fitText(c, p.name, w / 2 - 140), i === 0 ? x - 52 : x + 52, y);
      if (!compact) { c.fillStyle = C.muted; c.font = `700 24px ${BODY}`; c.fillText(fitText(c, p.deck, w / 2 - 140), i === 0 ? x - 52 : x + 52, y + 36); }
      c.textAlign = 'left';
    }
    c.fillStyle = C.muted; c.font = `30px ${DISPLAY}`; center(c, 'VS', w / 2, y);
  }
  async function usedRow(c, w, y, { label = true, max = 7 } = {}) {
    const top = usedList().slice(0, max);
    if (label) { c.fillStyle = C.muted; c.font = `700 24px ${BODY}`; center(c, top.length ? '使われた超能力' : '超能力は使われなかった', w / 2, y); }
    const r = 26, item = r * 2 + 64, cy = y + (label ? 52 : 0);
    let ux = w / 2 - (top.length * item - 18) / 2;
    for (const [id, n] of top) {
      await stone(c, ux + r, cy, r, { color: 'b', ability: id });
      c.fillStyle = C.ink; c.font = `700 22px ${BODY}`; c.fillText(`×${n}`, ux + r * 2 + 8, cy + 9);
      ux += item;
    }
  }
  function posterHead(c, w, { y0 = 0, big = 92 } = {}) {
    const used = usedList(), times = used.reduce((n, [, k]) => n + k, 0);
    const stat = `${state.moveCount}手・超能力${times}回`;
    c.fillStyle = C.muted; c.font = `34px ${DISPLAY}`; center(c, '超能力五目並べ', w / 2, y0 + 80);
    c.fillStyle = state.winner ? C.accent : C.ink; c.font = `${big}px ${DISPLAY}`; center(c, fitText(c, state.resultText || '', w - 100), w / 2, y0 + 80 + big * 1.08);
    c.fillStyle = C.muted; c.font = `700 30px ${BODY}`;
    center(c, fitText(c, state.resultNote ? `${state.resultNote}　${stat}` : stat, w - 100), w / 2, y0 + 80 + big * 1.08 + 52);
  }

  // B1：盤を大きく（4:5 のまま）。見出しを詰め、下は1段にまとめる
  async function posterBig() {
    await fonts();
    const [cv, c] = canvas(W, H);
    posterHead(c, W, { y0: -14, big: 80 });
    const bs = 884; await drawBoard(c, (W - bs) / 2, 232, bs);
    await posterFoot(c, W, 1170, { compact: true });
    await usedRow(c, W, 1250, { label: false });
    c.fillStyle = C.muted; c.font = `700 20px ${BODY}`; center(c, URL_TEXT, W / 2, H - 22);
    return toBlob(cv);
  }

  // B2：盤を端から端まで。盤の上下に帯
  async function posterBleed() {
    await fonts();
    const [cv, c] = canvas(W, H);
    posterHead(c, W, { y0: -14, big: 80 });
    const top = 230, bs = 930;
    c.fillStyle = C.board; c.fillRect(0, top, W, bs + 60);
    await drawBoard(c, (W - bs) / 2, top + 30, bs, { frame: false, pad: 28 });
    await posterFoot(c, W, top + bs + 60 + 58, { compact: true });
    c.fillStyle = C.muted; c.font = `700 20px ${BODY}`; center(c, URL_TEXT, W / 2, H - 16);
    return toBlob(cv);
  }

  // B3：縦に少し長く（3:4、1080×1440）。盤を大きくしたまま、下の2段も残す
  async function posterTall() {
    await fonts();
    const HT = 1440;
    const [cv, c] = canvas(W, HT);
    posterHead(c, W, { y0: -6, big: 88 });
    const bs = 920; await drawBoard(c, (W - bs) / 2, 262, bs);
    await posterFoot(c, W, 1250);
    await usedRow(c, W, 1340, { label: false });
    c.fillStyle = C.muted; c.font = `700 20px ${BODY}`; center(c, URL_TEXT, W / 2, HT - 22);
    return toBlob(cv);
  }

  // B4：横長（1200×675、X のタイムラインでそのまま見える形）。左に盤、右に結果
  const LW = 1200, LH = 675;
  const landscapeBoard = { x: 40, y: 40, size: 595 };
  function landscapeData(inPlay = false) {
    return {
      position: { board: snapshot(state.board), winLine: inPlay ? null : state.winLine, lastMove: state.lastMove },
      players: ['b', 'w'].map(playerInfo),
      used: usedList(),
      moves: state.moveCount,
      winner: inPlay ? null : state.winner,
      title: inPlay ? '対局中' : $('result-text')?.textContent || state.resultText || '',
      note: inPlay ? '' : state.resultNote,
    };
  }

  async function drawLandscape(c, { position, players, used, moves, winner, title, note, subtitle }) {
    c.fillStyle = C.bg; c.fillRect(0, 0, LW, LH);
    const { x, y, size: bs } = landscapeBoard;
    await drawBoard(c, x, y, bs, { position });
    const cx = x + bs + (LW - x - bs) / 2;
    const times = used.reduce((n, [, k]) => n + k, 0);
    c.fillStyle = C.muted; c.font = `28px ${DISPLAY}`; center(c, '超能力五目並べ', cx, 110);
    c.fillStyle = winner ? C.accent : C.ink; c.font = `64px ${DISPLAY}`; center(c, fitText(c, title, LW - bs - 120), cx, 196);
    const stats = `${moves}手・超能力${times}回`;
    c.fillStyle = C.muted; c.font = `700 24px ${BODY}`; center(c, fitText(c, subtitle ?? (note ? `${note}　${stats}` : stats), LW - bs - 100), cx, 242);
    // 2人を縦に
    for (const [i, col] of ['b', 'w'].entries()) {
      const p = players[i], y = 330 + i * 70;
      await smallStone(c, cx - 170, y - 10, 18, col);
      c.fillStyle = winner === col ? C.accent : C.ink; c.font = `700 30px ${BODY}`; c.fillText(fitText(c, p.name, 300), cx - 140, y);
      c.fillStyle = C.muted; c.font = `700 20px ${BODY}`; c.fillText(fitText(c, p.deck, 300), cx - 140, y + 28);
    }
    const top = used.slice(0, 4), r = 22, item = r * 2 + 54;
    let ux = cx - (top.length * item - 14) / 2;
    for (const [id, n] of top) { await stone(c, ux + r, 540, r, { color: 'b', ability: id }); c.fillStyle = C.ink; c.font = `700 20px ${BODY}`; c.fillText(`×${n}`, ux + r * 2 + 6, 548); ux += item; }
    c.fillStyle = C.muted; c.font = `700 18px ${BODY}`; center(c, URL_TEXT, cx, LH - 34);
  }

  async function landscape(data = landscapeData()) {
    await fonts();
    const [cv, c] = canvas(LW, LH);
    await drawLandscape(c, data);
    return toBlob(cv);
  }

  function replayFrames(data, replay, move) {
    const { beforeMove, placed, steps, x, y, color, ability } = replay;
    const { x: bx, y: by, size } = landscapeBoard;
    const pad = size * BOARD_PADDING;
    const cell = (size - 2 * pad) / (SIZE - 1);
    const target = { cell, map: (cx, cy) => [bx + pad + cx * cell, by + pad + cy * cell] };
    const uid = placed[y][x].uid;
    const lead = { ...data, winner: null, title: '決着の一手', subtitle: move };
    const frames = [
      { ...lead, title: '決着の直前', subtitle: `${data.moves}手目`, position: { board: beforeMove }, delay: 650 },
      { ...lead, position: { board: placed, lastMove: [x, y] }, delay: 100,
        effect: FX.record(target, (t) => FX.plain(t, x, y, color)) },
    ];
    steps.forEach(({ board, fx }, i) => {
      const effect = FX.record(target, (t) => {
        if (i === 0 && FX.elementOf(ability)) {
          FX.burst(t, ability, x, y, { fx, area: areaCells(ability, x, y, placed) });
        } else {
          FX.after(t, i === 0 ? fx.slice(1) : fx, board, { origin: [x, y] });
        }
      });
      if (i === 0 && fx.length === 1 && !effect.duration) return;
      frames.push({ ...lead, position: { board, lastMove: findUid(board, uid) }, effect, delay: 140 });
    });
    frames.push({ ...data, delay: 1500 });
    return frames;
  }

  async function makeReplayGif(data, replay, isCurrent) {
    const { ability, color, rolled } = replay;
    const name = `${rolled ? 'はてな → ' : ''}${ABILITIES[ability].name}`;
    const move = `${data.players.find((player) => player.col === color).name}が${name}を置いた`;
    await fonts(`決着の直前 決着の一手 ${move}`);
    const [backdrop, base] = canvas(LW, LH);
    const [, c] = canvas(LW, LH, C.bg, { willReadFrequently: true });
    const { GIFEncoder, quantize, applyPalette } = Gifenc;
    const gif = GIFEncoder();
    async function writeFrame(delay, effect, seconds) {
      c.drawImage(backdrop, 0, 0);
      if (effect) effect.draw(c, seconds);
      const { data: rgba } = c.getImageData(0, 0, LW, LH);
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), LW, LH, { palette, delay, repeat: 0 });
      // フレームの間に閉じる操作や形式の切り替えを受け付ける。
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (const frame of replayFrames(data, replay, move)) {
      if (!isCurrent()) return null;
      await drawLandscape(base, frame);
      const interval = 60;
      const duration = Math.min(800, (frame.effect?.duration || 0) * 1000);
      for (let ms = 0; ms < duration; ms += interval) {
        if (!isCurrent()) return null;
        await writeFrame(interval, frame.effect, (ms + interval / 2) / 1000);
      }
      if (!isCurrent()) return null;
      await writeFrame(frame.delay);
    }
    gif.finish();
    return new Blob([gif.bytesView()], { type: 'image/gif' });
  }

  const LAYOUTS = { classic: makeImage, poster, versus, journey, posterBig, posterBleed, posterTall, landscape };

  let session, shareData, url, shareMode, request;

  function clearShare() {
    request = null;
    shareData = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
    $('share-img').removeAttribute('src');
  }

  function setShareMode(mode, notice = '') {
    shareMode = mode;
    const button = $('share-go');
    const composer = $('share-x');
    button.hidden = mode === 'paste';
    composer.hidden = mode !== 'paste';
    const label = request.format === 'gif' ? 'GIF' : '画像';
    let hint;
    if (mode === 'native') {
      button.textContent = `端末で${label}を共有`;
      hint = '端末の共有メニューでXやLINEを選べます。';
    } else if (mode === 'copy') {
      button.textContent = 'Xに投稿する画像をコピー';
      hint = 'コピーした画像を、Xの投稿欄に貼り付けられます。';
    } else if (mode === 'paste') {
      hint = '画像をコピーしました。Xの投稿欄で貼り付けてください。';
    } else {
      button.textContent = `${label}を保存してXを開く`;
      hint = `保存した${label}は、Xの投稿やLINEのトークに添付できます。`;
    }
    $('share-hint').textContent = notice + hint;
  }
  function openShare() {
    const dialog = $('share-dialog');
    if (dialog.open) return;
    const inPlay = state.phase === 'play' || state.busy;
    const imageData = landscapeData(inPlay);
    const replay = !inPlay && state.winner ? state.shareReplay : null;
    session = { imageData, replay, blobs: {}, text: `${imageData.title}（${imageData.moves}手） #超能力五目並べ` };
    prepareShare(replay ? 'gif' : 'png');
    dialog.showModal();
  }

  async function prepareShare(format) {
    clearShare();
    const { imageData, replay, blobs, text } = session;
    const current = { format };
    request = current;
    const isCurrent = () => request === current && $('share-dialog').open;
    const preview = $('share-img');
    const actions = $('share-actions');
    const hint = $('share-hint');
    const gif = format === 'gif';
    const label = gif ? 'GIF' : '画像';
    $('share-format').hidden = !replay;
    $('share-gif').setAttribute('aria-pressed', String(gif));
    $('share-png').setAttribute('aria-pressed', String(!gif));
    preview.alt = gif ? '決着手の繰り返し' : '対局の盤面';
    $('share-save').textContent = `${label}を保存`;
    preview.hidden = true;
    actions.hidden = true;
    hint.textContent = gif ? '決着GIFを作成しています…' : '対局画像を作成しています…';
    try {
      const blob = blobs[format] || await (gif ? makeReplayGif(imageData, replay, isCurrent) : landscape(imageData));
      if (!isCurrent()) return;
      if (!blob) throw new Error('画像を作成できませんでした');
      blobs[format] = blob;
      url = URL.createObjectURL(blob);
      preview.src = url;
      const file = new File([blob], `special-gomoku.${format}`, { type: blob.type });
      const image = { files: [file] };
      const gameUrl = `https://${URL_TEXT}/`;
      const touch = matchMedia('(pointer: coarse)').matches;
      const post = { ...image, text, url: gameUrl };
      let native = null;
      if (navigator.share && navigator.canShare?.(image)) {
        // スマホでは共有先が投稿文や URL を優先しないよう、ファイルだけを渡す。
        native = !touch && navigator.canShare(post) ? post : image;
      }
      const intent = new URL('https://twitter.com/intent/tweet');
      intent.searchParams.set('text', text);
      intent.searchParams.set('url', gameUrl);
      $('share-x').href = intent.href;
      const canCopy = !gif && !touch && !!(navigator.clipboard?.write && window.ClipboardItem &&
        (ClipboardItem.supports?.('image/png') ?? true));
      shareData = { file, native, canCopy, format };
      $('share-go').disabled = false;
      const notice = window.isSecureContext === false ? '端末で共有するにはHTTPSで開いてください。' : '';
      setShareMode(native ? 'native' : canCopy ? 'copy' : 'download', notice);
      preview.hidden = false;
      actions.hidden = false;
    } catch (error) {
      if (!isCurrent()) return;
      console.error('対局画像を作成できませんでした', error);
      hint.textContent = gif ? 'GIFを作れませんでした。静止画に切り替えられます。' : '画像を作れませんでした。閉じてもう一度お試しください。';
    }
  }
  function save() {
    if (!shareData) return;
    const a = document.createElement('a');
    a.href = url; a.download = `special-gomoku-${Date.now()}.${shareData.format}`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function share(mode) {
    const data = shareData;
    if (!data) return;
    if (mode === 'download') {
      save();
      window.open($('share-x').href, '_blank', 'noopener,noreferrer');
      return;
    }
    const button = $('share-go');
    button.disabled = true;
    try {
      if (mode === 'native') {
        await navigator.share(data.native);
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': data.file })]);
        if (data !== shareData) return;
        setShareMode('paste');
        if ($('share-dialog').open) $('share-x').focus();
      }
    } catch (e) {
      if (data !== shareData || e.name === 'AbortError') return;
      if (mode === 'native') data.native = null;
      else data.canCopy = false;
      const action = mode === 'native' ? '共有' : 'コピー';
      const label = data.format === 'gif' ? 'GIF' : '画像';
      setShareMode(data.native ? 'native' : data.canCopy ? 'copy' : 'download', `${label}を${action}できませんでした。`);
      button.disabled = false;
      if ($('share-dialog').open) button.focus();
    } finally {
      if (data === shareData) button.disabled = false;
    }
  }

  function init() {
    if (!$('share-btn')) return;
    $('share-btn').addEventListener('click', openShare);
    $('share-board-btn').addEventListener('click', openShare);
    $('share-dialog').addEventListener('close', (event) => {
      if (event.currentTarget.open) return;
      session = null;
      clearShare();
    });
    for (const format of ['gif', 'png']) {
      $(`share-${format}`).addEventListener('click', () => {
        if (request?.format !== format) prepareShare(format);
      });
    }
    $('share-back').addEventListener('click', () => $('share-dialog').close());
    $('share-save').addEventListener('click', save);
    $('share-go').addEventListener('click', () => share(shareMode));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ShareImage = { make: (layout = 'classic') => (LAYOUTS[layout] || makeImage)(), layouts: Object.keys(LAYOUTS) };
})();
