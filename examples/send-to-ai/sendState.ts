/**
 * 「AIに質問を送る」機能の状態機械（画面側）。
 *
 * この実装で示したいこと
 * 1. 状態は判別共用体で持つ（isLoading / isError のような true/false の組み合わせにしない）
 *    → 「送信中かつエラー」のような、ありえない状態を型の上で作れない
 * 2. 状態×イベントの全マスを TRANSITIONS に書く
 *    → 1マスでも書き忘れると型エラー。「空欄＝仕様未決定＝バグ」をコンパイラが見つける
 * 3. 各マスに「次の状態（to）」と「仕様の説明（note）」を持たせる
 *    → 状態遷移図・状態×イベント表・テスト観点を、このファイルから自動生成できる（renderSpec.ts）
 * 4. requestId（冪等キー）は「ユーザーの1回の依頼」に1つ。再試行では同じIDを使い回す
 *
 * reducer は純粋関数にしてある（通信・タイマー・ID生成は外で行い、結果をイベントとして渡す）。
 */

/** 失敗の理由。理由ごとに画面の出し方と再試行の可否が変わるので、文字列1つで済ませない */
export type ErrorReason =
  | "offline" // 送る前から圏外、または通信が切れた
  | "timeout" // 一定時間応答がない
  | "auth" // セッション切れ（再ログインしてから再試行）
  | "server" // サーバーまたはAI APIの失敗
  | "rateLimited" // 回数制限・利用上限
  | "empty"; // AIが0文字で完了した（おかしな出力）

export type SendState =
  | { kind: "empty" }
  | { kind: "ready"; draft: string }
  | { kind: "sending"; requestId: string; draft: string }
  | { kind: "streaming"; requestId: string; draft: string; text: string }
  | {
      kind: "error";
      requestId: string;
      draft: string;
      partial: string;
      reason: ErrorReason;
    }
  | {
      kind: "done";
      requestId: string;
      question: string;
      answer: string;
      stopped: boolean;
    };

export type SendEvent =
  | { type: "INPUT"; text: string }
  /** requestId は送信ボタンを押した瞬間に画面側で発行して渡す（例: crypto.randomUUID()） */
  | { type: "SUBMIT"; requestId: string }
  | { type: "CANCEL" }
  | { type: "CHUNK"; requestId: string; text: string }
  | { type: "COMPLETE"; requestId: string }
  | { type: "FAIL"; requestId: string; reason: ErrorReason }
  | { type: "RETRY" };

export type StateKind = SendState["kind"];
export type EventType = SendEvent["type"];
type StateOf<K extends StateKind> = Extract<SendState, { kind: K }>;
type EventOf<T extends EventType> = Extract<SendEvent, { type: T }>;

/** 状態×イベント表の1マス */
export type Cell<K extends StateKind, T extends EventType> = {
  /** 遷移しうる先。空配列は「無視（状態は変わらない）」を意味する */
  to: readonly StateKind[];
  /** このマスの仕様。人が読む説明であり、仕様書にそのまま出力される */
  note: string;
  next: (state: StateOf<K>, event: EventOf<T>) => SendState;
};

/** 全状態 × 全イベント。キーが1つでも欠けると型エラーになる */
export type TransitionTable = {
  [K in StateKind]: { [T in EventType]: Cell<K, T> };
};

export const STATE_LABELS: Record<StateKind, string> = {
  empty: "入力なし",
  ready: "送信可能",
  sending: "送信中",
  streaming: "受信中",
  error: "エラー",
  done: "完了",
};

export const EVENT_LABELS: Record<EventType, string> = {
  INPUT: "入力",
  SUBMIT: "送信タップ（連打含む）",
  CANCEL: "キャンセル／戻る",
  CHUNK: "応答の断片が届く",
  COMPLETE: "応答完了",
  FAIL: "失敗（切断・タイムアウト・認証切れ等）",
  RETRY: "再試行",
};

/** 無視するマス。状態はそのまま返す */
const ignore = (note: string) => ({
  to: [] as const,
  note,
  next: (state: SendState): SendState => state,
});

