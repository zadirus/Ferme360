// Étiquettes libres (mots-clés) sur animaux, lots, bandes, clients et articles.
import { useState } from 'preact/hooks';
import { peutEcrire } from './droits';
import { dataOf, useItems, useRole, type Item } from './hooks';
import { saveRecord } from './sync';

export interface Etiquetable { tags?: string[] }

export const COLLECTIONS_ETIQUETTES = ['animal', 'lot', 'bande', 'client', 'article'] as const;

export const normaliserTag = (t: string) => t.trim().replace(/\s+/g, ' ').slice(0, 30);
const memeTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ajouterTag(tags: string[], t: string): string[] {
  const n = normaliserTag(t);
  if (!n || tags.some((x) => memeTag(x, n))) return tags;
  return [...tags, n];
}

export const aTag = (x: Etiquetable, tag: string) => (x.tags ?? []).some((t) => memeTag(t, tag));

// Toutes les étiquettes déjà utilisées, avec leur nombre, pour les suggestions et les filtres
export function useToutesEtiquettes(): Array<[string, number]> {
  const lots: Etiquetable[][] = [
    useItems<Etiquetable>('animal'), useItems<Etiquetable>('lot'), useItems<Etiquetable>('bande'),
    useItems<Etiquetable>('client'), useItems<Etiquetable>('article')
  ];
  const compte = new Map<string, [string, number]>();
  for (const x of lots.flat()) for (const t of x.tags ?? []) {
    const k = t.toLowerCase();
    compte.set(k, [compte.get(k)?.[0] ?? t, (compte.get(k)?.[1] ?? 0) + 1]);
  }
  return [...compte.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
}

export function Pastilles({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return <span class="etiquettes">{tags.map((t) => <span class="etiquette" key={t}>{t}</span>)}</span>;
}

// Saisie : pastilles avec ×, champ pour en ajouter, suggestions des étiquettes déjà utilisées
export function ChampEtiquettes({ valeur, onChange }: { valeur: string[]; onChange: (t: string[]) => void }) {
  const [texte, setTexte] = useState('');
  const connues = useToutesEtiquettes();
  const suggestions = connues.map(([t]) => t).filter((t) => !valeur.some((v) => memeTag(v, t))).slice(0, 8);
  const ajouter = (t: string) => { onChange(ajouterTag(valeur, t)); setTexte(''); };
  return (
    <div class="champ-etiquettes">
      <span class="libelle">Étiquettes (facultatif)</span>
      {valeur.length > 0 && (
        <span class="etiquettes">
          {valeur.map((t) => (
            <span class="etiquette" key={t}>
              {t}
              <button type="button" aria-label={`Retirer ${t}`} onClick={() => onChange(valeur.filter((x) => x !== t))}>×</button>
            </span>
          ))}
        </span>
      )}
      <div class="ligne-etiquette">
        <input
          value={texte}
          maxLength={30}
          placeholder="Ex. : Tabaski, à surveiller"
          aria-label="Nouvelle étiquette"
          onInput={(e) => setTexte(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(texte); } }}
        />
        <button type="button" class="secondaire" disabled={!normaliserTag(texte)} onClick={() => ajouter(texte)}>Ajouter</button>
      </div>
      {suggestions.length > 0 && (
        <span class="etiquettes suggestions">
          {suggestions.map((t) => <button type="button" class="etiquette propose" key={t} onClick={() => ajouter(t)}>+ {t}</button>)}
        </span>
      )}
    </div>
  );
}

// Sur une fiche : modification directe, enregistrée tout de suite (si le profil a le droit d'écrire)
export function EtiquettesFiche({ collection, item }: { collection: string; item: Item<Etiquetable> }) {
  const role = useRole();
  const tags = item.tags ?? [];
  if (!peutEcrire(role, collection)) return tags.length ? <p><Pastilles tags={tags} /></p> : null;
  return <ChampEtiquettes valeur={tags} onChange={(t) => void saveRecord(collection, item.id, { ...dataOf(item), tags: t })} />;
}

// Au-dessus d'une liste : une touche par étiquette, pour ne montrer que celles-là
export function FiltreEtiquettes({ presentes, choisie, onChange }: { presentes: string[]; choisie: string; onChange: (t: string) => void }) {
  const uniques = [...new Map(presentes.map((t) => [t.toLowerCase(), t])).values()].sort((a, b) => a.localeCompare(b, 'fr'));
  if (uniques.length === 0) return null;
  return (
    <span class="etiquettes filtre" role="group" aria-label="Filtrer par étiquette">
      {uniques.map((t) => (
        <button type="button" key={t} class={`etiquette propose${memeTag(t, choisie) ? ' actif' : ''}`} aria-pressed={memeTag(t, choisie)} onClick={() => onChange(memeTag(t, choisie) ? '' : t)}>{t}</button>
      ))}
    </span>
  );
}
