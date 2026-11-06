# 構造化（kouzouka）

要件定義から設計に進むときに、**「解像度を1段ずつ上げ、各段で"状態×イベント"の全マスを埋める」** ための学習ノート・テンプレート・動くサンプルです。

```
業務理解 → フロー → 粒度を決める → ハッピーパス → 異常系
```

この順番は王道です。ただし、このままだと次の4点が抜けます。

| # | 足りないこと | 一言で | 詳しく |
| --- | --- | --- | --- |
| ① | 粒度は1つに決めない | 1段ずつズームしていく | [02 粒度：ズームの階段](docs/02-zoom-levels.md) |
| ② | ハッピーパスと異常系の間に「状態の定義」を入れる | 状態がないと異常系は出せない | [03 手順 Step4](docs/03-six-steps.md#step4-状態の定義ここが抜けがち) |
| ③ | 異常系は思いつきで出さない | 表を使って漏れなく出す | [03 手順 Step5](docs/03-six-steps.md#step5-状態イベント表で異常系を出す)・[06 8つの問い](docs/06-eight-questions.md) |
| ④ | 全部はやらない | 優先度で切る | [07 どこまでやるか](docs/07-prioritization.md) |

## 全体の流れ

```mermaid
flowchart LR
    S1["Step1<br>業務理解<br>L0〜L1"] --> S2["Step2<br>ユースケース<br>L2"]
    S2 --> S3["Step3<br>画面遷移<br>L3"]
    S3 --> S4["Step4<br>状態の定義<br>L4"]
    S4 --> S5["Step5<br>状態×イベント表<br>で異常系"]
    S5 --> S6["Step6<br>優先度で切る"]
    S6 -. 一方向ドアだけ .-> L5["L5<br>シーケンス<br>冪等性・リトライ"]
    S5 -. 空欄・矛盾が出たら .-> S2
```

## 目次

| 章 | 内容 |
| --- | --- |
| [01 分野マップ](docs/01-skill-map.md) | この力を構成する「名前のある分野」と、それぞれ何を学べばいいか |
| [02 粒度：ズームの階段](docs/02-zoom-levels.md) | L0〜L5 の定義、粒度ミスの見分け方、どこまで下りるか（一方向／二方向ドア） |
| [03 手順の型（6ステップ）](docs/03-six-steps.md) | 各ステップの入力・作業・成果物・完了条件・よくある失敗 |
| [04 具体例：「AIに送る」](docs/04-example-send-to-ai.md) | 状態遷移図、全42マスの表、通信途中の失敗、冪等キー、型設計 |
| [05 戻るボタンとログイン](docs/05-navigation-and-auth.md) | push／replace／reset、Android・iOS・Web の違い、認証まわりの状態 |
| [06 異常系を出す「8つの問い」](docs/06-eight-questions.md) | 問いごとの確認項目、入力系・環境系、HAZOP との対応 |
| [07 どこまでやるか](docs/07-prioritization.md) | Tier0〜2、点数づけシート、「やらない」の書き方 |
| [08 鍛え方](docs/08-training.md) | 既存アプリの逆設計、端末での試し方、8週間プラン |
| [09 参考書・資料](docs/09-references.md) | 分野別の本と無料資料、読む順番 |
| [10 元の文章へのレビュー](docs/10-review-notes.md) | 元の解説で補足・修正したほうがよい点 |

## テンプレート（コピーして埋める）

| ファイル | 使う場面 |
| --- | --- |
| [ヒアリングシート](templates/hearing-sheet.md) | Step1：As-Is → 困りごと → To-Be を聞く |
| [ユースケース記述](templates/usecase.md) | Step2：基本／代替／例外フローと事後条件 |
| [画面遷移表](templates/screen-transition-table.md) | Step3：遷移元・イベント・遷移先・条件・push/replace/reset |
| [状態の定義](templates/state-definition.md) | Step4：アプリ全体／画面／操作の3層 |
| [状態×イベント表](templates/state-event-table.md) | Step5：全マスを埋めて空欄をなくす |
| [シーケンス図](templates/sequence.md) | L5：端末⇔サーバ⇔外部サービス、失敗の位置 |
| [優先度シート](templates/priority-sheet.md) | Step6：影響×頻度×取り返しのつかなさで点数をつける |
| [AIレビュー用プロンプト](templates/ai-review-prompt.md) | 表の空欄・矛盾・抜けをAIに指摘させる |

## 動くサンプル（`examples/send-to-ai`）

「状態遷移図とコードの型を1対1にする」と「空欄はバグ」を、実際に動くコードで確かめられます。

| ファイル | 内容 |
| --- | --- |
| [sendState.ts](examples/send-to-ai/sendState.ts) | 画面側の状態機械。6状態×7イベントの全42マスを定義。**1マスでも消すと型エラー** |
| [idempotency.ts](examples/send-to-ai/idempotency.ts) | サーバー側の冪等キー処理。同じ requestId は2回処理せず、1回目の結果を返す |
| [SPEC.md](examples/send-to-ai/SPEC.md) | コードから自動生成した状態遷移図と状態×イベント表 |
| `*.test.ts` | 全マスの状態遷移テスト、異常系テスト、仕様書とコードのズレ検出 |

```bash
npm install
npm run check   # 型チェック + テスト（60件）
npm run spec    # sendState.ts から SPEC.md を作り直す
```

Node.js 22.18 以上が必要です（TypeScript をそのまま実行するため）。

試しに `sendState.ts` の `TRANSITIONS` から1マス消して `npm run typecheck` を実行すると、次のように怒られます。

```
error TS2741: Property 'RETRY' is missing in type '{ INPUT: ...; FAIL: ...; }'
but required in type '{ INPUT: Cell<"done", "INPUT">; ...; RETRY: Cell<...>; }'.
```

「完了状態で再試行されたらどうするか」が決まっていない、とコンパイラが教えてくれたことになります。

## おすすめの読む順番

1. 時間がない → この README → [04 具体例](docs/04-example-send-to-ai.md) → [06 8つの問い](docs/06-eight-questions.md)
2. 手を動かしたい → [08 鍛え方](docs/08-training.md) の1週目 → テンプレートを埋める
3. 体系的に学びたい → 01 から順番に → [09 参考書](docs/09-references.md)
