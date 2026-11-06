/* ===== ai.js : 赤ペンAIコーチ =====
 * claude.ai の中で開いたときは、Claude に答案を添削してもらえる（閲覧者の Claude を使う）。
 * それ以外（GitHub Pages など）では、同じ依頼文をコピーして Claude のチャットに貼れるようにする。
 */
"use strict";

const AI = {
  sample: null,
  state: "unknown", // unknown | ready | off
  async init() {
    if (!isInClaude()) { this.state = "off"; return; }
    this.sample = await window.claude.use("sample").catch(() => null);
    this.state = this.sample ? "ready" : "off";
    document.dispatchEvent(new CustomEvent("ai-state"));
  },
};

function buildReviewPrompt({ task, rubric, answer, example }) {
  return [
    "あなたは「構造化」（要件定義から設計まで、解像度を1段ずつ上げ、各段で状態×イベントの全マスを埋める型）を教える、やさしく的確なコーチです。",
    "初心者が書いた答案を、赤ペン先生として添削してください。",
    "",
    "# 課題",
    task,
    "",
    "# 評価の観点",
    rubric.map((r, i) => `${i + 1}. ${r}`).join("\n"),
    example ? "\n# 見本（参考。これと同じでなくてよい）\n" + example : "",
    "",
    "# 答案",
    answer.trim() || "（未記入）",
    "",
    "# 出力のしかた",
    "- Markdownの記号（#、*、|）は使わず、次の見出しで日本語のプレーンテキストで書く",
    "【よいところ】1〜2点。具体的にほめる",
    "【足りないところ】最大3点。どの観点かを書き、なぜ大事かを1文で添える",
    "【次の一手】すぐ直せることを1つ。書き直し例を1行で示す",
    "【評価】A（型どおりに書けている）／B（あと一歩）／C（もう一度チャレンジ）のどれか1つと、理由を1文",
    "- 全体で400〜600字。専門用語を使うときは短く言い換える",
  ].join("\n");
}

/** 添削ボックス：AIが使えればボタン、使えなければ依頼文のコピー */
function coachBox(getPayload) {
  const out = h("div", { class: "out", "aria-live": "polite" });
  const note = h("p", { class: "tiny muted" });
  const fallback = h("div");
  let ctl = null;

  const askBtn = h("button", { class: "btn red sm", type: "button" }, "赤ペンAIに添削してもらう");
  const stopBtn = h("button", { class: "btn ghost sm", type: "button", hidden: true }, "止める");
  const copyBtn = h("button", { class: "btn ghost sm", type: "button" }, "添削の依頼文をコピー");

  const sync = () => {
    const ready = AI.state === "ready";
    askBtn.hidden = !ready;
    note.textContent = ready
      ? "あなたの Claude の利用枠を使って添削します。最初の1回は許可を求められます。"
      : "依頼文をコピーして Claude のチャットに貼ると、同じ観点で添削してもらえます。";
  };
  sync();
  stepListen("ai-state", sync);

  copyBtn.onclick = () => copyText(buildReviewPrompt(getPayload()), fallback);
  stopBtn.onclick = () => ctl?.abort();
  askBtn.onclick = async () => {
    const payload = getPayload();
    if (!payload.answer || payload.answer.trim().length < 10) {
      out.textContent = "もう少し書いてから添削してもらいましょう。";
      return;
    }
    ctl = new AbortController();
    askBtn.disabled = true;
    stopBtn.hidden = false;
    out.textContent = "赤ペンを準備しています…";
    try {
      await AI.sample(buildReviewPrompt(payload), {
        signal: ctl.signal,
        onText: ({ text }) => { out.textContent = text; },
      });
      Store.state.aiReviews += 1;
      Game.badge("ai");
      Store.save();
    } catch (e) {
      out.textContent = e?.text || "";
      const msg = {
        cancelled: "",
        not_granted: "Claude の利用が許可されなかったので、添削は使えません。依頼文のコピーを使ってください。",
        sampling_disabled: "このアカウントでは Claude を使えません。依頼文のコピーを使ってください。",
        rate_limited: "少し時間をおいてから、もう一度ボタンを押してください。",
        session_expired: "もう一度サインインしてから使ってください。",
        refused: "この内容では添削できませんでした。書き方を変えて試してください。",
      }[e?.code];
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e?.code)) {
        AI.state = "off";
        sync();
      }
      if (msg !== "") note.textContent = msg || "うまくつながりませんでした。もう一度押してください。";
    } finally {
      askBtn.disabled = false;
      stopBtn.hidden = true;
    }
  };

  return h("div", { class: "coachbox" },
    h("div", { class: "hd" }, "赤ペンAIコーチ"),
    h("div", { class: "row" }, askBtn, stopBtn, copyBtn),
    note, out, fallback,
  );
}
