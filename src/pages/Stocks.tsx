import { useState } from 'preact/hooks';
import { dataOf, go, useItems, useRole, type Item } from '../hooks';
import { peut, peutEcrire } from '../droits';
import { fmtDate, fmtFcfa, fmtQte, today } from '../format';
import { gestionStock } from '../gestion/calculs';
import { alertesArticle, coutMoyen, lotsRestants, stockArticle } from '../gestion/calculs';
import { ACTIVITES, COMPTES, type Achat, type Activite, type Article, type Compte, type Fournisseur, type StockMvt } from '../gestion/types';
import { newId, saveRecord } from '../sync';
import { Alertes, Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';
import { ActionsFiche } from '../ActionsFiche';
import { nomDejaPris } from '../integrite';
import { aTag, ChampEtiquettes, EtiquettesFiche, FiltreEtiquettes, Pastilles } from '../etiquettes';

const CATEGORIES: Array<[Article['categorie'], string]> = [
  ['aliment', 'Aliment'],
  ['medicament', 'Produit vétérinaire (médicament, vaccin)'],
  ['autre', 'Autre']
];

export const NOM_CATEGORIE_ARTICLE: Record<Article['categorie'], string> = { aliment: 'Aliments', medicament: 'Produits vétérinaires', autre: 'Autres articles' };
export const ICONE_CATEGORIE_ARTICLE: Record<Article['categorie'], string> = { aliment: '🌽', medicament: '💊', autre: '📦' };

export function Stocks() {
  const articles = useItems<Article>('article');
  const mvts = useItems<StockMvt>('stock_mvt');
  const achats = useItems<Achat>('achat');
  const [mode, setMode] = useState<'article' | 'achat' | null>(null);
  const [categorieNouvelle, setCategorieNouvelle] = useState<Article['categorie']>('aliment');
  const [filtre, setFiltre] = useState<'tous' | Article['categorie']>('tous');
  const [etiquette, setEtiquette] = useState('');
  const [message, setMessage] = useState('');
  const role = useRole();
  const argent = peut(role, 'argent');
  const fini = (m: string) => { setMode(null); setMessage(m); };
  const mvtsDe = (id: string) => mvts.filter((m) => m.articleId === id);
  const alertes = articles.flatMap((a) => alertesArticle(a, mvtsDe(a.id), today()));
  const categories: Array<Article['categorie']> = ['aliment', 'medicament', 'autre'];
  const aCommander = articles.map((a) => ({ a, g: gestionStock(a, mvtsDe(a.id), today()) })).filter((x) => x.g.statut === 'rupture' || x.g.statut === 'bas' || x.g.statut === 'a_commander');
  const nb = (c: Article['categorie']) => articles.filter((a) => a.categorie === c).length;
  const valeur = articles.reduce((s, a) => s + Math.max(0, stockArticle(mvtsDe(a.id))) * coutMoyen(a.id, achats), 0);
  const nouveau = (c: Article['categorie']) => { setCategorieNouvelle(c); setMode('article'); };

  const carte = (a: Item<Article>) => {
    const stock = stockArticle(mvtsDe(a.id));
    const al = alertesArticle(a, mvtsDe(a.id), today());
    const proche = lotsRestants(mvtsDe(a.id)).filter((l) => l.peremption).sort((x, y) => x.peremption.localeCompare(y.peremption))[0];
    return (
      <li key={a.id}>
        <a class="carte" href={`#/stocks/${a.id}`}>
          <strong>{ICONE_CATEGORIE_ARTICLE[a.categorie]} {a.nom}</strong>
          <span>
            {fmtQte(stock)} {a.unite}
            {a.seuil > 0 ? ` · alerte à ${a.seuil}` : ''}
            {proche ? ` · périme le ${fmtDate(proche.peremption)}` : ''}
          </span>
          <Pastilles tags={a.tags} />
          {al.length > 0 && <span class="alerte-mini">⚠ {al.length} alerte(s)</span>}
        </a>
      </li>
    );
  };

  return (
    <section>
      <h2>Stocks</h2>
      <p class="intro">Aliments, produits vétérinaires et autres articles. Les entrées viennent des achats ; les sorties, de l'alimentation des animaux, des soins ou d'une saisie à la main.</p>
      <Alertes liste={alertes} />
      {message && <p class="succes" role="status">{message}</p>}
      <div class="stats">
        <Stat valeur={articles.length} label="articles suivis" />
        {categories.map((c) => <Stat key={c} valeur={nb(c)} label={`${ICONE_CATEGORIE_ARTICLE[c]} ${NOM_CATEGORIE_ARTICLE[c].toLowerCase()}`} />)}
        {argent && valeur > 0 && <Stat valeur={fmtFcfa(valeur)} label="Valeur du stock (au coût moyen d'achat)" />}
      </div>
      {!mode && (
        <div class="actions">
          {peut(role, 'achats') && <button class="principal" type="button" onClick={() => setMode('achat')}><span class="e">🛒</span>Nouvel achat</button>}
          {peutEcrire(role, 'article') && <button class="principal" type="button" onClick={() => nouveau('medicament')}><span class="e">💊</span>Produit vétérinaire</button>}
          {peutEcrire(role, 'article') && <button class="principal" type="button" onClick={() => nouveau('aliment')}><span class="e">🌽</span>Aliment</button>}
          {peutEcrire(role, 'article') && <button class="secondaire" type="button" onClick={() => nouveau('autre')}>Autre article</button>}
        </div>
      )}
      {mode === 'article' && <ArticleForm categorieInitiale={categorieNouvelle} onFini={fini} />}
      {mode === 'achat' && <AchatForm onFini={fini} />}

      <FiltreEtiquettes presentes={articles.flatMap((a) => a.tags ?? [])} choisie={etiquette} onChange={setEtiquette} />
      {aCommander.length > 0 && (
        <>
          <h3>🛒 À commander</h3>
          <ul>
            {aCommander.map(({ a, g }) => (
              <li key={a.id}>
                <a class="carte" href={`#/stocks/${a.id}`}>
                  <strong>{a.nom}</strong>
                  <span>{g.statut === 'rupture' ? 'Rupture de stock' : g.statut === 'bas' ? `Stock bas : ${fmtQte(g.stock)} ${a.unite} (minimum ${fmtQte(a.seuil)})` : `Il en reste pour ${g.couvertureJours !== null ? Math.floor(g.couvertureJours) : '?'} jour(s), livraison en ${a.delaiReappro} j`}</span>
                  {g.aCommander > 0 && <span class="alerte-mini">Commande conseillée : {fmtQte(g.aCommander)} {a.unite}</span>}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <div class="puces">
        <button type="button" class={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>Tous ({articles.length})</button>
        {categories.map((c) => <button key={c} type="button" class={filtre === c ? 'actif' : ''} onClick={() => setFiltre(c)}>{ICONE_CATEGORIE_ARTICLE[c]} {NOM_CATEGORIE_ARTICLE[c]} ({nb(c)})</button>)}
      </div>

      {categories.filter((c) => filtre === 'tous' || filtre === c).map((c) => (
        <div key={c}>
          <h3>{ICONE_CATEGORIE_ARTICLE[c]} {NOM_CATEGORIE_ARTICLE[c]}</h3>
          <ul>
            {articles.filter((a) => a.categorie === c && (!etiquette || aTag(a, etiquette))).sort((x, y) => x.nom.localeCompare(y.nom, 'fr')).map(carte)}
            {nb(c) === 0 && !mode && (
              <li class="vide">
                {c === 'medicament' ? 'Aucun produit vétérinaire. Ajoutez vos vaccins et médicaments : leur stock baissera à chaque soin, et la péremption sera surveillée.' : c === 'aliment' ? 'Aucun aliment en stock.' : 'Aucun autre article.'}
              </li>
            )}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ArticleForm({ onFini, categorieInitiale = 'aliment' }: { onFini: (m: string) => void; categorieInitiale?: Article['categorie'] }) {
  const articlesExistants = useItems<Article>('article');
  const [nom, setNom] = useState('');
  const [unite, setUnite] = useState(categorieInitiale === 'aliment' ? 'sac' : categorieInitiale === 'medicament' ? 'flacon' : 'unité');
  const [categorie, setCategorie] = useState<Article['categorie']>(categorieInitiale);
  const [seuil, setSeuil] = useState('');
  const [stockMax, setStockMax] = useState('');
  const [delai, setDelai] = useState('');
  const [erreur, setErreur] = useState('');
  const [kg, setKg] = useState('50');
  const [tags, setTags] = useState<string[]>([]);
  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    if (!nom.trim() || !unite.trim()) return;
    if (nombre(stockMax) > 0 && nombre(stockMax) < nombre(seuil)) return setErreur('Le stock maximum doit être supérieur au stock minimum.');
    if (categorie === 'aliment' && nombre(kg) <= 0) return setErreur('Indiquez le poids d’une unité (par exemple 50 kg pour un sac, 0,5 pour un demi-kilo).');
    if (articlesExistants.some((x) => x.nom.trim().toLowerCase() === nom.trim().toLowerCase())) return setErreur('Un article porte déjà ce nom.');
    await saveRecord('article', newId(), { nom: nom.trim(), unite: unite.trim(), categorie, seuil: nombre(seuil), kgParUnite: categorie === 'aliment' ? nombre(kg) : 1, ...(nombre(stockMax) > 0 ? { stockMax: nombre(stockMax) } : {}), ...(nombre(delai) > 0 ? { delaiReappro: Math.round(nombre(delai)) } : {}), ...(tags.length ? { tags } : {}) } satisfies Article);
    onFini('Article créé');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouvel article</h3>
      <Choix label="Catégorie" value={categorie} onChange={(c) => { setCategorie(c); setUnite(c === 'aliment' ? 'sac' : c === 'medicament' ? 'flacon' : 'unité'); }} options={CATEGORIES} />
      <Champ label="Nom" value={nom} onChange={setNom} required placeholder={categorie === 'aliment' ? 'Ex. : Aliment ponte' : 'Ex. : Vaccin Newcastle'} />
      <Champ label="Unité de stock" value={unite} onChange={setUnite} required placeholder="sac, flacon, dose…" />
      {categorie === 'aliment' && <Champ label="Poids d'une unité (0,5 = un demi-kilo)" type="number" min={0} value={kg} onChange={setKg} suffixe="kg" />}
      <Champ label="Stock minimum (alerte)" type="number" min={0} value={seuil} onChange={setSeuil} suffixe={unite} />
      <p class="intro">Quand il en reste autant ou moins, l'application vous prévient (c'est votre stock de sécurité).</p>
      <Champ label="Stock maximum (facultatif)" type="number" min={0} value={stockMax} onChange={setStockMax} suffixe={unite} />
      <Champ label="Délai de livraison (facultatif)" type="number" min={0} value={delai} onChange={setDelai} suffixe="jours" />
      <p class="intro">Avec le délai, l'application calcule le « point de commande » : le niveau où il faut commander pour ne pas tomber en rupture avant la livraison.</p>
      {erreur && <p class="erreur">{erreur}</p>}
      <ChampEtiquettes valeur={tags} onChange={setTags} />
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
  const g = gestionStock(a, mvts, today());
  const lots = lotsRestants(mvts).filter((l) => l.peremption);
  const liste = [...mvts].sort((x, y) => y.date.localeCompare(x.date) || y.updatedAt - x.updatedAt).slice(0, 40);
  const fini = (m: string) => { setMode(null); setMessage(m); };
  const libelle = (m: StockMvt) => m.type === 'entree' ? 'Entrée' : m.type === 'sortie' ? (m.alimentId ? (a.categorie === 'medicament' ? 'Utilisé pour un soin' : 'Aliment distribué') : 'Sortie') : 'Ajustement d’inventaire';

  return (
    <section>
      <Retour vers="/stocks" texte="Stocks" />
      <h2>{a.nom}</h2>
      <EtiquettesFiche collection="article" item={a} />
      <ActionsFiche collection="article" item={a} nom={a.nom} retour="/stocks"
        champs={[
          { cle: 'nom', label: 'Nom', type: 'texte', requis: true },
          { cle: 'unite', label: 'Unité de stock', type: 'texte', requis: true, verrou: (g, id) => (g.stock_mvt ?? []).some((m) => m.articleId === id) ? 'des mouvements existent déjà' : null },
          { cle: 'categorie', label: 'Catégorie', type: 'choix', options: CATEGORIES, verrou: (g, id) => (g.stock_mvt ?? []).some((m) => m.articleId === id) ? 'des mouvements existent déjà' : null },
          ...(a.categorie === 'aliment' ? [{ cle: 'kgParUnite', label: 'Poids d’une unité', type: 'nombre' as const, suffixe: 'kg', verrou: (g: Record<string, Array<Record<string, unknown>>>, id: string) => (g.stock_mvt ?? []).some((m) => m.articleId === id) ? 'des mouvements existent déjà' : null }] : []),
          { cle: 'seuil', label: 'Stock minimum (alerte)', type: 'nombre', suffixe: a.unite },
          { cle: 'stockMax', label: 'Stock maximum (facultatif)', type: 'nombre', suffixe: a.unite },
          { cle: 'delaiReappro', label: 'Délai de livraison (facultatif)', type: 'nombre', suffixe: 'jours', entier: true }
        ]}
        valider={(p, g, id) => {
          if (nomDejaPris(g, 'article', 'nom', String(p.nom ?? ''), id)) return 'Un autre article porte déjà ce nom.';
          if (p.kgParUnite !== undefined && Number(p.kgParUnite) <= 0) return 'Le poids d’une unité doit être supérieur à 0.';
          if (Number(p.stockMax) > 0 && Number(p.stockMax) < Number(p.seuil ?? a.seuil)) return 'Le stock maximum doit être supérieur au stock minimum.';
          return null;
        }} />
      <Alertes liste={alertesArticle(a, mvts, today())} />
      <div class="stats">
        <Stat valeur={`${fmtQte(stock)} ${a.unite}`} label="En stock" />
        {g.consoJour > 0 && <Stat valeur={`${fmtQte(g.consoJour)} ${a.unite}`} label="Consommation moyenne par jour (30 j)" />}
        {g.couvertureJours !== null && <Stat valeur={`${Math.floor(g.couvertureJours)} j`} label="Il en reste pour (au rythme actuel)" />}
        {a.seuil > 0 && <Stat valeur={`${fmtQte(a.seuil)} ${a.unite}`} label="Stock minimum" />}
        {(a.delaiReappro ?? 0) > 0 && <Stat valeur={`${fmtQte(g.pointCommande)} ${a.unite}`} label={`Point de commande (livraison en ${a.delaiReappro} j)`} />}
        {(a.stockMax ?? 0) > 0 && <Stat valeur={`${fmtQte(a.stockMax ?? 0)} ${a.unite}`} label="Stock maximum" />}
        {g.aCommander > 0 && <Stat valeur={`${fmtQte(g.aCommander)} ${a.unite}`} label="À commander (conseillé)" />}
        {a.categorie === 'aliment' && <Stat valeur={`${fmtQte(stock * a.kgParUnite)} kg`} label={`(1 ${a.unite} = ${fmtQte(a.kgParUnite)} kg)`} />}
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
      {lots.length > 0 && (<><h3>Dates de péremption</h3><ul>{lots.map((l, i) => <li key={i}><div class="ligne"><span>{fmtQte(l.restant)} {a.unite}</span><small>périme le {fmtDate(l.peremption)}</small></div></li>)}</ul></>)}
      <h3>Mouvements</h3>
      <ul>
        {liste.map((m) => (
          <li key={m.id}>
            <div class="ligne"><span>{libelle(m)} : {m.type === 'ajustement' && m.quantite > 0 ? '+' : ''}{fmtQte(m.quantite)} {a.unite}{m.note ? ` (${m.note})` : ''}</span><small>{fmtDate(m.date)}</small></div>
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
    if (n > stock && !window.confirm(`Le stock deviendrait négatif (${fmtQte(stock - n)} ${article.unite}). Continuer ?`)) return;
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
      <p class="intro">Stock calculé : {fmtQte(stock)} {article.unite}. Entrez ce que vous comptez vraiment.</p>
      <Champ label="Quantité comptée" type="number" min={0} value={compte} onChange={setCompte} suffixe={article.unite} required />
      <Boutons texte="Corriger le stock" onAnnuler={() => onFini('')} />
    </form>
  );
}

export { go };
