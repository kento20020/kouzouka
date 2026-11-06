/**
 * サーバー側の冪等キー（Idempotency Key）処理の最小スケッチ。
 *
 * 画面側の連打防止だけでは防げないもの
 * - 通信ライブラリの自動再送（例: Android の OkHttp は既定で接続失敗時に再試行する）
 * - 複数タブ・複数端末からの同時送信
 * - 「サーバーでは成功したが、レスポンスが返る途中で切れた」後の再試行
 * - 悪意のある、または壊れたクライアントからのリクエスト
 *
 * そこでサーバーは、同じ (userId, requestId) を2回処理しない。
 * 2回目には「1回目の結果」を返す（拒否するだけでは、端末は回答を受け取れない）。
 *
 * 本番では Map ではなく DB を使い、begin() をユニーク制約付きの INSERT で原子的に行う。
 *   例: INSERT INTO idempotency_keys (user_id, request_id, fingerprint, state)
 *       VALUES (...) ON CONFLICT DO NOTHING
 *   挿入できた1件だけが AI を呼ぶ権利を持つ。
 */

export type AskInput = { userId: string; requestId: string; question: string };

export type AskResult =
  | { status: 200; answer: string; replayed: boolean }
  | { status: 409; message: string } // 同じキーがまだ処理中
  | { status: 422; message: string } // 同じキーなのに中身が違う
  | { status: 502; message: string }; // AI API の失敗（キーは解放するので再試行できる）

type Entry =
  | { state: "processing"; fingerprint: string; createdAt: number }
  | { state: "done"; fingerprint: string; createdAt: number; answer: string };

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class IdempotencyStore {
  #entries = new Map<string, Entry>();
  #ttlMs: number;
  #now: () => number;

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? ONE_DAY_MS;
    this.#now = options.now ?? Date.now;
  }

  get(key: string): Entry | undefined {
    const entry = this.#entries.get(key);
    if (entry && this.#now() - entry.createdAt >= this.#ttlMs) {
      // 期限切れのキーは忘れる（いつまでも持つと保存領域が増え続ける）
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }

  begin(key: string, fingerprint: string): void {
    this.#entries.set(key, { state: "processing", fingerprint, createdAt: this.#now() });
  }

  complete(key: string, answer: string): void {
    const entry = this.#entries.get(key);
    if (entry) this.#entries.set(key, { ...entry, state: "done", answer });
  }

  release(key: string): void {
    this.#entries.delete(key);
  }
}

export type AskDeps = {
  store: IdempotencyStore;
  callAI: (question: string) => Promise<string>;
};

export async function handleAsk(deps: AskDeps, input: AskInput): Promise<AskResult> {
  // ユーザーごとにキーの名前空間を分ける。他人と同じ requestId でも結果が混ざらない
  const key = `${input.userId}:${input.requestId}`;
  // 本番ではリクエスト本文のハッシュを使う
  const fingerprint = input.question;

  const existing = deps.store.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return { status: 422, message: "同じ requestId が別の内容で使われました" };
    }
    if (existing.state === "processing") {
      // 待たせるか 409 を返すかは設計判断。ここでは 409 を返し、端末は少し待って再試行する
      return { status: 409, message: "同じ依頼を処理中です" };
    }
    return { status: 200, answer: existing.answer, replayed: true };
  }

  // await より前に同期的に「処理中」を記録するので、同時に届いた2件目は上の分岐で 409 になる
  deps.store.begin(key, fingerprint);
  try {
    const answer = await deps.callAI(input.question);
    deps.store.complete(key, answer);
    return { status: 200, answer, replayed: false };
  } catch {
    // AI が失敗した＝課金も履歴保存も起きていない。キーを解放し、同じ requestId での再試行を受け付ける
    // （課金が発生した後に失敗しうるなら、解放せず「失敗した」という結果を保存して返す設計にする）
    deps.store.release(key);
    return { status: 502, message: "AI の呼び出しに失敗しました" };
  }
}
