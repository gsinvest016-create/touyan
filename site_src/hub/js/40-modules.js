/* ===== 既有頁面模組（供應鏈地圖／季節性／月結算）：以 Shadow DOM 原樣掛載 ===== */
function makeDocProxy(root, host) {
  var passDoc = { createElement: 1, createElementNS: 1, createTextNode: 1, createDocumentFragment: 1, createComment: 1, importNode: 1, createRange: 1, createEvent: 1, adoptNode: 1, createTreeWalker: 1, createNodeIterator: 1, elementFromPoint: 1, hasFocus: 1, execCommand: 1, queryCommandSupported: 1, exitFullscreen: 1, getSelection: 1 };
  return new Proxy(root, {
    get: function (t, k) {
      if (k === 'body' || k === 'documentElement' || k === 'scrollingElement') return host;
      if (k === 'head') return document.head;
      if (k === 'defaultView') return window;
      if (k === 'addEventListener') return function (type, fn, o) { if (type === 'DOMContentLoaded' || type === 'load') { setTimeout(function () { try { fn.call(t, new Event(type)); } catch (e) { console.error(e); } }, 0); return; } return root.addEventListener(type, fn, o); };
      if (k === 'removeEventListener') return function (type, fn, o) { return root.removeEventListener(type, fn, o); };
      if (passDoc[k]) return document[k].bind(document);
      if (k === 'activeElement') return root.activeElement;
      if (k === 'readyState') return 'complete';
      if (k in root) { var v = root[k]; return typeof v === 'function' ? v.bind(root) : v; }
      var dv = document[k]; return typeof dv === 'function' ? dv.bind(document) : dv;
    },
    set: function (t, k, v) { if (k === 'title' || k === 'cookie') { document[k] = v; return true; } try { root[k] = v; } catch (e) { document[k] = v; } return true; }
  });
}
function mountModule(name) {
  if (state.mods[name]) return state.mods[name];
  var host = $('#mod-' + name);
  var p = loadZ('modules/' + name + '.json').then(function (mod) {
    host.classList.remove('loading'); host.textContent = '';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + mod.css + '</style>' + mod.html;
    syncTheme();
    // 站內 # 錨點：在 shadow 內滾動
    root.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a && !/^#\//.test(a.getAttribute('href'))) { var id = a.getAttribute('href').slice(1); var el = root.getElementById(id); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } });
    var docProxy = makeDocProxy(root, host);
    try { new Function('document', mod.js).call(window, docProxy); }
    catch (err) { console.error('module ' + name, err); host.insertAdjacentHTML('afterbegin', '<div class="errbox" style="margin:12px">模組初始化發生錯誤：' + esc(err.message) + '</div>'); }
    return mod;
  }).catch(function (err) { host.classList.remove('loading'); host.innerHTML = '<div class="errbox" style="margin:12px">無法載入模組：' + esc(err.message) + '</div>'; delete state.mods[name]; throw err; });
  state.mods[name] = p; return p;
}
