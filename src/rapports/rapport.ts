import { ajouteJours, fmtDate, fmtDec, fmtInt, OEUFS_PAR_PLATEAU } from '../format';
import { creances, detteFournisseur, resultatsRepartis, soldesComptes } from '../gestion/calculs';
import { resumeLigne } from '../gestion/resume';
import { ACTIVITES, nomActivite, type Achat, type Client, type Depense, type Fournisseur, type Paiement, type Reglement, type TresoMvt, type Vente } from '../gestion/types';
import { stockOeufs, tauxPonteJour } from '../poules/calculs';
import type { Bande, Mortalite, MvtOeufs, Ramassage } from '../poules/types';
import { etatAnimal } from '../ruminants/calculs';
import { NOM_ESPECES, type Animal, type Espece, type MiseBas, type MvtAnimal } from '../ruminants/types';
import type { Doc, Section } from './pdf';
import type { Feuille } from './xlsx';

type Avec<T> = T & { id: string; updatedAt: number };

export interface DonneesRapport {
  ventes: Array<Avec<Vente>>;
  paiements: Array<Avec<Paiement>>;
  clients: Array<Avec<Client>>;
  achats: Array<Avec<Achat>>;
  depenses: Array<Avec<Depense>>;
  reglements: Array<Avec<Reglement>>;
  fournisseurs: Array<Avec<Fournisseur>>;
  ajustements: Array<Avec<TresoMvt>>;
  bandes: Array<Avec<Bande>>;
  ramassages: Array<Avec<Ramassage>>;
  mortalites: Array<Avec<Mortalite>>;
  mvtsOeufs: Array<Avec<MvtOeufs>>;
  animaux: Array<Avec<Animal>>;
  mvtsAnimaux: Array<Avec<MvtAnimal>>;
  misesBas: Array<Avec<MiseBas>>;
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function bornesMois(mois: string): { debut: string; fin: string } {
  const [y, m] = mois.split('-').map(Number);
  const suivant = m === 12 ? `${y + 1}-01-01` : `${y}-${p2(m + 1)}-01`;
  return { debut: `${mois}-01`, fin: ajouteJours(suivant, -1) };
}

export function libelleMois(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function construireRapport(mois: string, d: DonneesRapport, aujourdhui: string): Doc {
  const { debut, fin } = bornesMois(mois);
  const dansLeMois = (date: string) => date >= debut && date <= fin;
  const clientNom = (id: string) => d.clients.find((c) => c.id === id)?.nom ?? 'Sans nom (comptant)';

  const ventes = d.ventes.filter((v) => dansLeMois(v.date) && !v.reprise);
  const achats = d.achats.filter((a) => dansLeMois(a.date));
  const depenses = d.depenses.filter((x) => dansLeMois(x.date));

  // 1. résultat par activité
  const res = resultatsRepartis(ventes, achats, depenses);
  const secResultat: Section = {
    titre: 'Résultat par activité (FCFA)',
    colonnes: ['Activité', 'Ventes', 'Charges directes', 'Part des charges communes', 'Marge nette'],
    lignes: [
      ...res.lignes.map((r) => [nomActivite(r.activite), Math.round(r.ventes), Math.round(r.chargesDirectes), Math.round(r.partCommun), Math.round(r.margeNette)]),
      ['Total ferme', Math.round(res.totalVentes), Math.round(res.totalCharges), 0, Math.round(res.margeFerme)]
    ],
    note: `Les achats sont comptés le jour où ils sont faits. Charges communes (${Math.round(res.chargesCommunes).toLocaleString('fr-FR')} FCFA) réparties au prorata des ventes de chaque élevage.`
  };

  // 2. poules
  const ram = d.ramassages.filter((r) => dansLeMois(r.date));
  const bons = ram.reduce((s, r) => s + r.bons, 0);
  const feles = ram.reduce((s, r) => s + r.feles, 0);
  const casses = ram.reduce((s, r) => s + r.casses, 0);
  const taux: number[] = [];
  for (const b of d.bandes) {
    const rb = d.ramassages.filter((r) => r.bandeId === b.id);
    const mb = d.mortalites.filter((m) => m.bandeId === b.id);
    for (const date of new Set(rb.filter((r) => dansLeMois(r.date)).map((r) => r.date))) {
      const t = tauxPonteJour(b, rb, mb, date);
      if (t !== null) taux.push(t);
    }
  }
  const morts = d.mortalites.filter((m) => dansLeMois(m.date));
  const vendus = d.mvtsOeufs.filter((m) => dansLeMois(m.date) && m.type === 'vente').reduce((s, m) => s + m.quantite, 0);
  const autres = d.mvtsOeufs.filter((m) => dansLeMois(m.date) && (m.type === 'consommation' || m.type === 'casse')).reduce((s, m) => s + m.quantite, 0);
  const stockFin = stockOeufs(d.ramassages.filter((r) => r.date <= fin), d.mvtsOeufs.filter((m) => m.date <= fin));
  const secPoules: Section = {
    titre: 'Poules pondeuses',
    colonnes: ['Indicateur', 'Valeur'],
    lignes: [
      ['Œufs ramassés', `${fmtInt(bons + feles + casses)} (bons ${fmtInt(bons)}, fêlés ${fmtInt(feles)}, cassés ${fmtInt(casses)})`],
      ['Taux de ponte moyen', taux.length ? `${fmtDec(taux.reduce((a, b) => a + b, 0) / taux.length)} %` : 'pas de ramassage'],
      ['Poules mortes', fmtInt(morts.filter((m) => m.type === 'mort').reduce((s, m) => s + m.nombre, 0))],
      ['Poules réformées', fmtInt(morts.filter((m) => m.type === 'reforme').reduce((s, m) => s + m.nombre, 0))],
      ['Œufs vendus', `${fmtInt(vendus)} (${fmtDec(vendus / OEUFS_PAR_PLATEAU)} plateaux)`],
      ['Œufs consommés ou cassés au stockage', fmtInt(autres)],
      ['Stock d’œufs en fin de mois', `${fmtInt(stockFin)} (${fmtDec(stockFin / OEUFS_PAR_PLATEAU)} plateaux)`]
    ]
  };

  // 3. moutons et bœufs
  const mvtsAvantFin = d.mvtsAnimaux.filter((m) => m.date <= fin);
  const ligneEspece = (e: Espece): Array<string | number> => {
    const ids = new Set(d.animaux.filter((a) => a.espece === e).map((a) => a.id));
    const mv = d.mvtsAnimaux.filter((m) => ids.has(m.animalId) && dansLeMois(m.date));
    const effectif = [...ids].filter((id) => mvtsAvantFin.some((m) => m.animalId === id && m.type === 'entree') && etatAnimal(id, mvtsAvantFin.filter((m) => m.animalId === id)).statut === 'present').length;
    const montant = ventes.flatMap((v) => v.lignes).filter((l) => l.animalId && ids.has(l.animalId)).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
    return [
      NOM_ESPECES[e],
      effectif,
      mv.filter((m) => m.type === 'entree' && m.motif === 'naissance').length,
      mv.filter((m) => m.type === 'entree' && m.motif === 'achat').length,
      mv.filter((m) => m.type === 'sortie' && m.motif === 'mort').length,
      mv.filter((m) => m.type === 'sortie' && m.motif === 'abattage').length,
      mv.filter((m) => m.type === 'sortie' && m.motif === 'vente').length,
      Math.round(montant)
    ];
  };
  const secRuminants: Section = {
    titre: 'Moutons et bœufs',
    colonnes: ['Espèce', 'Effectif fin', 'Naissances', 'Achetés', 'Morts', 'Abattus', 'Vendus', 'Ventes (FCFA)'],
    lignes: [ligneEspece('ovin'), ligneEspece('bovin')]
  };

  // 4. ventes
  const secVentes: Section = {
    titre: 'Ventes du mois',
    colonnes: ['Date', 'Client', 'Détail', 'Total (FCFA)', 'Payé (FCFA)'],
    lignes: [...ventes].sort((a, b) => a.date.localeCompare(b.date)).map((v) => [
      fmtDate(v.date), clientNom(v.clientId), v.lignes.map(resumeLigne).join(', '), Math.round(v.total),
      Math.round(d.paiements.filter((p) => p.venteId === v.id).reduce((s, p) => s + p.montant, 0))
    ])
  };

  // 5. dépenses et achats
  const secDepenses: Section = {
    titre: 'Dépenses et achats du mois',
    colonnes: ['Date', 'Nature', 'Activité', 'Montant (FCFA)'],
    lignes: [
      ...achats.map((a) => ({ date: a.date, nature: `Achat : ${a.libelle || 'divers'}`, act: a.activite, m: a.total })),
      ...depenses.map((x) => ({ date: x.date, nature: `${x.categorie}${x.libelle ? ` : ${x.libelle}` : ''}`, act: x.activite, m: x.montant }))
    ].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [fmtDate(x.date), x.nature, nomActivite(x.act), Math.round(x.m)])
  };

  // 6. situation au jour de l'édition
  const soldes = soldesComptes(d.paiements, d.achats, d.reglements, d.depenses, d.ajustements);
  const secSituation: Section = {
    titre: `Situation au ${fmtDate(aujourdhui)} (jour de l'édition)`,
    colonnes: ['Poste', 'Montant (FCFA)'],
    lignes: [
      ['Caisse (espèces)', Math.round(soldes.caisse)],
      ['Mobile Money', Math.round(soldes.mobile_money)],
      ['Banque / virement', Math.round(soldes.banque)],
      ['À encaisser (clients)', Math.round(creances(d.ventes, d.paiements, aujourdhui).reduce((s, c) => s + c.solde, 0))],
      ['À payer (fournisseurs)', Math.round(d.fournisseurs.reduce((s, f) => s + Math.max(0, detteFournisseur(f.id, d.achats, d.reglements)), 0))]
    ]
  };

  return {
    titre: `Rapport mensuel - ${libelleMois(mois)}`,
    sousTitre: `Ferme360 · du ${fmtDate(debut)} au ${fmtDate(fin)} · édité le ${fmtDate(aujourdhui)}`,
    sections: [secResultat, secPoules, secRuminants, secVentes, secDepenses, secSituation]
  };
}

export const versFeuilles = (doc: Doc): Feuille[] =>
  doc.sections.map((s) => ({ nom: s.titre.replace(/\(.*\)/, '').replace(/^Situation.*/, 'Situation').trim(), colonnes: s.colonnes, lignes: s.lignes }));

export function construireRecu(vente: Vente & { id: string }, client: string, paiementsVente: number, soldeClient: number, aujourdhui: string): Doc {
  return {
    titre: 'Reçu de vente',
    sousTitre: `Ferme360 · ${fmtDate(vente.date)} · client : ${client}`,
    sections: [
      { titre: 'Articles', colonnes: ['Désignation', 'Quantité', 'Prix (FCFA)', 'Montant (FCFA)'],
        lignes: vente.lignes.map((l) => [l.article === 'animal' ? l.libelle : l.article === 'oeufs' ? `Œufs (${l.unite === 'plateau' ? 'plateau' : 'unité'})` : l.libelle || (l.article === 'fumier' ? 'Fientes / fumier' : 'Article'), l.article === 'animal' && l.unite === 'tete' ? '1' : fmtDec(l.quantite, l.quantite % 1 ? 1 : 0), Math.round(l.prixUnitaire), Math.round(l.quantite * l.prixUnitaire)]) },
      { titre: 'Paiement', colonnes: ['Poste', 'Montant (FCFA)'],
        lignes: [['Total de la vente', Math.round(vente.total)], ['Payé à la vente', Math.round(paiementsVente)], ['Reste dû pour cette vente', Math.round(Math.max(0, vente.total - paiementsVente))], ['Solde total du client', Math.round(Math.max(0, soldeClient))]],
        note: `Reçu édité le ${fmtDate(aujourdhui)}.` }
    ]
  };
}
