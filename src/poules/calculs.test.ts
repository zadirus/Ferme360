import { describe, expect, it } from 'vitest';
import { alerteEau, alertes, bilanBande, effectifActuel, indicateurs, prixMoyenOeuf, stockOeufs, tauxPonteJour } from './calculs';
import { lireCourbe, lireProphylaxie, tauxStandard, vaccinsAFaire } from './programmes';
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


describe('programme de vaccination et courbe', () => {
  const b: Bande = { ...bande, dateArrivee: '2026-11-01', ageArriveeSemaines: 0 };
  const programme = lireProphylaxie('Marek : 1\nNewcastle : 7\nGumboro : 14\nligne sans nombre');
  it('lecture des lignes « produit : jour »', () => {
    expect(programme).toEqual([{ produit: 'Marek', ageJours: 1 }, { produit: 'Newcastle', ageJours: 7 }, { produit: 'Gumboro', ageJours: 14 }]);
  });
  it('vaccins à faire : en retard ou dans les 7 jours, hors ceux déjà enregistrés ou faits avant l’arrivée', () => {
    const sante = (produit: string) => ({ bandeId: 'x', date: '2026-11-08', type: 'vaccin' as const, produit, note: '', rappel: '' });
    const r = vaccinsAFaire(b, programme, [sante('newcastle')], '2026-11-12');
    expect(r).toEqual([{ produit: 'Marek', date: '2026-11-02', retard: true }, { produit: 'Gumboro', date: '2026-11-15', retard: false }]);
    expect(vaccinsAFaire(b, programme, [], '2026-11-20').map((v) => [v.produit, v.retard])).toEqual([['Marek', true], ['Newcastle', true], ['Gumboro', true]]);
    // poussins de 2 semaines à l'arrivée : Marek et Newcastle ont eu lieu avant, seul le Gumboro (jour 14) reste à faire
    expect(vaccinsAFaire({ ...b, ageArriveeSemaines: 2 }, programme, [], '2026-11-12').map((v) => v.produit)).toEqual(['Gumboro']);
  });
  it('courbe de référence interpolée', () => {
    const c = lireCourbe('20 : 50\n30 : 90\n40 : 80');
    expect(tauxStandard(c, 25)).toBe(70);
    expect(tauxStandard(c, 35)).toBe(85);
    expect(tauxStandard(c, 10)).toBeNull();
  });
});

describe('eau et bilan de bande', () => {
  const eau = (date: string, litres: number) => ({ bandeId: 'b', date, litres });
  const bb: Bande = { ...bande, effectifInitial: 400 };
  it('alerte si l’eau par poule baisse de plus de 20 %', () => {
    const base = [eau('2026-11-01', 40), eau('2026-11-02', 40), eau('2026-11-03', 40)];
    expect(alerteEau({ ...bb, id: 'b' } as never, [...base, eau('2026-11-04', 28)], [])).toMatch(/baisse de 30 %/);
    expect(alerteEau({ ...bb, id: 'b' } as never, [...base, eau('2026-11-04', 36)], [])).toBeNull();
  });
  it('bilan : coût du plateau et marge estimée', () => {
    const ventes = [{ lignes: [{ article: 'oeufs', unite: 'plateau', quantite: 10, prixUnitaire: 2400 }] }];
    expect(prixMoyenOeuf(ventes)).toBe(80);
    const r = [{ bandeId: 'b', date: '2026-11-02', bons: 3000, feles: 0, casses: 0 }];
    const bil = bilanBande({ ...bb, prixAchat: 400000 }, r, [], [], 100000, 80);
    expect(bil.plateauxBons).toBe(100);
    expect(bil.coutPlateau).toBe(5000);
    expect(bil.valeurOeufs).toBe(240000);
    expect(bil.marge).toBe(-260000);
    expect(bilanBande(bb, r, [], [], 0, null).marge).toBeNull();
  });
});
