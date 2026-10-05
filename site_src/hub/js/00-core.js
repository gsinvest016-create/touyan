/* ===== 投研總台 — 核心：狀態、資料、搜尋、路由、自選股 ===== */
var E = window.TAEngine;
var $ = function (s, el) { return (el || document).querySelector(s); };
var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
var state = {
  index: null, byCode: {}, scan: {}, chunks: {}, univ: [], univByCode: {},
  supply: null, season: null, settle: null, stats: null, mods: {},
  tf: 'D', range: 120, watch: [], sort: { key: 'score', dir: -1 }, filters: {}, mk: 'ALL', db: null,
  route: null, current: null, radarCurrent: null, cache: {}
};
var fmt = {
  p: function (x) { if (x == null || !isFinite(x)) return '—'; var a = Math.abs(x); return a >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a >= 100 ? x.toFixed(1).replace(/\.0$/, '') : a >= 10 ? (+x.toFixed(2)).toString() : (+x.toFixed(3)).toString(); },
  pct: function (x, dp) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + (+x).toFixed(dp == null ? 2 : dp) + '%'; },
  vol: function (v, mk) { if (v == null) return '—'; if (mk === 'TW') { var z = v / 1000; return z >= 10000 ? (z / 10000).toFixed(1) + '萬張' : Math.round(z).toLocaleString() + '張'; } return v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v); },
  date: function (d) { return (d.getMonth() + 1) + '/' + d.getDate(); }
};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function pct(a, b) { return (a - b) / b * 100; }
function isTWCode(c) { return /^\d{4,6}[A-Z]?$/.test(c); }

