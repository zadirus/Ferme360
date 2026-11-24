// API Ferme360 : connexion et synchronisation hors-ligne (Cloudflare Workers + D1)

import { CATEGORIES_ROLE, construireAlertes, resumeNotification, type CategorieNotif, type DonneesAlertes } from '../src/alertes';
import { collectionsLisibles, peutEcrire, ROLES_CREABLES, type Role } from '../src/droits';
import { chiffrerPush, genererCleVapid, jetonVapid } from '../src/push/chiffrement';
import { appliquerReglages, ID_REGLAGES, REGLAGES } from '../src/reglages';

interface Env {
  DB: D1Database;
  SETUP_CODE?: string;
}

interface SyncRecord {
  id: string;
  collection: string;
  data: unknown;
  updatedAt: number;
  deleted: boolean;
}

const TOKEN_DAYS = 90;
const MAX_CHANGES = 200;
const PAGE_SIZE = 300;
const MAX_DATA_BYTES = 100_000;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     role TEXT NOT NULL,
     salt TEXT NOT NULL,
     hash TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS attempts (name TEXT PRIMARY KEY COLLATE NOCASE, fails INTEGER NOT NULL, locked_until INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS records (
     id TEXT PRIMARY KEY,
     seq INTEGER NOT NULL,
     collection TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     author TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS journal (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     record_id TEXT NOT NULL,
     collection TEXT NOT NULL,
     action TEXT NOT NULL,
     author TEXT NOT NULL,
     at INTEGER NOT NULL,
     before TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS journal_at ON journal(at)`,
  `CREATE TABLE IF NOT EXISTS push_subs (
     endpoint TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     prefs TEXT NOT NULL,
     created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS records_seq ON records(seq)`,
  `CREATE INDEX IF NOT EXISTS records_collection ON records(collection)`
];

let schemaReady: Promise<void> | null = null;

function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      // bases créées avant l'étape 6 : ajout de la colonne « actif »
      const cols = await db.prepare(`PRAGMA table_info(users)`).all<{ name: string }>();
      if (!cols.results.some((c) => c.name === 'active')) {
        await db.prepare(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`).run();
      }
      await db
        .prepare(`INSERT OR IGNORE INTO settings(key, value) VALUES ('token_secret', ?)`)
        .bind(randomHex(32))
        .run();
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

// ---------- utilitaires ----------

const enc = new TextEncoder();

function randomHex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const c of arr) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const fail = (status: number, message: string) => json({ error: message }, status);

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 100_000 },
    key,
    256
  );
  return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- jeton de session ----------

interface Session {
  uid: string;
  name: string;
  role: string;
  exp: number;
}

async function secretKey(db: D1Database): Promise<CryptoKey> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key='token_secret'`).first<{ value: string }>();
  return crypto.subtle.importKey('raw', hexToBytes(row!.value), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

async function makeToken(db: D1Database, s: Omit<Session, 'exp'>): Promise<string> {
  const payload: Session = { ...s, exp: Date.now() + TOKEN_DAYS * 86_400_000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await secretKey(db), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

// Le rôle et l'état du compte sont relus en base à chaque requête : un compte désactivé ou changé de profil est pris en compte tout de suite.
async function readSession(req: Request, db: D1Database): Promise<Session | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const [body, sig] = auth.slice(7).split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await secretKey(db), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Session;
    if (s.exp <= Date.now()) return null;
    const u = await db.prepare(`SELECT id,name,role,active FROM users WHERE id=?`).bind(s.uid).first<{ id: string; name: string; role: string; active: number }>();
    if (!u || u.active !== 1) return null;
    return { uid: u.id, name: u.name, role: u.role, exp: s.exp };
  } catch {
    return null;
  }
}

// ---------- routes ----------

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function userCount(db: D1Database): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
  return r?.n ?? 0;
}

async function setup(req: Request, env: Env): Promise<Response> {
  const b = await readBody(req);
  const name = String(b?.name ?? '').trim();
  const password = String(b?.password ?? '');
  const code = String(b?.code ?? '').trim();
  // Si un secret SETUP_CODE est défini, il est exigé. Sinon l'installation reste ouverte
  // jusqu'à la création du compte propriétaire (ensuite elle est fermée définitivement).
  const expected = env.SETUP_CODE?.trim();
  if (expected && !safeEqual(code, expected)) return fail(403, "Code d'installation incorrect.");
  if (name.length < 2 || name.length > 60) return fail(400, 'Le nom doit avoir entre 2 et 60 caractères.');
  if (password.length < 8) return fail(400, 'Le mot de passe doit avoir au moins 8 caractères.');
  if ((await userCount(env.DB)) > 0) return fail(409, 'La ferme est déjà installée.');
  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  // la contrainte d'unicité sur le nom protège contre deux installations simultanées
  try {
    await env.DB.prepare(`INSERT INTO users(id,name,role,salt,hash,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(id, name, 'owner', salt, hash, Date.now())
      .run();
  } catch {
    return fail(409, 'La ferme est déjà installée.');
  }
  if ((await userCount(env.DB)) > 1) {
    await env.DB.prepare(`DELETE FROM users WHERE id=?`).bind(id).run();
    return fail(409, 'La ferme est déjà installée.');
  }
  const token = await makeToken(env.DB, { uid: id, name, role: 'owner' });
  return json({ token, user: { name, role: 'owner' } });
}

