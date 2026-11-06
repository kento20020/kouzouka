// 構造化ドリル帳のビルド：src/ の部品を1つの HTML にまとめる
//   - リポジトリ直下の index.html … GitHub Pages 用（完全な HTML 文書）
//   - app/dist/artifact.html     … claude.ai の Artifact 用（<head>/<body> は公開時に付く）
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, "src", p), "utf8");

export const JS_ORDER = [
  "engine/util.js",
  "content/_helpers.js",
  "content/cards.js",
  "content/ch00-03.js",
  "content/ch04-06.js",
  "content/ch07-10.js",
  "content/ch-reverse.js",
  "content/grad-data.js",
  "engine/store.js",
  "engine/ai.js",
  "engine/steps.js",
  "engine/grad.js",
  "engine/app.js",
];

export function buildParts() {
  const js = '(() => {\n"use strict";\n' + JS_ORDER.map((f) => `/* ---- ${f} ---- */\n` + src(f).replace(/^"use strict";\n/m, "")).join("\n") + "\n})();\n";
  if (/<\/script/i.test(js)) throw new Error("JS に </script が含まれています");
  const css = src("styles.css");
  const head = src("head.html").replace("/*@CSS@*/", () => css);
  const body = src("body.html").replace("/*@JS@*/", () => js);
  return { head, body, js, css };
}

export function buildPages() {
  const { head, body } = buildParts();
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}</head>\n<body>\n${body}</body>\n</html>\n`;
}

export function buildArtifact() {
  const { head, body } = buildParts();
  return head + body;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(here, "..", "index.html"), buildPages());
  mkdirSync(join(here, "dist"), { recursive: true });
  writeFileSync(join(here, "dist", "artifact.html"), buildArtifact());
  console.log("built index.html and app/dist/artifact.html");
}
