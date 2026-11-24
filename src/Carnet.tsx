import { useEffect, useState } from 'preact/hooks';
import { listCollection, type Rec } from './db';
import { newId, onData, saveRecord } from './sync';

const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function Carnet() {
  const [notes, setNotes] = useState<Rec[]>([]);
  const [texte, setTexte] = useState('');

  const charger = async () => {
    const all = await listCollection('carnet');
    setNotes(all.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  useEffect(() => {
    void charger();
    return onData(() => void charger());
  }, []);

  async function ajouter(e: Event) {
    e.preventDefault();
    const t = texte.trim();
    if (!t) return;
    await saveRecord('carnet', newId(), { texte: t });
    setTexte('');
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
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <span>{String(n.data.texte ?? '')}</span>
            <small>
              {n.author} · {fmt.format(new Date(n.updatedAt))}
              {n.dirty ? ' · en attente' : ''}
            </small>
            <button type="button" class="lien" onClick={() => void supprimer(n)}>
              Supprimer
            </button>
          </li>
        ))}
        {notes.length === 0 && <li class="vide">Aucune note pour l'instant.</li>}
      </ul>
    </section>
  );
}
