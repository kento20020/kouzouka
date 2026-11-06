/* ===== steps.js : 問題の種類ごとの表示と採点 =====
 * どの種類も { el, mode, ready(), check(), solve(), reveal() } を返す。
 *   mode "read"  : 読むだけ（次へ）
 *   mode "check" : 答えて「確認する」
 *   mode "self"  : 自分で完了まで進める（ctx.done(結果) を呼ぶ）
 */
"use strict";

const WHO = {
  m: { name: "ミナト先輩", av: "ミ", cls: "mentor" },
  o: { name: "さとう店長", av: "店", cls: "owner" },
  y: { name: "あなた", av: "私", cls: "you" },
  t: { name: "田中さん（パート）", av: "田", cls: "owner" },
};

const Steps = {};

function qTitle(s) {
  return s.q ? rich("p", s.q, { class: "q" }) : null;
}

/* ---------- 会話 ---------- */
Steps.talk = (s) => {
  const list = h("div", { class: "bubbles" });
  s.lines.forEach(([who, text], i) => {
    const w = WHO[who] || WHO.m;
    const b = h("div", { class: "bubble" + (who === "y" ? " you" : ""), style: { animationDelay: i * 0.12 + "s" } },
      h("div", { class: "av " + w.cls, "aria-hidden": "true" }, w.av),
      h("div", { class: "says" }, h("span", { class: "nm" }, w.name), rich("span", text)),
    );
    list.append(b);
  });
  return { el: list, mode: "read" };
};

/* ---------- 解説 ---------- */
Steps.learn = (s) => {
  const parts = [];
  if (s.title) parts.push(h("h2", null, s.title));
  parts.push(rich("div", s.html, { class: "body" }));
  return { el: parts, mode: "read" };
};

/* ---------- 1つ選ぶ（テスト問題も兼ねる） ---------- */
Steps.choice = (s, ctx) => {
  const opts = shuffled(s.opts.map((o, i) => ({ ...o, i })));
  let sel = null;
  let locked = false;
  const btns = [];
  const list = h("div", { class: "opts", role: "group" });
  const clear = () => btns.forEach((b) => { b.classList.remove("right", "wrong"); b.querySelector(".why")?.remove(); });
  for (const o of opts) {
    const b = h("button", { class: "opt", type: "button", "aria-pressed": "false" },
      h("span", { class: "mk-o", "aria-hidden": "true" }),
      h("span", null, rich("span", o.text)),
    );
    b.onclick = () => {
      if (locked) return;
      sel = o;
      clear();
      btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      ctx.onChange();
    };
    b._o = o;
    btns.push(b);
    list.append(b);
  }
  const addWhy = (b) => { if (b._o.why) b.lastChild.append(rich("span", b._o.why, { class: "why" })); };
  const lock = () => { locked = true; btns.forEach((b) => (b.disabled = true)); };
  return {
    el: [qTitle(s), list],
    mode: "check",
    ready: () => !!sel,
    selected: () => sel && sel.i,
    check() {
      clear();
      const b = btns.find((x) => x._o === sel);
      if (sel.ok) {
        b.classList.add("right");
        addWhy(b);
        lock();
        return { ok: true };
      }
      b.classList.add("wrong");
      addWhy(b);
      return { ok: false };
    },
    solve() {
      sel = opts.find((o) => o.ok);
      btns.forEach((x) => x.setAttribute("aria-pressed", String(x._o === sel)));
    },
    reveal() {
      clear();
      const b = btns.find((x) => x._o.ok);
      b.classList.add("right");
      addWhy(b);
      lock();
    },
  };
};
Steps.tq = Steps.choice;

