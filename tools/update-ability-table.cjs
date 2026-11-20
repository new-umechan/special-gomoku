'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { ABILITIES, SPECIAL_IDS, costOf } = require('../script.js');

const path = join(__dirname, '..', 'README.md');
const readme = readFileSync(path, 'utf8');
const start = '<!-- ability-table:start -->';
const end = '<!-- ability-table:end -->';
const from = readme.indexOf(start);
const to = readme.indexOf(end, from + start.length);
if (from < 0 || to < 0) throw new Error('README に超能力一覧のマーカーがありません');

const cell = (value) => value.replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
const rows = SPECIAL_IDS.slice().sort((a, b) => costOf(a) - costOf(b)).map((id) => {
    const { name, desc } = ABILITIES[id];
    return `| ${cell(name)} | ${costOf(id)} | ${cell(desc)} |`;
});
const table = [start, '| 名前 | ポイント | 効果 |', '|---|---|---|', ...rows, end].join('\n');
const updated = readme.slice(0, from) + table + readme.slice(to + end.length);
if (updated !== readme) writeFileSync(path, updated);
