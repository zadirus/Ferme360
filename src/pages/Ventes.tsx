import { useState } from 'preact/hooks';
import { dataOf, useItems } from '../hooks';
import { fmtDate, fmtFcfa, fmtInt, today } from '../format';
import { clientDe, compteDuMode, creances, oeufsVendus, totalLignes } from '../gestion/calculs';
import { ACTIVITES, type Activite, type Client, type LigneVente, type Paiement, type Vente } from '../gestion/types';
import { stockOeufs } from '../poules/calculs';
import type { MvtOeufs, Ramassage } from '../poules/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';
import { go } from '../hooks';

const TYPES_CLIENT: Array<[Client['type'], string]> = [
  ['revendeur', 'Revendeur'],
  ['maquis', 'Maquis / restaurant'],
  ['particulier', 'Particulier'],
  ['autre', 'Autre']
];

const MODES: Array<[Paiement['mode'], string]> = [
  ['especes', 'Espèces'],
  ['mobile_money', 'Mobile Money'],
  ['virement', 'Virement']
];

export function Ventes() {
  const ventes = useItems<Vente>('vente');
  const clients = useItems<Client>('client');
  const paiements = useItems<Paiement>('paiement');
  const cr = creances(ventes, paiements, today());
  const aEncaisser = cr.reduce((s, c) => s + c.solde, 0);
  const liste = [...ventes].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt).slice(0, 30);
  const paye = (v: { id: string; total: number }) => paiements.filter((p) => p.venteId === v.id).reduce((s, p) => s + p.montant, 0);

  return (
    <section>
      <h2>Ventes</h2>
      <div class="stats">
        <Stat valeur={fmtFcfa(aEncaisser)} label="À encaisser (clients)" />
        <Stat valeur={cr.length} label="Clients qui doivent" />
      </div>
      <div class="actions">
        <button class="principal" type="button" onClick={() => go('/ventes/nouvelle')}>
          <span class="e">🧾</span>Nouvelle vente
        </button>
        <button class="principal" type="button" onClick={() => go('/clients')}>
          <span class="e">👥</span>Clients
        </button>
      </div>
      <h3>Dernières ventes</h3>
      <ul>
        {liste.map((v) => (
          <li key={v.id}>
            <div class="ligne">
              <strong>{clientDe(v.clientId, clients)}</strong>
              <span class="montant">{fmtFcfa(v.total)}</span>
            </div>
            <small>
              {fmtDate(v.date)} · {v.lignes.map((l) => `${fmtInt(l.quantite)} ${l.article === 'oeufs' ? (l.unite === 'plateau' ? 'plateau(x) d’œufs' : 'œuf(s)') : l.libelle || l.article}`).join(', ')}
            </small>
            {paye(v) >= v.total - 0.5 ? <span class="badge">Payé</span> : <span class="badge ambre">À crédit</span>}
          </li>
        ))}
        {liste.length === 0 && <li class="vide">Aucune vente. Enregistrez la première.</li>}
      </ul>
    </section>
  );
}

interface Ligne {
  article: LigneVente['article'];
  libelle: string;
  quantite: string;
  unite: LigneVente['unite'];
  prix: string;
}

const UNITE_PAR_ARTICLE: Record<LigneVente['article'], LigneVente['unite']> = { oeufs: 'plateau', fumier: 'sac', autre: 'unite' };

