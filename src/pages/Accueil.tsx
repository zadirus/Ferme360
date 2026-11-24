import { useItems, useRole } from '../hooks';
import { peut } from '../droits';
import { fmtDate, fmtFcfa, fmtInt, fmtPlateaux, joursEntre, today } from '../format';
import { alertesArticle, creances, soldesComptes } from '../gestion/calculs';
import { REGLAGES } from '../reglages';
import type { Achat, Article, Client, Depense, Paiement, Reglement, StockMvt, TresoMvt, Vente } from '../gestion/types';
import { alertes, effectifActuel, stockOeufs } from '../poules/calculs';
import type { Bande, Mortalite, MvtOeufs, Ramassage, Sante } from '../poules/types';
import { getUser } from '../session';
import { miseBasPrevue } from '../ruminants/calculs';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import { NOM_SOIN } from '../ruminants/types';
import { Alertes } from '../ui';
import { CATEGORIES_ROLE, construireAlertes } from '../alertes';
import type { Role } from '../droits';
import { lireProphylaxie } from '../poules/programmes';
import type { Eau } from '../poules/types';
import { ID_PROGRAMMES } from '../reglages';
import { useEffect, useState } from 'preact/hooks';
import { etatPush } from '../push';
import { pinDefini } from '../pin';

function PremiersPas({ ok }: { ok: Array<[string, string, boolean]> }) {
  const [cache, setCache] = useState(() => localStorage.getItem('ferme360.premiers') === '1');
  const reste = ok.filter(([, , f]) => !f).length;
  if (cache || reste === 0) return null;
  return (
    <div class="premiers">
      <h3>Premiers pas ({ok.length - reste}/{ok.length})</h3>
      <ul>
        {ok.map(([titre, lien, fait]) => (
          <li key={titre} class={fait ? 'fait' : ''}><span>{fait ? '✅' : '⬜'}</span><a href={`#${lien}`}>{titre}</a></li>
        ))}
      </ul>
      <button class="lien" type="button" onClick={() => { localStorage.setItem('ferme360.premiers', '1'); setCache(true); }}>Masquer cette liste</button>
    </div>
  );
}

