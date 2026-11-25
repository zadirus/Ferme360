// Modifier une saisie, historique clair réservé au propriétaire, date du carnet, réception de stock.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8811';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const T = Date.now();
const jour = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const rec = (collection, id, data) => ({ id, collection, data, updatedAt: T, deleted: false });
const records = async (token) => (await call('/api/sync', { since: 0, epoch: '', changes: [] }, token)).body.records;
const attendre = async (test, token, ms = 10000) => { const fin = Date.now() + ms; let s; while (Date.now() < fin) { s = await records(token); if (test(s)) return s; await new Promise((r) => setTimeout(r, 400)); } return s; };

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  await call('/api/users', { name: 'Moussa Gerant', password: 'gerant-123', role: 'gerant' }, owner);
  await call('/api/users', { name: 'Awa Agent', password: 'agent-1234', role: 'ouvrier' }, owner);
  const ger = (await call('/api/login', { name: 'Moussa Gerant', password: 'gerant-123' })).body.token;
  const agent = (await call('/api/login', { name: 'Awa Agent', password: 'agent-1234' })).body.token;
  await call('/api/sync', { since: 0, epoch: '', changes: [
    rec('bande', 'bande-modif-00001', { nom: 'Bande 1', effectifInitial: 400, dateArrivee: jour(100), ageArriveeSemaines: 18, batiment: '', souche: '', origine: '', prixAchat: 0 }),
    rec('ramassage', 'ramassage-gerant-001', { bandeId: 'bande-modif-00001', date: jour(1), bons: 300, feles: 2, casses: 1 }),
    rec('article', 'article-aliment-m01', { nom: 'Aliment ponte', unite: 'sac', categorie: 'aliment', seuil: 0, kgParUnite: 50 }),
    rec('stock_mvt', 'mvt-entree-aliment-1', { articleId: 'article-aliment-m01', date: jour(10), type: 'entree', quantite: 20, peremption: '', achatId: '', alimentId: '', note: '' }),
    rec('aliment', 'aliment-modif-000001', { bandeId: 'bande-modif-00001', date: jour(1), kg: 50, sacs: 1, type: 'ponte', articleId: 'article-aliment-m01', cout: 17000 }),
    rec('stock_mvt', 'mvt-sortie-aliment-1', { articleId: 'article-aliment-m01', date: jour(1), type: 'sortie', quantite: 1, peremption: '', achatId: '', alimentId: 'aliment-modif-000001', note: '' }),
    rec('carnet', 'note-carnet-0000001', { texte: 'Réparer la clôture' })
  ] }, owner);
  // une saisie de l'agent
  await call('/api/sync', { since: 0, epoch: '', changes: [rec('ramassage', 'ramassage-agent-0001', { bandeId: 'bande-modif-00001', date: jour(0), bons: 338, feles: 0, casses: 5 })] }, agent);

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
  const clic = (P, nom) => P.getByRole('button', { name: nom, exact: true });

  // ---------- la gérante modifie un ramassage et une distribution d'aliment ----------
  const G = await ouvrir('Moussa Gerant', 'gerant-123');
  await G.goto(BASE + '/#/poules/bande-modif-00001');
  await G.locator('li', { hasText: '300 bons' }).getByRole('button', { name: 'Modifier' }).click();
  await G.getByLabel('Bons œufs (nombre total)').fill('310');
  await clic(G, 'Enregistrer').click();
  await G.getByText(/Modification enregistrée/).waitFor();
  let s = await attendre((x) => x.find((r) => r.id === 'ramassage-gerant-001')?.data.bons === 310, ger);
  ok(s.find((r) => r.id === 'ramassage-gerant-001').data.bons === 310, 'gérante : le ramassage est corrigé (300 → 310)');

  await G.locator('li', { hasText: 'Aliment' }).getByRole('button', { name: 'Modifier' }).click();
  await G.getByLabel('Quantité distribuée').fill('75');
  await clic(G, 'Enregistrer').click();
  await G.getByText(/Modification enregistrée/).waitFor();
  s = await attendre((x) => x.find((r) => r.id === 'mvt-sortie-aliment-1')?.data.quantite === 1.5, ger);
  ok(s.find((r) => r.id === 'mvt-sortie-aliment-1').data.quantite === 1.5, 'aliment 50 → 75 kg : la sortie de stock liée passe de 1 à 1,5 sac');
  ok(s.find((r) => r.id === 'aliment-modif-000001').data.kg === 75, 'aliment : la quantité enregistrée est bien 75 kg');
  ok(s.find((r) => r.id === 'aliment-modif-000001').data.sacs === 1.5 && s.find((r) => r.id === 'aliment-modif-000001').data.cout === 25500, 'aliment : sacs (1,5) et coût (25 500) recalculés');

  // modification refusée : plus de poules que la bande n'en a
  await G.goto(BASE + '/#/poules/bande-modif-00001');
  // ---------- carnet : date ----------
  await G.goto(BASE + '/#/carnet');
  await G.locator('input[type=date]').first().fill(jour(3));
  await G.locator('textarea').fill('Vu le vétérinaire');
  await clic(G, 'Ajouter').click();
  await G.getByText('Vu le vétérinaire').waitFor();
  s = await attendre((x) => x.some((r) => r.collection === 'carnet' && r.data.texte === 'Vu le vétérinaire'), ger);
  ok(s.find((r) => r.collection === 'carnet' && r.data.texte === 'Vu le vétérinaire').data.date === jour(3), 'carnet : la note garde la date choisie');
  await G.locator('li', { hasText: 'Réparer la clôture' }).getByRole('button', { name: 'Modifier' }).click();
  await G.getByLabel('Note', { exact: true }).fill('Réparer la clôture du parc 2');
  await clic(G, 'Enregistrer').click();
  await G.getByText(/Modification enregistrée/).waitFor();
  ok(true, 'carnet : une note peut être modifiée');

  // ---------- réception de stock par la gérante ----------
  await G.goto(BASE + '/#/stocks');
  ok(await G.getByRole('button', { name: /Réception de stock/ }).isVisible(), 'gérante : bouton « Réception de stock » sur la page Stocks');
  await G.context().close();

  // ---------- l'agent modifie SA saisie, pas celle d'un autre ----------
  const A = await ouvrir('Awa Agent', 'agent-1234');
  await A.goto(BASE + '/#/saisie/liste/oeufs');
  await A.getByText(/11 plateaux et 8 œufs/).waitFor();
  const lignes = A.locator('.saisies-jour li');
  ok((await lignes.filter({ hasText: '11 plateaux et 8 œufs' }).getByRole('button', { name: 'Modifier' }).count()) === 1, 'agent : « Modifier » sur sa propre saisie');
  ok((await lignes.filter({ hasText: '10 plateaux et 10 œufs' }).getByRole('button', { name: 'Modifier' }).count()) === 0, 'agent : pas de « Modifier » sur la saisie de la gérante');
  await lignes.filter({ hasText: '11 plateaux et 8 œufs' }).getByRole('button', { name: 'Modifier' }).click();
  await A.getByLabel('Plateaux complets de bons œufs').fill('12');
  await clic(A, 'Enregistrer').click();
  await A.getByText(/Modification enregistrée/).waitFor();
  s = await attendre((x) => x.find((r) => r.id === 'ramassage-agent-0001')?.data.bons === 368, agent);
  ok(s.find((r) => r.id === 'ramassage-agent-0001').data.bons === 368, 'agent : 11 plateaux + 8 → 12 plateaux + 8 = 368 bons œufs');
  await A.context().close();

  // ---------- historique : réservé au propriétaire ----------
  const j = await call('/api/journal?limite=50', undefined, ger);
  ok(j.status === 403, 'l’historique est refusé à la gérante (serveur)');
  const jAgent = await call('/api/journal?limite=50', undefined, agent);
  ok(jAgent.status === 403, 'l’historique est refusé à l’agent (serveur)');
  const O = await ouvrir('Jacques', 'motdepasse1');
  await O.goto(BASE + '/#/journal');
  await O.getByRole('heading', { name: 'Historique des modifications' }).waitFor();
  await O.getByText('Bons œufs').first().waitFor({ timeout: 10000 });
  const texte = await O.locator('ul.journal').innerText();
  ok(/Bons œufs[\s\S]*300[\s\S]*310/.test(texte) && /Moussa Gerant/.test(texte), 'historique : « Bons œufs 300 → 310 » par Moussa Gerant');
  ok(/Quantité \(kg\)[\s\S]*50[\s\S]*75/.test(texte), 'historique : « Quantité (kg) 50 → 75 »');
  ok(/Awa Agent/.test(texte) && /338|368/.test(texte), 'historique : la correction de l’agent est tracée avec son nom');
  ok(/Bande 1/.test(texte), 'historique : la bande est affichée par son nom, pas par un code');
  await O.getByRole('button', { name: 'Supprimé' }).click();
  ok(await O.getByText(/Aucune entrée pour ces filtres/).isVisible(), 'filtre « Supprimé » : aucune suppression pour l’instant');
  await O.getByRole('button', { name: 'Modifié' }).click();
  await O.getByLabel('Fait par').selectOption('Awa Agent');
  ok((await O.locator('ul.journal > li').count()) === 1, 'filtre par personne : seule la modification de l’agent reste');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
