// API Ferme360 : connexion et synchronisation hors-ligne (Cloudflare Workers + D1)

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
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attempts (name TEXT PRIMARY KEY COLLATE NOCASE, fails INTEGER NOT NULL, locked_until INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS records (
     id TEXT PRIMARY KEY,
     seq INTEGER NOT NULL,
     collection TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     author TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS records_seq ON records(seq)`,
  `CREATE INDEX IF NOT EXISTS records_collection ON records(collection)`
];

let schemaReady: Promise<void> | null = null;

function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
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

async function readSession(req: Request, db: D1Database): Promise<Session | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const [body, sig] = auth.slice(7).split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await secretKey(db), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Session;
    return s.exp > Date.now() ? s : null;
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
  const code = String(b?.code ?? '');
  if (!env.SETUP_CODE || !safeEqual(code, env.SETUP_CODE)) return fail(403, "Code d'installation incorrect.");
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
  const u = await env.DB.prepare(`SELECT id,name,role,salt,hash FROM users WHERE name=?`)
    .bind(name)
    .first<{ id: string; name: string; role: string; salt: string; hash: string }>();
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
  await env.DB.prepare(`DELETE FROM attempts WHERE name=?`).bind(name).run();
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

  const stmts: D1PreparedStatement[] = [];
  for (const c of changes) {
    if (!validRecord(c)) return fail(400, 'Enregistrement invalide.');
    const data = JSON.stringify(c.data);
    if (data.length > MAX_DATA_BYTES) return fail(413, 'Enregistrement trop volumineux.');
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
  if (stmts.length) await env.DB.batch(stmts);

  const rows = await env.DB.prepare(
    `SELECT id,seq,collection,data,updated_at,deleted,author FROM records WHERE seq > ? ORDER BY seq LIMIT ?`
  )
    .bind(since, PAGE_SIZE + 1)
    .all<{ id: string; seq: number; collection: string; data: string; updated_at: number; deleted: number; author: string }>();
  const page = rows.results.slice(0, PAGE_SIZE);
  const more = rows.results.length > PAGE_SIZE;
  return json({
    serverTime: Date.now(),
    seq: page.length ? page[page.length - 1].seq : since,
    more,
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return fail(404, 'Introuvable.');
    try {
      await ensureSchema(env.DB);
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/status') {
        return json({ configured: (await userCount(env.DB)) > 0, serverTime: Date.now() });
      }
      if (route === 'POST /api/setup') return await setup(req, env);
      if (route === 'POST /api/login') return await login(req, env);

      const session = await readSession(req, env.DB);
      if (!session) return fail(401, 'Connexion requise.');
      if (route === 'GET /api/me') return json({ user: { name: session.name, role: session.role } });
      if (route === 'POST /api/sync') return await sync(req, env, session);
      return fail(404, 'Introuvable.');
    } catch (e) {
      console.error(e);
      return fail(500, 'Erreur du serveur.');
    }
  }
};
