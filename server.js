import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EcoleDirecteClient } from "./lib/ecoledirecte.js";
import { fetchPronote, loginPronote } from "./lib/pronote.js";
import * as stats from "./lib/stats.js";

// Lecture minimale du fichier .env (GROQ_API_KEY, AI_MODEL)
try {
  for (const line of fs.readFileSync(new URL(".env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const sessions = new Map();
const pendingEd = new Map();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
// Comptage des visites de la page d'accueil (?src=tiktok pour suivre le lien de ta bio)
app.use((req, _res, next) => {
  if (req.method === "GET" && req.path === "/" && (req.headers.accept || "").includes("text/html")) {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    stats.visit(ip, String(req.headers["user-agent"] || ""), String(req.query.src || ""));
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function getSession(req) {
  const id = req.cookies.pulse_session;
  return id ? sessions.get(id) : null;
}

function saveSession(res, data) {
  const id = randomUUID();
  sessions.set(id, { ...data, createdAt: Date.now() });
  res.cookie("pulse_session", id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 6,
  });
  return id;
}

app.post("/api/login", async (req, res) => {
  const { provider, identifiant, motdepasse, url, username, password } = req.body || {};
  stats.attempt();
  try {
    if (provider === "ecoledirecte") {
      const client = new EcoleDirecteClient();
      const result = await client.login(identifiant, motdepasse);
      if (result.needs2fa) {
        stats.twofa();
        const pendingId = randomUUID();
        pendingEd.set(pendingId, { client, identifiant, motdepasse });
        return res.json({
          ok: true,
          needs2fa: true,
          pendingId,
          question: result.question,
          propositions: result.propositions,
        });
      }
      stats.login("ecoledirecte", identifiant);
      saveSession(res, { provider: "ecoledirecte", client });
      return res.json({ ok: true, account: result.account, provider: "ecoledirecte" });
    }

    if (provider === "pronote") {
      const session = await loginPronote({
        url,
        username: username || identifiant,
        password: password || motdepasse,
      });
      stats.login("pronote", username || identifiant);
      saveSession(res, { provider: "pronote", session });
      return res.json({
        ok: true,
        provider: "pronote",
        account: {
          prenom: session.user?.name || username || identifiant,
          etablissement: session.instance?.name || url,
        },
      });
    }

    return res.status(400).json({ ok: false, error: "Choisis École Directe ou Pronote." });
  } catch (error) {
    stats.fail();
    return res.status(401).json({ ok: false, error: error.message });
  }
});

app.post("/api/login/2fa", async (req, res) => {
  const { pendingId, choix } = req.body || {};
  const pending = pendingEd.get(pendingId);
  if (!pending) {
    return res.status(400).json({ ok: false, error: "Session de double authentification expirée." });
  }
  try {
    const result = await pending.client.answer2fa(
      pending.identifiant,
      pending.motdepasse,
      choix,
    );
    pendingEd.delete(pendingId);
    if (result.needs2fa) {
      return res.status(401).json({ ok: false, error: "La double authentification a échoué." });
    }
    stats.login("ecoledirecte", pending.identifiant);
    saveSession(res, { provider: "ecoledirecte", client: pending.client });
    return res.json({ ok: true, account: result.account, provider: "ecoledirecte" });
  } catch (error) {
    stats.fail();
    return res.status(401).json({ ok: false, error: error.message });
  }
});

app.get("/api/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Non connecté." });
  if (session.provider === "ecoledirecte") {
    return res.json({ ok: true, provider: "ecoledirecte", account: session.client.publicAccount() });
  }
  return res.json({
    ok: true,
    provider: "pronote",
    account: {
      prenom: session.session.user?.name,
      etablissement: session.session.instance?.name,
    },
  });
});

app.get("/api/data", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Non connecté." });
  try {
    if (session.provider === "ecoledirecte") {
      const data = await session.client.fetchAll();
      return res.json({ ok: true, ...data });
    }
    const data = await fetchPronote(session.session);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});


async function askGroq(system, content, maxTokens = 2500) {
  // 1. On récupère la clé Groq
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Clé API manquante : ajoute GROQ_API_KEY dans le fichier .env, puis relance le serveur.");

  // 2. Requête vers l'API Groq (compatible format OpenAI)
  const model = process.env.AI_MODEL || "openai/gpt-oss-120b";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${key}` 
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // Les modèles gpt-oss « réfléchissent » : on limite pour ne pas épuiser les tokens.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: content }
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Erreur de l'IA (HTTP ${res.status}).`);

  return json.choices?.[0]?.message?.content || "";
}

// Fiche de révision / exercices (réponse JSON structurée, mise en page côté navigateur)
const FICHE_SYSTEM = `Tu es un professeur français bienveillant et rigoureux qui prépare des fiches de révision pour un élève de collège ou de lycée.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises de code, de la forme :
{"titre": string, "niveau": string, "resume": string,
 "points_cles": [{"titre": string, "texte": string}],
 "definitions": [{"terme": string, "definition": string}],
 "formules": [string],
 "methode": [string],
 "pieges": [string],
 "exercices": [{"enonce": string, "indice": string, "correction": string}],
 "quiz": [{"question": string, "reponse": string}],
 "conseil": string}
Règles :
- Français, programme de l'Éducation nationale adapté à la classe indiquée.
- Concret et concis : 3 à 6 points clés, 2 à 5 définitions, 3 à 5 questions de quiz.
- Ajoute des exercices (avec correction détaillée) seulement si c'est utile : sciences, maths, langues, grammaire... Sinon tableau vide.
- Adapte la quantité au temps de travail indiqué et la difficulté à la moyenne de l'élève.
- N'invente aucun fait. Si la consigne est vague, propose une fiche générale sur le thème de la matière.
- Pas de LaTeX ni de Markdown, sauf **gras** pour les mots importants. Écris les maths en texte simple (x², √, ×, ÷, ≤).
- Un champ inutile vaut "" ou [].`;

app.post("/api/ai/revision", async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ ok: false, error: "Non connecté." });
  const b = req.body || {};
  const revision = String(b.revision || "").slice(0, 4000);
  if (!revision.trim()) return res.status(400).json({ ok: false, error: "Consigne vide." });
  const moyenne = Number.isFinite(Number(b.moyenne)) && b.moyenne !== null ? Number(b.moyenne) : null;
  const ctx = [
    b.classe && `Classe de l'élève : ${String(b.classe).slice(0, 40)}`,
    b.matiere && `Matière : ${String(b.matiere).slice(0, 80)}`,
    b.date && `Pour le : ${String(b.date).slice(0, 10)}`,
    b.interro != null && `Type : ${b.interro ? "interrogation ou évaluation à préparer" : "devoir à rendre ou leçon à apprendre"}`,
    moyenne != null && `Moyenne actuelle dans cette matière : ${moyenne}/20 (${moyenne < 10 ? "insiste sur les bases" : moyenne >= 14 ? "vise l'approfondissement" : "équilibre bases et entraînement"})`,
    Number(b.minutes) > 0 && `Temps de travail prévu : environ ${Math.round(Number(b.minutes))} minutes`,
  ].filter(Boolean).join("\n");
  try {
    const text = await askGroq(
      FICHE_SYSTEM,
      `Voici la consigne d'une revision ${revision}, genere une fiche de revision et/ou si besoin des exercices d'entrainement\n\nContexte :\n${ctx || "Aucun contexte supplémentaire."}`,
      4000,
    );
    res.json({ ok: true, text });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

// Estimation du temps de travail de chaque devoir
app.post("/api/ai/estimate", async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ ok: false, error: "Non connecté." });
  const devoirs = (Array.isArray(req.body?.devoirs) ? req.body.devoirs : []).slice(0, 40);
  if (!devoirs.length) return res.json({ ok: true, estimates: {} });
  try {
    const items = devoirs.map((d, n) => ({ n, matiere: d.matiere, texte: String(d.texte || "").slice(0, 300), interro: !!d.interro }));
    const text = await askGroq(
      'Tu aides un élève à organiser son travail. Pour chaque devoir, estime en minutes un temps de travail réaliste (entre 5 et 180). Réponds uniquement avec un objet JSON de la forme {"0": 30, "1": 45}, où la clé est le numéro n du devoir, sans aucun texte autour.',
      JSON.stringify(items),
      2000,
    );
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    const estimates = {};
    devoirs.forEach((d, n) => {
      const v = Number(parsed[n]);
      if (Number.isFinite(v)) estimates[d.id] = Math.min(240, Math.max(5, Math.round(v)));
    });
    res.json({ ok: true, estimates });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

// Lecture d'un message École Directe (lecture seule)
app.get("/api/ed/message", async (req, res) => {
  const s = getSession(req);
  if (!s || s.provider !== "ecoledirecte") return res.status(401).json({ ok: false, error: "Non connecté." });
  try {
    res.json({ ok: true, ...(await s.client.readMessage(req.query.id)) });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

// Téléchargement d'un document École Directe (le jeton reste côté serveur)
app.get("/api/ed/doc", async (req, res) => {
  const s = getSession(req);
  if (!s || s.provider !== "ecoledirecte") return res.status(401).json({ ok: false, error: "Non connecté." });
  try {
    const { buffer, type } = await s.client.downloadDoc(req.query.id, req.query.type);
    const name = String(req.query.name || "document").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `inline; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

// Statistiques privées : /stats?token=TON_STATS_TOKEN (défini dans .env)
const statsOk = (t) => !!process.env.STATS_TOKEN && process.env.STATS_TOKEN.length >= 12 && String(t || "") === process.env.STATS_TOKEN;
app.get("/api/stats", (req, res) => {
  if (!statsOk(req.query.token)) return res.status(404).end();
  res.json({ ok: true, ...stats.summary() });
});
app.get("/stats", (req, res) => {
  if (!statsOk(req.query.token)) return res.status(404).end();
  const { totals: t, perDay, sources } = stats.summary(), e = (v) => String(v).replace(/[&<>"]/g, "");
  const rows = perDay.map((d) => `<tr><td>${e(d.day)}</td><td>${d.visits}</td><td>${d.visitors}</td><td>${d.attempts}</td><td>${d.logins}</td><td>${d.newAccounts}</td></tr>`).join("");
  const src = Object.entries(sources).map(([k, v]) => `<tr><td>${e(k)}</td><td>${v.visits}</td><td>${v.visitors}</td></tr>`).join("");
  res.set("X-Robots-Tag", "noindex").type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stats Pulse</title>
<style>body{font:16px system-ui;margin:20px;max-width:760px}td,th{padding:6px 12px;text-align:left;border-bottom:1px solid #ddd}.k{font-size:2rem;font-weight:800}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.c{padding:14px;border-radius:14px;background:#eef2f8}</style>
<h1>Stats Pulse</h1><div class="g"><div class="c"><div class="k">${t.visits}</div>visites</div><div class="c"><div class="k">${t.attempts}</div>tentatives de connexion</div><div class="c"><div class="k">${t.logins}</div>connexions réussies</div><div class="c"><div class="k">${t.distinctAccounts}</div>comptes différents</div></div>
<h2>Par source</h2><table><tr><th>Source</th><th>Visites</th><th>Visiteurs/jour</th></tr>${src || "<tr><td colspan=3>—</td></tr>"}</table>
<h2>14 derniers jours</h2><table><tr><th>Jour</th><th>Visites</th><th>Visiteurs</th><th>Tentatives</th><th>Connexions</th><th>Nouveaux comptes</th></tr>${rows}</table>`);
});

app.post("/api/logout", (req, res) => {
  const id = req.cookies.pulse_session;
  if (id) sessions.delete(id);
  res.clearCookie("pulse_session");
  res.json({ ok: true });
});

app.get(/.*/, (req, res) => {
  // Un fichier introuvable (icône, image...) doit renvoyer 404, pas la page d'accueil.
  if (path.extname(req.path)) return res.status(404).end();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function start(port, tries = 0) {
  // Express 5 transmet l'erreur de démarrage au callback (ex. port déjà utilisé).
  app.listen(port, (error) => {
    if (error) {
      if (error.code === "EADDRINUSE" && tries < 10) {
        console.log(`Le port ${port} est déjà utilisé, essai avec ${port + 1}...`);
        return start(port + 1, tries + 1);
      }
      console.error("Impossible de démarrer le serveur :", error.message);
      process.exit(1);
    }
    console.log(`Pulse écoute sur http://localhost:${port}`);
  });
}

start(Number(PORT));