// ---------- 資料載入 ----------
function loadJSON(u) { return fetch(u, { cache: 'default' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
function unz(o) { if (o && typeof o.z === 'string') { var bin = atob(o.z), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return JSON.parse(window.pako.inflate(u8, { to: 'string' })); } return o; }
function loadZ(u) { return loadJSON(u).then(unz); }
function loadChunk(k) { if (state.chunks[k]) return Promise.resolve(state.chunks[k]); return loadZ('data/chunks/' + k + '.json').then(function (obj) { state.chunks[k] = obj; return obj; }); }
function getBars(code) { var s = state.byCode[code]; if (!s) return Promise.reject(new Error('找不到 ' + code + ' 的價量資料')); return loadChunk(s.k).then(function (ch) { var b = ch[code]; if (!b) throw new Error('無 ' + code + ' 價量資料'); return b; }); }
function analyzeCode(code, tf) {
  var key = code + '|' + tf; if (state.cache[key]) return Promise.resolve(state.cache[key]);
  var meta = state.byCode[code];
  return getBars(code).then(function (raw) { var a = E.analyze(raw, { market: meta.m, timeframe: tf }); a.raw = raw; a.code = code; a.tf = tf; state.cache[key] = a; return a; });
}
// 個股回測（同一套訊號規則逐根前推），結果快取在 a.bt
function backtestOf(a) {
  if (a.bt) return a.bt;
  var meta = state.byCode[a.code];
  try { a.bt = E.backtest(a.raw, meta.m, { timeframe: a.tf, lookback: 400 }); } catch (e) { a.bt = { sig: [], trades: [], all: { n: 0 }, kinds: {} }; }
  return a.bt;
}
// 期望值查詢：優先用本股同類訊號（n>=3），再用全市場同市場同類（n>=10），再全市場同類（n>=5）
function expectFor(a, key) {
  var bt = backtestOf(a), meta = state.byCode[a.code];
  // 形成中／等突破的計畫：改查同形態「帶量突破」→「突破」的歷史
  var base = key.replace(/\s*(帶量)?(突破|跌破|確認|形成中|已突破|已跌破).*$/, '').trim();
  var cands = [key, base + ' 帶量突破', base + ' 帶量跌破', base + ' 突破', base + ' 跌破'];
  var pick = function (obj, prefix, minN) { for (var q = 0; q < cands.length; q++) { var k2 = (prefix || '') + cands[q]; if (obj && obj[k2] && obj[k2].n >= minN) return { k: cands[q], st: obj[k2] }; } if (obj) { var ks = Object.keys(obj).filter(function (k3) { return k3.indexOf((prefix || '') + base) === 0 && obj[k3].n >= minN; }).sort(function (x, y) { return obj[y].n - obj[x].n; }); if (ks.length) return { k: ks[0].replace(prefix || '', ''), st: obj[ks[0]] }; } return null; };
  var suffix = function (k2) { return k2 === key ? '' : '（以「' + k2 + '」計）'; };
  var sane = function (x) { return x && (x.st.n >= 20 || Math.abs(x.st.expectancy) <= 3); }; // 少樣本卻極端的本股數字（例如 DR、跳空造成的 +19R）不採用
  var o = pick(bt.kinds, '', 3); if (sane(o)) return { src: 'own', label: '本股歷史' + suffix(o.k), st: o.st, key: o.k };
  var S = state.stats;
  var m1 = pick(S && S.kindsM, meta.m + '|', 10); if (m1) return { src: 'mkt', label: (meta.m === 'TW' ? '台股' : '美股') + '同類訊號' + suffix(m1.k), st: m1.st, key: m1.k };
  var m2 = pick(S && S.kinds, '', 5); if (m2) return { src: 'all', label: '全市場同類訊號' + suffix(m2.k), st: m2.st, key: m2.k };
  var o2 = pick(bt.kinds, '', 1); if (sane(o2)) return { src: 'own', label: '本股歷史（樣本少）' + suffix(o2.k), st: o2.st, key: o2.k };
  var m3 = pick(S && S.kinds, '', 1); if (m3) return { src: 'all', label: '全市場同類（樣本少）' + suffix(m3.k), st: m3.st, key: m3.k };
  return null;
}
function expectForOld(a, key) {
  var bt = backtestOf(a), meta = state.byCode[a.code];
  var own = bt.kinds[key];
  if (own && own.n >= 3) return { src: 'own', label: '本股歷史', st: own };
  var S = state.stats;
  if (S && S.kindsM && S.kindsM[meta.m + '|' + key] && S.kindsM[meta.m + '|' + key].n >= 10) return { src: 'mkt', label: (meta.m === 'TW' ? '台股' : '美股') + '同類訊號', st: S.kindsM[meta.m + '|' + key] };
  if (S && S.kinds && S.kinds[key] && S.kinds[key].n >= 5) return { src: 'all', label: '全市場同類訊號', st: S.kinds[key] };
  if (own && own.n) return { src: 'own', label: '本股歷史（樣本少）', st: own };
  return null;
}
function supplyOf(code) { var s = state.supply; if (!s) return null; return s.byCode[code] || null; }
function rosterOf(code) { var s = state.supply; if (!s) return null; return s.byRoster[code] || null; }
function nameOf(code) { var m = state.byCode[code]; if (m) return m.n; var d = supplyOf(code); if (d) return d.n; var r = rosterOf(code); if (r) return r[1]; return code; }
function marketOf(code) { var m = state.byCode[code]; if (m) return m.m; return isTWCode(code) ? 'TW' : 'US'; }

// ---------- 搜尋 ----------
function buildUniverse() {
  var out = [], seen = {};
  (state.index ? state.index.stocks : []).forEach(function (s) { seen[s.c] = 1; out.push({ c: s.c, n: s.n, m: s.m, has: true }); });
  if (state.supply) {
    state.supply.data.forEach(function (d) { if (!seen[d.c]) { seen[d.c] = 1; out.push({ c: d.c, n: d.n, m: 'TW', has: false, sec: state.supply.sectors[d.s].name }); } else { var u = out.find(function (x) { return x.c === d.c; }); if (u) u.sec = state.supply.sectors[d.s].name; } });
    var SUB = state.supply.sub || {};
    state.supply.roster.forEach(function (r) { var si = SUB[r[0]], secName = si ? si[0] : r[2], tg = si ? (si[2] || []).join(' ') : ''; if (!seen[r[0]]) { seen[r[0]] = 1; out.push({ c: r[0], n: r[1], m: 'TW', has: false, sec: secName, tags: tg, ind: r[2] }); } else { var u2 = out.find(function (x) { return x.c === r[0]; }); if (u2) { if (!u2.sec || u2.sec === r[2]) u2.sec = secName; u2.tags = tg; u2.ind = r[2]; } } });
  }
  state.univ = out; state.univByCode = {}; out.forEach(function (u) { state.univByCode[u.c] = u; });
}
function search(q) {
  q = q.trim().toUpperCase(); if (!q) return [];
  var out = [], st = state.univ;
  for (var i = 0; i < st.length && out.length < 14; i++) { var s = st[i]; if (s.c.toUpperCase().indexOf(q) === 0) out.push(s); }
  for (var j = 0; j < st.length && out.length < 14; j++) { var t = st[j]; if (out.indexOf(t) < 0 && (t.n.toUpperCase().indexOf(q) >= 0 || t.c.toUpperCase().indexOf(q) > 0 || (t.sec && t.sec.indexOf(q) >= 0) || (t.tags && t.tags.indexOf(q) >= 0) || (t.ind && t.ind.indexOf(q) >= 0))) out.push(t); }
  out.sort(function (a, b) { return (b.has ? 1 : 0) - (a.has ? 1 : 0); });
  return out;
}
var qEl = $('#q'), suggEl = $('#sugg'), activeIdx = -1, suggItems = [];
function renderSugg(items) {
  suggItems = items; activeIdx = -1; suggEl.innerHTML = '';
  if (!items.length) { suggEl.hidden = true; return; }
  items.forEach(function (s) {
    var sig = state.scan[s.c];
    var row = h('<div role="option"><span class="code">' + esc(s.c) + '</span><span>' + esc(s.n) + '</span>' + (sig ? '<span class="pill ' + (sig.side === 'long' ? 'long' : sig.side === 'short' ? 'short' : '') + '">' + esc(sig.kind.replace(/（.*?）/g, '')) + '</span>' : (s.has ? '' : '<span class="pill">無價量</span>')) + '<span class="sec">' + esc(s.sec || (s.m === 'TW' ? '台股' : '美股')) + '</span></div>');
    row.addEventListener('mousedown', function (e) { e.preventDefault(); goStock(s.c); });
    suggEl.appendChild(row);
  });
  suggEl.hidden = false;
}
qEl.addEventListener('input', function () { renderSugg(search(qEl.value)); });
qEl.addEventListener('focus', function () { if (qEl.value) renderSugg(search(qEl.value)); });
qEl.addEventListener('blur', function () { setTimeout(function () { suggEl.hidden = true; }, 120); });
qEl.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!suggItems.length) return; activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + suggItems.length) % suggItems.length; Array.prototype.forEach.call(suggEl.children, function (c, i) { c.classList.toggle('active', i === activeIdx); }); }
  else if (e.key === 'Enter') { var items = suggItems.length ? suggItems : search(qEl.value); if (items.length) goStock((activeIdx >= 0 ? items[activeIdx] : items[0]).c); }
  else if (e.key === 'Escape') suggEl.hidden = true;
});
document.addEventListener('keydown', function (e) { if (e.key === '/' && document.activeElement !== qEl && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); qEl.focus(); } });
function goStock(code) { suggEl.hidden = true; qEl.value = ''; qEl.blur(); location.hash = '#/stock/' + code; }

