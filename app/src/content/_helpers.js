/* ===== 教材データの書き方 =====
 * 選択肢は ["本文", 1(正解)/0, "理由"] の配列で書く。
 */
"use strict";

const COURSE = { chapters: [] };
const chapter = (c) => COURSE.chapters.push(c);
const mapOpts = (opts) => opts.map(([text, ok, why]) => ({ text, ok: !!ok, why }));
const talk = (...lines) => ({ t: "talk", lines });
const learn = (title, html) => ({ t: "learn", title, html });
const choice = (q, opts, explain) => ({ t: "choice", q, opts: mapOpts(opts), explain });
const multi = (q, opts, explain) => ({ t: "multi", q, opts: mapOpts(opts), explain });
const sort = (q, buckets, items, explain) => ({
  t: "sort", q, explain,
  buckets: buckets.map(([id, label, hint]) => ({ id, label, hint })),
  items: items.map(([text, b, why]) => ({ text, b, why })),
});
const order = (q, items, explain) => ({ t: "order", q, items, explain });
const spot = (q, segs, explain, extra = {}) => ({ t: "spot", q, explain, segs: segs.map(([text, bad, why]) => ({ text, bad: !!bad, why })), ...extra });
const tq = (phase, q, opts) => ({ t: "tq", phase, q, opts: mapOpts(opts) });
const write = (o) => ({ t: "write", ...o });
const grid = (o) => ({ t: "grid", ...o });
