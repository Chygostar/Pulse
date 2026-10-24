const $ = (id) => document.getElementById(id);
const message = $("message");
let provider = "ecoledirecte", pendingId = null, CUR = "";
const NAVKEYS = ["home", "schedule", "homework", "notes", "more"];
const PARENT = { school: "more", messages: "more", docs: "more", plan: "more" };
const S = { data: null, view: "home", shown: null, period: "", hw: "todo", day: "", account: null, stamp: null, dir: null, force: true };

/* ---------- utilitaires ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  return e;
};
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  return e;
};
const ICON = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  schedule: "M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  homework: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9",
  notes: "M6 20V11M12 20V4M18 20v-6",
  plan: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  palette: "M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.4-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  left: "M15 18l-6-6 6-6", right: "M9 18l6-6-6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  school: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  bell: "M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4",
  spark: "M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z",
};
const ic = (n) => svg("svg", { viewBox: "0 0 24 24", class: "ic" }, svg("path", { d: ICON[n] }));
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const num = (v) => parseFloat(String(v ?? "").replace(",", "."));
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "–");
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const dayLong = (d) => new Date(d + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const dayShort = (d) => new Date(d + "T12:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const today = () => new Date().toLocaleDateString("sv-SE");
const hhmm = (s) => String(s).slice(11, 16);
const mm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s) => +s.slice(11, 13) * 60 + +s.slice(14, 16);
const addDays = (d, n) => new Date(new Date(d + "T12:00").getTime() + n * 864e5).toLocaleDateString("sv-SE");
const durTxt = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + " mins" : ""}` : `${m} mins`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${m}:${ss}` : `${m}:${ss}`;
};

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error("Hors ligne"); e.offline = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const e = new Error(data.error || "Erreur inattendue."); e.status = res.status;
    if (res.status === 401 && !path.startsWith("/api/login") && !path.endsWith("/me") && !$("app").classList.contains("hidden")) { show("login"); message.textContent = "Session expirée, reconnecte-toi."; }
    throw e;
  }
  return data;
}

/* ---------- matières personnalisables (comme Papillon) ---------- */
const COLORS = ["blue", "red", "orange", "green", "purple", "pink", "teal", "yellow"];
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const EMO = [[/math/, "➗"], [/franc|lettre/, "📖"], [/hist|geo/, "🌍"], [/angl|llc/, "🇬🇧"], [/espagn|allem|ital|\blv/, "🗣️"], [/phys|chim/, "⚗️"], [/svt|terre|biolog/, "🧬"], [/\beps\b|sport/, "🏃"], [/techno|ingen|\bsti/, "⚙️"], [/\bart|dessin/, "🎨"], [/music/, "🎵"], [/numer|info|nsi|snt/, "💻"], [/philo/, "💭"], [/eco|\bses/, "📈"]];
const SUBJ = ls("pulse_subjects", {});
const pretty = (n) => { n = String(n || "Matière").trim(); return n === n.toUpperCase() && n.length > 3 ? n[0] + n.slice(1).toLowerCase() : n; };
function subj(name) {
  const k = norm(name), o = SUBJ[k] || {};
  let hash = 0; for (const c of k) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return { key: k, orig: name, name: o.name || pretty(name), color: o.color || COLORS[hash % COLORS.length], emoji: o.emoji || EMO.find(([r]) => r.test(k))?.[1] || "📚" };
}

/* ---------- thème ---------- */
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  $("theme").replaceChildren(ic(isDark() ? "sun" : "moon"));
  document.querySelector("meta[name=theme-color]").content = isDark() ? "#0d0f15" : "#ffffff";
}
$("theme").onclick = () => { const t = isDark() ? "light" : "dark"; save("pulse_theme", t); applyTheme(t); };
$("subjbtn").append(ic("palette")); $("logout").append(ic("out"));
const st = ls("pulse_theme", null); applyTheme(st === "light" || st === "dark" ? st : null);

