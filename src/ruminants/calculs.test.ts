import { describe, expect, it } from 'vitest';
import { ageEnMois, ajouteJours } from '../format';
import { etatAnimal, fertilite, finDelaiAttente, gmqAnimal, gmqMoyen, indicateursLot, miseBasPrevue, mortaliteAvantSevrage, prolificite, propositionsReforme, tachesAutomatiques } from './calculs';
import type { Animal, MiseBas, MvtAnimal, Pesee, Ration, Repro, Soin } from './types';

const mvt = (animalId: string, date: string, type: MvtAnimal['type'], motif: MvtAnimal['motif'], lotId = '', maj = 1): MvtAnimal & { updatedAt: number } =>
  ({ animalId, date, type, motif, lotId, venteId: '', note: '', updatedAt: maj });
const pesee = (animalId: string, date: string, poids: number): Pesee => ({ animalId, date, poids, methode: 'balance' });
const saillie = (femelleId: string, date: string, gestationJours = 150): Repro => ({ femelleId, type: 'saillie', date, maleId: '', resultat: '', gestationJours, note: '' });
const soin = (animalId: string, date: string, delaiAttente: number, lotId = ''): Soin =>
  ({ animalId, lotId, date, type: 'traitement', produit: 'x', veterinaire: '', cout: 0, delaiAttente, rappel: '', note: '' });

describe('critères d’acceptation – moutons et bœufs', () => {
  it('brebis lutée le 10/04 → mise bas prévue le 07/09 (150 jours)', () => {
    expect(miseBasPrevue('b1', [saillie('b1', '2026-04-10')], [])).toBe('2026-09-07');
  });

  it('vache : 283 jours, modifiable', () => {
    expect(miseBasPrevue('v1', [saillie('v1', '2026-01-01', 283)], [])).toBe('2026-10-11');
    expect(miseBasPrevue('v1', [saillie('v1', '2026-01-01', 290)], [])).toBe('2026-10-18');
  });

  it('plus de mise bas prévue après la mise bas ou un diagnostic « vide »', () => {
    const mb: MiseBas = { mereId: 'b1', date: '2026-09-05', pereId: '', vivants: 2, mortNes: 0, difficulte: 'normale' };
    expect(miseBasPrevue('b1', [saillie('b1', '2026-04-10')], [mb])).toBeNull();
    const vide: Repro = { ...saillie('b1', '2026-05-20'), type: 'diagnostic', resultat: 'vide' };
    expect(miseBasPrevue('b1', [saillie('b1', '2026-04-10'), vide], [])).toBeNull();
  });

  it('12 moutons entrés à 24 kg, pesés 40 jours plus tard à 30 kg → GMQ 150 g/jour', () => {
    const pesees: Pesee[] = [];
    const ids = Array.from({ length: 12 }, (_, i) => `m${i}`);
    for (const id of ids) pesees.push(pesee(id, '2026-10-01', 24), pesee(id, '2026-11-10', 30));
    expect(gmqAnimal('m0', pesees)).toBeCloseTo(150, 5);
    expect(gmqMoyen(ids, pesees)).toBeCloseTo(150, 5);
  });

  it('traitement avec 14 jours de délai d’attente → vente refusée pendant 14 jours', () => {
    const s = [soin('a1', '2026-11-10', 14)];
    expect(finDelaiAttente('a1', '', s, '2026-11-10')).toBe('2026-11-24');
    expect(finDelaiAttente('a1', '', s, '2026-11-23')).toBe('2026-11-24');
    expect(finDelaiAttente('a1', '', s, '2026-11-24')).toBeNull();
  });

  it('un soin de lot bloque les animaux du lot, pas les autres', () => {
    const s = [soin('', '2026-11-20', 28, 'L1')];
    expect(finDelaiAttente('a1', 'L1', s, '2026-11-24')).toBe('2026-12-18');
    expect(finDelaiAttente('a2', 'L2', s, '2026-11-24')).toBeNull();
  });
});