export function Accueil() {
  const role = useRole();
  const argent = peut(role, 'argent');
  const avecStocks = peut(role, 'stocks');
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const ram = useItems<Ramassage>('ramassage');
  const morts = useItems<Mortalite>('mortalite');
  const mvts = useItems<MvtOeufs>('oeufs_mvt');
  const santes = useItems<Sante>('sante');
  const articles = useItems<Article>('article');
  const stockMvts = useItems<StockMvt>('stock_mvt');
  const ventes = useItems<Vente>('vente');
  const clients = useItems<Client>('client');
  const paiements = useItems<Paiement>('paiement');
  const achats = useItems<Achat>('achat');
  const reglements = useItems<Reglement>('reglement');
  const depenses = useItems<Depense>('depense');
  const ajustements = useItems<TresoMvt>('treso_mvt');
  const rum = useRuminants();

  const [notifActives, setNotifActives] = useState(false);
  useEffect(() => { void etatPush().then((e) => setNotifActives(e.abonne)).catch(() => undefined); }, []);
  const premiersPas: Array<[string, string, boolean]> = [
    ['Indiquer l’argent que vous avez en caisse', '/argent', ajustements.length > 0],
    ['Ajouter vos poules, moutons ou bœufs (ou les importer)', '/import', bandes.length > 0 || rum.animaux.length > 0],
    ['Ajouter vos aliments et médicaments en stock', '/stocks', articles.length > 0],
    ['Créer les comptes de votre équipe', '/equipe', localStorage.getItem('ferme360.equipe') === '1'],
    ['Activer les notifications du matin', '/notifications', notifActives],
    ['Choisir un code PIN pour ce téléphone', '/pin', pinDefini()],
    ['Faire une première sauvegarde', '/sauvegarde', localStorage.getItem('ferme360.sauvegarde') === '1']
  ];

  const effectif = bandes.reduce((s, b) => s + effectifActuel(b, morts.filter((m) => m.bandeId === b.id)), 0);
  const stockO = stockOeufs(ram, mvts);
  const cr = creances(ventes, paiements, today());
  const aEncaisser = cr.reduce((s, c) => s + c.solde, 0);
  const soldes = soldesComptes(paiements, achats, reglements, depenses, ajustements);
  const tresorerie = soldes.caisse + soldes.mobile_money + soldes.banque;
  const alertesStock = articles.flatMap((a) => alertesArticle(a, stockMvts.filter((m) => m.articleId === a.id), today()));

  const presents = (e: 'ovin' | 'bovin') => rum.animaux.filter((a) => a.espece === e && rum.statut(a.id) === 'present');
  const misesBas = presents('ovin').concat(presents('bovin'))
    .filter((a) => a.sexe === 'F')
    .map((a) => ({ a, date: miseBasPrevue(a.id, rum.repro, rum.misesBas) }))
    .filter((x): x is { a: (typeof rum.animaux)[number]; date: string } => !!x.date && joursEntre(today(), x.date) <= 30)
    .sort((x, y) => x.date.localeCompare(y.date));
  const rappelsAnimaux = rum.soins.filter((s) => s.rappel && joursEntre(today(), s.rappel) <= 14);

  // mêmes alertes que les notifications du matin, limitées à ce que le profil a le droit de voir
  const toutesBandes = useItems<Bande>('bande');
  const programmes = useItems<{ prophylaxie?: string }>('reglage').find((x) => x.id === ID_PROGRAMMES);
  const eaux = useItems<Eau>('eau');
  const permises = CATEGORIES_ROLE[role as Role] ?? [];
  const toutes = construireAlertes(
    { bandes: toutesBandes, ramassages: ram, mortalites: morts, santes, animaux: rum.animaux, mvtsAnimaux: rum.mvts, repro: rum.repro, misesBas: rum.misesBas, soins: rum.soins, articles, stockMvts, ventes, paiements, clients, programme: lireProphylaxie(programmes?.prophylaxie ?? ''), eaux },
    today()
  ).filter((a) => permises.includes(a.categorie)).map((a) => a.texte);

  const rappels = santes
    .filter((s) => s.rappel && joursEntre(today(), s.rappel) <= 14)
    .sort((a, b) => a.rappel.localeCompare(b.rappel));
  const nomBande = (id: string) => bandes.find((b) => b.id === id)?.nom ?? '';
  const prenom = (getUser()?.name ?? '').split(' ')[0];
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section>
      <div class="salut">
        <strong>Bonjour{prenom ? `, ${prenom}` : ''}</strong>
        <span>{dateLongue}</span>
      </div>
      {argent && <PremiersPas ok={premiersPas} />}
      <Alertes liste={toutes} />
      <ul class="tuiles">
        <li>
          <a class="tuile" href="#/poules">
            <span class="ico">🐔</span>
            <span class="gros">{fmtInt(effectif)}</span>
            <span class="petit">poules · {bandes.length} bande(s)</span>
          </a>
        </li>
        <li>
          <a class="tuile t-oeuf" href="#/oeufs">
            <span class="ico">🥚</span>
            <span class="gros">{fmtPlateaux(stockO).replace(' plateaux', '')}</span>
            <span class="petit">plateaux en stock</span>
          </a>
        </li>
        {argent && <li>
          <a class="tuile t-argent" href="#/ventes">
            <span class="ico">🧾</span>
            <span class="gros">{fmtFcfa(aEncaisser)}</span>
            <span class="petit">à encaisser</span>
          </a>
        </li>}
        {argent && <li>
          <a class="tuile t-argent" href="#/argent">
            <span class="ico">💰</span>
            <span class="gros">{fmtFcfa(tresorerie)}</span>
            <span class="petit">en caisse et comptes</span>
          </a>
        </li>}
        {avecStocks && <li>
          <a class="tuile t-stock" href="#/stocks">
            <span class="ico">📦</span>
            <span class="gros">{articles.length}</span>
            <span class="petit">article(s) en stock</span>
            {alertesStock.length > 0 && <span class="pt">{alertesStock.length}</span>}
          </a>
        </li>}
        <li>
          <a class="tuile t-argent" href="#/tableau">
            <span class="ico">📊</span>
            <span class="gros">Tableau de bord</span>
            <span class="petit">chiffres clés, graphiques</span>
          </a>
        </li>
        <li>
          <a class="tuile" href="#/carnet">
            <span class="ico">📒</span>
            <span class="gros">Carnet</span>
            <span class="petit">vos notes</span>
          </a>
        </li>
        <li>
          <a class="tuile" href="#/moutons">
            <span class="ico">🐑</span>
            <span class="gros">{fmtInt(presents('ovin').length)}</span>
            <span class="petit">moutons</span>
          </a>
        </li>
        <li>
          <a class="tuile" href="#/boeufs">
            <span class="ico">🐄</span>
            <span class="gros">{fmtInt(presents('bovin').length)}</span>
            <span class="petit">bœufs</span>
          </a>
        </li>
      </ul>
      {misesBas.length > 0 && (
        <>
          <h3>Mises bas prévues</h3>
          <ul>
            {misesBas.map(({ a, date }) => (
              <li key={a.id}>
                <a class="carte" href={`#/animaux/${a.id}`}>
                  <strong>{libelleAnimal(a)}</strong>
                  <span>{date < today() ? `en retard · prévue le ${fmtDate(date)}` : `le ${fmtDate(date)}`}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {rappelsAnimaux.length > 0 && (
        <>
          <h3>Rappels de soins (moutons, bœufs)</h3>
          <ul>
            {rappelsAnimaux.map((s) => (
              <li key={s.id}>
                <div class="ligne">
                  <span>{NOM_SOIN[s.type]} : {s.produit}</span>
                  <small>{s.rappel < today() ? `en retard (${fmtDate(s.rappel)})` : `le ${fmtDate(s.rappel)}`}</small>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {rappels.length > 0 && (
        <>
          <h3>Rappels de santé (poules)</h3>
          <ul>
            {rappels.map((s) => (
              <li key={s.id}>
                <div class="ligne">
                  <span>{s.produit}{nomBande(s.bandeId) && ` · ${nomBande(s.bandeId)}`}</span>
                  <small>{s.rappel < today() ? `en retard (${fmtDate(s.rappel)})` : `le ${fmtDate(s.rappel)}`}</small>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
