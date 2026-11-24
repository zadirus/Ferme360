const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8791';
const S = require('os').tmpdir();
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
const iso = (d) => d.toISOString().slice(0, 10);
const jours = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

(async () => {
  const b = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = await b.newContext(phone);
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  P.on('dialog', (d) => d.accept());
  const sel = (re) => P.locator('label', { hasText: re }).locator('select').first();
  const choisir = async (re, texte) => { const s = sel(re); const v = await s.locator('option', { hasText: texte }).first().getAttribute('value'); await s.selectOption(v); };
  const btn = (n) => P.getByRole('button', { name: n });
  const aller = async (h) => { await P.goto(BASE + '/#' + h); await P.waitForTimeout(250); };
  const stat = (l) => P.locator('.stat', { hasText: l }).first();

  async function creer(route, o) {
    await aller(route);
    await btn(/Nouvel animal/).click();
    await P.getByLabel('Numéro de boucle').fill(o.boucle);
    if (o.sexe) await sel(/^Sexe/).selectOption(o.sexe);
    await sel(/^Origine/).selectOption('achete');
    await P.getByLabel("Date d'achat").fill(o.date);
    await P.getByLabel('Prix payé').fill(String(o.prix));
    await P.getByLabel(/Poids à l'achat/).fill(String(o.poids));
    if (o.lot) await choisir(/^Lot/, o.lot);
    await btn("Ajouter l'animal").click();
    await P.getByText(`${o.boucle} ajouté`).waitFor();
  }

  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();

  // --- registre et reproduction (moutons)
  const debut = jours(-40);
  await creer('/moutons', { boucle: 'B1', sexe: 'M', date: debut, prix: 60000, poids: 45 });
  await creer('/moutons', { boucle: 'F1', sexe: 'F', date: debut, prix: 50000, poids: 35 });
  await creer('/moutons', { boucle: 'F2', sexe: 'F', date: debut, prix: 50000, poids: 33 });
  ok(true, 'achat de 2 brebis et 1 bélier : fiches créées');

  await P.getByRole('link', { name: /F1/ }).first().click();
  await btn(/Reproduction/).click();
  await P.getByLabel('Date', { exact: true }).fill('2026-04-10');
  await btn('Enregistrer').click();
  await P.getByText(/Saillie enregistrée/).waitFor();
  const prev = norm(await stat('Mise bas prévue').innerText());
  ok(prev.includes('07/09/2026'), 'lutte le 10/04 → mise bas prévue le 07/09/2026');

  await btn(/Mise bas/).click();
  await P.getByLabel(/Petit vivant 1/).fill('A1');
  await btn('+ Ajouter un petit vivant').click();
  await P.getByLabel(/Petit vivant 2/).fill('A2');
  await btn('Enregistrer la mise bas').click();
  await P.getByText(/2 fiche\(s\) créée\(s\)/).waitFor();
  ok((await P.locator('.stat', { hasText: 'Mise bas prévue' }).count()) === 0, 'après la mise bas, plus de mise bas prévue');
  await aller('/moutons');
  await P.getByText('Registre').waitFor();
  ok(norm(await stat('moutons présents').innerText()).includes('5'), 'mise bas de 2 agneaux : effectif passe de 3 à 5');
  await P.getByRole('link', { name: /A1/ }).first().click();
  await P.getByText(/Ascendance/).waitFor();
  ok(await P.locator('.lignee').getByText(/F1/).isVisible(), 'les agneaux sont créés avec leur mère (ascendance)');

  // --- embouche
  await aller('/moutons');
  await btn(/Nouveau lot/).click();
  await P.getByLabel('Nom du lot').fill('Embouche Tabaski');
  await P.getByLabel(/Poids moyen visé/).fill('40');
  await P.getByLabel(/Date visée/).fill(jours(30));
  await btn('Créer le lot').click();
  await P.getByRole('heading', { name: 'Embouche Tabaski' }).waitFor();
  await aller('/moutons');
  await creer('/moutons', { boucle: 'E1', sexe: 'M', date: debut, prix: 40000, poids: 24, lot: 'Embouche Tabaski' });
  await creer('/moutons', { boucle: 'E2', sexe: 'M', date: debut, prix: 40000, poids: 24, lot: 'Embouche Tabaski' });
  await aller('/moutons');
  await P.getByRole('link', { name: /Embouche Tabaski/ }).first().click();
  await btn(/Pesée du lot/).click();
  await P.getByLabel('E1').fill('30');
  await P.getByLabel('E2').fill('30');
  await btn('Enregistrer').click();
  await P.getByText(/2 pesée\(s\) enregistrée\(s\)/).waitFor();
  ok(norm(await stat('GMQ moyen').innerText()).includes('150'), '24 kg → 30 kg en 40 jours : GMQ 150 g/jour');
  const cout = norm(await stat('Coût de revient du kg vif').innerText());
  ok(cout.includes('1 333'), 'coût de revient du kg vif : 80 000 FCFA ÷ 60 kg = 1 333 FCFA');
  await P.screenshot({ path: S + '/lot.png', fullPage: true });

  // --- délai d'attente
  await aller('/moutons');
  await P.getByRole('link', { name: /E2/ }).first().click();
  await btn(/^💉\s*Soin|Soin/).first().click();
  await sel(/^Type/).selectOption('traitement');
  await P.getByLabel('Produit ou maladie').fill('Antibiotique');
  await P.getByLabel(/Délai d'attente/).fill('14');
  await P.getByLabel('Coût (facultatif)').fill('4000');
  await btn('Enregistrer').click();
  await P.getByText('Soin enregistré').waitFor();
  ok(await P.getByText(/Délai d'attente en cours/).isVisible(), 'traitement avec 14 jours de délai : alerte sur la fiche');

  await aller('/ventes/nouvelle');
  await sel(/^Article/).selectOption('animal');
  await choisir(/^Animal vendu/, 'E2');
  ok(await P.getByText(/vente interdite jusqu'au/).isVisible(), 'vente de l’animal refusée pendant le délai d’attente');
  await P.screenshot({ path: S + '/vente-bloquee.png', fullPage: true });

  // --- vente d'un bœuf au poids
  await creer('/boeufs', { boucle: 'BO1', sexe: 'M', date: debut, prix: 300000, poids: 320 });
  await aller('/ventes/nouvelle');
  await sel(/^Client/).selectOption('__nouveau');
  await P.getByLabel('Nom du client').fill('Boucherie Koffi');
  await sel(/^Article/).selectOption('animal');
  await choisir(/^Animal vendu/, 'BO1');
  await P.getByRole('spinbutton', { name: /Prix au kg/ }).fill('1600');
  await P.getByLabel('Payé maintenant').fill('200000');
  const total = norm(await P.locator('.stat.large').innerText());
  ok(total.includes('512 000'), 'vente d’un bœuf de 320 kg à 1 600 FCFA/kg : 512 000 FCFA');
  await btn('Enregistrer la vente').click();
  await P.getByText('Boucherie Koffi').first().waitFor();
  await P.waitForFunction(() => document.body.innerText.replace(/[  ]/g, ' ').includes('312 000'));
  ok(true, 'paiement partiel de 200 000 FCFA → reste dû 312 000 FCFA');
  await aller('/boeufs');
  await P.getByText('Registre').waitFor();
  ok(norm(await stat('bœufs présents').innerText()).startsWith('0'), 'le bœuf vendu est sorti du registre');

  // --- accueil + autre téléphone
  await aller('/');
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  await P.screenshot({ path: S + '/accueil5.png', fullPage: true });
  const ctxB = await b.newContext(phone);
  const B = await ctxB.newPage();
  await B.goto(BASE);
  await B.getByLabel('Nom', { exact: true }).fill('Jacques');
  await B.getByLabel(/Mot de passe/).fill('motdepasse1');
  await B.getByRole('button', { name: 'Se connecter' }).click();
  await B.goto(BASE + '/#/moutons');
  await B.waitForFunction(() => document.body.innerText.includes('Embouche Tabaski'), null, { timeout: 10000 });
  ok(true, 'téléphone B : voit les moutons et le lot synchronisés');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
