/* ===== 型態雷達 UI：分析卡片、K 線圖（可重用於個股總覽） ===== */
var RU = {};
RU.stateLabel = function (st, bias) {
  if (st === 'confirmed_vol') return '<span class="pill ' + (bias === 'bear' ? 'short' : 'long') + '">帶量' + (bias === 'bear' ? '跌破' : '突破') + '確認</span>';
  if (st === 'confirmed') return '<span class="pill warnp">' + (bias === 'bear' ? '跌破' : '突破') + '（量不足）</span>';
  if (st === 'after') return '<span class="pill">已' + (bias === 'bear' ? '跌破' : '突破') + '</span>';
  return '<span class="pill">形成中</span>';
};
RU.quote = function (code, a, m, tf, extraTags) {
  var L = a.last, upc = L.change >= 0 ? 'up' : 'dn';
  return '<div class="quote stockhead">' + starBtn(code) + '<span class="name">' + esc(m.n) + '<span class="code">' + esc(code) + ' · ' + (m.m === 'TW' ? '台股' : '美股') + (tf === 'W' ? ' · 週線' : ' · 日線') + '</span></span>' +
    '<span class="px ' + upc + '">' + fmt.p(L.close) + '</span><span class="chg ' + upc + '">' + (L.change >= 0 ? '+' : '') + fmt.p(L.change) + ' (' + fmt.pct(L.changePct) + ')</span>' +
    '<span class="ohlc"><span>開 <b>' + fmt.p(L.open) + '</b></span><span>高 <b>' + fmt.p(L.high) + '</b></span><span>低 <b>' + fmt.p(L.low) + '</b></span><span>量 <b>' + fmt.vol(L.volume, m.m) + '</b> <span class="num">' + a.volume.rel20 + 'x</span></span><span>' + esc(L.date) + '</span></span>' + (extraTags || '') + '</div>';
};
RU.chartCard = function (a, tf, range, idSuffix) {
  var s = idSuffix || '';
  return '<div class="card"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3 style="margin:0">K 線 · 形態標註</h3><div class="range" id="rangeBtns' + s + '">' + [60, 120, 250, 9999].map(function (n) { return '<button data-n="' + n + '" aria-pressed="' + (range === n) + '">' + (n === 60 ? (tf === 'W' ? '60週' : '3月') : n === 120 ? (tf === 'W' ? '120週' : '6月') : n === 250 ? (tf === 'W' ? '250週' : '1年') : '全部') + '</button>'; }).join('') + '</div></div>' +
    '<div class="chartbox"><canvas id="chart' + s + '" height="420"></canvas><div id="tip' + s + '" class="tip" hidden></div></div>' +
    '<div class="legend"><span><i style="background:var(--ma20)"></i>' + (tf === 'W' ? 'MA10' : 'MA20') + '</span><span><i style="background:var(--ma60)"></i>' + (tf === 'W' ? 'MA30' : 'MA60') + '</span><span><i style="background:var(--ma200)"></i>' + (tf === 'W' ? 'MA52' : 'MA200') + '</span><span><i style="background:var(--ink3);height:0;border-top:2px dashed var(--ink3)"></i>樞軸／頸線</span><span><i style="background:var(--dn)"></i>停損</span><span><i style="background:var(--accent)"></i>進場</span><span><i style="background:var(--up)"></i>目標</span><span><b style="color:var(--up)">▲</b> 進場／試單訊號　<b style="color:var(--dn)">▼</b> 出場／放空訊號（依該日收盤回算）　9 = 九轉結構完成　形態：只在突破／跌破確認後上圖（實心點＝關鍵轉折、虛線＝頸線／趨勢線、底色＝形態區間），形成中的形態見下方卡片</span></div></div>';
};
RU.bindChart = function (root, a, m, tf, idSuffix, getRange, setRange) {
  var s = idSuffix || '', btns = $('#rangeBtns' + s, root);
  function draw() { RU.drawChart($('#chart' + s, root), $('#tip' + s, root), a, m, { tf: tf, range: getRange() }); }
  if (btns) btns.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setRange(+b.dataset.n); $$('button', btns).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); draw(); });
  draw();
  return draw;
};
RU.summaryCard = function (a) { return '<div class="card"><h3>總結<span class="r">' + esc(a.last.date) + ' 收盤</span></h3><ul class="summary">' + a.summary.map(function (s) { var i = s.indexOf('：'); return '<li><b>' + esc(s.slice(0, i)) + '</b>' + esc(s.slice(i + 1)) + '</li>'; }).join('') + '</ul></div>'; };
RU.verdict = function (a, m, opts) {
  opts = opts || {};
  var p = a.plan.primary, sideCls = p.side === 'long' ? 'long' : p.side === 'short' ? 'short' : 'neutral';
  var sideTxt = p.side === 'long' ? '偏多' : p.side === 'short' ? '偏空' : '中性';
  var alts = a.plan.plans.slice(1, 4);
  var warnIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';
  return '<div class="card"><h3>結論與交易計畫<span class="r">信心 ' + a.plan.confidence + '/100</span></h3>' +
    '<div class="verdict"><div class="badge ' + sideCls + '">' + sideTxt + '<small>' + esc(p.action) + '</small></div><div><div class="kind">' + esc(p.kind) + '</div><div class="action">' + esc(p.why[0] || '') + '</div></div></div>' +
    RU.planGrid(a) +
    '<div class="how"><b>怎麼做：</b>' + esc(p.how) + '</div>' +
    (p.why.length > 1 ? '<ul class="why">' + p.why.slice(1).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
    a.plan.warnings.map(function (w) { return '<div class="warn">' + warnIcon + '<span>' + esc(w) + '</span></div>'; }).join('') +
    (alts.length ? '<div class="alt"><div style="font-size:12px;color:var(--ink3);margin-bottom:4px">其他訊號</div>' + alts.map(function (q) { return '<div class="row"><span class="pill ' + (q.side === 'long' ? 'long' : q.side === 'short' ? 'short' : '') + '">' + (q.side === 'long' ? '多' : q.side === 'short' ? '空' : '中性') + '</span><span class="kind">' + esc(q.kind) + '</span><span style="color:var(--ink3)">' + esc(q.action) + '</span>' + (q.entry ? '<span class="num" style="color:var(--ink2);font-size:12px">進 ' + fmt.p(q.entry) + ' / 損 ' + fmt.p(q.stop) + (q.target ? ' / 標 ' + fmt.p(q.target) : '') + '</span>' : '') + '</div>'; }).join('') + '</div>' : '') +
    (opts.noSizing ? '' : RU.sizing(a, m)) + '</div>';
};
RU.expTile = function (a) {
  var p = a.plan.primary, key = E.signalKindKey(p), ex = expectFor(a, key);
  if (!ex || !ex.st || !ex.st.n) return '<div><div class="l">期望值</div><div class="v" style="color:var(--ink3)">—</div><div class="s">尚無同類訊號歷史</div></div>';
  var st = ex.st, cls = st.expectancy > 0.3 ? 'up' : st.expectancy < 0 ? 'dn' : '';
  return '<div title="' + esc(ex.label) + '：' + st.n + ' 筆，勝率 ' + st.win + '%，平均獲利 ' + st.avgWin + 'R／平均虧損 ' + st.avgLoss + 'R"><div class="l">期望值（' + esc(ex.label) + '）</div><div class="v ' + cls + '">' + (st.expectancy > 0 ? '+' : '') + st.expectancy + ' R</div><div class="s">勝率 ' + st.win + '% · ' + st.n + ' 筆' + (p.riskPct ? ' · ≈' + (st.expectancy * p.riskPct > 0 ? '+' : '') + (st.expectancy * p.riskPct).toFixed(1) + '%/筆' : '') + '</div></div>';
};
RU.planGrid = function (a) {
  var p = a.plan.primary;
  return '<div class="plan five"><div><div class="l">進場價</div><div class="v">' + fmt.p(p.entry) + '</div><div class="s">' + (p.entry ? fmt.pct((p.entry - a.last.close) / a.last.close * 100) + ' vs 現價' : '') + '</div></div>' +
    '<div><div class="l">停損價</div><div class="v dn">' + fmt.p(p.stop) + '</div><div class="s">' + (p.riskPct != null ? '風險 ' + p.riskPct + '%' : '') + '</div></div>' +
    '<div><div class="l">目標價</div><div class="v up">' + fmt.p(p.target) + '</div><div class="s">' + (p.target && p.entry ? fmt.pct((p.target - p.entry) / p.entry * 100) : '') + (p.target2 ? ' · 2nd ' + fmt.p(p.target2) : '') + '</div></div>' +
    '<div><div class="l">風險報酬比</div><div class="v">' + (p.rr != null ? '1 : ' + p.rr : '—') + '</div><div class="s">' + (p.rr != null ? (p.rr >= 2 ? '良好（≥2）' : p.rr >= 1.5 ? '可接受' : '偏低（<1.5）') : '') + '</div></div>' + RU.expTile(a) + '</div>';
};
// ---------- 訊號歷史績效卡 ----------
RU.perfCard = function (a, meta) {
  var bt = backtestOf(a), p = a.plan.primary, key0 = E.signalKindKey(p), ex = expectFor(a, key0), S = state.stats, key = ex && ex.key ? ex.key : key0;
  var fmtR = function (x) { return x == null ? '—' : (x > 0 ? '+' : '') + x + 'R'; };
  var row = function (label, st) { if (!st || !st.n) return ''; return '<tr><td>' + esc(label) + '</td><td class="num">' + st.n + '</td><td class="num">' + st.win + '%</td><td class="num ' + (st.expectancy > 0 ? 'up' : st.expectancy < 0 ? 'dn' : '') + '">' + fmtR(st.expectancy) + '</td><td class="num">' + fmtR(st.avgWin) + ' / ' + fmtR(st.avgLoss) + '</td><td class="num">' + (st.pf >= 99 ? '∞' : st.pf) + '</td><td class="num">' + st.maxConsLoss + '</td><td class="num">' + st.avgHold + '</td></tr>'; };
  var html = '<div class="card"><h3>訊號歷史績效<span class="r">同一套規則逐日回算 · 訊號日收盤進場</span></h3>';
  html += '<div class="tablewrap" style="border:0"><table class="perf" style="min-width:560px"><thead><tr><th>範圍</th><th class="num">筆數</th><th class="num">勝率</th><th class="num">期望值</th><th class="num">均賺 / 均賠</th><th class="num">獲利因子</th><th class="num">最大連虧</th><th class="num">均持有(根)</th></tr></thead><tbody>';
  html += row('本股 · 目前訊號「' + key + '」', bt.kinds[key]);
  if (S && S.kindsM && S.kindsM[meta.m + '|' + key]) html += row((meta.m === 'TW' ? '台股' : '美股') + '全部 · 「' + key + '」', S.kindsM[meta.m + '|' + key]);
  html += row('本股 · 所有多方訊號', bt.long) + row('本股 · 所有空方訊號', bt.short);
  if (S && S.all) html += row('全市場 · 所有訊號（' + S.stocks + ' 檔）', S.all);
  html += '</tbody></table></div>';
  var recent = bt.trades.slice(-8).reverse();
  if (recent.length) {
    html += '<div style="font-size:12px;color:var(--ink3);margin:10px 0 4px">本股最近 ' + recent.length + ' 筆訊號交易</div><div class="tablewrap" style="border:0"><table class="perf" style="min-width:560px"><thead><tr><th>訊號日</th><th>訊號</th><th class="num">進場</th><th class="num">停損</th><th class="num">出場</th><th>結果</th><th class="num">R</th><th class="num">報酬</th><th class="num">持有</th></tr></thead><tbody>';
    html += recent.map(function (t) { var res = t.open ? '<span class="pill">持有中</span>' : t.reason === 'target' ? '<span class="pill long">達目標</span>' : t.reason === 'stop' ? '<span class="pill short">停損</span>' : '<span class="pill">時間出場</span>'; return '<tr><td class="num">' + esc(t.date) + '</td><td><span class="pill ' + (t.side === 'long' ? 'long' : 'short') + '">' + (t.side === 'long' ? '多' : '空') + '</span> ' + esc(t.kind) + '</td><td class="num">' + fmt.p(t.entry) + '</td><td class="num">' + fmt.p(t.stop) + '</td><td class="num">' + fmt.p(t.exitPx) + '<span style="color:var(--ink3);font-size:11px"> ' + esc(t.exitDate.slice(5)) + '</span></td><td>' + res + '</td><td class="num ' + (t.R > 0 ? 'up' : t.R < 0 ? 'dn' : '') + '">' + fmtR(t.R) + '</td><td class="num ' + (t.pct > 0 ? 'up' : t.pct < 0 ? 'dn' : '') + '">' + fmt.pct(t.pct) + '</td><td class="num">' + t.hold + '</td></tr>'; }).join('');
    html += '</tbody></table></div>';
  } else html += '<div class="note" style="margin:0">本股近期沒有可回測的進場訊號。</div>';
  html += '<div class="note">期望值 = 勝率 × 平均獲利 R − 敗率 × 平均虧損 R（1R = 進場到停損的距離）。規則：訊號日收盤進場、停損／目標觸價出場（跳空以開盤價成交）、最多持有 40 根；未計手續費、稅與滑價。期望值 &gt; 0.3R 且樣本 ≥ 10 筆才算有優勢，樣本少於 5 筆只能參考。' + (S && S.n ? ' 全市場統計涵蓋 ' + S.stocks + ' 檔、' + S.n + ' 筆。' : ' 全市場統計會在價量資料更新後自動擴大樣本。') + '</div></div>';
  return html;
};
RU.sizing = function (a, m) {
  var p = a.plan.primary; if (!p.entry || !p.stop) return '';
  var cap = 1000000, risk = 1; try { cap = +localStorage.getItem('radar.cap') || cap; risk = +localStorage.getItem('radar.risk') || risk; } catch (e) { }
  return '<div class="alt"><div style="font-size:12px;color:var(--ink3);margin-bottom:6px">部位計算（風險固定法）</div><div class="size"><label>總資金<input class="cap" type="number" value="' + cap + '" min="0" step="10000"></label><label>單筆風險 %<input class="risk" type="number" value="' + risk + '" min="0.1" max="10" step="0.1"></label><div class="out sizeOut"></div></div></div>';
};
RU.bindSizing = function (root, a, m) {
  var cap = $('.cap', root), risk = $('.risk', root), out = $('.sizeOut', root); if (!cap) return;
  function calc() {
    var p = a.plan.primary, C = +cap.value || 0, R = (+risk.value || 0) / 100, perUnit = Math.abs(p.entry - p.stop); if (!perUnit) return;
    var units = Math.floor(C * R / perUnit), txt;
    if (m.m === 'TW') { var lots = Math.floor(units / 1000); txt = '<span>可買 <b>' + lots + '</b> 張' + (lots === 0 ? '（零股 ' + units + ' 股）' : '（' + units.toLocaleString() + ' 股）') + '</span><span>投入約 <b>' + Math.round(units * p.entry).toLocaleString() + '</b></span><span>最大虧損 <b>' + Math.round(units * perUnit).toLocaleString() + '</b></span>'; }
    else txt = '<span>可買 <b>' + units.toLocaleString() + '</b> 股</span><span>投入約 <b>' + Math.round(units * p.entry).toLocaleString() + '</b></span><span>最大虧損 <b>' + Math.round(units * perUnit).toLocaleString() + '</b></span>';
    out.innerHTML = txt; try { localStorage.setItem('radar.cap', cap.value); localStorage.setItem('radar.risk', risk.value); } catch (e) { }
  }
  cap.addEventListener('input', calc); risk.addEventListener('input', calc); calc();
};
RU.patterns = function (a) {
  var pats = a.patterns;
  return '<div class="card"><h3>標準形態學<span class="r">' + (pats.length ? pats.length + ' 個形態' : '') + '</span></h3>' +
    (pats.length ? pats.map(function (p) { return '<div class="pat"><div class="h"><span class="pill ' + (p.bias === 'bull' ? 'long' : p.bias === 'bear' ? 'short' : '') + '">' + (p.bias === 'bull' ? '多' : p.bias === 'bear' ? '空' : '中性') + '</span>' + esc(p.name) + RU.stateLabel(p.state, p.bias) + '</div><p>' + esc(p.desc) + '</p><div class="lv"><span>' + esc(p.keyName) + ' <b>' + fmt.p(p.keyLevel) + '</b></span><span>進場 <b>' + fmt.p(p.entry) + '</b></span><span>停損 <b class="dn">' + fmt.p(p.stop) + '</b></span><span>目標 <b class="up">' + fmt.p(p.target) + '</b></span></div></div>'; }).join('') : '<div class="note" style="margin:0">近期未偵測到 W 底／M 頭／頭肩／三重頂底／三角形／楔形／旗形／箱型／杯柄等標準形態。</div>') + '</div>';
};
RU.vcp = function (a) {
  var v = a.vcp, cls = v.status === 'breakout' ? 'long' : v.status === 'at_pivot' ? 'warnp' : v.status === 'failed' ? 'short' : '';
  var stTxt = { breakout: '帶量突破', breakout_lowvol: '突破（量不足）', extended_ok: '突破後可買', extended: '已延伸', at_pivot: '收縮到位', forming: '形成中', failed: '結構破壞', invalid: '不成立', none: '無' }[v.status] || v.status;
  var html = '<div class="card"><h3>VCP 波動收縮<span class="r"><span class="pill ' + cls + '">' + stTxt + '</span></span></h3><p style="margin:0 0 8px;font-size:13px">' + esc(v.statusText) + '</p>';
  if (v.contractions && v.contractions.length) html += '<div class="kv"><dt>收縮序列</dt><dd>' + esc(v.pattern || v.contractions.map(function (c) { return Math.round(c.depth); }).join('-') + 'T') + '</dd>' + v.contractions.map(function (c, i) { return '<dt>第 ' + (i + 1) + ' 次</dt><dd>' + fmt.p(c.hi) + ' → ' + fmt.p(c.lo) + '　−' + c.depth + '%　' + c.bars + ' 根</dd>'; }).join('') + (v.pivot ? '<dt>樞軸點</dt><dd>' + fmt.p(v.pivot) + '（突破買點 ' + fmt.p(v.entry) + '）</dd><dt>停損</dt><dd class="dn">' + fmt.p(v.stop) + '</dd>' : '') + (v.volDry != null ? '<dt>量縮比</dt><dd>' + v.volDry + '（最後收縮均量 ÷ 50 日均量，<0.7 佳）</dd>' : '') + (v.trendOk != null ? '<dt>趨勢條件</dt><dd>' + (v.trendOk ? '符合（50MA 上方）' : '未符合') + '</dd>' : '') + '</div>';
  return html + '</div>';
};
RU.position = function (a) {
  var p = a.position, tt = p.trendTemplate;
  var lvCls = p.level.indexOf('高') >= 0 || p.level.indexOf('過熱') >= 0 ? 'hot' : p.level.indexOf('低') >= 0 ? 'ok' : '';
  return '<div class="card"><h3>高低檔判斷<span class="r"><span class="pill ' + lvCls + '">' + esc(p.level) + '</span></span></h3>' +
    '<div class="gauge"><i style="left:' + Math.max(0, Math.min(100, p.pos52)) + '%"></i></div><div class="gl"><span>52週低 ' + fmt.p(p.lo52) + '</span><span>' + p.pos52 + '%</span><span>52週高 ' + fmt.p(p.hi52) + '</span></div>' +
    '<div class="kv" style="margin-top:10px"><dt>階段</dt><dd style="font-family:var(--sans)">' + esc(p.stage) + '<div style="color:var(--ink3);font-size:12px">' + esc(p.stageDesc) + '</div></dd><dt>距高／低</dt><dd>' + fmt.pct(p.offHigh) + '　/　' + fmt.pct(p.aboveLow) + '</dd><dt>乖離</dt><dd>MA20 ' + fmt.pct(p.bias20) + '　MA60 ' + fmt.pct(p.bias60) + '</dd><dt>RSI(14)</dt><dd>' + (p.rsi == null ? '—' : p.rsi) + '</dd></div>' +
    (tt.total ? '<div style="font-size:12px;color:var(--ink3);margin-top:10px">Minervini 趨勢模板 ' + tt.pass + '/' + tt.total + '</div><div class="tt">' + tt.items.map(function (it) { return '<span class="' + (it.ok ? '' : 'no') + '">' + esc(it.name) + '</span>'; }).join('') + '</div>' : '') +
    (p.notes.length ? '<div class="tags">' + p.notes.map(function (n) { return '<span class="pill">' + esc(n) + '</span>'; }).join('') + '</div>' : '') + '</div>';
};
RU.td = function (a, compact) {
  var td = a.td, cur = td.current, typ = cur < 0 ? 'buy' : 'sell', n = Math.min(Math.abs(cur), 9);
  var cells = ''; for (var i = 1; i <= 9; i++) cells += '<b class="' + typ + (i <= n ? ' on' : '') + '">' + i + '</b>';
  var act = td.active, r13 = td.recentCountdown, l13 = td.lastCountdown;
  var cdTyp = act ? act.type : (r13 ? r13.type : 'buy'), cdN = act ? act.count : (r13 ? 13 : 0);
  var cdCells = ''; for (var j = 1; j <= 13; j++) cdCells += '<b class="' + cdTyp + (j <= cdN ? ' on' : '') + (j === 13 ? ' big' : '') + '">' + j + '</b>';
  if (act && act.deferred) cdCells += '<b class="' + cdTyp + ' on" title="第 13 根遞延">+</b>';
  var ls = td.lastSetup;
  var headTag = r13 ? ((r13.type === 'buy' ? '買' : '賣') + ' 13 完成') : act ? ((act.type === 'buy' ? '買' : '賣') + '倒數 ' + act.count + '/13') : (cur ? (cur < 0 ? '下跌結構' : '上漲結構') : '—');
  return '<div class="card"><h3>神奇九轉 · 十三轉<span class="r"><span class="pill ' + (r13 ? (r13.type === 'buy' ? 'ok' : 'hot') : act && act.count >= 10 ? 'warnp' : '') + '">' + headTag + '</span></span></h3>' +
    '<div style="font-size:11px;color:var(--ink3)">結構 Setup（連續 9 根）</div><div class="tdrow">' + cells + (Math.abs(cur) > 9 ? '<b class="' + typ + ' on" title="結構完成後延續">+' + (Math.abs(cur) - 9) + '</b>' : '') + '</div>' +
    '<div style="font-size:11px;color:var(--ink3);margin-top:8px">倒數 Countdown（不連續，數到 13）' + (act ? '　自 ' + esc(act.startDate) + ' 起' : r13 ? '　完成於 ' + esc(r13.date) : '') + '</div><div class="tdrow">' + cdCells + '</div>' +
    '<p style="margin:8px 0 0;font-size:13px">' + esc(td.status) + '</p>' +
    '<div class="kv" style="margin-top:8px">' + (ls ? '<dt>最近 9</dt><dd style="font-family:var(--sans)">' + (ls.type === 'buy' ? '買進' : '賣出') + '結構 ' + esc(ls.date) + (ls.perfected ? '（完美）' : '（未完美）') + '</dd><dt>TDST</dt><dd>' + fmt.p(ls.tdst) + '（' + (ls.type === 'buy' ? '反彈壓力／倒數取消線' : '回檔支撐／倒數取消線') + '）</dd>' : '') +
    (l13 ? '<dt>最近 13</dt><dd style="font-family:var(--sans)">' + (l13.type === 'buy' ? '買進' : '賣出') + '倒數 ' + esc(l13.date) + (l13.deferred ? '（遞延 ' + l13.deferred + ' 次）' : '') + '，區間 ' + fmt.p(l13.low) + ' ~ ' + fmt.p(l13.high) + '</dd>' : '') + '</div>' +
    (compact ? '' : '<div class="note"><b>9（結構）</b>：連續 9 根收盤 &lt;（買）／&gt;（賣）4 根前收盤 → 短線動能鈍化；第 8 或 9 根低（高）點超過第 6、7 根 = 完美結構。<br><b>13（倒數）</b>：9 完成後開始，計算「收盤 ≤ 2 根前低點」（買）／「收盤 ≥ 2 根前高點」（賣）的 K 棒，可不連續，數到 13 且第 13 根低點 ≤ 第 8 根收盤（否則遞延 +）→ 趨勢竭盡，反轉訊號強於 9。取消：反向 9、或收盤穿越 TDST；同向新 9 則重新倒數。操作：買 13 等價格翻轉再進、停損倒數最低點；賣 13 先減碼、翻轉即出。</div>') + '</div>';
};
RU.volume = function (a, m) {
  var v = a.volume;
  return '<div class="card"><h3>量能判讀<span class="r"><span class="pill ' + (v.volBreakout ? 'long' : v.climax || v.volBreakdown ? 'short' : '') + '">' + esc(v.verdict) + '</span></span></h3>' +
    '<div class="kv"><dt>今日量</dt><dd>' + fmt.vol(a.last.volume, m.m) + '　' + v.rel20 + 'x（20日）　' + v.rel50 + 'x（50日）</dd><dt>收盤位置</dt><dd>當日區間 ' + Math.round(v.closePos * 100) + '%</dd><dt>量縮比</dt><dd>' + v.dryUp + '（5日／50日均量）</dd><dt>買賣量比</dt><dd>' + v.udRatio + '（20日上漲量／下跌量）</dd></div>' +
    (v.tags.length ? '<div class="tags">' + v.tags.map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join('') + '</div>' : '') + '</div>';
};
RU.levels = function (a) {
  var lv = a.levels;
  return '<div class="card"><h3>支撐 / 壓力</h3><div class="sr"><div><div style="color:var(--ink3);border:0">壓力（由近到遠）</div>' + (lv.resistance.length ? lv.resistance.map(function (x) { return '<div><span>' + esc(x.name) + '</span><span class="num up">' + fmt.p(x.p) + '</span></div>'; }).join('') : '<div><span>—</span></div>') + '</div><div><div style="color:var(--ink3);border:0">支撐（由近到遠）</div>' + (lv.support.length ? lv.support.map(function (x) { return '<div><span>' + esc(x.name) + '</span><span class="num dn">' + fmt.p(x.p) + '</span></div>'; }).join('') : '<div><span>—</span></div>') + '</div></div></div>';
};


// ---------- K 線圖 ----------
RU.drawChart = function (cv, tipEl, a, meta, opts) {
  if (!cv) return;
  var bars = a.bars, ind = a.ind, m = meta.m, tf = opts.tf || 'D', range = opts.range || 120;
  var css = getComputedStyle(document.documentElement); function tok(n) { return css.getPropertyValue(n).trim(); }
  var W = cv.clientWidth || 800, H = 420, dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  var N = Math.min(range, bars.length), s0 = bars.length - N, view = bars.slice(s0);
  var padL = 8, padR = 74, padT = 12, volH = 70, gap = 14, priceH = H - padT - volH - gap - 22, plotW = W - padL - padR;
  var cw = plotW / N, bw = Math.max(1, Math.min(14, cw * 0.65));
  var hi = -Infinity, lo = Infinity;
  view.forEach(function (b) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); });
  var p = a.plan.primary; [p.entry, p.stop, p.target].forEach(function (x) { if (x && x > lo * 0.8 && x < hi * 1.2) { hi = Math.max(hi, x); lo = Math.min(lo, x); } });
  var pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
  var vmax = 0; view.forEach(function (b) { vmax = Math.max(vmax, b.v); });
  function X(i) { return padL + (i - s0) * cw + cw / 2; }
  function Y(pr) { return padT + (hi - pr) / (hi - lo) * priceH; }
  function YV(v) { return padT + priceH + gap + volH - (vmax ? v / vmax * volH : 0); }
  ctx.strokeStyle = tok('--grid'); ctx.lineWidth = 1; ctx.fillStyle = tok('--ink3'); ctx.font = '11px ' + tok('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  var steps = 6, raw = (hi - lo) / steps, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(function (k) { return k * mag; }).filter(function (k) { return k >= raw; })[0] || mag;
  for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) { var y = Y(g); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(fmt.p(g), W - padR + 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; var lastMon = '';
  view.forEach(function (b, i) { var mon = b.d.slice(0, 7); if (mon !== lastMon) { lastMon = mon; if (i > 0 || N < 80) { var x = X(s0 + i); ctx.strokeStyle = tok('--grid'); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + priceH + gap + volH); ctx.stroke(); if (N <= 130 || parseInt(mon.slice(5)) % 3 === 1) ctx.fillText(tf === 'W' ? mon : mon.slice(2).replace('-', '/'), x, padT + priceH + gap + volH + 6); } } });
  a.patterns.forEach(function (pt) { if (pt.box) { var x0 = X(Math.max(pt.box.from, s0)), x1 = X(bars.length - 1); ctx.fillStyle = 'rgba(127,127,127,.07)'; ctx.fillRect(x0, Y(pt.box.top), x1 - x0, Y(pt.box.bot) - Y(pt.box.top)); } });
  var maSet = tf === 'W' ? [['ma10', '--ma20'], ['ma30', '--ma60'], ['ma50', '--ma200']] : [['ma20', '--ma20'], ['ma60', '--ma60'], ['ma200', '--ma200']];
  maSet.forEach(function (ms) { var arr = ind[ms[0]]; if (!arr) return; ctx.strokeStyle = tok(ms[1]); ctx.lineWidth = 1.4; ctx.beginPath(); var started = false; for (var i = s0; i < bars.length; i++) { if (arr[i] == null) continue; var x = X(i), y = Y(arr[i]); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); } ctx.stroke(); });
  var upC = tok('--up'), dnC = tok('--dn');
  view.forEach(function (b, i) {
    var idx = s0 + i, x = X(idx), up = b.c >= b.o, col = up ? upC : dnC;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, Y(b.h)); ctx.lineTo(x, Y(b.l)); ctx.stroke();
    var yo = Y(b.o), yc = Y(b.c), top = Math.min(yo, yc), hh = Math.max(1, Math.abs(yo - yc));
    if (up && bw >= 4) { ctx.fillStyle = tok('--panel'); ctx.fillRect(x - bw / 2, top, bw, hh); ctx.strokeRect(x - bw / 2 + .5, top + .5, bw - 1, hh - 1); } else ctx.fillRect(x - bw / 2, top, bw, hh);
    ctx.globalAlpha = 0.55; ctx.fillStyle = col; ctx.fillRect(x - bw / 2, YV(b.v), bw, padT + priceH + gap + volH - YV(b.v)); ctx.globalAlpha = 1;
  });
  ctx.strokeStyle = tok('--ink3'); ctx.lineWidth = 1; ctx.beginPath(); var st2 = false; for (var i2 = s0; i2 < bars.length; i2++) { if (ind.vol20[i2] == null) continue; var x2 = X(i2), y2 = YV(ind.vol20[i2]); if (!st2) { ctx.moveTo(x2, y2); st2 = true; } else ctx.lineTo(x2, y2); } ctx.stroke();
  // 九轉：只標示結構完成的 9（倒數不畫在圖上，避免雜亂）
  ctx.font = '10px ' + tok('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  view.forEach(function (b, i) { var idx = s0 + i, c = a.td.count[idx]; if (Math.abs(c) !== 9) return; var x = X(idx), sell = c > 0, col = sell ? upC : dnC, y = sell ? Y(b.h) - 12 : Y(b.l) + 12; ctx.fillStyle = col; ctx.fillRect(x - 7, y - 7, 14, 14); ctx.fillStyle = '#fff'; ctx.fillText('9', x, y); });
  function hline(price, color, label, dash, right) {
    if (price == null || price < lo || price > hi) return;
    var y = Y(price); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '10.5px ' + tok('--mono'); ctx.textBaseline = 'middle'; var tw = ctx.measureText(label).width + 8;
    if (right) { ctx.fillStyle = color; ctx.fillRect(W - padR - tw - 2, y - 8, tw, 16); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, W - padR - tw + 2, y); }
    else { ctx.fillStyle = tok('--panel'); ctx.fillRect(padL + 4, y - 8, tw, 16); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(label, padL + 8, y); }
  }
  if (a.vcp.contractions && a.vcp.contractions.length && (a.vcp.status === 'breakout' || a.vcp.status === 'breakout_lowvol')) {
    ctx.strokeStyle = tok('--accent'); ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
    a.vcp.contractions.forEach(function (c) { if (c.hiIdx < s0) return; ctx.beginPath(); ctx.moveTo(X(c.hiIdx), Y(c.hi)); ctx.lineTo(X(c.loIdx), Y(c.lo)); ctx.stroke(); ctx.fillStyle = tok('--accent'); ctx.font = '10px ' + tok('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('−' + Math.round(c.depth) + '%', (X(c.hiIdx) + X(c.loIdx)) / 2, Y(c.lo) + 14); });
    ctx.setLineDash([]);
    if (a.vcp.pivot && ![p.entry, p.stop, p.target].some(function (v) { return v && Math.abs(v - a.vcp.pivot) / a.vcp.pivot < 0.006; })) hline(a.vcp.pivot, tok('--accent'), 'VCP 樞軸 ' + fmt.p(a.vcp.pivot), [5, 4]);
  }
  // ===== 形態學標註：主形態完整標示（點位符號 + 名稱標籤 + 區間底色 + 頸線／趨勢線），其餘形態只標名稱 =====
  var STATE_TXT = { confirmed_vol: '帶量確認', confirmed: '確認', forming: '形成中', after: '已突破' };
  function patColor(p) { return p.bias === 'bull' ? upC : p.bias === 'bear' ? dnC : tok('--ink2'); }
  function ptLabels(p) {
    var n = p.name, k = p.points ? p.points.length : 0;
    if (n.indexOf('頭肩') === 0) return ['左肩', '', '頭', '', '右肩'];
    if (n.indexOf('W 底') === 0) return ['底 1', '頸', '底 2'];
    if (n.indexOf('M 頭') === 0) return ['頂 1', '頸', '頂 2'];
    if (n.indexOf('三重') === 0) return ['1', '', '2', '', '3'];
    if (n.indexOf('多頭旗形') === 0) return ['竿底', '竿頂', '旗底'];
    if (n.indexOf('空頭旗形') === 0) return ['竿頂', '竿底', '旗頂'];
    if (n.indexOf('杯柄') === 0) return ['左緣', '杯底', '右緣', '柄低'];
    var out = []; for (var q = 0; q < k; q++) out.push(''); return out;
  }
  var placed = [];
  function badge(x, y, text, col, alignRight) {
    ctx.font = 'bold 11px ' + tok('--sans'); var tw = ctx.measureText(text).width + 14, bx = alignRight ? x - tw : x;
    bx = Math.max(padL + 2, Math.min(W - padR - tw - 70, bx));
    for (var tries = 0; tries < 6; tries++) { var hit = placed.some(function (r) { return bx < r.x + r.w + 4 && bx + tw + 4 > r.x && y - 10 < r.y + r.h + 2 && y + 10 + 2 > r.y; }); if (!hit) break; y += 23; }
    placed.push({ x: bx, y: y - 10, w: tw, h: 20 });
    ctx.fillStyle = col; roundRect(bx, y - 10, tw, 20, 5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 7, y);
    return { x: bx, w: tw };
  }
  function roundRect(x, y, w, hgt, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r); ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function nearPlan(price) { return [p_.entry, p_.stop, p_.target].some(function (v) { return v && Math.abs(v - price) / price < 0.006; }); }
  var p_ = a.plan.primary;
  function drawPattern(p, primary) {
    var col = patColor(p), pts = (p.points || []).filter(function (pt) { return pt.i >= s0; });
    var x0, x1, topY;
    if (p.box) { x0 = X(Math.max(p.box.from, s0)); x1 = X(bars.length - 1); topY = Y(p.box.top); }
    else if (pts.length) { x0 = X(pts[0].i); x1 = X(pts[pts.length - 1].i); topY = Math.min.apply(null, pts.map(function (pt) { return Y(pt.p); })); }
    else return;
    if (primary) {
      // 區間底色
      ctx.fillStyle = col; ctx.globalAlpha = 0.06; ctx.fillRect(Math.min(x0, x1), padT, Math.max(6, Math.abs(x1 - x0)), priceH); ctx.globalAlpha = 1;
      // 連線
      if (pts.length >= 2 && !p.box && !p.lines) { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([]); ctx.beginPath(); pts.forEach(function (pt, k) { if (k === 0) ctx.moveTo(X(pt.i), Y(pt.p)); else ctx.lineTo(X(pt.i), Y(pt.p)); }); ctx.stroke(); }
      // 趨勢線／頸線（延伸到最新一根）
      var lines = (p.lines || []).slice(); if (p.neckline) lines.push(p.neckline);
      lines.forEach(function (ln) { var A = ln[0], B = ln[1]; if (B.i === A.i) return; var sl = (B.p - A.p) / (B.i - A.i), xa = Math.max(A.i, s0), xb = bars.length - 1; ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(X(xa), Y(A.p + sl * (xa - A.i))); ctx.lineTo(X(xb), Y(A.p + sl * (xb - A.i))); ctx.stroke(); ctx.setLineDash([]); });
      if (!lines.length && !p.box && p.keyLevel && !nearPlan(p.keyLevel)) hline(p.keyLevel, col, p.keyName + ' ' + fmt.p(p.keyLevel), [6, 4]);
      if (p.box) { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.strokeRect(x0, Y(p.box.top), x1 - x0, Y(p.box.bot) - Y(p.box.top)); ctx.setLineDash([]); }
      // 點位符號：實心圓 + 文字
      var labels = ptLabels(p);
      pts.forEach(function (pt, k) {
        var lab = labels[(p.points || []).indexOf(pt)] || '', x = X(pt.i), y = Y(pt.p), major = lab !== '';
        ctx.fillStyle = (major || p.lines) ? col : tok('--panel'); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, major ? 5.5 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (major) { ctx.font = 'bold 10.5px ' + tok('--sans'); ctx.textAlign = 'center'; ctx.textBaseline = pt.t === 'H' ? 'bottom' : 'top'; var ty = pt.t === 'H' ? y - 9 : y + 9; var tw = ctx.measureText(lab).width + 6; ctx.fillStyle = tok('--panel'); ctx.globalAlpha = 0.85; ctx.fillRect(x - tw / 2, pt.t === 'H' ? ty - 13 : ty, tw, 13); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(lab, x, ty); }
      });
      // 名稱標籤
      var label = p.name.replace(/（Cup with Handle）/, '') + '　' + (STATE_TXT[p.state] || '');
      var by = topY - 30; if (by < padT + 12) by = (p.box ? Y(p.box.bot) : Math.max.apply(null, pts.map(function (pt) { return Y(pt.p); }))) + 26;
      badge(Math.min(x0, x1), by, label, col, false);
    } else {
      // 次要形態：只放小標籤在最後一個點附近
      var lastPt = pts.length ? pts[pts.length - 1] : null; if (!lastPt && !p.box) return;
      var lx = lastPt ? X(lastPt.i) : x1, ly = lastPt ? Y(lastPt.p) + (lastPt.t === 'H' ? -22 : 22) : Y(p.box.bot) + 14;
      ctx.globalAlpha = 0.85; badge(lx, ly, p.name.replace(/（.*?）/g, ''), col, true); ctx.globalAlpha = 1;
      if (lastPt) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, Y(lastPt.p)); ctx.lineTo(lx, ly + (lastPt.t === 'H' ? 10 : -10)); ctx.stroke(); }
    }
  }
  // 只畫「已確認突破／跌破」的形態；形成中的形態不上圖（在卡片中仍會列出）
  var confirmedPats = a.patterns.filter(function (p) { return p.state === 'confirmed_vol' || p.state === 'confirmed'; }).slice(0, 2);
  confirmedPats.reverse().forEach(function (p, k, arr) { drawPattern(p, k === arr.length - 1); });
  // VCP 名稱標籤
  if (a.vcp.found && a.vcp.contractions.length && (a.vcp.status === 'breakout' || a.vcp.status === 'breakout_lowvol')) { var c0 = a.vcp.contractions[0]; if (c0.hiIdx >= s0) badge(X(c0.hiIdx), Y(c0.hi) - 30, 'VCP ' + a.vcp.pattern.split(' ')[0] + '　' + ({ breakout: '帶量突破', breakout_lowvol: '突破量弱', at_pivot: '收縮到位', forming: '形成中', extended_ok: '突破後', extended: '延伸' }[a.vcp.status] || ''), tok('--accent'), false); }
  // ===== 進出場符號：▲ 進場（多）／▼ 出場或放空（空）；同一訊號連續出現只標第一根 =====
  var prevKind = null, sigArr = backtestOf(a).sig || [];
  for (var si = s0; si < bars.length; si++) {
    var sg = sigArr[si], b3 = bars[si];
    if (!sg) { prevKind = null; continue; }
    var kk = sg.side + '|' + sg.kind; if (kk === prevKind) { continue; } prevKind = kk;
    var sx = X(si), isLast = si === bars.length - 1, size = isLast ? 9 : 6, col3 = sg.side === 'long' ? upC : dnC;
    ctx.fillStyle = col3; ctx.strokeStyle = tok('--panel'); ctx.lineWidth = 1.2; ctx.beginPath();
    if (sg.side === 'long') { var by0 = Y(b3.l) + 6 + (Math.abs(a.td.count[si]) === 9 ? 16 : 0); ctx.moveTo(sx, by0); ctx.lineTo(sx - size, by0 + size * 1.5); ctx.lineTo(sx + size, by0 + size * 1.5); }
    else { var ty0 = Y(b3.h) - 6 - (Math.abs(a.td.count[si]) === 9 ? 16 : 0); ctx.moveTo(sx, ty0); ctx.lineTo(sx - size, ty0 - size * 1.5); ctx.lineTo(sx + size, ty0 - size * 1.5); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (isLast || cw >= 9) { ctx.font = (isLast ? 'bold 11px ' : '10px ') + tok('--sans'); ctx.fillStyle = col3; ctx.textAlign = 'center'; ctx.textBaseline = sg.side === 'long' ? 'top' : 'bottom'; var lab3 = sg.side === 'long' ? (/試單/.test(sg.kind) || sg.score < 60 ? '試單' : '進場') : (sg.exit ? '出場' : '放空'); var ly3 = sg.side === 'long' ? Y(b3.l) + 6 + size * 1.5 + 2 + (Math.abs(a.td.count[si]) === 9 ? 16 : 0) : Y(b3.h) - 6 - size * 1.5 - 2 - (Math.abs(a.td.count[si]) === 9 ? 16 : 0); ctx.fillText(lab3, sx, ly3); }
    if (isLast) { badge(sx - 40, sg.side === 'long' ? Math.min(H - volH - gap - 40, Y(b3.l) + 46) : Math.max(padT + 12, Y(b3.h) - 46), (sg.side === 'long' ? '▲ 今日進場訊號：' : '▼ 今日' + (sg.exit ? '出場' : '放空') + '訊號：') + sg.kind, col3, true); }
  }
  var lastB = bars[bars.length - 1], yl = Y(lastB.c);
  function side(price) { return Math.abs(Y(price) - yl) >= 20; }
  if (p.entry) hline(p.entry, tok('--accent'), '進場 ' + fmt.p(p.entry), [], side(p.entry));
  if (p.stop) hline(p.stop, tok('--dn'), '停損 ' + fmt.p(p.stop), [], side(p.stop));
  if (p.target) hline(p.target, tok('--up'), '目標 ' + fmt.p(p.target), [], side(p.target));
  ctx.fillStyle = lastB.c >= lastB.o ? upC : dnC; ctx.fillRect(W - padR + 2, yl - 9, padR - 4, 18); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '11px ' + tok('--mono'); ctx.fillText(fmt.p(lastB.c), W - padR + 6, yl);
  cv.onmousemove = function (e) {
    var rect = cv.getBoundingClientRect(), x = e.clientX - rect.left, i = s0 + Math.floor((x - padL) / cw);
    if (i < s0 || i >= bars.length) { tipEl.hidden = true; return; }
    var b = bars[i], pv = bars[i - 1], chg = pv ? (b.c - pv.c) / pv.c * 100 : 0, td = a.td.count[i], cd = a.td.cd[i];
    tipEl.innerHTML = '<b>' + b.d + '</b><br>開 ' + fmt.p(b.o) + ' 高 ' + fmt.p(b.h) + '<br>低 ' + fmt.p(b.l) + ' 收 <span class="' + (chg >= 0 ? 'up' : 'dn') + '">' + fmt.p(b.c) + ' ' + fmt.pct(chg) + '</span><br>量 ' + fmt.vol(b.v, m) + (ind.vol20[i] ? ' (' + (b.v / ind.vol20[i]).toFixed(2) + 'x)' : '') + (td ? '<br>九轉 ' + (td > 0 ? '上漲 ' : '下跌 ') + Math.abs(td) : '') + (cd ? '<br>倒數 ' + (cd > 0 ? '賣 ' : '買 ') + Math.abs(cd) + '/13' : '');
    tipEl.hidden = false; var tw = tipEl.offsetWidth, left = x + 14; if (left + tw > rect.width - 8) left = x - tw - 14; tipEl.style.left = left + 'px'; tipEl.style.top = (e.clientY - rect.top + 12) + 'px';
  };
  cv.onmouseleave = function () { tipEl.hidden = true; };
};

// ---------- 型態雷達：個股分析頁 ----------
var radarDraw = null;
function radarAnalyze(code) {
  var meta = state.byCode[code]; var body = $('#analyzeBody');
  if (!meta) { body.className = ''; body.innerHTML = '<div class="errbox">' + esc(code) + ' 尚無價量資料。</div>'; return; }
  body.className = 'loading'; body.textContent = '載入 ' + code + ' ' + meta.n + '…';
  analyzeCode(code, state.tf).then(function (a) {
    state.radarCurrent = { code: code, meta: meta, a: a };
    body.className = '';
    if (!a.ok) { body.innerHTML = '<div class="errbox">' + esc(a.error) + '</div>'; return; }
    body.innerHTML = RU.quote(code, a, meta, state.tf, '<a class="chipbtn" style="text-decoration:none;margin-left:auto" href="#/stock/' + esc(code) + '">個股總覽（含供應鏈／季節性）→</a>') +
      '<div class="grid"><div class="stack">' + RU.chartCard(a, state.tf, state.range, 'R') + RU.summaryCard(a) + RU.perfCard(a, meta) + RU.patterns(a) + RU.vcp(a) + '</div>' +
      '<div class="stack">' + RU.verdict(a, meta) + RU.position(a) + RU.td(a) + RU.volume(a, meta) + RU.levels(a) + '</div></div>';
    radarDraw = RU.bindChart(body, a, meta, state.tf, 'R', function () { return state.range; }, function (n) { state.range = n; });
    RU.bindSizing(body, a, meta);
  }).catch(function (err) { body.className = ''; body.innerHTML = '<div class="errbox">無法載入資料：' + esc(err.message) + '</div>'; });
}
function showRadarSub(sub) {
  if (['analyze', 'scan', 'watch'].indexOf(sub) < 0) sub = 'analyze';
  $$('#radarSub a').forEach(function (a) { if (a.dataset.sub === sub) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  ['analyze', 'scan', 'watch'].forEach(function (t) { $('#view-' + t).hidden = t !== sub; });
  if (sub === 'scan') renderScan(); else if (sub === 'watch') renderWatch();
  else { var code = (state.radarCurrent && state.radarCurrent.code) || (state.route && state.route.route === 'stock' && state.route.arg) || null; try { code = code || localStorage.getItem('hub.last'); } catch (e) { } if (!code || !state.byCode[code]) code = (state.index && state.index.default) || (state.index && state.index.stocks[0] && state.index.stocks[0].c); if (code) radarAnalyze(code); }
}
window.addEventListener('resize', function () { if (radarDraw && !$('#view-radar').hidden) radarDraw(); if (stockDraw && !$('#view-stock').hidden) stockDraw(); });
