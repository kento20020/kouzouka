// 公開用の index.html と Artifact 用の HTML が、src/ から作り直したものと一致しているか
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPages, buildArtifact } from "../build.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("index.html が src/ と一致している（古ければ npm run app:build）", () => {
  assert.equal(readFileSync(join(here, "..", "..", "index.html"), "utf8"), buildPages());
});

test("app/dist/artifact.html が src/ と一致している（古ければ npm run app:build）", () => {
  assert.equal(readFileSync(join(here, "..", "dist", "artifact.html"), "utf8"), buildArtifact());
});

test("Artifact 用は <html>/<head>/<body> を含まず、タイトルが先頭にある", () => {
  const a = buildArtifact();
  assert.ok(a.startsWith("<title>構造化ドリル帳</title>"));
  assert.doesNotMatch(a, /<!doctype|<html|<body/i);
});

test("外部から読み込むのは Google Fonts だけ", () => {
  const html = buildPages();
  const urls = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  for (const u of urls) assert.match(u, /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/, u);
});
