// 教材データの検査：答えのつけ忘れ・ありえない答え・時間の合計など
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "..", "src", p), "utf8");
const files = ["content/_helpers.js", "content/cards.js", "content/ch00-03.js", "content/ch04-06.js", "content/ch07-10.js", "content/ch-reverse.js", "content/grad-data.js"];
const ctx = vm.createContext({});
vm.runInContext(files.map(read).join("\n") + "\n;globalThis.__out = { COURSE, CARDS, GRAD_PRESETS, GRAD_EXAMPLE, TEST_QS };", ctx);
const { COURSE, CARDS, GRAD_PRESETS, GRAD_EXAMPLE, TEST_QS } = ctx.__out;
const lessons = COURSE.chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, ch: c })));
const KNOWN = ["talk", "learn", "choice", "tq", "multi", "sort", "order", "spot", "grid", "interview", "stackplay", "stack", "seq", "score", "write", "grad"];

test("章とレッスンのIDが重複していない", () => {
  const ids = lessons.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(COURSE.chapters.map((c) => c.id)).size, COURSE.chapters.length);
});

test("学習時間の合計が約7時間前後（330〜480分）", () => {
  const total = lessons.reduce((a, l) => a + l.min, 0);
  assert.ok(total >= 330 && total <= 480, "合計 " + total + " 分");
});

test("型カードはすべてどこかのレッスンで手に入り、存在しないカードを参照していない", () => {
  const ref = lessons.flatMap((l) => l.cards || []);
  for (const id of ref) assert.ok(CARDS.some((c) => c.id === id), "存在しないカード " + id);
  for (const c of CARDS) assert.ok(ref.includes(c.id), "どこでも手に入らないカード " + c.id);
});

test("すべてのステップが正しい形をしている", () => {
  for (const l of lessons) {
    l.steps.forEach((s, i) => {
      const at = `${l.id} #${i} (${s.t})`;
      assert.ok(KNOWN.includes(s.t), at + " 未知の種類");
      if (s.t === "choice" || s.t === "tq") {
        assert.equal(s.opts.filter((o) => o.ok).length, 1, at + " 正解はちょうど1つ");
        assert.ok(s.opts.length >= 3, at + " 選択肢が少ない");
        assert.ok(s.q, at + " 問題文がない");
      }
      if (s.t === "multi") {
        assert.ok(s.opts.some((o) => o.ok) && s.opts.some((o) => !o.ok), at + " 正解と不正解の両方が必要");
      }
      if (s.t === "sort") {
        const ids = s.buckets.map((b) => b.id);
        assert.equal(new Set(ids).size, ids.length, at);
        for (const it of s.items) assert.ok(ids.includes(it.b), `${at} 「${it.text}」の正解の枠がない: ${it.b}`);
        const used = new Set(s.items.map((it) => it.b));
        assert.ok(used.size >= 2, at + " 仕分け先が1つしかない");
      }
      if (s.t === "order") assert.ok(s.items.length >= 3 && new Set(s.items).size === s.items.length, at);
      if (s.t === "spot") assert.ok(s.segs.some((g) => g.bad) && s.segs.some((g) => !g.bad), at);
      if (s.t === "grid") {
        const keys = [];
        s.rows.forEach((_, r) => s.cols.forEach((__, c) => keys.push(r + "-" + c)));
        for (const k of keys) {
          const given = s.given && k in s.given;
          assert.ok(given || k in s.ans, `${at} マス ${k} に答えがない（空欄はバグ！）`);
          if (!given) for (const a of [].concat(s.ans[k])) assert.ok(a >= 0 && a < s.opts.length, `${at} マス ${k} の答えが範囲外`);
        }
      }
      if (s.t === "interview") {
        const fids = s.finds.map((f) => f.id);
        for (const q of s.qs) if (q.f) assert.ok(fids.includes(q.f), at);
        for (const f of fids) assert.ok(s.qs.some((q) => q.f === f), `${at} 例外 ${f} を引き出す質問がない`);
        assert.ok(s.qs.filter((q) => q.f).length <= s.budget, at + " 全部見つけるのに予算が足りない");
      }
      if (s.t === "stack") for (const m of s.moves) assert.ok(m.ans.every((a) => ["push", "replace", "reset"].includes(a)), at);
      if (s.t === "score") for (const it of s.items) {
        const [i, f, r] = it.sug;
        const tier = r >= 4 ? 0 : i * f * r >= 24 ? 0 : i * f * r >= 8 ? 1 : 2;
        assert.equal(tier, it.expect, `${at} 「${it.text}」の目安の点数と Tier が合っていない`);
      }
      if (s.t === "write") assert.ok(s.model && s.q, at);
      if (s.t === "grad") assert.ok(["app", "l0", "l1", "l2", "l3", "l4", "l4t", "l5", "prio", "final"].includes(s.part), at);
    });
  }
});

test("診断テストは8分野×2問で、修了テストと同じ問題", () => {
  const phases = {};
  TEST_QS.forEach((q) => (phases[q.phase] = (phases[q.phase] || 0) + 1));
  assert.deepEqual(Object.values(phases), [2, 2, 2, 2, 2, 2, 2, 2]);
  const pre = lessons.find((l) => l.test === "pre"), post = lessons.find((l) => l.test === "post");
  assert.equal(pre.steps.filter((s) => s.t === "tq").length, 16);
  assert.equal(post.steps.filter((s) => s.t === "tq").length, 16);
});

test("卒業制作：すべてのパートに見本があり、候補アプリがそろっている", () => {
  const parts = lessons.flatMap((l) => l.steps).filter((s) => s.t === "grad").map((s) => s.part);
  assert.equal(new Set(parts).size, 10);
  for (const p of parts) assert.ok(GRAD_EXAMPLE[p], "見本がない: " + p);
  assert.ok(GRAD_PRESETS.length >= 5);
});

test("教材の HTML に閉じ忘れの多いタグがない", () => {
  const html = JSON.stringify(COURSE);
  for (const tag of ["table", "ul", "ol", "div", "p", "b"]) {
    const open = (html.match(new RegExp(`<${tag}[ >]`, "g")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(open, close, `<${tag}> ${open} 個に対して </${tag}> が ${close} 個`);
  }
});
