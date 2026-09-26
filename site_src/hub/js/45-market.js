/* ===== 市場水位：加權＋櫃買 → 建議持股水位、加碼／減碼／清倉、跌破／突破價位 ===== */
var MK_NAMES = { TWII: '加權指數', TWOII: '櫃買指數', GSPC: '標普 500', IXIC: '那斯達克', SOX: '費半' };
function mkBars(key) { var I = state.indices; if (!I || !I.bars || !I.bars[key]) return null; if (!state._idxBars) state._idxBars = {}; if (!state._idxBars[key]) state._idxBars[key] = E.toBars(I.bars[key]); return state._idxBars[key]; }
// 單一指數在第 i 根的技術狀態（close 可覆寫，用來模擬「跌破／突破某價位之後」的分數）
function mkIndexState(bars, i, closeOverride) {
  var c = closeOverride != null ? closeOverride : bars[i].c, cl = bars.map(function (b) { return b.c; });
  var ind = bars._ind || (bars._ind = { ma20: E.sma(cl, 20), ma60: E.sma(cl, 60), ma120: E.sma(cl, 120), ma240: E.sma(cl, 240), atr: E.atr(bars, 14), rsi: E.rsi(cl, 14) });
  var ma20 = ind.ma20[i], ma60 = ind.ma60[i], ma120 = ind.ma120[i], ma240 = ind.ma240[i];
  var s20 = ma20 && ind.ma20[i - 5] ? (ma20 / ind.ma20[i - 5] - 1) * 100 : 0, s60 = ma60 && ind.ma60[i - 10] ? (ma60 / ind.ma60[i - 10] - 1) * 100 : 0, s240 = ma240 && ind.ma240[i - 20] ? (ma240 / ind.ma240[i - 20] - 1) * 100 : 0;
  var hi20 = -Infinity, lo20 = Infinity, hi60 = -Infinity, lo60 = Infinity, hi250 = -Infinity, lo250 = Infinity;
  for (var j = Math.max(0, i - 19); j <= i; j++) { hi20 = Math.max(hi20, bars[j].h); lo20 = Math.min(lo20, bars[j].l); }
  for (j = Math.max(0, i - 59); j <= i; j++) { hi60 = Math.max(hi60, bars[j].h); lo60 = Math.min(lo60, bars[j].l); }
  for (j = Math.max(0, i - 249); j <= i; j++) { hi250 = Math.max(hi250, bars[j].h); lo250 = Math.min(lo250, bars[j].l); }
  // 分配日（O'Neil）：近 25 根，跌 ≥0.2% 且量比前一日大；反彈確認日：低點後第 4–10 天大漲 ≥1.5% 且量增
  var dist = 0; for (j = Math.max(1, i - 24); j <= i; j++) { if (bars[j].c < bars[j - 1].c * 0.998 && bars[j].v > bars[j - 1].v) dist++; }
  var ftd = false; if (c < (ma60 || c) && i >= 12) { var loI = i; for (j = i - 12; j <= i; j++) if (bars[j].l < bars[loI].l) loI = j; for (j = loI + 3; j <= i && j <= loI + 10; j++) { if (bars[j].c > bars[j - 1].c * 1.015 && bars[j].v > bars[j - 1].v) { ftd = true; break; } } }
  var atr = ind.atr[i] || (bars[i].h - bars[i].l), atrPct = atr / c * 100, dd = (c / hi250 - 1) * 100;
  // 趨勢分數（滿分 60）
  var t = 0; if (ma20 && c > ma20) t += 10; if (ma60 && c > ma60) t += 14; if (ma240 && c > ma240) t += 14; if (ma20 && ma60 && ma20 > ma60) t += 8; if (s60 > 0) t += 8; if (s240 > 0) t += 6;
  // 波動與籌碼（滿分 40）
  var v = 0; v += dist <= 1 ? 16 : dist <= 3 ? 10 : dist === 4 ? 4 : 0; v += atrPct < 1.2 ? 10 : atrPct < 2 ? 6 : atrPct < 3 ? 2 : 0; v += dd > -3 ? 14 : dd > -7 ? 10 : dd > -12 ? 5 : 0;
  var stage = ma240 && c > ma240 && s240 > 0 ? (ma60 && c > ma60 ? '第二階段（上升期）' : '上升期回檔') : ma240 && c < ma240 && s240 < 0 ? (ma60 && c < ma60 ? '第四階段（下跌期）' : '下跌期反彈') : c > (ma60 || c) ? '築底／轉強' : '作頭／轉弱';
  return { c: c, ma20: ma20, ma60: ma60, ma120: ma120, ma240: ma240, s20: s20, s60: s60, s240: s240, hi20: hi20, lo20: lo20, hi60: hi60, lo60: lo60, hi250: hi250, lo250: lo250, dist: dist, ftd: ftd, atr: atr, atrPct: atrPct, dd: dd, rsi: ind.rsi[i], trend: t, volSc: v, stage: stage };
}
// 廣度（由掃描結果）：上升期比例、多空訊號比、新高新低
function mkBreadth() {
  var n = 0, up = 0, down = 0, lng = 0, sht = 0, nh = 0, nl = 0, tt = 0;
  (state.index ? state.index.stocks : []).forEach(function (s) { if (s.m !== 'TW') return; var g = state.scan[s.c]; if (!g) return; n++; if ((g.stage || '').indexOf('第二') === 0) up++; if ((g.stage || '').indexOf('第四') === 0) down++; if (g.side === 'long') lng++; if (g.side === 'short') sht++; if (g.pos52 >= 90) nh++; if (g.pos52 <= 10) nl++; if (g.tt >= 6) tt++; });
  if (!n) return null;
  var pUp = up / n * 100, pSig = (lng + sht) ? lng / (lng + sht) * 100 : 50, pTT = tt / n * 100;
  var sc = 0; sc += pUp >= 60 ? 12 : pUp >= 45 ? 8 : pUp >= 30 ? 4 : 0; sc += pSig >= 60 ? 7 : pSig >= 45 ? 4 : 0; sc += nh > nl ? 6 : nh === nl ? 3 : 0;
  return { n: n, up: up, down: down, pUp: pUp, lng: lng, sht: sht, pSig: pSig, nh: nh, nl: nl, tt: tt, pTT: pTT, score: sc, max: 25, weak: n < 30 };
}
function mkExposureFromScore(S) { return S >= 80 ? 100 : S >= 65 ? 80 : S >= 50 ? 60 : S >= 35 ? 40 : S >= 20 ? 20 : 0; }
// 總分：加權（趨勢 60＋波動 40）×0.6 ＋ 櫃買 ×0.25 ＋ 廣度 ×0.15（無廣度時以指數分數代替）；硬規則設上限／下限
function mkCombine(tw, otc, br, ratio20) {
  var sTW = tw.trend + tw.volSc, sOTC = otc ? otc.trend + otc.volSc : sTW;
  var sBR = br ? br.score / br.max * 100 : (sTW + sOTC) / 2;
  if (br && br.weak) sBR = (sBR + (sTW + sOTC) / 2) / 2;
  var S = sTW * 0.6 + sOTC * 0.25 + sBR * 0.15;
  if (ratio20 != null) S += ratio20 > 1 ? 3 : ratio20 < -1 ? -3 : 0; // 櫃買相對加權 20 日強弱（資金風險偏好）
  S = Math.max(0, Math.min(100, S));
  var expo = mkExposureFromScore(S), caps = [], floors = [];
  if (tw.ma60 && tw.c < tw.ma60 && tw.s60 < 0) caps.push({ v: 40, why: '加權在下彎的季線之下' });
  if (tw.ma240 && tw.c < tw.ma240) caps.push({ v: 20, why: '加權在年線之下' });
  if (tw.dist >= 5) caps.push({ v: 50, why: '25 日內出現 ' + tw.dist + ' 個分配日（法人出貨）' });
  if (otc && otc.ma60 && otc.c < otc.ma60 && tw.ma60 && tw.c > tw.ma60) caps.push({ v: 60, why: '櫃買跌破季線、與加權背離（中小型股先弱）' });
  if (otc && otc.dist >= 6) caps.push({ v: 80, why: '櫃買 25 日內 ' + otc.dist + ' 個分配日（中小型股籌碼鬆動）' });
  if (tw.ftd && expo < 40) floors.push({ v: 40, why: '出現反彈確認日（低點後第 4–10 天帶量大漲）' });
  caps.forEach(function (x) { expo = Math.min(expo, x.v); }); floors.forEach(function (x) { expo = Math.max(expo, x.v); });
  return { S: Math.round(S), sTW: sTW, sOTC: sOTC, sBR: Math.round(sBR), expo: expo, caps: caps, floors: floors };
}
function mkRatio20(tw, otc) { if (!otc || tw.length < 21 || otc.length < 21) return null; var a = tw[tw.length - 1].c / tw[tw.length - 21].c, b = otc[otc.length - 1].c / otc[otc.length - 21].c; return (b / a - 1) * 100; }
// 關鍵價位：對每個價位模擬「收在該價位下／上方」重新計分 → 得到跌破／突破後的水位
function mkLevels(bars, other, br, ratio20, isTW) {
  var i = bars.length - 1, st = mkIndexState(bars, i), c = st.c, off = Math.max(0, bars.length - 160), sw = E.swings(bars.slice(off), 3, 2.5);
  var cands = [];
  function add(p, name, w) { if (p && isFinite(p) && Math.abs(p / c - 1) > 0.002 && Math.abs(p / c - 1) < 0.25) cands.push({ p: p, name: name, w: w }); }
  add(st.ma20, 'MA20 月線', 4); add(st.ma60, 'MA60 季線', 6); add(st.ma120, 'MA120 半年線', 4); add(st.ma240, 'MA240 年線', 7);
  add(st.lo20, '20 日低點', 5); add(st.hi20, '20 日高點', 5); add(st.lo60, '60 日低點', 5); add(st.hi60, '60 日高點', 5); add(st.hi250, '52 週高點', 6); add(st.lo250, '52 週低點', 6);
  sw.slice(-6).forEach(function (s) { if (s.tail) return; add(s.p, (s.t === 'H' ? '前波高點 ' : '前波低點 ') + bars[off + s.i].d.slice(5), 5); });
  var oState = other ? mkIndexState(other, other.length - 1) : null;
  function expoAt(px) { var s2 = mkIndexState(bars, i, px); var tw = isTW ? s2 : mkIndexState(other, other.length - 1), otc = isTW ? oState : s2; return mkCombine(tw, otc, br, ratio20).expo; }
  var now = expoAt(null);
  cands.sort(function (a, b) { return b.p - a.p; });
  var merged = []; cands.forEach(function (x) { var l = merged[merged.length - 1]; if (l && Math.abs(x.p / l.p - 1) <= 0.005) { l.name += '／' + x.name; l.w = Math.max(l.w, x.w); } else merged.push(x); });
  var below = merged.filter(function (x) { return x.p < c; }).map(function (x) { x.to = expoAt(x.p * 0.995); x.d = (x.p / c - 1) * 100; return x; });
  var above = merged.filter(function (x) { return x.p > c; }).map(function (x) { x.to = expoAt(x.p * 1.005); x.d = (x.p / c - 1) * 100; return x; });
  // 只留「會改變水位」或權重高的價位，每側最多 4 個
  var keep = function (arr, dir) { var last = now, out = []; arr.forEach(function (x) { if (x.to !== last || x.w >= 6) { out.push(x); last = x.to; } }); return out.slice(0, 4); };
  return { now: now, state: st, below: keep(below.sort(function (a, b) { return b.p - a.p; })), above: keep(above.sort(function (a, b) { return a.p - b.p; })) };
}
// 歷史回測：只用指數本身（趨勢＋波動，無廣度）逐日算水位，隔日套用
function mkBacktest(tw, otc) {
  var n = tw.length, eqS = 1, eqH = 1, pkS = 1, pkH = 1, ddS = 0, ddH = 0, curve = [], expo = 100, changes = 0, prevE = null, byYear = {}, pend = null, pendV = null;
  var otcByDate = {}; if (otc) otc.forEach(function (b, i) { otcByDate[b.d] = i; });
  var from = Math.max(250, 0);
  for (var i = from; i < n - 1; i++) {
    var st = mkIndexState(tw, i), oi = otc ? otcByDate[tw[i].d] : null, os = oi != null ? mkIndexState(otc, oi) : null;
    var r20 = otc && oi != null && oi >= 20 && i >= 20 ? ((otc[oi].c / otc[oi - 20].c) / (tw[i].c / tw[i - 20].c) - 1) * 100 : null;
    var cb = mkCombine(st, os, null, r20), want = cb.expo;
    // 遲滯：建議值與目前差 ≥40 立即調整，否則要連續 3 天同一建議才調整（避免來回洗）
    if (prevE == null) expo = want; else if (want !== expo) { if (Math.abs(want - expo) >= 40) expo = want; else { pend = pend != null && pendV === want ? pend + 1 : 1; pendV = want; if (pend >= 3) expo = want; } }
    if (want === expo) { pend = null; pendV = null; }
    if (prevE != null && expo !== prevE) changes++; prevE = expo;
    var ret = tw[i + 1].c / tw[i].c - 1; eqS *= 1 + ret * expo / 100; eqH *= 1 + ret; pkS = Math.max(pkS, eqS); pkH = Math.max(pkH, eqH); ddS = Math.min(ddS, eqS / pkS - 1); ddH = Math.min(ddH, eqH / pkH - 1);
    var y = tw[i + 1].d.slice(0, 4); byYear[y] = byYear[y] || { s: 1, h: 1 }; byYear[y].s *= 1 + ret * expo / 100; byYear[y].h *= 1 + ret;
    if (i % 2 === 0) curve.push({ d: tw[i + 1].d, s: eqS, h: eqH, e: expo });
  }
  var yrs = (n - 1 - from) / 245;
  return { n: n - 1 - from, years: yrs, retS: (eqS - 1) * 100, retH: (eqH - 1) * 100, cagrS: (Math.pow(eqS, 1 / yrs) - 1) * 100, cagrH: (Math.pow(eqH, 1 / yrs) - 1) * 100, ddS: ddS * 100, ddH: ddH * 100, curve: curve, changes: changes, byYear: byYear, from: tw[from].d };
}
function mkDrawCurve(canvas, bt) {
  var dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 600, H = canvas.clientHeight || 220; canvas.width = W * dpr; canvas.height = H * dpr;
  var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  var cs = getComputedStyle(document.documentElement), ink3 = cs.getPropertyValue('--ink3').trim() || '#888', acc = cs.getPropertyValue('--accent').trim() || '#3b82f6', up = cs.getPropertyValue('--up').trim() || '#d33';
  var pts = bt.curve; if (!pts.length) return;
  var min = Math.min.apply(null, pts.map(function (p) { return Math.min(p.s, p.h); })), max = Math.max.apply(null, pts.map(function (p) { return Math.max(p.s, p.h); }));
  var pl = 44, pr = 10, pt = 8, pb = 40, x = function (i) { return pl + (W - pl - pr) * i / (pts.length - 1); }, y = function (v) { return pt + (H - pt - pb - 22) * (1 - (v - min) / (max - min || 1)); };
  // 水位帶（底部）
  var yb0 = H - pb - 18, yb1 = H - pb; ctx.fillStyle = acc; pts.forEach(function (p, i) { ctx.globalAlpha = 0.15 + p.e / 100 * 0.7; ctx.fillRect(x(i), yb0, Math.max(1, (W - pl - pr) / pts.length + 0.5), yb1 - yb0); }); ctx.globalAlpha = 1;
  ctx.fillStyle = ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('水位', 4, yb1 - 4);
  ctx.strokeStyle = ink3; ctx.globalAlpha = .5; ctx.lineWidth = 1.2; ctx.beginPath(); pts.forEach(function (p, i) { i ? ctx.lineTo(x(i), y(p.h)) : ctx.moveTo(x(i), y(p.h)); }); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach(function (p, i) { i ? ctx.lineTo(x(i), y(p.s)) : ctx.moveTo(x(i), y(p.s)); }); ctx.stroke();
  ctx.fillStyle = ink3; ctx.textAlign = 'right'; [min, max].forEach(function (v) { ctx.fillText(((v - 1) * 100).toFixed(0) + '%', pl - 4, y(v) + 4); });
  ctx.textAlign = 'left'; ctx.fillText(pts[0].d, pl, H - 4); ctx.textAlign = 'right'; ctx.fillText(pts[pts.length - 1].d, W - pr, H - 4);
  ctx.textAlign = 'left'; ctx.fillStyle = acc; ctx.fillText('■ 水位策略', pl + 60, H - 4); ctx.fillStyle = ink3; ctx.fillText('■ 滿倉持有', pl + 130, H - 4);
}
function mkCurrentExposure() { var D = Store.portfolio.data; if (D.exposure != null && D.exposure !== '') return { v: +D.exposure, src: 'manual' }; return null; }
function mkModel() {
  var tw = mkBars('TWII'), otc = mkBars('TWOII'); if (!tw) return null;
  var twS = mkIndexState(tw, tw.length - 1), otcS = otc ? mkIndexState(otc, otc.length - 1) : null, br = mkBreadth(), r20 = mkRatio20(tw, otc);
  var cb = mkCombine(twS, otcS, br, r20);
  var cur = mkCurrentExposure(), act;
  if (cb.expo === 0) act = { k: 'out', t: '清倉', d: '市場結構轉空，只留現金；等反彈確認日或站回季線再說' };
  else if (!cur) act = { k: 'hold', t: '水位 ' + cb.expo + '%', d: '在下方填入目前持股水位，系統會告訴你該加還是該減' };
  else if (cb.expo - cur.v >= 15) act = { k: 'add', t: '加碼', d: '從 ' + cur.v + '% 加到 ' + cb.expo + '%，只加交易點子頁通過檢核的標的、分兩批' };
  else if (cur.v - cb.expo >= 15) act = { k: 'cut', t: '減碼', d: '從 ' + cur.v + '% 減到 ' + cb.expo + '%：先砍虧損最大、最弱勢的部位' };
  else act = { k: 'hold', t: '維持', d: '目前 ' + cur.v + '% 與建議 ' + cb.expo + '% 相近，不動；照下方價位表執行' };
  var lvTW = mkLevels(tw, otc, br, r20, true), lvOTC = otc ? mkLevels(otc, tw, br, r20, false) : null;
  return { tw: tw, otc: otc, twS: twS, otcS: otcS, br: br, r20: r20, cb: cb, cur: cur, act: act, lvTW: lvTW, lvOTC: lvOTC, date: tw[tw.length - 1].d };
}
function mkIndexCard(key, bars, st, lv) {
  var c = st.c, chg = (c / bars[bars.length - 2].c - 1) * 100;
  var fact = function (l, v, ok) { return '<div><span class="muted" style="font-size:11px">' + l + '</span><b style="display:block;font-family:var(--mono);font-size:14px" class="' + (ok === true ? 'up' : ok === false ? 'dn' : '') + '">' + v + '</b></div>'; };
  var rowL = function (x, dir) { var cls = x.to > lv.now ? 'up' : x.to < lv.now ? 'dn' : ''; return '<div class="lvl"><span class="p">' + fmt.p(x.p) + '</span><span>' + (dir === 'dn' ? '跌破 ' : '突破 ') + esc(x.name) + '</span><span class="to ' + cls + '">' + (x.to === lv.now ? '維持 ' : '→ ') + x.to + '%</span><span class="d">' + fmt.pct(x.d, 1) + '</span></div>'; };
  return '<div class="card"><h3>' + MK_NAMES[key] + '<span class="r">' + esc(bars[bars.length - 1].d) + '</span></h3>' +
    '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="num" style="font-size:26px;font-weight:700">' + fmt.p(c) + '</span><span class="num ' + (chg >= 0 ? 'up' : 'dn') + '">' + fmt.pct(chg) + '</span><span class="pill">' + esc(st.stage) + '</span><span class="pill">趨勢 ' + st.trend + '/60 · 波動籌碼 ' + st.volSc + '/40</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px 10px;margin:10px 0">' + fact('月線 MA20', fmt.p(st.ma20) + ' ' + (st.ma20 ? fmt.pct((c / st.ma20 - 1) * 100, 1) : ''), st.ma20 ? c > st.ma20 : null) + fact('季線 MA60', fmt.p(st.ma60) + ' ' + (st.ma60 ? fmt.pct((c / st.ma60 - 1) * 100, 1) : ''), st.ma60 ? c > st.ma60 : null) + fact('年線 MA240', fmt.p(st.ma240) + ' ' + (st.ma240 ? fmt.pct((c / st.ma240 - 1) * 100, 1) : ''), st.ma240 ? c > st.ma240 : null) + fact('距 52 週高', fmt.pct(st.dd, 1), st.dd > -5 ? true : st.dd < -10 ? false : null) + fact('分配日（25 日）', st.dist + ' 個', st.dist <= 2 ? true : st.dist >= 5 ? false : null) + fact('ATR 波動', st.atrPct.toFixed(2) + '%', st.atrPct < 1.5 ? true : st.atrPct > 2.5 ? false : null) + '</div>' +
    '<div style="font-size:12px;color:var(--ink3);margin:6px 0 2px">向上：突破就加碼到</div>' + (lv.above.length ? lv.above.slice().reverse().map(function (x) { return rowL(x, 'up'); }).join('') : '<div class="note" style="margin:0">上方 25% 內沒有關鍵壓力。</div>') +
    '<div class="lvl" style="background:var(--panel2);border-radius:8px;padding:6px 8px;margin:4px 0"><span class="p">' + fmt.p(c) + '</span><span>現價</span><span class="to">' + lv.now + '%</span><span class="d"></span></div>' +
    '<div style="font-size:12px;color:var(--ink3);margin:2px 0">向下：跌破就減碼到</div>' + (lv.below.length ? lv.below.map(function (x) { return rowL(x, 'dn'); }).join('') : '<div class="note" style="margin:0">下方 25% 內沒有關鍵支撐。</div>') + '</div>';
}
function renderMarket() {
  var body = $('#marketBody'); body.className = '';
  var M = mkModel();
  if (!M) { body.innerHTML = '<div class="pagehead"><div><h2>市場水位</h2></div></div><div class="errbox">沒有指數資料。執行更新程式後會抓加權與櫃買指數（update_data.py 已加入 ^TWII、^TWOII）。</div>'; return; }
  var cb = M.cb, cur = M.cur, act = M.act;
  var html = '<div class="pagehead"><div><h2>市場水位 · 風險儀表</h2><p>用加權指數與櫃買指數的趨勢、波動、分配日，加上全市場廣度，算出現在該持有多少水位；並模擬「跌破／突破某個價位之後」的分數，直接告訴你跌破哪要減到多少、突破哪可以加到多少。</p></div><div class="tools"><span class="muted" style="font-size:12px">資料至 ' + esc(M.date) + '</span></div></div>';
  // 儀表
  html += '<div class="card"><div class="dial"><div><div class="big">' + cb.expo + '<small>%</small></div><div class="muted" style="font-size:12px">建議持股水位</div><div class="act ' + act.k + '">' + esc(act.t) + '</div></div><div><div style="font-size:14px;line-height:1.7">' + esc(act.d) + '</div>' +
    '<div class="gauge"><i style="left:' + cb.expo + '%"></i>' + (cur ? '<i class="cur" style="left:' + Math.min(100, Math.max(0, cur.v)) + '%"></i>' : '') + '</div><div class="gauge-l"><span>0% 清倉</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100% 滿倉</span></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px;font-size:12.5px"><span>目前水位：' + (cur ? '<b class="num">' + cur.v + '%</b>' : '<span class="muted">未設定</span>') + '</span><form id="mkExpo" class="form" style="display:inline-grid;grid-template-columns:110px 130px auto;gap:6px;align-items:center"><input type="number" name="exposure" min="0" max="150" step="5" placeholder="目前水位 %" value="' + (Store.portfolio.data.exposure != null ? esc(Store.portfolio.data.exposure) : '') + '"><input type="number" name="capital" min="0" step="10000" placeholder="總資金（算張數用）" value="' + (Store.portfolio.data.capital ? esc(Store.portfolio.data.capital) : '') + '"><button class="btn small" type="submit">設定</button></form></div></div></div>' +
    '<div class="scores" style="margin-top:14px"><div>總分<b>' + cb.S + ' / 100</b><div class="bar"><i style="width:' + cb.S + '%"></i></div></div><div>加權指數（60%）<b>' + cb.sTW + '</b>趨勢 ' + M.twS.trend + ' ＋ 波動籌碼 ' + M.twS.volSc + '<div class="bar"><i style="width:' + cb.sTW + '%"></i></div></div><div>櫃買指數（25%）<b>' + (M.otcS ? cb.sOTC : '—') + '</b>' + (M.otcS ? '趨勢 ' + M.otcS.trend + ' ＋ 波動籌碼 ' + M.otcS.volSc : '無資料，以加權代替') + '<div class="bar"><i style="width:' + cb.sOTC + '%"></i></div></div><div>市場廣度（15%）<b>' + (M.br ? cb.sBR : '—') + '</b>' + (M.br ? '上升期 ' + M.br.pUp.toFixed(0) + '% · 多訊號 ' + M.br.pSig.toFixed(0) + '% · 新高 ' + M.br.nh + '／新低 ' + M.br.nl + (M.br.weak ? '（樣本少）' : '') : '無掃描資料') + '<div class="bar"><i style="width:' + cb.sBR + '%"></i></div></div><div>櫃買 vs 加權（20 日）<b class="' + (M.r20 > 1 ? 'up' : M.r20 < -1 ? 'dn' : '') + '">' + (M.r20 == null ? '—' : fmt.pct(M.r20, 1)) + '</b>' + (M.r20 == null ? '' : M.r20 > 1 ? '中小型股領漲，風險偏好高' : M.r20 < -1 ? '中小型股落後，資金退潮' : '同步') + '</div></div>' +
    (cb.caps.length || cb.floors.length ? '<div class="note">' + cb.caps.map(function (x) { return '上限 ' + x.v + '%：' + x.why; }).concat(cb.floors.map(function (x) { return '下限 ' + x.v + '%：' + x.why; })).join('；') + '。</div>' : '') + '</div>';
  // 兩個指數
  html += '<div class="two-eq" style="margin-top:14px">' + mkIndexCard('TWII', M.tw, M.twS, M.lvTW) + (M.otc ? mkIndexCard('TWOII', M.otc, M.otcS, M.lvOTC) : '<div class="card"><h3>櫃買指數</h3><div class="note" style="margin:0">尚無櫃買指數資料。</div></div>') + '</div>';
  // 執行規則
  html += '<div class="card" style="margin-top:14px"><h3>執行規則（照表做，不臨場判斷）</h3><div class="rule"><b>水位怎麼算</b>總分 ≥80 → 100%；65–79 → 80%；50–64 → 60%；35–49 → 40%；20–34 → 20%；&lt;20 → 清倉。加權在下彎季線之下上限 40%、在年線之下上限 20%、25 日內 ≥5 個分配日上限 50%、櫃買跌破季線而加權未破上限 60%；出現反彈確認日至少 40%。</div><div class="rule"><b>什麼時候動</b>建議值與目前水位差 ≥15% 才動作；差不到 40% 的調整要連續 3 天同一建議再做，差 ≥40%（例如跌破季線、年線）當天收盤確認、隔天開盤就做。</div><div class="rule"><b>減碼順序</b>跌破價位當天收盤確認後隔天執行：先砍虧損中、跌破自身停損、第四階段的部位；獲利中的強勢股最後減。</div><div class="rule"><b>加碼順序</b>突破價位當天收盤確認後，只加交易點子頁通過檢核（≥5 項有利、期望值為正）的標的，分兩批；水位到達建議值就停，不因為「感覺會噴」超過。</div><div class="rule"><b>清倉條件</b>建議水位 0%（加權跌破年線且年線下彎、季線下彎）。清倉後不猜底；等反彈確認日或站回季線且分配日 ≤2 才重新進場，第一批 20–40%。</div></div>';
  // 回測
  html += '<div class="card" style="margin-top:14px" id="mkBT"><h3>這套水位規則的歷史表現<span class="r">只用指數本身（無廣度），隔日套用</span></h3><div class="loading" style="padding:16px">回測中…</div></div>';
  html += '<div class="note" style="margin-top:14px">分配日：收盤跌 ≥0.2% 且成交量大於前一日。反彈確認日：低點後第 4–10 天收盤大漲 ≥1.5% 且量增。價位表的「→ 水位」是把收盤價假設在該價位外側重新計分的結果，其他條件不變。此為風險紀律工具，不構成投資建議。</div>';
  body.innerHTML = html;
  $('#mkExpo', body).onsubmit = function (e) { e.preventDefault(); var v = e.target.exposure.value, c = e.target.capital.value; Store.portfolio.data.exposure = v === '' ? null : +v; Store.portfolio.data.capital = c === '' ? 0 : +c; Store.portfolio.save(); renderMarket(); };
  setTimeout(function () {
    var bt = mkBacktest(M.tw, M.otc), el = $('#mkBT', body); if (!el) return;
    var yrs = Object.keys(bt.byYear).sort();
    el.innerHTML = '<h3>這套水位規則的歷史表現<span class="r">' + esc(bt.from) + ' 起，' + bt.n + ' 個交易日，只用指數本身（無廣度），隔日套用</span></h3><div class="stat"><div><div class="l">水位策略累計</div><div class="v ' + (bt.retS >= 0 ? 'up' : 'dn') + '">' + fmt.pct(bt.retS, 1) + '</div><div class="s">年化 ' + fmt.pct(bt.cagrS, 1) + '</div></div><div><div class="l">滿倉持有累計</div><div class="v ' + (bt.retH >= 0 ? 'up' : 'dn') + '">' + fmt.pct(bt.retH, 1) + '</div><div class="s">年化 ' + fmt.pct(bt.cagrH, 1) + '</div></div><div><div class="l">最大回撤：策略</div><div class="v dn">' + bt.ddS.toFixed(1) + '%</div><div class="s">滿倉 ' + bt.ddH.toFixed(1) + '%</div></div><div><div class="l">報酬／回撤</div><div class="v">' + (bt.ddS ? (bt.cagrS / -bt.ddS).toFixed(2) : '—') + '</div><div class="s">滿倉 ' + (bt.ddH ? (bt.cagrH / -bt.ddH).toFixed(2) : '—') + '</div></div><div><div class="l">水位調整次數</div><div class="v">' + bt.changes + '</div><div class="s">約每 ' + (bt.changes ? Math.round(bt.n / bt.changes) : '—') + ' 個交易日一次</div></div></div><canvas class="eq" id="mkEq" style="margin-top:12px;height:240px"></canvas>' +
      (yrs.length > 1 ? '<div class="tablewrap" style="border:0;margin-top:8px"><table class="trbl" style="min-width:0"><thead><tr><th>年</th><th class="num">水位策略</th><th class="num">滿倉</th></tr></thead><tbody>' + yrs.map(function (y) { var x = bt.byYear[y]; return '<tr><td>' + y + '</td><td class="num ' + (x.s >= 1 ? 'up' : 'dn') + '">' + fmt.pct((x.s - 1) * 100, 1) + '</td><td class="num ' + (x.h >= 1 ? 'up' : 'dn') + '">' + fmt.pct((x.h - 1) * 100, 1) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '<div class="note">水位規則的目的不是贏過滿倉，而是用小很多的回撤拿到大部分的漲幅；多頭年會落後、空頭年會保住本金。資料只有 ' + bt.years.toFixed(1) + ' 年，執行更新程式後會用更長的歷史重算。</div>';
    mkDrawCurve($('#mkEq', el), bt);
  }, 30);
}
// 給其他頁面用的一行摘要
function mkSummaryBox() { var M = state.indices ? mkModel() : null; if (!M) return ''; return '<div><div class="l">建議水位</div><div class="v" style="font-size:15px">' + M.cb.expo + '%' + (M.cur ? ' · ' + esc(M.act.t) : '') + '</div><div class="s"><a href="#/market">加權 ' + esc(M.twS.stage.replace(/（.*/, '')) + (M.otcS ? '，櫃買 ' + esc(M.otcS.stage.replace(/（.*/, '')) : '') + ' →</a></div></div>'; }
