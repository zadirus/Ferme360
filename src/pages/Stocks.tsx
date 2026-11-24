import { useState } from 'preact/hooks';
import { dataOf, go, useItems, useRole, type Item } from '../hooks';
import { peut, peutEcrire } from '../droits';
import { fmtDate, fmtDec, fmtFcfa, today } from '../format';
import { alertesArticle, lotsRestants, stockArticle } from '../gestion/calculs';
import { ACTIVITES, COMPTES, type Achat, type Activite, type Article, type Compte, type Fournisseur, type StockMvt } from '../gestion/types';
import { newId, saveRecord } from '../sync';
import { Alertes, Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';

const CATEGORIES: Array<[Article['categorie'], string]> = [
  ['aliment', 'Aliment'],
  ['medicament', 'Médicament / vaccin'],
  ['autre', 'Autre']
];

export function Stocks() {
  const articles = useItems<Article>('article');
  const mvts = useItems<StockMvt>('stock_mvt');
  const [mode, setMode] = useState<'article' | 'achat' | null>(null);
  const [message, setMessage] = useState('');
  const role = useRole();
  const fini = (m: string) => { setMode(null); setMessage(m); };
  const mvtsDe = (id: string) => mvts.filter((m) => m.articleId === id);
  const alertes = articles.flatMap((a) => alertesArticle(a, mvtsDe(a.id), today()));

  return (
    <section>
      <h2>Stocks</h2>
      <p class="intro">Aliments et médicaments : entrées par les achats, sorties par l'alimentation des bandes ou à la main.</p>
      <Alertes liste={alertes} />
      {message && <p class="succes" role="status">{message}</p>}
      {!mode && peut(role, 'achats') && (
        <div class="actions">
          <button class="principal" type="button" onClick={() => setMode('achat')}><span class="e">🛒</span>Nouvel achat</button>
          <button class="principal" type="button" onClick={() => setMode('article')}><span class="e">📦</span>Nouvel article</button>
        </div>
      )}
      {mode === 'article' && <ArticleForm onFini={fini} />}
      {mode === 'achat' && <AchatForm onFini={fini} />}
      <h3>Articles en stock</h3>
      <ul>
        {articles.map((a) => {
          const stock = stockArticle(mvtsDe(a.id));
          const al = alertesArticle(a, mvtsDe(a.id), today());
          return (
            <li key={a.id}>
              <a class="carte" href={`#/stocks/${a.id}`}>
                <strong>{a.nom}</strong>
                <span>{fmtDec(stock, stock % 1 ? 1 : 0)} {a.unite}{a.seuil > 0 ? ` · alerte à ${a.seuil}` : ''}</span>
                {al.length > 0 && <span class="alerte-mini">⚠ {al.length} alerte(s)</span>}
              </a>
            </li>
          );
        })}
        {articles.length === 0 && !mode && <li class="vide">Aucun article. Créez « Aliment ponte » ou un vaccin.</li>}
      </ul>
    </section>
  );
}

function ArticleForm({ onFini }: { onFini: (m: string) => void }) {
  const [nom, setNom] = useState('');
  const [unite, setUnite] = useState('sac');
  const [categorie, setCategorie] = useState<Article['categorie']>('aliment');
  const [seuil, setSeuil] = useState('');
  const [kg, setKg] = useState('50');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!nom.trim() || !unite.trim()) return;
    await saveRecord('article', newId(), { nom: nom.trim(), unite: unite.trim(), categorie, seuil: nombre(seuil), kgParUnite: categorie === 'aliment' ? Math.max(0.001, nombre(kg)) : 1 } satisfies Article);
    onFini('Article créé');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouvel article</h3>
      <Choix label="Catégorie" value={categorie} onChange={(c) => { setCategorie(c); setUnite(c === 'aliment' ? 'sac' : c === 'medicament' ? 'flacon' : 'unité'); }} options={CATEGORIES} />
      <Champ label="Nom" value={nom} onChange={setNom} required placeholder={categorie === 'aliment' ? 'Ex. : Aliment ponte' : 'Ex. : Vaccin Newcastle'} />
      <Champ label="Unité de stock" value={unite} onChange={setUnite} required placeholder="sac, flacon, dose…" />
      {categorie === 'aliment' && <Champ label="Poids d'une unité" type="number" min={0} value={kg} onChange={setKg} suffixe="kg" />}
      <Champ label="Alerte quand il en reste" type="number" min={0} value={seuil} onChange={setSeuil} suffixe={unite} />
      <Boutons texte="Créer l'article" onAnnuler={() => onFini('')} />
    </form>
  );
}

