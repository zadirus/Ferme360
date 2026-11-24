import { describe, expect, it } from 'vitest';
import { aTag, ajouterTag, normaliserTag } from './etiquettes';

describe('étiquettes', () => {
  it('nettoie les espaces et limite la longueur', () => {
    expect(normaliserTag('  à   surveiller ')).toBe('à surveiller');
    expect(normaliserTag('x'.repeat(50))).toHaveLength(30);
  });
  it('n’ajoute pas deux fois la même étiquette (majuscules ignorées)', () => {
    expect(ajouterTag(['Tabaski'], 'tabaski')).toEqual(['Tabaski']);
    expect(ajouterTag(['Tabaski'], 'À vendre')).toEqual(['Tabaski', 'À vendre']);
    expect(ajouterTag([], '   ')).toEqual([]);
  });
  it('retrouve une étiquette sans tenir compte des majuscules', () => {
    expect(aTag({ tags: ['Tabaski'] }, 'TABASKI')).toBe(true);
    expect(aTag({}, 'Tabaski')).toBe(false);
  });
});
