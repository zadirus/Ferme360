// Droits par profil. Ce fichier est partagé entre le serveur (qui les applique) et l'application (qui masque ce qui est interdit).

export type Role = 'owner' | 'gerant' | 'ouvrier' | 'veterinaire';

export const NOM_ROLE: Record<Role, string> = {
  owner: 'Propriétaire',
  gerant: 'Gérant',
  ouvrier: 'Ouvrier (élevage)',
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
    'animal', 'mvt_animal', 'pesee', 'repro', 'misebas', 'ration'
  ],
  veterinaire: ['soin', 'sante', 'pesee', 'repro', 'carnet']
};

// Ce qu'un profil peut LIRE en plus de ce qu'il enregistre. Jamais d'argent (ventes, achats, dépenses, clients…).
const LECTURE_EN_PLUS: Record<Role, string[]> = {
  owner: [],
  gerant: [],
  ouvrier: ['bande', 'lot', 'article', 'reglage', 'soin'],
  veterinaire: ['bande', 'mortalite', 'animal', 'mvt_animal', 'lot', 'misebas', 'reglage']
};

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
