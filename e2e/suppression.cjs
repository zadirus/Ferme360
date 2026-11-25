// Protection de l'historique : qui peut supprimer, fenêtre de correction, corbeille.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8807';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const jour = new Date().toISOString().slice(0, 10);
const rec = (collection, id, data, updatedAt = Date.now(), deleted = false) => ({ id, collection, data, updatedAt, deleted });
const ram = (bons) => ({ bandeId: 'bande-protection-1', date: jour, bons, feles: 0, casses: 0 });
const envoi = async (token, changes) => (await call('/api/sync', { since: 0, epoch: '', changes }, token)).body;
const etat = async (token, id) => (await envoi(token, [])).records.find((r) => r.id === id);

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  await call('/api/users', { name: 'Awa Employee', password: 'employee-1', role: 'ouvrier' }, owner);
  await call('/api/users', { name: 'Moussa Gerant', password: 'gerant-123', role: 'gerant' }, owner);
  const emp = (await call('/api/login', { name: 'Awa Employee', password: 'employee-1' })).body.token;
  const ger = (await call('/api/login', { name: 'Moussa Gerant', password: 'gerant-123' })).body.token;
  const H3 = 3 * 3600 * 1000;
  await envoi(owner, [
    rec('bande', 'bande-protection-1', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: '2026-10-01', ageArriveeSemaines: 0, batiment: '', souche: '', origine: '', prixAchat: 0 }),
    rec('ramassage', 'ram-du-patron-0001', ram(300))
  ]);

  // 1. l'employé annule sa propre saisie récente (erreur de frappe)
  let r = await envoi(emp, [rec('ramassage', 'ram-employe-frais-1', ram(3000))]);
  r = await envoi(emp, [rec('ramassage', 'ram-employe-frais-1', ram(3000), Date.now() + 1, true)]);
  ok(r.rejected.length === 0 && (await etat(owner, 'ram-employe-frais-1')).deleted === true, 'employé : sa propre saisie récente peut être annulée');

  // 2. saisie d'un autre : refusée
  r = await envoi(emp, [rec('ramassage', 'ram-du-patron-0001', ram(300), Date.now() + 2, true)]);
  ok(r.rejected.includes('ram-du-patron-0001') && !(await etat(owner, 'ram-du-patron-0001')).deleted, 'employé : la saisie d’un autre n’est pas supprimable (refusée par le serveur)');

  // 3. sa propre saisie, mais modifiée entre-temps : refusée
  await envoi(emp, [rec('ramassage', 'ram-employe-modif-1', ram(320))]);
  await envoi(emp, [rec('ramassage', 'ram-employe-modif-1', ram(321), Date.now() + 3)]);
  r = await envoi(emp, [rec('ramassage', 'ram-employe-modif-1', ram(321), Date.now() + 4, true)]);
  ok(r.rejected.includes('ram-employe-modif-1') && !(await etat(owner, 'ram-employe-modif-1')).deleted, 'employé : une saisie déjà modifiée est « validée », plus supprimable');

  // 4. sa propre saisie, mais ancienne (> 2 h) : refusée
  await envoi(emp, [rec('ramassage', 'ram-employe-vieux-1', ram(310), Date.now() - H3)]);
  r = await envoi(emp, [rec('ramassage', 'ram-employe-vieux-1', ram(310), Date.now() + 5, true)]);
  ok(r.rejected.includes('ram-employe-vieux-1'), 'employé : une saisie de plus de 2 heures n’est plus supprimable');

  // 5. le gérant peut supprimer
  r = await envoi(ger, [rec('ramassage', 'ram-employe-vieux-1', ram(310), Date.now() + 6, true)]);
  ok(r.rejected.length === 0 && (await etat(owner, 'ram-employe-vieux-1')).deleted === true, 'gérant : peut supprimer une saisie validée');

  // 6. la suppression reste visible dans le journal
  const j = (await call('/api/journal?limite=50', undefined, owner)).body.entrees;
  ok(j.some((e) => e.recordId === 'ram-employe-vieux-1' && e.action === 'suppression' && e.author === 'Moussa Gerant'), 'le journal garde qui a supprimé et quand');

  // ---------- interface ----------
  await envoi(owner, [
    rec('client', 'client-corbeille-01', { nom: 'Maquis Awa', telephone: '', type: 'maquis' }),
    rec('vente', 'vente-corbeille-001', { date: jour, clientId: 'client-corbeille-01', lignes: [{ article: 'oeufs', libelle: '', quantite: 2, unite: 'plateau', prixUnitaire: 2500 }], total: 5000 }),
    rec('paiement', 'paiement-corbeille-1', { date: jour, clientId: 'client-corbeille-01', venteId: 'vente-corbeille-001', montant: 5000, mode: 'especes' }),
    rec('oeufs_mvt', 'oeufs-corbeille-0001', { date: jour, type: 'vente', quantite: 60, note: 'vente', venteId: 'vente-corbeille-001' })
  ]);
  const b = await chromium.launch();
  const ouvrir = async (nom, mdp, attente) => {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    P.on('pageerror', (e) => console.log('pageerror', e.message));
    P.on('dialog', (d) => d.accept());
    await P.goto(BASE);
    await P.getByLabel('Nom', { exact: true }).fill(nom);
    await P.getByLabel(/Mot de passe/).fill(mdp);
    await P.getByRole('button', { name: 'Se connecter' }).click();
    await P.getByText(/Bonjour/).waitFor();
    await P.getByText('À jour', { exact: true }).waitFor({ timeout: 15000 });
    return P;
  };
  const E = await ouvrir('Awa Employee', 'employee-1');
  await E.goto(BASE + '/#/poules/bande-protection-1');
  await E.getByText(/Ramassage : 300 bons/).waitFor();
  ok((await E.locator('li', { hasText: '300 bons' }).getByRole('button', { name: 'Supprimer' }).count()) === 0, 'employé : pas de bouton « Supprimer » sur la saisie d’un autre');
  ok((await E.locator('li', { hasText: '321 bons' }).getByRole('button', { name: 'Supprimer' }).count()) === 1, 'employé : bouton visible sur sa propre saisie récente (le serveur refusera si elle a été modifiée)');
  const nbCorbeilleEmp = await E.goto(BASE + '/#/corbeille').then(() => E.getByText(/Accès non autorisé/).count());
  ok(nbCorbeilleEmp === 1, 'employé : la corbeille lui est refusée');
  await E.context().close();

  const G = await ouvrir('Moussa Gerant', 'gerant-123');
  await G.goto(BASE + '/#/clients/client-corbeille-01');
  await G.getByText(/Vente : 5\s?000/).waitFor();
  await G.locator('li', { hasText: /Vente : 5\s?000/ }).getByRole('button', { name: 'Supprimer' }).click();
  await G.getByText(/Vente : 5\s?000/).waitFor({ state: 'detached', timeout: 8000 });
  await G.goto(BASE + '/#/corbeille');
  await G.getByRole('heading', { name: 'Corbeille' }).waitFor();
  await G.getByRole('button', { name: 'Restaurer' }).first().waitFor();
  ok((await G.locator('li', { hasText: 'Vente' }).count()) === 1 && (await G.locator('li', { hasText: 'Paiement' }).count()) === 0, 'corbeille : la vente supprimée apparaît seule (paiement et sortie d’œufs liés avec elle)');
  await G.locator('li', { hasText: 'Vente' }).getByRole('button', { name: 'Restaurer' }).click();
  await G.getByText(/Restauré, avec 2 saisie/).waitFor();
  ok(true, 'restauration : la vente revient avec 2 saisies liées');
  let fin = 0; let s;
  while (fin++ < 20) { s = (await envoi(owner, [])).records; if (['vente-corbeille-001', 'paiement-corbeille-1', 'oeufs-corbeille-0001'].every((id) => s.find((x) => x.id === id && !x.deleted))) break; await G.waitForTimeout(500); }
  ok(['vente-corbeille-001', 'paiement-corbeille-1', 'oeufs-corbeille-0001'].every((id) => s.find((x) => x.id === id && !x.deleted)), 'sur le serveur : vente, paiement et sortie d’œufs sont tous de retour');

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
