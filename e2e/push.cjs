// Test des notifications : un faux service de push reçoit les messages chiffrés du serveur et les déchiffre comme le ferait un téléphone.
const http = require('http');
const crypto = require('crypto');
const BASE = process.env.BASE || 'http://localhost:8796';
const PORT = 9871;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const b64u = (b) => Buffer.from(b).toString('base64url');

function nouveauTelephone() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { ecdh, pub: ecdh.getPublicKey(), auth: crypto.randomBytes(16) };
}

function dechiffrer(tel, corps) {
  const salt = corps.subarray(0, 16);
  const idlen = corps[20];
  const asPub = corps.subarray(21, 21 + idlen);
  const chiffre = corps.subarray(21 + idlen);
  const secret = tel.ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, tel.auth, Buffer.concat([Buffer.from('WebPush: info\0'), tel.pub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(chiffre.subarray(chiffre.length - 16));
  let clair = Buffer.concat([d.update(chiffre.subarray(0, chiffre.length - 16)), d.final()]);
  let i = clair.length - 1;
  while (i >= 0 && clair[i] === 0) i--;
  return JSON.parse(clair.subarray(0, i).toString()); // le dernier octet utile est le délimiteur 0x02
}

const recus = [];
const telephones = {};
const faux = http.createServer((req, res) => {
  const morceaux = [];
  req.on('data', (c) => morceaux.push(c));
  req.on('end', () => {
    const chemin = req.url;
    if (chemin === '/gone') { res.statusCode = 410; return res.end(); }
    try { recus.push({ chemin, entetes: req.headers, message: dechiffrer(telephones[chemin], Buffer.concat(morceaux)) }); } catch (e) { recus.push({ chemin, erreur: String(e) }); }
    res.statusCode = 201;
    res.end();
  });
});

const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const rec = (id, collection, data) => ({ id, collection, data, updatedAt: Date.now(), deleted: false });
const attendre = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

(async () => {
  await new Promise((r) => faux.listen(PORT, '127.0.0.1', r));
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  await call('/api/users', { name: 'Kouassi', password: 'ouvrier-123', role: 'ouvrier' }, owner);
  await call('/api/users', { name: 'Dr Yao', password: 'veto-12345', role: 'veterinaire' }, owner);
  const ouvrier = (await call('/api/login', { name: 'Kouassi', password: 'ouvrier-123' })).body.token;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const heure = new Date().getUTCHours();
  await call('/api/sync', { since: 0, changes: [
    rec('bande-0001', 'bande', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: '2026-10-01', ageArriveeSemaines: 0 }),
    rec('sante-0001', 'sante', { bandeId: 'bande-0001', date: aujourdhui, type: 'vaccin', produit: 'Newcastle', note: '', rappel: aujourdhui }),
    rec('client-001', 'client', { nom: 'Awa' }),
    rec('vente-0001', 'vente', { date: '2026-08-01', clientId: 'client-001', activite: 'poules', total: 50000, lignes: [], note: '' }),
    rec('reglages-ferme', 'reglage', { heureNotif: heure, decalageUtc: 0 })
  ] }, owner);

  const cle = (await call('/api/push/key', undefined, owner)).body.publicKey;
  ok(typeof cle === 'string' && Buffer.from(cle, 'base64url').length === 65 && Buffer.from(cle, 'base64url')[0] === 4, 'clé publique VAPID : 65 octets, format non compressé');
  ok((await call('/api/push/key', undefined, owner)).body.publicKey === cle, 'la clé reste la même d’un appel à l’autre');
  ok((await call('/api/push/subscribe', { endpoint: 'http://exemple.com/x', keys: { p256dh: 'a', auth: 'b' } }, owner)).status === 400, 'abonnement vers un site non sécurisé refusé');

  for (const [nom, token, chemin] of [['owner', owner, '/owner'], ['ouvrier', ouvrier, '/ouvrier']]) {
    const t = nouveauTelephone();
    telephones[chemin] = t;
    const r = await call('/api/push/subscribe', { endpoint: `http://127.0.0.1:${PORT}${chemin}`, keys: { p256dh: b64u(t.pub), auth: b64u(t.auth) }, prefs: ['rappels', 'creances', 'poules', 'stock', 'misesbas', 'delais'] }, token);
    ok(r.status === 200, `téléphone du ${nom} abonné`);
  }
  const mort = await call('/api/push/subscribe', { endpoint: `http://127.0.0.1:${PORT}/gone`, keys: { p256dh: b64u(nouveauTelephone().pub), auth: b64u(crypto.randomBytes(16)) } }, owner);
  ok(mort.status === 200, 'abonnement vers un service qui répondra « disparu »');

  // envoi de test
  const t1 = await call('/api/push/test', {}, owner);
  await attendre(() => recus.some((x) => x.chemin === '/owner'));
  const m1 = recus.find((x) => x.chemin === '/owner');
  ok(m1 && !m1.erreur, 'message de test reçu et déchiffré par le téléphone' + (m1?.erreur ? ' : ' + m1.erreur : ''));
  ok(m1 && /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(m1.entetes.authorization) && m1.entetes['content-encoding'] === 'aes128gcm' && m1.entetes.ttl === '86400', 'en-têtes conformes (VAPID, aes128gcm, TTL)');
  ok(m1 && m1.message.body.includes('Newcastle'), 'le message contient le rappel de vaccin du jour');
  ok(m1 && m1.message.title.startsWith('Ferme360'), 'titre : ' + m1?.message.title);

  // résumé du matin (déclenché comme le ferait la tâche planifiée)
  recus.length = 0;
  const s = await fetch(BASE + '/cdn-cgi/handler/scheduled?cron=0+*+*+*+*');
  ok(s.status === 200, 'tâche planifiée déclenchée');
  await attendre(() => recus.filter((x) => x.chemin !== '/gone').length >= 2);
  const mo = recus.find((x) => x.chemin === '/owner');
  const mw = recus.find((x) => x.chemin === '/ouvrier');
  ok(mo && /Awa doit 50\s?000 FCFA/.test(mo.message.body), 'le propriétaire reçoit la créance ancienne');
  ok(mw && mw.message.body.includes('Newcastle') && !/FCFA/.test(mw.message.body), 'l’ouvrier reçoit le rappel mais aucune information d’argent');
  const n = recus.length;
  await fetch(BASE + '/cdn-cgi/handler/scheduled?cron=0+*+*+*+*');
  await new Promise((r) => setTimeout(r, 1500));
  ok(recus.length === n, 'un seul résumé par jour (pas de doublon à la deuxième exécution)');

  // choix des catégories
  recus.length = 0;
  const t = telephones['/owner'];
  await call('/api/push/subscribe', { endpoint: `http://127.0.0.1:${PORT}/owner`, keys: { p256dh: b64u(t.pub), auth: b64u(t.auth) }, prefs: ['stock'] }, owner);
  await call('/api/push/test', {}, owner);
  await attendre(() => recus.some((x) => x.chemin === '/owner'));
  const m2 = recus.find((x) => x.chemin === '/owner');
  ok(m2 && !m2.message.body.includes('Newcastle') && !/FCFA/.test(m2.message.body), 'après avoir décoché les rappels et créances, ils ne sont plus envoyés');
  faux.close();
})().catch((e) => { console.error(e); process.exit(1); });
