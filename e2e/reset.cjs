// Remise à zéro de la ferme : le serveur et TOUS les téléphones sont vidés, les comptes et les réglages sont gardés.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8802';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let n = 0;
const rec = (collection, data, id) => ({ id: id ?? `seed-${collection}-${String(++n).padStart(4, '0')}`, collection, data, updatedAt: Date.now() + n, deleted: false });
const collections = (P) => P.evaluate(() => new Promise((res) => { const r = indexedDB.open('ferme360'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => res(g.result.map((x) => x.collection).sort()); }; }));

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  await call('/api/users', { name: 'Awa', password: 'gerant-123', role: 'gerant' }, owner);
  const gerant = (await call('/api/login', { name: 'Awa', password: 'gerant-123' })).body.token;
  await call('/api/sync', { since: 0, epoch: '', changes: [
    rec('bande', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: '2026-10-01', ageArriveeSemaines: 0, batiment: '', souche: '', origine: '', prixAchat: 0 }),
    rec('client', { nom: 'Maquis Awa', telephone: '', type: 'maquis' }),
    rec('carnet', { texte: 'note de test 1' }), rec('carnet', { texte: 'note de test 2' }),
    rec('reglage', { heureNotif: 7, decalageUtc: 0 }, 'reglages-ferme')
  ] }, owner);

  ok((await call('/api/reset', { confirmation: 'REMETTRE A ZERO' }, gerant)).status === 403, 'le gérant ne peut pas remettre la ferme à zéro (403)');
  ok((await call('/api/reset', { confirmation: 'oui' }, owner)).status === 400, 'confirmation incorrecte refusée (400)');

  const b = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const ouvrir = async () => {
    const ctx = await b.newContext(phone);
    const P = await ctx.newPage();
    P.on('pageerror', (e) => console.log('pageerror', e.message));
    P.on('dialog', (d) => d.accept());
    await P.goto(BASE);
    await P.getByLabel('Nom', { exact: true }).fill('Jacques');
    await P.getByLabel(/Mot de passe/).fill('motdepasse1');
    await P.getByRole('button', { name: 'Se connecter' }).click();
    await P.getByText('Bonjour, Jacques').waitFor();
    await P.getByText('À jour', { exact: true }).waitFor({ timeout: 15000 });
    return P;
  };
  const A = await ouvrir();
  const B = await ouvrir();
  ok((await collections(A)).length === 5 && (await collections(B)).length === 5, 'deux téléphones ont les 5 enregistrements de départ');

  // --- remise à zéro depuis le téléphone A
  await A.goto(BASE + '/#/sauvegarde');
  await A.getByRole('heading', { name: 'Remettre la ferme à zéro' }).waitFor();
  const bouton = A.getByRole('button', { name: 'Effacer toutes les données' });
  ok(await bouton.isDisabled(), 'le bouton reste bloqué tant que la confirmation n’est pas tapée');
  await A.getByLabel(/Pour confirmer, tapez/).fill('remettre a zero');
  await bouton.click();
  await A.getByText(/La ferme est remise à zéro/).waitFor({ timeout: 10000 });
  await A.waitForTimeout(2500);
  ok(JSON.stringify(await collections(A)) === JSON.stringify(['reglage']), 'téléphone A : tout est effacé, seuls les réglages sont gardés');

  // --- le téléphone B se vide à sa prochaine synchronisation
  await B.locator('.pastille').click();
  await B.waitForFunction(() => new Promise((res) => { const r = indexedDB.open('ferme360'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => res(g.result.length === 1 && g.result[0].collection === 'reglage'); }; }), null, { timeout: 15000 });
  ok(true, 'téléphone B : vidé à sa synchronisation (les réglages sont gardés)');
  await B.goto(BASE + '/#/carnet');
  await B.getByText(/Aucune note/).waitFor();
  ok(true, 'téléphone B : le carnet est vide');

  // --- serveur : comptes gardés, anciennes données parties, ancien téléphone invité à se vider
  const ancien = await call('/api/sync', { since: 0, epoch: '', changes: [rec('carnet', { texte: 'ancienne donnée' })] }, gerant);
  ok(ancien.body.resetRequired === true, 'serveur : un téléphone resté sur l’ancienne époque est invité à se vider, ses saisies ne sont pas acceptées');
  ok((await call('/api/login', { name: 'Awa', password: 'gerant-123' })).status === 200, 'les comptes de l’équipe sont conservés');
  const s = await call('/api/sync', { since: 0, epoch: ancien.body.epoch, changes: [] }, owner);
  ok(s.body.records.length === 1 && s.body.records[0].collection === 'reglage', 'serveur : il ne reste que les réglages');

  // --- on repart sur de nouvelles données, qui se synchronisent normalement
  await B.getByPlaceholder(/moutons vaccinés/).fill('première vraie note');
  await B.getByRole('button', { name: 'Ajouter' }).click();
  await B.waitForTimeout(2500);
  await A.goto(BASE + '/#/carnet');
  await A.locator('.pastille').click();
  await A.getByText('première vraie note').waitFor({ timeout: 10000 });
  ok(true, 'après la remise à zéro, une nouvelle saisie du téléphone B arrive sur le téléphone A');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
