import { joursEntre, OEUFS_PAR_PLATEAU } from '../format';
import { REGLAGES } from '../reglages';
import type { Achat, Article, Client, Compte, Depense, LigneVente, Paiement, Reglement, StockMvt, TresoMvt, Vente, Activite } from './types';


export function compteDuMode(mode: Paiement['mode']): Compte {
  return mode === 'especes' ? 'caisse' : mode === 'mobile_money' ? 'mobile_money' : 'banque';
}

export const totalLignes = (l: LigneVente[]) => l.reduce((s, x) => s + x.quantite * x.prixUnitaire, 0);

export const oeufsVendus = (l: LigneVente[]) =>
  l.filter((x) => x.article === 'oeufs').reduce((s, x) => s + (x.unite === 'plateau' ? x.quantite * OEUFS_PAR_PLATEAU : x.quantite), 0);

// ---------- créances ----------

export interface Creance {
  clientId: string;
  solde: number;
  jours: number; // ancienneté de la plus vieille vente non soldée
}

// Les paiements soldent d'abord les ventes les plus anciennes.
export function creances(ventes: Vente[], paiements: Paiement[], aujourdhui: string): Creance[] {
  const ids = new Set(ventes.filter((v) => v.clientId).map((v) => v.clientId));
  const out: Creance[] = [];
  for (const clientId of ids) {
    let paye = paiements.filter((p) => p.clientId === clientId).reduce((s, p) => s + p.montant, 0);
    let solde = 0;
    let jours = 0;
    for (const v of ventes.filter((x) => x.clientId === clientId).sort((a, b) => a.date.localeCompare(b.date))) {
      const reste = v.total - Math.min(paye, v.total);
      paye = Math.max(0, paye - v.total);
      if (reste > 0.5) {
        if (solde === 0) jours = joursEntre(v.date, aujourdhui);
        solde += reste;
      }
    }
    if (solde > 0.5) out.push({ clientId, solde, jours });
  }
  return out.sort((a, b) => b.solde - a.solde);
}

export function soldeClient(clientId: string, ventes: Vente[], paiements: Paiement[]): number {
  const du = ventes.filter((v) => v.clientId === clientId).reduce((s, v) => s + v.total, 0);
  const paye = paiements.filter((p) => p.clientId === clientId).reduce((s, p) => s + p.montant, 0);
  return du - paye;
}

// ---------- stocks ----------

export const stockArticle = (mvts: StockMvt[]) =>
  mvts.reduce((s, m) => (m.type === 'sortie' ? s - m.quantite : s + m.quantite), 0);

export interface Lot {
  peremption: string;
  restant: number;
}

// Les sorties consomment d'abord les lots qui périment le plus tôt.
export function lotsRestants(mvts: StockMvt[]): Lot[] {
  const lots: Lot[] = mvts
    .filter((m) => m.type === 'entree' || (m.type === 'ajustement' && m.quantite > 0))
    .map((m) => ({ peremption: m.peremption || '', restant: m.quantite }));
  let aSortir = mvts
    .filter((m) => m.type === 'sortie' || (m.type === 'ajustement' && m.quantite < 0))
    .reduce((s, m) => s + Math.abs(m.quantite), 0);
  lots.sort((a, b) => (a.peremption || '9999').localeCompare(b.peremption || '9999'));
  for (const l of lots) {
    const pris = Math.min(l.restant, aSortir);
    l.restant -= pris;
    aSortir -= pris;
  }
  return lots.filter((l) => l.restant > 1e-9);
}

export function alertesArticle(a: Article, mvts: StockMvt[], aujourdhui: string): string[] {
  const out: string[] = [];
  const stock = stockArticle(mvts);
  if (a.seuil > 0 && stock <= a.seuil) out.push(`${a.nom} : stock bas (${stock} ${a.unite})`);
  for (const l of lotsRestants(mvts)) {
    if (!l.peremption) continue;
    const j = joursEntre(aujourdhui, l.peremption);
    if (j < 0) out.push(`${a.nom} : lot périmé depuis ${-j} jour(s)`);
    else if (j <= REGLAGES.joursPeremption) out.push(`${a.nom} : périme dans ${j} jour(s)`);
  }
  return out;
}

// Coût moyen d'une unité de stock, d'après les achats
export function coutMoyen(articleId: string, achats: Achat[]): number {
  const a = achats.filter((x) => x.articleId === articleId && x.quantite > 0);
  const q = a.reduce((s, x) => s + x.quantite, 0);
  return q > 0 ? a.reduce((s, x) => s + x.total, 0) / q : 0;
}

// ---------- fournisseurs, argent ----------

