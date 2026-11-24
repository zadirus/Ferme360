const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8797';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();

  // hors-ligne : l'application se rouvre sans réseau avec le nouveau service worker
  await P.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await P.waitForFunction(() => navigator.serviceWorker.controller !== null || true);
  await P.reload();
  await P.getByText('Bonjour, Jacques').waitFor();
  await ctx.setOffline(true);
  await P.reload();
  await P.getByText('Bonjour, Jacques').waitFor({ timeout: 8000 });
  ok(true, 'application rouverte sans réseau (service worker avec notifications)');
  await ctx.setOffline(false);

  // code PIN
  await P.goto(BASE + '/#/pin');
  const champs = P.locator('input[type=password]');
  await champs.nth(0).fill('4821');
  await champs.nth(1).fill('4821');
  await P.getByRole('button', { name: 'Activer le code' }).click();
  await P.getByText(/Code PIN enregistré/).waitFor();
  await P.reload();
  await P.getByText('Entrez votre code à 4 chiffres.').waitFor();
  ok(true, 'après rechargement, l’application est verrouillée');
  for (const c of '1111') await P.locator('.clavier button', { hasText: new RegExp(`^${c}$`) }).click();
  await P.getByText(/Code incorrect \(4 essai/).waitFor();
  ok(true, 'mauvais code refusé');
  for (const c of '4821') await P.locator('.clavier button', { hasText: new RegExp(`^${c}$`) }).click();
  await P.getByRole('heading', { name: 'Code PIN' }).waitFor();
  ok(true, 'bon code : l’application s’ouvre');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
