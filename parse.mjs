// 解析「小藜ㄇㄞˋ本丸」官方公告：找出「明日 X月X日」與所有特殊口味（含辣度、備註）。
// 不確定就回傳 null（寧可「沒找到」，也不要猜）。

const CATEGORY_TAGS = new Set(['隱藏版', '限定', '最新公告', '本丸', '今日', '明日', '公告', '竹北飯糰', '新竹隱藏版飯糰']);
const SPICY_RE = /(不辣|微辣|小辣|中辣|大辣|重辣|特辣)/;
const WEEK = '日一二三四五六';

const pad = (n) => String(n).padStart(2, '0');

// todayKey: 台北今天 yyyy-MM-dd
export function inferYear(month, day, todayKey) {
  const [ty, tm, td] = todayKey.split('-').map(Number);
  let y = ty;
  const cand = Date.UTC(y, month - 1, day);
  const today = Date.UTC(ty, tm - 1, td);
  if (cand < today - 7 * 86400000) y += 1; // 例：12/31 貼「明日1月1日」→ 明年
  return `${y}-${pad(month)}-${pad(day)}`;
}

export function parseAnnouncement(text, todayKey) {
  if (!text) return null;
  const t = text.replace(/\r/g, '');
  const m = t.match(/明[日天]\s*(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*[日號]?/);
  if (!m) return null;
  const mealDate = inferYear(Number(m[1]), Number(m[2]), todayKey);

  // 公告標頭：從日期開始，到「限購」或開始長篇介紹為止（最多 8 行）
  const lines = t.slice(m.index).split('\n');
  const header = [];
  for (const line of lines.slice(0, 8)) {
    if (header.length && /(限購|明天的隱藏版|數量有限|有外送|明日有販售)/.test(line)) break;
    if (header.length && line.trim().length > 45) break;
    header.push(line);
  }
  const h = header.join('\n');
  // 口味區段被截斷（「⋯⋯」「查看更多」）時不判讀，避免只抓到部分口味
  if (/查看更多|⋯⋯|……/.test(h)) return null;

  // hashtag 口味名稱遇到空白、標點或 emoji（例如 🌶️）就結束
  const tagRe = /#([^\s#『』「」（）()，,。！!、|｜／/\p{Extended_Pictographic}\u{FE0F}\u{20E3}]+)/gu;
  const tags = [];
  let tm;
  while ((tm = tagRe.exec(h))) tags.push({ name: tm[1].trim(), start: tm.index, end: tm.index + tm[0].length });
  const useful = tags.filter((x) => x.name && !CATEGORY_TAGS.has(x.name));

  // 店家有時把辣度、內容物、過敏提醒也寫成 hashtag（例：#香菜控皮蛋80元 #內有香菜蒜頭辣椒 #小辣 #過敏體質請注意），
  // 這些歸到前一個口味的辣度／備註，不當成口味
  const flavors = [];
  let cur = null;
  useful.forEach((t, i) => {
    if (isSpicyOnly(t.name)) { if (cur && !cur.spicy) cur.spicy = t.name.match(SPICY_RE)[1]; return; }
    if (isNote(t.name)) { if (cur) cur.notes.push(t.name); return; }
    const name = t.name.replace(/\d+\s*元$/, '').trim();
    if (!name) return;
    const existing = flavors.find((x) => x.name === name);
    if (existing) { cur = existing; return; }
    cur = { name, spicy: '', notes: [] };
    flavors.push(cur);
    const next = useful[i + 1] ? useful[i + 1].start : h.length;
    const seg = h.slice(t.end, next);
    const paren = seg.match(/[（(]([^）)]*)[）)]/);
    if (paren) {
      for (const part of paren[1].split(/[，,、]/).map((s) => s.trim()).filter(Boolean)) {
        if (!cur.spicy && isSpicyOnly(part)) cur.spicy = part.match(SPICY_RE)[1];
        else cur.notes.push(part);
      }
    }
    if (!cur.spicy) { const s = seg.match(SPICY_RE); if (s && seg.indexOf(s[0]) < 20) cur.spicy = s[1]; }
  });
  if (flavors.length === 0) return null;
  return { mealDate, flavors: flavors.map((f) => ({ name: f.name, spicy: f.spicy, note: f.notes.join('、') })) };
}

function isSpicyOnly(s) { return SPICY_RE.test(s) && s.replace(SPICY_RE, '').trim() === ''; }
// 「內有…／有花生／過敏…請注意」這類是備註；但以「本丸／丸／飯糰」結尾的仍視為口味（例如「有點鹹本丸」）
function isNote(s) {
  if (/(本丸|飯糰|丸)$/.test(s)) return false;
  return /^(內有|內含|含有|含|不含|無|有|加|附|過敏|請|限|每人|售完)/.test(s) || /(注意|過敏)/.test(s);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function mealLabel(key) {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）`;
}

// 正式版訊息（測試模式由 Power Automate 在標題加上「系統測試｜」）
export function renderMessage(result, sourceUrl) {
  const L = ['🍙<b>【明日隱藏版公布】</b>', '', '明日用餐日期：', mealLabel(result.mealDate), '', '明日隱藏版：', ''];
  const nums = '①②③④⑤⑥';
  result.flavors.forEach((f, i) => {
    L.push(`${nums[i] || `${i + 1}.`} ${esc(f.name)}`);
    if (f.spicy) L.push(`辣度：${esc(f.spicy)}`);
    if (f.note) L.push(`備註：${esc(f.note)}`);
    L.push('');
  });
  L.push('隱藏版本丸：80 元', '', '👉 點餐請至「今日點餐」', '點餐截止：今天 18:30', '', '來源：小藜ㄇㄞˋ本丸 Facebook 粉專', '原始貼文：', esc(sourceUrl));
  return L.join('<br>');
}
