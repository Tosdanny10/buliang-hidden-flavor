// 小藜ㄇㄞˋ本丸 官方粉專隱藏版抓取器（雲端執行用）
// 匿名讀取公開頁面（不登入、不存任何帳密），輸出 public/feed.xml（RSS）與 public/status.json
import { chromium } from 'playwright';
import fs from 'node:fs';
import { parseAnnouncement, renderMessage } from './parse.mjs';

const PAGE_ID = '100064240500520';
const PAGE_URLS = [
  `https://www.facebook.com/people/%E5%B0%8F%E8%97%9C%E3%84%87%E3%84%9E%CB%8B%E6%9C%AC%E4%B8%B8/${PAGE_ID}/`,
  'https://m.facebook.com/pages/category/Breakfast---Brunch-Restaurant/%E5%B0%8F%E8%97%9C%E3%84%87%E3%84%9E%CB%8B%E6%9C%AC%E4%B8%B8-103268901739954/',
  `https://www.facebook.com/${PAGE_ID}`,
];
const MAX_POSTS = 5;
const OUT = process.env.OUT_DIR || 'public';
const TPE = 8 * 3600000;
const todayKey = new Date(Date.now() + TPE).toISOString().slice(0, 10);
const fetchedAt = new Date().toISOString();

const status = { fetchedAt, todayTaipei: todayKey, fetchStatus: 'fail', pageUrlUsed: '', linksFound: 0, postsSeen: 0, announcements: [], error: '' };

function cleanPermalink(href) {
  try {
    const u = new URL(href);
    const fb = u.searchParams.get('story_fbid');
    if (fb) return `https://www.facebook.com/permalink.php?story_fbid=${fb}&id=${PAGE_ID}`;
    const m = u.pathname.match(/\/posts\/([^/?]+)/);
    if (m) return `https://www.facebook.com/${PAGE_ID}/posts/${m[1]}`;
  } catch { /* ignore */ }
  return null;
}

// 只取粉專本人貼文內容（去掉登入框、留言）
function extractPostText(body) {
  const start = body.indexOf('小藜ㄇㄞˋ本丸');
  if (start < 0) return '';
  let t = body.slice(start);
  const dot = t.indexOf('·');
  if (dot >= 0 && dot < 120) t = t.slice(dot + 1);
  const cut = t.search(/\n(所有心情|讚\n留言|查看更多小藜|最相關|電子郵件地址或手機號碼)/);
  if (cut > 0) t = t.slice(0, cut);
  return t.trim();
}
function extractPostedText(body) {
  const m = body.match(/小藜ㄇㄞˋ本丸\s*\n\s*([^\n]{1,30}?(?:前|日|月|年|分鐘|小時|昨天)[^\n]{0,20})\n/);
  return m ? m[1].trim() : '';
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ locale: 'zh-TW', timezoneId: 'Asia/Taipei', viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();
  let links = [];
  let pageBody = '';
  status.debug = [];
  for (const url of PAGE_URLS) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000);
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
      links = [...new Set(hrefs.map(cleanPermalink).filter(Boolean))].slice(0, MAX_POSTS);
      pageBody = await page.evaluate(() => document.body.innerText);
      status.debug.push({ url, title: await page.title(), links: links.length, head: pageBody.slice(0, 200) });
      if (links.length) { status.pageUrlUsed = url; break; }
    } catch (e) { status.error += `page ${url}: ${e.message.slice(0, 120)}; `; }
  }
  status.linksFound = links.length;
  if (!links.length) throw new Error('粉專頁面讀不到任何貼文連結（可能需要登入或被擋）');

  // 單篇頁面依序試 www、m 版；都讀不到時才退回用粉專頁面上的貼文文字
  const variants = (link) => {
    const fb = new URL(link).searchParams.get('story_fbid');
    return fb ? [link, `https://m.facebook.com/story.php?story_fbid=${fb}&id=${PAGE_ID}`] : [link];
  };
  for (const link of links) {
    let text = '';
    let body = '';
    for (const v of variants(link)) {
      try {
        await page.goto(v, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(4000);
        body = await page.evaluate(() => document.body.innerText);
        text = extractPostText(body);
        status.debug.push({ url: v.slice(0, 90), title: await page.title(), textLen: text.length, head: body.slice(0, 200) });
        if (text) break;
      } catch (e) { status.error += `post ${v.slice(0, 90)}: ${e.message.slice(0, 120)}; `; }
    }
    if (!text) continue;
    status.postsSeen++;
    const parsed = parseAnnouncement(text, todayKey);
    if (parsed) {
      status.announcements.push({
        mealDate: parsed.mealDate, flavors: parsed.flavors, sourceUrl: link, via: 'post',
        postedText: extractPostedText(body), messageHtml: renderMessage(parsed, link), excerpt: text.slice(0, 300),
      });
    }
  }
  if (!status.postsSeen && pageBody) {
    // 粉專頁面上的貼文常被截斷（「……查看更多」），截斷時寧可當作沒讀到，也不要只抓到部分口味
    const di = pageBody.search(/明[日天]\s*\d{1,2}\s*(?:月|\/)/);
    const truncated = di < 0 || /查看更多|……/.test(pageBody.slice(di, di + 400).split(/\n(?:所有心情|讚\n)/)[0]);
    const parsed = truncated ? null : parseAnnouncement(pageBody, todayKey);
    if (!truncated) status.postsSeen = 1;
    if (parsed) {
      status.announcements.push({
        mealDate: parsed.mealDate, flavors: parsed.flavors, sourceUrl: links[0], via: 'timeline',
        postedText: '', messageHtml: renderMessage(parsed, links[0]), excerpt: '',
      });
    }
    status.error += truncated ? '單篇貼文讀不到，粉專頁面上的貼文被截斷，無法完整判讀; ' : '單篇貼文讀不到，改用粉專頁面文字; ';
  }
  status.fetchStatus = status.postsSeen > 0 ? 'ok' : 'fail';
  if (!status.postsSeen) status.error += '有貼文連結但讀不到任何貼文內容; ';
} catch (e) {
  status.fetchStatus = 'fail';
  status.error += e.message;
} finally {
  await browser.close();
}

