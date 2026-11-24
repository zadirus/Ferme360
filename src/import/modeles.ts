// Reprise des données existantes (mise en service) : animaux, clients (avec leurs soldes), stock de départ, bandes.
// Aucun mouvement d'argent n'est créé : la reprise n'invente ni achat ni vente, et ne modifie pas la caisse.
import { fmtDate } from '../format';
import { RACES, type Espece } from '../ruminants/types';
import { enObjets, lireDate, lireNombre } from './lecture';

export type TypeImport = 'animaux' | 'clients' | 'stock' | 'bandes';

export interface Enreg { collection: string; id: string; data: Record<string, unknown> }
export interface LigneImport { numero: number; resume: string; erreurs: string[]; avertissements: string[]; enregs: Enreg[] }
export interface ResultatImport { lignes: LigneImport[]; communs: Enreg[] }
export interface Existants {
  animaux: Array<{ id: string; boucle: string; espece: Espece }>;
  lots: Array<{ id: string; nom: string; espece: Espece }>;
  clients: Array<{ nom: string }>;
  articles: Array<{ nom: string }>;
  bandes: Array<{ nom: string }>;
}

export const TITRE_IMPORT: Record<TypeImport, string> = {
  animaux: 'Moutons et bœufs', clients: 'Clients et ce qu’ils doivent', stock: 'Stock de départ (aliments, médicaments)', bandes: 'Bandes de poules'
};

export const COLONNES: Record<TypeImport, string[]> = {
  animaux: ['Boucle', 'Nom', 'Espèce', 'Sexe', 'Naissance', 'Race', 'Robe', 'Poids (kg)', 'Lot', 'Mère', 'Père', "Prix d'achat"],
  clients: ['Nom', 'Téléphone', 'Type', 'Solde dû (FCFA)'],
  stock: ['Article', 'Catégorie', 'Unité', 'Quantité', 'Seuil', "Poids d'une unité (kg)", 'Péremption'],
  bandes: ['Nom', 'Effectif', 'Arrivée', 'Âge à l’arrivée (semaines)', 'Souche', 'Bâtiment']
};

