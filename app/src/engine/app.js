/* ===== app.js : ゲーム要素・レッスンの進行・画面 ===== */
"use strict";

const LEVELS = [
  [0, "構造化ビギナー"], [150, "付箋見習い"], [400, "フロー描き"], [800, "ユースケース職人"],
  [1300, "状態ハンター"], [1900, "空欄つぶし"], [2600, "ズームの達人"], [3400, "構造化マスター"],
];
const BADGES = {
  first: ["一", "はじめの一歩", "最初のレッスンを終えた"],
  perfect: ["花", "はなまる", "1つのレッスンを全問1回目で正解した"],
  combo10: ["連", "10連続正解", "1回目で10問続けて正解した"],
  interview: ["聞", "聞き上手", "ヒアリングで例外を全部引き出した"],
  nohole: ["表", "空欄つぶし", "状態×イベント表を1回目で全マス正解した"],
  double: ["二", "二重予約キラー", "実験で二重予約を起こし、冪等キーで防いだ"],
  mission3: ["実", "現場派", "実践ミッションを3つやりとげた"],
  ai: ["赤", "赤ペン添削", "AIコーチの添削を受けた"],
  boss5: ["番", "番人たおし", "章末のボスを5体たおした"],
  grad: ["卒", "卒業制作", "既存アプリの構造化フローを書き上げた"],
  growth: ["伸", "のびしろ", "修了テストで診断テストより点が上がった"],
  all: ["皆", "皆勤賞", "すべてのレッスンを終えた"],
};
const PHASES = { zoom: "粒度（ズーム）", biz: "業務理解 L0〜L1", uc: "ユースケース L2", screen: "画面遷移 L3", state: "状態の定義 L4", table: "状態×イベント表", comm: "通信と冪等性 L5", prio: "優先度" };

const allLessons = () => COURSE.chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chapter: c })));
const findLesson = (id) => allLessons().find((l) => l.id === id);

const Game = {
  level(xp = Store.state.xp) {
    let idx = 0;
    LEVELS.forEach(([min], i) => { if (xp >= min) idx = i; });
    const cur = LEVELS[idx][0];
    const next = LEVELS[idx + 1]?.[0] ?? null;
    return { idx, name: LEVELS[idx][1], cur, next, pct: next ? (xp - cur) / (next - cur) : 1 };
  },
  badge(id) {
    if (!id || Store.state.badges.includes(id)) return false;
    Store.state.badges.push(id);
    toast(`バッジ獲得：${BADGES[id][1]}`);
    return true;
  },
  unlocked(lesson) {
    const s = Store.state;
    if (s.settings.free) return true;
    const list = allLessons();
    const i = list.findIndex((l) => l.id === lesson.id);
    return i <= 0 || !!s.done[list[i - 1].id];
  },
  nextLesson() {
    return allLessons().find((l) => !Store.state.done[l.id] && this.unlocked(l)) || null;
  },
  chapterDone(ch) { return ch.lessons.every((l) => Store.state.done[l.id]); },
  remainingMin() { return allLessons().filter((l) => !Store.state.done[l.id]).reduce((a, l) => a + (l.min || 0), 0); },
  totalMin() { return allLessons().reduce((a, l) => a + (l.min || 0), 0); },
};