/** 入力内容から「入力なし」か「送信可能」かを決める（空白だけは入力なし扱い） */
const fromInput = (text: string): SendState =>
  text.trim() === "" ? { kind: "empty" } : { kind: "ready", draft: text };

/** 今待っている依頼への応答か。違うIDは前の依頼の残骸なので無視する */
const isCurrent = (
  state: { requestId: string },
  event: { requestId: string },
): boolean => state.requestId === event.requestId;

const STALE = "前の依頼の残骸なので破棄する";

export const TRANSITIONS: TransitionTable = {
  empty: {
    INPUT: {
      to: ["ready", "empty"],
      note: "文字が入れば送信可能へ。空白だけなら入力なしのまま",
      next: (_, e) => fromInput(e.text),
    },
    SUBMIT: ignore("送信ボタンは押せない（無効化）。届いても無視する"),
    CANCEL: ignore("何もしない"),
    CHUNK: ignore(STALE),
    COMPLETE: ignore(STALE),
    FAIL: ignore(STALE),
    RETRY: ignore("再試行する対象がない"),
  },

  ready: {
    INPUT: {
      to: ["ready", "empty"],
      note: "下書きを更新する。全部消したら入力なしへ",
      next: (_, e) => fromInput(e.text),
    },
    SUBMIT: {
      to: ["sending"],
      note: "送信中へ。requestId はこの瞬間に1つだけ発行し、以後の再試行でも使い回す",
      next: (s, e) => ({ kind: "sending", requestId: e.requestId, draft: s.draft }),
    },
    CANCEL: ignore("何もしない（下書きは残す）"),
    CHUNK: ignore(STALE),
    COMPLETE: ignore(STALE),
    FAIL: ignore(STALE),
    RETRY: ignore("再試行する対象がない"),
  },

  sending: {
    INPUT: ignore("入力欄はロック中（送った内容と画面の表示を一致させる）"),
    SUBMIT: ignore("連打は無視する（ボタンの無効化に加えて、ここでも防ぐ二重防御）"),
    CANCEL: {
      to: ["ready"],
      note: "送信可能へ戻し、下書きを復元する。※サーバー側ではすでに処理が進んでいる可能性がある",
      next: (s) => ({ kind: "ready", draft: s.draft }),
    },
    CHUNK: {
      to: ["streaming"],
      note: "今の依頼への応答なら受信中へ。違う requestId は無視する",
      next: (s, e) =>
        isCurrent(s, e)
          ? { kind: "streaming", requestId: s.requestId, draft: s.draft, text: e.text }
          : s,
    },
    COMPLETE: {
      to: ["error"],
      note: "本文0文字で完了した＝AIのおかしな出力。エラー(empty)にして再試行できるようにする",
      next: (s, e) =>
        isCurrent(s, e)
          ? { kind: "error", requestId: s.requestId, draft: s.draft, partial: "", reason: "empty" }
          : s,
    },
    FAIL: {
      to: ["error"],
      note: "エラーへ。下書きは保持し、同じ requestId で再試行できるようにする",
      next: (s, e) =>
        isCurrent(s, e)
          ? { kind: "error", requestId: s.requestId, draft: s.draft, partial: "", reason: e.reason }
          : s,
    },
    RETRY: ignore("送信中なので不要"),
  },

  streaming: {
    INPUT: ignore("入力欄はロック中"),
    SUBMIT: ignore("連打は無視する"),
    CANCEL: {
      to: ["done"],
      note: "生成を止める。ここまでの回答を残して完了扱いにする（stopped=true）",
      next: (s) => ({
        kind: "done",
        requestId: s.requestId,
        question: s.draft,
        answer: s.text,
        stopped: true,
      }),
    },
    CHUNK: {
      to: ["streaming"],
      note: "回答に追記する。違う requestId は無視する",
      next: (s, e) => (isCurrent(s, e) ? { ...s, text: s.text + e.text } : s),
    },
    COMPLETE: {
      to: ["done"],
      note: "完了へ。履歴は1件だけ保存する（2件ではない）",
      next: (s, e) =>
        isCurrent(s, e)
          ? {
              kind: "done",
              requestId: s.requestId,
              question: s.draft,
              answer: s.text,
              stopped: false,
            }
          : s,
    },
    FAIL: {
      to: ["error"],
      note: "途中までの回答を partial に残してエラーへ。再試行は同じ requestId で行う",
      next: (s, e) =>
        isCurrent(s, e)
          ? {
              kind: "error",
              requestId: s.requestId,
              draft: s.draft,
              partial: s.text,
              reason: e.reason,
            }
          : s,
    },
    RETRY: ignore("受信中なので不要"),
  },

  error: {
    INPUT: {
      to: ["ready", "empty"],
      note: "入力を書き換えたら別の依頼になる。古い requestId は捨て、次の送信で新しく発行する",
      next: (_, e) => fromInput(e.text),
    },
    SUBMIT: {
      to: ["sending"],
      note: "エラー中の送信ボタンは再試行と同じ扱い。新しいIDは使わず、同じ requestId を使い回す",
      next: (s) => ({ kind: "sending", requestId: s.requestId, draft: s.draft }),
    },
    CANCEL: {
      to: ["ready"],
      note: "エラーを閉じて送信可能へ戻る（下書きは残す）",
      next: (s) => ({ kind: "ready", draft: s.draft }),
    },
    CHUNK: ignore(
      "エラー確定後に遅れて届いた応答は破棄する（再試行すればサーバーが保存済みの結果を返すので損はない）",
    ),
    COMPLETE: ignore("エラー確定後に遅れて届いた完了通知は破棄する（同上）"),
    FAIL: ignore("すでにエラーなので、エラーを二重に表示しない"),
    RETRY: {
      to: ["sending"],
      note: "同じ requestId で送信中へ。サーバーは処理済みなら保存済みの結果を返す（AIを2回動かさない）",
      next: (s) => ({ kind: "sending", requestId: s.requestId, draft: s.draft }),
    },
  },

  done: {
    INPUT: {
      to: ["ready", "empty"],
      note: "次の質問の入力を始める",
      next: (_, e) => fromInput(e.text),
    },
    SUBMIT: ignore("入力欄は空なので送信ボタンは無効"),
    CANCEL: ignore("何もしない"),
    CHUNK: ignore("完了後に届いた残骸は破棄する"),
    COMPLETE: ignore("完了通知が2回来ても無視する（履歴を2件にしない）"),
    FAIL: ignore("完了後の失敗通知は無視する"),
    RETRY: ignore("「回答を作り直す」は再試行ではなく別機能として設計する"),
  },
};

type AnyCell = {
  to: readonly StateKind[];
  note: string;
  next: (state: SendState, event: SendEvent) => SendState;
};

/** 状態×イベント表を引いて次の状態を返す */
export function transition(state: SendState, event: SendEvent): SendState {
  const row = TRANSITIONS[state.kind] as unknown as Record<EventType, AnyCell>;
  return row[event.type].next(state, event);
}

/** 1マスを取り出す（仕様書の生成とテストで使う） */
export function cellOf(kind: StateKind, type: EventType): AnyCell {
  const row = TRANSITIONS[kind] as unknown as Record<EventType, AnyCell>;
  return row[type];
}

/** 送信ボタンを押せるか。画面のボタン無効化はこの関数だけを見る */
export function canSubmit(state: SendState): boolean {
  return state.kind === "ready" || state.kind === "error";
}

/**
 * 今サーバーに送るべき requestId。
 * 通信処理はイベントではなく「遷移後の状態」から決める。
 * こうすると、エラー中に送信ボタンを押したとき画面が新しいIDを作っても、
 * 実際に送られるのは状態が持っている元のIDになる。
 */
export function requestIdToSend(state: SendState): string | undefined {
  return state.kind === "sending" ? state.requestId : undefined;
}
