#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
型態雷達 — 全市場價量資料更新程式（在您的電腦上執行）
------------------------------------------------------
功能：
  1. 取得台股（上市+上櫃，含 ETF）與美股（S&P 500 / 400 / 600 + Nasdaq-100，可改為全部）代號與名稱
  2. 從 Yahoo Finance 抓每日 K 線（首次抓 2 年，之後只補最近幾天）
  3. 輸出 output/bars.json.gz、output/names.json、output/markets.json 供網站建置使用

使用方式：
  python update_data.py                # 一般更新（增量）
  python update_data.py --full         # 重抓全部歷史
  python update_data.py --us all       # 美股改抓全部上市股票（約 5,000+ 檔，較慢）
  python update_data.py --tw-only      # 只更新台股
  python update_data.py --workers 6    # 調整並行數（預設 8；被限流時調低）

僅使用 Python 標準函式庫，不需額外安裝套件。
"""
import argparse, concurrent.futures as cf, csv, gzip, io, json, os, re, sys, time, random
import urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, 'cache')       # 每檔一個 json（歷史快取）
OUT_DIR = os.path.join(HERE, 'output')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept': 'application/json,text/plain,*/*'}
MAX_BARS = 560

def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)

def http_get(url, retries=3, timeout=30, as_text=True):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    data = gzip.decompress(data)
                return data.decode('utf-8', 'replace') if as_text else data
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 404: return None
            if e.code == 429: time.sleep(5 + i * 5 + random.random() * 3)
            else: time.sleep(1 + i)
        except Exception as e:
            last = e; time.sleep(1 + i)
    log('  ! 失敗', url[:90], str(last)[:80])
    return None

# ---------------- 股票清單 ----------------
def tw_universe():
    names, markets = {}, {}
    # 上市（含 ETF）：證交所每日行情 API 有代號+名稱
    t = http_get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    n_listed = 0
    if t:
        for row in json.loads(t):
            code, name = row.get('Code', '').strip(), row.get('Name', '').strip()
            if re.fullmatch(r'\d{4}[A-Z]?|00\d{3,4}[A-Z]?', code):
                names[code] = name; markets[code] = 'TW'; n_listed += 1
    else:
        log('  ! 無法取得上市清單（TWSE）')
    # 上櫃
    t2 = http_get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    n_otc = 0
    if t2:
        for row in json.loads(t2):
            code = (row.get('SecuritiesCompanyCode') or row.get('Code') or '').strip()
            name = (row.get('CompanyName') or row.get('Name') or '').strip()
            if re.fullmatch(r'\d{4}[A-Z]?|00\d{3,4}[A-Z]?', code):
                names[code] = name; markets[code] = 'TWO'; n_otc += 1
    else:
        log('  ! 無法取得上櫃清單（TPEx）')
    log(f'台股清單：上市 {n_listed}、上櫃 {n_otc}')
    return names, markets

def wiki_table_symbols(url, col_names=('Symbol', 'Ticker', 'Ticker symbol')):
    """從維基百科表格抓代號與名稱（簡易 HTML 解析）"""
    html = http_get(url)
    if not html: return {}
    out = {}
    # 找第一個含 Symbol 欄的 wikitable
    for tbl in re.findall(r'<table[^>]*wikitable[^>]*>(.*?)</table>', html, flags=re.S):
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, flags=re.S)
        if not rows: continue
        head = [re.sub(r'<[^>]+>', '', h).strip() for h in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', rows[0], flags=re.S)]
        sym_i = next((i for i, h in enumerate(head) if h in col_names), None)
        name_i = next((i for i, h in enumerate(head) if h in ('Security', 'Company', 'Name', 'Company name')), None)
        if sym_i is None: continue
        for r in rows[1:]:
            cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', r, flags=re.S)]
            if len(cells) <= sym_i: continue
            sym = cells[sym_i].replace('.', '-').strip()
            if re.fullmatch(r'[A-Z]{1,5}(-[A-Z])?', sym):
                out[sym] = cells[name_i] if name_i is not None and len(cells) > name_i else sym
        if out: break
    return out

def us_universe(mode):
    names, markets = {}, {}
    if mode == 'all':
        for u in ('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'):
            t = http_get(u)
            if not t: continue
            rd = csv.DictReader(io.StringIO(t), delimiter='|')
            for row in rd:
                sym = (row.get('Symbol') or row.get('ACT Symbol') or '').strip()
                nm = (row.get('Security Name') or '').strip()
                if not sym or sym.startswith('File Creation') or row.get('Test Issue') == 'Y' or row.get('ETF') == 'Y': continue
                if not re.fullmatch(r'[A-Z]{1,5}', sym): continue   # 排除權證/特別股等
                if re.search(r'Warrant|Right|Unit|Preferred|Depositary|Notes|Debenture|%', nm, re.I): continue
                names[sym] = re.sub(r' - .*$', '', nm)[:40]; markets[sym] = 'US'
        log(f'美股清單（全部）：{len(names)}')
    else:
        srcs = [('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', 'S&P 500'),
                ('https://en.wikipedia.org/wiki/List_of_S%26P_400_companies', 'S&P 400'),
                ('https://en.wikipedia.org/wiki/List_of_S%26P_600_companies', 'S&P 600'),
                ('https://en.wikipedia.org/wiki/Nasdaq-100', 'Nasdaq-100')]
        for u, label in srcs:
            got = wiki_table_symbols(u)
            log(f'  {label}: {len(got)}')
            for k, v in got.items():
                names.setdefault(k, v); markets[k] = 'US'
        # 常見大型 ETF
        for k, v in {'SPY': 'SPDR S&P 500 ETF', 'QQQ': 'Invesco QQQ', 'IWM': 'iShares Russell 2000', 'DIA': 'SPDR Dow Jones', 'SMH': 'VanEck Semiconductor', 'SOXX': 'iShares Semiconductor', 'TLT': 'iShares 20+ Treasury', 'GLD': 'SPDR Gold'}.items():
            names.setdefault(k, v); markets[k] = 'US'
        log(f'美股清單：{len(names)}')
    return names, markets

# ---------------- Yahoo 歷史資料 ----------------
# 指數（市場水位用）：代碼 → (Yahoo 符號, 名稱)
INDICES = {'TWII': ('^TWII', '台股加權指數'), 'TWOII': ('^TWOII', '櫃買指數'), 'GSPC': ('^GSPC', '標普 500'), 'IXIC': ('^IXIC', '那斯達克'), 'SOX': ('^SOX', '費城半導體'), 'TNX': ('^TNX', '美國10年期公債殖利率')}

def yahoo_symbol(code, mk):
    if mk == 'IDX': return INDICES[code][0]
    if mk == 'TW': return code + '.TW'
    if mk == 'TWO': return code + '.TWO'
    return code

def fetch_yahoo(sym, rng):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range={rng}&interval=1d&includePrePost=false&events=div%2Csplit'
    t = http_get(url, retries=3, timeout=25)
    if not t: return None
    try:
        j = json.loads(t)['chart']['result'][0]
    except Exception:
        return None
    ts = j.get('timestamp') or []
    q = j['indicators']['quote'][0]
    tz_off = j.get('meta', {}).get('gmtoffset', 0)
    bars = []
    for i, tsv in enumerate(ts):
        o, h, l, c, v = q['open'][i], q['high'][i], q['low'][i], q['close'][i], q['volume'][i]
        if c is None or h is None or l is None: continue
        d = time.strftime('%Y-%m-%d', time.gmtime(tsv + tz_off))
        bars.append([d, round(o if o else c, 4), round(h, 4), round(l, 4), round(c, 4), int(v or 0)])
    return bars

import urllib.parse
def load_cache(code):
    p = os.path.join(CACHE_DIR, code + '.json')
    if os.path.exists(p):
        try:
            with open(p, 'r', encoding='utf-8') as f: return json.load(f)
        except Exception: return None
    return None

def save_cache(code, bars):
    with open(os.path.join(CACHE_DIR, code + '.json'), 'w', encoding='utf-8') as f: json.dump(bars, f, separators=(',', ':'))

def merge(old, new):
    if not old: return new
    m = {b[0]: b for b in old}
    for b in new: m[b[0]] = b
    return [m[k] for k in sorted(m)]

# 鉅亨網 K 線 API（Yahoo 沒有櫃買指數，用這個補）：symbol 例 TWS:OTC01:INDEX、TWS:TSE01:INDEX
CNYES = {'TWOII': 'TWS:OTC01:INDEX', 'TWII': 'TWS:TSE01:INDEX'}
def fetch_cnyes(sym, days):
    import datetime as _dt
    end = int(time.time()); start = end - days * 86400; out = {}
    cur = end
    while cur > start:
        lo = max(start, cur - 120 * 86400)
        url = f'https://ws.api.cnyes.com/ws/api/v1/charting/history?resolution=D&symbol={urllib.parse.quote(sym)}&from={cur}&to={lo}'
        t = http_get(url, retries=2, timeout=25)
        if not t: return None
        try: d = json.loads(t).get('data') or {}
        except Exception: return None
        ts = d.get('t') or []
        for i, tt in enumerate(ts):
            day = _dt.datetime.utcfromtimestamp(tt).strftime('%Y-%m-%d')
            out[day] = [day, d['o'][i], d['h'][i], d['l'][i], d['c'][i], int(d['v'][i] or 0)]
        cur = lo
    rows = [out[k] for k in sorted(out) if out[k][4]]
    return rows

def update_one(code, mk, full):
    old = None if full else load_cache(code)
    rng = ('15y' if mk == 'IDX' else '2y') if not old or len(old) < 200 else '1mo'
    new = fetch_yahoo(yahoo_symbol(code, mk), rng)
    if mk == 'IDX' and not new and code in CNYES:
        new = fetch_cnyes(CNYES[code], 15 * 365 if rng != '1mo' else 40)
    if new is None:
        return code, old, 'fail'
    if not new:
        return code, old, 'empty'
    bars = merge(old, new)[-(4000 if mk == 'IDX' else MAX_BARS):]
    save_cache(code, bars)
    return code, bars, 'ok'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--full', action='store_true', help='重抓全部歷史')
    ap.add_argument('--us', default='sp1500', choices=['sp1500', 'all', 'none'])
    ap.add_argument('--tw-only', action='store_true')
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--limit', type=int, default=0, help='測試用：只處理前 N 檔')
    a = ap.parse_args()
    os.makedirs(CACHE_DIR, exist_ok=True); os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()
    log('取得股票清單…')
    names, markets = tw_universe()
    if not a.tw_only and a.us != 'none':
        n2, m2 = us_universe(a.us); names.update(n2); markets.update(m2)
    # 若清單抓不到，沿用上次 names.json
    prev = os.path.join(OUT_DIR, 'names.json')
    if len(names) < 100 and os.path.exists(prev):
        log('  清單不足，沿用上次的 names.json')
        names = json.load(open(prev, encoding='utf-8')); markets = json.load(open(os.path.join(OUT_DIR, 'markets.json'), encoding='utf-8'))
    for k, v in INDICES.items(): names[k] = v[1]; markets[k] = 'IDX'
    codes = sorted(names)
    if a.limit: codes = codes[:a.limit] + [k for k in INDICES if k not in codes[:a.limit]]
    log(f'開始更新 {len(codes)} 檔（{"完整" if a.full else "增量"}，{a.workers} 併發）…')
    bars_all, stat, done = {}, {'ok': 0, 'fail': 0, 'empty': 0}, 0
    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(update_one, c, markets[c], a.full) for c in codes]
        for f in cf.as_completed(futs):
            code, bars, st = f.result(); stat[st] += 1; done += 1
            if bars and len(bars) >= 30: bars_all[code] = bars
            if done % 200 == 0: log(f'  進度 {done}/{len(codes)}  ok {stat["ok"]} fail {stat["fail"]} empty {stat["empty"]}')
    # 輸出
    out_names = {c: names[c] for c in bars_all}
    out_mk = {c: ('IDX' if markets[c] == 'IDX' else 'TW' if markets[c] in ('TW', 'TWO') else 'US') for c in bars_all}
    miss_idx = [k for k in INDICES if k not in bars_all]
    if miss_idx: log('  ! 指數抓取失敗：' + ', '.join(miss_idx) + '（市場水位頁會沿用舊資料）')
    with gzip.open(os.path.join(OUT_DIR, 'bars.json.gz'), 'wt', encoding='utf-8', compresslevel=6) as f: json.dump(bars_all, f, separators=(',', ':'))
    json.dump(out_names, open(os.path.join(OUT_DIR, 'names.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(out_mk, open(os.path.join(OUT_DIR, 'markets.json'), 'w', encoding='utf-8'))
    json.dump({'updated': time.strftime('%Y-%m-%d %H:%M'), 'stocks': len(bars_all), 'tw': sum(1 for v in out_mk.values() if v == 'TW'), 'us': sum(1 for v in out_mk.values() if v == 'US'), 'idx': sum(1 for v in out_mk.values() if v == 'IDX'), 'fail': stat['fail'], 'empty': stat['empty'], 'latest': max((b[-1][0] for b in bars_all.values()), default='')}, open(os.path.join(OUT_DIR, 'status.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'完成：{len(bars_all)} 檔（台股 {sum(1 for v in out_mk.values() if v=="TW")}、美股 {sum(1 for v in out_mk.values() if v=="US")}），失敗 {stat["fail"]}，耗時 {time.time()-t0:.0f} 秒')
    log('輸出：', os.path.join(OUT_DIR, 'bars.json.gz'))

if __name__ == '__main__':
    main()
