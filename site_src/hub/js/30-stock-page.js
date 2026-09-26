/* ===== 個股總覽：技術面 + 支撐壓力 + 供應鏈 + 季節性 + 月結算，一頁看完 ===== */
var stockDraw = null;
var US_NAMES = { NVDA: ['輝達'], AAPL: ['蘋果'], AMD: ['超微'], INTC: ['英特爾'], MU: ['美光'], QCOM: ['高通'], AVGO: ['博通'], TSLA: ['特斯拉'], DELL: ['戴爾'], HPQ: ['惠普'], HPE: ['HPE', '慧與'], SMCI: ['美超微'], META: ['Meta'], MSFT: ['微軟'], GOOGL: ['Google', '谷歌'], GOOG: ['Google', '谷歌'], AMZN: ['亞馬遜', 'AWS'], AMAT: ['應用材料', '應材'], LRCX: ['科林'], KLAC: ['科磊'], ASML: ['ASML'], TXN: ['德儀'], ADI: ['亞德諾'], MRVL: ['Marvell', '邁威爾'], ARM: ['安謀', 'Arm'], NKE: ['Nike'], ON: ['安森美'], STM: ['意法'], CSCO: ['思科'], ORCL: ['甲骨文'], IBM: ['IBM'], SONY: ['Sony', '索尼'], NTDOY: ['任天堂'], TSM: ['台積電'], UMC: ['聯電'], ASX: ['日月光'], MSTR: ['MicroStrategy'], COIN: ['Coinbase'], ANET: ['Arista'], VRT: ['Vertiv'], CRDO: ['Credo'], ALAB: ['Astera'], MPWR: ['MPS'], WDC: ['威騰'], STX: ['希捷'], LULU: ['Lululemon'], ADDYY: ['Adidas'], GM: ['通用'], F: ['福特'], TM: ['豐田'], BA: ['波音'], EADSY: ['空巴'], LMT: ['洛克希德'], RTX: ['雷神'], GE: ['GE', '奇異'], HON: ['Honeywell'] };

