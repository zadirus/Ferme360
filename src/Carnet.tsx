import { useEffect, useState } from 'preact/hooks';
import { listCollection, type Rec } from './db';
import { fmtDate, today } from './format';
import { peutEcrire } from './droits';
import { useRole, type Item } from './hooks';
import { ModifierSaisie } from './ModifierSaisie';
import { newId, onData, saveRecord } from './sync';

// date d'une note : celle qu'on a choisie, sinon (anciennes notes) le jour de la saisie
const dateNote = (n: Rec) => (typeof n.data.date === 'string' && n.data.date ? n.data.date : new Date(n.updatedAt).toISOString().slice(0, 10));

export function Carnet() {
  const [notes, setNotes] = useState<Rec[]>([]);
  const [texte, setTexte] = useState('');
  const [date, setDate] = useState(today());
  const [modif, setModif] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const role = useRole();

  const charger = async () => {
    const all = await listCollection('carnet');
    setNotes(all.sort((a, b) => dateNote(b).localeCompare(dateNote(a)) || b.updatedAt - a.updatedAt));
  };

  useEffect(() => {
    void charger();
    return onData(() => void charger());
  }, []);

  async function ajouter(e: Event) {
    e.preventDefault();
    const t = texte.trim();
    if (!t) return;
    await saveRecord('carnet', newId(), { texte: t, date });
    setTexte('');
    setDate(today());
    await charger();
  }

  async function supprimer(n: Rec) {
    await saveRecord('carnet', n.id, n.data, true);
    await charger();
  }

  return (
    <section>
      <h2>Carnet de la ferme</h2>
      <p class="intro">Notez ce que vous voulez : tout est enregistré sur le téléphone, même sans réseau.</p>
      <form onSubmit={ajouter}>
        <label class="champ-date">
          <span class="libelle">Date de la note</span>
          <input type="date" value={date} max={today()} required onInput={(e) => setDate(e.currentTarget.value || today())} />
          {date !== today() && <small class="retro">Note du {fmtDate(date)} (écrite après coup)</small>}
        </label>
        <textarea
          value={texte}
          onInput={(e) => setTexte(e.currentTarget.value)}
          placeholder="Ex. : 3 moutons vaccinés ce matin"
          rows={3}
          maxLength={2000}
        />
        <button class="principal" type="submit" disabled={!texte.trim()}>
          Ajouter
        </button>
      </form>
      {message && <p class="succes" role="status">{message}</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <span>{String(n.data.texte ?? '')}</span>
            <small>
              {fmtDate(dateNote(n))} · {n.author}
              {n.dirty ? ' · en attente' : ''}
            </small>
            {peutEcrire(role, 'carnet') && <button type="button" class="lien vert" onClick={() => setModif(modif === n.id ? null : n.id)}>Modifier</button>}
            <button type="button" class="lien" onClick={() => void supprimer(n)}>
              Supprimer
            </button>
            {modif === n.id && <ModifierSaisie collection="carnet" item={{ ...n.data, id: n.id, updatedAt: n.updatedAt, dirty: n.dirty, date: dateNote(n) } as unknown as Item<object>} onFini={(m) => { setModif(null); if (m) setMessage(m); void charger(); }} />}
          </li>
        ))}
        {notes.length === 0 && <li class="vide">Aucune note pour l'instant.</li>}
      </ul>
    </section>
  );
}
