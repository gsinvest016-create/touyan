/* ===== 每日交易計畫：含時間標記的檢查清單，內容由本站資料自動填入 ===== */
function todayKey() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function isActionableSig(g) { return g && (g.side === 'long' || g.side === 'short') && E.isActionable({ priority: /進場|試單|反彈買點|減碼|獲利了結|出場|放空|可買/.test(g.action) ? 1 : 3, action: g.action, side: g.side, entry: g.entry, stop: g.stop }); }
function planCandidates(market) {
  var out = [];
  (state.index ? state.index.stocks : []).forEach(function (s) {
    if (market && s.m !== market) return;
    var g = state.scan[s.c]; if (!g || !(g.side === 'long' || g.side === 'short')) return;
    var actionable = /進場|試單|反彈買點|放空|可買/.test(g.action) && !/等|勿/.test(g.action);
    var pending = /等|掛單/.test(g.action) && g.entry;
    var exitSig = /減碼|獲利了結|出場/.test(g.action);
    if (!actionable && !pending && !exitSig) return;
    var ex = state.stats && state.stats.kindsM && state.stats.kindsM[s.m + '|' + E.signalKindKey({ kind: g.kind })];
    out.push({ s: s, g: g, type: actionable ? 'now' : pending ? 'pending' : 'exit', ex: ex && ex.n >= 5 ? ex : null, watch: state.watch.indexOf(s.c) >= 0 });
  });
  out.sort(function (a, b) { return (b.watch ? 1000 : 0) + b.g.score - ((a.watch ? 1000 : 0) + a.g.score); });
  return out;
}
function candRow(c) {
  var g = c.g, s = c.s;
  return '<div class="cand" data-go="' + esc(s.c) + '"><span class="c">' + esc(s.c) + ' ' + esc(s.n) + (c.watch ? ' ★' : '') + '</span><span class="k"><span class="pill ' + (g.side === 'long' ? 'long' : 'short') + '">' + (g.side === 'long' ? '多' : '空') + '</span> ' + esc(g.kind) + ' · ' + esc(g.action) + (c.ex ? ' <span class="muted">· 歷史期望 ' + (c.ex.expectancy > 0 ? '+' : '') + c.ex.expectancy + 'R（' + c.ex.n + '筆）</span>' : '') + '</span><span class="px">進 ' + fmt.p(g.entry) + '<br>損 ' + fmt.p(g.stop) + (g.target ? '<br>標 ' + fmt.p(g.target) : '') + '</span></div>';
}
function ck(id, text, sub) { var done = !!(Store.plan.data.checks[todayKey()] || {})[id]; return '<label class="ck ' + (done ? 'done' : '') + '"><input type="checkbox" data-ck="' + esc(id) + '" ' + (done ? 'checked' : '') + '><span><span class="t">' + text + '</span>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</span></label>'; }
function renderPlan() {
  var body = $('#planBody'); body.className = '';
  var mk = state.planMk || 'TW';
  var cands = planCandidates(mk), now = cands.filter(function (c) { return c.type === 'now'; }), pend = cands.filter(function (c) { return c.type === 'pending'; }), exits = cands.filter(function (c) { return c.type === 'exit'; });
  var sea = mk === 'TW' ? seasonCalc('TWII', state.seasonWin || '20') : seasonCalc('GSPC', state.seasonWin || '20');
  var settle = mk === 'TW' ? settleCalc() : null;
  var watchRows = state.watch.map(function (c) { var g = state.scan[c]; return g ? { c: c, g: g } : null; }).filter(Boolean);
  // 族群強弱（有詳細供應鏈檔案者依族群 g 統計）
  var grp = {}; if (state.supply) state.supply.data.forEach(function (d) { var g = state.scan[d.c]; if (!g) return; var k = d.g; grp[k] = grp[k] || { n: 0, l: 0, s: 0 }; grp[k].n++; if (g.side === 'long') grp[k].l++; if (g.side === 'short') grp[k].s++; });
  var grpArr = Object.keys(grp).map(function (k) { return { k: k, n: grp[k].n, l: grp[k].l, s: grp[k].s, r: grp[k].n ? (grp[k].l - grp[k].s) / grp[k].n : 0 }; }).filter(function (x) { return x.n >= 2; }).sort(function (a, b) { return b.r - a.r; });
  var strong = grpArr.slice(0, 3), weak = grpArr.slice(-3).reverse();
  var nm = nowMin();
  var blocks = mk === 'TW' ? [
    { t: '08:00', end: 8 * 60 + 44, title: '盤前掃描', sub: '開盤前 60 分', body: function () {
      var h = '<div class="cklist">';
      h += ck('pre1', '看今日進場候選（本站收盤訊號），最多挑 <b>3 檔</b>，其餘放掉', now.length ? '目前 ' + now.length + ' 檔可行動訊號、' + pend.length + ' 檔等待突破；<a href="#/ideas">交易點子頁</a>已依期望值與檢核排好前 5 名' : pend.length ? '今天沒有可直接行動的訊號，' + pend.length + ' 檔等待突破' : '今天沒有訊號');
      h += '</div>' + (now.length ? '<div class="cands">' + now.slice(0, 8).map(candRow).join('') + '</div>' : '<div class="note" style="margin:6px 0">今天沒有可直接行動的訊號；等待突破的候選在下方。</div>');
      if (pend.length) h += '<div style="font-size:12px;color:var(--ink3);margin-top:8px">等突破（掛單觀察）</div><div class="cands">' + pend.slice(0, 6).map(candRow).join('') + '</div>';
      h += '<div class="cklist" style="margin-top:8px">';
      h += ck('pre2', '每檔候選寫下：進場價、停損價、張數（風險固定 1%）', '進場價與停損來自個股總覽；張數用頁面的部位計算');
      h += ck('pre3', '檢查持倉：停損位是否要上移？有沒有出場訊號？', exits.length ? '有出場／減碼訊號：' + exits.slice(0, 5).map(function (c) { return c.s.c + ' ' + c.s.n; }).join('、') : '目前沒有持股出現出場訊號');
      h += ck('pre4', '大盤風向：季節性 ' + (sea ? ({ tail: '順風', head: '逆風', flat: '中性' })[sea.verdict] + '（本週+下週平均 ' + fmt.pct(sea.avgMean) + '、上漲機率 ' + sea.avgWin.toFixed(0) + '%）' : '—') + (settle ? '；結算：' + (settle.inWindow ? (settle.k === -2 ? '<b>結算週週一（T−2），歷史最弱，今日不追價</b>' : settle.k === -1 ? '結算前一日，明早留意開盤跳空' : settle.k === 0 ? '<b>今日結算</b>，開盤易高、盤中回吐' : '結算窗口內') : '距結算 ' + settle.daysToNext + ' 個交易日') : ''), (sea && sea.verdict === 'head') ? '逆風日部位減半、目標保守' : '');
      h += ck('pre5', '族群強弱：' + (strong.length ? '強 ' + strong.map(function (x) { return x.k + '（' + x.l + '/' + x.n + ' 偏多）'; }).join('、') : '—') + (weak.length ? '；弱 ' + weak.map(function (x) { return x.k + '（' + x.s + '/' + x.n + ' 偏空）'; }).join('、') : ''), '只做強勢族群裡的多單、弱勢族群裡的空單');
      var MM = state.indices ? mkModel() : null;
      h += ck('pre6', '部位上限：' + (MM ? '<a href="#/market">市場水位</a>建議 <b>' + MM.cb.expo + '%</b>（' + MM.act.t + '）' + (function () { var dn = MM.lvTW.below.filter(function (x) { return x.to < MM.lvTW.now; })[0], up = MM.lvTW.above.filter(function (x) { return x.to > MM.lvTW.now; })[0], uo = MM.lvOTC ? MM.lvOTC.above.filter(function (x) { return x.to > MM.lvOTC.now; })[0] : null, doo = MM.lvOTC ? MM.lvOTC.below.filter(function (x) { return x.to < MM.lvOTC.now; })[0] : null; return (dn ? '；加權跌破 ' + fmt.p(dn.p) + '（' + dn.name + '）減到 ' + dn.to + '%' : '') + (doo ? '；櫃買跌破 ' + fmt.p(doo.p) + ' 減到 ' + doo.to + '%' : '') + (up ? '；加權突破 ' + fmt.p(up.p) + ' 加到 ' + up.to + '%' : '') + (uo ? '；櫃買突破 ' + fmt.p(uo.p) + ' 加到 ' + uo.to + '%' : ''); })() : '看一眼美股昨夜收盤與台指期夜盤，決定今天整體部位上限（正常／減半／不進場）'), MM ? '以加權＋櫃買趨勢、分配日、廣度計算；價位以收盤確認' : '');
      return h + '</div>'; } },
    { t: '08:45', end: 9 * 60 - 1, title: '期貨開盤', sub: '現貨開盤前 15 分', body: function () { return '<div class="cklist">' + ck('fut1', '台指期開盤 vs 昨日結算價：跳空超過 ±1% 就把今天的部位上限再減半') + ck('fut2', '把候選股的進場價、停損價再核對一次，開盤跳空超過進場價 <b>+3%</b> 的直接取消不追') + '</div>'; } },
    { t: '09:00', end: 9 * 60 + 29, title: '開盤策略', sub: '開盤 30 分不追價', body: function () { return '<div class="cklist">' + ck('op1', '開盤前 15 分鐘只看不做：等第一根 15 分 K 收完') + ck('op2', '候選股若開盤直接跌破停損價，今天不進；若開在進場價附近且量能正常，依計畫掛單') + ck('op3', '持倉若開盤跌破停損：市價出，不等反彈', '停損是昨晚訂的，開盤不重訂') + '</div>'; } },
    { t: '09:30', end: 10 * 60 + 29, title: '第一次盤中檢查', sub: '', body: function () { return '<div class="cklist">' + ck('m1', '候選股成交量估算：開盤 30 分量 × 6 是否 ≥ 1.5 倍 20 日均量？不足的突破先不追', '本站突破訊號要求收盤量 ≥ 1.5x') + ck('m2', '進場後立刻設好停損單（不用心算）') + ck('m3', '不加碼任何還在「形成中」的形態；只做已確認的突破') + '</div>'; } },
    { t: '10:30', end: 12 * 60 + 59, title: '盤中調整', sub: '午盤', body: function () { return '<div class="cklist">' + ck('mid1', '持倉：突破後回測樞軸／頸線不破 = 正常，跌回下方且量放大 = 假突破，收盤前出') + ck('mid2', '今天已停損 2 筆 → 停手，不再開新倉', '日內連續停損是最常見的報復性交易起點') + ck('mid3', '不看盤中新聞改計畫；計畫只在收盤後改') + '</div>'; } },
    { t: '13:00', end: 13 * 60 + 29, title: '收盤策略', sub: '收盤前 30 分', body: function () { return '<div class="cklist">' + ck('cl1', '<b>突破以收盤價確認</b>：13:15 後仍站上關鍵價位（樞軸／頸線）且量足，才算突破成立；盤中假突破在此出場', '本站所有訊號都是收盤確認型') + ck('cl2', '取消所有未成交掛單') + ck('cl3', '13:25 最後檢查：持倉停損價是否需要上移到今日低點下方') + '</div>'; } },
    { t: '13:30', end: 24 * 60, title: '收盤後', sub: '復盤 15 分', body: function () { return '<div class="cklist">' + ck('post1', '復盤：今天每一筆進出，寫下理由與當時的情緒（追價？猶豫？照計畫？）') + ck('post2', '跑資料更新程式，回來看新的掃描結果與明日候選', '雙擊 Documents\\投研總台\\update.bat，跑完跟 Claude 說「更新網站」') + ck('post3', '看一次<a href="#/market">市場水位</a>：建議水位有沒有變、明天的減碼／加碼價位是多少') + '</div>'; } }
  ] : [
    { t: '20:30', end: 21 * 60 + 29, title: '盤前掃描（台北時間）', sub: '美股開盤前 60 分', body: function () { var h = '<div class="cklist">' + ck('upre1', '看美股進場候選，最多挑 3 檔', now.length + ' 檔可行動、' + pend.length + ' 檔等突破') + '</div>' + (now.length ? '<div class="cands">' + now.slice(0, 8).map(candRow).join('') + '</div>' : '<div class="note" style="margin:6px 0">今天沒有可直接行動的美股訊號。</div>') + (pend.length ? '<div class="cands">' + pend.slice(0, 6).map(candRow).join('') + '</div>' : ''); h += '<div class="cklist" style="margin-top:8px">' + ck('upre2', '季節性：' + (sea ? ({ tail: '順風', head: '逆風', flat: '中性' })[sea.verdict] + '（標普本週+下週 ' + fmt.pct(sea.avgMean) + '）' : '—')) + ck('upre3', '今晚有無重大數據／財報（CPI、FOMC、非農、持股財報）？有就不在數據前開新倉') + '</div>'; return h; } },
    { t: '21:30', end: 22 * 60 + 29, title: '開盤策略', sub: '開盤 30 分不追價', body: function () { return '<div class="cklist">' + ck('uop1', '開盤 30 分只看不做') + ck('uop2', '候選股跳空超過進場價 +3% 取消；跌破停損不進') + ck('uop3', '進場後立刻設停損單') + '</div>'; } },
    { t: '23:00', end: 3 * 60 + 29 + 24 * 60, title: '盤中調整', sub: '', body: function () { return '<div class="cklist">' + ck('umid1', '持倉突破後回測不破為正常；跌回且量增為假突破，收盤前出') + ck('umid2', '當日停損 2 筆停手') + '</div>'; } },
    { t: '03:30', end: 4 * 60 + 24 * 60, title: '收盤策略', sub: '收盤前 30 分', body: function () { return '<div class="cklist">' + ck('ucl1', '突破以收盤價確認，取消未成交掛單') + ck('ucl2', '停損上移到今日低點下方（若已有利潤）') + '</div>'; } },
    { t: '隔日', end: 99999, title: '收盤後', sub: '', body: function () { return '<div class="cklist">' + ck('upost1', '復盤今天的進出與情緒') + ck('upost2', '更新資料、看明日候選') + '</div>'; } }
  ];
  var checks = Store.plan.data.checks[todayKey()] || {}, total = 0, done = 0;
  blocks.forEach(function (b) { var html = b.body(); b.html = html; total += (html.match(/data-ck=/g) || []).length; });
  Object.keys(checks).forEach(function (k) { if (checks[k]) done++; });
  var cur = -1; for (var i = 0; i < blocks.length; i++) { if (nm <= blocks[i].end) { cur = i; break; } }
  var html = '<div class="pagehead"><div><h2>每日交易計畫 · ' + todayKey() + '</h2><p>照表執行、不臨場發揮。清單內容由本站今日訊號、季節性、結算時點與族群強弱自動填入；勾選會保存在你的帳號。</p></div><div class="tools"><div class="seg"><button data-pm="TW" aria-pressed="' + (mk === 'TW') + '">台股</button><button data-pm="US" aria-pressed="' + (mk === 'US') + '">美股</button></div><span class="muted" style="font-size:12px">完成 ' + done + '/' + total + '</span><span class="progress"><i style="width:' + (total ? done / total * 100 : 0) + '%"></i></span><button class="btn small" id="planReset">重設今日</button></div></div>';
  if (watchRows.length) html += '<div class="card" style="margin-bottom:14px"><h3>自選股今日狀態<span class="r">' + watchRows.length + ' 檔</span></h3><div class="cands">' + watchRows.map(function (r) { var g = r.g; return '<div class="cand" data-go="' + esc(r.c) + '"><span class="c">' + esc(r.c) + ' ' + esc(nameOf(r.c)) + '</span><span class="k"><span class="pill ' + (g.side === 'long' ? 'long' : g.side === 'short' ? 'short' : '') + '">' + (g.side === 'long' ? '多' : g.side === 'short' ? '空' : '中性') + '</span> ' + esc(g.kind) + ' · ' + esc(g.action) + '</span><span class="px">' + fmt.p(g.close) + ' <span class="' + (g.chg >= 0 ? 'up' : 'dn') + '">' + fmt.pct(g.chg) + '</span><br>損 ' + fmt.p(g.stop) + '</span></div>'; }).join('') + '</div></div>';
  html += '<div class="timeline">' + blocks.map(function (b, i) { return '<div class="tblock ' + (i === cur ? 'now' : (cur >= 0 && i < cur ? 'past' : '')) + '"><div class="when">' + b.t + '<small>' + esc(b.sub) + '</small></div><div class="card"><h3>' + esc(b.title) + (i === cur ? '<span class="r"><span class="pill warnp">現在</span></span>' : '') + '</h3>' + b.html + '</div></div>'; }).join('') + '</div>';
  html += '<div class="note" style="margin-top:14px">時間為台北時間；價量資料只到 ' + (state.index ? state.index.date : '—') + '，訊號皆為收盤確認型，盤中價量需自行核對。此清單是流程紀律工具，不構成投資建議。</div>';
  body.innerHTML = html;
  body.onchange = function (e) { var cb = e.target.closest('[data-ck]'); if (!cb) return; var d = Store.plan.data; d.checks[todayKey()] = d.checks[todayKey()] || {}; d.checks[todayKey()][cb.dataset.ck] = cb.checked; Object.keys(d.checks).forEach(function (k) { if (k < todayKey().slice(0, 4) + '-01-01' && Object.keys(d.checks).length > 60) delete d.checks[k]; }); Store.plan.save(); cb.closest('.ck').classList.toggle('done', cb.checked); var dn = 0; Object.keys(d.checks[todayKey()]).forEach(function (k) { if (d.checks[todayKey()][k]) dn++; }); $('.progress i', body).style.width = (total ? dn / total * 100 : 0) + '%'; $('.tools .muted', body).textContent = '完成 ' + dn + '/' + total; };
  body.onclick = function (e) { var pm = e.target.closest('[data-pm]'); if (pm) { state.planMk = pm.dataset.pm; renderPlan(); return; } if (e.target.id === 'planReset') { delete Store.plan.data.checks[todayKey()]; Store.plan.save(); renderPlan(); } };
}
