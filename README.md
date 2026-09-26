# 投研總台 — 自架網站版（GitHub Pages）

這個資料夾放到 GitHub 之後，GitHub 會每天自動抓價量、建置網站並發佈，網址是
`https://<你的帳號>.github.io/<倉庫名稱>/`，不需要開電腦、也不需要透過 Claude。

## 一次性設定（約 10 分鐘）
1. 到 https://github.com 註冊（免費）。
2. 右上角「+」→ **New repository**：名稱填 `touyan`（或任何英文名），選 **Public**（Pages 免費方案需公開），按 Create repository。
3. 在新倉庫頁面點 **uploading an existing file**，把這個資料夾裡的**所有內容**（含 `.github` 資料夾）拖進去，按 **Commit changes**。
   - 若瀏覽器不能拖整個資料夾，改用 GitHub Desktop（https://desktop.github.com）：File → Add local repository → 選這個資料夾 → Publish。
4. 倉庫 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
5. 倉庫 **Actions** 分頁 → 左側「更新資料並發佈網站」→ **Run workflow**。第一次要抓 2 年資料，約 20–40 分鐘；之後每天自動跑兩次（台北 15:40 與 07:40），每次約 8 分鐘。
6. 跑完後 Settings → Pages 會顯示網址；把它加到手機主畫面即可。

## 之後
- 完全自動，不用管。Actions 分頁可看每次執行紀錄；失敗會寄信通知。
- 網站功能與 Claude 版相同，差別：「請 Claude 點評」按鈕在這裡不會作用（那是 Claude 網頁內建功能），自選股只存在該瀏覽器。
- 要改網站內容，把新的 `site_src` 覆蓋上傳即可，下次執行會採用。
