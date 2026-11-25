// Lecture claire du journal : ce qui a changé, champ par champ, avec des noms et des valeurs lisibles.
import { LIBELLE_COLLECTION } from './libelles';

export type Donnees = Record<string, unknown>;
export interface Difference { champ: string; avant: string; apres: string }

const LIBELLE_CHAMP: Record<string, string> = {
  date: 'Date', bons: 'Bons œufs', feles: 'Œufs fêlés', casses: 'Œufs cassés', nombre: 'Nombre', cause: 'Cause', type: 'Type', kg: 'Quantité (kg)', sacs: 'Sacs',
  produit: 'Produit ou maladie', note: 'Note', rappel: 'Prochain rappel', litres: 'Litres', poids: 'Poids (kg)', methode: 'Mesuré avec', delaiAttente: 'Délai d’attente (jours)',
  texte: 'Texte', nom: 'Nom', telephone: 'Téléphone', boucle: 'Numéro de boucle', race: 'Race', sexe: 'Sexe', naissance: 'Naissance', robe: 'Robe', batiment: 'Bâtiment',
  souche: 'Souche', origine: 'Origine', effectifInitial: 'Poules à l’arrivée', dateArrivee: 'Date d’arrivée', ageArriveeSemaines: 'Âge à l’arrivée (semaines)', prixAchat: 'Prix d’achat',
  montant: 'Montant', total: 'Total', montantPaye: 'Payé', compte: 'Compte', mode: 'Mode de paiement', quantite: 'Quantité', unite: 'Unité', categorie: 'Catégorie', seuil: 'Stock minimum',
  stockMax: 'Stock maximum', delaiReappro: 'Délai de livraison (jours)', kgParUnite: 'Poids d’une unité (kg)', cout: 'Coût', veterinaire: 'Vétérinaire', tags: 'Étiquettes',
  bandeId: 'Bande', animalId: 'Animal', clientId: 'Client', articleId: 'Article', fournisseurId: 'Fournisseur', lotId: 'Lot', parcId: 'Parc', mereId: 'Mère', pereId: 'Père',
  dateDebut: 'Date de début', poidsObjectif: 'Poids visé (kg)', dateObjectif: 'Date visée', activite: 'Activité', libelle: 'Libellé', prixUnitaire: 'Prix unitaire'
};
const REFERENCE: Record<string, string> = { bandeId: 'bande', animalId: 'animal', clientId: 'client', articleId: 'article', fournisseurId: 'fournisseur', lotId: 'lot', parcId: 'parc', mereId: 'animal', pereId: 'animal' };
const CHAMP_NOM: Record<string, string> = { bande: 'nom', animal: 'boucle', client: 'nom', article: 'nom', fournisseur: 'nom', lot: 'nom', parc: 'nom' };
const ARGENT = new Set(['montant', 'total', 'montantPaye', 'cout', 'prixAchat', 'prixUnitaire']);
const INVISIBLES = new Set(['image']);

const jolie = (cle: string) => { const t = cle.replace(/([A-Z])/g, ' $1').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
export const libelleChamp = (cle: string) => LIBELLE_CHAMP[cle] ?? jolie(cle);
const nombreFr = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const dateFr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

// Table id → nom (bande, animal, client…) pour afficher « Bande 1 » plutôt qu'un code
export function tableDesNoms(recs: Array<{ id: string; collection: string; data: Donnees }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of recs) {
    const champ = CHAMP_NOM[r.collection];
    if (champ && typeof r.data[champ] === 'string') m.set(r.id, String(r.data[champ]));
  }
  return m;
}

export function valeurLisible(cle: string, v: unknown, noms: Map<string, string>): string {
  if (v === undefined || v === null || v === '') return '—';
  if (cle in REFERENCE) return noms.get(String(v)) ?? '(fiche supprimée)';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return ARGENT.has(cle) ? `${nombreFr(v)} FCFA` : nombreFr(v);
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? dateFr(v) : v;
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string') ? (v.length ? v.join(', ') : '—') : `${v.length} ligne(s)`;
  return JSON.stringify(v);
}

export function differences(avant: Donnees | null, apres: Donnees | null, noms: Map<string, string>): Difference[] {
  const a = avant ?? {};
  const b = apres ?? {};
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !INVISIBLES.has(k));
  return cles
    .filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
    .map((k) => ({ champ: libelleChamp(k), avant: valeurLisible(k, a[k], noms), apres: valeurLisible(k, b[k], noms) }));
}

// Contenu d'une fiche en quelques mots (pour une suppression)
export function resumeLisible(d: Donnees | null, noms: Map<string, string>): string {
  if (!d) return 'contenu illisible';
  return Object.entries(d)
    .filter(([k, v]) => !INVISIBLES.has(k) && v !== '' && v !== null && v !== undefined && v !== false && typeof v !== 'object')
    .slice(0, 6)
    .map(([k, v]) => `${libelleChamp(k)} : ${valeurLisible(k, v, noms)}`)
    .join(' · ');
}

// « Ramassage · Bande 1 · 25/11/2026 »
export function intitule(collection: string, d: Donnees | null, noms: Map<string, string>): string {
  const base = LIBELLE_COLLECTION[collection] ?? collection;
  if (!d) return base;
  const nom = ['nom', 'boucle', 'produit', 'libelle', 'texte'].map((k) => d[k]).find((v) => typeof v === 'string' && v);
  const bande = typeof d.bandeId === 'string' ? noms.get(d.bandeId) : undefined;
  const animal = typeof d.animalId === 'string' ? noms.get(d.animalId) : undefined;
  const date = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? dateFr(d.date) : '';
  return [base, nom ? String(nom).slice(0, 40) : '', bande ?? animal ?? '', date].filter(Boolean).join(' · ');
}
