// Client École Directe (API non officielle), basé sur la version qui fonctionne.
import fs from "node:fs";

const API = "https://api.ecoledirecte.com";
const V = "4.96.3"; // version envoyée à l'API : à mettre à jour si elle la refuse
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FA_FILE = new URL("../.ed_fa.json", import.meta.url);

const unb64 = (s) => Buffer.from(String(s), "base64").toString("utf8");
const iso = (d) => d.toISOString().slice(0, 10);

// Jetons de confiance (cn/cv) gardés sur disque : la question n'est posée qu'une fois.
const loadFa = (id) => {
  try {
    return JSON.parse(fs.readFileSync(FA_FILE, "utf8"))[id] || [];
  } catch {
    return [];
  }
};
const saveFa = (id, fa) => {
  let all = {};
  try {
    all = JSON.parse(fs.readFileSync(FA_FILE, "utf8"));
  } catch {}
  if (fa.length) all[id] = fa;
  else delete all[id];
  fs.writeFileSync(FA_FILE, JSON.stringify(all));
};

export class EcoleDirecteClient {
  constructor() {
    this.jar = {};
    this.gtk = "";
    this.tok = "";
    this.fa2 = "";
    this.fa = [];
    this.rawPropositions = [];
    this.account = null;
    this.studentId = null;
  }