export function NouvelleVente({ clientInitial }: { clientInitial: string }) {
  const clients = useItems<Client>('client');
  const ventes = useItems<Vente>('vente');
  const ram = useItems<Ramassage>('ramassage');
  const mvts = useItems<MvtOeufs>('oeufs_mvt');
  const [date, setDate] = useState(today());
  const [clientSel, setClientSel] = useState(clientInitial || 'comptoir');
  const [nom, setNom] = useState('');
  const [tel, setTel] = useState('');
  const [typeClient, setTypeClient] = useState<Client['type']>('revendeur');
  const [activite, setActivite] = useState<Activite>('poules');
  const [lignes, setLignes] = useState<Ligne[]>([{ article: 'oeufs', libelle: '', quantite: '', unite: 'plateau', prix: '' }]);
  const [paye, setPaye] = useState<string | null>(null);
  const [mode, setMode] = useState<Paiement['mode']>('especes');
  const [erreur, setErreur] = useState('');

  const clientId = clientSel === 'comptoir' || clientSel === '__nouveau' ? '' : clientSel;
  // prix proposé : celui de la dernière vente du même article (à ce client, sinon à n'importe quel client)
  function prixPropose(article: Ligne['article'], unite: Ligne['unite']): string {
    const recentes = [...ventes].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
    const cherche = (filtre: (v: Vente) => boolean) =>
      recentes.filter(filtre).flatMap((v) => v.lignes).find((l) => l.article === article && l.unite === unite)?.prixUnitaire;
    const p = (clientId && cherche((v) => v.clientId === clientId)) ?? cherche(() => true);
    return p ? String(p) : '';
  }

  const modif = (i: number, patch: Partial<Ligne>) => setLignes(lignes.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const nombres: LigneVente[] = lignes.map((l) => ({ article: l.article, libelle: l.libelle.trim(), quantite: nombre(l.quantite), unite: l.unite, prixUnitaire: nombre(l.prix) }));
  const total = totalLignes(nombres);
  const comptant = clientSel === 'comptoir';
  const montantPaye = comptant ? total : paye === null ? total : nombre(paye);

  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    const valides = nombres.filter((l) => l.quantite > 0);
    if (!valides.length || valides.some((l) => l.prixUnitaire < 0)) return setErreur('Indiquez au moins une quantité et un prix.');
    if (valides.some((l) => l.article === 'autre' && !l.libelle)) return setErreur('Précisez ce que vous vendez (ligne « Autre »).');
    if (clientSel === '__nouveau' && !nom.trim()) return setErreur('Indiquez le nom du client.');
    if (montantPaye < 0 || montantPaye > total + 0.5) return setErreur('Le montant payé ne peut pas dépasser le total.');
    const oeufs = oeufsVendus(valides);
    const stock = stockOeufs(ram, mvts);
    if (oeufs > stock && !window.confirm(`Le stock d'œufs deviendrait négatif (${fmtInt(stock - oeufs)} œufs). Continuer ?`)) return;

    let cid = clientId;
    if (clientSel === '__nouveau') {
      cid = newId();
      await saveRecord('client', cid, { nom: nom.trim(), telephone: tel.trim(), type: typeClient } satisfies Client);
    }
    const venteId = newId();
    const t = totalLignes(valides);
    await saveRecord('vente', venteId, { date, clientId: cid, activite, lignes: valides, total: t, note: '' } satisfies Vente);
    if (oeufs > 0) {
      await saveRecord('oeufs_mvt', newId(), { date, type: 'vente', quantite: oeufs, note: 'vente', venteId } satisfies MvtOeufs);
    }
    if (montantPaye > 0) {
      await saveRecord('paiement', newId(), { date, clientId: cid, venteId, montant: montantPaye, mode, note: '' } satisfies Paiement);
    }
    go(cid ? `/clients/${cid}` : '/ventes');
  }

  return (
    <section>
      <Retour vers="/ventes" texte="Ventes" />
      <h2>Nouvelle vente</h2>
      <form class="formulaire" onSubmit={envoyer}>
        <Choix
          label="Client"
          value={clientSel}
          onChange={(v) => setClientSel(v)}
          options={[
            ['comptoir', 'Sans nom (payé comptant)'],
            ...clients.map((c) => [c.id, c.nom] as [string, string]),
            ['__nouveau', '+ Nouveau client…']
          ]}
        />
        {clientSel === '__nouveau' && (
          <>
            <Champ label="Nom du client" value={nom} onChange={setNom} required />
            <Champ label="Téléphone (facultatif)" value={tel} onChange={setTel} />
            <Choix label="Type de client" value={typeClient} onChange={setTypeClient} options={TYPES_CLIENT} />
          </>
        )}
        <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
        <Choix label="Activité concernée" value={activite} onChange={setActivite} options={ACTIVITES} />

        {lignes.map((l, i) => (
          <div key={i} class="ligne-vente">
            <Choix
              label={lignes.length > 1 ? `Article ${i + 1}` : 'Article'}
              value={l.article}
              onChange={(a) => {
                const unite = UNITE_PAR_ARTICLE[a];
                modif(i, { article: a, unite, prix: prixPropose(a, unite) });
              }}
              options={[['oeufs', 'Œufs'], ['fumier', 'Fientes / fumier'], ['autre', 'Autre']]}
            />
            {l.article === 'autre' && <Champ label="Désignation" value={l.libelle} onChange={(v) => modif(i, { libelle: v })} />}
            <Champ label="Quantité" type="number" min={0} value={l.quantite} onChange={(v) => modif(i, { quantite: v, prix: l.prix || prixPropose(l.article, l.unite) })} />
            {l.article === 'oeufs' ? (
              <Choix label="Unité" value={l.unite} onChange={(u) => modif(i, { unite: u, prix: prixPropose('oeufs', u) })} options={[['plateau', 'Plateau (30 œufs)'], ['oeuf', 'Œuf à l’unité']]} />
            ) : (
              <Choix label="Unité" value={l.unite} onChange={(u) => modif(i, { unite: u })} options={[['sac', 'Sac'], ['unite', 'Unité']]} />
            )}
            <Champ label="Prix unitaire" type="number" min={0} value={l.prix} onChange={(v) => modif(i, { prix: v })} suffixe="FCFA" />
            {lignes.length > 1 && (
              <button type="button" class="lien" onClick={() => setLignes(lignes.filter((_, k) => k !== i))}>Retirer cet article</button>
            )}
          </div>
        ))}
        <button type="button" class="secondaire" onClick={() => setLignes([...lignes, { article: 'oeufs', libelle: '', quantite: '', unite: 'plateau', prix: prixPropose('oeufs', 'plateau') }])}>
          + Ajouter un article
        </button>

        <div class="stat large"><strong>{fmtFcfa(total)}</strong><span>Total de la vente</span></div>
        {!comptant && (
          <Champ label="Payé maintenant" type="number" min={0} value={paye === null ? String(total) : paye} onChange={setPaye} suffixe="FCFA" />
        )}
        <Choix label="Mode de paiement" value={mode} onChange={setMode} options={MODES} />
        {!comptant && total - montantPaye > 0.5 && <p class="intro">Reste à payer : {fmtFcfa(total - montantPaye)} (le client devra cette somme).</p>}
        {erreur && <p class="erreur">{erreur}</p>}
        <Boutons texte="Enregistrer la vente" onAnnuler={() => go('/ventes')} />
      </form>
    </section>
  );
}

