// claude.ai の Artifact と同じ形（公開時に付く外枠＋window.claude.use）で開き、
// アカウントへの記録保存・赤ペンAI添削・ファイル保存が動くかを確かめる
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { buildArtifact } from "../build.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

// Artifact の公開時に付く外枠（Artifact ツールの説明にある最小のリセットと同じ形）
const SKELETON_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const html = SKELETON_HEAD + buildArtifact() + "</body></html>";

let server, base, browser;
before(async () => {
  server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser.close(); server.close(); });

/** window.claude.use の代わり。db・user・sample・downloads を記録つきで用意する */
function mockClaude(preset) {
  window.__mock = { docs: preset || {}, writes: 0, prompts: [], saves: [] };
  const later = (v) => new Promise((r) => setTimeout(() => r(v), 30));
  window.claude = {
    use: async (name) => {
      if (name === "user") return later({ id: async () => "viewer-1", isOwner: async () => true });
      if (name === "db") return later({
        doc: (path) => ({
          get: async () => ({ exists: path in window.__mock.docs, data: () => window.__mock.docs[path] }),
          set: async (data) => { window.__mock.writes++; window.__mock.docs[path] = JSON.parse(JSON.stringify(data)); },
        }),
      });
      if (name === "sample") return later(async (input, opts) => {
        window.__mock.prompts.push(input);
        const text = "【よいところ】成功時と失敗時の両方が書けています。\n【評価】A";
        opts?.onText?.({ text, delta: text });
        return { text, truncated: false };
      });
      if (name === "downloads") return later({ save: async ({ filename, data }) => { window.__mock.saves.push({ filename, size: String(data).length }); return { status: "saved" }; } });
      return null;
    },
  };
}

async function open(preset, hash = "") {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(mockClaude, preset);
  await page.goto(base + hash);
  await page.waitForSelector("#topbar .xp");
  return { page, errors };
}

test("Artifact の外枠の中でも表示でき、エラーが出ない", async () => {
  const { page, errors } = await open();
  await page.waitForSelector(".goal h1");
  assert.equal(await page.title(), "構造化ドリル帳");
  assert.deepEqual(errors, []);
  await page.close();
});

test("アカウントに保存された新しい記録があれば、それを読み込む（別の端末から続きを学べる）", async () => {
  const now = Date.now() + 60000;
  const { page, errors } = await open({ "data/users/viewer-1/progress": { state: { v: 1, xp: 777, updatedAt: now, done: { "c0-1": { stars: 3, at: now } }, settings: { theme: "system", free: false } } } });
  await page.waitForFunction(() => document.querySelector("#topbar .num")?.textContent === "777 XP");
  assert.deepEqual(errors, []);
  await page.close();
});

test("答えるとアカウントの保存場所に記録が書き込まれる", async () => {
  const { page, errors } = await open(null, "#l-c0-1");
  await page.waitForSelector(".player .card");
  for (let i = 0; i < 3; i++) await page.click("#actionbar .btn.primary");
  for (const o of await page.$$(".opt")) if ((await o.textContent()).includes("解像度を1段ずつ上げ")) { await o.click(); break; }
  await page.click("#actionbar .btn.primary");
  await page.waitForSelector("#actionbar.ok");
  await page.waitForFunction(() => window.__mock.docs["data/users/viewer-1/progress"]?.state?.xp === 10, null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await page.close();
});

test("赤ペンAIコーチ：ボタンが出て、観点つきの依頼で添削が表示される", async () => {
  const { page, errors } = await open({ "data/users/viewer-1/progress": { state: { v: 1, updatedAt: Date.now() + 60000, settings: { theme: "system", free: true } } } });
  await page.waitForFunction(() => window.__kz.state().settings.free === true);
  await page.evaluate(() => { location.hash = "#l-c3-3"; });
  await page.waitForSelector(".player .card");
  while ((await page.evaluate(() => window.__kz.index())) < 5) await page.evaluate(() => window.__kz.solveStep());
  await page.fill("textarea.w", "成功時：予約はキャンセル済みになり、焼く数の集計から1件だけ減る。失敗時：予約は元のまま。");
  await page.click("button:has-text('見本と比べる')");
  await page.waitForSelector("button:has-text('赤ペンAIに添削してもらう')", { state: "visible" });
  await page.click("button:has-text('赤ペンAIに添削してもらう')");
  await page.waitForFunction(() => document.querySelector(".coachbox .out")?.textContent.includes("【評価】A"));
  const prompt = await page.evaluate(() => window.__mock.prompts[0]);
  assert.match(prompt, /# 評価の観点/);
  assert.match(prompt, /焼く数の集計から1件だけ減る/);
  assert.ok((await page.evaluate(() => window.__kz.state().badges)).includes("ai"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("記録の書き出しと卒業制作の Markdown 保存が downloads 機能で保存される", async () => {
  const { page, errors } = await open(null, "#record");
  await page.click("button:has-text('記録を書き出す')");
  await page.waitForFunction(() => window.__mock.saves.length === 1);
  assert.match(await page.evaluate(() => window.__mock.saves[0].filename), /\.json$/);
  await page.evaluate(() => { location.hash = "#l-c9-9"; });
  await page.evaluate(() => { const s = window.__kz.state(); s.settings.free = true; s.grad.app = { preset: "food", name: "テスト", feature: "料理を注文する" }; });
  await page.evaluate(() => { location.hash = "#map"; location.hash = "#l-c9-9"; });
  await page.waitForSelector(".player .card");
  await page.evaluate(() => window.__kz.solveStep());
  await page.click("button:has-text('Markdownで保存')");
  await page.waitForFunction(() => window.__mock.saves.length === 2);
  assert.match(await page.evaluate(() => window.__mock.saves[1].filename), /^構造化フロー_.*\.md$/);
  assert.deepEqual(errors, []);
  await page.close();
});
