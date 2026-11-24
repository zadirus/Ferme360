import { describe, expect, it } from 'vitest';
import { construireAlertes, resumeNotification, type DonneesAlertes } from './alertes';

const vide: DonneesAlertes = { bandes: [], ramassages: [], mortalites: [], santes: [], animaux: [], mvtsAnimaux: [], repro: [], misesBas: [], soins: [], articles: [], stockMvts: [], ventes: [], paiements: [], clients: [] };
const a = (o: object) => ({ id: Math.random().toString(36).slice(2), updatedAt: 1, ...o });

describe('alertes du matin', () => {
  it('rappel de vaccin pour demain, mise bas en retard, vaccin qui périme, créance ancienne', () => {
    const brebis = a({ boucle: 'F1', nom: '', espece: 'ovin', sexe: 'F' });
    const article = a({ nom: 'Vaccin Newcastle', unite: 'flacon', categorie: 'medicament', seuil: 0, kgParUnite: 1 });
    const client = a({ nom: 'Awa' });
    const d: DonneesAlertes = {
      ...vide,
      santes: [a({ bandeId: 'x', produit: 'Gumboro', rappel: '2026-11-25' })] as never,
      animaux: [brebis] as never,
      mvtsAnimaux: [a({ animalId: (brebis as { id: string }).id, date: '2026-01-01', type: 'entree', motif: 'achat', lotId: '', venteId: '', note: '' })] as never,
      repro: [a({ femelleId: (brebis as { id: string }).id, type: 'saillie', date: '2026-04-10', maleId: '', resultat: '', gestationJours: 150, note: '' })] as never,
      articles: [article] as never,
      stockMvts: [a({ articleId: (article as { id: string }).id, date: '2026-10-01', type: 'entree', quantite: 5, peremption: '2026-12-10', achatId: '', alimentId: '', note: '' })] as never,
      clients: [client] as never,
      ventes: [a({ date: '2026-09-01', clientId: (client as { id: string }).id, activite: 'poules', total: 50000, lignes: [], note: '' })] as never
    };
    const r = construireAlertes(d, '2026-11-24');
    const par = (c: string) => r.filter((x) => x.categorie === c).map((x) => x.texte);
    expect(par('rappels')).toEqual(['Gumboro : demain']);
    expect(par('misesbas')[0]).toMatch(/F1.*en retard/);
    expect(par('stock')).toEqual(['Vaccin Newcastle : périme dans 16 jour(s)']);
    expect(par('creances')[0]).toMatch(/Awa doit 50\s000 FCFA depuis 84 jours/);
    const m = resumeNotification(r);
    expect(m.titre).toBe('Ferme360 : 4 choses à voir');
    expect(m.corps.split('\n')).toHaveLength(4);
  });

  it('fin de délai d’attente demain', () => {
    const e = a({ boucle: 'E1', nom: '', espece: 'ovin', sexe: 'M' });
    const id = (e as { id: string }).id;
    const d: DonneesAlertes = {
      ...vide,
      animaux: [e] as never,
      mvtsAnimaux: [a({ animalId: id, date: '2026-01-01', type: 'entree', motif: 'achat', lotId: '', venteId: '', note: '' })] as never,
      soins: [a({ animalId: id, lotId: '', date: '2026-11-11', type: 'traitement', produit: 'x', veterinaire: '', cout: 0, delaiAttente: 14, rappel: '', note: '' })] as never
    };
    expect(construireAlertes(d, '2026-11-24').map((x) => x.texte)).toEqual(["E1 sera vendable demain (fin du délai d'attente)"]);
    expect(construireAlertes(d, '2026-11-20')).toEqual([]);
  });
});
