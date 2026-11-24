import { describe, expect, it } from 'vitest';
import type { Rec } from './db';
import { accompagnants, bloquants, grouper, nomDejaPris } from './integrite';

const r = (collection: string, id: string, data: Record<string, unknown>, deleted = false): Rec => ({ id, collection, data, updatedAt: 1, deleted, author: '', dirty: 0 });

describe('intégrité avant suppression', () => {
  it('un client sans vente ni paiement peut être supprimé', () => {
    const g = grouper([r('client', 'c1', { nom: 'A' })]);
    expect(bloquants('client', 'c1', g)).toEqual([]);
  });
  it('un client avec des ventes et des paiements est protégé, avec le détail', () => {
    const g = grouper([r('client', 'c1', { nom: 'A' }), r('vente', 'v1', { clientId: 'c1' }), r('vente', 'v2', { clientId: 'c1' }), r('paiement', 'p1', { clientId: 'c1' }), r('vente', 'v3', { clientId: 'autre' })]);
    expect(bloquants('client', 'c1', g)).toEqual(['2 vente(s)', '1 paiement(s)']);
  });
  it('les éléments déjà supprimés ne bloquent plus', () => {
    const g = grouper([r('vente', 'v1', { clientId: 'c1' }, true)]);
    expect(bloquants('client', 'c1', g)).toEqual([]);
  });
  it('un article utilisé (stock, achats, distributions) est protégé', () => {
    const g = grouper([r('stock_mvt', 'm1', { articleId: 'a1' }), r('achat', 'x1', { articleId: 'a1' }), r('aliment', 'd1', { articleId: 'a1' })]);
    expect(bloquants('article', 'a1', g)).toHaveLength(3);
  });
  it('un animal : seule son entrée au registre est supprimée avec lui', () => {
    const g = grouper([r('animal', 'an1', {}), r('mvt_animal', 'e1', { animalId: 'an1', type: 'entree' })]);
    expect(bloquants('animal', 'an1', g)).toEqual([]);
    expect(accompagnants('animal', 'an1', g)).toEqual([['mvt_animal', 'e1']]);
  });
  it('un animal vendu, pesé, ou parent d’un autre est protégé', () => {
    const g = grouper([
      r('animal', 'an1', {}), r('animal', 'an2', { mereId: 'an1' }), r('pesee', 'p1', { animalId: 'an1' }),
      r('mvt_animal', 'e1', { animalId: 'an1', type: 'entree' }), r('mvt_animal', 's1', { animalId: 'an1', type: 'sortie' }),
      r('vente', 'v1', { lignes: [{ animalId: 'an1' }] })
    ]);
    const b = bloquants('animal', 'an1', g);
    expect(b).toContain('1 pesée(s)');
    expect(b).toContain('1 descendant(s) enregistré(s)');
    expect(b.some((x) => x.includes('mouvement'))).toBe(true);
    expect(b).toContain('1 vente(s)');
  });
  it('un lot qui a accueilli des animaux est protégé', () => {
    const g = grouper([r('mvt_animal', 'm', { lotId: 'l1', animalId: 'a', type: 'entree' })]);
    expect(bloquants('lot', 'l1', g)).toHaveLength(1);
  });
  it('détecte un nom déjà utilisé par une autre fiche', () => {
    const g = grouper([r('article', 'a1', { nom: 'Aliment ponte' }), r('article', 'a2', { nom: 'Vaccin' })]);
    expect(nomDejaPris(g, 'article', 'nom', ' aliment PONTE ', 'a2')).toBe(true);
    expect(nomDejaPris(g, 'article', 'nom', 'Aliment ponte', 'a1')).toBe(false);
  });
});