export function detteFournisseur(id: string, achats: Achat[], reglements: Reglement[]): number {
  const du = achats.filter((a) => a.fournisseurId === id).reduce((s, a) => s + (a.total - a.montantPaye), 0);
  const rembourse = reglements.filter((r) => r.fournisseurId === id).reduce((s, r) => s + r.montant, 0);
  return du - rembourse;
}

export function soldesComptes(
  paiements: Paiement[],
  achats: Achat[],
  reglements: Reglement[],
  depenses: Depense[],
  ajustements: TresoMvt[]
): Record<Compte, number> {
  const s: Record<Compte, number> = { caisse: 0, mobile_money: 0, banque: 0 };
  for (const p of paiements) s[compteDuMode(p.mode)] += p.montant;
  for (const a of achats) s[a.compte] -= a.montantPaye;
  for (const r of reglements) s[r.compte] -= r.montant;
  for (const d of depenses) s[d.compte] -= d.montant;
  for (const t of ajustements) s[t.compte] += t.montant;
  return s;
}

export interface Resultat {
  activite: Activite;
  ventes: number;
  charges: number;
  marge: number;
}

// Les achats sont comptés le jour de l'achat. Les charges communes ne sont pas encore réparties.
export function resultats(ventes: Vente[], achats: Achat[], depenses: Depense[], activites: Activite[]): Resultat[] {
  return activites.map((activite) => {
    const v = ventes.filter((x) => x.activite === activite && !x.reprise).reduce((s, x) => s + x.total, 0);
    const c =
      achats.filter((x) => x.activite === activite).reduce((s, x) => s + x.total, 0) +
      depenses.filter((x) => x.activite === activite).reduce((s, x) => s + x.montant, 0);
    return { activite, ventes: v, charges: c, marge: v - c };
  });
}

export const clientDe = (id: string, clients: Array<Client & { id: string }>) => clients.find((c) => c.id === id)?.nom ?? 'Sans nom (comptant)';

// Coût d'une distribution d'aliment : calculé avec le coût moyen d'achat actuel (les profils sans accès à l'argent n'enregistrent pas de coût)
export function coutDistribution(rec: { kg: number; articleId?: string; cout?: number }, articles: Array<Article & { id: string }>, achats: Achat[]): number {
  if (rec.articleId) {
    const a = articles.find((x) => x.id === rec.articleId);
    const cm = a ? coutMoyen(a.id, achats) : 0;
    if (a && cm > 0) return (rec.kg / a.kgParUnite) * cm;
  }
  return rec.cout ?? 0;
}

// ---------- charges communes réparties ----------

export interface ResultatReparti {
  activite: Activite;
  ventes: number;
  chargesDirectes: number;
  partCommun: number;
  margeBrute: number;
  margeNette: number;
}

export interface ResultatsFerme {
  lignes: ResultatReparti[];
  communVentes: number; // ventes classées « commun » (non réparties)
  chargesCommunes: number;
  nonReparti: number; // charges communes qui n'ont pas pu être réparties (aucune vente à la clé de répartition)
  totalVentes: number;
  totalCharges: number;
  margeFerme: number;
}

// Clé de répartition : les charges de l'activité « commun » sont réparties au prorata des ventes de chaque élevage
export function resultatsRepartis(ventes: Vente[], achats: Achat[], depenses: Depense[]): ResultatsFerme {
  const vs = ventes.filter((v) => !v.reprise);
  const somme = (a: Activite) => vs.filter((x) => x.activite === a).reduce((s, x) => s + x.total, 0);
  const charges = (a: Activite) => achats.filter((x) => x.activite === a).reduce((s, x) => s + x.total, 0) + depenses.filter((x) => x.activite === a).reduce((s, x) => s + x.montant, 0);
  const elevages: Activite[] = ['poules', 'ovins', 'bovins'];
  const ca = elevages.reduce((s, a) => s + somme(a), 0);
  const commun = charges('commun');
  const lignes = elevages.map((activite) => {
    const v = somme(activite);
    const d = charges(activite);
    const part = ca > 0 ? (commun * v) / ca : 0;
    return { activite, ventes: v, chargesDirectes: d, partCommun: part, margeBrute: v - d, margeNette: v - d - part };
  });
  const totalVentes = vs.reduce((s, x) => s + x.total, 0);
  const totalCharges = elevages.reduce((s, a) => s + charges(a), 0) + commun;
  return { lignes, communVentes: somme('commun'), chargesCommunes: commun, nonReparti: ca > 0 ? 0 : commun, totalVentes, totalCharges, margeFerme: totalVentes - totalCharges };
}
