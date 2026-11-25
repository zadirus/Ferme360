// Corbeille : retrouver et restaurer ce qui a été supprimé (les données supprimées restent en base).
import type { Rec } from './db';

// Champs qui rattachent une saisie « fille » à la saisie qui l'a créée (supprimées et restaurées ensemble)
const LIENS_FILLE = ['venteId', 'achatId', 'soinId', 'alimentId', 'miseBasId'];
// Champs qui pointent vers une fiche qui doit exister
const PARENTS: Record<string, string> = {
  animalId: 'animal', bandeId: 'bande', clientId: 'client', fournisseurId: 'fournisseur', articleId: 'article',
  lotId: 'lot', parcId: 'parc', mereId: 'animal', pereId: 'animal', femelleId: 'animal', maleId: 'animal'
};

const val = (r: Rec, champ: string) => (typeof r.data[champ] === 'string' ? (r.data[champ] as string) : '');

function parentsDeFille(r: Rec, supprimes: Set<string>): string[] {
  const out = LIENS_FILLE.map((c) => val(r, c)).filter((v) => v && supprimes.has(v));
  // l'entrée au registre d'un animal supprimé part et revient avec lui
  if (r.collection === 'mvt_animal' && r.data.type === 'entree' && supprimes.has(val(r, 'animalId'))) out.push(val(r, 'animalId'));
  return out;
}

// Les éléments à proposer : ceux qui ne sont pas la « fille » d'un autre élément supprimé
export function racines(supprimes: Rec[]): Rec[] {
  const ids = new Set(supprimes.map((r) => r.id));
  return supprimes.filter((r) => parentsDeFille(r, ids).length === 0).sort((a, b) => b.updatedAt - a.updatedAt);
}

// L'élément et tout ce qui est parti avec lui
export function groupe(racine: Rec, supprimes: Rec[]): Rec[] {
  const ids = new Set(supprimes.map((r) => r.id));
  const out = new Map<string, Rec>([[racine.id, racine]]);
  let ajoute = true;
  while (ajoute) {
    ajoute = false;
    for (const r of supprimes) {
      if (out.has(r.id)) continue;
      if (parentsDeFille(r, ids).some((p) => out.has(p))) { out.set(r.id, r); ajoute = true; }
    }
  }
  return [...out.values()];
}

// Fiches supprimées qu'il faut restaurer d'abord (liste vide = restauration possible)
export function manquants(g: Rec[], vivants: Set<string>, supprimes: Rec[]): Rec[] {
  const dans = new Set(g.map((r) => r.id));
  const out = new Map<string, Rec>();
  for (const r of g) {
    for (const [champ, col] of Object.entries(PARENTS)) {
      const v = val(r, champ);
      if (!v || dans.has(v) || vivants.has(v)) continue;
      const supprime = supprimes.find((x) => x.id === v && x.collection === col);
      // fiche supprimée, ou introuvable : on la signale
      out.set(v, supprime ?? ({ id: v, collection: col, data: {}, updatedAt: 0, deleted: true, author: '', dirty: 0 } as Rec));
    }
  }
  return [...out.values()];
}

// Texte court pour reconnaître une saisie
export function resume(r: Rec): string {
  const d = r.data;
  const nom = ['nom', 'boucle', 'produit', 'libelle', 'texte'].map((k) => d[k]).find((v) => typeof v === 'string' && v);
  const reste = Object.entries(d)
    .filter(([k, v]) => typeof v !== 'object' && v !== '' && v !== false && !k.endsWith('Id') && !['nom', 'boucle', 'produit', 'libelle', 'texte', 'image'].includes(k))
    .slice(0, 5)
    .map(([k, v]) => `${k} : ${String(v)}`);
  return [nom ? String(nom) : '', ...reste].filter(Boolean).join(' · ');
}
