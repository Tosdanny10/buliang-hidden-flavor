# 小藜ㄇㄞˋ本丸 明日隱藏版抓取器

不良飯糰軍團團訂系統的「Facebook 抓取器」雲端版。

- **排程**：`.github/workflows/fetch.yml`，週一至週五台北 11:00–15:45 每 15 分鐘（GitHub 排程可能延遲幾分鐘）。
- **做什麼**：用 Playwright 無頭瀏覽器**匿名**讀取官方粉專公開貼文（不登入、沒有任何帳密），解析「明日 X月X日」與口味、辣度、備註。
- **輸出**：GitHub Pages 的 `feed.xml`（RSS，給 Power Automate「RSS」連接器讀）與 `status.json`（健康檢查）。每個 item 的 description 是 base64(JSON)。
- **不做什麼**：不寫 SharePoint、不發 Teams。那些由 Power Automate Flow「不良飯糰軍團_明日隱藏版監控(雲端)」與「不良飯糰軍團_明日隱藏版發送」負責。

## 檔案
| 檔案 | 用途 |
| --- | --- |
| `fetch.mjs` | 開粉專 → 找前幾篇貼文連結 → 逐篇讀全文 → 解析 → 產生 `public/` |
| `parse.mjs` | 公告解析規則（日期、hashtag 口味、辣度、備註、訊息格式） |
| `test-parse.mjs` | 解析規則測試：`node test-parse.mjs` |

## Facebook 改版時要改哪裡
- 讀不到貼文連結（status.json `linksFound: 0`）→ `fetch.mjs` 的 `PAGE_URLS`、`cleanPermalink()`
- 讀得到貼文但內容切錯（`postsSeen: 0`）→ `fetch.mjs` 的 `extractPostText()`
- 店家公告寫法改變 → `parse.mjs`（先在 `test-parse.mjs` 加一個新範例再改）
- 如果 Facebook 變成必須登入才能看：**不要**加登入自動化，先通知負責人。

## 手動執行
GitHub → Actions → fetch-hidden-flavor → Run workflow。
