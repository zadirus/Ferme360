// Modifier une saisie (ramassage, décès, aliment, pesée…). Chaque modification est tracée dans l'historique du propriétaire :
// qui, quand, et la valeur avant → après (le serveur la garde à chaque synchronisation).
import { useEffect, useState } from 'preact/hooks';
import type { ChampFiche } from './ActionsFiche';
import { listAll } from './db';
import { OEUFS_PAR_PLATEAU, today } from './format';
import { dataOf, type Item } from './hooks';
import { grouper, type Groupes } from './integrite';
import { saveRecord } from './sync';
import { Boutons, Champ, Choix, nombre } from './ui';

export interface ChampSaisie extends ChampFiche {
  initial?: (item: Record<string, unknown>) => string;
}

export interface SpecModification {
  champs: ChampSaisie[];
  // transforme ce que l'écran a saisi en champs enregistrés (ex. plateaux + œufs en plus → bons)
  transformer?: (patch: Record<string, unknown>) => Record<string, unknown>;
  valider?: (patch: Record<string, unknown>, g: Groupes, item: Record<string, unknown> & { id: string }) => string | null;
  // met à jour ce qui est lié (ex. la sortie de stock d'une distribution d'aliment)
  apres?: (patch: Record<string, unknown>, ancien: Record<string, unknown>, g: Groupes) => Promise<void>;
}

const dateOk = (p: Record<string, unknown>) => (String(p.date ?? '') > today() ? 'La date ne peut pas être dans le futur.' : null);
const arrondi = (n: number) => Math.round(n * 100) / 100;

const TYPES_SOIN: Array<[string, string]> = [['vaccin', 'Vaccin'], ['deparasitage', 'Déparasitage'], ['traitement', 'Traitement'], ['diagnostic', 'Diagnostic'], ['castration', 'Castration'], ['sevrage', 'Sevrage'], ['autre', 'Autre soin']];

// `simple` : écran de l'agent d'élevage (plateaux + œufs en plus), sinon écran du gérant (nombre total)
export function specModification(collection: string, simple = false): SpecModification | null {
  const date: ChampSaisie = { cle: 'date', label: 'Date', type: 'date', requis: true };
  switch (collection) {
    case 'ramassage':
      if (simple) {
        return {
          champs: [
            date,
            { cle: 'plateaux', label: 'Plateaux complets de bons œufs', type: 'nombre', entier: true, initial: (i) => String(Math.floor(Number(i.bons ?? 0) / OEUFS_PAR_PLATEAU)) },
            { cle: 'vrac', label: `Bons œufs en plus (moins de ${OEUFS_PAR_PLATEAU})`, type: 'nombre', entier: true, initial: (i) => String(Number(i.bons ?? 0) % OEUFS_PAR_PLATEAU) },
            { cle: 'casses', label: 'Œufs cassés', type: 'nombre', entier: true }
          ],
          transformer: ({ plateaux, vrac, ...reste }) => ({ ...reste, bons: Number(plateaux) * OEUFS_PAR_PLATEAU + Number(vrac) }),
          valider: (p) => dateOk(p) ?? (Number(p.bons) + Number(p.casses) <= 0 ? 'Indiquez au moins un œuf.' : null)
        };
      }
      return {
        champs: [date, { cle: 'bons', label: 'Bons œufs (nombre total)', type: 'nombre', entier: true }, { cle: 'feles', label: 'Œufs fêlés', type: 'nombre', entier: true }, { cle: 'casses', label: 'Œufs cassés', type: 'nombre', entier: true }],
        valider: (p) => dateOk(p) ?? (Number(p.bons) + Number(p.feles) + Number(p.casses) <= 0 ? 'Indiquez au moins un œuf.' : null)
      };
    case 'mortalite':
      return {
        champs: [date, { cle: 'nombre', label: 'Nombre de poules', type: 'nombre', entier: true, requis: true }, { cle: 'cause', label: 'Cause', type: 'texte' }],
        valider: (p, g, item) => {
          const e = dateOk(p);
          if (e) return e;
          const n = Number(p.nombre);
          if (n <= 0) return 'Indiquez au moins une poule.';
          const bande = (g.bande ?? []).find((b) => b.id === item.bandeId);
          const autres = (g.mortalite ?? []).filter((m) => m.bandeId === item.bandeId && m.id !== item.id).reduce((s, m) => s + Number(m.nombre ?? 0), 0);
          return bande && n > Number(bande.effectifInitial) - autres ? `Impossible : il ne reste que ${Number(bande.effectifInitial) - autres} poules dans cette bande.` : null;
        }
      };
    case 'aliment':
      return {
        champs: [date, { cle: 'kg', label: 'Quantité distribuée', type: 'nombre', suffixe: 'kg', requis: true }, { cle: 'type', label: 'Type d’aliment', type: 'choix', options: [['ponte', 'Ponte'], ['croissance', 'Croissance'], ['demarrage', 'Démarrage']] }],
        valider: (p) => dateOk(p) ?? (Number(p.kg) <= 0 ? 'Indiquez la quantité.' : null),
        // la sortie de stock liée suit la nouvelle quantité et la nouvelle date
        apres: async (p, ancien, g) => {
          const kg = Number(p.kg);
          const ancienKg = Number(ancien.kg ?? 0);
          const art = (g.article ?? []).find((a) => a.id === ancien.articleId);
          for (const m of (g.stock_mvt ?? []).filter((x) => x.alimentId === ancien.id)) {
            const { id: _i, ...data } = m;
            await saveRecord('stock_mvt', m.id, { ...data, date: p.date, quantite: art ? kg / Number(art.kgParUnite || 1) : data.quantite });
          }
          if (ancien.sacs && ancienKg > 0) {
            // on repart de la saisie modifiée (ancien + modifications), pas de l'ancienne version
            const { id: idAliment, ...data } = { ...ancien, ...p };
            await saveRecord('aliment', idAliment as string, { ...data, sacs: arrondi(kg / (ancienKg / Number(ancien.sacs))), cout: ancien.cout ? Math.round(Number(ancien.cout) * kg / ancienKg) : data.cout });
          }
        }
      };
    case 'sante':
      return { champs: [date, { cle: 'produit', label: 'Produit ou maladie', type: 'texte', requis: true }, { cle: 'note', label: 'Note', type: 'texte' }, { cle: 'rappel', label: 'Prochain rappel', type: 'date' }], valider: dateOk };
    case 'soin':
      return {
        champs: [date, { cle: 'type', label: 'Type', type: 'choix', options: TYPES_SOIN }, { cle: 'produit', label: 'Produit ou maladie', type: 'texte', requis: true }, { cle: 'delaiAttente', label: 'Délai d’attente', type: 'nombre', entier: true, suffixe: 'jours' }, { cle: 'rappel', label: 'Prochain rappel', type: 'date' }, { cle: 'note', label: 'Note', type: 'texte' }],
        valider: dateOk
      };
    case 'eau': return { champs: [date, { cle: 'litres', label: 'Eau', type: 'nombre', suffixe: 'litres', requis: true }], valider: dateOk };
    case 'fientes': return { champs: [date, { cle: 'sacs', label: 'Fientes sorties', type: 'nombre', suffixe: 'sacs', requis: true }], valider: dateOk };
    case 'pesee': return { champs: [date, { cle: 'poids', label: 'Poids', type: 'nombre', suffixe: 'kg', requis: true }, { cle: 'methode', label: 'Mesuré avec', type: 'choix', options: [['balance', 'Balance'], ['ruban', 'Ruban barymétrique']] }], valider: (p) => dateOk(p) ?? (Number(p.poids) <= 0 || Number(p.poids) > 2000 ? 'Poids invalide.' : null) };
    case 'traite': return { champs: [date, { cle: 'litres', label: 'Lait', type: 'nombre', suffixe: 'litres', requis: true }], valider: dateOk };
    case 'carnet': return { champs: [date, { cle: 'texte', label: 'Note', type: 'texte', requis: true }], valider: dateOk };
    default: return null;
  }
}

