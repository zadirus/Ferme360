export interface Bande {
  nom: string;
  batiment: string;
  souche: string;
  dateArrivee: string;
  ageArriveeSemaines: number;
  effectifInitial: number;
  origine: string;
  prixAchat: number;
  cloturee?: boolean;
  dateCloture?: string;
  tags?: string[];
}

export interface Ramassage {
  bandeId: string;
  date: string;
  bons: number;
  feles: number;
  casses: number;
}

export interface Mortalite {
  bandeId: string;
  date: string;
  nombre: number;
  type: 'mort' | 'reforme';
  cause: string;
}

export interface Aliment {
  bandeId: string;
  date: string;
  kg: number;
  sacs?: number; // quantité saisie en sacs (kg = sacs × poids du sac)
  type: 'demarrage' | 'croissance' | 'ponte';
  articleId?: string; // article du stock d'aliment utilisé
  cout?: number; // coût en FCFA au moment de la distribution
}

export interface Sante {
  bandeId: string;
  date: string;
  type: 'vaccin' | 'traitement' | 'autre';
  produit: string;
  note: string;
  rappel: string; // date du prochain rappel, vide si aucun
}

export interface Eau {
  bandeId: string;
  date: string;
  litres: number;
}

export interface Fientes {
  bandeId: string;
  date: string;
  sacs: number;
}

// Mouvement d'œufs hors ramassage : on ajoute, on ne modifie pas.
export interface MvtOeufs {
  date: string;
  type: 'vente' | 'consommation' | 'casse' | 'ajustement' | 'achat'; // achat = œufs achetés à un fournisseur (entrée)
  quantite: number; // en œufs ; négatif possible pour un ajustement
  note: string;
  venteId?: string; // sortie créée par une vente
  achatId?: string; // entrée créée par un achat d'œufs
}
