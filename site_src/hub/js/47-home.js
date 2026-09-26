/* ===== 大盤總覽（首頁）：加權、櫃買、標普 500、QQQ、美債 10 年殖利率 的 K 線＋九轉／十三轉＋風險／買進提示 ===== */
var HM_LIST = [
  { key: 'TWII', src: 'idx', name: '加權指數', mk: 'TW' },
  { key: 'TWOII', src: 'idx', name: '櫃買指數', mk: 'TW' },
  { key: 'GSPC', src: 'idx', name: '標普 500', mk: 'US' },
  { key: 'QQQ', src: 'stock', name: 'QQQ（那斯達克 100）', mk: 'US' },
  { key: 'TNX', src: 'idx', name: '美國 10 年期公債殖利率', mk: 'US', yld: true, fallback: { key: 'TLT', src: 'stock', name: 'TLT 美國 20 年期公債 ETF', mk: 'US', bond: true } }
];
function hmLoad(it) {
  if (it.src === 'idx') { var b = mkBars(it.key); if (b && b.length > 60) return Promise.resolve({ it: it, bars: b }); }
  else if (state.byCode[it.key]) return getBars(it.key).then(function (raw) { return { it: it, bars: E.toBars(raw) }; }).catch(function () { return it.fallback ? hmLoad(it.fallback) : { it: it, bars: null }; });
  return it.fallback ? hmLoad(it.fallback) : Promise.resolve({ it: it, bars: null });
}
function hmStats(bars, td, h9, h13) {
  var S = {}, add = function (k, i, h) { var j = i + h; if (j >= bars.length) return; (S[k] = S[k] || []).push((bars[j].c / bars[i].c - 1) * 100); };
  td.setups.forEach(function (s) { add(s.type + '9', s.endIdx, h9); });
  td.countdowns.forEach(function (c) { add(c.type + '13', c.endIdx, h13); });
  var out = {}; Object.keys(S).forEach(function (k) { var a = S[k]; out[k] = { n: a.length, mean: a.reduce(function (x, y) { return x + y; }, 0) / a.length, up: a.filter(function (x) { return x > 0; }).length / a.length * 100 }; });
  return out;
}
function hmAnalyze(bars, it, tf) {
  var n = bars.length, i = n - 1, b = bars[i], cl = bars.map(function (x) { return x.c; });
  var fastN = tf === 'W' ? 10 : 20, slowN = tf === 'W' ? 30 : 60, longN = tf === 'W' ? 52 : 240;
  var maF = E.sma(cl, fastN), maS = E.sma(cl, slowN), maL = E.sma(cl, longN), rsi = E.rsi(cl, 14), td = E.tdSequential(bars);
  var h9 = tf === 'W' ? 4 : 10, h13 = tf === 'W' ? 8 : 20, st = hmStats(bars, td, h9, h13);
  var last9 = td.setups.length ? td.setups[td.setups.length - 1] : null, last13 = td.countdowns.length ? td.countdowns[td.countdowns.length - 1] : null;
  var ago9 = last9 ? i - last9.endIdx : 999, ago13 = last13 ? i - last13.endIdx : 999;
  var r9 = ago9 <= 3 ? last9 : null, r13 = ago13 <= 5 ? last13 : null, act = td.active;
  var slopeS = maS[i] && maS[i - 5] ? (maS[i] / maS[i - 5] - 1) * 100 : 0;
  var up = maS[i] && b.c > maS[i] && slopeS > 0, dn = maS[i] && b.c < maS[i] && slopeS < 0, aboveL = maL[i] ? b.c > maL[i] : null;
  var biasF = maF[i] ? (b.c / maF[i] - 1) * 100 : 0, rs = rsi[i];
  var hi52 = -Infinity; for (var j = Math.max(0, n - (tf === 'W' ? 52 : 250)); j < n; j++) hi52 = Math.max(hi52, bars[j].h);
  var dd = (b.c / hi52 - 1) * 100;
  // 判斷（對「這個標的本身」）
  var v, why = [], sigKey = null;
  if (r13 && r13.type === 'sell') { v = { k: 'risk2', t: '高風險' }; sigKey = 'sell13'; why.push('十三轉賣 13（' + r13.date.slice(5) + '）：上漲趨勢竭盡，歷史上常見頭部'); why.push('持有者分批減碼、不追高；跌破倒數區低點 ' + fmt.p(r13.low) + ' 轉弱'); }
  else if (r13 && r13.type === 'buy') { v = { k: 'buy2', t: '可以買進' }; sigKey = 'buy13'; why.push('十三轉買 13（' + r13.date.slice(5) + '）：下跌趨勢竭盡，反轉機率高'); why.push('可分批承接，停損放倒數區低點 ' + fmt.p(r13.low) + ' 之下'); }
  else if (r9 && r9.type === 'sell') { v = { k: (rs > 65 || biasF > 4) ? 'risk2' : 'risk1', t: (rs > 65 || biasF > 4) ? '高風險' : '留意風險' }; sigKey = 'sell9'; why.push('九轉賣 9' + (r9.perfected ? '（完美）' : '') + '（' + r9.date.slice(5) + '）：連續上漲 9 根，短線過熱'); if (rs > 65 || biasF > 4) why.push('RSI ' + Math.round(rs) + '、距 ' + (tf === 'W' ? '10 週' : '月') + '線 ' + fmt.pct(biasF, 1) + '，乖離偏大，容易回檔'); why.push('TDST 支撐 ' + fmt.p(r9.tdst) + '：收盤跌破代表回檔展開'); }
  else if (r9 && r9.type === 'buy') { if (aboveL) { v = { k: 'buy1', t: '可以買進' }; why.push('多頭（站在' + (tf === 'W' ? '52 週' : '年') + '線上）中的九轉買 9' + (r9.perfected ? '（完美）' : '') + '：拉回到位'); } else { v = { k: 'watch', t: '跌深反彈' }; why.push('九轉買 9，但仍在' + (tf === 'W' ? '52 週' : '年') + '線之下：只視為反彈，不是底部'); } sigKey = 'buy9'; why.push('停損放結構最低點 ' + fmt.p(r9.extremeLow) + ' 之下；TDST 阻力 ' + fmt.p(r9.tdst)); }
  else if (act && act.count >= 10) { v = act.type === 'sell' ? { k: 'risk1', t: '留意風險' } : { k: 'watch', t: '留意買點' }; sigKey = act.type + '13'; why.push((act.type === 'sell' ? '賣出' : '買進') + '倒數 ' + act.count + '/13：接近' + (act.type === 'sell' ? '上漲' : '下跌') + '竭盡點'); }
  else if (up) { v = { k: 'hold', t: '偏多續抱' }; why.push('站上上升中的' + (tf === 'W' ? '30 週' : '季') + '線，趨勢向上'); }
  else if (dn) { v = { k: 'risk1', t: '偏空保守' }; why.push('跌破下彎的' + (tf === 'W' ? '30 週' : '季') + '線，趨勢向下'); }
  else { v = { k: 'watch', t: '觀望' }; why.push('均線走平，方向未明'); }
  if (!r9 && !r13 && act && act.count < 10) why.push((act.type === 'sell' ? '賣出' : '買進') + '倒數進行中 ' + act.count + '/13');
  if (!r9 && !r13 && last9) why.push('上次九轉：' + (last9.type === 'sell' ? '賣' : '買') + ' 9（' + last9.date + '，' + ago9 + ' 根前）');
  // 美債殖利率：對股市的含意相反
  var eq = null;
  if (it.bond) {
    if (sigKey === 'sell13' || sigKey === 'sell9') eq = { k: 'risk1', t: '留意股市風險', d: '債券價格短線過熱、殖利率可能反彈，對評價偏高的股票不利' };
    else if (sigKey === 'buy13' || sigKey === 'buy9') eq = { k: 'buy1', t: '股市壓力可望減輕', d: '債券價格跌深、殖利率可能回落，對股市偏利多' };
    else if (dn) eq = { k: 'risk1', t: '股市有壓力', d: '債券價格下跌＝殖利率上升，資金成本上升' };
    else if (up) eq = { k: 'hold', t: '對股市偏友善', d: '債券價格上漲＝殖利率下降' };
  }
  if (it.yld) {
    if (sigKey === 'sell13' || sigKey === 'sell9') eq = { k: 'buy1', t: '股市壓力可望減輕', d: '殖利率短線過熱、可能回落，對股市（尤其科技股）偏利多' };
    else if (sigKey === 'buy13' || sigKey === 'buy9') eq = { k: 'risk1', t: '留意股市風險', d: '殖利率可能止跌回升，對評價偏高的股票不利' };
    else if (up) eq = { k: 'risk1', t: '股市有壓力', d: '殖利率處於上升趨勢，資金成本上升' };
    else if (dn) eq = { k: 'hold', t: '對股市偏友善', d: '殖利率處於下降趨勢' };
  }
  var stat = sigKey && st[sigKey] ? { k: sigKey, h: /13/.test(sigKey) ? h13 : h9, s: st[sigKey] } : null;
  // 用這個標的自己的歷史修正：訊號過去常常「不準」就降一級並說明
  var SIGN = { sell9: '九轉賣 9', buy9: '九轉買 9', sell13: '十三轉賣 13', buy13: '十三轉買 13' };
  if (stat) stat.label = SIGN[sigKey];
  if (stat && stat.s.n >= 8 && (r9 || r13)) {
    var isSell = /^sell/.test(sigKey), S0 = stat.s, hTxt = stat.h + (tf === 'W' ? ' 週' : ' 日');
    if (isSell && S0.mean > 0.3 && S0.up >= 55) { if (v.k === 'risk2') v = { k: 'risk1', t: '留意風險' }; else if (v.k === 'risk1') v = { k: 'watch', t: '短線整理' }; why.push('但這個標的過去 ' + S0.n + ' 次' + stat.label + '後 ' + hTxt + '平均仍 ' + fmt.pct(S0.mean, 1) + '、上漲機率 ' + Math.round(S0.up) + '%：比較像短暫整理，不一定是頭部'); stat.used = true; }
    else if (!isSell && S0.mean < -0.3 && S0.up <= 45) { if (/buy/.test(v.k)) v = { k: 'watch', t: '謹慎試單' }; why.push('但這個標的過去 ' + S0.n + ' 次' + stat.label + '後 ' + hTxt + '平均 ' + fmt.pct(S0.mean, 1) + '、上漲機率 ' + Math.round(S0.up) + '%：常常還會再跌，別一次買滿'); stat.used = true; }
  }
  // 殖利率本身沒有「買進／續抱」：改用中性描述，股市含意看「對股市」那顆
  if (it.yld) { var YT = { '高風險': '殖利率過熱', '留意風險': '殖利率偏高檔', '偏空保守': '殖利率下降中', '可以買進': '殖利率超跌', '偏多續抱': '殖利率上升中', '觀望': '殖利率盤整', '跌深反彈': '殖利率偏低檔', '留意買點': '殖利率偏低檔', '謹慎試單': '殖利率偏低檔', '短線整理': '殖利率高檔整理' }; v = { k: 'watch', t: YT[v.t] || '殖利率盤整' }; }
  return { bars: bars, td: td, maF: maF, maS: maS, fastN: fastN, slowN: slowN, rsi: rs, v: v, why: why, eq: eq, stat: stat, st: st, dd: dd, chg: (b.c / bars[i - 1].c - 1) * 100, h9: h9, h13: h13 };
}
function hmDraw(cv, A, range) {
  if (!cv) return;
  var bars = A.bars, css = getComputedStyle(document.documentElement), tok = function (n) { return css.getPropertyValue(n).trim(); };
  var W = cv.clientWidth || 520, H = 250, dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  var N = Math.min(range, bars.length), s0 = bars.length - N, view = bars.slice(s0), padL = 6, padR = 58, padT = 28, padB = 20, pH = H - padT - padB, pW = W - padL - padR;
  var hi = -Infinity, lo = Infinity; view.forEach(function (b) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); }); var pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
  var cw = pW / N, bw = Math.max(1, Math.min(9, cw * 0.62)), X = function (k) { return padL + (k - s0) * cw + cw / 2; }, Y = function (p) { return padT + (hi - p) / (hi - lo) * pH; };
  ctx.strokeStyle = tok('--grid'); ctx.lineWidth = 1; ctx.fillStyle = tok('--ink3'); ctx.font = '10px ' + tok('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (var g = 0; g <= 4; g++) { var pv = lo + (hi - lo) * g / 4, y = Y(pv); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(fmt.p(pv), W - padR + 5, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; var lastM = '', lastX = -1e9;
  view.forEach(function (b, k) { var m = b.d.slice(0, 7); if (m !== lastM) { lastM = m; var x = X(s0 + k); if (k > 2 && x - lastX >= 46 && x < W - padR - 16) { ctx.fillText(m.slice(2).replace('-', '/'), x, H - padB + 5); lastX = x; } } });
  [[A.maF, '--ma20'], [A.maS, '--ma60']].forEach(function (ms) { ctx.strokeStyle = tok(ms[1]); ctx.lineWidth = 1.3; ctx.beginPath(); var on = false; for (var k = s0; k < bars.length; k++) { if (ms[0][k] == null) continue; if (!on) { ctx.moveTo(X(k), Y(ms[0][k])); on = true; } else ctx.lineTo(X(k), Y(ms[0][k])); } ctx.stroke(); });
  var upC = tok('--up'), dnC = tok('--dn');
  view.forEach(function (b, k) { var x = X(s0 + k), u = b.c >= b.o, col = u ? upC : dnC; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, Y(b.h)); ctx.lineTo(x, Y(b.l)); ctx.stroke(); var t = Math.min(Y(b.o), Y(b.c)), hh = Math.max(1, Math.abs(Y(b.o) - Y(b.c))); if (u && bw >= 4) { ctx.fillStyle = tok('--panel'); ctx.fillRect(x - bw / 2, t, bw, hh); ctx.strokeRect(x - bw / 2 + .5, t + .5, bw - 1, hh - 1); } else ctx.fillRect(x - bw / 2, t, bw, hh); });
  // 只畫完成的 9 與 13（不畫倒數過程）
  ctx.font = '600 9.5px ' + tok('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  A.td.setups.forEach(function (s) { if (s.endIdx < s0) return; var b = bars[s.endIdx], sell = s.type === 'sell', col = sell ? upC : dnC, x = X(s.endIdx), y = Math.max(8, Math.min(H - padB - 8, sell ? Y(b.h) - 10 : Y(b.l) + 10)); ctx.fillStyle = col; ctx.fillRect(x - 6.5, y - 6.5, 13, 13); ctx.fillStyle = '#fff'; ctx.fillText('9', x, y + .5); });
  A.td.countdowns.forEach(function (c) { if (c.endIdx < s0) return; var b = bars[c.endIdx], sell = c.type === 'sell', col = sell ? upC : dnC, x = X(c.endIdx), y = Math.max(11, Math.min(H - padB - 11, sell ? Y(b.h) - 26 : Y(b.l) + 26)); ctx.fillStyle = tok('--panel'); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.fillText('13', x, y + .5); });
  var lb = bars[bars.length - 1], ly = Y(lb.c), lc = lb.c >= bars[bars.length - 2].c ? upC : dnC; ctx.fillStyle = lc; ctx.fillRect(W - padR + 1, ly - 8, padR - 2, 16); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '600 10px ' + tok('--mono'); ctx.fillText(fmt.p(lb.c), W - padR + 5, ly + .5);
}
function hmVB(v) { return '<span class="vb ' + v.k + '">' + esc(v.t) + '</span>'; }
function hmCard(R, tf, idx) {
  if (!R.bars) return '<div class="card hmcard"><h3>' + esc(R.it.name) + '</h3><div class="note" style="margin:0">尚無資料（下次自動更新後會出現）。</div></div>';
  var A = R.A, b = A.bars[A.bars.length - 1], it = R.it, u = it.yld && it.key === 'TNX' ? '%' : '';
  var statTxt = A.stat && !A.stat.used ? '過去 ' + A.stat.s.n + ' 次' + A.stat.label + '後 ' + A.stat.h + (tf === 'W' ? ' 週' : ' 日') + '平均 <b class="num ' + (A.stat.s.mean >= 0 ? 'up' : 'dn') + '">' + fmt.pct(A.stat.s.mean, 2) + '</b>、上漲機率 ' + Math.round(A.stat.s.up) + '%' + (it.yld ? '（殖利率本身）' : '') : '';
  return '<div class="card hmcard"><div class="hmhead"><div><div class="hmname">' + esc(it.name) + '</div><div><span class="num hmpx">' + fmt.p(b.c) + u + '</span> <span class="num ' + (A.chg >= 0 ? 'up' : 'dn') + '">' + fmt.pct(A.chg) + '</span> <span class="muted" style="font-size:11.5px">' + esc(b.d) + '</span></div></div><div class="hmv">' + hmVB(A.v) + (A.eq ? '<div class="muted" style="font-size:11px;margin-top:4px;text-align:right">對股市：' + hmVB(A.eq) + '</div>' : '') + '</div></div>' +
    '<canvas class="hmcv" data-hm="' + idx + '"></canvas>' +
    '<ul class="hmwhy">' + A.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + (A.eq ? '<li>' + esc(A.eq.d) + '</li>' : '') + (statTxt ? '<li>' + statTxt + '</li>' : '') + '</ul>' +
    '<div class="hmfoot muted">RSI ' + (A.rsi != null ? Math.round(A.rsi) : '—') + ' · 距 52 週高 ' + fmt.pct(A.dd, 1) + ' · 九轉：' + esc(A.td.status ? A.td.status.split('；')[0] : '') + '</div></div>';
}
function renderHome() {
  var body = $('#homeBody'); body.className = '';
  var tf = state.tf, range = state.hmRange || (tf === 'W' ? 104 : 120);
  body.innerHTML = '<div class="pagehead"><div><h2>大盤總覽</h2><p>加權、櫃買、標普 500、QQQ、美債殖利率的 K 線，標出完成的九轉（9）與十三轉（13），並依訊號、趨勢與乖離給出「可以買進／留意風險」提示。' + (tf === 'W' ? '目前是週線。' : '右上角可切換週線。') + '</p></div><div class="tools"><div class="seg" id="hmRange">' + (tf === 'W' ? [[52, '1 年'], [104, '2 年'], [260, '5 年']] : [[60, '3 月'], [120, '6 月'], [250, '1 年']]).map(function (r) { return '<button data-r="' + r[0] + '" aria-pressed="' + (range === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</div></div></div><div id="hmSum"></div><div class="hmgrid" id="hmGrid"><div class="loading" style="padding:30px">載入中…</div></div>' +
    '<div class="note" style="margin-top:12px">圖上 <b>9</b>＝九轉結構完成（上方＝連漲 9 根賣訊、下方＝連跌 9 根買訊），<b>⑬</b>＝十三轉倒數完成（趨勢竭盡）。只畫完成的訊號，不畫倒數過程。提示為規則推演，不構成投資建議。</div>';
  $('#hmRange', body).onclick = function (e) { var bt = e.target.closest('[data-r]'); if (!bt) return; state.hmRange = +bt.dataset.r; renderHome(); };
  Promise.all(HM_LIST.map(hmLoad)).then(function (list) {
    list.forEach(function (R) { if (!R.bars) return; var bars = tf === 'W' ? E.toWeekly(R.bars) : R.bars; R.A = hmAnalyze(bars, R.it, tf); });
    state.hmList = list;
    var grid = $('#hmGrid', body); if (!grid) return;
    grid.innerHTML = list.map(function (R, k) { return hmCard(R, tf, k); }).join('');
    $$('.hmcv', grid).forEach(function (cv) { var R = list[+cv.dataset.hm]; if (R && R.A) hmDraw(cv, R.A, range); });
    // 綜合
    var M = state.indices ? mkModel() : null, eqs = list.filter(function (R) { return R.A && !R.it.yld && !R.it.bond; }), risk = eqs.filter(function (R) { return /risk/.test(R.A.v.k); }), buy = eqs.filter(function (R) { return /buy/.test(R.A.v.k); });
    var y = list.find(function (R) { return (R.it.yld || R.it.bond) && R.A; }), yRisk = y && y.A.eq && /risk/.test(y.A.eq.k);
    var hold = eqs.filter(function (R) { return R.A.v.k === 'hold'; });
    var tone = risk.length >= 3 || (risk.length >= 2 && yRisk) ? { k: 'risk2', t: '風險偏高' } : buy.length >= 2 && !risk.length ? { k: 'buy1', t: '偏多、可逢低布局' } : !risk.length && buy.length + hold.length >= 3 ? { k: 'hold', t: '偏多' } : risk.length > buy.length ? { k: 'risk1', t: '留意風險' } : buy.length > risk.length ? { k: 'buy1', t: '偏多' } : { k: 'watch', t: '中性' };
    $('#hmSum', body).innerHTML = '<div class="card" style="margin-bottom:14px"><div class="hmsum"><div><div class="muted" style="font-size:12px">綜合判斷</div><div style="margin-top:4px">' + hmVB(tone) + '</div></div><div class="hmsumtxt">' + (risk.length ? '風險提示：' + risk.map(function (R) { return esc(R.it.name.replace(/（.*/, '')) + '（' + esc(R.A.v.t) + '）'; }).join('、') + '。' : '') + (buy.length ? '買進訊號：' + buy.map(function (R) { return esc(R.it.name.replace(/（.*/, '')) + '（' + esc(R.A.v.t) + '）'; }).join('、') + '。' : '') + (y && y.A.eq ? '美債：' + esc(y.A.eq.t) + '。' : '') + (!risk.length && !buy.length ? '目前沒有九轉／十三轉訊號，依趨勢操作。' : '') + '</div>' + (M ? '<a class="hmexpo" href="#/market"><div class="muted" style="font-size:12px">台股建議水位</div><div class="num" style="font-size:24px;font-weight:700">' + M.cb.expo + '%</div></a>' : '') + '</div></div>';
  }).catch(function (e) { var g = $('#hmGrid', body); if (g) g.innerHTML = '<div class="errbox">載入失敗：' + esc(e.message) + '</div>'; });
}
window.addEventListener('resize', function () { if (state.route && state.route.route === 'home' && state.hmList) $$('#hmGrid .hmcv').forEach(function (cv) { var R = state.hmList[+cv.dataset.hm]; if (R && R.A) hmDraw(cv, R.A, state.hmRange || (state.tf === 'W' ? 104 : 120)); }); });
