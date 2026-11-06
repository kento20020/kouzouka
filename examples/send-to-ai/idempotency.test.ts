import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { IdempotencyStore, ONE_DAY_MS, handleAsk, type AskDeps } from "./idempotency.ts";

/** 呼ばれた回数を数える偽のAI */
function fakeAI(answer = "回答") {
  const calls: string[] = [];
  const callAI = async (question: string) => {
    calls.push(question);
    return answer;
  };
  return { calls, callAI };
}

describe("冪等キー（サーバー側の二重実行防止）", () => {
  test("レスポンスが返る途中で切れて再送されても、AIは1回しか動かず同じ回答を返す", async () => {
    const ai = fakeAI();
    const deps: AskDeps = { store: new IdempotencyStore(), callAI: ai.callAI };
    const input = { userId: "u1", requestId: "r1", question: "質問" };

    const first = await handleAsk(deps, input);
    const retry = await handleAsk(deps, input);

    assert.deepEqual(first, { status: 200, answer: "回答", replayed: false });
    assert.deepEqual(retry, { status: 200, answer: "回答", replayed: true });
    assert.equal(ai.calls.length, 1, "AIが2回動いた＝二重課金");
  });

  test("同じ依頼が同時に2つ届いたら、片方だけが処理され、もう片方は 409", async () => {
    let finish: (answer: string) => void = () => {};
    let calls = 0;
    const deps: AskDeps = {
      store: new IdempotencyStore(),
      callAI: () => {
        calls += 1;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    };
    const input = { userId: "u1", requestId: "r1", question: "質問" };

    const a = handleAsk(deps, input);
    const b = handleAsk(deps, input);
    finish("回答");
    const results = await Promise.all([a, b]);

    assert.equal(calls, 1);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  });

  test("同じ requestId なのに中身が違えば 422（キーの使い回しバグを見つける）", async () => {
    const deps: AskDeps = { store: new IdempotencyStore(), callAI: fakeAI().callAI };
    await handleAsk(deps, { userId: "u1", requestId: "r1", question: "質問A" });
    const result = await handleAsk(deps, { userId: "u1", requestId: "r1", question: "質問B" });
    assert.equal(result.status, 422);
  });

  test("別のユーザーが同じ requestId を使っても、結果は混ざらない", async () => {
    const ai = fakeAI();
    const deps: AskDeps = { store: new IdempotencyStore(), callAI: ai.callAI };
    await handleAsk(deps, { userId: "u1", requestId: "r1", question: "Aさんの質問" });
    const other = await handleAsk(deps, { userId: "u2", requestId: "r1", question: "Bさんの質問" });

    assert.equal(other.status === 200 && other.replayed, false);
    assert.equal(ai.calls.length, 2);
  });

  test("AIが失敗したらキーを解放し、同じ requestId で再試行できる", async () => {
    let fail = true;
    const deps: AskDeps = {
      store: new IdempotencyStore(),
      callAI: async () => {
        if (fail) throw new Error("AI API timeout");
        return "回答";
      },
    };
    const input = { userId: "u1", requestId: "r1", question: "質問" };

    assert.equal((await handleAsk(deps, input)).status, 502);
    fail = false;
    assert.deepEqual(await handleAsk(deps, input), { status: 200, answer: "回答", replayed: false });
  });

  test("保存期限（24時間）を過ぎたキーは新しい依頼として扱う", async () => {
    let now = 0;
    const ai = fakeAI();
    const deps: AskDeps = { store: new IdempotencyStore({ now: () => now }), callAI: ai.callAI };
    const input = { userId: "u1", requestId: "r1", question: "質問" };

    await handleAsk(deps, input);
    now = ONE_DAY_MS;
    const later = await handleAsk(deps, input);

    assert.equal(later.status === 200 && later.replayed, false);
    assert.equal(ai.calls.length, 2);
  });
});
