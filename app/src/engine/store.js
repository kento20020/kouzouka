/* ===== store.js : 学習の記録 =====
 * 1. いつもブラウザ（localStorage）に保存する
 * 2. claude.ai の中で開いたときは、本人だけが読める場所（data/users/<id>/progress）にも保存し、
 *    別の端末でも続きから学べるようにする
 */
"use strict";

const STORE_KEY = "kouzouka-drill-v1";

function freshState() {
  return {
    v: 1,
    xp: 0,
    done: {}, // lessonId -> {stars, firstOk, total, at}
    pos: {}, // lessonId -> 途中のステップ番号
    cards: [],
    badges: [],
    answers: {}, // stepKey -> 書いた文章など
    tests: { pre: null, post: null },
    grad: {},
    combo: 0,
    bestCombo: 0,
    missions: 0,
    aiReviews: 0,
    timeMs: 0,
    createdAt: Date.now(),
    updatedAt: 0,
    settings: { theme: "system", free: false },
  };
}

function migrate(raw) {
  const base = freshState();
  if (!raw || typeof raw !== "object") return base;
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.tests = { ...base.tests, ...(raw.tests || {}) };
  for (const k of ["done", "pos", "answers", "grad"]) if (!s[k] || typeof s[k] !== "object") s[k] = {};
  for (const k of ["cards", "badges"]) if (!Array.isArray(s[k])) s[k] = [];
  return s;
}

const Store = {
  state: freshState(),
  mode: "local", // "local" | "account"
  listeners: new Set(),
  _ref: null,
  _writing: false,
  _dirty: false,

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.state = migrate(JSON.parse(raw));
    } catch {
      this.state = freshState();
    }
    return this.state;
  },

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  _notify(reason) {
    for (const fn of this.listeners) {
      try { fn(reason); } catch (e) { console.error(e); }
    }
  },

  _writeLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch { /* 保存できない環境でも学習は続けられる */ }
  },

  /** 利用者の操作で状態が変わったときに呼ぶ */
  save() {
    this.state.updatedAt = Date.now();
    this._writeLocal();
    this._scheduleRemote();
  },

  _scheduleRemote: debounce(function () { Store._pushRemote(); }, 1500),

  async _pushRemote() {
    if (!this._ref) return;
    if (this._writing) { this._dirty = true; return; }
    this._writing = true;
    try {
      await this._ref.set({ state: JSON.parse(JSON.stringify(this.state)) });
    } catch (e) {
      if (e?.code === "unavailable") {
        setTimeout(() => this._pushRemote(), 1500 + Math.random() * 2000);
      } else if (e?.code === "revoked" || e?.code === "invalid_argument" || e?.code === "not_granted") {
        this._ref = null;
        this.mode = "local";
        this._notify("mode");
      }
    } finally {
      this._writing = false;
      if (this._dirty) { this._dirty = false; this._pushRemote(); }
    }
  },

  /** claude.ai の中なら、アカウントの保存場所につなぐ */
  async connect() {
    if (!isInClaude()) return;
    const [db, user] = await Promise.all([
      window.claude.use("db").catch(() => null),
      window.claude.use("user").catch(() => null),
    ]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    let ref;
    try { ref = db.doc("data/users/" + id + "/progress"); } catch { return; }
    try {
      const snap = await ref.get();
      const remote = snap.exists ? snap.data()?.state : null;
      this._ref = ref;
      this.mode = "account";
      if (remote && (remote.updatedAt || 0) > (this.state.updatedAt || 0)) {
        this.state = migrate(JSON.parse(JSON.stringify(remote)));
        this._writeLocal();
        this._notify("remote");
      } else if (this.state.updatedAt > 0) {
        this._pushRemote();
      }
      this._notify("mode");
    } catch {
      this._ref = null;
      this.mode = "local";
    }
  },

  reset() {
    const settings = this.state.settings;
    this.state = freshState();
    this.state.settings = settings;
    this.save();
    this._notify("reset");
  },

  importJSON(text) {
    const data = JSON.parse(text);
    const s = migrate(data.state || data);
    s.updatedAt = Date.now();
    this.state = s;
    this.save();
    this._notify("remote");
  },
};

/* 学習時間：画面が見えていて、最近操作があった時間だけ数える（保存は次の操作のときにまとめて行う） */
const Activity = {
  last: Date.now(),
  tick: Date.now(),
  start() {
    // 書きかけの文章などを、ページを閉じる・裏へ回る瞬間にも保存する
    const flush = () => { Store.state.updatedAt = Date.now(); Store._writeLocal(); Store._pushRemote(); };
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    const poke = () => { this.last = Date.now(); };
    ["pointerdown", "keydown", "scroll", "input"].forEach((ev) => addEventListener(ev, poke, { passive: true }));
    setInterval(() => {
      const now = Date.now();
      const active = document.visibilityState === "visible" && now - this.last < 120000;
      if (active) Store.state.timeMs += now - this.tick;
      this.tick = now;
    }, 15000);
  },
};
