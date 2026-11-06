# 構造化ドリル帳（開発メモ）

ブラウザだけで動く1ファイルのアプリです。ライブラリは使っていません（フォントだけ Google Fonts から読み込みます）。

## 構成

```
app/
  build.mjs            src/ をまとめて HTML を作る
  src/
    head.html          <title>・フォント・<style> の差し込み口
    body.html          画面の外枠・<script> の差し込み口
    styles.css         見た目（方眼ノート／青焼きの2テーマ）
    content/           教材データ（ここを直せば問題が増やせる）
      _helpers.js      問題の書き方（choice / sort / grid …）
      cards.js         型カード
      ch00-03.js       第0〜3章（診断テストを含む）
      ch04-06.js       第4〜6章
      ch07-10.js       第7〜10章（卒業制作・修了テスト）
      grad-data.js     卒業制作の候補アプリと見本
    engine/
      util.js          DOM の小さな道具
      store.js         記録の保存（ブラウザ／claude.ai ではアカウント）
      ai.js            赤ペンAIコーチ（claude.ai のときだけ）
      steps.js         問題の種類ごとの表示と採点
      grad.js          卒業制作の編集画面と Markdown 書き出し
      app.js           XP・バッジ・レッスンの進行・画面・ルーター
  dist/artifact.html   claude.ai の Artifact 用（自動生成）
  test/                テスト
../index.html          GitHub Pages 用（自動生成）
```

## 問題の種類

| 種類 | 内容 | 採点 |
| --- | --- | --- |
| `talk` | 登場人物の会話 | なし |
| `learn` | 解説 | なし |
| `choice` / `multi` | 1つ選ぶ／全部選ぶ（選択肢ごとに理由） | 確認ボタン |
| `sort` | 付箋を枠に仕分ける | 確認ボタン |
| `order` | 順番に並べる | 確認ボタン |
| `spot` | 問題のある箇所に印をつける | 確認ボタン |
| `grid` | 状態×イベント表のマスを埋める | 確認ボタン |
| `stack` / `stackplay` | 画面スタックの方式選び／自由に触る | 確認ボタン／課題達成 |
| `seq` | 通信を切って二重予約を起こし、冪等キーで防ぐ実験 | 課題達成 |
| `interview` | 質問回数に制限のあるヒアリング | 完了で達成 |
| `score` | 影響×頻度×取り返しで Tier を判定 | 確認ボタン |
| `write` | 書いて見本と比べ、自己チェック（AI 添削つき） | チェックで達成 |
| `grad` | 卒業制作の各パート | 最低限の記入＋チェック |
| `tq` | 診断・修了テスト（答え合わせは最後） | 結果画面 |

## コマンド

```bash
npm run app:build                 # index.html と dist/artifact.html を作り直す
node --test app/test/*.test.mjs   # アプリのテスト（実ブラウザで全レッスンを通す試験を含む）
```

テストの内容：

- `content.test.mjs`：正解のつけ忘れ、表の答えの空欄、時間の合計（約6〜7時間）、型カードの参照など
- `interact.test.mjs`：付箋・表・ヒアリング・スタック・実験室・書く問題・卒業制作を、実際にクリックして操作
- `e2e.test.mjs`：全49レッスンを最初から最後まで通し、記録が再読み込み後も残るか
- `build.test.mjs`：`index.html` が `src/` から作り直したものと一致しているか
