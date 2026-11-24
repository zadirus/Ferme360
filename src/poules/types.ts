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
  type: 'demarrage' | 'croissance' | 'ponte';
}

export interface Sante {
  bandeId: string;
  date: string;
  type: 'vaccin' | 'traitement' | 'autre';
  produit: string;
  note: string;
  rappel: string; // date du prochain rappel, vide si aucun
}

// Mouvement d'œufs hors ramassage : on ajoute, on ne modifie pas.
export interface MvtOeufs {
  date: string;
  type: 'vente' | 'consommation' | 'casse' | 'ajustement';
  quantite: number; // en œufs ; négatif possible pour un ajustement
  note: string;
}
