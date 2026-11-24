import { useEffect, useState } from 'preact/hooks';
import { listAll, type Rec } from './db';
import { getState, onData, subscribe } from './sync';

export type Item<T> = T & { id: string; updatedAt: number; dirty: 0 | 1 };

// Toutes les données du téléphone sont rechargées ensemble : les écrans ne voient jamais un état à moitié à jour.
let instantane = new Map<string, Item<unknown>[]>();
const abonnes = new Set<() => void>();
let enCours: Promise<void> | null = null;
let relance = false;

export function recharger(): Promise<void> {
  if (enCours) {
    relance = true;
    return enCours;
  }
  enCours = (async () => {
    do {
      relance = false;
      const m = new Map<string, Item<unknown>[]>();
      for (const r of await listAll() as Rec[]) {
        const item = { ...r.data, id: r.id, updatedAt: r.updatedAt, dirty: r.dirty } as Item<unknown>;
        const liste = m.get(r.collection);
        if (liste) liste.push(item);
        else m.set(r.collection, [item]);
      }
      instantane = m;
      abonnes.forEach((f) => f());
    } while (relance);
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

// Charge les données avant le premier affichage : pas de « 0 » trompeur.
export const prechauffer = recharger;
onData(() => recharger());

const VIDE: Item<unknown>[] = [];

// Liste d'une collection, mise à jour toute seule à chaque saisie ou synchronisation.
export function useItems<T>(collection: string): Item<T>[] {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    abonnes.add(f);
    return () => {
      abonnes.delete(f);
    };
  }, []);
  return (instantane.get(collection) ?? VIDE) as Item<T>[];
}

// Données d'un élément, sans les champs techniques (pour le réenregistrer ou le supprimer)
export function dataOf<T>(item: Item<T>): T {
  const { id: _id, updatedAt: _u, dirty: _d, ...data } = item;
  return data as unknown as T;
}

export function useHash(): string {
  const lire = () => location.hash.replace(/^#/, '') || '/';
  const [h, setH] = useState(lire());
  useEffect(() => {
    const f = () => setH(lire());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export function useRole(): string {
  const [r, setR] = useState(getState().role);
  useEffect(() => subscribe(() => setR(getState().role)), []);
  return r;
}

export const go = (path: string) => {
  location.hash = path;
};
