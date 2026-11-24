import { useState } from 'preact/hooks';
import { dataOf, useItems } from '../hooks';
import { fmtDate, fmtInt, fmtPlateaux, OEUFS_PAR_PLATEAU, today } from '../format';
import { stockOeufs } from '../poules/calculs';
import type { MvtOeufs, Ramassage } from '../poules/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';

const LIBELLE: Record<MvtOeufs['type'], string> = {
  vente: 'Vente',
  consommation: 'Consommation',
  casse: 'Casse au stockage',
  ajustement: 'Ajustement d’inventaire'
};

export function Oeufs() {
  const ram = useItems<Ramassage>('ramassage');
  const mvts = useItems<MvtOeufs>('oeufs_mvt');
  const [mode, setMode] = useState<'sortie' | 'inventaire' | null>(null);
  const [message, setMessage] = useState('');
  const stock = stockOeufs(ram, mvts);
  const liste = [...mvts].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt).slice(0, 40);

  const fini = (m: string) => {
    setMode(null);
    setMessage(m);
  };

  return (
    <section>
      <Retour vers="/" texte="Accueil" />
      <h2>Stock d'œufs</h2>
      <p class="intro">Pour vendre des œufs, utilisez l'onglet Ventes : la sortie du stock se fait toute seule.</p>
      <div class="stats">
        <Stat valeur={fmtInt(stock)} label="Œufs en stock" />
        <Stat valeur={fmtPlateaux(stock)} label={`(1 plateau = ${OEUFS_PAR_PLATEAU} œufs)`} />
      </div>
      {message && <p class="succes" role="status">{message}</p>}
      {!mode && (
        <div class="actions">
          <button class="principal" type="button" onClick={() => setMode('sortie')}><span class="e">📤</span>Sortie d'œufs</button>
          <button class="principal" type="button" onClick={() => setMode('inventaire')}><span class="e">🔢</span>Compter le stock</button>
        </div>
      )}
      {mode === 'sortie' && <SortieForm stock={stock} onFini={fini} />}
      {mode === 'inventaire' && <InventaireForm stock={stock} onFini={fini} />}

      <h3>Mouvements</h3>
      <ul>
        {liste.map((m) => (
          <li key={m.id}>
            <span>
              {LIBELLE[m.type]} : {m.type === 'ajustement' && m.quantite > 0 ? '+' : ''}
              {fmtInt(m.quantite)} œufs{m.note ? ` (${m.note})` : ''}
            </span>
            <small>{fmtDate(m.date)}</small>
            {!m.venteId && <button
              type="button"
              class="lien"
              onClick={async () => {
                if (window.confirm('Supprimer ce mouvement ?')) {
                  await saveRecord('oeufs_mvt', m.id, dataOf(m), true);
                }
              }}
            >
              Supprimer
            </button>}
          </li>
        ))}
        {liste.length === 0 && <li class="vide">Aucun mouvement. Les œufs ramassés entrent seuls dans le stock ; les ventes en sortent seules.</li>}
      </ul>
    </section>
  );
}

function SortieForm({ stock, onFini }: { stock: number; onFini: (m: string) => void }) {
  const [type, setType] = useState<'consommation' | 'casse'>('consommation');
  const [qte, setQte] = useState('');
  const [unite, setUnite] = useState<'plateaux' | 'oeufs'>('plateaux');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  async function envoyer(e: Event) {
    e.preventDefault();
    const q = nombre(qte);
    const oeufs = Math.round(unite === 'plateaux' ? q * OEUFS_PAR_PLATEAU : q);
    if (oeufs <= 0) return;
    if (oeufs > stock && !window.confirm(`Le stock deviendrait négatif (${fmtInt(stock - oeufs)} œufs). Continuer ?`)) return;
    await saveRecord('oeufs_mvt', newId(), { date, type, quantite: oeufs, note: note.trim() } satisfies MvtOeufs);
    onFini('Sortie enregistrée');
  }

  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Sortie d'œufs</h3>
      <Choix label="Motif" value={type} onChange={setType} options={[['consommation', 'Consommation'], ['casse', 'Casse au stockage']]} />
      <Champ label="Quantité" type="number" min={0} value={qte} onChange={setQte} required />
      <Choix label="Unité" value={unite} onChange={setUnite} options={[['plateaux', 'Plateaux'], ['oeufs', 'Œufs']]} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Champ label="Note (facultatif)" value={note} onChange={setNote} />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function InventaireForm({ stock, onFini }: { stock: number; onFini: (m: string) => void }) {
  const [compte, setCompte] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (compte.trim() === '') return;
    const reel = Math.max(0, Math.round(nombre(compte)));
    const ecart = reel - stock;
    if (ecart === 0) return onFini('Le stock est exact, rien à corriger');
    await saveRecord('oeufs_mvt', newId(), { date: today(), type: 'ajustement', quantite: ecart, note: 'inventaire' } satisfies MvtOeufs);
    onFini(`Stock corrigé (${ecart > 0 ? '+' : ''}${fmtInt(ecart)} œufs)`);
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Compter le stock</h3>
      <p class="intro">Stock calculé : {fmtInt(stock)} œufs. Entrez le nombre d'œufs que vous comptez vraiment.</p>
      <Champ label="Œufs comptés" type="number" min={0} value={compte} onChange={setCompte} required />
      <Boutons onAnnuler={() => onFini('')} texte="Corriger le stock" />
    </form>
  );
}