interface Props {
  collection: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Item<any>;
  simple?: boolean;
  onFini: (message: string) => void;
}

export function ModifierSaisie({ collection, item, simple, onFini }: Props) {
  const spec = specModification(collection, simple);
  const [g, setG] = useState<Groupes>({});
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => Object.fromEntries((spec?.champs ?? []).map((c) => [c.cle, c.initial ? c.initial(item) : String(item[c.cle] ?? (c.cle === 'date' ? today() : ''))])));
  const [erreur, setErreur] = useState('');
  useEffect(() => void listAll().then((r) => setG(grouper(r))), []);
  if (!spec) return null;

  async function enregistrer(e: Event) {
    e.preventDefault();
    setErreur('');
    let patch: Record<string, unknown> = {};
    for (const c of spec!.champs) {
      const v = (valeurs[c.cle] ?? '').trim();
      if (c.requis && v === '') return setErreur(`« ${c.label} » est obligatoire.`);
      if (c.type === 'nombre') {
        const n = nombre(v);
        if (!Number.isFinite(n) || n < 0) return setErreur(`« ${c.label} » doit être un nombre positif.`);
        patch[c.cle] = c.entier ? Math.round(n) : n;
      } else patch[c.cle] = v;
    }
    if (spec!.transformer) patch = spec!.transformer(patch);
    const probleme = spec!.valider?.(patch, g, item);
    if (probleme) return setErreur(probleme);
    const ancien = dataOf(item) as Record<string, unknown>;
    // rien n'a changé : on n'écrit rien (pas de ligne inutile dans l'historique)
    if (Object.keys(patch).every((k) => JSON.stringify(patch[k]) === JSON.stringify(ancien[k]))) return onFini('Aucun changement');
    await saveRecord(collection, item.id, { ...ancien, ...patch });
    if (spec!.apres) await spec!.apres(patch, { ...ancien, id: item.id }, g);
    onFini('Modification enregistrée (elle est gardée dans l’historique)');
  }

  return (
    <form class="formulaire modifier-saisie" onSubmit={enregistrer}>
      <h3>Modifier cette saisie</h3>
      {spec.champs.map((c) => {
        const v = valeurs[c.cle] ?? '';
        const set = (x: string) => setValeurs({ ...valeurs, [c.cle]: x });
        if (c.type === 'choix') return <Choix key={c.cle} label={c.label} value={v} onChange={set} options={c.options ?? []} />;
        return <Champ key={c.cle} label={c.label} type={c.type === 'texte' ? 'text' : c.type === 'nombre' ? 'number' : 'date'} min={c.type === 'nombre' ? 0 : undefined} max={c.type === 'date' && c.cle === 'date' ? today() : undefined} value={v} onChange={set} required={c.requis} suffixe={c.suffixe} />;
      })}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}
