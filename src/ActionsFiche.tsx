// Boutons « Modifier » et « Supprimer » d'une fiche, avec contrôle d'intégrité avant toute suppression.
import { useState } from 'preact/hooks';
import { listAll } from './db';
import { peutEcrire, peutToutSupprimer } from './droits';
import { dataOf, go, useRole, type Item } from './hooks';
import { accompagnants, bloquants, grouper, messageBlocage, type Groupes } from './integrite';
import { saveRecord } from './sync';
import { Boutons, Champ, Choix, nombre } from './ui';

export interface ChampFiche {
  cle: string;
  label: string;
  type: 'texte' | 'nombre' | 'date' | 'choix';
  options?: Array<[string, string]>;
  requis?: boolean;
  suffixe?: string;
  entier?: boolean;
  // renvoie un message si le champ ne peut pas être modifié maintenant (ex. mouvements existants)
  verrou?: (g: Groupes, id: string) => string | null;
}

interface Props {
  collection: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Item<any>;
  nom: string; // nom affiché dans les messages
  champs: ChampFiche[];
  retour: string; // page à ouvrir après suppression
  // contrôle supplémentaire avant d'enregistrer (renvoie un message d'erreur ou null)
  valider?: (patch: Record<string, unknown>, g: Groupes, id: string) => string | null;
  compact?: boolean;
}

export function ActionsFiche({ collection, item, nom, champs, retour, valider, compact }: Props) {
  const role = useRole();
  const [mode, setMode] = useState<'modifier' | null>(null);
  const [g, setG] = useState<Groupes>({});
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  if (!peutEcrire(role, collection)) return null;

  async function ouvrir() {
    setErreur('');
    setMessage('');
    setG(grouper(await listAll()));
    setValeurs(Object.fromEntries(champs.map((c) => [c.cle, String(item[c.cle] ?? '')])));
    setMode('modifier');
  }

  async function enregistrer(e: Event) {
    e.preventDefault();
    setErreur('');
    const patch: Record<string, unknown> = {};
    for (const c of champs) {
      if (c.verrou?.(g, item.id)) continue;
      const v = (valeurs[c.cle] ?? '').trim();
      if (c.requis && v === '') return setErreur(`« ${c.label} » est obligatoire.`);
      if (c.type === 'nombre') {
        const n = nombre(v);
        if (!Number.isFinite(n) || n < 0) return setErreur(`« ${c.label} » doit être un nombre positif.`);
        patch[c.cle] = c.entier ? Math.round(n) : n;
      } else patch[c.cle] = v;
    }
    const probleme = valider?.(patch, g, item.id);
    if (probleme) return setErreur(probleme);
    await saveRecord(collection, item.id, { ...dataOf(item), ...patch });
    setMode(null);
    setMessage('Modifications enregistrées');
  }

  async function supprimer() {
    setErreur('');
    setMessage('');
    const tout = grouper(await listAll());
    const raisons = bloquants(collection, item.id, tout);
    if (raisons.length > 0) return setErreur(messageBlocage(nom, raisons));
    if (!window.confirm(`Supprimer « ${nom} » ? Cette fiche n’est utilisée nulle part : rien d’autre ne sera perdu.`)) return;
    for (const [col, id] of accompagnants(collection, item.id, tout)) {
      const rec = tout[col]?.find((x) => x.id === id);
      if (rec) { const { id: _i, ...data } = rec; await saveRecord(col, id, data, true); }
    }
    await saveRecord(collection, item.id, dataOf(item), true);
    go(retour);
  }

  return (
    <div class={`actions-fiche${compact ? ' compact' : ''}`}>
      {message && <p class="succes" role="status">{message}</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {mode !== 'modifier' && (
        <div class="ligne-actions">
          <button type="button" class="lien vert" onClick={() => void ouvrir()}>Modifier</button>
          {peutToutSupprimer(role) && <button type="button" class="lien danger-lien" onClick={() => void supprimer()}>Supprimer</button>}
        </div>
      )}
      {mode === 'modifier' && (
        <form class="formulaire" onSubmit={enregistrer}>
          <h3>Modifier</h3>
          {champs.map((c) => {
            const bloque = c.verrou?.(g, item.id);
            if (bloque) return <p class="intro" key={c.cle}><strong>{c.label}</strong> : {String(item[c.cle] ?? '—') || '—'} <small>({bloque})</small></p>;
            const v = valeurs[c.cle] ?? '';
            const set = (x: string) => setValeurs({ ...valeurs, [c.cle]: x });
            if (c.type === 'choix') return <Choix key={c.cle} label={c.label} value={v} onChange={set} options={c.options ?? []} />;
            return <Champ key={c.cle} label={c.label} type={c.type === 'texte' ? 'text' : c.type === 'nombre' ? 'number' : 'date'} min={c.type === 'nombre' ? 0 : undefined} value={v} onChange={set} required={c.requis} suffixe={c.suffixe} />;
          })}
          {erreur && <p class="erreur">{erreur}</p>}
          <Boutons onAnnuler={() => { setMode(null); setErreur(''); }} />
        </form>
      )}
    </div>
  );
}