async function login(req: Request, env: Env): Promise<Response> {
  const b = await readBody(req);
  const name = String(b?.name ?? '').trim();
  const password = String(b?.password ?? '');
  if (!name || !password) return fail(400, 'Nom et mot de passe requis.');
  const now = Date.now();
  const att = await env.DB.prepare(`SELECT fails, locked_until FROM attempts WHERE name=?`)
    .bind(name)
    .first<{ fails: number; locked_until: number }>();
  if (att && att.locked_until > now) return fail(429, 'Trop d’essais. Réessayez dans quelques minutes.');
  const u = await env.DB.prepare(`SELECT id,name,role,salt,hash,active FROM users WHERE name=?`)
    .bind(name)
    .first<{ id: string; name: string; role: string; salt: string; hash: string; active: number }>();
  const hash = await hashPassword(password, u?.salt ?? '00'.repeat(16));
  if (!u || !safeEqual(hash, u.hash)) {
    const fails = (att?.fails ?? 0) + 1;
    await env.DB.prepare(
      `INSERT INTO attempts(name,fails,locked_until) VALUES (?,?,?)
       ON CONFLICT(name) DO UPDATE SET fails=excluded.fails, locked_until=excluded.locked_until`
    )
      .bind(name, fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MS : 0)
      .run();
    return fail(401, 'Nom ou mot de passe incorrect.');
  }
  if (u.active !== 1) return fail(403, 'Ce compte est désactivé. Voyez le propriétaire.');
  await env.DB.prepare(`DELETE FROM attempts WHERE name=?`).bind(name).run();
  // le journal est conservé 24 mois
  await env.DB.prepare(`DELETE FROM journal WHERE at < ?`).bind(Date.now() - 730 * 86_400_000).run();
  const token = await makeToken(env.DB, { uid: u.id, name: u.name, role: u.role });
  return json({ token, user: { name: u.name, role: u.role } });
}

function validRecord(r: unknown): r is SyncRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    /^[A-Za-z0-9-]{8,64}$/.test(x.id) &&
    typeof x.collection === 'string' &&
    /^[a-z_]{1,40}$/.test(x.collection) &&
    typeof x.updatedAt === 'number' &&
    Number.isFinite(x.updatedAt) &&
    typeof x.deleted === 'boolean' &&
    x.data !== undefined
  );
}

const NEXT_SEQ = `(SELECT COALESCE(MAX(seq),0)+1 FROM records)`;

