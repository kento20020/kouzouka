/* ===== grad.js : 卒業制作（既存アプリを L0〜L5 で構造化する） ===== */
"use strict";

const Grad = {
  get d() {
    const g = Store.state.grad;
    g.app ??= { preset: "", name: "", feature: "" };
    g.l0 ??= { who: "", pain: "", success: "", notdo: "" };
    g.l1 ??= { lanes: [], steps: [], exc: [] };
    g.l2 ??= { name: "", actor: "", pre: "", trigger: "", basic: [], alt: [], exc: [], postOk: "", postNg: "" };
    g.l3 ??= { screens: [], trans: [], tried: "" };
    g.l4 ??= { app: [], screen: [], op: [] };
    g.l4t ??= { states: [], events: [], cells: {} };
    g.l5 ??= { arrows: [], key: "" };
    g.prio ??= { items: [], known: "" };
    g.final ??= { reflect: "" };
    return g;
  },
  preset() { return GRAD_PRESETS.find((p) => p.id === this.d.app.preset) || null; },
  persist: debounce(() => Store.save(), 500),

  /** 各パートの「最低限ここまで書けた」 */
  minOk(part) {
    const d = this.d;
    const f = (x) => (x || "").trim().length > 0;
    const n = (a) => a.filter((x) => (typeof x === "string" ? f(x) : f(x.text) || f(x.msg) || f(x.from))).length;
    switch (part) {
      case "app": return f(d.app.name) && f(d.app.feature);
      case "l0": return f(d.l0.who) && f(d.l0.pain) && f(d.l0.success);
      case "l1": return n(d.l1.lanes) >= 2 && n(d.l1.steps) >= 4 && n(d.l1.exc) >= 2;
      case "l2": return f(d.l2.name) && n(d.l2.basic) >= 3 && n(d.l2.exc) >= 2 && f(d.l2.postOk) && f(d.l2.postNg);
      case "l3": return n(d.l3.screens) >= 3 && d.l3.trans.filter((t) => f(t.from) && f(t.to) && t.how).length >= 4;
      case "l4": return n(d.l4.app) >= 2 && n(d.l4.screen) >= 2 && n(d.l4.op) >= 2;
      case "l4t": return n(d.l4t.states) >= 3 && n(d.l4t.events) >= 4 && this.emptyCells() === 0;
      case "l5": return n(d.l5.arrows) >= 3 && f(d.l5.key);
      case "prio": return d.prio.items.filter((x) => f(x.text) && x.tier !== "").length >= 3 && d.prio.items.some((x) => x.tier === "0") && f(d.prio.known);
      case "final": return (d.final.reflect || "").replace(/\s/g, "").length >= 30;
    }
    return false;
  },
  missingText(part) {
    return {
      app: "アプリ名と、構造化する機能を書こう。",
      l0: "「誰の」「何の困りごと」「成功の目印」を書こう。",
      l1: "レーンを2つ以上、流れの箱を4つ以上、例外を2つ以上書こう。",
      l2: "名前・基本フロー3行以上・例外フロー2つ以上・事後条件（成功時と失敗時）を書こう。",
      l3: "画面を3つ以上、遷移を4行以上（方式まで）書こう。",
      l4: "3つの層それぞれに、状態を2つ以上書こう。",
      l4t: "状態3つ以上・イベント4つ以上にして、空欄を0にしよう。",
      l5: "矢印を3本以上と、冪等キーの使い方を書こう。",
      prio: "3つ以上に Tier をつけ（Tier0 を1つ以上）、既知の挙動を1つ書こう。",
      final: "振り返りを30文字以上書こう。",
    }[part];
  },

  emptyCells() {
    const t = this.d.l4t;
    const st = t.states.filter((x) => x.trim()), ev = t.events.filter((x) => x.trim());
    let empty = 0;
    st.forEach((s) => ev.forEach((e) => { if (!(t.cells[s + "|" + e] || "").trim()) empty++; }));
    return empty;
  },

  /* ----- 部品 ----- */
  field(label, obj, key, { hint, rows = 2, ph = "" } = {}) {
    const id = "g-" + label.replace(/[^\w]/g, "") + "-" + key + Math.random().toString(36).slice(2, 6);
    const ta = h("textarea", { class: "w", id, rows, placeholder: ph, style: { minHeight: rows * 1.7 + 1.6 + "em" } });
    ta.value = obj[key] || "";
    ta.oninput = () => { obj[key] = ta.value; this.persist(); this.changed(); };
    return h("div", { class: "fld" }, h("label", { for: id }, label), hint ? rich("div", hint, { class: "hint" }) : null, ta);
  },
  list(label, arr, { hint, ph = "", min = 3, numbered = true } = {}) {
    const box = h("div", { class: "listed" });
    const paint = () => {
      while (arr.length < min) arr.push("");
      box.replaceChildren(...arr.map((v, i) => {
        const inp = h("input", { type: "text", value: v, placeholder: i === 0 ? ph : "", "aria-label": `${label} ${i + 1}` });
        inp.oninput = () => { arr[i] = inp.value; this.persist(); this.changed(); };
        const x = h("button", { class: "xbtn", type: "button", "aria-label": "この行を消す", onclick: () => { arr.splice(i, 1); paint(); this.persist(); this.changed(); } }, "×");
        return h("div", { class: "li" }, h("span", { class: "n" }, numbered ? i + 1 : "・"), inp, x);
      }), h("div", null, h("button", { class: "btn ghost sm", type: "button", onclick: () => { arr.push(""); paint(); box.querySelectorAll("input")[arr.length - 1]?.focus(); } }, "＋ 行を足す")));
    };
    paint();
    return h("div", { class: "fld" }, h("label", null, label), hint ? rich("div", hint, { class: "hint" }) : null, box);
  },
  rows(rows, cols, { add, min = 3 } = {}) {
    const box = h("div", { class: "ed" });
    const paint = () => {
      while (rows.length < min) rows.push(add());
      box.replaceChildren(
        h("div", { class: "tr hd", style: { gridTemplateColumns: cols.map((c) => c.w || "minmax(0,1fr)").join(" ") + " 32px" } }, ...cols.map((c) => h("span", null, c.label)), h("span")),
        ...rows.map((r, i) => {
          const cells = cols.map((c) => {
            if (c.options) {
              const sel = h("select", { "aria-label": c.label });
              sel.append(h("option", { value: "" }, c.label + "…"));
              (typeof c.options === "function" ? c.options() : c.options).forEach((o) => sel.append(h("option", { value: o.value ?? o }, o.label ?? o)));
              sel.value = r[c.key] ?? "";
              sel.onchange = () => { r[c.key] = sel.value; this.persist(); this.changed(); };
              return sel;
            }
            const inp = h("input", { type: "text", value: r[c.key] || "", placeholder: c.ph || c.label, "aria-label": c.label });
            inp.oninput = () => { r[c.key] = inp.value; this.persist(); this.changed(); };
            return inp;
          });
          const x = h("button", { class: "xbtn", type: "button", "aria-label": "この行を消す", onclick: () => { rows.splice(i, 1); paint(); this.persist(); this.changed(); } }, "×");
          return h("div", { class: "tr", style: { gridTemplateColumns: cols.map((c) => c.w || "minmax(0,1fr)").join(" ") + " 32px" } }, ...cells, x);
        }),
        h("div", null, h("button", { class: "btn ghost sm", type: "button", onclick: () => { rows.push(add()); paint(); } }, "＋ 行を足す")),
      );
    };
    paint();
    return box;
  },
  suggest(label, words, onPick) {
    if (!words?.length) return null;
    return h("div", { class: "row small" }, h("span", { class: "muted" }, label), ...words.map((w) => h("button", { class: "chip", type: "button", onclick: () => onPick(w) }, "＋ " + w)));
  },

  changed() { document.dispatchEvent(new CustomEvent("grad-change")); },

  /* ----- 各パートの編集画面 ----- */
  editor(part) {
    const d = this.d;
    const p = this.preset();
    const host = h("div", { class: "stack" });
    const rerender = () => host.replaceChildren(...this.editorBody(part, d, p, rerender).filter(Boolean));
    rerender();
    return host;
  },

  editorBody(part, d, p, rerender) {
    switch (part) {
      case "app": {
        const presetBtns = GRAD_PRESETS.map((x) => h("button", { class: "preset", type: "button", "aria-pressed": String(d.app.preset === x.id), onclick: () => {
          d.app.preset = x.id;
          if (x.id !== "free") { d.app.name = d.app.name || x.name; d.app.feature = x.feature; }
          this.persist(); this.changed(); rerender();
        } }, h("b", null, x.name), h("span", null, x.desc)));
        return [
          h("div", { class: "presets" }, presetBtns),
          this.field("構造化するアプリの名前（実在のアプリ名でOK）", d.app, "name", { rows: 1, ph: "例：いつも使っているフードデリバリーアプリ" }),
          this.field("構造化する機能（1つに絞る）", d.app, "feature", { rows: 1, hint: "「〜する」の形で。いちばん大事な機能を1つ選ぶと、L5まで下りられます。", ph: "例：料理を注文する" }),
        ];
      }
      case "l0": return [
        this.field("誰の", d.l0, "who", { ph: "例：仕事帰りで料理する元気がない一人暮らしの人" }),
        this.field("どんな困りごとを", d.l0, "pain", { ph: "例：電話注文は面倒で、店が開いているか分からない" }),
        this.field("どうなれば成功か（数字か具体例で）", d.l0, "success", { ph: "例：3分以内に注文が終わり、到着時刻が分かる" }),
        this.field("やらないこと（今回は対象外）", d.l0, "notdo", { ph: "例：店側の在庫管理、配達員の給与計算" }),
      ];
      case "l1": {
        const lanes = () => d.l1.lanes.filter((x) => x.trim());
        const preview = h("div");
        const paintPreview = () => {
          const ls = lanes();
          if (!ls.length) { preview.replaceChildren(h("p", { class: "small muted" }, "レーンを書くと、ここにスイムレーン図が出ます。")); return; }
          const steps = d.l1.steps.filter((s) => s.text?.trim());
          preview.replaceChildren(h("div", { class: "scroll-x" }, h("div", { class: "swim", style: { minWidth: Math.max(420, steps.length * 120 + 110) + "px" } },
            ...ls.map((ln) => h("div", { class: "lanerow" }, h("div", { class: "lname" }, ln),
              h("div", { class: "lcells", style: { gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(110px, 1fr))` } },
                ...steps.map((s, i) => s.lane === ln ? h("div", { class: "note c" + (ls.indexOf(ln) % 6), style: { gridColumn: i + 1 } }, `${i + 1}. ${s.text}`) : null)))))));
        };
        stepListen("grad-change", paintPreview);
        paintPreview();
        return [
          this.suggest("候補：", p?.lanes, (w) => { if (!d.l1.lanes.includes(w)) { const i = d.l1.lanes.findIndex((x) => !x.trim()); if (i >= 0) d.l1.lanes[i] = w; else d.l1.lanes.push(w); this.persist(); rerender(); } }),
          this.list("レーン（登場する人・役割・システム）", d.l1.lanes, { min: 3, ph: "例：注文する人", numbered: false }),
          h("div", { class: "fld" }, h("label", null, "流れ（上から順に。「誰が」を選んで「動詞＋目的語」で）"),
            this.rows(d.l1.steps, [{ key: "lane", label: "誰が", options: lanes, w: "150px" }, { key: "text", label: "何をする", ph: "例：店を選ぶ" }], { add: () => ({ lane: "", text: "" }), min: 5 })),
          h("div", { class: "fld" }, h("label", null, "スイムレーン図（自動で描かれます）"), preview),
          this.list("例外（普段の流れから外れること）", d.l1.exc, { min: 2, ph: "例：注文したあとに店が受付を止めた", hint: "8つの問い：2回起きたら／途中で止まったら／0件・大量なら／遅かったら／別の人なら／順番が違ったら／外部が壊れたら／時間が経ったら" }),
        ];
      }
      case "l2": return [
        this.field("ユースケース名（動詞で終わる）", d.l2, "name", { rows: 1, ph: p ? "例：" + p.feature : "例：料理を注文する" }),
        this.field("アクター", d.l2, "actor", { rows: 1, ph: "例：ログイン済みの利用者" }),
        this.field("事前条件", d.l2, "pre", { rows: 1, ph: "例：カートに1品以上ある" }),
        this.list("基本フロー（1行＝1動作。主語を書く）", d.l2.basic, { min: 4, ph: "例：利用者がカートを開く" }),
        this.list("代替フロー（別のやり方でも成功する）", d.l2.alt, { min: 1, ph: "例：2a. クーポンを使って注文する → 基本フロー3へ" }),
        this.list("例外フロー（失敗・中断。最後に戻り先を書く）", d.l2.exc, { min: 2, ph: "例：4a. 決済に失敗した → 入力を残してエラー表示 → 基本フロー4へ" }),
        this.field("事後条件：成功時（何が成り立っているか。「2件ではない」も）", d.l2, "postOk", { ph: "例：注文が1件だけ作られ、店に届いている（2件ではない）" }),
        this.field("事後条件：失敗時（何が起きていてはいけないか）", d.l2, "postNg", { ph: "例：注文は作られておらず、お金も引き落とされていない。カートは残っている" }),
      ];
      case "l3": {
        const scr = () => d.l3.screens.filter((x) => x.trim());
        return [
          this.suggest("候補：", p?.screens, (w) => { if (!d.l3.screens.includes(w)) { const i = d.l3.screens.findIndex((x) => !x.trim()); if (i >= 0) d.l3.screens[i] = w; else d.l3.screens.push(w); this.persist(); rerender(); } }),
          this.list("画面一覧", d.l3.screens, { min: 4, ph: "例：店一覧", numbered: true }),
          h("div", { class: "fld" }, h("label", null, "遷移表"), rich("div", "方式：<b>push</b>＝積む／<b>replace</b>＝入れ替える／<b>reset</b>＝全部捨てて置き直す", { class: "hint" }),
            this.rows(d.l3.trans, [
              { key: "from", label: "遷移元", options: scr },
              { key: "ev", label: "イベント", ph: "例：注文する" },
              { key: "to", label: "遷移先", options: scr },
              { key: "how", label: "方式", options: ["push", "replace", "reset"], w: "110px" },
            ], { add: () => ({ from: "", ev: "", to: "", how: "" }), min: 4 })),
          this.field("実機で戻るを押して確かめたこと", d.l3, "tried", { rows: 3, ph: "例：注文完了画面で戻ると、カートではなくホームに戻った（reset されていた）" }),
        ];
      }
      case "l4": return [
        this.list("アプリ全体の状態", d.l4.app, { min: 2, ph: "例：ログイン済み／オフライン", numbered: false }),
        this.list("画面の状態（初期・読み込み中・0件・表示中・エラー…）", d.l4.screen, { min: 3, ph: "例：店一覧の読み込み中", numbered: false }),
        this.suggest("操作の状態の候補：", p?.states, (w) => { if (!d.l4.op.includes(w)) { const i = d.l4.op.findIndex((x) => !x.trim()); if (i >= 0) d.l4.op[i] = w; else d.l4.op.push(w); this.persist(); rerender(); } }),
        this.list("操作の状態（この機能の中の状態）", d.l4.op, { min: 4, ph: "例：注文送信中", numbered: false }),
      ];
      case "l4t": {
        const t = d.l4t;
        if (!t.states.some((x) => x.trim()) && d.l4.op.some((x) => x.trim())) t.states = d.l4.op.filter((x) => x.trim()).slice();
        const counter = h("span", { class: "emptycount" });
        const grid = h("div", { class: "scroll-x" });
        const paintGrid = () => {
          const st = t.states.filter((x) => x.trim()), ev = t.events.filter((x) => x.trim());
          const n = this.emptyCells();
          counter.textContent = `空欄 ${n} マス`;
          counter.classList.toggle("zero", n === 0 && st.length > 0 && ev.length > 0);
          if (!st.length || !ev.length) { grid.replaceChildren(h("p", { class: "small muted" }, "状態とイベントを書くと、表ができます。")); return; }
          grid.replaceChildren(h("table", { class: "sx" },
            h("thead", null, h("tr", null, h("th", null, "状態＼イベント"), ...ev.map((e) => h("th", null, e)))),
            h("tbody", null, ...st.map((s) => h("tr", null, h("th", null, s), ...ev.map((e) => {
              const k = s + "|" + e;
              const ta = h("textarea", { class: "cellbtn", rows: 3, "aria-label": `${s} × ${e}`, placeholder: "どうする？" });
              ta.value = t.cells[k] || "";
              ta.classList.toggle("empty", !ta.value.trim());
              ta.oninput = () => { t.cells[k] = ta.value; ta.classList.toggle("empty", !ta.value.trim()); const m = this.emptyCells(); counter.textContent = `空欄 ${m} マス`; counter.classList.toggle("zero", m === 0); this.persist(); this.changed(); };
              const quick = h("div", { class: "row", style: { gap: "4px", padding: "0 6px 6px" } },
                ...["無視する", "要検討"].map((w) => h("button", { class: "chip", type: "button", onclick: () => { ta.value = w; ta.oninput(); } }, w)));
              return h("td", null, ta, quick);
            })))),
          ));
        };
        const listsChanged = () => { this.persist(); paintGrid(); this.changed(); };
        const stList = this.list("状態（行）", t.states, { min: 4, numbered: false, ph: "例：注文送信中" });
        const evList = this.list("イベント（列）", t.events, { min: 5, numbered: false, ph: "例：連打", hint: "ユーザー操作・通信・アプリ全体・時間の4種類から集める" });
        [stList, evList].forEach((el) => el.addEventListener("input", listsChanged));
        [stList, evList].forEach((el) => el.addEventListener("click", (e) => { if (e.target.closest("button")) setTimeout(listsChanged, 0); }));
        paintGrid();
        return [
          h("div", { class: "stackgrid", style: { gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" } }, stList, evList),
          this.suggest("イベントの候補：", p?.events, (w) => { if (!t.events.includes(w)) { const i = t.events.findIndex((x) => !x.trim()); if (i >= 0) t.events[i] = w; else t.events.push(w); this.persist(); rerender(); } }),
          h("div", { class: "row small" }, counter, h("span", { class: "muted" }, "全マスに「どうなるか」を書く。「無視する」も立派な仕様。")),
          grid,
        ];
      }
      case "l5": return [
        rich("div", "この機能で、いちばん「二重に起きると困る」通信を1つ選び、矢印を上から順に書きます。各矢印に「ここで切れたら？」を決めます。", { class: "small muted" }),
        this.rows(d.l5.arrows, [
          { key: "from", label: "送る側", ph: "例：アプリ" },
          { key: "to", label: "受ける側", ph: "例：サーバー" },
          { key: "msg", label: "何を", ph: "例：注文する（request_id）" },
          { key: "cut", label: "ここで切れたら", options: ["再送してよい", "冪等キーが必要", "再送しない", "問い合わせて確認"], w: "150px" },
        ], { add: () => ({ from: "", to: "", msg: "", cut: "" }), min: 4 }),
        this.field("冪等キー（request_id）をどう使うか", d.l5, "key", { rows: 3, ph: "例：注文ボタンを押したときに1つ発行。再試行では同じIDを使う。サーバーは(利用者, ID)で1回だけ処理し、2回目は1回目の結果を返す" }),
      ];
      case "prio": return [
        this.rows(d.prio.items, [
          { key: "text", label: "状態＋イベント（対応が必要なこと）", ph: "例：返る途中で切れて再送 → 二重注文" },
          { key: "tier", label: "Tier", options: [{ value: "0", label: "Tier0 必ずやる" }, { value: "1", label: "Tier1 簡単にやる" }, { value: "2", label: "Tier2 記録だけ" }], w: "150px" },
          { key: "why", label: "理由", ph: "例：お金に関わり、補正が必要" },
        ], { add: () => ({ text: "", tier: "", why: "" }), min: 4 }),
        this.field("既知の挙動（Tier2 として記録するもの）", d.prio, "known", { rows: 3, ph: "例：K-01 2台の端末で同時に開くと、片方は再読み込みするまで古い表示のまま／理由：利用が少ない／見直す条件：複数端末利用が5%を超えたら" }),
      ];
      case "final": {
        const md = this.toMarkdown();
        const pre = h("div", { class: "mdpreview", "aria-label": "書き出す内容" }, md);
        const fb = h("div");
        const name = (d.app.name || "アプリ").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
        return [
          h("div", { class: "row" },
            h("button", { class: "btn primary", type: "button", onclick: () => saveFile(`構造化フロー_${name}.md`, this.toMarkdown(), "text/markdown;charset=utf-8") }, "Markdownで保存"),
            h("button", { class: "btn", type: "button", onclick: () => copyText(this.toMarkdown(), fb) }, "全文をコピー"),
          ),
          fb,
          pre,
          this.field("振り返り：最初の自分と比べて、何ができるようになった？次はどのアプリで試したい？", d.final, "reflect", { rows: 4 }),
        ];
      }
    }
    return [];
  },

  /** AI に渡す、そのパートの答案 */
  serialize(part) {
    const md = this.sectionMd(part);
    return md || "（未記入）";
  },

  sectionMd(part) {
    const d = this.d;
    const L = (a) => a.filter((x) => (x || "").trim()).map((x, i) => `${i + 1}. ${x}`).join("\n");
    const B = (a) => a.filter((x) => (x || "").trim()).map((x) => `- ${x}`).join("\n");
    switch (part) {
      case "app": return `- アプリ：${d.app.name}\n- 構造化する機能：${d.app.feature}`;
      case "l0": return `- 誰の：${d.l0.who}\n- 困りごと：${d.l0.pain}\n- 成功の目印：${d.l0.success}\n- やらないこと：${d.l0.notdo}`;
      case "l1": return `レーン：${d.l1.lanes.filter((x) => x.trim()).join("／")}\n\n流れ：\n${d.l1.steps.filter((s) => s.text?.trim()).map((s, i) => `${i + 1}. [${s.lane || "?"}] ${s.text}`).join("\n")}\n\n例外：\n${B(d.l1.exc)}`;
      case "l2": return `名前：${d.l2.name}\nアクター：${d.l2.actor}\n事前条件：${d.l2.pre}\n\n基本フロー：\n${L(d.l2.basic)}\n\n代替フロー：\n${B(d.l2.alt)}\n\n例外フロー：\n${B(d.l2.exc)}\n\n事後条件（成功時）：${d.l2.postOk}\n事後条件（失敗時）：${d.l2.postNg}`;
      case "l3": return `画面：${d.l3.screens.filter((x) => x.trim()).join("／")}\n\n| 遷移元 | イベント | 遷移先 | 方式 |\n| --- | --- | --- | --- |\n${d.l3.trans.filter((t) => t.from || t.to).map((t) => `| ${t.from} | ${t.ev} | ${t.to} | ${t.how} |`).join("\n")}\n\n実機で確かめたこと：${d.l3.tried}`;
      case "l4": return `アプリ全体：${d.l4.app.filter((x) => x.trim()).join("／")}\n画面：${d.l4.screen.filter((x) => x.trim()).join("／")}\n操作：${d.l4.op.filter((x) => x.trim()).join("／")}`;
      case "l4t": {
        const t = d.l4t;
        const st = t.states.filter((x) => x.trim()), ev = t.events.filter((x) => x.trim());
        if (!st.length || !ev.length) return "";
        const esc = (x) => (x || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
        return `| 状態＼イベント | ${ev.map(esc).join(" | ")} |\n| --- |${" --- |".repeat(ev.length)}\n${st.map((s) => `| ${esc(s)} | ${ev.map((e) => esc(t.cells[s + "|" + e]) || "（空欄）").join(" | ")} |`).join("\n")}\n\n空欄：${this.emptyCells()} マス`;
      }
      case "l5": return `${d.l5.arrows.filter((a) => a.msg || a.from).map((a, i) => `${i + 1}. ${a.from} → ${a.to}：${a.msg}（切れたら：${a.cut || "未定"}）`).join("\n")}\n\n冪等キー：${d.l5.key}`;
      case "prio": return `| 対応が必要なこと | Tier | 理由 |\n| --- | --- | --- |\n${d.prio.items.filter((x) => x.text?.trim()).map((x) => `| ${x.text} | ${x.tier === "" ? "未定" : "Tier" + x.tier} | ${x.why} |`).join("\n")}\n\n既知の挙動：${d.prio.known}`;
      case "final": return d.final.reflect;
    }
    return "";
  },

  toMarkdown() {
    const d = this.d;
    const sec = (title, part) => `## ${title}\n\n${this.sectionMd(part)}\n`;
    return [
      `# 構造化フロー：${d.app.name || "（アプリ名）"}「${d.app.feature || "（機能）"}」`,
      "",
      `構造化ドリル帳の卒業制作。作成日：${new Date().toLocaleDateString("ja-JP")}`,
      "",
      sec("L0 目的", "l0"),
      sec("L1 流れ（スイムレーン）", "l1"),
      sec("L2 ユースケース", "l2"),
      sec("L3 画面遷移", "l3"),
      sec("L4 状態の定義", "l4"),
      sec("L4 状態×イベント表", "l4t"),
      sec("L5 シーケンス（通信の失敗）", "l5"),
      sec("優先度", "prio"),
      sec("振り返り", "final"),
    ].join("\n");
  },

  /* ----- 卒業制作の1ステップ ----- */
  step(s, ctx) {
    const part = s.part;
    const ex = GRAD_EXAMPLE[part];
    const exBox = ex ? h("details", { class: "example" }, h("summary", null, h("b", null, "見本：ひだまりベーカリーの場合（開いて参考にする）")), rich("pre", ex)) : null;
    const status = h("p", { class: "small" });
    const checks = (s.checks || []).map((c, i) => {
      const id = `gk-${part}-${i}`;
      const box = h("input", { type: "checkbox", id });
      box.checked = !!Store.state.grad["ck_" + part]?.[i];
      box.onchange = () => {
        Store.state.grad["ck_" + part] ??= [];
        Store.state.grad["ck_" + part][i] = box.checked;
        Store.save();
        evaluate();
      };
      return { box, el: h("label", { for: id }, box, h("span", { html: c })) };
    });
    let finished = false;
    const evaluate = () => {
      const okMin = this.minOk(part);
      const okChecks = checks.every((c) => c.box.checked);
      status.innerHTML = okMin ? (okChecks ? "<b style='color:var(--ok)'>このパートは完成です。</b>" : "あとは下のチェックを全部つければ完成です。") : "まだ足りない：" + this.missingText(part);
      if (!finished && okMin && okChecks) { finished = true; ctx.done({ xp: 40 }); }
    };
    stepListen("grad-change", evaluate);
    const pr = this.preset();
    const tip = pr?.tips?.[part] ? rich("div", "<b>" + pr.name + "のヒント：</b>" + pr.tips[part], { class: "box pen small" }) : null;
    setTimeout(evaluate, 0);
    return {
      el: [
        s.intro ? rich("div", s.intro, { class: "body" }) : null,
        tip,
        exBox,
        this.editor(part),
        status,
        checks.length ? h("div", { class: "stack", style: { gap: "8px" } }, h("p", { class: "small", style: { fontWeight: 700 } }, "仕上げのチェック"), h("div", { class: "checks" }, checks.map((c) => c.el))) : null,
        coachBox(() => ({ task: `卒業制作「${this.d.app.name || "アプリ"}」の「${this.d.app.feature || "機能"}」について、${s.title || part}を書く`, rubric: s.rubric || [], answer: this.serialize(part), example: (ex || "").replace(/<[^>]+>/g, "") })),
      ],
      mode: "self",
      solve: () => { Grad.fillDemo(part); checks.forEach((c) => (c.box.checked = true)); Store.state.grad["ck_" + part] = checks.map(() => true); if (!finished) { finished = true; ctx.done({ xp: 40 }); } },
    };
  },

  /** テスト用：パートを最低限埋める */
  fillDemo(part) {
    const d = this.d;
    const fillArr = (a, xs) => { a.length = 0; a.push(...xs); };
    if (part === "app") Object.assign(d.app, { preset: "food", name: "テスト用アプリ", feature: "料理を注文する" });
    if (part === "l0") Object.assign(d.l0, { who: "a", pain: "b", success: "c" });
    if (part === "l1") { fillArr(d.l1.lanes, ["客", "店"]); fillArr(d.l1.steps, [1, 2, 3, 4].map((i) => ({ lane: "客", text: "step" + i }))); fillArr(d.l1.exc, ["e1", "e2"]); }
    if (part === "l2") Object.assign(d.l2, { name: "n", basic: ["a", "b", "c"], exc: ["x", "y"], postOk: "o", postNg: "g" });
    if (part === "l3") { fillArr(d.l3.screens, ["A", "B", "C"]); fillArr(d.l3.trans, [1, 2, 3, 4].map(() => ({ from: "A", ev: "e", to: "B", how: "push" }))); }
    if (part === "l4") Object.assign(d.l4, { app: ["a", "b"], screen: ["c", "d"], op: ["e", "f", "g"] });
    if (part === "l4t") { d.l4t.states = ["s1", "s2", "s3"]; d.l4t.events = ["e1", "e2", "e3", "e4"]; d.l4t.states.forEach((s) => d.l4t.events.forEach((e) => (d.l4t.cells[s + "|" + e] = "無視する"))); }
    if (part === "l5") { fillArr(d.l5.arrows, [1, 2, 3].map(() => ({ from: "アプリ", to: "サーバー", msg: "m", cut: "冪等キーが必要" }))); d.l5.key = "k"; }
    if (part === "prio") { fillArr(d.prio.items, [{ text: "a", tier: "0", why: "" }, { text: "b", tier: "1", why: "" }, { text: "c", tier: "2", why: "" }]); d.prio.known = "k"; }
    if (part === "final") d.final.reflect = "最初は何から始めればいいか分からなかったが、L0から順に下りられるようになった。";
    Store.save();
  },
};