describe('registre, lots et indicateurs', () => {
  it('la vente d’un animal le sort du registre ; son lot reste mémorisé', () => {
    const m = [mvt('a1', '2026-01-01', 'entree', 'achat', 'L1'), mvt('a1', '2026-11-20', 'sortie', 'vente')];
    expect(etatAnimal('a1', m)).toEqual({ statut: 'vendu', lotId: 'L1', dateSortie: '2026-11-20' });
  });

  it('annuler la sortie (mouvement supprimé) remet l’animal présent', () => {
    expect(etatAnimal('a1', [mvt('a1', '2026-01-01', 'entree', 'naissance')]).statut).toBe('present');
  });

  it('changement de lot : le dernier mouvement gagne', () => {
    const m = [mvt('a1', '2026-01-01', 'entree', 'achat', 'L1'), mvt('a1', '2026-03-01', 'lot', 'changement_lot', 'L2')];
    expect(etatAnimal('a1', m).lotId).toBe('L2');
  });

  it('fertilité et prolificité', () => {
    const repro = [saillie('b1', '2026-04-10'), saillie('b2', '2026-04-11'), saillie('b3', '2026-04-12'), saillie('b4', '2026-04-12')];
    const mbs: MiseBas[] = [
      { mereId: 'b1', date: '2026-09-07', pereId: '', vivants: 2, mortNes: 0, difficulte: 'normale' },
      { mereId: 'b2', date: '2026-09-08', pereId: '', vivants: 1, mortNes: 1, difficulte: 'normale' },
      { mereId: 'b3', date: '2026-09-09', pereId: '', vivants: 1, mortNes: 0, difficulte: 'normale' }
    ];
    expect(fertilite(repro, mbs)).toBe(75);
    expect(prolificite(mbs)).toBeCloseTo(5 / 3, 5);
  });

  it('coût de revient du kg vif d’un lot d’embouche', () => {
    const animaux = [
      { id: 'a1', prixAchat: 40000 }, { id: 'a2', prixAchat: 40000 }
    ] as Array<Animal & { id: string }>;
    const pesees = [pesee('a1', '2026-10-01', 25), pesee('a1', '2026-11-10', 31), pesee('a2', '2026-10-01', 25), pesee('a2', '2026-11-10', 29)];
    const rations: Ration[] = [{ lotId: 'L1', date: '2026-10-05', kg: 100, articleId: '', cout: 20000, note: '' }];
    const soins = [{ ...soin('a1', '2026-10-02', 0), cout: 4000 }];
    const r = indicateursLot('L1', animaux, new Set(['a1', 'a2']), pesees, rations, soins);
    expect(r.couts.total).toBe(104000);
    expect(r.kgVif).toBe(60);
    expect(r.coutKgVif).toBeCloseTo(104000 / 60, 5);
    expect(r.gain).toBe(10);
    expect(r.coutKgGagne).toBe(2400);
    expect(r.poidsMoyen).toBe(30);
  });
});

describe('dates', () => {
  it('ajouteJours et âge en mois', () => {
    expect(ajouteJours('2026-11-24', 14)).toBe('2026-12-08');
    expect(ajouteJours('2026-12-30', 3)).toBe('2027-01-02');
    expect(ageEnMois('2026-05-24', '2026-11-24')).toBe(6);
  });
});

