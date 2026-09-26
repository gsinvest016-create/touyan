/* ===== 交易點子生成器（掃描今天全市場 → 5 個高機率點子）＋ 新聞轉交易策略 ===== */
function ideasCandidates() {
  var out = [];
  (state.index ? state.index.stocks : []).forEach(function (s) {
    var g = state.scan[s.c]; if (!g || !(g.side === 'long' || g.side === 'short')) return;
    var now = /進場|試單|反彈買點|放空|可買/.test(g.action) && !/等|勿/.test(g.action);
    var pending = /等|掛單/.test(g.action) && g.entry && g.stop;
    if (!now && !pending) return;
    if (!(g.entry && g.stop) || !(g.rr >= 1.2)) return;
    var turnover = (g.vol || 0) * (g.close || 0); if (turnover < (s.m === 'TW' ? 5e7 : 1e7)) return; // 流動性：台股日成交 ≥ 5 千萬、美股 ≥ 1 千萬美元
    var key = E.signalKindKey({ kind: g.kind }), S = state.stats, ex = S && S.kindsM && S.kindsM[s.m + '|' + key];
    if (!ex && S && S.kinds) ex = S.kinds[key];
    if (ex && ex.n >= 10 && ex.expectancy < 0.15) return; // 歷史期望值太低的訊號直接排除
    out.push({ c: s.c, m: s.m, g: g, now: now, key: key, ex: ex, pre: g.score + (now ? 10 : 0) + (ex && ex.n >= 10 ? Math.min(20, ex.expectancy * 30) : 0) });
  });
  return out.sort(function (a, b) { return b.pre - a.pre; });
}
function ideaSizing(entry, stop, mk) {
  var cap = +Store.portfolio.data.capital || 0; if (!cap || !entry || !stop) return null;
  var risk = Math.abs(entry - stop), money = cap * 0.01, qty = Math.floor(money / risk);
  if (mk === 'TW') { var lots = Math.floor(qty / 1000); return { txt: lots >= 1 ? lots + ' 張' : qty + ' 股（零股）', qty: lots >= 1 ? lots * 1000 : qty, money: money }; }
  return { txt: qty + ' 股', qty: qty, money: money };
}
function buildIdeas(limit) {
  var cands = ideasCandidates(), tw = cands.filter(function (x) { return x.m === 'TW'; }).slice(0, 14), us = cands.filter(function (x) { return x.m === 'US'; }).slice(0, 10);
  var pick = tw.concat(us);
  return Promise.all(pick.map(function (x) { return Promise.all([analyzeCode(x.c, 'D'), analyzeCode(x.c, 'W').catch(function () { return null; })]).then(function (res) { var a = res[0]; if (!a.ok) return null; var m = state.byCode[x.c], cx = stockCtx(x.c, m), act = composeAction(x.c, a, m, cx.ci, cx.seasons, cx.settle, cx.ps, res[1]), p = a.plan.primary; if (!(p.side === 'long' || p.side === 'short') || !p.entry || !p.stop) return null; var ex = expectFor(a, x.key); var score = act.conf + act.okN * 4 - act.noN * 10 + (ex && ex.st && ex.st.n >= 5 ? Math.min(20, ex.st.expectancy * 25) : 0) + (p.rr >= 2 ? 5 : 0) + (x.now ? 6 : 0); return { c: x.c, m: m.m, n: m.n, a: a, act: act, p: p, ex: ex, cx: cx, now: x.now, score: Math.round(score), sec: (state.univByCode[x.c] && state.univByCode[x.c].sec) || (cx.ci && cx.ci.kind === 'full' ? cx.ci.d.g : '') || '' }; }).catch(function () { return null; }); })).then(function (list) {
    list = list.filter(Boolean).filter(function (x) { return x.act.noN <= 2 && !(x.ex && x.ex.st && x.ex.st.n >= 10 && x.ex.st.expectancy < 0.15) && !(x.ex && x.ex.st && x.ex.st.n < 10 && x.ex.st.expectancy < 0.1); }).sort(function (a, b) { return b.score - a.score; });
    var out = [], secN = {}, kindN = {};
    list.forEach(function (x) { if (out.length >= limit) return; var k = x.sec || x.c, kk = E.signalKindKey(x.p).replace(/\s*(買|賣)\s*\d+$/, ''); if ((secN[k] || 0) >= 2 || (kindN[kk] || 0) >= 2) return; secN[k] = (secN[k] || 0) + 1; kindN[kk] = (kindN[kk] || 0) + 1; out.push(x); });
    return { ideas: out, pool: list.length, scanned: cands.length };
  });
}
function ideaCard(x, i) {
  var p = x.p, isL = p.side === 'long', sz = ideaSizing(p.entry, p.stop, x.m), risk = Math.abs(p.entry - p.stop);
  var oks = x.act.checks.filter(function (c) { return c.st === 'ok'; }), nos = x.act.checks.filter(function (c) { return c.st === 'no'; });
  var ctx = [];
  if (x.cx.ci && x.cx.ci.kind === 'full') ctx.push('供應鏈：' + x.cx.ci.sec.name + '／' + x.cx.ci.d.g + (x.cx.ps.n >= 3 ? '，族群 ' + x.cx.ps.n + ' 檔中 ' + x.cx.ps.long + ' 多 ' + x.cx.ps.short + ' 空' : ''));
  else if (x.cx.ci && x.cx.ci.kind === 'roster' && x.cx.ci.sub) ctx.push('細分產業：' + x.cx.ci.sub + (x.cx.ps.n >= 3 ? '，同業 ' + x.cx.ps.n + ' 檔中 ' + x.cx.ps.long + ' 多 ' + x.cx.ps.short + ' 空' : ''));
  if (x.cx.seasons && x.cx.seasons[0] && x.cx.seasons[0].verdict !== 'flat') ctx.push('季節性' + (x.cx.seasons[0].verdict === 'tail' ? '順風' : '逆風') + '（' + IDXN[x.cx.seasons[0].idx] + ' 本週＋下週平均 ' + fmt.pct(x.cx.seasons[0].avgMean) + '）');
  if (x.cx.settle && x.cx.settle.inWindow) ctx.push('本週為台指結算週');
  return '<div class="idea"><div class="rank">' + (i + 1) + '</div><div><div class="head"><a href="#/stock/' + esc(x.c) + '"><span class="num">' + esc(x.c) + '</span> ' + esc(x.n) + '</a><span class="pill">' + (x.m === 'TW' ? '台股' : '美股') + '</span><span class="pill ' + (isL ? 'long' : 'short') + '">' + (isL ? '做多' : '放空') + '</span><span class="pill">' + esc(p.kind.replace(/（.*?）/g, '')) + '</span>' + (x.now ? '<span class="pill hot">今日可執行</span>' : '<span class="pill warnp">掛單等突破</span>') + '<span class="muted" style="font-size:12px;margin-left:auto">綜合 ' + x.score + ' 分</span></div>' +
    '<div class="lv"><div>進場<b>' + fmt.p(p.entry) + '</b></div><div>停損<b class="dn">' + fmt.p(p.stop) + '</b>' + fmt.pct(-risk / p.entry * 100, 1) + '</div><div>目標<b class="up">' + fmt.p(p.target) + '</b>' + (p.target ? fmt.pct(Math.abs(p.target - p.entry) / p.entry * 100, 1) : '') + '</div><div>風險報酬<b>1 : ' + (p.rr || '—') + '</b></div><div>期望值<b class="' + (x.ex && x.ex.st && x.ex.st.expectancy > 0 ? 'up' : x.ex && x.ex.st ? 'dn' : '') + '">' + (x.ex && x.ex.st ? (x.ex.st.expectancy > 0 ? '+' : '') + x.ex.st.expectancy + 'R' : '—') + '</b>' + (x.ex && x.ex.st ? x.ex.st.n + ' 次 · 勝率 ' + x.ex.st.win + '%' : '無樣本') + '</div>' + (sz ? '<div>1% 風險部位<b>' + sz.txt + '</b>風險 ' + Math.round(sz.money).toLocaleString() + '</div>' : '') + '</div>' +
    '<div style="font-size:12.5px;color:var(--ink2)">' + esc(p.action) + '。' + esc(p.how) + '</div>' +
    '<ul>' + oks.map(function (c) { return '<li>' + esc(c.label) + '：' + esc(c.text) + '</li>'; }).join('') + nos.map(function (c) { return '<li class="no">風險 · ' + esc(c.label) + '：' + esc(c.text) + '</li>'; }).join('') + ctx.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div>';
}
function ideasMarketBar() {
  var tw = seasonCalc('TWII', '20'), sp = seasonCalc('GSPC', '20'), st = settleCalc();
  var cnt = { TW: { l: 0, s: 0, n: 0 }, US: { l: 0, s: 0, n: 0 } };
  (state.index ? state.index.stocks : []).forEach(function (s) { var g = state.scan[s.c]; if (!g) return; cnt[s.m].n++; if (g.side === 'long') cnt[s.m].l++; if (g.side === 'short') cnt[s.m].s++; });
  var box = function (l, v, s2) { return '<div><div class="l">' + l + '</div><div class="v" style="font-size:15px">' + v + '</div><div class="s">' + (s2 || '') + '</div></div>'; };
  return '<div class="card"><h3>今日市場環境<span class="r">' + esc((state.index && state.index.date) || '') + '</span></h3><div class="stat">' + mkSummaryBox() +
    box('台股廣度', cnt.TW.n ? Math.round(cnt.TW.l / cnt.TW.n * 100) + '% 偏多' : '—', cnt.TW.n ? cnt.TW.l + ' 多／' + cnt.TW.s + ' 空，共 ' + cnt.TW.n + ' 檔' : '尚無台股資料') +
    box('美股廣度', cnt.US.n ? Math.round(cnt.US.l / cnt.US.n * 100) + '% 偏多' : '—', cnt.US.n ? cnt.US.l + ' 多／' + cnt.US.s + ' 空，共 ' + cnt.US.n + ' 檔' : '尚無美股資料') +
    (tw ? box('台股季節性', tw.verdict === 'tail' ? '順風' : tw.verdict === 'head' ? '逆風' : '中性', '第 ' + tw.week + ' 週起兩週平均 ' + fmt.pct(tw.avgMean) + '、勝率 ' + Math.round(tw.avgWin) + '%') : '') +
    (sp ? box('美股季節性', sp.verdict === 'tail' ? '順風' : sp.verdict === 'head' ? '逆風' : '中性', '標普兩週平均 ' + fmt.pct(sp.avgMean) + '、勝率 ' + Math.round(sp.avgWin) + '%') : '') +
    (st ? box('台指結算', st.inWindow ? (st.k === 0 ? '今天結算' : st.k < 0 ? '結算前 ' + (-st.k) + ' 日' : '結算後 ' + st.k + ' 日') : st.daysToNext + ' 個交易日後', (st.k <= 0 ? st.T : st.nextT).toLocaleDateString('zh-TW') + (st.rel ? ' · 歷史當日平均 ' + fmt.pct(st.rel.mean != null ? st.rel.mean : st.rel[0]) : '')) : '') + '</div></div>';
}
// ---------- 新聞 → 交易策略 ----------
var NEWS_POS = [['營收創新高', 3], ['創新高', 2], ['歷史新高', 2], ['上修', 2], ['調高', 2], ['優於預期', 3], ['超乎預期', 3], ['大單', 2], ['取得訂單', 2], ['訂單', 1], ['擴產', 2], ['漲價', 2], ['調漲', 2], ['供不應求', 3], ['滿載', 2], ['轉盈', 3], ['獲利成長', 2], ['成長', 1], ['合作', 1], ['策略聯盟', 1], ['入股', 1], ['庫藏股', 2], ['實施庫藏股', 2], ['加碼', 1], ['買進', 1], ['目標價上調', 3], ['上調目標', 3], ['評等調升', 3], ['減資', 1], ['配息', 1], ['高股息', 1], ['認證', 1], ['打入', 2], ['供應鏈', 0], ['AI', 1], ['需求強勁', 3], ['能見度', 1], ['旺季', 1], ['beat', 3], ['raise', 2], ['record', 2], ['upgrade', 3], ['buyback', 2], ['strong demand', 3]];
var NEWS_NEG = [['下修', 3], ['調降', 2], ['不如預期', 3], ['低於預期', 3], ['衰退', 3], ['虧損', 3], ['轉虧', 3], ['減產', 2], ['砍單', 3], ['砍價', 2], ['降價', 2], ['跌價', 2], ['庫存', 1], ['去化', 1], ['裁員', 2], ['罰款', 2], ['裁罰', 2], ['訴訟', 2], ['召回', 3], ['停工', 3], ['火災', 3], ['關稅', 2], ['禁令', 3], ['制裁', 3], ['管制', 2], ['解約', 3], ['違約', 3], ['處分', 2], ['申讓', 2], ['大股東出脫', 3], ['目標價下調', 3], ['評等調降', 3], ['降評', 3], ['淡季', 1], ['需求疲弱', 3], ['疲弱', 2], ['放緩', 2], ['延後', 2], ['遞延', 2], ['miss', 3], ['cut', 2], ['downgrade', 3], ['weak', 2], ['lawsuit', 2], ['recall', 3], ['tariff', 2]];
var NEWS_AMP = [['大幅', 1.5], ['暴', 1.6], ['劇', 1.4], ['重大', 1.4], ['史上', 1.4], ['首度', 1.2], ['連續', 1.2], ['significant', 1.4], ['massive', 1.5]];
function newsScore(text) {
  var t = text.toLowerCase(), pos = 0, neg = 0, hits = [];
  NEWS_POS.forEach(function (k) { var c = t.split(k[0].toLowerCase()).length - 1; if (c) { pos += k[1] * Math.min(c, 3); if (k[1] >= 2) hits.push('+' + k[0]); } });
  NEWS_NEG.forEach(function (k) { var c = t.split(k[0].toLowerCase()).length - 1; if (c) { neg += k[1] * Math.min(c, 3); if (k[1] >= 2) hits.push('−' + k[0]); } });
  var amp = 1; NEWS_AMP.forEach(function (k) { if (t.indexOf(k[0].toLowerCase()) >= 0) amp = Math.max(amp, k[1]); });
  var raw = (pos - neg) * amp, mag = Math.min(3, Math.abs(raw) / 4);
  return { pos: pos, neg: neg, score: raw, dir: raw >= 3 ? 'pos' : raw <= -3 ? 'neg' : 'flat', mag: mag, hits: hits.slice(0, 10) };
}
function newsAnalyze(code, text) {
  var m = state.byCode[code];
  return analyzeCode(code, 'D').then(function (a) {
    if (!a.ok) throw new Error(a.error);
    var ns = newsScore(text), i = a.bars.length - 1, b = a.bars[i], atr = a.ind.atr14[i] || (b.h - b.l), c = b.c, pos = a.position, cx = stockCtx(code, m);
    var stage2 = pos.stage.indexOf('第二') === 0, stage4 = pos.stage.indexOf('第四') === 0;
    var todayMove = Math.abs(a.last.changePct), gapATR = Math.abs(b.c - a.bars[i - 1].c) / atr;
    var shift = ns.dir === 'pos' ? ns.mag * 0.4 : ns.dir === 'neg' ? -ns.mag * 0.4 : 0; // 以 ATR 為單位的短期偏移
    var rng = function (days, k) { var w = atr * Math.sqrt(days) * k, ctr = c + shift * atr * Math.min(1, days / 3); return { lo: E.roundTick(ctr - w, m.m), hi: E.roundTick(ctr + w, m.m), ctr: E.roundTick(ctr, m.m) }; };
    var r1 = rng(1, 1), r5 = rng(5, 1), r20 = rng(20, 0.9);
    var sup = a.levels.support[0], res = a.levels.resistance[0];
    var withTrend = (ns.dir === 'pos' && (stage2 || pos.aligned)) || (ns.dir === 'neg' && (stage4 || pos.bearAligned));
    var against = (ns.dir === 'pos' && stage4) || (ns.dir === 'neg' && stage2);
    var priced = gapATR >= 2 || todayMove >= 6;
    // 短期
    var short = [];
    if (ns.dir === 'pos') short.push('利多。1–5 日預期區間 ' + fmt.p(r5.lo) + '–' + fmt.p(r5.hi) + '，偏上。要看第一根反應是否帶量（≥1.5× 均量）且收在 ' + (res ? '壓力 ' + fmt.p(res.p) + '（' + res.name + '）之上' : '當日高點附近') + '，量弱的利多常是出貨。');
    else if (ns.dir === 'neg') short.push('利空。1–5 日預期區間 ' + fmt.p(r5.lo) + '–' + fmt.p(r5.hi) + '，偏下。看 ' + (sup ? '支撐 ' + fmt.p(sup.p) + '（' + sup.name + '）' : '前低') + '守不守；帶量跌破就不要接。');
    else short.push('新聞方向不明確或影響小。以技術面為主，1–5 日正常波動區間 ' + fmt.p(r5.lo) + '–' + fmt.p(r5.hi) + '。');
    if (priced) short.push('今天已經跳空／大漲大跌（' + fmt.pct(a.last.changePct) + '，約 ' + gapATR.toFixed(1) + ' 個 ATR），消息大部分已反映；追進去的風險報酬差，等 2–3 日整理後再看。');
    // 長期
    var long = [];
    if (ns.dir === 'pos' && withTrend) long.push('順勢利多：處於' + pos.stage + '，利多容易延續成波段。20 日預期區間 ' + fmt.p(r20.lo) + '–' + fmt.p(r20.hi) + '；拉回 20 日線不破是加碼點。');
    else if (ns.dir === 'pos' && against) long.push('逆勢利多：處於' + pos.stage + '，利多多半只是反彈，遇到 ' + (res ? fmt.p(res.p) + '（' + res.name + '）' : '前高') + ' 會有解套賣壓。要等趨勢結構翻多（站上 150 日線且均線走平）才算改變。');
    else if (ns.dir === 'neg' && withTrend) long.push('順勢利空：處於' + pos.stage + '，利空會加速下跌，反彈到 20 日線是放空／減碼點。20 日區間 ' + fmt.p(r20.lo) + '–' + fmt.p(r20.hi) + '。');
    else if (ns.dir === 'neg' && against) long.push('逆勢利空：處於' + pos.stage + '，一次性利空在上升趨勢中常是拉回買點；條件是 3–5 日內守住 ' + (pos.ma.ma50 ? '50 日線 ' + fmt.p(pos.ma.ma50) : '前低') + ' 且量縮。若跌破就是趨勢改變，不要凹。');
    else long.push('長期仍由趨勢決定：' + pos.stage + '。' + (pos.trendTemplate.pass >= 6 ? '趨勢模板通過，多方結構完整。' : '趨勢模板未通過，不宜重倉。'));
    if (cx.ci && (cx.ci.kind === 'full' || cx.ci.kind === 'roster') && cx.ci.peers && cx.ci.peers.length) long.push('連動：同' + (cx.ci.kind === 'full' ? '供應鏈段' : '細分產業') + '的 ' + cx.ci.peers.slice(0, 5).map(function (x) { return x.c + ' ' + (x.n || nameOf(x.c)); }).join('、') + ' 通常同向反應；若只有這檔動、同業不動，消息強度要打折。');
    // 部位
    var sizing = [], riskPct = 1;
    if (against) riskPct = 0.5; if (priced) riskPct = Math.min(riskPct, 0.5); if (ns.dir === 'flat') riskPct = 0.5;
    var side = ns.dir === 'pos' ? 'long' : ns.dir === 'neg' ? 'short' : null;
    var entry = side ? c : null, stop = side === 'long' ? E.roundTick(Math.max(sup ? sup.p * 0.995 : 0, c - 2 * atr), m.m) : side === 'short' ? E.roundTick(Math.min(res ? res.p * 1.005 : Infinity, c + 2 * atr), m.m) : null;
    var target = side === 'long' ? E.roundTick(Math.max(r20.hi, c + 2 * Math.abs(c - stop)), m.m) : side === 'short' ? E.roundTick(Math.min(r20.lo, c - 2 * Math.abs(c - stop)), m.m) : null;
    var cap = +Store.portfolio.data.capital || 0, sz = null;
    if (side && cap) { var rk = Math.abs(entry - stop), money = cap * riskPct / 100, q = Math.floor(money / rk); sz = m.m === 'TW' ? (Math.floor(q / 1000) >= 1 ? Math.floor(q / 1000) + ' 張' : q + ' 股（零股）') : q + ' 股'; }
    sizing.push('風險 ' + riskPct + '% 資金' + (sz ? '（約 ' + sz + '）' : '（在市場水位頁填入總資金即可算張數）') + '：' + (against ? '逆勢消息只用半數部位。' : priced ? '消息已反映，只留半數部位等回測。' : ns.dir === 'flat' ? '方向不明，試單即可。' : '順勢消息可用正常部位。'));
    if (side) sizing.push('參考：' + (side === 'long' ? '做多' : '放空') + ' ' + fmt.p(entry) + '，停損 ' + fmt.p(stop) + '（' + fmt.pct(-Math.abs(entry - stop) / entry * 100, 1) + '，2×ATR 或最近支撐／壓力外側），目標 ' + fmt.p(target) + '，風險報酬 1 : ' + (Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(1) + '。分兩批：第一批消息確認日收盤，第二批回測不破再加。');
    sizing.push('本站系統訊號目前：' + a.plan.primary.kind.replace(/（.*?）/g, '') + ' — ' + a.plan.primary.action + (side && a.plan.primary.side && a.plan.primary.side !== side && a.plan.primary.side !== 'neutral' ? '（與新聞方向相反，以技術面為準、縮小部位）' : '') + '。');
    return { a: a, ns: ns, atr: atr, r1: r1, r5: r5, r20: r20, sup: sup, res: res, short: short, long: long, sizing: sizing, withTrend: withTrend, against: against, priced: priced, cx: cx, side: side, entry: entry, stop: stop, target: target, riskPct: riskPct };
  });
}
function renderIdeas(arg) {
  var body = $('#ideasBody'); body.className = '';
  var code = (arg || '').toUpperCase();
  body.innerHTML = '<div class="pagehead"><div><h2>交易點子 · 新聞轉策略</h2><p>每天掃描全部有價量資料的台美股，依形態／VCP／九轉十三轉／帶量突破、趨勢結構、族群動能、季節性、結算時點與歷史期望值，挑出 5 個風險報酬最好的點子；下方可把新聞貼進來，換成短期／長期影響、預期波動區間與部位配置。</p></div></div>' + ideasMarketBar() +
    '<div class="card" style="margin-top:14px" id="ideasCard"><h3>今日 5 個高機率交易點子<span class="r">計算中…</span></h3><div class="loading" style="padding:20px">分析候選股…</div></div>' +
    '<div class="card" style="margin-top:14px"><h3>新聞 → 交易策略</h3><form class="form" id="newsForm"><label>股票代號<input name="code" value="' + esc(code) + '" placeholder="2330 / NVDA" required></label><label class="full">新聞內容（貼上標題或全文）<textarea name="text" placeholder="例：台積電 8 月營收創歷史新高，年增 33%，法說會上修全年展望…" required></textarea></label><div class="full btnrow"><button class="btn primary" type="submit">分析</button><span class="muted" style="font-size:12px">先做規則式判讀（關鍵字 × 技術面 × ATR 波動），再可請 Claude 深入分析</span></div></form><div id="newsOut"></div></div>';
  buildIdeas(5).then(function (R) {
    var card = $('#ideasCard', body); if (!card) return;
    var when = (state.index && state.index.date) || '';
    card.innerHTML = '<h3>今日 5 個高機率交易點子<span class="r">掃描 ' + R.scanned + ' 個訊號 · 深度分析 ' + R.pool + ' 檔 · ' + esc(when) + '</span></h3>' + (R.ideas.length ? R.ideas.map(ideaCard).join('') + '<div class="btnrow"><button class="btn primary" id="ideasAsk">請 Claude 寫成今日交易腳本</button><a class="btn" href="#/plan">帶入每日計畫</a></div><div id="ideasAI" class="aiout" hidden></div><div class="note">排序 = 系統信心 + 檢核有利項 − 不利項 + 歷史期望值 + 風險報酬。只看有流動性的股票（台股日成交 ≥ 5 千萬、美股 ≥ 1 千萬美元），歷史期望值低於 +0.15R 的訊號不列入。同一細分產業、同一種訊號各最多 2 檔。「今日可執行」= 收盤已確認；「掛單等突破」= 只在觸價時成交。所有內容為技術面規則推演，不是投資建議。</div>' : '<div class="empty">今天沒有通過篩選的點子（訊號少、或歷史期望值為負）。' + (R.scanned === 0 ? '目前只有示範資料；執行更新程式後全市場掃描才會有結果。' : '沒有好機會時不交易也是策略。') + '</div>');
    var ask = $('#ideasAsk', card); if (ask) ask.onclick = function () { var prompt = '你是資深交易員。以下是系統今天篩出的交易點子（JSON，含進場／停損／目標／期望值與檢核），請用繁體中文寫成一份「今日交易腳本」：每個點子一段，包含：為什麼是這檔（一句）、進場條件（開盤怎麼看、什麼情況取消）、停損與目標、部位（以 1% 風險為準）、盤中要注意的風險。最後給一段「今天整體怎麼做」（市場環境、要不要滿倉）。直接、具體、不超過 600 字。\n\n' + JSON.stringify({ 市場: { 台股廣度: null }, 點子: R.ideas.map(function (x) { return { 代號: x.c, 名稱: x.n, 市場: x.m, 方向: x.p.side, 訊號: x.p.kind, 進場: x.p.entry, 停損: x.p.stop, 目標: x.p.target, RR: x.p.rr, 期望值: x.ex && x.ex.st ? x.ex.st.expectancy : null, 樣本: x.ex && x.ex.st ? x.ex.st.n : 0, 今日可執行: x.now, 有利: x.act.checks.filter(function (c) { return c.st === 'ok'; }).map(function (c) { return c.label + ':' + c.text; }), 不利: x.act.checks.filter(function (c) { return c.st === 'no'; }).map(function (c) { return c.label + ':' + c.text; }), 產業: x.sec }; }) }); askClaude(ask, $('#ideasAI', card), prompt); };
  }).catch(function (e) { var card = $('#ideasCard', body); if (card) card.innerHTML = '<h3>今日 5 個高機率交易點子</h3><div class="note">計算失敗：' + esc(e.message) + '</div>'; });
  $('#newsForm', body).onsubmit = function (e) {
    e.preventDefault(); var fd = new FormData(e.target), c = String(fd.get('code') || '').trim().toUpperCase(), text = String(fd.get('text') || '').trim(), out = $('#newsOut', body);
    if (!state.byCode[c]) { out.innerHTML = '<div class="note">找不到 ' + esc(c) + ' 的價量資料' + (state.univByCode[c] ? '（這檔目前只有供應鏈資料，執行更新程式後即可分析）' : '') + '。</div>'; return; }
    out.innerHTML = '<div class="loading" style="padding:16px">分析中…</div>';
    newsAnalyze(c, text).then(function (N) {
      var a = N.a, m = state.byCode[c], dirTxt = N.ns.dir === 'pos' ? '<span class="pill long">利多</span>' : N.ns.dir === 'neg' ? '<span class="pill short">利空</span>' : '<span class="pill">中性／不明</span>';
      out.innerHTML = '<div style="margin-top:12px"><div class="head" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:15px"><a href="#/stock/' + esc(c) + '" style="font-weight:600;color:inherit;text-decoration:none"><span class="num">' + esc(c) + '</span> ' + esc(m.n) + '</a>' + dirTxt + '<span class="pill">' + esc(a.position.stage) + '</span><span class="muted" style="font-size:12px">關鍵字：' + (N.ns.hits.length ? esc(N.ns.hits.join(' ')) : '無明確方向詞') + ' · 強度 ' + N.ns.mag.toFixed(1) + '/3</span></div>' +
        '<div class="rng"><div>現價<b>' + fmt.p(a.last.close) + '</b>' + fmt.pct(a.last.changePct) + ' · ATR ' + fmt.p(N.atr) + '（' + (N.atr / a.last.close * 100).toFixed(1) + '%）</div><div>1 日預期區間<b>' + fmt.p(N.r1.lo) + ' – ' + fmt.p(N.r1.hi) + '</b></div><div>5 日預期區間<b>' + fmt.p(N.r5.lo) + ' – ' + fmt.p(N.r5.hi) + '</b>中心 ' + fmt.p(N.r5.ctr) + '</div><div>20 日預期區間<b>' + fmt.p(N.r20.lo) + ' – ' + fmt.p(N.r20.hi) + '</b></div><div>最近支撐<b>' + (N.sup ? fmt.p(N.sup.p) : '—') + '</b>' + esc(N.sup ? N.sup.name : '') + '</div><div>最近壓力<b>' + (N.res ? fmt.p(N.res.p) : '—') + '</b>' + esc(N.res ? N.res.name : '') + '</div></div>' +
        '<div class="rule"><b>短期影響（1–5 日）</b>' + N.short.map(esc).join('<br>') + '</div><div class="rule"><b>長期影響（1–3 個月）</b>' + N.long.map(esc).join('<br>') + '</div><div class="rule"><b>部位配置</b>' + N.sizing.map(esc).join('<br>') + '</div>' +
        '<div class="btnrow"><button class="btn primary" id="newsAsk">請 Claude 深入分析這則新聞</button></div><div id="newsAI" class="aiout" hidden></div><div class="note">預期區間 = ATR × √天數（以近 14 日波動推估，非保證）；方向偏移依關鍵字強度。新聞是否已反映，看當日跳空幅度（≥2 ATR 視為已反映大半）。</div></div>';
      $('#newsAsk', out).onclick = function () { var prompt = '你是台股／美股的資深分析師與交易員。使用者貼了一則關於 ' + c + ' ' + m.n + ' 的新聞，並附上目前技術面。請用繁體中文回答：\n1) 這則新聞對短期（1–5 日）的影響：方向、強度、是否可能已反映\n2) 對長期（1–3 個月）的影響：會不會改變基本面或趨勢\n3) 預期價格波動區間（可參考附上的 ATR 區間，並說明你的調整）\n4) 部位配置：以總資金 1% 風險為上限，建議進場方式（一次或分批）、停損、目標、部位大小比例\n5) 供應鏈／同業會不會連動，哪些股票要一起看\n直接、具體、不超過 500 字。\n\n新聞：' + text.slice(0, 3000) + '\n\n技術面：' + JSON.stringify({ 現價: a.last.close, 漲跌: a.last.changePct, ATR: N.atr, 階段: a.position.stage, 趨勢模板: a.position.trendTemplate.pass + '/' + a.position.trendTemplate.total, 位置52週: a.position.pos52, RSI: a.position.rsi, 支撐: a.levels.support.slice(0, 2), 壓力: a.levels.resistance.slice(0, 2), 系統訊號: a.plan.primary.kind + ' ' + a.plan.primary.action, 區間5日: N.r5, 區間20日: N.r20, 規則判讀: { 方向: N.ns.dir, 強度: N.ns.mag, 已反映: N.priced, 順勢: N.withTrend, 逆勢: N.against }, 同業: N.cx.ci && N.cx.ci.peers ? N.cx.ci.peers.slice(0, 6).map(function (x) { return x.c; }) : [] }); askClaude(this, $('#newsAI', out), prompt); };
    }).catch(function (err) { out.innerHTML = '<div class="note">分析失敗：' + esc(err.message) + '</div>'; });
  };
  if (code && state.byCode[code]) { var ta = $('#newsForm textarea', body); if (ta) ta.focus(); }
}