export const EXEMPLES: Record<TypeImport, string[][]> = {
  animaux: [['EX-001', 'Exemple', 'mouton', 'F', '14/03/2025', 'Djallonké', 'blanche', '38', 'Reproductrices', '', '', ''], ['EX-002', '', 'bœuf', 'M', '', 'Baoulé', '', '280', '', '', '', '300000']],
  clients: [['Exemple Maquis Awa', '0700000000', 'maquis', '45000'], ['Exemple Koffi', '', 'revendeur', '0']],
  stock: [['Aliment ponte', 'aliment', 'sac', '12', '5', '50', ''], ['Vaccin Newcastle', 'médicament', 'flacon', '8', '2', '', '30/09/2027']],
  bandes: [['Exemple Bande 1', '400', '01/10/2026', '18', 'ISA Brown', 'Poulailler 1']]
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const premier = (v: Record<string, string>, ...cles: string[]) => cles.map((c) => v[c] ?? '').find((x) => x !== '') ?? '';

function espece(s: string): Espece | null {
  const t = norm(s);
  if (['mouton', 'moutons', 'ovin', 'brebis', 'belier', 'agneau', 'agnelle'].includes(t)) return 'ovin';
  if (['boeuf', 'boeufs', 'bovin', 'vache', 'taureau', 'zebu', 'veau', 'genisse'].includes(t.replace('œ', 'oe'))) return 'bovin';
  return null;
}

export function preparer(type: TypeImport, lignes: string[][], ex: Existants, aujourdhui: string, nouvelId: () => string): ResultatImport {
  const rows = enObjets(lignes);
  const sortie: LigneImport[] = [];
  const communs: Enreg[] = [];
  const vus = new Set<string>();

  const ligne = (numero: number, resume: string): LigneImport => ({ numero, resume, erreurs: [], avertissements: [], enregs: [] });

  if (type === 'animaux') {
    const ids = new Map<string, string>(); // boucle (minuscule) -> id, pour les mères et pères du fichier
    for (const a of ex.animaux) ids.set(a.boucle.toLowerCase(), a.id);
    const aCreer = rows.map((r) => ({ r, id: nouvelId() }));
    for (const { r, id } of aCreer) {
      const b = premier(r.v, 'boucle', 'numero', 'numero de boucle');
      if (b && !ids.has(b.toLowerCase())) ids.set(b.toLowerCase(), id);
    }
    const lots = new Map<string, string>();
    for (const l of ex.lots) lots.set(`${l.espece}|${norm(l.nom)}`, l.id);
    for (const { r, id } of aCreer) {
      const boucle = premier(r.v, 'boucle', 'numero', 'numero de boucle');
      const L = ligne(r.numero, boucle || '(sans numéro)');
      sortie.push(L);
      if (!boucle) { L.erreurs.push('numéro de boucle manquant'); continue; }
      if (ex.animaux.some((a) => a.boucle.toLowerCase() === boucle.toLowerCase())) { L.erreurs.push(`la boucle ${boucle} existe déjà`); continue; }
      if (vus.has(boucle.toLowerCase())) { L.erreurs.push(`la boucle ${boucle} est en double dans le fichier`); continue; }
      vus.add(boucle.toLowerCase());
      const esp = espece(r.v.espece ?? '');
      if (!esp) L.erreurs.push(`espèce « ${r.v.espece ?? ''} » inconnue (écrivez mouton ou bœuf)`);
      const sx = norm(r.v.sexe ?? '');
      const sexe = ['f', 'femelle'].includes(sx) ? 'F' : ['m', 'male'].includes(sx) ? 'M' : null;
      if (!sexe) L.erreurs.push(`sexe « ${r.v.sexe ?? ''} » inconnu (F ou M)`);
      const naissance = lireDate(r.v.naissance ?? '');
      if (naissance === null) L.erreurs.push(`date de naissance illisible (« ${r.v.naissance} »)`);
      const poids = lireNombre(premier(r.v, 'poids kg', 'poids'));
      if (poids === null) L.erreurs.push('poids illisible');
      const prix = lireNombre(premier(r.v, 'prix d achat', 'prix'));
      if (prix === null) L.erreurs.push("prix d'achat illisible");
      if (L.erreurs.length || !esp || !sexe) continue;
      let lotId = '';
      const nomLot = (r.v.lot ?? '').trim();
      if (nomLot) {
        const cle = `${esp}|${norm(nomLot)}`;
        if (!lots.has(cle)) {
          const nid = nouvelId();
          lots.set(cle, nid);
          communs.push({ collection: 'lot', id: nid, data: { nom: nomLot, type: /embouche/i.test(nomLot) ? 'embouche' : 'troupeau', espece: esp, dateDebut: aujourdhui, poidsObjectif: 0, dateObjectif: '' } });
        }
        lotId = lots.get(cle)!;
      }
      const ref = (nom: string, label: string) => {
        const t = (r.v[nom] ?? '').trim();
        if (!t) return '';
        const trouve = ids.get(t.toLowerCase());
        if (!trouve) L.avertissements.push(`${label} ${t} introuvable : laissé vide`);
        return trouve ?? '';
      };
      const mereId = ref('mere', 'mère');
      const pereId = ref('pere', 'père');
      const achete = (prix ?? 0) > 0;
      const date = naissance || aujourdhui;
      L.resume = `${boucle} · ${esp === 'ovin' ? 'mouton' : 'bœuf'} ${sexe === 'F' ? 'femelle' : 'mâle'}${nomLot ? ` · lot ${nomLot}` : ''}`;
      L.enregs.push(
        { collection: 'animal', id, data: { boucle, nom: r.v.nom ?? '', espece: esp, race: r.v.race || RACES[esp][0], sexe, naissance: naissance ?? '', naissanceEstimee: false, robe: r.v.robe ?? '', origine: achete ? 'achete' : 'ne', mereId, pereId, miseBasId: '', vendeur: '', prixAchat: prix ?? 0, poidsAchat: 0, dateAchat: '' } },
        { collection: 'mvt_animal', id: nouvelId(), data: { animalId: id, date, type: 'entree', motif: achete ? 'achat' : 'naissance', lotId, venteId: '', note: 'reprise des données' } }
      );
      if ((poids ?? 0) > 0) L.enregs.push({ collection: 'pesee', id: nouvelId(), data: { animalId: id, date: aujourdhui, poids, methode: 'balance' } });
    }
  }

  if (type === 'clients') {
    for (const r of rows) {
      const nom = premier(r.v, 'nom', 'client');
      const L = ligne(r.numero, nom || '(sans nom)');
      sortie.push(L);
      if (!nom) { L.erreurs.push('nom manquant'); continue; }
      if (ex.clients.some((c) => norm(c.nom) === norm(nom))) { L.erreurs.push(`le client ${nom} existe déjà`); continue; }
      if (vus.has(norm(nom))) { L.erreurs.push(`${nom} est en double dans le fichier`); continue; }
      vus.add(norm(nom));
      const t = norm(r.v.type ?? '');
      const type = ['revendeur', 'maquis', 'particulier'].includes(t) ? t : 'autre';
      const solde = lireNombre(premier(r.v, 'solde du fcfa', 'solde du', 'solde'));
      if (solde === null || solde < 0) { L.erreurs.push('solde illisible ou négatif'); continue; }
      const id = nouvelId();
      L.resume = `${nom}${solde > 0 ? ` · doit ${solde.toLocaleString('fr-FR')} FCFA` : ''}`;
      L.enregs.push({ collection: 'client', id, data: { nom, telephone: r.v.telephone ?? '', type } });
      if (solde > 0) L.enregs.push({ collection: 'vente', id: nouvelId(), data: { date: aujourdhui, clientId: id, activite: 'commun', lignes: [{ article: 'autre', libelle: 'Solde repris', quantite: 1, unite: 'unite', prixUnitaire: solde }], total: solde, note: 'solde de départ', reprise: true } });
    }
  }

  if (type === 'stock') {
    for (const r of rows) {
      const nom = premier(r.v, 'article', 'nom');
      const L = ligne(r.numero, nom || '(sans nom)');
      sortie.push(L);
      if (!nom) { L.erreurs.push("nom de l'article manquant"); continue; }
      if (ex.articles.some((a) => norm(a.nom) === norm(nom))) { L.erreurs.push(`l'article ${nom} existe déjà`); continue; }
      if (vus.has(norm(nom))) { L.erreurs.push(`${nom} est en double dans le fichier`); continue; }
      vus.add(norm(nom));
      const unite = (r.v.unite ?? '').trim();
      if (!unite) L.erreurs.push('unité manquante (sac, flacon…)');
      const qte = lireNombre(r.v.quantite ?? '');
      if (qte === null || qte < 0) L.erreurs.push('quantité illisible');
      const seuil = lireNombre(r.v.seuil ?? '');
      const kg = lireNombre(premier(r.v, 'poids d une unite kg', 'poids'));
      const per = lireDate(r.v.peremption ?? '');
      if (seuil === null || kg === null) L.erreurs.push('seuil ou poids illisible');
      if (per === null) L.erreurs.push('date de péremption illisible');
      if (L.erreurs.length) continue;
      const c = norm(r.v.categorie ?? '');
      const categorie = c.startsWith('alim') ? 'aliment' : c.startsWith('med') || c.startsWith('vacc') ? 'medicament' : 'autre';
      const id = nouvelId();
      L.resume = `${nom} · ${qte} ${unite}${per ? ` · périme le ${fmtDate(per!)}` : ''}`;
      L.enregs.push({ collection: 'article', id, data: { nom, unite, categorie, seuil: seuil ?? 0, kgParUnite: categorie === 'aliment' ? (kg || 1) : 1 } });
      if ((qte ?? 0) > 0) L.enregs.push({ collection: 'stock_mvt', id: nouvelId(), data: { articleId: id, date: aujourdhui, type: 'entree', quantite: qte, peremption: categorie === 'medicament' ? (per ?? '') : '', achatId: '', alimentId: '', note: 'stock de départ' } });
    }
  }

  if (type === 'bandes') {
    for (const r of rows) {
      const nom = premier(r.v, 'nom', 'bande');
      const L = ligne(r.numero, nom || '(sans nom)');
      sortie.push(L);
      if (!nom) { L.erreurs.push('nom manquant'); continue; }
      if (ex.bandes.some((b) => norm(b.nom) === norm(nom)) || vus.has(norm(nom))) { L.erreurs.push(`la bande ${nom} existe déjà`); continue; }
      vus.add(norm(nom));
      const eff = lireNombre(r.v.effectif ?? '');
      if (eff === null || eff < 1 || !Number.isInteger(eff)) L.erreurs.push("effectif : un nombre entier d'au moins 1");
      const arr = lireDate(r.v.arrivee ?? '');
      if (arr === null) L.erreurs.push("date d'arrivée illisible");
      const age = lireNombre(premier(r.v, 'age a l arrivee semaines', 'age'));
      if (age === null) L.erreurs.push('âge illisible');
      if (L.erreurs.length) continue;
      L.resume = `${nom} · ${eff} poules`;
      L.avertissements.push("l'effectif indiqué compte comme effectif de départ (l'historique des mortalités n'est pas repris)");
      L.enregs.push({ collection: 'bande', id: nouvelId(), data: { nom, batiment: r.v.batiment ?? '', souche: r.v.souche ?? '', dateArrivee: arr || aujourdhui, ageArriveeSemaines: Math.max(0, Math.floor(age ?? 0)), effectifInitial: eff, origine: 'reprise', prixAchat: 0 } });
    }
  }
  return { lignes: sortie, communs };
}
