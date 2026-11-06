// 人と同じようにクリックして、各ウィジェットが動くかを確かめる
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PAGE_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "index.html")).href;
const IGNORED = /fonts\.(googleapis|gstatic)|ERR_(NAME|INTERNET|CONNECTION|TUNNEL|FAILED)/;

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

/** すべてのレッスンを開いた状態でページを開き、指定レッスンの指定ステップまで進める */
async function at(lessonId, stepIndex, viewport = { width: 1100, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORED.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    if (!localStorage.getItem("kouzouka-drill-v1")) localStorage.setItem("kouzouka-drill-v1", JSON.stringify({ v: 1, settings: { theme: "system", free: true } }));
  });
  await page.goto(PAGE_URL + "#l-" + lessonId);
  await page.waitForSelector(".player .card");
  while ((await page.evaluate(() => window.__kz.index())) < stepIndex) await page.evaluate(() => window.__kz.solveStep());
  return { page, errors, step: await page.evaluate(() => window.__kz.step()) };
}
const nextEnabled = (page) => page.$eval("#actionbar .btn.primary", (b) => !b.disabled);

test("付箋の仕分け：タップで貼り、確認すると正解になる", async () => {
  const { page, errors, step } = await at("c1-2", 1);
  assert.equal(step.t, "sort");
  const labels = Object.fromEntries(step.buckets.map((b) => [b.id, b.label]));
  for (const it of step.items) {
    await page.locator(".tray .note", { hasText: it.text }).first().click();
    await page.locator(".bucket", { hasText: labels[it.b] }).first().click();
  }
  assert.equal(await page.$$eval(".tray .note", (n) => n.length), 0);
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ok");
  assert.deepEqual(errors, []);
  await page.close();
});

test("付箋の仕分け：間違えると理由が出て、直してもう一度できる", async () => {
  const { page, step } = await at("c2-3", 1);
  const ids = step.buckets.map((b) => b.id);
  const labels = Object.fromEntries(step.buckets.map((b) => [b.id, b.label]));
  for (const [i, it] of step.items.entries()) {
    const wrongB = i === 0 ? ids.find((x) => x !== it.b) : it.b;
    await page.locator(".tray .note", { hasText: it.text }).first().click();
    await page.locator(".bucket", { hasText: labels[wrongB] }).first().click();
  }
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ng");
  assert.match(await page.textContent("#actionbar"), /正しくは/);
  await page.click("#actionbar .btn:has-text('直してもう一度')");
  const first = step.items[0];
  await page.locator(".bucket .note", { hasText: first.text }).first().click();
  await page.locator(".bucket", { hasText: labels[first.b] }).first().click();
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ok");
  await page.close();
});

test("状態×イベント表：マスをタップして選び、全マス埋めると正解", async () => {
  const { page, errors, step } = await at("c6-1", 2, { width: 390, height: 844 });
  assert.equal(step.t, "grid");
  assert.equal(await page.textContent(".emptycount"), "空欄 9 マス");
  for (let r = 0; r < step.rows.length; r++) {
    for (let c = 0; c < step.cols.length; c++) {
      const k = r + "-" + c;
      const want = step.opts[[].concat(step.ans[k])[0]];
      await page.locator(`.sx tbody tr:nth-child(${r + 1}) td:nth-of-type(${c + 1}) .cellbtn`).click();
      await page.locator(".picker .opt", { hasText: want }).first().click();
    }
  }
  assert.equal(await page.textContent(".emptycount"), "空欄 0 マス");
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ok");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, "横にはみ出している: " + overflow + "px");
  assert.deepEqual(errors, []);
  await page.close();
});

