import { describe, expect, it } from 'vitest';
import type { Rec } from './db';
import { groupe, manquants, racines } from './corbeille';

const r = (collection: string, id: string, data: Record<string, unknown> = {}, updatedAt = 1): Rec => ({ id, collection, data, updatedAt, deleted: true, author: 'Awa', dirty: 0 });

describe('corbeille', () => {
  const vente = r('vente', 'v1', { clientId: 'c1' }, 10);
  const paiement = r('paiement', 'p1', { venteId: 'v1', clientId: 'c1' }, 10);
  const sortie = r('oeufs_mvt', 'o1', { venteId: 'v1' }, 10);
  const pesee = r('pesee', 'ps1', { animalId: 'a9' }, 5);

  it('seules les saisies « mères » sont proposées ; les filles reviennent avec elles', () => {
    expect(racines([vente, paiement, sortie, pesee]).map((x) => x.id)).toEqual(['v1', 'ps1']);
  });
  it('restaurer une vente ramène son paiement et sa sortie d’œufs', () => {
    expect(groupe(vente, [vente, paiement, sortie, pesee]).map((x) => x.id).sort()).toEqual(['o1', 'p1', 'v1']);
  });
  it('un animal supprimé revient avec son entrée au registre', () => {
    const animal = r('animal', 'a1', { boucle: '101' });
    const entree = r('mvt_animal', 'e1', { animalId: 'a1', type: 'entree' });
    const sortieAnimal = r('mvt_animal', 'e2', { animalId: 'a1', type: 'sortie' });
    expect(racines([animal, entree]).map((x) => x.id)).toEqual(['a1']);
    expect(groupe(animal, [animal, entree, sortieAnimal]).map((x) => x.id).sort()).toEqual(['a1', 'e1']);
  });
  it('si la fiche rattachée n’existe plus, il faut la restaurer d’abord', () => {
    const client = r('client', 'c1', { nom: 'Awa' });
    const g = groupe(vente, [vente, client]);
    expect(manquants(g, new Set(), [vente, client]).map((x) => x.id)).toEqual(['c1']);
    expect(manquants(g, new Set(['c1']), [vente])).toEqual([]);
  });
});
