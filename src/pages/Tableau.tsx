import { useState } from 'preact/hooks';
import { Courbe } from '../courbe';
import { peut } from '../droits';
import { ajouteJours, fmtDate, fmtDec, fmtFcfa, fmtInt, fmtPct, today } from '../format';
import { alertesArticle, creances, detteFournisseur } from '../gestion/calculs';
import type { Achat, Article, Client, Depense, Fournisseur, Paiement, Reglement, StockMvt, TresoMvt, Vente } from '../gestion/types';
import { nomActivite } from '../gestion/types';
import { Barres, BarresH, Carte, Kpi } from '../graphiques';
import { useItems, useRole } from '../hooks';
import { effectifActuel } from '../poules/calculs';
import type { Bande, Mortalite, Ramassage } from '../poules/types';
import { gmqMoyen } from '../ruminants/calculs';
import { useRuminants } from '../ruminants/donnees';
import { derniersMois, finDeMois, fmtCourt, libelleMoisCourt, moyenne, parMois, tauxPonteQuotidien, tresorerieAu, variation, vieillissementCreances } from '../tableau/indicateurs';
import { useAlertes } from '../useAlertes';

type Periode = 30 | 90 | 365;
const NOM_PERIODE: Record<Periode, string> = { 30: '30 jours', 90: '90 jours', 365: '12 mois' };