  #cookie() {
    return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  #store(res) {
    const list =
      res.headers.getSetCookie?.() ??
      (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,=\s]+=)/).filter(Boolean);
    for (const c of list) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) this.jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
    if (this.jar.GTK) this.gtk = this.jar.GTK;
  }

  async #send(path, data = {}, { fresh = false } = {}) {
    if (fresh) {
      this.tok = "";
      this.fa2 = "";
    }
    // Le cookie GTK est redemandé avant chaque connexion.
    if (path.includes("login.awp")) {
      this.#store(
        await fetch(`${API}/v3/login.awp?gtk=1&v=${V}`, {
          headers: { "User-Agent": UA, Cookie: this.#cookie() },
        }),
      );
    }
    const headers = {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://www.ecoledirecte.com",
      Referer: "https://www.ecoledirecte.com/",
      "X-GTK": this.gtk,
      Cookie: this.#cookie(),
    };
    if (this.tok) headers["X-Token"] = this.tok;
    if (this.fa2) headers["2FA-Token"] = this.fa2;

    const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}v=${V}`, {
      method: "POST",
      headers,
      body: "data=" + encodeURIComponent(JSON.stringify(data)),
    });
    this.#store(res);
    this.tok = res.headers.get("x-token") || this.tok;
    this.fa2 = res.headers.get("2fa-token") || this.fa2;

    return res;
  }

  async #call(path, data = {}, opts) {
    const res = await this.#send(path, data, opts);
    const raw = await res.text();
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return { code: res.status, message: `Réponse inattendue d'École Directe (HTTP ${res.status}).` };
    }
  }

  // Renvoie json.data ou lève une erreur (utilisé par les nouvelles sections).
  async #data(path, body = {}) {
    const json = await this.#call(path, body);
    if (json.code !== 200) throw new Error(json.message || `Erreur ${json.code}`);
    return json.data;
  }

  get #year() {
    const d = new Date(), y = d.getFullYear();
    return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  get #msgBase() {
    const a = this.account;
    return a.typeCompte === "E" ? `/v3/eleves/${a.id}` : `/v3/familles/${a.id}`;
  }

  // Lecture d'un message (lecture seule). Ouvrir un message le marque lu côté École Directe.
  async readMessage(id) {
    if (!/^\d+$/.test(String(id))) throw new Error("Identifiant de message invalide.");
    const d = await this.#data(`${this.#msgBase}/messages/${id}.awp?verbe=get&mode=destinataire`, { anneeMessages: this.#year });
    const html = d.content ? Buffer.from(d.content, "base64").toString("utf8") : "";
    const text = html
      .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n").trim();
    return {
      subject: d.subject || "", date: d.date || "", from: d.from?.name || [d.from?.prenom, d.from?.nom].filter(Boolean).join(" "),
      text, files: (d.files || []).map((f) => f.libelle || f.name).filter(Boolean),
    };
  }

  // Téléchargement d'un document : renvoie le fichier tel quel.
  async downloadDoc(id, type) {
    if (!/^\d+$/.test(String(id)) || !/^[A-Za-z_]{1,40}$/.test(String(type))) throw new Error("Document invalide.");
    const res = await this.#send(`/v3/telechargement.awp?verbe=get&fichierId=${id}&leTypeDeFichier=${type}`, { forceDownload: 0 });
    const ct = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (ct.includes("json")) {
      let msg = "Document indisponible.";
      try { msg = JSON.parse(buffer.toString("utf8")).message || msg; } catch {}
      throw new Error(msg);
    }
    return { buffer, type: ct };
  }

  #loginBody(identifiant, motdepasse) {
    return {
      identifiant,
      motdepasse: encodeURIComponent(motdepasse),
      isReLogin: false,
      uuid: "",
      fa: this.fa,
      ...(this.fa[0] || {}),
    };
  }

  #accept(json) {
    const a = json.data?.accounts?.[0];
    if (!a) throw new Error("Compte introuvable.");
    this.account = a;
    this.studentId = a.typeCompte === "E" ? a.id : a.profile?.eleves?.[0]?.id;
    return { needs2fa: false, account: this.publicAccount() };
  }

  async login(identifiant, motdepasse) {
    this.fa = loadFa(identifiant);
    let json = await this.#call("/v3/login.awp", this.#loginBody(identifiant, motdepasse), { fresh: true });

    if (json.code === 250 && this.fa.length) {
      // Jeton de confiance refusé : on l'oublie et on redemande la question.
      this.fa = [];
      saveFa(identifiant, []);
    }
    if (json.code === 250) return this.#start2fa();
    if (json.code !== 200) throw new Error(`${json.message || "Connexion refusée"} (code ${json.code})`);
    return this.#accept(json);
  }

  async #start2fa() {
    const json = await this.#call("/v3/connexion/doubleauth.awp?verbe=get");
    const data = json.data || {};
    const props = Array.isArray(data.propositions) ? data.propositions : [];
    if (json.code !== 200 || !data.question || !props.length) {
      throw new Error(`Pas de question de sécurité reçue (code ${json.code}${json.message ? " : " + json.message : ""}).`);
    }
    this.rawPropositions = props;
    return { needs2fa: true, question: unb64(data.question), propositions: props.map(unb64) };
  }

  // `choix` = texte de la proposition choisie, tel qu'affiché dans le navigateur.
  async answer2fa(identifiant, motdepasse, choix) {
    const i = this.rawPropositions.findIndex((p) => unb64(p) === choix);
    const raw = i >= 0 ? this.rawPropositions[i] : Buffer.from(choix, "utf8").toString("base64");

    const v = await this.#call("/v3/connexion/doubleauth.awp?verbe=post", { choix: raw });
    if (v.code !== 200 || !v.data?.cn) throw new Error(`Mauvaise réponse à la question de sécurité (code ${v.code}).`);

    this.fa = [{ cn: v.data.cn, cv: v.data.cv }];
    saveFa(identifiant, this.fa);

    const json = await this.#call("/v3/login.awp", this.#loginBody(identifiant, motdepasse));
    if (json.code === 250) return { needs2fa: true };
    if (json.code !== 200) throw new Error(`${json.message || "Connexion refusée"} (code ${json.code})`);
    return this.#accept(json);
  }

  publicAccount() {
    const a = this.account || {};
    return {
      prenom: a.prenom,
      nom: a.nom,
      etablissement: a.nomEtablissement,
      classe: a.profile?.classe?.libelle,
    };
  }

  async fetchAll() {
    if (!this.account) throw new Error("Non connecté.");
    const id = this.studentId;
    const get = async (path, body) => {
      const json = await this.#call(path, body);
      if ([520, 525].includes(json.code)) throw new Error("Session expirée, reconnecte-toi.");
      return json.data;
    };

    // Les appels sont faits l'un après l'autre : le jeton change à chaque réponse.
    const n = await get(`/v3/eleves/${id}/notes.awp?verbe=get`, { anneeScolaire: "" });
    const notes = n?.notes || [];

    const h = await get(`/v3/Eleves/${id}/cahierdetexte.awp?verbe=get`);
    const devoirs = [];
    for (const date of Object.keys(h || {}).sort().slice(0, 6)) {
      const d = await get(`/v3/Eleves/${id}/cahierdetexte/${date}.awp?verbe=get`);
      for (const m of d?.matieres || []) {
        if (m.aFaire) {
          devoirs.push({
            date,
            matiere: m.matiere,
            fait: m.aFaire.effectue,
            interro: m.interrogation,
            texte: unb64(m.aFaire.contenu || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          });
        }
      }
    }

    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 13); // deux semaines
    const edt = await get(`/v3/E/${id}/emploidutemps.awp?verbe=get`, {
      dateDebut: iso(monday),
      dateFin: iso(sunday),
      avecTrous: false,
    });

    // Sections facultatives : une erreur ici ne doit jamais bloquer le reste.
    const opt = async (label, fn) => { try { return await fn(); } catch (e) { console.log(`[ED] Section « ${label} » indisponible : ${e.message}`); return null; } };
    const vs = await opt("vie scolaire", () => this.#data(`/v3/eleves/${id}/viescolaire.awp?verbe=get`, {}));
    const school = vs ? { absences: vs.absencesRetards || [], sanctions: vs.sanctionsEncouragements || [] } : null;
    const mr = await opt("messages", () => this.#data(`${this.#msgBase}/messages.awp?force=false&typeRecuperation=received&idClasseur=0&orderBy=date&order=desc&query=&onlyRead=&page=0&itemsPerPage=40&getAll=0&verbe=get`, { anneeMessages: this.#year }));
    const messages = mr ? (mr.messages?.received || []).map((m) => ({ id: m.id, from: m.from?.name || [m.from?.prenom, m.from?.nom].filter(Boolean).join(" "), subject: m.subject || "", date: m.date || "", read: !!m.read, files: (m.files || []).length })) : null;
    const dr = await opt("documents", () => this.#data("/v3/elevesDocuments.awp?verbe=get&archive=", {}));
    const CATS = [["administratifs", "Administratifs"], ["factures", "Factures"], ["viescolaire", "Vie scolaire"], ["notes", "Notes et bulletins"]];
    const docs = dr ? CATS.flatMap(([k, label]) => (dr[k] || []).map((x) => ({ cat: label, id: x.id, libelle: x.libelle, date: x.date, type: x.type }))) : null;

    return { notes, periodes: n?.periodes || [], devoirs, edt: Array.isArray(edt) ? edt : [], school, messages, docs };
  }
}
