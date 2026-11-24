import { describe, expect, it } from 'vitest';
import { derniersMois, finDeMois, fmtCourt, parMois, tauxPonteQuotidien, tresorerieAu, variation, vieillissementCreances } from './indicateurs';
import type { Bande, Mortalite, Ramassage } from '../poules/types';

describe('tableau de bord : calculs', () => {
  it('les 12 derniers mois, à cheval sur deux années', () => {
    const m = derniersMois(12, '2026-02-14');
    expect(m[0]).toBe('2025-03');
    expect(m[11]).toBe('2026-02');
    expect(m).toHaveLength(12);
    expect(finDeMois('2026-02')).toBe('2026-02-28');
    expect(finDeMois('2026-12')).toBe('2026-12-31');
  });

  it('somme par mois, mois sans donnée à zéro, hors période ignoré', () => {
    const v = [{ d: '2026-10-05', x: 100 }, { d: '2026-10-20', x: 50 }, { d: '2026-12-01', x: 70 }, { d: '2024-01-01', x: 999 }];
    expect(parMois(v, ['2026-10', '2026-11', '2026-12'], (a) => a.d, (a) => a.x)).toEqual([150, 0, 70]);
  });

  it('trésorerie à une date : ce qui est postérieur ne compte pas', () => {
    const paie = [{ date: '2026-10-10', clientId: '', venteId: '', montant: 20000, mode: 'especes' as const, note: '' }, { date: '2026-11-10', clientId: '', venteId: '', montant: 5000, mode: 'mobile_money' as const, note: '' }];
    const dep = [{ date: '2026-10-15', activite: 'commun' as const, categorie: 'x', libelle: '', montant: 3000, compte: 'caisse' as const }];
    const aj = [{ date: '2026-10-01', compte: 'caisse' as const, montant: 100000, note: '' }];
    expect(tresorerieAu('2026-10-31', paie, [], [], dep, aj)).toBe(100000 + 20000 - 3000);
    expect(tresorerieAu('2026-11-30', paie, [], [], dep, aj)).toBe(100000 + 20000 + 5000 - 3000);
    expect(tresorerieAu('2026-09-30', paie, [], [], dep, aj)).toBe(0);
  });

  it('créances classées par ancienneté', () => {
    const r = vieillissementCreances([{ clientId: 'a', solde: 10000, jours: 5 }, { clientId: 'b', solde: 5000, jours: 30 }, { clientId: 'c', solde: 7000, jours: 45 }, { clientId: 'd', solde: 1000, jours: 120 }]);
    expect(r.map((x) => [x.montant, x.clients])).toEqual([[15000, 2], [7000, 1], [0, 0], [1000, 1]]);
  });

  it('taux de ponte quotidien de la ferme : pondéré par les poules présentes', () => {
    const b = (id: string, n: number): Bande & { id: string } => ({ id, nom: id, batiment: '', souche: '', dateArrivee: '2026-10-01', ageArriveeSemaines: 0, effectifInitial: n, origine: '', prixAchat: 0 });
    const ram = (bandeId: string, date: string, bons: number): Ramassage => ({ bandeId, date, bons, feles: 0, casses: 0 });
    const morts: Mortalite[] = [{ bandeId: 'b2', date: '2026-11-01', nombre: 100, type: 'mort', cause: '' }];
    // b1 : 400 poules, 340 œufs ; b2 : 300 poules (400 − 100), 210 œufs → 550 / 700 = 78,6 %
    const r = tauxPonteQuotidien([b('b1', 400), b('b2', 400)], [ram('b1', '2026-11-05', 340), ram('b2', '2026-11-05', 210), ram('b1', '2026-10-01', 1)], morts, '2026-11-01', '2026-11-30');
    expect(r).toHaveLength(1);
    expect(r[0].taux.toFixed(1)).toBe('78.6');
  });

  it('variation et formats courts', () => {
    expect(variation(120, 100)).toBe(20);
    expect(variation(80, 100)).toBe(-20);
    expect(variation(5, 0)).toBeNull();
    expect(variation(null, 10)).toBeNull();
    expect(fmtCourt(512000)).toBe('512 k');
    expect(fmtCourt(1250000)).toBe('1,3 M');
    expect(fmtCourt(2500)).toBe('2,5 k');
    expect(fmtCourt(-45000)).toBe('−45 k');
    expect(fmtCourt(800)).toBe('800');
  });
});