/* ---------- 当てはまるものを全部選ぶ ---------- */
Steps.multi = (s, ctx) => {
  const opts = shuffled(s.opts.map((o, i) => ({ ...o, i })));
  const on = new Set();
  let locked = false;
  const btns = [];
  const list = h("div", { class: "opts", role: "group" });
  const clear = () => btns.forEach((b) => { b.classList.remove("right", "wrong"); b.querySelector(".why")?.remove(); });
  for (const o of opts) {
    const b = h("button", { class: "opt", type: "button", "aria-pressed": "false" },
      h("span", { class: "mk-o", "aria-hidden": "true", style: { borderRadius: "5px", height: "22px", marginTop: "2px" } }),
      h("span", null, rich("span", o.text)),
    );
    b.onclick = () => {
      if (locked) return;
      if (on.has(o)) on.delete(o); else on.add(o);
      clear();
      b.setAttribute("aria-pressed", String(on.has(o)));
      ctx.onChange();
    };
    b._o = o;
    btns.push(b);
    list.append(b);
  }
  const mark = (showAll) => {
    clear();
    let wrong = 0;
    for (const b of btns) {
      const o = b._o;
      const picked = on.has(o);
      if (picked && o.ok) b.classList.add("right");
      else if (picked && !o.ok) { b.classList.add("wrong"); wrong++; if (o.why) b.lastChild.append(rich("span", o.why, { class: "why" })); }
      else if (!picked && o.ok) { wrong++; if (showAll) { b.classList.add("right"); if (o.why) b.lastChild.append(rich("span", o.why, { class: "why" })); } }
      if (showAll && o.ok && picked && o.why) b.lastChild.append(rich("span", o.why, { class: "why" }));
    }
    return wrong;
  };
  return {
    el: [qTitle(s), h("p", { class: "small muted" }, "当てはまるものをすべて選んでから「確認する」を押します。"), list],
    mode: "check",
    ready: () => on.size > 0,
    check() {
      const wrong = mark(false);
      const missing = opts.filter((o) => o.ok && !on.has(o)).length;
      if (wrong === 0) { locked = true; btns.forEach((b) => (b.disabled = true)); mark(true); return { ok: true }; }
      const lines = [];
      if (missing) lines.push(`選び忘れが <b>${missing}個</b> あります。`);
      const extra = opts.filter((o) => !o.ok && on.has(o)).length;
      if (extra) lines.push(`当てはまらないものを <b>${extra}個</b> 選んでいます（赤い選択肢の理由を読んでみよう）。`);
      return { ok: false, lines };
    },
    solve() { on.clear(); opts.filter((o) => o.ok).forEach((o) => on.add(o)); btns.forEach((b) => b.setAttribute("aria-pressed", String(on.has(b._o)))); },
    reveal() { this.solve(); mark(true); locked = true; btns.forEach((b) => (b.disabled = true)); },
  };
};

/* ---------- 付箋を仕分ける ---------- */
Steps.sort = (s, ctx) => {
  const items = shuffled(s.items.map((it, i) => ({ ...it, i, rot: (Math.random() * 4 - 2).toFixed(1) })));
  const place = new Map(); // item -> bucketId
  let selected = null;
  const colorOf = (b) => "c" + (s.buckets.findIndex((x) => x.id === b) % 6);
  const tray = h("div", { class: "tray", "aria-label": "まだ貼っていない付箋" });
  const left = h("p", { class: "small", style: { fontWeight: 700 } });
  const bucketEls = new Map();
  const noteEls = new Map();

  const makeNote = (it) => {
    const n = h("button", { class: "note", type: "button", draggable: "true", style: { "--rot": it.rot + "deg" } }, rich("span", it.text));
    n.onclick = (e) => {
      e.stopPropagation();
      // 別の付箋を持っているときに、枠の中の付箋をタップしたら「その枠に貼る」
      if (selected && selected !== it && place.has(it)) { moveTo(place.get(it)); return; }
      selected = selected === it ? null : it;
      render();
    };
    n.ondragstart = (e) => { selected = it; e.dataTransfer?.setData("text/plain", String(it.i)); };
    noteEls.set(it, n);
    return n;
  };
  items.forEach(makeNote);

  const moveTo = (bid) => {
    if (!selected) return;
    if (bid == null) place.delete(selected); else place.set(selected, bid);
    noteEls.get(selected).classList.remove("bad", "good");
    selected = null;
    render();
    ctx.onChange();
  };
  tray.onclick = () => moveTo(null);
  tray.ondragover = (e) => e.preventDefault();
  tray.ondrop = (e) => { e.preventDefault(); moveTo(null); };

  const grid = h("div", { class: "buckets" });
  for (const b of s.buckets) {
    const holder = h("div", { class: "stack", style: { gap: "8px" } });
    const el = h("div", { class: "bucket", role: "button", tabindex: "0", "aria-label": b.label + "に貼る" },
      h("div", { class: "bl" }, h("span", null, b.label), b.hint ? h("small", null, b.hint) : null),
      holder,
    );
    el.onclick = () => moveTo(b.id);
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); moveTo(b.id); } };
    el.ondragover = (e) => { e.preventDefault(); el.classList.add("hot"); };
    el.ondragleave = () => el.classList.remove("hot");
    el.ondrop = (e) => { e.preventDefault(); el.classList.remove("hot"); moveTo(b.id); };
    bucketEls.set(b.id, { el, holder });
    grid.append(el);
  }

  function render() {
    tray.replaceChildren();
    for (const { holder, el } of bucketEls.values()) { holder.replaceChildren(); el.classList.toggle("hot", false); }
    for (const it of items) {
      const n = noteEls.get(it);
      n.classList.toggle("sel", selected === it);
      const bid = place.get(it);
      n.className = n.className.replace(/\bc\d\b/g, "").trim();
      if (bid) { n.classList.add(colorOf(bid)); bucketEls.get(bid).holder.append(n); } else tray.append(n);
    }
    const rest = items.length - place.size;
    left.textContent = rest ? `まだ貼っていない付箋：${rest}枚` + (selected ? "　→ 貼りたい枠をタップ" : "") : "全部貼れました。「確認する」を押そう";
    if (selected) for (const { el } of bucketEls.values()) el.classList.add("hot");
  }
  render();
  const labelOf = (id) => s.buckets.find((b) => b.id === id)?.label;

  return {
    el: [qTitle(s), h("p", { class: "small muted" }, "付箋をタップしてから、貼りたい枠をタップします（パソコンならドラッグでも動かせます）。"), left, tray, grid],
    mode: "check",
    ready: () => place.size === items.length,
    check() {
      const lines = [];
      for (const it of items) {
        const n = noteEls.get(it);
        const ok = place.get(it) === it.b;
        n.classList.toggle("bad", !ok);
        n.classList.toggle("good", ok);
        if (!ok) lines.push(`「${it.text}」→ 正しくは <b>${labelOf(it.b)}</b>${it.why ? "：" + it.why : ""}`);
      }
      return { ok: lines.length === 0, lines };
    },
    solve() { items.forEach((it) => place.set(it, it.b)); selected = null; render(); },
    reveal() { this.solve(); items.forEach((it) => noteEls.get(it).classList.add("good")); },
  };
};

