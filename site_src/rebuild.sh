#!/usr/bin/env bash
# 用法：bash rebuild.sh <output 資料夾>   （資料夾內需有 bars.json.gz、names.json、markets.json）
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?請給 output 資料夾路徑}"
cd "$HERE/hub"
STATUS_FILE="$OUT/status.json" INDICES="$HERE/demo_raw/indices.json" node build.js "$OUT/bars.json.gz" "$OUT/names.json" "$OUT/markets.json"
node -e "const f=require('./dist/files.json');const m={};for(const k in f)m[k]=require('path').resolve(f[k]);require('fs').writeFileSync('dist/files_abs.json',JSON.stringify(m));console.log('files:',Object.keys(m).length,'page:',require('path').resolve('dist/index.html'))"
