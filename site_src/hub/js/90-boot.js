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
  var genTxt = ''; try { if (idx.generated) { var gd = new Date(idx.generated); genTxt = ' · 更新 ' + (gd.getMonth() + 1) + '/' + gd.getDate() + ' ' + String(gd.getHours()).padStart(2, '0') + ':' + String(gd.getMinutes()).padStart(2, '0'); } } catch (e) { }
  $('#dataDate').textContent = '價量 ' + idx.date + ' · ' + idx.stocks.length + ' 檔' + (state.supply ? ' · 名錄 ' + state.supply.roster.length : '') + genTxt;
  $('#dataDate').title = '「價量」是最後一個交易日；「更新」是網站最後一次重新整理資料的時間（休市日價量日期不會變）';
  $('#footInfo').textContent = '價量涵蓋：' + (idx.markets && idx.markets.TW ? '台股 ' + idx.markets.TW + ' 檔' : '') + (idx.markets && idx.markets.US ? '，美股 ' + idx.markets.US + ' 檔' : '') + '，更新至 ' + idx.date + '。' + (state.supply ? '供應鏈名錄 ' + state.supply.roster.length + ' 檔（' + state.supply.data.length + ' 檔含上下游）。' : '') + (state.season ? '季節性統計至 ' + state.season.meta.TWII.last + '。' : '') + (state.settle ? '結算統計 ' + state.settle.first + '～' + state.settle.last + '，' + state.settle.n_settle + ' 次。' : '') + (idx.note || '');
  initDB();
  showRoute();
}).catch(function (err) { $('#stockBody').className = ''; $('#stockBody').innerHTML = '<div class="errbox">資料載入失敗：' + esc(err.message) + '</div>'; $('#view-stock').hidden = false; $('#dataDate').textContent = '資料載入失敗'; });

/* ===== 自架網站：瀏覽器留著舊版頁面時自動換成新版 =====
   GitHub Pages 的頁面可能被瀏覽器（尤其手機、或重開的分頁）直接從快取拿出來，
   這裡用 no-store 再抓一次 index.html 比對建置時間，不同就重新整理一次（同一版只會重整一次，避免迴圈）。 */
(function () {
  if (!/\.github\.io$/.test(location.hostname)) return;
  var meta = document.querySelector('meta[name="hub-build"]'), cur = meta && meta.content;
  if (!cur || cur.indexOf('__') === 0) return;
  function check() {
    fetch('index.html?b=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var m = t && t.match(/<meta name="hub-build" content="([^"]+)"/);
      if (!m || m[1] === cur) return;
      try { if (sessionStorage.getItem('hub.reloadFor') === m[1]) return; sessionStorage.setItem('hub.reloadFor', m[1]); } catch (e) { }
      location.reload();
    }).catch(function () { });
  }
  check();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
})();