/* ---------- 順番に並べる ---------- */
Steps.order = (s, ctx) => {
  const items = s.items.map((text, i) => ({ text, i }));
  const pool = shuffled(items);
  const seq = [];
  const seqEl = h("ol", { class: "seqlist" });
  const poolEl = h("div", { class: "pool" });
  function render(marks) {
    seqEl.replaceChildren(...seq.map((it, pos) => {
      const li = h("li", { class: marks ? (it.i === pos ? "good" : "bad") : "" },
        h("button", { type: "button", onclick: () => { seq.splice(pos, 1); render(); ctx.onChange(); } }, rich("span", it.text)));
      return li;
    }));
    poolEl.replaceChildren(...pool.filter((it) => !seq.includes(it)).map((it) =>
      h("button", { type: "button", onclick: () => { seq.push(it); render(); ctx.onChange(); } }, rich("span", it.text))));
  }
  render();
  return {
    el: [qTitle(s), seqEl, poolEl],
    mode: "check",
    ready: () => seq.length === items.length,
    check() {
      render(true);
      const ok = seq.every((it, pos) => it.i === pos);
      const lines = ok ? [] : ["赤い行の位置が違います。並べ直してみよう（タップで外せます）。"];
      return { ok, lines };
    },
    solve() { seq.length = 0; seq.push(...items); render(); },
    reveal() { this.solve(); render(true); },
  };
};

/* ---------- 問題のある箇所を見つける ---------- */
Steps.spot = (s, ctx) => {
  const segs = s.segs.map((g, i) => ({ ...g, i }));
  const flagged = new Set();
  const btns = segs.map((g) => {
    const b = h("button", { class: "seg" + (s.mono ? " mono" : ""), type: "button", "aria-pressed": "false" },
      h("span", { class: "flag", "aria-hidden": "true" }), h("span", null, rich("span", g.text)));
    b.onclick = () => {
      if (flagged.has(g)) flagged.delete(g); else flagged.add(g);
      b.setAttribute("aria-pressed", String(flagged.has(g)));
      btns.forEach((x) => { x.classList.remove("good", "bad"); x.querySelector(".why")?.remove(); });
      ctx.onChange();
    };
    b._g = g;
    return b;
  });
  const need = segs.filter((g) => g.bad).length;
  const show = (all) => {
    for (const b of btns) {
      const g = b._g;
      b.classList.remove("good", "bad");
      b.querySelector(".why")?.remove();
      if (flagged.has(g) && g.bad) { b.classList.add("good"); if (g.why) b.lastChild.append(rich("span", g.why, { class: "why" })); }
      else if (flagged.has(g) && !g.bad) { b.classList.add("bad"); b.lastChild.append(rich("span", g.why || "ここは問題ありません。", { class: "why" })); }
      else if (all && g.bad) { b.classList.add("good"); b.setAttribute("aria-pressed", "true"); if (g.why) b.lastChild.append(rich("span", g.why, { class: "why" })); }
    }
  };
  return {
    el: [qTitle(s), h("p", { class: "small muted" }, `問題のある箇所をタップして印をつけます（全部で ${need} か所）。`), h("div", { class: "spot" }, btns)],
    mode: "check",
    ready: () => flagged.size > 0,
    check() {
      show(false);
      const hit = segs.filter((g) => g.bad && flagged.has(g)).length;
      const extra = segs.filter((g) => !g.bad && flagged.has(g)).length;
      const ok = hit === need && extra === 0;
      const lines = [];
      if (!ok) {
        lines.push(`見つけた問題：<b>${hit} / ${need}</b>`);
        if (extra) lines.push(`問題ではない箇所に <b>${extra}個</b> 印がついています。`);
        if (hit < need) lines.push(`あと <b>${need - hit}個</b> あります。`);
      }
      return { ok, lines };
    },
    solve() { flagged.clear(); segs.filter((g) => g.bad).forEach((g) => flagged.add(g)); btns.forEach((b) => b.setAttribute("aria-pressed", String(flagged.has(b._g)))); },
    reveal() { this.solve(); show(true); },
  };
};

