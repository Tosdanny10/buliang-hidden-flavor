import { parseAnnouncement, renderMessage } from './parse.mjs';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const s21 = `《最新公告》\n\n明日9月30日(三)\n#隱藏版\n#剝皮辣椒佐皮蛋\n🌶️🌶️（小辣）\n\n及內心黑到發亮的\n『#黑心本丸』\n（整顆皮蛋，不辣）`;
let r = parseAnnouncement(s21, '2026-09-29');
console.log(JSON.stringify(r));
ok(r.mealDate === '2026-09-30', '§21 日期');
ok(JSON.stringify(r.flavors) === JSON.stringify([{name:'剝皮辣椒佐皮蛋',spicy:'小辣',note:''},{name:'黑心本丸',spicy:'不辣',note:'整顆皮蛋'}]), '§21 兩口味/辣度/備註');
// real FB innerText (emoji dropped, single-line header)
const real = `《最新公告》\n明日9月30日(三) #隱藏版 #剝皮辣椒佐皮蛋\n  （小辣）\n及內心黑到發亮的『 #黑心本丸』（整顆皮蛋，不辣）\n隱藏版每人限購\n 明天的隱藏版有點狠\n「#剝皮辣椒佐皮蛋」。剝皮辣椒的微辣甘甜，加上皮蛋的濃郁香氣，再拌入蒜末與辣椒提味，香氣四溢。\n明天的隱藏版還有 #黑心本丸（皮蛋），敢吃辣的話，可以加上 #店內招牌手炒辣味菜脯\n『手作古早味紅茶 25元/杯』溫、冰 #微糖`;
r = parseAnnouncement(real, '2026-09-29');
ok(JSON.stringify(r.flavors) === JSON.stringify([{name:'剝皮辣椒佐皮蛋',spicy:'小辣',note:''},{name:'黑心本丸',spicy:'不辣',note:'整顆皮蛋'}]), '真實貼文：不會誤抓 #店內招牌手炒辣味菜脯 / #微糖');
r = parseAnnouncement('《最新公告》\n明日10月1日(四) #隱藏版 #麻油雞', '2026-09-30');
ok(r.mealDate === '2026-10-01' && r.flavors.length === 1 && r.flavors[0].name === '麻油雞' && !r.flavors[0].spicy, '單一口味、無辣度');
r = parseAnnouncement('《最新公告》\n明日1月1日(五) #隱藏版 #佛跳牆', '2026-12-31');
ok(r.mealDate === '2027-01-01', '跨年補年份');
ok(parseAnnouncement('今天公休，感謝支持', '2026-09-30') === null, '非公告 → null');
ok(parseAnnouncement('明日10月1日 隱藏版請看圖片', '2026-09-30') === null, '口味只在圖片 → null（不猜）');
ok(parseAnnouncement('明日10月1日(四) #隱藏版', '2026-09-30') === null, '只有分類 hashtag → null');
const html = renderMessage(parseAnnouncement(s21,'2026-09-29'), 'https://www.facebook.com/permalink.php?story_fbid=X&id=100064240500520');
console.log(html.replace(/<br>/g,'\n').replace(/<\/?b>/g,''));
ok(!/加大|\+5/.test(html), '訊息沒有加大 / +5');
// 官方嵌入貼文外掛（雲端實際抓到的文字）：emoji 緊接在 hashtag 後面
const embed = `小藜ㄇㄞˋ本丸\n星期一\n\n《最新公告》\n明日9月30日(三) #隱藏版 #剝皮辣椒佐皮蛋🌶️🌶️ （小辣）\n及內心黑到發亮的『 #黑心本丸』（整顆皮蛋，不辣）\n\n⚠️隱藏版每人限購4️⃣⋯⋯\n\n查看更多\n還有 7 張`;
r = parseAnnouncement(embed, '2026-09-29');
ok(r && JSON.stringify(r.flavors) === JSON.stringify([{name:'剝皮辣椒佐皮蛋',spicy:'小辣',note:''},{name:'黑心本丸',spicy:'不辣',note:'整顆皮蛋'}]), '嵌入外掛文字：口味名稱不含 emoji');
// 截斷在口味中間 → null（不猜）
ok(parseAnnouncement('《最新公告》\n明日9月30日(三) #隱藏版 #剝皮辣椒佐皮蛋\n  （小辣）\n及…… 查看更多', '2026-09-29') === null, '口味被截斷 → null');
// 2026-10-14 新格式：辣度、內容物、過敏提醒都寫成 hashtag，價格黏在名稱後
const fmt2 = `小藜ㄇㄞˋ本丸\n5 小時前\n\n《最新公告》\n明日10月15日（四） #隱藏版 #香菜控皮蛋80元 #內有香菜蒜頭辣椒 #小辣 #有花生粒 #過敏體質請注意⚠️ 。\n\n🔴隱藏版 （#黑心本丸／ #香菜控皮蛋）\n⚠️『隱藏版』限購2️⃣颗。謝謝🙏\n\n⋯⋯\n查看更多`;
r = parseAnnouncement(fmt2, '2026-10-14');
console.log(JSON.stringify(r));
ok(r && r.mealDate === '2026-10-15' && JSON.stringify(r.flavors) === JSON.stringify([{name:'香菜控皮蛋',spicy:'小辣',note:'內有香菜蒜頭辣椒、有花生粒、過敏體質請注意'},{name:'黑心本丸',spicy:'',note:''}]), '新格式：hashtag 辣度/備註歸位、去掉 80元 與 ／、重複口味合併');
ok(parseAnnouncement('明日10月16日(五) #隱藏版 #有點鹹本丸', '2026-10-15').flavors[0].name === '有點鹹本丸', '「有…本丸」仍是口味不是備註');
