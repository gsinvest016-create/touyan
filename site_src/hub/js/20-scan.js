/* ===== 訊號掃描 / 自選股 ===== */
var cols = [
  { k: 'star', t: '', f: function (s) { return starBtn(s.c); }, nosort: true },
  { k: 'c', t: '代號', f: function (s) { return '<b class="num">' + esc(s.c) + '</b>'; } },
  { k: 'n', t: '名稱', f: function (s) { return esc(s.n) + ' <span style="color:var(--ink3);font-size:11px">' + (s.m === 'TW' ? '台' : '美') + '</span>'; } },
  { k: 'close', t: '收盤', num: true, f: function (s, g) { return '<span class="num">' + fmt.p(g.close) + '</span>'; } },
  { k: 'chg', t: '漲跌%', num: true, f: function (s, g) { return '<span class="num ' + (g.chg >= 0 ? 'up' : 'dn') + '">' + fmt.pct(g.chg) + '</span>'; } },
  { k: 'relVol', t: '量比', num: true, f: function (s, g) { return '<span class="num' + (g.relVol >= 1.5 ? ' up' : '') + '">' + g.relVol + 'x</span>'; } },
  { k: 'side', t: '方向', f: function (s, g) { return '<span class="pill ' + (g.side === 'long' ? 'long' : g.side === 'short' ? 'short' : '') + '">' + (g.side === 'long' ? '偏多' : g.side === 'short' ? '偏空' : '中性') + '</span>'; } },
  { k: 'kind', t: '主訊號', f: function (s, g) { return esc(g.kind) + ' <span style="color:var(--ink3)">' + esc(g.action) + '</span>'; } },
  { k: 'score', t: '信心', num: true, f: function (s, g) { return '<span class="num">' + g.score + '</span>'; } },
  { k: 'entry', t: '進場', num: true, f: function (s, g) { return '<span class="num">' + fmt.p(g.entry) + '</span>'; } },
  { k: 'stop', t: '停損', num: true, f: function (s, g) { return '<span class="num dn">' + fmt.p(g.stop) + '</span>'; } },
  { k: 'target', t: '目標', num: true, f: function (s, g) { return '<span class="num up">' + fmt.p(g.target) + '</span>'; } },
  { k: 'rr', t: 'R', num: true, f: function (s, g) { return '<span class="num">' + (g.rr == null ? '—' : g.rr) + '</span>'; } },
  { k: 'td', t: '九轉', num: true, f: function (s, g) { return g.td ? '<span class="num ' + (g.td > 0 ? 'up' : 'dn') + '">' + (g.td > 0 ? '↑' : '↓') + Math.min(Math.abs(g.td), 9) + (g.td9 ? (g.tdPerfect ? ' ★' : ' 9') : '') + '</span>' : '—'; } },
  { k: 'cd', t: '十三轉', num: true, f: function (s, g) { if (g.cd13) return '<span class="pill ' + (g.cd13 < 0 ? 'ok' : 'hot') + '">' + (g.cd13 < 0 ? '買' : '賣') + ' 13</span>'; return g.cd ? '<span class="num ' + (g.cd > 0 ? 'up' : 'dn') + '">' + (g.cd > 0 ? '賣' : '買') + Math.abs(g.cd) + '/13</span>' : '—'; } },
  { k: 'vcp', t: 'VCP', f: function (s, g) { var t = { breakout: '突破', breakout_lowvol: '突破(量弱)', at_pivot: '到位', forming: '形成', extended_ok: '突破後', extended: '延伸', failed: '破壞' }[g.vcp]; return t ? '<span class="pill ' + (g.vcp === 'breakout' ? 'long' : g.vcp === 'at_pivot' ? 'warnp' : '') + '">' + t + ' ' + esc((g.vcpPattern || '').split(' ')[0]) + '</span>' : '—'; } },
  { k: 'pattern', t: '形態', f: function (s, g) { return g.pattern ? esc(g.pattern.replace(/（.*?）/g, '')) + (g.patState.indexOf('confirmed') === 0 ? ' <span class="pill ' + (g.patBias === 'bear' ? 'short' : 'long') + '">確認</span>' : '') : '—'; } },
  { k: 'pos52', t: '52週位置', num: true, f: function (s, g) { return '<span class="num">' + g.pos52 + '%</span> <span style="font-size:11px;color:var(--ink3)">' + esc(g.level) + '</span>'; } },
  { k: 'tt', t: '模板', num: true, f: function (s, g) { return '<span class="num">' + g.tt + '/7</span>'; } }
];
var filterFns = {
  vcp_ready: function (g) { return g.vcp === 'at_pivot' || g.vcp === 'breakout' || g.vcp === 'breakout_lowvol' || g.vcp === 'extended_ok'; },
  td_buy: function (g) { return g.td9 === -9 || g.td <= -9; }, td_sell: function (g) { return g.td9 === 9 || g.td >= 9; },
  cd_buy: function (g) { return g.cd13 === -13 || g.cd <= -10; }, cd_sell: function (g) { return g.cd13 === 13 || g.cd >= 10; },
  vol_bo: function (g) { return g.volBreakout; }, pat_bull: function (g) { return g.patBias === 'bull'; }, pat_bear: function (g) { return g.patBias === 'bear'; },
  climax: function (g) { return g.climax; }, tt7: function (g) { return g.tt >= 7; }, low: function (g) { return g.pos52 <= 30; }, high: function (g) { return g.pos52 >= 75; }
};
$('#scanFilters').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mk) { state.mk = b.dataset.mk; $$('[data-mk]', $('#scanFilters')).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }
  else if (b.dataset.f) { state.filters[b.dataset.f] = !state.filters[b.dataset.f]; b.setAttribute('aria-pressed', !!state.filters[b.dataset.f]); }
  renderScan();
});
function rows(codes) { return codes.map(function (c) { return { s: state.byCode[c], g: state.scan[c] }; }).filter(function (r) { return r.s && r.g; }); }
function sortRows(rs) {
  var k = state.sort.key, d = state.sort.dir;
  rs.sort(function (a, b) { var va = k in a.g ? a.g[k] : a.s[k], vb = k in b.g ? b.g[k] : b.s[k]; if (va == null) return 1; if (vb == null) return -1; if (typeof va === 'string') return va.localeCompare(vb) * d; return (va - vb) * d; });
  return rs;
}
function renderTable(tbl, rs, emptyMsg) {
  var thead = tbl.querySelector('thead'), tbody = tbl.querySelector('tbody');
  thead.innerHTML = '<tr>' + cols.map(function (c) { return '<th data-k="' + c.k + '" class="' + (state.sort.key === c.k ? 'sorted' : '') + (c.num ? ' num' : '') + '"' + (c.nosort ? '' : ' role="button"') + '>' + c.t + (state.sort.key === c.k ? (state.sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr>';
  thead.onclick = function (e) { var th = e.target.closest('th'); if (!th || !th.dataset.k || th.dataset.k === 'star') return; if (state.sort.key === th.dataset.k) state.sort.dir *= -1; else { state.sort.key = th.dataset.k; state.sort.dir = th.dataset.k === 'c' || th.dataset.k === 'n' ? 1 : -1; } renderScan(); renderWatch(); };
  if (!rs.length) { tbody.innerHTML = '<tr><td colspan="' + cols.length + '"><div class="empty">' + emptyMsg + '</div></td></tr>'; return; }
  tbody.innerHTML = rs.slice(0, 400).map(function (r) { return '<tr class="click" data-code="' + esc(r.s.c) + '">' + cols.map(function (c) { return '<td class="' + (c.num ? 'num' : '') + '">' + c.f(r.s, r.g) + '</td>'; }).join('') + '</tr>'; }).join('');
  tbody.onclick = function (e) { if (e.target.closest('.star')) return; var tr = e.target.closest('tr'); if (tr && tr.dataset.code) goStock(tr.dataset.code); };
}
function renderScan() {
  if (!state.index) return;
  var codes = state.index.stocks.filter(function (s) { return state.mk === 'ALL' || s.m === state.mk; }).map(function (s) { return s.c; });
  var rs = rows(codes), active = Object.keys(state.filters).filter(function (k) { return state.filters[k]; });
  if (active.length) rs = rs.filter(function (r) { return active.every(function (k) { return filterFns[k](r.g); }); });
  sortRows(rs);
  $('#scanCount').textContent = rs.length + ' 檔' + (rs.length > 400 ? '（顯示前 400）' : '');
  renderTable($('#scanTable'), rs, '沒有符合條件的股票，試著減少篩選條件。');
}
function renderWatch() {
  if (!state.index) return;
  var rs = sortRows(rows(state.watch));
  $('#watchCount').textContent = state.watch.length ? state.watch.length + ' 檔' : '';
  var missing = state.watch.filter(function (c) { return !state.byCode[c]; });
  renderTable($('#watchTable'), rs, '尚未加入自選股。在搜尋結果、個股頁或掃描表點 ☆ 即可加入。');
  if (missing.length) { var tb = $('#watchTable tbody'); tb.insertAdjacentHTML('beforeend', '<tr><td colspan="' + cols.length + '" style="color:var(--ink3);font-size:12px">尚無價量資料的自選：' + missing.map(function (c) { return '<a href="#/stock/' + esc(c) + '">' + esc(c) + ' ' + esc(nameOf(c)) + '</a>'; }).join('、') + '</td></tr>'); }
}
