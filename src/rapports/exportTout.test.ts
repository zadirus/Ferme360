// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { lireXlsx } from '../import/lecture';
import { feuillesDonnees } from './exportTout';
import { construireXlsx } from './xlsx';

const r = (id: string, collection: string, data: Record<string, unknown>, updatedAt = 1_700_000_000_000) => ({ id, collection, data, updatedAt, author: 'Jacques' });

describe('export de toutes les données en Excel', () => {
  it('une feuille par type, noms à la place des identifiants, photos et objets lisibles', async () => {
    const f = feuillesDonnees([
      r('a1', 'client', { nom: 'Maquis Awa', telephone: '07' }),
      r('v1', 'vente', { date: '2026-11-02', clientId: 'a1', total: 20000, reprise: false, lignes: [{ article: 'oeufs' }] }),
      r('an1', 'animal', { boucle: 'M001', mereId: 'an0', sexe: 'F' }),
      r('an0', 'animal', { boucle: 'M000', mereId: '', sexe: 'F' }),
      r('p1', 'photo', { animalId: 'an1', image: 'data:image/jpeg;base64,AAAA', date: '2026-11-02' })
    ]);
    expect(f.map((x) => x.nom)).toEqual(['Animal', 'Client', 'Photo', 'Vente']);
    const vente = f.find((x) => x.nom === 'Vente')!;
    expect(vente.colonnes).toEqual(['Date', 'Client', 'Total', 'Reprise', 'Lignes', 'Saisi par', 'Modifié le']);
    expect(vente.lignes[0].slice(0, 4)).toEqual(['2026-11-02', 'Maquis Awa', 20000, 'non']);
    expect(f.find((x) => x.nom === 'Animal')!.lignes.find((l) => l[0] === 'M001')![1]).toBe('M000'); // mère par sa boucle
    expect(f.find((x) => x.nom === 'Photo')!.lignes[0]).toContain('(photo)');
    // le fichier produit se relit
    const relu = await lireXlsx(construireXlsx(f));
    expect(relu[0][0]).toBe('Boucle');
  });
  it('aucune donnée : une feuille explicite', () => {
    expect(feuillesDonnees([])[0].nom).toBe('Vide');
  });
});
