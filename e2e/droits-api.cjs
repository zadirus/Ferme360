const BASE = process.env.BASE || 'http://localhost:8792';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) process.exitCode = 1; };
const call = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const rec = (id, collection, data, updatedAt = Date.now()) => ({ id, collection, data, updatedAt, deleted: false });

(async () => {
  const owner = (await call('/api/setup', { name: 'Jacques', password: 'motdepasse1', code: '' })).body.token;
  ok(!!owner, 'propriétaire créé');
  // le propriétaire enregistre de l'argent et des données d'élevage
  let r = await call('/api/sync', { since: 0, changes: [
    rec('vente-0001', 'vente', { total: 25000 }), rec('depense-01', 'depense', { montant: 3000 }), rec('bande-0001', 'bande', { nom: 'B1' }), rec('carnet-001', 'carnet', { texte: 'note' })
  ] }, owner);
  ok(r.status === 200 && r.body.rejected.length === 0, 'le propriétaire peut tout enregistrer');

  // création des comptes
  ok((await call('/api/users', { name: 'Kouassi', password: 'ouvrier-123', role: 'ouvrier' }, owner)).status === 200, 'compte ouvrier créé');
  ok((await call('/api/users', { name: 'Dr Yao', password: 'veto-12345', role: 'veterinaire' }, owner)).status === 200, 'compte vétérinaire créé');
  ok((await call('/api/users', { name: 'Awa', password: 'gerant-123', role: 'gerant' }, owner)).status === 200, 'compte gérant créé');
  ok((await call('/api/users', { name: 'Pirate', password: 'motdepasse1', role: 'owner' }, owner)).status === 400, 'impossible de créer un second propriétaire');

  const login = async (n, p) => (await call('/api/login', { name: n, password: p })).body.token;
  const ouvrier = await login('Kouassi', 'ouvrier-123');
  const veto = await login('Dr Yao', 'veto-12345');
  const gerant = await login('Awa', 'gerant-123');

  // lecture filtrée côté serveur
  r = await call('/api/sync', { since: 0, changes: [] }, ouvrier);
  const cols = new Set(r.body.records.map((x) => x.collection));
  ok(!cols.has('vente') && !cols.has('depense'), "l'ouvrier ne reçoit ni ventes ni dépenses");
  ok(cols.has('bande') && cols.has('carnet'), "l'ouvrier reçoit les bandes et le carnet");
  r = await call('/api/sync', { since: 0, changes: [] }, gerant);
  ok(new Set(r.body.records.map((x) => x.collection)).has('vente'), 'le gérant voit les ventes');
  r = await call('/api/sync', { since: 0, changes: [] }, veto);
  ok(!new Set(r.body.records.map((x) => x.collection)).has('vente'), 'le vétérinaire ne reçoit pas les ventes');

  // écriture refusée côté serveur
  r = await call('/api/sync', { since: 0, changes: [rec('vente-0002', 'vente', { total: 1 }), rec('ram-00001', 'ramassage', { bons: 10 })] }, ouvrier);
  ok(r.body.rejected.includes('vente-0002') && !r.body.rejected.includes('ram-00001'), "l'ouvrier peut saisir un ramassage mais pas une vente");
  r = await call('/api/sync', { since: 0, changes: [] }, owner);
  ok(!r.body.records.some((x) => x.id === 'vente-0002'), 'la vente refusée n’a pas été enregistrée');
  ok(r.body.records.some((x) => x.id === 'ram-00001'), 'le ramassage de l’ouvrier est bien enregistré');
  r = await call('/api/sync', { since: 0, changes: [rec('bande-0001', 'bande', { nom: 'PIRATE' })] }, ouvrier);
  ok(r.body.rejected.includes('bande-0001'), "l'ouvrier ne peut pas modifier une bande");
  r = await call('/api/sync', { since: 0, changes: [rec('soin-0001', 'soin', { produit: 'x' }), rec('depense-02', 'depense', { montant: 1 })] }, veto);
  ok(r.body.rejected.includes('depense-02') && !r.body.rejected.includes('soin-0001'), 'le vétérinaire peut saisir un soin mais pas une dépense');

  // comptes réservés au propriétaire
  ok((await call('/api/users', undefined, gerant)).status === 403, 'le gérant ne voit pas la liste des comptes');
  ok((await call('/api/journal', undefined, gerant)).status === 403, 'le gérant ne voit pas le journal');
  ok((await call('/api/users', { name: 'X', password: 'motdepasse1', role: 'ouvrier' }, ouvrier)).status === 403, "l'ouvrier ne peut pas créer de compte");

  // journal des modifications : qui, quand, valeur avant
  await call('/api/sync', { since: 0, changes: [rec('bande-0001', 'bande', { nom: 'B1 modifiée' }, Date.now() + 1000)] }, owner);
  await call('/api/sync', { since: 0, changes: [{ ...rec('carnet-001', 'carnet', { texte: 'note' }, Date.now() + 2000), deleted: true }] }, gerant);
  const j = (await call('/api/journal', undefined, owner)).body.entrees;
  const m = j.find((e) => e.recordId === 'bande-0001');
  ok(m && m.action === 'modification' && m.author === 'Jacques' && m.avant.nom === 'B1', 'journal : modification (qui, quand, valeur avant)');
  const d = j.find((e) => e.recordId === 'carnet-001');
  ok(d && d.action === 'suppression' && d.author === 'Awa', 'journal : suppression par le gérant');
  const nb = j.length;
  await call('/api/sync', { since: 0, changes: [rec('bande-0001', 'bande', { nom: 'B1 modifiée' }, Date.now() + 1000)] }, owner);
  ok((await call('/api/journal', undefined, owner)).body.entrees.length === nb, 'journal : un renvoi identique ne crée pas de doublon');

  // désactivation immédiate
  const users = (await call('/api/users', undefined, owner)).body.users;
  const idOuvrier = users.find((u) => u.name === 'Kouassi').id;
  ok((await call('/api/users/update', { id: idOuvrier, active: false }, owner)).status === 200, 'compte ouvrier désactivé');
  ok((await call('/api/sync', { since: 0, changes: [] }, ouvrier)).status === 401, 'le jeton de l’ouvrier cesse de marcher tout de suite');
  ok((await call('/api/login', { name: 'Kouassi', password: 'ouvrier-123' })).status === 403, 'connexion refusée pour un compte désactivé');
  await call('/api/users/update', { id: idOuvrier, active: true, role: 'veterinaire' }, owner);
  const nouv = await login('Kouassi', 'ouvrier-123');
  ok((await call('/api/sync', { since: 0, changes: [] }, nouv)).body.user.role === 'veterinaire', 'le changement de profil est pris en compte tout de suite');
  const idOwner = users.find((u) => u.role === 'owner').id;
  ok((await call('/api/users/update', { id: idOwner, active: false }, owner)).status === 400, 'le propriétaire ne peut pas se désactiver');

  // mot de passe
  ok((await call('/api/password', { ancien: 'faux', nouveau: 'nouveau-mdp-1' }, gerant)).status === 401, 'changement de mot de passe : ancien incorrect refusé');
  ok((await call('/api/password', { ancien: 'gerant-123', nouveau: 'nouveau-mdp-1' }, gerant)).status === 200, 'changement de mot de passe accepté');
  ok(!!(await login('Awa', 'nouveau-mdp-1')), 'connexion avec le nouveau mot de passe');
})().catch((e) => { console.error(e); process.exit(1); });
