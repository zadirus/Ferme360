import { useState } from 'preact/hooks';
import { dataOf, useItems, useRole } from '../hooks';
import { peut, peutEcrire } from '../droits';
import { fmtDate, fmtDec, fmtFcfa, fmtInt, joursEntre, today } from '../format';
import { coutDistribution, coutMoyen } from '../gestion/calculs';
import type { Achat, Article, StockMvt, Vente } from '../gestion/types';
import { dernierPoids, indicateursLot } from '../ruminants/calculs';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import { NOM_SOIN, type MvtAnimal, type Pesee, type Ration } from '../ruminants/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';
import { SoinForm } from './Animal';
import { CroissanceLot, ParcLot } from './RuminantsExtras';

type Action = 'pesees' | 'ration' | 'soin' | 'ajout';

export function LotDetail({ id }: { id: string }) {
  const r = useRuminants();
  const ventes = useItems<Vente>('vente');
  const stockMvts = useItems<StockMvt>('stock_mvt');
  const articlesTous = useItems<Article>('article');
  const role = useRole();
  const argent = peut(role, 'argent');
  const ecrit = (c: string) => peutEcrire(role, c);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const lot = r.lots.find((l) => l.id === id);
  if (!lot) return (<section><Retour vers="/elevage" texte="Élevage" /><p class="intro">Lot introuvable.</p></section>);

  const retour = lot.espece === 'ovin' ? '/moutons' : '/boeufs';
  const passes = r.animaux.filter((a) => r.etat(a.id).lotId === id);
  const presents = passes.filter((a) => r.statut(a.id) === 'present');
  const ind = indicateursLot(id, passes, new Set(presents.map((a) => a.id)), r.pesees, r.rations.map((x) => ({ ...x, cout: coutDistribution(x, articlesTous, r.achats) })), r.soins);
  const idsLot = new Set(passes.map((a) => a.id));
  const ventesLot = ventes.flatMap((v) => v.lignes).filter((l) => l.animalId && idsLot.has(l.animalId)).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const nVendus = passes.filter((a) => r.statut(a.id) === 'vendu').length;
  const fini = (m: string) => { setAction(null); setMessage(m); };

  let objectif: string | null = null;
  if (lot.type === 'embouche' && lot.poidsObjectif > 0 && ind.poidsMoyen !== null) {
    const reste = lot.poidsObjectif - ind.poidsMoyen;
    if (reste <= 0) objectif = `Objectif atteint (${fmtDec(lot.poidsObjectif, 0)} kg).`;
    else if (lot.dateObjectif) {
      const j = joursEntre(today(), lot.dateObjectif);
      objectif = j > 0 ? `Il reste ${fmtDec(reste, 1)} kg à gagner en ${j} jours : il faut ${fmtDec((reste / j) * 1000, 0)} g/jour par animal${ind.gmq !== null ? ` (actuel : ${fmtDec(ind.gmq, 0)} g/jour)` : ''}.` : `Date visée dépassée : il manque ${fmtDec(reste, 1)} kg.`;
    } else objectif = `Il reste ${fmtDec(reste, 1)} kg à gagner par animal.`;
  }

  const supprRation = async (x: (typeof r.rations)[number]) => {
    if (!window.confirm('Supprimer cette ration ? Le stock d\'aliment sera rétabli.')) return;
    await saveRecord('ration', x.id, dataOf(x), true);
    for (const m of stockMvts.filter((y) => y.alimentId === x.id)) await saveRecord('stock_mvt', m.id, dataOf(m), true);
    setMessage('Ration supprimée');
  };
  const supprSoin = async (s: (typeof r.soins)[number]) => {
    if (!window.confirm('Supprimer ce soin et sa dépense ?')) return;
    await saveRecord('soin', s.id, dataOf(s), true);
    for (const d of r.depenses.filter((x) => x.soinId === s.id)) await saveRecord('depense', d.id, dataOf(d), true);
    for (const m of stockMvts.filter((y) => y.alimentId === s.id)) await saveRecord('stock_mvt', m.id, dataOf(m), true);
    setMessage('Soin supprimé');
  };

  return (
    <section>
      <Retour vers={retour} texte="Registre" />
      <h2>{lot.nom}</h2>
      <p class="intro">{lot.type === 'embouche' ? 'Lot d\'embouche' : lot.type === 'reproductrices' ? 'Reproductrices' : lot.type === 'troupeau' ? 'Troupeau' : 'Lot'} · début le {fmtDate(lot.dateDebut)}{lot.dateObjectif ? ` · objectif le ${fmtDate(lot.dateObjectif)}` : ''}</p>
      {objectif && <p class="succes">{objectif}</p>}
      <div class="stats">
        <Stat valeur={fmtInt(presents.length)} label="Animaux présents" />
        <Stat valeur={ind.poidsMoyen !== null ? `${fmtDec(ind.poidsMoyen, 1)} kg` : '—'} label="Poids moyen" />
        <Stat valeur={ind.gmq !== null ? `${fmtDec(ind.gmq, 0)} g/j` : '—'} label="GMQ moyen" />
        <Stat valeur={`${fmtDec(ind.gain, 0)} kg`} label="Poids gagné (total)" />
        {argent && ind.couts.total > 0 && <Stat valeur={fmtFcfa(ind.couts.total)} label={`Coûts : achat ${fmtFcfa(ind.couts.achat)}, aliment ${fmtFcfa(ind.couts.aliment)}, soins ${fmtFcfa(ind.couts.soins)}`} />}
        {argent && ind.coutKgVif !== null && <Stat valeur={fmtFcfa(ind.coutKgVif)} label="Coût de revient du kg vif" />}
        {argent && ind.coutKgGagne !== null && <Stat valeur={fmtFcfa(ind.coutKgGagne)} label="Coût du kg gagné (aliment + soins)" />}
        {argent && nVendus > 0 && <Stat valeur={fmtFcfa(ventesLot - ind.couts.total)} label={`Résultat : ${nVendus} vendu(s) ${fmtFcfa(ventesLot)} − coûts`} />}
      </div>
      {message && <p class="succes" role="status">{message}</p>}
      {!action && (
        <div class="actions">
          {ecrit('pesee') && <button class="principal" type="button" onClick={() => setAction('pesees')}><span class="e">⚖️</span>Pesée du lot</button>}
          {ecrit('ration') && <button class="principal" type="button" onClick={() => setAction('ration')}><span class="e">🌽</span>Ration</button>}
          {ecrit('soin') && <button class="principal" type="button" onClick={() => setAction('soin')}><span class="e">💉</span>Soin du lot</button>}
          {ecrit('mvt_animal') && <button class="principal" type="button" onClick={() => setAction('ajout')}><span class="e">➕</span>Ajouter des animaux</button>}
        </div>
      )}
      {action === 'pesees' && <PeseesLot animaux={presents} onFini={fini} />}
      {action === 'ration' && <RationForm lotId={id} onFini={fini} />}
      {action === 'soin' && <SoinForm animalId="" lotId={id} espece={lot.espece} onFini={fini} />}
      {action === 'ajout' && <AjoutAnimaux lotId={id} espece={lot.espece} onFini={fini} />}

      <ParcLot lot={lot} peutModifier={ecrit('pature')} />
      <CroissanceLot animalIds={passes.map((a) => a.id)} pesees={r.pesees} />

      <h3>Animaux du lot</h3>
      <ul>
        {presents.map((a) => {
          const p = dernierPoids(a.id, r.pesees);
          return (<li key={a.id}><a class="carte" href={`#/animaux/${a.id}`}><strong>{libelleAnimal(a)}</strong><span>{[a.sexe === 'F' ? 'Femelle' : 'Mâle', p ? `${fmtDec(p, 1)} kg` : 'pas pesé'].join(' · ')}</span></a></li>);
        })}
        {presents.length === 0 && <li class="vide">Aucun animal dans ce lot.</li>}
      </ul>

      {(r.rations.some((x) => x.lotId === id) || r.soins.some((s) => s.lotId === id)) && <h3>Rations et soins du lot</h3>}
      <ul>
        {[...r.rations.filter((x) => x.lotId === id).map((x) => ({ cle: 'r' + x.id, date: x.date, texte: `Ration : ${fmtDec(x.kg, 0)} kg${argent && coutDistribution(x, articlesTous, r.achats) ? ` · ${fmtFcfa(coutDistribution(x, articlesTous, r.achats))}` : ''}`, col: 'ration', sup: () => supprRation(x) })),
          ...r.soins.filter((s) => s.lotId === id).map((s) => ({ cle: 's' + s.id, date: s.date, texte: `${NOM_SOIN[s.type]} : ${s.produit}${s.delaiAttente ? ` · délai ${s.delaiAttente} j` : ''}`, col: 'soin', sup: () => supprSoin(s) }))]
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((e) => (
            <li key={e.cle}><div class="ligne"><span>{e.texte}</span><small>{fmtDate(e.date)}</small></div>{ecrit(e.col) && <button type="button" class="lien" onClick={() => void e.sup()}>Supprimer</button>}</li>
          ))}
      </ul>
    </section>
  );
}

