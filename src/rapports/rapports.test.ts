import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { construireRapport, construireRecu, versFeuilles, bornesMois } from './rapport';
import { construirePdf } from './pdf';
import { construireXlsx } from './xlsx';
import { crc32 } from './zip';
import type { DonneesRapport } from './rapport';

const vide: DonneesRapport = { ventes: [], paiements: [], clients: [], achats: [], depenses: [], reglements: [], fournisseurs: [], ajustements: [], bandes: [], ramassages: [], mortalites: [], mvtsOeufs: [], animaux: [], mvtsAnimaux: [], misesBas: [] };
const a = (o: object) => ({ id: Math.random().toString(36).slice(2), updatedAt: 1, ...o });

const donnees: DonneesRapport = {
  ...vide,
  clients: [a({ nom: 'Maquis Chez Awa', telephone: '', type: 'maquis' })] as never,
  ventes: [a({ date: '2026-11-10', clientId: 'x', activite: 'poules', total: 20000, note: '', lignes: [{ article: 'oeufs', libelle: '', quantite: 8, unite: 'plateau', prixUnitaire: 2500 }] })] as never,
  achats: [a({ date: '2026-11-03', fournisseurId: '', activite: 'poules', articleId: '', libelle: 'Aliment ponte (œufs, é à ù)', quantite: 0, total: 340000, montantPaye: 340000, compte: 'caisse', peremption: '' })] as never,
  bandes: [a({ nom: 'B1', effectifInitial: 400, dateArrivee: '2026-10-01' })] as never,
  ramassages: [a({ bandeId: 'b', date: '2026-11-05', bons: 340, feles: 0, casses: 0 })] as never
};
donnees.ramassages[0].bandeId = donnees.bandes[0].id;
donnees.ventes[0].clientId = donnees.clients[0].id;

describe('rapports', () => {
  it('bornes du mois', () => {
    expect(bornesMois('2026-02')).toEqual({ debut: '2026-02-01', fin: '2026-02-28' });
    expect(bornesMois('2026-12')).toEqual({ debut: '2026-12-01', fin: '2026-12-31' });
  });

  it('résultat par activité du mois', () => {
    const doc = construireRapport('2026-11', donnees, '2026-11-24');
    const total = doc.sections[0].lignes.find((l) => l[0] === 'Total ferme')!;
    expect(total).toEqual(['Total ferme', 20000, 340000, 0, -320000]);
    expect(doc.sections[1].lignes[1][1]).toBe('85,0 %');
  });

  it('crc32 connu', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('PDF et Excel bien formés', () => {
    const doc = construireRapport('2026-11', donnees, '2026-11-24');
    const pdf = construirePdf(doc);
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe('%PDF-1.4');
    const xlsx = construireXlsx(versFeuilles(doc));
    expect(xlsx[0]).toBe(0x50);
    expect(xlsx[1]).toBe(0x4b);
    const recu = construirePdf(construireRecu(donnees.ventes[0] as never, 'Maquis Chez Awa', 12000, 8000, '2026-11-24'));
    expect(recu.length).toBeGreaterThan(500);
    if (process.env.OUT_DIR) {
      writeFileSync(`${process.env.OUT_DIR}/rapport.pdf`, pdf);
      writeFileSync(`${process.env.OUT_DIR}/rapport.xlsx`, xlsx);
      writeFileSync(`${process.env.OUT_DIR}/recu.pdf`, recu);
    }
  });
});
