// Modifier / supprimer avec contrôle d'intégrité, paramètres de stock, demi-kilos.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8805';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const T = Date.now();
const rec = (collection, data, id) => ({ id, collection, data, updatedAt: T, deleted: false });
const ID = { c1: 'client-avec-vente', c2: 'client-sans-vente', v1: 'vente-du-client1', a1: 'article-utilise-1', a2: 'article-libre-22', m1: 'mouvement-stock-1', an1: 'animal-101-aaaa1', an2: 'animal-202-aaaa2', an3: 'animal-303-aaaa3', e1: 'entree-an1-aaaaa', e2: 'entree-an2-aaaaa', e3: 'entree-an3-aaaaa', b1: 'bande-avec-ramass', r1: 'ramassage-bande1' };
const animal = (id, boucle) => rec('animal', { boucle, nom: '', espece: 'ovin', race: 'Peul', sexe: 'F', naissance: '2025-01-01', naissanceEstimee: false, robe: '', origine: 'ne', mereId: '', pereId: '', miseBasId: '', vendeur: '', prixAchat: 0, poidsAchat: 0, dateAchat: '' }, id);
const entree = (id, animalId) => rec('mvt_animal', { animalId, date: '2026-01-01', type: 'entree', motif: 'naissance', lotId: '', venteId: '', note: '' }, id);
const sync = async (token) => (await call('/api/sync', { since: 0, epoch: '', changes: [] }, token)).body.records;
const attendre = async (token, test, ms = 10000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const s = await sync(token); if (test(s)) return s; await new Promise((r) => setTimeout(r, 400)); } return sync(token); };

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  const semis = await call('/api/sync', { since: 0, epoch: '', changes: [
    rec('client', { nom: 'Maquis Awa', telephone: '', type: 'maquis' }, ID.c1),
    rec('client', { nom: 'Boutique Moussa', telephone: '', type: 'revendeur' }, ID.c2),
    rec('vente', { date: '2026-11-20', clientId: ID.c1, lignes: [{ article: 'oeufs', libelle: '', quantite: 2, unite: 'plateau', prixUnitaire: 2500 }], total: 5000, reprise: false }, ID.v1),
    rec('article', { nom: 'Aliment ponte', unite: 'sac', categorie: 'aliment', seuil: 0, kgParUnite: 50 }, ID.a1),
    rec('article', { nom: 'Pelle', unite: 'unité', categorie: 'autre', seuil: 0, kgParUnite: 1 }, ID.a2),
    rec('stock_mvt', { articleId: ID.a1, date: '2026-11-01', type: 'entree', quantite: 20, peremption: '', achatId: '', alimentId: '', note: '' }, ID.m1),
    animal(ID.an1, '101'), animal(ID.an2, '202'), animal(ID.an3, '303'),
    entree(ID.e1, ID.an1), entree(ID.e2, ID.an2), entree(ID.e3, ID.an3),
    rec('pesee', { animalId: ID.an1, date: '2026-11-10', poids: 30, methode: 'balance' }, 'pesee-animal-101-1'),
    rec('bande', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: '2026-10-01', ageArriveeSemaines: 0, batiment: '', souche: '', origine: '', prixAchat: 0 }, ID.b1),
    rec('ramassage', { bandeId: ID.b1, date: '2026-11-20', bons: 300, feles: 0, casses: 0 }, ID.r1),
    rec('mortalite', { bandeId: ID.b1, date: '2026-11-21', nombre: 5, type: 'mort', cause: '' }, 'mortalite-bande-1-1')
  ] }, owner);
  if (semis.status !== 200) console.log('SEMIS', semis.status, JSON.stringify(semis.body).slice(0, 200));

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

  // ---------- clients ----------
  await P.goto(BASE + `/#/clients/${ID.c1}`);
  await P.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await P.getByText(/Suppression impossible/).waitFor();
  ok(/1 vente\(s\)/.test(await P.locator('p.erreur[role=alert]').innerText()), 'client avec une vente : suppression refusée, avec le détail (1 vente)');
  let s = await sync(owner);
  ok(s.find((r) => r.id === ID.c1 && !r.deleted), 'le client protégé existe toujours');

  await P.goto(BASE + `/#/clients/${ID.c2}`);
  await P.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await P.getByLabel('Nom', { exact: true }).fill('Boutique Moussa & fils');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText('Modifications enregistrées').waitFor();
  s = await attendre(owner, (x) => x.find((r) => r.id === ID.c2)?.data.nom === 'Boutique Moussa & fils');
  ok(s.find((r) => r.id === ID.c2).data.nom === 'Boutique Moussa & fils', 'client modifié : le nouveau nom arrive sur le serveur');
  await P.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await P.waitForURL(/#\/clients$/);
  s = await attendre(owner, (x) => x.find((r) => r.id === ID.c2)?.deleted === true);
  ok(s.find((r) => r.id === ID.c2)?.deleted === true, 'client sans vente : supprimé après confirmation');

  // ---------- article : paramètres de stock ----------
  await P.goto(BASE + `/#/stocks/${ID.a1}`);
  await P.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await P.getByText(/des mouvements existent déjà/).first().waitFor();
  ok((await P.getByText(/des mouvements existent déjà/).count()) >= 2, 'article avec mouvements : unité et catégorie verrouillées');
  await P.getByLabel('Stock minimum (alerte)').fill('5');
  await P.getByLabel('Stock maximum (facultatif)').fill('40');
  await P.getByLabel('Délai de livraison (facultatif)').fill('7');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText('Modifications enregistrées').waitFor();
  s = await attendre(owner, (x) => x.find((r) => r.id === ID.a1)?.data.delaiReappro === 7);
  const art = s.find((r) => r.id === ID.a1).data;
  ok(art.seuil === 5 && art.stockMax === 40 && art.delaiReappro === 7, 'article : minimum 5, maximum 40, délai 7 jours enregistrés');
  await P.getByText('Point de commande').first().waitFor();
  ok(true, 'la fiche affiche le point de commande');
  await P.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await P.getByText(/Suppression impossible/).waitFor();
  ok(/mouvement\(s\) de stock/.test(await P.locator('p.erreur[role=alert]').innerText()), 'article avec stock : suppression refusée');
  // maximum inférieur au minimum refusé
  await P.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await P.getByLabel('Stock maximum (facultatif)').fill('2');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  ok(await P.getByText(/maximum doit être supérieur/).first().isVisible(), 'maximum inférieur au minimum : refusé');
  await P.getByRole('button', { name: 'Annuler' }).click();

  // sortie de 17 sacs → reste 3 (< minimum 5) : alerte et « À commander »
  await P.getByRole('button', { name: /Sortie/ }).click();
  await P.getByLabel('Quantité').fill('17');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText('Sortie enregistrée').waitFor();
  await P.getByText(/stock bas/i).first().waitFor();
  ok(true, 'stock sous le minimum : alerte « stock bas »');
  await P.goto(BASE + '/#/stocks');
  await P.getByRole('heading', { name: /À commander/ }).waitFor();
  ok(await P.getByText(/Commande conseillée : 37 sac/).isVisible(), 'liste « À commander » : 37 sacs conseillés pour atteindre le maximum de 40');

  // ---------- demi-kilos ----------
  await P.getByRole('button', { name: /Autre article/ }).click();
  await P.getByLabel('Nom', { exact: true }).fill('Sel minéral');
  await P.getByLabel('Unité de stock').fill('kg');
  await P.getByRole('button', { name: "Créer l'article" }).click();
  await P.getByText('Article créé').waitFor();
  s = await attendre(owner, (x) => x.some((r) => r.data.nom === 'Sel minéral'));
  const sel = s.find((r) => r.data.nom === 'Sel minéral');
  await P.goto(BASE + `/#/stocks/${sel.id}`);
  await P.getByRole('button', { name: /Compter/ }).click();
  await P.getByLabel('Quantité comptée').fill('2.5');
  await P.getByRole('button', { name: 'Corriger le stock' }).click();
  await P.getByText(/2,5 kg/).first().waitFor({ timeout: 8000 });
  ok(true, 'un stock de 2,5 kg (demi-kilo) est accepté et affiché « 2,5 kg »');
  await P.getByRole('button', { name: /Sortie/ }).click();
  await P.getByLabel('Quantité').fill('0.5');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText(/2 kg/).first().waitFor({ timeout: 8000 });
  ok(true, 'sortie de 0,5 kg : le stock passe de 2,5 à 2 kg');
  await P.getByRole('button', { name: /Sortie/ }).click();
  ok((await P.getByLabel('Quantité').getAttribute('inputmode')) === 'decimal', 'clavier décimal sur les quantités (virgule et point disponibles)');
  await P.getByRole('button', { name: 'Annuler' }).click();

  // ---------- animaux ----------
  await P.goto(BASE + `/#/animaux/${ID.an1}`);
  await P.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await P.getByLabel('Numéro de boucle').fill('202');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  ok(await P.getByText(/déjà utilisé/).first().isVisible(), 'animal : boucle déjà utilisée refusée');
  await P.getByRole('button', { name: 'Annuler' }).click();
  await P.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await P.getByText(/Suppression impossible/).waitFor();
  ok(/pesée/.test(await P.locator('p.erreur[role=alert]').innerText()), 'animal pesé : suppression refusée (pesée)');

  await P.goto(BASE + `/#/animaux/${ID.an3}`);
  await P.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await P.getByLabel('Nom (facultatif)').fill('Blanchette');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText('Modifications enregistrées').waitFor();
  await P.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await P.waitForURL(/#\/moutons$/);
  s = await attendre(owner, (x) => x.find((r) => r.id === ID.an3)?.deleted === true && x.find((r) => r.id === ID.e3)?.deleted === true);
  ok(s.find((r) => r.id === ID.an3)?.deleted && s.find((r) => r.id === ID.e3)?.deleted, 'animal sans historique : supprimé avec son entrée au registre');
  ok(!s.find((r) => r.id === ID.an2)?.deleted, 'les autres animaux ne sont pas touchés');

  // ---------- bande ----------
  await P.goto(BASE + `/#/poules/${ID.b1}`);
  await P.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await P.getByLabel('Poules à l’arrivée').fill('3');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  ok(await P.getByText(/déjà enregistrées comme mortes/).first().isVisible(), 'bande : effectif inférieur aux mortalités déjà saisies refusé');
  await P.getByLabel('Poules à l’arrivée').fill('420');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText('Modifications enregistrées').waitFor();
  s = await attendre(owner, (x) => x.find((r) => r.id === ID.b1)?.data.effectifInitial === 420);
  ok(s.find((r) => r.id === ID.b1).data.effectifInitial === 420, 'bande : effectif corrigé à 420');
  await P.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
  await P.getByText(/Suppression impossible/).waitFor();
  ok(/ramassage/.test(await P.locator('p.erreur[role=alert]').innerText()), 'bande avec ramassages : suppression refusée');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
