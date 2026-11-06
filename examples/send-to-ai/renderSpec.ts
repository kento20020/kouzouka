/**
 * sendState.ts の状態×イベント表から、仕様書（Markdown）を生成する。
 *
 * 生成するもの
 * - 状態遷移図（Mermaid stateDiagram）
 * - 状態×イベント表（全マス。空欄は1つもない）
 * - 状態ごとの詳細表（各マスの仕様の説明）
 *
 * 図・表・コードの出どころを1つにすると、「図は直したがコードは古いまま」というズレが起きない。
 * SPEC.md がコードと一致しているかは spec.test.ts が確認する。
 */
import {
  EVENT_LABELS,
  STATE_LABELS,
  TRANSITIONS,
  cellOf,
  type EventType,
  type StateKind,
} from "./sendState.ts";

const STATES = Object.keys(TRANSITIONS) as StateKind[];
const EVENTS = Object.keys(EVENT_LABELS) as EventType[];

const mermaidId = (kind: StateKind): string => kind.charAt(0).toUpperCase() + kind.slice(1);

/** 図の矢印に載せる短いラベル */
const EVENT_SHORT: Record<EventType, string> = {
  INPUT: "入力",
  SUBMIT: "送信",
  CANCEL: "キャンセル",
  CHUNK: "断片受信",
  COMPLETE: "完了通知",
  FAIL: "失敗",
  RETRY: "再試行",
};

const destinationLabel = (kind: StateKind, type: EventType): string => {
  const { to } = cellOf(kind, type);
  return to.length === 0 ? "（無視）" : to.map((d) => STATE_LABELS[d]).join(" / ");
};

const escapeCell = (text: string): string => text.replaceAll("|", "\\|");

function renderDiagram(): string {
  const lines = ["```mermaid", "stateDiagram-v2"];
  for (const kind of STATES) {
    lines.push(`    state "${STATE_LABELS[kind]}" as ${mermaidId(kind)}`);
  }
  lines.push(`    [*] --> ${mermaidId("empty")}`);

  // 同じ「元→先」の矢印はまとめて1本にし、イベント名を並べる
  for (const from of STATES) {
    const edges = new Map<StateKind, string[]>();
    for (const type of EVENTS) {
      for (const dest of cellOf(from, type).to) {
        const labels = edges.get(dest) ?? [];
        labels.push(EVENT_SHORT[type]);
        edges.set(dest, labels);
      }
    }
    for (const [dest, labels] of edges) {
      lines.push(`    ${mermaidId(from)} --> ${mermaidId(dest)}: ${labels.join(" / ")}`);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

function renderMatrix(): string {
  const header = `| 状態＼イベント | ${EVENTS.map((t) => `${t}<br>${EVENT_LABELS[t]}`).join(" | ")} |`;
  const divider = `|${" --- |".repeat(EVENTS.length + 1)}`;
  const rows = STATES.map(
    (kind) =>
      `| **${STATE_LABELS[kind]}**<br>\`${kind}\` | ${EVENTS.map((t) => destinationLabel(kind, t)).join(" | ")} |`,
  );
  return [header, divider, ...rows].join("\n");
}

function renderDetails(): string {
  return STATES.map((kind) => {
    const rows = EVENTS.map((type) => {
      const cell = cellOf(kind, type);
      return `| ${EVENT_LABELS[type]} (\`${type}\`) | ${destinationLabel(kind, type)} | ${escapeCell(cell.note)} |`;
    });
    return [
      `### ${STATE_LABELS[kind]}（\`${kind}\`）`,
      "",
      "| イベント | 次の状態 | どうする |",
      "| --- | --- | --- |",
      ...rows,
    ].join("\n");
  }).join("\n\n");
}

export function renderSpec(): string {
  const total = STATES.length * EVENTS.length;
  const ignored = STATES.flatMap((k) => EVENTS.map((t) => cellOf(k, t))).filter(
    (c) => c.to.length === 0,
  ).length;

  return `<!-- このファイルは自動生成です。直接編集せず、sendState.ts を直してから npm run spec を実行してください -->

# 仕様書：「AIに質問を送る」の状態遷移（自動生成）

- 状態 ${STATES.length} 個 × イベント ${EVENTS.length} 個 ＝ **${total} マス**（空欄 0）
- うち遷移するマス ${total - ignored}、無視するマス ${ignored}
- 「無視」も仕様です。「決めていない」との違いは、ここに書いてあるかどうかです

## 状態遷移図

「無視」のマスは図に描いていません（下の表で確認できます）。

${renderDiagram()}

## 状態×イベント表

${renderMatrix()}

## 各マスの仕様

${renderDetails()}
`;
}