function PeseesLot({ animaux, onFini }: { animaux: Array<{ id: string; boucle: string; nom: string }>; onFini: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [poids, setPoids] = useState<Record<string, string>>({});
  async function envoyer(e: Event) {
    e.preventDefault();
    let n = 0;
    for (const a of animaux) {
      const p = nombre(poids[a.id] ?? '');
      if (p > 0 && p <= 2000) {
        await saveRecord('pesee', newId(), { animalId: a.id, date, poids: p, methode: 'balance' } satisfies Pesee);
        n++;
      }
    }
    onFini(n ? `${n} pesée(s) enregistrée(s)` : '');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Pesée du lot</h3>
      <p class="intro">Entrez le poids de chaque animal pesé. Laissez vide ceux que vous n'avez pas pesés.</p>
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      {animaux.map((a) => (
        <Champ key={a.id} label={a.nom ? `${a.boucle} · ${a.nom}` : a.boucle} type="number" min={0} value={poids[a.id] ?? ''} onChange={(v) => setPoids({ ...poids, [a.id]: v })} suffixe="kg" />
      ))}
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function RationForm({ lotId, onFini }: { lotId: string; onFini: (m: string) => void }) {
  const articles = useItems<Article>('article').filter((a) => a.categorie === 'aliment');
  const achats = useItems<Achat>('achat');
  const mvts = useItems<StockMvt>('stock_mvt');
  const [date, setDate] = useState(today());
  const [articleId, setArticleId] = useState('');
  const [kg, setKg] = useState('');
  const article = articles.find((a) => a.id === articleId);
  async function envoyer(e: Event) {
    e.preventDefault();
    const q = nombre(kg);
    if (q <= 0) return;
    const unites = article ? q / article.kgParUnite : 0;
    if (article) {
      const stock = mvts.filter((m) => m.articleId === article.id).reduce((s, m) => (m.type === 'sortie' ? s - m.quantite : s + m.quantite), 0);
      if (unites > stock && !window.confirm(`Le stock de ${article.nom} deviendrait négatif. Continuer ?`)) return;
    }
    const rationId = newId();
    const cout = article ? Math.round(unites * coutMoyen(article.id, achats)) : 0;
    await saveRecord('ration', rationId, { lotId, date, kg: q, articleId, cout, note: '' } satisfies Ration);
    if (article) await saveRecord('stock_mvt', newId(), { articleId: article.id, date, type: 'sortie', quantite: unites, peremption: '', achatId: '', alimentId: rationId, note: '' } satisfies StockMvt);
    onFini('Ration enregistrée');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Ration du lot</h3>
      <Choix label="Pris dans le stock" value={articleId} onChange={setArticleId} options={[['', 'Sans suivi de stock'], ...articles.map((a) => [a.id, a.nom] as [string, string])]} />
      <Champ label="Quantité distribuée" type="number" min={0} value={kg} onChange={setKg} suffixe="kg" required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function AjoutAnimaux({ lotId, espece, onFini }: { lotId: string; espece: 'ovin' | 'bovin'; onFini: (m: string) => void }) {
  const r = useRuminants();
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today());
  const candidats = r.animaux.filter((a) => a.espece === espece && r.statut(a.id) === 'present' && r.etat(a.id).lotId !== lotId);
  const bascule = (id: string) => { const s = new Set(choisis); if (s.has(id)) s.delete(id); else s.add(id); setChoisis(s); };
  async function envoyer(e: Event) {
    e.preventDefault();
    for (const id of choisis) await saveRecord('mvt_animal', newId(), { animalId: id, date, type: 'lot', motif: 'changement_lot', lotId, venteId: '', note: '' } satisfies MvtAnimal);
    onFini(choisis.size ? `${choisis.size} animal(aux) ajouté(s) au lot` : '');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Ajouter des animaux au lot</h3>
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <div class="cases">
        {candidats.map((a) => (
          <label key={a.id} class="case"><input type="checkbox" checked={choisis.has(a.id)} onChange={() => bascule(a.id)} />{libelleAnimal(a)}</label>
        ))}
        {candidats.length === 0 && <p class="intro">Tous les animaux présents sont déjà dans ce lot.</p>}
      </div>
      <Boutons texte={`Ajouter (${choisis.size})`} desactive={choisis.size === 0} onAnnuler={() => onFini('')} />
    </form>
  );
}
