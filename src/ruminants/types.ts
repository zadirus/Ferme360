import type { Activite } from '../gestion/types';

export type Espece = 'ovin' | 'bovin';
export const NOM_ESPECE: Record<Espece, string> = { ovin: 'Mouton', bovin: 'Bœuf' };
export const NOM_ESPECES: Record<Espece, string> = { ovin: 'Moutons', bovin: 'Bœufs' };
export const ICONE_ESPECE: Record<Espece, string> = { ovin: '🐑', bovin: '🐄' };
export const ACTIVITE_ESPECE: Record<Espece, Activite> = { ovin: 'ovins', bovin: 'bovins' };
export const RACES: Record<Espece, string[]> = {
  ovin: ['Djallonké', 'Peul', 'Touabire', 'Bali-bali', 'Croisé'],
  bovin: ['Baoulé', 'N’Dama', 'Zébu', 'Gudali', 'Croisé']
};

export interface Animal {
  boucle: string;
  nom: string;
  espece: Espece;
  race: string;
  sexe: 'F' | 'M';
  naissance: string; // vide si inconnue
  naissanceEstimee: boolean;
  robe: string;
  origine: 'ne' | 'achete';
  mereId: string;
  pereId: string;
  miseBasId: string;
  vendeur: string;
  prixAchat: number;
  poidsAchat: number;
  dateAchat: string;
  tags?: string[];
}

// Mouvements : le statut et le lot d'un animal sont toujours déduits d'eux.
export interface MvtAnimal {
  animalId: string;
  date: string;
  type: 'entree' | 'sortie' | 'lot';
  motif: 'naissance' | 'achat' | 'vente' | 'mort' | 'abattage' | 'perte' | 'changement_lot';
  lotId: string;
  venteId: string;
  note: string;
}

export interface Lot {
  nom: string;
  type: 'troupeau' | 'embouche' | 'reproductrices' | 'autre';
  espece: Espece;
  dateDebut: string;
  poidsObjectif: number; // embouche : poids moyen visé (kg), 0 si aucun
  dateObjectif: string; // embouche : date visée (ex. Tabaski)
  tags?: string[];
}

export interface Pesee {
  animalId: string;
  date: string;
  poids: number;
  methode: 'balance' | 'ruban';
}

export interface Repro {
  femelleId: string;
  type: 'chaleurs' | 'saillie' | 'diagnostic';
  date: string;
  maleId: string;
  resultat: 'gestante' | 'vide' | '';
  gestationJours: number; // pour une saillie : modifiable
  note: string;
}

export interface MiseBas {
  mereId: string;
  date: string;
  pereId: string;
  vivants: number;
  mortNes: number;
  difficulte: 'normale' | 'assistee' | 'difficile';
}

export interface Soin {
  animalId: string; // vide si soin de lot
  lotId: string;
  date: string;
  type: 'vaccin' | 'deparasitage' | 'traitement' | 'diagnostic' | 'castration' | 'sevrage' | 'autre';
  produit: string;
  veterinaire: string;
  cout: number;
  delaiAttente: number; // jours avant vente ou abattage
  rappel: string;
  note: string;
}

export const NOM_SOIN: Record<Soin['type'], string> = {
  vaccin: 'Vaccin',
  deparasitage: 'Déparasitage',
  traitement: 'Traitement',
  diagnostic: 'Diagnostic',
  castration: 'Castration',
  sevrage: 'Sevrage',
  autre: 'Autre soin'
};

export interface Ration {
  lotId: string;
  date: string;
  kg: number;
  articleId: string;
  cout: number;
  note: string;
}

export interface Parc {
  nom: string;
  capacite: number; // nombre d'animaux que le parc peut porter (0 = non précisé)
  note: string;
}

// Mouvements de lots dans les parcs : le parc actuel d'un lot est déduit du dernier mouvement
export interface Pature {
  lotId: string;
  parcId: string;
  date: string;
  type: 'entree' | 'sortie';
}

export interface Traite {
  animalId: string;
  date: string;
  litres: number;
}

export interface Travail {
  animalId: string;
  date: string;
  jours: number;
  recette: number;
  venteId: string; // vente créée si le bœuf est loué
  note: string;
}

export interface Photo {
  animalId: string;
  date: string;
  image: string; // photo réduite (JPEG, adresse de données) pour tenir dans la synchronisation
  legende: string;
}
