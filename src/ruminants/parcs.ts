import type { Pature } from './types';

type Avec<T> = T & { updatedAt: number };

// Parc où se trouve un lot : déduit de son dernier mouvement
export function parcActuel(lotId: string, patures: Array<Avec<Pature>>): { parcId: string; depuis: string } | null {
  const siens = patures.filter((p) => p.lotId === lotId).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt);
  const dernier = siens[siens.length - 1];
  return dernier && dernier.type === 'entree' ? { parcId: dernier.parcId, depuis: dernier.date } : null;
}

// Nombre d'animaux présents dans un parc, d'après les lots qui s'y trouvent
export function occupation(parcId: string, lots: string[], patures: Array<Avec<Pature>>, effectifLot: (lotId: string) => number): number {
  return lots.filter((l) => parcActuel(l, patures)?.parcId === parcId).reduce((s, l) => s + effectifLot(l), 0);
}