export function Clients() {
  const clients = useItems<Client>('client');
  const ventes = useItems<Vente>('vente');
  const paiements = useItems<Paiement>('paiement');
  const cr = creances(ventes, paiements, today());
  const solde = (id: string) => cr.find((c) => c.clientId === id);
  const tri = [...clients].sort((a, b) => (solde(b.id)?.solde ?? 0) - (solde(a.id)?.solde ?? 0) || a.nom.localeCompare(b.nom));

  return (
    <section>
      <Retour vers="/ventes" texte="Ventes" />
      <h2>Clients</h2>
      <ul>
        {tri.map((c) => {
          const s = solde(c.id);
          return (
            <li key={c.id}>
              <a class="carte" href={`#/clients/${c.id}`}>
                <strong>{c.nom}</strong>
                <span>{[TYPES_CLIENT.find(([k]) => k === c.type)?.[1], c.telephone].filter(Boolean).join(' · ')}</span>
                {s ? <span class="dette">Doit {fmtFcfa(s.solde)}{s.jours > 0 ? ` depuis ${s.jours} j` : ''}</span> : <span>À jour</span>}
              </a>
            </li>
          );
        })}
        {tri.length === 0 && <li class="vide">Aucun client. Ils se créent lors d'une vente.</li>}
      </ul>
    </section>
  );
}

export function ClientDetail({ id }: { id: string }) {
  const clients = useItems<Client>('client');
  const ventes = useItems<Vente>('vente').filter((v) => v.clientId === id);
  const paiements = useItems<Paiement>('paiement').filter((p) => p.clientId === id);
  const mvts = useItems<MvtOeufs>('oeufs_mvt');
  const allPaiements = useItems<Paiement>('paiement');
  const [encaisser, setEncaisser] = useState(false);
  const [message, setMessage] = useState('');
  const c = clients.find((x) => x.id === id);
  if (!c) return (<section><Retour vers="/clients" texte="Clients" /><p class="intro">Client introuvable.</p></section>);

  const cr = creances(ventes, paiements, today());
  const du = cr[0]?.solde ?? 0;

  const evenements = [
    ...ventes.map((v) => ({ cle: 'v' + v.id, date: v.date, maj: v.updatedAt, texte: `Vente : ${fmtFcfa(v.total)}`, vente: v, paiement: undefined as undefined | typeof paiements[number] })),
    ...paiements.map((p) => ({ cle: 'p' + p.id, date: p.date, maj: p.updatedAt, texte: `Paiement reçu : ${fmtFcfa(p.montant)} (${MODES.find(([k]) => k === p.mode)?.[1]})`, vente: undefined as undefined | typeof ventes[number], paiement: p }))
  ].sort((a, b) => b.date.localeCompare(a.date) || b.maj - a.maj);

  async function supprimerVente(v: (typeof ventes)[number]) {
    if (!window.confirm('Supprimer cette vente, ses paiements et la sortie d’œufs liée ?')) return;
    await saveRecord('vente', v.id, dataOf(v), true);
    for (const m of mvts.filter((x) => x.venteId === v.id)) await saveRecord('oeufs_mvt', m.id, dataOf(m), true);
    for (const p of allPaiements.filter((x) => x.venteId === v.id)) await saveRecord('paiement', p.id, dataOf(p), true);
    setMessage('Vente supprimée');
  }
  async function supprimerPaiement(p: (typeof paiements)[number]) {
    if (!window.confirm('Supprimer ce paiement ?')) return;
    await saveRecord('paiement', p.id, dataOf(p), true);
    setMessage('Paiement supprimé');
  }

  return (
    <section>
      <Retour vers="/clients" texte="Clients" />
      <h2>{c.nom}</h2>
      <p class="intro">{[TYPES_CLIENT.find(([k]) => k === c.type)?.[1], c.telephone].filter(Boolean).join(' · ')}</p>
      <div class="stats">
        <Stat valeur={fmtFcfa(du)} label={du > 0 ? `Doit${cr[0]?.jours ? ` · depuis ${cr[0].jours} j` : ''}` : 'Solde : à jour'} />
        <Stat valeur={fmtFcfa(ventes.reduce((s, v) => s + v.total, 0))} label="Total acheté" />
      </div>
      {message && <p class="succes" role="status">{message}</p>}
      {!encaisser && (
        <div class="actions">
          <button class="principal" type="button" onClick={() => go(`/ventes/nouvelle/${id}`)}><span class="e">🧾</span>Nouvelle vente</button>
          <button class="principal" type="button" disabled={du <= 0} onClick={() => setEncaisser(true)}><span class="e">💵</span>Encaisser</button>
        </div>
      )}
      {encaisser && <EncaisserForm clientId={id} du={du} onFini={(m) => { setEncaisser(false); setMessage(m); }} />}
      <h3>Historique</h3>
      <ul>
        {evenements.map((ev) => (
          <li key={ev.cle}>
            <div class="ligne"><span>{ev.texte}</span><small>{fmtDate(ev.date)}</small></div>
            {ev.vente && <small>{ev.vente.lignes.map((l) => `${fmtInt(l.quantite)} ${l.article === 'oeufs' ? (l.unite === 'plateau' ? 'plateau(x)' : 'œuf(s)') : l.libelle || l.article} à ${fmtFcfa(l.prixUnitaire)}`).join(' · ')}</small>}
            <button type="button" class="lien" onClick={() => void (ev.vente ? supprimerVente(ev.vente) : supprimerPaiement(ev.paiement!))}>Supprimer</button>
          </li>
        ))}
        {evenements.length === 0 && <li class="vide">Aucune vente pour ce client.</li>}
      </ul>
    </section>
  );
}

function EncaisserForm({ clientId, du, onFini }: { clientId: string; du: number; onFini: (m: string) => void }) {
  const [montant, setMontant] = useState(String(du));
  const [mode, setMode] = useState<Paiement['mode']>('especes');
  const [date, setDate] = useState(today());
  async function envoyer(e: Event) {
    e.preventDefault();
    const m = nombre(montant);
    if (m <= 0) return;
    if (m > du + 0.5 && !window.confirm(`Ce montant dépasse ce que le client doit (${fmtFcfa(du)}). Continuer ?`)) return;
    await saveRecord('paiement', newId(), { date, clientId, venteId: '', montant: m, mode, note: '' } satisfies Paiement);
    onFini(`Paiement de ${fmtFcfa(m)} enregistré (${compteDuMode(mode) === 'caisse' ? 'caisse' : 'compte'})`);
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Encaisser un paiement</h3>
      <Champ label="Montant reçu" type="number" min={0} value={montant} onChange={setMontant} suffixe="FCFA" required />
      <Choix label="Mode de paiement" value={mode} onChange={setMode} options={MODES} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons texte="Enregistrer le paiement" onAnnuler={() => onFini('')} />
    </form>
  );
}