test("ヒアリング：良い質問を選ぶと例外が見つかり、完了すると次へ進める", async () => {
  const { page, errors, step } = await at("c2-2", 1);
  assert.equal(step.t, "interview");
  assert.equal(await nextEnabled(page), false);
  for (const q of step.qs.filter((x) => x.f)) {
    await page.locator(".qchip", { hasText: q.q }).click();
    await page.waitForTimeout(380);
  }
  await page.waitForSelector(".found .chip.got");
  assert.equal(await page.$$eval(".found .chip.got", (n) => n.length), step.finds.length);
  assert.equal(await nextEnabled(page), true);
  assert.ok((await page.evaluate(() => window.__kz.state().badges)).includes("interview"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("画面のスタック：方式を選ぶとスマホの表示が変わり、確認できる", async () => {
  const { page, step } = await at("c4-2", 0);
  assert.equal(step.t, "stack");
  for (const [i, m] of step.moves.entries()) {
    await page.locator(".move").nth(i).locator(`button:text-is("${m.ans[0]}")`).click();
  }
  const top = await page.$$eval(".stackview .scr", (els) => els.at(-1).textContent);
  assert.match(top, /予約完了/);
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ok");
  await page.close();
});

test("通信の実験室：二重予約を起こして、冪等キーで防ぐ", async () => {
  const { page, errors } = await at("c7-1", 2);
  assert.equal(await nextEnabled(page), false);
  await page.click("button:has-text('返る途中で切れる')");
  await page.click("button:has-text('再試行する')");
  assert.equal(await page.textContent(".counter.alert b"), "2");
  await page.check(".lab .toggle input");
  await page.click("button:has-text('返る途中で切れる')");
  await page.click("button:has-text('再試行する')");
  assert.match(await page.textContent(".track"), /処理済み/);
  await page.click("button:has-text('届く前に切れる')");
  await page.click("button:has-text('再試行する')");
  assert.equal(await nextEnabled(page), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("書く問題：見本を見て、チェックを全部つけると完了。AIが使えない環境では依頼文をコピーできる", async () => {
  const { page, errors } = await at("c3-3", 5);
  const ta = page.locator("textarea.w");
  await ta.fill("成功時：予約はキャンセル済みになり、焼く数の集計から1件だけ減る。失敗時：予約は元のまま。");
  await page.click("button:has-text('見本と比べる')");
  await page.waitForSelector(".model");
  assert.equal(await page.isVisible("button:has-text('赤ペンAIに添削してもらう')"), false);
  assert.equal(await page.isVisible("button:has-text('添削の依頼文をコピー')"), true);
  for (const box of await page.$$(".checks input")) await box.check();
  assert.equal(await nextEnabled(page), true);
  await page.reload();
  await page.waitForSelector("textarea.w");
  assert.match(await page.inputValue("textarea.w"), /焼く数の集計から1件だけ減る/, "書いた内容が再読み込みで消えた");
  assert.deepEqual(errors, []);
  await page.close();
});

test("卒業制作：アプリを選び、状態×イベント表を空欄0にできる", async () => {
  const { page, errors } = await at("c9-0", 1);
  await page.click(".preset:has-text('フードデリバリー')");
  assert.equal(await page.inputValue(".fld textarea >> nth=1"), "料理を注文する");
  await page.goto(PAGE_URL + "#l-c9-6");
  await page.waitForSelector(".player .card");
  await page.evaluate(() => window.__kz.solveStep());
  const states = page.locator(".fld:has(label:text('状態（行）')) input");
  const events = page.locator(".fld:has(label:text('イベント（列）')) input");
  for (const [i, v] of ["注文確認", "決済中", "注文済み"].entries()) await states.nth(i).fill(v);
  for (const [i, v] of ["注文タップ", "連打", "通信が切れた", "戻る"].entries()) await events.nth(i).fill(v);
  assert.equal(await page.textContent(".emptycount"), "空欄 12 マス");
  const cells = page.locator(".sx td");
  const n = await cells.count();
  for (let i = 0; i < n; i++) await cells.nth(i).locator("button:has-text('無視する')").click();
  assert.equal(await page.textContent(".emptycount"), "空欄 0 マス");
  for (const box of await page.$$(".checks input")) await box.check();
  assert.equal(await nextEnabled(page), true);
  const md = await page.evaluate(() => window.__kz.state().grad.l4t);
  assert.equal(Object.values(md.cells).filter((v) => v === "無視する").length, 12);
  assert.deepEqual(errors, []);
  await page.close();
});

test("暗いテーマ（青焼き）でも表示でき、テーマ切り替えが保存される", async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, colorScheme: "dark" });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(PAGE_URL + "#prefs");
  await page.waitForSelector(".seg3");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, "rgb(13, 29, 56)");
  await page.click(".seg3 button:has-text('方眼ノート')");
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  await page.reload();
  await page.waitForSelector(".seg3");
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  await page.close();
});
