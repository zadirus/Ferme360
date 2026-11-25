// Interface simplifiée de l'agent d'élevage : gros boutons, une saisie = un écran, aucun menu à chercher.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { peutSupprimerSaisie } from '../droits';
import { dataOf, go, useItems, useRole, type Item } from '../hooks';
import { fmtDate, fmtInt, fmtQte, OEUFS_PAR_PLATEAU, today } from '../format';
import { coutMoyen } from '../gestion/calculs';
import type { Achat, Article, StockMvt } from '../gestion/types';
import { effectifActuel } from '../poules/calculs';
import type { Aliment, Bande, Mortalite, Ramassage, Sante } from '../poules/types';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import { NOM_SOIN, type Lot, type Pesee, type Soin } from '../ruminants/types';
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

// La date de la saisie : aujourd'hui par défaut, modifiable pour une saisie faite après coup
function ChampDate({ valeur, onChange }: { valeur: string; onChange: (d: string) => void }) {
  return (
    <label class="champ-date">
      <span class="libelle">Date de la saisie</span>
      <input type="date" value={valeur} max={today()} required onInput={(e) => onChange(e.currentTarget.value || today())} />
      {valeur !== today() && <small class="retro">Saisie du {fmtDate(valeur)} (faite après coup)</small>}
    </label>
  );
}

function Fait({ titre, detail, onEncore }: { titre: string; detail: string; onEncore: () => void }) {
  return (
    <section class="fait">
      <div class="coche" aria-hidden="true">✓</div>
      <h2>{titre}</h2>
      <p class="intro">{detail}</p>
      <button class="principal gros" type="button" onClick={onEncore}>Faire une autre saisie</button>
      <button class="secondaire gros" type="button" onClick={() => go('/saisie/historique')}>Voir mes saisies</button>
      <button class="secondaire gros" type="button" onClick={() => go('/')}>Retour à l’accueil</button>
    </section>
  );
}