export function AchatForm({ onFini }: { onFini: (m: string) => void }) {
  const articles = useItems<Article>('article');
  const fournisseurs = useItems<Fournisseur>('fournisseur');
  const [date, setDate] = useState(today());
  const [articleId, setArticleId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [quantite, setQuantite] = useState('');
  const [total, setTotal] = useState('');
  const [paye, setPaye] = useState<string | null>(null);
  const [compte, setCompte] = useState<Compte>('caisse');
  const [activite, setActivite] = useState<Activite>('poules');
  const [peremption, setPeremption] = useState('');
  const [fournisseurSel, setFournisseurSel] = useState('');
  const [nomF, setNomF] = useState('');
  const [telF, setTelF] = useState('');
  const [erreur, setErreur] = useState('');

  const article = articles.find((a) => a.id === articleId);
  const t = nombre(total);
  const montantPaye = paye === null ? t : nombre(paye);

  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    const q = nombre(quantite);
    if (t <= 0) return setErreur('Indiquez le prix total.');
    if (articleId && q <= 0) return setErreur('Indiquez la quantité achetée.');
    if (!articleId && !libelle.trim()) return setErreur('Indiquez ce que vous avez acheté.');
    if (montantPaye < 0 || montantPaye > t + 0.5) return setErreur('Le montant payé ne peut pas dépasser le total.');
    if (t - montantPaye > 0.5 && !fournisseurSel) return setErreur('Pour un achat à crédit, choisissez le fournisseur.');
    if (fournisseurSel === '__nouveau' && !nomF.trim()) return setErreur('Indiquez le nom du fournisseur.');
    let fid = fournisseurSel === '__nouveau' ? newId() : fournisseurSel;
    if (fournisseurSel === '__nouveau') await saveRecord('fournisseur', fid, { nom: nomF.trim(), telephone: telF.trim() } satisfies Fournisseur);
    const achatId = newId();
    await saveRecord('achat', achatId, {
      date, fournisseurId: fid, activite, articleId, libelle: articleId ? (article?.nom ?? '') : libelle.trim(),
      quantite: articleId ? q : 0, total: t, montantPaye, compte, peremption: article?.categorie === 'medicament' ? peremption : ''
    } satisfies Achat);
    if (articleId) {
      await saveRecord('stock_mvt', newId(), { articleId, date, type: 'entree', quantite: q, peremption: article?.categorie === 'medicament' ? peremption : '', achatId, alimentId: '', note: '' } satisfies StockMvt);
    }
    onFini(`Achat enregistré (${fmtFcfa(t)})`);
  }

  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouvel achat</h3>
      <Choix label="Article du stock" value={articleId} onChange={setArticleId}
        options={[['', 'Autre achat (sans suivi de stock)'], ...articles.map((a) => [a.id, a.nom] as [string, string])]} />
      {!articleId && <Champ label="Ce que vous avez acheté" value={libelle} onChange={setLibelle} placeholder="Ex. : abreuvoirs, poussins" />}
      {articleId && <Champ label="Quantité achetée" type="number" min={0} value={quantite} onChange={setQuantite} suffixe={article?.unite} />}
      {article?.categorie === 'medicament' && <Champ label="Date de péremption" type="date" value={peremption} onChange={setPeremption} />}
      <Champ label="Prix total" type="number" min={0} value={total} onChange={setTotal} suffixe="FCFA" required />
      <Champ label="Payé maintenant" type="number" min={0} value={paye === null ? total : paye} onChange={setPaye} suffixe="FCFA" />
      <Choix label="Payé avec" value={compte} onChange={setCompte} options={COMPTES} />
      <Choix label="Fournisseur" value={fournisseurSel} onChange={setFournisseurSel}
        options={[['', 'Non précisé'], ...fournisseurs.map((f) => [f.id, f.nom] as [string, string]), ['__nouveau', '+ Nouveau fournisseur…']]} />
      {fournisseurSel === '__nouveau' && (<><Champ label="Nom du fournisseur" value={nomF} onChange={setNomF} /><Champ label="Téléphone (facultatif)" value={telF} onChange={setTelF} /></>)}
      <Choix label="Activité concernée" value={activite} onChange={setActivite} options={ACTIVITES} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons texte="Enregistrer l'achat" onAnnuler={() => onFini('')} />
    </form>
  );
}

