// 建置投研總台：頁面（含引擎、殼層 JS）、價量資料塊、掃描結果、模組與統計資料
// 用法：node build.js [bars.json(.gz)] [names.json] [markets.json]
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const E = require('../engine/engine.js');
const here = __dirname;
const barsFile = process.argv[2];
const namesFile = process.argv[3];
const mkFile = process.argv[4];
const bars = JSON.parse(barsFile.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(barsFile)).toString('utf8') : fs.readFileSync(barsFile, 'utf8'));
const names = JSON.parse(fs.readFileSync(namesFile, 'utf8'));
const mkMap = mkFile ? JSON.parse(fs.readFileSync(mkFile, 'utf8')) : {};
const MAX_BARS = 520, CHUNK = 60;
const out = path.join(here, 'dist');
let reusedStats = null; if (process.env.REUSE_STATS) { try { reusedStats = fs.readFileSync(path.join(out, 'data', 'stats.json'), 'utf8'); } catch (e) { } }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data', 'chunks'), { recursive: true }); fs.mkdirSync(path.join(out, 'modules'), { recursive: true });

// 頁面
let html = fs.readFileSync(path.join(here, 'template.html'), 'utf8').replace('__HUB_BUILD__', () => new Date().toISOString());
const baseCss = fs.readFileSync(path.join(here, 'base.css'), 'utf8').replace(/^<style>\s*/, '').replace(/\s*<\/style>\s*$/, '');
const appJs = fs.readdirSync(path.join(here, 'js')).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(here, 'js', f), 'utf8')).join('\n');
html = html.replace('/*__BASECSS__*/', baseCss).replace('/*__ENGINE__*/', () => fs.readFileSync(path.join(here, '..', 'engine', 'engine.js'), 'utf8')).replace('/*__APP__*/', () => '(function(){\n"use strict";\n' + appJs + '\n})();');
fs.writeFileSync(path.join(out, 'index.html'), html);
// 獨立架站版（GitHub Pages 等）：補上完整的 HTML 骨架與深色模式記憶
const standalone = '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="color-scheme" content="light dark">\n<script>try{var t=localStorage.getItem("hub.theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}</script>\n</head>\n<body>\n' + html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></script>', () => '<script>' + fs.readFileSync(path.join(here, 'vendor', 'pako.min.js'), 'utf8') + '</script>') + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(out, 'index.standalone.html'), standalone);

// 名稱補強：供應鏈名錄的名稱優先（較完整）
let roster = {};
try { const sup = JSON.parse(zlib.gunzipSync(Buffer.from(JSON.parse(fs.readFileSync(path.join(here, 'gen', 'supply.json'), 'utf8')).z, 'base64')).toString()); sup.roster.forEach(r => roster[r[0]] = r[1]); sup.data.forEach(d => roster[d.c] = d.n); } catch (e) { console.warn('no supply roster', e.message); }

// 指數（市場水位）：bars 內 market=IDX 的代碼，加上示範／備援檔 demo_raw/indices.json（INDICES 環境變數可指定）
const IDX_NAMES = { TWII: '台股加權指數', TWOII: '櫃買指數', GSPC: '標普 500', IXIC: '那斯達克', SOX: '費城半導體', TNX: '美國10年期公債殖利率' };
const indices = {};
const idxFile = process.env.INDICES || path.join(here, '..', 'demo_raw', 'indices.json');
try { const d = JSON.parse(fs.readFileSync(idxFile, 'utf8')); Object.keys(d).forEach(k => { if (Array.isArray(d[k]) && d[k].length >= 100) indices[k] = d[k]; }); } catch (e) { }
Object.keys(bars).forEach(c => { if (mkMap[c] === 'IDX' && bars[c] && bars[c].length >= 100) indices[c] = bars[c]; });
Object.keys(indices).forEach(k => { indices[k] = indices[k].slice(-2600).map(r => [String(r[0]).replace(/-/g, ''), +r[1], +r[2], +r[3], +r[4], Math.round(+r[5] || 0)]); });
fs.writeFileSync(path.join(out, 'data', 'indices.json'), JSON.stringify({ z: zlib.gzipSync(JSON.stringify({ names: IDX_NAMES, bars: indices }), { level: 9 }).toString('base64') }));
console.log('indices:', Object.keys(indices).map(k => k + ' ' + indices[k].length + ' bars (to ' + indices[k][indices[k].length - 1][0] + ')').join(', ') || 'none');

