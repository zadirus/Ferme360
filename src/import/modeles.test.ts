import { describe, expect, it } from 'vitest';
import { preparer, type Existants } from './modeles';

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
const vide: Existants = { animaux: [], lots: [], clients: [], articles: [], bandes: [] };
const T = '2026-11-24';

describe('import des données existantes', () => {
  it('animaux : parents, lots créés une seule fois, doublons et erreurs signalés', () => {
    const r = preparer('animaux', [
      ['Boucle', 'Nom', 'Espèce', 'Sexe', 'Naissance', 'Poids (kg)', 'Lot', 'Mère', "Prix d'achat"],
      ['M001', 'Blanche', 'mouton', 'F', '14/03/2024', '40', 'Reproductrices', '', ''],
      ['M002', '', 'Mouton', 'F', '2025-03-01', '', 'Reproductrices', 'M001', '50 000'],
      ['M001', '', 'mouton', 'M', '', '', '', '', ''],
      ['B001', '', 'chameau', 'M', '', '', '', '', ''],
      ['B002', '', 'bœuf', 'X', '31/02/abc', '', '', '', ''],
      ['M003', '', 'mouton', 'M', '', '', '', 'INCONNUE', '']
    ], vide, T, id);
    const ok = r.lignes.filter((l) => !l.erreurs.length);
    expect(ok.map((l) => l.numero)).toEqual([2, 3, 7]);
    expect(r.lignes[2].erreurs[0]).toMatch(/double/);
    expect(r.lignes[3].erreurs[0]).toMatch(/espèce/);
    expect(r.lignes[4].erreurs.length).toBe(2);
    expect(r.communs).toHaveLength(1); // le lot « Reproductrices » n'est créé qu'une fois
    const mere = r.lignes[0].enregs[0].id;
    expect((r.lignes[1].enregs[0].data as { mereId: string }).mereId).toBe(mere);
    expect((r.lignes[1].enregs[0].data as { origine: string }).origine).toBe('achete');
    expect(r.lignes[0].enregs.map((e) => e.collection)).toEqual(['animal', 'mvt_animal', 'pesee']);
    expect(r.lignes[5].avertissements[0]).toMatch(/mère INCONNUE introuvable/);
    // jamais de mouvement d'argent
    expect(r.lignes.flatMap((l) => l.enregs).some((e) => ['achat', 'vente', 'paiement', 'depense'].includes(e.collection))).toBe(false);
  });

  it('une boucle déjà dans l’application est refusée', () => {
    const r = preparer('animaux', [['Boucle', 'Espèce', 'Sexe'], ['m001', 'mouton', 'F']], { ...vide, animaux: [{ id: 'x', boucle: 'M001', espece: 'ovin' }] }, T, id);
    expect(r.lignes[0].erreurs[0]).toMatch(/existe déjà/);
  });

  it('clients : le solde dû devient une créance reprise, pas une vente', () => {
    const r = preparer('clients', [['Nom', 'Téléphone', 'Type', 'Solde dû (FCFA)'], ['Awa', '07', 'maquis', '45 000'], ['Koffi', '', '', '0'], ['Awa', '', '', '']], vide, T, id);
    expect(r.lignes[0].enregs.map((e) => e.collection)).toEqual(['client', 'vente']);
    const vente = r.lignes[0].enregs[1].data as { total: number; reprise: boolean; activite: string };
    expect(vente).toMatchObject({ total: 45000, reprise: true, activite: 'commun' });
    expect(r.lignes[1].enregs.map((e) => e.collection)).toEqual(['client']);
    expect(r.lignes[2].erreurs[0]).toMatch(/double/);
  });

  it('stock : article et quantité de départ, péremption pour un médicament', () => {
    const r = preparer('stock', [['Article', 'Catégorie', 'Unité', 'Quantité', 'Seuil', "Poids d'une unité (kg)", 'Péremption'], ['Aliment ponte', 'Aliment', 'sac', '12', '5', '50', ''], ['Vaccin', 'médicament', 'flacon', '8', '2', '', '30/09/2027'], ['Sans unité', '', '', '3', '', '', '']], vide, T, id);
    expect((r.lignes[0].enregs[0].data as { kgParUnite: number }).kgParUnite).toBe(50);
    expect((r.lignes[1].enregs[1].data as { peremption: string; note: string })).toMatchObject({ peremption: '2027-09-30', note: 'stock de départ' });
    expect(r.lignes[2].erreurs[0]).toMatch(/unité/);
  });

  it('bandes : effectif entier obligatoire', () => {
    const r = preparer('bandes', [['Nom', 'Effectif', 'Arrivée', 'Âge à l’arrivée (semaines)'], ['B1', '400', '01/10/2026', '18'], ['B2', '12,5', '', ''], ['B3', '', '', '']], vide, T, id);
    expect(r.lignes[0].enregs[0].data).toMatchObject({ effectifInitial: 400, dateArrivee: '2026-10-01', ageArriveeSemaines: 18 });
    expect(r.lignes[1].erreurs[0]).toMatch(/entier/);
    expect(r.lignes[2].erreurs.length).toBe(1);
  });
});
