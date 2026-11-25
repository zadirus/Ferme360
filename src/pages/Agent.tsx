// Interface simplifiée de l'agent d'élevage : gros boutons, une saisie = un écran, aucun menu à chercher.
import { useState } from 'preact/hooks';
import { peutSupprimerSaisie } from '../droits';
import { dataOf, go, useItems, useRole, type Item } from '../hooks';
import { fmtInt, fmtQte, today } from '../format';
import { coutMoyen } from '../gestion/calculs';
import type { Achat, Article, StockMvt } from '../gestion/types';
import { effectifActuel } from '../poules/calculs';
import type { Aliment, Bande, Mortalite, Ramassage } from '../poules/types';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import type { Pesee } from '../ruminants/types';
import { getUser } from '../session';
import { newId, saveRecord } from '../sync';
import { useAlertes } from '../useAlertes';
import { Alertes } from '../ui';

// ---------- éléments communs ----------

function Compteur({ label, valeur, onChange, pas = 1, decimal = false, suffixe }: { label: string; valeur: number; onChange: (n: number) => void; pas?: number; decimal?: boolean; suffixe?: string }) {
  const borne = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  return (
    <div class="compteur">
      <span class="libelle">{label}</span>
      <div class="compteur-ligne">
        <button type="button" class="moins" aria-label={`Moins ${label}`} onClick={() => onChange(borne(valeur - pas))}>−</button>
        <span class="champ-gros">
          <input
            aria-label={label}
            type="number"
            min={0}
            step="any"
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={valeur === 0 ? '' : valeur}
            placeholder="0"
            onInput={(e) => onChange(borne(Number(e.currentTarget.value.replace(',', '.')) || 0))}
          />
          {suffixe && <em>{suffixe}</em>}
        </span>
        <button type="button" class="plus" aria-label={`Plus ${label}`} onClick={() => onChange(borne(valeur + pas))}>+</button>
      </div>
    </div>
  );
}

function Pastilles<T extends string>({ valeur, options, onChange, label }: { valeur: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div class="choix-gros" role="group" aria-label={label}>
      <span class="libelle">{label}</span>
      <div class="choix-ligne">
        {options.map(([v, t]) => <button type="button" key={v} class={valeur === v ? 'actif' : ''} aria-pressed={valeur === v} onClick={() => onChange(v)}>{t}</button>)}
      </div>
    </div>
  );
}

function Fait({ titre, detail, encore }: { titre: string; detail: string; encore: string }) {
  return (
    <section class="fait">
      <div class="coche" aria-hidden="true">✓</div>
      <h2>{titre}</h2>
      <p class="intro">{detail}</p>
      <button class="principal gros" type="button" onClick={() => go(encore)}>Faire une autre saisie</button>
      <button class="secondaire gros" type="button" onClick={() => go('/')}>Retour à l’accueil</button>
    </section>
  );
}

const Titre = ({ icone, texte }: { icone: string; texte: string }) => (
  <>
    <a class="retour" href="#/">← Accueil</a>
    <h2 class="titre-saisie"><span aria-hidden="true">{icone}</span> {texte}</h2>
  </>
);

// choix de la bande : automatique s'il n'y en a qu'une
function useBande() {
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const morts = useItems<Mortalite>('mortalite');
  const [choix, setChoix] = useState('');
  const bande = bandes.length === 1 ? bandes[0] : bandes.find((b) => b.id === choix);
  const selecteur = bandes.length > 1 ? (
    <Pastilles label="Quelle bande ?" valeur={choix} options={bandes.map((b) => [b.id, b.nom] as [string, string])} onChange={setChoix} />
  ) : null;
  return { bandes, bande, selecteur, effectif: bande ? effectifActuel(bande, morts.filter((m) => m.bandeId === bande.id)) : 0 };
}

const AucuneBande = () => <p class="intro">Aucune bande de poules n’est enregistrée. Demandez au gérant d’en créer une.</p>;

// ---------- accueil ----------