/* ---------- 状態×イベント表を埋める ---------- */
function openPicker(title, opts, current, onPick) {
  const close = () => { ov.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  const sheet = h("div", { class: "picker", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("h4", null, title),
    ...opts.map((o, i) => h("button", { class: "opt", type: "button", "aria-pressed": String(i === current), onclick: () => { onPick(i); close(); } },
      h("span", { class: "mk-o", "aria-hidden": "true" }), h("span", null, o))),
    h("button", { class: "btn ghost sm", type: "button", onclick: close }, "閉じる"),
  );
  const ov = h("div", { class: "overlay", onclick: (e) => { if (e.target === ov) close(); } }, sheet);
  document.body.append(ov);
  document.addEventListener("keydown", esc);
  sheet.querySelector("button")?.focus();
}

Steps.grid = (s, ctx) => {
  const val = {};
  const cellBtns = {};
  const accepted = (k) => [].concat(s.ans[k]);
  const counter = h("span", { class: "emptycount" });
  const editable = [];
  s.rows.forEach((_, r) => s.cols.forEach((__, c) => { const k = r + "-" + c; if (!(s.given && k in s.given)) editable.push(k); }));
  const updateCount = () => {
    const n = editable.filter((k) => val[k] == null).length;
    counter.textContent = n ? `空欄 ${n} マス` : "空欄 0 マス";
    counter.classList.toggle("zero", n === 0);
  };
  const paint = (k) => {
    const b = cellBtns[k];
    b.classList.remove("bad", "good");
    if (val[k] == null) { b.classList.add("empty"); b.textContent = "？ タップして選ぶ"; }
    else { b.classList.remove("empty"); b.textContent = s.opts[val[k]]; }
  };
  const table = h("table", { class: "sx" },
    h("thead", null, h("tr", null, h("th", null, "状態＼イベント"), ...s.cols.map((c) => h("th", { html: c })))),
    h("tbody", null, ...s.rows.map((row, r) => h("tr", null,
      h("th", { html: row }),
      ...s.cols.map((col, c) => {
        const k = r + "-" + c;
        if (s.given && k in s.given) return h("td", null, h("div", { class: "given", html: s.given[k] }));
        const b = h("button", { class: "cellbtn empty", type: "button" });
        b.onclick = () => openPicker(`${row.replace(/<[^>]+>/g, "")} × ${col.replace(/<[^>]+>/g, "")}`, s.opts, val[k], (i) => { val[k] = i; paint(k); updateCount(); ctx.onChange(); });
        cellBtns[k] = b;
        return h("td", null, b);
      }),
    ))),
  );
  editable.forEach(paint);
  updateCount();
  return {
    el: [qTitle(s), h("div", { class: "row small" }, counter, h("span", { class: "muted" }, "マスをタップすると選択肢が出ます。灰色のマスは記入済みです。")), h("div", { class: "scroll-x" }, table)],
    mode: "check",
    ready: () => editable.every((k) => val[k] != null),
    check() {
      const lines = [];
      for (const k of editable) {
        const ok = accepted(k).includes(val[k]);
        cellBtns[k].classList.toggle("bad", !ok);
        cellBtns[k].classList.toggle("good", ok);
        if (!ok) {
          const [r, c] = k.split("-").map(Number);
          lines.push(`<b>${s.rows[r].replace(/<[^>]+>/g, "")} × ${s.cols[c].replace(/<[^>]+>/g, "")}</b>：${(s.notes && s.notes[k]) || "もう一度考えてみよう。"}`);
        }
      }
      return { ok: lines.length === 0, lines };
    },
    solve() { editable.forEach((k) => { val[k] = accepted(k)[0]; paint(k); }); updateCount(); },
    reveal() { this.solve(); editable.forEach((k) => cellBtns[k].classList.add("good")); },
  };
};

/* ---------- ヒアリング（会話シミュレーション） ---------- */
Steps.interview = (s, ctx) => {
  let left = s.budget;
  const got = new Set();
  const log = h("div", { class: "chatlog", "aria-live": "polite" });
  const budgetEl = h("span", { class: "budget" });
  const foundEl = h("div", { class: "found" });
  const chipsEl = h("div", { class: "qchips" });
  const summary = h("div", { class: "stack" });
  let finished = false;
  const say = (who, html) => {
    const w = WHO[who];
    log.append(h("div", { class: "bubble" + (who === "y" ? " you" : "") },
      h("div", { class: "av " + w.cls, "aria-hidden": "true" }, w.av),
      h("div", { class: "says" }, h("span", { class: "nm" }, w.name), rich("span", html))));
    log.scrollTop = log.scrollHeight;
  };
  const paintFound = () => {
    budgetEl.textContent = `残りの質問 ${left} 回`;
    foundEl.replaceChildren(...s.finds.map((f) => h("span", { class: "chip" + (got.has(f.id) ? " got" : "") }, got.has(f.id) ? "✓ " + f.label : "？ ？ ？")));
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    chipsEl.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const missed = s.finds.filter((f) => !got.has(f.id));
    summary.append(
      h("div", { class: "box " + (got.size >= s.pass ? "red" : "pen") },
        h("h4", null, `見つけた例外：${got.size} / ${s.finds.length}`),
        rich("p", got.size === s.finds.length ? "すべての例外を引き出せました。聞き上手！" : got.size >= s.pass ? "合格ライン突破。見逃した例外も確認しておこう。" : "例外は「普段の流れ」の外にあります。見逃したものを確認しよう。", { class: "small" }),
        missed.length ? h("ul", { class: "small" }, ...missed.map((f) => rich("li", `${f.label}（${s.qs.find((q) => q.f === f.id)?.q || ""} と聞けば分かった）`))) : null,
      ),
    );
    ctx.done({ xp: got.size * 6, badge: got.size === s.finds.length ? "interview" : null });
  };
  s.qs.forEach((q) => {
    const b = h("button", { class: "qchip", type: "button" }, q.q);
    b.onclick = () => {
      if (left <= 0 || finished) return;
      b.disabled = true;
      left--;
      say("y", q.q);
      setTimeout(() => {
        say(q.who || "o", q.a);
        if (q.f) got.add(q.f);
        log.append(h("p", { class: "coach" + (q.good ? "" : " bad") }, (q.f ? "例外を発見！ " : "") + q.coach));
        log.scrollTop = log.scrollHeight;
        paintFound();
        if (left === 0 || got.size === s.finds.length) finish();
      }, 320);
    };
    b._q = q;
    chipsEl.append(b);
  });
  if (s.intro) say("o", s.intro);
  paintFound();
  return {
    el: [qTitle(s), h("div", { class: "row small" }, budgetEl, h("span", { class: "muted" }, `合格ライン：例外を ${s.pass} 個`)), foundEl, log, chipsEl, summary],
    mode: "self",
    solve() {
      const best = s.qs.filter((q) => q.f).slice(0, s.budget);
      left = s.budget;
      best.forEach((q) => { const b = [...chipsEl.children].find((x) => x._q === q); b.disabled = true; left--; got.add(q.f); });
      paintFound();
      finish();
    },
  };
};

/* ---------- 画面のスタック（自由に触る） ---------- */
const NEXT_SCREENS = ["商品一覧", "商品詳細", "カート", "受け取り日時", "確認"];
function phoneView() {
  const view = h("div", { class: "stackview", "aria-live": "polite" });
  const msg = h("div", { class: "msgline" });
  const el = h("div", { class: "phone" }, h("div", { class: "notch" }), view, msg);
  return {
    el,
    show(stack, note) {
      view.replaceChildren(...stack.map((n, i) => h("div", { class: "scr" }, n, h("small", null, i === stack.length - 1 ? "表示中" : ""))));
      msg.textContent = note || "";
    },
  };
}

Steps.stackplay = (s, ctx) => {
  let stack = ["ホーム"];
  const count = { push: 0, replace: 0, reset: 0, back: 0 };
  const phone = phoneView();
  const taskEls = s.tasks.map((t) => h("li", null, t.label));
  let finished = false;
  const update = (note) => {
    phone.show(stack, note);
    s.tasks.forEach((t, i) => taskEls[i].classList.toggle("on", Object.entries(t.need).every(([k, n]) => count[k] >= n)));
    if (!finished && taskEls.every((li) => li.classList.contains("on"))) { finished = true; ctx.done({ xp: 10 }); }
  };
  const act = (kind) => {
    count[kind]++;
    if (kind === "push") stack.push(NEXT_SCREENS[Math.min(stack.length - 1, NEXT_SCREENS.length - 1)]);
    if (kind === "replace") stack[stack.length - 1] = "予約完了";
    if (kind === "reset") stack = ["ホーム"];
    if (kind === "back") {
      if (stack.length === 1) { update("一番下の画面で戻る → アプリが裏へ回りました"); return; }
      stack.pop();
    }
    update({ push: "上に1枚積みました", replace: "一番上を入れ替えました", reset: "全部捨てて置き直しました", back: "一番上を1枚取りました" }[kind]);
  };
  const controls = h("div", { class: "stack", style: { gap: "8px" } },
    h("button", { class: "btn sm", type: "button", onclick: () => act("push") }, "push：次の画面を積む"),
    h("button", { class: "btn sm", type: "button", onclick: () => act("replace") }, "replace：完了画面に入れ替える"),
    h("button", { class: "btn sm", type: "button", onclick: () => act("reset") }, "reset：ホームだけにする"),
    h("button", { class: "btn sm primary", type: "button", onclick: () => act("back") }, "← 戻る"),
  );
  update("");
  return {
    el: [qTitle(s), h("div", { class: "stackgrid" }, phone.el, h("div", { class: "stack" }, controls, h("div", null, h("p", { class: "small", style: { fontWeight: 700 } }, "やってみること"), h("ul", { class: "tasks" }, taskEls))))],
    mode: "self",
    solve() { Object.keys(count).forEach((k) => (count[k] = 9)); update(""); },
  };
};

/* ---------- 画面のスタック（方式を選ぶ練習） ---------- */
function applyMove(stack, how, to) {
  if (how === "push") return [...stack, to];
  if (how === "replace") return [...stack.slice(0, -1), to];
  if (how === "reset") return s_resetTarget(to);
  return stack;
}
function s_resetTarget(to) { return to === "ホーム" ? ["ホーム"] : ["ホーム", to].filter((x, i, a) => a.indexOf(x) === i); }

Steps.stack = (s, ctx) => {
  const pick = s.moves.map(() => null);
  const phone = phoneView();
  const moveEls = [];
  const replay = () => {
    let st = s.start.slice();
    for (let i = 0; i < s.moves.length; i++) {
      if (!pick[i]) break;
      st = s.moves[i].resetTo && pick[i] === "reset" ? s.moves[i].resetTo.slice() : applyMove(st, pick[i], s.moves[i].to);
    }
    phone.show(st, pick.every(Boolean) ? "戻るを押すと → " + (st.length > 1 ? st[st.length - 2] : "アプリが裏へ") : "");
  };
  s.moves.forEach((m, i) => {
    const seg = h("div", { class: "seg3", role: "group", "aria-label": m.label });
    ["push", "replace", "reset"].forEach((how) => {
      const b = h("button", { type: "button", "aria-pressed": "false" }, how);
      b.onclick = () => {
        pick[i] = how;
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        moveEls[i].classList.remove("bad", "good");
        moveEls[i].querySelector(".why")?.remove();
        replay();
        ctx.onChange();
      };
      seg.append(b);
    });
    const el = h("div", { class: "move" }, h("div", { class: "small" }, h("b", null, `${i + 1}. `), rich("span", m.label)), seg);
    moveEls.push(el);
  });
  replay();
  return {
    el: [qTitle(s), h("div", { class: "stackgrid" }, phone.el, h("div", { class: "moves" }, moveEls))],
    mode: "check",
    ready: () => pick.every(Boolean),
    check() {
      const lines = [];
      s.moves.forEach((m, i) => {
        const ok = m.ans.includes(pick[i]);
        moveEls[i].classList.toggle("bad", !ok);
        moveEls[i].classList.toggle("good", ok);
        moveEls[i].querySelector(".why")?.remove();
        if (!ok) { lines.push(`${i + 1}. ${m.label.replace(/<[^>]+>/g, "")} → <b>${m.ans.join(" または ")}</b>：${m.why}`); }
        else if (m.why) moveEls[i].append(rich("p", m.why, { class: "why small hand" }));
      });
      return { ok: lines.length === 0, lines };
    },
    solve() {
      s.moves.forEach((m, i) => { pick[i] = m.ans[0]; moveEls[i].querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.textContent === pick[i]))); });
      replay();
    },
    reveal() { this.solve(); moveEls.forEach((el) => el.classList.add("good")); },
  };
};