// 價量資料
function mk(c) { return mkMap[c] || (/^\d/.test(c) ? 'TW' : 'US'); }
const codes = Object.keys(bars).filter(c => bars[c] && bars[c].length >= 30 && mkMap[c] !== 'IDX').sort((a, b) => { const ma = mk(a), mb = mk(b); return ma === mb ? a.localeCompare(b, 'en', { numeric: true }) : ma === 'TW' ? -1 : 1; });
const stocks = [], scan = {}; let latest = '', counts = { TW: 0, US: 0 };
let chunkId = 0, chunk = {}, n = 0;
function flush() { if (!n) return; const k = 'c' + String(chunkId).padStart(3, '0'); fs.writeFileSync(path.join(out, 'data', 'chunks', k + '.json'), JSON.stringify({ z: zlib.gzipSync(JSON.stringify(chunk), { level: 9 }).toString('base64') })); chunkId++; chunk = {}; n = 0; }
codes.forEach(c => {
  const b = bars[c].slice(-MAX_BARS).map(r => [String(r[0]).replace(/-/g, ''), +r[1], +r[2], +r[3], +r[4], Math.round(+r[5] || 0)]);
  const m = mk(c), k = 'c' + String(chunkId).padStart(3, '0');
  stocks.push({ c, n: names[c] || roster[c] || c, m, k });
  chunk[c] = b; n++; counts[m]++;
  const d = bars[c][bars[c].length - 1][0]; if (d > latest) latest = d;
  try { const s = E.scanSignals(b, m); if (s) scan[c] = s; } catch (e) { console.error('scan fail', c, e.message); }
  if (n >= CHUNK) flush();
});
flush();
let srcUpdated = ''; try { srcUpdated = JSON.parse(fs.readFileSync(process.env.STATUS_FILE || path.join(path.dirname(barsFile), 'status.json'), 'utf8')).updated || ''; } catch (e) { }
const index = { date: latest, src: srcUpdated, generated: new Date().toISOString(), markets: counts, stocks, default: stocks.find(s => s.c === '2330') ? '2330' : stocks[0].c, note: process.env.DATA_NOTE || '' };
fs.writeFileSync(path.join(out, 'data', 'index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(out, 'data', 'scan.json'), JSON.stringify({ z: zlib.gzipSync(JSON.stringify(scan), { level: 9 }).toString('base64') }));
// 全市場訊號回測統計（依訊號類別彙整）— 可用 SKIP_BT=1 略過
const statsFile = path.join(out, 'data', 'stats.json');
if (reusedStats) { fs.writeFileSync(statsFile, reusedStats); console.log('stats: reused previous'); }
else if (process.env.SKIP_BT) { fs.writeFileSync(statsFile, JSON.stringify({ generated: new Date().toISOString(), n: 0, kinds: {}, all: null })); }
else {
  const t0 = Date.now(); const allTrades = []; let done = 0;
  codes.forEach(c => { try { const bt = E.backtest(bars[c].slice(-MAX_BARS), mk(c), { lookback: 400 }); bt.trades.forEach(t => allTrades.push({ key: t.key, side: t.side, R: t.R, open: t.open, hold: t.hold, pct: t.pct, m: mk(c) })); } catch (e) { } done++; if (done % 200 === 0) console.log('backtest', done, '/', codes.length, ((Date.now() - t0) / 1000).toFixed(0) + 's'); });
  const groupBy = (arr, f) => arr.reduce((m, t) => { (m[f(t)] = m[f(t)] || []).push(t); return m; }, {});
  const byKey = groupBy(allTrades, t => t.key), byKeyM = groupBy(allTrades, t => t.m + '|' + t.key);
  const kinds = {}; Object.keys(byKey).forEach(k => kinds[k] = E.tradeStats(byKey[k]));
  const kindsM = {}; Object.keys(byKeyM).forEach(k => kindsM[k] = E.tradeStats(byKeyM[k]));
  const stats = { generated: new Date().toISOString(), stocks: codes.length, n: allTrades.length, all: E.tradeStats(allTrades), long: E.tradeStats(allTrades.filter(t => t.side === 'long')), short: E.tradeStats(allTrades.filter(t => t.side === 'short')), kinds, kindsM, maxHold: 40, note: '訊號當日收盤進場、停損／目標觸價出場、最長持有 40 根；未計交易成本與滑價。' };
  fs.writeFileSync(statsFile, JSON.stringify(stats));
  console.log('stats: trades', allTrades.length, 'kinds', Object.keys(kinds).length, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
// 模組與統計資料
for (const f of ['supply.json', 'season.json', 'settle.json']) fs.copyFileSync(path.join(here, 'gen', f), path.join(out, 'data', f));
for (const mname of ['supply', 'season', 'settle']) fs.copyFileSync(path.join(here, 'gen', 'mod-' + mname + '.json'), path.join(out, 'modules', mname + '.json'));
// files 對應表
const files = { 'data/index.json': 'dist/data/index.json', 'data/scan.json': 'dist/data/scan.json', 'data/stats.json': 'dist/data/stats.json', 'data/supply.json': 'dist/data/supply.json', 'data/season.json': 'dist/data/season.json', 'data/settle.json': 'dist/data/settle.json', 'data/indices.json': 'dist/data/indices.json', 'modules/supply.json': 'dist/modules/supply.json', 'modules/season.json': 'dist/modules/season.json', 'modules/settle.json': 'dist/modules/settle.json' };
for (let i = 0; i < chunkId; i++) { const k = 'c' + String(i).padStart(3, '0'); files['data/chunks/' + k + '.json'] = 'dist/data/chunks/' + k + '.json'; }
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(files, null, 1));
const size = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`built: ${stocks.length} stocks (TW ${counts.TW}, US ${counts.US}), ${chunkId} chunks, latest ${latest}, data ${(size(path.join(out, 'data')) / 1e6).toFixed(2)} MB, modules ${(size(path.join(out, 'modules')) / 1e6).toFixed(2)} MB, page ${(fs.statSync(path.join(out, 'index.html')).size / 1e3).toFixed(0)} KB`);
