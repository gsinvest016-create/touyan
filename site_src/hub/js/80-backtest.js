/* ===== 策略回測分析師：本站訊號／均線交叉／RSI／N 日突破／九轉，統計、權益曲線、交易清單、改進方向 ===== */
var BT_STRATS = [
  { id: 'site', n: '本站訊號（形態 / VCP / 帶量突破 / 九轉十三轉）', d: '與個股頁的 ▲▼ 完全相同的規則，逐根前推' },
  { id: 'brk', n: 'N 日高點帶量突破', d: '收盤創 N 日新高且量 ≥ k 倍 20 日均量進場；放空為 N 日新低' },
  { id: 'ma', n: '均線交叉', d: '快線上穿慢線做多、下穿放空（或只做多）' },
  { id: 'rsi', n: 'RSI 超賣反彈', d: 'RSI 低於門檻後回升越過門檻進場（逆勢，適合上升期拉回）' },
  { id: 'td9', n: '神奇九轉 買 9 / 賣 9', d: 'TD 設定完成 9 的次一根進場（買 9 做多、賣 9 放空）' }
];
function btDefaults() { return { strat: 'site', side: 'both', univ: 'single', code: (state.route && state.route.arg) || state.current || '2330', tf: 'D', lookback: 400, n: 20, k: 1.5, fast: 20, slow: 60, rsiLo: 30, stopMode: 'signal', targetMode: 'signal', stopK: 2, stopPct: 7, targetR: 2, maxHold: 40, trend: 'none', volF: false }; }
// 自訂策略訊號序列（與 engine.signalSeries 輸出同型）
function btCustomSignals(bars, P, market) {
  var n = bars.length, c = bars.map(function (b) { return b.c; }), v = bars.map(function (b) { return b.v; });
  var atr = E.atr(bars, 14), ma200 = E.sma(c, 200), ma150 = E.sma(c, 150), ma50 = E.sma(c, 50), vol20 = E.sma(v, 20);
  var fast = E.sma(c, P.fast), slow = E.sma(c, P.slow), rsi = E.rsi(c, 14), td = P.strat === 'td9' ? E.tdSequential(bars) : null;
  var out = new Array(n).fill(null);
  function stopFor(i, side) { var b = bars[i]; if (P.stopMode === 'pct') return side === 'long' ? b.c * (1 - P.stopPct / 100) : b.c * (1 + P.stopPct / 100); if (P.stopMode === 'swing') { var lo = Infinity, hi = -Infinity; for (var j = Math.max(0, i - 10); j <= i; j++) { lo = Math.min(lo, bars[j].l); hi = Math.max(hi, bars[j].h); } return side === 'long' ? lo * 0.995 : hi * 1.005; } var a = atr[i] || (b.h - b.l); return side === 'long' ? b.c - P.stopK * a : b.c + P.stopK * a; }
  function trendOK(i, side) { if (P.trend === 'none') return true; var m = P.trend === 'ma200' ? ma200[i] : P.trend === 'ma150' ? ma150[i] : ma50[i]; if (m == null) return false; return side === 'long' ? bars[i].c > m : bars[i].c < m; }
  function volOK(i) { return !P.volF || (vol20[i] && v[i] >= 1.5 * vol20[i]); }
  function emit(i, side, kind) { if (!trendOK(i, side) || !volOK(i)) return; if (P.side !== 'both' && P.side !== side) return; var st = stopFor(i, side), e = bars[i].c, risk = Math.abs(e - st); if (!(risk > 0)) return; out[i] = { side: side, kind: kind, key: kind, entry: e, stop: E.roundTick(st, market), target: E.roundTick(side === 'long' ? e + P.targetR * risk : e - P.targetR * risk, market), exit: false, score: 50 }; }
  var setupAt = {}; (td && td.setups ? td.setups : []).forEach(function (s) { setupAt[s.endIdx] = s; });
  for (var i = Math.max(P.slow, P.n, 30); i < n; i++) {
    if (P.strat === 'brk') { var hi = -Infinity, lo = Infinity; for (var j = i - P.n; j < i; j++) { hi = Math.max(hi, bars[j].h); lo = Math.min(lo, bars[j].l); } var vk = vol20[i] ? v[i] / vol20[i] : 0; if (c[i] > hi && vk >= P.k) emit(i, 'long', P.n + ' 日高 帶量突破'); else if (c[i] < lo && vk >= P.k) emit(i, 'short', P.n + ' 日低 帶量跌破'); }
    else if (P.strat === 'ma') { if (fast[i - 1] != null && slow[i - 1] != null) { if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) emit(i, 'long', 'MA' + P.fast + ' 上穿 MA' + P.slow); else if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) emit(i, 'short', 'MA' + P.fast + ' 下穿 MA' + P.slow); } }
    else if (P.strat === 'rsi') { if (rsi[i - 1] != null && rsi[i - 1] < P.rsiLo && rsi[i] >= P.rsiLo) emit(i, 'long', 'RSI 回升越過 ' + P.rsiLo); else if (rsi[i - 1] != null && rsi[i - 1] > 100 - P.rsiLo && rsi[i] <= 100 - P.rsiLo) emit(i, 'short', 'RSI 回落跌破 ' + (100 - P.rsiLo)); }
    else if (P.strat === 'td9') { var s9 = setupAt[i - 1]; if (s9) emit(i, s9.type === 'buy' ? 'long' : 'short', s9.type === 'buy' ? '神奇九轉 買 9' : '神奇九轉 賣 9'); }
  }
  return out;
}
function btSiteSignals(bars, P, market, a) {
  // 直接用 engine（與個股頁一致），再套用停損／目標／篩選覆寫
  var bt = a ? backtestOf(a) : null;
  var sig = bt && bt.sig && bt.bars.length === bars.length ? bt.sig : E.signalSeries(bars, market, { lookback: P.lookback });
  var atr = E.atr(bars, 14), ma200 = E.sma(bars.map(function (b) { return b.c; }), 200), ma150 = E.sma(bars.map(function (b) { return b.c; }), 150), ma50 = E.sma(bars.map(function (b) { return b.c; }), 50), v = bars.map(function (b) { return b.v; }), vol20 = E.sma(v, 20);
  return sig.map(function (s, i) {
    if (!s || s.exit) return null;
    if (P.side !== 'both' && s.side !== P.side) return null;
    if (P.kindFilter && s.key.indexOf(P.kindFilter) < 0) return null;
    if (P.trend !== 'none') { var m = P.trend === 'ma200' ? ma200[i] : P.trend === 'ma150' ? ma150[i] : ma50[i]; if (m == null || (s.side === 'long' ? bars[i].c <= m : bars[i].c >= m)) return null; }
    if (P.volF && !(vol20[i] && v[i] >= 1.5 * vol20[i])) return null;
    var o = Object.assign({}, s);
    if (P.stopMode !== 'signal') { var b = bars[i]; if (P.stopMode === 'pct') o.stop = s.side === 'long' ? b.c * (1 - P.stopPct / 100) : b.c * (1 + P.stopPct / 100); else { var aa = atr[i] || (b.h - b.l); o.stop = s.side === 'long' ? b.c - P.stopK * aa : b.c + P.stopK * aa; } o.stop = E.roundTick(o.stop, market); }
    if (P.targetMode !== 'signal') { var risk = Math.abs(o.entry - o.stop); o.target = E.roundTick(s.side === 'long' ? o.entry + P.targetR * risk : o.entry - P.targetR * risk, market); }
    return o;
  });
}
function btRunOne(code, P) {
  var meta = state.byCode[code]; if (!meta) return Promise.resolve(null);
  return analyzeCode(code, P.tf).then(function (a) {
    var bars = a.bars; if (!bars || bars.length < 100) return null;
    var sig = P.strat === 'site' ? btSiteSignals(bars, P, meta.m, P.tf === 'D' ? a : null) : btCustomSignals(bars, P, meta.m);
    var trades = E.simulateTrades(bars, sig, { maxHold: P.maxHold }).map(function (t) { t.code = code; t.name = meta.n; return t; });
    return { code: code, bars: bars, trades: trades };
  }).catch(function () { return null; });
}
function btUniverse(P) {
  if (P.univ === 'single') return [P.code].filter(function (c) { return state.byCode[c]; });
  if (P.univ === 'watch') return state.watch.filter(function (c) { return state.byCode[c]; });
  var all = state.index ? state.index.stocks.map(function (s) { return s.c; }) : [];
  if (P.univ === 'tw') all = all.filter(function (c) { return state.byCode[c].m === 'TW'; });
  if (P.univ === 'us') all = all.filter(function (c) { return state.byCode[c].m === 'US'; });
  if (P.univ === 'scan') { all = all.filter(function (c) { return state.scan[c] && (state.scan[c].side === 'long' || state.scan[c].side === 'short'); }).sort(function (a, b) { return (state.scan[b].score || 0) - (state.scan[a].score || 0); }); }
  if (all.length > 60) { var seed = 7, r = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; all = all.slice().sort(function () { return r() - 0.5; }).slice(0, 60); }
  return all;
}
function btRun(P, onProgress) {
  var codes = btUniverse(P), results = [], i = 0;
  return new Promise(function (resolve) {
    function step() { if (i >= codes.length) return resolve(results); var c = codes[i++]; onProgress && onProgress(i, codes.length, c); btRunOne(c, P).then(function (r) { if (r) results.push(r); setTimeout(step, 0); }); }
    step();
  });
}
function btSummarize(results, P) {
  var trades = [].concat.apply([], results.map(function (r) { return r.trades; })).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var all = E.tradeStats(trades), long = E.tradeStats(trades.filter(function (t) { return t.side === 'long'; })), short = E.tradeStats(trades.filter(function (t) { return t.side === 'short'; }));
  var byKey = {}; trades.forEach(function (t) { (byKey[t.key] = byKey[t.key] || []).push(t); });
  var kinds = Object.keys(byKey).map(function (k) { return { k: k, st: E.tradeStats(byKey[k]) }; }).filter(function (x) { return x.st.n > 0; }).sort(function (a, b) { return b.st.n - a.st.n; });
  var byCode = {}; trades.forEach(function (t) { (byCode[t.code] = byCode[t.code] || []).push(t); });
  var codes = Object.keys(byCode).map(function (c) { return { c: c, n: nameOf(c), st: E.tradeStats(byCode[c]) }; }).sort(function (a, b) { return b.st.totalR - a.st.totalR; });
  var reasons = { stop: 0, target: 0, time: 0, open: 0 }; trades.forEach(function (t) { reasons[t.reason] = (reasons[t.reason] || 0) + 1; });
  // 權益曲線（R 累計）
  var eq = [], cum = 0, peak = 0, dd = 0; trades.filter(function (t) { return !t.open; }).forEach(function (t) { cum += t.R; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); eq.push({ d: t.exitDate, v: Math.round(cum * 100) / 100 }); });
  // 年度
  var byYear = {}; trades.filter(function (t) { return !t.open; }).forEach(function (t) { var y = t.date.slice(0, 4); byYear[y] = byYear[y] || { n: 0, r: 0, w: 0 }; byYear[y].n++; byYear[y].r += t.R; if (t.R > 0) byYear[y].w++; });
  return { trades: trades, all: all, long: long, short: short, kinds: kinds, codes: codes, reasons: reasons, eq: eq, byYear: byYear, nCodes: results.length };
}
function btGrade(st) { if (!st.n) return { g: '—', t: '沒有交易' }; if (st.n < 20) return { g: '樣本少', t: '少於 20 筆，結論不可靠' }; if (st.expectancy >= 0.3 && st.pf >= 1.6) return { g: 'A', t: '期望值高、獲利因子佳，可實盤（先小部位）' }; if (st.expectancy > 0.1 && st.pf >= 1.25) return { g: 'B', t: '正期望值，但要靠紀律與部位控制' }; if (st.expectancy > 0) return { g: 'C', t: '微幅正期望值，交易成本後可能歸零' }; return { g: 'D', t: '負期望值，不要用這個規則' }; }
function btImprove(base, P, results) {
  // 自動變體：趨勢過濾、目標 R、停損寬度、持有期、只做多——各跑一次，比較期望值與獲利因子
  var variants = [];
  function add(label, patch) { variants.push({ label: label, P: Object.assign({}, P, patch) }); }
  if (P.trend === 'none') add('加上 MA200 趨勢過濾', { trend: 'ma200' }); else add('拿掉趨勢過濾', { trend: 'none' });
  if (P.side === 'both') { add('只做多', { side: 'long' }); add('只做空', { side: 'short' }); }
  [1.5, 2, 3].filter(function (x) { return x !== P.targetR; }).forEach(function (x) { add('目標改 ' + x + 'R', { targetR: x, targetMode: 'fixed' }); });
  if (P.stopMode === 'atr' || P.stopMode === 'signal') [1.5, 2, 3].filter(function (x) { return x !== P.stopK; }).forEach(function (x) { add('停損改 ' + x + '×ATR', { stopMode: 'atr', stopK: x }); });
  [20, 60].filter(function (x) { return x !== P.maxHold; }).forEach(function (x) { add('最長持有 ' + x + ' 根', { maxHold: x }); });
  if (!P.volF) add('加上量能過濾（≥1.5× 均量）', { volF: true });
  return Promise.all(variants.map(function (vv) {
    var res = results.map(function (r) { var meta = state.byCode[r.code]; var a = state.cache[r.code + '|' + P.tf]; var sig = P.strat === 'site' ? btSiteSignals(r.bars, vv.P, meta.m, P.tf === 'D' ? a : null) : btCustomSignals(r.bars, vv.P, meta.m); return { code: r.code, bars: r.bars, trades: E.simulateTrades(r.bars, sig, { maxHold: vv.P.maxHold }).map(function (t) { t.code = r.code; return t; }) }; });
    var s = btSummarize(res, vv.P); return { label: vv.label, st: s.all, P: vv.P };
  })).then(function (list) { return list.filter(function (x) { return x.st.n >= 5; }).map(function (x) { x.dExp = Math.round((x.st.expectancy - (base.expectancy || 0)) * 100) / 100; x.dPF = Math.round((x.st.pf - (base.pf || 0)) * 100) / 100; return x; }).sort(function (a, b) { return b.dExp - a.dExp; }); });
}
function btDrawEq(canvas, eq) {
  var dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 600, H = canvas.clientHeight || 220; canvas.width = W * dpr; canvas.height = H * dpr;
  var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  var cs = getComputedStyle(document.documentElement), ink3 = cs.getPropertyValue('--ink3').trim() || '#888', acc = cs.getPropertyValue('--accent').trim() || '#3b82f6', up = cs.getPropertyValue('--up').trim() || '#d33';
  if (!eq.length) { ctx.fillStyle = ink3; ctx.font = '12px sans-serif'; ctx.fillText('沒有已平倉交易', 10, 20); return; }
  var vals = [0].concat(eq.map(function (e) { return e.v; })), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals); if (max === min) max = min + 1;
  var pl = 40, pr = 10, pt = 10, pb = 22, x = function (i) { return pl + (W - pl - pr) * i / Math.max(1, vals.length - 1); }, y = function (v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); };
  ctx.strokeStyle = ink3; ctx.globalAlpha = .35; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pl, y(0)); ctx.lineTo(W - pr, y(0)); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; [min, 0, max].forEach(function (v) { ctx.fillText(v.toFixed(1) + 'R', pl - 4, y(v) + 4); });
  // 回撤區
  var peak = 0; ctx.fillStyle = up; ctx.globalAlpha = .12; ctx.beginPath(); ctx.moveTo(x(0), y(0)); vals.forEach(function (v, i) { peak = Math.max(peak, v); ctx.lineTo(x(i), y(peak)); }); for (var i = vals.length - 1; i >= 0; i--) ctx.lineTo(x(i), y(vals[i])); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); vals.forEach(function (v, i) { if (i) ctx.lineTo(x(i), y(v)); else ctx.moveTo(x(i), y(v)); }); ctx.stroke();
  ctx.fillStyle = ink3; ctx.textAlign = 'left'; ctx.fillText(eq[0].d, pl, H - 6); ctx.textAlign = 'right'; ctx.fillText(eq[eq.length - 1].d, W - pr, H - 6);
}
function btForm(P) {
  var sel = function (name, opts, val) { return '<select name="' + name + '">' + opts.map(function (o) { return '<option value="' + o[0] + '" ' + (String(val) === String(o[0]) ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
  var num = function (name, val, step) { return '<input type="number" step="' + (step || 'any') + '" name="' + name + '" value="' + val + '">'; };
  var kindOpts = [['', '全部訊號']].concat(['VCP', '杯柄', 'W 底', '頭肩底', '三重底', '三角形', '旗形', '箱型', '楔形', '帶量突破', '神奇九轉', '神奇十三轉', 'M 頭', '頭肩頂'].map(function (k) { return [k, k]; }));
  return '<form class="form" id="btForm">' +
    '<label class="wide">策略' + sel('strat', BT_STRATS.map(function (s) { return [s.id, s.n]; }), P.strat) + '</label>' +
    '<label>方向' + sel('side', [['both', '多空都做'], ['long', '只做多'], ['short', '只做空']], P.side) + '</label>' +
    '<label>週期' + sel('tf', [['D', '日線'], ['W', '週線']], P.tf) + '</label>' +
    '<label>範圍' + sel('univ', [['single', '單一股票'], ['watch', '自選股'], ['scan', '目前有訊號的股票（前 60）'], ['tw', '台股（隨機 60 檔）'], ['us', '美股（隨機 60 檔）'], ['all', '全部（隨機 60 檔）']], P.univ) + '</label>' +
    '<label>股票代號<input name="code" value="' + esc(P.code) + '" placeholder="單一股票時使用"></label>' +
    '<div class="full" data-strat="site" style="display:contents"><label>訊號種類' + sel('kindFilter', kindOpts, P.kindFilter || '') + '</label></div>' +
    '<div data-strat="brk" style="display:contents"><label>N 日' + num('n', P.n, 1) + '</label><label>量 ≥ k 倍均量' + num('k', P.k, 0.1) + '</label></div>' +
    '<div data-strat="ma" style="display:contents"><label>快線' + num('fast', P.fast, 1) + '</label><label>慢線' + num('slow', P.slow, 1) + '</label></div>' +
    '<div data-strat="rsi" style="display:contents"><label>RSI 門檻' + num('rsiLo', P.rsiLo, 1) + '</label></div>' +
    '<label>停損' + sel('stopMode', [['signal', '用訊號自帶停損（本站）'], ['atr', 'ATR 倍數'], ['pct', '固定 %'], ['swing', '10 根內低／高點']], P.stopMode) + '</label>' +
    '<label>ATR 倍數' + num('stopK', P.stopK, 0.5) + '</label><label>停損 %' + num('stopPct', P.stopPct, 0.5) + '</label>' +
    '<label>目標' + sel('targetMode', [['signal', '用訊號自帶目標（本站）'], ['fixed', '固定 R 倍數']], P.targetMode || 'fixed') + '</label>' +
    '<label>目標 R 倍數' + num('targetR', P.targetR, 0.5) + '</label>' +
    '<label>最長持有（根）' + num('maxHold', P.maxHold, 1) + '</label>' +
    '<label>趨勢過濾' + sel('trend', [['none', '不過濾'], ['ma50', '多：價 > MA50／空：< MA50'], ['ma150', 'MA150'], ['ma200', 'MA200']], P.trend) + '</label>' +
    '<label class="tagpick" style="align-self:end"><label><input type="checkbox" name="volF" ' + (P.volF ? 'checked' : '') + '>量能過濾 ≥ 1.5× 均量</label></label>' +
    '<div class="full btnrow"><button class="btn primary" type="submit" id="btRunBtn">開始回測</button><span class="muted" id="btProg" style="font-size:12px"></span></div></form>';
}
function btReadForm(form) {
  var fd = new FormData(form), P = btDefaults();
  ['strat', 'side', 'tf', 'univ', 'code', 'kindFilter', 'stopMode', 'targetMode', 'trend'].forEach(function (k) { if (fd.get(k) != null) P[k] = String(fd.get(k)).trim(); });
  ['n', 'k', 'fast', 'slow', 'rsiLo', 'stopK', 'stopPct', 'targetR', 'maxHold'].forEach(function (k) { var v = +fd.get(k); if (isFinite(v) && v > 0) P[k] = v; });
  P.code = P.code.toUpperCase(); P.volF = !!fd.get('volF');
  if (P.strat !== 'site') { if (P.stopMode === 'signal') P.stopMode = 'atr'; P.targetMode = 'fixed'; }
  return P;
}
function renderBacktest() {
  var body = $('#backtestBody'); body.className = '';
  var last = Store.backtest.data.last, P = Object.assign(btDefaults(), (last && last.P) || {});
  if (state.route && state.route.arg && state.byCode[state.route.arg]) P.code = state.route.arg;
  body.innerHTML = '<div class="pagehead"><div><h2>策略回測 · 分析師</h2><p>用歷史價量檢驗一條規則：勝率、期望值、獲利因子、最大回撤、權益曲線與交易清單；並自動試跑幾個變體，告訴你往哪個方向改會更好。進場一律用訊號當根收盤，停損／目標以次根起觸價（跳空以開盤價成交）。</p></div></div><div class="card">' + btForm(P) + '<div class="note">在瀏覽器裡逐根重算，本站訊號策略每檔約 1–3 秒；範圍選 60 檔時請耐心等待。</div></div><div id="btOut" class="stack" style="margin-top:14px">' + (last && last.sum ? '<div class="note">上次回測：' + esc(last.label) + '（' + esc(last.when) + '）— 期望值 ' + last.sum.expectancy + 'R · 勝率 ' + last.sum.win + '% · ' + last.sum.n + ' 筆。按「開始回測」重跑。</div>' : '') + '</div>';
  var form = $('#btForm', body);
  function syncStrat() { var s = form.strat.value; $$('[data-strat]', form).forEach(function (el) { el.style.display = el.dataset.strat === s ? 'contents' : 'none'; }); var site = s === 'site'; form.stopMode.querySelector('[value=signal]').disabled = !site; form.targetMode.querySelector('[value=signal]').disabled = !site; if (!site) { if (form.stopMode.value === 'signal') form.stopMode.value = 'atr'; form.targetMode.value = 'fixed'; } form.code.parentNode.style.display = form.univ.value === 'single' ? '' : 'none'; }
  form.strat.onchange = syncStrat; form.univ.onchange = syncStrat; syncStrat();
  form.onsubmit = function (e) {
    e.preventDefault(); var P2 = btReadForm(form), btn = $('#btRunBtn', form), prog = $('#btProg', form); btn.disabled = true;
    var out = $('#btOut', body); out.innerHTML = '<div class="card"><div class="loading" style="padding:24px">回測中…</div></div>';
    var t0 = Date.now();
    btRun(P2, function (i, n, c) { prog.textContent = '處理 ' + i + '／' + n + '：' + c; }).then(function (results) {
      var S = btSummarize(results, P2), label = BT_STRATS.find(function (s) { return s.id === P2.strat; }).n + (P2.univ === 'single' ? ' · ' + P2.code : ' · ' + (P2.univ === 'watch' ? '自選股' : P2.univ === 'scan' ? '有訊號股票' : '隨機 60 檔')) + (P2.tf === 'W' ? ' · 週線' : '');
      Store.backtest.data.last = { P: P2, label: label, when: new Date().toLocaleString('zh-TW', { hour12: false }), sum: { n: S.all.n, win: S.all.win, expectancy: S.all.expectancy, pf: S.all.pf } }; Store.backtest.save();
      btRender(out, S, P2, label, results); prog.textContent = '完成，' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒';
    }).catch(function (err) { out.innerHTML = '<div class="card"><div class="note">回測失敗：' + esc(err.message) + '</div></div>'; }).finally(function () { btn.disabled = false; });
  };
}
function btRender(out, S, P, label, results) {
  var st = S.all, g = btGrade(st), fmtR = function (x) { return x == null ? '—' : (x > 0 ? '+' : '') + x + 'R'; };
  var html = '<div class="card"><h3>' + esc(label) + '<span class="r">' + S.nCodes + ' 檔 · ' + st.n + ' 筆已平倉' + (st.open ? ' · ' + st.open + ' 筆進行中' : '') + '</span></h3>' +
    '<div class="stat"><div><div class="l">評等</div><div class="v">' + g.g + '</div><div class="s">' + esc(g.t) + '</div></div><div><div class="l">勝率</div><div class="v">' + (st.n ? st.win + '%' : '—') + '</div><div class="s">' + st.n + ' 筆</div></div><div><div class="l">期望值</div><div class="v ' + (st.expectancy > 0 ? 'up' : st.expectancy < 0 ? 'dn' : '') + '">' + (st.n ? fmtR(st.expectancy) : '—') + '</div><div class="s">每筆平均 R</div></div><div><div class="l">獲利因子</div><div class="v">' + (st.n ? (st.pf >= 99 ? '∞' : st.pf) : '—') + '</div><div class="s">總獲利 ÷ 總虧損</div></div><div><div class="l">最大回撤</div><div class="v dn">' + (st.n ? st.maxDD + 'R' : '—') + '</div><div class="s">最大連虧 ' + (st.n ? st.maxConsLoss : '—') + ' 筆</div></div><div><div class="l">均賺 / 均賠</div><div class="v">' + (st.n ? st.avgWin + ' / ' + st.avgLoss : '—') + '</div><div class="s">R</div></div><div><div class="l">累計</div><div class="v ' + (st.totalR > 0 ? 'up' : 'dn') + '">' + (st.n ? fmtR(st.totalR) : '—') + '</div><div class="s">平均報酬 ' + (st.n ? fmt.pct(st.avgPct) : '—') + '</div></div><div><div class="l">平均持有</div><div class="v">' + (st.n ? st.avgHold : '—') + '</div><div class="s">根 · 出場：停損 ' + S.reasons.stop + '／目標 ' + S.reasons.target + '／時間 ' + S.reasons.time + '</div></div></div>' +
    '<canvas class="eq" id="btEq" style="margin-top:12px"></canvas><div class="note">權益曲線以 R 累計（每筆風險 = 1R），紅色區為回撤。</div></div>';
  html += '<div class="two-eq"><div class="stack">';
  html += '<div class="card"><h3>多空與訊號種類</h3><div class="tablewrap" style="border:0"><table class="trbl" style="min-width:0"><thead><tr><th>分組</th><th class="num">筆</th><th class="num">勝率</th><th class="num">期望值</th><th class="num">獲利因子</th><th class="num">最大回撤</th></tr></thead><tbody>' + [['多單', S.long], ['空單', S.short]].filter(function (x) { return x[1].n; }).map(function (x) { return '<tr><td><b>' + x[0] + '</b></td><td class="num">' + x[1].n + '</td><td class="num">' + x[1].win + '%</td><td class="num ' + (x[1].expectancy > 0 ? 'up' : 'dn') + '">' + fmtR(x[1].expectancy) + '</td><td class="num">' + (x[1].pf >= 99 ? '∞' : x[1].pf) + '</td><td class="num">' + x[1].maxDD + 'R</td></tr>'; }).join('') + S.kinds.map(function (k) { return '<tr><td>' + esc(k.k) + '</td><td class="num">' + k.st.n + '</td><td class="num">' + k.st.win + '%</td><td class="num ' + (k.st.expectancy > 0 ? 'up' : 'dn') + '">' + fmtR(k.st.expectancy) + '</td><td class="num">' + (k.st.pf >= 99 ? '∞' : k.st.pf) + '</td><td class="num">' + k.st.maxDD + 'R</td></tr>'; }).join('') + '</tbody></table></div></div>';
  var years = Object.keys(S.byYear).sort();
  if (years.length > 1) html += '<div class="card"><h3>逐年</h3><div class="tablewrap" style="border:0"><table class="trbl" style="min-width:0"><thead><tr><th>年</th><th class="num">筆</th><th class="num">勝率</th><th class="num">累計 R</th></tr></thead><tbody>' + years.map(function (y) { var x = S.byYear[y]; return '<tr><td>' + y + '</td><td class="num">' + x.n + '</td><td class="num">' + Math.round(x.w / x.n * 100) + '%</td><td class="num ' + (x.r > 0 ? 'up' : 'dn') + '">' + fmtR(Math.round(x.r * 100) / 100) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="note">好策略應該多數年份為正；只靠一年賺的規則不可靠。</div></div>';
  if (S.codes.length > 1) html += '<div class="card"><h3>各股表現<span class="r">依累計 R</span></h3><div class="tablewrap" style="border:0"><table class="trbl" style="min-width:0"><thead><tr><th>股票</th><th class="num">筆</th><th class="num">勝率</th><th class="num">期望值</th><th class="num">累計</th></tr></thead><tbody>' + S.codes.slice(0, 15).map(function (c) { return '<tr><td><a href="#/stock/' + esc(c.c) + '">' + esc(c.c) + ' ' + esc(c.n) + '</a></td><td class="num">' + c.st.n + '</td><td class="num">' + c.st.win + '%</td><td class="num">' + fmtR(c.st.expectancy) + '</td><td class="num ' + (c.st.totalR > 0 ? 'up' : 'dn') + '">' + fmtR(c.st.totalR) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  html += '</div><div class="stack">';
  html += '<div class="card" id="btImp"><h3>改進方向<span class="r">自動試跑變體</span></h3><div class="loading" style="padding:16px">試跑變體中…</div></div>';
  html += '<div class="card"><h3>請 Claude 解讀</h3><div class="btnrow" style="margin:0"><button class="btn primary" id="btAsk">分析這個策略的優缺點與改進</button></div><div id="btAI" class="aiout" hidden></div></div>';
  html += '</div></div><div class="card" style="margin-top:14px"><h3>交易清單<span class="r">最近 40 筆</span></h3><div class="tablewrap" style="border:0"><table class="trbl" style="min-width:560px"><thead><tr><th>進場日</th><th>股票</th><th>訊號</th><th class="num">進場</th><th class="num">停損</th><th class="num">出場</th><th>原因</th><th class="num">R</th></tr></thead><tbody>' + S.trades.slice(-40).reverse().map(function (t) { return '<tr><td class="num">' + esc(t.date) + '</td><td><a href="#/stock/' + esc(t.code) + '">' + esc(t.code) + '</a></td><td><span class="pill ' + (t.side === 'long' ? 'long' : 'short') + '">' + (t.side === 'long' ? '多' : '空') + '</span> ' + esc(t.kind) + '</td><td class="num">' + fmt.p(t.entry) + '</td><td class="num">' + fmt.p(t.stop) + '</td><td class="num">' + fmt.p(t.exitPx) + ' <span class="muted">' + esc(t.exitDate.slice(5)) + '</span></td><td>' + (t.open ? '進行中' : t.reason === 'target' ? '<span class="pill long">目標</span>' : t.reason === 'stop' ? '<span class="pill short">停損</span>' : '時間') + '</td><td class="num ' + (t.R > 0 ? 'up' : t.R < 0 ? 'dn' : '') + '">' + fmtR(t.R) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  html += '<div class="note">回測未含手續費、稅與滑價（台股來回約 0.6%），實際期望值會比這裡低；樣本少於 20 筆的結論不可靠。</div>';
  out.innerHTML = html;
  btDrawEq($('#btEq', out), S.eq);
  btImprove(st, P, results).then(function (list) {
    var el = $('#btImp', out); if (!el) return;
    var better = list.filter(function (x) { return x.dExp > 0.05; }), worse = list.filter(function (x) { return x.dExp < -0.05; });
    el.innerHTML = '<h3>改進方向<span class="r">自動試跑 ' + list.length + ' 個變體</span></h3>' + (list.length ? '<div class="tablewrap" style="border:0"><table class="trbl" style="min-width:0"><thead><tr><th>變體</th><th class="num">筆</th><th class="num">勝率</th><th class="num">期望值</th><th class="num">Δ</th><th class="num">獲利因子</th></tr></thead><tbody>' + list.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td class="num">' + x.st.n + '</td><td class="num">' + x.st.win + '%</td><td class="num">' + fmtR(x.st.expectancy) + '</td><td class="num ' + (x.dExp > 0 ? 'up' : x.dExp < 0 ? 'dn' : '') + '">' + (x.dExp > 0 ? '+' : '') + x.dExp + '</td><td class="num">' + (x.st.pf >= 99 ? '∞' : x.st.pf) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="note" style="margin:0">交易太少，無法比較變體。</div>') +
      (better.length ? '<div class="rule"><b>建議：' + esc(better[0].label) + '</b><span class="muted" style="font-size:12px">期望值 ' + fmtR(st.expectancy) + ' → ' + fmtR(better[0].st.expectancy) + (better[1] ? '；其次 ' + esc(better[1].label) : '') + '</span></div>' : (list.length ? '<div class="rule"><b>目前參數已接近最佳</b><span class="muted" style="font-size:12px">變體都沒有明顯提升；' + (worse.length ? '注意 ' + esc(worse[0].label) + ' 會明顯變差。' : '') + '</span></div>' : ''));
  });
  $('#btAsk', out).onclick = function () { var prompt = '你是量化交易分析師。以下是一個交易策略的回測結果（JSON）。請用繁體中文回答：1) 這個策略的優點與弱點；2) 期望值、獲利因子、最大回撤、出場原因分布透露了什麼（例如停損太緊、目標太遠）；3) 給三個具體的改進方向，並說明為什麼；4) 這個策略適合什麼市況、不適合什麼市況。直接、具體、不超過 450 字。\n\n' + JSON.stringify({ 策略: label, 參數: P, 總計: st, 多: S.long, 空: S.short, 訊號種類: S.kinds.slice(0, 8).map(function (k) { return { k: k.k, n: k.st.n, win: k.st.win, exp: k.st.expectancy, pf: k.st.pf }; }), 出場原因: S.reasons, 逐年: S.byYear }); askClaude(this, $('#btAI', out), prompt); };
}