/* ---------- 通信の実験室（切断と冪等キー） ---------- */
Steps.seq = (s, ctx) => {
  let idem = false;
  let saved = 0;
  let pending = null; // 失敗したあとの再試行待ち {cut: "before"|"after"}
  const seen = new Set();
  const done = { dup: false, safe: false, before: false };
  const track = h("div", { class: "track" });
  const savedEl = h("div", { class: "counter" }, "この注文で保存された予約", h("b", null, "0"), "件");
  const appEl = h("div", { class: "counter" }, "アプリの表示：", h("b", { style: { fontSize: "15px" } }, "—"));
  const tasks = [
    ["dup", "冪等キーなしで「返る途中で切れる」→ 再試行して、二重予約を起こしてみる"],
    ["safe", "冪等キーありで同じことをして、予約が1件のままになるのを確かめる"],
    ["before", "「届く前に切れる」→ 再試行は、どちらでも1件になることを確かめる"],
  ];
  const taskEls = Object.fromEntries(tasks.map(([k, t]) => [k, h("li", null, t)]));
  const arrow = (from, to, text, opts = {}) => {
    const cls = "arrow" + (opts.back ? " back" : "") + (opts.cut ? " cut" : "") + (opts.self ? " self" : "");
    track.append(h("div", { class: cls }, h("div", { class: "ln", style: { "--from": from, "--to": to } }, text)));
  };
  const paint = (appText) => {
    savedEl.querySelector("b").textContent = String(saved);
    savedEl.classList.toggle("alert", saved > 1);
    if (appText) appEl.querySelector("b").textContent = appText;
    retryBtn.disabled = !pending;
    Object.entries(done).forEach(([k, v]) => taskEls[k].classList.toggle("on", v));
    if (done.dup && done.safe && done.before && !finished) { finished = true; ctx.done({ xp: 25, badge: "double" }); }
  };
  let finished = false;
  let reqId = "";
  const serverSave = () => {
    if (idem && seen.has(reqId)) {
      arrow(2, 3, `${reqId} は処理済み → 保存済みの結果を返す`, { self: true });
      return;
    }
    seen.add(reqId);
    saved++;
    arrow(2, 3, `予約を保存（${saved}件目）`, { self: true });
  };
  const start = (cut) => {
    track.replaceChildren();
    saved = 0;
    pending = null;
    seen.clear();
    reqId = "req-" + Math.random().toString(36).slice(2, 6);
    const label = idem ? `予約する（request_id=${reqId}）` : "予約する";
    if (cut === "before") {
      arrow(1, 3, label + " … 届く前に切断", { cut: true });
      pending = { cut };
      paint("失敗（再試行してください）");
      return;
    }
    arrow(1, 3, label);
    serverSave();
    if (cut === "after") {
      arrow(1, 3, "完了しました … 返る途中で切断", { back: true, cut: true });
      pending = { cut };
      paint("失敗（再試行してください）");
      return;
    }
    arrow(1, 3, "完了しました", { back: true });
    paint("予約完了");
  };
  const retry = () => {
    if (!pending) return;
    const cut = pending.cut;
    if (!idem) reqId = "req-" + Math.random().toString(36).slice(2, 6);
    arrow(1, 3, idem ? `再試行（同じ request_id=${reqId}）` : "再試行（新しい依頼として送る）");
    serverSave();
    arrow(1, 3, "完了しました", { back: true });
    pending = null;
    if (cut === "after" && !idem && saved >= 2) done.dup = true;
    if (cut === "after" && idem && saved === 1) done.safe = true;
    if (cut === "before" && saved === 1) done.before = true;
    paint(saved > 1 ? "予約完了（でも裏では2件！）" : "予約完了");
  };
  const idemBox = h("input", { type: "checkbox", id: "idem-" + ctx.key.replace(/[^a-z0-9]/gi, "") });
  idemBox.onchange = () => { idem = idemBox.checked; track.replaceChildren(); saved = 0; pending = null; paint("—"); };
  const retryBtn = h("button", { class: "btn red sm", type: "button", onclick: retry, disabled: true }, "再試行する");
  const lab = h("div", { class: "lab" },
    h("label", { class: "toggle", for: idemBox.id }, idemBox, "冪等キー（request_id）を使う"),
    h("div", { class: "row" },
      h("button", { class: "btn sm", type: "button", onclick: () => start(null) }, "ふつうに予約する"),
      h("button", { class: "btn sm", type: "button", onclick: () => start("before") }, "届く前に切れる"),
      h("button", { class: "btn sm", type: "button", onclick: () => start("after") }, "返る途中で切れる"),
      retryBtn,
    ),
    h("div", { class: "lanes" }, h("div", { class: "lane" }, "アプリ"), h("div", { class: "lane" }, "サーバー"), h("div", { class: "lane" }, "予約データ")),
    track,
    h("div", { class: "counters" }, savedEl, appEl),
    h("ul", { class: "tasks" }, Object.values(taskEls)),
  );
  paint("—");
  return {
    el: [qTitle(s), lab],
    mode: "self",
    solve() { done.dup = done.safe = done.before = true; paint(); },
  };
};