// ---------- 路由 ----------
var ROUTES = ['market', 'home', 'stock', 'radar', 'ideas', 'plan', 'backtest', 'supply', 'season', 'settle', 'notes'];
function parseHash() {
  var hsh = (location.hash || '').replace(/^#\/?/, ''), parts = hsh.split('/').filter(Boolean);
  var route = parts[0] || 'market', arg = parts[1] || '';
  if (ROUTES.indexOf(route) < 0) { route = 'stock'; arg = ''; }
  return { route: route, arg: arg };
}
function showRoute() {
  var r = parseHash();
  if (r.route === 'stock' && !r.arg) { var last = null; try { last = localStorage.getItem('hub.last'); } catch (e) { } if (!last || !state.univByCode[last]) last = (state.index && state.index.default) || '2330'; location.replace('#/stock/' + last); return; }
  state.route = r;
  $$('#mainnav a').forEach(function (a) { if (a.dataset.route === r.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  ROUTES.forEach(function (x) { $('#view-' + x).hidden = x !== r.route; });
  var tfSeg = $('#tfD').parentNode; tfSeg.style.visibility = (r.route === 'stock' || r.route === 'radar' || r.route === 'home') ? 'visible' : 'hidden';
  document.body.dataset.route = r.route;
  if (r.route === 'stock') { renderStock(r.arg); try { localStorage.setItem('hub.last', r.arg); } catch (e) { } }
  else if (r.route === 'radar') showRadarSub(r.arg || 'analyze');
  else if (r.route === 'supply') { window.__subind = (state.supply && state.supply.sub) || {}; mountModule('supply').then(function () { if (r.arg && window.__supplyAPI) window.__supplyAPI.openCompany(r.arg, false); }); }
  else if (r.route === 'home') renderHome();
  else if (r.route === 'market') renderMarket();
  else if (r.route === 'ideas') renderIdeas(r.arg);
  else if (r.route === 'plan') renderPlan();
  else if (r.route === 'backtest') renderBacktest();
  else if (r.route === 'season') mountModule('season');
  else if (r.route === 'settle') mountModule('settle');
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', showRoute);
$('#tfD').addEventListener('click', function () { setTF('D'); }); $('#tfW').addEventListener('click', function () { setTF('W'); });
function setTF(tf) { state.tf = tf; $('#tfD').setAttribute('aria-pressed', tf === 'D'); $('#tfW').setAttribute('aria-pressed', tf === 'W'); if (state.route && state.route.route === 'stock') renderStock(state.route.arg); if (state.route && state.route.route === 'home') { state.hmRange = null; renderHome(); } if (state.radarCurrent) radarAnalyze(state.radarCurrent.code); }

// ---------- 主題同步（給 Shadow DOM 模組） ----------
function syncTheme() { var t = document.documentElement.getAttribute('data-theme'); $$('.modhost').forEach(function (el) { if (t) el.setAttribute('data-theme', t); else el.removeAttribute('data-theme'); }); }
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------- 自選股（localStorage + 帳號同步 db） ----------
function loadWatchLocal() { try { var w = JSON.parse(localStorage.getItem('radar.watch') || '[]'); if (Array.isArray(w)) state.watch = w; } catch (e) { } }
function saveWatch() {
  try { localStorage.setItem('radar.watch', JSON.stringify(state.watch)); } catch (e) { }
  if (state.db) { state.db.doc('watchlist/main').set({ codes: state.watch, updated: new Date().toISOString() }).catch(function () { }); }
}
function toggleWatch(code) { var i = state.watch.indexOf(code); if (i >= 0) state.watch.splice(i, 1); else state.watch.push(code); saveWatch(); refreshStar(); if (!$('#view-watch').hidden) renderWatch(); }
function initDB() {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  window.claude.use('db').then(function (db) {
    if (!db) return; state.db = db;
    db.doc('watchlist/main').onSnapshot(function (snap) {
      if (snap.exists) { var d = snap.data(); if (d && Array.isArray(d.codes)) { if (JSON.stringify(d.codes) !== JSON.stringify(state.watch)) { state.watch = d.codes.slice(); try { localStorage.setItem('radar.watch', JSON.stringify(state.watch)); } catch (e) { } if (!$('#view-watch').hidden) renderWatch(); refreshStar(); } } }
      else if (state.watch.length) { db.doc('watchlist/main').set({ codes: state.watch, updated: new Date().toISOString() }).catch(function () { }); }
    }, function () { });
  }).catch(function () { });
}
function refreshStar() { $$('.star').forEach(function (b) { var on = state.watch.indexOf(b.dataset.code) >= 0; b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; }); }
function starBtn(code) { var on = state.watch.indexOf(code) >= 0; return '<button class="star' + (on ? ' on' : '') + '" data-code="' + esc(code) + '" title="加入／移除自選" aria-label="自選">' + (on ? '★' : '☆') + '</button>'; }
document.addEventListener('click', function (e) {
  var b = e.target.closest('.star'); if (b) { e.stopPropagation(); toggleWatch(b.dataset.code); return; }
  var g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); location.hash = '#/stock/' + g.dataset.go; }
});

// ---------- 通用儲存（localStorage 即時 + 帳號 db 同步） ----------
var Store = {};
function makeStore(name, defaults) {
  var st = { name: name, data: defaults, loaded: false, listeners: [] };
  try { var raw = localStorage.getItem('hub.' + name); if (raw) st.data = Object.assign({}, defaults, JSON.parse(raw)); } catch (e) { }
  st.save = function () {
    try { localStorage.setItem('hub.' + name, JSON.stringify(st.data)); } catch (e) { }
    if (state.db) state.db.doc('store/' + name).set({ data: st.data, updated: new Date().toISOString() }).catch(function () { });
    st.listeners.forEach(function (f) { try { f(st.data); } catch (e) { } });
  };
  st.onChange = function (f) { st.listeners.push(f); };
  st.bindDB = function () {
    if (!state.db) return;
    state.db.doc('store/' + name).onSnapshot(function (snap) {
      if (snap.exists) { var d = snap.data(); if (d && d.data && JSON.stringify(d.data) !== JSON.stringify(st.data)) { st.data = Object.assign({}, defaults, d.data); try { localStorage.setItem('hub.' + name, JSON.stringify(st.data)); } catch (e) { } st.listeners.forEach(function (f) { try { f(st.data); } catch (e2) { } }); } }
      else if (JSON.stringify(st.data) !== JSON.stringify(defaults)) state.db.doc('store/' + name).set({ data: st.data, updated: new Date().toISOString() }).catch(function () { });
    }, function () { });
  };
  Store[name] = st; return st;
}
makeStore('plan', { checks: {} });
makeStore('portfolio', { capital: 0, exposure: null });
makeStore('backtest', { last: null });
var _initDB = initDB;
initDB = function () { _initDB(); var tries = 0; var t = setInterval(function () { tries++; if (state.db) { Object.keys(Store).forEach(function (k) { Store[k].bindDB(); }); clearInterval(t); } else if (tries > 40) clearInterval(t); }, 250); };
// Claude（sample 能力）：可用時才顯示「請 Claude 點評」
state.sample = undefined;
function getSample() {
  if (state.sample !== undefined) return Promise.resolve(state.sample);
  if (!window.claude || typeof window.claude.use !== 'function') { state.sample = null; return Promise.resolve(null); }
  return window.claude.use('sample').then(function (fn) { state.sample = fn || null; return state.sample; }).catch(function () { state.sample = null; return null; });
}
function askClaude(btn, outEl, prompt) {
  getSample().then(function (sample) {
    if (!sample) { outEl.innerHTML = '<div class="note">這個檢視無法呼叫 Claude（未授權或不支援）。上面的規則式分析仍然有效。</div>'; return; }
    var ctl = new AbortController(); btn.disabled = true; outEl.hidden = false; outEl.innerHTML = '<div class="thinking">Claude 思考中…（第一次會詢問授權；使用你的 Claude 額度）<button class="btn stopbtn" style="margin-left:10px">停止</button></div><div class="ai"></div>';
    var stop = $('.stopbtn', outEl), ai = $('.ai', outEl); stop.onclick = function () { ctl.abort(); };
    sample(prompt, { signal: ctl.signal, cache: false, onText: function (u) { $('.thinking', outEl).hidden = true; ai.textContent = u.text; } }).then(function (r) { ai.textContent = r.text; if (r.truncated) ai.textContent += '\n\n（回答被截斷）'; }).catch(function (e) { $('.thinking', outEl).hidden = true; if (e.text) ai.textContent = e.text; if (e.code === 'not_granted' || e.code === 'sampling_disabled') outEl.innerHTML = '<div class="note">未授權此頁使用 Claude；規則式分析仍可使用。</div>'; else if (e.code !== 'cancelled') ai.textContent += '\n\n（發生錯誤：' + e.code + '，稍後再試）'; }).finally(function () { btn.disabled = false; });
  });
}
