// Tableau de bord, menu « Plus », version ordinateur, stock par catégories et produits vétérinaires utilisés dans un soin.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8801';
const S = require('os').tmpdir();
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
};
let n = 0;
const rec = (collection, data, id) => ({ id: id ?? `seed-${collection.replace('_', '')}-${String(++n).padStart(5, '0')}`, collection, data, updatedAt: Date.now() + n, deleted: false });

(async () => {
  // jeu de données réaliste, créé directement sur le serveur
  const token = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).token;
  const L = [];
  const bande = rec('bande', { nom: 'Bande 1', batiment: '', souche: 'ISA Brown', dateArrivee: iso(-120), ageArriveeSemaines: 18, effectifInitial: 500, origine: '', prixAchat: 600000 }, 'seed-bande-1');
  L.push(bande);
  for (let j = 45; j >= 0; j--) L.push(rec('ramassage', { bandeId: bande.id, date: iso(-j), bons: 420 - (j < 5 ? 25 : 0) + (j % 4) * 3, feles: 5, casses: 3 }));
  L.push(rec('mortalite', { bandeId: bande.id, date: iso(-10), nombre: 3, type: 'mort', cause: '' }));
  L.push(rec('treso_mvt', { date: iso(-200), compte: 'caisse', montant: 500000, note: '' }));
  const client = rec('client', { nom: 'Maquis Chez Awa', telephone: '', type: 'maquis' }, 'seed-client-1');
  const client2 = rec('client', { nom: 'Boucherie Koffi', telephone: '', type: 'revendeur' }, 'seed-client-2');
  L.push(client, client2);
  for (let m = 0; m < 10; m++) {
    const date = iso(-m * 30 - 3);
    const v = rec('vente', { date, clientId: m % 2 ? client.id : client2.id, activite: m % 3 ? 'poules' : 'bovins', lignes: [{ article: 'autre', libelle: 'x', quantite: 1, unite: 'unite', prixUnitaire: 90000 + m * 15000 }], total: 90000 + m * 15000, note: '' });
    L.push(v);
    if (m > 1) L.push(rec('paiement', { date, clientId: v.data.clientId, venteId: v.id, montant: v.data.total, mode: m % 2 ? 'mobile_money' : 'especes', note: '' }));
    L.push(rec('depense', { date, activite: 'commun', categorie: 'Électricité et eau', libelle: '', montant: 20000 + m * 2000, compte: 'caisse' }));
    L.push(rec('achat', { date, fournisseurId: '', activite: 'poules', articleId: '', libelle: 'Aliment', quantite: 0, total: 150000 + m * 5000, montantPaye: 150000 + m * 5000, compte: 'caisse', peremption: '' }));
  }
  const lot = rec('lot', { nom: 'Embouche Tabaski', type: 'embouche', espece: 'ovin', dateDebut: iso(-60), poidsObjectif: 40, dateObjectif: iso(30) }, 'seed-lot-1');
  L.push(lot);
  for (let i = 0; i < 6; i++) {
    const a = rec('animal', { boucle: `E${i + 1}`, nom: '', espece: i < 4 ? 'ovin' : 'bovin', race: '', sexe: i % 3 ? 'F' : 'M', naissance: iso(-400), naissanceEstimee: false, robe: '', origine: 'ne', mereId: '', pereId: '', miseBasId: '', vendeur: '', prixAchat: 0, poidsAchat: 0, dateAchat: '' }, `seed-animal-${i}`);
    L.push(a, rec('mvt_animal', { animalId: a.id, date: iso(-60), type: 'entree', motif: 'naissance', lotId: i < 4 ? lot.id : '', venteId: '', note: '' }));
    if (i < 4) L.push(rec('pesee', { animalId: a.id, date: iso(-50), poids: 25, methode: 'balance' }), rec('pesee', { animalId: a.id, date: iso(-2), poids: 25 + 7 + i, methode: 'balance' }));
  }
  L.push(rec('mvt_animal', { animalId: 'seed-animal-5', date: iso(-20), type: 'sortie', motif: 'mort', lotId: '', venteId: '', note: '' }));
  // stock : une catégorie de chaque, dont un produit vétérinaire qui périme bientôt
  const aliment = rec('article', { nom: 'Aliment ponte', unite: 'sac', categorie: 'aliment', seuil: 5, kgParUnite: 50 }, 'seed-art-aliment');
  const vaccin = rec('article', { nom: 'Vaccin Newcastle', unite: 'flacon', categorie: 'medicament', seuil: 2, kgParUnite: 1 }, 'seed-art-vaccin');
  const autre = rec('article', { nom: 'Désinfectant', unite: 'bidon', categorie: 'autre', seuil: 0, kgParUnite: 1 }, 'seed-art-autre');
  L.push(aliment, vaccin, autre);
  L.push(rec('stock_mvt', { articleId: aliment.id, date: iso(-20), type: 'entree', quantite: 30, peremption: '', achatId: '', alimentId: '', note: '' }));
  L.push(rec('stock_mvt', { articleId: vaccin.id, date: iso(-20), type: 'entree', quantite: 6, peremption: iso(20), achatId: '', alimentId: '', note: '' }));
  L.push(rec('stock_mvt', { articleId: autre.id, date: iso(-20), type: 'entree', quantite: 3, peremption: '', achatId: '', alimentId: '', note: '' }));
  for (let i = 0; i < L.length; i += 150) await call('/api/sync', { since: 0, changes: L.slice(i, i + 150) }, token);

  const b = await chromium.launch();
  const ouvrir = async (viewport, mobile) => {
    const ctx = await b.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1.5 });
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

  // --- ordinateur
  const D = await ouvrir({ width: 1366, height: 800 }, false);
  ok(await D.locator('.menu-bureau').isVisible() && !(await D.locator('.onglets').isVisible()), 'ordinateur : menu latéral visible, barre du bas masquée');
  const liens = (await D.locator('.menu-bureau a').allInnerTexts()).map((t) => t.trim());
  ok(['Tableau de bord', 'Équipe et droits', 'Journal', 'Réglages', 'Reprendre mes données', 'Notifications'].every((t) => liens.some((l) => l.includes(t))), 'ordinateur : tout le menu est accessible (' + liens.length + ' entrées)');
  await D.locator('.menu-bureau a', { hasText: 'Tableau de bord' }).click();
  await D.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  await D.waitForTimeout(600);
  const kpis = norm(await D.locator('.kpis').first().innerText());
  ok(await D.locator('.kpi').count() >= 14 && (await D.locator('figure.courbe svg').count()) >= 5, `tableau de bord : ${await D.locator('.kpi').count()} chiffres clés et ${await D.locator('figure.courbe svg').count()} graphiques`);
  ok(/ventes/i.test(kpis) && /argent disponible/i.test(kpis) && /à encaisser/i.test(kpis), 'tableau de bord : ventes, argent disponible, à encaisser');
  const tout = norm(await D.locator('main').innerText());
  ok(/taux de ponte moyen\s*\n\s*8\d,\d %/i.test(tout), 'tableau de bord : taux de ponte moyen calculé (~84 %)');
  ok(/plus de 90 jours/i.test(tout) && /meilleurs clients/i.test(tout) && /embouche tabaski/i.test(tout), 'tableau de bord : créances par ancienneté, meilleurs clients, lots d’embouche');
  ok(/Vaccin Newcastle : périme dans 20 jour/.test(tout), 'tableau de bord : alerte de péremption du vaccin');
  await D.screenshot({ path: S + '/tableau-bureau.png', fullPage: true });
  await D.locator('.kpis').first().screenshot({ path: S + '/kpis.png' }).catch(() => {});

  // --- stock par catégories
  await D.locator('.menu-bureau a', { hasText: 'Stocks' }).click();
  await D.getByRole('heading', { name: '💊 Produits vétérinaires' }).waitFor();
  ok(await D.getByText('💊 Vaccin Newcastle').isVisible() && await D.getByText('🌽 Aliment ponte').isVisible() && await D.getByText('📦 Désinfectant').isVisible(), 'stock : 3 catégories (aliments, produits vétérinaires, autres) avec leurs articles');
  await D.getByRole('button', { name: /Produits vétérinaires \(1\)/ }).click();
  await D.waitForTimeout(200);
  ok((await D.getByText('🌽 Aliment ponte').count()) === 0 && await D.getByText('💊 Vaccin Newcastle').isVisible(), 'stock : filtre « Produits vétérinaires »');

  // --- un soin qui utilise le produit du stock
  await D.goto(BASE + '/#/moutons');
  await D.getByRole('link', { name: /E1/ }).first().click();
  await D.getByRole('button', { name: /Soin/ }).first().click();
  await D.locator('label', { hasText: /^Produit pris dans le stock/ }).locator('select').selectOption({ label: 'Vaccin Newcastle' });
  await D.getByLabel('Quantité utilisée').fill('2');
  await D.getByRole('button', { name: 'Enregistrer' }).click();
  await D.getByText('Soin enregistré').waitFor();
  await D.goto(BASE + '/#/stocks');
  await D.getByText('4 flacon').first().waitFor({ timeout: 5000 });
  ok(true, 'un soin avec 2 flacons du stock : le stock de vaccin passe de 6 à 4');
  await D.getByRole('link', { name: /Vaccin Newcastle/ }).first().click();
  await D.getByText(/Utilisé pour un soin : 2 flacon/).waitFor();
  ok(true, 'mouvement « Utilisé pour un soin » visible dans la fiche du produit');

  // --- téléphone : l'onglet « Plus » existe
  const M = await ouvrir({ width: 390, height: 844 }, true);
  const onglets = (await M.locator('.onglets a').allInnerTexts()).map((t) => t.replace(/\W+/g, ' ').trim());
  ok(onglets.some((t) => t.includes('Plus')) && onglets.length === 5, 'téléphone : l’onglet « Plus » est dans la barre du bas (' + onglets.join(', ') + ')');
  await M.locator('.onglets a', { hasText: 'Plus' }).click();
  await M.getByRole('heading', { name: 'Plus' }).waitFor();
  const plus = norm(await M.locator('main').innerText());
  ok(['Tableau de bord', 'Argent', 'Rapports', 'Équipe', 'Journal', 'Réglages', 'Notifications', 'Code PIN', 'Se déconnecter'].every((t) => plus.includes(t)), 'téléphone : le menu « Plus » donne accès à tout');
  await M.goto(BASE + '/#/tableau');
  await M.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  await M.waitForTimeout(500);
  await M.screenshot({ path: S + '/tableau-tel.png', fullPage: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