/* ---------- 点数をつけて Tier を決める ---------- */
function tierOf(i, f, r) {
  if (r >= 4) return 0;
  const sc = i * f * r;
  return sc >= 24 ? 0 : sc >= 8 ? 1 : 2;
}
Steps.score = (s, ctx) => {
  const vals = s.items.map(() => ({ i: 0, f: 0, r: 0 }));
  const rows = [];
  const axes = [["i", "影響の大きさ", 4], ["f", "起きる頻度", 3], ["r", "取り返しのつかなさ", 4]];
  s.items.forEach((it, n) => {
    const out = h("span", { class: "tierchip" }, "—");
    const box = h("div", { class: "scoreitem" }, rich("div", "<b>" + it.text + "</b>"));
    for (const [k, label, max] of axes) {
      const seg = h("div", { class: "seg3", role: "group", "aria-label": label });
      for (let v = 1; v <= max; v++) {
        const b = h("button", { type: "button", "aria-pressed": "false" }, String(v));
        b.onclick = () => {
          vals[n][k] = v;
          seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          const { i, f, r } = vals[n];
          box.classList.remove("good", "bad");
          box.querySelector(".why")?.remove();
          out.textContent = i && f && r ? `${i}×${f}×${r}＝${i * f * r} → Tier${tierOf(i, f, r)}` : "—";
          ctx.onChange();
        };
        seg.append(b);
      }
      box.append(h("div", { class: "scorerow" }, h("span", { class: "lbl" }, label), seg));
    }
    box.append(h("div", { class: "scorerow" }, h("span", { class: "lbl" }, "判定"), out));
    rows.push({ box, out });
  });
  return {
    el: [qTitle(s), rich("div", "影響 1〜4 × 頻度 1〜3 × 取り返し 1〜4。<b>24以上はTier0、8〜23はTier1、7以下はTier2</b>。ただし<b>取り返し4は頻度に関係なくTier0</b>。", { class: "small muted" }), h("div", { class: "stack" }, rows.map((r) => r.box))],
    mode: "check",
    ready: () => vals.every((v) => v.i && v.f && v.r),
    check() {
      const lines = [];
      s.items.forEach((it, n) => {
        const { i, f, r } = vals[n];
        const ok = tierOf(i, f, r) === it.expect;
        rows[n].box.classList.toggle("good", ok);
        rows[n].box.classList.toggle("bad", !ok);
        rows[n].box.querySelector(".why")?.remove();
        rows[n].box.append(rich("p", `目安：影響${it.sug[0]}・頻度${it.sug[1]}・取り返し${it.sug[2]} → Tier${it.expect}。${it.why}`, { class: "why small hand" }));
        if (!ok) lines.push(`「${it.text}」は <b>Tier${it.expect}</b> が目安です。`);
      });
      return { ok: lines.length === 0, lines };
    },
    solve() {
      s.items.forEach((it, n) => {
        const [i, f, r] = it.sug;
        Object.assign(vals[n], { i, f, r });
        const segs = rows[n].box.querySelectorAll(".seg3");
        [i, f, r].forEach((v, a) => segs[a].querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.textContent === String(v)))));
        rows[n].out.textContent = `${i}×${f}×${r}＝${i * f * r} → Tier${tierOf(i, f, r)}`;
      });
    },
    reveal() { this.solve(); this.check(); },
  };
};

