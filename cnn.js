// JavaScript inference for the Metal-trained board value network.
(function () {
  const node = typeof module !== 'undefined' && typeof require === 'function';
  const G = node ? require('./script.js') : { SIZE, RULES_VERSION, state, withSimulationRandom };
  const Spatial = node ? require('./spatial.js') : window.Spatial;
  const AVI = node ? require('./avi.js') : window.AVI;
  const AI = node ? require('./ai.js') : window.AI;
  const Tactics = node ? require('./tactics.js') : window.Tactics;
  const area = G.SIZE * G.SIZE;
  const neighbors = Array.from({ length: area }, (_, p) => {
    const x = p % G.SIZE, y = Math.floor(p / G.SIZE);
    const result = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= G.SIZE || y + dy < 0 || y + dy >= G.SIZE) continue;
      result.push([p + dy * G.SIZE + dx, (dy + 1) * 3 + dx + 1]);
    }
    return result;
  });

  function convolution(weights, prefix, inputChannels, channels) {
    const raw = weights[prefix + '.weight'];
    const bias = weights[prefix + '.bias'];
    const kernel = new Float32Array(9 * inputChannels * channels);
    for (let k = 0; k < 9; k++) for (let i = 0; i < inputChannels; i++) for (let o = 0; o < channels; o++) {
      kernel[(k * inputChannels + i) * channels + o] = raw[o][Math.floor(k / 3)][k % 3][i];
    }
    return (input, output) => {
      for (let p = 0; p < area; p++) {
        const offset = p * channels;
        output.set(bias, offset);
        for (const [position, k] of neighbors[p]) {
          const source = position * inputChannels;
          const start = k * inputChannels * channels;
          for (let i = 0; i < inputChannels; i++) {
            const value = input[source + i];
            if (value === 0) continue;
            const index = start + i * channels;
            for (let o = 0; o < channels; o++) output[offset + o] += value * kernel[index + o];
          }
        }
        for (let o = 0; o < channels; o++) output[offset + o] = Math.max(0, output[offset + o]);
      }
    };
  }

  function linear(weights, key, input, relu = false) {
    return weights[key + '.weight'].map((row, i) => {
      let value = weights[key + '.bias'][i];
      for (let j = 0; j < row.length; j++) value += row[j] * input[j];
      return relu ? Math.max(0, value) : value;
    });
  }

  function attentionSummary(weights, spatial, context, channels) {
    const blocks = [[0, 4], [4, 8], [8, 11]];
    const tokens = [];
    for (const [y0, y1] of blocks) for (const [x0, x1] of blocks) {
      const token = [...weights.positions[tokens.length]];
      const count = (y1 - y0) * (x1 - x0);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        for (let c = 0; c < channels; c++) token[c] += spatial[(y * G.SIZE + x) * channels + c] / count;
      }
      tokens.push(token);
    }
    const n = Spatial.abilitiesPerColor - 1;
    const hand = [...context.slice(11, 11 + n), ...context.slice(21 + 2 * n, 21 + 3 * n)];
    const keys = tokens.map(input => linear(weights, 'key', input));
    const values = tokens.map(input => linear(weights, 'attention_value', input));
    const mean = Array(channels).fill(0), max = Array(channels).fill(-Infinity);
    for (const token of tokens) {
      const query = linear(weights, 'query', token);
      const logits = keys.map(key => {
        let dot = 0;
        for (let c = 0; c < channels; c++) dot += query[c] * key[c];
        return dot / Math.sqrt(channels);
      });
      const peak = Math.max(...logits);
      const probs = logits.map(logit => Math.exp(logit - peak));
      const sum = probs.reduce((a, b) => a + b, 0);
      const mixed = Array(channels).fill(0);
      for (let i = 0; i < values.length; i++) for (let c = 0; c < channels; c++) {
        mixed[c] += values[i][c] * probs[i] / sum;
      }
      const out = linear(weights, 'attention_out', mixed);
      for (let c = 0; c < channels; c++) {
        const v = token[c] + out[c];
        mean[c] += v / tokens.length;
        max[c] = Math.max(max[c], v);
      }
    }
    return [...mean, ...max, ...linear(weights, 'hand_out', linear(weights, 'hand_hidden', hand, true), true)];
  }

  function evaluator(model) {
    if (model.type !== 'spatial-value-v2' || model.architecture !== 'attention'
        || !Number.isInteger(model.rulesVersion) || model.rulesVersion < 2 || model.rulesVersion > G.RULES_VERSION
        || model.vocabulary !== Spatial.vocabulary) {
      throw new Error('Incompatible spatial model');
    }
    const w = model.weights;
    const channels = model.channels ?? 12;
    const embedding = w['embedding.weight'];
    const inputChannels = 14;
    const conv1 = convolution(w, 'conv1', inputChannels, channels);
    const conv2 = convolution(w, 'conv2', channels, channels);
    const input = new Float32Array(area * Math.max(inputChannels, channels));
    const hidden = new Float32Array(area * channels);
    const pooled = new Float32Array(w['hidden.weight'][0].length);

    function predict(board, context) {
      for (let p = 0; p < area; p++) {
        const i = p * inputChannels, j = p * 4;
        const piece = board[j];
        input.set(embedding[piece], i);
        input[i + 8] = Number(board[j + 1] === 1);
        input[i + 9] = Number(board[j + 1] === 2);
        input[i + 10] = board[j + 2] / 2;
        input[i + 11] = board[j + 3] / 7;
        const size = Spatial.abilitiesPerColor;
        const joker = piece > 0 && (piece - 1) % size === Spatial.jokerIndex;
        input[i + 12] = Number(joker || (piece > 0 && piece <= size));
        input[i + 13] = Number(joker || (piece > size && piece <= 2 * size));
      }
      conv1(input, hidden);
      conv2(hidden, input);
      pooled.fill(0, 0, 2 * channels);
      for (let p = 0; p < area; p++) for (let i = 0; i < channels; i++) {
        const v = input[p * channels + i];
        pooled[i] += v / area;
        pooled[channels + i] = Math.max(pooled[channels + i], v);
      }
      pooled.set(context, 2 * channels);
      pooled.set(attentionSummary(w, input, context, channels), 2 * channels + context.length);
      let result = w['value.bias'][0];
      for (let i = 0; i < w['hidden.bias'].length; i++) {
        let value = w['hidden.bias'][i];
        const kernel = w['hidden.weight'][i];
        for (let j = 0; j < pooled.length; j++) value += pooled[j] * kernel[j];
        result += Math.max(0, value) * w['value.weight'][0][i];
      }
      return Math.tanh(result);
    }

    return { predict, score: st => predict(Spatial.encode(st), AVI.features(st, st.turn)) };
  }

  function shortlist(ranked, limit) {
    const reserved = new Map();
    for (const candidate of ranked) {
      if (!reserved.has(candidate.move.i)) reserved.set(candidate.move.i, candidate);
    }
    return [...new Set([...reserved.values(), ...ranked])].slice(0, limit);
  }

  function attentionMove(model) {
    const preRanked = Tactics.rank(AVI.score, 14);
    if (!preRanked.length || preRanked[0].priority >= 1e6) return preRanked[0]?.move;
    const ranked = rescore(model, shortlist(preRanked, 16));
    if (ranked.length < 2 || ranked[0].priority >= 1e6) return ranked[0]?.move;
    const current = G.state;
    const first = AI.save();
    const logs = current.logs, fx = current.fx;
    const me = current.turn;
    const safe = ranked.filter(candidate => Boolean(candidate.danger) === Boolean(ranked[0].danger));
    const value = () => current.phase === 'end'
      ? (current.winner ? (current.winner === me ? 1 : -1) : 0)
      : model.score(current) * (current.turn === me ? 1 : -1);
    try {
      return G.withSimulationRandom(() => {
        const worlds = [AI.sampleWorld(first), AI.sampleWorld(first)];
        let best = null;
        const candidates = shortlist(safe, 3);
        for (const candidate of candidates) {
          let total = 0;
          for (const world of worlds) {
            AI.restore(world);
            if (!AI.apply(candidate.move).ok) continue;
            if (current.phase === 'play') {
              const reply = AI.chooseMove({ depth: 1, cells: 8, noise: 0 });
              if (reply) AI.apply(reply);
            }
            total += value();
          }
          const combined = 0.65 * total / worlds.length + 0.35 * candidate.score - 0.25 * candidate.threes - 2 * candidate.poison;
          if (!best || combined > best.value) best = { move: candidate.move, value: combined };
        }
        return best?.move ?? ranked[0].move;
      });
    } finally {
      AI.restore(first);
      current.logs = logs;
      current.fx = fx;
    }
  }

  function rescore(model, candidates) {
    const results = AI.onePlyOutcomes((st, me) => {
      if (st.phase === 'end') return st.winner ? (st.winner === me ? 1 : -1) : 0;
      return model.score(st) * (st.turn === me ? 1 : -1);
    }, 0, 4, candidates.map(({ move }) => move));
    return results.map(({ move, outcomes }, i) => {
      const candidate = candidates[i];
      const score = outcomes.reduce((sum, o) => sum + o, 0) / outcomes.length;
      const value = 0.75 * score + 0.25 * candidate.score;
      return { ...candidate, move, score: value, priority: Tactics.priority(value, candidate.danger, candidate.threes, candidate.poison) };
    }).sort((a, b) => b.priority - a.priority);
  }

  const CNN = { evaluator, attentionMove };
  if (node) module.exports = CNN;
  else window.CNN = CNN;
})();