const Titre = ({ icone, texte, liste }: { icone: string; texte: string; liste?: Type }) => (
  <>
    <a class="retour" href="#/">← Accueil</a>
    <div class="entete-saisie">
      <h2 class="titre-saisie"><span aria-hidden="true">{icone}</span> {texte}</h2>
      {liste && <a class="bouton-liste" href={`#/saisie/liste/${liste}`}>📋 Liste</a>}
    </div>
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

// ---------- listes des saisies ----------

type Type = 'oeufs' | 'deces' | 'aliment' | 'pesee' | 'soin';
// 338 œufs = « 11 plateaux et 8 œufs »
const libelleBons = (n: number) => {
  const pl = Math.floor(n / OEUFS_PAR_PLATEAU);
  const reste = n % OEUFS_PAR_PLATEAU;
  return [pl > 0 ? `${fmtInt(pl)} plateau${pl > 1 ? 'x' : ''}` : '', reste > 0 || pl === 0 ? `${fmtInt(reste)} œuf${reste > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ');
};

const NOM_TYPE: Record<Type, string> = { oeufs: 'Œufs', deces: 'Décès', aliment: 'Aliment', pesee: 'Pesées', soin: 'Médicaments' };

interface LigneSaisie { cle: string; type: Type; date: string; maj: number; auteur?: string; collection: string; item: Item<object>; texte: string }

function useSaisies(): LigneSaisie[] {
  const bandes = useItems<Bande>('bande');
  const ram = useItems<Ramassage>('ramassage');
  const morts = useItems<Mortalite>('mortalite');
  const aliments = useItems<Aliment>('aliment');
  const santes = useItems<Sante>('sante');
  const soins = useItems<Soin>('soin');
  const pesees = useItems<Pesee>('pesee');
  const r = useRuminants();
  const bande = (id: string) => bandes.find((b) => b.id === id)?.nom ?? 'Bande';
  const animal = (id: string) => { const a = r.animaux.find((x) => x.id === id); return a ? libelleAnimal(a) : 'Animal'; };
  const lot = (id: string) => r.lots.find((l) => l.id === id)?.nom ?? 'Lot';
  const ligne = (type: Type, collection: string, x: Item<{ date: string }>, texte: string): LigneSaisie => ({ cle: x.id, type, date: x.date, maj: x.updatedAt, auteur: x.author, collection, item: x, texte });
  return [
    ...ram.map((x) => ligne('oeufs', 'ramassage', x, `🥚 ${libelleBons(x.bons)}${x.feles > 0 ? ` · ${fmtInt(x.feles)} fêlés` : ''} · ${fmtInt(x.casses)} cassés · ${bande(x.bandeId)}`)),
    ...morts.map((x) => ligne('deces', 'mortalite', x, `💀 ${fmtInt(x.nombre)} poule(s)${x.cause ? ` · ${x.cause}` : ''} · ${bande(x.bandeId)}`)),
    ...aliments.map((x) => ligne('aliment', 'aliment', x, `🌾 ${x.sacs ? `${fmtQte(x.sacs)} sac(s) = ` : ''}${fmtQte(x.kg)} kg · ${bande(x.bandeId)}`)),
    ...pesees.map((x) => ligne('pesee', 'pesee', x, `⚖️ ${animal(x.animalId)} · ${fmtQte(x.poids)} kg`)),
    ...santes.map((x) => ligne('soin', 'sante', x, `💊 ${x.produit} · ${bande(x.bandeId)}`)),
    ...soins.map((x) => ligne('soin', 'soin', x, `💊 ${x.produit} · ${x.animalId ? animal(x.animalId) : lot(x.lotId)}${x.delaiAttente ? ` · attente ${x.delaiAttente} j` : ''}`))
  ].sort((a, b) => b.date.localeCompare(a.date) || b.maj - a.maj);
}

function ListeSaisies({ types, pas = 25 }: { types: Type[]; pas?: number }) {
  const role = useRole();
  const moi = getUser()?.name;
  const [nb, setNb] = useState(pas);
  const toutes = useSaisies().filter((l) => types.includes(l.type));
  const lignes = toutes.slice(0, nb);
  const hier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const titreJour = (d: string) => (d === today() ? 'Aujourd’hui' : d === hier ? 'Hier' : fmtDate(d));
  const jours = [...new Set(lignes.map((l) => l.date))];
  return (
    <>
      {jours.map((j) => (
        <div key={j}>
          <h3 class="jour">{titreJour(j)}</h3>
          <ul class="saisies-jour">
            {lignes.filter((l) => l.date === j).map((l) => (
              <li key={l.cle}>
                <div>
                  <span>{l.texte}</span>
                  {l.auteur && <small>{l.auteur.split(' ')[0]}</small>}
                </div>
                {peutSupprimerSaisie(role, l.maj, l.auteur, moi) && (
                  <button type="button" class="lien" onClick={async () => { if (window.confirm('Annuler cette saisie ?')) await saveRecord(l.collection, l.cle, dataOf(l.item), true); }}>Annuler</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {toutes.length === 0 && <p class="intro">Aucune saisie pour l’instant.</p>}
      {toutes.length > nb && <button type="button" class="secondaire gros" onClick={() => setNb(nb + pas)}>Voir plus ({toutes.length - nb} autres)</button>}
    </>
  );
}

const SAISIE_DE: Record<Type, string> = { oeufs: 'oeufs', deces: 'deces', aliment: 'aliment', pesee: 'pesee', soin: 'soin' };

// La liste des saisies : un seul type (bouton « Liste » d'un écran de saisie) ou toutes (« Voir mes saisies »)
export function SaisieHistorique({ type }: { type?: Type }) {
  const role = useRole();
  const permis: Type[] = role === 'veterinaire' ? ['soin', 'pesee'] : ['oeufs', 'deces', 'aliment', 'pesee', 'soin'];
  const [filtre, setFiltre] = useState<Type | 'tout'>(type && permis.includes(type) ? type : 'tout');
  return (
    <section class="agent">
      <a class="retour" href={type ? `#/saisie/${SAISIE_DE[type]}` : '#/'}>← {type ? NOM_TYPE[type] : 'Accueil'}</a>
      <h2 class="titre-saisie"><span aria-hidden="true">📋</span> {type ? `Liste : ${NOM_TYPE[type]}` : 'Mes saisies'}</h2>
      {!type && permis.length > 1 && (
        <div class="choix-ligne filtre-types" role="group" aria-label="Type de saisie">
          <button type="button" class={filtre === 'tout' ? 'actif' : ''} onClick={() => setFiltre('tout')}>Tout</button>
          {permis.map((t) => <button type="button" key={t} class={filtre === t ? 'actif' : ''} onClick={() => setFiltre(t)}>{NOM_TYPE[t]}</button>)}
        </div>
      )}
      <ListeSaisies key={filtre} types={filtre === 'tout' ? permis : [filtre]} />
      <p class="intro petit-texte">Une erreur ? Vous pouvez annuler votre saisie pendant 2 heures. Après, demandez au gérant.</p>
    </section>
  );
}

// ---------- accueil ----------

export function AccueilAgent() {
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const morts = useItems<Mortalite>('mortalite');
  const ram = useItems<Ramassage>('ramassage');
  const alertes = useAlertes();
  const prenom = (getUser()?.name ?? '').split(' ')[0];
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const oeufsAuj = ram.filter((r) => r.date === today()).reduce((s, r) => s + r.bons + r.feles + r.casses, 0);
  const effectif = bandes.reduce((s, b) => s + effectifActuel(b, morts.filter((m) => m.bandeId === b.id)), 0);

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
        {bouton('/saisie/soin', '💊', 'Soigner, donner un médicament', 'soin')}
        {bouton('/saisie/pesee', '⚖️', 'Peser un animal', 'pesee')}
        {bouton('/carnet', '📒', 'Ajouter une note', 'note')}
        {bouton('/stocks', '📦', 'Stock : aliments, médicaments')}
        {bouton('/elevage', '🐑', 'Mes animaux et poules')}
      </ul>

      <div class="resume-jour">
        <div><strong>{fmtInt(oeufsAuj)}</strong><span>œufs ramassés aujourd’hui</span></div>
        <div><strong>{fmtInt(effectif)}</strong><span>poules présentes</span></div>
      </div>

      <a class="bouton-liste large" href="#/saisie/historique">📋 Voir mes saisies</a>
    </section>
  );
}

