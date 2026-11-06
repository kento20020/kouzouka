/* ===== util.js : 小さなDOMヘルパー ===== */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
/** 今表示しているステップの寿命。ステップが変わると abort され、document へのリスナーも外れる */
let STEP_SIGNAL = null;
const stepListen = (type, fn) => document.addEventListener(type, fn, STEP_SIGNAL ? { signal: STEP_SIGNAL } : undefined);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** h("div", {class: "x", onclick}, child...) で要素を作る。文字列の子はテキストとして入る */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** 信頼できる教材のHTML文字列から要素を作る（利用者の入力には使わない） */
function rich(tag, html, attrs = {}) {
  return h(tag, { ...attrs, html });
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // 元の並びのままだと答えが分かってしまうので、2要素以上なら必ず崩す
  if (a.length > 1 && a.every((x, i) => x === arr[i])) a.push(a.shift());
  return a;
}

function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

let toastTimer = 0;
function toast(msg) {
  $(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

/** クリップボードへコピー。失敗したら選択できるテキストを出す */
async function copyText(text, fallbackHost) {
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
    return true;
  } catch {
    if (fallbackHost) {
      fallbackHost.replaceChildren(
        h("p", { class: "small muted" }, "自動でコピーできませんでした。下の文字を選択してコピーしてください。"),
        h("textarea", { class: "w", rows: 8, readonly: true }, text),
      );
      fallbackHost.querySelector("textarea")?.select();
    } else {
      toast("コピーできませんでした");
    }
    return false;
  }
}

const isInClaude = () => typeof window.claude?.use === "function";

/** ファイルとして保存。claude.ai では downloads 機能、それ以外は通常のダウンロード */
async function saveFile(filename, data, mime) {
  if (isInClaude()) {
    const dl = await window.claude.use("downloads").catch(() => null);
    if (!dl) {
      toast("この表示では保存できません。コピーを使ってください");
      return false;
    }
    try {
      await dl.save({ filename, data });
      toast("保存しました");
      return true;
    } catch (e) {
      if (e?.code === "declined") toast("保存をやめました");
      else toast("保存できませんでした。コピーを使ってください");
      return false;
    }
  }
  const blob = new Blob([data], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/** 赤ペンの〇（正解）を描くSVG */
function circleMark(size = 56) {
  const svg = `<svg viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true"><path class="draw" d="M30 6c14 0 24 9 24 23 0 15-11 25-25 25C15 54 6 44 6 30 6 18 14 8 27 6" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg>`;
  return h("span", { class: "mark", style: { color: "var(--red)" }, html: svg });
}
/** 「おしい」のレ点 */
function checkMark(size = 56) {
  const svg = `<svg viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true"><path class="draw" d="M12 30l12 14L50 12" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return h("span", { class: "mark", style: { color: "var(--red)" }, html: svg });
}
/** はなまる：らせんと花びらを座標から生成する */
function hanamaru(size = 170, level = 3) {
  const cx = 100, cy = 100;
  let spiral = "";
  const turns = level >= 3 ? 2.6 : 1.6;
  for (let t = 0; t <= turns * Math.PI * 2; t += 0.12) {
    const r = 14 + t * 5.2;
    const x = cx + r * Math.cos(t - Math.PI / 2);
    const y = cy + r * Math.sin(t - Math.PI / 2) * 0.92;
    spiral += (spiral ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  let petals = "";
  if (level >= 2) {
    const n = 9, R = 74;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
      const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
      const am = (a0 + a1) / 2, Rm = R + 22;
      const pm = [cx + Rm * Math.cos(am), cy + Rm * Math.sin(am)];
      petals += `${i ? "" : `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`}Q${pm[0].toFixed(1)} ${pm[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
    }
  }
  const svg = `<svg class="bigstamp" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="はなまる"><g fill="none" stroke="var(--red)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="${spiral}"/>${petals ? `<path d="${petals}"/>` : ""}</g></svg>`;
  return h("div", { html: svg });
}

function fmtMin(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + "分" : ""}`;
}
