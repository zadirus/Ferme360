const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const BASE = process.env.BASE || 'http://localhost:8798';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const norm = (t) => t.replace(/[  ]/g, ' ');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('pageerror', e.message));
  await P.goto(BASE);
  await P.getByLabel('Nom', { exact: true }).fill('Jacques');
  await P.getByLabel(/Mot de passe/).fill('motdepasse1');
  await P.getByRole('button', { name: "Créer l'installation" }).click();
  await P.getByText('Bonjour, Jacques').waitFor();
  const aller = async (h) => { await P.goto(BASE + '/#' + h); await P.waitForTimeout(250); };

  // modèle Excel
  await aller('/import');
  const [dl] = await Promise.all([P.waitForEvent('download'), P.getByRole('button', { name: /Télécharger le modèle/ }).click()]);
  await dl.saveAs(os.tmpdir() + '/modele-animaux.xlsx');
  const feuilles = execSync(`python3 -I -c "import openpyxl; wb=openpyxl.load_workbook('${os.tmpdir()}/modele-animaux.xlsx'); print(wb.sheetnames, [c.value for c in wb.worksheets[0][1]][:3])" 2>/dev/null`).toString();
  ok(feuilles.includes('Données') && feuilles.includes('Boucle'), 'modèle Excel téléchargé et lisible : ' + feuilles.trim());

  // import d'un vrai fichier Excel
  await P.locator('input[type=file]').setInputFiles('src/import/fixtures/exemple.xlsx');
  await P.getByText('ligne(s) prêtes à importer').waitFor();
  ok(norm(await P.locator('.stat', { hasText: 'prêtes' }).innerText()).startsWith('3'), 'fichier Excel : 3 lignes prêtes');
  await P.getByRole('button', { name: /Importer 3 ligne/ }).click();
  await P.getByText(/3 ligne\(s\) importée/).waitFor();
  await aller('/moutons');
  await P.getByText('Registre').waitFor();
  ok(norm(await P.locator('.stat', { hasText: 'moutons présents' }).innerText()).startsWith('2'), 'registre des moutons : 2 animaux importés');
  ok(await P.getByText('Reproductrices').first().isVisible(), 'les lots du fichier ont été créés');
  await aller('/boeufs');
  await P.getByText('Registre').waitFor();
  ok(norm(await P.locator('.stat', { hasText: 'bœufs présents' }).innerText()).startsWith('1'), 'registre des bœufs : 1 animal importé');

  // les mêmes animaux une deuxième fois : refusés
  await aller('/import');
  await P.locator('input[type=file]').setInputFiles('src/import/fixtures/exemple.xlsx');
  await P.getByText('ligne(s) refusées').waitFor();
  ok(norm(await P.locator('.stat', { hasText: 'refusées' }).innerText()).startsWith('3') && (await P.getByText(/existe déjà/).count()) >= 1, 'second import du même fichier : 3 lignes refusées (déjà existantes)');

  // clients avec solde (CSV d'Excel français)
  await aller('/import');
  await P.getByRole('button', { name: /Clients et ce qu/ }).click();
  fs.writeFileSync(os.tmpdir() + '/clients.csv', 'Nom;Téléphone;Type;Solde dû (FCFA)\r\nMaquis Awa;0700000000;maquis;45 000\r\nKoffi;;revendeur;0\r\n');
  await P.locator('input[type=file]').setInputFiles(os.tmpdir() + '/clients.csv');
  await P.getByRole('button', { name: /Importer 2 ligne/ }).click();
  await P.getByText(/2 ligne\(s\) importée/).waitFor();
  await aller('/clients');
  await P.getByText(/Doit 45\s000\sFCFA/).waitFor();
  ok(true, 'client importé avec son solde dû : 45 000 FCFA');
  await aller('/argent');
  await P.getByText('Résultat par activité').waitFor();
  const resultat = norm(await P.locator('main').innerText());
  ok(!/Ventes 45 000/.test(resultat) && /À encaisser \(clients\)/.test(resultat) && /45 000 FCFA\s*\n?\s*À encaisser/.test(resultat), 'le solde repris est une créance (45 000 à encaisser), pas une vente du mois');

  // performance : 3 000 moutons d'un coup
  const lignes = ['Boucle;Nom;Espèce;Sexe;Naissance;Poids (kg);Lot'];
  for (let i = 1; i <= 3000; i++) lignes.push(`P${String(i).padStart(4, '0')};;mouton;${i % 5 ? 'F' : 'M'};${i % 28 + 1}/0${i % 9 + 1}/2024;${30 + (i % 20)};Troupeau ${(i % 6) + 1}`);
  fs.writeFileSync(os.tmpdir() + '/gros.csv', lignes.join('\r\n'));
  await aller('/import');
  const t0 = Date.now();
  await P.locator('input[type=file]').setInputFiles(os.tmpdir() + '/gros.csv');
  await P.getByRole('button', { name: /Importer 3000 ligne/ }).click({ timeout: 60000 });
  await P.getByText(/3000 ligne\(s\) importée/).waitFor({ timeout: 120000 });
  console.log('     import de 3 000 moutons (lecture, contrôle, enregistrement) : ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  const mesure = async (h, texte) => {
    await P.goto('about:blank');
    const t = Date.now();
    await P.goto(BASE + '/#' + h);
    await P.reload();
    await P.getByText(texte).first().waitFor({ timeout: 60000 });
    return Date.now() - t;
  };
  const tAcc = await mesure('/', 'Bonjour, Jacques');
  const tMou = await mesure('/moutons', 'Registre');
  console.log(`     affichage avec 3 000 animaux : accueil ${tAcc} ms, liste des moutons ${tMou} ms (rechargement complet de l'application)`);
  ok(tAcc < 3000 && tMou < 3000, 'affichage en moins de 3 secondes avec 3 000 animaux');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