export function AccueilAgent() {
  const role = useRole();
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const morts = useItems<Mortalite>('mortalite');
  const ram = useItems<Ramassage>('ramassage');
  const aliments = useItems<Aliment>('aliment');
  const pesees = useItems<Pesee>('pesee');
  const alertes = useAlertes();
  const moi = getUser()?.name;
  const auj = today();
  const prenom = (moi ?? '').split(' ')[0];
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const oeufsAuj = ram.filter((r) => r.date === auj).reduce((s, r) => s + r.bons + r.feles + r.casses, 0);
  const effectif = bandes.reduce((s, b) => s + effectifActuel(b, morts.filter((m) => m.bandeId === b.id)), 0);
  const nomBande = (id: string) => bandes.find((b) => b.id === id)?.nom ?? 'Bande';

  type Ligne = { cle: string; texte: string; maj: number; auteur?: string; collection: string; item: Item<object> };
  const recents = (): Ligne[] => [
    ...ram.filter((r) => r.date === auj).map((r) => ({ cle: r.id, texte: `🥚 ${fmtInt(r.bons)} bons œufs · ${nomBande(r.bandeId)}`, maj: r.updatedAt, auteur: r.author, collection: 'ramassage', item: r })),
    ...morts.filter((r) => r.date === auj).map((r) => ({ cle: r.id, texte: `💀 ${fmtInt(r.nombre)} poule(s) · ${nomBande(r.bandeId)}`, maj: r.updatedAt, auteur: r.author, collection: 'mortalite', item: r })),
    ...aliments.filter((r) => r.date === auj).map((r) => ({ cle: r.id, texte: `🌾 ${fmtQte(r.kg)} kg d’aliment · ${nomBande(r.bandeId)}`, maj: r.updatedAt, auteur: r.author, collection: 'aliment', item: r })),
    ...pesees.filter((r) => r.date === auj).map((r) => ({ cle: r.id, texte: `⚖️ Pesée ${fmtQte(r.poids)} kg`, maj: r.updatedAt, auteur: r.author, collection: 'pesee', item: r }))
  ].sort((a, b) => b.maj - a.maj);
  const lignes = recents();

  const bouton = (href: string, ico: string, texte: string, classe = '') => (
    <li><a class={`gros-bouton ${classe}`} href={`#${href}`}><span class="ico" aria-hidden="true">{ico}</span><span>{texte}</span></a></li>
  );

  return (
    <section class="agent">
      <div class="salut">
        <strong>Bonjour{prenom ? `, ${prenom}` : ''}</strong>
        <span>{dateLongue}</span>
      </div>
      <Alertes liste={alertes.map((a) => a.texte)} />
      <ul class="gros-boutons">
        {bouton('/saisie/oeufs', '🥚', 'Ramasser les œufs', 'oeuf')}
        {bouton('/saisie/deces', '💀', 'Signaler un décès', 'deces')}
        {bouton('/saisie/aliment', '🌾', 'Distribuer l’aliment', 'aliment')}
        {bouton('/saisie/pesee', '⚖️', 'Peser un animal', 'pesee')}
        {bouton('/carnet', '📒', 'Ajouter une note', 'note')}
        {bouton('/elevage', '🐑', 'Mes animaux et poules')}
      </ul>

      <div class="resume-jour">
        <div><strong>{fmtInt(oeufsAuj)}</strong><span>œufs ramassés aujourd’hui</span></div>
        <div><strong>{fmtInt(effectif)}</strong><span>poules présentes</span></div>
      </div>

      <h3>Ce que j’ai saisi aujourd’hui</h3>
      <ul class="saisies-jour">
        {lignes.map((l) => (
          <li key={l.cle}>
            <span>{l.texte}</span>
            {peutSupprimerSaisie(role, l.maj, l.auteur, moi) && (
              <button type="button" class="lien" onClick={async () => { if (window.confirm('Annuler cette saisie ?')) await saveRecord(l.collection, l.cle, dataOf(l.item), true); }}>Annuler</button>
            )}
          </li>
        ))}
        {lignes.length === 0 && <li class="vide">Rien de saisi aujourd’hui.</li>}
      </ul>
      <p class="intro petit-texte">Une erreur ? Vous pouvez annuler votre saisie pendant 2 heures. Après, demandez au gérant.</p>
    </section>
  );
}

