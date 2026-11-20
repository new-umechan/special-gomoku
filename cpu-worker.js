'use strict';

importScripts('deck.js?v=8', 'script.js?v=5', 'ai.js?v=2');

self.onmessage = ({ data }) => {
    Object.assign(state, data);
    // 新しい石の番号が、盤にある石と衝突しないようにする。
    uidCounter = Math.max(0, ...state.board.flat().map((stone) => stone?.uid ?? 0));
    self.postMessage(AI.chooseDeepMove({ budgetMs: CPU_SEARCH_MS }));
};
