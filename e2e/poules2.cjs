const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8799';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  P.on('dialog', (d) => d.accept());
  const btn = (n) => P.getByRole('button', { name: n });
  const aller = async (h) => { await P.goto(BASE + '/#' + h); await P.waitForTimeout(250); };
  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();

  // programme de vaccination et courbe de référence (exemples proposés dans les réglages)
  await aller('/reglages');
  await P.getByRole('button', { name: /Mettre un exemple/ }).click();
  await P.getByRole('button', { name: /Mettre une courbe d'exemple/ }).click();
  await P.getByText(/6 vaccin\(s\) reconnu/).waitFor();
  await btn('Enregistrer les programmes').click();
  await P.getByText('Programmes enregistrés.').waitFor();

  const nouvelleBande = async (nom, age, arrivee, prix) => {
    await aller('/poules');
    await btn('+ Nouvelle bande').click();
    await P.getByLabel('Nom de la bande').fill(nom);
    await P.getByLabel("Nombre de poules à l'arrivée").fill('400');
    await P.getByLabel("Date d'arrivée").fill(arrivee);
    await P.getByLabel("Âge à l'arrivée").fill(String(age));
    if (prix) await P.getByLabel("Prix d'achat total").fill(String(prix));
    await btn('Créer la bande').click();
    await P.getByRole('link', { name: new RegExp(nom) }).first().click();
    await P.getByText('Poules présentes').waitFor();
  };

  // bande A : poussins arrivés il y a 10 jours
  await nouvelleBande('Bande A', 0, iso(-10), 0);
  await P.getByText('Vaccins du programme').waitFor();
  const avant = await P.locator('li', { hasText: /Marek|Newcastle|Gumboro|Bronchite/ }).count();
  ok(avant === 3, 'programme : 3 vaccins à faire pour des poussins de 10 jours (Marek et Newcastle en retard, Gumboro dans 4 jours)');
  await P.locator('li', { hasText: 'Marek' }).getByRole('button', { name: "Fait aujourd'hui" }).click();
  await P.waitForTimeout(400);
  ok((await P.locator('li', { hasText: /^Marek/ }).count()) === 0 || (await P.locator('li:has(.badge)', { hasText: 'Marek' }).count()) === 0, 'vaccin enregistré « fait » : il disparaît de la liste');
  await aller('/');
  await P.getByText(/Vaccin Newcastle HB1 \(Bande A\) : en retard/).first().waitFor({ timeout: 5000 });
  ok(true, 'rappel automatique du vaccin en retard sur l’accueil');

  // eau : 3 jours à 40 L puis 28 L
  await aller('/poules');
  await P.getByRole('link', { name: /Bande A/ }).first().click();
  for (const [j, l] of [[-3, '40'], [-2, '40'], [-1, '40'], [0, '28']]) {
    await btn(/Eau/).click();
    await P.getByLabel('Quantité bue dans la journée').fill(l);
    await P.getByLabel('Date', { exact: true }).fill(iso(j));
    await btn('Enregistrer').click();
    await P.getByText('Eau enregistrée').waitFor();
  }
  await P.getByText(/Eau : baisse de 30 %/).waitFor();
  ok(true, 'eau : 40 L puis 28 L par jour → alerte de baisse de 30 %');

  // fientes : 3 sacs sortis, 2 vendus
  await btn(/Fientes/).click();
  await P.getByLabel('Nombre de sacs').fill('3');
  await btn('Enregistrer').click();
  await P.getByText('Fientes enregistrées').waitFor();
  await aller('/ventes/nouvelle');
  await P.locator('label', { hasText: /^Article/ }).locator('select').selectOption('fumier');
  await P.getByLabel('Quantité').fill('2');
  await P.getByLabel('Prix unitaire').fill('1500');
  await btn('Enregistrer la vente').click();
  await P.waitForTimeout(600);
  await aller('/poules');
  await P.getByText(/Fientes en stock/).waitFor();
  ok(norm(await P.locator('main').innerText()).includes('Fientes en stock : 1 sac'), 'fientes : 3 sacs sortis − 2 vendus = 1 sac en stock');

  // bande B : pondeuses de 22 semaines, courbe de ponte et bilan
  await nouvelleBande('Bande B', 22, iso(-20), 400000);
  for (const [j, n] of [[-12, '320'], [-6, '360'], [-1, '370']]) {
    await btn(/Ramassage/).click();
    await P.getByLabel('Date', { exact: true }).fill(iso(j));
    await P.getByLabel('Bons œufs').fill(n);
    await btn('Enregistrer').click();
    await P.getByText('Ramassage enregistré').waitFor();
  }
  await P.getByText('Courbe de ponte').waitFor();
  ok((await P.locator('figure.courbe svg polyline').count()) === 2 && /Référence/.test(await P.locator('figure.courbe figcaption').innerText()), 'courbe de ponte de la bande comparée à la courbe de référence (2 lignes)');
  // vente d'œufs pour valoriser la production : 10 plateaux à 2 400 FCFA = 80 FCFA l'œuf
  await aller('/ventes/nouvelle');
  await P.getByLabel('Quantité').fill('10');
  await P.getByLabel('Prix unitaire').fill('2400');
  await btn('Enregistrer la vente').click();
  await P.waitForTimeout(600);
  await aller('/poules');
  await P.getByRole('link', { name: /Bande B/ }).first().click();
  await P.getByText('Bilan de la bande').waitFor();
  const bilan = norm(await P.locator('main').innerText());
  const bons = 320 + 360 + 370;
  const valeur = bons * 80;
  ok(/Plateaux de bons œufs/.test(bilan) && bilan.includes('35,0') , 'bilan : 1 050 bons œufs = 35 plateaux');
  ok(bilan.includes('11 429 FCFA') && bilan.includes('Coût de revient du plateau'), 'bilan : coût de revient du plateau = 400 000 ÷ 35 = 11 429 FCFA');
  ok(bilan.includes('−316 000') || bilan.includes('-316 000'), `bilan : marge estimée = ${valeur} − 400 000 = −316 000 FCFA`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