describe('rappels automatiques, réforme, mortalité des petits', () => {
  const ani = (id: string, o: Partial<Animal> = {}) => ({ id, boucle: id, nom: '', espece: 'ovin', race: '', sexe: 'M', naissance: '2026-08-01', naissanceEstimee: false, robe: '', origine: 'ne', mereId: '', pereId: '', miseBasId: '', vendeur: '', prixAchat: 0, poidsAchat: 0, dateAchat: '', ...o }) as Animal & { id: string };
  const present = () => 'present' as const;

  it('fenêtre : en retard de moins de 60 jours ou dans les 7 jours', () => {
    const a = ani('a1');
    const r = tachesAutomatiques([a], present, [], '2026-11-24'); // sevrage dû le 30/10 (25 j de retard), castration due le 30/09 (55 j de retard)
    expect(r.map((t) => t.type)).toEqual(['castration', 'sevrage']);
    expect(r.every((t) => t.retard)).toBe(true);
    const fait = tachesAutomatiques([a], present, [{ animalId: 'a1', lotId: '', date: '2026-10-30', type: 'sevrage', produit: '', veterinaire: '', cout: 0, delaiAttente: 0, rappel: '', note: '' }], '2026-11-24');
    expect(fait.map((t) => t.type)).toEqual(['castration']);
    expect(tachesAutomatiques([ani('a2', { sexe: 'F' })], present, [], '2026-10-27').map((t) => t.type)).toEqual(['sevrage']); // dans 3 jours
    expect(tachesAutomatiques([ani('a3', { origine: 'achete', naissanceEstimee: true })], present, [], '2026-11-24')).toEqual([]);
  });
  it('réforme : âge, saillies sans mise bas, traitements répétés', () => {
    const vieille = ani('v1', { sexe: 'F', naissance: '2018-01-01' });
    const sterile = ani('v2', { sexe: 'F', naissance: '2024-01-01' });
    const saillies = [saillie('v2', '2025-01-10'), saillie('v2', '2025-08-10')];
    const trait = (d: string) => ({ animalId: 'v3', lotId: '', date: d, type: 'traitement' as const, produit: 'x', veterinaire: '', cout: 0, delaiAttente: 0, rappel: '', note: '' });
    const malade = ani('v3', { naissance: '2025-01-01' });
    const r = propositionsReforme([vieille, sterile, malade], present, saillies, [], [trait('2026-03-01'), trait('2026-06-01'), trait('2026-10-01')], '2026-11-24');
    expect(r.find((x) => x.animalId === 'v1')?.raisons[0]).toMatch(/âge : 8 ans/);
    expect(r.find((x) => x.animalId === 'v2')?.raisons).toEqual(['2 saillies sans mise bas']);
    expect(r.find((x) => x.animalId === 'v3')?.raisons).toEqual(['3 traitements en un an']);
    // une mise bas après la saillie la sort de la liste
    const mb: MiseBas = { mereId: 'v2', date: '2025-06-08', pereId: '', vivants: 1, mortNes: 0, difficulte: 'normale' };
    expect(propositionsReforme([sterile], present, saillies, [mb], [], '2026-11-24')).toEqual([]);
  });
  it('mortalité avant sevrage : mort-nés et morts avant 90 jours sur les petits nés', () => {
    const mere = ani('m1', { sexe: 'F' });
    const p1 = ani('p1', { miseBasId: 'mb1', naissance: '2026-06-01' });
    const p2 = ani('p2', { miseBasId: 'mb1', naissance: '2026-06-01' });
    const mb: MiseBas = { mereId: 'm1', date: '2026-06-01', pereId: '', vivants: 2, mortNes: 1, difficulte: 'normale' };
    const mort = (id: string, date: string) => ({ ...mvt(id, date, 'sortie', 'mort'), updatedAt: 1 });
    // p1 meurt à 30 jours (avant sevrage), p2 survit : (1 mort-né + 1) / 3 petits = 66,7 %
    expect(mortaliteAvantSevrage('ovin', [mere, p1, p2], [mort('p1', '2026-07-01')], [mb])!.toFixed(1)).toBe('66.7');
    expect(mortaliteAvantSevrage('ovin', [mere, p1, p2], [mort('p1', '2026-12-01')], [mb])!.toFixed(1)).toBe('33.3'); // mort après le sevrage : pas compté
    expect(mortaliteAvantSevrage('bovin', [mere], [], [])).toBeNull();
  });
});
