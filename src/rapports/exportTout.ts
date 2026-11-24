// Export de toutes les données en Excel, une feuille par type de données, avec les noms à la place des identifiants.
import { LIBELLE_COLLECTION } from '../libelles';
import type { Feuille } from './xlsx';

export interface Enregistrement { id: string; collection: string; data: Record<string, unknown>; updatedAt: number; author?: string }

const CHAMP_NOM: Record<string, string> = { bande: 'nom', animal: 'boucle', client: 'nom', article: 'nom', fournisseur: 'nom', lot: 'nom', parc: 'nom' };
const REFERENCE: Record<string, string> = { bandeId: 'bande', animalId: 'animal', clientId: 'client', articleId: 'article', fournisseurId: 'fournisseur', lotId: 'lot', parcId: 'parc', mereId: 'animal', pereId: 'animal' };
const TITRE: Record<string, string> = { mereId: 'Mère', pereId: 'Père' };
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const jolie = (cle: string) => majuscule(cle.replace(/([A-Z])/g, ' $1').toLowerCase());

export function feuillesDonnees(records: Enregistrement[]): Feuille[] {
  const noms = new Map<string, string>();
  for (const r of records) {
    const champ = CHAMP_NOM[r.collection];
    if (champ && typeof r.data[champ] === 'string') noms.set(r.id, String(r.data[champ]));
  }
  const parCollection = new Map<string, Enregistrement[]>();
  for (const r of records) parCollection.set(r.collection, [...(parCollection.get(r.collection) ?? []), r]);
  const pris = new Set<string>();
  const feuilles: Feuille[] = [];
  for (const [collection, liste] of [...parCollection.entries()].sort((a, b) => (LIBELLE_COLLECTION[a[0]] ?? a[0]).localeCompare(LIBELLE_COLLECTION[b[0]] ?? b[0], 'fr'))) {
    const cles: string[] = [];
    for (const r of liste) for (const k of Object.keys(r.data)) if (!cles.includes(k)) cles.push(k);
    const colonnes = [...cles.map((k) => (TITRE[k] ?? (k.endsWith('Id') && REFERENCE[k] ? majuscule(REFERENCE[k]) : jolie(k)))), 'Saisi par', 'Modifié le'];
    const lignes = [...liste].sort((a, b) => a.updatedAt - b.updatedAt).map((r) => [
      ...cles.map((k): string | number => {
        const v = r.data[k];
        if (k === 'image') return v ? '(photo)' : '';
        if (k.endsWith('Id') && REFERENCE[k]) return typeof v === 'string' && v ? (noms.get(v) ?? '') : '';
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 'oui' : 'non';
        if (v === undefined || v === null) return '';
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.join(', ');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }),
      r.author ?? '',
      new Date(r.updatedAt).toISOString().slice(0, 16).replace('T', ' ')
    ]);
    let nom = (LIBELLE_COLLECTION[collection] ?? collection).slice(0, 28);
    while (pris.has(nom.toLowerCase())) nom += '+';
    pris.add(nom.toLowerCase());
    feuilles.push({ nom, colonnes, lignes });
  }
  return feuilles.length ? feuilles : [{ nom: 'Vide', colonnes: ['Aucune donnée'], lignes: [] }];
}
