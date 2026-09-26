/* ============================================================
   TA Engine — 台美股技術分析引擎
   輸入：bars = [[date(YYYYMMDD|YYYY-MM-DD), open, high, low, close, volume], ...] 由舊到新
   輸出：analyze(bars, opts) -> 完整分析物件（指標、九轉、VCP、形態、量能、高低檔、交易計畫）
   純函式、無外部依賴；可在瀏覽器與 Node 使用。
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TAEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 基礎工具 ----------
  function toBars(raw) {
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      var d = r[0];
      if (typeof d === 'number') d = String(d);
      if (d.length === 8) d = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
      var o = +r[1], h = +r[2], l = +r[3], c = +r[4], v = +r[5] || 0;
      if (!(c > 0) || !(h > 0) || !(l > 0)) continue;
      if (!(o > 0)) o = c;
      out.push({ d: d, o: o, h: Math.max(h, o, c), l: Math.min(l, o, c), c: c, v: v });
    }
    return out;
  }

  function sma(arr, n) {
    var out = new Array(arr.length).fill(null), s = 0;
    for (var i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= n) s -= arr[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }
  function ema(arr, n) {
    var out = new Array(arr.length).fill(null), k = 2 / (n + 1), prev = null;
    for (var i = 0; i < arr.length; i++) {
      if (prev === null) { if (i >= n - 1) { var s = 0; for (var j = i - n + 1; j <= i; j++) s += arr[j]; prev = s / n; out[i] = prev; } }
      else { prev = arr[i] * k + prev * (1 - k); out[i] = prev; }
    }
    return out;
  }
  function atr(bars, n) {
    var tr = bars.map(function (b, i) {
      if (i === 0) return b.h - b.l;
      var pc = bars[i - 1].c;
      return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    });
    // Wilder smoothing
    var out = new Array(bars.length).fill(null), prev = null;
    for (var i = 0; i < tr.length; i++) {
      if (prev === null) { if (i >= n - 1) { var s = 0; for (var j = i - n + 1; j <= i; j++) s += tr[j]; prev = s / n; out[i] = prev; } }
      else { prev = (prev * (n - 1) + tr[i]) / n; out[i] = prev; }
    }
    return out;
  }
  function rsi(closes, n) {
    var out = new Array(closes.length).fill(null), ag = 0, al = 0;
    for (var i = 1; i < closes.length; i++) {
      var ch = closes[i] - closes[i - 1], g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      if (i <= n) { ag += g; al += l; if (i === n) { ag /= n; al /= n; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } }
      else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
    }
    return out;
  }
  function highest(arr, from, to) { var m = -Infinity; for (var i = Math.max(0, from); i <= to; i++) if (arr[i] > m) m = arr[i]; return m; }
  function lowest(arr, from, to) { var m = Infinity; for (var i = Math.max(0, from); i <= to; i++) if (arr[i] < m) m = arr[i]; return m; }
  function pct(a, b) { return (a - b) / b * 100; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function last(a) { return a[a.length - 1]; }
  function slopePct(arr, i, look) { // MA 斜率（look 根前到現在的 %）
    if (i - look < 0 || arr[i] == null || arr[i - look] == null) return null;
    return pct(arr[i], arr[i - look]);
  }

  // 價格最小跳動（台股 / 美股）
  function tick(price, market) {
    if (market === 'US') return price >= 1 ? 0.01 : 0.0001;
    if (price < 10) return 0.01; if (price < 50) return 0.05; if (price < 100) return 0.1;
    if (price < 500) return 0.5; if (price < 1000) return 1; return 5;
  }
  function roundTick(price, market, dir) {
    var t = tick(price, market), n = price / t;
    n = dir === 'up' ? Math.ceil(n - 1e-9) : dir === 'down' ? Math.floor(n + 1e-9) : Math.round(n);
    return +(n * t).toFixed(t < 0.01 ? 4 : 2);
  }

  // ---------- 週線重採樣 ----------
  function toWeekly(bars) {
    var out = [], cur = null, curKey = null;
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i], dt = new Date(b.d + 'T00:00:00Z');
      // ISO week key: 該週的星期一日期
      var day = (dt.getUTCDay() + 6) % 7; var mon = new Date(dt); mon.setUTCDate(dt.getUTCDate() - day);
      var key = mon.toISOString().slice(0, 10);
      if (key !== curKey) { if (cur) out.push(cur); cur = { d: b.d, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; curKey = key; }
      else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; cur.d = b.d; }
    }
    if (cur) out.push(cur);
    return out;
  }

  // ---------- 擺動高低點（ZigZag，含分形確認） ----------
  // 回傳 [{i, p, t:'H'|'L'}] 交替序列
  function swings(bars, k, minPct) {
    k = k || 3; minPct = minPct == null ? 3 : minPct;
    var n = bars.length, cand = [];
    for (var i = k; i < n - k; i++) {
      var isH = true, isL = true;
      for (var j = 1; j <= k; j++) {
        if (bars[i].h < bars[i - j].h || bars[i].h < bars[i + j].h) isH = false;
        if (bars[i].l > bars[i - j].l || bars[i].l > bars[i + j].l) isL = false;
      }
      if (isH) cand.push({ i: i, p: bars[i].h, t: 'H' });
      if (isL) cand.push({ i: i, p: bars[i].l, t: 'L' });
    }
    // 交替化：同型連續取更極端者；並過濾幅度太小的擺動
    var out = [];
    for (var a = 0; a < cand.length; a++) {
      var c = cand[a];
      if (!out.length) { out.push(c); continue; }
      var p = last(out);
      if (p.t === c.t) { if ((c.t === 'H' && c.p >= p.p) || (c.t === 'L' && c.p <= p.p)) out[out.length - 1] = c; }
      else {
        var move = Math.abs(pct(c.p, p.p));
        if (move < minPct) {
          // 幅度不足：不新增，但若它讓上一個同型點更極端則以它取代前前點
          if (out.length >= 2) { var pp = out[out.length - 2]; if ((c.t === 'H' && c.p > pp.p) || (c.t === 'L' && c.p < pp.p)) { out.splice(out.length - 2, 2, c); } }
          continue;
        }
        out.push(c);
      }
    }
    // 尾端：把最後幾根未確認的極值補進去（讓現價區段可用）
    var tailFrom = n - k, lastSw = last(out);
    if (lastSw) {
      var hi = -Infinity, hiI = -1, lo = Infinity, loI = -1;
      for (var q = Math.max(tailFrom, lastSw.i + 1); q < n; q++) { if (bars[q].h > hi) { hi = bars[q].h; hiI = q; } if (bars[q].l < lo) { lo = bars[q].l; loI = q; } }
      if (hiI >= 0) {
        if (lastSw.t === 'L' && Math.abs(pct(hi, lastSw.p)) >= minPct) out.push({ i: hiI, p: hi, t: 'H', tail: true });
        else if (lastSw.t === 'H' && Math.abs(pct(lo, lastSw.p)) >= minPct) out.push({ i: loI, p: lo, t: 'L', tail: true });
      }
    }
    return out;
  }

  // ---------- 神奇九轉 / 十三轉（TD Sequential：Setup 9 + Countdown 13） ----------
  // 規則（DeMark）：
  //  結構 Setup：連續 9 根收盤 < 4 根前收盤（買進結構）／> 4 根前收盤（賣出結構）；第 8 或 9 根低點 ≤ 第 6、7 根低點 => 完美結構
  //  TDST：買進結構期間的最高真實高點（阻力）；賣出結構期間的最低真實低點（支撐）
  //  倒數 Countdown：結構完成後開始（第 9 根可為倒數第 1 根），買進倒數計「收盤 ≤ 2 根前低點」的 K 棒（可不連續），數到 13；
  //    第 13 根需滿足：低點 ≤ 倒數第 8 根收盤（否則遞延，標示「+」）。賣出倒數對稱（收盤 ≥ 2 根前高點；第 13 根高點 ≥ 第 8 根收盤）。
  //  取消：出現反向結構完成、或買進倒數期間收盤突破 TDST 阻力（賣出倒數：收盤跌破 TDST 支撐）。
  //  Recycle（簡化）：倒數期間若再出現同向結構完成，倒數自新結構重新開始。
  function tdSequential(bars) {
    var n = bars.length, count = new Array(n).fill(0), cd = new Array(n).fill(0), cdDefer = new Array(n).fill(false), setups = [], countdowns = [];
    var buy = 0, sell = 0, active = null;
    function trueHigh(j) { return j > 0 ? Math.max(bars[j].h, bars[j - 1].c) : bars[j].h; }
    function trueLow(j) { return j > 0 ? Math.min(bars[j].l, bars[j - 1].c) : bars[j].l; }
    for (var i = 4; i < n; i++) {
      var c = bars[i].c, c4 = bars[i - 4].c;
      if (c < c4) { buy++; sell = 0; } else if (c > c4) { sell++; buy = 0; } else { buy = 0; sell = 0; }
      if (buy > 0) count[i] = -buy;   // 負數 = 買進結構（下跌計數）
      if (sell > 0) count[i] = sell;   // 正數 = 賣出結構（上漲計數）
      if (buy === 9 || sell === 9) {
        var type = buy === 9 ? 'buy' : 'sell';
        var perfected = type === 'buy' ? Math.min(bars[i - 1].l, bars[i].l) <= Math.min(bars[i - 3].l, bars[i - 2].l) : Math.max(bars[i - 1].h, bars[i].h) >= Math.max(bars[i - 3].h, bars[i - 2].h);
        var s = i - 8, hh = -Infinity, ll = Infinity;
        for (var j = s; j <= i; j++) { hh = Math.max(hh, trueHigh(j)); ll = Math.min(ll, trueLow(j)); }
        var setup = { type: type, endIdx: i, startIdx: s, date: bars[i].d, perfected: perfected, tdst: type === 'buy' ? hh : ll, extremeLow: ll, extremeHigh: hh };
        setups.push(setup);
        // 反向結構完成 => 取消進行中的倒數
        if (active && active.type !== type) { active.cancelled = '出現反向結構'; active = null; }
        else if (active && active.type === type) { active.cancelled = '同向新結構完成（recycle）'; active = null; }  // 同向新結構 => 倒數重新開始
        if (!active) active = { type: type, setup: setup, startIdx: i, count: 0, bar8Close: null, bars: [], low: Infinity, high: -Infinity, deferred: 0 };
      }
      if (active) {
        var b = bars[i];
        // 取消：突破 TDST
        if (active.type === 'buy' && c > active.setup.tdst) { active.cancelled = '收盤突破 TDST 阻力'; active = null; }
        else if (active.type === 'sell' && c < active.setup.tdst) { active.cancelled = '收盤跌破 TDST 支撐'; active = null; }
      }
      if (active) {
        var bb = bars[i], ok = active.type === 'buy' ? bb.c <= bars[i - 2].l : bb.c >= bars[i - 2].h;
        active.low = Math.min(active.low, bb.l); active.high = Math.max(active.high, bb.h);
        if (ok) {
          if (active.count === 12) {
            var qual = active.type === 'buy' ? bb.l <= active.bar8Close : bb.h >= active.bar8Close;
            if (qual) {
              active.count = 13; active.bars.push(i); cd[i] = active.type === 'buy' ? -13 : 13;
              countdowns.push({ type: active.type, endIdx: i, date: bb.d, startIdx: active.startIdx, setup: active.setup, low: active.low, high: active.high, deferred: active.deferred, bars: active.bars.slice() });
              active = null;
            } else { active.deferred++; cdDefer[i] = true; cd[i] = active.type === 'buy' ? -12 : 12; }
          } else {
            active.count++; active.bars.push(i); cd[i] = active.type === 'buy' ? -active.count : active.count;
            if (active.count === 8) active.bar8Close = bb.c;
          }
        }
      }
    }
    var cur = count[n - 1], last9 = setups.length ? last(setups) : null;
    var recentSetup = last9 && (n - 1 - last9.endIdx) <= 5 ? last9 : null;
    var last13 = countdowns.length ? last(countdowns) : null;
    var recent13 = last13 && (n - 1 - last13.endIdx) <= 8 ? last13 : null;
    // 目前狀態文字
    var parts = [];
    var a9 = Math.abs(cur);
    if (a9 >= 9) parts.push((cur < 0 ? '買進' : '賣出') + '結構已完成（第 ' + Math.min(a9, 9) + ' 根' + (a9 > 9 ? '，已延續 ' + (a9 - 9) + ' 根' : '') + '）');
    else if (cur !== 0) parts.push((cur < 0 ? '下跌' : '上漲') + '計數第 ' + a9 + ' 根（未到 9）');
    else parts.push('結構計數中斷');
    if (recent13) parts.push((recent13.type === 'buy' ? '買進' : '賣出') + '倒數 13 於 ' + recent13.date + ' 完成 — ' + (recent13.type === 'buy' ? '下跌趨勢竭盡，反轉機率高' : '上漲趨勢竭盡，留意反轉'));
    else if (active) parts.push((active.type === 'buy' ? '買進' : '賣出') + '倒數進行中：' + active.count + '/13' + (active.deferred ? '（第 13 根遞延 ' + active.deferred + ' 次）' : ''));
    else if (last13) parts.push('上次 13：' + (last13.type === 'buy' ? '買' : '賣') + ' ' + last13.date);
    return { count: count, cd: cd, cdDefer: cdDefer, setups: setups, countdowns: countdowns, current: cur, lastSetup: last9, recentSetup: recentSetup, lastCountdown: last13, recentCountdown: recent13, active: active ? { type: active.type, count: active.count, deferred: active.deferred, tdst: active.setup.tdst, low: active.low, high: active.high, startDate: bars[active.startIdx].d } : null, status: parts.join('；') };
  }

  // ---------- 量能分析 ----------
  function volumeAnalysis(bars, ind) {
    var n = bars.length, i = n - 1, b = bars[i];
    var v20 = ind.vol20[i], v50 = ind.vol50[i] || v20;
    var rel20 = v20 ? b.v / v20 : 1, rel50 = v50 ? b.v / v50 : 1;
    var range = b.h - b.l, closePos = range > 0 ? (b.c - b.l) / range : 0.5;
    var up = b.c >= (bars[i - 1] ? bars[i - 1].c : b.o);
    // 近 5 日均量 / 50 日均量 -> 量縮
    var v5 = 0; for (var j = Math.max(0, i - 4); j <= i; j++) v5 += bars[j].v; v5 /= Math.min(5, i + 1);
    var dryUp = v50 ? v5 / v50 : 1;
    // 近 20 日 上漲日量 / 下跌日量
    var upV = 0, dnV = 0;
    for (var k = Math.max(1, i - 19); k <= i; k++) { if (bars[k].c > bars[k - 1].c) upV += bars[k].v; else if (bars[k].c < bars[k - 1].c) dnV += bars[k].v; }
    var udRatio = dnV > 0 ? upV / dnV : (upV > 0 ? 3 : 1);
    // 帶量突破：收盤突破 20/60 日高 + 量 >= 1.5x 均量 + 收在上半部
    var hi20 = highest(bars.map(function (x) { return x.h; }), i - 20, i - 1), hi60 = highest(bars.map(function (x) { return x.h; }), i - 60, i - 1);
    var lo20 = lowest(bars.map(function (x) { return x.l; }), i - 20, i - 1);
    var breakout20 = b.c > hi20, breakout60 = b.c > hi60, breakdown20 = b.c < lo20;
    var volBreakout = (breakout20 || breakout60) && rel20 >= 1.5 && closePos >= 0.6;
    var volBreakdown = breakdown20 && rel20 >= 1.5 && closePos <= 0.4;
    // 高檔爆量（可能出貨）：量 > 3x 均量、位置接近 52 週高、收盤在下半部或長上影
    var climax = rel20 >= 3 && ind.pos52 >= 80 && (closePos <= 0.4 || (b.h - Math.max(b.o, b.c)) > range * 0.45);
    // 低檔爆量（可能吸籌／恐慌賣壓）
    var capitulation = rel20 >= 3 && ind.pos52 <= 25 && !up;
    var tags = [];
    if (volBreakout) tags.push(breakout60 ? '帶量突破 60 日高' : '帶量突破 20 日高');
    if (volBreakdown) tags.push('帶量跌破 20 日低');
    if (climax) tags.push('高檔爆量（留意出貨）');
    if (capitulation) tags.push('低檔爆量（恐慌／換手）');
    if (dryUp < 0.6) tags.push('量縮整理（5 日均量 < 60% 50 日均量）');
    if (rel20 >= 2 && !volBreakout && !climax) tags.push(up ? '今日放量上漲' : '今日放量下跌');
    if (udRatio >= 1.5) tags.push('近 20 日買盤量能佔優'); else if (udRatio <= 0.67) tags.push('近 20 日賣壓量能佔優');
    var verdict = volBreakout ? '量價齊揚' : climax ? '高檔爆量' : volBreakdown ? '量增價跌' : dryUp < 0.6 ? '量縮' : rel20 >= 1.5 ? (up ? '量增價漲' : '量增價跌') : rel20 <= 0.7 ? (up ? '量縮價漲' : '量縮價跌') : '量能平穩';
    return { rel20: r2(rel20), rel50: r2(rel50), closePos: r2(closePos), dryUp: r2(dryUp), udRatio: r2(udRatio), volBreakout: volBreakout, volBreakdown: volBreakdown, climax: climax, capitulation: capitulation, breakout20: breakout20, breakout60: breakout60, tags: tags, verdict: verdict, avg20: Math.round(v20 || 0), avg50: Math.round(v50 || 0) };
  }

  // ---------- 高低檔判斷 / 趨勢階段 ----------
  function positionAnalysis(bars, ind) {
    var n = bars.length, i = n - 1, b = bars[i];
    var look = Math.min(250, n);
    var hs = bars.map(function (x) { return x.h; }), ls = bars.map(function (x) { return x.l; });
    var hi52 = highest(hs, i - look + 1, i), lo52 = lowest(ls, i - look + 1, i);
    var pos = hi52 > lo52 ? (b.c - lo52) / (hi52 - lo52) * 100 : 50;
    var offHigh = pct(b.c, hi52), aboveLow = pct(b.c, lo52);
    var ma20 = ind.ma20[i], ma50 = ind.ma50[i], ma60 = ind.ma60[i], ma150 = ind.ma150[i], ma200 = ind.ma200[i];
    var bias20 = ma20 ? pct(b.c, ma20) : null, bias60 = ma60 ? pct(b.c, ma60) : null;
    var s200 = slopePct(ind.ma200, i, 20), s150 = slopePct(ind.ma150, i, 20), s50 = slopePct(ind.ma50, i, 10), s20 = slopePct(ind.ma20, i, 5);
    var rsiV = ind.rsi14[i];
    // 多頭排列 / Minervini 趨勢模板
    var aligned = ma20 && ma60 && ma200 && ma20 > ma60 && ma60 > ma200 && b.c > ma20;
    var bearAligned = ma20 && ma60 && ma200 && ma20 < ma60 && ma60 < ma200 && b.c < ma20;
    var tt = { pass: 0, total: 0, items: [] };
    function chk(name, ok) { tt.total++; if (ok) tt.pass++; tt.items.push({ name: name, ok: !!ok }); }
    if (ma150 && ma200) {
      chk('股價 > 150MA 與 200MA', b.c > ma150 && b.c > ma200);
      chk('150MA > 200MA', ma150 > ma200);
      chk('200MA 上升（一個月）', s200 != null && s200 > 0);
      chk('50MA > 150MA > 200MA', ma50 > ma150 && ma150 > ma200);
      chk('股價 > 50MA', b.c > ma50);
      chk('高於 52 週低點 ≥ 25%', aboveLow >= 25);
      chk('距 52 週高點 ≤ 25%', offHigh >= -25);
    }
    // Weinstein 階段（用 150MA ≈ 30 週線）
    var stage, stageDesc;
    var maRef, sRef;
    if (ind.weekly) { maRef = ind.ma30[i]; sRef = slopePct(ind.ma30, i, 4); }
    else { maRef = ma150 || ma60; sRef = ma150 ? s150 : slopePct(ind.ma60, i, 20); }
    if (!maRef) { stage = '—'; stageDesc = '資料不足，無法判斷階段'; }
    else if (b.c > maRef && sRef > 0.5) { stage = '第二階段（上升期）'; stageDesc = '股價在上升的中期均線之上，趨勢向上'; }
    else if (b.c < maRef && sRef < -0.5) { stage = '第四階段（下跌期）'; stageDesc = '股價在下降的中期均線之下，趨勢向下'; }
    else if (b.c > maRef) { stage = '第一/三階段過渡（築底或作頭）'; stageDesc = '均線走平，方向未明；' + (pos >= 60 ? '位置偏高，留意作頭' : '位置偏低，可能築底'); }
    else { stage = pos >= 50 ? '第三階段（頭部區）' : '第一階段（底部區）'; stageDesc = '股價跌破走平的中期均線，' + (pos >= 50 ? '頭部風險升高' : '等待底部確認'); }
    // 高低檔判定
    var level;
    if (pos >= 90 && (bias20 != null && bias20 > 12 || rsiV > 78)) level = '過熱（極高檔）';
    else if (pos >= 75) level = '高檔';
    else if (pos >= 50) level = '中高檔';
    else if (pos >= 25) level = '中低檔';
    else if (pos >= 10) level = '低檔';
    else level = '極低檔';
    var notes = [];
    if (bias20 != null && bias20 > 10) notes.push('20 日乖離 +' + r1(bias20) + '%，短線過熱，追價風險高');
    if (bias20 != null && bias20 < -10) notes.push('20 日乖離 ' + r1(bias20) + '%，短線超跌，可能反彈');
    if (rsiV != null && rsiV >= 75) notes.push('RSI(14) ' + r1(rsiV) + ' 超買');
    if (rsiV != null && rsiV <= 30) notes.push('RSI(14) ' + r1(rsiV) + ' 超賣');
    if (offHigh >= -3) notes.push('位於 52 週高點附近（創高區）');
    if (aboveLow <= 5) notes.push('位於 52 週低點附近');
    if (aligned) notes.push('均線多頭排列（20>60>200）');
    if (bearAligned) notes.push('均線空頭排列（20<60<200）');
    return { hi52: hi52, lo52: lo52, pos52: r1(pos), offHigh: r1(offHigh), aboveLow: r1(aboveLow), bias20: bias20 == null ? null : r1(bias20), bias60: bias60 == null ? null : r1(bias60), rsi: rsiV == null ? null : r1(rsiV), aligned: !!aligned, bearAligned: !!bearAligned, trendTemplate: tt, stage: stage, stageDesc: stageDesc, level: level, notes: notes, ma: { ma5: ind.ma5[i], ma10: ind.ma10[i], ma20: ma20, ma50: ma50, ma60: ma60, ma150: ma150, ma200: ma200 }, slopes: { ma20: s20, ma50: s50, ma150: s150, ma200: s200 } };
  }

  // ---------- VCP（Volatility Contraction Pattern） ----------
  function vcpAnalysis(bars, ind, sw, market) {
    var n = bars.length, i = n - 1, b = bars[i];
    var res = { found: false, contractions: [], status: 'none', statusText: '未偵測到 VCP 結構', pivot: null, stop: null, entry: null, base: null };
    if (n < 60) return res;
    // 尋找基底起點：近 40~160 根內的最高點（基底左側高點）
    var lookMax = Math.min(325, n - 1);
    var hs = bars.map(function (x) { return x.h; });
    var baseHighIdx = -1, baseHigh = -Infinity;
    for (var q = i - lookMax; q <= i - 8; q++) if (hs[q] > baseHigh) { baseHigh = hs[q]; baseHighIdx = q; }
    if (baseHighIdx < 0) return res;
    // 基底內的擺動點
    var pts = sw.filter(function (s) { return s.i >= baseHighIdx; });
    if (!pts.length || pts[0].t !== 'H') pts.unshift({ i: baseHighIdx, p: baseHigh, t: 'H' });
    // 收縮序列：每個 H->L 的跌幅
    var cons = [];
    for (var a = 0; a + 1 < pts.length; a++) {
      if (pts[a].t === 'H' && pts[a + 1].t === 'L') {
        var depth = pct(pts[a].p, pts[a + 1].p); // 正值
        cons.push({ hiIdx: pts[a].i, hi: pts[a].p, loIdx: pts[a + 1].i, lo: pts[a + 1].p, depth: r1(depth), bars: pts[a + 1].i - pts[a].i });
      }
    }
    // 若尾端有未確認的低點（現價區），補一段收縮
    var lastPt = last(pts);
    if (lastPt && lastPt.t === 'H' && i > lastPt.i) {
      var lo = Infinity, loI = i; for (var z = lastPt.i + 1; z <= i; z++) if (bars[z].l < lo) { lo = bars[z].l; loI = z; }
      if (lo < lastPt.p) cons.push({ hiIdx: lastPt.i, hi: lastPt.p, loIdx: loI, lo: lo, depth: r1(pct(lastPt.p, lo)), bars: loI - lastPt.i, open: true });
    }
    if (cons.length < 2) { res.contractions = cons; return res; }
    // 逐步收縮判定：取最後一段連續遞減的收縮序列
    var seq = [cons[cons.length - 1]];
    for (var k = cons.length - 2; k >= 0; k--) {
      if (cons[k].depth > seq[0].depth * 1.15 && cons[k].depth <= 40) seq.unshift(cons[k]); else break;
    }
    var baseLen = i - seq[0].hiIdx;
    var firstDepth = seq[0].depth, lastDepth = last(seq).depth;
    var okShape = seq.length >= 2 && firstDepth >= 8 && firstDepth <= 40 && lastDepth <= Math.max(firstDepth * 0.6, 3) && lastDepth <= 12 && baseLen >= 15 && baseLen <= 325;
    // 量縮：最後一段收縮的均量 vs 50 日均量
    var lastC = last(seq), vSum = 0, vN = 0;
    for (var m = lastC.hiIdx; m <= Math.min(i, lastC.loIdx + 5); m++) { vSum += bars[m].v; vN++; }
    var lastVol = vN ? vSum / vN : 0, v50 = ind.vol50[i] || ind.vol20[i] || 1;
    var volDry = lastVol / v50;
    // 樞軸點：最後一段收縮的高點（近端阻力）
    var pivot = lastC.hi;
    // 若最後高點就是基底高點（只有一次收縮後直接在高點盤整），改用近 10 根高點
    var recentHi = highest(hs, Math.max(0, i - 10), i - 1);
    if (lastC.hiIdx === seq[0].hiIdx && seq.length === 1) pivot = recentHi;
    var distToPivot = pct(b.c, pivot); // 負值 = 在樞軸下方
    var trendOk = ind.ma50[i] && b.c > ind.ma50[i] * 0.97 && (ind.ma200[i] ? ind.ma50[i] > ind.ma200[i] * 0.98 : true);
    res.contractions = seq; res.base = { fromIdx: seq[0].hiIdx, fromDate: bars[seq[0].hiIdx].d, bars: baseLen, high: seq[0].hi, low: Math.min.apply(null, seq.map(function (c) { return c.lo; })) };
    res.pivot = pivot; res.volDry = r2(volDry); res.trendOk = !!trendOk; res.shapeOk = okShape; res.pattern = seq.map(function (c) { return Math.round(c.depth); }).join('-') + 'T (' + seq.length + ' 次收縮)';
    var stopByLow = lastC.lo, stopByPct = pivot * 0.93;
    var stop = Math.max(stopByLow, stopByPct); // 停損：最後收縮低點與樞軸下 7% 取較高者（風險較小）
    res.stop = roundTick(stop, market, 'down');
    res.entry = roundTick(pivot + tick(pivot, market), market, 'up');
    if (!okShape) { res.statusText = '收縮結構不完整（' + res.pattern + '），尚不構成標準 VCP'; res.status = 'invalid'; res.found = false; return res; }
    res.found = true;
    var v = ind.vol20[i] ? b.v / ind.vol20[i] : 1;
    // 突破判定：今日收盤 > 樞軸；前一日收盤 <= 樞軸
    var prevC = bars[i - 1].c;
    if (b.c > pivot && prevC <= pivot) {
      res.status = v >= 1.4 ? 'breakout' : 'breakout_lowvol';
      res.statusText = v >= 1.4 ? '今日帶量突破樞軸點 ' + pivot + '（量 ' + r1(v) + 'x）— 標準 VCP 買點' : '今日突破樞軸點但量能不足（' + r1(v) + 'x），突破有效性待確認';
    } else if (b.c > pivot) {
      var daysSince = 0; for (var y = i; y >= 0 && bars[y].c > pivot; y--) daysSince++;
      res.status = daysSince <= 5 && distToPivot <= 8 ? 'extended_ok' : 'extended';
      res.statusText = daysSince <= 5 && distToPivot <= 8 ? '突破後第 ' + daysSince + ' 天，距樞軸 +' + r1(distToPivot) + '%，仍在可買範圍（樞軸上 5~8% 內）' : '已突破 ' + daysSince + ' 天、距樞軸 +' + r1(distToPivot) + '%，追價風險高，等回測樞軸再進';
    } else if (distToPivot >= -3) {
      res.status = 'at_pivot';
      res.statusText = '收縮到位，距樞軸點 ' + pivot + ' 僅 ' + r1(-distToPivot) + '%，' + (volDry < 0.7 ? '量已縮（' + r1(volDry * 100) + '% 均量）' : '量尚未明顯縮') + '，等待帶量突破';
    } else if (b.c < lastC.lo) {
      res.status = 'failed'; res.found = false;
      res.statusText = '跌破最後收縮低點 ' + lastC.lo + '，VCP 結構破壞';
    } else {
      res.status = 'forming';
      res.statusText = 'VCP 收縮中（' + res.pattern + '），距樞軸 ' + r1(-distToPivot) + '%';
    }
    return res;
  }

  // ---------- 經典形態學（依 Edwards & Magee / Bulkowski / O'Neil 規則） ----------
  function near(a, b, tolPct) { return Math.abs(pct(a, b)) <= tolPct; }
  // 兩點連線在 x 處的值（用於斜頸線／趨勢線）
  function lineAt(p1, p2, x) { return p2.i === p1.i ? p1.p : p1.p + (p2.p - p1.p) * (x - p1.i) / (p2.i - p1.i); }
  // 形態前的既有趨勢：由 idx 往前 look 根的極值到 idx 的變化 %（正 = 之前上漲；負 = 之前下跌）
  function priorTrend(bars, idx, look) {
    var from = Math.max(0, idx - look), to = Math.max(from, idx - 3);
    if (to <= from) return 0;
    var hs = bars.map(function (b) { return b.h; }), ls = bars.map(function (b) { return b.l; });
    var hi = highest(hs, from, to), lo = lowest(ls, from, to), p = bars[idx].c;
    var up = pct(p, lo), dn = pct(p, hi);
    return Math.abs(up) >= Math.abs(dn) ? up : dn;
  }
  function avgVol(bars, a, b) { var s = 0, n = 0; for (var i = Math.max(0, a); i <= Math.min(bars.length - 1, b); i++) { s += bars[i].v; n++; } return n ? s / n : 0; }

  function classicPatterns(bars, ind, sw, market) {
    var n = bars.length, i = n - 1, b = bars[i], out = [];
    var pts = sw.filter(function (s) { return s.i >= i - 200; });
    var rp = pts.filter(function (s) { return !s.tail; });   // 反轉形態只用「已確認」的擺動點（尾端未確認極值不算）
    var vRel = ind.vol20[i] ? b.v / ind.vol20[i] : 1;
    var hs = bars.map(function (x) { return x.h; }), ls = bars.map(function (x) { return x.l; });
    function confirmState(level, dir) {
      var prevC = bars[i - 1].c;
      if (dir === 'up') { if (b.c > level && prevC <= level) return vRel >= 1.5 ? 'confirmed_vol' : 'confirmed'; return b.c > level ? 'after' : 'forming'; }
      if (b.c < level && prevC >= level) return vRel >= 1.5 ? 'confirmed_vol' : 'confirmed';
      return b.c < level ? 'after' : 'forming';
    }
    function push(p) { out.push(p); }
    function ctxText(pre, wantUp) {
      // 反轉形態需有既有趨勢；否則標示為整理型
      if (wantUp) return pre >= 8 ? '（反轉型：形態前已上漲 ' + r1(pre) + '%）' : '（整理型：形態前無明顯漲勢，反轉意義較弱）';
      return pre <= -8 ? '（反轉型：形態前已下跌 ' + r1(-pre) + '%）' : '（整理型：形態前無明顯跌勢，視為打底／整理）';
    }

    // ===== 雙重底 W 底 / 雙重頂 M 頭 =====
    // 規則：兩低點相差 ≤ 3%，中間反彈 ≥ 5%，兩低點相隔 ≥ 10 根；頸線 = 中間高點；量度目標 = 頸線 + 形態高度
    for (var a = rp.length - 1; a >= 2; a--) {
      var p1 = rp[a - 2], p2 = rp[a - 1], p3 = rp[a];
      if (p1.t === 'L' && p2.t === 'H' && p3.t === 'L' && near(p1.p, p3.p, 3) && pct(p2.p, Math.max(p1.p, p3.p)) >= 5 && p3.i - p1.i >= 10 && i - p3.i <= 60) {
        var neck = p2.p, height = neck - Math.min(p1.p, p3.p);
        if (b.c < Math.min(p1.p, p3.p) * 0.97) break; // 跌破雙底 -> 形態失敗
        var st = confirmState(neck, 'up'), pre = priorTrend(bars, p1.i, 60);
        var v2lower = avgVol(bars, p3.i - 2, p3.i + 2) < avgVol(bars, p1.i - 2, p1.i + 2);
        push({ name: 'W 底（雙重底）', bias: 'bull', state: st, keyLevel: neck, keyName: '頸線', points: [p1, p2, p3], target: roundTick(neck + height, market), entry: roundTick(neck + tick(neck, market), market, 'up'), stop: roundTick(Math.min(p1.p, p3.p) * 0.98, market, 'down'),
          desc: '兩個低點 ' + fmtP(p1.p) + ' / ' + fmtP(p3.p) + ' 相近（相隔 ' + (p3.i - p1.i) + ' 根），中間反彈高點 ' + fmtP(neck) + ' 為頸線' + ctxText(pre, false) + '。' + (v2lower ? '第二底量縮（賣壓減輕，形態品質佳）。' : '第二底量未縮，需靠突破量確認。') + '收盤帶量突破頸線確認，量度目標 = 頸線 + 形態高度；停損放雙底下方。' });
        break;
      }
    }
    for (var a2 = rp.length - 1; a2 >= 2; a2--) {
      var q1 = rp[a2 - 2], q2 = rp[a2 - 1], q3 = rp[a2];
      if (q1.t === 'H' && q2.t === 'L' && q3.t === 'H' && near(q1.p, q3.p, 3) && pct(Math.min(q1.p, q3.p), q2.p) >= 5 && q3.i - q1.i >= 10 && i - q3.i <= 60) {
        var neck2 = q2.p, h2 = Math.max(q1.p, q3.p) - neck2;
        if (b.c > Math.max(q1.p, q3.p) * 1.03) break; // 突破雙頂 -> 形態失敗
        var st2 = confirmState(neck2, 'down'), pre2 = priorTrend(bars, q1.i, 60);
        var v2lower2 = avgVol(bars, q3.i - 2, q3.i + 2) < avgVol(bars, q1.i - 2, q1.i + 2);
        push({ name: 'M 頭（雙重頂）', bias: 'bear', state: st2, keyLevel: neck2, keyName: '頸線', points: [q1, q2, q3], target: roundTick(neck2 - h2, market), entry: roundTick(neck2 - tick(neck2, market), market, 'down'), stop: roundTick(Math.max(q1.p, q3.p) * 1.02, market, 'up'),
          desc: '兩個高點 ' + fmtP(q1.p) + ' / ' + fmtP(q3.p) + ' 相近（相隔 ' + (q3.i - q1.i) + ' 根），中間回檔低點 ' + fmtP(neck2) + ' 為頸線' + ctxText(pre2, true) + '。' + (v2lower2 ? '第二頭量縮（買盤衰竭，形態品質佳）。' : '第二頭量未縮。') + '收盤跌破頸線確認，量度目標 = 頸線 − 形態高度；停損放雙頂上方。' });
        break;
      }
    }
    // ===== 頭肩頂 / 頭肩底（斜頸線） =====
    // 規則：頭高於兩肩 ≥ 2%，兩肩相差 ≤ 6%，兩肩時間對稱（比值 ≤ 2.5）；頸線連接兩谷（可斜），突破點取頸線在當前 K 的值
    for (var c = rp.length - 1; c >= 4; c--) {
      var s1 = rp[c - 4], t1 = rp[c - 3], hd = rp[c - 2], t2 = rp[c - 1], s2 = rp[c];
      var symOk = Math.max(hd.i - s1.i, s2.i - hd.i) / Math.max(1, Math.min(hd.i - s1.i, s2.i - hd.i)) <= 2.5;
      if (s1.t === 'H' && hd.t === 'H' && s2.t === 'H' && hd.p > s1.p * 1.02 && hd.p > s2.p * 1.02 && near(s1.p, s2.p, 6) && symOk && i - s2.i <= 60) {
        var neckNow = lineAt(t1, t2, i), neckHead = lineAt(t1, t2, hd.i), hh = hd.p - neckHead;
        var slopeOk = Math.abs(pct(t2.p, t1.p)) <= 12;
        if (!slopeOk || hh <= 0) continue;
        if (b.c > s2.p * 1.02) break; // 站回右肩上方 -> 失敗
        var stH = confirmState(neckNow, 'down'), preH = priorTrend(bars, s1.i, 80);
        var volDecl = avgVol(bars, hd.i - 3, hd.i + 3) < avgVol(bars, s1.i - 3, s1.i + 3) && avgVol(bars, s2.i - 3, s2.i + 3) < avgVol(bars, hd.i - 3, hd.i + 3);
        push({ name: '頭肩頂', bias: 'bear', state: stH, keyLevel: roundTick(neckNow, market), keyName: '頸線', points: [s1, t1, hd, t2, s2], neckline: [t1, t2], target: roundTick(neckNow - hh, market), entry: roundTick(neckNow - tick(neckNow, market), market, 'down'), stop: roundTick(s2.p * 1.02, market, 'up'),
          desc: '左肩 ' + fmtP(s1.p) + '、頭 ' + fmtP(hd.p) + '、右肩 ' + fmtP(s2.p) + '，頸線連接兩谷（' + fmtP(t1.p) + ' → ' + fmtP(t2.p) + '，' + (t2.p > t1.p * 1.01 ? '上斜' : t2.p < t1.p * 0.99 ? '下斜' : '水平') + '）' + ctxText(preH, true) + '。' + (volDecl ? '量能左肩→頭→右肩遞減，符合標準。' : '量能未呈遞減，訊號稍弱。') + '收盤跌破頸線確認，目標 = 頸線 − 頭至頸線高度；停損放右肩上方。' });
        break;
      }
      if (s1.t === 'L' && hd.t === 'L' && s2.t === 'L' && hd.p < s1.p * 0.98 && hd.p < s2.p * 0.98 && near(s1.p, s2.p, 6) && symOk && i - s2.i <= 60) {
        var neckNow2 = lineAt(t1, t2, i), neckHead2 = lineAt(t1, t2, hd.i), hh2 = neckHead2 - hd.p;
        if (Math.abs(pct(t2.p, t1.p)) > 12 || hh2 <= 0) continue;
        if (b.c < s2.p * 0.98) break;
        var stH2 = confirmState(neckNow2, 'up'), preH2 = priorTrend(bars, s1.i, 80);
        push({ name: '頭肩底', bias: 'bull', state: stH2, keyLevel: roundTick(neckNow2, market), keyName: '頸線', points: [s1, t1, hd, t2, s2], neckline: [t1, t2], target: roundTick(neckNow2 + hh2, market), entry: roundTick(neckNow2 + tick(neckNow2, market), market, 'up'), stop: roundTick(s2.p * 0.98, market, 'down'),
          desc: '左肩 ' + fmtP(s1.p) + '、頭 ' + fmtP(hd.p) + '、右肩 ' + fmtP(s2.p) + '，頸線連接兩峰（' + fmtP(t1.p) + ' → ' + fmtP(t2.p) + '）' + ctxText(preH2, false) + '。頭肩底的突破量必須明顯放大（≥1.5x）才算有效；目標 = 頸線 + 頭至頸線高度；停損放右肩下方。' });
        break;
      }
    }
    // ===== 三重頂 / 三重底 =====
    // 規則：三個高（低）點相差 ≤ 3%，中間兩谷（峰）；頸線 = 兩谷較低者（兩峰較高者）；形態高度 ≥ 5%
    for (var c3 = rp.length - 1; c3 >= 4; c3--) {
      var u1 = rp[c3 - 4], v1 = rp[c3 - 3], u2 = rp[c3 - 2], v2 = rp[c3 - 1], u3 = rp[c3];
      if (u1.t !== 'H' || u2.t !== 'H' || u3.t !== 'H') continue;
      if (near(u1.p, u2.p, 3) && near(u2.p, u3.p, 3) && near(u1.p, u3.p, 3) && i - u3.i <= 60 && u3.i - u1.i >= 15) {
        var nk = Math.min(v1.p, v2.p), top = Math.max(u1.p, u2.p, u3.p), hT = top - nk;
        if (pct(top, nk) < 5 || b.c > top * 1.03) break;
        push({ name: '三重頂', bias: 'bear', state: confirmState(nk, 'down'), keyLevel: nk, keyName: '頸線', points: [u1, v1, u2, v2, u3], target: roundTick(nk - hT, market), entry: roundTick(nk - tick(nk, market), market, 'down'), stop: roundTick(top * 1.02, market, 'up'), desc: '三次測試 ' + fmtP(top) + ' 附近壓力皆未過，頸線 ' + fmtP(nk) + ctxText(priorTrend(bars, u1.i, 80), true) + '。跌破頸線確認，目標 = 頸線 − 形態高度；停損放頂部上方。' });
        break;
      }
    }
    for (var c4 = rp.length - 1; c4 >= 4; c4--) {
      var w1 = rp[c4 - 4], x1 = rp[c4 - 3], w2 = rp[c4 - 2], x2 = rp[c4 - 1], w3 = rp[c4];
      if (w1.t !== 'L' || w2.t !== 'L' || w3.t !== 'L') continue;
      if (near(w1.p, w2.p, 3) && near(w2.p, w3.p, 3) && near(w1.p, w3.p, 3) && i - w3.i <= 60 && w3.i - w1.i >= 15) {
        var nk2 = Math.max(x1.p, x2.p), bot = Math.min(w1.p, w2.p, w3.p), hB = nk2 - bot;
        if (pct(nk2, bot) < 5 || b.c < bot * 0.97) break;
        push({ name: '三重底', bias: 'bull', state: confirmState(nk2, 'up'), keyLevel: nk2, keyName: '頸線', points: [w1, x1, w2, x2, w3], target: roundTick(nk2 + hB, market), entry: roundTick(nk2 + tick(nk2, market), market, 'up'), stop: roundTick(bot * 0.98, market, 'down'), desc: '三次測試 ' + fmtP(bot) + ' 附近支撐皆守住，頸線 ' + fmtP(nk2) + ctxText(priorTrend(bars, w1.i, 80), false) + '。帶量突破頸線確認，目標 = 頸線 + 形態高度；停損放底部下方。' });
        break;
      }
    }
    // ===== 三角形 / 楔形（趨勢線需各至少 2 個觸點；突破價取趨勢線在當前 K 的值；越過 apex 75% 未突破則失效） =====
    (function () {
      var recent = rp.slice(-6);
      var Hs = recent.filter(function (p) { return p.t === 'H'; }), Ls = recent.filter(function (p) { return p.t === 'L'; });
      if (Hs.length < 2 || Ls.length < 2) return;
      var span = i - recent[0].i; if (span < 15 || span > 130) return;
      var hA = Hs[0], hB = last(Hs), lA = Ls[0], lB = last(Ls);
      var hSlope = pct(hB.p, hA.p), lSlope = pct(lB.p, lA.p);
      var upperNow = lineAt(hA, hB, i), lowerNow = lineAt(lA, lB, i);
      var widthStart = Math.max(hA.p, lineAt(hA, hB, lA.i)) - Math.min(lA.p, lineAt(lA, lB, hA.i));
      var widthNow = upperNow - lowerNow;
      if (widthStart <= 0) return;
      var converging = widthNow < widthStart * 0.8;
      // apex：兩線交點的 x
      var mU = (hB.p - hA.p) / Math.max(1, hB.i - hA.i), mL = (lB.p - lA.p) / Math.max(1, lB.i - lA.i);
      var apexX = Math.abs(mU - mL) > 1e-9 ? (lA.p - mL * lA.i - (hA.p - mU * hA.i)) / (mU - mL) : Infinity;
      var progress = isFinite(apexX) && apexX > recent[0].i ? (i - recent[0].i) / (apexX - recent[0].i) : 0;
      if (progress > 1.0) return; // 已過 apex，形態失效
      var flatTop = Math.abs(hSlope) <= 2.5, flatBot = Math.abs(lSlope) <= 2.5, risingLows = lSlope >= 3, fallingHighs = hSlope <= -3;
      var apexNote = progress > 0.75 ? '已接近 apex（' + Math.round(progress * 100) + '%），若仍未突破則形態力道遞減。' : '';
      var volNote = avgVol(bars, i - 5, i) < avgVol(bars, recent[0].i, recent[0].i + 5) ? '整理期間量縮，符合三角形特徵。' : '整理期間量未縮。';
      if (flatTop && risingLows && converging) {
        var lvl = Math.max(hA.p, hB.p), stT = confirmState(lvl, 'up');
        push({ name: '上升三角形', bias: 'bull', state: stT, keyLevel: lvl, keyName: '水平壓力', points: recent, lines: [[hA, hB], [lA, lB]], target: roundTick(lvl + widthStart, market), entry: roundTick(lvl + tick(lvl, market), market, 'up'), stop: roundTick(lowerNow * 0.99, market, 'down'), desc: '高點水平於 ' + fmtP(lvl) + '、低點逐步墊高（' + fmtP(lA.p) + ' → ' + fmtP(lB.p) + '），買方積極、賣壓集中在固定價位。' + volNote + apexNote + '帶量突破水平壓力確認，目標 = 突破點 + 三角形最寬處（' + fmtP(widthStart) + '）；停損放下緣趨勢線下方。' });
      } else if (flatBot && fallingHighs && converging) {
        var lvl2 = Math.min(lA.p, lB.p), stT2 = confirmState(lvl2, 'down');
        push({ name: '下降三角形', bias: 'bear', state: stT2, keyLevel: lvl2, keyName: '水平支撐', points: recent, lines: [[hA, hB], [lA, lB]], target: roundTick(lvl2 - widthStart, market), entry: roundTick(lvl2 - tick(lvl2, market), market, 'down'), stop: roundTick(upperNow * 1.01, market, 'up'), desc: '低點水平於 ' + fmtP(lvl2) + '、高點逐步壓低（' + fmtP(hA.p) + ' → ' + fmtP(hB.p) + '），賣方積極。' + volNote + apexNote + '跌破水平支撐確認（空方形態不需量），目標 = 跌破點 − 最寬處；停損放上緣趨勢線上方。' });
      } else if (fallingHighs && risingLows && converging) {
        var upSt = confirmState(upperNow, 'up'), dnSt = confirmState(lowerNow, 'down');
        var trendUp = ind.ma50[i] ? b.c > ind.ma50[i] : true;
        var biasS = upSt !== 'forming' ? 'bull' : dnSt !== 'forming' ? 'bear' : (trendUp ? 'bull' : 'bear');
        var stS = upSt !== 'forming' ? upSt : dnSt !== 'forming' ? dnSt : 'forming';
        var key = biasS === 'bull' ? upperNow : lowerNow;
        push({ name: '收斂三角形（對稱）', bias: biasS, state: stS, keyLevel: roundTick(key, market), keyName: biasS === 'bull' ? '上緣趨勢線' : '下緣趨勢線', points: recent, lines: [[hA, hB], [lA, lB]], target: roundTick(biasS === 'bull' ? key + widthStart : key - widthStart, market), entry: roundTick(biasS === 'bull' ? key + tick(key, market) : key - tick(key, market), market, biasS === 'bull' ? 'up' : 'down'), stop: roundTick(biasS === 'bull' ? lowerNow * 0.99 : upperNow * 1.01, market, biasS === 'bull' ? 'down' : 'up'), desc: '高點下移、低點上移，波動收斂；對稱三角形為中繼形態，以原趨勢方向（' + (trendUp ? '多' : '空') + '）突破機率較高。' + volNote + apexNote + '突破點取趨勢線在今日的值（上緣 ' + fmtP(upperNow) + '／下緣 ' + fmtP(lowerNow) + '），目標 = 突破點 ± 最寬處。' });
      } else if (hSlope >= 3 && lSlope >= 3 && lSlope > hSlope && converging) {
        push({ name: '上升楔形（偏空）', bias: 'bear', state: confirmState(lowerNow, 'down'), keyLevel: roundTick(lowerNow, market), keyName: '下緣趨勢線', points: recent, lines: [[hA, hB], [lA, lB]], target: roundTick(lA.p, market), entry: roundTick(lowerNow - tick(lowerNow, market), market, 'down'), stop: roundTick(upperNow * 1.01, market, 'up'), desc: '高低點同步上移但下緣斜率較陡、兩線收斂，每次上攻幅度縮小，上漲動能衰竭。' + volNote + '跌破下緣為賣訊，量度目標回到楔形起點 ' + fmtP(lA.p) + '。' });
      } else if (hSlope <= -3 && lSlope <= -3 && hSlope < lSlope && converging) {
        push({ name: '下降楔形（偏多）', bias: 'bull', state: confirmState(upperNow, 'up'), keyLevel: roundTick(upperNow, market), keyName: '上緣趨勢線', points: recent, lines: [[hA, hB], [lA, lB]], target: roundTick(hA.p, market), entry: roundTick(upperNow + tick(upperNow, market), market, 'up'), stop: roundTick(lowerNow * 0.99, market, 'down'), desc: '高低點同步下移但上緣斜率較陡、兩線收斂，每次下殺幅度縮小，賣壓衰竭。' + volNote + '帶量突破上緣為買訊，量度目標回到楔形起點 ' + fmtP(hA.p) + '。' });
      }
    })();
    // ===== 旗形（多頭／空頭）：急漲（跌）旗竿 ≥ 15% 於 ≤ 20 根內；旗面回檔 ≤ 12%、5~20 根、量縮；目標 = 突破點 + 旗竿高度 =====
    (function () {
      var best = null, bestBear = null;
      for (var s = Math.max(1, i - 45); s <= i - 8; s++) {
        for (var e = s + 3; e <= Math.min(s + 20, i - 5); e++) {
          var gain = pct(hs[e], ls[s]), drop = pct(ls[e], hs[s]);
          if (gain >= 15) {
            var fHi = highest(hs, e + 1, i - 1), fLo = lowest(ls, e + 1, i - 1), flagLen = i - e, pull = pct(hs[e], fLo);
            if (flagLen >= 5 && flagLen <= 20 && pull <= 12 && pull >= 1 && fHi <= hs[e] * 1.03 && (!best || gain > best.gain)) best = { s: s, e: e, gain: gain, fLo: fLo, fHi: fHi, pull: pull, len: flagLen };
          }
          if (drop <= -15) {
            var fHi2 = highest(hs, e + 1, i - 1), fLo2 = lowest(ls, e + 1, i - 1), flagLen2 = i - e, bounce = pct(fHi2, ls[e]);
            if (flagLen2 >= 5 && flagLen2 <= 20 && bounce <= 12 && bounce >= 1 && fLo2 >= ls[e] * 0.97 && (!bestBear || drop < bestBear.drop)) bestBear = { s: s, e: e, drop: drop, fLo: fLo2, fHi: fHi2, bounce: bounce, len: flagLen2 };
          }
        }
      }
      if (best) {
        var poleH = hs[best.e] - ls[best.s], lvl = Math.max(best.fHi, hs[best.e]);
        var volOk = avgVol(bars, best.e + 1, i) < avgVol(bars, best.s, best.e) * 0.8;
        push({ name: '多頭旗形（旗竿 +' + r1(best.gain) + '%）', bias: 'bull', state: confirmState(lvl, 'up'), keyLevel: lvl, keyName: '旗形上緣', points: [{ i: best.s, p: ls[best.s], t: 'L' }, { i: best.e, p: hs[best.e], t: 'H' }, { i: i, p: best.fLo, t: 'L' }], target: roundTick(lvl + poleH, market), entry: roundTick(lvl + tick(lvl, market), market, 'up'), stop: roundTick(best.fLo * 0.99, market, 'down'), desc: '急漲 ' + r1(best.gain) + '%（旗竿）後回檔僅 ' + r1(best.pull) + '%、整理 ' + best.len + ' 根' + (volOk ? '，旗面量縮（符合標準）' : '，旗面量未明顯縮（品質稍弱）') + '。旗形為中繼形態：突破旗形上緣續攻，量度目標 = 突破點 + 旗竿高度 ' + fmtP(poleH) + '；停損放旗面低點下方。' });
      }
      if (bestBear) {
        var poleH2 = hs[bestBear.s] - ls[bestBear.e], lvl2 = Math.min(bestBear.fLo, ls[bestBear.e]);
        push({ name: '空頭旗形（旗竿 ' + r1(bestBear.drop) + '%）', bias: 'bear', state: confirmState(lvl2, 'down'), keyLevel: lvl2, keyName: '旗形下緣', points: [{ i: bestBear.s, p: hs[bestBear.s], t: 'H' }, { i: bestBear.e, p: ls[bestBear.e], t: 'L' }, { i: i, p: bestBear.fHi, t: 'H' }], target: roundTick(lvl2 - poleH2, market), entry: roundTick(lvl2 - tick(lvl2, market), market, 'down'), stop: roundTick(bestBear.fHi * 1.01, market, 'up'), desc: '急跌 ' + r1(-bestBear.drop) + '%（旗竿）後反彈僅 ' + r1(bestBear.bounce) + '%、整理 ' + bestBear.len + ' 根，弱勢整理。跌破旗形下緣續跌，量度目標 = 跌破點 − 旗竿高度；停損放旗面高點上方。' });
      }
    })();
    // ===== 箱型整理（矩形）：上下緣各至少 2 次觸及，箱高 6~30%，≥ 20 根 =====
    (function () {
      for (var L = Math.min(60, i); L >= 20; L -= 5) {
        var top = highest(hs, i - L, i - 1), bot = lowest(ls, i - L, i - 1), boxH = pct(top, bot);
        if (boxH < 6 || boxH > 30) continue;
        // 觸及序列需交替（T-B-T 或 B-T-B 以上），同型觸及相隔 ≥ 4 根才算另一次
        var seqT = [], touchT = 0, touchB = 0;
        for (var y = i - L; y < i; y++) {
          var t = hs[y] >= top * 0.985 ? 'T' : ls[y] <= bot * 1.015 ? 'B' : null; if (!t) continue;
          var lastT = seqT.length ? seqT[seqT.length - 1] : null;
          if (!lastT || lastT.t !== t) { seqT.push({ t: t, i: y }); if (t === 'T') touchT++; else touchB++; }
          else if (y - lastT.i >= 4) { lastT.i = y; if (t === 'T') touchT++; else touchB++; }
        }
        if (seqT.length >= 3 && touchT >= 2 && touchB >= 2) {
          var up = confirmState(top, 'up'), dn = confirmState(bot, 'down');
          var st = up !== 'forming' ? up : dn !== 'forming' ? dn : 'forming';
          var bias = up !== 'forming' ? 'bull' : dn !== 'forming' ? 'bear' : 'neutral';
          var posIn = (b.c - bot) / (top - bot);
          push({ name: '箱型整理（' + L + ' 根，' + r1(boxH) + '%）', bias: bias, state: st, keyLevel: bias === 'bear' ? bot : top, keyName: bias === 'bear' ? '箱底' : '箱頂', box: { top: top, bot: bot, from: i - L }, points: [], target: roundTick(bias === 'bear' ? bot - (top - bot) : top + (top - bot), market), entry: roundTick(bias === 'bear' ? bot - tick(bot, market) : top + tick(top, market), market, bias === 'bear' ? 'down' : 'up'), stop: roundTick(bias === 'bear' ? bot + (top - bot) * 0.35 : top - (top - bot) * 0.35, market, bias === 'bear' ? 'up' : 'down'), desc: '在 ' + fmtP(bot) + ' ~ ' + fmtP(top) + ' 之間橫盤，上下緣各測試 ' + touchT + '／' + touchB + ' 次；現價在箱體 ' + Math.round(posIn * 100) + '% 位置。帶量突破箱頂做多／跌破箱底做空，量度目標 = 一個箱體高度；箱內以低買高賣為主。' });
          break;
        }
      }
    })();
    // ===== 杯柄形（O'Neil）：杯深 12~33%（最多 40%）、杯長 7~65 週（35~325 根）、底部圓弧非 V 型、右緣 -7%~+5%、柄 ≥ 5 根 ≤ 30 根、柄回檔 ≤ 12%（最多 15%）、柄在杯體上半部、柄量縮 =====
    (function () {
      if (n < 60) return;
      var bestCup = null;
      for (var L = Math.min(325, i - 30); L >= 35; L -= 5) {
        var lIdx = i - L, leftHi = hs[lIdx];
        for (var w = lIdx - 3; w <= lIdx + 3; w++) if (w >= 0 && hs[w] > leftHi) { leftHi = hs[w]; lIdx = w; }
        var botIdx = -1, bot = Infinity;
        for (var z = lIdx + 5; z <= i - 8; z++) if (ls[z] < bot) { bot = ls[z]; botIdx = z; }
        if (botIdx < 0) continue;
        var depth = pct(leftHi, bot);
        if (depth < 12 || depth > 40) continue;
        if (botIdx - lIdx < L * 0.25 || i - botIdx < L * 0.2) continue;
        var rIdx = -1, rHi = -Infinity;
        for (var r = botIdx + 5; r <= i - 5; r++) if (hs[r] > rHi) { rHi = hs[r]; rIdx = r; }
        if (rIdx < 0 || pct(rHi, leftHi) < -7 || pct(rHi, leftHi) > 5) continue;
        var hLo = Infinity, hLoIdx = -1;
        for (var q = rIdx + 1; q <= i; q++) if (ls[q] < hLo) { hLo = ls[q]; hLoIdx = q; }
        var handleLen = i - rIdx, handlePull = pct(rHi, hLo);
        if (handleLen < 5 || handleLen > 30 || handlePull > 15 || handlePull < 1) continue;
        if (hLo < bot + (rHi - bot) * 0.5) continue;
        var pre = priorTrend(bars, lIdx, 120);
        bestCup = { lIdx: lIdx, leftHi: leftHi, botIdx: botIdx, bot: bot, rIdx: rIdx, rHi: rHi, hLo: hLo, hLoIdx: hLoIdx, depth: depth, handlePull: handlePull, len: L, handleLen: handleLen, pre: pre, handleVol: avgVol(bars, rIdx + 1, i) / (ind.vol50[i] || ind.vol20[i] || 1) };
        break;
      }
      if (bestCup) {
        var pivot = bestCup.rHi, st = confirmState(pivot, 'up');
        push({ name: '杯柄形（Cup with Handle）', bias: 'bull', state: st, keyLevel: pivot, keyName: '買點（柄部高點）', points: [{ i: bestCup.lIdx, p: bestCup.leftHi, t: 'H' }, { i: bestCup.botIdx, p: bestCup.bot, t: 'L' }, { i: bestCup.rIdx, p: bestCup.rHi, t: 'H' }, { i: bestCup.hLoIdx, p: bestCup.hLo, t: 'L' }], target: roundTick(pivot * 1.2, market), entry: roundTick(pivot + tick(pivot, market), market, 'up'), stop: roundTick(Math.max(bestCup.hLo * 0.99, pivot * 0.92), market, 'down'),
          desc: '杯深 ' + r1(bestCup.depth) + '%、杯長 ' + bestCup.len + ' 根（約 ' + Math.round(bestCup.len / 5) + ' 週），柄部 ' + bestCup.handleLen + ' 根回檔 ' + r1(bestCup.handlePull) + '%、位於杯體上半部' + (bestCup.handleVol < 0.8 ? '、柄部量縮（符合標準）' : '、柄部量未明顯縮') + (bestCup.pre >= 20 ? '；杯前已有 ' + r1(bestCup.pre) + '% 漲勢（符合 O’Neil 先漲 30% 的前提' + (bestCup.pre >= 30 ? '）' : '之下限）') : '；杯前漲勢不足 20%，形態基礎較弱') + '。帶量（≥1.4x）突破柄部高點 ' + fmtP(pivot) + ' 為標準買點，突破後 5% 內可買；停損放柄部低點下方或買點 −7~8%，第一目標 +20%。' });
      }
    })();

    // 有效性過濾：形態必須與現價「相關」
    out = out.filter(function (p) {
      var dist = pct(b.c, p.keyLevel);
      if (p.bias === 'neutral') return dist <= 3 && (p.box ? b.c >= p.box.bot * 0.97 : true);
      if (p.bias === 'bull') {
        if (p.state === 'forming') return dist <= 0 && dist >= -15 && (p.stop == null || b.c > p.stop * 0.995);
        if (p.state === 'after') return dist > 0 && dist <= 10;
        return true;
      }
      if (p.state === 'forming') return dist >= 0 && dist <= 15 && (p.stop == null || b.c < p.stop * 1.005);
      if (p.state === 'after') return dist < 0 && dist >= -10;
      return true;
    });
    // 衝突處理：已確認的突破／跌破，優先於反方向仍在「形成中」的形態
    var confirmedBias = {};
    out.forEach(function (p) { if (p.state === 'confirmed' || p.state === 'confirmed_vol') confirmedBias[p.bias] = true; });
    if (confirmedBias.bull && !confirmedBias.bear) out = out.filter(function (p) { return !(p.bias === 'bear' && p.state === 'forming'); });
    if (confirmedBias.bear && !confirmedBias.bull) out = out.filter(function (p) { return !(p.bias === 'bull' && p.state === 'forming'); });
    var rank = { confirmed_vol: 0, confirmed: 1, forming: 2, after: 3 };
    var order = ['杯柄形', '三重底', '頭肩底', '上升三角形', '下降楔形', 'W 底', '三重頂', '頭肩頂', '下降三角形', '上升楔形', 'M 頭', '多頭旗形', '空頭旗形', '收斂三角形', '箱型'];
    function pri(p) { for (var k = 0; k < order.length; k++) if (p.name.indexOf(order[k]) === 0) return k; return 99; }
    out.sort(function (a, b) { return rank[a.state] - rank[b.state] || pri(a) - pri(b); });
    var kept = [];
    out.forEach(function (p) { if (!kept.some(function (k) { return k.bias === p.bias && Math.abs(pct(k.keyLevel, p.keyLevel)) <= 1.5; })) kept.push(p); });
    return kept.slice(0, 3);
  }
  function fmtP(x) { if (x == null || !isFinite(x)) return '—'; var a = Math.abs(x); return a >= 1000 ? Math.round(x).toString() : a >= 100 ? (+x.toFixed(1)).toString() : a >= 10 ? (+x.toFixed(2)).toString() : (+x.toFixed(3)).toString(); }

  // ---------- 支撐 / 壓力 ----------
  function levels(bars, ind, sw, pos) {
    var i = bars.length - 1, c = bars[i].c, sup = [], res = [];
    function add(arr, p, name) { if (p && isFinite(p)) arr.push({ p: r2(p), name: name }); }
    sw.slice(-8).forEach(function (s) { if (Math.abs(pct(s.p, c)) < 0.4) return; if (s.p < c) add(sup, s.p, '前波低點 ' + bars[s.i].d.slice(5)); else add(res, s.p, '前波高點 ' + bars[s.i].d.slice(5)); });
    ['ma20', 'ma60', 'ma200'].forEach(function (k) { var v = pos.ma[k]; if (v && Math.abs(pct(v, c)) >= 0.4) { if (v < c) add(sup, v, k.toUpperCase()); else add(res, v, k.toUpperCase()); } });
    add(res, pos.hi52, '52 週高'); add(sup, pos.lo52, '52 週低');
    sup.sort(function (a, b) { return b.p - a.p; }); res.sort(function (a, b) { return a.p - b.p; });
    // 去重（相近 1%）
    function dedupe(arr) { var o = []; arr.forEach(function (x) { if (!o.length || Math.abs(pct(x.p, last(o).p)) > 1) o.push(x); else last(o).name += '／' + x.name; }); return o; }
    return { support: dedupe(sup).slice(0, 4), resistance: dedupe(res).slice(0, 4) };
  }

  // ---------- 交易計畫合成 ----------
  function tradePlan(bars, ind, td, vcp, pats, vol, pos, lv, market) {
    var i = bars.length - 1, b = bars[i], atrV = ind.atr14[i] || (b.h - b.l);
    var plans = [];
    function mk(o) {
      // 安全檢查：停損必須在進場價的正確一側（多單在下、空單在上），目標也一樣；不對就改用進場價外約 1 個 ATR（至少 3%）
      if (o.entry && o.stop && ((o.side === 'long' && o.stop >= o.entry) || (o.side === 'short' && o.stop <= o.entry))) {
        var gap0 = Math.max(atrV || 0, o.entry * 0.03);
        o.stop = roundTick(o.side === 'long' ? o.entry - gap0 : o.entry + gap0, market, o.side === 'long' ? 'down' : 'up'); o.stopAdjusted = true;
      }
      if (o.entry && o.target && ((o.side === 'long' && o.target <= o.entry) || (o.side === 'short' && o.target >= o.entry))) o.target = null;
      o.rr = o.target && o.entry && o.stop && o.entry !== o.stop ? r1(Math.abs(o.target - o.entry) / Math.abs(o.entry - o.stop)) : null; o.riskPct = o.entry && o.stop ? r1(Math.abs(o.entry - o.stop) / o.entry * 100) : null; plans.push(o); }
    var extended = pos.bias20 != null && pos.bias20 > 12;
    var climaxWarn = vol.climax;

    // 1. VCP
    if (vcp.found) {
      if (vcp.status === 'breakout') mk({ kind: 'VCP 帶量突破', side: 'long', action: '進場', priority: 1, score: 92, entry: roundTick(Math.max(vcp.entry, b.c), market, 'up'), stop: vcp.stop, target: roundTick(vcp.pivot * 1.2, market), target2: roundTick(vcp.pivot * 1.3, market), why: ['VCP ' + vcp.pattern + ' 收縮完成後帶量突破樞軸 ' + vcp.pivot, '量 ' + vol.rel20 + 'x 20 日均量', vcp.trendOk ? '趨勢模板符合（50MA 上方）' : '注意：中期趨勢未完全轉多'], how: '今日收盤或明日開盤在樞軸上 0~5% 內買進，勿追超過樞軸 +8%；跌回樞軸下方且收盤失守停損價即出。' });
      else if (vcp.status === 'breakout_lowvol') mk({ kind: 'VCP 突破（量不足）', side: 'long', action: '試單／等補量', priority: 2, score: 70, entry: vcp.entry, stop: vcp.stop, target: roundTick(vcp.pivot * 1.2, market), why: ['價格突破樞軸 ' + vcp.pivot + ' 但量僅 ' + vol.rel20 + 'x', '無量突破容易假突破'], how: '可用 1/3 倉位試單，明日若補量（≥1.5x 均量）再加碼；收盤跌回樞軸下停損。' });
      else if (vcp.status === 'extended_ok') mk({ kind: 'VCP 突破後', side: 'long', action: '可買（樞軸上 8% 內）', priority: 2, score: 75, entry: roundTick(b.c, market), stop: vcp.stop, target: roundTick(vcp.pivot * 1.2, market), why: [vcp.statusText], how: '分批買進，停損放樞軸下方（' + vcp.stop + '），跌破即出。' });
      else if (vcp.status === 'at_pivot') mk({ kind: 'VCP 收縮到位', side: 'long', action: '掛單等突破', priority: 2, score: 80, entry: vcp.entry, stop: vcp.stop, target: roundTick(vcp.pivot * 1.2, market), why: [vcp.statusText, '量縮比 ' + vcp.volDry + '（<0.7 為佳）'], how: '在樞軸點 ' + vcp.pivot + ' 上方一檔掛突破買單（' + vcp.entry + '），需伴隨量 ≥1.5x 均量才追；未突破不進場。停損 ' + vcp.stop + '。' });
      else if (vcp.status === 'forming') mk({ kind: 'VCP 形成中', side: 'long', action: '觀察', priority: 4, score: 55, entry: vcp.entry, stop: vcp.stop, target: roundTick(vcp.pivot * 1.2, market), why: [vcp.statusText], how: '等最後一次收縮量縮、價格靠近樞軸再評估；不提前進場。' });
      else if (vcp.status === 'extended') mk({ kind: 'VCP 已延伸', side: 'long', action: '勿追高', priority: 5, score: 40, entry: vcp.pivot, stop: vcp.stop && vcp.stop < vcp.pivot ? vcp.stop : roundTick(vcp.pivot * 0.93, market, 'down'), target: null, why: [vcp.statusText], how: '等回測樞軸點 ' + vcp.pivot + ' 附近不破再買；回測買進的停損放樞軸下方約 7%。' });
    }
    // 2. 經典形態
    pats.forEach(function (p) {
      var st = p.state, isLong = p.bias === 'bull', isShort = p.bias === 'bear';
      if (p.bias === 'neutral') { mk({ kind: p.name, side: 'neutral', action: '箱內操作／等突破', priority: 4, score: 50, entry: p.entry, stop: p.stop, target: p.target, why: [p.desc], how: '靠箱底（' + (p.box ? p.box.bot : '') + '）低接、箱頂（' + (p.box ? p.box.top : '') + '）減碼；帶量突破箱頂改為順勢追多。' }); return; }
      var base = isLong ? 60 : 55;
      if (st === 'confirmed_vol') mk({ kind: p.name + ' 帶量' + (isLong ? '突破' : '跌破'), side: isLong ? 'long' : 'short', action: isLong ? '進場做多' : '出場／做空', priority: 1, score: base + 30, entry: p.entry, stop: p.stop, target: p.target, why: [p.desc, '今日量 ' + vol.rel20 + 'x'], how: isLong ? '突破' + p.keyName + ' ' + p.keyLevel + ' 確認，可於當日收盤或次日回測不破時進場；停損 ' + p.stop + '。' : '跌破' + p.keyName + ' ' + p.keyLevel + ' 確認，多單應出；空單停損 ' + p.stop + '。' });
      else if (st === 'confirmed') mk({ kind: p.name + (isLong ? ' 突破（量不足）' : ' 跌破'), side: isLong ? 'long' : 'short', action: isLong ? '試單' : '減碼／觀察做空', priority: 2, score: base + 15, entry: p.entry, stop: p.stop, target: p.target, why: [p.desc, isLong ? '量僅 ' + vol.rel20 + 'x，需補量確認' : '量 ' + vol.rel20 + 'x'], how: isLong ? '小量試單，補量再加碼；收盤跌回' + p.keyName + '下方停損。' : '多單先減碼；反彈不過' + p.keyName + '時空單進場。' });
      else if (st === 'forming') mk({ kind: p.name + '（形成中）', side: isLong ? 'long' : 'short', action: '等' + (isLong ? '突破' : '跌破') + p.keyName, priority: 3, score: base, entry: p.entry, stop: p.stop, target: p.target, why: [p.desc], how: (isLong ? '在 ' + p.keyName + ' ' + p.keyLevel + ' 上方掛突破買單，需帶量（≥1.5x）；' : '跌破 ' + p.keyName + ' ' + p.keyLevel + ' 時多單出場／空單進場；') + '停損 ' + p.stop + '。' });
      else if (st === 'after') mk({ kind: p.name + '（已' + (isLong ? '突破' : '跌破') + '）', side: isLong ? 'long' : 'short', action: isLong ? '回測不破可買' : '反彈不過可空', priority: 3, score: base + 5, entry: p.keyLevel, stop: isLong ? (p.stop && p.stop < p.keyLevel ? p.stop : roundTick(p.keyLevel - Math.max(atrV, p.keyLevel * 0.03), market, 'down')) : (p.stop && p.stop > p.keyLevel ? p.stop : roundTick(p.keyLevel + Math.max(atrV, p.keyLevel * 0.03), market, 'up')), target: p.target, why: [p.desc, '現價距' + p.keyName + ' ' + r1(pct(b.c, p.keyLevel)) + '%'], how: isLong ? '等回測 ' + p.keyName + ' ' + p.keyLevel + ' 附近不破再進，不追高。' : '反彈至 ' + p.keyName + ' 附近不過再空。' });
    });
    // 3a. 神奇十三轉（TD Countdown 13 完成）
    if (td.recentCountdown) {
      var cdn = td.recentCountdown, agoC = i - cdn.endIdx, bar13 = bars[cdn.endIdx];
      // 價格翻轉確認：買 13 後出現收盤 > 4 根前收盤；賣 13 後收盤 < 4 根前收盤
      var flipped = cdn.type === 'buy' ? (i >= 4 && b.c > bars[i - 4].c) : (i >= 4 && b.c < bars[i - 4].c);
      if (cdn.type === 'buy') {
        var stop13 = roundTick(cdn.low - tick(cdn.low, market), market, 'down');
        var t1 = cdn.setup.tdst, t2 = cdn.low + (cdn.setup.extremeHigh - cdn.low) * 0.5;
        mk({ kind: '神奇十三轉 買 13' + (cdn.deferred ? '（遞延 ' + cdn.deferred + ' 次）' : ''), side: 'long', action: flipped ? '反轉買點（已價格翻轉）' : '等待價格翻轉後買進', priority: flipped ? 1 : 2, score: (flipped ? 85 : 76) - Math.min(agoC * 2, 12) + (pos.pos52 <= 35 ? 5 : -5), entry: roundTick(Math.max(bar13.h, flipped ? b.c : bar13.h) + tick(b.c, market), market, 'up'), stop: stop13, target: roundTick(Math.max(t1, t2), market), target2: roundTick(Math.min(t1, t2), market),
          why: ['買進倒數 13 於 ' + cdn.date + ' 完成（由 ' + bars[cdn.startIdx].d + ' 的買進結構 9 啟動，倒數歷時 ' + (cdn.endIdx - cdn.startIdx) + ' 根）— 下跌趨勢竭盡訊號，強度高於單一 9', flipped ? '今日收盤已高於 4 根前收盤（價格翻轉），反轉獲得確認' : '尚未出現價格翻轉（收盤 > 4 根前收盤），先不追', '位置：' + pos.level + '（52 週位置 ' + pos.pos52 + '%）'],
          how: '13 出現後不立刻接刀：等（a）收盤 > 4 根前收盤 或（b）站上第 13 根高點 ' + fmtP(bar13.h) + ' 再進場；停損放倒數期間最低點 ' + fmtP(cdn.low) + ' 下方；第一目標 TDST 阻力 ' + fmtP(t1) + '，第二目標為跌幅一半 ' + fmtP(t2) + '。若之後出現新的賣出結構 9，訊號完成、全部獲利了結。' });
      } else {
        var stopS13 = roundTick(cdn.high + tick(cdn.high, market), market, 'up');
        var s1 = cdn.setup.tdst, s2 = cdn.high - (cdn.high - cdn.setup.extremeLow) * 0.5;
        mk({ kind: '神奇十三轉 賣 13' + (cdn.deferred ? '（遞延 ' + cdn.deferred + ' 次）' : ''), side: 'short', action: flipped ? '趨勢竭盡，出場／放空' : '減碼，等價格翻轉確認', priority: flipped ? 1 : 2, score: (flipped ? 83 : 74) - Math.min(agoC * 2, 12) + (pos.pos52 >= 65 ? 5 : -5), entry: roundTick(Math.min(bar13.l, flipped ? b.c : bar13.l) - tick(b.c, market), market, 'down'), stop: stopS13, target: roundTick(Math.min(s1, s2), market), target2: roundTick(Math.max(s1, s2), market),
          why: ['賣出倒數 13 於 ' + cdn.date + ' 完成（由 ' + bars[cdn.startIdx].d + ' 的賣出結構 9 啟動）— 上漲趨勢竭盡訊號，比單一 9 更可靠', flipped ? '今日收盤已低於 4 根前收盤（價格翻轉），轉弱確認' : '尚未價格翻轉，強勢股 13 後仍可能盤整，先減碼不必全出', '位置：' + pos.level],
          how: '持股者：13 出現先減碼一半，跌破第 13 根低點 ' + fmtP(bar13.l) + ' 或出現價格翻轉時全出。空單：翻轉確認後進場，停損放倒數期間最高點 ' + fmtP(cdn.high) + ' 上方，第一目標 TDST 支撐 ' + fmtP(s1) + '。' });
      }
    }
    // 3. 神奇九轉
    if (td.recentSetup) {
      var s = td.recentSetup, ago = i - s.endIdx;
      var lowN = Math.min.apply(null, bars.slice(s.startIdx, s.endIdx + 1).map(function (x) { return x.l; }));
      var highN = Math.max.apply(null, bars.slice(s.startIdx, s.endIdx + 1).map(function (x) { return x.h; }));
      if (s.type === 'buy') {
        var lowPos = pos.pos52 <= 40 || (pos.bias20 != null && pos.bias20 < -6);
        mk({ kind: '神奇九轉 買 9' + (s.perfected ? '（完美）' : ''), side: 'long', action: lowPos ? '反彈買點' : '短線反彈（逆勢，輕倉）', priority: lowPos ? 2 : 3, score: (s.perfected ? 70 : 60) + (lowPos ? 8 : -8) - Math.min(ago * 3, 12), entry: roundTick(bars[s.endIdx].h + tick(b.c, market), market, 'up'), stop: roundTick(lowN - tick(lowN, market), market, 'down'), target: roundTick(s.tdst, market), why: ['連續 9 根收盤低於 4 根前收盤（' + s.date + ' 完成' + (ago ? '，' + ago + ' 天前' : '') + '）', s.perfected ? '第 8/9 根低點低於第 6/7 根 → 完美結構，勝率較高' : '未完美結構，反彈力道可能較弱', '位置：' + pos.level + '（52 週位置 ' + pos.pos52 + '%）'], how: '不接刀：等價格站上第 9 根高點 ' + bars[s.endIdx].h + ' 再進；停損放結構最低點 ' + lowN + ' 下方；第一目標 TDST 阻力 ' + r2(s.tdst) + '，到達減碼。若 4 根內不反彈視為失效。' });
      } else {
        var highPos = pos.pos52 >= 60 || (pos.bias20 != null && pos.bias20 > 6);
        mk({ kind: '神奇九轉 賣 9' + (s.perfected ? '（完美）' : ''), side: 'short', action: highPos ? '減碼／獲利了結' : '注意漲勢趨緩', priority: highPos ? 2 : 3, score: (s.perfected ? 68 : 58) + (highPos ? 8 : -8) - Math.min(ago * 3, 12), entry: roundTick(bars[s.endIdx].l - tick(b.c, market), market, 'down'), stop: roundTick(highN + tick(highN, market), market, 'up'), target: roundTick(s.tdst, market), why: ['連續 9 根收盤高於 4 根前收盤（' + s.date + ' 完成' + (ago ? '，' + ago + ' 天前' : '') + '）', s.perfected ? '第 8/9 根高點高於第 6/7 根 → 完美結構' : '未完美結構', '位置：' + pos.level], how: '多單分批獲利了結、停利上移到第 9 根低點 ' + bars[s.endIdx].l + '；跌破後可視為短空訊號，空單停損放結構最高點 ' + highN + ' 上方，目標 TDST 支撐 ' + r2(s.tdst) + '。強勢股九轉常只是盤整，勿盲目放空。' });
      }
    }
    // 4. 帶量突破（無特定形態）
    if (vol.volBreakout && !plans.some(function (p) { return p.priority === 1; })) {
      var lo10 = lowest(bars.map(function (x) { return x.l; }), i - 10, i);
      mk({ kind: '帶量突破 ' + (vol.breakout60 ? '60' : '20') + ' 日高', side: 'long', action: extended ? '突破但已過熱，小量' : '順勢進場', priority: extended ? 3 : 2, score: extended ? 55 : 72, entry: roundTick(b.c, market), stop: roundTick(Math.max(lo10, b.c - 2 * atrV), market, 'down'), target: roundTick(b.c + (b.c - Math.max(lo10, b.c - 2 * atrV)) * 2.5, market), why: ['收盤創 ' + (vol.breakout60 ? '60' : '20') + ' 日新高，量 ' + vol.rel20 + 'x 均量，收在當日高檔區（' + Math.round(vol.closePos * 100) + '%）'], how: '突破日收盤或次日不破突破日低點進場；停損放近 10 日低點／2 倍 ATR；目標 2.5R。' });
    }
    if (vol.volBreakdown) mk({ kind: '帶量跌破 20 日低', side: 'short', action: '多單出場', priority: 2, score: 65, entry: roundTick(b.c, market), stop: roundTick(highest(bars.map(function (x) { return x.h; }), i - 10, i), market, 'up'), target: roundTick(b.c - 2 * atrV * 2, market), why: ['收盤跌破 20 日低點，量 ' + vol.rel20 + 'x'], how: '持股停損出場；空單停損放近 10 日高點。' });
    // 5. 警示
    var warnings = [];
    if (td.active && td.active.count >= 10) warnings.push((td.active.type === 'buy' ? '買進' : '賣出') + '倒數已至 ' + td.active.count + '/13，' + (td.active.type === 'buy' ? '下跌' : '上漲') + '趨勢接近竭盡，' + (td.active.type === 'buy' ? '空單應準備回補、多單勿再追殺' : '多單應開始分批停利、勿再追高'));
    if (climaxWarn) warnings.push('高檔爆量：量 ' + vol.rel20 + 'x 且位於 52 週高檔區，收盤弱勢，有主力出貨疑慮，多單應設緊停利');
    if (extended) warnings.push('20 日乖離 +' + pos.bias20 + '%，短線過熱，任何進場都應縮小部位或等拉回');
    if (pos.rsi != null && pos.rsi >= 80) warnings.push('RSI ' + pos.rsi + ' 極度超買');
    if (pos.stage.indexOf('第四') === 0) warnings.push('處於第四階段下跌期，多方形態勝率打折，以反彈減碼為主');
    if (vol.dryUp < 0.5 && !vcp.found) warnings.push('成交量極度萎縮，流動性風險，突破前不宜重倉');
    // 無計畫時的預設
    if (!plans.length) {
      var side = pos.aligned ? 'long' : pos.bearAligned ? 'short' : 'neutral';
      mk({ kind: '無明確形態訊號', side: side, action: '觀望', priority: 6, score: 30, entry: null, stop: null, target: null, why: ['目前未偵測到 VCP、標準形態、九轉或帶量突破訊號', '趨勢：' + pos.stage], how: side === 'long' ? '多頭排列中，可等拉回 20 日線（' + (pos.ma.ma20 ? roundTick(pos.ma.ma20, market) : '—') + '）不破再考慮，停損放 60 日線下。' : side === 'short' ? '空頭排列中，反彈至 20 日線壓力不過為減碼點，不宜逆勢摸底。' : '趨勢不明，等待形態完成再進場。' });
    }
    plans.forEach(function (p) { if (p.rr != null && p.rr < 1 && p.priority < 6) { p.priority += 1; p.score -= 15; p.why.push('盈虧比 ' + p.rr + ' 偏低（<1），需等更好的進場點或縮小停損'); } });
    plans.sort(function (a, b) { return a.priority - b.priority || b.score - a.score; });
    var primary = plans[0];
    // 總結
    var verdictSide = primary.side === 'long' ? '偏多' : primary.side === 'short' ? '偏空' : '中性';
    var confidence = Math.max(0, Math.min(100, primary.score - warnings.length * 8 + (pos.aligned && primary.side === 'long' ? 5 : 0) + (pos.bearAligned && primary.side === 'short' ? 5 : 0)));
    return { plans: plans, primary: primary, warnings: warnings, verdict: verdictSide, confidence: Math.round(confidence) };
  }

  // ---------- 主分析 ----------
  function computeIndicators(bars) {
    var c = bars.map(function (b) { return b.c; }), v = bars.map(function (b) { return b.v; });
    var ind = { ma5: sma(c, 5), ma10: sma(c, 10), ma20: sma(c, 20), ma30: sma(c, 30), ma50: sma(c, 50), ma60: sma(c, 60), ma150: sma(c, 150), ma200: sma(c, 200), vol20: sma(v, 20), vol50: sma(v, 50), atr14: atr(bars, 14), rsi14: rsi(c, 14) };
    return ind;
  }

  function analyze(raw, opts) {
    opts = opts || {};
    var market = opts.market || 'TW';
    var bars = toBars(raw);
    if (opts.timeframe === 'W') bars = toWeekly(bars);
    var n = bars.length;
    if (n < 30) return { ok: false, error: '資料不足（' + n + ' 根），至少需要 30 根 K 線', bars: bars };
    var ind = computeIndicators(bars);
    ind.weekly = opts.timeframe === 'W';
    var sw = swings(bars, opts.timeframe === 'W' ? 2 : 3, opts.timeframe === 'W' ? 5 : 3);
    var td = tdSequential(bars);
    var pos = positionAnalysis(bars, ind);
    ind.pos52 = pos.pos52;
    var vol = volumeAnalysis(bars, ind);
    var vcp = vcpAnalysis(bars, ind, sw, market);
    var pats = classicPatterns(bars, ind, sw, market);
    var lv = levels(bars, ind, sw, pos);
    var plan = tradePlan(bars, ind, td, vcp, pats, vol, pos, lv, market);
    var i = n - 1, b = bars[i], prev = bars[i - 1];
    return {
      ok: true, market: market, timeframe: opts.timeframe || 'D', bars: bars, ind: ind, swings: sw,
      last: { date: b.d, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, change: r2(b.c - prev.c), changePct: r2(pct(b.c, prev.c)) },
      td: td, position: pos, volume: vol, vcp: vcp, patterns: pats, levels: lv, plan: plan,
      summary: buildSummary(b, td, pos, vol, vcp, pats, plan)
    };
  }

  function buildSummary(b, td, pos, vol, vcp, pats, plan) {
    var p = plan.primary, parts = [];
    var mainPat = vcp.found ? 'VCP（' + vcp.pattern + '）' : pats.length ? pats[0].name : null;
    parts.push('型態：' + (mainPat || '無標準形態') + (pats.length && vcp.found ? '，另有 ' + pats[0].name : ''));
    parts.push('位置：' + pos.level + '／' + pos.stage);
    parts.push('量能：' + vol.verdict);
    parts.push('九轉／十三轉：' + td.status);
    parts.push('結論：' + plan.verdict + '（信心 ' + plan.confidence + '）— ' + p.kind + '，' + p.action + (p.entry ? '；進場 ' + p.entry + '，停損 ' + p.stop + (p.target ? '，目標 ' + p.target : '') + (p.rr ? '，盈虧比 ' + p.rr : '') : ''));
    return parts;
  }

  // 掃描用：精簡訊號（供全市場掃描）
  function scanSignals(raw, market) {
    var a = analyze(raw, { market: market });
    if (!a.ok) return null;
    var p = a.plan.primary;
    return {
      date: a.last.date, close: a.last.close, chg: a.last.changePct, vol: a.last.volume, relVol: a.volume.rel20,
      td: a.td.current, td9: a.td.recentSetup ? (a.td.recentSetup.type === 'buy' ? -9 : 9) : 0, tdPerfect: a.td.recentSetup ? a.td.recentSetup.perfected : false,
      cd: a.td.active ? (a.td.active.type === 'buy' ? -a.td.active.count : a.td.active.count) : 0, cd13: a.td.recentCountdown ? (a.td.recentCountdown.type === 'buy' ? -13 : 13) : 0,
      vcp: a.vcp.found ? a.vcp.status : (a.vcp.status === 'failed' ? 'failed' : ''), vcpPattern: a.vcp.found ? a.vcp.pattern : '',
      pattern: a.patterns.length ? a.patterns[0].name : '', patState: a.patterns.length ? a.patterns[0].state : '', patBias: a.patterns.length ? a.patterns[0].bias : '',
      volBreakout: a.volume.volBreakout, volBreakdown: a.volume.volBreakdown, climax: a.volume.climax, dryUp: a.volume.dryUp,
      pos52: a.position.pos52, level: a.position.level, stage: a.position.stage, aligned: a.position.aligned, bearAligned: a.position.bearAligned, tt: a.position.trendTemplate.pass, rsi: a.position.rsi, bias20: a.position.bias20,
      side: p.side, kind: p.kind, action: p.action, score: a.plan.confidence, entry: p.entry, stop: p.stop, target: p.target, rr: p.rr
    };
  }


  // ---------- 訊號回測（逐根前推，同一套規則；用於勝率／期望值） ----------
  var ACT_NOW = /進場|試單|反彈買點|減碼|獲利了結|出場|放空|可買/;
  function signalKindKey(p) { return p.kind.replace(/（.*?）/g, '').replace(/\s*[+\-]?\d+(\.\d+)?%/g, '').replace(/旗竿\s*/g, '').replace(/\s+/g, ' ').trim(); }
  function isActionable(p) { return p && p.priority <= 2 && ACT_NOW.test(p.action) && !/等|勿/.test(p.action) && (p.side === 'long' || p.side === 'short') && p.entry && p.stop && Math.abs(p.entry - p.stop) > 0; }
  // 回傳每根的可行動訊號（null 或 {side, kind, key, entry, stop, target, exit}）；minBars 之前不計算
  function signalSeries(bars, market, opts) {
    opts = opts || {};
    var n = bars.length, minBars = opts.minBars || 80, step = 1, out = new Array(n).fill(null);
    var rawAll = bars.map(function (b) { return [b.d, b.o, b.h, b.l, b.c, b.v]; });
    var from = Math.max(minBars, opts.from == null ? 0 : opts.from);
    for (var i = from; i < n; i++) {
      var sub = rawAll.slice(Math.max(0, i + 1 - (opts.lookback || 400)), i + 1);
      try {
        var r = analyze(sub, { market: market });
        if (r.ok && isActionable(r.plan.primary)) { var p = r.plan.primary; out[i] = { side: p.side, kind: p.kind.replace(/（.*?）/g, ''), key: signalKindKey(p), entry: p.entry, stop: p.stop, target: p.target, exit: /減碼|獲利了結|出場/.test(p.action), score: r.plan.confidence }; }
      } catch (e) { }
    }
    return out;
  }
  // 交易模擬：訊號當根收盤進場（同一訊號連續出現只取第一根）；停損以次根起的 low/high 觸價（跳空以開盤成交）；目標同理；maxHold 根後以收盤出場
  function simulateTrades(bars, sig, opts) {
    opts = opts || {};
    var maxHold = opts.maxHold || 40, trades = [], prevKey = null, n = bars.length, openUntil = {};
    for (var i = 0; i < n; i++) {
      var s = sig[i];
      if (!s) { prevKey = null; continue; }
      var k = s.side + '|' + s.key; if (k === prevKey) continue; prevKey = k;
      if (s.exit) continue; // 出場／減碼類訊號不模擬為新倉
      if (openUntil[k] != null && i <= openUntil[k]) continue; // 同類訊號持倉中不重複進場
      var entry = bars[i].c, stop = s.stop, risk = Math.abs(entry - stop); if (!(risk > 0)) continue;
      var target = s.target && ((s.side === 'long' && s.target > entry) || (s.side === 'short' && s.target < entry)) ? s.target : (s.side === 'long' ? entry + 2 * risk : entry - 2 * risk);
      var exitIdx = null, exitPx = null, reason = null;
      for (var j = i + 1; j < n && j <= i + maxHold; j++) {
        var b = bars[j];
        if (s.side === 'long') {
          if (b.o <= stop) { exitPx = b.o; reason = 'stop'; } else if (b.l <= stop) { exitPx = stop; reason = 'stop'; }
          else if (b.o >= target) { exitPx = b.o; reason = 'target'; } else if (b.h >= target) { exitPx = target; reason = 'target'; }
        } else {
          if (b.o >= stop) { exitPx = b.o; reason = 'stop'; } else if (b.h >= stop) { exitPx = stop; reason = 'stop'; }
          else if (b.o <= target) { exitPx = b.o; reason = 'target'; } else if (b.l <= target) { exitPx = target; reason = 'target'; }
        }
        if (reason) { exitIdx = j; break; }
      }
      var open = false;
      if (!reason) { var last = Math.min(n - 1, i + maxHold); exitIdx = last; exitPx = bars[last].c; reason = last === i + maxHold ? 'time' : 'open'; open = reason === 'open'; }
      var R = (s.side === 'long' ? exitPx - entry : entry - exitPx) / risk;
      openUntil[k] = exitIdx;
      trades.push({ i: i, date: bars[i].d, side: s.side, kind: s.kind, key: s.key, entry: entry, stop: stop, target: target, exitIdx: exitIdx, exitDate: bars[exitIdx].d, exitPx: exitPx, reason: reason, R: Math.round(R * 100) / 100, pct: Math.round((s.side === 'long' ? exitPx / entry - 1 : 1 - exitPx / entry) * 10000) / 100, hold: exitIdx - i, open: open });
    }
    return trades;
  }
  function tradeStats(trades) {
    var closed = trades.filter(function (t) { return !t.open; });
    var n = closed.length; if (!n) return { n: 0, open: trades.length - n };
    var wins = closed.filter(function (t) { return t.R > 0; }), losses = closed.filter(function (t) { return t.R <= 0; });
    var sumR = closed.reduce(function (s, t) { return s + t.R; }, 0);
    var avgWin = wins.length ? wins.reduce(function (s, t) { return s + t.R; }, 0) / wins.length : 0;
    var avgLoss = losses.length ? losses.reduce(function (s, t) { return s + t.R; }, 0) / losses.length : 0;
    var gp = wins.reduce(function (s, t) { return s + t.R; }, 0), gl = -losses.reduce(function (s, t) { return s + t.R; }, 0);
    var maxConsLoss = 0, cur = 0; closed.forEach(function (t) { if (t.R <= 0) { cur++; maxConsLoss = Math.max(maxConsLoss, cur); } else cur = 0; });
    var eq = 0, peak = 0, mdd = 0; closed.forEach(function (t) { eq += t.R; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq - peak); });
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    return { n: n, open: trades.length - n, win: r2(wins.length / n * 100), avgR: r2(sumR / n), expectancy: r2(sumR / n), avgWin: r2(avgWin), avgLoss: r2(avgLoss), pf: gl > 0 ? r2(gp / gl) : (gp > 0 ? 99 : 0), totalR: r2(sumR), maxConsLoss: maxConsLoss, maxDD: r2(mdd), avgHold: r2(closed.reduce(function (s, t) { return s + t.hold; }, 0) / n), avgPct: r2(closed.reduce(function (s, t) { return s + t.pct; }, 0) / n) };
  }
  function backtest(raw, market, opts) {
    var bars = toBars(raw); opts = opts || {};
    if (opts.timeframe === 'W') bars = toWeekly(bars);
    var sig = signalSeries(bars, market, opts);
    var trades = simulateTrades(bars, sig, opts);
    var byKey = {}; trades.forEach(function (t) { (byKey[t.key] = byKey[t.key] || []).push(t); });
    var kinds = {}; Object.keys(byKey).forEach(function (k) { kinds[k] = tradeStats(byKey[k]); });
    var long = tradeStats(trades.filter(function (t) { return t.side === 'long'; })), short = tradeStats(trades.filter(function (t) { return t.side === 'short'; }));
    return { bars: bars, sig: sig, trades: trades, all: tradeStats(trades), long: long, short: short, kinds: kinds };
  }
  return { backtest: backtest, signalSeries: signalSeries, simulateTrades: simulateTrades, tradeStats: tradeStats, signalKindKey: signalKindKey, isActionable: isActionable, _classicPatterns: classicPatterns, _computeIndicators: computeIndicators, analyze: analyze, scanSignals: scanSignals, toBars: toBars, toWeekly: toWeekly, swings: swings, tdSequential: tdSequential, sma: sma, ema: ema, atr: atr, rsi: rsi, tick: tick, roundTick: roundTick, version: '1.0.0' };
});
