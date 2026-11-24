import { useState } from 'preact/hooks';
import { dataOf, useItems, useRole } from '../hooks';
import { peut } from '../droits';
import { COMPTES, type Achat, type Compte, type Fournisseur, type Vente } from '../gestion/types';
import { fmtFcfa } from '../format';
import { prixMoyenOeuf } from '../poules/calculs';
import { fmtDate, fmtInt, fmtPlateaux, OEUFS_PAR_PLATEAU, today } from '../format';
import { stockOeufs } from '../poules/calculs';
import type { MvtOeufs, Ramassage } from '../poules/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';

const LIBELLE: Record<MvtOeufs['type'], string> = {
  vente: 'Vente',
  consommation: 'Consommation',
  casse: 'Casse au stockage',
  ajustement: 'Ajustement d’inventaire',
  achat: 'Achat à un fournisseur'
};

export function Oeufs() {
  const ram = useItems<Ramassage>('ramassage');
  const mvts = useItems<MvtOeufs>('oeufs_mvt');
  const achats = useItems<Achat>('achat');
  const ventes = useItems<Vente>('vente');
  const role = useRole();
  const argent = peut(role, 'achats');
  const [mode, setMode] = useState<'sortie' | 'inventaire' | 'achat' | null>(null);
  const [message, setMessage] = useState('');
  const stock = stockOeufs(ram, mvts);
  const achetes = mvts.filter((m) => m.type === 'achat');
  const nbAchetes = achetes.reduce((s, m) => s + m.quantite, 0);
  const coutAchete = achetes.reduce((s, m) => s + (achats.find((a) => a.id === m.achatId)?.total ?? 0), 0);
  const coutPlateauAchete = nbAchetes > 0 && coutAchete > 0 ? coutAchete / (nbAchetes / OEUFS_PAR_PLATEAU) : null;
  const prixVentePlateau = (() => { const p = prixMoyenOeuf(ventes); return p === null ? null : p * OEUFS_PAR_PLATEAU; })();
  const liste = [...mvts].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt).slice(0, 40);

  const fini = (m: string) => {
    setMode(null);
    setMessage(m);
  };

  return (
    <section>
      <Retour vers="/elevage" texte="Élevage" />
      <h2>Stock d'œufs</h2>
      <p class="intro">Pour vendre des œufs, utilisez l'onglet Ventes : la sortie du stock se fait toute seule.</p>
      <div class="stats">
        <Stat valeur={fmtInt(stock)} label="Œufs en stock" />
        <Stat valeur={fmtPlateaux(stock)} label={`(1 plateau = ${OEUFS_PAR_PLATEAU} œufs)`} />
      </div>
      {argent && nbAchetes > 0 && (
        <div class="stats">
          <Stat valeur={fmtPlateaux(nbAchetes)} label="Achetés à des fournisseurs" />
          {coutPlateauAchete !== null && <Stat valeur={fmtFcfa(coutPlateauAchete)} label="Coût moyen du plateau acheté" />}
          {coutPlateauAchete !== null && prixVentePlateau !== null && <Stat valeur={fmtFcfa(prixVentePlateau - coutPlateauAchete)} label="Marge moyenne par plateau revendu" />}
        </div>
      )}
      {message && <p class="succes" role="status">{message}</p>}
      {!mode && (
        <div class="actions">
          {argent && <button class="principal" type="button" onClick={() => setMode('achat')}><span class="e">🛒</span>Acheter des œufs</button>}
          <button class="principal" type="button" onClick={() => setMode('sortie')}><span class="e">📤</span>Sortie d'œufs</button>
          <button class="principal" type="button" onClick={() => setMode('inventaire')}><span class="e">🔢</span>Compter le stock</button>
        </div>
      )}
      {mode === 'achat' && <AchatOeufsForm onFini={fini} />}
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
            {!m.venteId && (!m.achatId || argent) && <button
              type="button"
              class="lien"
              onClick={async () => {
                if (window.confirm(m.achatId ? 'Supprimer cet achat d’œufs, sa dette éventuelle et son entrée en stock ?' : 'Supprimer ce mouvement ?')) {
                  await saveRecord('oeufs_mvt', m.id, dataOf(m), true);
                  const a = achats.find((x) => x.id === m.achatId);
                  if (a) await saveRecord('achat', a.id, dataOf(a), true);
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

function AchatOeufsForm({ onFini }: { onFini: (m: string) => void }) {
  const fournisseurs = useItems<Fournisseur>('fournisseur');
  const [date, setDate] = useState(today());
  const [qte, setQte] = useState('');
  const [unite, setUnite] = useState<'plateaux' | 'oeufs'>('plateaux');
  const [prix, setPrix] = useState('');
  const [prixPar, setPrixPar] = useState<'plateau' | 'total'>('plateau');
  const [paye, setPaye] = useState<string | null>(null);
  const [compte, setCompte] = useState<Compte>('caisse');
  const [fournisseurSel, setFournisseurSel] = useState('');
  const [nomF, setNomF] = useState('');
  const [telF, setTelF] = useState('');
  const [erreur, setErreur] = useState('');

  const oeufs = Math.round(unite === 'plateaux' ? nombre(qte) * OEUFS_PAR_PLATEAU : nombre(qte));
  const total = Math.round(prixPar === 'total' ? nombre(prix) : nombre(prix) * (oeufs / OEUFS_PAR_PLATEAU));
  const montantPaye = paye === null ? total : nombre(paye);

  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    if (oeufs <= 0) return setErreur('Indiquez la quantité achetée.');
    if (total <= 0) return setErreur('Indiquez le prix.');
    if (montantPaye < 0 || montantPaye > total + 0.5) return setErreur('Le montant payé ne peut pas dépasser le total.');
    if (!fournisseurSel) return setErreur('Choisissez le fournisseur (ou créez-le) pour savoir chez qui vous avez acheté.');
    if (fournisseurSel === '__nouveau' && !nomF.trim()) return setErreur('Indiquez le nom du fournisseur.');
    const fid = fournisseurSel === '__nouveau' ? newId() : fournisseurSel;
    if (fournisseurSel === '__nouveau') await saveRecord('fournisseur', fid, { nom: nomF.trim(), telephone: telF.trim() } satisfies Fournisseur);
    const achatId = newId();
    await saveRecord('achat', achatId, {
      date, fournisseurId: fid, activite: 'poules', articleId: '', libelle: `Œufs achetés (${fmtPlateaux(oeufs)})`, quantite: oeufs,
      total, montantPaye, compte, peremption: ''
    } satisfies Achat);
    await saveRecord('oeufs_mvt', newId(), { date, type: 'achat', quantite: oeufs, note: 'achat fournisseur', achatId } satisfies MvtOeufs);
    onFini(`Achat de ${fmtPlateaux(oeufs)} enregistré (${fmtFcfa(total)})`);
  }

  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Acheter des œufs</h3>
      <p class="intro">Les œufs achetés entrent dans le stock avec ceux de la ferme ; la dette envers le fournisseur et le coût sont suivis dans Argent.</p>
      <Choix label="Fournisseur" value={fournisseurSel} onChange={setFournisseurSel}
        options={[['', 'Choisir…'], ...fournisseurs.map((f) => [f.id, f.nom] as [string, string]), ['__nouveau', '+ Nouveau fournisseur…']]} />
      {fournisseurSel === '__nouveau' && (<><Champ label="Nom du fournisseur" value={nomF} onChange={setNomF} /><Champ label="Téléphone (facultatif)" value={telF} onChange={setTelF} /></>)}
      <Champ label="Quantité achetée" type="number" min={0} value={qte} onChange={setQte} required />
      <Choix label="Unité" value={unite} onChange={setUnite} options={[['plateaux', `Plateaux de ${OEUFS_PAR_PLATEAU}`], ['oeufs', 'Œufs']]} />
      <Choix label="Prix indiqué" value={prixPar} onChange={setPrixPar} options={[['plateau', 'Prix du plateau'], ['total', 'Prix total']]} />
      <Champ label={prixPar === 'plateau' ? 'Prix d’un plateau' : 'Prix total'} type="number" min={0} value={prix} onChange={setPrix} suffixe="FCFA" required />
      {total > 0 && <p class="intro">Total : <strong>{fmtFcfa(total)}</strong>{oeufs > 0 ? ` pour ${fmtPlateaux(oeufs)}` : ''}</p>}
      <Champ label="Payé maintenant" type="number" min={0} value={paye === null ? (total ? String(total) : '') : paye} onChange={setPaye} suffixe="FCFA" />
      {total - montantPaye > 0.5 && <p class="intro">Reste à payer au fournisseur : <strong>{fmtFcfa(total - montantPaye)}</strong></p>}
      <Choix label="Payé avec" value={compte} onChange={setCompte} options={COMPTES} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons texte="Enregistrer l'achat" onAnnuler={() => onFini('')} />
    </form>
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