/* ---------- notes ---------- */
const score = (n) => { const v = num(n.valeur), on = num(n.noteSur) || 20, c = num(n.coef) || 1; return Number.isFinite(v) && !n.nonSignificatif ? { r: (v / on) * 20, c } : null; };
const inPeriod = (n) => !S.period || n.codePeriode === S.period;
function grades() {
  const map = new Map();
  for (const n of (S.data.notes || []).filter(inPeriod)) {
    const sb = subj(n.libelleMatiere), s = map.get(sb.key) || { key: sb.key, sb, list: [], sum: 0, w: 0 };
    map.set(sb.key, s); s.list.push(n);
    const sc = score(n); if (sc) { s.sum += sc.r * sc.c; s.w += sc.c; }
  }
  const list = [...map.values()].map((s) => ({ ...s, avg: s.w ? s.sum / s.w : NaN }));
  const avgs = list.map((s) => s.avg).filter(Number.isFinite);
  return { list, general: avgs.length ? mean(avgs) : NaN };
}
function history() {
  const ns = (S.data.notes || []).filter(inPeriod).filter(score).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const subjects = new Map(), pts = [];
  ns.forEach((n, i) => {
    const k = norm(n.libelleMatiere), s = subjects.get(k) || { sum: 0, w: 0 }, sc = score(n);
    s.sum += sc.r * sc.c; s.w += sc.c; subjects.set(k, s);
    if (i === ns.length - 1 || ns[i + 1].date !== n.date) pts.push({ date: n.date, avg: mean([...subjects.values()].map((x) => x.sum / x.w)) });
  });
  return pts;
}
function simulate(g, key, r, c) {
  const list = g.list.map((s) => (s.key === key ? { ...s, sum: s.sum + r * c, w: s.w + c } : s)).map((s) => ({ ...s, avg: s.w ? s.sum / s.w : NaN }));
  const avgs = list.map((s) => s.avg).filter(Number.isFinite);
  return { subj: list.find((s) => s.key === key).avg, general: avgs.length ? mean(avgs) : NaN };
}
function chart(pts, mini) {
  if (pts.length < 2) return h("p", { class: "empty" }, "Pas assez de notes pour tracer l’historique.");
  const W = 600, H = mini ? 130 : 220, L = mini ? 6 : 34, R = 10, Tp = 12, B = mini ? 8 : 28, vals = pts.map((p) => p.avg);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 1)), hi = Math.min(20, Math.ceil(Math.max(...vals) + 1)), span = Math.max(1, hi - lo);
  const X = (i) => L + (i / (pts.length - 1)) * (W - L - R), Y = (v) => Tp + (1 - (v - lo) / span) * (H - Tp - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.avg).toFixed(1)}`).join(" ");
  return svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Évolution de la moyenne générale" },
    !mini && [0, 1, 2, 3].map((i) => { const t = lo + (span * i) / 3; return [svg("line", { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: "ch-grid" }), svg("text", { x: L - 6, y: Y(t) + 4, class: "ch-txt", "text-anchor": "end" }, String(Math.round(t * 10) / 10))]; }),
    svg("path", { d: `${line} L${X(pts.length - 1)} ${H - B} L${X(0)} ${H - B} Z`, class: "ch-area" }),
    svg("path", { d: line, class: "ch-line", pathLength: "1" }),
    !mini && pts.map((p, i) => svg("circle", { cx: X(i), cy: Y(p.avg), r: 4.5, class: "ch-dot" }, svg("title", {}, `${dayShort(p.date)} : ${fmt(p.avg)}`))),
    !mini && svg("text", { x: L, y: H - 8, class: "ch-txt" }, dayShort(pts[0].date)),
    !mini && svg("text", { x: W - R, y: H - 8, class: "ch-txt", "text-anchor": "end" }, dayShort(pts[pts.length - 1].date)));
}
const stat = (label, a, b) => {
  const d = b - a;
  return h("div", { class: "stat" }, h("small", {}, label), h("span", { class: "mu" }, fmt(a), " → "), h("b", {}, fmt(b)),
    Number.isFinite(d) && Math.abs(d) >= 0.005 && h("span", { class: `delta ${d > 0 ? "up" : "down"}` }, `${d > 0 ? "+" : ""}${fmt(d)}`));
};
const field = (label, input) => h("label", {}, label, input);

function simulator(g) {
  if (!g.list.length) return card("Simulateur de moyenne", h("p", { class: "empty" }, "Aucune matière à simuler."));
  const out = h("div", { class: "sim-out" }), goalOut = h("p", { class: "mu" });
  const sel = h("select", {}, g.list.map((s) => h("option", { value: s.key }, `${s.sb.emoji} ${s.sb.name}`)));
  const note = h("input", { type: "number", inputmode: "decimal", step: "0.25", min: "0", value: "15" });
  const sur = h("input", { type: "number", inputmode: "decimal", min: "1", value: "20" });
  const coef = h("input", { type: "number", inputmode: "decimal", step: "0.5", min: "0.5", value: "1" });
  const goal = h("input", { type: "number", inputmode: "decimal", step: "0.1", min: "0", max: "20", placeholder: "ex. 14" });
  const update = () => {
    const cur = g.list.find((s) => s.key === sel.value), on = num(sur.value) || 20, c = num(coef.value) || 1, r = (num(note.value) / on) * 20;
    if (Number.isFinite(r)) { const sim = simulate(g, cur.key, r, c); out.replaceChildren(stat(`Moyenne en ${cur.sb.name}`, cur.avg, sim.subj), stat("Moyenne générale", g.general, sim.general)); }
    else out.replaceChildren(h("p", { class: "mu" }, "Entre une note pour voir l’effet."));
    const t = num(goal.value);
    if (!Number.isFinite(t)) { goalOut.textContent = ""; return; }
    const others = g.list.filter((s) => s.key !== cur.key).map((s) => s.avg).filter(Number.isFinite);
    const needAvg = t * (others.length + 1) - others.reduce((a, b) => a + b, 0);
    const need = ((needAvg * ((cur.w || 0) + c) - (cur.sum || 0)) / c) * (on / 20);
    goalOut.textContent = need > on ? `Objectif hors d’atteinte avec une seule note en ${cur.sb.name}.` : need <= 0 ? "Objectif déjà atteint, même avec un 0." : `Il te faut au moins ${fmt(need)}/${on} en ${cur.sb.name} (coef ${c}).`;
  };
  [sel, note, sur, coef, goal].forEach((el) => el.addEventListener("input", update));
  update();
  return card("Simulateur de moyenne", h("div", { class: "sim" }, field("Matière", sel), field("Note", note), field("Sur", sur), field("Coef", coef)), out, h("div", { class: "sim-goal" }, field("Objectif de moyenne générale", goal), goalOut));
}

/* ---------- devoirs : chrono, Pomodoro, estimation, planning ---------- */
const T = ls("pulse_timers", {}), D = ls("pulse_done", {}), F = ls("pulse_fiches", {});
S.est = ls("pulse_est", {});
S.news = ls("pulse_news", []);
let CFG = ls("pulse_pomo_cfg", [25, 5]), P = ls("pulse_pomo", null);
const did = (x) => `${x.date}|${x.matiere}|${x.texte.slice(0, 40)}`;
const isDone = (x) => (did(x) in D ? D[did(x)] : !!x.fait);
const est = (x) => S.est[did(x)] ?? (x.interro ? 45 : Math.min(90, 15 + Math.round(x.texte.length / 8)));
const spent = (id) => (T[id]?.total || 0) + (T[id]?.start ? Date.now() - T[id].start : 0);
function toggleTimer(id) { const t = (T[id] ||= { total: 0, start: null }); if (t.start) { t.total += Date.now() - t.start; t.start = null; } else t.start = Date.now(); save("pulse_timers", T); render(); }
function resetTimer(id) { delete T[id]; save("pulse_timers", T); render(); }
const minMs = (m) => m * 60000;
const leftMs = () => (P.left != null ? P.left : Math.max(0, P.end - Date.now()));
const savePomo = () => save("pulse_pomo", P);
function addFocus(ms) { if (P && ms > 1000) { (T[P.id] ||= { total: 0, start: null }).total += ms; save("pulse_timers", T); } }
function startPomo(x) { if (P) stopPomo(false); P = { id: did(x), name: subj(x.matiere).name, phase: "focus", total: minMs(CFG[0]), end: Date.now() + minMs(CFG[0]), left: null, cycles: 0 }; savePomo(); renderPomo(); }
function nextPhase() {
  if (P.phase === "focus") { addFocus(P.total - leftMs()); P.cycles++; P.phase = "break"; P.total = minMs(P.cycles % 4 === 0 ? 15 : CFG[1]); }
  else { P.phase = "focus"; P.total = minMs(CFG[0]); }
  P.end = Date.now() + P.total; P.left = null; savePomo(); renderPomo(); navigator.vibrate?.([200, 100, 200]);
}
function pomoToggle() { if (P.left != null) { P.end = Date.now() + P.left; P.left = null; } else P.left = Math.max(0, P.end - Date.now()); savePomo(); renderPomo(); }
function stopPomo(refresh = true) { if (P?.phase === "focus") addFocus(P.total - leftMs()); P = null; savePomo(); renderPomo(); if (refresh) render(); }
function renderPomo() {
  const box = $("pomo");
  if (!P) { box.className = "pomo hidden"; box.replaceChildren(); document.title = "Pulse"; return; }
  box.className = `pomo ${P.phase}`;
  box.replaceChildren(h("div", {}, h("small", {}, P.phase === "focus" ? `Concentration · ${P.name}` : "Pause, respire"), h("b", { id: "pomo-time" }, fmtDur(leftMs()))),
    h("div", { class: "pomo-btns" }, h("button", { class: "btn", onclick: pomoToggle }, P.left != null ? "Reprendre" : "Pause"), h("button", { class: "btn", onclick: nextPhase }, "Passer"), h("button", { class: "btn", onclick: () => stopPomo() }, "Stop")));
}
function tick() {
  document.querySelectorAll("[data-timer]").forEach((el) => (el.textContent = fmtDur(spent(el.dataset.timer))));
  document.querySelectorAll("[data-prog]").forEach((el) => (el.style.width = Math.min(100, spent(el.dataset.prog) / (+el.dataset.est * 600)) + "%"));
  if (P) { if (P.left == null && Date.now() >= P.end) nextPhase(); const el = $("pomo-time"); if (el) el.textContent = fmtDur(leftMs()); document.title = `${fmtDur(leftMs())} · Pulse`; }
}
function buildPlan() {
  const todo = (S.data.devoirs || []).filter((x) => !isDone(x)).sort((a, b) => a.date.localeCompare(b.date));
  const busy = {};
  for (const c of S.data.edt || []) if (!c.isAnnule) (busy[c.start_date.slice(0, 10)] ||= []).push([toMin(c.start_date), toMin(c.end_date)]);
  const now = new Date(), t0 = today(), nowMin = now.getHours() * 60 + now.getMinutes(), free = {};
  const windows = (d) => {
    if (free[d]) return free[d];
    const wd = new Date(d + "T12:00").getDay();
    let w = wd === 0 || wd === 6 ? [[600, 720], [840, 1080]] : [[1050, 1230]];
    w = w.flatMap(([a, b]) => { let parts = [[a, b]]; for (const [s, e] of busy[d] || []) parts = parts.flatMap(([x, y]) => (e <= x || s >= y ? [[x, y]] : [[x, Math.max(x, s)], [Math.min(y, e), y]])); return parts; });
    if (d === t0) w = w.map(([a, b]) => [Math.max(a, Math.ceil((nowMin + 5) / 5) * 5), b]);
    return (free[d] = w.filter(([a, b]) => b - a >= 15));
  };
  const sessions = [], late = [];
  for (const x of todo) {
    let need = Math.max(0, est(x) - Math.round(spent(did(x)) / 60000));
    for (let i = 0; i < 14 && need > 0; i++) {
      const d = addDays(t0, i); if (d >= x.date) break;
      for (const win of windows(d)) while (need > 0 && win[1] - win[0] >= 15) { const len = Math.min(need, 45, win[1] - win[0]); sessions.push({ x, date: d, start: win[0], end: win[0] + len }); need -= len; win[0] += len + 10; }
    }
    if (need > 0) late.push({ x, missing: need });
  }
  return { sessions, late };
}

/* ---------- IA : fiches stylisées ---------- */
async function aiEstimate() {
  const btn = $("estbtn"), status = $("eststatus");
  btn.disabled = true; status.className = "mu"; status.textContent = "Estimation en cours…";
  try {
    const devoirs = (S.data.devoirs || []).filter((x) => !isDone(x)).map((x) => ({ id: did(x), matiere: x.matiere, texte: x.texte, interro: x.interro }));
    Object.assign(S.est, (await api("/api/ai/estimate", { devoirs })).estimates); save("pulse_est", S.est); render();
  } catch (err) { status.className = "err"; status.textContent = err.message; btn.disabled = false; }
}
const inline = (t) => String(t ?? "").split(/(\*\*[^*]+\*\*)/).map((p) => (p.startsWith("**") && p.endsWith("**") ? h("b", {}, p.slice(2, -2)) : p));
const arr = (v) => (Array.isArray(v) ? v : []);
const rot = (i, o = 0) => `c-${COLORS[(i + o) % COLORS.length]}`;
function md(text) {
  const out = []; let ul = null;
  for (const line of String(text).split("\n")) {
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (!ul) { ul = h("ul"); out.push(ul); } ul.append(h("li", {}, ...inline(li[1]))); continue; }
    ul = null; if (!line.trim()) continue;
    const hd = line.match(/^(#{1,4})\s+(.*)/);
    out.push(hd ? h(hd[1].length < 3 ? "h3" : "h4", {}, ...inline(hd[2])) : h("p", {}, ...inline(line)));
  }
  return h("div", { class: "md" }, out);
}
const sec = (emoji, title, cls, ...body) => h("section", { class: `sec rv ${cls || ""}` }, h("h4", {}, `${emoji} ${title}`), ...body);
const toggler = (label, target) => h("button", { class: "btn alt", onclick: (e) => { target.classList.toggle("open"); e.currentTarget.textContent = target.classList.contains("open") ? "Masquer" : label; } }, label);

function ficheView(raw, x) {
  let j = null;
  try { j = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || ""); } catch {}
  if (!j || typeof j !== "object") return [md(raw)];
  const s = subj(x.matiere), out = [];
  out.push(h("div", { class: `fh rv c-${s.color}` }, h("div", { class: "e" }, s.emoji),
    h("h3", {}, j.titre || `${s.name}`), h("div", { class: "chips" }, h("span", { class: "chip" }, s.name), j.niveau && h("span", { class: "chip" }, j.niveau), x.interro && h("span", { class: "chip" }, "Interro"), h("span", { class: "chip" }, `Pour le ${dayShort(x.date)}`))));
  if (j.resume) out.push(h("section", { class: `sec tint rv c-${s.color}` }, h("h4", {}, "✨ L’essentiel"), h("p", {}, ...inline(j.resume))));
  const kp = arr(j.points_cles);
  if (kp.length) out.push(sec("🎯", "Points clés", "", kp.map((k, i) => h("div", { class: `kp ${rot(i, 3)}` }, h("span", { class: "n" }, i + 1), h("div", {}, h("b", {}, ...inline(k.titre)), h("p", {}, ...inline(k.texte)))))));
  const df = arr(j.definitions);
  if (df.length) out.push(sec("📘", "Définitions", "", df.map((d, i) => h("div", { class: `df ${rot(i, 1)}` }, h("span", { class: "term" }, d.terme), h("p", {}, ...inline(d.definition))))));
  const fo = arr(j.formules);
  if (fo.length) out.push(sec("🧮", "Formules à retenir", "", fo.map((f, i) => h("div", { class: `formula ${rot(i, 4)}` }, String(f)))));
  const me = arr(j.methode);
  if (me.length) out.push(sec("🪜", "Méthode", "", me.map((m, i) => h("div", { class: `step ${rot(i, 6)}` }, h("span", { class: "n" }, i + 1), h("p", {}, ...inline(m))))));
  const pi = arr(j.pieges);
  if (pi.length) out.push(sec("⚠️", "Pièges à éviter", "tint warn c-red", h("ul", {}, pi.map((p) => h("li", {}, ...inline(p))))));
  const ex = arr(j.exercices);
  if (ex.length) out.push(sec("✏️", "Exercices d’entraînement", "", ex.map((e, i) => {
    const hint = h("div", { class: `reveal ${rot(i, 2)}` }, ...inline(e.indice)), corr = h("div", { class: `reveal ${rot(i, 3)}` }, ...inline(e.correction));
    return h("div", { class: "ex" }, h("div", { class: "q" }, `${i + 1}. `, ...inline(e.enonce)), h("div", { class: "chips", style: "margin-top:.6rem" }, e.indice && toggler("Indice", hint), e.correction && toggler("Correction", corr)), hint, corr);
  })));
  const qz = arr(j.quiz);
  if (qz.length) out.push(sec("🧠", "Mini-quiz (touche pour voir la réponse)", "", qz.map((q, i) => h("button", { class: `qz ${rot(i, 5)}`, onclick: (e) => e.currentTarget.classList.toggle("open") }, h("div", {}, ...inline(q.question)), h("div", { class: "a" }, ...inline(q.reponse))))));
  if (j.conseil) out.push(h("section", { class: "sec tint tip c-green rv" }, h("h4", {}, "💡 Conseil"), h("p", {}, ...inline(j.conseil))));
  return out;
}
const plain = (raw) => { try { const j = JSON.parse(String(raw).match(/\{[\s\S]*\}/)[0]); return [j.titre, j.resume, ...arr(j.points_cles).map((k) => `- ${k.titre} : ${k.texte}`), ...arr(j.definitions).map((d) => `${d.terme} : ${d.definition}`), ...arr(j.formules), ...arr(j.methode).map((m, i) => `${i + 1}. ${m}`), ...arr(j.exercices).map((e, i) => `Ex ${i + 1} : ${e.enonce}\nCorrection : ${e.correction}`)].filter(Boolean).join("\n").replace(/\*\*/g, ""); } catch { return String(raw); } };

function openSheet(title, nodes, foot = []) {
  $("sheet-title").textContent = title;
  $("sheet-body").replaceChildren(...[nodes].flat(Infinity));
  $("sheet-foot").replaceChildren(...foot);
  if (!$("sheet").open) $("sheet").showModal();
  $("sheet-body").querySelectorAll(".rv").forEach((el, i) => { el.style.setProperty("--i", Math.min(i, 8)); el.classList.add("in"); });
}
async function genFiche(x, force) {
  const id = did(x), s = subj(x.matiere), g = S.data ? grades().list.find((k) => k.key === s.key) : null;
  openSheet(`Fiche · ${s.name}`, [h("div", { class: "skel" }), h("div", { class: "skel" }), h("div", { class: "skel" })]);
  if (force) delete F[id];
  try {
    if (!F[id]) {
      F[id] = (await api("/api/ai/revision", { revision: `${x.matiere} : ${x.texte}`, matiere: s.orig, classe: S.account?.classe || "", interro: !!x.interro, date: x.date, moyenne: g && Number.isFinite(g.avg) ? +g.avg.toFixed(1) : null, minutes: est(x) })).text;
      save("pulse_fiches", F);
    }
    CUR = plain(F[id]);
    openSheet(`Fiche · ${s.name}`, ficheView(F[id], x), [h("button", { class: "btn", onclick: (e) => { navigator.clipboard?.writeText(CUR); e.currentTarget.textContent = "Copié !"; } }, "Copier le texte"), h("button", { class: "btn ai", onclick: () => genFiche(x, true) }, "Régénérer")]);
  } catch (err) { $("sheet-body").replaceChildren(h("p", { class: "err", style: "padding:1rem" }, err.offline ? "Hors ligne : la génération IA demande une connexion." : err.message)); }
}

/* ---------- matières : personnalisation ---------- */
function subjectRow(name) {
  const s = subj(name), row = h("div", { class: `srow c-${s.color}` });
  const set = (patch) => { SUBJ[s.key] = { ...(SUBJ[s.key] || {}), ...patch }; save("pulse_subjects", SUBJ); };
  const emo = h("input", { class: "emo", value: s.emoji, maxlength: "4", "aria-label": "Icône", oninput: (e) => set({ emoji: e.target.value.trim() || undefined }) });
  const nm = h("input", { value: s.name, "aria-label": "Nom affiché", oninput: (e) => set({ name: e.target.value.trim() || undefined }) });
  const dots = COLORS.map((c) => h("button", { class: `dot c-${c} ${c === s.color ? "on" : ""}`, "aria-label": c, onclick: () => { set({ color: c }); row.className = `srow c-${c}`; dots.forEach((d, i) => d.classList.toggle("on", COLORS[i] === c)); } }));
  row.append(emo, nm, h("div", { class: "dots" }, dots));
  return row;
}
function openSubjects() {
  const names = new Map();
  const add = (n) => { if (n && !names.has(norm(n))) names.set(norm(n), n); };
  (S.data?.notes || []).forEach((n) => add(n.libelleMatiere)); (S.data?.edt || []).forEach((c) => add(c.matiere)); (S.data?.devoirs || []).forEach((d) => add(d.matiere));
  const rows = [...names.values()].sort((a, b) => a.localeCompare(b)).map(subjectRow);
  openSheet("Mes matières", [h("p", { class: "mu", style: "margin:0 .2rem 1rem" }, "Choisis le nom, l’icône et la couleur de chaque matière. Elles s’appliquent partout."), rows.length ? rows : h("p", { class: "empty" }, "Aucune matière pour l’instant.")],
    [h("button", { class: "btn", onclick: () => { if (confirm("Réinitialiser toutes les matières ?")) { for (const k of Object.keys(SUBJ)) delete SUBJ[k]; save("pulse_subjects", SUBJ); $("sheet").close(); } } }, "Tout réinitialiser")]);
}
$("subjbtn").onclick = $("avatar").onclick = openSubjects;
$("sheet-close").onclick = () => $("sheet").close();
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) $("sheet").close(); });
$("sheet").addEventListener("close", () => { if (S.data) { S.force = false; render(); } });

/* ---------- composants ---------- */
const cardA = (title, action, ...body) => h("section", { class: "card rv" }, h("div", { class: "card-h" }, h("h2", {}, title), action), ...body);
const card = (title, ...body) => h("section", { class: "card rv" }, title && h("div", { class: "card-h" }, h("h2", {}, title)), ...body);
const empty = (t) => h("p", { class: "empty" }, t);
const cls = (avg) => (avg >= 14 ? "good" : avg < 10 ? "low" : "");
const goSub = (v) => { S.dir = "r"; S.view = v; render(); window.scrollTo({ top: 0 }); };
const back = () => { S.dir = "l"; S.view = "more"; render(); window.scrollTo({ top: 0 }); };
const backBar = (t) => h("div", { class: "backbar" }, h("button", { class: "ibtn", "aria-label": "Retour", onclick: back }, ic("left")), h("h1", {}, t));
const safeDay = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d)) ? dayShort(String(d).slice(0, 10)) : String(d || ""));
const go = (v) => { S.view = v; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
const chip = (n) => { const sc = score(n); return h("span", { class: `chip ${sc ? cls(sc.r) : ""}`, title: `${n.devoir || ""} – ${n.date || ""}${n.moyenneClasse ? " – moyenne de classe " + n.moyenneClasse : ""}` }, n.valeur, h("small", {}, "/" + n.noteSur)); };
const check = (x) => h("label", { class: "check", "aria-label": "Devoir fait" }, h("input", { type: "checkbox", checked: !!isDone(x), onchange: (e) => { D[did(x)] = e.target.checked; save("pulse_done", D); S.force = false; render(); } }), h("span", { class: "box" }));

function courseBlock(c, side) {
  const s = subj(c.matiere || c.text), dur = toMin(c.end_date) - toMin(c.start_date);
  return h("div", { class: `crow ${side || ""} rv` },
    h("div", { class: "ctime" }, h("b", {}, hhmm(c.start_date)), h("small", {}, hhmm(c.end_date))),
    h("div", { class: `cblock c-${s.color} ${c.isAnnule ? "off" : ""}` }, h("div", { class: "cbody" },
      c.isAnnule && h("div", { class: "banner" }, "Cours annulé"),
      h("div", { class: "ctitle" }, `${s.emoji} ${s.name}`),
      h("div", { class: "chips" }, c.salle && h("span", { class: "chip" }, `📍 ${c.salle}`), c.prof && h("span", { class: "chip" }, `👤 ${c.prof}`)),
      h("div", { class: "chips" }, h("span", { class: "chip" }, durTxt(dur))))));
}
function hwItem(x) {
  const id = did(x), running = !!T[id]?.start, e = est(x), sp = spent(id), s = subj(x.matiere);
  return h("article", { class: `item rv c-${s.color} ${isDone(x) ? "done" : ""}` },
    h("div", { class: "item-main" }, check(x), h("div", { class: "item-text" },
      h("div", { class: "item-title" }, h("span", { class: "emo-b" }, s.emoji), s.name, x.interro && h("span", { class: "tag" }, "Interro")), h("p", {}, x.texte || "—"))),
    h("div", { class: "prog" }, h("i", { "data-prog": id, "data-est": e, style: `width:${Math.min(100, sp / (e * 600))}%` })),
    h("div", { class: "tools" }, h("span", { class: "clock", "data-timer": id }, fmtDur(sp)), h("small", { class: "mu" }, `/ ~${e} min`),
      h("button", { class: "btn", onclick: () => toggleTimer(id) }, running ? "Pause" : "Chrono"),
      h("button", { class: "btn alt", onclick: () => startPomo(x) }, "Pomodoro"),
      sp > 0 && !running && h("button", { class: "btn", onclick: () => resetTimer(id) }, "Zéro"),
      h("button", { class: "btn ai", onclick: () => genFiche(x) }, "✨ Fiche IA")));
}

/* ---------- vues ---------- */
const VIEWS = {
  home() {
    const d = S.data, g = grades(), now = new Date().toLocaleString("sv-SE").slice(0, 16);
    const edt = [...(d.edt || [])].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const nexts = edt.filter((c) => !c.isAnnule && c.end_date.slice(0, 16) > now).slice(0, 3);
    const todo = (d.devoirs || []).filter((x) => !isDone(x)), interros = todo.filter((x) => x.interro);
    const unread = (d.messages || []).filter((m) => !m.read).length, nAbs = d.school ? d.school.absences.length : null;
    const tile = (label, sub, color, fn, icon) => h("button", { class: `tile c-${color} rv`, onclick: fn }, h("span", { class: "tile-ic" }, ic(icon)), h("span", {}, h("b", {}, label), h("small", {}, sub)));
    const perm = "Notification" in window && Notification.permission === "default";
    return [h("h1", {}, `Salut ${S.account?.prenom || ""} 👋`),
      S.news.length > 0 && h("section", { class: "card news rv" }, h("div", { class: "card-h" }, h("h2", {}, "🔔 Nouveautés"), h("button", { class: "btn", onclick: () => { S.news = []; save("pulse_news", S.news); S.force = false; render(); } }, "Tout marquer comme lu")), S.news.slice(0, 6).map((n) => h("div", { class: "row" }, h("span", {}, n.text), h("small", {}, n.when)))),
      perm && h("section", { class: "card rv" }, h("div", { class: "card-h" }, h("h2", {}, "Rappels"), h("button", { class: "btn ai", onclick: askNotify }, "Activer")), h("p", { class: "mu" }, "Reçois une alerte avant tes interros et à chaque nouvelle note (quand Pulse est ouvert).")),
      h("div", { class: "tiles" },
        tile("Moyenne", `${fmt(g.general)} / 20`, "green", () => go("notes"), "notes"), tile("Devoirs", `${todo.length} à faire`, "purple", () => go("homework"), "homework"),
        tile("Absences", nAbs == null ? "Indisponible" : `${nAbs} au total`, "red", () => goSub("school"), "school"), tile("Messages", d.messages ? `${unread} non lu(s)` : "Indisponible", "blue", () => goSub("messages"), "mail"),
        tile("Interros", `${interros.length} à venir`, "orange", () => go("homework"), "plan"), tile("Documents", d.docs ? `${d.docs.length} fichier(s)` : "Indisponible", "teal", () => goSub("docs"), "doc")),
      cardA("Prochains cours", h("button", { class: "btn", onclick: () => go("schedule") }, "Afficher plus"), nexts.length ? nexts.map((c) => courseBlock(c)) : empty("Aucun cours à venir cette semaine.")),
      cardA("Moyenne", h("button", { class: "btn", onclick: () => go("notes") }, "Afficher plus"), h("div", { class: "big", style: "margin-bottom:.4rem" }, h("span", { "data-count": Number.isFinite(g.general) ? g.general : "", "data-dec": 2 }, fmt(g.general)), h("small", {}, " /20")), chart(history(), true)),
      card("Devoirs à faire", todo.length ? todo.slice(0, 4).map((x) => { const s = subj(x.matiere); return h("div", { class: `row c-${s.color}` }, h("span", {}, h("span", { class: "emo-b" }, s.emoji), s.name, x.interro && h("span", { class: "tag" }, "Interro"), h("br"), h("small", {}, x.texte.slice(0, 70))), h("span", { class: "pill" }, dayShort(x.date))); }) : empty("Rien à faire. Profites-en ! 🎉"))];
  },

  more() {
    const d = S.data, un = (d.messages || []).filter((m) => !m.read).length, perm = "Notification" in window ? Notification.permission : "unsupported";
    const row = (label, sub, color, icon, fn) => h("button", { class: `menu c-${color} rv`, onclick: fn }, h("span", { class: "tile-ic" }, ic(icon)), h("span", { class: "menu-t" }, h("b", {}, label), h("small", {}, sub)), h("span", { class: "chev" }, ic("right")));
    const na = "Disponible avec École Directe";
    return [h("h1", {}, "Plus"),
      row("Vie scolaire", d.school ? `${d.school.absences.length} absence(s) ou retard(s)` : na, "red", "school", () => goSub("school")),
      row("Messages", d.messages ? (un ? `${un} non lu(s)` : "Aucun message non lu") : na, "blue", "mail", () => goSub("messages")),
      row("Documents", d.docs ? `${d.docs.length} document(s)` : na, "teal", "doc", () => goSub("docs")),
      row("Planning de révision", "Répartis tes devoirs sur la semaine", "pink", "plan", () => goSub("plan")),
      row("Mes matières", "Nom, icône et couleur", "purple", "palette", openSubjects),
      row("Rappels", perm === "granted" ? "Activés : interros et nouvelles notes" : perm === "denied" ? "Bloqués dans le navigateur" : perm === "unsupported" ? "Non pris en charge ici" : "Touche pour activer", "orange", "bell", askNotify),
      h("p", { class: "mu rv", style: "margin:1rem .4rem" }, S.stamp ? `Dernière synchronisation : ${stampTxt()}` : ""),
      h("button", { class: "btn rv", onclick: () => sync() }, "Synchroniser maintenant")];
  },

  school() {
    const sc = S.data.school;
    if (!sc) return [backBar("Vie scolaire"), empty("Indisponible : cette section demande un compte École Directe.")];
    const kind = (x, abs) => { const t = String(x.typeElement || x.type || ""); return abs ? (/retard/i.test(t) ? "Retard" : "Absence") : /encourag/i.test(t) ? "Encouragement" : /sanction/i.test(t) ? "Sanction" : "Punition"; };
    const COL = { Absence: "red", Retard: "orange", Punition: "purple", Sanction: "pink", Encouragement: "green" };
    const items = [...sc.absences.map((x) => ({ ...x, k: kind(x, true) })), ...sc.sanctions.map((x) => ({ ...x, k: kind(x, false) }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const count = (k) => items.filter((i) => i.k === k).length;
    return [backBar("Vie scolaire"),
      h("div", { class: "chips rv", style: "margin-bottom:1rem" }, Object.keys(COL).map((k) => h("span", { class: `pill c-${COL[k]}` }, `${count(k)} ${k.toLowerCase()}${count(k) > 1 ? "s" : ""}`))),
      items.length ? items.map((x) => h("article", { class: `item rv c-${COL[x.k]}` }, h("div", { class: "item-main spread" },
        h("div", { class: "item-text" }, h("div", { class: "item-title" }, x.k, " · ", x.displayDate || safeDay(x.date)), h("p", {}, [x.libelle, x.motif].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "—"), x.commentaire && h("p", {}, x.commentaire)),
        (x.k === "Absence" || x.k === "Retard") && h("span", { class: `pill ${x.justifie ? "good" : "low"}` }, x.justifie ? "Justifiée" : "Non justifiée")))) : empty("Rien à signaler. 🎉")];
  },

  messages() {
    const ms = S.data.messages;
    if (!ms) return [backBar("Messages"), empty("Indisponible : cette section demande un compte École Directe.")];
    return [backBar("Messages"), h("p", { class: "mu rv", style: "margin:0 .3rem 1rem" }, "Lecture seule. Ouvrir un message le marque comme lu sur École Directe."),
      ms.length ? ms.map((m) => h("button", { class: `msg rv ${m.read ? "" : "unread"}`, onclick: () => openMessage(m) }, h("span", { class: "dot-u" }), h("span", { class: "msg-t" }, h("b", {}, m.from || "Expéditeur"), h("span", {}, m.subject || "(sans objet)")), h("small", { class: "mu" }, safeDay(m.date)))) : empty("Boîte de réception vide.")];
  },

  docs() {
    const ds = S.data.docs;
    if (!ds) return [backBar("Documents"), empty("Indisponible : cette section demande un compte École Directe.")];
    const by = {};
    for (const x of ds) (by[x.cat] ||= []).push(x);
    const cats = Object.keys(by);
    return [backBar("Documents"), cats.length ? cats.map((c, i) => cardA(c, null, by[c].map((x) => h("a", { class: "row linkrow", href: `/api/ed/doc?id=${encodeURIComponent(x.id)}&type=${encodeURIComponent(x.type || "")}&name=${encodeURIComponent(x.libelle || "document")}`, target: "_blank", rel: "noopener" },
      h("span", {}, h("b", {}, x.libelle || "Document"), h("br"), h("small", { class: "mu" }, safeDay(x.date))), h("span", { class: `pill c-${COLORS[(i + 3) % 8]}` }, "Ouvrir"))))) : empty("Aucun document.")];
  },

  notes() {
    const g = grades(), periods = S.data.periodes || [];
    const sel = h("select", { "aria-label": "Période", onchange: (e) => { S.period = e.target.value; S.force = false; render(); } }, h("option", { value: "" }, "Toute l’année"), periods.map((p) => h("option", { value: p.codePeriode, selected: p.codePeriode === S.period }, p.periode)));
    return [h("h1", {}, "Notes"),
      h("div", { class: "bar" }, sel, h("button", { class: "btn alt c-purple", onclick: openSubjects }, "🎨 Personnaliser")),
      h("section", { class: "card avgcard rv" }, h("div", { class: "card-h" }, h("h2", {}, "Moyenne générale"), h("span", { class: `pill ${cls(g.general)}` }, `${fmt(g.general)} / 20`)), chart(history())),
      simulator(g), h("div", { class: "sub" }, "Par matière"),
      g.list.length ? g.list.map((s) => h("article", { class: `item rv c-${s.sb.color}` },
        h("div", { class: "item-main spread" }, h("div", { class: "item-title" }, h("span", { class: "emo-b" }, s.sb.emoji), s.sb.name), h("span", { class: `pill ${cls(s.avg)}` }, fmt(s.avg))),
        h("div", { class: "chips" }, [...s.list].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(chip)))) : empty("Aucune note pour cette période.")];
  },

  homework() {
    const all = S.data.devoirs || [], nDone = all.filter(isDone).length;
    const list = all.filter((x) => S.hw === "all" || (S.hw === "done") === !!isDone(x)), byDate = {};
    for (const x of list) (byDate[x.date] ||= []).push(x);
    const dates = Object.keys(byDate).sort(), tabs = [["todo", `À faire (${all.length - nDone})`], ["done", `Faits (${nDone})`], ["all", "Tous"]];
    return [h("h1", {}, "Cahier de textes"),
      h("section", { class: "card rv", style: "display:flex;align-items:center;gap:1rem" }, h("div", { class: "ringp", style: `--v:${all.length ? (nDone / all.length) * 100 : 0}` }, h("span", {}, `${nDone}/${all.length}`)), h("div", {}, h("b", {}, all.length && nDone === all.length ? "Tout est fait ! 🎉" : "Ta progression"), h("p", { class: "mu" }, `${all.length - nDone} devoir(s) restant(s)`))),
      h("div", { class: "seg", style: `--n:3;--i:${tabs.findIndex(([k]) => k === S.hw)};margin-bottom:.9rem` }, tabs.map(([k, t]) => h("button", { class: k === S.hw ? "on" : "", onclick: () => { S.hw = k; S.force = false; render(); } }, t))),
      h("div", { class: "bar" }, h("span", { class: "mu" }, "Pomodoro"), h("select", { "aria-label": "Durée Pomodoro", onchange: (e) => { CFG = e.target.value.split("/").map(Number); save("pulse_pomo_cfg", CFG); } }, ["25/5", "45/10", "50/10"].map((v) => h("option", { value: v, selected: v === CFG.join("/") }, `${v.replace("/", " min / ")} min`)))),
      dates.length ? dates.map((d) => [h("div", { class: "sub rv" }, "Pour le " + dayLong(d)), byDate[d].map(hwItem)]) : empty(S.hw === "done" ? "Aucun devoir terminé." : "Rien à faire. Profites-en ! 🎉")];
  },

  plan() {
    const { sessions, late } = buildPlan(), byDay = {};
    for (const s of sessions) (byDay[s.date] ||= []).push(s);
    const days = Object.keys(byDay).sort();
    return [backBar("Planning de révision"),
      h("div", { class: "bar" }, h("button", { class: "btn ai", id: "estbtn", onclick: aiEstimate }, "✨ Estimer le temps avec l’IA"), h("span", { id: "eststatus", class: "mu" }, "Les cours des 2 semaines sont évités.")),
      late.length > 0 && card("Pas assez de temps avant l’échéance", late.map((l) => h("div", { class: "row" }, h("span", {}, subj(l.x.matiere).name, h("br"), h("small", {}, l.x.texte.slice(0, 80))), h("small", {}, `${l.missing} min non placées`)))),
      days.length ? days.map((d) => [h("div", { class: "sub rv" }, dayLong(d)), byDay[d].sort((a, b) => a.start - b.start).map((s) => { const sb = subj(s.x.matiere); return h("article", { class: `item rv c-${sb.color}` },
        h("div", { class: "item-main" }, check(s.x), h("div", { class: "item-text" }, h("div", { class: "item-title" }, h("span", { class: "emo-b" }, sb.emoji), sb.name, s.x.interro && h("span", { class: "tag" }, "Interro")), h("p", {}, s.x.texte.slice(0, 110))), h("span", { class: "time" }, `${mm(s.start)} – ${mm(s.end)}`)),
        h("div", { class: "tools" }, h("button", { class: "btn alt", onclick: () => startPomo(s.x) }, "Pomodoro"), h("button", { class: "btn ai", onclick: () => genFiche(s.x) }, "✨ Fiche IA"))); })]) : empty("Rien à planifier : tous tes devoirs sont faits. 🎉")];
  },

  schedule() {
    const byDay = {};
    for (const c of S.data.edt || []) (byDay[c.start_date.slice(0, 10)] ||= []).push(c);
    const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const days = [...Array(14)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d.toLocaleDateString("sv-SE"); });
    const sel = S.day || today(), list = (byDay[sel] || []).sort((a, b) => a.start_date.localeCompare(b.start_date)), out = [];
    let prevEnd = null;
    for (const c of list) {
      if (prevEnd != null) { const gap = toMin(c.start_date) - prevEnd; if (gap >= 25) out.push(h("div", { class: "gap rv" }, prevEnd >= 660 && prevEnd < 840 && gap >= 40 ? "🍴 Pause méridienne" : prevEnd >= 840 ? "☕ Pause de l’après-midi" : "☕ Pause", h("small", {}, durTxt(gap)))); }
      out.push(courseBlock(c, "right")); prevEnd = Math.max(prevEnd ?? 0, toMin(c.end_date));
    }
    return [h("div", { class: "dayhead" }, h("h1", {}, dayLong(sel)), h("div", { class: "top-actions" }, h("button", { class: "ibtn", "aria-label": "Jour précédent", onclick: () => shiftDay(-1) }, ic("left")), h("button", { class: "ibtn", "aria-label": "Jour suivant", onclick: () => shiftDay(1) }, ic("right")))),
      h("div", { class: "strip" }, days.map((d) => h("button", { class: `dpill ${d === sel ? "on" : ""} ${d === today() ? "now" : ""} ${byDay[d]?.length ? "has" : ""}`, onclick: () => { S.dir = d > sel ? "r" : "l"; S.day = d; render(); } },
        new Date(d + "T12:00").toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3), h("b", {}, +d.slice(8))))),
      out.length ? out : card(null, h("p", { class: "empty", style: "text-align:center" }, "Pas de cours ce jour-là 🎉"))];
  },
};
function shiftDay(n) {
  const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const lo = mon.toLocaleDateString("sv-SE"), hi = addDays(lo, 13), d = addDays(S.day || today(), n);
  if (d < lo || d > hi) return;
  S.dir = n > 0 ? "r" : "l"; S.day = d; render();
}

/* ---------- rendu, animations, scroll ---------- */
const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: "0px 0px -4% 0px" }) : null;
function countUp(el) {
  const to = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0;
  if (!Number.isFinite(to)) return;
  const t0 = performance.now(), step = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(dec).replace(".", ","); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function buildNav() {
  const meta = { home: ["Accueil", "green"], schedule: ["Cours", "blue"], homework: ["Tâches", "purple"], notes: ["Notes", "orange"], more: ["Plus", "teal"] };
  $("nav").replaceChildren(...NAVKEYS.map((k) => h("button", { "data-k": k, class: `c-${meta[k][1]}`, onclick: () => go(k) }, ic(k), meta[k][0])));
}
function render() {
  const view = $("view"), changed = S.view !== S.shown || S.dir || S.force;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.k === (PARENT[S.view] || S.view)));
  const nodes = [S.data ? VIEWS[S.view]() : h("div", {}, h("div", { class: "skel" }), h("div", { class: "skel" }), h("div", { class: "skel" }))].flat(Infinity).filter(Boolean);
  const keepY = window.scrollY;
  view.replaceChildren(...nodes);
  if (changed) { const dir = S.dir || (NAVKEYS.indexOf(PARENT[S.view] || S.view) >= NAVKEYS.indexOf(PARENT[S.shown] || S.shown || "home") ? "r" : "l"); view.className = ""; void view.offsetWidth; view.className = `enter-${dir}`; }
  else window.scrollTo(0, keepY);
  view.querySelectorAll(".rv").forEach((el, i) => { el.style.setProperty("--i", Math.min(i, 8)); if (!changed) el.classList.add("in", "still"); else if (io) io.observe(el); else el.classList.add("in"); });
  view.querySelectorAll("[data-count]").forEach(countUp);
  if (S.view === "schedule") requestAnimationFrame(() => document.querySelector(".dpill.on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }));
  S.shown = S.view; S.dir = null; S.force = false;
}
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest("button, .tile"); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, el = document.createElement("span");
  el.className = "rip"; el.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  b.append(el); setTimeout(() => el.remove(), 600);
});
addEventListener("scroll", () => $("top").classList.toggle("scrolled", scrollY > 8), { passive: true });
let sx = 0, sy = 0;
$("view").addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$("view").addEventListener("touchend", (e) => { if (S.view !== "schedule") return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) shiftDay(dx < 0 ? 1 : -1); }, { passive: true });

/* ---------- messages, rappels, nouveautés ---------- */
async function openMessage(m) {
  openSheet(m.subject || "Message", [h("div", { class: "skel" }), h("div", { class: "skel" })]);
  try {
    const r = await api(`/api/ed/message?id=${encodeURIComponent(m.id)}`);
    m.read = true;
    openSheet(r.subject || m.subject || "Message", [h("p", { class: "mu", style: "margin:0 .2rem .8rem" }, `${r.from || m.from} · ${safeDay(r.date || m.date)}`), h("div", { class: "msgtext" }, r.text || "(message vide)"),
      r.files?.length > 0 && h("p", { class: "mu", style: "margin:.8rem .2rem" }, `Pièces jointes (à ouvrir sur École Directe) : ${r.files.join(", ")}`)]);
  } catch (err) { $("sheet-body").replaceChildren(h("p", { class: "err", style: "padding:1rem" }, err.offline ? "Hors ligne : ce message n’est pas enregistré sur l’appareil." : err.message)); }
}
async function notify(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.ready, opt = { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag };
    if (reg) reg.showNotification(title, opt); else new Notification(title, opt);
  } catch {}
}
async function askNotify() { if (!("Notification" in window)) return; if (Notification.permission === "default") await Notification.requestPermission(); S.force = false; render(); }
function detectNews(prev, d) {
  const out = [], when = new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const nk = (n) => `${n.date}|${n.codeMatiere}|${n.devoir}|${n.valeur}`, old = new Set((prev.notes || []).map(nk));
  for (const n of (d.notes || []).filter((n) => !old.has(nk(n)))) out.push({ text: `Nouvelle note en ${subj(n.libelleMatiere).name} : ${n.valeur}/${n.noteSur}`, when });
  if (prev.messages && d.messages) { const o = new Set(prev.messages.map((m) => m.id)), nm = d.messages.filter((m) => !o.has(m.id) && !m.read); if (nm.length) out.push({ text: `${nm.length} nouveau(x) message(s)`, when }); }
  if (prev.school && d.school) { const k = (x) => `${x.id || x.date}|${x.typeElement}|${x.libelle}`, o = new Set([...prev.school.absences, ...prev.school.sanctions].map(k)), na = [...d.school.absences, ...d.school.sanctions].filter((x) => !o.has(k(x))); if (na.length) out.push({ text: `${na.length} nouveau(x) élément(s) de vie scolaire`, when }); }
  if (!out.length) return;
  S.news = [...out, ...S.news].slice(0, 20); save("pulse_news", S.news);
  notify("Pulse", out.slice(0, 3).map((o) => o.text).join("\n"), "news");
}
function checkReminders() {
  if (!S.data) return;
  const done = ls("pulse_notified", {}), t = today(), tm = addDays(t, 1); let changed = false;
  for (const x of S.data.devoirs || []) {
    if (!x.interro || isDone(x) || (x.date !== t && x.date !== tm)) continue;
    const k = `${did(x)}|${t}`; if (done[k]) continue;
    done[k] = 1; changed = true;
    const txt = `Interro de ${subj(x.matiere).name} ${x.date === t ? "aujourd’hui" : "demain"}`;
    S.news = [{ text: txt, when: "Rappel" }, ...S.news].slice(0, 20); notify("Rappel d’interro", txt, k);
  }
  if (changed) { save("pulse_notified", done); save("pulse_news", S.news); S.force = false; render(); }
}

/* ---------- hors ligne : données enregistrées ---------- */
const CACHE = "pulse_cache";
function netbar(text) { const b = $("netbar"); b.textContent = text || ""; b.classList.toggle("on", !!text); }
const stampTxt = () => (S.stamp ? new Date(S.stamp).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
async function sync() {
  const had = !!S.data, prev = ls(CACHE, null)?.data;
  try {
    const d = await api("/api/data"); delete d.ok;
    if (prev) detectNews(prev, d);
    S.data = d; S.stamp = Date.now(); save(CACHE, { account: S.account, data: d, time: S.stamp });
    netbar(""); S.force = !had; render(); checkReminders();
  } catch (err) {
    if (err.status === 401) return;
    netbar(`${err.offline ? "Hors ligne" : "Synchronisation impossible"}${S.stamp ? " · données du " + stampTxt() : ""}`);
    if (!S.data) $("view").replaceChildren(h("p", { class: "empty" }, err.message));
  }
}
addEventListener("offline", () => netbar(`Hors ligne${S.stamp ? " · données du " + stampTxt() : ""}`));
addEventListener("online", () => { if (S.account) sync(); });

/* ---------- connexion & double authentification ---------- */
function show(view) {
  const toApp = view === "home";
  $("auth").classList.remove("leave"); $("auth").classList.toggle("hidden", toApp);
  $("app").classList.toggle("hidden", !toApp);
  if (toApp) { $("app").classList.remove("app-in"); void $("app").offsetWidth; $("app").classList.add("app-in"); }
  for (const [id, v] of [["login-form", "login"], ["twofa-form", "twofa"]]) {
    const f = $(id), on = view === v;
    if (on && f.classList.contains("hidden")) { f.classList.remove("hidden", "step-in"); void f.offsetWidth; f.classList.add("step-in"); } else if (!on) f.classList.add("hidden");
  }
  message.textContent = "";
}
const fail = (form, text) => { message.textContent = text; form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake"); };
const busy = (btn, on) => { btn.disabled = on; btn.classList.toggle("loading", on); };

async function enterApp(account) {
  S.account = account; S.view = "home"; S.shown = null; S.period = ""; S.day = today(); S.force = true;
  const c = ls(CACHE, null); S.data = c?.data || null; S.stamp = c?.time || null;
  const initials = `${(account?.prenom || "?")[0]}${(account?.nom || "")[0] || ""}`.toUpperCase();
  $("avatar").textContent = initials;
  $("who-name").textContent = `${account?.prenom || ""} ${account?.nom || ""}`.trim() || "Élève";
  $("who-school").textContent = [account?.classe, account?.etablissement].filter(Boolean).join(" · ");
  if (!$("nav").children.length) buildNav();
  show("home"); render(); renderPomo();
  await sync();
}
function showTwoFa(data) {
  if (!data.question || !(data.propositions || []).length) { show("login"); return fail($("login-form"), "Aucune question de sécurité reçue. Réessaie dans quelques minutes."); }
  pendingId = data.pendingId;
  $("twofa-question").textContent = data.question;
  $("twofa-choices").replaceChildren(...data.propositions.map((p, i) => h("label", { style: `animation:up .4s ${i * 70}ms var(--ease) backwards` }, h("input", { type: "radio", name: "choix", value: p, required: true }), p)));
  show("twofa");
}
document.querySelectorAll(".tab").forEach((tab, i) => tab.addEventListener("click", () => {
  provider = tab.dataset.provider;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === tab));
  tab.parentElement.style.setProperty("--i", i);
  $("url-field").classList.toggle("hidden", provider !== "pronote"); $("url").required = provider === "pronote";
}));
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector(".primary"); busy(btn, true); message.textContent = "";
  try {
    const data = await api("/api/login", { provider, identifiant: $("identifiant").value.trim(), motdepasse: $("motdepasse").value, url: $("url").value.trim() });
    if (data.needs2fa) showTwoFa(data); else { $("auth").classList.add("leave"); await wait(260); enterApp(data.account); }
  } catch (err) { fail(e.target, err.offline ? "Pas de connexion Internet." : err.message); }
  finally { busy(btn, false); }
});
$("twofa-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const choice = e.target.querySelector('input[name="choix"]:checked'); if (!choice) return;
  const btn = e.target.querySelector(".primary"); busy(btn, true);
  try {
    const data = await api("/api/login/2fa", { pendingId, choix: choice.value });
    pendingId = null; $("auth").classList.add("leave"); await wait(260); enterApp(data.account);
  } catch (err) { show("login"); fail($("login-form"), err.message); }
  finally { busy(btn, false); }
});
$("twofa-cancel").addEventListener("click", () => { pendingId = null; show("login"); });
$("logout").addEventListener("click", async () => {
  await api("/api/logout", {}).catch(() => {});
  try { localStorage.removeItem(CACHE); localStorage.removeItem("pulse_news"); localStorage.removeItem("pulse_notified"); } catch {}
  S.news = [];
  S.data = null; S.account = null; netbar(""); $("motdepasse").value = ""; show("login");
});

setInterval(tick, 1000);
setInterval(() => { if (S.account && !document.hidden && navigator.onLine) sync(); }, 5 * 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.account && navigator.onLine && Date.now() - (S.stamp || 0) > 120000) sync(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
api("/api/me").then((d) => enterApp(d.account)).catch((err) => {
  const c = ls(CACHE, null);
  if (err.offline && c?.account) enterApp(c.account); else show("login");
});