// ---------- saisies ----------

export function SaisieOeufs() {
  const { bandes, bande, selecteur } = useBande();
  const [bons, setBons] = useState(0);
  const [feles, setFeles] = useState(0);
  const [casses, setCasses] = useState(0);
  const [fait, setFait] = useState('');
  if (fait) return <Fait titre="Ramassage enregistré" detail={fait} encore="/saisie/oeufs" />;
  const total = bons + feles + casses;
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!bande || total <= 0) return;
    await saveRecord('ramassage', newId(), { bandeId: bande.id, date: today(), bons, feles, casses } satisfies Ramassage);
    setFait(`${fmtInt(total)} œufs enregistrés pour ${bande.nom} (dont ${fmtInt(bons)} bons).`);
  }
  return (
    <section class="agent">
      <Titre icone="🥚" texte="Ramasser les œufs" />
      {bandes.length === 0 ? <AucuneBande /> : (
        <form class="formulaire" onSubmit={envoyer}>
          {selecteur}
          <Compteur label="Bons œufs" valeur={bons} onChange={setBons} pas={10} />
          <Compteur label="Œufs fêlés" valeur={feles} onChange={setFeles} />
          <Compteur label="Œufs cassés" valeur={casses} onChange={setCasses} />
          <p class="total-saisie">Total : <strong>{fmtInt(total)}</strong> œufs</p>
          <button class="principal gros" type="submit" disabled={!bande || total <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

const CAUSES: Array<[string, string]> = [['maladie', 'Maladie'], ['chaleur', 'Chaleur'], ['accident', 'Accident ou prédateur'], ['inconnue', 'Je ne sais pas']];

export function SaisieDeces() {
  const { bandes, bande, selecteur, effectif } = useBande();
  const [n, setN] = useState(0);
  const [cause, setCause] = useState('inconnue');
  const [fait, setFait] = useState('');
  const [erreur, setErreur] = useState('');
  if (fait) return <Fait titre="Décès enregistré" detail={fait} encore="/saisie/deces" />;
  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    if (!bande || n <= 0) return;
    if (n > effectif) return setErreur(`Impossible : il ne reste que ${fmtInt(effectif)} poules dans cette bande.`);
    await saveRecord('mortalite', newId(), { bandeId: bande.id, date: today(), nombre: n, type: 'mort', cause: CAUSES.find(([k]) => k === cause)?.[1] ?? '' } satisfies Mortalite);
    setFait(`${fmtInt(n)} poule(s) en moins dans ${bande.nom}. Il en reste ${fmtInt(effectif - n)}.`);
  }
  return (
    <section class="agent">
      <Titre icone="💀" texte="Signaler un décès" />
      {bandes.length === 0 ? <AucuneBande /> : (
        <form class="formulaire" onSubmit={envoyer}>
          {selecteur}
          <Compteur label="Combien de poules mortes ?" valeur={n} onChange={setN} />
          <Pastilles label="Cause probable" valeur={cause} options={CAUSES} onChange={setCause} />
          {erreur && <p class="erreur">{erreur}</p>}
          <button class="principal gros" type="submit" disabled={!bande || n <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

export function SaisieAliment() {
  const { bandes, bande, selecteur } = useBande();
  const articles = useItems<Article>('article').filter((a) => a.categorie === 'aliment');
  const achats = useItems<Achat>('achat');
  const mvts = useItems<StockMvt>('stock_mvt');
  const [kg, setKg] = useState(0);
  const [articleId, setArticleId] = useState('');
  const [fait, setFait] = useState('');
  if (fait) return <Fait titre="Aliment enregistré" detail={fait} encore="/saisie/aliment" />;
  const choisi = articleId || (articles.length === 1 ? articles[0].id : '');
  const article = articles.find((a) => a.id === choisi);
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!bande || kg <= 0) return;
    const unites = article ? kg / article.kgParUnite : 0;
    if (article) {
      const stock = mvts.filter((m) => m.articleId === article.id).reduce((s, m) => (m.type === 'sortie' ? s - m.quantite : s + m.quantite), 0);
      if (unites > stock && !window.confirm(`Le stock de ${article.nom} deviendrait négatif. Continuer ?`)) return;
    }
    const id = newId();
    const cout = article ? Math.round(unites * coutMoyen(article.id, achats)) : 0;
    await saveRecord('aliment', id, { bandeId: bande.id, date: today(), kg, type: 'ponte', ...(article ? { articleId: article.id, cout } : {}) } satisfies Aliment);
    if (article) await saveRecord('stock_mvt', newId(), { articleId: article.id, date: today(), type: 'sortie', quantite: unites, peremption: '', achatId: '', alimentId: id, note: '' } satisfies StockMvt);
    setFait(`${fmtQte(kg)} kg distribués à ${bande.nom}${article ? `, retirés du stock (${article.nom})` : ''}.`);
  }
  return (
    <section class="agent">
      <Titre icone="🌾" texte="Distribuer l’aliment" />
      {bandes.length === 0 ? <AucuneBande /> : (
        <form class="formulaire" onSubmit={envoyer}>
          {selecteur}
          <Compteur label="Quantité distribuée" valeur={kg} onChange={setKg} pas={0.5} decimal suffixe="kg" />
          <div class="rapides">
            {[5, 10, 25, 50].map((q) => <button type="button" key={q} onClick={() => setKg(q)}>{q} kg</button>)}
          </div>
          {articles.length > 1 && <Pastilles label="Quel aliment ?" valeur={choisi} options={articles.map((a) => [a.id, a.nom] as [string, string])} onChange={setArticleId} />}
          {article && <p class="intro petit-texte">Pris dans le stock : <strong>{article.nom}</strong></p>}
          <button class="principal gros" type="submit" disabled={!bande || kg <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

export function SaisiePesee() {
  const r = useRuminants();
  const [recherche, setRecherche] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [poids, setPoids] = useState(0);
  const [fait, setFait] = useState('');
  if (fait) return <Fait titre="Pesée enregistrée" detail={fait} encore="/saisie/pesee" />;
  const presents = r.animaux.filter((a) => r.statut(a.id) === 'present').sort((a, b) => a.boucle.localeCompare(b.boucle, 'fr', { numeric: true }));
  const q = recherche.trim().toLowerCase();
  const liste = presents.filter((a) => !q || `${a.boucle} ${a.nom}`.toLowerCase().includes(q)).slice(0, 12);
  const animal = presents.find((a) => a.id === animalId);
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!animal || poids <= 0 || poids > 2000) return;
    await saveRecord('pesee', newId(), { animalId: animal.id, date: today(), poids, methode: 'balance' } satisfies Pesee);
    setFait(`${libelleAnimal(animal)} : ${fmtQte(poids)} kg.`);
  }
  return (
    <section class="agent">
      <Titre icone="⚖️" texte="Peser un animal" />
      {!animal ? (
        <>
          <input type="search" class="recherche-gros" placeholder="Numéro de boucle ou nom" value={recherche} onInput={(e) => setRecherche(e.currentTarget.value)} />
          <ul class="liste-animaux">
            {liste.map((a) => (
              <li key={a.id}><button type="button" onClick={() => setAnimalId(a.id)}><strong>{libelleAnimal(a)}</strong><span>{a.espece === 'ovin' ? 'Mouton' : 'Bœuf'} · {a.sexe === 'F' ? 'femelle' : 'mâle'}</span></button></li>
            ))}
            {liste.length === 0 && <li class="vide">Aucun animal trouvé.</li>}
          </ul>
        </>
      ) : (
        <form class="formulaire" onSubmit={envoyer}>
          <p class="animal-choisi"><strong>{libelleAnimal(animal)}</strong> <button type="button" class="lien" onClick={() => setAnimalId('')}>Changer</button></p>
          <Compteur label="Poids" valeur={poids} onChange={setPoids} pas={0.5} decimal suffixe="kg" />
          <button class="principal gros" type="submit" disabled={poids <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}
