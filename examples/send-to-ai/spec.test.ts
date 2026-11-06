import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderSpec } from "./renderSpec.ts";

test("SPEC.md がコード（状態×イベント表）と一致している", () => {
  const onDisk = readFileSync(new URL("./SPEC.md", import.meta.url), "utf8");
  assert.equal(
    onDisk,
    renderSpec(),
    "SPEC.md が古いままです。npm run spec を実行して作り直してください",
  );
});
