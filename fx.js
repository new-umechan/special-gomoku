// 演出（A″ の作り方）。フラットなモーショングラフィックス風：くっきりした形だけで描き、ぼかし・グラデーションは使わない。
// 使う形は、円・輪・先の丸い線・しずく形・2色の煙・跳ねるかけら。三角・星形・ギザギザは使わない（安っぽく見えた）。
// どの演出も「予兆 → 止め → 衝撃 → 余韻」で組む。消えるときは薄くせず縮める。
//
//   FX.anticipate(t, ability, x, y, opts) … 予兆（届く範囲の点線の枠、石のまわりの細い輪）。opts.area は届くマス
//   FX.burst(t, ability, x, y, opts)      … 衝撃と余韻（その属性の形を、盤のキャンバスに描く）
//   FX.after(t, fxList, board)             … あとの段階（消えた石のかけら、囲碁で取った、増殖、重力で落ちた…）
//   FX.ambient(canvas, ability) / FX.stop(canvas) … カードの背景で、属性の形をゆっくり流す
//   FX.shake(el, power)
//   Demo.start(el, ability) / Demo.stop(el) / Demo.stopAll() … 5×5 のお試しの盤
// target（t）は { canvas, map(x, y) → [px, py], cell, shakeEl }。盤の座標（0〜10）からキャンバスの位置へ。
(function () {
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const easeIn = (t) => Math.pow(clamp(t), 2.2);
  const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
  const backOut = (t) => { t = clamp(t); const s = 1.9; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
  const rand = (a, b) => a + Math.random() * (b - a);

  const INK = '#1f1d1a', WHITE = '#ffffff', CREAM = '#fff3d6';

  // ===== 属性 =====
  // c：その属性の3色（濃い・中・明るい）。smoke：煙の2色（暗い・明るい）
  const ELEMENTS = {
    fire: { name: '炎', tint: '#fbe1d4', c: ['#e5533d', '#ff9f1c', '#ffd23f'], smoke: ['#4a433c', '#6b6158'] },
    wind: { name: '風', tint: '#e6eef2', c: ['#5f7f93', '#b9d3e0', '#ffffff'], smoke: ['#d7e4ea', '#ffffff'] },
    vortex: { name: '渦', tint: '#dbe8f7', c: ['#1f4fa8', '#3d7be0', '#8cc2ff'], smoke: ['#2c4f86', '#4e78b8'] },
    gravity: { name: '重力', tint: '#e6e1f8', c: ['#2d2270', '#6a4cd6', '#b4a5ff'], smoke: ['#3a2f73', '#5a4aa6'] },
    earth: { name: '大地', tint: '#ece2d0', c: ['#5a4326', '#8a6a3a', '#c2a173'], smoke: ['#b39b78', '#d6c4a6'] },
    water: { name: '水面', tint: '#d9f0f3', c: ['#1a6f85', '#2fa6c4', '#9fe1ee'], smoke: ['#7fcbdc', '#c4ecf3'] },
    curse: { name: '呪い', tint: '#eadcf2', c: ['#3b1a52', '#7a3ea8', '#c48ae0'], smoke: ['#3b1a52', '#5c2e7c'] },
    shadow: { name: '影', tint: '#e2dfe4', c: ['#1f1d1a', '#4a433c', '#f5c518'], smoke: ['#2a2622', '#4a433c'] },
    thunder: { name: '雷', tint: '#f8f0c8', c: ['#c98a00', '#ffd23f', '#fff3a0'], smoke: ['#5d554c', '#7a7066'] },
    plant: { name: '植物', tint: '#dfeed6', c: ['#2f6b3a', '#4f9a57', '#9ad07a'], smoke: ['#7fb36f', '#a9d38f'] },
    light: { name: '光', tint: '#fbf0cc', c: ['#c98a00', '#f5c518', '#fff1b0'], smoke: ['#f0dd9a', '#fff6d6'] },
    invert: { name: '反転', tint: '#e8e6e1', c: ['#1f1d1a', '#8a847c', '#ffffff'], smoke: ['#2a2622', '#e8e6e1'] },
  };
  const ELEMENT_OF = {
    nuke: 'fire', timeBomb: 'fire', bomb: 'fire', warp: 'vortex', sniper: 'thunder',
    cataclysm: 'vortex', mystery: 'shadow', flipAround: 'invert', revolution: 'invert', swapHands: 'wind', fastForward: 'thunder', rowBomb: 'fire', colBomb: 'fire', diagBomb: 'fire',
    push: 'wind',
    suck: 'vortex', spin: 'vortex', spinBack: 'vortex',
    gravity: 'gravity', antigravity: 'gravity',
    go: 'earth', wall: 'earth', weight: 'earth', shield: 'earth',
    clone: 'water', cloneH: 'water', cloneV: 'water',
    seal: 'curse', jam: 'curse',
    spy: 'shadow', joker: 'shadow',
    mine: 'thunder', chain: 'thunder',
    grow: 'plant',
    flag: 'light',
    othello: 'invert', takeover: 'invert',
  };
  // 予兆の長さ（秒）。重い属性ほど長くためる
  const ANTICIPATION = { fire: 0.3, earth: 0.26, gravity: 0.2, thunder: 0.18 };

  // ===== 動かす仕組み（キャンバス1枚につき1つ）。粒はそれぞれ、自分の描き方（draw）を持つ =====
  const engines = new WeakMap();
  function engine(canvas) {
    let e = engines.get(canvas);
    if (!e) { e = new Engine(canvas); engines.set(canvas, e); }
    return e;
  }
  const targetEngine = (t) => t?.timeline || (t?.canvas ? engine(t.canvas) : null);
  class Engine {
    constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.ps = []; this.amb = null; this.raf = 0; this.w = 0; this.h = 0; }
    fit() {
      const r = this.c.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.c.width = Math.max(1, w * DPR); this.c.height = Math.max(1, h * DPR); }
    }
    // life 秒のあいだ、delay 秒たってから、draw(c, k) を毎フレーム呼ぶ（k は 0 → 1）
    add(life, draw, delay = 0) { this.ps.push({ life, max: life, delay, draw }); this.run(); }
    run() { if (this.raf) return; this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); }
    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (!this.c.isConnected) { this.raf = 0; this.ps = []; this.amb = null; return; }
      this.fit();
      const c = this.ctx;
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      if (this.amb) this.amb.tick(this, dt);
      const keep = [];
      for (const p of this.ps) {
        if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
        p.life -= dt;
        if (p.life <= 0) continue;
        c.save(); p.draw(c, 1 - p.life / p.max); c.restore();
        keep.push(p);
      }
      this.ps = keep;
      if (this.ps.length || this.amb) this.raf = requestAnimationFrame((tt) => this.frame(tt));
      else { this.raf = 0; c.clearRect(0, 0, this.w, this.h); }
    }
  }

  // ===== 形の部品（x, y はキャンバス上の位置、s は1マスの大きさ） =====
  const circle = (c, x, y, r, col) => { if (r <= 0.2) return; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  function dropPath(c, x, y, r, h, ang) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, -h);
    c.bezierCurveTo(r * 0.55, -h * 0.55, r, -r * 0.2, r, 0);
    c.arc(0, 0, r, 0, Math.PI);
    c.bezierCurveTo(-r, -r * 0.2, -r * 0.55, -h * 0.55, 0, -h);
    c.closePath(); c.fill(); c.restore();
  }
  const P = {
    // 芯：色を段で変えながら、行き過ぎてから縮む
    core(e, x, y, s, cols, { size = 1.5, dur = 0.24, delay = 0 } = {}) {
      e.add(dur, (c, k) => {
        const r = s * 0.42 * size * (k < 0.2 ? backOut(k / 0.2) : 1 - easeIn((k - 0.2) / 0.8));
        circle(c, x, y, r, cols[Math.min(cols.length - 1, Math.floor(k * cols.length * 1.3))]);
      }, delay);
    },
    // 輪：広がりながら細くなり、途中で弧に割れる。ry < 1 で地面の楕円
    ring(e, x, y, s, { col, wid = 0.24, far = 2.1, near = 0.46, dur = 0.4, delay = 0, split = 8, spin = 0.5, ry = 1, inward = false }) {
      e.add(dur, (c, k) => {
        const q = expoOut(k);
        const r = inward ? lerp(s * far, s * near, q) : lerp(s * near, s * far, q);
        c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = Math.max(0.5, s * wid * (1 - k));
        c.translate(x, y); c.scale(1, ry);
        if (!split || k < 0.3) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); return; }
        const gap = lerp(0.04, 0.6, (k - 0.3) / 0.7);
        for (let i = 0; i < split; i++) {
          const a0 = (i / split) * Math.PI * 2 + k * spin;
          c.beginPath(); c.arc(0, 0, r, a0 + gap / 2, a0 + (Math.PI * 2) / split - gap / 2); c.stroke();
        }
      }, delay);
    },
    // 先の丸い線：伸びてから根元から消える。先の玉はさらに飛ぶ
    ray(e, x, y, s, { a, len = 2, width = 3, col, tipCol = col, delay = 0, dur = 0.32, r0 = 0.5, tip = true }) {
      e.add(dur, (c, k) => {
        const head = expoOut(clamp(k / 0.5)), tail = easeIn(clamp((k - 0.15) / 0.85));
        if (head <= tail) return;
        const ra = lerp(s * r0, s * len, tail), rb = lerp(s * r0, s * len, head);
        c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + Math.cos(a) * ra, y + Math.sin(a) * ra); c.lineTo(x + Math.cos(a) * rb, y + Math.sin(a) * rb); c.stroke();
      }, delay);
      if (tip) e.add(dur + 0.1, (c, k) => {
        const d = lerp(s * len * 0.9, s * (len + 0.6), expoOut(k));
        circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.065 * (1 - easeIn(k)), tipCol);
      }, delay + 0.08);
    },
    // 小さな丸が飛び、少し遅れてさらに小さな丸が続く
    dots(e, x, y, s, { n = 8, cols, speed = 1.6, dur = 0.55, grav = 0.35, delay = 0, size = 0.1 }) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), v = s * speed * rand(0.8, 1.4), col = cols[i % cols.length];
        for (const [lag, sz] of [[0, size], [0.05, size * 0.55]]) {
          e.add(dur, (c, k) => {
            const d = v * easeOut(k);
            circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d + s * grav * k * k, s * sz * (1 - easeIn(k)), col);
          }, delay + lag);
        }
      }
    },
    // しずく形の炎：3層を少しずつ遅らせて重ね、揺れ、色が変わってから縮む
    flames(e, x, y, s, cols, { scale = 1, delay = 0, dur = 0.6 } = {}) {
      const list = [[-0.5, 0.95, 0], [0, 1.3, 0.02], [0.5, 1.0, 0.01], [-0.9, 0.6, 0.04], [0.9, 0.65, 0.03]];
      const layerCols = [[cols[0], cols[0], cols[0]], [cols[1], cols[1], cols[0]], [cols[2], cols[1], cols[1]]];
      const sizes = [1, 0.7, 0.42];
      for (let L = 0; L < 3; L++) {
        for (const [ang, hh, dl] of list) {
          e.add(dur, (c, k) => {
            const grow = k < 0.3 ? backOut(k / 0.3) : 1 - easeIn((k - 0.3) / 0.7);
            const f = sizes[L] * scale, r = s * 0.34 * f * grow, hgt = s * 0.78 * hh * f * grow + r;
            if (r <= 0.3) return;
            c.fillStyle = layerCols[L][Math.min(2, Math.floor(k * 3))];
            dropPath(c, x + Math.sin(ang) * s * 0.25 * f, y - s * 0.12 * k, r, hgt, ang * 0.55 + Math.sin(k * 14 + ang * 3) * 0.08);
          }, delay + L * 0.035 + dl);
        }
      }
      // ちぎれて昇る小さなしずく
      for (let i = 0; i < 4; i++) {
        e.add(0.4, (c, k) => {
          c.fillStyle = i % 2 ? cols[1] : cols[2];
          dropPath(c, x + (i - 1.5) * s * 0.22 * scale + Math.sin(k * 8 + i) * s * 0.05, y - s * (0.7 + 0.8 * easeOut(k)) * scale, s * 0.07 * (1 - k) * scale, s * 0.18 * (1 - k) * scale, 0);
        }, delay + 0.15 + i * 0.06);
      }
    },
    // 2色の煙：揺れながら昇り、縮んで消える
    smoke(e, x, y, s, cols, { n = 6, delay = 0.15, dur = 1.0, rise = 0.8, spread = 0.5, size = 1 } = {}) {
      for (let i = 0; i < n; i++) {
        e.add(dur, (c, k) => {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.48;
          const px = x + Math.cos(a) * s * spread * easeOut(k) + Math.sin(k * 6 + i) * s * 0.05;
          const py = y + Math.sin(a) * s * 0.3 * easeOut(k) - s * rise * easeOut(k);
          const r = s * size * (0.3 + (i % 2) * 0.08) * (k < 0.22 ? backOut(k / 0.22) : 1 - easeIn((k - 0.22) / 0.78));
          circle(c, px, py, r, cols[0]);
          circle(c, px - r * 0.25, py - r * 0.3, r * 0.55, cols[1]);
        }, delay + i * 0.035);
      }
    },
    // 平らな閃光（届く範囲が一瞬光る）
    flash(e, rect, col = CREAM, dur = 0.08) {
      e.add(dur, (c) => { c.fillStyle = col; c.beginPath(); c.roundRect(rect.x, rect.y, rect.w, rect.h, rect.r); c.fill(); });
    },
    // 予兆の枠：角の丸い点線が、行き過ぎてから収まる
    frame(e, rect, col, dur) {
      e.add(dur, (c, k) => {
        const q = clamp(backOut(k * dur / 0.2), 0, 1.08);
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        c.translate(cx, cy); c.scale(q, q); c.translate(-cx, -cy);
        c.fillStyle = col + '1f'; c.strokeStyle = col + '99'; c.lineWidth = 2; c.setLineDash([5, 6]); c.lineDashOffset = -k * dur * 36;
        c.beginPath(); c.roundRect(rect.x, rect.y, rect.w, rect.h, rect.r); c.fill(); c.stroke();
      });
    },
    // 回る弧（渦・回転）。r0 → r1 へ、dir の向きに回る
    arcs(e, x, y, s, { n = 3, r0 = 1.8, r1 = 0.4, dir = 1, col, width = 4, dur = 0.55, delay = 0, len = 1.1, turn = 2.6 }) {
      for (let i = 0; i < n; i++) {
        e.add(dur, (c, k) => {
          const r = s * lerp(r0, r1, easeOut(k));
          const a0 = (i / n) * Math.PI * 2 + dir * turn * easeOut(k);
          const L = len * (k < 0.25 ? backOut(k / 0.25) : 1 - easeIn((k - 0.25) / 0.75));
          if (L <= 0.02) return;
          c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round';
          c.beginPath();
          if (dir > 0) c.arc(x, y, r, a0 - L, a0); else c.arc(x, y, r, a0, a0 + L, false);
          c.stroke();
          // 進む向きの先に玉
          const tipA = dir > 0 ? a0 : a0 + L;
          circle(c, x + Math.cos(dir > 0 ? a0 : a0) * r, y + Math.sin(dir > 0 ? a0 : a0) * r, width * 0.9, col);
          void tipA;
        }, delay + i * 0.03);
      }
    },
    // 縦の筋（重力）。dir = 1 で下へ
    streaks(e, x, y, s, { dir = 1, col, col2, n = 5, dur = 0.42, delay = 0 }) {
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * s * 0.18, len = s * (0.9 + (i % 2) * 0.6);
        e.add(dur, (c, k) => {
          const head = expoOut(clamp(k / 0.55)), tail = easeIn(clamp((k - 0.2) / 0.8));
          if (head <= tail) return;
          const y0 = y - dir * s * 1.8;
          c.strokeStyle = i % 2 ? col : col2; c.lineWidth = i % 2 ? 3 : 2; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x + ox, y0 + dir * len * tail * 1.4); c.lineTo(x + ox, y0 + dir * len * head * 1.4); c.stroke();
        }, delay + i * 0.03);
      }
    },
    // 葉（植物）：しずく形を外向きに置き、行き過ぎてから縮む
    leaves(e, x, y, s, cols, { n = 6, dist = 0.75, dur = 0.65, delay = 0, scale = 1 } = {}) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3;
        e.add(dur, (c, k) => {
          const g = k < 0.3 ? backOut(k / 0.3) : 1 - easeIn((k - 0.3) / 0.7);
          const d = s * dist * scale * easeOut(k);
          c.fillStyle = cols[i % 2 ? 1 : 2];
          dropPath(c, x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.12 * g * scale, s * 0.36 * g * scale, a + Math.PI / 2 + Math.sin(k * 9) * 0.15);
        }, delay + i * 0.025);
      }
    },
    // 稲妻：先の丸い線を2回折り曲げてつなぐ（角は丸める）
    bolt(e, x, y, s, { a, len = 1.7, col, width = 4, dur = 0.3, delay = 0, bend = 0.45 }) {
      const pts = [[0, 0], [0.35, bend], [0.6, -bend * 0.7], [1, 0]];
      e.add(dur, (c, k) => {
        const head = expoOut(clamp(k / 0.35)), tail = easeIn(clamp((k - 0.3) / 0.7));
        if (head <= tail) return;
        c.translate(x, y); c.rotate(a);
        c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath();
        let started = false;
        const N = 24;
        for (let j = 0; j <= N; j++) {
          const q = j / N;
          if (q < tail || q > head) continue;
          const seg = Math.min(2, Math.floor(q * 3)), f = q * 3 - seg;
          const px = lerp(pts[seg][0], pts[seg + 1][0], f) * s * len, py = lerp(pts[seg][1], pts[seg + 1][1], f) * s * 0.4;
          if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        }
        c.stroke();
      }, delay);
    },
    // 壊れた石：2つの丸に割れて飛び、盤に落ちて小さく跳ねて消える
    shards(e, x, y, s, col, { ux = 0, uy = -1, delay = 0 } = {}) {
      const R = s * 0.42;
      for (let n = 0; n < 2; n++) {
        const a = Math.atan2(uy, ux) + (n - 0.5) * 0.9;
        e.add(0.75, (c, k) => {
          const dist = R * (0.9 + n * 0.35) * expoOut(k * 1.2);
          let hgt;
          if (k < 0.55) hgt = Math.sin((k / 0.55) * Math.PI) * R * 1.1;
          else { const q = (k - 0.55) / 0.3; hgt = q < 1 ? Math.sin(q * Math.PI) * R * 0.25 : 0; }
          const gx = x + Math.cos(a) * dist, gy = y + Math.sin(a) * dist;
          const r = R * 0.42 * (k < 0.8 ? 1 : 1 - easeIn((k - 0.8) / 0.2));
          if (r <= 0.3) return;
          c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.ellipse(gx, gy + r * 0.3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); c.fill();
          circle(c, gx, gy - hgt, r, col === 'w' ? WHITE : col === 'n' ? '#a8a296' : INK);
          if (col === 'w') { c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.arc(gx, gy - hgt, r, 0, Math.PI * 2); c.stroke(); }
        }, delay);
      }
    },
    // 岩のかけら（大地）：角の丸い四角が跳ね上がって落ちる
    rocks(e, x, y, s, cols, { n = 7, delay = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const vx = rand(-1.3, 1.3) * s, up = rand(0.8, 1.4) * s, sz = s * rand(0.08, 0.14), rot0 = rand(0, 3), col = cols[i % 3];
        e.add(0.7, (c, k) => {
          const px = x + vx * easeOut(k), py = y - Math.sin(k * Math.PI) * up + k * s * 0.2;
          const r = sz * (k < 0.8 ? 1 : 1 - easeIn((k - 0.8) / 0.2));
          c.translate(px, py); c.rotate(rot0 + k * 6);
          c.fillStyle = col; c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, r * 0.45); c.fill();
        }, delay + i * 0.015);
      }
    },
  };

  // ===== 属性ごとの衝撃（A″ の爆弾を基準に、形の組み合わせを変える） =====
  const IMPACT = {
    fire(e, x, y, s, o) {
      const [r, m, l] = ELEMENTS.fire.c;
      P.core(e, x, y, s, [WHITE, l, m], { size: 1.55 * o.pw });
      P.ring(e, x, y, s, { col: m, wid: 0.24, far: 2.1 * o.pw });
      P.ring(e, x, y, s, { col: r, wid: 0.08, far: 2.6 * o.pw, dur: 0.55, delay: 0.07 });
      for (let i = 0; i < 8; i++) {
        const long = i % 2 === 0;
        P.ray(e, x, y, s, { a: (i / 8) * Math.PI * 2 + Math.PI / 8, len: (long ? 2.2 : 1.5) * o.pw, width: long ? 4 : 2.5, col: long ? r : m, delay: long ? 0 : 0.03 });
      }
      P.flames(e, x, y, s, ELEMENTS.fire.c, { scale: o.pw, delay: 0.03 });
      P.smoke(e, x, y, s, ELEMENTS.fire.smoke, { size: o.pw });
      P.dots(e, x, y, s, { n: 6, cols: [r, m, INK], delay: 0.02 });
    },
    // 列の爆弾：芯は小さく、届くマスごとに小さな爆発を順に走らせる
    fireLine(e, x, y, s, o) {
      const [r, m, l] = ELEMENTS.fire.c;
      P.core(e, x, y, s, [WHITE, l, m], { size: 1.3 });
      P.ring(e, x, y, s, { col: m, wid: 0.18, far: 1.4 });
      for (const [px, py, k] of o.cells) {
        P.core(e, px, py, s, [WHITE, l, m], { size: 0.9, delay: k * 0.06 });
        P.flames(e, px, py, s, ELEMENTS.fire.c, { scale: 0.55, delay: k * 0.06 + 0.02, dur: 0.5 });
      }
      for (const a of o.dirs) P.ray(e, x, y, s, { a, len: 2.9, width: 4, col: r, r0: 0.4 });
      P.smoke(e, x, y, s, ELEMENTS.fire.smoke, { n: 4, size: 0.8 });
    },
    wind(e, x, y, s) {
      const [d, m, l] = ELEMENTS.wind.c;
      P.core(e, x, y, s, [WHITE, m], { size: 1.2, dur: 0.2 });
      P.ring(e, x, y, s, { col: d, wid: 0.12, far: 2.0, split: 12, spin: 0 });
      for (let i = 0; i < 8; i++) P.ray(e, x, y, s, { a: (i / 8) * Math.PI * 2, len: 2.3, width: i % 2 ? 3 : 5, col: i % 2 ? d : WHITE, tipCol: d, r0: 0.55 });
      P.arcs(e, x, y, s, { n: 4, r0: 0.7, r1: 1.7, dir: 1, col: d, width: 2.5, dur: 0.45, len: 0.7, turn: 0.8 });
      P.smoke(e, x, y, s, ELEMENTS.wind.smoke, { n: 4, rise: 0.2, spread: 1.1, size: 0.8, delay: 0.05, dur: 0.7 });
    },
    vortex(e, x, y, s, o) {
      const [d, m, l] = ELEMENTS.vortex.c;
      if (o.contract) {
        P.arcs(e, x, y, s, { n: 3, r0: 2.1, r1: 0.35, dir: 1, col: m, width: 4, dur: 0.6 });
        P.arcs(e, x, y, s, { n: 3, r0: 1.6, r1: 0.25, dir: 1, col: l, width: 2.5, dur: 0.6, delay: 0.06 });
        P.ring(e, x, y, s, { col: d, wid: 0.14, far: 2.2, near: 0.3, inward: true, dur: 0.5, split: 0 });
        P.core(e, x, y, s, [l, m, d], { size: 1.0, delay: 0.42, dur: 0.22 });
      } else {
        P.arcs(e, x, y, s, { n: 4, r0: 1.25, r1: 1.25, dir: o.dir, col: m, width: 5, dur: 0.6, len: 0.9, turn: 1.6 });
        P.arcs(e, x, y, s, { n: 4, r0: 0.9, r1: 0.9, dir: o.dir, col: l, width: 3, dur: 0.6, len: 0.6, turn: 1.9, delay: 0.05 });
        P.core(e, x, y, s, [WHITE, l, m], { size: 1.1, dur: 0.2 });
      }
      P.dots(e, x, y, s, { n: 6, cols: [d, m, l], speed: 1.3, grav: 0 });
    },
    gravity(e, x, y, s, o) {
      const [d, m, l] = ELEMENTS.gravity.c;
      P.streaks(e, x, y, s, { dir: o.dir, col: m, col2: l, n: 5 });
      P.core(e, x, y, s, [WHITE, l, m], { size: 1.2, delay: 0.12 });
      P.ring(e, x, y + s * 0.2 * o.dir, s, { col: m, wid: 0.2, far: 1.8, ry: 0.35, delay: 0.12, split: 0 });
      P.ring(e, x, y + s * 0.2 * o.dir, s, { col: d, wid: 0.07, far: 2.3, ry: 0.35, delay: 0.18, dur: 0.5 });
      P.dots(e, x, y + s * 0.2 * o.dir, s, { n: 6, cols: [d, m, l], speed: 1.1, grav: 0.2, delay: 0.12 });
    },
    earth(e, x, y, s, o) {
      const [d, m, l] = ELEMENTS.earth.c;
      P.core(e, x, y, s, [CREAM, l], { size: 1.3 * o.pw, dur: 0.2 });
      P.ring(e, x, y + s * 0.15, s, { col: m, wid: 0.22, far: 1.9 * o.pw, ry: 0.4, split: 0 });
      P.rocks(e, x, y, s, [d, m, l], { n: Math.round(7 * o.pw) });
      P.smoke(e, x, y + s * 0.1, s, ELEMENTS.earth.smoke, { n: 5, rise: 0.35, spread: 0.9, size: 0.9 * o.pw, delay: 0.05, dur: 0.9 });
    },
    water(e, x, y, s) {
      const [d, m, l] = ELEMENTS.water.c;
      P.core(e, x, y, s, [WHITE, l], { size: 1.1, dur: 0.2 });
      for (let i = 0; i < 3; i++) P.ring(e, x, y, s, { col: i === 1 ? d : m, wid: 0.12 - i * 0.02, far: 1.4 + i * 0.45, dur: 0.6, delay: i * 0.11, split: 10, spin: 0.2 });
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.45;
        e.add(0.55, (c, k) => {
          const d2 = s * 1.0 * easeOut(k), hgt = Math.sin(k * Math.PI) * s * 0.5;
          c.fillStyle = i % 2 ? m : l;
          dropPath(c, x + Math.cos(a) * d2, y + Math.sin(a) * d2 * 0.5 - hgt, s * 0.08 * (1 - easeIn(k)), s * 0.2 * (1 - easeIn(k)), a + Math.PI / 2);
        }, 0.04 + i * 0.02);
      }
    },
    curse(e, x, y, s) {
      const [d, m, l] = ELEMENTS.curse.c;
      P.arcs(e, x, y, s, { n: 4, r0: 1.9, r1: 0.6, dir: -1, col: m, width: 4, dur: 0.55, len: 0.8, turn: 1.2 });
      for (let i = 0; i < 4; i++) P.ray(e, x, y, s, { a: (i / 4) * Math.PI * 2 + Math.PI / 4, len: 0.55, r0: 1.6, width: 4, col: l, tip: false, dur: 0.35, delay: 0.12 });
      P.core(e, x, y, s, [l, m, d], { size: 1.15, delay: 0.32, dur: 0.26 });
      P.ring(e, x, y, s, { col: d, wid: 0.1, far: 1.7, delay: 0.32, dur: 0.45 });
      P.dots(e, x, y, s, { n: 6, cols: [d, m, l], speed: 1.2, grav: -0.3, delay: 0.32 });
    },
    shadow(e, x, y, s, o) {
      const [d, m, gold] = ELEMENTS.shadow.c;
      P.core(e, x, y, s, [m, d], { size: 1.3, dur: 0.22 });
      P.smoke(e, x, y, s, ELEMENTS.shadow.smoke, { n: 7, rise: 0.3, spread: 1.0, size: 1.0, delay: 0.02, dur: 0.85 });
      P.ring(e, x, y, s, { col: o.sparkle ? gold : WHITE, wid: 0.08, far: 1.8, dur: 0.5, delay: 0.1 });
      if (o.sparkle) P.dots(e, x, y, s, { n: 8, cols: [gold, '#ffe58a'], speed: 1.6, delay: 0.1, size: 0.09 });
    },
    thunder(e, x, y, s, o) {
      const [d, m, l] = ELEMENTS.thunder.c;
      P.core(e, x, y, s, [WHITE, l, m], { size: 1.3, dur: 0.18 });
      const n = o.bolts || 4;
      for (let i = 0; i < n; i++) P.bolt(e, x, y, s, { a: (i / n) * Math.PI * 2 + 0.4, len: 1.8, col: i % 2 ? m : d, width: i % 2 ? 4 : 3, delay: i * 0.02 });
      P.ring(e, x, y, s, { col: m, wid: 0.1, far: 1.8, dur: 0.35 });
      P.dots(e, x, y, s, { n: 7, cols: [d, m, l], speed: 1.8, grav: 0.1, size: 0.08 });
    },
    plant(e, x, y, s) {
      const [d, m, l] = ELEMENTS.plant.c;
      P.core(e, x, y, s, [WHITE, l, m], { size: 1.1, dur: 0.22 });
      P.leaves(e, x, y, s, ELEMENTS.plant.c, { n: 6 });
      P.ring(e, x, y, s, { col: m, wid: 0.1, far: 1.6, dur: 0.45, delay: 0.05 });
      P.dots(e, x, y, s, { n: 5, cols: [d, m], speed: 1.1, grav: 0.2, delay: 0.08, size: 0.07 });
    },
    light(e, x, y, s) {
      const [d, m, l] = ELEMENTS.light.c;
      P.core(e, x, y, s, [WHITE, l, m], { size: 1.5, dur: 0.26 });
      for (let i = 0; i < 12; i++) P.ray(e, x, y, s, { a: (i / 12) * Math.PI * 2, len: i % 2 ? 1.5 : 2.2, width: i % 2 ? 2 : 3.5, col: i % 2 ? d : m, tip: i % 2 === 0, dur: 0.38 });
      P.ring(e, x, y, s, { col: m, wid: 0.16, far: 1.9, delay: 0.04 });
    },
    invert(e, x, y, s) {
      // 芯は白と黒の半円が回る
      e.add(0.32, (c, k) => {
        const r = s * 0.6 * (k < 0.2 ? backOut(k / 0.2) : 1 - easeIn((k - 0.2) / 0.8));
        if (r <= 0.3) return;
        c.translate(x, y); c.rotate(k * Math.PI * 1.5);
        c.fillStyle = INK; c.beginPath(); c.arc(0, 0, r, Math.PI / 2, -Math.PI / 2); c.fill();
        c.fillStyle = WHITE; c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
      });
      P.ring(e, x, y, s, { col: INK, wid: 0.16, far: 1.8, split: 8, spin: 1.2 });
      P.ring(e, x, y, s, { col: WHITE, wid: 0.1, far: 2.1, delay: 0.06, split: 8, spin: -1.2 });
      P.dots(e, x, y, s, { n: 8, cols: [INK, WHITE], speed: 1.5 });
    },
  };

  // 碁石ごとの衝撃の組み合わせ。shake は盤の揺れの強さ（効果が大きいほど強く）
  const RECIPE = {
    bomb: { el: 'fire', impact: (e, x, y, s) => IMPACT.fire(e, x, y, s, { pw: 1 }), shake: 1.1 },
    // 天変地異：盤の中心を軸に、弧が時計回りに走る
    cataclysm: {
      center: true, shake: 1.1,
      impact(e, x, y, s) {
        const [deep, blue, pale] = ELEMENTS.vortex.c;
        for (const [radius, col, delay] of [[1.8, deep, 0], [3.3, blue, 0.04], [4.5, pale, 0.08]]) {
          P.arcs(e, x, y, s, { r0: radius, r1: radius, col, width: s * 0.1, dur: 0.55, delay, turn: Math.PI / 2 });
        }
      },
    },
    mystery: { impact: (e, x, y, s) => IMPACT.shadow(e, x, y, s, { sparkle: true }) },
    flipAround: { impact: (e, x, y, s) => IMPACT.invert(e, x, y, s), shake: 0.4 },
    // 革命：白と黒の波が盤の中心から外側へ広がる
    revolution: {
      center: true, shake: 0.9,
      impact(e, x, y, s) {
        P.ring(e, x, y, s, { col: INK, wid: 0.28, far: 8, dur: 0.62, split: 0 });
        P.ring(e, x, y, s, { col: WHITE, wid: 0.17, far: 8, dur: 0.62, delay: 0.07, split: 0 });
      },
    },
    swapHands: {
      shake: 0.2,
      impact(e, x, y, s) {
        P.ray(e, x - s * 1.5, y - s * 0.28, s, { a: 0, len: 3, col: ELEMENTS.wind.c[0], width: s * 0.12 });
        P.ray(e, x + s * 1.5, y + s * 0.28, s, { a: Math.PI, len: 3, col: WHITE, width: s * 0.12 });
      },
    },
    fastForward: { impact: (e, x, y, s) => IMPACT.thunder(e, x, y, s, { bolts: 2 }), shake: 0.2 },
    // ワープ：渦が巻いて、反対側へ
    warp: { el: 'vortex', impact: (e, x, y, s) => IMPACT.vortex(e, x, y, s, { contract: true }), shake: 0.3 },
    // スナイパー：照準の輪が縮んで、撃つ（当たった石は、あとの段階で砕ける）
    sniper: { el: 'thunder', impact: (e, x, y, s) => { P.ring(e, x, y, s, { col: INK, wid: 0.06, far: 0.4, near: 1.3, inward: true, split: 4, dur: 0.3 }); }, shake: 0.2 },
    // 時限爆弾：置いたときは小さく火花が散るだけ（爆発は2手あと）
    timeBomb: { el: 'fire', impact: (e, x, y, s) => { P.ring(e, x, y, s, { col: ELEMENTS.fire.c[1], wid: 0.1, far: 1.1, dur: 0.35 }); P.dots(e, x, y, s, { n: 5, cols: ELEMENTS.fire.c }); }, shake: 0.15 },
    // 核：爆弾の倍の大きさ。白い閃光の輪が2重に広がり、遅れてもう一度ふくらむ
    nuke: { el: 'fire', impact: (e, x, y, s) => {
      IMPACT.fire(e, x, y, s, { pw: 1.9 });
      P.ring(e, x, y, s, { col: WHITE, wid: 0.3, far: 3.6, dur: 0.5 });
      P.ring(e, x, y, s, { col: ELEMENTS.fire.c[0], wid: 0.1, far: 4.2, dur: 0.75, delay: 0.12 });
      P.core(e, x, y, s, [WHITE, ELEMENTS.fire.c[2], ELEMENTS.fire.c[1]], { size: 2.4, delay: 0.16 });
      P.smoke(e, x, y, s, ELEMENTS.fire.smoke, { n: 9, size: 1.6, delay: 0.2 });
    }, shake: 2.2 },
    rowBomb: { el: 'fire', line: [[1, 0], [-1, 0]], shake: 0.9 },
    colBomb: { el: 'fire', line: [[0, 1], [0, -1]], shake: 0.9 },
    diagBomb: { el: 'fire', line: [[1, 1], [-1, 1], [1, -1], [-1, -1]], shake: 0.9 },
    push: { el: 'wind', impact: (e, x, y, s) => IMPACT.wind(e, x, y, s), shake: 0.35 },
    suck: { el: 'vortex', impact: (e, x, y, s) => IMPACT.vortex(e, x, y, s, { contract: true }), shake: 0.25 },
    spin: { el: 'vortex', impact: (e, x, y, s) => IMPACT.vortex(e, x, y, s, { dir: 1 }), shake: 0.2 },
    spinBack: { el: 'vortex', impact: (e, x, y, s) => IMPACT.vortex(e, x, y, s, { dir: -1 }), shake: 0.2 },
    gravity: { el: 'gravity', impact: (e, x, y, s) => IMPACT.gravity(e, x, y, s, { dir: 1 }), shake: 0.4 },
    antigravity: { el: 'gravity', impact: (e, x, y, s) => IMPACT.gravity(e, x, y, s, { dir: -1 }), shake: 0.3 },
    go: { el: 'earth', impact: (e, x, y, s) => IMPACT.earth(e, x, y, s, { pw: 0.7 }), shake: 0.3 },
    wall: { el: 'earth', impact: (e, x, y, s) => IMPACT.earth(e, x, y, s, { pw: 0.8 }), shake: 0.6 },
    weight: { el: 'earth', impact: (e, x, y, s) => IMPACT.earth(e, x, y, s, { pw: 1.3 }), shake: 1.2 },
    shield: { el: 'earth', impact: (e, x, y, s) => { IMPACT.earth(e, x, y, s, { pw: 0.6 }); P.ring(e, x, y, s, { col: ELEMENTS.light.c[1], wid: 0.12, far: 1.2, near: 0.6, dur: 0.5, delay: 0.1 }); }, shake: 0.3 },
    clone: { el: 'water', impact: (e, x, y, s) => IMPACT.water(e, x, y, s) },
    cloneH: { el: 'water', impact: (e, x, y, s) => IMPACT.water(e, x, y, s) },
    cloneV: { el: 'water', impact: (e, x, y, s) => IMPACT.water(e, x, y, s) },
    seal: { el: 'curse', impact: (e, x, y, s) => IMPACT.curse(e, x, y, s) },
    jam: { el: 'curse', impact: (e, x, y, s) => IMPACT.curse(e, x, y, s) },
    spy: { el: 'shadow', impact: (e, x, y, s) => IMPACT.shadow(e, x, y, s, {}) },
    joker: { el: 'shadow', impact: (e, x, y, s) => IMPACT.shadow(e, x, y, s, { sparkle: true }) },
    mine: { el: 'thunder', impact: (e, x, y, s) => IMPACT.thunder(e, x, y, s, { bolts: 3 }), shake: 0.2 },
    chain: { el: 'thunder', impact: (e, x, y, s) => IMPACT.thunder(e, x, y, s, { bolts: 5 }), shake: 0.3 },
    grow: { el: 'plant', impact: (e, x, y, s) => IMPACT.plant(e, x, y, s) },
    flag: { el: 'light', impact: (e, x, y, s) => IMPACT.light(e, x, y, s) },
    othello: { el: 'invert', impact: (e, x, y, s) => IMPACT.invert(e, x, y, s) },
    takeover: { el: 'invert', impact: (e, x, y, s) => IMPACT.invert(e, x, y, s), shake: 0.3 },
  };

  // 届くマスを包む四角（キャンバス上）。届くマスがなければ置いた場所だけ
  function areaRect(t, x, y, area) {
    const cells = [[x, y], ...(area || [])];
    const xs = cells.map((p) => p[0]), ys = cells.map((p) => p[1]);
    const [x0, y0] = t.map(Math.min(...xs), Math.min(...ys));
    const [x1, y1] = t.map(Math.max(...xs), Math.max(...ys));
    const pad = t.cell * 0.5;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2, r: t.cell * 0.28 };
  }

  const FX = {
    ELEMENTS,
    elementOf: (ability) => ELEMENT_OF[ability] || null,
    anticipationOf: (ability) => (ability === 'nuke' ? 0.55 : ANTICIPATION[ELEMENT_OF[ability]] || 0.2),
    // 描画を予約し、実時間のタイマーを使わず指定時刻の演出を描く。
    record(t, schedule) {
      const particles = [];
      const timeline = { add: (life, draw, delay = 0) => particles.push({ life, draw, delay }) };
      schedule({ ...t, timeline });
      return {
        duration: particles.reduce((last, p) => Math.max(last, p.delay + p.life), 0),
        draw(c, seconds) {
          for (const { life, draw, delay } of particles) {
            const elapsed = seconds - delay;
            if (elapsed < 0 || elapsed >= life) continue;
            c.save();
            draw(c, elapsed / life);
            c.restore();
          }
        },
      };
    },
    // 予兆：届く範囲に点線の枠。石のまわりに細い輪が脈打つ
    anticipate(t, ability, x, y, opts = {}) {
      const el = ELEMENT_OF[ability];
      if (!t || !t.canvas || !el) return;
      const e = engine(t.canvas), dur = FX.anticipationOf(ability) + 0.05;
      const col = ELEMENTS[el].c[1] === WHITE ? ELEMENTS[el].c[0] : ELEMENTS[el].c[0];
      if (opts.area && opts.area.length) P.frame(e, areaRect(t, x, y, opts.area), col, dur);
      const [px, py] = t.map(x, y);
      if (ability === 'sniper' && opts.target) {
        const [tx, ty] = t.map(...opts.target);
        e.add(dur, (c, k) => {
          const r = t.cell * (0.8 - k * 0.3);
          c.strokeStyle = '#b82e24';
          c.lineWidth = Math.max(1.5, t.cell * 0.045);
          c.beginPath(); c.arc(tx, ty, r, 0, Math.PI * 2); c.stroke();
          c.beginPath();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            c.moveTo(tx + r * dx * 0.72, ty + r * dy * 0.72);
            c.lineTo(tx + r * dx * 1.2, ty + r * dy * 1.2);
          }
          c.stroke();
        });
      }
      e.add(dur, (c, k) => {
        const q = (k * dur * 3.2) % 1;
        c.strokeStyle = col; c.globalAlpha = 1 - q; c.lineWidth = 2;
        c.beginPath(); c.arc(px, py, t.cell * 0.42 * (1.1 + q * 0.6), 0, Math.PI * 2); c.stroke();
      });
    },
    // ただの石：細い輪がひとつ広がり、小さな丸が少し散る。盤もごく小さく揺れる
    plain(t, x, y, color) {
      const e = targetEngine(t);
      if (!e) return;
      const s = t.cell;
      const [px, py] = t.map(x, y);
      P.ring(e, px, py, s, { col: INK, wid: 0.05, far: 0.95, near: 0.45, dur: 0.32, split: 0 });
      P.dots(e, px, py, s, { n: 4, cols: [color === 'w' ? '#8a6a3a' : INK, '#8a6a3a'], speed: 0.8, grav: 0.1, dur: 0.35, size: 0.06 });
      if (t.shakeEl) FX.shake(t.shakeEl, 0.15);
    },
    // 衝撃と余韻
    burst(t, ability, x, y, opts = {}) {
      const rc = RECIPE[ability];
      if (!rc) return;
      const e = targetEngine(t);
      if (!e) return;
      const s = t.cell;
      const [px, py] = t.map(x, y);
      // 平らな閃光（届く範囲が一瞬クリーム色に）
      if (opts.area && opts.area.length) P.flash(e, areaRect(t, x, y, opts.area));
      if (rc.line) {
        const cells = [];
        for (const [dx, dy] of rc.line) for (let k = 1; k <= 2; k++) { const [cx, cy] = t.map(x + dx * k, y + dy * k); cells.push([cx, cy, k]); }
        IMPACT.fireLine(e, px, py, s, { cells, dirs: rc.line.map(([dx, dy]) => Math.atan2(dy, dx)) });
      } else {
        const center = Math.floor(SIZE / 2);
        const [cx, cy] = rc.center ? t.map(center, center) : [px, py];
        rc.impact(e, cx, cy, s);
      }
      if (ability === 'fastForward') {
        for (const [tx, ty] of opts.area || []) {
          const [cx, cy] = t.map(tx, ty);
          for (const delay of [0, 0.12]) {
            P.ring(e, cx, cy, s, { col: ELEMENTS.thunder.c[1], wid: 0.12, near: 0.3, far: 0.8, split: 0, dur: 0.26, delay });
          }
        }
      }
      if (rc.shake && t.shakeEl) FX.shake(t.shakeEl, rc.shake);
      // 同じ段階で起きたこと（爆弾で消えた石のかけら、分身の先、返った石…）
      if (opts.fx) FX.after(t, opts.fx.filter((f) => !(f.kind === 'placed' && f.x === x && f.y === y)), null, { quiet: true, origin: [x, y], ability });
    },
    // あとの段階
    after(t, list, board, o = {}) {
      const e = targetEngine(t);
      if (!e) return;
      const s = t.cell;
      const [ox, oy] = o.origin ? t.map(o.origin[0], o.origin[1]) : [0, 0];
      for (const f of list) {
        const [px, py] = t.map(f.x, f.y);
        if (f.kind === 'boom') {
          // 時限爆弾の爆発：爆弾と同じ炎と揺れ
          IMPACT.fire(e, px, py, s, { pw: 1 });
          if (t.shakeEl) FX.shake(t.shakeEl, 1.1);
        } else if (f.kind === 'gone') {
          if (f.by === 'sniper' && o.origin) {
            e.add(0.2, (c, k) => {
              c.globalAlpha = (1 - k) * 0.85;
              c.strokeStyle = WHITE;
              c.lineWidth = s * 0.065;
              c.beginPath(); c.moveTo(ox, oy); c.lineTo(px, py); c.stroke();
            });
          }
          const ux = px - ox, uy = py - oy, d = Math.hypot(ux, uy) || 1;
          P.shards(e, px, py, s, f.color || 'b', { ux: o.origin ? ux / d : 0, uy: o.origin ? uy / d : -1 });
          if (f.by === 'go') { P.ring(e, px, py, s, { col: ELEMENTS.earth.c[1], wid: 0.14, far: 0.4, near: 1.2, inward: true, split: 4, dur: 0.4 }); P.rocks(e, px, py, s, ELEMENTS.earth.c, { n: 4 }); }
          if (f.by === 'mine') {
            const [mx, my] = t.map(f.fromX, f.fromY);
            IMPACT.thunder(e, mx, my, s, { bolts: 3 });
          }
          if (f.by === 'sniper') { P.ring(e, px, py, s, { col: ELEMENTS.fire.c[0], wid: 0.1, far: 0.3, near: 1.2, inward: true, split: 4, dur: 0.25 }); }
        } else if (f.kind === 'neutralized') {
          // おじゃま：超能力が抜ける（紫の弧が閉じて、ぽんと消える）
          P.arcs(e, px, py, s, { n: 3, r0: 0.9, r1: 0.2, dir: -1, col: ELEMENTS.curse.c[1], width: 3, dur: 0.4, len: 0.9, turn: 1 });
          P.core(e, px, py, s, [ELEMENTS.curse.c[2], ELEMENTS.curse.c[1]], { size: 0.8, delay: 0.3, dur: 0.2 });
        } else if (f.kind === 'flipped') {
          IMPACT.invert(e, px, py, s * 0.6);
        } else if (f.kind === 'placed') {
          if (f.by === 'grow') { P.core(e, px, py, s, [WHITE, ELEMENTS.plant.c[2]], { size: 1 }); P.leaves(e, px, py, s, ELEMENTS.plant.c, { n: 5, scale: 0.7 }); }
          else if (o.ability && ELEMENT_OF[o.ability] === 'water') IMPACT.water(e, px, py, s * 0.8);
          else if (o.ability === 'wall') P.rocks(e, px, py, s, ELEMENTS.earth.c, { n: 4 });
          else P.ring(e, px, py, s, { col: INK, wid: 0.06, far: 0.8, near: 0.4, dur: 0.3, split: 0 });
        } else if (f.kind === 'moved' && o.ability === 'warp') {
          P.ring(e, px, py, s, { col: ELEMENTS.vortex.c[2], wid: 0.1, near: 0.32, far: 0.8, delay: 0.16, dur: 0.38 });
        } else if (f.kind === 'moved' && board) {
          const p = board[f.y][f.x];
          if (p && (p.ability === 'gravity' || p.ability === 'antigravity')) IMPACT.gravity(e, px, py, s, { dir: p.ability === 'gravity' ? 1 : -1 });
        }
      }
    },
    ambient(canvas, ability) {
      const el = ELEMENT_OF[ability];
      if (!el) return;
      const e = engine(canvas);
      let acc = 0;
      const o = { dir: ability === 'antigravity' ? -1 : ability === 'spinBack' ? -1 : 1, sparkle: ability === 'joker' };
      e.amb = { tick: (en, dt) => { acc += dt * AMBIENT_RATE[el]; while (acc >= 1) { acc -= 1; AMBIENT[el](en, en.w, en.h, o); } } };
      e.run();
    },
    stop(canvas) { const e = engines.get(canvas); if (e) e.amb = null; },
    shake(el, power = 1) {
      const a = 6 * power;
      el.animate([
        { transform: 'translate(0, 0) rotate(0)' },
        { transform: `translate(${-a}px, ${a * 0.5}px) rotate(${-0.6 * power}deg)` },
        { transform: `translate(${a * 0.8}px, ${-a * 0.4}px) rotate(${0.4 * power}deg)` },
        { transform: `translate(${-a * 0.45}px, ${-a * 0.25}px) rotate(0)` },
        { transform: `translate(${a * 0.2}px, ${a * 0.15}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: 340, easing: 'ease-out' });
    },
  };

  // ===== カードの背景：属性の形を、ゆっくり流す（フラットな形だけ） =====
  const AMBIENT = {
    fire(e, w, h) { const x = rand(0.1, 0.9) * w, s = h / 5; e.add(1.2, (c, k) => { const g = k < 0.3 ? backOut(k / 0.3) : 1 - easeIn((k - 0.3) / 0.7); c.fillStyle = ELEMENTS.fire.c[Math.min(2, Math.floor(k * 3))]; dropPath(c, x, h + 6 - k * h * 0.45, s * 0.14 * g, s * 0.4 * g, 0); }); },
    wind(e, w, h) { const y = rand(0.1, 0.9) * h, len = rand(30, 70); e.add(1.0, (c, k) => { c.strokeStyle = k < 0.5 ? ELEMENTS.wind.c[0] : WHITE; c.lineWidth = 3; c.lineCap = 'round'; const x = -len + k * (w + len * 2); c.beginPath(); c.moveTo(x, y); c.lineTo(x + len * (1 - Math.abs(k - 0.5)), y); c.stroke(); }); },
    vortex(e, w, h, o) { const r = rand(0.15, 0.4) * Math.min(w, h), a0 = rand(0, 6.28); e.add(1.6, (c, k) => { const L = 0.9 * Math.sin(k * Math.PI); c.strokeStyle = ELEMENTS.vortex.c[1]; c.lineWidth = 4; c.lineCap = 'round'; const a = a0 + o.dir * k * 3; c.beginPath(); c.arc(w / 2, h / 2, r * (1 - k * 0.3), a - L, a); c.stroke(); }); },
    gravity(e, w, h, o) { const x = rand(0.05, 0.95) * w, len = rand(20, 40); e.add(1.1, (c, k) => { c.strokeStyle = ELEMENTS.gravity.c[1]; c.lineWidth = 3; c.lineCap = 'round'; const y = o.dir > 0 ? -len + k * (h + len * 2) : h + len - k * (h + len * 2); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - o.dir * len); c.stroke(); }); },
    earth(e, w, h) { const x = rand(0.1, 0.9) * w, sz = rand(4, 8), col = ELEMENTS.earth.c[Math.floor(rand(0, 3))]; e.add(1.4, (c, k) => { const y = h - Math.sin(k * Math.PI) * h * 0.3; c.translate(x, y); c.rotate(k * 4); c.fillStyle = col; c.beginPath(); c.roundRect(-sz, -sz, sz * 2, sz * 2, sz * 0.45); c.fill(); }); },
    water(e, w, h) { const x = rand(0.15, 0.85) * w, y = rand(0.2, 0.85) * h; e.add(1.3, (c, k) => { c.strokeStyle = ELEMENTS.water.c[1]; c.lineWidth = 3 * (1 - k); c.beginPath(); c.arc(x, y, 4 + k * 34, 0, Math.PI * 2); c.stroke(); }); },
    curse(e, w, h) { const r = rand(0.2, 0.45) * Math.min(w, h), a0 = rand(0, 6.28); e.add(1.8, (c, k) => { const L = 0.7 * Math.sin(k * Math.PI); c.strokeStyle = ELEMENTS.curse.c[1]; c.lineWidth = 4; c.lineCap = 'round'; const a = a0 - k * 2; c.beginPath(); c.arc(w / 2, h / 2, r * (1 - k * 0.5), a, a + L); c.stroke(); }); },
    shadow(e, w, h, o) { const x = rand(0.1, 0.9) * w, r = rand(10, 18); e.add(2.0, (c, k) => { const g = Math.sin(k * Math.PI); circle(c, x, h + 4 - k * h * 0.5, r * g, ELEMENTS.shadow.smoke[0]); circle(c, x - r * 0.25 * g, h + 4 - k * h * 0.5 - r * 0.3 * g, r * 0.55 * g, ELEMENTS.shadow.smoke[1]); if (o.sparkle && k > 0.5) circle(c, x + r, h * 0.6 - k * 20, 3 * (1 - k), ELEMENTS.shadow.c[2]); }); },
    thunder(e, w, h) { if (Math.random() < 0.5) { const x = rand(0.2, 0.8) * w; P.bolt(e, x, h * 0.15, h / 4, { a: Math.PI / 2 + rand(-0.2, 0.2), len: 2.6, col: ELEMENTS.thunder.c[1], width: 3, dur: 0.35 }); } },
    plant(e, w, h) { const x = rand(0, w), a0 = rand(0, 6); e.add(2.2, (c, k) => { c.fillStyle = ELEMENTS.plant.c[k < 0.5 ? 1 : 2]; dropPath(c, x + Math.sin(k * 5) * 18, -10 + k * (h + 20), 5, 14, a0 + k * 3); }); },
    light(e, w, h) { const a = rand(0.4, 2.7); e.add(1.6, (c, k) => { const g = Math.sin(k * Math.PI); c.strokeStyle = ELEMENTS.light.c[1]; c.lineWidth = 6 * g; c.lineCap = 'round'; c.beginPath(); c.moveTo(w / 2, -h * 0.1); c.lineTo(w / 2 + Math.cos(a) * h * 1.1, -h * 0.1 + Math.sin(a) * h * 1.1); c.stroke(); }); },
    invert(e, w, h) { const x = rand(0.1, 0.9) * w, col = Math.random() < 0.5 ? INK : WHITE; e.add(1.8, (c, k) => { const r = 5 * Math.sin(k * Math.PI); circle(c, x, h + 6 - k * h * 0.6, r, col); if (col === WHITE && r > 0.3) { c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.arc(x, h + 6 - k * h * 0.6, r, 0, Math.PI * 2); c.stroke(); } }); },
  };
  const AMBIENT_RATE = { fire: 10, wind: 4, vortex: 5, gravity: 7, earth: 3, water: 2, curse: 4, shadow: 2.5, thunder: 1.6, plant: 2.2, light: 1.8, invert: 4 };

  // ===== お試し（デモ）：5×5 の窓で、その碁石の予兆と衝撃をくり返す =====
  const C = 5;
  const DEMOS = {
    push: { pre: [[1, 0, 'w'], [-1, -1, 'b'], [0, 1, 'w'], [-1, 1, 'w']], at: [0, 0] },
    suck: { pre: [[2, 0, 'w'], [-2, -2, 'b'], [0, 2, 'w'], [-2, 2, 'w']], at: [0, 0] },
    cataclysm: { pre: [[-2, -1, 'b'], [-1, 0, 'w'], [2, 1, 'w']], at: [0, -1] },
    mystery: { pre: [[-1, 0, 'w'], [0, -1, 'b'], [1, 1, 'w']], at: [0, 0], place: 'flipAround' },
    flipAround: { pre: [[-1, 0, 'w'], [0, -1, 'b'], [1, 1, 'w'], [2, 2, 'b']], at: [0, 0] },
    revolution: { pre: [[-2, -2, 'w'], [1, -1, 'b'], [2, 2, 'w']], at: [0, 0] },
    swapHands: { pre: [[-2, 1, 'w'], [2, -1, 'b']], at: [0, 0] },
    fastForward: { pre: [[-1, -1, 'w', 'timeBomb'], [-2, -1, 'b'], [2, 1, 'b', 'grow', 1]], at: [1, -1] },
    timeBomb: { pre: [[1, 0, 'w'], [0, -1, 'b']], at: [0, 0], follow: [[2, -2, 'w'], [-2, 2, 'b']] },
    warp: { pre: [[-2, -1, 'w'], [-1, -2, 'b'], [0, 0, 'w'], [2, 1, 'w']], at: [-1, -1] },
    sniper: { pre: [[2, -1, 'w'], [1, 1, 'w'], [-1, 0, 'b']], at: [-1, 1], target: [2, -1] },
    bomb: { pre: [[1, 0, 'w'], [-1, 0, 'w'], [0, -1, 'b'], [1, 1, 'w'], [-2, 2, 'w']], at: [0, 0] },
    nuke: { pre: [[1, 0, 'w'], [-1, 1, 'w'], [0, -1, 'b'], [2, 2, 'w'], [-2, -2, 'w'], [2, -1, 'b'], [-2, 1, 'w'], [1, 2, 'b'], [-1, -2, 'w']], at: [0, 0] },
    rowBomb: { pre: [[-2, 0, 'w'], [-1, 0, 'w'], [1, 0, 'b'], [2, 0, 'w'], [0, -1, 'w'], [0, 1, 'b']], at: [0, 0] },
    colBomb: { pre: [[0, -2, 'w'], [0, -1, 'w'], [0, 1, 'b'], [0, 2, 'w'], [-1, 0, 'w'], [1, 0, 'b']], at: [0, 0] },
    diagBomb: { pre: [[-1, -1, 'w'], [2, 2, 'w'], [1, -1, 'b'], [-2, 2, 'w'], [1, 0, 'w'], [0, -1, 'b']], at: [0, 0] },
    othello: { pre: [[0, 0, 'w'], [1, 0, 'b'], [-1, 1, 'w']], at: [-1, 0] },
    go: { pre: [[0, 0, 'w'], [0, -1, 'b'], [0, 1, 'b'], [-1, 0, 'b'], [2, -1, 'w']], at: [1, 0] },
    chain: { pre: [[-2, 0, 'b'], [0, 1, 'w']], at: [-1, 0], then: [0, 0] },
    gravity: { pre: [[0, 2, 'w'], [1, 2, 'b']], at: [0, -2] },
    antigravity: { pre: [[0, -2, 'w'], [-1, -2, 'b']], at: [0, 2] },
    spin: { pre: [[0, -1, 'w'], [1, 0, 'b'], [-1, 1, 'w'], [1, 1, 'w']], at: [0, 0] },
    spinBack: { pre: [[0, -1, 'w'], [1, 0, 'b'], [-1, 1, 'w'], [1, 1, 'w']], at: [0, 0] },
    clone: { pre: [[-1, 1, 'w'], [1, -1, 'w']], at: [-1, -1] },
    cloneH: { pre: [[0, 0, 'w'], [0, 1, 'w']], at: [-2, -1] },
    cloneV: { pre: [[0, 0, 'w'], [1, 0, 'w']], at: [-1, -2] },
    wall: { pre: [[1, -1, 'w'], [-1, 1, 'w'], [0, 2, 'b']], at: [0, 0] },
    takeover: { pre: [[0, 0, 'w'], [-1, 0, 'w'], [1, 0, 'w'], [0, 1, 'b']], at: [0, 0] },
    seal: { pre: [[-1, 0, 'w'], [1, 1, 'b'], [0, -1, 'w']], at: [0, 0] },
    jam: { pre: [[-1, 0, 'w', 'bomb'], [1, 1, 'b', 'grow', 1], [0, -1, 'w', 'shield'], [1, -1, 'w']], at: [0, 0] },
    spy: { pre: [[-2, 0, 'w'], [-1, 0, 'w'], [1, 0, 'w'], [2, 0, 'w'], [0, 1, 'b']], at: [0, 0] },
    joker: { pre: [[-2, 0, 'b'], [-1, 0, 'b'], [1, 0, 'b'], [2, 0, 'b'], [0, 1, 'w']], at: [0, 0] },
    mine: { pre: [[0, 0, 'w', 'mine'], [-1, -1, 'w']], at: [1, 1], place: 'plain', show: 'mine' },
    weight: { pre: [[1, 0, 'w', 'weight'], [-1, 0, 'w'], [0, 1, 'b'], [-1, -1, 'w']], at: [0, 0], place: 'push' },
    shield: { pre: [[1, 0, 'w', 'shield'], [-1, 0, 'w'], [0, -1, 'b'], [-1, 1, 'w']], at: [0, 0], place: 'bomb' },
    flag: { pre: [[0, 0, 'b', 'flag'], [0, -1, 'b'], [-1, 0, 'b'], [1, 0, 'b'], [1, 1, 'w']], at: [0, 1], place: 'plain', show: 'flag' },
    grow: { pre: [[0, 0, 'b', 'grow', 1], [1, -1, 'w']], at: [-2, 2], place: 'plain' },
  };

  const WIN = 3; // 窓の左上（盤の座標）。窓は 3〜7
  const M = 24; // お試しの盤のキャンバスの、はみ出す余白（px）
  const runs = new WeakMap();
  const active = new Set();

  function miniHTML() {
    let cells = '';
    for (let i = 0; i < 25; i++) cells += '<span class="mini-cell"></span>';
    return `<span class="mini-grid">${cells}</span><canvas class="mini-fx" aria-hidden="true"></canvas>`;
  }

  function drawMini(root, board, fxs = [], winCells = [], charging = null) {
    const grid = root.querySelector('.mini-grid');
    if (!grid) return;
    const fxMap = new Map(fxs.map((f) => [`${f.x},${f.y}`, f]));
    const winSet = new Set(winCells.map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const bx = x + WIN, by = y + WIN;
        const p = board[by][bx];
        const f = fxMap.get(`${bx},${by}`);
        const cls = [];
        let style = '';
        if (f) cls.push(`fx-${f.kind}`);
        if (f && f.el) cls.push(`fx-el-${f.el}`);
        if (charging && charging[0] === bx && charging[1] === by) cls.push('is-charging');
        if (f && f.kind === 'moved') style = `style="--from-x:${f.fromX - bx};--from-y:${f.fromY - by}"`;
        if (winSet.has(`${bx},${by}`)) cls.push('is-win');
        grid.children[y * 5 + x].innerHTML = p ? pieceHTML(p, cls.join(' '), style) : '';
      }
    }
  }

  function miniTarget(root) {
    const grid = root.querySelector('.mini-grid');
    const canvas = root.querySelector('.mini-fx');
    const cell = grid.getBoundingClientRect().width / 5;
    return { canvas, cell, shakeEl: grid, map: (x, y) => [M + (x - WIN + 0.5) * cell, M + (y - WIN + 0.5) * cell] };
  }

  const wait = (ms, token) => new Promise((r, j) => setTimeout(() => (token.stop ? j(new Error('stop')) : r()), ms));

  async function loop(root, ability, token) {
    const demo = DEMOS[ability];
    const fakeState = { moveCount: 0, target: demo.target?.map((n) => C + n), players: { b: { hand: [] }, w: { hand: [{ ability: 'push' }] } } };
    while (!token.stop) {
      const board = newBoard();
      for (const [dx, dy, c, ab, age] of demo.pre) board[C + dy][C + dx] = newPiece(c, ab || 'plain', fakeState, age ? { age } : {});
      drawMini(root, board);
      await wait(500, token);
      const placeAb = demo.place || ability;
      const showAb = placeAb === 'plain' ? demo.show : placeAb;
      const ax = C + demo.at[0], ay = C + demo.at[1];
      const res = resolvePlacement(board, ax, ay, 'b', placeAb, fakeState);
      const t = miniTarget(root);
      const area = areaCells(showAb || 'plain', ax, ay, res.before);
      if (ability === 'mystery') {
        const hidden = snapshot(res.before);
        hidden[ay][ax].ability = 'mystery';
        drawMini(root, hidden, [{ kind: 'placed', x: ax, y: ay }]);
        FX.burst(t, ability, ax, ay);
        await wait(350, token);
      }
      // 予兆：置いただけの盤を見せ、石をためる
      if (showAb && RECIPE[showAb]) {
        drawMini(root, res.before, [{ kind: 'placed', x: ax, y: ay }], [], [ax, ay]);
        FX.anticipate(t, showAb, ax, ay, { area, target: fakeState.target });
        await wait(FX.anticipationOf(showAb) * 1000, token);
      }
      for (let i = 0; i < res.steps.length; i++) {
        const fx = i === 0 && showAb ? res.steps[0].fx.slice(1) : res.steps[i].fx;
        drawMini(root, res.steps[i].board, fx);
        if (i === 0 && showAb) FX.burst(t, showAb, ax, ay, { fx: res.steps[0].fx, area });
        else if (i === 0) FX.after(t, res.steps[0].fx.slice(1), res.steps[0].board, { origin: [ax, ay] });
        else FX.after(t, res.steps[i].fx, res.steps[i].board);
        await wait(i === res.steps.length - 1 ? 250 : 420, token);
      }
      const follow = demo.follow || (demo.then ? [[...demo.then, 'b']] : []);
      for (const [dx, dy, color] of follow) {
        await wait(demo.follow ? 650 : 200, token);
        const tx = C + dx, ty = C + dy;
        const next = resolvePlacement(board, tx, ty, color, 'plain', fakeState);
        drawMini(root, next.steps[0].board, next.steps[0].fx);
        for (const step of next.steps.slice(1)) {
          await wait(250, token);
          drawMini(root, step.board, step.fx);
          FX.after(t, step.fx, step.board);
        }
        if (next.steps.length === 1 && demo.follow) drawMini(root, board, next.steps[0].fx);
      }
      const win = findWin(board, 'b') || findWin(board, 'w') || specialWin(board, 'b');
      if (win) { drawMini(root, board, [], win); IMPACT.light(engine(t.canvas), ...t.map(ax, ay), t.cell * 0.8); }
      await wait(1300, token);
    }
  }

  const Demo = {
    start(el, ability) {
      Demo.stop(el);
      if (!DEMOS[ability]) { el.innerHTML = ''; return; }
      el.innerHTML = miniHTML();
      const token = { stop: false };
      runs.set(el, token);
      active.add(token);
      loop(el, ability, token).catch(() => {}).finally(() => active.delete(token));
    },
    stop(el) { const t = runs.get(el); if (t) t.stop = true; runs.delete(el); },
    stopAll() { for (const t of active) t.stop = true; active.clear(); },
    has: (ability) => !!DEMOS[ability],
  };

  window.FX = FX;
  window.Demo = Demo;
})();