// « Faire une autre saisie » repart d'un écran vide (même adresse, donc on recrée l'écran)
const avecRelance = (Ecran: (p: { relancer: () => void }) => JSX.Element) => () => {
  const [n, setN] = useState(0);
  return <Ecran key={n} relancer={() => setN(n + 1)} />;
};

// ---------- saisies ----------

function SaisieOeufsEcran({ relancer }: { relancer: () => void }) {
  const { bandes, bande, selecteur } = useBande();
  const ram = useItems<Ramassage>('ramassage');
  const [date, setDate] = useState(today());
  const [plateaux, setPlateaux] = useState(0);
  const [vrac, setVrac] = useState(0);
  const [casses, setCasses] = useState(0);
  const [fait, setFait] = useState('');
  if (fait) return <Fait titre="Ramassage enregistré" detail={fait} onEncore={relancer} />;
  const bons = plateaux * OEUFS_PAR_PLATEAU + vrac;
  // 30 œufs en vrac ou plus : ils forment un plateau de plus
  const changerVrac = (n: number) => {
    if (n >= OEUFS_PAR_PLATEAU) { setPlateaux(plateaux + Math.floor(n / OEUFS_PAR_PLATEAU)); setVrac(n % OEUFS_PAR_PLATEAU); } else setVrac(n);
  };
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!bande || bons + casses <= 0) return;
    const deja = ram.filter((r) => r.bandeId === bande.id && r.date === date);
    if (deja.length > 0 && !window.confirm(`Un ramassage existe déjà le ${fmtDate(date)} pour ${bande.nom} (${fmtInt(deja.reduce((s, r) => s + r.bons + r.feles + r.casses, 0))} œufs). Ajouter celui-ci en plus ?`)) return;
    await saveRecord('ramassage', newId(), { bandeId: bande.id, date, bons, feles: 0, casses } satisfies Ramassage);
    setFait(`${bande.nom}, le ${fmtDate(date)} : ${libelleBons(bons)}${casses > 0 ? `, ${fmtInt(casses)} œuf(s) cassé(s)` : ''}.`);
  }
  return (
    <section class="agent">
      <Titre icone="🥚" texte="Ramasser les œufs" liste="oeufs" />
      {bandes.length === 0 ? <AucuneBande /> : (
        <form class="formulaire" onSubmit={envoyer}>
          <ChampDate valeur={date} onChange={setDate} />
          {selecteur}
          <Compteur label="Plateaux complets de bons œufs" valeur={plateaux} onChange={setPlateaux} suffixe="plateaux" />
          <Compteur label={`Bons œufs en plus (moins de ${OEUFS_PAR_PLATEAU})`} valeur={vrac} onChange={changerVrac} suffixe="œufs" />
          <Compteur label="Œufs cassés" valeur={casses} onChange={setCasses} suffixe="œufs" />
          <div class="recap-oeufs">
            <div><strong>{libelleBons(bons)}</strong><span>bons œufs</span></div>
            <div><strong>{fmtInt(casses)}</strong><span>cassés</span></div>
          </div>
          <button class="principal gros" type="submit" disabled={!bande || bons + casses <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

const CAUSES_DE_BASE = ['Maladie', 'Chaleur', 'Accident ou prédateur', 'Je ne sais pas'];
const AUTRE = '__autre';

function SaisieDecesEcran({ relancer }: { relancer: () => void }) {
  const { bandes, bande, selecteur, effectif } = useBande();
  const morts = useItems<Mortalite>('mortalite');
  const [date, setDate] = useState(today());
  const [n, setN] = useState(0);
  const [cause, setCause] = useState('Je ne sais pas');
  const [autre, setAutre] = useState('');
  const [fait, setFait] = useState('');
  const [erreur, setErreur] = useState('');
  if (fait) return <Fait titre="Décès enregistré" detail={fait} onEncore={relancer} />;
  // les causes déjà saisies par l'équipe s'ajoutent aux choix proposés
  const apprises = [...new Map(morts.map((m) => m.cause.trim()).filter(Boolean).filter((c) => !CAUSES_DE_BASE.some((b) => b.toLowerCase() === c.toLowerCase())).map((c) => [c.toLowerCase(), c])).values()].sort((a, b) => a.localeCompare(b, 'fr'));
  const options: Array<[string, string]> = [...CAUSES_DE_BASE, ...apprises].map((c) => [c, c]);
  options.push([AUTRE, 'Autre…']);
  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    if (!bande || n <= 0) return;
    const libelle = cause === AUTRE ? autre.trim().replace(/\s+/g, ' ').slice(0, 40) : cause;
    if (!libelle) return setErreur('Écrivez la cause.');
    if (n > effectif) return setErreur(`Impossible : il ne reste que ${fmtInt(effectif)} poules dans cette bande.`);
    await saveRecord('mortalite', newId(), { bandeId: bande.id, date, nombre: n, type: 'mort', cause: libelle } satisfies Mortalite);
    setFait(`${fmtInt(n)} poule(s) en moins dans ${bande.nom} le ${fmtDate(date)}. Cause : ${libelle}.`);
  }
  return (
    <section class="agent">
      <Titre icone="💀" texte="Signaler un décès" liste="deces" />
      {bandes.length === 0 ? <AucuneBande /> : (
        <form class="formulaire" onSubmit={envoyer}>
          <ChampDate valeur={date} onChange={setDate} />
          {selecteur}
          <Compteur label="Combien de poules mortes ?" valeur={n} onChange={setN} />
          <Pastilles label="Cause probable" valeur={cause} options={options} onChange={setCause} />
          {cause === AUTRE && (
            <label class="champ-date">
              <span class="libelle">Écrivez la cause</span>
              <input type="text" value={autre} maxLength={40} placeholder="Ex. : coup de froid" onInput={(e) => setAutre(e.currentTarget.value)} />
              <small class="retro">Elle sera proposée aux prochaines saisies.</small>
            </label>
          )}
          {erreur && <p class="erreur">{erreur}</p>}
          <button class="principal gros" type="submit" disabled={!bande || n <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

function SaisieAlimentEcran({ relancer }: { relancer: () => void }) {
  const { bandes, bande, selecteur } = useBande();
  const articles = useItems<Article>('article').filter((a) => a.categorie === 'aliment');
  const achats = useItems<Achat>('achat');
  const mvts = useItems<StockMvt>('stock_mvt');
  const [date, setDate] = useState(today());
  const [unite, setUnite] = useState<'sacs' | 'kg'>('sacs');
  const [qte, setQte] = useState(0);
  const [typeAliment, setTypeAliment] = useState<Aliment['type']>('ponte');
  const [articleId, setArticleId] = useState('');
  const [fait, setFait] = useState('');
  if (fait) return <Fait titre="Aliment enregistré" detail={fait} onEncore={relancer} />;
  const choisi = articleId || (articles.length === 1 ? articles[0].id : '');
  const article = articles.find((a) => a.id === choisi);
  const kgSac = article && article.kgParUnite > 1 ? article.kgParUnite : 50;
  const kg = unite === 'sacs' ? qte * kgSac : qte;
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
    await saveRecord('aliment', id, { bandeId: bande.id, date, kg, type: typeAliment, ...(unite === 'sacs' ? { sacs: qte } : {}), ...(article ? { articleId: article.id, cout } : {}) } satisfies Aliment);
    if (article) await saveRecord('stock_mvt', newId(), { articleId: article.id, date, type: 'sortie', quantite: unites, peremption: '', achatId: '', alimentId: id, note: '' } satisfies StockMvt);
    setFait(`${unite === 'sacs' ? `${fmtQte(qte)} sac(s) (${fmtQte(kg)} kg)` : `${fmtQte(kg)} kg`} distribués à ${bande.nom} le ${fmtDate(date)}${article ? `, retirés du stock (${article.nom})` : ''}.`);
  }
  return (
    <section class="agent">
      <Titre icone="🌾" texte="Distribuer l’aliment" liste="aliment" />
      {bandes.length === 0 ? <AucuneBande /> : (
        <form class="formulaire" onSubmit={envoyer}>
          <ChampDate valeur={date} onChange={setDate} />
          {selecteur}
          <Pastilles label="Compter en" valeur={unite} options={[['sacs', `Sacs de ${fmtQte(kgSac)} kg`], ['kg', 'Kilos']]} onChange={(u) => { setUnite(u); setQte(0); }} />
          <Compteur label={unite === 'sacs' ? 'Nombre de sacs' : 'Quantité distribuée'} valeur={qte} onChange={setQte} pas={unite === 'sacs' ? 0.5 : 0.5} decimal suffixe={unite === 'sacs' ? 'sac(s)' : 'kg'} />
          <div class="rapides">
            {(unite === 'sacs' ? [1, 1.5, 2, 5] : [5, 10, 25, 50]).map((q) => <button type="button" key={q} onClick={() => setQte(q)}>{fmtQte(q)} {unite === 'sacs' ? (q > 1 ? 'sacs' : 'sac') : 'kg'}</button>)}
          </div>
          {unite === 'sacs' && qte > 0 && <p class="total-saisie">= <strong>{fmtQte(kg)}</strong> kg</p>}
          <Pastilles label="Type d’aliment" valeur={typeAliment} options={[['ponte', 'Ponte'], ['croissance', 'Croissance'], ['demarrage', 'Démarrage']]} onChange={setTypeAliment} />
          {articles.length > 1 && <Pastilles label="Quel aliment du stock ?" valeur={choisi} options={articles.map((a) => [a.id, a.nom] as [string, string])} onChange={setArticleId} />}
          {article && <p class="intro petit-texte">Pris dans le stock : <strong>{article.nom}</strong></p>}
          <button class="principal gros" type="submit" disabled={!bande || kg <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

function SaisiePeseeEcran({ relancer }: { relancer: () => void }) {
  const r = useRuminants();
  const [recherche, setRecherche] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [date, setDate] = useState(today());
  const [poids, setPoids] = useState(0);
  const [fait, setFait] = useState('');
  if (fait) return <Fait titre="Pesée enregistrée" detail={fait} onEncore={relancer} />;
  const presents = r.animaux.filter((a) => r.statut(a.id) === 'present').sort((a, b) => a.boucle.localeCompare(b.boucle, 'fr', { numeric: true }));
  const q = recherche.trim().toLowerCase();
  const liste = presents.filter((a) => !q || `${a.boucle} ${a.nom}`.toLowerCase().includes(q)).slice(0, 12);
  const animal = presents.find((a) => a.id === animalId);
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!animal || poids <= 0 || poids > 2000) return;
    await saveRecord('pesee', newId(), { animalId: animal.id, date, poids, methode: 'balance' } satisfies Pesee);
    setFait(`${libelleAnimal(animal)} : ${fmtQte(poids)} kg le ${fmtDate(date)}.`);
  }
  return (
    <section class="agent">
      <Titre icone="⚖️" texte="Peser un animal" liste="pesee" />
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
          <ChampDate valeur={date} onChange={setDate} />
          <Compteur label="Poids" valeur={poids} onChange={setPoids} pas={0.5} decimal suffixe="kg" />
          <button class="principal gros" type="submit" disabled={poids <= 0}>Enregistrer</button>
        </form>
      )}
    </section>
  );
}

// Soigner : vaccin ou médicament donné aux poules, à un animal ou à un lot ; le produit est retiré du stock
function SaisieSoinEcran({ relancer }: { relancer: () => void }) {
  const role = useRole();
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const r = useRuminants();
  const produits = useItems<Article>('article').filter((a) => a.categorie === 'medicament');
  const mvts = useItems<StockMvt>('stock_mvt');
  const [cible, setCible] = useState<'poules' | 'animal' | 'lot'>('poules');
  const [bandeId, setBandeId] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [lotId, setLotId] = useState('');
  const [recherche, setRecherche] = useState('');
  const [articleId, setArticleId] = useState('');
  const [libre, setLibre] = useState('');
  const [qte, setQte] = useState(1);
  const [type, setType] = useState<Soin['type']>('traitement');
  const [date, setDate] = useState(today());
  const [delai, setDelai] = useState(0);
  const [rappel, setRappel] = useState('');
  const [note, setNote] = useState('');
  const [fait, setFait] = useState('');
  const [erreur, setErreur] = useState('');
  if (fait) return <Fait titre="Soin enregistré" detail={fait} onEncore={relancer} />;

  const bande = bandes.length === 1 ? bandes[0] : bandes.find((b) => b.id === bandeId);
  const presents = r.animaux.filter((a) => r.statut(a.id) === 'present').sort((a, b) => a.boucle.localeCompare(b.boucle, 'fr', { numeric: true }));
  const q = recherche.trim().toLowerCase();
  const trouves = presents.filter((a) => !q || `${a.boucle} ${a.nom}`.toLowerCase().includes(q)).slice(0, 8);
  const animal = presents.find((a) => a.id === animalId);
  const lot = r.lots.find((l) => l.id === lotId);
  const article = produits.find((a) => a.id === articleId);
  const cibleChoisie = cible === 'poules' ? !!bande : cible === 'animal' ? !!animal : !!lot;
  const nomCible = cible === 'poules' ? bande?.nom : cible === 'animal' ? (animal ? libelleAnimal(animal) : '') : lot?.nom;

  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    const produit = libre.trim() || article?.nom || '';
    if (!cibleChoisie) return setErreur('Choisissez qui est soigné.');
    if (!produit) return setErreur('Choisissez le produit dans le stock, ou écrivez son nom.');
    if (article && qte > 0) {
      const stock = mvts.filter((m) => m.articleId === article.id).reduce((s, m) => (m.type === 'sortie' ? s - m.quantite : s + m.quantite), 0);
      if (qte > stock && !window.confirm(`Le stock de ${article.nom} deviendrait négatif (${fmtQte(stock - qte)}). Continuer ?`)) return;
    }
    const id = newId();
    if (cible === 'poules') {
      const t: Sante['type'] = type === 'vaccin' ? 'vaccin' : type === 'traitement' ? 'traitement' : 'autre';
      await saveRecord('sante', id, { bandeId: bande!.id, date, type: t, produit, note: note.trim(), rappel } satisfies Sante);
    } else {
      await saveRecord('soin', id, { animalId: cible === 'animal' ? animal!.id : '', lotId: cible === 'lot' ? lot!.id : '', date, type, produit, veterinaire: role === 'veterinaire' ? (getUser()?.name ?? '') : '', cout: 0, delaiAttente: Math.max(0, Math.floor(delai)), rappel, note: note.trim() } satisfies Soin);
    }
    if (article && qte > 0) {
      await saveRecord('stock_mvt', newId(), { articleId: article.id, date, type: 'sortie', quantite: qte, peremption: '', achatId: '', alimentId: id, note: `Soin : ${produit} (${nomCible})` } satisfies StockMvt);
    }
    setFait(`${produit} donné à ${nomCible} le ${fmtDate(date)}${article && qte > 0 ? `. ${fmtQte(qte)} ${article.unite} retiré(s) du stock` : ''}.`);
  }

  return (
    <section class="agent">
      <Titre icone="💊" texte="Soigner, donner un médicament" liste="soin" />
      <form class="formulaire" onSubmit={envoyer}>
        <ChampDate valeur={date} onChange={setDate} />
        <Pastilles label="Qui est soigné ?" valeur={cible} options={[['poules', '🐔 Poules'], ['animal', '🐑 Un animal'], ['lot', 'Un lot']]} onChange={setCible} />
        {cible === 'poules' && (bandes.length === 0 ? <AucuneBande /> : bandes.length > 1 && <Pastilles label="Quelle bande ?" valeur={bandeId} options={bandes.map((b) => [b.id, b.nom] as [string, string])} onChange={setBandeId} />)}
        {cible === 'animal' && (!animal ? (
          <>
            <input type="search" class="recherche-gros" placeholder="Numéro de boucle ou nom" value={recherche} onInput={(e) => setRecherche(e.currentTarget.value)} />
            <ul class="liste-animaux">{trouves.map((a) => <li key={a.id}><button type="button" onClick={() => setAnimalId(a.id)}><strong>{libelleAnimal(a)}</strong><span>{a.espece === 'ovin' ? 'Mouton' : 'Bœuf'}</span></button></li>)}</ul>
          </>
        ) : <p class="animal-choisi"><strong>{libelleAnimal(animal)}</strong> <button type="button" class="lien" onClick={() => setAnimalId('')}>Changer</button></p>)}
        {cible === 'lot' && <Pastilles label="Quel lot ?" valeur={lotId} options={r.lots.map((l: Item<Lot>) => [l.id, l.nom] as [string, string])} onChange={setLotId} />}
        <Pastilles label="Type de soin" valeur={type} options={(['vaccin', 'traitement', 'deparasitage', 'autre'] as Soin['type'][]).map((k) => [k, NOM_SOIN[k]] as [Soin['type'], string])} onChange={setType} />
        {produits.length > 0 && <Pastilles label="Produit pris dans le stock" valeur={articleId} options={[...produits.map((a) => [a.id, a.nom] as [string, string]), ['', 'Autre produit']]} onChange={setArticleId} />}
        {article && <Compteur label={`Quantité utilisée (${article.unite})`} valeur={qte} onChange={setQte} pas={article.unite === 'dose' ? 10 : 0.5} decimal suffixe={article.unite} />}
        {!article && (
          <label class="champ-date"><span class="libelle">Nom du produit ou de la maladie</span><input type="text" value={libre} onInput={(e) => setLibre(e.currentTarget.value)} placeholder="Ex. : Newcastle" /></label>
        )}
        {cible !== 'poules' && <Compteur label="Délai d’attente avant vente ou abattage" valeur={delai} onChange={setDelai} suffixe="jours" />}
        <label class="champ-date"><span class="libelle">Prochain rappel (facultatif)</span><input type="date" value={rappel} onInput={(e) => setRappel(e.currentTarget.value)} /></label>
        <label class="champ-date"><span class="libelle">Note (facultatif)</span><input type="text" value={note} onInput={(e) => setNote(e.currentTarget.value)} /></label>
        {erreur && <p class="erreur">{erreur}</p>}
        <button class="principal gros" type="submit" disabled={!cibleChoisie}>Enregistrer</button>
      </form>
    </section>
  );
}

export const SaisieOeufs = avecRelance(SaisieOeufsEcran);
export const SaisieDeces = avecRelance(SaisieDecesEcran);
export const SaisieAliment = avecRelance(SaisieAlimentEcran);
export const SaisiePesee = avecRelance(SaisiePeseeEcran);
export const SaisieSoin = avecRelance(SaisieSoinEcran);

// ---------- accueil du vétérinaire ----------

export function AccueilVeto() {
  const alertes = useAlertes();
  const santes = useItems<Sante>('sante');
  const soins = useItems<Soin>('soin');
  const prenom = (getUser()?.name ?? '').split(' ')[0];
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const mois = today().slice(0, 7);
  const nbMois = [...santes, ...soins].filter((x) => x.date.startsWith(mois)).length;
  const dans14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const rappels = [...santes, ...soins].filter((x) => x.rappel && x.rappel >= today() && x.rappel <= dans14).length;
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
        {bouton('/saisie/soin', '💊', 'Soigner, donner un médicament', 'soin')}
        {bouton('/saisie/liste/soin', '📋', 'Mes soins')}
        {bouton('/saisie/pesee', '⚖️', 'Peser un animal', 'pesee')}
        {bouton('/stocks', '📦', 'Stock de médicaments')}
        {bouton('/elevage', '🐑', 'Animaux et poules')}
        {bouton('/carnet', '📒', 'Ajouter une note', 'note')}
      </ul>
      <div class="resume-jour">
        <div><strong>{fmtInt(nbMois)}</strong><span>soins ce mois-ci</span></div>
        <div><strong>{fmtInt(rappels)}</strong><span>rappels dans les 14 jours</span></div>
      </div>
    </section>
  );
}
