import { useEffect, useState } from 'preact/hooks';
import { listCollection } from './db';
import { onData } from './sync';

export type Item<T> = T & { id: string; updatedAt: number; dirty: 0 | 1 };

// Liste d'une collection, mise à jour toute seule à chaque saisie ou synchronisation.
export function useItems<T>(collection: string): Item<T>[] {
  const [items, setItems] = useState<Item<T>[]>([]);
  useEffect(() => {
    let vivant = true;
    const charger = async () => {
      const all = await listCollection(collection);
      if (vivant) setItems(all.map((r) => ({ ...(r.data as T), id: r.id, updatedAt: r.updatedAt, dirty: r.dirty })));
    };
    void charger();
    const off = onData(() => void charger());
    return () => {
      vivant = false;
      off();
    };
  }, [collection]);
  return items;
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

export const go = (path: string) => {
  location.hash = path;
};
