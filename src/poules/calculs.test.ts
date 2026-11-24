import { describe, expect, it } from 'vitest';
import { alertes, effectifActuel, indicateurs, stockOeufs, tauxPonteJour } from './calculs';
import type { Bande, Mortalite, MvtOeufs, Ramassage } from './types';

const bande: Bande = {
  nom: 'B1', batiment: 'P1', souche: 'ISA Brown', dateArrivee: '2026-10-01',
  ageArriveeSemaines: 0, effectifInitial: 400, origine: '', prixAchat: 0
};
const mort = (date: string, nombre: number): Mortalite => ({ bandeId: 'b', date, nombre, type: 'mort', cause: '' });
const ram = (date: string, bons: number, feles = 0, casses = 0): Ramassage => ({ bandeId: 'b', date, bons, feles, casses });

describe('critères d’acceptation – poules', () => {
  it('400 poules, 2 mortes, 340 œufs → effectif 398, taux de ponte 85,4 %', () => {
    const morts = [mort('2026-11-01', 2)];
    expect(effectifActuel(bande, morts)).toBe(398);
    const t = tauxPonteJour(bande, [ram('2026-11-02', 340)], morts, '2026-11-02')!;
    expect(t.toFixed(1)).toBe('85.4');
  });

  it('340 œufs ramassés, 8 plateaux vendus → stock 100 œufs (3,3 plateaux)', () => {
    const mvts: MvtOeufs[] = [{ date: '2026-11-02', type: 'vente', quantite: 8 * 30, note: '' }];
    expect(stockOeufs([ram('2026-11-02', 340)], mvts)).toBe(100);
  });

  it('les fêlés et cassés comptent dans la ponte mais pas dans le stock vendable', () => {
    const r = [ram('2026-11-02', 300, 20, 10)];
    expect(tauxPonteJour(bande, r, [], '2026-11-02')!.toFixed(1)).toBe('82.5');
    expect(stockOeufs(r, [])).toBe(300);
  });

  it('un ajustement d’inventaire corrige le stock', () => {
    const mvts: MvtOeufs[] = [{ date: '2026-11-03', type: 'ajustement', quantite: -12, note: '' }];
    expect(stockOeufs([ram('2026-11-02', 100)], mvts)).toBe(88);
  });
});

describe('indicateurs et alertes', () => {
  it('mortalité cumulée et œufs par poule départ', () => {
    const i = indicateurs(bande, [ram('2026-11-02', 200), ram('2026-11-03', 200)], [mort('2026-11-02', 4)], []);
    expect(i.mortalitePct).toBe(1);
    expect(i.oeufsParPoule).toBe(1);
    expect(i.effectif).toBe(396);
  });

  it('alerte si la ponte chute de plus de 5 points en 3 jours', () => {
    const r = [ram('2026-11-01', 340), ram('2026-11-04', 300)]; // 85 % -> 75 %
    expect(alertes(bande, r, [])).toHaveLength(1);
  });

  it('pas d’alerte pour une baisse de 4 points', () => {
    const r = [ram('2026-11-01', 340), ram('2026-11-04', 324)]; // 85 % -> 81 %
    expect(alertes(bande, r, [])).toHaveLength(0);
  });

  it('alerte de mortalité élevée sur un jour', () => {
    expect(alertes(bande, [], [mort('2026-11-05', 9)])).toHaveLength(1);
    expect(alertes(bande, [], [mort('2026-11-05', 2)])).toHaveLength(0);
  });
});
