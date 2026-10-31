// Statistiques anonymes : visites, sources, connexions et comptes distincts.
// Aucun mot de passe ni identifiant en clair : les comptes sont réduits à une empreinte HMAC (sel secret local).
import fs from "node:fs";
import { createHmac, randomBytes } from "node:crypto";

const FILE = new URL("../.stats.json", import.meta.url);
let db = {};
try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
db.salt ||= randomBytes(16).toString("hex");
db.days ||= {};
db.accounts ||= {};

let timer;
const save = () => { clearTimeout(timer); timer = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch {} }, 2000); };
const hash = (s) => createHmac("sha256", db.salt).update(String(s)).digest("hex").slice(0, 16);
const dayKey = () => new Date().toLocaleDateString("sv-SE");
const today = () => (db.days[dayKey()] ||= { visits: 0, visitors: [], src: {}, attempts: 0, twofa: 0, logins: 0, fails: 0 });

export function visit(ip, ua, src) {
  if (/bot|crawl|spider|preview|facebookexternalhit|slurp/i.test(ua)) return;
  const d = today(), v = hash(`${ip}|${ua}|${dayKey()}`), isNew = !d.visitors.includes(v);
  d.visits++;
  if (isNew) d.visitors.push(v);
  const key = /^[a-z0-9_-]{1,24}$/i.test(src || "") ? src.toLowerCase() : "direct";
  const s = (d.src[key] ||= { visits: 0, visitors: 0 });
  s.visits++; if (isNew) s.visitors++;
  save();
}
export const attempt = () => { today().attempts++; save(); };
export const twofa = () => { today().twofa++; save(); };
export const fail = () => { today().fails++; save(); };
export function login(provider, identifiant) {
  today().logins++;
  const a = hash(`${provider}:${String(identifiant).trim().toLowerCase()}`);
  if (!db.accounts[a]) db.accounts[a] = dayKey();
  save();
}

export function summary() {
  const keys = Object.keys(db.days).sort(), D = (k) => db.days[k];
  const sum = (f) => keys.reduce((n, k) => n + f(D(k)), 0), firsts = Object.values(db.accounts);
  const sources = {};
  for (const k of keys) for (const [name, s] of Object.entries(D(k).src)) { const t = (sources[name] ||= { visits: 0, visitors: 0 }); t.visits += s.visits; t.visitors += s.visitors; }
  return {
    totals: { visits: sum((d) => d.visits), visitorDays: sum((d) => d.visitors.length), attempts: sum((d) => d.attempts), twofa: sum((d) => d.twofa), logins: sum((d) => d.logins), fails: sum((d) => d.fails), distinctAccounts: firsts.length },
    perDay: keys.slice(-14).map((k) => ({ day: k, visits: D(k).visits, visitors: D(k).visitors.length, attempts: D(k).attempts, logins: D(k).logins, newAccounts: firsts.filter((x) => x === k).length })),
    sources,
  };
}
