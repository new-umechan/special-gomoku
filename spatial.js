// Board encoding shared by the collector and the CNN evaluator.
(function () {
  const node = typeof module !== 'undefined' && typeof require === 'function';
  const G = node ? require('./script.js') : { SIZE };
  // Checkpoint schema. Keep the vocabulary and its order fixed when game rules change.
  const abilities = Object.freeze([
    'plain', 'block', 'joker', 'push', 'suck', 'nuke', 'timeBomb', 'bomb', 'rowBomb', 'colBomb',
    'diagBomb', 'flag', 'grow', 'othello', 'go', 'chain', 'gravity', 'antigravity', 'spin', 'spinBack',
    'cataclysm', 'mystery', 'flipAround', 'revolution', 'swapHands', 'fastForward', 'warp', 'sniper',
    'clone', 'cloneH', 'cloneV', 'wall', 'takeover', 'seal', 'jam', 'spy', 'mine', 'weight', 'shield',
  ]);
  const ability = new Map(abilities.map((id, i) => [id, i]));
  const vocabulary = 1 + 3 * ability.size;

  function encode(st) {
    const board = new Uint8Array(G.SIZE * G.SIZE * 4);
    let i = 0;
    for (const row of st.board) {
      for (const stone of row) {
        if (stone) {
          const color = stone.color === st.turn ? 0 : stone.color === 'n' ? 2 : 1;
          board[i] = 1 + color * ability.size + (ability.get(stone.ability) ?? ability.get('plain'));
          board[i + 1] = stone.owner === st.turn ? 1 : stone.owner ? 2 : 0;
          board[i + 2] = stone.ability === 'timeBomb' ? (stone.fuse ?? 2) : 0;
          board[i + 3] = stone.ability === 'grow' ? (stone.age ?? 0) % 8 : 0;
        }
        i += 4;
      }
    }
    return board;
  }

  const spatial = { encode, abilities, vocabulary, abilitiesPerColor: ability.size, jokerIndex: ability.get('joker') };
  if (node) module.exports = spatial;
  else window.Spatial = spatial;
})();
