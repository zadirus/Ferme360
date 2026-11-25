import { describe, expect, it } from 'vitest';
import { differences, intitule, resumeLisible, tableDesNoms, valeurLisible } from './journalDiff';

const noms = tableDesNoms([{ id: 'b1', collection: 'bande', data: { nom: 'Bande 1' } }, { id: 'a1', collection: 'animal', data: { boucle: '101' } }]);

describe('journal lisible', () => {
  it('montre uniquement ce qui a changé, avec des libellés clairs', () => {
    const d = differences({ bandeId: 'b1', date: '2026-11-25', bons: 300, casses: 2 }, { bandeId: 'b1', date: '2026-11-24', bons: 310, casses: 2 }, noms);
    expect(d).toEqual([
      { champ: 'Date', avant: '25/11/2026', apres: '24/11/2026' },
      { champ: 'Bons œufs', avant: '300', apres: '310' }
    ]);
  });
  it('remplace les codes par les noms', () => {
    expect(valeurLisible('bandeId', 'b1', noms)).toBe('Bande 1');
    expect(valeurLisible('animalId', 'a1', noms)).toBe('101');
    expect(valeurLisible('bandeId', 'inconnu', noms)).toBe('(fiche supprimée)');
  });
  it('formate les montants, nombres, booléens et listes', () => {
    expect(valeurLisible('total', 25000, noms)).toBe('25 000 FCFA'.replace(' ', ' '));
    expect(valeurLisible('kg', 1.5, noms)).toBe('1,5');
    expect(valeurLisible('cloturee', true, noms)).toBe('oui');
    expect(valeurLisible('tags', ['Tabaski', 'À vendre'], noms)).toBe('Tabaski, À vendre');
    expect(valeurLisible('note', '', noms)).toBe('—');
  });
  it('signale un champ ajouté ou retiré', () => {
    expect(differences({ cause: 'Maladie' }, { cause: 'Maladie', note: 'vu par le vétérinaire' }, noms)).toEqual([{ champ: 'Note', avant: '—', apres: 'vu par le vétérinaire' }]);
  });
  it('intitulé lisible d’une saisie', () => {
    expect(intitule('ramassage', { bandeId: 'b1', date: '2026-11-25', bons: 300 }, noms)).toBe('Ramassage · Bande 1 · 25/11/2026');
    expect(intitule('pesee', { animalId: 'a1', date: '2026-11-25', poids: 30 }, noms)).toBe('Pesée · 101 · 25/11/2026');
  });
  it('résume une saisie supprimée', () => {
    expect(resumeLisible({ bandeId: 'b1', bons: 300, casses: 0, date: '2026-11-25' }, noms)).toContain('Bons œufs : 300');
  });
});