async function sync(req: Request, env: Env, session: Session): Promise<Response> {
  const b = await readBody(req);
  if (!b) return fail(400, 'Requête invalide.');
  const since = Number.isInteger(b.since) ? (b.since as number) : 0;
  const changes = Array.isArray(b.changes) ? b.changes : [];
  if (changes.length > MAX_CHANGES) return fail(413, 'Trop de modifications à la fois.');

  const valides: SyncRecord[] = [];
  const rejected: string[] = [];
  for (const c of changes) {
    if (!validRecord(c)) return fail(400, 'Enregistrement invalide.');
    // droits du profil : ce qui n'est pas permis est refusé côté serveur
    if (!peutEcrire(session.role, c.collection)) rejected.push(c.id);
    else valides.push(c);
  }

  if (valides.length) {
    // valeurs actuelles, pour le journal des modifications (100 paramètres maximum par requête D1)
    const avant = new Map<string, { data: string; updated_at: number; deleted: number }>();
    const lots: SyncRecord[][] = [];
    for (let i = 0; i < valides.length; i += 90) lots.push(valides.slice(i, i + 90));
    const lus = await env.DB.batch(
      lots.map((l) =>
        env.DB.prepare(`SELECT id,data,updated_at,deleted FROM records WHERE id IN (${l.map(() => '?').join(',')})`).bind(...l.map((x) => x.id))
      )
    );
    for (const r of lus) for (const x of r.results as Array<{ id: string; data: string; updated_at: number; deleted: number }>) avant.set(x.id, x);

    const stmts: D1PreparedStatement[] = [];
    const maintenant = Date.now();
    for (const c of valides) {
      const data = JSON.stringify(c.data);
      if (data.length > MAX_DATA_BYTES) return fail(413, 'Enregistrement trop volumineux.');
      const ancien = avant.get(c.id);
      if (ancien && c.updatedAt >= ancien.updated_at && (ancien.data !== data || (ancien.deleted === 1) !== c.deleted)) {
        const action = c.deleted && ancien.deleted !== 1 ? 'suppression' : 'modification';
        stmts.push(
          env.DB.prepare(`INSERT INTO journal(record_id,collection,action,author,at,before) VALUES (?,?,?,?,?,?)`).bind(
            c.id, c.collection, action, session.name, maintenant, ancien.data.slice(0, 4000)
          )
        );
      }
      // la dernière modification gagne (horloge corrigée côté téléphone)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO records(id,seq,collection,data,updated_at,deleted,author)
           VALUES (?, ${NEXT_SEQ}, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             seq=${NEXT_SEQ}, collection=excluded.collection, data=excluded.data,
             updated_at=excluded.updated_at, deleted=excluded.deleted, author=excluded.author
           WHERE excluded.updated_at >= records.updated_at`
        ).bind(c.id, c.collection, data, c.updatedAt, c.deleted ? 1 : 0, session.name)
      );
    }
    await env.DB.batch(stmts);
  }

  // lecture : seulement les collections permises au profil
  const lisibles = collectionsLisibles(session.role);
  const filtre = lisibles === null ? '' : ` AND collection IN (${lisibles.map(() => '?').join(',')})`;
  const rows = await env.DB.prepare(
    `SELECT id,seq,collection,data,updated_at,deleted,author FROM records WHERE seq > ?${filtre} ORDER BY seq LIMIT ?`
  )
    .bind(since, ...(lisibles ?? []), PAGE_SIZE + 1)
    .all<{ id: string; seq: number; collection: string; data: string; updated_at: number; deleted: number; author: string }>();
  const page = rows.results.slice(0, PAGE_SIZE);
  const more = rows.results.length > PAGE_SIZE;
  return json({
    serverTime: Date.now(),
    seq: page.length ? page[page.length - 1].seq : since,
    more,
    rejected,
    user: { name: session.name, role: session.role },
    records: page.map((r) => ({
      id: r.id,
      collection: r.collection,
      data: JSON.parse(r.data),
      updatedAt: r.updated_at,
      deleted: r.deleted === 1,
      author: r.author
    }))
  });
}

// ---------- comptes (propriétaire seulement) ----------

async function listeComptes(env: Env): Promise<Response> {
  const r = await env.DB.prepare(`SELECT id,name,role,active,created_at FROM users ORDER BY created_at`).all<{ id: string; name: string; role: string; active: number; created_at: number }>();
  return json({ users: r.results.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active === 1, createdAt: u.created_at })) });
}

async function creerCompte(req: Request, env: Env): Promise<Response> {
  const b = await readBody(req);
  const name = String(b?.name ?? '').trim();
  const password = String(b?.password ?? '');
  const role = String(b?.role ?? '');
  if (name.length < 2 || name.length > 60) return fail(400, 'Le nom doit avoir entre 2 et 60 caractères.');
  if (password.length < 8) return fail(400, 'Le mot de passe doit avoir au moins 8 caractères.');
  if (!ROLES_CREABLES.some(([r]) => r === role)) return fail(400, 'Profil inconnu.');
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  try {
    await env.DB.prepare(`INSERT INTO users(id,name,role,salt,hash,created_at,active) VALUES (?,?,?,?,?,?,1)`)
      .bind(crypto.randomUUID(), name, role, salt, hash, Date.now())
      .run();
  } catch {
    return fail(409, 'Ce nom est déjà utilisé.');
  }
  return json({ ok: true });
}

async function modifierCompte(req: Request, env: Env, session: Session): Promise<Response> {
  const b = await readBody(req);
  const id = String(b?.id ?? '');
  const u = await env.DB.prepare(`SELECT id,role FROM users WHERE id=?`).bind(id).first<{ id: string; role: string }>();
  if (!u) return fail(404, 'Compte introuvable.');
  if (u.id === session.uid || u.role === 'owner') {
    if (b?.active === false || (b?.role !== undefined && b.role !== u.role)) return fail(400, 'Le compte du propriétaire ne peut être ni désactivé ni changé de profil.');
  }
  if (typeof b?.role === 'string' && b.role !== u.role) {
    if (!ROLES_CREABLES.some(([r]) => r === b.role)) return fail(400, 'Profil inconnu.');
    await env.DB.prepare(`UPDATE users SET role=? WHERE id=?`).bind(b.role, id).run();
  }
  if (typeof b?.active === 'boolean') await env.DB.prepare(`UPDATE users SET active=? WHERE id=?`).bind(b.active ? 1 : 0, id).run();
  if (typeof b?.password === 'string' && b.password !== '') {
    if (b.password.length < 8) return fail(400, 'Le mot de passe doit avoir au moins 8 caractères.');
    const salt = randomHex(16);
    await env.DB.prepare(`UPDATE users SET salt=?, hash=? WHERE id=?`).bind(salt, await hashPassword(b.password, salt), id).run();
  }
  return json({ ok: true });
}

async function changerMotDePasse(req: Request, env: Env, session: Session): Promise<Response> {
  const b = await readBody(req);
  const ancien = String(b?.ancien ?? '');
  const nouveau = String(b?.nouveau ?? '');
  if (nouveau.length < 8) return fail(400, 'Le nouveau mot de passe doit avoir au moins 8 caractères.');
  const u = await env.DB.prepare(`SELECT salt,hash FROM users WHERE id=?`).bind(session.uid).first<{ salt: string; hash: string }>();
  if (!u || !safeEqual(await hashPassword(ancien, u.salt), u.hash)) return fail(401, 'Mot de passe actuel incorrect.');
  const salt = randomHex(16);
  await env.DB.prepare(`UPDATE users SET salt=?, hash=? WHERE id=?`).bind(salt, await hashPassword(nouveau, salt), session.uid).run();
  return json({ ok: true });
}

async function journal(url: URL, env: Env): Promise<Response> {
  const limite = Math.min(200, Math.max(1, Number(url.searchParams.get('limite')) || 100));
  const r = await env.DB.prepare(`SELECT id,record_id,collection,action,author,at,before FROM journal ORDER BY id DESC LIMIT ?`)
    .bind(limite)
    .all<{ id: number; record_id: string; collection: string; action: string; author: string; at: number; before: string }>();
  return json({
    entrees: r.results.map((e) => {
      let avant: unknown = null;
      try { avant = JSON.parse(e.before); } catch { avant = null; }
      return { id: e.id, recordId: e.record_id, collection: e.collection, action: e.action, author: e.author, at: e.at, avant };
    })
  });
}

// ---------- notifications du matin ----------

async function reglage(db: D1Database, cle: string): Promise<string | null> {
  return (await db.prepare(`SELECT value FROM settings WHERE key=?`).bind(cle).first<{ value: string }>())?.value ?? null;
}

async function cleVapid(db: D1Database): Promise<{ privee: JsonWebKey; publique: string }> {
  let priv = await reglage(db, 'vapid_private');
  if (!priv) {
    const k = await genererCleVapid();
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES ('vapid_private', ?)`).bind(JSON.stringify(k.privee)),
      db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES ('vapid_public', ?)`).bind(k.publique)
    ]);
    priv = await reglage(db, 'vapid_private');
  }
  return { privee: JSON.parse(priv!) as JsonWebKey, publique: (await reglage(db, 'vapid_public'))! };
}

interface Abonnement { endpoint: string; user_id: string; p256dh: string; auth: string; prefs: string }

async function envoyerPush(db: D1Database, sub: Abonnement, charge: object): Promise<'ok' | 'mort' | 'erreur'> {
  try {
    const cles = await cleVapid(db);
    const jwt = await jetonVapid(new URL(sub.endpoint).origin, (await reglage(db, 'origin')) ?? 'https://ferme360.invalid', cles.privee, Math.floor(Date.now() / 1000) + 12 * 3600);
    const corps = await chiffrerPush(enc.encode(JSON.stringify(charge)), sub.p256dh, sub.auth);
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: `vapid t=${jwt}, k=${cles.publique}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
      body: corps
    });
    return r.status === 404 || r.status === 410 ? 'mort' : r.ok ? 'ok' : 'erreur';
  } catch (e) {
    console.error('push', e);
    return 'erreur';
  }
}

