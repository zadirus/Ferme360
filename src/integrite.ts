// Intégrité des données : ce qui empêche de supprimer une fiche, et ce qui part avec elle.
import type { Rec } from './db';

export type Ligne = Record<string, unknown> & { id: string };
export type Groupes = Record<string, Ligne[]>;

// Regroupe les enregistrements non supprimés par collection, à plat : { id, ...data }
export function grouper(recs: Rec[]): Groupes {
  const g: Groupes = {};
  for (const r of recs) {
    if (r.deleted) continue;
    (g[r.collection] ??= []).push({ ...r.data, id: r.id });
  }
  return g;
}

// [collection liée, champs qui pointent vers la fiche, libellé]
const LIENS: Record<string, Array<[string, string[], string]>> = {
  article: [
    ['stock_mvt', ['articleId'], 'mouvement(s) de stock'],
    ['achat', ['articleId'], 'achat(s)'],
    ['aliment', ['articleId'], 'distribution(s) d’aliment aux poules'],
    ['ration', ['articleId'], 'ration(s) de lots']
  ],
  fournisseur: [
    ['achat', ['fournisseurId'], 'achat(s)'],
    ['reglement', ['fournisseurId'], 'règlement(s)']
  ],
  client: [
    ['vente', ['clientId'], 'vente(s)'],
    ['paiement', ['clientId'], 'paiement(s)']
  ],
  bande: [
    ['ramassage', ['bandeId'], 'ramassage(s) d’œufs'],
    ['mortalite', ['bandeId'], 'saisie(s) de mortalité'],
    ['aliment', ['bandeId'], 'distribution(s) d’aliment'],
    ['sante', ['bandeId'], 'soin(s) ou vaccin(s)'],
    ['eau', ['bandeId'], 'relevé(s) d’eau'],
    ['fientes', ['bandeId'], 'saisie(s) de fientes']
  ],
  lot: [
    ['mvt_animal', ['lotId'], 'passage(s) d’animaux dans le lot'],
    ['ration', ['lotId'], 'ration(s)'],
    ['soin', ['lotId'], 'soin(s) du lot'],
    ['pature', ['lotId'], 'séjour(s) en parc']
  ],
  parc: [['pature', ['parcId'], 'séjour(s) de lots dans ce parc']],
  animal: [
    ['pesee', ['animalId'], 'pesée(s)'],
    ['soin', ['animalId'], 'soin(s)'],
    ['repro', ['femelleId', 'maleId'], 'saillie(s) ou diagnostic(s)'],
    ['misebas', ['mereId', 'pereId'], 'mise(s) bas'],
    ['traite', ['animalId'], 'traite(s)'],
    ['travail', ['animalId'], 'journée(s) de travail'],
    ['photo', ['animalId'], 'photo(s)'],
    ['animal', ['mereId', 'pereId'], 'descendant(s) enregistré(s)'],
    ['achat', ['animalId'], 'achat(s) (à supprimer dans Argent)']
  ]
};

export const SUPPRIMABLES = Object.keys(LIENS);

const pluriel = (n: number, libelle: string) => `${n} ${libelle}`;

// Raisons pour lesquelles la fiche ne peut pas être supprimée (liste vide = suppression possible)
export function bloquants(collection: string, id: string, g: Groupes): string[] {
  const out: string[] = [];
  for (const [col, champs, libelle] of LIENS[collection] ?? []) {
    const n = (g[col] ?? []).filter((x) => x.id !== id && champs.some((c) => x[c] === id)).length;
    if (n > 0) out.push(pluriel(n, libelle));
  }
  if (collection === 'animal') {
    // l'entrée dans le registre part avec la fiche ; toute autre sortie ou changement de lot bloque
    const nMvt = (g.mvt_animal ?? []).filter((m) => m.animalId === id && m.type !== 'entree').length;
    if (nMvt > 0) out.push(pluriel(nMvt, 'mouvement(s) (vente, mort, changement de lot…)'));
    const nVente = (g.vente ?? []).filter((v) => Array.isArray(v.lignes) && (v.lignes as Array<{ animalId?: string }>).some((l) => l.animalId === id)).length;
    if (nVente > 0) out.push(pluriel(nVente, 'vente(s)'));
  }
  return out;
}

// Ce qui est supprimé AVEC la fiche (seulement l'entrée dans le registre d'un animal)
export function accompagnants(collection: string, id: string, g: Groupes): Array<[string, string]> {
  if (collection !== 'animal') return [];
  return (g.mvt_animal ?? []).filter((m) => m.animalId === id && m.type === 'entree').map((m) => ['mvt_animal', m.id] as [string, string]);
}

export function messageBlocage(nomFiche: string, raisons: string[]): string {
  return `Suppression impossible : « ${nomFiche} » est utilisé(e) par ${raisons.join(', ')}. Supprimez ou corrigez d’abord ces éléments, pour ne pas laisser de données orphelines.`;
}

// Un nom déjà pris par une autre fiche (majuscules ignorées) ?
export function nomDejaPris(g: Groupes, collection: string, champ: string, valeur: string, sauf: string, filtre?: (x: Ligne) => boolean): boolean {
  const v = valeur.trim().toLowerCase();
  return (g[collection] ?? []).some((x) => x.id !== sauf && String(x[champ] ?? '').trim().toLowerCase() === v && (!filtre || filtre(x)));
}