/* ================= レッスンの進行 ================= */
const Player = {
  p: null,

  open(id) {
    const lesson = findLesson(id);
    if (!lesson) return Router.go("map");
    if (!Game.unlocked(lesson)) { toast("前のレッスンを終えると開きます"); return Router.go("map"); }
    const review = !!Store.state.done[id];
    const pos = review ? 0 : Math.min(Store.state.pos[id] || 0, lesson.steps.length - 1);
    this.p = { lesson, i: pos, results: [], gained: 0, review, testAnswers: Store.state.answers["test:" + id] || {}, ctl: null };
    this.render();
  },

  render() {
    const p = this.p;
    const { lesson } = p;
    const step = lesson.steps[p.i];
    p.ctl?.abort();
    p.ctl = new AbortController();
    p.tries = 0;
    p.stepDone = false;
    p.checked = false;

    const key = lesson.id + ":" + p.i;
    STEP_SIGNAL = p.ctl.signal;
    let r = null;
    const ctx = {
      key,
      signal: p.ctl.signal,
      boss: !!lesson.boss,
      onChange: () => this.updateBar(),
      done: (res = {}) => {
        if (this.p !== p || p.cur !== r) return;
        p.stepDone = true;
        this.award(res.xp || 0);
        if (res.badge) Game.badge(res.badge);
        if (res.mission) { Store.state.missions += 1; if (Store.state.missions >= 3) Game.badge("mission3"); }
        Store.save();
        this.updateBar();
      },
    };
    r = (Steps[step.t] || Steps.learn)(step, ctx);
    p.cur = r;

    const pbar = h("div", { class: "pbar", "aria-hidden": "true" }, lesson.steps.map((_, i) => h("i", { class: i < p.i ? "done" : i === p.i ? "cur" : "" })));
    const combo = h("span", { class: "combo", id: "combo" }, Store.state.combo >= 3 ? `${Store.state.combo}連続正解中` : "");
    const head = h("div", { class: "phead" },
      h("div", { class: "top" },
        h("button", { class: "close", type: "button", "aria-label": "マップに戻る", onclick: () => Router.go("map") }, "×"),
        h("div", { class: "ttl" },
          h("span", { class: "eyebrow" }, `第${lesson.chapter.no}章 ${lesson.chapter.title}${lesson.boss ? "　ボス" : ""}${p.review ? "　復習" : ""}`),
          h("b", null, lesson.title)),
        combo),
      pbar,
      h("div", { class: "tiny muted" }, `${p.i + 1} / ${lesson.steps.length}`),
    );
    const card = h("section", { class: "sheet card" + (lesson.boss ? " boss" : "") + (r.cls ? " " + r.cls : "") }, r.el);
    const bar = h("div", { class: "actionbar", id: "actionbar" }, h("div", { class: "in" }));
    View.mount(h("div", { class: "player" }, head, card), bar);
    window.scrollTo({ top: 0 });
    this.updateBar();
  },

  award(xp) {
    if (this.p.review) return;
    this.p.gained += xp;
    Store.state.xp += xp;
    View.topbar();
  },

  updateBar(fb) {
    const p = this.p;
    if (!p) return;
    const r = p.cur;
    const step = p.lesson.steps[p.i];
    const bar = $("#actionbar");
    if (!bar) return;
    const inner = bar.querySelector(".in");
    bar.classList.remove("ok", "ng");
    const btns = h("div", { class: "btnrow" });
    const nextBtn = (label = "次へ") => h("button", { class: "btn primary", type: "button", onclick: () => this.next() }, label);

    if (fb) {
      bar.classList.add(fb.ok ? "ok" : "ng");
      const lines = (fb.lines || []).map((l) => rich("li", l));
      const explain = fb.ok || fb.revealed ? step.explain : null;
      inner.replaceChildren(
        h("div", { class: "fb" },
          fb.ok ? circleMark() : checkMark(),
          h("div", { class: "msg" },
            h("div", { class: "head" }, fb.revealed ? "答えを確認しよう" : fb.ok ? (fb.first ? pick(["正解！", "その通り！", "いいね、型どおり！", "完璧！"]) : "正解！（2回目以降）") : pick(["おしい！", "あと一歩！", "もう一度見てみよう"])),
            lines.length ? h("ul", null, lines) : null,
            explain ? rich("div", explain, { class: "small" }) : null,
          )),
        btns,
      );
      if (fb.ok || fb.revealed) btns.append(nextBtn());
      else {
        if (p.tries >= 2) btns.append(h("button", { class: "btn ghost", type: "button", onclick: () => { r.reveal?.(); this.updateBar({ ok: false, revealed: true, lines: [] }); } }, "答えを見る"));
        btns.append(h("button", { class: "btn", type: "button", onclick: () => this.updateBar() }, "直してもう一度"));
      }
      btns.querySelector(".btn.primary, .btn:last-child")?.focus({ preventScroll: true });
      return;
    }

    if (r.mode === "read") btns.append(nextBtn());
    else if (r.mode === "check") {
      const isTest = step.t === "tq";
      const b = h("button", { class: "btn primary", type: "button", disabled: !r.ready() }, isTest ? "回答する" : "確認する");
      b.onclick = () => (isTest ? this.answerTest() : this.check());
      btns.append(b);
    } else {
      const b = nextBtn(p.stepDone ? "次へ" : "完了すると次へ進めます");
      b.disabled = !p.stepDone;
      if (step.t === "write" && step.mission && !p.stepDone) {
        btns.append(h("button", { class: "btn ghost", type: "button", onclick: () => this.next() }, "あとでやる（XPなし）"));
      }
      btns.append(b);
    }
    inner.replaceChildren(btns);
  },

  check() {
    const p = this.p;
    const res = p.cur.check();
    const first = p.tries === 0;
    p.tries++;
    if (res.ok) {
      const xp = first ? (p.lesson.boss ? 15 : 10) : 4;
      p.results[p.i] = first;
      this.award(xp);
      if (first) {
        Store.state.combo += 1;
        Store.state.bestCombo = Math.max(Store.state.bestCombo, Store.state.combo);
        if (Store.state.combo >= 10) Game.badge("combo10");
        if (p.lesson.steps[p.i].t === "grid") Game.badge("nohole");
      }
      Store.save();
      const c = $("#combo");
      if (c) c.textContent = Store.state.combo >= 3 ? `${Store.state.combo}連続正解中` : "";
    } else if (first) {
      p.results[p.i] = false;
      Store.state.combo = 0;
      Store.save();
    }
    this.updateBar({ ok: res.ok, first, lines: res.lines });
  },

  answerTest() {
    const p = this.p;
    p.testAnswers[p.i] = p.cur.selected();
    Store.state.answers["test:" + p.lesson.id] = p.testAnswers;
    Store.save();
    this.next();
  },

  next() {
    const p = this.p;
    if (p.i < p.lesson.steps.length - 1) {
      p.i++;
      if (!p.review) { Store.state.pos[p.lesson.id] = p.i; Store.save(); }
      this.render();
    } else this.finish();
  },

  finish() {
    const p = this.p;
    const { lesson } = p;
    const s = Store.state;
    const checks = lesson.steps.map((st, i) => (["choice", "multi", "sort", "order", "spot", "grid", "stack", "score"].includes(st.t) ? p.results[i] : undefined)).filter((x) => x !== undefined);
    const firstOk = checks.filter(Boolean).length;
    const stars = lesson.test ? 3 : checks.length === 0 ? 3 : firstOk / checks.length >= 0.9 ? 3 : firstOk / checks.length >= 0.6 ? 2 : 1;
    const wasDone = !!s.done[lesson.id];
    const prev = s.done[lesson.id];
    s.done[lesson.id] = { stars: Math.max(stars, prev?.stars || 0), at: Date.now(), firstOk, total: checks.length };
    delete s.pos[lesson.id];

    let testResult = null;
    if (lesson.test) testResult = this.scoreTest(lesson);

    const newCards = (lesson.cards || []).filter((id) => !s.cards.includes(id));
    s.cards.push(...newCards);
    if (!wasDone) {
      Game.badge("first");
      if (stars === 3 && checks.length >= 3) Game.badge("perfect");
      if (lesson.boss && allLessons().filter((l) => l.boss && s.done[l.id]).length >= 5) Game.badge("boss5");
      if (lesson.id === "c9-9") Game.badge("grad");
      if (allLessons().every((l) => s.done[l.id])) Game.badge("all");
    }
    Store.save();
    View.topbar();
    View.result({ lesson, stars, gained: p.gained, newCards, review: p.review, testResult, chapterClear: !wasDone && Game.chapterDone(lesson.chapter) });
    this.p = null;
  },

  scoreTest(lesson) {
    const ans = this.p.testAnswers;
    const by = {};
    let score = 0;
    lesson.steps.forEach((st, i) => {
      if (st.t !== "tq") return;
      const ok = ans[i] != null && st.opts[ans[i]]?.ok;
      by[st.phase] ??= { ok: 0, n: 0 };
      by[st.phase].n++;
      if (ok) { by[st.phase].ok++; score++; }
    });
    const total = lesson.steps.filter((st) => st.t === "tq").length;
    const result = { score, total, by, at: Date.now() };
    Store.state.tests[lesson.test] = result;
    const pre = Store.state.tests.pre;
    if (lesson.test === "post" && pre && score > pre.score) Game.badge("growth");
    return result;
  },
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ================= 画面 ================= */
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="7" fill="var(--ink)"/><path d="M6 9h7v5h6v5h6v5" fill="none" stroke="var(--paper)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25" cy="24" r="2.2" fill="var(--red)"/></svg>`;

const View = {
  mount(...nodes) {
    $("#main").replaceChildren(...nodes.filter((n) => n && !n.classList?.contains("actionbar")));
    $("#actionbar")?.remove();
    const bar = nodes.find((n) => n?.classList?.contains("actionbar"));
    if (bar) document.body.append(bar);
    this.topbar();
  },

  topbar() {
    const lv = Game.level();
    const route = Router.current();
    const nav = [["map", "マップ"], ["cards", "型カード"], ["grad", "卒業制作"], ["record", "記録"], ["prefs", "設定"]];
    $("#topbar").replaceChildren(h("div", { class: "wrap" },
      h("button", { class: "brand", type: "button", onclick: () => Router.go("map"), "aria-label": "構造化ドリル帳 マップへ" }, h("span", { html: LOGO }), h("b", null, "構造化ドリル帳")),
      h("div", { class: "xp", title: "経験値" },
        h("span", { class: "lv" }, `Lv.${lv.idx + 1} ${lv.name}`),
        h("span", { class: "bar" }, h("i", { style: { width: Math.round(lv.pct * 100) + "%" } })),
        h("span", { class: "num" }, `${Store.state.xp} XP`)),
      h("nav", { class: "nav", "aria-label": "メニュー" }, nav.map(([id, label]) => h("button", { type: "button", "aria-current": route === id ? "page" : null, onclick: () => Router.go(id) }, label))),
    ));
  },

  /* ----- マップ（ホーム） ----- */
  map() {
    const s = Store.state;
    const list = allLessons();
    const doneN = list.filter((l) => s.done[l.id]).length;
    const pct = Math.round((doneN / list.length) * 100);
    const next = Game.nextLesson();
    const ring = `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="32" fill="none" stroke="var(--rule)" stroke-width="8"/><circle cx="40" cy="40" r="32" fill="none" stroke="var(--red)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 32).toFixed(1)}" stroke-dashoffset="${((1 - doneN / list.length) * 2 * Math.PI * 32).toFixed(1)}" transform="rotate(-90 40 40)"/></svg>`;
    const gradParts = COURSE.chapters.find((c) => c.id === "c9")?.lessons.filter((l) => l.gradTag) || [];

    const goal = h("section", { class: "sheet goal" },
      h("div", { class: "l" },
        h("span", { class: "eyebrow" }, "このドリル帳のゴール"),
        h("h1", null, "いつも使っているアプリを、L0からL5まで構造化できるようになる"),
        rich("p", "ベーカリーの予約アプリを題材に、<mark>解像度を1段ずつ上げ、各段で「状態×イベント」の全マスを埋める</mark>型を身につけます。最後の卒業制作では、あなたが選んだ既存アプリの構造化フローを1本書き上げます。", { class: "lead" }),
        h("div", { class: "ring" }, h("span", { html: ring }), h("div", null, h("div", { class: "pct" }, pct + "%"), h("div", { class: "small muted" }, `${doneN} / ${list.length} レッスン　残り約${fmtMin(Game.remainingMin() * 60000)}（全体 約${fmtMin(Game.totalMin() * 60000)}）`))),
      ),
      h("div", { class: "r" },
        h("span", { class: "eyebrow" }, "卒業制作で書き上げるもの"),
        h("ul", { class: "outline" }, gradParts.map((l) => h("li", { class: s.done[l.id] ? "done" : "" }, h("span", { class: "lvtag" }, l.gradTag), h("span", null, l.title), s.done[l.id] ? h("span", { class: "chip red" }, "済") : h("span", { class: "tiny muted" }, l.uses === "0" ? "最初に選ぶ" : l.uses === "9" ? "最後に仕上げ" : "第" + l.uses + "章で練習")))),
      ),
    );

    const nextBox = next ? h("section", { class: "sheet next" },
      h("div", { class: "t" }, h("span", { class: "eyebrow" }, doneN ? "つづきから" : "まずはここから"), h("b", null, `第${next.chapter.no}章　${next.title}`), h("span", { class: "small muted" }, `約${next.min}分　${next.chapter.title}`)),
      h("button", { class: "btn primary", type: "button", onclick: () => Router.go("l-" + next.id) }, s.pos[next.id] ? "続きから始める" : "始める"),
    ) : h("section", { class: "sheet next" }, h("div", { class: "t" }, h("b", null, "全レッスン修了！"), h("span", { class: "small muted" }, "記録ページで修了証と成長を確認しよう。")), h("button", { class: "btn primary", type: "button", onclick: () => Router.go("record") }, "記録を見る"));

    const stairs = h("section", { class: "stairs", "aria-label": "ズームの階段（章の一覧）" }, h("h2", null, "ズームの階段"),
      rich("p", "上から順に、粗い地図から細かい地図へ下りていきます。章が進むほど一段深く。", { class: "small muted" }),
      ...COURSE.chapters.map((ch, ci) => {
        const open = ch.lessons.some((l) => Game.unlocked(l));
        const clear = Game.chapterDone(ch);
        return h("div", { class: "sheet chap" + (open ? "" : " locked"), style: { "--indent": Math.min(ci, 6) * 22 + "px" } },
          h("div", { class: "num", "aria-hidden": "true" }, ch.no),
          h("div", { class: "meta" },
            h("div", { class: "row", style: { gap: "8px" } }, h("span", { class: "lvtag" }, ch.level), h("h3", null, ch.title)),
            h("div", { class: "sub" }, ch.sub),
            h("div", { class: "dots" }, ch.lessons.map((l, li) => {
              const st = s.done[l.id];
              const can = Game.unlocked(l);
              return h("button", { class: "dot" + (st ? " done" : "") + (next && next.id === l.id ? " cur" : "") + (l.boss ? " boss" : ""), type: "button", disabled: !can, title: `${l.title}（約${l.min}分）${st ? " ★" + st.stars : ""}`, "aria-label": `${l.title}${st ? " 完了" : can ? "" : " ロック中"}`, onclick: () => Router.go("l-" + l.id) }, l.boss ? "番" : l.test ? "試" : li + 1);
            })),
          ),
          h("div", { class: "stampbox" }, clear ? h("div", { class: "stamp-mini" }, "済") : h("div", { class: "stamp-empty" })),
        );
      }));

    this.mount(h("div", { class: "home" }, goal, nextBox, stairs));
  },

  /* ----- レッスン結果 ----- */
  result({ lesson, stars, gained, newCards, review, testResult, chapterClear }) {
    const parts = [];
    if (lesson.test) {
      parts.push(h("h2", null, lesson.test === "pre" ? "診断テストの結果" : "修了テストの結果"));
      parts.push(h("p", { class: "q" }, `${testResult.score} / ${testResult.total} 問正解`));
      parts.push(this.testBars(lesson.test === "post" ? Store.state.tests.pre : null, testResult));
      parts.push(rich("p", lesson.test === "pre" ? "今はできなくて大丈夫。最後に同じテストをもう一度受けて、どれだけ伸びたかを比べます。<br>特に低かった分野の章を、意識して進めてみよう。" : "灰色が診断テスト（最初）、赤が修了テスト（いま）です。", { class: "small muted rest" }));
    } else {
      parts.push(hanamaru(170, stars));
      parts.push(h("h2", null, stars === 3 ? "はなまる！" : stars === 2 ? "よくできました" : "クリア！"));
      parts.push(h("div", { class: "stars", "aria-label": `星${stars}つ` }, ...[1, 2, 3].map((n) => h("span", { class: n <= stars ? "" : "off" }, "★"))));
    }
    parts.push(h("div", { class: "gain" },
      review ? h("span", { class: "chip" }, "復習（XPはつきません）") : h("span", { class: "chip pen" }, `+${gained} XP`),
      Store.state.combo >= 3 ? h("span", { class: "chip red" }, `${Store.state.combo}連続正解中`) : null));
    if (newCards.length) {
      parts.push(h("p", { class: "small", style: { fontWeight: 700 } }, "型カードを手に入れた！"));
      parts.push(h("div", { class: "cardgrid", style: { width: "100%" } }, newCards.map((id) => this.kcard(CARDS.find((c) => c.id === id), true))));
    }
    if (chapterClear) {
      parts.push(h("div", { class: "box red rest" },
        h("h4", null, `第${lesson.chapter.no}章「${lesson.chapter.title}」クリア！スタンプを押しました`),
        rich("p", lesson.chapter.wrap || "", { class: "small" }),
        h("p", { class: "small muted" }, "ここで5分休憩するのがおすすめ。立ち上がって水を飲んで、型カードを1枚思い出してから次へ。"),
      ));
    }
    const next = Game.nextLesson();
    parts.push(h("div", { class: "row", style: { justifyContent: "center" } },
      next ? h("button", { class: "btn primary", type: "button", onclick: () => Router.go("l-" + next.id) }, `次へ：${next.title}`) : null,
      h("button", { class: "btn ghost", type: "button", onclick: () => Router.go("map") }, "マップへ"),
    ));
    this.mount(h("div", { class: "player" }, h("section", { class: "sheet result" }, parts)));
  },

  testBars(pre, post) {
    return h("div", { class: "bars", style: { width: "100%", maxWidth: "560px" } }, Object.entries(PHASES).map(([k, label]) => {
      const a = pre?.by?.[k], b = post?.by?.[k];
      const pa = a ? a.ok / a.n : 0, pb = b ? b.ok / b.n : 0;
      return h("div", { class: "barrow" }, h("span", null, label),
        h("span", { class: "tr" }, pre ? h("i", { class: "pre", style: { width: pa * 100 + "%" } }) : null, h("i", { class: pre ? "post" : "pre", style: { width: pb * 100 + "%", ...(pre ? {} : { opacity: 0.9, background: "var(--red)" }) } })),
        h("span", { class: "v" }, pre ? `${a?.ok ?? 0}→${b?.ok ?? 0}/${b?.n ?? 0}` : `${b?.ok ?? 0}/${b?.n ?? 0}`));
    }));
  },

  kcard(c, fresh) {
    if (!c) return null;
    return h("div", { class: "kcard" + (fresh ? " flip" : "") }, h("span", { class: "kno" }, `型 No.${c.no}　${c.tag}`), h("h3", null, c.title), rich("p", c.text));
  },

  /* ----- 型カード ----- */
  cards() {
    const got = Store.state.cards;
    this.mount(h("div", { class: "stack" },
      h("h2", { class: "section-h" }, "型カード"),
      rich("p", `集めたカード <b>${got.length} / ${CARDS.length}</b>。卒業制作で迷ったら、ここを見返そう。`, { class: "muted" }),
      h("div", { class: "cardgrid" }, CARDS.map((c) => got.includes(c.id) ? this.kcard(c) : h("div", { class: "kcard locked" }, h("span", { class: "kno" }, `型 No.${c.no}`), h("h3", null, "？？？"), h("p", null, `第${c.ch}章で手に入る`)))),
    ));
  },

  /* ----- 記録 ----- */
  record() {
    const s = Store.state;
    const list = allLessons();
    const doneN = list.filter((l) => s.done[l.id]).length;
    const stats = h("div", { class: "stats" },
      ...[[s.xp + " XP", `Lv.${Game.level().idx + 1} ${Game.level().name}`], [`${doneN} / ${list.length}`, "終えたレッスン"], [fmtMin(s.timeMs), "学習した時間"], [`${s.cards.length} / ${CARDS.length}`, "型カード"], [String(s.bestCombo), "最高連続正解"], [String(s.missions), "実践ミッション"]]
        .map(([b, t]) => h("div", { class: "sheet stat" }, h("b", null, b), h("span", null, t))));
    const tests = h("section", { class: "sheet card" }, h("h2", null, "成長の記録"),
      s.tests.pre ? this.testBars(s.tests.post ? s.tests.pre : null, s.tests.post || s.tests.pre) : h("p", { class: "muted" }, "第0章の診断テストを受けると、ここに分野ごとの点数が出ます。"),
      s.tests.pre && !s.tests.post ? h("p", { class: "small muted" }, "最後の修了テストを受けると、最初との比較が出ます。") : null,
      s.tests.post ? h("p", { class: "small" }, `診断テスト ${s.tests.pre?.score ?? "-"} 点 → 修了テスト ${s.tests.post.score} 点（${s.tests.post.total}点満点）`) : null);
    const stampcard = h("section", { class: "sheet card" }, h("h2", null, "スタンプカード"),
      h("div", { class: "stampcard" }, COURSE.chapters.map((ch) => h("div", { class: "stampcell" }, Game.chapterDone(ch) ? h("div", { class: "stamp-mini" }, "済") : h("div", { class: "stamp-empty" }), h("span", null, `第${ch.no}章`), h("span", { class: "tiny" }, ch.title)))));
    const badges = h("section", { class: "sheet card" }, h("h2", null, "バッジ"),
      h("div", { class: "badges" }, Object.entries(BADGES).map(([id, [ic, name, desc]]) => h("div", { class: "sheet bdg" + (s.badges.includes(id) ? "" : " off") }, h("span", { class: "ic" }, ic), h("div", null, h("b", null, name), h("span", null, desc))))));
    const allDone = list.every((l) => s.done[l.id]);
    const cert = allDone ? h("section", { class: "sheet cert" },
      h("span", { class: "eyebrow" }, "修了証"),
      h("h2", null, "構造化ドリル帳 修了"),
      rich("p", `あなたは、解像度を1段ずつ上げ、各段で「状態×イベント」の全マスを埋める型を身につけ、<br>「${(s.grad.app?.name || "既存アプリ").replace(/[<>&]/g, "")}」の構造化フローを書き上げました。`),
      h("p", { class: "small muted" }, new Date(Math.max(...Object.values(s.done).map((d) => d.at))).toLocaleDateString("ja-JP")),
    ) : null;
    this.mount(h("div", { class: "stack" }, h("h2", { class: "section-h" }, "記録"), cert, stats, tests, stampcard, badges, this.dataBox()));
  },

  dataBox() {
    const host = h("div");
    const file = h("input", { type: "file", accept: ".json,application/json", id: "import-file", hidden: true });
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      try { Store.importJSON(await f.text()); toast("記録を読み込みました"); Router.render(); } catch { toast("読み込めませんでした。書き出したファイルか確認してください"); }
    };
    return h("section", { class: "sheet card" }, h("h2", null, "記録の保存と移動"),
      rich("p", Store.mode === "account" ? "記録は <b>あなたの Claude アカウント</b> に保存されています。別の端末で開いても続きから学べます。" : "記録は <b>このブラウザ</b> に保存されています。別の端末で続けたいときや、念のための控えとして、書き出しておけます。", { class: "small" }),
      h("div", { class: "row" },
        h("button", { class: "btn sm", type: "button", onclick: () => saveFile("構造化ドリル帳_記録.json", JSON.stringify({ app: "kouzouka-drill", state: Store.state }, null, 1), "application/json") }, "記録を書き出す"),
        h("button", { class: "btn sm ghost", type: "button", onclick: () => file.click() }, "記録を読み込む"),
        h("button", { class: "btn sm ghost", type: "button", onclick: () => copyText(JSON.stringify({ app: "kouzouka-drill", state: Store.state }), host) }, "記録をコピー"),
      ), file, host);
  },

  /* ----- 卒業制作のまとめ ----- */
  grad() {
    const ch = COURSE.chapters.find((c) => c.id === "c9");
    const s = Store.state;
    const open = Game.unlocked(ch.lessons[0]);
    const rows = ch.lessons.map((l) => h("li", { class: s.done[l.id] ? "done" : "" },
      h("span", { class: "lvtag" }, l.gradTag || "—"),
      h("button", { class: "brand", type: "button", style: { fontWeight: 700, textAlign: "left" }, disabled: !Game.unlocked(l), onclick: () => Router.go("l-" + l.id) }, l.title),
      s.done[l.id] ? h("span", { class: "chip red" }, "済") : Game.unlocked(l) ? h("span", { class: "chip pen" }, "書く") : h("span", { class: "tiny muted" }, "ロック中")));
    this.mount(h("div", { class: "stack" },
      h("h2", { class: "section-h" }, "卒業制作"),
      rich("p", open ? "あなたが選んだ既存アプリの1機能を、L0からL5まで構造化します。上から順に書いていこう。" : "第8章まで終えると始められます。先にどんなものを書くのか見ておこう。", { class: "muted" }),
      h("section", { class: "sheet card" }, h("ul", { class: "outline" }, rows)),
      Grad.minOk("app") ? h("section", { class: "sheet card" }, h("h2", null, "いまの下書き"), h("div", { class: "row" },
        h("button", { class: "btn sm", type: "button", onclick: () => saveFile(`構造化フロー_${(s.grad.app?.name || "アプリ").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40)}.md`, Grad.toMarkdown(), "text/markdown;charset=utf-8") }, "Markdownで保存"),
        h("button", { class: "btn sm ghost", type: "button", onclick: (e) => copyText(Grad.toMarkdown(), e.target.closest("section").querySelector(".fbhost")) }, "全文をコピー")),
        h("div", { class: "fbhost" }), h("div", { class: "mdpreview" }, Grad.toMarkdown())) : null,
    ));
  },

  /* ----- 設定 ----- */
  prefs() {
    const s = Store.state;
    const theme = h("div", { class: "seg3", role: "group", "aria-label": "テーマ" }, [["system", "自動"], ["light", "方眼ノート"], ["dark", "青焼き"]].map(([v, l]) =>
      h("button", { type: "button", "aria-pressed": String(s.settings.theme === v), onclick: () => { s.settings.theme = v; applyTheme(); Store.save(); this.prefs(); } }, l)));
    const free = h("input", { type: "checkbox", id: "free-mode" });
    free.checked = s.settings.free;
    free.onchange = () => { s.settings.free = free.checked; Store.save(); toast(free.checked ? "すべてのレッスンを開きました" : "順番どおりに戻しました"); };
    const confirmHost = h("div");
    const resetBtn = h("button", { class: "btn sm red", type: "button" }, "記録をすべて消す");
    resetBtn.onclick = () => confirmHost.replaceChildren(h("div", { class: "confirm" },
      h("p", { class: "small" }, "XP・レッスンの記録・書いた答え・卒業制作がすべて消えます。元には戻せません。"),
      h("div", { class: "row" },
        h("button", { class: "btn sm red", type: "button", onclick: () => { Store.reset(); toast("記録を消しました"); Router.go("map"); } }, "消す"),
        h("button", { class: "btn sm ghost", type: "button", onclick: () => confirmHost.replaceChildren() }, "やめる"))));
    this.mount(h("div", { class: "stack" },
      h("h2", { class: "section-h" }, "設定"),
      h("section", { class: "sheet card" }, h("h2", null, "見た目"), h("div", { class: "row" }, theme), h("p", { class: "small muted" }, "方眼ノート（明るい）と、設計図の青焼き（暗い）を選べます。")),
      h("section", { class: "sheet card" }, h("h2", null, "レッスンの開き方"),
        h("label", { class: "toggle", for: "free-mode" }, free, "順番に関係なく、すべてのレッスンを開く"),
        h("p", { class: "small muted" }, "復習や、気になる章だけやりたいとき用。はじめての人は順番どおりがおすすめです。")),
      h("section", { class: "sheet card" }, h("h2", null, "赤ペンAIコーチ"),
        rich("p", AI.state === "ready" ? "使えます。書く問題と卒業制作で「赤ペンAIに添削してもらう」を押すと、Claude が添削します（あなたの Claude の利用枠を使います）。" : "この表示ではAI添削は使えません。代わりに「添削の依頼文をコピー」で、Claude のチャットに貼って添削してもらえます。", { class: "small" })),
      this.dataBox(),
      h("section", { class: "sheet card" }, h("h2", null, "最初からやり直す"), resetBtn, confirmHost),
    ));
  },
};

function applyTheme() {
  const t = Store.state.settings.theme;
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else if (document.documentElement.dataset.kzTheme) document.documentElement.removeAttribute("data-theme");
  document.documentElement.dataset.kzTheme = t;
}

/* ================= ルーター ================= */
const Router = {
  current() {
    const hsh = location.hash.replace(/^#/, "");
    if (hsh.startsWith("l-")) return "lesson";
    return ["cards", "record", "prefs", "grad"].includes(hsh) ? hsh : "map";
  },
  go(id) {
    const target = "#" + id;
    if (location.hash === target) this.render();
    else location.hash = target;
  },
  render() {
    const hsh = location.hash.replace(/^#/, "");
    if (hsh.startsWith("l-")) {
      if (Player.p && Player.p.lesson.id === hsh.slice(2)) return Player.render();
      return Player.open(hsh.slice(2));
    }
    Player.p?.ctl?.abort();
    Player.p = null;
    const r = this.current();
    View[r]();
    window.scrollTo({ top: 0 });
  },
};

/* ================= 起動 ================= */
function start() {
  document.documentElement.lang = "ja";
  Store.load();
  applyTheme();
  Activity.start();
  Store.onChange((why) => {
    if (why === "remote" || why === "reset") { applyTheme(); if (!Player.p) Router.render(); else View.topbar(); }
  });
  addEventListener("hashchange", () => Router.render());
  Router.render();
  Store.connect();
  AI.init();
}

/* テスト用のフック（自動テストで全レッスンを通すため） */
window.__kz = {
  solveStep() {
    const p = Player.p;
    if (!p) return "none";
    const r = p.cur;
    if (r.mode === "read") { Player.next(); return "read"; }
    if (r.mode === "check") {
      r.solve();
      if (p.lesson.steps[p.i].t === "tq") { Player.answerTest(); return "test"; }
      Player.check();
      Player.next();
      return "check";
    }
    r.solve?.();
    if (!p.stepDone) return "stuck";
    Player.next();
    return "self";
  },
  state: () => Store.state,
  lessons: () => allLessons().map((l) => l.id),
  step: () => (Player.p ? JSON.parse(JSON.stringify(Player.p.lesson.steps[Player.p.i])) : null),
  index: () => (Player.p ? Player.p.i : -1),
};

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
