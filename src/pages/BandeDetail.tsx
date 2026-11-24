import { useState } from 'preact/hooks';
import { dataOf, useItems, useRole, type Item } from '../hooks';
import { peut, peutEcrire } from '../droits';
import { fmtDate, fmtDec, fmtFcfa, fmtInt, fmtPct, joursEntre, OEUFS_PAR_PLATEAU, today } from '../format';
import { alertes, effectifActuel, indicateurs } from '../poules/calculs';
import { coutDistribution, coutMoyen } from '../gestion/calculs';
import type { Achat, Article, StockMvt } from '../gestion/types';
import type { Aliment, Bande, Mortalite, Ramassage, Sante } from '../poules/types';
import { newId, saveRecord } from '../sync';
import { Alertes, Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';

type Action = 'ramassage' | 'mortalite' | 'aliment' | 'sante';

interface Evenement {
  id: string;
  collection: string;
  date: string;
  texte: string;
  updatedAt: number;
  supprimer: () => Promise<void>;
}

const enregistrer = (collection: string, data: object) => saveRecord(collection, newId(), data as Record<string, unknown>);

export function BandeDetail({ id }: { id: string }) {
  const bandes = useItems<Bande>('bande');
  const ram = useItems<Ramassage>('ramassage').filter((x) => x.bandeId === id);
  const morts = useItems<Mortalite>('mortalite').filter((x) => x.bandeId === id);
  const aliments = useItems<Aliment>('aliment').filter((x) => x.bandeId === id);
  const santes = useItems<Sante>('sante').filter((x) => x.bandeId === id);
  const stockMvts = useItems<StockMvt>('stock_mvt');
  const articlesTous = useItems<Article>('article');
  const achatsTous = useItems<Achat>('achat');
  const role = useRole();
  const argent = peut(role, 'argent');
  const ecrit = (c: string) => peutEcrire(role, c);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');

  const b = bandes.find((x) => x.id === id);
  if (!b) {
    return (
      <section>
        <Retour vers="/poules" texte="Poules" />
        <p class="intro">Bande introuvable. Si elle vient d'un autre téléphone, attendez la synchronisation.</p>
      </section>
    );
  }

  const i = indicateurs(b, ram, morts, aliments);
  const al = alertes(b, ram, morts);
  const coutAliment = aliments.reduce((sum, a) => sum + coutDistribution(a, articlesTous, achatsTous), 0);
  const ageSemaines = b.ageArriveeSemaines + Math.floor(Math.max(0, joursEntre(b.dateArrivee, today())) / 7);
  const rappels = santes.filter((s) => s.rappel && s.rappel >= today()).sort((x, y) => x.rappel.localeCompare(y.rappel));

  const fini = (m: string) => {
    setAction(null);
    setMessage(m);
  };

  const suppr = <T extends object>(collection: string, item: Item<T>) => async () => {
    if (window.confirm('Supprimer cette saisie ?')) {
      await saveRecord(collection, item.id, dataOf(item), true);
      setMessage('Saisie supprimée');
    }
  };

  const evenements: Evenement[] = [
    ...ram.map((r) => ({
      id: r.id, collection: 'ramassage', date: r.date, updatedAt: r.updatedAt,
      texte: `Ramassage : ${fmtInt(r.bons)} bons, ${fmtInt(r.feles)} fêlés, ${fmtInt(r.casses)} cassés`,
      supprimer: suppr('ramassage', r)
    })),
    ...morts.map((m) => ({
      id: m.id, collection: 'mortalite', date: m.date, updatedAt: m.updatedAt,
      texte: `${m.type === 'mort' ? 'Mortalité' : 'Réforme'} : ${fmtInt(m.nombre)}${m.cause ? ` (${m.cause})` : ''}`,
      supprimer: suppr('mortalite', m)
    })),
    ...aliments.map((a) => ({
      id: a.id, collection: 'aliment', date: a.date, updatedAt: a.updatedAt,
      texte: `Aliment ${a.type} : ${fmtDec(a.kg)} kg${argent && coutDistribution(a, articlesTous, achatsTous) ? ` · ${fmtFcfa(coutDistribution(a, articlesTous, achatsTous))}` : ''}`,
      supprimer: async () => {
        if (!window.confirm('Supprimer cette saisie ? Le stock d’aliment sera rétabli.')) return;
        await saveRecord('aliment', a.id, dataOf(a), true);
        for (const m of stockMvts.filter((x) => x.alimentId === a.id)) await saveRecord('stock_mvt', m.id, dataOf(m), true);
        setMessage('Saisie supprimée');
      }
    })),
    ...santes.map((s) => ({
      id: s.id, collection: 'sante', date: s.date, updatedAt: s.updatedAt,
      texte: `${s.type === 'vaccin' ? 'Vaccin' : s.type === 'traitement' ? 'Traitement' : 'Santé'} : ${s.produit}${s.rappel ? ` · rappel le ${fmtDate(s.rappel)}` : ''}`,
      supprimer: suppr('sante', s)
    }))
  ]
    .sort((x, y) => y.date.localeCompare(x.date) || y.updatedAt - x.updatedAt)
    .slice(0, 40);

  async function basculerCloture() {
    const cloture = !b!.cloturee;
    if (cloture && !window.confirm('Clôturer cette bande ? Vous pourrez la rouvrir.')) return;
    await saveRecord('bande', id, { ...dataOf(b!), cloturee: cloture, dateCloture: cloture ? today() : '' });
    setMessage(cloture ? 'Bande clôturée' : 'Bande rouverte');
  }

  return (
    <section>
      <Retour vers="/poules" texte="Poules" />
      <h2>{b.nom}</h2>
      <p class="intro">
        {[b.batiment, b.souche, `arrivée le ${fmtDate(b.dateArrivee)}`, `${ageSemaines} semaines`].filter(Boolean).join(' · ')}
        {b.cloturee && ` · clôturée le ${fmtDate(b.dateCloture ?? '')}`}
      </p>
      <Alertes liste={al} />

      <div class="stats">
        <Stat valeur={fmtInt(i.effectif)} label="Poules présentes" />
        <Stat valeur={i.dernierTaux !== null ? fmtPct(i.dernierTaux) : '—'} label={i.derniereDate ? `Ponte du ${fmtDate(i.derniereDate)}` : 'Taux de ponte'} />
        <Stat valeur={fmtPct(i.mortalitePct)} label="Mortalité" />
        <Stat valeur={fmtDec(i.oeufsParPoule, 1)} label="Œufs par poule départ" />
        <Stat valeur={`${fmtDec(i.alimentKg, 0)} kg`} label="Aliment distribué" />
        <Stat valeur={i.indiceConso !== null ? fmtDec(i.indiceConso, 2) : '—'} label="Indice de consommation" />
        {argent && coutAliment > 0 && <Stat valeur={fmtFcfa(coutAliment)} label="Coût de l'aliment" />}
        {argent && coutAliment > 0 && i.oeufsCumules > 0 && <Stat valeur={fmtFcfa(coutAliment / (i.oeufsCumules / OEUFS_PAR_PLATEAU))} label="Aliment par plateau" />}
      </div>

      {message && <p class="succes" role="status">{message}</p>}

      {!b.cloturee && !action && (
        <div class="actions">
          {ecrit('ramassage') && <button class="principal" type="button" onClick={() => setAction('ramassage')}><span class="e">🥚</span>Ramassage</button>}
          {ecrit('mortalite') && <button class="principal" type="button" onClick={() => setAction('mortalite')}><span class="e">💀</span>Mortalité / réforme</button>}
          {ecrit('aliment') && <button class="principal" type="button" onClick={() => setAction('aliment')}><span class="e">🌽</span>Aliment</button>}
          {ecrit('sante') && <button class="principal" type="button" onClick={() => setAction('sante')}><span class="e">💉</span>Santé</button>}
        </div>
      )}

      {action === 'ramassage' && <RamassageForm bandeId={id} onFini={fini} />}
      {action === 'mortalite' && <MortaliteForm bandeId={id} effectif={effectifActuel(b, morts)} onFini={fini} />}
      {action === 'aliment' && <AlimentForm bandeId={id} onFini={fini} />}
      {action === 'sante' && <SanteForm bandeId={id} onFini={fini} />}

      {rappels.length > 0 && (
        <>
          <h3>Prochains rappels</h3>
          <ul>
            {rappels.map((s) => (
              <li key={s.id}>
                <span>{s.produit}</span>
                <small>le {fmtDate(s.rappel)}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Historique</h3>
      <ul>
        {evenements.map((ev) => (
          <li key={ev.collection + ev.id}>
            <span>{ev.texte}</span>
            <small>{fmtDate(ev.date)}</small>
            {!b.cloturee && ecrit(ev.collection) && (
              <button type="button" class="lien" onClick={() => void ev.supprimer()}>Supprimer</button>
            )}
          </li>
        ))}
        {evenements.length === 0 && <li class="vide">Aucune saisie pour cette bande.</li>}
      </ul>

      {ecrit('bande') && <button class="secondaire" type="button" onClick={() => void basculerCloture()}>
        {b.cloturee ? 'Rouvrir la bande' : 'Clôturer la bande'}
      </button>}
    </section>
  );
}

interface FormProps {
  bandeId: string;
  onFini: (message: string) => void;
}

function RamassageForm({ bandeId, onFini }: FormProps) {
  const [date, setDate] = useState(today());
  const [bons, setBons] = useState('');
  const [feles, setFeles] = useState('');
  const [casses, setCasses] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    const d: Ramassage = { bandeId, date, bons: Math.floor(nombre(bons)), feles: Math.floor(nombre(feles)), casses: Math.floor(nombre(casses)) };
    if (d.bons + d.feles + d.casses <= 0 || d.bons < 0 || d.feles < 0 || d.casses < 0) return;
    await enregistrer('ramassage', d);
    onFini('Ramassage enregistré');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Ramassage</h3>
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Champ label="Bons œufs" type="number" min={0} value={bons} onChange={setBons} placeholder="0" />
      <Champ label="Fêlés" type="number" min={0} value={feles} onChange={setFeles} placeholder="0" />
      <Champ label="Cassés" type="number" min={0} value={casses} onChange={setCasses} placeholder="0" />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function MortaliteForm({ bandeId, effectif, onFini }: FormProps & { effectif: number }) {
  const [date, setDate] = useState(today());
  const [type, setType] = useState<'mort' | 'reforme'>('mort');
  const [n, setN] = useState('');
  const [cause, setCause] = useState('');
  const [erreur, setErreur] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    const nb = Math.floor(nombre(n));
    if (nb <= 0) return;
    if (nb > effectif) {
      setErreur(`Impossible : il ne reste que ${fmtInt(effectif)} poules.`);
      return;
    }
    await enregistrer('mortalite', { bandeId, date, nombre: nb, type, cause: cause.trim() } satisfies Mortalite);
    onFini(type === 'mort' ? 'Mortalité enregistrée' : 'Réforme enregistrée');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Mortalité / réforme</h3>
      <Choix label="Type" value={type} onChange={setType} options={[['mort', 'Poules mortes'], ['reforme', 'Poules réformées (sorties)']]} />
      <Champ label="Nombre de poules" type="number" min={1} value={n} onChange={setN} required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Champ label="Cause (facultatif)" value={cause} onChange={setCause} placeholder="Ex. : maladie, chaleur" />
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function AlimentForm({ bandeId, onFini }: FormProps) {
  const articles = useItems<Article>('article').filter((a) => a.categorie === 'aliment');
  const achats = useItems<Achat>('achat');
  const mvts = useItems<StockMvt>('stock_mvt');
  const [date, setDate] = useState(today());
  const [type, setType] = useState<Aliment['type']>('ponte');
  const [kg, setKg] = useState('');
  const [articleId, setArticleId] = useState('');
  const article = articles.find((a) => a.id === articleId);
  async function envoyer(e: Event) {
    e.preventDefault();
    const q = nombre(kg);
    if (q <= 0) return;
    const unites = article ? q / article.kgParUnite : 0;
    if (article) {
      const stock = mvts.filter((m) => m.articleId === article.id).reduce((sum, m) => (m.type === 'sortie' ? sum - m.quantite : sum + m.quantite), 0);
      if (unites > stock && !window.confirm(`Le stock de ${article.nom} deviendrait négatif. Continuer ?`)) return;
    }
    const alimentId = newId();
    const cout = article ? Math.round(unites * coutMoyen(article.id, achats)) : 0;
    await saveRecord('aliment', alimentId, { bandeId, date, kg: q, type, ...(article ? { articleId: article.id, cout } : {}) } satisfies Aliment);
    if (article) {
      await saveRecord('stock_mvt', newId(), { articleId: article.id, date, type: 'sortie', quantite: unites, peremption: '', achatId: '', alimentId, note: '' } satisfies StockMvt);
    }
    onFini('Aliment enregistré');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Aliment distribué</h3>
      <Choix label="Type d'aliment" value={type} onChange={setType} options={[['demarrage', 'Démarrage'], ['croissance', 'Croissance'], ['ponte', 'Ponte']]} />
      <Choix label="Pris dans le stock" value={articleId} onChange={setArticleId} options={[['', 'Sans suivi de stock'], ...articles.map((a) => [a.id, a.nom] as [string, string])]} />
      <Champ label="Quantité distribuée" type="number" min={0} value={kg} onChange={setKg} suffixe="kg" required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function SanteForm({ bandeId, onFini }: FormProps) {
  const [date, setDate] = useState(today());
  const [type, setType] = useState<Sante['type']>('vaccin');
  const [produit, setProduit] = useState('');
  const [note, setNote] = useState('');
  const [rappel, setRappel] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!produit.trim()) return;
    await enregistrer('sante', { bandeId, date, type, produit: produit.trim(), note: note.trim(), rappel } satisfies Sante);
    onFini('Soin enregistré');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Santé</h3>
      <Choix label="Type" value={type} onChange={setType} options={[['vaccin', 'Vaccin'], ['traitement', 'Traitement'], ['autre', 'Autre']]} />
      <Champ label="Produit ou maladie" value={produit} onChange={setProduit} required placeholder="Ex. : Newcastle" />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Champ label="Prochain rappel (facultatif)" type="date" value={rappel} onChange={setRappel} />
      <Champ label="Note (facultatif)" value={note} onChange={setNote} />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}