export function Tableau() {
  const role = useRole();
  const argent = peut(role, 'argent');
  const [jours, setJours] = useState<Periode>(30);
  const rum = useRuminants();
  const alertes = useAlertes();
  const bandes = useItems<Bande>('bande');
  const ram = useItems<Ramassage>('ramassage');
  const morts = useItems<Mortalite>('mortalite');
  const ventesTous = useItems<Vente>('vente');
  const clients = useItems<Client>('client');
  const paiements = useItems<Paiement>('paiement');
  const achats = useItems<Achat>('achat');
  const depenses = useItems<Depense>('depense');
  const reglements = useItems<Reglement>('reglement');
  const fournisseurs = useItems<Fournisseur>('fournisseur');
  const ajustements = useItems<TresoMvt>('treso_mvt');
  const articles = useItems<Article>('article');
  const stockMvts = useItems<StockMvt>('stock_mvt');

  const auj = today();
  const debut = ajouteJours(auj, -(jours - 1));
  const pDebut = ajouteJours(debut, -jours);
  const pFin = ajouteJours(debut, -1);
  const dans = (d: string, a: string, b: string) => d >= a && d <= b;
  const ventes = ventesTous.filter((v) => !v.reprise);

  // --- poules
  const bandesActives = bandes.filter((b) => !b.cloturee);
  const ponte = tauxPonteQuotidien(bandes, ram, morts, debut, auj);
  const ponteAvant = tauxPonteQuotidien(bandes, ram, morts, pDebut, pFin);
  const tPonte = moyenne(ponte.map((p) => p.taux));
  const tPonteAvant = moyenne(ponteAvant.map((p) => p.taux));
  const oeufs = (a: string, b: string) => ram.filter((r) => dans(r.date, a, b)).reduce((s, r) => s + r.bons, 0);
  const mortesPoules = (a: string, b: string) => morts.filter((m) => m.type === 'mort' && dans(m.date, a, b)).reduce((s, m) => s + m.nombre, 0);
  const poulesPresentes = bandesActives.reduce((s, b) => s + effectifActuel(b, morts.filter((m) => m.bandeId === b.id)), 0);

  // --- ruminants
  const presents = (e: 'ovin' | 'bovin', sexe: 'F' | 'M') => rum.animaux.filter((a) => a.espece === e && a.sexe === sexe && rum.statut(a.id) === 'present').length;
  const nOvins = presents('ovin', 'F') + presents('ovin', 'M');
  const nBovins = presents('bovin', 'F') + presents('bovin', 'M');
  const naissances = (a: string, b: string) => rum.mvts.filter((m) => m.type === 'entree' && m.motif === 'naissance' && dans(m.date, a, b)).length;
  const deces = (a: string, b: string) => rum.mvts.filter((m) => m.type === 'sortie' && m.motif === 'mort' && dans(m.date, a, b)).length;
  const lotsEmbouche = rum.lots.filter((l) => l.type === 'embouche').map((l) => {
    const ids = rum.animaux.filter((a) => rum.etat(a.id).lotId === l.id && rum.statut(a.id) === 'present').map((a) => a.id);
    return { nom: l.nom, id: l.id, n: ids.length, gmq: gmqMoyen(ids, rum.pesees) };
  }).filter((l) => l.gmq !== null && l.n > 0);
  const gmqGlobal = moyenne(lotsEmbouche.map((l) => l.gmq as number));

  // --- argent
  const somme = (a: string, b: string) => ventes.filter((v) => dans(v.date, a, b)).reduce((s, v) => s + v.total, 0);
  const charges = (a: string, b: string) => achats.filter((x) => dans(x.date, a, b)).reduce((s, x) => s + x.total, 0) + depenses.filter((x) => dans(x.date, a, b)).reduce((s, x) => s + x.montant, 0);
  const vP = somme(debut, auj), vA = somme(pDebut, pFin), cP = charges(debut, auj), cA = charges(pDebut, pFin);
  const treso = tresorerieAu(auj, paiements, achats, reglements, depenses, ajustements);
  const tresoDebut = tresorerieAu(ajouteJours(debut, -1), paiements, achats, reglements, depenses, ajustements);
  const cr = creances(ventesTous, paiements, auj);
  const totalCreances = cr.reduce((s, c) => s + c.solde, 0);
  const dettes = fournisseurs.reduce((s, f) => s + Math.max(0, detteFournisseur(f.id, achats, reglements)), 0);
  const mois12 = derniersMois(12, auj);
  const libMois = mois12.map(libelleMoisCourt);
  const venteMois = parMois(ventes, mois12, (v) => v.date, (v) => v.total);
  const chargeMois = parMois([...achats.map((x) => ({ date: x.date, v: x.total })), ...depenses.map((x) => ({ date: x.date, v: x.montant }))], mois12, (x) => x.date, (x) => x.v);
  const tresoMois = mois12.map((m) => [m, tresorerieAu(finDeMois(m) > auj ? auj : finDeMois(m), paiements, achats, reglements, depenses, ajustements)] as const);
  const parActivite = (['poules', 'ovins', 'bovins', 'commun'] as const).map((a) => ({ nom: nomActivite(a), valeur: ventes.filter((v) => v.activite === a && dans(v.date, debut, auj)).reduce((s, v) => s + v.total, 0) })).filter((x) => x.valeur > 0);
  const topClients = clients.map((c) => ({ nom: c.nom, valeur: ventes.filter((v) => v.clientId === c.id && dans(v.date, debut, auj)).reduce((s, v) => s + v.total, 0), lien: `/clients/${c.id}` })).filter((x) => x.valeur > 0).sort((a, b) => b.valeur - a.valeur).slice(0, 6);
  const vieux = vieillissementCreances(cr);

  // --- stocks
  const alertesStock = articles.flatMap((a) => alertesArticle(a, stockMvts.filter((m) => m.articleId === a.id), auj));
  const moisLib = (m: string) => libelleMoisCourt(m);

  return (
    <section>
      <h2>Tableau de bord</h2>
      <p class="intro">Ce qui se passe à la ferme, sur la période choisie, comparé à la période d'avant. Du {fmtDate(debut)} au {fmtDate(auj)}.</p>
      <div class="puces">
        {([30, 90, 365] as Periode[]).map((p) => <button key={p} type="button" class={p === jours ? 'actif' : ''} onClick={() => setJours(p)}>{NOM_PERIODE[p]}</button>)}
      </div>

      {alertes.length > 0 && (
        <div class="a-traiter" role="alert">
          <p>⚠ {alertes.length} chose(s) à traiter</p>
          {alertes.slice(0, 6).map((a) => <p key={a.texte}>• {a.texte}</p>)}
          {alertes.length > 6 && <p><a href="#/">… et {alertes.length - 6} autre(s) sur l'accueil</a></p>}
        </div>
      )}

      {argent && (
        <>
          <h3 class="tdb-titre">💰 Argent</h3>
          <div class="kpis">
            <Kpi titre="Ventes" valeur={fmtFcfa(vP)} variation={variation(vP, vA)} detail={`avant : ${fmtCourt(vA)}`} lien="/ventes" />
            <Kpi titre="Charges" valeur={fmtFcfa(cP)} variation={variation(cP, cA)} hausseBonne={false} detail={`avant : ${fmtCourt(cA)}`} lien="/argent" />
            <Kpi titre="Marge" valeur={fmtFcfa(vP - cP)} variation={variation(vP - cP, vA - cA)} detail={vP > 0 ? `${fmtDec(((vP - cP) / vP) * 100, 0)} % des ventes` : undefined} lien="/argent" />
            <Kpi titre="Argent disponible" valeur={fmtFcfa(treso)} variation={variation(treso, tresoDebut)} detail="caisse, Mobile Money, banque" lien="/argent" />
            <Kpi titre="À encaisser" valeur={fmtFcfa(totalCreances)} detail={`${cr.length} client(s)`} hausseBonne={false} lien="/clients" />
            <Kpi titre="À payer aux fournisseurs" valeur={fmtFcfa(dettes)} hausseBonne={false} lien="/argent" />
          </div>
          <div class="grille-graph">
            <Carte titre="Ventes et charges par mois" sous="12 derniers mois, en FCFA">
              <Barres titre="Ventes et charges par mois" categories={libMois} series={[{ nom: 'Ventes', couleur: '#2f6b3a', valeurs: venteMois }, { nom: 'Charges', couleur: '#b3541e', valeurs: chargeMois }]} />
            </Carte>
            <Carte titre="Argent disponible en fin de mois" sous="Caisse, Mobile Money et banque réunis">
              <Courbe titre="Trésorerie en fin de mois" formatY={fmtCourt} formatX={(x) => moisLib(tresoMois[Math.max(0, Math.min(11, Math.round(x)))][0])} series={[{ nom: 'Trésorerie', couleur: '#2f6b3a', points: tresoMois.map(([, v], i) => [i, v] as [number, number]) }]} />
            </Carte>
            <Carte titre="Ce que les clients doivent, selon l'ancienneté" sous="Plus c'est vieux, plus il est urgent de relancer">
              <BarresH lignes={vieux.map((t, i) => ({ nom: t.tranche, valeur: t.montant, detail: `${t.clients} client(s)`, couleur: ['#2f6b3a', '#e3a82b', '#d9822b', '#b3541e'][i] }))} format={fmtCourt} vide="Aucune créance." />
            </Carte>
            <Carte titre={`Ventes par activité (${NOM_PERIODE[jours]})`}>
              <BarresH lignes={parActivite} vide="Aucune vente sur cette période." />
            </Carte>
            <Carte titre={`Meilleurs clients (${NOM_PERIODE[jours]})`}>
              <BarresH lignes={topClients} vide="Aucune vente sur cette période." />
            </Carte>
          </div>
        </>
      )}

      <h3 class="tdb-titre">🐔 Poules pondeuses</h3>
      <div class="kpis">
        <Kpi titre="Taux de ponte moyen" valeur={tPonte !== null ? fmtPct(tPonte) : '—'} variation={variation(tPonte, tPonteAvant)} detail={`${ponte.length} jour(s) de ramassage`} lien="/poules" />
        <Kpi titre="Bons œufs produits" valeur={fmtInt(oeufs(debut, auj))} variation={variation(oeufs(debut, auj), oeufs(pDebut, pFin))} detail={`${fmtDec(oeufs(debut, auj) / 30, 0)} plateaux`} lien="/oeufs" />
        <Kpi titre="Poules mortes" valeur={fmtInt(mortesPoules(debut, auj))} variation={variation(mortesPoules(debut, auj), mortesPoules(pDebut, pFin))} hausseBonne={false} lien="/poules" />
        <Kpi titre="Poules présentes" valeur={fmtInt(poulesPresentes)} detail={`${bandesActives.length} bande(s)`} lien="/poules" />
      </div>
      <div class="grille-graph">
        <Carte titre="Taux de ponte de la ferme, jour après jour" sous="Toutes les bandes réunies, pondéré par le nombre de poules">
          {ponte.length >= 2 ? (
            <Courbe titre="Taux de ponte quotidien" unite=" %" formatX={(x) => fmtDate(ajouteJours(ponte[0].date, Math.round(x))).slice(0, 5)} series={[{ nom: 'Taux de ponte', couleur: '#2f6b3a', points: ponte.map((p) => [Math.round((new Date(p.date).getTime() - new Date(ponte[0].date).getTime()) / 86_400_000), p.taux] as [number, number]) }]} />
          ) : <p class="intro">Il faut au moins deux jours de ramassage sur la période.</p>}
        </Carte>
      </div>

      <h3 class="tdb-titre">🐑 Moutons et 🐄 bœufs</h3>
      <div class="kpis">
        <Kpi titre="Moutons présents" valeur={fmtInt(nOvins)} detail={`${presents('ovin', 'F')} F · ${presents('ovin', 'M')} M`} lien="/moutons" />
        <Kpi titre="Bœufs présents" valeur={fmtInt(nBovins)} detail={`${presents('bovin', 'F')} F · ${presents('bovin', 'M')} M`} lien="/boeufs" />
        <Kpi titre="Naissances" valeur={fmtInt(naissances(debut, auj))} variation={variation(naissances(debut, auj), naissances(pDebut, pFin))} />
        <Kpi titre="Décès" valeur={fmtInt(deces(debut, auj))} variation={variation(deces(debut, auj), deces(pDebut, pFin))} hausseBonne={false} />
        <Kpi titre="Gain de poids des lots d'embouche" valeur={gmqGlobal !== null ? `${fmtDec(gmqGlobal, 0)} g/j` : '—'} detail={`${lotsEmbouche.length} lot(s)`} />
      </div>
      <div class="grille-graph">
        <Carte titre="Effectifs par espèce et par sexe">
          <Barres titre="Effectifs" categories={['Moutons', 'Bœufs']} format={(n) => String(Math.round(n))} series={[{ nom: 'Femelles', couleur: '#b3541e', valeurs: [presents('ovin', 'F'), presents('bovin', 'F')] }, { nom: 'Mâles', couleur: '#2f6b3a', valeurs: [presents('ovin', 'M'), presents('bovin', 'M')] }]} />
        </Carte>
        <Carte titre="Naissances et décès par mois" sous="12 derniers mois">
          <Barres titre="Naissances et décès" categories={libMois} format={(n) => String(Math.round(n))} series={[{ nom: 'Naissances', couleur: '#2f6b3a', valeurs: parMois(rum.mvts.filter((m) => m.type === 'entree' && m.motif === 'naissance'), mois12, (m) => m.date, () => 1) }, { nom: 'Décès', couleur: '#b3541e', valeurs: parMois(rum.mvts.filter((m) => m.type === 'sortie' && m.motif === 'mort'), mois12, (m) => m.date, () => 1) }]} />
        </Carte>
        <Carte titre="Gain de poids par lot d'embouche" sous="Grammes par jour et par animal">
          <BarresH lignes={lotsEmbouche.map((l) => ({ nom: l.nom, valeur: l.gmq as number, detail: `${l.n} animaux`, lien: `/lots/${l.id}` }))} format={(n) => `${fmtDec(n, 0)} g/j`} vide="Aucun lot d'embouche pesé deux fois." />
        </Carte>
      </div>

      <h3 class="tdb-titre">📦 Stocks</h3>
      <div class="kpis">
        <Kpi titre="Articles en alerte" valeur={fmtInt(alertesStock.length)} hausseBonne={false} detail="stock bas ou péremption proche" lien="/stocks" />
        <Kpi titre="Articles suivis" valeur={fmtInt(articles.length)} lien="/stocks" />
      </div>
      {alertesStock.length > 0 && <div class="a-traiter">{alertesStock.slice(0, 8).map((t) => <p key={t}>• {t}</p>)}</div>}
      <p class="intro">Les animaux à surveiller (délais d'attente, mises bas, sevrages) apparaissent dans la liste « à traiter » en haut de la page.</p>
    </section>
  );
}
