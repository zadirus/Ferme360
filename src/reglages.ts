// Seuils d'alerte et valeurs par défaut, modifiables par le propriétaire ou le gérant (enregistrés comme les autres données).
export interface Reglages {
  chutePonteSeuil: number; // points de ponte perdus
  chutePonteJours: number; // sur combien de jours
  mortaliteJourPct: number; // % de l'effectif en un jour
  mortaliteJourMin: number; // nombre minimum de poules mortes en un jour
  joursPeremption: number; // alerte avant péremption
  joursCreance: number; // alerte de créance ancienne
  poidsOeufG: number; // pour l'indice de consommation
  gestationOvin: number;
  gestationBovin: number;
  sevrageOvinJours: number; // rappel de sevrage après la naissance (0 = pas de rappel)
  sevrageBovinJours: number;
  castrationJours: number; // rappel de castration des mâles (0 = pas de rappel)
  reformeOvinAns: number; // âge à partir duquel un animal est proposé à la réforme
  reformeBovinAns: number;
  eauBaissePct: number; // alerte si l'eau bue par poule baisse de ce pourcentage
  heureNotif: number; // heure locale d'envoi des notifications du matin
  decalageUtc: number; // décalage horaire de la ferme par rapport à l'heure UTC (0 en Côte d'Ivoire et au Sénégal, +1 au Bénin et au Cameroun)
}

export const DEFAUTS: Reglages = {
  chutePonteSeuil: 5,
  chutePonteJours: 3,
  mortaliteJourPct: 1,
  mortaliteJourMin: 2,
  joursPeremption: 30,
  joursCreance: 30,
  poidsOeufG: 60,
  gestationOvin: 150,
  gestationBovin: 283,
  sevrageOvinJours: 90,
  sevrageBovinJours: 210,
  castrationJours: 60,
  reformeOvinAns: 7,
  reformeBovinAns: 10,
  eauBaissePct: 20,
  heureNotif: 6,
  decalageUtc: 0
};

export const REGLAGES: Reglages = { ...DEFAUTS };
export const ID_REGLAGES = 'reglages-ferme';
export const ID_PROGRAMMES = 'programmes-ferme'; // vaccins par âge et courbe de ponte de référence (textes modifiables)

export function appliquerReglages(r: Partial<Reglages>) {
  Object.assign(REGLAGES, DEFAUTS);
  for (const k of Object.keys(DEFAUTS) as Array<keyof Reglages>) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v) && (v >= 0 || k === 'decalageUtc')) REGLAGES[k] = v;
  }
}

export const gestationParDefaut = (espece: 'ovin' | 'bovin') => (espece === 'ovin' ? REGLAGES.gestationOvin : REGLAGES.gestationBovin);
