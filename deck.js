'use strict';

// ブラウザと Node のツールで使うデッキのルール。
function createDeckRules(abilities, specialIds) {
    // 24ポイントまで組める。ただの石は1ポイント。強い碁石ほど高い（数と強さのトレードオフ）
    // 碁石の追加・削除、コスト・能力・対局ルールの変更時に上げる。UI の変更では上げない。
    const RULES_VERSION = 6;
    const DECK_POINTS = 24;
    const MAX_COPIES = 3; // 同じ超能力は3つまで
    const cardIds = ['plain', ...specialIds];
    const COST = Object.fromEntries(cardIds.map((id) => [id, abilities[id].cost]));
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

    const CATALOG = cardIds.sort((x, y) => costOf(x) - costOf(y));
    const DECK_CODE_PREFIX = 'GOMOKU1.'; // デッキコードの形式。ルールの版とは別
    const DECK_CODE_MAX_LENGTH = 2048;
    const maxCopiesOf = (id) => id === 'plain' ? Infinity : MAX_COPIES;

    function deckAddError(id, count, pointsLeft) {
        if (count >= maxCopiesOf(id)) return `同じ碁石は${MAX_COPIES}つまで`;
        if (costOf(id) > pointsLeft) return 'ポイントが足りない';
        return '';
    }

    function deckError(deck) {
        if (!deck || typeof deck !== 'object' || Array.isArray(deck) || !Object.keys(deck).length) {
            return 'デッキに碁石が入っていません。';
        }
        for (const [id, count] of Object.entries(deck)) {
            if (!CATALOG.includes(id)) return '今のルールにない碁石が入っています。';
            if (!Number.isSafeInteger(count) || count < 1) return '碁石の数が正しくありません。';
            if (count > maxCopiesOf(id)) return `同じ超能力は${MAX_COPIES}個まで入れられます。`;
        }
        if (deckPoints(deck) > DECK_POINTS) return `${DECK_POINTS}ポイントを超えています。`;
        return '';
    }

    function encodeDeckCode({ name, version, deck }) {
        const bytes = new TextEncoder().encode(JSON.stringify({ name, version, deck }));
        return DECK_CODE_PREFIX + btoa(String.fromCharCode(...bytes));
    }

    function decodeDeckCode(text) {
        const invalid = 'デッキコードを読み取れません。コード全体を貼り付けてください。';
        const code = text.trim();
        if (!code.startsWith(DECK_CODE_PREFIX) || code.length > DECK_CODE_MAX_LENGTH) throw new Error(invalid);

        let data;
        try {
            const bytes = Uint8Array.from(atob(code.slice(DECK_CODE_PREFIX.length)), (c) => c.charCodeAt(0));
            data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        } catch {
            throw new Error(invalid);
        }
        if (!data || typeof data.name !== 'string' ||
            (data.version !== null && (!Number.isSafeInteger(data.version) || data.version < 1))) {
            throw new Error(invalid);
        }
        if (data.version > RULES_VERSION) throw new Error('新しいルールのデッキです。ゲームを更新してから読み込んでください。');
        const error = deckError(data.deck);
        if (error) throw new Error([deckVersionNote(data.version), error].filter(Boolean).join('。'));
        return { name: data.name.trim().slice(0, 16) || '共有デッキ', version: data.version, deck: data.deck };
    }

    function deckVersionNote(version) {
        if (version === null) return 'ルールの版が不明';
        if (version < RULES_VERSION) return `旧ルール v${version}`;
        if (version > RULES_VERSION) return `新ルール v${version}`;
        return '';
    }

    // 相手から届いたデッキを、決まりの中に収める（知らない碁石・多すぎる数・ポイントの超過を落とす）
    function sanitizeDeck(deck) {
        const out = {};
        let pointsLeft = DECK_POINTS;
        for (const id of CATALOG) {
            const cost = costOf(id);
            const received = Math.floor(Number(deck?.[id]) || 0);
            const count = Math.min(received, maxCopiesOf(id), Math.floor(pointsLeft / cost));
            if (count <= 0) continue;
            out[id] = count;
            pointsLeft -= count * cost;
        }
        return deckCount(out) ? out : { plain: DECK_POINTS };
    }

    return {
        RULES_VERSION, DECK_POINTS, MAX_COPIES, COST, STARTERS, CATALOG,
        costOf, deckPoints, deckCount, deckList, deckError, deckAddError, deckVersionNote,
        encodeDeckCode, decodeDeckCode, sanitizeDeck,
    };
}

if (typeof module !== 'undefined') module.exports = createDeckRules;
