const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8793';
const BASE2 = process.env.BASE2 || 'http://localhost:8794';
const S = require('os').tmpdir();
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const b = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };
  const ctx = await b.newContext(phone);
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  P.on('dialog', (d) => d.accept());
  const btn = (n) => P.getByRole('button', { name: n });
  const aller = async (h) => { await P.goto(BASE + '/#' + h); await P.waitForTimeout(300); };
  const sel = (re) => P.locator('label', { hasText: re }).locator('select').first();
  const poussee = () => P.waitForResponse((r) => r.url().includes('/api/sync') && (r.request().postDataJSON().changes || []).length > 0);
  const synchro = async () => { await P.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 }); };

  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();

  // --- données du propriétaire
  await aller('/poules');
  await btn('+ Nouvelle bande').click();
  await P.getByLabel('Nom de la bande').fill('Bande 1');
  await P.getByLabel("Nombre de poules à l'arrivée").fill('400');
  await btn('Créer la bande').click();
  await P.getByRole('link', { name: /Bande 1/ }).click();
  for (const [date, n] of [[iso(-4), '340'], [iso(0), '330']]) {
    await btn(/Ramassage/).click();
    await P.getByLabel('Date', { exact: true }).fill(date);
    await P.getByLabel('Bons œufs').fill(n);
    await btn('Enregistrer').click();
    await P.getByText('Ramassage enregistré').waitFor();
  }
  await aller('/ventes/nouvelle');
  await sel(/^Client/).selectOption('__nouveau');
  await P.getByLabel('Nom du client').fill('Maquis Chez Awa');
  await P.getByLabel('Quantité').fill('8');
  await P.getByLabel('Prix unitaire').fill('2500');
  await P.getByLabel('Payé maintenant').fill('12000');
  await btn('Enregistrer la vente').click();
  await P.getByText('Maquis Chez Awa').first().waitFor();
  await P.waitForFunction(() => document.body.innerText.replace(/[  ]/g, ' ').includes('8 000'));

  // --- reçu PDF
  const [recu] = await Promise.all([P.waitForEvent('download'), P.getByRole('button', { name: /Reçu PDF/ }).click()]);
  await recu.saveAs(S + '/recu-ui.pdf');
  const { execSync } = require('child_process');
  const txtRecu = execSync(`pdftotext -layout ${S}/recu-ui.pdf -`).toString();
  ok(/Reçu de vente/.test(txtRecu) && /Maquis Chez Awa/.test(txtRecu) && /8 000/.test(norm(txtRecu)), 'reçu PDF : client, total et reste dû (8 000)');

  // --- rapports
  await aller('/rapports');
  await P.getByText(/Rapport mensuel/).first().waitFor();
  const [pdf] = await Promise.all([P.waitForEvent('download'), P.getByRole('button', { name: 'Télécharger le PDF' }).click()]);
  await pdf.saveAs(S + '/rapport-ui.pdf');
  const txt = norm(execSync(`pdftotext -layout ${S}/rapport-ui.pdf -`).toString());
  ok(/Rapport mensuel/.test(txt) && /20 000/.test(txt) && /Maquis Chez Awa/.test(txt), 'rapport PDF : ventes du mois et client');
  const [xl] = await Promise.all([P.waitForEvent('download'), P.getByRole('button', { name: "Télécharger l'Excel" }).click()]);
  await xl.saveAs(S + '/rapport-ui.xlsx');
  const py = execSync(`python3 -I -c "import openpyxl,sys; wb=openpyxl.load_workbook('${S}/rapport-ui.xlsx'); print(wb.sheetnames); print([c.value for c in wb.worksheets[0][2]])" 2>/dev/null`).toString();
  ok(py.includes('Poules pondeuses') && py.includes('20000'), 'rapport Excel : feuilles et montants lisibles par Excel');

  // --- réglages : seuil de chute de ponte
  await aller('/poules');
  await P.getByRole('link', { name: /Bande 1/ }).click();
  await P.waitForTimeout(400);
  ok((await P.getByText(/Chute de ponte/).count()) === 0, 'baisse de 2,5 points : pas d’alerte avec le seuil par défaut (5)');
  await aller('/reglages');
  await P.getByLabel(/Alerte de chute de ponte/).fill('1');
  await P.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await P.getByText(/Réglages enregistrés/).waitFor();
  await aller('/');
  await P.getByText(/Chute de ponte/).first().waitFor({ timeout: 5000 });
  ok(true, 'seuil abaissé à 1 point dans les réglages : l’alerte de chute de ponte apparaît');

  // --- comptes
  await aller('/equipe');
  await btn('+ Ajouter un compte').click();
  await P.getByLabel('Nom', { exact: true }).fill('Kouassi');
  await P.getByLabel(/Mot de passe de départ/).fill('ouvrier-123');
  await btn('Créer le compte').click();
  await P.getByText(/Compte de Kouassi créé/).waitFor();
  ok(true, 'compte ouvrier créé depuis l’application');

  // carnet (pour le journal)
  await aller('/carnet');
  await P.getByPlaceholder(/moutons vaccinés/).fill('Note à supprimer');
  await Promise.all([poussee(), btn('Ajouter').click()]);
  await P.getByText('Note à supprimer').waitFor();
  await Promise.all([poussee(), P.getByRole('button', { name: 'Supprimer' }).first().click()]);
  await aller('/journal');
  await P.getByText('Supprimé', { exact: true }).first().waitFor({ timeout: 8000 });
  ok(await P.getByText('Note du carnet').first().isVisible(), 'journal : la suppression de la note apparaît (qui, quand)');
  await P.screenshot({ path: S + '/journal.png', fullPage: true });

  // --- le téléphone de l'ouvrier
  const ctxO = await b.newContext(phone);
  const O = await ctxO.newPage();
  O.on('pageerror', (e) => console.log('pageerror ouvrier', e.message));
  await O.goto(BASE);
  await O.getByLabel('Nom', { exact: true }).fill('Kouassi');
  await O.getByLabel(/Mot de passe/).fill('ouvrier-123');
  await O.getByRole('button', { name: 'Se connecter' }).click();
  await O.getByText('Bonjour, Kouassi').waitFor();
  await O.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  const onglets = await O.locator('.onglets a').allInnerTexts();
  ok(!onglets.join(' ').includes('Ventes') && !onglets.join(' ').includes('Argent') && onglets.join(' ').includes('Élevage'), 'ouvrier : pas d’onglets Ventes ni Argent (' + onglets.map((x) => x.replace(/\W+/g, '').trim()).join(', ') + ')');
  const accueil = norm(await O.locator('main').innerText());
  ok(!/à encaisser/.test(accueil) && !/en caisse/.test(accueil), 'ouvrier : pas de montants sur l’accueil');
  await O.goto(BASE + '/#/ventes');
  await O.getByText('Accès non autorisé').waitFor();
  ok(true, 'ouvrier : la page des ventes est refusée');
  const collections = await O.evaluate(() => new Promise((res) => { const r = indexedDB.open('ferme360'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => res([...new Set(g.result.map((x) => x.collection))]); }; }));
  ok(!collections.includes('vente') && !collections.includes('paiement') && !collections.includes('client') && collections.includes('bande'), 'ouvrier : aucune donnée d’argent n’est arrivée sur son téléphone (' + collections.join(', ') + ')');
  await O.goto(BASE + '/#/poules');
  await O.waitForTimeout(300);
  ok((await O.getByRole('button', { name: '+ Nouvelle bande' }).count()) === 0, 'ouvrier : pas de bouton pour créer une bande');
  await O.getByRole('link', { name: /Bande 1/ }).click();
  await O.getByRole('button', { name: /Ramassage/ }).click();
  await O.getByLabel('Bons œufs').fill('300');
  await O.getByRole('button', { name: 'Enregistrer' }).click();
  await O.getByText('Ramassage enregistré').waitFor();
  await O.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  await aller('/poules');
  await P.getByRole('link', { name: /Bande 1/ }).click();
  await P.getByRole('button', { name: 'Synchroniser' }).click().catch(() => {});
  await P.getByText(/Ramassage : 300 bons/).waitFor({ timeout: 10000 });
  ok(true, 'le ramassage de l’ouvrier arrive chez le propriétaire');

  // --- désactivation
  await aller('/equipe');
  await P.getByRole('button', { name: 'Désactiver ce compte' }).click();
  await P.getByText('Compte désactivé').first().waitFor();
  await O.locator('.pastille').click();
  await O.getByText(/Reconnectez-vous/).waitFor({ timeout: 10000 });
  ok(true, 'compte désactivé : l’ouvrier est déconnecté à sa prochaine synchronisation');

  // --- sauvegarde : export puis restauration sur un serveur vierge
  await aller('/sauvegarde');
  const [sauv] = await Promise.all([P.waitForEvent('download'), P.getByRole('button', { name: 'Télécharger le fichier' }).click()]);
  await sauv.saveAs(S + '/sauvegarde.json');
  const fichier = JSON.parse(fs.readFileSync(S + '/sauvegarde.json', 'utf8'));
  ok(fichier.format === 'ferme360-sauvegarde' && fichier.records.some((r) => r.collection === 'vente') && fichier.records.some((r) => r.collection === 'bande'), 'sauvegarde exportée (' + fichier.records.length + ' enregistrements)');

  const ctxN = await b.newContext(phone);
  const N = await ctxN.newPage();
  N.on('dialog', (d) => d.accept());
  await N.goto(BASE2);
  await N.getByLabel('Nom', { exact: true }).fill('Jacques');
  await N.getByLabel(/Mot de passe/).fill('motdepasse1');
  await N.getByRole('button', { name: "Créer l'installation" }).click();
  await N.getByText('Bonjour, Jacques').waitFor();
  await N.goto(BASE2 + '/#/sauvegarde');
  await N.locator('input[type=file]').setInputFiles(S + '/sauvegarde.json');
  await N.getByText(/Restauration terminée/).waitFor({ timeout: 10000 });
  await N.getByText('À jour', { exact: true }).waitFor({ timeout: 10000 });
  await N.goto(BASE2 + '/#/poules');
  await N.getByRole('link', { name: /Bande 1/ }).waitFor();
  ok(true, 'restauration sur un serveur vierge : la bande est revenue');
  // un autre téléphone se connecte à ce serveur restauré
  const ctxV = await b.newContext(phone);
  const V = await ctxV.newPage();
  await V.goto(BASE2);
  await V.getByLabel('Nom', { exact: true }).fill('Jacques');
  await V.getByLabel(/Mot de passe/).fill('motdepasse1');
  await V.getByRole('button', { name: 'Se connecter' }).click();
  await V.goto(BASE2 + '/#/clients');
  await V.getByText('Maquis Chez Awa').first().waitFor({ timeout: 10000 });
  ok(true, 'les données restaurées ont été envoyées au serveur : un autre téléphone les retrouve');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
