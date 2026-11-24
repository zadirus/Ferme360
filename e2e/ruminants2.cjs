const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const BASE = process.env.BASE || 'http://localhost:8800';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// image BMP de 800 x 600 (dégradé) : assez grosse pour vérifier la réduction de la photo
function bmp() {
  const w = 800, h = 600, ligne = w * 3, taille = 54 + ligne * h;
  const b = Buffer.alloc(taille);
  b.write('BM'); b.writeUInt32LE(taille, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(ligne * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = 54 + y * ligne + x * 3; b[o] = (x * 255 / w) | 0; b[o + 1] = (y * 255 / h) | 0; b[o + 2] = ((x + y) * 7) & 255; }
  const f = os.tmpdir() + '/vache.bmp';
  fs.writeFileSync(f, b);
  return f;
}

(async () => {
  const b = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = await b.newContext(phone);
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  P.on('dialog', (d) => d.accept());
  const btn = (n) => P.getByRole('button', { name: n });
  const aller = async (h) => { await P.goto(BASE + '/#' + h); await P.waitForTimeout(250); };
  const sel = (re) => P.locator('label', { hasText: re }).locator('select').first();
  const poussee = () => P.waitForResponse((r) => r.url().includes('/api/sync') && (r.request().postDataJSON().changes || []).length > 0);
  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();

  const creer = async (route, boucle, sexe, naissance) => {
    await aller(route);
    await btn(/Nouvel animal/).click();
    await P.getByLabel('Numéro de boucle').fill(boucle);
    await sel(/^Sexe/).selectOption(sexe);
    if (naissance) await P.getByLabel('Date de naissance').fill(naissance);
    await btn("Ajouter l'animal").click();
    await P.getByText(`${boucle} ajouté`).waitFor();
  };
  await creer('/boeufs', 'V1', 'F', iso(-1500));
  await creer('/boeufs', 'T1', 'M', iso(-1200));

  // --- photo
  await aller('/boeufs');
  await P.getByRole('link', { name: /V1/ }).first().click();
  await P.getByText('Photos').waitFor();
  await Promise.all([poussee(), P.locator('input[type=file]').setInputFiles(bmp())]);
  await P.locator('.photos img').waitFor();
  const src = await P.locator('.photos img').getAttribute('src');
  ok(src.startsWith('data:image/jpeg') && src.length < 80000, `photo réduite à ${Math.round(src.length / 1000)} Ko (une photo brute de 1,4 Mo) et enregistrée`);
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  ok(true, 'la photo a été acceptée par le serveur (synchronisation terminée)');

  // --- courbe de croissance
  for (const [j, p] of [[-40, '250'], [-10, '290']]) {
    await btn(/Pesée/).click();
    await P.getByLabel('Poids').fill(p);
    await P.getByLabel('Date', { exact: true }).fill(iso(j));
    await btn('Enregistrer').click();
    await P.getByText('Pesée enregistrée').waitFor();
  }
  await P.getByText('Courbe de croissance').waitFor();
  ok((await P.locator('figure.courbe svg polyline').count()) === 1, 'courbe de croissance de l’animal (2 pesées)');

  // --- lait
  for (const [j, l] of [[-1, '8'], [0, '8.5']]) {
    await btn(/Traite/).click();
    await P.getByLabel('Lait trait').fill(l);
    await P.getByLabel('Date', { exact: true }).fill(iso(j));
    await btn('Enregistrer').click();
    await P.getByText('Traite enregistrée').waitFor();
  }
  await aller('/boeufs');
  await P.getByText('Lait trait sur 7 jours').waitFor();
  ok(norm(await P.locator('.stat', { hasText: 'Lait trait sur 7 jours' }).innerText()).includes('16,5 L'), 'lait : 8 L + 8,5 L = 16,5 L sur 7 jours');
  await aller('/ventes/nouvelle');
  await sel(/^Article/).selectOption('lait');
  await P.getByLabel('Quantité').fill('10');
  await P.getByLabel('Prix unitaire').fill('400');
  await btn('Enregistrer la vente').click();
  await P.waitForTimeout(500);
  await aller('/ventes');
  await P.getByText(/10 L de lait/).first().waitFor();
  ok(true, 'vente de lait : 10 L à 400 FCFA');

  // --- traction louée
  await aller('/boeufs');
  await P.getByRole('link', { name: /T1/ }).first().click();
  await btn(/Travail/).click();
  await P.getByLabel('Jours de travail').fill('2');
  await P.getByLabel(/Recette si le bœuf est loué/).fill('20000');
  await btn('Enregistrer').click();
  await P.getByText(/recette de 20\s000 FCFA ajoutée aux ventes/).waitFor();
  await P.getByText(/Travail \(12 mois\)/).waitFor();
  ok(true, 'traction : 2 jours de travail, recette de 20 000 FCFA ajoutée aux ventes');
  await aller('/argent');
  await P.getByText('Résultat par activité').waitFor();
  ok(norm(await P.locator('li', { hasText: 'Bœufs' }).first().innerText()).includes('Ventes 24 000 FCFA'), 'les recettes de lait (4 000) et de traction (20 000) comptent dans le résultat des bœufs');

  // --- parcs et pâturage
  await aller('/boeufs');
  await btn('+ Nouveau parc').click();
  await P.getByLabel('Nom du parc').fill('Bas-fond');
  await P.getByLabel(/Nombre d'animaux qu'il peut porter/).fill('1');
  await btn('Créer le parc').click();
  await P.getByText('Bas-fond').waitFor();
  await btn(/Nouveau lot/).click();
  await P.getByLabel('Nom du lot').fill('Troupeau bœufs');
  await sel(/^Type/).selectOption('troupeau');
  await btn('Créer le lot').click();
  await P.getByRole('heading', { name: 'Troupeau bœufs' }).waitFor();
  await btn(/Ajouter des animaux/).click();
  await P.locator('label.case').nth(0).click();
  await P.locator('label.case').nth(1).click();
  await btn(/Ajouter \(2\)/).click();
  await P.getByText('2 animal(aux) ajouté(s) au lot').waitFor();
  await P.getByRole('button', { name: /Changer de parc/ }).click();
  await sel(/^Parc/).selectOption({ label: 'Bas-fond' });
  await btn('Enregistrer').click();
  await P.getByText('Bas-fond').first().waitFor();
  await aller('/boeufs');
  await P.getByText(/Trop d'animaux pour ce parc/).waitFor();
  ok(norm(await P.locator('li', { hasText: 'Bas-fond' }).first().innerText()).includes('2 / 1 animaux'), 'parc de capacité 1 avec un lot de 2 animaux : alerte de surcharge');

  // --- rappels de castration / sevrage, réforme (moutons)
  await creer('/moutons', 'A1', 'M', iso(-70)); // castration prévue à 60 jours : en retard de 10 jours ; sevrage dans 20 jours
  await creer('/moutons', 'V8', 'F', iso(-8 * 366));
  await aller('/moutons');
  await P.getByText('Sevrage et castration à prévoir').waitFor();
  ok(await P.getByText(/Castration : A1/).isVisible() && (await P.getByText(/Sevrage : A1/).count()) === 0, 'castration de l’agneau de 70 jours signalée en retard, sevrage pas encore (dans 20 jours)');
  ok(await P.getByText('À examiner pour la réforme').isVisible() && /âge : 8 ans/.test(await P.locator('main').innerText()), 'brebis de 8 ans proposée à la réforme');
  await P.getByRole('link', { name: /A1/ }).first().click();
  await btn(/Soin/).first().click();
  await sel(/^Type/).selectOption('castration');
  await P.getByLabel('Produit ou maladie').fill('Castration au burdizzo');
  await btn('Enregistrer').click();
  await P.getByText('Soin enregistré').waitFor();
  await aller('/moutons');
  await P.waitForTimeout(300);
  ok((await P.getByText(/Castration : A1/).count()) === 0, 'castration enregistrée : le rappel disparaît');
  await aller('/');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
