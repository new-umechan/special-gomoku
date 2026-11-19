function boardImage() {
    const css = getComputedStyle($('board'));
    const color = (name) => css.getPropertyValue(`--${name}`).trim();
    const black = color('black');
    const white = color('white');
    const cell = 64;
    const margin = cell / 2;
    const size = SIZE * cell + margin * 2;
    const point = (n) => margin + (n + 0.5) * cell;
    const first = point(0);
    const last = point(SIZE - 1);
    const grid = state.board.map((_, i) => {
        const p = point(i);
        return `M${first} ${p}H${last} M${p} ${first}V${last}`;
    }).join(' ');
    const stars = [[2, 2], [2, 8], [5, 5], [8, 2], [8, 8]].map(([x, y]) =>
        `<circle cx="${point(x)}" cy="${point(y)}" r="4" fill="${color('board-line')}"/>`
    ).join('');
    const wins = new Set((state.winLine || []).map(([x, y]) => `${x},${y}`));
    const stones = state.board.map((row, y) => row.map((stone, x) => {
        if (!stone) return '';
        const win = wins.has(`${x},${y}`);
        const fill = win ? color('win') : { b: black, w: white, n: color('neutral') }[stone.color];
        const outline = stone.color === 'b' ? color('black-stone-edge') || black : black;
        const shape = stone.color === 'n'
            ? `<rect x="-22" y="-22" width="44" height="44" rx="10" fill="${fill}"/>`
            : `<circle r="27" fill="${fill}" stroke="${win ? fill : outline}" stroke-width="2"/>`;
        const ink = stone.color === 'b' && !win ? white : black;
        const icon = ICONS[stone.ability] || '';
        const marker = state.lastMove?.[0] === x && state.lastMove[1] === y
            ? `<circle r="30" fill="none" stroke="${color('accent')}" stroke-width="3"/>` : '';
        return `<g transform="translate(${point(x)} ${point(y)})">${shape}${marker}
            <g transform="translate(-17 -17) scale(1.41667)" color="${ink}" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
        </g>`;
    }).join('')).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <rect width="${size}" height="${size}" fill="${color('board')}"/>
        <path d="${grid}" fill="none" stroke="${color('board-line')}" stroke-width="1.5"/>
        ${stars}${stones}
    </svg>`;
}

async function boardPNG() {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(boardImage())}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNGの作成に失敗しました');
    return new File([blob], 'gomoku.png', { type: 'image/png' });
}

function initBoardShare() {
    const dialog = $('share-dialog');
    const image = $('share-image');
    const status = $('share-status');
    const native = $('share-native');
    const download = $('share-download');
    let request = null;
    let url = null;

    async function openShare() {
        if (dialog.open) return;
        const current = {};
        request = current;
        image.hidden = native.hidden = download.hidden = true;
        status.textContent = '盤面の画像を作成中…';
        dialog.showModal();
        try {
            const file = await boardPNG();
            if (request !== current || !dialog.open) return;
            url = URL.createObjectURL(file);
            image.src = download.href = url;
            image.hidden = download.hidden = false;
            const data = { files: [file] };
            native.hidden = !(typeof navigator.share === 'function' && navigator.canShare?.(data));
            status.textContent = native.hidden
                ? 'PNGを保存して、Xの投稿やLINEのトークに添付できます。'
                : '共有先からXやLINEを選べます。表示されない場合はPNGを保存して添付してください。';
            native.onclick = async () => {
                try {
                    await navigator.share(data);
                } catch (error) {
                    if (error.name !== 'AbortError' && request === current) {
                        status.textContent = '共有できませんでした。PNGを保存して、XやLINEに添付してください。';
                    }
                }
            };
        } catch (error) {
            if (request === current && dialog.open) status.textContent = '盤面の画像を作成できませんでした。';
        }
    }

    $('share-btn').addEventListener('click', openShare);
    $('share-result').addEventListener('click', openShare);
    dialog.addEventListener('close', () => {
        if (dialog.open) return;
        request = null;
        native.onclick = null;
        if (url) URL.revokeObjectURL(url);
        url = null;
        image.removeAttribute('src');
        download.removeAttribute('href');
    });
}
