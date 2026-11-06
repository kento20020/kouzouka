// 実ブラウザ（Chromium）で index.html を開き、全レッスンを最後まで通す
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PAGE_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "index.html")).href;

const IGNORED = /fonts\.(googleapis|gstatic)|ERR_(NAME|INTERNET|CONNECTION|TUNNEL|FAILED)/;

async function open(viewport = { width: 1200, height: 900 }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORED.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(PAGE_URL);
  return { browser, page, errors };
}

test("マップが表示され、エラーが出ない", async () => {
  const { browser, page, errors } = await open();
  await page.waitForSelector(".goal h1");
  assert.match(await page.textContent(".goal h1"), /L0からL5/);
  assert.equal(await page.$$eval(".chap", (els) => els.length), 11);
  assert.deepEqual(errors, []);
  await browser.close();
});

test("スマホ幅で最初のレッスンを手で操作できる（選択 → 確認 → 正解）", async () => {
  const { browser, page, errors } = await open({ width: 390, height: 844 });
  await page.click(".next .btn.primary");
  await page.waitForSelector(".player .card");
  for (let i = 0; i < 3; i++) await page.click("#actionbar .btn.primary");
  for (const o of await page.$$(".opt")) {
    if ((await o.textContent()).includes("解像度を1段ずつ上げ")) { await o.click(); break; }
  }
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ok");
  assert.equal(await page.evaluate(() => window.__kz.state().xp), 10);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, "横にはみ出している: " + overflow + "px");
  assert.deepEqual(errors, []);
  await browser.close();
});

test("全レッスンを最後まで通せる（自動で正解して進む）", { timeout: 300000 }, async () => {
  const { browser, page, errors } = await open();
  const ids = await page.evaluate(() => window.__kz.lessons());
  assert.ok(ids.length >= 40, "レッスン数: " + ids.length);
  for (const id of ids) {
    await page.evaluate((x) => { location.hash = "#l-" + x; }, id);
    await page.waitForSelector(".player .card");
    for (let guard = 0; guard < 60; guard++) {
      const r = await page.evaluate(() => window.__kz.solveStep());
      if (r === "none") break;
      assert.notEqual(r, "stuck", `${id} で先に進めないステップがある`);
      if (await page.$(".result")) break;
    }
    assert.ok(await page.$(".result"), `${id} の結果画面が出ない`);
  }
  const s = await page.evaluate(() => window.__kz.state());
  assert.equal(Object.keys(s.done).length, ids.length);
  assert.ok(s.cards.length >= 30, "型カード: " + s.cards.length);
  assert.ok(s.badges.includes("all"), "皆勤賞バッジがない");
  assert.ok(s.tests.pre && s.tests.post, "テスト結果がない");

  await page.evaluate(() => { location.hash = "#record"; });
  await page.waitForSelector(".cert");
  await page.evaluate(() => { location.hash = "#grad"; });
  await page.waitForSelector(".mdpreview");
  assert.match(await page.textContent(".mdpreview"), /L4 状態×イベント表/);

  await page.reload();
  await page.waitForSelector(".mdpreview");
  assert.equal(Object.keys((await page.evaluate(() => window.__kz.state())).done).length, ids.length, "再読み込みで記録が消えた");
  assert.deepEqual(errors, []);
  await browser.close();
});
