export type Activite = 'poules' | 'ovins' | 'bovins' | 'commun';
export const ACTIVITES: Array<[Activite, string]> = [
  ['poules', 'Poules pondeuses'],
  ['ovins', 'Moutons'],
  ['bovins', 'Bœufs'],
  ['commun', 'Commun à la ferme']
];
export const nomActivite = (a: Activite) => ACTIVITES.find(([k]) => k === a)?.[1] ?? a;

export type Compte = 'caisse' | 'mobile_money' | 'banque';
export const COMPTES: Array<[Compte, string]> = [
  ['caisse', 'Caisse (espèces)'],
  ['mobile_money', 'Mobile Money'],
  ['banque', 'Banque / virement']
];
export const nomCompte = (c: Compte) => COMPTES.find(([k]) => k === c)?.[1] ?? c;

export interface Client {
  nom: string;
  telephone: string;
  type: 'revendeur' | 'maquis' | 'particulier' | 'autre';
  tags?: string[];
}

export interface LigneVente {
  article: 'oeufs' | 'fumier' | 'animal' | 'lait' | 'autre';
  libelle: string;
  quantite: number; // animal : poids en kg (vente au poids) ou 1 (vente sur pied)
  unite: 'plateau' | 'oeuf' | 'sac' | 'unite' | 'kg' | 'tete' | 'litre';
  prixUnitaire: number; // animal : prix au kg ou prix de la tête
  animalId?: string;
}

export interface Vente {
  date: string;
  clientId: string; // vide = vente comptant sans nom
  activite: Activite;
  lignes: LigneVente[];
  total: number;
  note: string;
  reprise?: boolean; // solde de départ repris à la mise en service : une créance, pas une vente
}

export interface Paiement {
  date: string;
  clientId: string;
  venteId: string; // vide si encaissement libre
  montant: number;
  mode: 'especes' | 'mobile_money' | 'virement';
  note: string;
}

export interface Fournisseur {
  nom: string;
  telephone: string;
}

export interface Article {
  nom: string;
  unite: string; // sac, flacon, dose, kg…
  categorie: 'aliment' | 'medicament' | 'autre';
  seuil: number; // alerte quand le stock descend à ce niveau
  kgParUnite: number; // aliment : 50 pour un sac de 50 kg, 1 si l'unité est le kg
  stockMax?: number; // stock maximum souhaité (0 ou absent = pas de maximum)
  delaiReappro?: number; // jours entre la commande et la livraison (0 ou absent = non renseigné)
  tags?: string[];
}

export interface Achat {
  date: string;
  fournisseurId: string;
  activite: Activite;
  articleId: string; // vide = achat sans suivi de stock
  libelle: string;
  quantite: number;
  total: number;
  montantPaye: number;
  compte: Compte;
  peremption: string;
  animalId?: string; // achat d'un animal
}

export interface Reglement {
  date: string;
  fournisseurId: string;
  montant: number;
  compte: Compte;
}

// Mouvement de stock : on ajoute, on ne modifie pas.
export interface StockMvt {
  articleId: string;
  date: string;
  type: 'entree' | 'sortie' | 'ajustement';
  quantite: number; // négatif possible pour un ajustement
  peremption: string;
  achatId: string;
  alimentId: string;
  note: string;
}

export interface Depense {
  date: string;
  activite: Activite;
  categorie: string;
  libelle: string;
  montant: number;
  compte: Compte;
  soinId?: string; // dépense créée par un soin vétérinaire
}

export const CATEGORIES_DEPENSE = ['Électricité et eau', 'Transport', 'Main-d’œuvre', 'Réparations', 'Soins vétérinaires', 'Autre'];

// Ajustement manuel d'un solde (solde de départ, écart constaté)
export interface TresoMvt {
  date: string;
  compte: Compte;
  montant: number;
  note: string;
}
