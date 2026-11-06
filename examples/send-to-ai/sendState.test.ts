import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EVENT_LABELS,
  STATE_LABELS,
  TRANSITIONS,
  canSubmit,
  cellOf,
  requestIdToSend,
  transition,
  type EventType,
  type SendEvent,
  type SendState,
  type StateKind,
} from "./sendState.ts";

const run = (start: SendState, events: SendEvent[]): SendState => events.reduce(transition, start);

/** 各状態の代表サンプル（requestId は r1 にそろえる） */
const SAMPLE_STATES: Record<StateKind, SendState> = {
  empty: { kind: "empty" },
  ready: { kind: "ready", draft: "質問" },
  sending: { kind: "sending", requestId: "r1", draft: "質問" },
  streaming: { kind: "streaming", requestId: "r1", draft: "質問", text: "途中" },
  error: { kind: "error", requestId: "r1", draft: "質問", partial: "", reason: "offline" },
  done: { kind: "done", requestId: "r1", question: "質問", answer: "回答", stopped: false },
};

/** 各イベントの代表サンプル。INPUT は「文字あり」と「空白だけ」の両方を試す */
const SAMPLE_EVENTS: Record<EventType, SendEvent[]> = {
  INPUT: [
    { type: "INPUT", text: "新しい質問" },
    { type: "INPUT", text: "   " },
  ],
  SUBMIT: [{ type: "SUBMIT", requestId: "r2" }],
  CANCEL: [{ type: "CANCEL" }],
  CHUNK: [{ type: "CHUNK", requestId: "r1", text: "続き" }],
  COMPLETE: [{ type: "COMPLETE", requestId: "r1" }],
  FAIL: [{ type: "FAIL", requestId: "r1", reason: "timeout" }],
  RETRY: [{ type: "RETRY" }],
};

describe("状態×イベント表（全マスの検査＝状態遷移テスト）", () => {
  const states = Object.keys(TRANSITIONS) as StateKind[];
  const events = Object.keys(EVENT_LABELS) as EventType[];

  test("全状態・全イベントにラベルがある", () => {
    assert.deepEqual(states.sort(), (Object.keys(STATE_LABELS) as StateKind[]).sort());
    assert.equal(events.length, 7);
  });

  for (const kind of states) {
    for (const type of events) {
      const cell = cellOf(kind, type);
      test(`${STATE_LABELS[kind]} × ${EVENT_LABELS[type]}`, () => {
        assert.ok(cell.note.length > 0, "仕様の説明が空");
        for (const event of SAMPLE_EVENTS[type]) {
          const before = SAMPLE_STATES[kind];
          const after = transition(before, event);
          if (cell.to.length === 0) {
            // 「無視」と宣言したマスは、状態を1ビットも変えない
            assert.equal(after, before);
          } else {
            // 宣言した遷移先と、実際の振る舞いが一致している（図とコードがズレていない）
            assert.ok(
              cell.to.includes(after.kind),
              `${after.kind} は宣言された遷移先 [${cell.to.join(", ")}] にない`,
            );
          }
        }
      });
    }
  }
});

describe("ハッピーパス", () => {
  test("入力 → 送信 → 断片を2回受信 → 完了", () => {
    const end = run({ kind: "empty" }, [
      { type: "INPUT", text: "東京の人口は？" },
      { type: "SUBMIT", requestId: "r1" },
      { type: "CHUNK", requestId: "r1", text: "約1400" },
      { type: "CHUNK", requestId: "r1", text: "万人です" },
      { type: "COMPLETE", requestId: "r1" },
    ]);
    assert.deepEqual(end, {
      kind: "done",
      requestId: "r1",
      question: "東京の人口は？",
      answer: "約1400万人です",
      stopped: false,
    });
  });
});

describe("異常系", () => {
  test("連打：送信中に何度押しても requestId は最初の1つのまま", () => {
    const s = run({ kind: "ready", draft: "質問" }, [
      { type: "SUBMIT", requestId: "r1" },
      { type: "SUBMIT", requestId: "r2" },
      { type: "SUBMIT", requestId: "r3" },
    ]);
    assert.equal(requestIdToSend(s), "r1");
  });

  test("送信中に切断：下書きを残してエラー。再試行は同じ requestId", () => {
    const failed = run({ kind: "ready", draft: "質問" }, [
      { type: "SUBMIT", requestId: "r1" },
      { type: "FAIL", requestId: "r1", reason: "offline" },
    ]);
    assert.equal(failed.kind, "error");
    assert.equal(failed.kind === "error" && failed.draft, "質問");
    assert.equal(canSubmit(failed), true);

    assert.equal(requestIdToSend(transition(failed, { type: "RETRY" })), "r1");
    // エラー中に送信ボタンを押した場合も、画面が渡した新しいIDではなく元のIDで送る
    assert.equal(requestIdToSend(transition(failed, { type: "SUBMIT", requestId: "r9" })), "r1");
  });

  test("入力を書き換えてから送ると別の依頼になり、新しい requestId を使う", () => {
    const failed: SendState = {
      kind: "error",
      requestId: "r1",
      draft: "質問",
      partial: "",
      reason: "timeout",
    };
    const s = run(failed, [
      { type: "INPUT", text: "言い直した質問" },
      { type: "SUBMIT", requestId: "r2" },
    ]);
    assert.equal(requestIdToSend(s), "r2");
  });

  test("受信中に切断：途中までの回答を残す", () => {
    const s = run({ kind: "ready", draft: "質問" }, [
      { type: "SUBMIT", requestId: "r1" },
      { type: "CHUNK", requestId: "r1", text: "途中まで" },
      { type: "FAIL", requestId: "r1", reason: "offline" },
    ]);
    assert.deepEqual(s, {
      kind: "error",
      requestId: "r1",
      draft: "質問",
      partial: "途中まで",
      reason: "offline",
    });
  });

  test("前の依頼の応答が遅れて届いても混ざらない", () => {
    const s = run({ kind: "ready", draft: "質問" }, [
      { type: "SUBMIT", requestId: "r1" },
      { type: "CANCEL" },
      { type: "SUBMIT", requestId: "r2" },
      { type: "CHUNK", requestId: "r1", text: "古い回答" },
    ]);
    assert.deepEqual(s, { kind: "sending", requestId: "r2", draft: "質問" });
  });

  test("AIが0文字で完了したらエラー(empty)にする", () => {
    const s = run({ kind: "ready", draft: "質問" }, [
      { type: "SUBMIT", requestId: "r1" },
      { type: "COMPLETE", requestId: "r1" },
    ]);
    assert.equal(s.kind === "error" && s.reason, "empty");
  });

  test("完了通知が2回来ても完了は1回（履歴を2件にしない）", () => {
    const done = SAMPLE_STATES.done;
    assert.equal(transition(done, { type: "COMPLETE", requestId: "r1" }), done);
  });

  test("受信中に停止：ここまでの回答を残して完了扱い", () => {
    const s = transition(SAMPLE_STATES.streaming, { type: "CANCEL" });
    assert.equal(s.kind === "done" && s.stopped, true);
    assert.equal(s.kind === "done" && s.answer, "途中");
  });

  test("空白だけの入力では送信できない", () => {
    const s = transition({ kind: "empty" }, { type: "INPUT", text: "   " });
    assert.equal(canSubmit(s), false);
  });
});
