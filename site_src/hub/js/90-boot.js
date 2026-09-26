/* ===== 啟動 ===== */
loadWatchLocal();
try { state.seasonWin = localStorage.getItem('hub.seasonWin') || '20'; } catch (e) { state.seasonWin = '20'; }
Promise.all([
  loadJSON('data/index.json'),
  loadZ('data/scan.json').catch(function () { return {}; }),
  loadZ('data/supply.json').catch(function (e) { console.warn('supply', e); return null; }),
  loadJSON('data/season.json').catch(function (e) { console.warn('season', e); return null; }),
  loadJSON('data/settle.json').catch(function (e) { console.warn('settle', e); return null; }),
  loadJSON('data/stats.json').catch(function (e) { console.warn('stats', e); return null; }),
  loadZ('data/indices.json').catch(function (e) { console.warn('indices', e); return null; })
]).then(function (res) {
  state.indices = res[6] && res[6].bars ? res[6] : null;
  state.stats = res[5] && res[5].n ? res[5] : null;
  var idx = res[0]; state.index = idx; idx.stocks.forEach(function (s) { state.byCode[s.c] = s; });
  state.scan = res[1] || {};
  if (res[2]) { var S = res[2]; S.byCode = {}; S.data.forEach(function (d) { S.byCode[d.c] = d; }); S.byRoster = {}; S.roster.forEach(function (r) { S.byRoster[r[0]] = r; }); state.supply = S; }
  state.season = res[3]; state.settle = res[4];
  buildUniverse();
  $('#dataDate').textContent = '價量 ' + idx.date + ' · ' + idx.stocks.length + ' 檔' + (state.supply ? ' · 名錄 ' + state.supply.roster.length : '');
  $('#footInfo').textContent = '價量涵蓋：' + (idx.markets && idx.markets.TW ? '台股 ' + idx.markets.TW + ' 檔' : '') + (idx.markets && idx.markets.US ? '，美股 ' + idx.markets.US + ' 檔' : '') + '，更新至 ' + idx.date + '。' + (state.supply ? '供應鏈名錄 ' + state.supply.roster.length + ' 檔（' + state.supply.data.length + ' 檔含上下游）。' : '') + (state.season ? '季節性統計至 ' + state.season.meta.TWII.last + '。' : '') + (state.settle ? '結算統計 ' + state.settle.first + '～' + state.settle.last + '，' + state.settle.n_settle + ' 次。' : '') + (idx.note || '');
  initDB();
  showRoute();
}).catch(function (err) { $('#stockBody').className = ''; $('#stockBody').innerHTML = '<div class="errbox">資料載入失敗：' + esc(err.message) + '</div>'; $('#view-stock').hidden = false; $('#dataDate').textContent = '資料載入失敗'; });