async function donneesAlertes(db: D1Database): Promise<DonneesAlertes> {
  const r = await db.prepare(`SELECT id,collection,data,updated_at FROM records WHERE deleted=0`).all<{ id: string; collection: string; data: string; updated_at: number }>();
  const par = new Map<string, unknown[]>();
  for (const x of r.results) {
    if (x.collection === 'reglage' && x.id === ID_REGLAGES) appliquerReglages(JSON.parse(x.data));
    const liste = par.get(x.collection) ?? [];
    liste.push({ ...JSON.parse(x.data), id: x.id, updatedAt: x.updated_at });
    par.set(x.collection, liste);
  }
  const g = (c: string) => (par.get(c) ?? []) as never[];
  return {
    bandes: g('bande'), ramassages: g('ramassage'), mortalites: g('mortalite'), santes: g('sante'), animaux: g('animal'), mvtsAnimaux: g('mvt_animal'),
    repro: g('repro'), misesBas: g('misebas'), soins: g('soin'), articles: g('article'), stockMvts: g('stock_mvt'), ventes: g('vente'),
    paiements: g('paiement'), clients: g('client')
  };
}

// Envoie à chaque téléphone abonné les alertes de son profil, selon ses choix. `test` : envoi immédiat à un seul utilisateur.
async function envoyerResume(env: Env, aujourdhui: string, userId?: string): Promise<{ envoyes: number; alertes: number }> {
  const d = await donneesAlertes(env.DB);
  const toutes = construireAlertes(d, aujourdhui);
  const subs = (
    await env.DB.prepare(`SELECT s.endpoint,s.user_id,s.p256dh,s.auth,s.prefs,u.role FROM push_subs s JOIN users u ON u.id=s.user_id WHERE u.active=1${userId ? ' AND s.user_id=?' : ''}`)
      .bind(...(userId ? [userId] : []))
      .all<Abonnement & { role: string }>()
  ).results;
  let envoyes = 0;
  for (const sub of subs) {
    const permises = CATEGORIES_ROLE[sub.role as Role] ?? [];
    const choisies = JSON.parse(sub.prefs) as CategorieNotif[];
    const alertes = toutes.filter((a) => permises.includes(a.categorie) && choisies.includes(a.categorie));
    if (!alertes.length && !userId) continue;
    const msg = alertes.length ? resumeNotification(alertes) : { titre: 'Ferme360 : test', corps: 'Les notifications fonctionnent sur ce téléphone. Rien à signaler aujourd’hui.' };
    const etat = await envoyerPush(env.DB, sub, { title: msg.titre, body: msg.corps, url: '/#/', tag: 'ferme360-resume' });
    if (etat === 'ok') envoyes++;
    if (etat === 'mort') await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint=?`).bind(sub.endpoint).run();
  }
  return { envoyes, alertes: toutes.length };
}

async function resumeDuMatin(env: Env): Promise<void> {
  await ensureSchema(env.DB);
  const stocke = await env.DB.prepare(`SELECT data FROM records WHERE id=? AND deleted=0`).bind(ID_REGLAGES).first<{ data: string }>();
  appliquerReglages(stocke ? JSON.parse(stocke.data) : {});
  const local = new Date(Date.now() + REGLAGES.decalageUtc * 3_600_000);
  if (local.getUTCHours() !== Math.round(REGLAGES.heureNotif)) return;
  const jour = local.toISOString().slice(0, 10);
  if ((await reglage(env.DB, 'resume_envoye')) === jour) return;
  await env.DB.prepare(`INSERT INTO settings(key,value) VALUES ('resume_envoye', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(jour).run();
  await envoyerResume(env, jour);
}

function endpointPermis(e: string): boolean {
  try {
    const u = new URL(e);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

async function routePush(req: Request, url: URL, env: Env, session: Session): Promise<Response | null> {
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/push/key') return json({ publicKey: (await cleVapid(env.DB)).publique });
  const b = req.method === 'POST' ? await readBody(req) : null;
  const permises = CATEGORIES_ROLE[session.role as Role] ?? [];
  const nettoie = (p: unknown) => (Array.isArray(p) ? p.filter((x): x is CategorieNotif => permises.includes(x as CategorieNotif)) : permises);
  if (route === 'POST /api/push/subscribe') {
    const keys = (b?.keys ?? {}) as { p256dh?: string; auth?: string };
    const endpoint = String(b?.endpoint ?? '');
    if (!endpointPermis(endpoint) || !keys.p256dh || !keys.auth) return fail(400, 'Abonnement invalide.');
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM push_subs WHERE user_id=? AND endpoint<>?`).bind(session.uid, endpoint).first<{ n: number }>();
    if ((n?.n ?? 0) >= 10) return fail(400, 'Trop de téléphones abonnés pour ce compte.');
    await env.DB.prepare(
      `INSERT INTO push_subs(endpoint,user_id,p256dh,auth,prefs,created_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, prefs=excluded.prefs`
    ).bind(endpoint, session.uid, keys.p256dh, keys.auth, JSON.stringify(nettoie(b?.prefs)), Date.now()).run();
    await env.DB.prepare(`INSERT INTO settings(key,value) VALUES ('origin', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(url.origin).run();
    return json({ ok: true });
  }
  if (route === 'POST /api/push/prefs') {
    await env.DB.prepare(`UPDATE push_subs SET prefs=? WHERE endpoint=? AND user_id=?`).bind(JSON.stringify(nettoie(b?.prefs)), String(b?.endpoint ?? ''), session.uid).run();
    return json({ ok: true });
  }
  if (route === 'POST /api/push/unsubscribe') {
    await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint=? AND user_id=?`).bind(String(b?.endpoint ?? ''), session.uid).run();
    return json({ ok: true });
  }
  if (route === 'POST /api/push/test') {
    const stocke = await env.DB.prepare(`SELECT data FROM records WHERE id=? AND deleted=0`).bind(ID_REGLAGES).first<{ data: string }>();
    appliquerReglages(stocke ? JSON.parse(stocke.data) : {});
    const r = await envoyerResume(env, new Date(Date.now() + REGLAGES.decalageUtc * 3_600_000).toISOString().slice(0, 10), session.uid);
    return json(r);
  }
  return null;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(resumeDuMatin(env).catch((e) => console.error('résumé du matin', e)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return fail(404, 'Introuvable.');
    try {
      await ensureSchema(env.DB);
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/status') {
        return json({ configured: (await userCount(env.DB)) > 0, needsCode: !!env.SETUP_CODE?.trim(), serverTime: Date.now() });
      }
      if (route === 'POST /api/setup') return await setup(req, env);
      if (route === 'POST /api/login') return await login(req, env);

      const session = await readSession(req, env.DB);
      if (!session) return fail(401, 'Connexion requise.');
      if (route === 'GET /api/me') return json({ user: { name: session.name, role: session.role } });
      if (route === 'POST /api/sync') return await sync(req, env, session);
      if (route === 'POST /api/password') return await changerMotDePasse(req, env, session);
      if (url.pathname.startsWith('/api/push/')) {
        const r = await routePush(req, url, env, session);
        if (r) return r;
      }
      if (url.pathname === '/api/users' || url.pathname === '/api/users/update' || url.pathname === '/api/journal') {
        if (session.role !== 'owner') return fail(403, 'Réservé au propriétaire.');
        if (route === 'GET /api/users') return await listeComptes(env);
        if (route === 'POST /api/users') return await creerCompte(req, env);
        if (route === 'POST /api/users/update') return await modifierCompte(req, env, session);
        if (route === 'GET /api/journal') return await journal(url, env);
      }
      return fail(404, 'Introuvable.');
    } catch (e) {
      console.error(e);
      return fail(500, 'Erreur du serveur.');
    }
  }
};