// ---------- 季節性 ----------
function doy(d) { return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1; }
function weekRange(w, y) { var a = new Date(y, 0, 1 + (w - 1) * 7), b = w === 52 ? new Date(y, 11, 31) : new Date(y, 0, w * 7); return [a, b]; }
function seasonCalc(idx, win) {
  var D = state.season; if (!D || !D.weekly[idx]) return null;
  var today = new Date(), y = today.getFullYear(), w = Math.min(52, Math.floor((doy(today) - 1) / 7) + 1);
  var rows = D.weekly[idx][win] || D.weekly[idx]['all'], out = [];
  for (var k = 0; k < 5; k++) { var ww = ((w - 1 + k) % 52) + 1, r = rows[ww - 1], rg = weekRange(ww, ww < w ? y + 1 : y); out.push({ w: ww, from: rg[0], to: rg[1], mean: r ? r[0] : null, med: r ? r[1] : null, win: r ? r[2] : null, n: r ? r[3] : 0, now: k === 0 }); }
  var mo = today.getMonth(), mrow = (D.monthly[idx][win] || D.monthly[idx]['all'])[mo];
  var next2 = out.slice(0, 2).filter(function (r) { return r.mean != null; });
  var avgMean = next2.length ? next2.reduce(function (s, r) { return s + r.mean; }, 0) / next2.length : 0, avgWin = next2.length ? next2.reduce(function (s, r) { return s + r.win; }, 0) / next2.length : 50;
  var verdict = avgMean >= 0.25 && avgWin >= 58 ? 'tail' : avgMean <= -0.25 && avgWin <= 46 ? 'head' : 'flat';
  return { idx: idx, win: win, week: w, rows: out, month: { m: mo + 1, mean: mrow ? mrow[0] : null, med: mrow ? mrow[1] : null, win: mrow ? mrow[2] : null, n: mrow ? mrow[3] : 0 }, avgMean: avgMean, avgWin: avgWin, verdict: verdict, meta: D.meta[idx] };
}
var IDXN = { TWII: '台股加權', GSPC: '標普 500', IXIC: '那斯達克' };
function seasonCard(meta) {
  var idxs = meta.m === 'TW' ? ['TWII'] : ['GSPC', 'IXIC'];
  var win = state.seasonWin || '20';
  var blocks = idxs.map(function (k) { return seasonCalc(k, win); }).filter(Boolean);
  if (!blocks.length) return '<div class="card"><h3>季節性</h3><div class="note" style="margin:0">季節性資料未載入。</div></div>';
  var vtxt = { tail: '<span class="pill long">季節性順風</span>', head: '<span class="pill short">季節性逆風</span>', flat: '<span class="pill">季節性中性</span>' };
  var html = '<div class="card season"><h3>季節性（指數層級）<span class="r"><span class="seg" style="font-size:11px"><button data-sw="10" aria-pressed="' + (win === '10') + '">10年</button><button data-sw="20" aria-pressed="' + (win === '20') + '">20年</button><button data-sw="all" aria-pressed="' + (win === 'all') + '">全部</button></span></span></h3>';
  blocks.forEach(function (b) {
    var cur = b.rows[0];
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><b>' + IDXN[b.idx] + '</b>' + vtxt[b.verdict] + '<span style="font-size:12px;color:var(--ink3)">本週第 ' + b.week + ' 週 · ' + (b.meta ? b.meta.years + ' 年樣本' : '') + '</span></div>';
    html += '<div class="seasonwrap"><table class="seasontbl"><thead><tr><th>週</th><th>平均</th><th>中位</th><th>上漲機率</th></tr></thead><tbody>' + b.rows.map(function (r) { return '<tr class="' + (r.now ? 'now' : '') + '"><td>' + (r.now ? '本週 ' : r.w === b.rows[1].w ? '下週 ' : '') + '第 ' + r.w + ' 週 <span style="color:var(--ink3)">' + fmt.date(r.from) + '–' + fmt.date(r.to) + '</span></td><td class="' + (r.mean > 0 ? 'up' : r.mean < 0 ? 'dn' : '') + '">' + fmt.pct(r.mean) + '</td><td class="' + (r.med > 0 ? 'up' : r.med < 0 ? 'dn' : '') + '">' + fmt.pct(r.med) + '</td><td>' + (r.win == null ? '—' : r.win.toFixed(0) + '%<span class="winbar"><i style="width:' + r.win + '%"></i></span>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    html += '<div style="font-size:12px;color:var(--ink2);margin-top:6px">' + b.month.m + ' 月整月：平均 <b class="num ' + (b.month.mean > 0 ? 'up' : 'dn') + '">' + fmt.pct(b.month.mean) + '</b>，上漲機率 <b class="num">' + (b.month.win == null ? '—' : b.month.win.toFixed(0) + '%') + '</b>（' + b.month.n + ' 年）</div>';
  });
  html += '<div class="note">季節性是指數（' + idxs.map(function (k) { return IDXN[k]; }).join('／') + '）的歷史逐週統計，反映大盤風向而非個股本身；順風時可放大部位、逆風時縮小或縮短持有期，但不能取代形態與停損。<a href="#/season">完整季節性圖表 →</a></div></div>';
  return html;
}
document.addEventListener('click', function (e) { var b = e.target.closest('[data-sw]'); if (!b) return; state.seasonWin = b.dataset.sw; try { localStorage.setItem('hub.seasonWin', state.seasonWin); } catch (x) { } if (state.route && state.route.route === 'stock') renderStock(state.route.arg); });

// ---------- 月結算 ----------
function thirdWed(y, m) { var d = new Date(y, m, 1), first = 1 + ((3 - d.getDay() + 7) % 7); return new Date(y, m, first + 14); }
function weekdaysBetween(a, b) { var n = 0, d = new Date(a); d.setHours(0, 0, 0, 0); var end = new Date(b); end.setHours(0, 0, 0, 0); while (d < end) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; } return n; }
function addWeekdays(d, n) { var x = new Date(d); var step = n < 0 ? -1 : 1, left = Math.abs(n); while (left > 0) { x.setDate(x.getDate() + step); if (x.getDay() !== 0 && x.getDay() !== 6) left--; } return x; }
function settleCalc() {
  var D = state.settle; if (!D) return null;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var T = thirdWed(today.getFullYear(), today.getMonth());
  var prevT = T; if (T < today) { var nm = new Date(today.getFullYear(), today.getMonth() + 1, 1); T = thirdWed(nm.getFullYear(), nm.getMonth()); } else { var pm = new Date(today.getFullYear(), today.getMonth() - 1, 1); prevT = thirdWed(pm.getFullYear(), pm.getMonth()); }
  var kNext = -weekdaysBetween(today, T), kPrev = weekdaysBetween(prevT, today);
  var ref = (kPrev <= 3 && kPrev < -kNext) ? { T: prevT, k: kPrev } : { T: T, k: kNext };
  var rel = D.rel[String(ref.k)] || null;
  var timeline = []; for (var k = -5; k <= 2; k++) { var d = addWeekdays(ref.T, k); timeline.push({ k: k, d: d, rel: D.rel[String(k)], today: d.getTime() === today.getTime(), isT: k === 0 }); }
  return { D: D, T: ref.T, k: ref.k, rel: rel, nextT: T, daysToNext: -kNext, timeline: timeline, inWindow: ref.k >= -5 && ref.k <= 2 };
}
function settleCard() {
  var s = settleCalc(); if (!s) return '';
  var D = s.D, f3 = function (v) { return (v >= 0 ? '+' : '') + v.toFixed(3) + '%'; }, f2 = function (v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; };
  var kTxt = s.k === 0 ? '今天就是結算日' : s.k < 0 ? '距下次結算 ' + (-s.k) + ' 個交易日（T' + s.k + '）' : '結算後第 ' + s.k + ' 個交易日（T+' + s.k + '）';
  var pill = s.inWindow ? (s.k === -2 ? '<span class="pill short">結算週最弱日</span>' : s.k === -1 ? '<span class="pill warnp">結算前一日</span>' : s.k === 0 ? '<span class="pill warnp">結算日</span>' : '<span class="pill">結算窗口內</span>') : '<span class="pill">非結算週</span>';
  var html = '<div class="card"><h3>台指月結算時點<span class="r">' + pill + '</span></h3>';
  html += '<div style="font-size:13px;margin-bottom:4px"><b>' + kTxt + '</b> · 結算日 ' + (s.T.getMonth() + 1) + '/' + s.T.getDate() + '（第三個週三）</div>';
  html += '<div class="tl">' + s.timeline.map(function (t) { var r = t.rel; return '<div class="' + (t.isT ? 'T' : '') + (t.today ? ' today' : '') + '"><span>' + (t.k === 0 ? 'T' : t.k > 0 ? 'T+' + t.k : 'T' + t.k) + '</span><b>' + (t.d.getMonth() + 1) + '/' + t.d.getDate() + '</b>' + (r ? '<small class="' + (r.mean >= 0 ? 'up' : 'dn') + '">' + f2(r.mean) + '</small><small>' + r.win.toFixed(0) + '%</small>' : '') + '</div>'; }).join('') + '</div>';
  var pre5 = D.windows['-5_-1'], gapNew = D.gap_by_period['2021-2026'].gap;
  html += '<div class="mini"><div><div class="l">結算日開盤跳空</div><div class="v ' + (D.settle_gap.mean >= 0 ? 'up' : 'dn') + '">' + f2(D.settle_gap.mean) + '</div><div class="s">勝率 ' + D.settle_gap.win.toFixed(0) + '%，唯一顯著因子；2021 後僅 ' + f2(gapNew.mean) + '</div></div>' +
    '<div><div class="l">結算前一週 T−5→T−1</div><div class="v ' + (pre5.mean >= 0 ? 'up' : 'dn') + '">' + f2(pre5.mean) + '</div><div class="s">勝率 ' + pre5.win.toFixed(0) + '%，略偏弱不顯著</div></div>' +
    '<div><div class="l">結算日當天</div><div class="v ' + (D.rel['0'].mean >= 0 ? 'up' : 'dn') + '">' + f2(D.rel['0'].mean) + '</div><div class="s">勝率 ' + D.rel['0'].win.toFixed(0) + '%，與一般日無異</div></div></div>';
  if (s.rel) html += '<div style="font-size:12.5px;color:var(--ink2)">歷史上 <b>' + (s.k === 0 ? 'T' : s.k > 0 ? 'T+' + s.k : 'T' + s.k) + '</b> 這一天加權指數平均 <b class="num ' + (s.rel.mean >= 0 ? 'up' : 'dn') + '">' + f3(s.rel.mean) + '</b>、上漲機率 <b class="num">' + s.rel.win.toFixed(0) + '%</b>（' + s.rel.n + ' 次，基準 ' + f3(D.baseline.mean) + '）。</div>';
  html += '<div class="note">結論：月結算是「時點效應」（結算日開盤那一刻），不是方向因子；結算週的週一（T−2）歷史最弱、結算日開盤偏高後回吐。個股進場遇到結算週，宜避開 T−2 追價、把停損放寬到隔日開盤跳空的幅度。交易日以週一至週五估算、未扣假日。<a href="#/settle">完整結算統計 →</a></div></div>';
  return html;
}

// ---------- 供應鏈 ----------
function chainInfo(code, meta) {
  var S = state.supply; if (!S) return null;
  var d = S.byCode[code];
  if (d) {
    var sec = S.sectors[d.s], grp = (S.groups[d.s] || []).find(function (g) { return g[0] === d.g; });
    var peers = S.data.filter(function (x) { return x.s === d.s && x.g === d.g && x.c !== code; });
    return { kind: 'full', d: d, sec: sec, secKey: d.s, grp: grp, stage: grp ? grp[1] : null, peers: peers };
  }
  var r = S.byRoster[code];
  if (r) {
    var SUB = S.sub || {}, si = SUB[code];
    var sub = si ? si[0] : null;
    var peersSub = sub ? S.roster.filter(function (x) { return x[0] !== code && SUB[x[0]] && SUB[x[0]][0] === sub; }) : [];
    // 同細分產業也包含已建檔公司裡 group 名稱相同者
    if (sub) S.data.forEach(function (d2) { if (d2.c !== code && (d2.g === sub || sub.indexOf(d2.g) >= 0) && !peersSub.some(function (x) { return x[0] === d2.c; })) peersSub.push([d2.c, d2.n, r[2], d2.m]); });
    var peersInd = S.roster.filter(function (x) { return x[2] === r[2] && x[0] !== code && !peersSub.some(function (y) { return y[0] === x[0]; }); });
    return { kind: 'roster', r: r, ind: r[2], sub: sub, subDesc: si ? si[1] : '', tags: si ? (si[2] || []) : [], hi: si ? si[3] !== 0 : false, desc: S.inddesc[r[2]] || '', peers: peersSub.map(function (x) { return { c: x[0], n: x[1], m: x[3] }; }), peersInd: peersInd.slice(0, 60).map(function (x) { return { c: x[0], n: x[1], m: x[3] }; }) };
  }
  if (meta && meta.m === 'US') {
    var names = US_NAMES[code] || [meta.n];
    var hits = [];
    S.data.forEach(function (x) { ['up', 'down', 'rel'].forEach(function (k) { (x[k] || []).forEach(function (ref) { if (names.some(function (nm) { return ref.indexOf(nm) >= 0; })) hits.push({ c: x.c, n: x.n, s: x.s, g: x.g, rel: k, ref: ref }); }); }); });
    return { kind: 'us', names: names, hits: hits };
  }
  return null;
}
function refChip(ref) {
  var S = state.supply, m = /^(\d{4,6}[A-Z]?)/.exec(ref);
  if (m && (state.univByCode[m[1]] || S.byCode[m[1]] || S.byRoster[m[1]])) {
    var c = m[1], sig = state.scan[c], nm = nameOf(c);
    return '<span class="chip link" data-go="' + esc(c) + '"><span class="cd">' + esc(c) + '</span>' + esc(nm) + (sig ? '<span class="sg ' + (sig.side === 'long' ? 'long' : sig.side === 'short' ? 'short' : 'neutral') + '">' + (sig.side === 'long' ? '多' : sig.side === 'short' ? '空' : '中') + ' ' + sig.score + '</span>' : '') + '</span>';
  }
  return '<span class="chip ext">' + esc(ref) + '</span>';
}
function chainCard(code, meta, ci) {
  if (!ci) return '<div class="card chain"><h3>供應鏈關係</h3><div class="note" style="margin:0">供應鏈名錄目前涵蓋台股上市、上櫃、興櫃；' + (meta && meta.m === 'US' ? '這檔美股在台灣供應鏈資料中沒有可對應的名稱。' : '找不到這個代號。') + '</div></div>';
  var S = state.supply, html = '<div class="card chain"><h3>供應鏈關係';
  if (ci.kind === 'full') {
    var d = ci.d;
    html += '<span class="r"><a href="#/supply/' + esc(code) + '">在供應鏈地圖中開啟 →</a></span></h3>';
    html += '<div class="stage"><b style="color:' + esc(ci.sec.color) + ';background:' + esc(ci.sec.soft) + '">' + esc(ci.sec.name) + '</b><b class="on">' + esc(d.g) + '</b>' + S.stages.map(function (s, i) { return '<b class="' + (i === ci.stage ? 'on' : '') + '">' + s + '</b>'; }).join('<span>›</span>') + '<span>' + (d.m === '櫃' ? '上櫃' : d.m === '興' ? '興櫃' : '上市') + '</span></div>';
    html += '<p>' + esc(d.d) + '</p>';
    if (ci.grp) html += '<p style="font-size:12px;color:var(--ink3)">' + esc(ci.grp[2]) + '</p>';
    var secList = function (t, arr) { return arr && arr.length ? '<h4>' + t + '</h4><div class="chips">' + arr.map(refChip).join('') + '</div>' : ''; };
    html += secList('上游供應商 / 關鍵來源', d.up) + secList('下游客戶 / 主要出海口', d.down) + secList('同業與關聯企業', d.rel);
  } else if (ci.kind === 'roster') {
    html += '<span class="r"><a href="#/supply/' + esc(code) + '">在供應鏈地圖中開啟 →</a></span></h3>';
    if (ci.sub) {
      html += '<div class="stage"><b class="on">' + esc(ci.sub) + '</b><b>' + esc(ci.ind) + '</b><span>' + (ci.r[3] === '櫃' ? '上櫃' : ci.r[3] === '興' ? '興櫃' : '上市') + '</span>' + (ci.hi ? '' : '<span class="pill warnp">業務待確認</span>') + '</div>';
      html += '<p>' + esc(ci.subDesc) + '</p>';
      if (ci.tags.length) html += '<div class="tags" style="margin:0 0 8px">' + ci.tags.map(function (x) { return '<span class="pill">' + esc(x) + '</span>'; }).join('') + '</div>';
      html += '<p style="font-size:12px;color:var(--ink3)">' + esc(ci.desc || ('官方分類：' + ci.ind + '。')) + ' 這檔尚未建立逐檔上下游關係，以下為同細分產業公司。</p>';
      html += '<h4>同細分產業：' + esc(ci.sub) + '（' + ci.peers.length + ' 家）</h4><div class="chips">' + ci.peers.slice(0, 30).map(function (p) { return refChip(p.c); }).join('') + (ci.peers.length > 30 ? '<span class="chip ext">…另 ' + (ci.peers.length - 30) + ' 家</span>' : '') + '</div>';
    } else {
      html += '<div class="stage"><b class="on">' + esc(ci.ind) + '</b><span>' + (ci.r[3] === '櫃' ? '上櫃' : ci.r[3] === '興' ? '興櫃' : '上市') + '</span></div><p>' + esc(ci.desc) + '</p><p style="font-size:12px;color:var(--ink3)">這檔尚未建立詳細上下游關係；同分類公司如下。</p>';
      html += '<div class="chips">' + ci.peers.slice(0, 24).map(function (p) { return refChip(p.c); }).join('') + '</div>';
    }
  } else if (ci.kind === 'us') {
    html += '<span class="r">台灣供應鏈關聯</span></h3>';
    if (!ci.hits.length) html += '<div class="note" style="margin:0">供應鏈名錄中沒有台廠把「' + esc(ci.names.join('／')) + '」列為客戶或供應商。</div>';
    else {
      var byRel = { down: [], up: [], rel: [] }; ci.hits.forEach(function (x) { byRel[x.rel].push(x); });
      var lab = { down: '把它列為下游客戶的台廠（供應商）', up: '把它列為上游來源的台廠（客戶／使用者）', rel: '列為同業／關聯的台廠' };
      ['down', 'up', 'rel'].forEach(function (k) { if (byRel[k].length) html += '<h4>' + lab[k] + '</h4><div class="chips">' + byRel[k].map(function (x) { return refChip(x.c); }).join('') + '</div>'; });
      html += '<p style="font-size:12px;color:var(--ink3);margin-top:8px">關聯依台股供應鏈名錄中的文字比對（' + esc(ci.names.join('／')) + '），供追蹤族群連動。</p>';
    }
  }
  return html + '</div>';
}
function peersCard(code, meta, ci) {
  if (!ci) return '';
  var list = ci.kind === 'full' ? ci.peers.map(function (p) { return p.c; }) : ci.kind === 'roster' ? ci.peers.map(function (p) { return p.c; }).concat(ci.peers.length < 4 && ci.peersInd ? ci.peersInd.map(function (p) { return p.c; }) : []) : ci.kind === 'us' ? ci.hits.map(function (x) { return x.c; }) : [];
  list = list.filter(function (c, i, arr) { return arr.indexOf(c) === i; });
  if (!list.length) return '';
  var rowsP = list.map(function (c) { return { c: c, n: nameOf(c), g: state.scan[c] }; });
  var withData = rowsP.filter(function (r) { return r.g; }), noData = rowsP.filter(function (r) { return !r.g; });
  withData.sort(function (a, b) { return (b.g.score || 0) - (a.g.score || 0); });
  var longN = withData.filter(function (r) { return r.g.side === 'long'; }).length, shortN = withData.filter(function (r) { return r.g.side === 'short'; }).length;
  var title = ci.kind === 'full' ? '同族群：' + esc(ci.d.g) : ci.kind === 'roster' ? (ci.sub ? '同細分產業：' + esc(ci.sub) + (ci.peers.length < 4 ? '（樣本少，併入' + esc(ci.ind) + '）' : '') : '同分類：' + esc(ci.ind)) : '台灣供應鏈關聯股';
  var html = '<div class="card"><h3>' + title + '<span class="r">' + (withData.length ? '有訊號 ' + withData.length + ' 檔 · 偏多 ' + longN + '／偏空 ' + shortN : '尚無價量資料') + '</span></h3>';
  if (withData.length) html += '<div class="tablewrap" style="border:0"><table class="peers" style="min-width:640px"><thead><tr><th></th><th>代號</th><th>名稱</th><th class="num">收盤</th><th class="num">漲跌%</th><th>方向</th><th>主訊號</th><th class="num">信心</th><th class="num">進場</th><th class="num">停損</th><th class="num">52週位置</th></tr></thead><tbody>' + withData.slice(0, 30).map(function (r) { var g = r.g; return '<tr class="click" data-go="' + esc(r.c) + '"><td>' + starBtn(r.c) + '</td><td><b class="num">' + esc(r.c) + '</b></td><td>' + esc(r.n) + '</td><td class="num">' + fmt.p(g.close) + '</td><td class="num ' + (g.chg >= 0 ? 'up' : 'dn') + '">' + fmt.pct(g.chg) + '</td><td><span class="pill ' + (g.side === 'long' ? 'long' : g.side === 'short' ? 'short' : '') + '">' + (g.side === 'long' ? '偏多' : g.side === 'short' ? '偏空' : '中性') + '</span></td><td>' + esc(g.kind) + '</td><td class="num">' + g.score + '</td><td class="num">' + fmt.p(g.entry) + '</td><td class="num dn">' + fmt.p(g.stop) + '</td><td class="num">' + g.pos52 + '%</td></tr>'; }).join('') + '</tbody></table></div>';
  if (noData.length) html += '<div class="chips" style="margin-top:8px">' + noData.slice(0, 30).map(function (r) { return '<span class="chip link" data-go="' + esc(r.c) + '"><span class="cd">' + esc(r.c) + '</span>' + esc(r.n) + '</span>'; }).join('') + (noData.length > 30 ? '<span class="chip ext">…另 ' + (noData.length - 30) + ' 檔</span>' : '') + '</div>';
  return html + '</div>';
}

// ---------- 支撐 / 壓力階梯 ----------
function buildLadder(a, meta) {
  // 只留最有效的價位：計畫進場／停損／目標、主形態關鍵價、VCP 樞軸、前波高低、月／季／年線、52 週高低；每側最多 4 個
  var c = a.last.close, lv = [];
  function add(p, name, kind, w) { if (p == null || !isFinite(p) || p <= 0) return; lv.push({ p: +p, names: [name], kind: kind || '', w: w || 1 }); }
  var pp = a.plan.primary; add(pp.entry, '計畫進場', 'entry', 10); add(pp.stop, '計畫停損', 'stop', 10); add(pp.target, '計畫目標', 'tgt', 10);
  var p0 = a.patterns[0]; if (p0) add(p0.keyLevel, p0.name.replace(/（.*?）/g, '') + ' ' + p0.keyName, 'pat', 8);
  if (a.vcp.found || a.vcp.status === 'at_pivot') add(a.vcp.pivot, 'VCP 樞軸', 'pat', 8);
  a.levels.support.forEach(function (x) { add(x.p, x.name, '', /52 週/.test(x.name) ? 6 : /MA200/.test(x.name) ? 6 : /MA60/.test(x.name) ? 5 : /MA20/.test(x.name) ? 4 : 5); });
  a.levels.resistance.forEach(function (x) { add(x.p, x.name, '', /52 週/.test(x.name) ? 6 : /MA200/.test(x.name) ? 6 : /MA60/.test(x.name) ? 5 : /MA20/.test(x.name) ? 4 : 5); });
  var ma = a.position.ma; [['ma20', 'MA20 月線', 4], ['ma60', 'MA60 季線', 5], ['ma200', 'MA200 年線', 6]].forEach(function (k) { if (ma[k[0]] && !lv.some(function (x) { return Math.abs(pct(x.p, ma[k[0]])) <= 1.5; })) add(ma[k[0]], k[1], '', k[2]); });
  lv.sort(function (x, y) { return y.p - x.p; });
  var merged = [];
  lv.forEach(function (x) { var last = merged[merged.length - 1]; if (last && Math.abs(pct(x.p, last.p)) <= 0.6) { x.names.forEach(function (nm) { if (last.names.indexOf(nm) < 0) last.names.push(nm); }); if (x.w > last.w) { last.w = x.w; last.kind = x.kind || last.kind; } else if (x.kind && !last.kind) last.kind = x.kind; } else merged.push(x); });
  var pick = function (arr) { return arr.slice().sort(function (x, y) { return y.w - x.w || Math.abs(pct(x.p, c)) - Math.abs(pct(y.p, c)); }).slice(0, 4).sort(function (x, y) { return y.p - x.p; }); };
  var above = pick(merged.filter(function (x) { return x.p > c * 1.002; })), below = pick(merged.filter(function (x) { return x.p < c * 0.998; }));
  return { above: above, below: below, close: c };
}
function ladderCard(a, meta) {
  var L = buildLadder(a, meta), maxD = 15;
  function row(x, cls) { var d = pct(x.p, L.close), w = Math.min(100, Math.abs(d) / maxD * 100); return '<div class="lv ' + cls + '"><span class="p">' + fmt.p(x.p) + '</span><span class="n">' + x.names.slice(0, 2).map(function (nm) { var k = x.kind; return '<span class="pill ' + (k === 'stop' ? 'short' : k === 'tgt' ? 'long' : k === 'entry' ? 'warnp' : '') + '" style="font-weight:400">' + esc(nm) + '</span>'; }).join('') + (x.names.length > 2 ? '<span style="color:var(--ink3)">+' + (x.names.length - 2) + '</span>' : '') + '<span class="bar"><i style="width:' + w + '%"></i></span></span><span class="d">' + fmt.pct(d, 1) + '</span></div>'; }
  var html = '<div class="card"><h3>支撐 / 壓力階梯<span class="r">由近到遠，距現價 %</span></h3><div class="ladder">';
  html += L.above.map(function (x) { return row(x, 'res'); }).join('');
  html += '<div class="lv now"><span class="p">' + fmt.p(L.close) + '</span><span class="n">現價 · ' + esc(a.last.date) + '</span><span class="d">' + fmt.pct(a.last.changePct) + '</span></div>';
  html += L.below.map(function (x) { return row(x, 'sup'); }).join('');
  var nearR = L.above.length ? L.above[L.above.length - 1] : null, nearS = L.below.length ? L.below[0] : null;
  html += '</div><div class="note">' + (nearR ? '最近壓力 <b class="num up">' + fmt.p(nearR.p) + '</b>（' + esc(nearR.names[0]) + '，' + fmt.pct(pct(nearR.p, L.close), 1) + '）' : '') + (nearS ? '；最近支撐 <b class="num dn">' + fmt.p(nearS.p) + '</b>（' + esc(nearS.names[0]) + '，' + fmt.pct(pct(nearS.p, L.close), 1) + '）' : '') + '。多單以支撐下方設停損、壓力前減碼；空單反之。只列最有效的價位：計畫進出場、主形態關鍵價、前波高低、月／季／年線、52 週高低。</div></div>';
  return html;
}

// ---------- 行動摘要（整合所有面向） ----------
function composeAction(code, a, meta, ci, seasons, settle, peersStat, other) {
  var p = a.plan.primary, checks = [], adj = 0;
  var pos = a.position, vol = a.volume, isLong = p.side === 'long', isShort = p.side === 'short';
  function ck(label, st, text, sub) { checks.push({ label: label, st: st, text: text, sub: sub || '' }); }
  // 趨勢
  var tt = pos.trendTemplate, stage2 = pos.stage.indexOf('第二') === 0, stage4 = pos.stage.indexOf('第四') === 0;
  ck('趨勢結構', stage2 && tt.pass >= 5 ? (isShort ? 'mid' : 'ok') : stage4 ? (isShort ? 'ok' : 'no') : 'mid', pos.stage, '趨勢模板 ' + tt.pass + '/' + tt.total + (pos.aligned ? '，均線多頭排列' : pos.bearAligned ? '，均線空頭排列' : ''));
  // 另一週期確認（日線看週線、週線看日線）
  if (other && other.ok) {
    var op = other.position, opl = other.plan.primary, oLabel = a.timeframe === 'W' ? '日線確認' : '週線確認';
    var oStage2 = op.stage.indexOf('第二') === 0, oStage4 = op.stage.indexOf('第四') === 0, oSide = opl.side;
    var agree = (isLong && (oStage2 || op.aligned) && oSide !== 'short') || (isShort && (oStage4 || op.bearAligned) && oSide !== 'long');
    var conflict = (isLong && oStage4) || (isShort && oStage2), oppSig = (isLong && oSide === 'short') || (isShort && oSide === 'long');
    adj += agree ? 5 : conflict ? -8 : 0;
    ck(oLabel, agree ? 'ok' : conflict ? 'no' : 'mid', (a.timeframe === 'W' ? '日線' : '週線') + op.stage + '，' + (op.aligned ? '均線多頭排列' : op.bearAligned ? '均線空頭排列' : '均線未排列') + (opl.side === 'long' || opl.side === 'short' ? '；訊號 ' + opl.kind.replace(/（.*?）/g, '') : ''), agree ? '兩個週期同向，可用正常部位' : conflict ? '與大週期相反，只能短打、部位減半' : oppSig ? '大週期趨勢不反對，但出現反向形態，目標保守、不追高' : '大週期未表態，順小週期做但目標保守');
  }
  // 形態
  var pat = a.patterns[0], vc = a.vcp;
  var patSt = vc.status === 'breakout' ? 'ok' : vc.status === 'at_pivot' ? 'mid' : pat ? (pat.state === 'confirmed_vol' ? 'ok' : pat.state === 'confirmed' ? 'mid' : pat.state === 'forming' ? 'mid' : 'mid') : 'mid';
  ck('形態', patSt, vc.found ? 'VCP ' + vc.pattern + '（' + { breakout: '帶量突破', breakout_lowvol: '突破量弱', at_pivot: '收縮到位', forming: '形成中', extended_ok: '突破後', extended: '延伸' }[vc.status] + '）' : pat ? pat.name + '（' + { confirmed_vol: '帶量確認', confirmed: '確認、量弱', forming: '形成中', after: '已突破' }[pat.state] + '）' : '無標準形態', pat ? pat.keyName + ' ' + fmt.p(pat.keyLevel) : '');
  // 量能
  ck('量能', vol.volBreakout ? 'ok' : vol.climax || vol.volBreakdown ? 'no' : vol.dryUp < 0.7 ? 'mid' : 'mid', vol.verdict, '今日 ' + vol.rel20 + 'x 均量，量縮比 ' + vol.dryUp + (vol.udRatio >= 1.5 ? '，買盤量佔優' : vol.udRatio <= 0.67 ? '，賣壓量佔優' : ''));
  // 位置
  var hot = pos.level.indexOf('過熱') >= 0 || (pos.bias20 != null && pos.bias20 > 10);
  ck('高低檔', isShort ? ((hot || pos.pos52 >= 75) ? 'ok' : pos.pos52 <= 25 ? 'no' : 'mid') : (hot ? 'no' : (pos.pos52 >= 25 && pos.pos52 <= 90 && stage2) ? 'ok' : 'mid'), pos.level + '（52 週位置 ' + pos.pos52 + '%）', 'MA20 乖離 ' + fmt.pct(pos.bias20, 1) + '，RSI ' + (pos.rsi == null ? '—' : pos.rsi));
  // 九轉
  var td = a.td, tdSt = 'mid', tdTxt = td.status;
  if (td.recentCountdown) { tdSt = (td.recentCountdown.type === 'buy') === isLong ? 'ok' : 'no'; }
  else if (td.recentSetup) { tdSt = (td.recentSetup.type === 'buy') === isLong ? 'ok' : 'mid'; }
  else if (td.active && td.active.count >= 10) { tdSt = (td.active.type === 'buy') === isLong ? 'mid' : 'no'; }
  ck('九轉 / 十三轉', tdSt, tdTxt.split('；')[0], tdTxt.split('；')[1] || '');
  // 季節性
  if (seasons && seasons.length) {
    var s0 = seasons[0], sst = s0.verdict === 'tail' ? (isShort ? 'no' : 'ok') : s0.verdict === 'head' ? (isShort ? 'ok' : 'no') : 'mid';
    adj += s0.verdict === 'tail' ? (isLong ? 4 : -4) : s0.verdict === 'head' ? (isLong ? -4 : 4) : 0;
    ck('季節性（' + IDXN[s0.idx] + '）', sst, { tail: '順風', head: '逆風', flat: '中性' }[s0.verdict] + '：本週＋下週平均 ' + fmt.pct(s0.avgMean) + '、上漲機率 ' + s0.avgWin.toFixed(0) + '%', s0.month.m + ' 月平均 ' + fmt.pct(s0.month.mean) + '（' + { '10': '近 10 年', '20': '近 20 年', 'all': '全部歷史' }[s0.win] + '）');
  }
  // 結算
  if (settle) {
    var kk = settle.k, sTxt = settle.inWindow ? (kk === -2 ? '結算週週一（T−2）歷史最弱，勿在今日追價' : kk === -1 ? '結算前一日：明日開盤歷史平均跳空 +' + settle.D.settle_gap.mean.toFixed(2) + '%，但收盤常回吐' : kk === 0 ? '結算日：開盤易高、盤中回吐，方向由大盤決定' : kk > 0 ? '結算已過，走勢回歸一般行情' : '結算前一週歷史略偏弱（不顯著）') : '距結算 ' + settle.daysToNext + ' 個交易日，不受結算時點影響';
    ck('月結算時點', settle.inWindow ? (kk === -2 && isLong ? 'no' : 'mid') : 'ok', sTxt, '結算日 ' + (settle.T.getMonth() + 1) + '/' + settle.T.getDate());
    if (settle.inWindow && kk === -2 && isLong) adj -= 3;
  }
  // 族群
  if (peersStat && peersStat.n) {
    var ratio = peersStat.long / peersStat.n, pst = ratio >= 0.6 ? (isShort ? 'no' : 'ok') : peersStat.short / peersStat.n >= 0.6 ? (isShort ? 'ok' : 'no') : 'mid';
    adj += ratio >= 0.6 ? (isLong ? 4 : -4) : peersStat.short / peersStat.n >= 0.6 ? (isLong ? -4 : 4) : 0;
    ck('族群動能', pst, peersStat.label + '：' + peersStat.n + ' 檔有訊號，偏多 ' + peersStat.long + '／偏空 ' + peersStat.short, peersStat.top ? '族群最強：' + peersStat.top : '');
  } else if (ci) ck('族群動能', 'mid', '同族群尚無足夠價量資料', '執行資料更新後會自動比較');
  // 歷史期望值
  var exKey = E.signalKindKey(p), ex = expectFor(a, exKey);
  if (ex && ex.st && ex.st.n) {
    var st = ex.st, good = st.expectancy >= 0.3 && st.n >= 5, bad = st.expectancy < 0 && st.n >= 5;
    adj += good ? 6 : bad ? -10 : 0;
    ck('歷史期望值', good ? 'ok' : bad ? 'no' : 'mid', ex.label + '：' + (st.expectancy > 0 ? '+' : '') + st.expectancy + 'R，勝率 ' + st.win + '%（' + st.n + ' 筆' + (st.n < 5 ? '，樣本少' : '') + '）', '均賺 ' + st.avgWin + 'R／均賠 ' + st.avgLoss + 'R，獲利因子 ' + (st.pf >= 99 ? '∞' : st.pf) + '，最大連虧 ' + st.maxConsLoss);
  } else ck('歷史期望值', 'mid', '尚無同類訊號的回測樣本', '價量資料更新後全市場統計會補上');
  var conf = Math.max(0, Math.min(100, a.plan.confidence + adj));
  var okN = checks.filter(function (c) { return c.st === 'ok'; }).length, noN = checks.filter(function (c) { return c.st === 'no'; }).length;
  // 文字摘要
  var sideTxt = isLong ? '偏多' : isShort ? '偏空' : '中性';
  var say = '<b>' + esc(p.kind) + '</b> — ' + esc(p.action) + '。' + esc(p.how);
  if (p.entry && p.stop) say += ' 以進場 <b class="num">' + fmt.p(p.entry) + '</b>、停損 <b class="num dn">' + fmt.p(p.stop) + '</b> 計算，單筆風險 ' + p.riskPct + '%' + (p.target ? '、目標 <b class="num up">' + fmt.p(p.target) + '</b>（' + p.rr + ' R）' : '') + '。';
  var extra = [];
  if (seasons && seasons.length && seasons[0].verdict !== 'flat') extra.push('季節性' + (seasons[0].verdict === 'tail' ? '順風' : '逆風') + '（' + IDXN[seasons[0].idx] + '本週＋下週平均 ' + fmt.pct(seasons[0].avgMean) + '）' + (seasons[0].verdict === 'tail' === isLong ? '，可用正常部位' : '，部位縮小、目標保守'));
  if (settle && settle.inWindow && settle.k <= 0) extra.push('本週為結算週，' + (settle.k === -2 ? '週一歷史最弱，等收盤再決定' : '留意結算日開盤跳空後的回吐'));
  if (peersStat && peersStat.n >= 3) extra.push('族群 ' + peersStat.n + ' 檔中 ' + peersStat.long + ' 檔偏多' + (peersStat.long / peersStat.n >= 0.6 ? '，族群共振加分' : peersStat.short / peersStat.n >= 0.6 ? '，族群偏弱、獨強需提防' : ''));
  if (extra.length) say += ' ' + extra.join('；') + '。';
  if (ex && ex.st && ex.st.n >= 5) say += ' 這類訊號' + (ex.src === 'own' ? '在本股' : '在' + ex.label) + '過去 ' + ex.st.n + ' 次的期望值是 <b class="num ' + (ex.st.expectancy > 0 ? 'up' : 'dn') + '">' + (ex.st.expectancy > 0 ? '+' : '') + ex.st.expectancy + 'R</b>' + (ex.st.expectancy < 0 ? '，<b>歷史上是賠錢的訊號，照規則做不划算</b>' : ex.st.expectancy >= 0.3 ? '，有正期望' : '，優勢薄') + '。';
  if (noN >= 3) say += ' <b>檢核有 ' + noN + ' 項不利，建議只以小部位試單或等更好的位置。</b>';
  return { checks: checks, conf: conf, say: say, sideTxt: sideTxt, okN: okN, noN: noN };
}
function actionCard(code, a, meta, act) {
  var p = a.plan.primary, cls = p.side === 'long' ? 'long' : p.side === 'short' ? 'short' : 'neutral';
  var icon = { ok: '✓', no: '✕', mid: '–' };
  return '<div class="action ' + cls + '"><h2>今日行動摘要<span class="r">綜合信心 ' + act.conf + '/100 · 檢核 ' + act.okN + ' 有利／' + act.noN + ' 不利</span></h2>' +
    '<div class="lead"><div class="badge ' + cls + '">' + act.sideTxt + '<small>' + esc(p.action) + '</small></div><div><div class="k">' + esc(p.kind) + '</div><div class="a">' + esc(p.why[0] || '') + '</div></div></div>' +
    RU.planGrid(a) +
    '<p class="say">' + act.say + '</p>' +
    '<div class="checks">' + act.checks.map(function (c) { return '<div><i class="' + c.st + '">' + icon[c.st] + '</i><span><b style="font-weight:600">' + esc(c.label) + '</b>　' + esc(c.text) + (c.sub ? '<span class="t">' + esc(c.sub) + '</span>' : '') + '</span></div>'; }).join('') + '</div>' +
    a.plan.warnings.map(function (w) { return '<div class="warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/></svg><span>' + esc(w) + '</span></div>'; }).join('') +
    RU.sizing(a, meta) + '</div>';
}

// ---------- 頁面 ----------
function stockCtx(code, m) {
  var ci = chainInfo(code, m);
  var seasons = (m.m === 'TW' ? ['TWII'] : ['GSPC', 'IXIC']).map(function (k) { return seasonCalc(k, state.seasonWin || '20'); }).filter(Boolean);
  var settle = m.m === 'TW' ? settleCalc() : null;
  var peerCodes = ci ? (ci.kind === 'full' ? ci.peers.map(function (x) { return x.c; }) : ci.kind === 'roster' ? ci.peers.map(function (x) { return x.c; }) : ci.hits.map(function (x) { return x.c; })) : [];
  var ps = { n: 0, long: 0, short: 0, top: '', label: ci ? (ci.kind === 'full' ? ci.d.g : ci.kind === 'roster' ? (ci.sub || ci.ind) : '台灣關聯股') : '' }, best = null;
  peerCodes.filter(function (c, i, arr) { return arr.indexOf(c) === i; }).forEach(function (c) { var g = state.scan[c]; if (!g) return; ps.n++; if (g.side === 'long') ps.long++; if (g.side === 'short') ps.short++; if (!best || g.score > best.score) { best = g; ps.top = c + ' ' + nameOf(c) + '（' + g.kind.replace(/（.*?）/g, '') + '）'; } });
  return { ci: ci, seasons: seasons, settle: settle, ps: ps };
}
function renderStock(code) {
  var body = $('#stockBody'); if (!code) return;
  var meta = state.byCode[code], u = state.univByCode[code];
  if (!meta && !u) { body.className = ''; body.innerHTML = '<div class="errbox">找不到「' + esc(code) + '」。試試輸入 4 位數台股代號或美股代碼。</div>'; return; }
  var m = meta || { c: code, n: u.n, m: u.m };
  var _cx = stockCtx(code, m), ci = _cx.ci, seasons = _cx.seasons, settle = _cx.settle, ps = _cx.ps;
  var tags = '';
  if (ci && ci.kind === 'full') tags = '<span class="tags" style="margin-left:auto"><span class="pill" style="color:' + esc(ci.sec.color) + ';background:' + esc(ci.sec.soft) + '">' + esc(ci.sec.name) + '</span><span class="pill">' + esc(ci.d.g) + '</span><span class="pill">' + esc(state.supply.stages[ci.stage] || '') + '</span></span>';
  else if (ci && ci.kind === 'roster') tags = '<span class="tags" style="margin-left:auto">' + (ci.sub ? '<span class="pill" style="font-weight:600">' + esc(ci.sub) + '</span>' : '') + '<span class="pill">' + esc(ci.ind) + '</span></span>';

  if (!meta) {
    body.className = '';
    body.innerHTML = '<div class="quote stockhead">' + starBtn(code) + '<span class="name">' + esc(m.n) + '<span class="code">' + esc(code) + ' · ' + (m.m === 'TW' ? '台股' : '美股') + '</span></span>' + tags + '</div>' +
      '<div class="notice">這檔目前沒有價量資料，所以技術分析、支撐壓力與進出場尚無法計算；供應鏈、季節性與結算時點如下。執行「更新程式」把全市場資料更新後，這一頁會自動補齊。</div>' +
      '<div class="two"><div class="stack">' + chainCard(code, m, ci) + peersCard(code, m, ci) + '</div><div class="stack">' + seasonCard(m) + (settle ? settleCard() : '') + '</div></div>';
    return;
  }
  body.className = 'loading'; body.textContent = '分析 ' + code + ' ' + m.n + '…';
  Promise.all([analyzeCode(code, state.tf), analyzeCode(code, state.tf === 'W' ? 'D' : 'W').catch(function () { return null; })]).then(function (res) {
    var a = res[0], other = res[1];
    state.current = { code: code, meta: m, a: a };
    body.className = '';
    if (!a.ok) { body.innerHTML = '<div class="errbox">' + esc(a.error) + '</div>'; return; }
    var act = composeAction(code, a, m, ci, seasons, settle, ps, other);
    body.innerHTML = RU.quote(code, a, m, state.tf, tags) +
      '<div class="hero">' + RU.chartCard(a, state.tf, state.range, 'S') + ladderCard(a, m) + '</div>' +
      '<div class="two"><div class="stack">' + actionCard(code, a, m, act) + RU.perfCard(a, m) + chainCard(code, m, ci) + RU.patterns(a) + RU.vcp(a) + '</div>' +
      '<div class="stack">' + seasonCard(m) + (settle ? settleCard() : '') + RU.td(a, true) + RU.position(a) + RU.volume(a, m) + '</div></div>' +
      peersCard(code, m, ci) +
      '<div class="linkrow"><a href="#/ideas/' + esc(code) + '">新聞 → 交易策略</a><a href="#/radar">型態雷達：訊號掃描</a><a href="#/supply/' + esc(code) + '">供應鏈地圖</a><a href="#/season">週季節性</a>' + (m.m === 'TW' ? '<a href="#/settle">月結算效應</a>' : '') + '</div>';
    stockDraw = RU.bindChart(body, a, m, state.tf, 'S', function () { return state.range; }, function (n) { state.range = n; });
    RU.bindSizing(body, a, m);
  }).catch(function (err) { body.className = ''; body.innerHTML = '<div class="errbox">無法載入資料：' + esc(err.message) + '</div>'; });
}
