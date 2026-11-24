import { useState } from 'preact/hooks';
import { dataOf, useItems } from '../hooks';
import { fmtDate, fmtFcfa, today } from '../format';
import { creances, detteFournisseur, resultats, soldesComptes } from '../gestion/calculs';
import {
  ACTIVITES, CATEGORIES_DEPENSE, COMPTES, nomActivite, nomCompte,
  type Achat, type Activite, type Compte, type Depense, type Fournisseur, type Paiement, type Reglement, type StockMvt, type TresoMvt, type Vente
} from '../gestion/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre, Stat } from '../ui';
import { AchatForm } from './Stocks';

type Mode = 'depense' | 'achat' | 'ajuster' | null;

export function Argent() {
  const paiements = useItems<Paiement>('paiement');
  const achats = useItems<Achat>('achat');
  const reglements = useItems<Reglement>('reglement');
  const depenses = useItems<Depense>('depense');
  const ajustements = useItems<TresoMvt>('treso_mvt');
  const ventes = useItems<Vente>('vente');
  const fournisseurs = useItems<Fournisseur>('fournisseur');
  const stockMvts = useItems<StockMvt>('stock_mvt');
  const [mode, setMode] = useState<Mode>(null);
  const [payer, setPayer] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const soldes = soldesComptes(paiements, achats, reglements, depenses, ajustements);
  const total = soldes.caisse + soldes.mobile_money + soldes.banque;
  const aEncaisser = creances(ventes, paiements, today()).reduce((s, c) => s + c.solde, 0);
  const dettes = fournisseurs.map((f) => ({ f, dette: detteFournisseur(f.id, achats, reglements) }));
  const detteTotale = dettes.reduce((s, d) => s + Math.max(0, d.dette), 0);
  const res = resultats(ventes, achats, depenses, ACTIVITES.map(([k]) => k));
  const fini = (m: string) => { setMode(null); setPayer(null); setMessage(m); };

  const sorties = [
    ...achats.map((a) => ({ cle: 'a' + a.id, date: a.date, maj: a.updatedAt, texte: `Achat : ${a.libelle || 'divers'}`, montant: a.total, supprimer: async () => {
      if (!window.confirm('Supprimer cet achat et son entrée de stock ?')) return;
      await saveRecord('achat', a.id, dataOf(a), true);
      for (const m of stockMvts.filter((x) => x.achatId === a.id)) await saveRecord('stock_mvt', m.id, dataOf(m), true);
      setMessage('Achat supprimé');
    } })),
    ...depenses.map((d) => ({ cle: 'd' + d.id, date: d.date, maj: d.updatedAt, texte: `${d.categorie}${d.libelle ? ` : ${d.libelle}` : ''}`, montant: d.montant, supprimer: async () => {
      if (!window.confirm('Supprimer cette dépense ?')) return;
      await saveRecord('depense', d.id, dataOf(d), true);
      setMessage('Dépense supprimée');
    } }))
  ].sort((a, b) => b.date.localeCompare(a.date) || b.maj - a.maj).slice(0, 25);

  return (
    <section>
      <h2>Argent</h2>
      <div class="stats">
        <Stat valeur={fmtFcfa(total)} label="Total en caisse et comptes" />
        <Stat valeur={fmtFcfa(soldes.caisse)} label="Caisse (espèces)" />
        <Stat valeur={fmtFcfa(soldes.mobile_money)} label="Mobile Money" />
        <Stat valeur={fmtFcfa(soldes.banque)} label="Banque / virement" />
        <Stat valeur={fmtFcfa(aEncaisser)} label="À encaisser (clients)" />
        <Stat valeur={fmtFcfa(detteTotale)} label="À payer (fournisseurs)" />
      </div>
      {message && <p class="succes" role="status">{message}</p>}
      {!mode && payer === null && (
        <div class="actions">
          <button class="principal" type="button" onClick={() => setMode('depense')}><span class="e">💸</span>Dépense</button>
          <button class="principal" type="button" onClick={() => setMode('achat')}><span class="e">🛒</span>Achat</button>
          <button class="secondaire" type="button" onClick={() => setMode('ajuster')}>Corriger un solde</button>
        </div>
      )}
      {mode === 'depense' && <DepenseForm onFini={fini} />}
      {mode === 'achat' && <AchatForm onFini={fini} />}
      {mode === 'ajuster' && <AjusterForm soldes={soldes} onFini={fini} />}
      {payer !== null && <ReglementForm fournisseur={fournisseurs.find((f) => f.id === payer)!} dette={dettes.find((d) => d.f.id === payer)?.dette ?? 0} onFini={fini} />}

      <h3>Résultat par activité</h3>
      <ul>
        {res.map((r) => (
          <li key={r.activite}>
            <div class="ligne"><strong>{nomActivite(r.activite as Activite)}</strong><span class={`montant ${r.marge < 0 ? 'dette' : ''}`}>{fmtFcfa(r.marge)}</span></div>
            <small>Ventes {fmtFcfa(r.ventes)} − charges {fmtFcfa(r.charges)}</small>
          </li>
        ))}
      </ul>
      <p class="intro">Les achats sont comptés le jour où vous les faites. Les charges « commun » ne sont pas encore réparties entre les élevages.</p>

      {dettes.length > 0 && (
        <>
          <h3>Fournisseurs</h3>
          <ul>
            {dettes.map(({ f, dette }) => (
              <li key={f.id}>
                <div class="ligne"><strong>{f.nom}</strong><span class={`montant ${dette > 0 ? 'dette' : ''}`}>{dette > 0.5 ? fmtFcfa(dette) : 'À jour'}</span></div>
                {f.telephone && <small>{f.telephone}</small>}
                {dette > 0.5 && <button type="button" class="lien" onClick={() => { setMode(null); setPayer(f.id); }}>Payer ce fournisseur</button>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Dernières dépenses et achats</h3>
      <ul>
        {sorties.map((s) => (
          <li key={s.cle}>
            <div class="ligne"><span>{s.texte}</span><span class="montant">{fmtFcfa(s.montant)}</span></div>
            <small>{fmtDate(s.date)}</small>
            <button type="button" class="lien" onClick={() => void s.supprimer()}>Supprimer</button>
          </li>
        ))}
        {sorties.length === 0 && <li class="vide">Aucune dépense enregistrée.</li>}
      </ul>
    </section>
  );
}

function DepenseForm({ onFini }: { onFini: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [activite, setActivite] = useState<Activite>('commun');
  const [categorie, setCategorie] = useState(CATEGORIES_DEPENSE[0]);
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [compte, setCompte] = useState<Compte>('caisse');
  async function envoyer(e: Event) {
    e.preventDefault();
    const m = nombre(montant);
    if (m <= 0) return;
    await saveRecord('depense', newId(), { date, activite, categorie, libelle: libelle.trim(), montant: m, compte } satisfies Depense);
    onFini(`Dépense de ${fmtFcfa(m)} enregistrée`);
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouvelle dépense</h3>
      <Choix label="Catégorie" value={categorie} onChange={setCategorie} options={CATEGORIES_DEPENSE.map((c) => [c, c] as [string, string])} />
      <Champ label="Précision (facultatif)" value={libelle} onChange={setLibelle} />
      <Champ label="Montant" type="number" min={0} value={montant} onChange={setMontant} suffixe="FCFA" required />
      <Choix label="Payé avec" value={compte} onChange={setCompte} options={COMPTES} />
      <Choix label="Activité concernée" value={activite} onChange={setActivite} options={ACTIVITES} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function AjusterForm({ soldes, onFini }: { soldes: Record<Compte, number>; onFini: (m: string) => void }) {
  const [compte, setCompte] = useState<Compte>('caisse');
  const [reel, setReel] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (reel.trim() === '') return;
    const ecart = nombre(reel) - soldes[compte];
    if (Math.abs(ecart) < 0.5) return onFini('Le solde est exact');
    await saveRecord('treso_mvt', newId(), { date: today(), compte, montant: ecart, note: 'correction de solde' } satisfies TresoMvt);
    onFini(`Solde de « ${nomCompte(compte)} » corrigé (${ecart > 0 ? '+' : ''}${fmtFcfa(ecart)})`);
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Corriger un solde</h3>
      <p class="intro">Sert aussi à indiquer l'argent que vous aviez au départ. Entrez ce qu'il y a vraiment.</p>
      <Choix label="Compte" value={compte} onChange={setCompte} options={COMPTES} />
      <p class="intro">Solde calculé : {fmtFcfa(soldes[compte])}</p>
      <Champ label="Solde réel" type="number" value={reel} onChange={setReel} suffixe="FCFA" required />
      <Boutons texte="Corriger" onAnnuler={() => onFini('')} />
    </form>
  );
}

function ReglementForm({ fournisseur, dette, onFini }: { fournisseur: Fournisseur & { id: string }; dette: number; onFini: (m: string) => void }) {
  const [montant, setMontant] = useState(String(Math.round(dette)));
  const [compte, setCompte] = useState<Compte>('caisse');
  const [date, setDate] = useState(today());
  async function envoyer(e: Event) {
    e.preventDefault();
    const m = nombre(montant);
    if (m <= 0) return;
    if (m > dette + 0.5 && !window.confirm(`Ce montant dépasse la dette (${fmtFcfa(dette)}). Continuer ?`)) return;
    await saveRecord('reglement', newId(), { date, fournisseurId: fournisseur.id, montant: m, compte } satisfies Reglement);
    onFini(`${fmtFcfa(m)} payés à ${fournisseur.nom}`);
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Payer {fournisseur.nom}</h3>
      <p class="intro">Reste dû : {fmtFcfa(dette)}</p>
      <Champ label="Montant payé" type="number" min={0} value={montant} onChange={setMontant} suffixe="FCFA" required />
      <Choix label="Payé avec" value={compte} onChange={setCompte} options={COMPTES} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}
