// 効果音。置く音・選ぶ音は録音の素材（sounds/、CC0）を鳴らす。ほかは Web Audio で毎回つくる。
// 安っぽくならないように：音量は小さく、短く、角の立つ波形（矩形波など）は使わない。
// 置く音は木の碁石の「パチッ」に寄せ、毎回ほんの少し高さを揺らして機械っぽさを消す。
(function () {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  try { muted = localStorage.getItem('gomoku-muted') === '1'; } catch (e) { /* 保存できない環境では毎回オン */ }

  function audio() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      // 1秒ぶんの雑音を1回だけつくって使い回す
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const wobble = (v, amount = 0.04) => v * (1 + (Math.random() * 2 - 1) * amount);

  // ===== 録音の素材 =====
  // 置く・選ぶは、本人が聞き比べて選んだもの。2つ以上あるときは毎回どれかを鳴らす
  const SAMPLES = {
    place: ['bfh1_hit_05', 'click_001'],
    select: ['click_002', 'click_003'],
    small: ['bfh1_wood_hit_03'], // 小さな衝撃（回転・押し出し・重力など）
    gone: ['bfh1_glass_breaking_02', 'bfh1_glass_hit_01'], // 石が消える・砕ける
    lose: ['vc_tubular_c3'], // 負け・引き分け
    deny: ['error_004'], // できない
    bomb: ['ex_bang01', 'ex_blast3', 'ex_blast1'], // 爆弾・列の爆弾
    nuke: ['ex_chunky', 'nk_retro'], // 核
    vortex: ['el_wind4'], // 回転・逆回転・吸い込み
    thunder: ['el_elecboom'], // 地雷・連続
    light: ['el_heal5', 'el_heal6'], // 旗・結束
    win: ['vc_tubular_c4'], // 勝ち
    pick: ['cc_plop_01', 'cc_plop_02'], // デッキに碁石を入れる
    wall: ['vc_cajon_fff'], // 石垣
    shield: ['cc_metal_05'], // 盾
    clone: ['vc_slit_hi'], // 分身（3種類）
    othello: ['cc_paper_01'], // オセロ
    push: ['vc_cajon_f'], // 押し出し
    gravity: ['cc_slam_03'], // 重力
    antigravity: ['ch_retrochargestereoup01'], // 反重力
    go: ['cc_wooden_02'], // 囲碁
    weight: ['vc_frame_muted'], // 重し
    seal: ['vc_gong_mf'], // 封印
    jam: ['el_emp1', 'el_emp2', 'el_emp3'], // おじゃま
    joker: ['el_ice5'], // ジョーカー
    takeover: ['el_energyzap'], // 乗っ取り
    whoosh: ['cc_noise_01'], // 画面が切り替わる
  };
  const buffers = {};
  const elements = {}; // file:// で fetch できないときは <audio> で鳴らす
  function loadSamples() {
    const c = audio();
    if (!c || loadSamples.done) return;
    loadSamples.done = true;
    for (const name of new Set(Object.values(SAMPLES).flat())) {
      if (location.protocol === 'file:') { elements[name] = new Audio(`sounds/${name}.mp3`); continue; }
      fetch(`sounds/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((buf) => { buffers[name] = buf; })
        .catch(() => { elements[name] = new Audio(`sounds/${name}.mp3`); });
    }
  }
  // 素材を鳴らす。rate で高さを少し揺らし、毎回同じに聞こえないようにする
  // offset：素材の途中から鳴らす（ためは、最後の dur 秒だけ鳴らして、最大のところを衝撃に合わせる）
  function sample(kind, { at = 0, gain = 1, rate = wobble(1, 0.05), offset = 0 } = {}) {
    const c = audio();
    if (!c) return;
    loadSamples();
    const list = SAMPLES[kind];
    const name = list[Math.floor(Math.random() * list.length)];
    if (buffers[name]) {
      const src = c.createBufferSource();
      src.buffer = buffers[name];
      src.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(master);
      src.start(c.currentTime + at, offset);
      return;
    }
    const el = elements[name] ? elements[name].cloneNode() : new Audio(`sounds/${name}.mp3`);
    el.volume = Math.min(1, gain * 0.7);
    el.preservesPitch = false;
    el.playbackRate = rate;
    el.currentTime = offset;
    setTimeout(() => el.play().catch(() => {}), at * 1000);
  }

  // 音の部品：減衰する正弦波
  // glide を渡すと、decay の間に音程がその高さまで滑る
  function tone(freq, { at = 0, gain = 0.1, decay = 0.2, type = 'sine', attack = 0.004, glide = null } = {}) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  // 音の部品：フィルターを通した雑音
  function hiss({ at = 0, gain = 0.1, decay = 0.05, type = 'bandpass', freq = 3000, q = 1, sweepTo = null, attack = 0.002 } = {}) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(decay, attack + 0.01));
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
  }

  const Sound = {
    // 碁石を置く「パチッ」（録音）
    place(at = 0, scale = 1) { sample('place', { at, gain: scale }); },
    // デッキに碁石を入れる：置く音を小さく、少し高く
    pick() { sample('pick', { gain: 0.9 }); },
    // 手札やボタンを選ぶ：小さなカチッ（録音）
    select() { sample('select', { gain: 0.8 }); },
    // 石が動く：こすれる音
    move(at = 0) { hiss({ at, gain: 0.05, decay: 0.26, freq: 1100, sweepTo: 380, q: 0.9 }); },
    // 石が消える：低いボフッ
    gone(at = 0) {
      hiss({ at, gain: 0.09, decay: 0.22, type: 'lowpass', freq: 700, sweepTo: 160, q: 0.7 });
      tone(wobble(95), { at, gain: 0.1, decay: 0.22 });
    },
    // 石が返る：軽い2回のカチッ
    flip(at = 0) { Sound.place(at, 0.4); Sound.place(at + 0.07, 0.35); },
    // 勝ち：短い長三和音を上へ
    win() { sample('win', { gain: 0.9, rate: 1 }); },
    // 負け・引き分け：低いチューブラーベル（録音）
    lose() { sample('lose', { gain: 0.8, rate: 1 }); },
    // できない（ポイントが足りない、スパイが置けない）（録音）
    deny() { sample('deny', { gain: 0.7, rate: 1 }); },
    // ボタンが画面いっぱいに広がる：雑音を高いほうへ持ち上げる、やわらかい風の音
    whoosh() { sample('whoosh', { gain: 0.8 }); },
    // 予兆の「ため」：属性の高さで、だんだん大きくなる音。dur 秒で最大になって、弾ける直前で切れる
    // ため：音は鳴らさない（シンバルの盛り上がりは大げさだった）
    charge() {},
    // 衝撃：属性ごとに、演出の形と同じ性格の音
    impact(el, opts = {}) {
      const S = ELEMENT_SOUNDS[el];
      if (S) S(opts);
      // 爆発と雷のほかは、木の「コッ」（録音）を下に敷く
      if (el !== 'fire' && el !== 'thunder') sample('small', { at: opts.at || 0, gain: 0.9 });
    },
    // 壊れた石のかけら：ガラスが割れる音（録音）。消えた数が多いほど、少しずつずらして重ねる
    shards(n = 1, at = 0.1) {
      for (let i = 0; i < Math.min(n, 3); i++) sample('gone', { at: at + 0.22 + i * 0.07, gain: 0.7 - i * 0.15 });
    },
    // 1つの段階の演出（fx の種類）に合わせて鳴らす
    fx(list, at = 0) {
      const kinds = new Set(list.map((f) => f.kind));
      if (kinds.has('moved')) Sound.move(at);
      const gone = list.filter((f) => f.kind === 'gone');
      if (gone.length) Sound.shards(gone.length, at);
      if (gone.some((f) => f.by === 'go')) sample('go', { at, gain: 0.8 });
      if (gone.some((f) => f.by === 'mine')) sample('thunder', { at, gain: 0.7 });
      if (list.some((f) => f.kind === 'boom')) sample('bomb', { at, gain: 1 });
      if (list.some((f) => f.kind === 'placed' && f.by === 'grow')) sample('small', { at, gain: 0.6, rate: wobble(1.2, 0.04) });
      if (kinds.has('flipped')) Sound.flip(at);
    },
    preload: loadSamples,
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      try { localStorage.setItem('gomoku-muted', v ? '1' : '0'); } catch (e) { /* 保存できなくても鳴らし分けは効く */ }
      if (!v) Sound.select();
    },
  };
  // ===== 属性ごとの衝撃の音（どれも角のない波形と、フィルターを通した雑音だけ） =====
  const ELEMENT_SOUNDS = {
    // 炎：低いドンと、雑音の爆発が下がっていき、少し遅れてパチパチ
    fire({ pw = 1, at = 0 } = {}) {
      tone(wobble(70), { at, gain: 0.16 * pw, decay: 0.45, glide: 38 });
      hiss({ at, gain: 0.12 * pw, decay: 0.55, type: 'lowpass', freq: 2600, sweepTo: 180, q: 0.7 });
      for (let i = 0; i < 6; i++) hiss({ at: at + 0.12 + Math.random() * 0.4, gain: 0.03, decay: 0.02, freq: wobble(3000, 0.3), q: 2 });
    },
    // 風：ヒューッと高いほうへ吹き抜けて、戻る
    wind({ at = 0 } = {}) {
      hiss({ at, gain: 0.07, decay: 0.22, attack: 0.08, freq: 500, sweepTo: 2400, q: 1.5 });
      hiss({ at: at + 0.18, gain: 0.04, decay: 0.3, attack: 0.03, freq: 2000, sweepTo: 700, q: 1.2 });
    },
    // 渦：吸い込み（下がる）か、回る（ゆらゆら揺れる）
    vortex({ contract = true, at = 0 } = {}) {
      if (contract) {
        tone(660, { at, gain: 0.05, decay: 0.5, glide: 120, type: 'triangle' });
        hiss({ at, gain: 0.05, decay: 0.5, attack: 0.15, freq: 2400, sweepTo: 300, q: 2 });
        tone(140, { at: at + 0.44, gain: 0.07, decay: 0.15 });
      } else {
        for (let i = 0; i < 4; i++) tone(wobble(330 + (i % 2) * 110, 0.02), { at: at + i * 0.08, gain: 0.035, decay: 0.16, type: 'triangle' });
        hiss({ at, gain: 0.04, decay: 0.4, attack: 0.1, freq: 900, sweepTo: 1600, q: 3 });
      }
    },
    // 重力：落ちて（音程が下がって）ドスン。反重力は逆に昇る
    gravity({ dir = 1, at = 0 } = {}) {
      if (dir > 0) {
        tone(520, { at, gain: 0.05, decay: 0.16, glide: 160, type: 'triangle' });
        tone(wobble(65), { at: at + 0.14, gain: 0.15, decay: 0.3, glide: 45 });
        hiss({ at: at + 0.14, gain: 0.05, decay: 0.15, type: 'lowpass', freq: 600 });
      } else {
        tone(160, { at, gain: 0.05, decay: 0.3, glide: 900, type: 'triangle' });
        tone(1046.5, { at: at + 0.26, gain: 0.03, decay: 0.3 });
      }
    },
    // 大地：重いドスと、砂利のザラッ
    earth({ pw = 1, at = 0 } = {}) {
      tone(wobble(58), { at, gain: 0.17 * pw, decay: 0.35, glide: 40 });
      hiss({ at, gain: 0.07 * pw, decay: 0.12, type: 'lowpass', freq: 900 });
      for (let i = 0; i < 5; i++) hiss({ at: at + 0.06 + i * 0.04 + Math.random() * 0.03, gain: 0.03 * pw, decay: 0.03, freq: wobble(1400, 0.4), q: 1.5 });
    },
    // 水面：ポチャン（音程が上がる短い音）と、遅れた小さな波紋
    water({ at = 0 } = {}) {
      tone(300, { at, gain: 0.08, decay: 0.12, glide: 900 });
      tone(500, { at: at + 0.12, gain: 0.035, decay: 0.12, glide: 1200 });
      tone(650, { at: at + 0.24, gain: 0.02, decay: 0.12, glide: 1400 });
    },
    // 呪い：半音でぶつかる低い2音が、閉じるように下がる
    curse({ at = 0 } = {}) {
      tone(220, { at, gain: 0.05, decay: 0.6, glide: 180, type: 'triangle', attack: 0.04 });
      tone(233.08, { at, gain: 0.045, decay: 0.6, glide: 175, type: 'triangle', attack: 0.04 });
      hiss({ at, gain: 0.04, decay: 0.45, attack: 0.3, type: 'lowpass', freq: 400, sweepTo: 1600, q: 2 });
      tone(110, { at: at + 0.32, gain: 0.06, decay: 0.3 });
    },
    // 影：こもったボフッ。ジョーカーは、きらめく高い音を重ねる
    shadow({ sparkle = false, at = 0 } = {}) {
      hiss({ at, gain: 0.08, decay: 0.4, type: 'lowpass', freq: 500, sweepTo: 150, q: 0.7 });
      tone(90, { at, gain: 0.07, decay: 0.3, glide: 60 });
      if (sparkle) [1318.5, 1568, 2093].forEach((f, i) => tone(f, { at: at + 0.1 + i * 0.06, gain: 0.025, decay: 0.35 }));
    },
    // 雷：鋭いバリッと、遠いゴロゴロ
    thunder({ pw = 1, at = 0 } = {}) {
      hiss({ at, gain: 0.12 * pw, decay: 0.06, type: 'highpass', freq: 2500, q: 0.7 });
      hiss({ at: at + 0.03, gain: 0.06 * pw, decay: 0.05, type: 'highpass', freq: 3500, q: 0.7 });
      hiss({ at: at + 0.06, gain: 0.08 * pw, decay: 0.6, attack: 0.05, type: 'lowpass', freq: 300, sweepTo: 90, q: 0.6 });
    },
    // 植物：音程の上がる、はじく音（ペンタトニック）と、葉のさらさら
    plant({ pw = 1, at = 0 } = {}) {
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, { at: at + i * 0.06, gain: 0.04 * pw, decay: 0.25, type: 'triangle' }));
      hiss({ at, gain: 0.025 * pw, decay: 0.3, attack: 0.08, freq: 5000, q: 1 });
    },
    // 光：明るい和音が一度に鳴って、余韻を残す
    light({ at = 0 } = {}) {
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone(f, { at: at + i * 0.015, gain: 0.03, decay: 0.8, type: i % 2 ? 'sine' : 'triangle', attack: 0.01 }));
    },
    // 反転：高い音と低い音が入れ替わる
    invert({ at = 0 } = {}) {
      tone(880, { at, gain: 0.045, decay: 0.1, glide: 440 });
      tone(440, { at: at + 0.09, gain: 0.045, decay: 0.12, glide: 880 });
      Sound.place(at + 0.02, 0.35);
    },
  };
  // 能力 → 音（形の組み合わせと同じ割り当て）
  const ABILITY_SOUND = {
    nuke: ['fire', { pw: 1.7 }], timeBomb: ['fire', { pw: 0.5 }], warp: ['vortex', { contract: true }], sniper: ['thunder', { pw: 0.5 }], bomb: ['fire', { pw: 1 }], rowBomb: ['fire', { pw: 0.8 }], colBomb: ['fire', { pw: 0.8 }], diagBomb: ['fire', { pw: 0.8 }],
    push: ['wind', {}], suck: ['vortex', { contract: true }], spin: ['vortex', { contract: false }], spinBack: ['vortex', { contract: false }],
    gravity: ['gravity', { dir: 1 }], antigravity: ['gravity', { dir: -1 }],
    go: ['earth', { pw: 0.6 }], wall: ['earth', { pw: 0.8 }], weight: ['earth', { pw: 1.2 }], shield: ['earth', { pw: 0.5 }],
    clone: ['water', {}], cloneH: ['water', {}], cloneV: ['water', {}],
    seal: ['curse', {}], jam: ['curse', {}], spy: ['shadow', {}], joker: ['shadow', { sparkle: true }],
    mine: ['thunder', { pw: 0.7 }], chain: ['thunder', { pw: 1 }], grow: ['plant', {}],
    flag: ['light', {}], othello: ['invert', {}], takeover: ['invert', {}],
  };
  // 録音の素材がある超能力は、それを鳴らす。ないものは合成の音に、木の「コッ」を重ねる
  const ABILITY_SAMPLE = {
    timeBomb: ['small', 0.8], warp: ['vortex', 0.7], sniper: ['bomb', 0.45], bomb: ['bomb', 1], rowBomb: ['bomb', 0.8], colBomb: ['bomb', 0.8], diagBomb: ['bomb', 0.85], nuke: ['nuke', 1],
    spin: ['vortex', 0.6], spinBack: ['vortex', 0.6], suck: ['vortex', 0.6],
    mine: ['thunder', 0.8], chain: ['thunder', 0.9], flag: ['light', 0.9],
    push: ['push', 1], gravity: ['gravity', 0.9], antigravity: ['antigravity', 0.8], go: ['go', 1], weight: ['weight', 1],
    seal: ['seal', 0.8], jam: ['jam', 0.8], joker: ['joker', 0.8], takeover: ['takeover', 0.8],
    spy: ['small', 0.9], grow: ['small', 0.9], // ぴったりの音がまだないので、木の「コッ」だけ
    wall: ['wall', 1], shield: ['shield', 0.8], clone: ['clone', 0.9], cloneH: ['clone', 0.9], cloneV: ['clone', 0.9], othello: ['othello', 1],
  };
  Sound.ability = function (ability) {
    const smp = ABILITY_SAMPLE[ability];
    if (smp) { sample(smp[0], { gain: smp[1] }); return; }
    const s = ABILITY_SOUND[ability];
    if (s) ELEMENT_SOUNDS[s[0]](s[1]);
    if (s && s[0] !== 'thunder') sample('small', { gain: 0.9 });
  };
  window.Sound = Sound;
})();
