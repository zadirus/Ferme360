import { useEffect, useState } from 'preact/hooks';
import { listAll, listDeleted, type Rec } from '../db';
import { groupe, manquants, racines, resume } from '../corbeille';
import { fmtDate } from '../format';
import { LIBELLE_COLLECTION } from '../libelles';
import { saveRecord } from '../sync';
import { Retour } from '../ui';

const dateHeure = (t: number) => `${fmtDate(new Date(t).toISOString().slice(0, 10))} ${new Date(t).toTimeString().slice(0, 5)}`;

export function Corbeille() {
  const [supprimes, setSupprimes] = useState<Rec[] | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const charger = async () => setSupprimes((await listDeleted()).filter((r) => r.collection !== 'reglage'));
  useEffect(() => void charger(), []);

  async function restaurer(r: Rec) {
    setErreur('');
    setMessage('');
    const tous = supprimes ?? [];
    const g = groupe(r, tous);
    const vivants = new Set((await listAll()).map((x) => x.id));
    const absents = manquants(g, vivants, tous);
    if (absents.length > 0) {
      const noms = absents.map((x) => `${LIBELLE_COLLECTION[x.collection] ?? x.collection}${resume(x) ? ` « ${resume(x)} »` : ''}`).join(', ');
      return setErreur(`Impossible pour le moment : cette saisie dépend de ${noms}, qui est supprimé(e). Restaurez-le d'abord.`);
    }
    for (const x of g) await saveRecord(x.collection, x.id, x.data, false);
    await charger();
    setMessage(g.length > 1 ? `Restauré, avec ${g.length - 1} saisie(s) liée(s).` : 'Restauré.');
  }

  const liste = racines(supprimes ?? []).slice(0, 100);
  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Corbeille</h2>
      <p class="intro">Ce qui a été supprimé reste ici : vous pouvez le restaurer. Une vente restaurée ramène son paiement et sa sortie de stock ; un animal revient avec son entrée au registre.</p>
      {message && <p class="succes" role="status">{message}</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      <ul>
        {liste.map((r) => (
          <li key={r.id}>
            <div class="ligne"><strong>{LIBELLE_COLLECTION[r.collection] ?? r.collection}</strong><small>{dateHeure(r.updatedAt)}</small></div>
            <small>{resume(r) || '—'}{r.author ? ` · supprimé par ${r.author}` : ''}</small>
            <button type="button" class="lien vert" onClick={() => void restaurer(r)}>Restaurer</button>
          </li>
        ))}
        {supprimes && liste.length === 0 && <li class="vide">La corbeille est vide.</li>}
        {supprimes === null && <li class="vide">Chargement…</li>}
      </ul>
    </section>
  );
}