export function ArticleDetail({ id }: { id: string }) {
  const articles = useItems<Article>('article');
  const tous = useItems<StockMvt>('stock_mvt');
  const [mode, setMode] = useState<'sortie' | 'inventaire' | null>(null);
  const [message, setMessage] = useState('');
  const a = articles.find((x) => x.id === id);
  if (!a) return (<section><Retour vers="/stocks" texte="Stocks" /><p class="intro">Article introuvable.</p></section>);
  const mvts = tous.filter((m) => m.articleId === id);
  const stock = stockArticle(mvts);
  const lots = lotsRestants(mvts).filter((l) => l.peremption);
  const liste = [...mvts].sort((x, y) => y.date.localeCompare(x.date) || y.updatedAt - x.updatedAt).slice(0, 40);
  const fini = (m: string) => { setMode(null); setMessage(m); };
  const libelle = (m: StockMvt) => m.type === 'entree' ? 'Entrée' : m.type === 'sortie' ? (m.alimentId ? 'Aliment distribué' : 'Sortie') : 'Ajustement d’inventaire';

  return (
    <section>
      <Retour vers="/stocks" texte="Stocks" />
      <h2>{a.nom}</h2>
      <Alertes liste={alertesArticle(a, mvts, today())} />
      <div class="stats">
        <Stat valeur={`${fmtDec(stock, stock % 1 ? 1 : 0)} ${a.unite}`} label="En stock" />
        {a.categorie === 'aliment' && <Stat valeur={`${fmtDec(stock * a.kgParUnite, 0)} kg`} label={`(1 ${a.unite} = ${fmtDec(a.kgParUnite, 0)} kg)`} />}
      </div>
      {message && <p class="succes" role="status">{message}</p>}
      {!mode && (
        <div class="actions">
          <button class="principal" type="button" onClick={() => setMode('sortie')}><span class="e">📤</span>Sortie</button>
          <button class="principal" type="button" onClick={() => setMode('inventaire')}><span class="e">🔢</span>Compter</button>
        </div>
      )}
      {mode === 'sortie' && <SortieArticle article={a} stock={stock} onFini={fini} />}
      {mode === 'inventaire' && <InventaireArticle article={a} stock={stock} onFini={fini} />}
      {lots.length > 0 && (<><h3>Dates de péremption</h3><ul>{lots.map((l, i) => <li key={i}><div class="ligne"><span>{fmtDec(l.restant, l.restant % 1 ? 1 : 0)} {a.unite}</span><small>périme le {fmtDate(l.peremption)}</small></div></li>)}</ul></>)}
      <h3>Mouvements</h3>
      <ul>
        {liste.map((m) => (
          <li key={m.id}>
            <div class="ligne"><span>{libelle(m)} : {m.type === 'ajustement' && m.quantite > 0 ? '+' : ''}{fmtDec(m.quantite, m.quantite % 1 ? 1 : 0)} {a.unite}{m.note ? ` (${m.note})` : ''}</span><small>{fmtDate(m.date)}</small></div>
            {!m.achatId && !m.alimentId && (
              <button type="button" class="lien" onClick={async () => { if (window.confirm('Supprimer ce mouvement ?')) await saveRecord('stock_mvt', m.id, dataOf(m), true); }}>Supprimer</button>
            )}
          </li>
        ))}
        {liste.length === 0 && <li class="vide">Aucun mouvement. Faites un achat pour alimenter ce stock.</li>}
      </ul>
    </section>
  );
}

function SortieArticle({ article, stock, onFini }: { article: Item<Article>; stock: number; onFini: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  async function envoyer(e: Event) {
    e.preventDefault();
    const n = nombre(q);
    if (n <= 0) return;
    if (n > stock && !window.confirm(`Le stock deviendrait négatif (${fmtDec(stock - n, 1)} ${article.unite}). Continuer ?`)) return;
    await saveRecord('stock_mvt', newId(), { articleId: article.id, date, type: 'sortie', quantite: n, peremption: '', achatId: '', alimentId: '', note: note.trim() } satisfies StockMvt);
    onFini('Sortie enregistrée');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Sortie de stock</h3>
      <Champ label="Quantité" type="number" min={0} value={q} onChange={setQ} suffixe={article.unite} required />
      <Champ label="Motif (facultatif)" value={note} onChange={setNote} placeholder="Ex. : perte, don, utilisé" />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function InventaireArticle({ article, stock, onFini }: { article: Item<Article>; stock: number; onFini: (m: string) => void }) {
  const [compte, setCompte] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (compte.trim() === '') return;
    const ecart = Math.max(0, nombre(compte)) - stock;
    if (Math.abs(ecart) < 1e-9) return onFini('Le stock est exact');
    await saveRecord('stock_mvt', newId(), { articleId: article.id, date: today(), type: 'ajustement', quantite: ecart, peremption: '', achatId: '', alimentId: '', note: 'inventaire' } satisfies StockMvt);
    onFini('Stock corrigé');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Compter le stock</h3>
      <p class="intro">Stock calculé : {fmtDec(stock, 1)} {article.unite}. Entrez ce que vous comptez vraiment.</p>
      <Champ label="Quantité comptée" type="number" min={0} value={compte} onChange={setCompte} suffixe={article.unite} required />
      <Boutons texte="Corriger le stock" onAnnuler={() => onFini('')} />
    </form>
  );
}

export { go };