// 同一用餐日只保留最新一篇（連結清單由新到舊）
const seen = new Set();
status.announcements = status.announcements.filter((a) => (seen.has(a.mealDate) ? false : (seen.add(a.mealDate), true)));

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// description 一律用 base64(JSON)，避免 RSS 連接器改動 HTML/特殊字元；Power Automate 用 json(base64ToString(summary)) 還原
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const NUMS = '①②③④⑤⑥';
const perFlavor = (fl, key) => {
  const vals = fl.filter((f) => f[key]);
  if (fl.length === 1) return fl[0][key] || '';
  return vals.map((f) => `${f.name}：${f[key]}`).join('；');
};
const listFields = (a) => ({
  flavorsText: a.flavors.map((f, i) => [`${NUMS[i] || `${i + 1}.`} ${f.name}`, f.spicy && `辣度：${f.spicy}`, f.note && `備註：${f.note}`].filter(Boolean).join('｜')).join('\n'),
  flavorName: a.flavors.map((f) => f.name).join('、'),
  spicyLevel: perFlavor(a.flavors, 'spicy'),
  flavorNote: perFlavor(a.flavors, 'note'),
});
const items = [
  `<item><title>STATUS</title><link>https://www.facebook.com/${PAGE_ID}</link><guid isPermaLink="false">status-${fetchedAt}</guid><pubDate>${new Date(fetchedAt).toUTCString()}</pubDate><description>${b64({ fetchedAt, fetchStatus: status.fetchStatus, linksFound: status.linksFound || 0, postsSeen: status.postsSeen, error: status.error.slice(0, 500) })}</description></item>`,
  ...status.announcements.map((a) => `<item><title>${a.mealDate}</title><link>${x(a.sourceUrl)}</link><guid isPermaLink="false">${a.mealDate}-${x(a.sourceUrl)}</guid><pubDate>${new Date(fetchedAt).toUTCString()}</pubDate><description>${b64({ mealDate: a.mealDate, flavors: a.flavors, ...listFields(a), sourceUrl: a.sourceUrl, postedText: a.postedText, fetchedAt, messageHtml: a.messageHtml })}</description></item>`),
];
const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>小藜ㄇㄞˋ本丸 明日隱藏版</title><link>https://www.facebook.com/${PAGE_ID}</link><description>由官方粉專公開貼文自動解析</description><lastBuildDate>${new Date(fetchedAt).toUTCString()}</lastBuildDate>\n${items.join('\n')}\n</channel></rss>\n`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/feed.xml`, feed);
fs.writeFileSync(`${OUT}/status.json`, JSON.stringify(status, null, 2));
fs.writeFileSync(`${OUT}/index.html`, '<!doctype html><meta charset="utf-8"><title>隱藏版監控</title><p>小藜ㄇㄞˋ本丸 明日隱藏版監控資料：<a href="feed.xml">feed.xml</a> · <a href="status.json">status.json</a></p>');
console.log(JSON.stringify({ fetchStatus: status.fetchStatus, pageUrlUsed: status.pageUrlUsed, linksFound: status.linksFound, postsSeen: status.postsSeen, announcements: status.announcements.map((a) => ({ mealDate: a.mealDate, flavors: a.flavors, url: a.sourceUrl, posted: a.postedText })), error: status.error }, null, 2));
