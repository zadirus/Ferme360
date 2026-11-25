// Interface simplifiée de l'agent d'élevage et du vétérinaire.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8809';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const T = Date.now();
const rec = (collection, id, data) => ({ id, collection, data, updatedAt: T, deleted: false });
const jour = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const records = async (token) => (await call('/api/sync', { since: 0, epoch: '', changes: [] }, token)).body.records;
const attendre = async (token, test, ms = 10000) => { const fin = Date.now() + ms; let s; while (Date.now() < fin) { s = await records(token); if (test(s)) return s; await new Promise((r) => setTimeout(r, 400)); } return s; };

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  await call('/api/users', { name: 'Awa Agent', password: 'agent-1234', role: 'ouvrier' }, owner);
  await call('/api/users', { name: 'Docteur Kone', password: 'veto-12345', role: 'veterinaire' }, owner);
  await call('/api/sync', { since: 0, epoch: '', changes: [
    rec('bande', 'bande-agent-0001', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: jour(100), ageArriveeSemaines: 18, batiment: '', souche: '', origine: '', prixAchat: 0 }),
    rec('article', 'article-aliment-001', { nom: 'Aliment ponte', unite: 'sac', categorie: 'aliment', seuil: 0, kgParUnite: 50 }),
    rec('stock_mvt', 'mvt-aliment-000001', { articleId: 'article-aliment-001', date: jour(10), type: 'entree', quantite: 20, peremption: '', achatId: '', alimentId: '', note: '' }),
    rec('article', 'article-vaccin-0001', { nom: 'Vaccin Newcastle', unite: 'dose', categorie: 'medicament', seuil: 0, kgParUnite: 1 }),
    rec('stock_mvt', 'mvt-vaccin-0000001', { articleId: 'article-vaccin-0001', date: jour(10), type: 'entree', quantite: 500, peremption: '', achatId: '', alimentId: '', note: '' }),
    rec('mortalite', 'mortalite-ancienne-1', { bandeId: 'bande-agent-0001', date: jour(5), nombre: 1, type: 'mort', cause: 'Coup de froid' }),
    rec('animal', 'animal-agent-101-aa', { boucle: '101', nom: '', espece: 'ovin', race: 'Peul', sexe: 'F', naissance: jour(300), naissanceEstimee: false, robe: '', origine: 'ne', mereId: '', pereId: '', miseBasId: '', vendeur: '', prixAchat: 0, poidsAchat: 0, dateAchat: '' }),
    rec('mvt_animal', 'entree-agent-101-aa', { animalId: 'animal-agent-101-aa', date: jour(300), type: 'entree', motif: 'naissance', lotId: '', venteId: '', note: '' })
  ] }, owner);

  const b = await chromium.launch();
  const ouvrir = async (nom, mdp) => {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    P.on('pageerror', (e) => console.log('pageerror', e.message));
    P.on('dialog', (d) => d.accept());
    await P.goto(BASE);
    await P.getByLabel('Nom', { exact: true }).fill(nom);
    await P.getByLabel(/Mot de passe/).fill(mdp);
    await P.getByRole('button', { name: 'Se connecter' }).click();
    await P.getByText(/Bonjour/).waitFor();
    await P.getByText('À jour', { exact: true }).waitFor({ timeout: 15000 });
    return P;
  };
  const A = await ouvrir('Awa Agent', 'agent-1234');
  const clic = (P, nom) => P.getByRole('button', { name: nom, exact: true });

  // accueil simplifié
  ok(await A.getByRole('link', { name: /Ramasser les œufs/ }).isVisible() && await A.getByRole('link', { name: /Soigner, donner un médicament/ }).isVisible(), 'agent : accueil à gros boutons (œufs, médicaments…)');
  ok((await A.locator('.onglets a').allInnerTexts()).length === 4, 'agent : barre du bas Accueil, Élevage, Stocks, Plus');

  // ramassage rétrosaisie
  await A.goto(BASE + '/#/saisie/oeufs');
  await A.locator('input[type=date]').fill(jour(2));
  await A.getByRole('spinbutton', { name: 'Plateaux complets de bons œufs' }).fill('10');
  await A.getByRole('spinbutton', { name: /Bons œufs en plus/ }).fill('21');
  await A.getByRole('spinbutton', { name: 'Œufs cassés' }).fill('3');
  ok(await A.getByText('10 plateaux et 21 œufs').first().isVisible(), 'ramassage : 10 plateaux + 21 œufs = « 10 plateaux et 21 œufs »');
  ok(await A.getByText(/faite après coup/).isVisible(), 'ramassage : une date passée est signalée « faite après coup »');
  await clic(A, 'Enregistrer').click();
  await A.getByText('Ramassage enregistré').waitFor();
  let s = await attendre(owner, (x) => x.some((r) => r.collection === 'ramassage'));
  const ram = s.find((r) => r.collection === 'ramassage');
  ok(ram && ram.data.date === jour(2) && ram.data.bons === 321 && ram.data.casses === 3, 'ramassage : 321 bons œufs (10 plateaux de 30 + 21) et 3 cassés, à la date choisie');

  // « Faire une autre saisie » repart d'un formulaire vide
  await clic(A, 'Faire une autre saisie').click();
  ok((await A.getByRole('spinbutton', { name: 'Plateaux complets de bons œufs' }).inputValue()) === '', 'après un enregistrement, « Faire une autre saisie » ouvre un formulaire vide');
  // liste sur sa propre page
  await A.getByRole('link', { name: /Liste/ }).click();
  await A.getByText(/10 plateaux et 21 œufs/).waitFor();
  ok(await A.getByRole('heading', { name: 'Liste : Œufs' }).isVisible(), 'bouton « Liste » : la liste s’ouvre sur sa propre page');

  // décès : cause libre, réutilisée ensuite
  await A.goto(BASE + '/#/saisie/deces');
  ok(await clic(A, 'Coup de froid').isVisible(), 'décès : une cause saisie plus tôt par l’équipe est proposée');
  await A.getByRole('button', { name: 'Plus Combien de poules mortes ?' }).click();
  await clic(A, 'Autre…').click();
  await A.getByPlaceholder('Ex. : coup de froid').fill('Piétinement');
  await clic(A, 'Enregistrer').click();
  await A.getByText('Décès enregistré').waitFor();
  await clic(A, 'Faire une autre saisie').click();
  ok(await clic(A, 'Piétinement').isVisible(), 'décès : la nouvelle cause « Piétinement » est ajoutée aux choix');

  // aliment en sacs
  await A.goto(BASE + '/#/saisie/aliment');
  await clic(A, '1,5 sacs').click();
  ok(await A.getByText(/75/).first().isVisible(), 'aliment : 1,5 sac affiche la conversion en kg (75 kg)');
  await clic(A, 'Enregistrer').click();
  await A.getByText('Aliment enregistré').waitFor();
  s = await attendre(owner, (x) => x.some((r) => r.collection === 'aliment'));
  const al = s.find((r) => r.collection === 'aliment').data;
  ok(al.kg === 75 && al.sacs === 1.5, 'aliment : 75 kg et 1,5 sac enregistrés');
  s = await attendre(owner, (x) => x.some((r) => r.collection === 'stock_mvt' && r.data.type === 'sortie' && r.data.articleId === 'article-aliment-001'));
  ok(s.find((r) => r.collection === 'stock_mvt' && r.data.type === 'sortie' && r.data.articleId === 'article-aliment-001').data.quantite === 1.5, 'aliment : 1,5 sac retiré du stock');

  // médicament pour un animal
  await A.goto(BASE + '/#/saisie/soin');
  await A.getByRole('button', { name: /Un animal/ }).click();
  await A.getByRole('button', { name: /101/ }).click();
  await clic(A, 'Vaccin Newcastle').click();
  await A.getByRole('spinbutton', { name: /Délai d’attente/ }).fill('14');
  await clic(A, 'Enregistrer').click();
  await A.getByText('Soin enregistré').waitFor();
  s = await attendre(owner, (x) => x.some((r) => r.collection === 'soin'));
  const soin = s.find((r) => r.collection === 'soin');
  ok(soin && soin.data.animalId === 'animal-agent-101-aa' && soin.data.delaiAttente === 14 && soin.data.cout === 0, 'médicament : soin enregistré pour l’animal, délai d’attente 14 j, sans coût');
  s = await attendre(owner, (x) => x.some((r) => r.collection === 'stock_mvt' && r.data.articleId === 'article-vaccin-0001' && r.data.type === 'sortie'));
  ok(s.some((r) => r.collection === 'stock_mvt' && r.data.articleId === 'article-vaccin-0001' && r.data.type === 'sortie' && r.data.alimentId === soin.id), 'médicament : la dose est retirée du stock et liée au soin');

  // aucun montant visible
  await A.goto(BASE + '/#/ventes');
  ok(await A.getByText(/Accès non autorisé/).isVisible(), 'agent : la page des ventes lui reste interdite');
  await A.context().close();

  // vétérinaire
  const V = await ouvrir('Docteur Kone', 'veto-12345');
  ok(await V.getByRole('link', { name: /Soigner, donner un médicament/ }).isVisible() && await V.getByRole('link', { name: /Mes soins/ }).isVisible(), 'vétérinaire : accueil simplifié (soigner, mes soins)');
  ok((await V.locator('.onglets a').allInnerTexts()).some((t) => /Stocks/.test(t)), 'vétérinaire : il consulte le stock de médicaments');
  await V.goto(BASE + '/#/saisie/soin');
  await V.getByRole('button', { name: /Poules/ }).click();
  await clic(V, 'Vaccin Newcastle').click();
  await V.getByRole('spinbutton', { name: /Quantité utilisée/ }).fill('300');
  await clic(V, 'Enregistrer').click();
  await V.getByText('Soin enregistré').waitFor();
  s = await attendre(owner, (x) => x.some((r) => r.collection === 'sante'));
  ok(s.some((r) => r.collection === 'sante' && r.data.bandeId === 'bande-agent-0001'), 'vétérinaire : vaccin des poules enregistré');
  await V.goto(BASE + '/#/saisie/oeufs');
  ok(await V.getByText(/Accès non autorisé/).isVisible(), 'vétérinaire : pas d’accès aux saisies d’œufs');
  await V.goto(BASE + '/#/ventes');
  ok(await V.getByText(/Accès non autorisé/).isVisible(), 'vétérinaire : pas d’accès aux ventes');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