/* ---------- 書く（見本と比べて自己チェック） ---------- */
Steps.write = (s, ctx) => {
  const saved = Store.state.answers[ctx.key];
  const ta = h("textarea", { class: "w", id: "w-" + ctx.key.replace(/[^a-z0-9]/gi, "-"), rows: s.rows || 8, placeholder: s.placeholder || "" });
  ta.value = saved != null ? saved : s.template || "";
  const count = h("div", { class: "count" });
  const after = h("div", { class: "stack" });
  const min = s.min ?? 40;
  const showBtn = h("button", { class: "btn primary", type: "button" }, "書けた！見本と比べる");
  let finished = false;
  const save = debounce(() => Store.save(), 500);
  const persist = () => { Store.state.answers[ctx.key] = ta.value; save(); };
  const upd = () => {
    const n = ta.value.replace(/\s/g, "").length;
    count.textContent = `${n} 文字` + (n < min ? `（あと ${min - n} 文字で見本を見られます）` : "");
    showBtn.disabled = n < min;
  };
  ta.oninput = () => { upd(); persist(); };
  upd();
  const checkEls = (s.checks || []).map((c, i) => {
    const id = `ck-${ctx.key.replace(/[^a-z0-9]/gi, "-")}-${i}`;
    const box = h("input", { type: "checkbox", id });
    box.onchange = () => {
      if (!finished && checkEls.every((x) => x.box.checked)) { finished = true; ctx.done({ xp: s.mission ? 30 : 20, mission: !!s.mission }); }
    };
    return { box, el: h("label", { for: id }, box, h("span", { html: c })) };
  });
  const reveal = () => {
    showBtn.hidden = true;
    after.replaceChildren(
      h("div", { class: "model" }, h("h4", null, "見本（答えは1つではありません）"), h("div", { class: "body", html: s.model })),
      checkEls.length ? h("div", { class: "stack", style: { gap: "8px" } }, h("p", { class: "small", style: { fontWeight: 700 } }, "自分の答えをチェックしよう（全部チェックで完了。足りなければ上で書き直してOK）"), h("div", { class: "checks" }, checkEls.map((c) => c.el))) : null,
      coachBox(() => ({ task: (s.task || s.q || "").replace(/<[^>]+>/g, ""), rubric: s.rubric || s.checks?.map((c) => c.replace(/<[^>]+>/g, "")) || [], answer: ta.value, example: s.model.replace(/<[^>]+>/g, "") })),
    );
    if (!checkEls.length && !finished) { finished = true; ctx.done({ xp: 20 }); }
  };
  showBtn.onclick = reveal;
  const head = s.mission ? h("div", { class: "row" }, h("span", { class: "mission-tag" }, "実践ミッション"), h("span", { class: "small muted" }, "スマホや身の回りで実際にやってみよう")) : null;
  return {
    el: [head, qTitle(s), s.hint ? rich("div", s.hint, { class: "small muted body" }) : null, ta, count, showBtn, after],
    mode: "self",
    cls: s.mission ? "mission" : "",
    solve() {
      if (ta.value.replace(/\s/g, "").length < min) ta.value = (s.model || "").replace(/<[^>]+>/g, "");
      upd();
      reveal();
      checkEls.forEach((c) => (c.box.checked = true));
      if (!finished) { finished = true; ctx.done({ xp: s.mission ? 30 : 20, mission: !!s.mission }); }
    },
  };
};

/* ---------- 卒業制作 ---------- */
Steps.grad = (s, ctx) => Grad.step(s, ctx);
