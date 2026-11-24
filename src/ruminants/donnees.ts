import { useItems } from '../hooks';
import type { Achat, Depense } from '../gestion/types';
import { etatAnimal, type Statut } from './calculs';
import type { Animal, Lot, MiseBas, MvtAnimal, Pesee, Ration, Repro, Soin, Parc, Pature, Traite, Travail } from './types';

export const libelleAnimal = (a: Animal) => (a.nom ? `${a.boucle} · ${a.nom}` : a.boucle);

// Toutes les données des ruminants + l'état (statut, lot) de chaque animal
export function useRuminants() {
  const animaux = useItems<Animal>('animal');
  const mvts = useItems<MvtAnimal>('mvt_animal');
  const lots = useItems<Lot>('lot');
  const pesees = useItems<Pesee>('pesee');
  const repro = useItems<Repro>('repro');
  const misesBas = useItems<MiseBas>('misebas');
  const soins = useItems<Soin>('soin');
  const rations = useItems<Ration>('ration');
  const depenses = useItems<Depense>('depense');
  const achats = useItems<Achat>('achat');
  const parcs = useItems<Parc>('parc');
  const patures = useItems<Pature>('pature');
  const traites = useItems<Traite>('traite');
  const travaux = useItems<Travail>('travail');

  const parAnimal = new Map<string, typeof mvts>();
  for (const m of mvts) parAnimal.set(m.animalId, [...(parAnimal.get(m.animalId) ?? []), m]);
  const etat = (id: string) => etatAnimal(id, parAnimal.get(id) ?? []);
  const statut = (id: string): Statut => etat(id).statut;

  return { animaux, mvts, lots, pesees, repro, misesBas, soins, rations, depenses, achats, parcs, patures, traites, travaux, etat, statut };
}
