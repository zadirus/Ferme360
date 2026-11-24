const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8790';
const S = require('os').tmpdir();
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
const futur = (j) => { const d = new Date(); d.setDate(d.getDate() + j); return d.toISOString().slice(0, 10); };

(async () => {
  const b = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = await b.newContext(phone);
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  P.on('dialog', (d) => d.accept());
  const tab = (n) => P.locator('.onglets a', { hasText: n }).click();
  const texte = async (sel) => norm(await P.locator(sel).first().innerText());
  const stat = (l) => P.locator('.stat', { hasText: l }).first();
  const envoyer = (n) => P.getByRole('button', { name: n }).click();

  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();
  ok(true, 'compte créé');
  await P.screenshot({ path: S + '/accueil0.png' });

  // solde de départ de la caisse
  await P.goto(BASE + '/#/argent'); await P.waitForTimeout(300);
  await P.getByRole('button', { name: 'Corriger un solde' }).click();
  await P.getByLabel('Solde réel').fill('400000');
  await envoyer('Corriger');
  await P.getByText(/corrigé/).waitFor();
  ok(norm(await stat('Caisse (espèces)').innerText()).includes('400 000'), 'solde de départ de la caisse : 400 000 FCFA');

  // bande + ramassage
  await P.goto(BASE + '/#/poules'); await P.waitForTimeout(300);
  await P.getByRole('button', { name: '+ Nouvelle bande' }).click();
  await P.getByLabel('Nom de la bande').fill('Bande 1');
  await P.getByLabel("Nombre de poules à l'arrivée").fill('400');
  await envoyer('Créer la bande');
  await P.getByRole('link', { name: /Bande 1/ }).click();
  await P.getByRole('button', { name: /Ramassage/ }).click();
  await P.getByLabel('Bons œufs').fill('340');
  await envoyer('Enregistrer');
  await P.getByText('Ramassage enregistré').waitFor();

  // articles et achats
  await tab('Stocks');
  await P.getByRole('button', { name: /Aliment$/ }).click();
  await P.getByLabel('Nom', { exact: true }).fill('Aliment ponte');
  await P.getByLabel('Alerte quand il en reste').fill('5');
  await envoyer("Créer l'article");
  await P.getByRole('button', { name: /Produit vétérinaire$/ }).click();
  await P.getByLabel('Catégorie').selectOption('medicament');
  await P.getByLabel('Nom', { exact: true }).fill('Vaccin Newcastle');
  await envoyer("Créer l'article");
  await P.getByText('Article créé').waitFor();

  await P.getByRole('button', { name: /Nouvel achat/ }).click();
  await P.getByLabel('Article du stock').selectOption({ label: 'Aliment ponte' });
  await P.getByLabel('Quantité achetée').fill('20');
  await P.getByLabel('Prix total').fill('340000');
  await envoyer("Enregistrer l'achat");
  await P.getByText(/Achat enregistré/).waitFor();

  await P.getByRole('button', { name: /Nouvel achat/ }).click();
  await P.getByLabel('Article du stock').selectOption({ label: 'Vaccin Newcastle' });
  await P.getByLabel('Quantité achetée').fill('10');
  await P.getByLabel('Date de péremption').fill(futur(25));
  await P.getByLabel('Prix total').fill('30000');
  await P.getByLabel('Payé maintenant').fill('0');
  await P.getByLabel('Fournisseur').selectOption('__nouveau');
  await P.getByLabel('Nom du fournisseur').fill('AgriPlus');
  await envoyer("Enregistrer l'achat");
  await P.getByText(/Achat enregistré/).waitFor();
  await P.getByText(/Vaccin Newcastle : périme dans 25 jour/).first().waitFor({ timeout: 5000 });
  ok(true, 'vaccin qui périme dans 25 jours : alerte affichée');

  // distribution d'aliment depuis le stock
  await P.goto(BASE + '/#/poules'); await P.waitForTimeout(300);
  await P.getByRole('link', { name: /Bande 1/ }).click();
  await P.getByRole('button', { name: /Aliment/ }).click();
  await P.getByLabel('Pris dans le stock').selectOption({ label: 'Aliment ponte' });
  await P.getByLabel('Quantité distribuée').fill('100');
  await envoyer('Enregistrer');
  await P.getByText('Aliment enregistré').waitFor();
  ok((await texte('.stat:has-text("Coût de l\'aliment")')).includes('34 000'), "coût de l'aliment : 2 sacs × 17 000 = 34 000 FCFA");
  await tab('Stocks');
  await P.getByRole('link', { name: /Aliment ponte/ }).click();
  ok((await texte('.stat:has-text("En stock")')).includes('18'), 'stock d’aliment : 20 − 2 sacs = 18');

  // vente à crédit
  await tab('Ventes');
  await P.getByRole('button', { name: /Nouvelle vente/ }).click();
  await P.locator('label:has-text("Client") select').first().selectOption('__nouveau');
  await P.getByLabel('Nom du client').fill('Maquis Chez Awa');
  await P.getByLabel('Quantité').fill('8');
  await P.getByLabel('Prix unitaire').fill('2500');
  await P.getByLabel('Payé maintenant').fill('12000');
  await envoyer('Enregistrer la vente');
  await P.getByText('Maquis Chez Awa').first().waitFor();
  ok((await texte('.stat:has-text("Doit")')).includes('8 000'), 'vente 20 000 FCFA, payé 12 000 → créance 8 000 FCFA');
  await P.screenshot({ path: S + '/client.png', fullPage: true });

  await P.goto(BASE + '/#/poules'); await P.waitForTimeout(300);
  await P.getByRole('link', { name: /Bande 1/ }).click().catch(() => {});
  await P.goto(BASE + '/#/oeufs');
  await P.getByText('Œufs en stock').waitFor();
  await P.waitForFunction(() => document.body.innerText.includes('3,3 plateaux'));
  ok(true, 'stock d’œufs : 340 − 8 plateaux = 100 œufs (3,3 plateaux)');

  // encaissement
  await P.goto(BASE + '/#/clients');
  await P.getByRole('link', { name: /Maquis Chez Awa/ }).click();
  await P.getByRole('button', { name: /Encaisser/ }).click();
  await P.getByLabel('Mode de paiement').selectOption('mobile_money');
  await envoyer('Enregistrer le paiement');
  await P.getByText(/Paiement de 8\s000/).waitFor();
  ok((await texte('.stat:has-text("à jour")')).includes('0 FCFA'), 'paiement de 8 000 par Mobile Money → client à jour');

  // soldes
  await P.goto(BASE + '/#/argent'); await P.waitForTimeout(300);
  await P.waitForFunction(() => document.body.innerText.replace(/[\u202f\u00a0]/g, ' ').includes('72 000'));
  const soldes = norm(await P.locator('.stats').innerText());
  ok(soldes.includes('72 000') && soldes.includes('8 000'), 'caisse 400 000 − 340 000 + 12 000 = 72 000 ; Mobile Money 8 000');
  ok(soldes.includes('30 000'), 'dette fournisseur AgriPlus : 30 000 FCFA');
  await P.screenshot({ path: S + '/argent.png', fullPage: true });
  await P.screenshot({ path: S + '/accueil.png', fullPage: false });
  await P.goto(BASE + '/#/');
  await P.waitForTimeout(500);
  await P.screenshot({ path: S + '/accueil2.png', fullPage: true });

  // second téléphone
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  const ctxB = await b.newContext(phone);
  const B = await ctxB.newPage();
  await B.goto(BASE);
  await B.getByLabel('Nom', { exact: true }).fill('Jacques');
  await B.getByLabel(/Mot de passe/).fill('motdepasse1');
  await B.getByRole('button', { name: 'Se connecter' }).click();
  await B.goto(BASE + '/#/argent');
  await B.waitForFunction(() => document.body.innerText.replace(/[  ]/g, ' ').includes('72 000'), null, { timeout: 10000 });
  ok(true, 'téléphone B : mêmes soldes (72 000 en caisse)');

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
