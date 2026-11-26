// Liste des alertes : les alertes restent tant que le problème existe ; la liste est groupée par sorte d'alerte.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8812';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const T = Date.now();
const jour = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const rec = (collection, id, data) => ({ id, collection, data, updatedAt: T, deleted: false });
const art = (i, nom) => [rec('article', `article-alerte-0000${i}`, { nom, unite: 'sac', categorie: 'aliment', seuil: 10, kgParUnite: 50 }), rec('stock_mvt', `mvt-alerte-entree-0${i}`, { articleId: `article-alerte-0000${i}`, date: jour(5), type: 'entree', quantite: 3, peremption: '', achatId: '', alimentId: '', note: '' })];

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  await call('/api/users', { name: 'Awa Agent', password: 'agent-1234', role: 'ouvrier' }, owner);
  await call('/api/sync', { since: 0, epoch: '', changes: [
    rec('bande', 'bande-alerte-00001', { nom: 'Bande 1', effectifInitial: 500, dateArrivee: jour(200), ageArriveeSemaines: 18, batiment: '', souche: '', origine: '', prixAchat: 0 }),
    rec('sante', 'sante-alerte-000001', { bandeId: 'bande-alerte-00001', date: jour(30), type: 'vaccin', produit: 'Newcastle', note: '', rappel: jour(2) }),
    ...art(1, 'Aliment ponte'), ...art(2, 'Aliment croissance'), ...art(3, 'Aliment démarrage'), ...art(4, 'Aliment chair'),
    rec('client', 'client-alerte-000001', { nom: 'Maquis Awa', telephone: '', type: 'maquis' }),
    rec('vente', 'vente-alerte-0000001', { date: jour(60), clientId: 'client-alerte-000001', lignes: [{ article: 'oeufs', libelle: '', quantite: 10, unite: 'plateau', prixUnitaire: 2500 }], total: 25000 })
  ] }, owner);

  const b = await chromium.launch();
  const ouvrir = async (nom, mdp) => {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    P.on('pageerror', (e) => console.log('pageerror', e.message));
    await P.goto(BASE);
    await P.getByLabel('Nom', { exact: true }).fill(nom);
    await P.getByLabel(/Mot de passe/).fill(mdp);
    await P.getByRole('button', { name: 'Se connecter' }).click();
    await P.getByText(/Bonjour/).waitFor();
    await P.getByText('À jour', { exact: true }).waitFor({ timeout: 15000 });
    return P;
  };

  const P = await ouvrir('Jacques', 'motdepasse1');
  await P.waitForTimeout(800);
  const lien = P.getByRole('link', { name: /Voir les \d+ alertes/ });
  ok(await lien.isVisible(), 'accueil : quelques alertes, puis « Voir les N alertes »');
  ok((await P.locator('.alertes p').count()) === 4, 'accueil : 4 alertes affichées au plus');
  await lien.click();
  await P.getByRole('heading', { name: /Alertes \(\d+\)/ }).waitFor();
  const texte = await P.locator('section').innerText();
  ok(/Stocks bas et produits qui périment/i.test(texte) && /Aliment démarrage/.test(texte) && /Aliment chair/.test(texte), 'liste : toutes les alertes de stock, y compris celles que l’accueil ne montrait pas');
  ok(/Rappels de santé/i.test(texte) && /Newcastle/.test(texte), 'liste : le rappel de vaccin en retard');
  ok(/Clients qui doivent depuis longtemps/i.test(texte), 'liste : la créance ancienne (propriétaire)');
  ok(await P.getByRole('link', { name: /Aller dans Stocks/ }).isVisible(), 'liste : un lien pour aller traiter chaque sorte d’alerte');
  // l'alerte reste tant que le problème n'est pas réglé (pas de bouton « vu »)
  ok((await P.getByRole('button', { name: /vu|ignorer/i }).count()) === 0, 'pas de bouton « vu » : une alerte reste tant qu’elle n’est pas levée');
  // levée : on remplit le stock d'un article → son alerte disparaît toute seule
  await call('/api/sync', { since: 0, epoch: '', changes: [rec('stock_mvt', 'mvt-alerte-reappro-04', { articleId: 'article-alerte-00004', date: jour(0), type: 'entree', quantite: 20, peremption: '', achatId: '', alimentId: '', note: '' })] }, owner);
  await P.locator('.pastille').click();
  await P.getByText('À jour', { exact: true }).waitFor({ timeout: 15000 });
  await P.getByText('Aliment démarrage').first().waitFor();
  await P.getByText('Aliment chair').waitFor({ state: 'detached', timeout: 15000 }).then(() => ok(true, 'après un réapprovisionnement, l’alerte de l’article disparaît toute seule'), () => ok(false, 'l’alerte de l’article n’a pas disparu'));
  await P.context().close();

  const A = await ouvrir('Awa Agent', 'agent-1234');
  await A.goto(BASE + '/#/alertes');
  await A.getByRole('heading', { name: /Alertes/ }).waitFor();
  const t2 = await A.locator('section').innerText();
  ok(!/Clients qui doivent/i.test(t2) && /Stocks bas/i.test(t2), 'agent d’élevage : voit les alertes de stock mais jamais celles des créances (argent)');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
