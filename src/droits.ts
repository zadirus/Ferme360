// Droits par profil. Ce fichier est partagé entre le serveur (qui les applique) et l'application (qui masque ce qui est interdit).

export type Role = 'owner' | 'gerant' | 'ouvrier' | 'veterinaire';

export const NOM_ROLE: Record<Role, string> = {
  owner: 'Propriétaire',
  gerant: 'Gérant',
  ouvrier: 'Agent d’élevage',
  veterinaire: 'Vétérinaire'
};

export const ROLES_CREABLES: Array<[Role, string]> = [
  ['gerant', NOM_ROLE.gerant],
  ['ouvrier', NOM_ROLE.ouvrier],
  ['veterinaire', NOM_ROLE.veterinaire]
];

// Ce qu'un profil peut ENREGISTRER. '*' = tout.
const ECRITURE: Record<Role, string[] | '*'> = {
  owner: '*',
  gerant: '*',
  ouvrier: [
    'ramassage', 'mortalite', 'aliment', 'oeufs_mvt', 'stock_mvt', 'carnet', 'eau', 'fientes',
    'animal', 'mvt_animal', 'pesee', 'repro', 'misebas', 'ration', 'photo', 'pature', 'traite', 'travail'
  ],
  veterinaire: ['soin', 'sante', 'pesee', 'repro', 'carnet', 'photo', 'stock_mvt']
};

// Ce qu'un profil peut LIRE en plus de ce qu'il enregistre. Jamais d'argent (ventes, achats, dépenses, clients…).
const LECTURE_EN_PLUS: Record<Role, string[]> = {
  owner: [],
  gerant: [],
  ouvrier: ['bande', 'lot', 'article', 'reglage', 'soin', 'parc'],
  veterinaire: ['bande', 'mortalite', 'animal', 'mvt_animal', 'lot', 'misebas', 'reglage', 'article']
};

// Suppression : seuls le propriétaire et le gérant peuvent supprimer une saisie validée.
// Les autres profils peuvent annuler LEUR propre saisie pendant 2 heures, tant qu'elle n'a pas été modifiée
// (correction d'une erreur de frappe). Le serveur applique la règle ; l'application masque le bouton.
export const FENETRE_CORRECTION_MS = 2 * 60 * 60 * 1000;
export const peutToutSupprimer = (role: string) => role === 'owner' || role === 'gerant';
// `auteur` et `moi` : si l'auteur de la saisie est connu et que ce n'est pas la personne connectée, le bouton est masqué.
export const peutSupprimerSaisie = (role: string, modifieLe: number, auteur?: string, moi?: string, maintenant = Date.now()) =>
  peutToutSupprimer(role) || (maintenant - modifieLe <= FENETRE_CORRECTION_MS && (auteur === undefined || moi === undefined || auteur === moi));

const connu = (role: string): role is Role => role in ECRITURE;

export function peutEcrire(role: string, collection: string): boolean {
  if (!connu(role)) return false;
  const e = ECRITURE[role];
  return e === '*' || e.includes(collection);
}

// null = toutes les collections
export function collectionsLisibles(role: string): string[] | null {
  if (!connu(role)) return [];
  const e = ECRITURE[role];
  return e === '*' ? null : [...e, ...LECTURE_EN_PLUS[role]];
}

export const peutLire = (role: string, collection: string) => {
  const c = collectionsLisibles(role);
  return c === null || c.includes(collection);
};

export type Capacite = 'argent' | 'achats' | 'stocks' | 'equipe' | 'journal' | 'reglages' | 'rapports' | 'sauvegarde';

const GESTIONNAIRES: Role[] = ['owner', 'gerant'];

export function peut(role: string, c: Capacite): boolean {
  if (!connu(role)) return false;
  if (c === 'equipe' || c === 'journal') return role === 'owner';
  if (c === 'stocks') return role !== 'veterinaire';
  return GESTIONNAIRES.includes(role); // argent, achats, reglages, rapports, sauvegarde
}
