// Étiquettes libres et achats d'œufs chez des fournisseurs.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8804';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let n = 0;
const rec = (collection, data, id) => ({ id: id ?? `seed-${collection.replace(/_/g, "")}-${String(++n).padStart(4, "0")}`, collection, data, updatedAt: Date.now() + n, deleted: false });
const animal = (boucle) => rec('animal', { boucle, nom: '', espece: 'ovin', race: 'Peul', sexe: 'F', naissance: '2025-01-01', naissanceEstimee: false, robe: '', origine: 'ne', mereId: '', pereId: '', miseBasId: '', vendeur: '', prixAchat: 0, poidsAchat: 0, dateAchat: '' }, `seed-animal-${boucle}-aaaa`);

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  const a1 = animal('101'), a2 = animal('202');
  const semis = await call('/api/sync', { since: 0, epoch: '', changes: [
    rec('bande', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: '2026-10-01', ageArriveeSemaines: 0, batiment: '', souche: '', origine: '', prixAchat: 0 }),
    rec('ramassage', { bandeId: 'x', date: '2026-11-20', bons: 340, feles: 0, casses: 0 }),
    a1, a2,
    rec('mvt_animal', { animalId: a1.id, date: '2026-01-01', type: 'entree', motif: 'naissance', lotId: '', venteId: '', note: '' }),
    rec('mvt_animal', { animalId: a2.id, date: '2026-01-01', type: 'entree', motif: 'naissance', lotId: '', venteId: '', note: '' }),
    rec('client', { nom: 'Maquis Awa', telephone: '', type: 'maquis' }),
    rec('client', { nom: 'Boutique Moussa', telephone: '', type: 'revendeur' }),
    rec('article', { nom: 'Aliment ponte', unite: 'sac', categorie: 'aliment', seuil: 0, kgParUnite: 50 })
  ] }, owner);
  if (semis.status !== 200 || (semis.body.rejected ?? []).length) console.log('SEMIS', semis.status, JSON.stringify(semis.body).slice(0, 300));

  const b = await chromium.launch();
  const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  P.on('dialog', (d) => d.accept());
  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: 'Se connecter' }).click();
  await P.getByText('Bonjour, Jacques').waitFor();
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 15000 });

  // ---------- achat d'œufs ----------
  await P.goto(BASE + '/#/oeufs');
  await P.getByText('Œufs en stock').waitFor();
  ok(await P.locator('.stats').first().innerText().then((t) => /340/.test(t)), 'stock de départ : 340 œufs ramassés');
  await P.getByRole('button', { name: /Acheter des œufs/ }).click();
  await P.getByLabel('Fournisseur').selectOption('__nouveau');
  await P.getByLabel('Nom du fournisseur').fill('Mme Koné');
  await P.getByLabel('Quantité achetée').fill('10');
  await P.getByLabel('Prix d’un plateau').fill('2000');
  await P.getByLabel('Payé maintenant').fill('5000');
  ok(await P.getByText(/Total :/).innerText().then((t) => /20\s?000/.test(t)), 'total calculé : 10 plateaux × 2 000 = 20 000 FCFA');
  ok(await P.getByText(/Reste à payer/).innerText().then((t) => /15\s?000/.test(t)), 'reste à payer au fournisseur : 15 000 FCFA');
  await P.getByRole('button', { name: "Enregistrer l'achat" }).click();
  await P.getByText(/Achat de .* enregistré/).waitFor();
  const stockTexte = await P.locator('.stats').first().innerText();
  ok(/640/.test(stockTexte), 'stock = 340 ramassés + 300 achetés = 640 œufs');
  ok(await P.getByText('Coût moyen du plateau acheté').isVisible() && /2\s?000/.test(await P.locator('.stats').nth(1).innerText()), 'coût moyen du plateau acheté : 2 000 FCFA');
  ok(await P.getByText(/Achat à un fournisseur : 300 œufs/).isVisible(), 'le mouvement « Achat à un fournisseur » apparaît dans la liste');
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  let s = (await call('/api/sync', { since: 0, epoch: '', changes: [] }, owner)).body.records;
  const achat = s.find((r) => r.collection === 'achat');
  ok(achat && achat.data.total === 20000 && achat.data.montantPaye === 5000 && achat.data.activite === 'poules', 'achat enregistré : 20 000 dus, 5 000 payés, activité poules');
  ok(s.some((r) => r.collection === 'fournisseur' && r.data.nom === 'Mme Koné'), 'le fournisseur a été créé');

  await P.goto(BASE + '/#/argent');
  await P.getByText(/Mme Koné/).first().waitFor({ timeout: 8000 }).then(() => ok(true, 'Argent : le fournisseur et sa dette sont visibles'), () => ok(false, 'Argent : le fournisseur n’apparaît pas'));

  await P.goto(BASE + '/#/oeufs');
  await P.getByText(/Achat à un fournisseur/).waitFor();
  await P.getByRole('button', { name: 'Supprimer' }).first().click();
  await P.getByText('Aucun mouvement', { exact: false }).waitFor({ timeout: 8000 });
  ok(/340/.test(await P.locator('.stats').first().innerText()), 'suppression de l’achat : le stock revient à 340');
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  s = (await call('/api/sync', { since: 0, epoch: '', changes: [] }, owner)).body.records;
  ok(!s.some((r) => r.collection === 'achat' && !r.deleted), 'l’achat est supprimé avec son entrée en stock');

  // ---------- étiquettes ----------
  await P.goto(BASE + `/#/animaux/${a1.id}`);
  await P.getByLabel('Nouvelle étiquette').fill('Tabaski');
  await P.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await P.getByLabel('Nouvelle étiquette').fill('tabaski');
  await P.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await P.getByLabel('Nouvelle étiquette').fill('À surveiller');
  await P.keyboard.press('Enter');
  await P.getByRole('button', { name: 'Retirer À surveiller' }).waitFor();
  ok((await P.locator('.champ-etiquettes .etiquette').count()) === 2, 'fiche animal : 2 étiquettes (le doublon « tabaski » est ignoré)');

  await P.goto(BASE + '/#/moutons');
  await P.getByText('101').first().waitFor();
  ok(await P.locator('a.carte .etiquette', { hasText: 'Tabaski' }).isVisible(), 'liste des moutons : l’étiquette s’affiche sur la carte');
  ok((await P.locator('a.carte').filter({ hasText: '202' }).count()) === 1, 'avant filtre : 2 animaux dans le registre');
  await P.locator('.etiquettes.filtre button', { hasText: 'Tabaski' }).click();
  ok((await P.locator('a.carte').filter({ hasText: '202' }).count()) === 0 && (await P.locator('a.carte').filter({ hasText: '101' }).count()) === 1, 'filtre « Tabaski » : seul l’animal 101 reste');
  await P.locator('.etiquettes.filtre button', { hasText: 'Tabaski' }).click();
  ok((await P.locator('a.carte').filter({ hasText: '202' }).count()) === 1, 'filtre retiré : tous les animaux reviennent');

  // suggestion réutilisée sur un client
  const clientId = s.find((r) => r.collection === 'client' && r.data.nom === 'Maquis Awa').id;
  await P.goto(BASE + `/#/clients/${clientId}`);
  await P.getByRole('button', { name: '+ Tabaski' }).click();
  await P.getByRole('button', { name: 'Retirer Tabaski' }).waitFor();
  await P.goto(BASE + '/#/clients');
  await P.locator('.etiquettes.filtre button', { hasText: 'Tabaski' }).click();
  ok((await P.locator('a.carte').count()) === 1, 'clients : filtre par étiquette (1 client sur 2)');

  // l'étiquette arrive sur l'autre appareil / le serveur
  for (let i = 0; i < 20; i++) {
    s = (await call('/api/sync', { since: 0, epoch: '', changes: [] }, owner)).body.records;
    if (s.find((r) => r.id === a1.id)?.data.tags) break;
    await P.waitForTimeout(500);
  }
  ok(JSON.stringify(s.find((r) => r.id === a1.id).data.tags) === JSON.stringify(['Tabaski', 'À surveiller']), 'les étiquettes sont synchronisées avec le serveur');

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
