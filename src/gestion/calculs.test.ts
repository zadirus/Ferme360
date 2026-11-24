import { describe, expect, it } from 'vitest';
import { alertesArticle, coutMoyen, creances, detteFournisseur, lotsRestants, oeufsVendus, resultatsRepartis, soldesComptes, stockArticle, totalLignes } from './calculs';
import type { Achat, Article, Depense, Paiement, StockMvt, Vente } from './types';

const ligne = { article: 'oeufs' as const, libelle: '', quantite: 10, unite: 'plateau' as const, prixUnitaire: 2500 };
const vente = (date: string, total: number, clientId = 'c1'): Vente => ({ date, clientId, activite: 'poules', lignes: [], total, note: '' });
const paie = (montant: number, mode: Paiement['mode'] = 'especes'): Paiement => ({ date: '2026-11-02', clientId: 'c1', venteId: '', montant, mode, note: '' });
const mvt = (type: StockMvt['type'], quantite: number, peremption = '', date = '2026-11-01'): StockMvt => ({ articleId: 'a', date, type, quantite, peremption, achatId: '', alimentId: '', note: '' });
const vaccin: Article = { nom: 'Vaccin Newcastle', unite: 'flacon', categorie: 'medicament', seuil: 0, kgParUnite: 1 };

describe('critères d’acceptation – ventes et argent', () => {
  it('10 plateaux à 2 500 FCFA = 25 000 FCFA, soit 300 œufs', () => {
    expect(totalLignes([ligne])).toBe(25000);
    expect(oeufsVendus([ligne])).toBe(300);
  });

  it('paiement partiel de 15 000 FCFA sur 25 000 → créance de 10 000 FCFA', () => {
    const c = creances([vente('2026-11-01', 25000)], [paie(15000)], '2026-11-24');
    expect(c).toHaveLength(1);
    expect(c[0].solde).toBe(10000);
    expect(c[0].jours).toBe(23);
  });

  it('les paiements soldent d’abord les ventes les plus anciennes', () => {
    const c = creances([vente('2026-10-01', 10000), vente('2026-11-10', 10000)], [paie(10000)], '2026-11-24');
    expect(c[0].solde).toBe(10000);
    expect(c[0].jours).toBe(14); // c'est la vente récente qui reste due
  });

  it('un client qui a tout payé n’a pas de créance', () => {
    expect(creances([vente('2026-11-01', 5000)], [paie(5000)], '2026-11-24')).toHaveLength(0);
  });

  it('vaccin qui périme dans 25 jours → alerte', () => {
    const al = alertesArticle(vaccin, [mvt('entree', 10, '2026-12-19')], '2026-11-24');
    expect(al).toEqual(['Vaccin Newcastle : périme dans 25 jour(s)']);
  });

  it('un lot périmé dont le stock est consommé ne déclenche plus d’alerte', () => {
    const al = alertesArticle(vaccin, [mvt('entree', 5, '2026-11-30'), mvt('entree', 5, '2027-06-01'), mvt('sortie', 5)], '2026-11-24');
    expect(al).toEqual([]);
  });

  it('stock sous le seuil → alerte', () => {
    const a: Article = { ...vaccin, nom: 'Aliment ponte', unite: 'sac', seuil: 5 };
    expect(alertesArticle(a, [mvt('entree', 20), mvt('sortie', 16)], '2026-11-24')).toHaveLength(1);
    expect(alertesArticle(a, [mvt('entree', 20), mvt('sortie', 10)], '2026-11-24')).toHaveLength(0);
  });

  it('soldes de caisse : espèces + mobile money − dépenses + solde de départ', () => {
    const dep: Depense = { date: '2026-11-03', activite: 'commun', categorie: 'Transport', libelle: '', montant: 3000, compte: 'caisse' };
    const s = soldesComptes([paie(15000), paie(8000, 'mobile_money')], [], [], [dep], [{ date: '2026-11-01', compte: 'caisse', montant: 5000, note: '' }]);
    expect(s.caisse).toBe(17000);
    expect(s.mobile_money).toBe(8000);
  });
});

describe('stocks, achats et dettes', () => {
  it('stock = entrées − sorties ± ajustements', () => {
    expect(stockArticle([mvt('entree', 20), mvt('sortie', 6.5), mvt('ajustement', -1)])).toBe(12.5);
  });

  it('les sorties consomment d’abord le lot qui périme le plus tôt', () => {
    const lots = lotsRestants([mvt('entree', 10, '2027-01-01'), mvt('entree', 10, '2026-12-01'), mvt('sortie', 12)]);
    expect(lots).toEqual([{ peremption: '2027-01-01', restant: 8 }]);
  });

  it('coût moyen d’un sac d’aliment', () => {
    const achats = [{ articleId: 'a', quantite: 10, total: 150000 }, { articleId: 'a', quantite: 10, total: 170000 }] as Achat[];
    expect(coutMoyen('a', achats)).toBe(16000);
  });

  it('dette fournisseur = achats non payés − règlements', () => {
    const achats = [{ fournisseurId: 'f1', total: 100000, montantPaye: 40000 }] as Achat[];
    expect(detteFournisseur('f1', achats, [{ date: '', fournisseurId: 'f1', montant: 25000, compte: 'caisse' }])).toBe(35000);
  });
});

describe('charges communes réparties', () => {
  const v = (activite: Vente['activite'], total: number, reprise = false): Vente => ({ date: '2026-11-02', clientId: '', activite, lignes: [], total, note: '', reprise });
  const dep = (activite: Depense['activite'], montant: number): Depense => ({ date: '2026-11-03', activite, categorie: 'Électricité et eau', libelle: '', montant, compte: 'caisse' });

  it('les charges communes sont réparties au prorata des ventes de chaque élevage', () => {
    const r = resultatsRepartis([v('poules', 300000), v('ovins', 100000), v('bovins', 0), v('poules', 999999, true)], [], [dep('poules', 50000), dep('commun', 40000)]);
    const par = Object.fromEntries(r.lignes.map((l) => [l.activite, l]));
    expect(par.poules.partCommun).toBe(30000); // 40 000 × 300 000 / 400 000
    expect(par.ovins.partCommun).toBe(10000);
    expect(par.bovins.partCommun).toBe(0);
    expect(par.poules.margeBrute).toBe(250000);
    expect(par.poules.margeNette).toBe(220000);
    expect(par.ovins.margeNette).toBe(90000);
    // la somme des marges nettes + les charges non réparties = la marge de la ferme : rien n'est perdu ni compté deux fois
    expect(r.lignes.reduce((s, l) => s + l.margeNette, 0)).toBe(r.margeFerme);
    expect(r.margeFerme).toBe(400000 - 50000 - 40000);
    expect(r.nonReparti).toBe(0);
  });

  it('sans aucune vente, les charges communes restent non réparties', () => {
    const r = resultatsRepartis([], [], [dep('commun', 40000)]);
    expect(r.nonReparti).toBe(40000);
    expect(r.lignes.every((l) => l.partCommun === 0)).toBe(true);
    expect(r.margeFerme).toBe(-40000);
  });
});
